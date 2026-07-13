# Task: T5 — Search, Filters & Sorting

## Priority

**High** — Search/filter/sort is the primary product-discovery surface of a 30+ SKU
(soon-larger) multi-brand catalog. Without it, shoppers can only browse by taxonomy
(brand/category/style) — there is no way to combine constraints ("mesh office chair
under MX$4,000, in stock, black") or to keyword-search. It is explicitly Phase 1 scope
(PRODUCT_SPEC "Search & filtering") and the last catalog-discovery task before Cart (T6).
Not Critical because the store is already browsable and the sellable path (cart/checkout)
does not structurally depend on it.

## Complexity

**high** — reclassified UP from the `standard` tier recommendation in BUILD_PLAN.

Justification against the CLAUDE.md criteria:

- **New subsystem, not a pattern copy.** The existing T3 read path (view + batched `.in()`
  children stitched in JS) **structurally cannot** filter by variant color or compute
  availability before pagination (binding T3 arch-review finding). T5 must introduce a
  brand-new **database-side filtered query path** (a SQL function invoked via
  `supabase.rpc()`) plus a **new migration** (extensions, indexes, the RPC) — an
  architectural change to how the catalog is read, not an incremental UI add.
- **New anon-reachable query surface with security implications** needing the same RLS/grant
  discipline as `products_public` (verified below).
- **15+ files touched:** 1 migration, 1 new query module, a shared-read-primitive refactor
  across 2 existing files, a new filter-URL parse lib, 6+ new shadcn/ui components, 6+ new
  feature components, the `/sillas` rewrite, a header search box, seed/test updates, two i18n
  dictionaries.
- **Cross-cutting concerns:** cache-key cardinality (unbounded user input), SEO
  canonical/noindex for faceted URLs, and diacritic-insensitive Spanish search all require
  explicit reasoning.

Per the `/full-cycle` rule, `high` runs **all 12 stages** (including the hacker stage).

## Feature Type

**full-feature** — new UI (search box, filter panel, sort control, mobile filter sheet,
no-results page) AND new logic (DB-side RPC query path, filter-URL state parsing, shared
read-primitive refactor). All pipeline stages run at full depth.

## User Story

As a **shopper on a mobile phone in Mexico**, I want to **search chairs by keyword and narrow
the catalog by category, brand, style, price, color, material, and availability, then sort
the results**, so that **I can quickly find a chair that fits my needs without paging through
the whole catalog** — and when nothing matches, I want a **friendly page that points me at
popular chairs** instead of a dead end.

## Background

**What exists today (T1–T4, all SHIPPED):**

- A catalog read layer (`src/lib/catalog/queries.ts`) reading the `products_public` VIEW
  (anon-safe; omits `cost_price_cents`; `status = 'active'` only) with `brands` embedded, then
  **batch-fetching images + variants via `.in(product_id, ids)` and stitching in JS**.
  Pagination is a count-only head query → clamp `?page` → one `.range()` read.
- `/sillas`, `/marcas/[slug]`, `/categorias/[slug]`, `/estilos/[slug]` — all static/ISR, all
  using `PaginatedProductListing` + `ProductGrid` + crawlable `?page=N` (`PRODUCTS_PER_PAGE =
  12`, page-1 canonical via `makeHrefForPage`).
- Stock rules: `effectiveStock` (sum of variant stock, else product stock),
  `LOW_STOCK_THRESHOLD = 5`, `StockBadge` (`in`/`low`/`out`).
- `ProductCard` consuming `CatalogProductCard`; `Breadcrumbs`; i18n `catalog` namespace.
- The header (`site-header.tsx`) has **no search box**. `radix-ui` is installed but the only
  shadcn/ui component present is `button.tsx`.

**What's missing (the T5 gap):**

The T3/T4 read pattern fetches variants **after** the page is chosen, so it physically cannot
(a) keyword-search, (b) filter by variant **color**, (c) filter by **availability**
(effective stock is only known after the variant batch), or (d) filter by **price/material**
and paginate the **filtered** total. All four require the DB to filter **before** pagination.
There is also no sort control (results are hard-coded to best-seller → sales → name).

**Why this matters:** discovery is the top of the purchase funnel — the last Phase-1
catalog-discovery feature before Cart (T6) and Checkout (T7).

## Binding Architectural Constraints (from prior arch reviews — addressed head-on)

### Constraint 1 — DB-side filtered query is REQUIRED (verified live against local Supabase)

**Decision: a SQL function invoked via `supabase.rpc()`, `SECURITY INVOKER`, reading only
`products_public` + `product_variants` + `product_categories`.** Proven against the seeded
local DB:

- A correlated query over `products_public pp` with `EXISTS (SELECT 1 FROM product_variants v
  WHERE v.product_id = pp.id AND v.color_hex = ANY(...))`, a `COALESCE(SUM(variant.stock),
  pp.stock)` availability computation, `price_cents BETWEEN`, an `ORDER BY`, and `LIMIT/OFFSET`
  **returns correct results server-side, pre-pagination**.
- Run as `SECURITY INVOKER`, granted `EXECUTE` to `anon`, the function returns rows — **and
  anon still gets `permission denied for table products`** when touching the base table. So
  the RPC reads through the same anon-safe surface as `products_public`; it **cannot** reach
  `cost_price_cents` (the view omits it AND the base table is ungranted — belt & suspenders).
- **Why RPC over a plain view:** the filter needs bind parameters (search text, color array,
  price range, material array, sort key, limit/offset) and must return **both the page rows
  and the exact filtered `total`** in one round trip (window `COUNT(*) OVER ()`). A
  parameter-less view can't take filters; PostgREST client filters can't filter the parent by
  a child aggregate (availability) nor by an inner-joined variant color, and can't return a
  filtered count cleanly.
- **Rejected:** (a) PostgREST embedded filters — can't do availability aggregate / color
  inner-join / filtered count. (b) Materialized filterable view — refresh/staleness machinery
  for no benefit at this scale, still can't take runtime price/search params. (c)
  Fetch-all-then-filter-in-JS — violates the T3 arch ruling, doesn't scale.

**The RPC contract** (`search_products`): returns `TABLE(<card columns>, effective_stock int,
distinct_color_count int, total_count bigint)` where `total_count = COUNT(*) OVER ()` over the
filtered set (page rows + filtered total in one call). Card columns match the current
`PRODUCT_CARD_SELECT` (`id, slug, name, price_cents, compare_at_price_cents, stock`, brand
name/slug/logo). Availability is `COALESCE((SELECT SUM(v.stock) FROM product_variants v WHERE
v.product_id = pp.id), pp.stock)` — matching `effectiveStock()` exactly (AC-6). `in-stock`
filter = `effective_stock > 0`. Category = join `product_categories`; brand/style =
`brand_id`/`style_id`; material = `unaccent`/`ILIKE` over the three `material_*` columns;
color = `EXISTS` over `product_variants.color_hex`.

### Constraint 2 — Extract shared read primitives FIRST (pre-step; keeps 660-suite green)

`fail()`, `firstOrSelf()`, and the `unstable_cache`-tag boilerplate are **duplicated** across
`queries.ts` and `product-detail.ts`. Before any T5 query code, extract them into
`src/lib/catalog/read-primitives.ts` (`fail(context, message)` → logs server-side + throws a
redacted error; generic `firstOrSelf<T>`; a `cachedRead(keyParts, tags, fn)` wrapper over
`unstable_cache` + `CATALOG_REVALIDATE_SECONDS`). Update both modules to import from it. This
is **behavior-preserving**: the existing characterization tests (`queries.test.ts`,
`product-detail.test.ts`, and the ~660-test suite) MUST stay green with no assertion changes —
that is the refactor's acceptance signal. T5's new module imports the same primitives instead
of minting a third copy.

### Constraint 3 — Cache-key cardinality discipline (bounded / mostly not cached)

Search text, filter combos, sort, and page are **user-controlled and unbounded**. Decision:

- **Free-text search results are NOT cached** (no `unstable_cache`). Free text has unbounded
  cardinality; caching it is the DoS vector T3 warned about. When `q` is present the RPC is
  called directly per request. The DB is protected by (a) a hard **search-text length cap**
  (`SEARCH_QUERY_MAX = 80`) enforced before the call, (b) `pg_trgm` GIN indexes so `ILIKE
  '%...%'` is index-assisted, and (c) the page always `LIMIT 12`.
- **Filter/sort-only results (no free text) MAY be cached**, but ONLY under a **canonicalized,
  bounded key**: filters parse into a fixed enum/id space (unknown brand/category/style/color/
  material values are dropped, not passed through), sort is one of a fixed set, price snaps to
  bounded buckets, page uses existing `canonicalPageKey` (`[1, MAX_PAGE]`). Any non-known
  id/enum is discarded so it can't mint a distinct cache entry. **If bounding is non-trivial,
  default to NOT caching** — correctness and DoS-safety beat a cache hit here.
- The RPC is parameterized (no string interpolation) → no SQL injection regardless of input.

### Constraint 4 — "Best-selling" sort semantics with zero real sales (defined now)

Orders/`order_items` exist (T1) but no order flow ships until T7, so `sales_count` is
seed-only today (all 30 seeded products have `sales_count > 0`). Decision: **best-selling
sorts by `sales_count DESC`, then deterministic tiebreak `is_best_seller DESC, name ASC, id
ASC`.** Stable and non-random today; becomes truthful automatically once T7 increments
`sales_count` on paid orders. Documented in the query module. "Popular chairs" on the
no-results page uses the **same ordering** (AC-16) so the two never diverge.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

**Query path & data correctness**

- [ ] AC-1: `supabase/migrations/0007_search.sql` adds `unaccent` + `pg_trgm`, the
  `search_products` RPC (`SECURITY INVOKER`, `EXECUTE` revoked from `public`, granted to
  `anon` + `authenticated`), and the missing indexes (see Data Model Changes). `supabase db
  reset` applies cleanly and the app reads through the RPC.
- [ ] AC-2: The RPC reads exclusively from `products_public` + `product_variants` +
  `product_categories`. A test **as the `anon` role** proves the RPC returns rows **and** that
  `SELECT ... FROM products` (base table) still raises `permission denied`. No response path
  ever includes `cost_price_cents`.
- [ ] AC-3: Keyword search matches across **name, brand name, and description** (PRODUCT_SPEC),
  case- **and** accent-insensitively — `"ergonomica"` matches `"Ergonómica"`, `"cafe"` matches
  `"Café"`. Empty/whitespace-only `q` returns the (filter-only) result set.
- [ ] AC-4: Filters work individually and **in combination**: category (M2M), brand, style,
  price range (min/max cents), color (variant `color_hex`, multi-select), material
  (multi-select over the three `material_*` columns), availability. Distinct facets AND
  together; multiple values inside one facet OR together.
- [ ] AC-5: Availability defaults to **in-stock only** (BUILD_PLAN + PRODUCT_SPEC). With no
  explicit availability param, only `effective_stock > 0` products appear. A shopper can opt to
  include out-of-stock via an explicit control.
- [ ] AC-6: RPC `effective_stock` equals `effectiveStock()` in `stock.ts` for every product
  (sum of variant stock when variants exist, else product stock). The three `StockState`
  badges render identically to T3.
- [ ] AC-7: Sorting supports all six spec options, each deterministic (stable tiebreak):
  `price_cents ASC`, `price_cents DESC`, `created_at DESC` (newest), best-selling (Constraint
  4), `name ASC`, `name DESC`. Default when unspecified = best-selling (matches current
  catalog default).
- [ ] AC-8: Pagination operates on the **filtered** set: `total` from `COUNT(*) OVER ()`,
  `lastPage = ceil(total/12)`, `?page` clamped to `[1, lastPage]` (never a PostgREST
  range-not-satisfiable error). Changing any filter/sort/search resets to page 1.

**URL state, SEO & rendering**

- [ ] AC-9: Search/filters/sort/page live in **shareable, crawlable query params** (e.g.
  `/sillas?q=malla&marca=herman&color=111111,6b7280&precioMin=..&orden=precio-asc&page=2`).
  Copying the URL reproduces the exact result set. Param names are single-sourced constants.
- [ ] AC-10: `/sillas` **enhances in place** (no separate `/buscar` route). It reads
  `searchParams`, so it is **dynamic for any filtered/searched request**; the unfiltered
  `/sillas` (no params) still renders from the static/ISR path (or an equivalent cached read)
  so the default catalog stays fast. Rendering mode documented in the page.
- [ ] AC-11: SEO: the canonical `<link>` for any filtered/searched/paged request points at the
  clean unfiltered `/sillas` (or the page-N canonical for pagination only), and
  filtered/searched result pages are **`noindex, follow`** (avoid indexing infinite facet
  combos, still let crawlers follow product links). Unfiltered `/sillas` + its `?page=N` pages
  remain indexable exactly as T3 shipped.
- [ ] AC-12: A header **search box** is added (in `site-header.tsx`): submits to
  `/sillas?q=...`, keyboard-accessible, locale-aware (next-intl `Link`/`useRouter`), works with
  JS disabled (native `<form method="get">`).

**UI states & behavior**

- [ ] AC-13: `/sillas` renders a **filter panel** (sidebar at `≥lg`, inside a `Sheet` drawer
  on mobile/tablet) with category (from `listCategories`), brand (`listBrands`), style
  (`listStyles`), color (distinct variant colors as swatches), material (distinct materials),
  price range, availability toggle, and a sort control. Facet options come from real DB values,
  not hard-coded.
- [ ] AC-14: **Active filters** show as removable chips above the grid plus a "Clear all"
  action; removing a chip updates the URL and re-queries. A result count ("N sillas") reflects
  the filtered total.
- [ ] AC-15: A filtered/searched request matching **≥1 product** renders the normal
  `ProductGrid` + crawlable pagination, with the current filters preserved across page links.
- [ ] AC-16: A request matching **0 products** renders a friendly **no-results state** (not a
  404, not the generic `EmptyState`): states nothing matched (echoing the query), offers "Clear
  filters", and shows a **"Popular chairs" strip** of up to 8 products in the best-selling
  ordering from Constraint 4 (independent of active filters).
- [ ] AC-17: Every new UI string exists in **both** `es-MX.json` and `en.json` under
  `catalog.search` / `catalog.filters` / `catalog.sort` / `catalog.noResults`; the
  `keys-used`/`messages` tests pass. No hard-coded user-facing text.
- [ ] AC-18: Motion follows the design skills: mobile filter `Sheet` uses the drawer curve
  (`cubic-bezier(0.32, 0.72, 0, 1)`, ~300ms, `ease-out` on enter); color-swatch/checkbox press
  feedback is instant; the sort `Select` opens `ease-out` <250ms with trigger-anchored
  `transform-origin`; **all motion respects `prefers-reduced-motion`** (opacity only). No
  `transition: all`; only `transform`/`opacity` animate.

## Edge Cases

1. **Contradictory filters yield zero rows** (brand A + a color brand A doesn't stock): render
   the AC-16 no-results state, NOT an error, NOT a 404. URL stays valid/shareable.
2. **`?page=99999` on a 2-page filtered result:** clamp to the filtered `lastPage`; render it.
   Never emit a 416 (count-first-then-clamp against `total_count`, per T3).
3. **Junk/hostile params:** `?orden=DROP%20TABLE`, `?color=<script>`, `?precioMin=-999`,
   `?precioMax=abc`, `?marca=` (empty), `?marca=nonexistent`, repeated params, a 10KB `q`.
   Each parsed defensively: unknown sort → default; non-numeric/negative price → dropped bound;
   unknown brand/category/style/color/material → dropped (never sent to the RPC); `q` truncated
   to `SEARCH_QUERY_MAX`. RPC is parameterized → no injection. No 500s; a single bad param
   never empties the catalog (bad params dropped, remaining valid filters apply).
4. **Price min > max** (`precioMin=500000&precioMax=100000`): **drop the inverted bound pair**
   (ignore both) so the shopper sees results, with a subtle "rango de precio ignorado" note.
   Documented in the parse lib.
5. **Product with NO variants** (color facet): excluded when a color filter is active
   (no `color_hex`); included (availability from `products.stock`) when no color filter.
   Verify a variant-less active product behaves this way.
6. **All variants out of stock but `products.stock > 0`:** effective stock = sum of variant
   stock = 0 (variants authoritative when present) → **out of stock**, hidden under the default
   in-stock filter — consistent with `stock.ts`.
7. **Accent/diacritic & case:** `"OFICINA"`, `"oficína"`, `"oficina"` all match `"Oficina"`
   (confirm `unaccent(lower(...))` on both column and query term).
8. **Empty catalog / popular strip also empty:** if even the popular-chairs query returns
   nothing, the no-results page still renders its message + "Clear filters" CTA without crashing
   (empty strip, no broken layout).
9. **RPC/DB read failure** (network, RLS misconfig, migration not applied): query layer throws
   the redacted `fail()` error; `[locale]/error.tsx` renders the localized panel — never a raw
   stack or partial grid.
10. **Facet lists fail to load** (`listBrands` throws): page-level boundary handles it; the
    filter panel never renders half-populated with a silently-empty facet that looks like "no
    brands exist".
11. **JS disabled:** header search `<form method="get">` and the filter `<form>` submit natively
    to `/sillas?...`; results render server-side; chips degrade to plain links. SSR-first.
12. **Very long active-filter set on mobile (375px):** the chip row wraps / scrolls
    horizontally without breaking layout or pushing the grid off-screen.

## Error States Table

| Trigger | User Sees | System Does |
| --- | --- | --- |
| RPC/DB read throws (network, RLS, migration missing) | Localized full-page error panel (`[locale]/error.tsx`) | `fail()` logs full detail server-side; throws redacted `Error`; route boundary catches |
| Facet-list read (`listBrands`/`listCategories`/`listStyles`) throws | Same localized error panel | Same `fail()` contract; page never renders a half-populated filter panel |
| Zero products match | No-results state: "No encontramos sillas…" + echoed query + "Limpiar filtros" + popular strip | RPC returns `total_count = 0`; page renders `NoResults`, runs a separate popular read |
| `?page` beyond filtered last page | The clamped (real last) page renders | Count-first (`COUNT(*) OVER ()`), clamp to `[1, lastPage]` before slicing — never a 416 |
| Malformed/hostile param | Results for the valid remaining filters (or unfiltered if all invalid) | Parse lib drops unknown/invalid values pre-RPC; `q` truncated; RPC parameterized (no injection) |
| Inverted price range (min > max) | Results with price constraint ignored + subtle "rango de precio ignorado" note | Parse lib discards both bounds |
| Popular-chairs read also fails on no-results page | No-results message + CTA still render; strip omitted | Popular read wrapped so its failure degrades gracefully (logged, not fatal) |

## UX Requirements

- **Loading**: while the filtered grid streams (Suspense around the grid), show a **skeleton
  grid of `PRODUCTS_PER_PAGE` card skeletons** at the real card aspect ratio (reuse/extend T3's
  skeleton). Filter panel + header render immediately. No full-page spinner.
- **Empty (no results)**: the AC-16 state — heading ("No encontramos sillas que coincidan"),
  the echoed search/active filters, a prominent **"Limpiar filtros"** button (→ clean `/sillas`),
  and a **"Sillas populares"** strip below. Never a bare "0 results".
- **Error**: the existing localized `[locale]/error.tsx` panel with retry — never a raw error,
  never a partially-rendered grid.
- **Success**: the filtered `ProductGrid`, a result count ("24 sillas"), active-filter chips,
  and crawlable pagination that **preserves active filters** in every page link.
- **Mobile (375px)**: filters behind a **"Filtros" button** opening a full-height `Sheet` with
  an "Aplicar" / result-count footer; sort is a compact `Select` in the toolbar; chips wrap /
  scroll horizontally; header search collapses to an icon expanding to a full-width input; grid
  is 2 columns.
- **Tablet (768px)**: filters still behind the `Sheet` button (sidebar only at `lg`); grid 3
  columns; sort `Select` + result count in a toolbar row above the grid.
- **Desktop (≥1024px)**: persistent **left filter sidebar**, grid (4 columns) on the right;
  sort `Select` + result count in the top toolbar; active-filter chips above the grid.
- **Reduced motion**: `prefers-reduced-motion` disables the Sheet slide and all transform-based
  motion, keeping only short opacity fades (AC-18).

## Technical Approach

### Files to Create

- `supabase/migrations/0007_search.sql` — `create extension unaccent`, `create extension
  pg_trgm`; the `search_products(...)` RPC (`SECURITY INVOKER`; `revoke execute … from public`;
  `grant execute` to `anon` + `authenticated`); indexes: `pg_trgm` GIN on `products.name`,
  `products.description`, `brands.name`; btree on `products (price_cents)`, `products
  (created_at)`, `products (sales_count)`, `product_variants (color_hex)`.
- `src/lib/catalog/read-primitives.ts` — extracted `fail()`, `firstOrSelf<T>()`, `cachedRead()`
  wrapper (Constraint 2).
- `src/lib/catalog/search.ts` — `searchProducts(filters): Promise<CatalogPage<CatalogProductCard>>`
  calling `supabase.rpc('search_products', …)`; `listPopularProducts(limit)` for the no-results
  strip; caching decision from Constraint 3. Imports `read-primitives`.
- `src/lib/catalog/search-params.ts` — pure, unit-testable parse/serialize of filter URL state
  ↔ typed `CatalogFilters`; canonicalization + validation (drop unknown/hostile, truncate `q`,
  handle inverted price; single-sources param-name constants + `SEARCH_QUERY_MAX`).
- `src/lib/catalog/search.types.ts` — `CatalogFilters`, `SortKey`, `FacetOptions`.
- `src/components/catalog/search-box.tsx` — header/toolbar search input (`<form method="get">`).
- `src/components/catalog/filter-panel.tsx` — facet controls (desktop sidebar body, reused in
  the mobile Sheet).
- `src/components/catalog/filter-sheet.tsx` — mobile/tablet `Sheet` wrapper (`"use client"`).
- `src/components/catalog/sort-select.tsx` — sort `Select` (`"use client"`; updates URL).
- `src/components/catalog/active-filters.tsx` — removable chips + "Clear all".
- `src/components/catalog/no-results.tsx` — no-results state + popular strip.
- `src/components/catalog/color-swatch.tsx` — accessible color swatch button.
- shadcn/ui: `src/components/ui/{input,checkbox,select,sheet,slider,badge,label}.tsx`
  (install via `npx shadcn add` — do NOT hand-roll; CLAUDE.md "shadcn/ui first").

### Files to Modify

- `src/app/[locale]/sillas/page.tsx` — read all filter/sort/search `searchParams`; call
  `searchProducts`; render toolbar (search + sort + count), filter sidebar/sheet, active-filter
  chips, grid, pagination, or `NoResults`; set canonical/`noindex` per AC-11; document rendering
  mode (dynamic when params present).
- `src/lib/catalog/queries.ts` — import `fail`/`firstOrSelf`/cache wrapper from
  `read-primitives.ts` (delete local copies); share `PRODUCT_CARD_SELECT`/card mapping if
  `search.ts` can reuse it (keep the stitched-card view model identical so `ProductCard` is
  unchanged).
- `src/lib/catalog/product-detail.ts` — import `fail`/`firstOrSelf` from `read-primitives.ts`.
- `src/components/layout/site-header.tsx` — add the search box (AC-12), responsive collapse.
- `src/lib/config.ts` — add `SEARCH_QUERY_MAX`, `POPULAR_PRODUCTS_MAX` (8), price-bucket bounds,
  the search/filter param-name constants, and the `/sillas` sort default.
- `src/components/catalog/pagination.tsx` / `page-helpers.ts` — make the href builder carry the
  current query string (filters/sort/search) so page links preserve state (AC-15); keep
  page-1-canonical.
- `src/messages/es-MX.json` + `src/messages/en.json` — add the new keys.

### Data Model Changes

- **No table/column changes.** `0007_search.sql` adds two extensions, one RPC
  (`search_products`), and seven indexes (three `pg_trgm` GIN for search; four btree for
  price/created_at/sales_count/color). Grants: `execute` on the RPC to `anon` + `authenticated`
  only (revoke from `public` first). Verified installable + anon-safe on the local seeded DB.

### API Endpoints

- **No new HTTP endpoints.** Access is via the Supabase RPC `search_products`, called
  server-side from `src/lib/catalog/search.ts` using the existing cookie-free
  `createPublicClient()`. Request = the RPC's typed parameters; response = card rows +
  `total_count`.

### Dependencies

- **No new npm packages.** `radix-ui` (installed) backs the shadcn/ui `Select`/`Sheet`/
  `Checkbox`/`Slider` primitives; `@hugeicons/react` (installed) supplies filter/search/close
  icons; `next-intl` (installed) supplies locale-aware navigation. shadcn/ui components are
  generated into `src/components/ui/`, not added as runtime deps.
- **DB extensions** `unaccent`, `pg_trgm` — bundled with the Supabase Postgres image (confirmed
  installable on local Docker Supabase). No external service.

## Out of Scope

- **Search autocomplete / type-ahead** — Phase 2 ("Storefront: … search autocomplete"). T5 is
  submit-based search only.
- **Related products** — Phase 2.
- Any **cart/checkout** behavior (T6/T7) — the card links to the PDP exactly as today.
- **Admin product search/filter** (T11) — separate surface; do not build against it.
- **Saved filter presets, filter analytics, per-option faceted result counts ("(23)")** — not
  Phase 1; keep facets as plain options.
- **A dedicated `/buscar` route** — rejected in AC-10; search enhances `/sillas`.
- **Tags as a filter facet** — the Phase-1 filter list is category, brand, style, price, color,
  material, availability. Tags are not listed; do not add a tag facet.
- **Changing `products_public` or the base schema** beyond the additive `0007_search.sql`.
