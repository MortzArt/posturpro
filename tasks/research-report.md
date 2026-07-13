# Research Report: T5 — Search, Filters & Sorting

All findings below were verified against the actual codebase and the **seeded local Docker
Supabase** (`:54322`, `supabase_db_posturpro`) — the remote in `.env.local` is dead. Live SQL
probes are called out inline.

## Codebase Analysis

### Existing Patterns

- **View-only anon read + JS stitch** — `src/lib/catalog/queries.ts:150-213` (`stitchCards`).
  Pages `products_public` with `brands` embedded, then batch-fetches `product_images` +
  `product_variants` by `.in("product_id", ids)` and stitches into `CatalogProductCard`.
  **Reuse:** the stitched card view model is what `ProductCard` consumes; T5 keeps producing
  the same `CatalogProductCard` so the card component is untouched. **But** this pattern
  **cannot** filter by color/availability pre-pagination (the whole reason T5 needs an RPC).
- **Count-first, then clamp, then one read** — `queries.ts:298-329` (`readProductPage`).
  `countProducts` (head query) → `lastPageFor` → `parsePageParam` clamps → one `.range()` read.
  This never emits a PostgREST 416. **Reuse strategy:** the RPC replicates this with a single
  round trip via `COUNT(*) OVER ()` as `total_count`; the JS layer computes `lastPage` and
  clamps the requested page the same way (`pagination.ts` is fully reused).
- **Cache-key DoS bound** — `queries.ts:142-144` (`cacheKeyForPage`) + `pagination.ts:24-36`
  (`canonicalPageKey`) + `config.ts:135` (`MAX_PAGE = 100_000`). Malformed/huge `?page`
  collapses to a bounded key. **Reuse:** T5 filter params follow the same discipline
  (Constraint 3) — the precedent is `canonicalPageKey`.
- **Slug validation before cache key** — `product-detail.ts:43-55` (`isCacheableSlug`,
  `SLUG_PATTERN`, `MAX_SLUG_LENGTH`). Junk rejected before it mints a cache key. **Reuse:** the
  model for validating filter values (drop unknowns) and capping `q` length.
- **`fail()` error contract** — `queries.ts:120-125` and `product-detail.ts:57-61`
  (**DUPLICATED** — the Constraint-2 refactor target). Logs full detail server-side, throws a
  redacted `Error`, caught by `[locale]/error.tsx`.
- **`firstOrSelf<T>`** — `queries.ts:127-130` and `product-detail.ts:93-96` (**DUPLICATED** —
  also a refactor target).
- **`unstable_cache` with per-entity tags** — every read in `queries.ts` wraps
  `unstable_cache(fn, keyParts, { tags, revalidate: CATALOG_REVALIDATE_SECONDS })`. Tags:
  `catalog`, `brand:<slug>`, `category:<slug>`, `style:<slug>`, `product:<slug>`. **Reuse:** the
  `cachedRead` wrapper (Constraint 2) plus the "don't cache free-text" decision (Constraint 3).
- **Effective stock** — `src/lib/catalog/stock.ts`: `effectiveStock(productStock, variants)` =
  `sum(variant.stock)` when variants exist else `productStock`; `stockState` → `out` (≤0), `low`
  (≤`LOW_STOCK_THRESHOLD=5`), `in`. **Reuse:** the RPC's SQL availability expression must equal
  this exactly (AC-6). Verified: `COALESCE((SELECT SUM(v.stock) …), pp.stock)` matches.
- **Crawlable pagination** — `src/components/catalog/pagination.tsx` renders real
  `<a href="?page=N">`; `page-helpers.ts` `makeHrefForPage(basePath)` enforces page-1-canonical
  (no `?page=1`). **Modify:** the href builder must carry the full filter/sort/search query
  string so page links preserve state (AC-15).
- **Static/ISR page shell + Suspense grid** — `sillas/page.tsx` uses `generateStaticParams`
  for both locales and isolates the `searchParams`-dependent grid in `<Suspense>` so the shell
  stays static. **Adapt:** with filters, any request carrying params is dynamic by nature; keep
  the unfiltered `/sillas` on the cached/static path (AC-10).
