# Clean-Code / Deferred-Work Backlog

Open items discovered during the pipeline. Check off when addressed.

## T1 — Data Foundation (deferred by design)

- [ ] **Product-questions abuse controls (app layer).** The DB bounds question
  length (`char_length` CHECK on `product_questions` + the anon INSERT policy in
  `0005_rls_policies.sql`), but the DB cannot rate-limit. The ticket that ships
  the public question form must add per-IP throttling and/or a CAPTCHA hook
  before the anon INSERT path is exposed in the UI. (Ref: review finding M-6.)
- [ ] **Translations orphan cleanup.** `translations` is polymorphic
  (`entity_type` + `entity_id`, no FK by design), so deleting a base row leaves
  orphan translation rows. Add a periodic cleanup job or per-entity delete hook
  when the i18n runtime lands (T2+). (Ref: review nit n-4.)
- [ ] **Mexican state / postal validation.** `orders.shipping_state` /
  `shipping_postal_code` are free text. Add a validation list / regex when the
  checkout form is built (T7). (Ref: review nit n-1.)
- [ ] **Effective-stock read path.** Stock authority (per-variant authoritative,
  product-level fallback) is documented in `0002_catalog.sql` but not enforced
  by a view/generated column. Consider an `effective_stock` view when the
  cart/inventory logic lands so consumers cannot read the wrong column.
  (Ref: review minor m-2.)
- [ ] **Race-safe stock reservation primitive (T7).** The schema has stock
  columns but no reservation mechanism. T7 checkout must implement an atomic
  RPC / `SELECT ... FOR UPDATE` decrement inside the order-creation
  transaction — never an app-level read-then-write. (Ref: architecture review,
  HIGH risk.)
- [ ] **Webhook idempotency ledger for Mercado Pago (T8).** `mp_payment_id`
  exists but there is no processed-events table or unique constraint making
  duplicate webhook deliveries safe. Add before handling MP callbacks in T8.
  (Ref: architecture review, HIGH risk.)
- [x] **PostgREST embedding through `products_public` (T3).** Views cannot
  embed related rows the way base tables can. Standardize the catalog-read
  embedding strategy at the start of T3 so it isn't discovered mid-build.
  (Ref: architecture review, MED risk.)
  RESOLVED in T3 (`src/lib/catalog/queries.ts`): read `products_public`,
  embed `brands`/`styles` THROUGH the view (its forwarded FKs), and fetch
  `product_images`/`product_variants`/`product_categories` in separate batched
  `.in(product_id, ids)` queries (their FKs target base `products`, not the
  view), stitched in the typed data layer. Verified live against the seeded
  local DB: `products_public?select=...,brands(...),styles(...)` embeds cleanly.

## T2 — App shell (deferred by design)

- [x] **Fully dynamic shell defeats static catalog rendering (T3/T4).**
  `getStoreSettings()` uses `cookies()` in `[locale]/layout.tsx`, forcing
  on-demand rendering of every route under the shell. T3 must reopen this:
  read the public config without `cookies()` and add tag-based revalidation
  so catalog/PDP pages can be statically optimized. (Ref: T2 architecture
  review, risk 1.)
  RESOLVED in T3: added cookie-free `createPublicClient()`
  (`src/lib/supabase/public.ts`) + `getStoreSettingsStatic()` wrapped in
  `unstable_cache` (tag `store-settings`); swapped BOTH shell consumers —
  `[locale]/layout.tsx` AND `components/layout/site-footer.tsx` (the footer was
  the remaining `cookies()` taint) — to it. `next build` now reports the shell
  + `/categorias` + `/marcas` + `/estilos` as static/ISR (`●`, 5m revalidate).
  The listing pages that read `?page` (`/sillas` + `[slug]` details) remain
  dynamic due to `searchParams` (NOT `cookies()`); their data is tag-cached.
  NOTE: full PPR (static shell + dynamic `?page` hole) would need Next 16's
  `cacheComponents` — deferred as too invasive for T3.
- [ ] **Middleware composability for admin (T10).** The locale matcher will
  locale-route `/admin`, but admin must be fully separate from shopper
  sessions. In T10, keep admin outside `[locale]` and compose admin auth into
  the single `middleware.ts` chain (branch on `/admin`) or exclude it in the
  matcher. (Ref: T2 architecture review, risk 2.)
- [ ] **Security response headers (T14).** No CSP / X-Frame-Options /
  Referrer-Policy / HSTS yet — author the CSP against the full asset/script
  inventory during launch hardening. (Ref: T2 security audit SEC-L-1.)
