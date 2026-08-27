/**
 * Pure savings math for the homepage calculator (T19 AC-23, edge 9). Extracted
 * from the client island so it is unit-testable and reused without React.
 */

import {
  CALCULATOR_MIN_BAR_FRACTION,
  type ChairReference,
} from "@/lib/config/calculator";

export interface SavingsResult {
  /** Savings amount in MXN cents, never negative. */
  savingsCents: number;
  /** Savings percentage, integer, floored at 0 (never negative). */
  savingsPct: number;
  /** New-price bar fill as a fraction 0–1 (always 1 — the reference/longest bar). */
  newBarFraction: number;
  /** PosturPro bar fill as a fraction, clamped to a visible minimum. */
  posturBarFraction: number;
}

/**
 * Compute savings and bar fractions for a chair reference.
 *
 * - `savings = new − postur`, floored at 0 so a bad config (postur ≥ new) never
 *   shows a negative amount or percentage.
 * - The new-price bar is the reference (fraction 1). The PosturPro bar is
 *   `postur / new`, clamped to `CALCULATOR_MIN_BAR_FRACTION` so it is always
 *   visible and never inverts/exceeds the new bar.
 */
export function computeSavings(chair: ChairReference): SavingsResult {
  const { newPriceCents, posturPriceCents } = chair;

  const rawSavings = newPriceCents - posturPriceCents;
  const savingsCents = Math.max(0, rawSavings);
  const savingsPct =
    newPriceCents > 0 ? Math.max(0, Math.round((rawSavings / newPriceCents) * 100)) : 0;

  const rawFraction = newPriceCents > 0 ? posturPriceCents / newPriceCents : 1;
  const posturBarFraction = Math.min(
    1,
    Math.max(CALCULATOR_MIN_BAR_FRACTION, rawFraction),
  );

  return {
    savingsCents,
    savingsPct,
    newBarFraction: 1,
    posturBarFraction,
  };
}
