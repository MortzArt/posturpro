import { defineRouting } from "next-intl/routing";

/**
 * next-intl routing definition — the single source of truth for the store's
 * locale set and URL strategy (T2 AC-2).
 *
 * DECISIONS (see research report → External Research):
 * - `locales: ["es-MX", "en"]` — canonical tags WITH region. `es-MX` (not `es`)
 *   matches `CURRENCY_LOCALE` / `DEFAULT_LOCALE` in `src/lib/config.ts` and the
 *   tag a future Supabase `translations` content lookup (T3+) will use. Keep
 *   these in sync; do not introduce a second locale source of truth.
 * - `defaultLocale: "es-MX"` — Mexico-first storefront.
 * - `localePrefix: "as-needed"` — Spanish (default) is served with NO prefix
 *   (`/`, `/sillas`); English is served under `/en` (`/en`, `/en/products`).
 *   Distinct crawlable URLs (English gets indexed) with clean prefix-free URLs
 *   for the primary market. next-intl auto-emits `hreflang` alternates.
 * - `localeDetection: false` — EXPLICIT PRODUCT DECISION, not a silent default.
 *   `/` always serves Spanish regardless of the browser's `Accept-Language`,
 *   because Mexican users frequently run English-configured OSes and automatic
 *   negotiation would wrongly flip them. English is an explicit opt-in via the
 *   language toggle; the `NEXT_LOCALE` cookie then persists the choice.
 */
export const routing = defineRouting({
  locales: ["es-MX", "en"],
  defaultLocale: "es-MX",
  localePrefix: "as-needed",
  localeDetection: false,
});

/** Union of supported locale tags, derived from the routing definition. */
export type Locale = (typeof routing.locales)[number];
