/**
 * Admin order-detail read (T12 AC-5/6/21). LIVE read via the admin client
 * (RLS-bypass) of a single order + its items + status history + internal notes +
 * cumulative refunded total. Section reads are isolated: a history/notes read
 * failure degrades to `null` for that section (the page renders a section-scoped
 * banner) while the core order still renders — the detail page NEVER 500s
 * (AC design principle 4). A non-UUID / missing id returns `null` → `notFound()`
 * (AC-7). `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import type {
  OrderStatus,
  PaymentStatus,
  TransitionKind,
} from "@/lib/supabase/database.types";

/** One order line (the immutable purchase snapshot). */
export interface AdminOrderItem {
  id: string;
  productName: string;
  productSku: string;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** One status-history entry (chronological audit log). */
export interface AdminHistoryEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  transitionKind: TransitionKind | null;
  createdAt: string;
}

/** One internal note (admin-only, append-only). */
export interface AdminInternalNote {
  id: string;
  body: string;
  createdAt: string;
}

/** The full order-detail view model. */
export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  contactEmail: string;
  contactPhone: string | null;
  shippingFullName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  deliveryNotes: string | null;
  rfc: string | null;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  mpPaymentId: string | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingUrl: string | null;
  createdAt: string;
  /** Cumulative refunded cents (from the `refunded_total` RPC). */
  refundedCents: number;
  items: AdminOrderItem[];
  /** `null` when the history section read failed (section-scoped error). */
  history: AdminHistoryEntry[] | null;
  /** `null` when the notes section read failed (section-scoped error). */
  notes: AdminInternalNote[] | null;
}

type AdminClient = ReturnType<typeof createAdminClient>;

const ORDER_COLUMNS =
  "id, order_number, contact_email, contact_phone, shipping_full_name, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, delivery_notes, rfc, subtotal_cents, shipping_cents, discount_cents, total_cents, status, payment_status, payment_method, mp_payment_id, tracking_number, tracking_carrier, tracking_url, created_at" as const;

/** Read the full order detail by id; `null` when the id is invalid/absent. */
export async function getAdminOrder(id: string): Promise<AdminOrderDetail | null> {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }
  try {
    const db = createAdminClient();
    const { data: order, error } = await db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error(`[admin-orders] order read failed for ${id}: ${error.message}`);
      return null;
    }
    if (!order) {
      return null;
    }

    // Items are core (the detail is meaningless without them) — a failure nulls
    // the whole read → notFound is acceptable, but we surface an empty list so the
    // page still renders the summary. History + notes are section-isolated.
    const [items, history, notes, refundedCents] = await Promise.all([
      readItems(db, id),
      readHistory(db, id),
      readNotes(db, id),
      readRefundedTotal(db, id),
    ]);

    return toDetail(order, items, history, notes, refundedCents);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-orders] order read threw for ${id}: ${message}`);
    return null;
  }
}

interface RawItemRow {
  id: string;
  product_name: string;
  product_sku: string;
  variant_label: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

/** Read the order's line items (returns [] on error — items are shown empty). */
async function readItems(db: AdminClient, orderId: string): Promise<AdminOrderItem[]> {
  const { data, error } = await db
    .from("order_items")
    .select("id, product_name, product_sku, variant_label, quantity, unit_price_cents, line_total_cents")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(`[admin-orders] items read failed for ${orderId}: ${error.message}`);
    return [];
  }
  return ((data ?? []) as RawItemRow[]).map((row) => ({
    id: row.id,
    productName: row.product_name,
    productSku: row.product_sku,
    variantLabel: row.variant_label,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    lineTotalCents: row.line_total_cents,
  }));
}

interface RawHistoryRow {
  id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  transition_kind: TransitionKind | null;
  created_at: string;
}

/** Read the status history newest-first; `null` on error (section-scoped). */
async function readHistory(
  db: AdminClient,
  orderId: string,
): Promise<AdminHistoryEntry[] | null> {
  const { data, error } = await db
    .from("order_status_history")
    .select("id, from_status, to_status, note, transition_kind, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(`[admin-orders] history read failed for ${orderId}: ${error.message}`);
    return null;
  }
  return ((data ?? []) as RawHistoryRow[]).map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    transitionKind: row.transition_kind,
    createdAt: row.created_at,
  }));
}

interface RawNoteRow {
  id: string;
  body: string;
  created_at: string;
}

/** Read the internal notes newest-first; `null` on error (section-scoped). */
async function readNotes(
  db: AdminClient,
  orderId: string,
): Promise<AdminInternalNote[] | null> {
  const { data, error } = await db
    .from("order_internal_notes")
    .select("id, body, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(`[admin-orders] notes read failed for ${orderId}: ${error.message}`);
    return null;
  }
  return ((data ?? []) as RawNoteRow[]).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
  }));
}

/** Read the cumulative refunded cents via the `refunded_total` RPC (0 on error). */
async function readRefundedTotal(db: AdminClient, orderId: string): Promise<number> {
  const { data, error } = await db.rpc("refunded_total", { p_order_id: orderId });
  if (error) {
    console.error(`[admin-orders] refunded_total failed for ${orderId}: ${error.message}`);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

interface RawOrderRow {
  id: string;
  order_number: string;
  contact_email: string;
  contact_phone: string | null;
  shipping_full_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
  delivery_notes: string | null;
  rfc: string | null;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string | null;
  mp_payment_id: string | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  tracking_url: string | null;
  created_at: string;
}

/** Assemble the detail view model from the section reads. */
function toDetail(
  order: RawOrderRow,
  items: AdminOrderItem[],
  history: AdminHistoryEntry[] | null,
  notes: AdminInternalNote[] | null,
  refundedCents: number,
): AdminOrderDetail {
  return {
    id: order.id,
    orderNumber: order.order_number,
    contactEmail: order.contact_email,
    contactPhone: order.contact_phone,
    shippingFullName: order.shipping_full_name,
    addressLine1: order.shipping_address_line1,
    addressLine2: order.shipping_address_line2,
    city: order.shipping_city,
    state: order.shipping_state,
    postalCode: order.shipping_postal_code,
    country: order.shipping_country,
    deliveryNotes: order.delivery_notes,
    rfc: order.rfc,
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    discountCents: order.discount_cents,
    totalCents: order.total_cents,
    orderStatus: order.status,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    mpPaymentId: order.mp_payment_id,
    trackingNumber: order.tracking_number,
    trackingCarrier: order.tracking_carrier,
    trackingUrl: order.tracking_url,
    createdAt: order.created_at,
    refundedCents,
    items,
    history,
    notes,
  };
}
