/**
 * Admin customer-detail read (T18). LIVE read via the admin client (RLS-bypass)
 * of a single `customers` row + that customer's orders + lifetime aggregates +
 * the distinct shipping-address set. Keyed STRICTLY on `customers.id` (never
 * email/phone) so the order set — and therefore the count — equals what the
 * Customers list showed for the same id by construction (AC-9); the aggregates
 * come from the `admin_customer_aggregates` RPC (0014) so the totals are exact
 * over ALL orders even though the history read is bounded (edge 3).
 *
 * Section reads are isolated: the order-history read failing degrades to
 * `historyFailed: true` + `orders: []` (the page renders a section banner) while
 * the core customer still renders — the detail page NEVER 500s (mirror
 * `order-read.ts`). A non-UUID / missing id returns `null` → `notFound()`
 * (AC-10). `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN, CUSTOMER_ORDER_HISTORY_LIMIT } from "@/lib/config";
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

/** One order-history row for the customer detail (a trimmed order snapshot). */
export interface AdminCustomerOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  totalCents: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
}

/** Lifetime totals for the customer, computed over ALL orders (0014 RPC). */
export interface AdminCustomerTotals {
  /** Order count — equals the Customers-list count for this id (AC-9). */
  orderCount: number;
  /** Sum of every order's `total_cents` in integer cents (AC-8). */
  totalCents: number;
  /** ISO of the oldest order, or `null` when the customer has no orders. */
  firstOrderAt: string | null;
  /** ISO of the newest order, or `null` when the customer has no orders. */
  lastOrderAt: string | null;
}

