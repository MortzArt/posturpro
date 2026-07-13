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
- [ ] **Category product membership uses an unbounded `.in()` (T3 → scale).**
  `readCategoryProductPage` (`src/lib/catalog/queries.ts`) loads the category's
  member `product_id`s from `product_categories` and passes them to
  `.in("id", ids)` on `products_public`. T3 review M-3: fine at seed scale (≤30
  members) but there is no server-side pagination of the membership — a large
  parent category would build an ever-growing `IN (...)` list and a long
  PostgREST URL. MITIGATED in T3: the membership read is bounded to
  `CATEGORY_MEMBER_ID_CAP = 1000` ids (logged if hit) and de-duplicated. SCALE
  CEILING: when a category can legitimately exceed the cap, migrate to a
  category-scoped view / RPC so pagination happens in the DB (count + range
  window) instead of client-side id sets. (Ref: T3 review M-3.)
- [ ] **Middleware composability for admin (T10).** The locale matcher will
  locale-route `/admin`, but admin must be fully separate from shopper
  sessions. In T10, keep admin outside `[locale]` and compose admin auth into
  the single `middleware.ts` chain (branch on `/admin`) or exclude it in the
  matcher. (Ref: T2 architecture review, risk 2.)
- [ ] **Security response headers (T14).** No CSP / X-Frame-Options /
  Referrer-Policy / HSTS yet — author the CSP against the full asset/script
  inventory during launch hardening. (Ref: T2 security audit SEC-L-1.)

## T3 — Catalog browsing (routed to later tasks)

- [ ] **DB-side filtered/sorted query path for T5 (HIGH).** T3's catalog read is
  a `products_public` page + client-side stitch of separately-batched
  images/variants. This is correct for T3 but CANNOT support T5's variant-level
  filters: color lives on `product_variants` and materials on `products` scalar
  columns — neither is on the view, and a variant-color filter must be applied
  BEFORE pagination (you cannot page products then discover which have a red
  variant). T5 must build a server-side filtered/sorted query — a Postgres RPC
  or a `products_filterable` view that pre-joins variant color/material
  aggregates — so filtering + `count` + `.range()` all run in the DB. Do NOT
  extend `src/lib/catalog/queries.ts` client-side stitching for T5 filters, and
  fold the category `.in(ids)` membership read (existing M-3 item above) into the
  same DB-side path rather than solving it twice. (Ref: T3 architecture review,
  HIGH risk.)
- [ ] **Filter/sort indexes for T5 (MED).** No indexes exist on `price_cents`,
  `created_at`, or `sales_count` (needed for price/newest/best-selling sorts) nor
  on variant `color_hex`/`color_name` or product `material_frame/upholstery/finish`
  (needed for color/material filters). Add them in the T5 migration; without them
  each sorted/filtered page is a full scan. (Ref: T3 architecture review, MED.)
- [ ] **Cache-key cardinality under T5 filtering (MED).** T3 wraps every read in
  `unstable_cache` with a bounded key (`?page` + slug + pageSize). T5's
  category×brand×style×price×color×material×availability×sort combinations make
  that key space combinatorial — it would thrash the cache (near-zero hit rate)
  and bloat the store. T5 must choose a deliberate strategy: tag-cache only the
  common/unfiltered views and let filtered queries hit the DB (cheap at this
  catalog size), OR move filtered browsing to client-side fetching against a
  cached RPC. Decide in T5 planning; do not keep wrapping every filter combo.
  (Ref: T3 architecture review, MED risk.)
- [ ] **Effective-stock is display-only; cart needs authoritative stock (T6/T7).**
  `src/lib/catalog/stock.ts` computes "sum variants else product.stock" for the
  card BADGE only — being ISR-stale by up to `CATALOG_REVALIDATE_SECONDS` is
  harmless there. T6 cart / T7 checkout must NOT read stock through this display
  path: re-implementing the same rule independently will drift. Read authoritative
  stock through the deferred `effective_stock` view (existing m-2 item above)
  and/or the atomic reservation RPC (existing T7 item above). Label `stock.ts`
  "display-only, not authoritative." (Ref: T3 architecture review, MED.)
- [ ] **Add-to-cart client island seam on ProductCard (T6).** `ProductCard` is a
  pure server component (correct default). T6's quick-add affordance must be a
  NESTED client island (e.g. `<QuickAddButton>` slotted into the card), NOT a
  conversion of `ProductCard` to `"use client"`. The current single-`<Link>`
  wrapper supports this without refactor. (Ref: T3 architecture review, LOW.)
