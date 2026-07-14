/**
 * Pure discount-code eligibility + application (T7 AC-6, AC-7, edge 6).
 *
 * I/O-free and unit-tested. The LIVE lookup (fetching the `discount_codes` row)
 * happens in the action / read layer; THIS module decides — given a fetched row
 * (or `null`) and the current subtotal and clock — whether the code applies and
 * for how many cents. A bad/expired/inactive/below-min/exhausted code NEVER
 * blocks checkout (AC-7): it degrades to no discount with a reason. A valid code
 * is CLAMPED so `discount ≤ subtotal` (the DB `orders_discount_within_subtotal`
 * CHECK) and the total can never go negative (edge 6).
 */

/** The discount-code row shape this module needs (subset of the DB row). */
export interface DiscountCodeRow {
  code: string;
  discount_type: "percentage" | "fixed_amount";
  /** percentage: 0–100; fixed_amount: integer cents. */
  value: number;
  min_subtotal_cents: number | null;
  max_redemptions: number | null;
  times_redeemed: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

/** Why a code did not apply (each maps to a localized inline message). */
export type DiscountInvalidReason =
  | "unknown" // no matching code row
  | "inactive" // is_active = false or not yet started
  | "expired" // past ends_at
  | "below-min" // subtotal below min_subtotal_cents
  | "exhausted"; // times_redeemed >= max_redemptions

/** The outcome of applying a code to a subtotal. */
export type DiscountOutcome =
  | { kind: "none" }
  | { kind: "applied"; code: string; discountCents: number }
  | { kind: "invalid"; reason: DiscountInvalidReason };

/** Percentage divisor for the `percentage` discount type. */
const PERCENT_DIVISOR = 100;

/**
 * Normalize a raw discount code for lookup + storage (AC-6): trim, then
 * upper-case (codes are matched case-insensitively; we store the canonical
 * upper-cased form). An empty result means "no code entered".
 */
export function normalizeDiscountCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** The raw discount amount for a code+subtotal BEFORE the subtotal clamp. */
function rawDiscountCents(row: DiscountCodeRow, subtotalCents: number): number {
  if (row.discount_type === "percentage") {
    return Math.round((subtotalCents * row.value) / PERCENT_DIVISOR);
  }
  // fixed_amount: value is already integer cents.
  return row.value;
}

/**
 * Apply a fetched discount-code row to a subtotal (AC-6, AC-7, edge 6).
 *
 * @param row the fetched `discount_codes` row, or `null` when no code matched
 * @param subtotalCents current cart subtotal in integer cents (non-negative)
 * @param now current time (injectable for tests; defaults to `Date.now()`)
 *
 * Eligibility order (first failure wins): active/started → not expired →
 * meets min subtotal → redemptions remaining. A valid code's discount is
 * `min(rawDiscount, subtotal)` so it never exceeds the subtotal (DB CHECK).
 * A zero-cent effective discount (e.g. a 0% code) yields `{ kind: "none" }`
 * so no discount row is written or displayed.
 */
export function applyDiscount(
  row: DiscountCodeRow | null,
  subtotalCents: number,
  now: number = Date.now(),
): DiscountOutcome {
  if (row === null) {
    return { kind: "invalid", reason: "unknown" };
  }

  if (!row.is_active) {
    return { kind: "invalid", reason: "inactive" };
  }

  if (row.starts_at !== null && now < Date.parse(row.starts_at)) {
    return { kind: "invalid", reason: "inactive" };
  }

  if (row.ends_at !== null && now > Date.parse(row.ends_at)) {
    return { kind: "invalid", reason: "expired" };
  }

  if (row.min_subtotal_cents !== null && subtotalCents < row.min_subtotal_cents) {
    return { kind: "invalid", reason: "below-min" };
  }

  if (row.max_redemptions !== null && row.times_redeemed >= row.max_redemptions) {
    return { kind: "invalid", reason: "exhausted" };
  }

  const clamped = Math.min(rawDiscountCents(row, subtotalCents), subtotalCents);
  if (clamped <= 0) {
    return { kind: "none" };
  }
  return { kind: "applied", code: row.code, discountCents: clamped };
}
