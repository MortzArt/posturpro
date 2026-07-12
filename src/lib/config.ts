/**
 * Centralized, non-secret configuration constants for PosturPro.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every placeholder / tunable value that is NOT a secret lives here so that
 * swapping real values later is a single, discoverable edit. Secrets (Supabase
 * keys) live in `.env.local` and are read exclusively through `src/lib/env.ts`.
 *
 * MONEY CONVENTION
 * ----------------
 * All monetary values across PosturPro are stored and computed as INTEGER
 * CENTS (MXN centavos). Never store or compute money as a float. The ONLY
 * place cents are converted to a human-readable string is `formatMXN()` in
 * `src/lib/money.ts`. Constants below therefore end in `_CENTS`.
 *
 * HOW TO SWAP REAL VALUES
 * -----------------------
 * - Shipping amounts: these constants are only the SEED DEFAULTS written into
 *   the `store_settings` table by `scripts/seed.ts`. At runtime the app reads
 *   the (admin-editable, see T10) `store_settings` row — NOT these constants.
 *   To change the live store values, edit the `store_settings` row (or the
 *   admin UI in T10), not this file. Edit here only to change the seed default.
 * - Currency: PosturPro is single-currency (MXN) in Phase 1. Changing it
 *   requires more than this constant (tax logic, formatting locale) — treat as
 *   a project-wide change, not a config swap.
 * - Storage bucket: `SUPABASE_STORAGE_BUCKET` must match the bucket created in
 *   the Supabase dashboard. If you rename the bucket, update it here AND in
 *   `next.config.ts` is unaffected (host is the same), but seeded image URLs
 *   embed the bucket name, so re-run the seed after changing it.
 * - Seed image base URL: `SEED_IMAGE_BASE_URL` is where placeholder product
 *   photos are fetched from for seed data. To use real product photography,
 *   upload images to the Supabase Storage bucket and update the per-product
 *   image paths in `scripts/seed-data/products.ts`, then re-run the seed.
 */

/** ISO 4217 currency code. PosturPro is single-currency in Phase 1. */
export const CURRENCY = "MXN" as const;

/** BCP-47 locale used by `Intl.NumberFormat` for MXN formatting. */
export const CURRENCY_LOCALE = "es-MX" as const;

/**
 * Canonical default UI locale (BCP-47 with region), aligned with
 * `CURRENCY_LOCALE`. This is the SAME tag next-intl resolves and the SAME tag a
 * future Supabase `translations` content lookup (T3+) must use — do NOT
 * introduce a second locale source of truth. The store serves this locale at
 * `/` with no URL prefix; English is the explicit opt-in under `/en` (see
 * `src/i18n/routing.ts`). If you localize to another market, change it here AND
 * in `src/i18n/routing.ts` (they must stay in sync).
 */
export const DEFAULT_LOCALE = "es-MX" as const;

/**
 * WhatsApp contact number in E.164 format, DIGITS ONLY, no `+`, spaces, or
 * dashes (e.g. Mexico City mobile → `5215512345678`). This is NON-SECRET
 * config, not an env var — safe to ship in the client bundle.
 *
 * HOW TO SWAP THE REAL VALUE
 * --------------------------
 * Replace the empty string with the store's real WhatsApp number. While it is
 * empty (`""`), the floating WhatsApp button is NOT rendered at all — this is
 * the intentional guard that prevents a broken `wa.me/` link with no number
 * (T2 edge case 7). Do not prefix with `+`; `wa.me` wants bare digits.
 */
export const WHATSAPP_PHONE_E164 = "" as const;

/**
 * Prefilled Spanish message inserted into the `wa.me` deep link (URL-encoded at
 * the call site). Kept in config (not a dictionary) because it is a fixed
 * business value, not a translated UI string, and the store's WhatsApp audience
 * is Spanish-speaking regardless of the site's UI locale. Swap freely.
 */
export const WHATSAPP_PREFILL_MESSAGE_ES =
  "Hola, tengo una pregunta sobre las sillas de PosturPro." as const;

