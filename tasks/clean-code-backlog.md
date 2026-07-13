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

## T5 — Search, Filters & Sorting (routed to later tasks)

- [ ] **T5-1 — `listPopularProducts` reuse guidance for T13 homepage (T13, LOW).**
  `listPopularProducts(limit)` (`src/lib/catalog/search.ts`) is exported cleanly,
  filter-independent, always-cached, best-selling order — T13's "popular chairs"
  strip should reuse it directly. But "featured" is a DIFFERENT intent (editorial,
  not sales-derived): do NOT cargo-cult or overload `listPopularProducts` for
  featured; add a distinct path (or a `sort`/`mode` param on a shared helper). Also
  note for T11: search facet-value sets (colors/materials/price domain in
  `facets.ts`) are `catalog`-tag cached, so a T11 admin save that adds a variant
  color/material MUST `revalidateTag("catalog")` for the new known-value to appear
  in the filter panel (and thereby be accepted by `parseCatalogFilters`, which drops
  unknowns). The tag scheme is coherent — this is a reminder, not a gap.
  (Ref: T5 architecture review, forward-compat.)
- [ ] **T5-2 — pg_trgm GIN indexes are dead for the accent-insensitive keyword
  branch (catalog-growth milestone, MED).** `0007_search.sql` adds trigram GIN
  indexes on `products.name`/`description`/`brands.name`, but the RPC predicate wraps
  each column in `unaccent(lower(col))`, so a plain-column trigram index cannot be
  used — `EXPLAIN ANALYZE` on `?q=ergonomica` confirms a full `Seq Scan on products`
  with the GIN untouched. Harmless at 30 rows; a full scan on every free-text search
  once the catalog is large. FIX SHAPE: create an `IMMUTABLE` unaccent wrapper
  (`f_unaccent(text)`) and replace the three trigram indexes with FUNCTIONAL GIN
  indexes `gin(f_unaccent(lower(name)) gin_trgm_ops)` (and description/brand name),
  rewriting the RPC predicate to call the same `f_unaccent`. Do this when the active-
  product count approaches a few hundred. (Ref: T5 architecture review, Scalability.)
- [ ] **T5-3 — `product_variants_color_hex_idx` unusable by the color filter
  (catalog-growth milestone, MED).** `color_hex` is stored MIXED-CASE in the live DB
  (`#1D4ED8`, `#B91C1C`), but the RPC color facet filters on `lower(v.color_hex) =
  any(<lowercased array>)`. The plain btree/`color_hex` index is on the raw mixed-case
  column and can NEVER serve the lowercased predicate — the index is dead by
  construction, not just at seed scale. FIX SHAPE (pick one): (a) normalize stored
  `color_hex` to lowercase via a data migration + a `CHECK (color_hex = lower(color_hex))`
  and drop the `lower()` from the predicate so the plain index works; OR (b) add a
  functional index `btree(lower(color_hex))` on `product_variants` and keep the
  predicate. Option (a) is cleaner long-term (canonical storage). Do this alongside
  T5-2 at the growth milestone. (Ref: T5 architecture review, Data Model / Scalability.)
- [ ] **T5-4 — Double `search_products` RPC per page + full-set materialization
  (catalog-growth milestone, MED).** `readSearchPage` (`src/lib/catalog/search.ts`)
  runs a probe at offset 0 to learn `total`/clamp `?page`, then a second RPC at the
  clamped offset (page 1 reuses the probe; pages 2+ pay TWO calls). Each RPC
  materializes the ENTIRE filtered set because `COUNT(*) OVER ()` runs before LIMIT.
  Free at 30 rows; at scale a deep paged broad filter does the full filter+sort+count
  twice. FIX SHAPE: compute the clamp DB-side so a single call returns the correct
  clamped page + count (e.g. pass the raw page and let the RPC clamp `p_offset` against
  its own `total_count`), or add a cheap `count_products(...)` companion for the probe.
  Also fold in the 0008+ RPC-versioning discipline: the arg signature is repeated in
  the `revoke`/`grant` (12-type list) — any arg change must touch signature + revoke +
  grant in lockstep, and every change must go through a migration (never a live-only
  `create or replace`) so the file stays the source of truth. (Ref: T5 architecture
  review, API Review.)
- [ ] **T5-5 — Catalog client-context ladder is the seed of a god-context (watch,
  LOW).** `CatalogShell` now nests `FilterNavigationProvider` + `ResultAnnouncerProvider`.
  Both are single-purpose and justified today. Guardrail for the next dev: do NOT bolt
  additional unrelated shared catalog client state onto either provider — add a new
  focused provider or lift state to the server. Revisit if a third provider appears.
  (Ref: T5 architecture review, Frontend Architecture.)
- [ ] **T5-6 — `/sillas` inline-`await` blocks TTFB on the RPC; re-open streaming on
  a Next upgrade (LOW→MED).** Stage 7b removed `<Suspense>`/`loading.tsx` so JS-off
  users get SSR-visible results (correct), but the route now blocks on the one-round-
  trip `search_products` RPC before first byte with no skeleton to mask latency. This
  is Next-version-specific (the dynamic-route `$RC` streaming-holder is invisible with
  JS off), NOT a permanent constraint. When the app moves to Next 16
  `cacheComponents`/PPR, restore a static shell + dynamic results hole (streaming for
  JS-on, SSR-visible for JS-off) — or edge-cache the shell. Trigger: RPC p95 TTFB
  climbs past ~150–200ms in production. (Ref: T5 architecture review, Scalability.)
- [ ] **T5-7 — `cachedRead` wrapper adopted by only 1 of 3 read modules (cleanup,
  LOW).** `read-primitives.ts` exports `cachedRead(keyParts, tags, fn)` to single-
  source the `unstable_cache({ tags, revalidate })` boilerplate, but only `facets.ts`
  uses it; `queries.ts` (~8 sites) and `search.ts` (2 sites) still hand-write the
  inline `unstable_cache` shape, so two cache idioms coexist in one module family.
  Migrate the bounded `queries.ts`/`search.ts` cache sites to `cachedRead` (the
  `search.ts` filter-only branch fits; its conditional-cache path can stay inline with
  a comment). Do this when `queries.ts` is split (existing T3 LOW split item), to
  avoid touching it twice. (Ref: T5 architecture review, Read-Layer Coherence.)
- [ ] **T5-8 — "malla" / mesh search-scope gap: materials unsurfaced by keyword
  search (T5 follow-up / T13, MED).** Keyword search matches name/brand/description
  only (AC-3). Chairs whose "mesh/malla" nature lives ONLY in the `material_*` columns
  (not the name/description) are invisible to a shopper typing "malla" in the search
  box — a real product-discovery miss the UX stage deferred. RECOMMENDED FIX SHAPE:
  **add the three `material_*` columns to the RPC keyword `WHERE` branch** (one extra
  `OR unaccent(lower(coalesce(material_*, ''))) LIKE ...` per column), so keyword and
  the material facet cover the same surface — smallest change, keeps a single search
  affordance, and reuses the same functional-index work as T5-2. Rejected alternatives:
  (a) a denormalized `search_text` column concatenating name+desc+materials — more
  moving parts, needs a trigger/generated column and re-index, only worth it if search
  scope grows further; (b) facet-only (tell users to use the material filter) — poorer
  UX, the search box is the primary discovery surface per PRODUCT_SPEC. Ship the RPC
  WHERE change as a small 0008 migration, ideally bundled with T5-2's functional index
  so the material columns are indexed the same way. (Ref: T5 UX audit deferred item;
  T5 architecture review, Scalability.)
