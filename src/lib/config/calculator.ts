/**
 * Savings-calculator reference prices (T19 AC-23). Numeric price map + model
 * list live here in config (NOT in the locale message files) so prices are not
 * duplicated across locales and stay MXN in both (edge 8 — no currency
 * conversion). Only the *labels* (title, bar labels, suffixes, note) are
 * localized via next-intl. Model option labels are derived from brand + model
 * (identical in both locales).
 *
 * All amounts are MXN integer cents (repo convention; `formatMXN` renders them).
 * These are PLACEHOLDER reference figures — see tasks/client-content-questionnaire.md.
 */

export interface ChairReference {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly newPriceCents: number;
  readonly posturPriceCents: number;
}

export const CALCULATOR_MODELS: readonly ChairReference[] = [
  {
    id: "aeron",
    brand: "Herman Miller",
    model: "Aeron",
    newPriceCents: 3_850_000,
    posturPriceCents: 2_190_000,
  },
  {
    id: "leap",
    brand: "Steelcase",
    model: "Leap V2",
    newPriceCents: 3_200_000,
    posturPriceCents: 1_590_000,
  },
  {
    id: "zody",
    brand: "Haworth",
    model: "Zody",
    newPriceCents: 2_400_000,
    posturPriceCents: 1_150_000,
  },
  {
    id: "embody",
    brand: "Herman Miller",
    model: "Embody",
    newPriceCents: 4_250_000,
    posturPriceCents: 2_650_000,
  },
  {
    id: "gesture",
    brand: "Steelcase",
    model: "Gesture",
    newPriceCents: 2_950_000,
    posturPriceCents: 1_490_000,
  },
  {
    id: "sayl",
    brand: "Herman Miller",
    model: "Sayl",
    newPriceCents: 1_950_000,
    posturPriceCents: 980_000,
  },
] as const;

/**
 * Minimum PosturPro-bar width as a fraction (edge 9). Mirrors the mockup's
 * `Math.max(8, …)` clamp: even if a bad config makes the PosturPro price ≥ the
 * new price, the bar never vanishes or inverts.
 */
export const CALCULATOR_MIN_BAR_FRACTION = 0.08;
