/**
 * Server read of a placed order + its items by its UNGUESSABLE confirmation
 * token (T7 AC-13, M-6). Uses the admin client (the commerce tables are
 * RLS-denied to anon) and returns a plain view model for the confirmation page.
 * Never throws — returns `null` on a missing/unreadable order so the page can
 * `notFound()` (no data leak).
 *
 * PRIVACY: the confirmation page carries PII (name, full address, email, phone),
 * so it is addressed by a random `confirmation_token` (a v4 uuid, default
 * `gen_random_uuid()`), NEVER by the sequential `order_number` — the latter is
 * enumerable and would let anyone walk the range to harvest every customer's
 * data (IDOR). A malformed token short-circuits to `null` without a DB round
 * trip. The read is scoped to a single order's own snapshot only.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";

/** One order line as stored (the immutable purchase snapshot). */
export interface OrderItemView {
  productName: string;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

/** The confirmation-page view model. */
export interface OrderView {
  orderNumber: string;
  contactEmail: string;
  contactPhone: string | null;
  shippingFullName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  deliveryNotes: string | null;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  items: OrderItemView[];
}

/** Read an order + its items by confirmation token; `null` when absent/invalid. */
export async function getOrderByToken(confirmationToken: string): Promise<OrderView | null> {
  // A malformed token can only be a bad/guessed URL — reject before any DB hit.
  if (!UUID_PATTERN.test(confirmationToken)) {
    return null;
  }
  try {
    const db = createAdminClient();
    const { data: order, error } = await db
      .from("orders")
      .select(
        "id, order_number, contact_email, contact_phone, shipping_full_name, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, delivery_notes, subtotal_cents, shipping_cents, discount_cents, total_cents",
      )
      .eq("confirmation_token", confirmationToken)
      .maybeSingle();
    if (error) {
      console.error(`[checkout] order read failed: ${error.message}`);
      return null;
    }
    if (!order) {
      return null;
    }

    const { data: itemRows, error: itemsError } = await db
      .from("order_items")
      .select("product_name, variant_label, quantity, unit_price_cents, line_total_cents")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });
    if (itemsError) {
      console.error(`[checkout] order items read failed for ${order.order_number}: ${itemsError.message}`);
      return null;
    }

    return toOrderView(order, itemRows ?? []);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[checkout] order read threw: ${message}`);
    return null;
  }
}

interface OrderRow {
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
  delivery_notes: string | null;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
}

interface ItemRow {
  product_name: string;
  variant_label: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

/** Map DB rows to the confirmation view model. */
function toOrderView(order: OrderRow, items: ItemRow[]): OrderView {
  return {
    orderNumber: order.order_number,
    contactEmail: order.contact_email,
    contactPhone: order.contact_phone,
    shippingFullName: order.shipping_full_name,
    addressLine1: order.shipping_address_line1,
    addressLine2: order.shipping_address_line2,
    city: order.shipping_city,
    state: order.shipping_state,
    postalCode: order.shipping_postal_code,
    deliveryNotes: order.delivery_notes,
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    discountCents: order.discount_cents,
    totalCents: order.total_cents,
    items: items.map((item) => ({
      productName: item.product_name,
      variantLabel: item.variant_label,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      lineTotalCents: item.line_total_cents,
    })),
  };
}
