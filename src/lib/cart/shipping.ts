/**
 * Pure shipping + free-shipping-progress computation (T6 AC-8, AC-9, edge 6, 7).
 *
 * Integer cents in, integer cents out — no formatting (that is `formatMXN`'s
 * job). Both the flat rate and the free-shipping threshold come from the live
 * `store_settings` row (never hardcoded); config holds only the SEED defaults.
 * When either is unavailable (`null`), shipping degrades to an "unavailable"
 * result and the progress helper returns `null` so the UI hides the bar and
 * shows a neutral label — never `$NaN`.
 *
 * Free shipping is `subtotal >= threshold` (`>=`, not `>`; edge 7).
 */

/** Store-settings shipping inputs; either may be `null` (edge 6). */
export interface ShippingSettings {
  flatRateCents: number | null;
  freeThresholdCents: number | null;
}

/** The resolved shipping charge for an order (AC-8). */
export type ShippingResult =
  | { kind: "flat"; cents: number }
  | { kind: "free" }
  | { kind: "unavailable" };

/** Free-shipping progress toward the threshold (AC-9). */
export interface FreeShippingProgress {
  /** Cents still needed to reach the threshold; `0` once achieved. */
  remainingCents: number;
  /** `true` when `subtotal >= threshold` (edge 7). */
  achieved: boolean;
  /** Fill fraction, clamped `0..1`, for the progress bar `scaleX`. */
  pct: number;
}

/** Whether a settings value is a usable non-negative integer cents amount. */
function isUsableCents(value: number | null): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

/**
 * Resolve the shipping charge for a subtotal (AC-8, edge 6, 7).
 *
 * - Settings unavailable (either value not a usable integer) → `unavailable`
 *   (the summary shows a neutral label; total equals the subtotal).
 * - `subtotalCents >= freeThresholdCents` → `free`.
 * - Otherwise → the `flat` rate.
 */
export function computeShipping(
  subtotalCents: number,
  settings: ShippingSettings,
): ShippingResult {
  const { flatRateCents, freeThresholdCents } = settings;
  if (!isUsableCents(flatRateCents) || !isUsableCents(freeThresholdCents)) {
    return { kind: "unavailable" };
  }
  if (subtotalCents >= freeThresholdCents) {
    return { kind: "free" };
  }
  return { kind: "flat", cents: flatRateCents };
}

/**
 * The order total in integer cents: subtotal plus the shipping charge. `free`
 * and `unavailable` add nothing (edge 6). Never `NaN` — inputs are integers.
 */
export function totalCents(
  subtotalCents: number,
  shipping: ShippingResult,
): number {
  return shipping.kind === "flat"
    ? subtotalCents + shipping.cents
    : subtotalCents;
}

/**
 * Free-shipping progress toward the threshold (AC-9, edge 6, 7). Returns `null`
 * when the threshold is unavailable, so the UI renders NOTHING (no empty bar, no
 * `$NaN`). Otherwise `remainingCents` is `max(0, threshold - subtotal)`, `pct`
 * is clamped `0..1`, and `achieved` is `subtotal >= threshold`.
 */
export function freeShippingProgress(
  subtotalCents: number,
  freeThresholdCents: number | null,
): FreeShippingProgress | null {
  if (!isUsableCents(freeThresholdCents) || freeThresholdCents === 0) {
    return null;
  }
  const achieved = subtotalCents >= freeThresholdCents;
  const remainingCents = achieved
    ? 0
    : freeThresholdCents - Math.max(0, subtotalCents);
  const rawPct = Math.max(0, subtotalCents) / freeThresholdCents;
  const pct = Math.min(1, Math.max(0, rawPct));
  return { remainingCents, achieved, pct };
}