/** One distinct shipping address used across the customer's orders (AC-6). */
export interface AdminCustomerAddress {
  shippingFullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/** The full customer-detail view model. */
export interface AdminCustomerDetail {
  id: string;
  fullName: string;
  /** Raw stored email; render via `isMailableAddress()` (sentinel → "Sin correo"). */
  email: string;
  phone: string | null;
  totals: AdminCustomerTotals;
  /** Bounded to `CUSTOMER_ORDER_HISTORY_LIMIT`, newest-first. */
  orders: AdminCustomerOrder[];
  /** true when `totals.orderCount` exceeds the fetched `orders` slice (edge 3). */
  ordersTruncated: boolean;
  /** De-duplicated on the full tuple, most-recent-first (AC-6, edge 4). */
  addresses: AdminCustomerAddress[];
  /** true when the order-history read failed while the core customer loaded (AC-13). */
  historyFailed: boolean;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** The columns the bounded order-history read pulls (history rows + address tuple). */
const ORDER_HISTORY_COLUMNS =
  "id, order_number, created_at, total_cents, status, payment_status, shipping_full_name, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country" as const;

/** Read the full customer detail by id; `null` when the id is invalid/absent. */
export async function getAdminCustomer(id: string): Promise<AdminCustomerDetail | null> {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  try {
    const db = createAdminClient();
    const { data: customer, error } = await db
      .from("customers")
      .select("id, email, full_name, phone")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error(`[admin-customer-detail] core read failed for ${id}: ${error.message}`);
      return null;
    }
    if (!customer) {
      return null;
    }

    // History + totals are section-isolated: either failing still renders the
    // core customer (the page shows a section banner / zeros), never a 500.
    const [history, totals] = await Promise.all([
      readHistory(db, id),
      readTotals(db, id),
    ]);

    return toDetail(customer, history, totals);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-customer-detail] core read threw for ${id}: ${message}`);
    return null;
  }
}

interface RawOrderHistoryRow {
  id: string;
  order_number: string;
  created_at: string;
  total_cents: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  shipping_full_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
}

/** The section-isolated history read result: rows, or `null` on failure. */
type HistoryResult = RawOrderHistoryRow[] | null;

/**
 * Read the customer's orders newest-first, bounded by
 * `CUSTOMER_ORDER_HISTORY_LIMIT` (index-backed by `orders_customer_id_idx`).
 * Returns `null` on error so the page can render a section-scoped banner while
 * the core customer + aggregate totals still render (AC-13).
 */
async function readHistory(db: AdminClient, customerId: string): Promise<HistoryResult> {
  const { data, error } = await db
    .from("orders")
    .select(ORDER_HISTORY_COLUMNS)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(CUSTOMER_ORDER_HISTORY_LIMIT);
  if (error) {
    console.error(`[admin-customer-detail] history read failed for ${customerId}: ${error.message}`);
    return null;
  }
  return (data ?? []) as RawOrderHistoryRow[];
}

/**
 * Read the lifetime aggregate over ALL the customer's orders via the
 * `admin_customer_aggregates` RPC (0014). On error returns the neutral zero
 * aggregate so the page still renders (the totals panel shows 0 / $0.00 / —)
 * — mirrors the section-isolation principle; never throws to the page (AC-13).
 */
async function readTotals(db: AdminClient, customerId: string): Promise<AdminCustomerTotals> {
  const { data, error } = await db.rpc("admin_customer_aggregates", {
    p_customer_id: customerId,
  });
  if (error) {
    console.error(`[admin-customer-detail] aggregates RPC failed for ${customerId}: ${error.message}`);
    return EMPTY_TOTALS;
  }
  const row = data?.[0];
  if (!row) {
    return EMPTY_TOTALS;
  }
  return {
    orderCount: Number(row.order_count),
    totalCents: Number(row.total_cents),
    firstOrderAt: row.first_order_at,
    lastOrderAt: row.last_order_at,
  };
}

/** The zero aggregate — a customer with no orders (or an isolated RPC failure). */
const EMPTY_TOTALS: AdminCustomerTotals = {
  orderCount: 0,
  totalCents: 0,
  firstOrderAt: null,
  lastOrderAt: null,
};

interface RawCustomerRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
}

/** Assemble the detail view model from the core row + section reads. */
function toDetail(
  customer: RawCustomerRow,
  history: HistoryResult,
  totals: AdminCustomerTotals,
): AdminCustomerDetail {
  const historyFailed = history === null;
  const rows = history ?? [];
  return {
    id: customer.id,
    fullName: customer.full_name,
    email: customer.email,
    phone: customer.phone,
    totals,
    orders: rows.map(toOrder),
    ordersTruncated: totals.orderCount > rows.length,
    addresses: dedupeAddresses(rows),
    historyFailed,
  };
}

/** Project a raw order row to the history view model. PURE. */
function toOrder(row: RawOrderHistoryRow): AdminCustomerOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    totalCents: row.total_cents,
    orderStatus: row.status,
    paymentStatus: row.payment_status,
  };
}

/** The order fields that make up a shipping-address tuple (dedup key source). */
type AddressSourceRow = Pick<
  RawOrderHistoryRow,
  | "shipping_full_name"
  | "shipping_address_line1"
  | "shipping_address_line2"
  | "shipping_city"
  | "shipping_state"
  | "shipping_postal_code"
  | "shipping_country"
>;

/**
 * De-duplicate shipping addresses across the (already newest-first) order rows,
 * keeping the FIRST occurrence of each distinct full tuple — so the result is
 * distinct addresses, most-recent-first (AC-6, edge 4). PURE + exported for the
 * unit test. The dedup key joins every tuple field with a delimiter that cannot
 * appear inside the values collated together (` `), so two addresses only
 * collapse when EVERY field is identical.
 */
export function dedupeAddresses(rows: readonly AddressSourceRow[]): AdminCustomerAddress[] {
  const seen = new Set<string>();
  const result: AdminCustomerAddress[] = [];
  for (const row of rows) {
    const key = [
      row.shipping_full_name,
      row.shipping_address_line1,
      row.shipping_address_line2 ?? "",
      row.shipping_city,
      row.shipping_state,
      row.shipping_postal_code,
      row.shipping_country,
    ].join(" ");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      shippingFullName: row.shipping_full_name,
      line1: row.shipping_address_line1,
      line2: row.shipping_address_line2,
      city: row.shipping_city,
      state: row.shipping_state,
      postalCode: row.shipping_postal_code,
      country: row.shipping_country,
    });
  }
  return result;
}
