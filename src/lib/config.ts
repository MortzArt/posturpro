/**
 * Centralized, non-secret configuration constants for PosturPro — BARREL.
 *
 * A2 SPLIT (tasks/clean-code-backlog.md — Uncle Bob alignment audit)
 * ------------------------------------------------------------------
 * This file was a 689-line monolith. It has been split into domain modules
 * under `src/lib/config/` and now exists ONLY as a pure re-export barrel, so
 * NO importer changed: everything is still importable from `@/lib/config`
 * (and `./config`). The split is behavior-preserving — every constant value,
 * exported name, and doc comment moved VERBATIM to its domain module.
 *
 * WHERE THINGS LIVE NOW
 * ---------------------
 * - `./config/shared`         — currency/locale, WhatsApp, shipping seeds,
 *                               Supabase bucket, seed store identity (cross-domain)
 * - `./config/catalog`        — catalog pagination/paths + search/filter/sort (T3, T5)
 * - `./config/product-detail` — PDP, recently-viewed, Q&A, meta truncation (T4)
 * - `./config/cart`           — cart storage/routes + add-to-cart timing (T6)
 * - `./config/checkout`       — address validation, tax, order number,
 *                               confirmation route, rate limits (T7, T8)
 * - `./config/email`          — transactional email non-secret config (T9)
 *
 * Secrets (Supabase / email keys) live in `.env.local` and are read exclusively
 * through `src/lib/env.ts`. Money is INTEGER CENTS everywhere; see
 * `./config/shared` for the full money convention and swap-real-values notes.
 */

export * from "./config/shared";
export * from "./config/catalog";
export * from "./config/admin-products";
export * from "./config/product-detail";
export * from "./config/cart";
export * from "./config/checkout";
export * from "./config/email";