- [ ] **Split `queries.ts` before adding T5 filter logic (LOW).**
  `src/lib/catalog/queries.ts` is ~712 lines — cohesive today, but piling T5
  filter/sort logic in will breach the ~400-line guidance. Split into
  `queries/products.ts` + `queries/taxonomy.ts` when T5 lands. (Ref: T3
  architecture review, LOW.)

## T4 — Product detail page (routed to later tasks)

- [ ] **Q&A composite index for the PDP read (T11, MED).**
  `readQuestions` (`src/lib/catalog/product-detail.ts`) filters
  `product_id = ? AND is_published = true AND answer IS NOT NULL ORDER BY
  created_at DESC`, but `product_questions` has only single-column indexes on
  `(product_id)` and `(is_published)` (`0004_content_qa.sql`) — no composite
  `(product_id, is_published, created_at DESC)`. Fine at seed scale (Postgres
  uses `product_id_idx` then sorts in memory, and ISR caps the cost to
  per-revalidate). Add the composite index in the T11 migration before answering
  makes long published lists real. (Ref: T4 architecture review, MED; T4 review
  m-4 SKIPPED.)
- [ ] **PDP Q&A list has no pagination / display cap (T11, MED).** The PDP
  renders the ENTIRE published+answered set (`product-qa.tsx`); with ~0 published
  Q&A today there is no impact, but once T11 answering exists a popular product's
  full Q&A history serializes into the page and renders unbounded. Add a
  `QA_DISPLAY_LIMIT` constant + a "show more" affordance when T11 lands.
  (Ref: T4 architecture review, MED.)
- [ ] **Durable Q&A rate limiter + the "do not reuse in-memory Map for T8"
  precedent (T8, MED).** The Q&A limiter (`src/lib/qa/submit-guard.ts`) is an
  in-memory per-instance `Map` (resets on deploy/scale-out) — ticket-sanctioned
  best-effort for Q&A spam, with the honeypot + `QA_RATE_LIMIT_MAX_KEYS` map cap
  as backstops. Make it durable (Upstash/Redis or a Postgres `rate_limits` table)
  only if it ever guards more than best-effort Q&A. CRITICALLY: do NOT generalize
  this in-memory pattern into T8's Mercado Pago webhook idempotency — that needs
  the durable processed-events ledger (unique constraint on `mp_payment_id`)
  already tracked in the T1 backlog above. (Ref: T4 architecture review, MED.)
- [ ] **Extract shared catalog read primitives before T5 (LOW → do it in T5
  prep).** `fail()`, `firstOrSelf()`, the slug/tag boilerplate, and the
  `products_public` select conventions are now duplicated verbatim across
  `src/lib/catalog/queries.ts` and `src/lib/catalog/product-detail.ts` (T4 review
  n-4 SKIPPED because hoisting touches T3's tested `queries.ts`). T5 will add a
  THIRD read module (DB-side filtered query path). Extract a shared
  `src/lib/catalog/read-primitives.ts` (`fail`, `firstOrSelf`, tag builders,
  `CATALOG_CACHE_TAG`) with characterization tests BEFORE T5 copies them again.
  (Ref: T4 architecture review, LOW.)
- [ ] **`generateStaticParams` unbounded prerender (scale milestone, LOW).**
  The PDP prerenders every active slug × both locales (60 today; linear —
  ~2,000 pages at 1,000 products). `dynamicParams=true` is on, so the long tail
  ISRs on demand and the build set can be safely capped later (prerender top-N
  best-sellers). Add a prerender cap when the active-product count approaches
  ~1,000. (Ref: T4 architecture review, LOW.)
- [ ] **PDP island serializes all variants+images (T11 UX guardrail, LOW).**
  `ProductPurchasePanel` receives the full `variants[]` + `allImages[]` + a
  `variantDisplay` map into the client island. Trivial for a chair; a product
  with dozens of variants/images (only creatable via T11 admin) would bloat the
  RSC payload + hydration. When T11 builds variant/multi-image management, add a
  sane per-product image/variant guardrail (or lazy-load non-selected-variant
  image metadata past a threshold). (Ref: T4 architecture review, LOW.)