- **Locale-agnostic path constants + next-intl navigation** — `config.ts:159-186`
  (`CATALOG_PATH`, `productPath`, …); `src/i18n/navigation.ts` exports the locale-aware `Link`,
  `useRouter`, `usePathname` (`localePrefix: "as-needed"`, `es-MX` unprefixed, `/en` prefixed).
  **Reuse:** all new links/redirects go through these so `/en` prefixing is automatic.

### Relevant Files

| File | Purpose | Relevance | Action |
| --- | --- | --- | --- |
| `src/lib/catalog/queries.ts` | T3 catalog read layer | Source of the card shape + count/clamp pattern; holds duplicated primitives | Modify (import primitives; maybe share card select) |
| `src/lib/catalog/product-detail.ts` | T4 PDP read layer | Second copy of `fail`/`firstOrSelf` | Modify (import primitives) |
| `src/lib/catalog/pagination.ts` | Pure page math | `lastPageFor`/`parsePageParam`/`rangeFor`/`canonicalPageKey`/`paginationWindow` | Reference (reuse as-is) |
| `src/lib/catalog/stock.ts` | Effective-stock rules | RPC availability must match `effectiveStock`/`stockState` | Reference |
| `src/lib/catalog/types.ts` | `CatalogProductCard`/`CatalogPage` | T5 returns the same shapes | Reference |
| `src/lib/config.ts` | Tunables + paths | Add search/filter constants | Modify |
| `src/lib/supabase/public.ts` | Cookie-free anon client | RPC is called through it | Reference |
| `src/app/[locale]/sillas/page.tsx` | All-products grid | The T5 host page | Modify |
| `src/components/catalog/product-card.tsx` | Grid card | Unchanged (same view model) | Reference |
| `src/components/catalog/pagination.tsx` + `page-helpers.ts` | Crawlable pagination | Must preserve filter query string | Modify |
| `src/components/catalog/product-grid.tsx` (`ProductGrid`) | Responsive 2/3/4 grid | Reused for filtered results | Reference |
| `src/components/catalog/paginated-product-listing.tsx` | `?page` reader + grid + empty | Pattern to adapt for the filtered page | Reference |
| `src/components/catalog/empty-state.tsx` | Zero-products empty | T5 uses a distinct `NoResults` (with popular strip) instead | Reference |
| `src/components/catalog/breadcrumbs.tsx` | Accessible trail | `/sillas` breadcrumb stays | Reference |
| `src/components/catalog/stock-badge.tsx` | Stock badge | Rendered unchanged from card data | Reference |
| `src/components/layout/site-header.tsx` | Header shell (no search box today) | Add the search box | Modify |
| `src/i18n/routing.ts` + `navigation.ts` + `src/middleware.ts` | Locale routing | New links go through `Link`/`useRouter` | Reference |
| `src/messages/es-MX.json` + `en.json` | i18n dictionaries | New `catalog.search`/`filters`/`sort`/`noResults` keys | Modify |
| `supabase/migrations/0002_catalog.sql` | Base schema + indexes | Source of columns to filter/sort/index | Reference |
| `supabase/migrations/0005_rls_policies.sql` | `products_public` view + grants | The RPC must honor these exactly | Reference |
| `src/components/ui/` | shadcn/ui (only `button.tsx`) | Install `input/checkbox/select/sheet/slider/badge/label` | Create |

### Data Flow

**Filtered/searched request (dynamic):**

1. User submits the header search box (`<form method="get">` → `/sillas?q=…`) or toggles a
   filter/sort control (client updates the URL via next-intl `useRouter`, preserving other
   params).
2. `sillas/page.tsx` (server) reads `searchParams` → `parseCatalogFilters(searchParams)`
   (`search-params.ts`) → a validated typed `CatalogFilters` (unknown values dropped, `q`
   truncated, price sanitized).
3. In parallel: `searchProducts(filters)` (`search.ts`) and the facet-list reads
   (`listBrands`/`listCategories`/`listStyles`, already cached under `catalog`).
4. `searchProducts` calls `supabase.rpc('search_products', <params>)` on the cookie-free
   `createPublicClient()`. Postgres runs the `SECURITY INVOKER` function as `anon`: filters
   `products_public` (+ `product_variants`, `product_categories`) → computes `effective_stock`
   and `total_count = COUNT(*) OVER ()` → applies `ORDER BY` + `LIMIT 12 OFFSET (page-1)*12`.
