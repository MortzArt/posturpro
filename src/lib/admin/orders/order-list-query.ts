/**
 * Admin order-list read (T12 AC-1/2/3). LIVE (uncached) read via the admin client
 * (RLS-bypass) against the BASE `orders` table so the operator always sees the
 * current state. Two-phase: count (clamp the page) → ranged data read, ordered by
 * `created_at DESC`. Search is meta-char-stripped (mirrors `products/list-query`
 * m-3) and matches order_number OR contact_email OR shipping_full_name. Customer
 * name is already snapshotted on `orders.shipping_full_name`, so there is no
 * stitch step. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { lastPageFor, parsePageParam, rangeFor } from "@/lib/catalog/pagination";
import { ADMIN_PRODUCTS_PER_PAGE } from "@/lib/config";
import type { OrderListFilters } from "@/lib/admin/orders/order-list-filters";
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

/** A single admin order-list row (see ui-design §1). */
export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  contactEmail: string;
  createdAt: string;
  totalCents: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
}

/** The paginated list result the page renders. */
export interface AdminOrderListResult {
  rows: AdminOrderRow[];
  totalCount: number;
  page: number;
  lastPage: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A minimal structural view of a PostgREST filter builder — just the two
 * chainable methods `applyFilters` calls. Kept loose (each returns the same
 * shape) so it works for both the count (head) and data queries without fighting
 * the deep generic instantiations (mirrors `products/list-query.ts`).
 */
interface FilterableQuery {
  or(filter: string): FilterableQuery;
  eq(column: string, value: string | number): FilterableQuery;
}

/** Apply the shared filters to an orders query (search/status/payment). */
function applyFilters<T extends FilterableQuery>(query: T, filters: OrderListFilters): T {
  let next: FilterableQuery = query;
  if (filters.search) {
    // Case-insensitive substring on order_number OR contact_email OR
    // shipping_full_name. Strip PostgREST filter meta-chars from the term so it
    // cannot alter the `or` expression structure — includes `. : \` (operator
    // separators) as defense-in-depth (mirrors products m-3).
    const term = filters.search.replace(/[%,()*.:\\]/g, " ");
    next = next.or(
      `order_number.ilike.%${term}%,contact_email.ilike.%${term}%,shipping_full_name.ilike.%${term}%`,
    );
  }
  if (filters.status !== "all") next = next.eq("status", filters.status);
  if (filters.payment !== "all") next = next.eq("payment_status", filters.payment);
  return next as T;
}

/**
 * Read a page of orders matching the filters. Two-phase: count (clamp the page),
 * then the ranged data read ordered by `created_at DESC`. Never throws — a read
 * error surfaces as an `error` flag the page renders a banner for.
 */
export async function listAdminOrders(
  filters: OrderListFilters,
): Promise<AdminOrderListResult> {
  const db = createAdminClient();

  const totalCount = await countOrders(db, filters);
  const lastPage = lastPageFor(totalCount, ADMIN_PRODUCTS_PER_PAGE);
  const page = parsePageParam(filters.rawPage, lastPage);
  const { from, to } = rangeFor(page, ADMIN_PRODUCTS_PER_PAGE);

  const rows = await readOrderRows(db, filters, from, to);
  return { rows, totalCount, page, lastPage };
}

/** Count matching orders (head query) for pagination clamping. */
async function countOrders(db: AdminClient, filters: OrderListFilters): Promise<number> {
  const base = db.from("orders").select("id", { count: "exact", head: true });
  const query = applyFilters(base as unknown as FilterableQuery, filters);
  const { count, error } = await (query as unknown as typeof base);
  if (error) throw new Error(`[admin-orders] count failed: ${error.message}`);
  return count ?? 0;
}

/** Raw order row shape read from the base table. */
interface RawOrderRow {
  id: string;
  order_number: string;
  shipping_full_name: string;
  contact_email: string;
  created_at: string;
  total_cents: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
}

/** Read the ranged, ordered data rows for the current page. */
async function readOrderRows(
  db: AdminClient,
  filters: OrderListFilters,
  from: number,
  to: number,
): Promise<AdminOrderRow[]> {
  const base = db
    .from("orders")
    .select(
      "id, order_number, shipping_full_name, contact_email, created_at, total_cents, status, payment_status",
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  const query = applyFilters(base as unknown as FilterableQuery, filters);
  const { data, error } = await (query as unknown as typeof base);
  if (error) throw new Error(`[admin-orders] read failed: ${error.message}`);
  return ((data ?? []) as unknown as RawOrderRow[]).map(toRow);
}

/** Map a raw DB row to the list view model. */
function toRow(row: RawOrderRow): AdminOrderRow {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.shipping_full_name,
    contactEmail: row.contact_email,
    createdAt: row.created_at,
    totalCents: row.total_cents,
    orderStatus: row.status,
    paymentStatus: row.payment_status,
  };
}
