/**
 * Pure order-total assembly + order-number formatting (T7 AC-9, AC-11, AC-15,
 * edge 8). I/O-free and unit-tested.
 *
 * Given the validated LIVE-price lines, the resolved shipping charge, and the
 * clamped discount, produces the financial snapshot the `orders` insert must
 * write — GUARANTEED to satisfy every DB CHECK:
 *   - `order_items_line_total_identity`: line_total = unit_price × quantity
 *   - `orders_discount_within_subtotal`: discount ≤ subtotal
 *   - `orders_total_identity`: total = subtotal + shipping + tax − discount
 *   - all `*_cents ≥ 0`, `currency = 'MXN'`, tax = 0 (Phase 1).
 *
 * Shipping is taken from `ShippingResult` (the SAME `computeShipping` output the
 * cart uses) — `unavailable` is a caller error (the action blocks submit before
 * calling this, edge 5); we treat it defensively as 0 shipping but the action
 * never reaches here with `unavailable`.
 */
import { ORDER_NUMBER_PREFIX, TAX_RATE } from "@/lib/config";
import type { ShippingResult } from "@/lib/cart/shipping";

/** A validated order line, priced from the LIVE DB (never the cart snapshot). */
export interface OrderLine {
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string;
  variantLabel: string | null;
  /** Live effective unit price in integer cents. */
  unitPriceCents: number;
  quantity: number;
}

/** A line with its computed line total (satisfies the line-total DB CHECK). */
export interface OrderLineTotals extends OrderLine {
  lineTotalCents: number;
}

/** The assembled financial snapshot (integer cents), satisfying every CHECK. */
export interface OrderTotals {
  lines: OrderLineTotals[];
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  taxBaseCents: number;
  taxCents: number;
  totalCents: number;
}

/** Resolve the shipping charge in cents from a `ShippingResult`. */
function shippingChargeCents(shipping: ShippingResult): number {
  return shipping.kind === "flat" ? shipping.cents : 0;
}

/**
 * Assemble the order financial snapshot from live-priced lines, shipping, and a
 * clamped discount (AC-9, AC-11, edge 8). The discount is defensively re-clamped
 * to `[0, subtotal]` so the returned snapshot ALWAYS satisfies the DB CHECKs
 * even if a caller passed an over-large value. Tax is `TAX_RATE` (0 in Phase 1),
 * written to both tax columns so CFDI (Phase 3) needs no rework.
 */
export function assembleOrder(
  lines: readonly OrderLine[],
  shipping: ShippingResult,
  discountCents: number,
): OrderTotals {
  const withTotals: OrderLineTotals[] = lines.map((line) => ({
    ...line,
    lineTotalCents: line.unitPriceCents * line.quantity,
  }));

  const subtotalCents = withTotals.reduce(
    (sum, line) => sum + line.lineTotalCents,
    0,
  );
  const shippingCents = shippingChargeCents(shipping);
  const safeDiscountCents = Math.max(0, Math.min(discountCents, subtotalCents));
  // Phase 1: no IVA line. Written as 0 so the CFDI columns exist (AC-15).
  const taxBaseCents = 0;
  const taxCents = TAX_RATE === 0 ? 0 : Math.round(taxBaseCents * TAX_RATE);
  const totalCents =
    subtotalCents + shippingCents + taxCents - safeDiscountCents;

  return {
    lines: withTotals,
    subtotalCents,
    shippingCents,
    discountCents: safeDiscountCents,
    taxBaseCents,
    taxCents,
    totalCents,
  };
}

/**
 * Format a raw sequence number into the display order number (AC-11, AC-15).
 * e.g. `123` → `PP-000123`. The DB (the `create_order` RPC in 0008_checkout.sql)
 * is the authority for UNIQUENESS (sequence-backed); this is the display shape.
 * Kept in sync with the prefix the RPC uses (see config header). Zero-padded to
 * 6 digits for legibility; longer sequences simply grow.
 */
const ORDER_NUMBER_MIN_DIGITS = 6;

export function formatOrderNumber(sequence: number): string {
  const padded = String(sequence).padStart(ORDER_NUMBER_MIN_DIGITS, "0");
  return `${ORDER_NUMBER_PREFIX}-${padded}`;
}