/**
 * Seed default for flat-rate shipping, in integer cents (MXN centavos).
 * 50000 cents = MX$500.00. Runtime source of truth is `store_settings`.
 */
export const SHIPPING_FLAT_RATE_CENTS = 50_000;

/**
 * Seed default for the order subtotal (in cents) at/above which shipping is
 * free. 1_000_000 cents = MX$10,000.00. Runtime source of truth is
 * `store_settings`.
 */
export const FREE_SHIPPING_THRESHOLD_CENTS = 1_000_000;

/** Supabase Storage bucket that holds public product images. */
export const SUPABASE_STORAGE_BUCKET = "product-images" as const;

/**
 * Base URL for placeholder product images used by the seed script.
 *
 * Uses picsum.photos seeded URLs (`/{slug}-{n}/800/800`) which return a real,
 * deterministic 800x800 image per seed string — so seeded catalog data renders
 * something during T2–T5 development instead of 404ing. Swap for real Supabase
 * Storage URLs when real photography is available (see header).
 */
export const SEED_IMAGE_BASE_URL = "https://picsum.photos/seed" as const;

/** Default store identity written by the seed (admin-editable in T10). */
export const SEED_STORE_NAME = "PosturPro" as const;

/** Default store contact email written by the seed (admin-editable in T10). */
export const SEED_STORE_CONTACT_EMAIL = "hola@posturpro.mx" as const;

/* ========================================================================= *
 * CATALOG (T3) — non-secret tunables, single-sourced here (Rule 4).
 * ========================================================================= */

/**
 * Products shown per catalog/category/brand/style grid page (T3 AC-9).
 * 12 is divisible by the 2 / 3 / 4 grid columns, so the last row is never
 * ragged at any breakpoint. Change this and pagination math + skeleton count
 * follow automatically (both read this constant).
 */
export const PRODUCTS_PER_PAGE = 12;

/**
 * Inclusive upper bound for the "low stock" badge state (T3 AC-8). Effective
 * stock `1..LOW_STOCK_THRESHOLD` renders "Solo quedan {n}"; `> threshold`
 * renders "En stock"; `0` renders "Agotado".
 */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * ISR revalidation window (seconds) for cached catalog reads and the static
 * store-settings read (T3 AC-11). Catalog pages become static/ISR; admin CRUD
 * (T10) busts the relevant `unstable_cache` tag on demand, so this is only the
 * fallback staleness ceiling, not the primary freshness mechanism. 5 minutes.
 */
export const CATALOG_REVALIDATE_SECONDS = 300;

/* ------------------------------------------------------------------------- *
 * Catalog route segments — locale-agnostic Spanish paths (T3 routing
 * decision). The locale-aware `Link` adds the `/en` prefix automatically, so
 * these are single-sourced here rather than hardcoded across pages/breadcrumbs.
 * ------------------------------------------------------------------------- */

/** All-products catalog grid. */
export const CATALOG_PATH = "/sillas" as const;
/** Category index. */
export const CATEGORIES_PATH = "/categorias" as const;
/** Brand index. */
export const BRANDS_PATH = "/marcas" as const;
/** Style index. */
export const STYLES_PATH = "/estilos" as const;

/** Build the canonical category detail path for a slug. */
export function categoryPath(slug: string): string {
  return `${CATEGORIES_PATH}/${slug}`;
}
/** Build the canonical brand detail path for a slug. */
export function brandPath(slug: string): string {
  return `${BRANDS_PATH}/${slug}`;
}
/** Build the canonical style detail path for a slug. */
export function stylePath(slug: string): string {
  return `${STYLES_PATH}/${slug}`;
}
/**
 * Canonical product-detail (PDP) path for a slug (T3 AC-12). The route is
 * owned by T4 and may 404 via the catch-all until it ships — T3 only links to
 * it. Single-sourced so T4 need not hunt for hardcoded strings.
 */
export function productPath(slug: string): string {
  return `/producto/${slug}`;
}