5. JS maps RPC rows → `CatalogProductCard[]` (no second variant batch needed — the RPC already
   returned `effective_stock` + `distinct_color_count`) and computes `lastPage`/clamped `page`.
6. If `total === 0` → render `<NoResults>` + a separate `listPopularProducts(8)` read;
   else render `ProductGrid` + `Pagination` (page links carry the filter query string).
7. Any read error → `fail()` throws → `[locale]/error.tsx` boundary renders the localized panel.

**Unfiltered `/sillas` (no params):** stays on the existing cached/static `listProducts` path
(fast default catalog) — AC-10.

### Similar Features (Reference Implementations)

- **`listProductsByBrand` / `listProductsByCategory`** (`queries.ts:352-488`) — the closest
  reference: a filtered listing that clamps + paginates. `listProductsByCategory` even shows the
  pain point (it must first read `product_categories` member ids into a bounded `.in()` list
  because it can't filter through the view). T5's RPC does the category join **inside** SQL,
  eliminating that JS round trip. Key patterns to follow: count/clamp, tag-based cache,
  `CatalogPage<CatalogProductCard>` return type.
- **`getProduct` slug guarding** (`product-detail.ts:127-140`) — validate-before-cache is the
  template for validating filter params before they reach the RPC or a cache key.
- **`Pagination` + `makeHrefForPage`** — the crawlable-link pattern T5 extends to carry filters.

## Dependency Analysis

### Existing Dependencies to Leverage

- `@supabase/supabase-js` `^2.110.2` — `.rpc()` for the new query path; `createPublicClient()`
  already configured (no session, publishable key, RLS-enforced).
- `radix-ui` `^1.6.0` + `class-variance-authority` + `tailwind-merge` (`cn()`) — back the
  shadcn/ui `Select`, `Sheet` (Dialog), `Checkbox`, `Slider` primitives.
- `next-intl` `^4.13.2` — `Link`/`useRouter`/`usePathname` from `src/i18n/navigation.ts` for
  locale-aware URL updates; `useTranslations`/`getTranslations` for the new namespace.
- `@hugeicons/react` + `@hugeicons/core-free-icons` — search/filter/close/swatch icons (never
  mix icon sets — CLAUDE.md).
- `next` `16.2.9` `unstable_cache` / `revalidateTag` — for the bounded filter-only cache
  (Constraint 3).

### New Dependencies Needed

- **None (npm).** shadcn/ui components are generated source files, not runtime deps.
- **Postgres extensions** `unaccent` + `pg_trgm` — added by `0007_search.sql`. **Verified live:**
  `create extension if not exists unaccent;` and `… pg_trgm;` both succeed on
  `supabase_db_posturpro` (they ship with the Supabase Postgres image). Currently installed
  extensions there: `pg_net, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp`
  — neither search extension is enabled yet.

### Internal Dependencies

- `search.ts` depends on `read-primitives.ts` (must land first — Constraint 2) and on
  `stock.ts`/`types.ts`/`config.ts`.
- `sillas/page.tsx` depends on `search.ts`, `search-params.ts`, the facet-list reads in
  `queries.ts`, and the new components. Implication: build order is migration → primitives
  refactor → search-params lib → search query module → components → page (see below).
- Pagination href change touches every listing page that renders `<Pagination>` — but the
  change is additive (an optional query-string carrier), so brand/category/style pages keep
  working with an empty carrier.

## External Research

### API Documentation

- **Supabase PostgREST RPC** (`supabase.rpc('fn', params)`): calls a Postgres function over
  PostgREST. Named params map to function args. A function returning `SETOF`/`TABLE` returns an
  array. Grant model: the function must be `EXECUTE`-granted to the `anon` role; because we set
  `SECURITY INVOKER`, RLS on the underlying tables still applies (that's what keeps
  `cost_price_cents`/base `products` unreachable). Gotcha: PostgREST caches the schema; after
  the migration, a schema reload (`NOTIFY pgrst, 'reload schema'` / restart) may be needed
  locally before `.rpc()` resolves — `supabase db reset` handles this.
- **`unaccent(text)`**: strips diacritics (`Café` → `Cafe`). Used on both column and query term:
  `unaccent(lower(col)) LIKE '%' || unaccent(lower($q)) || '%'`. **Verified live** as an anon
  `SECURITY INVOKER` function: `search('ergonomica')` returned the five `Ergonómica` products.
  Note `unaccent` is `STABLE`, not `IMMUTABLE`, so a functional index on `unaccent(...)` needs an
  `IMMUTABLE` wrapper — but with `pg_trgm` GIN we don't need the functional index (see below).

### Library Documentation

- **`pg_trgm` GIN index**: `CREATE INDEX … USING gin (name gin_trgm_ops)` makes
  `ILIKE '%term%'` index-assisted (otherwise a sequential scan). At 30 rows it's irrelevant, but
  the index is cheap insurance for catalog growth and is the mitigation that lets us NOT cache
  free-text search (Constraint 3). For accent-insensitivity combined with trigram, either index
  `unaccent(name)` (needs an IMMUTABLE wrapper) or accept that `unaccent()` in the predicate
  can't use a plain-column trigram index — at Phase-1 scale the planner will seq-scan 30 rows
  regardless, so keep the RPC correct first and treat the index as forward-looking. Document this
  trade-off in the migration.
- **shadcn/ui** (`shadcn` `^4.13.0` present): `npx shadcn add input checkbox select sheet slider
  badge label`. `Sheet` = Radix Dialog styled as a drawer (use for the mobile filter panel).
  `Select` = Radix Select (sort control). Apply the emil-design-eng motion rules to the generated
  CSS (drawer curve, `ease-out`, reduced-motion, trigger-anchored origin for the Select).

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| RPC accidentally exposes base `products` / `cost_price_cents` | Low | **High** | `SECURITY INVOKER` + read only `products_public`; test as `anon` proves base table stays `permission denied` (AC-2). Verified live. |
| Free-text search caching → unbounded cache-key DoS (repeat of T3 finding) | Med | High | Do NOT cache when `q` present (Constraint 3); cap `q` at `SEARCH_QUERY_MAX`; bounded canonical key for filter-only cache |
| SQL injection via filter params | Low | High | RPC is fully parameterized (`.rpc(name, {…})`); zero string interpolation; unknown values dropped pre-call |
| Availability computed in SQL diverges from `effectiveStock()` in JS | Med | Med | Single SQL expression `COALESCE(SUM(variant.stock), product.stock)`; a parity test asserts RPC `effective_stock` == `effectiveStock()` across the seed set (AC-6) |
| Shared-primitive refactor breaks the 660-suite | Med | Med | Behavior-preserving extraction; run full suite before/after; no assertion changes allowed (Constraint 2) |
| PostgREST schema cache doesn't see the new RPC | Med | Low | `supabase db reset` + schema reload; document in dev-done |
| Faceted URLs get indexed → SEO dilution / crawl budget waste | Med | Med | `noindex, follow` on filtered/searched pages; canonical → clean `/sillas` (AC-11) |
| Sort by `sales_count` looks random pre-T7 | Med | Low | Deterministic tiebreak; seed has non-zero counts (Constraint 4); documented |
| Pagination loses filters across page clicks | Med | Med | Href builder carries the full query string; e2e test clicks page 2 with filters active (AC-15) |
| `unaccent` in predicate can't use a plain trigram index | Low | Low | Acceptable at seed scale (30 rows seq-scan); documented; revisit with an IMMUTABLE-wrapped functional index if the catalog grows |

### Performance Considerations

- **Single round trip vs. the old two-query pattern.** The RPC returns page rows + `total_count`
  + `effective_stock` + `distinct_color_count` in one call — fewer round trips than T3's
  count-then-read-then-two-child-batches. This is a net win for filtered reads.
- **Correlated subqueries** (`SUM(variant.stock)`, `EXISTS(color)`) are trivial at 30
  products/69 variants (verified fast live). Add the btree indexes now so growth is covered.
- **Default catalog stays cached/static** (AC-10) — the common unfiltered `/sillas` hit does not
  pay the dynamic RPC cost.

### Security Considerations

- **Anon trust boundary** — the whole point of the RPC design. `SECURITY INVOKER` means RLS
  still gates every underlying table; base `products` remains ungranted; the view omits
  `cost_price_cents`. Verified live: RPC works as anon, base table read still denied.
- **Input hostility** — every param is treated as hostile: dropped if not a known id/enum,
  truncated if free text, parameterized at the DB. No param can inject, and no single bad param
  can empty or error the catalog (edge cases 3–4).
- **No new secret surface** — publishable (anon) key only; no `service_role`; the RPC is
  read-only.
- **Grant hygiene** — `revoke execute … from public` then explicit grant to `anon` +
  `authenticated` mirrors the `products_public` grant discipline in `0005`.

## Implementation Recommendations

### Suggested Order of Implementation

1. **`read-primitives.ts` refactor** (Constraint 2) — extract `fail`/`firstOrSelf`/`cachedRead`,
   repoint `queries.ts` + `product-detail.ts`, run the full suite green. Do this **first** so T5
   doesn't mint a third copy and the diff stays reviewable.
2. **`0007_search.sql` migration** — extensions, `search_products` RPC, indexes, grants. Verify
   with `supabase db reset` and an `anon`-role SQL test (AC-1, AC-2).
3. **`search.types.ts` + `search-params.ts`** — the typed filter model and pure parse/serialize
   with canonicalization; unit-test it exhaustively (this absorbs edge cases 3, 4, 7).
4. **`search.ts`** — `searchProducts` + `listPopularProducts`, wired to the RPC, with the
   caching decision; add the RPC-vs-`effectiveStock` parity test (AC-6).
5. **shadcn/ui install** — `input checkbox select sheet slider badge label`; apply motion rules.
6. **Presentational components** — `search-box`, `filter-panel`, `filter-sheet`, `sort-select`,
   `active-filters`, `color-swatch`, `no-results`.
7. **`sillas/page.tsx` rewrite** + pagination href change + header search box + i18n keys.
8. **Tests** — unit (parse lib, RPC parity), integration (RPC as anon), e2e (search → filter →
   sort → paginate → no-results → clear).

### Key Decisions

- **DB path: `supabase.rpc('search_products')`, `SECURITY INVOKER`, over `products_public`.**
  Chosen because it filters + computes availability + counts + paginates server-side while
  provably keeping anon off the base table (verified). Alternatives (PostgREST embedded filters,
  materialized view, JS-side filter) rejected in the ticket's Constraint 1.
- **RPC returns `total_count` via `COUNT(*) OVER ()`** so one call yields page + filtered total
  (replaces T3's separate head-count query for the filtered path).
- **Search enhances `/sillas`; no `/buscar` route** — one canonical discovery surface, simpler
  SEO story, reuses grid/pagination/breadcrumb.
- **`noindex, follow` + canonical → clean `/sillas`** for faceted pages — prevents indexing
  infinite facet combinations without hiding products from crawlers.
- **Don't cache free-text; bounded-key cache for filter-only** (Constraint 3).
- **Best-selling = `sales_count DESC` + deterministic tiebreak; popular strip uses the same
  ordering** (Constraint 4).
- **Availability defaults to in-stock**, opt-in to include out-of-stock (AC-5, spec).
- **Param names single-sourced** in `config.ts` (Spanish: `q`, `categoria`, `marca`, `estilo`,
  `color`, `material`, `precioMin`, `precioMax`, `disponibilidad`, `orden`, plus existing
  `page`) so pages, links, and the parse lib never drift.

### Anti-Patterns to Avoid

- **Don't** re-copy `fail`/`firstOrSelf` into `search.ts` — import from `read-primitives.ts`
  (Constraint 2).
- **Don't** filter by color/availability in JS after fetching a page — that's the exact T3
  limitation T5 exists to fix; do it in the RPC.
- **Don't** `unstable_cache` free-text results — unbounded key cardinality (T3 HIGH finding).
- **Don't** interpolate any filter value into SQL — always pass as an RPC parameter.
- **Don't** grant the RPC to `public`; grant to `anon` + `authenticated` only, after
  `revoke … from public`.
- **Don't** hand-roll `Select`/`Sheet`/`Checkbox` — install shadcn/ui (CLAUDE.md).
- **Don't** animate with `transition: all` or `ease-in`, or animate layout properties; respect
  `prefers-reduced-motion` (emil-design-eng / AC-18).
- **Don't** let a filtered page silently fall back to the whole catalog on a bad param without
  dropping just that param — drop the invalid value, keep the valid filters, and for
  zero-matches show `NoResults`, not the full grid.
- **Don't** make the default unfiltered `/sillas` dynamic — keep it on the cached/static path
  (AC-10).
