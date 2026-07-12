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
 * Swap for real Storage URLs when real photography is available (see header).
 */
export const SEED_IMAGE_BASE_URL =
  "https://images.unsplash.com/photo-office-chair" as const;

/** Default store identity written by the seed (admin-editable in T10). */
export const SEED_STORE_NAME = "PosturPro" as const;

/** Default store contact email written by the seed (admin-editable in T10). */
export const SEED_STORE_CONTACT_EMAIL = "hola@posturpro.mx" as const;
