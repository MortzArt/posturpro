# Dev Summary: T5 — Search, Filters & Sorting

## Rendering Mode

`/[locale]/sillas` is now **`ƒ` (Dynamic)** — it reads `searchParams` at the
page level (to parse filters, set canonical/robots metadata, build chips), which
opts the route into on-demand rendering. AC-10 is still satisfied: the UNFILTERED
`/sillas` serves entirely from **cached reads** (facet lists + the popular/search
reads are `unstable_cache`d under the `catalog` tag), so the default catalog
stays fast ("or an equivalent cached read"). The filtered grid read is isolated
in `<Suspense>` so the shell/toolbar/chips render immediately.

**Index pages untouched:** `/marcas`, `/estilos`, `/categorias`, and
`/producto/[slug]` remain `● (SSG)` in the build output — no change to their
SSG/ISR posture.

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `supabase/migrations/0007_search.sql` | created | `unaccent`+`pg_trgm`; `search_products` RPC (SECURITY INVOKER, revoke-from-public + grant anon/authenticated); 3 GIN trgm + 4 btree indexes |
| `src/lib/catalog/read-primitives.ts` | created | Extracted `fail`/`firstOrSelf`/`cachedRead` (Constraint 2) |
| `src/lib/catalog/search.types.ts` | created | `CatalogFilters`, `SortKey`, `FacetOption`, `ColorFacetOption`, `FacetOptions` |
| `src/lib/catalog/search-params.ts` | created | Pure parse/serialize + canonicalization (drop unknowns, cap `q`, invert-price, sort) |
| `src/lib/catalog/search-params.test.ts` | created | 17 unit tests for edges 3/4/7 + round-trip |
| `src/lib/catalog/search.ts` | created | `searchProducts` + `listPopularProducts` via the RPC; caching per Constraint 3 |
| `src/lib/catalog/facets.ts` | created | Color/material/price facet reads + `loadFacetOptions` composer + known-sets/label lookups |
| `src/lib/catalog/active-filter-chips.ts` | created | Pure builder for removable-chip view models |
| `src/components/catalog/search-box.tsx` | created | Header (collapsing) + toolbar search `<form method=get>` |
| `src/components/catalog/sort-select.tsx` | created | shadcn Select; pushes `orden`, resets page |
| `src/components/catalog/color-swatch.tsx` | created | Multi-select checkbox-semantics swatches (`.swatch-press`) |
| `src/components/catalog/filter-controls.tsx` | created | Facet checkbox group, availability toggle, price range, clear button |
| `src/components/catalog/filter-panel.tsx` | created | One panel (sidebar + sheet); native `<form>` + live client toggles |
| `src/components/catalog/filter-sheet.tsx` | created | Mobile drawer on Radix Dialog + `.drawer-panel`/`.drawer-scrim` (M-1) |
| `src/components/catalog/filter-navigation.tsx` | created | Client context: shared `useTransition` + serialize/apply |
| `src/components/catalog/active-filters.tsx` | created | Removable chips + clear-all (real `<a>`) |
| `src/components/catalog/no-results.tsx` | created | No-results state + popular strip via `ProductGrid` |
| `src/components/catalog/catalog-toolbar.tsx` | created | Search echo + filter-sheet trigger + sort composer |
| `src/components/catalog/catalog-grid-region.tsx` | created | Pending-dim wrapper (M-7) |
| `src/components/catalog/catalog-shell.tsx` | created | Client shell wrapping toolbar + sidebar + grid region in the provider |
| `src/components/catalog/search-results.tsx` | created | Suspense child: RPC read → grid+pagination or NoResults + aria-live count |
| `src/components/ui/{input,checkbox,select,slider,badge,label}.tsx` | created | shadcn (no new npm deps; Select motion retrofitted) |
| `src/app/[locale]/sillas/page.tsx` | modified | Rewrite: parse filters, load facets, chips, metadata, shell + Suspense |
| `src/lib/catalog/queries.ts` | modified | Import `fail`/`firstOrSelf` from read-primitives (deleted local copies) |
| `src/lib/catalog/product-detail.ts` | modified | Same import; deleted local `fail`/`firstOrSelf` |
| `src/lib/catalog/page-helpers.ts` | modified | `makeHrefForPage(basePath, query?)` — additive filter-query carrier (AC-15) |
| `src/components/layout/site-header.tsx` | modified | Added header search box (AC-12) |
| `src/lib/config.ts` | modified | `SEARCH_PARAM_KEYS`, `SORT_KEYS`, `DEFAULT_SORT`, `SEARCH_QUERY_MAX`, `POPULAR_PRODUCTS_MAX`, price-bucket constants |
| `src/lib/supabase/database.types.ts` | modified | Typed the `search_products` RPC (Args + Returns) |
| `src/app/globals.css` | modified | `.select-content-motion` (M-3), `.grid-pending`/`.grid-idle` (M-7), `.clear-fade` (M-6) |
| `src/messages/es-MX.json` + `en.json` | modified | `catalog.search/filters/sort/results/noResults` (ICU plurals) |
| `src/messages/keys-used.test.ts` | modified | Added all new consumed keys |

## Open-Question Resolutions (from ui-design.md)

1. **Sort JS-off fallback** → chose the spec's recommendation: the filter
   `<form>` carries a native `<select name="orden">` (the JS-off path); the
   toolbar `SortSelect` is the JS-on enhancement.
2. **Grid columns at `lg`** → kept `ProductGrid`'s existing `lg:grid-cols-4`; the
   16rem sidebar + `1fr` fits 4 cards acceptably at ≥1024px (verified no overflow
   in the responsive e2e). No `xl:` downgrade needed.
3. **Filter Sheet side** → `left`, reusing `.drawer-panel` for spatial
   consistency with MobileNav (spec recommendation).
4. **Mobile live-apply vs batch** → live-apply (desktop parity); the sheet footer
   button primarily closes the sheet. RPC is trivial at seed scale.
5. **Price display domain vs cache buckets** → accepted the two-layer approach:
   the RPC receives the EXACT price; the filter-only cache key uses a bucketed
   value (`PRICE_BUCKET_CENTS` = MX$100). Documented in `search.ts`.
6. **Price chip wording** → `chipPrice` for a full range, `chipPriceFrom`/
   `chipPriceTo` for open-ended bounds (both via `formatMXN`).

## Migration Details & How Applied

- `0007_search.sql`: `create extension if not exists unaccent/pg_trgm`; the
  `search_products(...)` RPC (`language sql stable security invoker set
  search_path = public`); `revoke all ... from public` + `grant execute ... to
  anon, authenticated`; 3 GIN trgm indexes (products.name, products.description,
  brands.name) + 4 btree (price_cents, created_at, sales_count, variants.color_hex).
- **Applied non-destructively** to the running local stack via
  `docker exec … psql < 0007_search.sql` (idempotent — `if not exists` / `create
  or replace`), then `NOTIFY pgrst, 'reload schema'`. Seed data (30 products / 69
  variants) survived intact. Reset-safe: a `supabase db reset` runs 0001→0007 and
  0007 is fully idempotent.
- **Verified as anon:** RPC returns rows; `SELECT ... FROM products` (base) still
  raises `permission denied`; `cost_price_cents` never appears in any response
  path or the rendered HTML (grep = 0).
- **AC-6 parity:** a SQL cross-check confirmed `effective_stock` from the RPC ==
  `COALESCE(SUM(variant.stock), product.stock)` for all 30 products (0 mismatches).

## Caching Decisions (as implemented — Constraint 3)

- Free-text search (`q` present) → **never cached** (`isCacheableFilters` false →
  direct RPC). `q` capped at `SEARCH_QUERY_MAX = 80` before the call.
- Filter/sort-only (no `q`) → cached under a **bounded canonical key**: known ids
  (sorted), closed sort set, price snapped to `PRICE_BUCKET_CENTS` buckets, page
  via `canonicalPageKey`. Facet lists + popular strip cached under `catalog`.

## Placeholder / Primitive Centralization

`fail()`, `firstOrSelf()`, and a `cachedRead()` wrapper now live once in
`read-primitives.ts`; `queries.ts`, `product-detail.ts`, `search.ts`, and
`facets.ts` all import them. No third/fourth copy. Behavior-preserving — the full
suite stayed green across the extraction (415 → 415 at that step).

## Edge Cases Handled

- **1 contradictory / 6 all-variants-OOS** → NoResults (not error/404).
- **2 `?page=99999`** → clamp to filtered `lastPage` (count-first in `readSearchPage`).
- **3 hostile params** → parse lib drops unknown ids/sort, caps `q`; RPC parameterized.
- **4 inverted price** → both bounds dropped + `priceRangeIgnored` note.
- **5 variant-less color filter** → RPC `EXISTS` over variants excludes them.
- **7 accent/case** → `unaccent(lower(...))` on column + term (verified `ergonomica`→Ergonómica).
- **8 empty popular** → `safePopular()` degrades to empty strip, message still renders.
- **9 RPC failure** → `fail()` → route error boundary.
- **10 facet-list failure** → propagates to page boundary (never half-populated).
- **11 JS-off** → header search + filter `<form method=get>` + chips as `<a>`.
- **12 long chip row (375px)** → `overflow-x-auto`, no grid push-off.

## How to Test (manual, live)

Local Supabase must be up (`:54321`). Build+start against local keys:
`NEXT_QA_DIST_DIR=.next-t5-prod NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 …
npx next build && npx next start -p 3000`.
1. `/sillas?q=ergonomica` → "6 sillas" (accented match).
2. `/sillas?color=%23111111` → 26; a "Color: Negro" chip; page links carry `color`.
3. Default `/sillas` hides OOS; `?disponibilidad=todos` includes them.
4. Each `?orden=…` reorders; sort change resets `?page`.
5. `?q=zzzz` → NoResults + "Sillas populares" strip.
6. Filter `<form>` submits with JS disabled.

## Verification Results

- **tsc**: clean. **lint**: clean. **build**: succeeds (`/sillas` dynamic; index
  pages SSG). **unit**: 536 passed (27 files). **e2e**: 167 passed, 5 skipped, 0
  failed (chromium + mobile). Interactive checks (sheet open, swatch/sort URL
  update, chip clear-all 26→30) verified against the production build.

## Deviations from Ticket

- **FilterSheet built on Radix Dialog + `.drawer-panel`**, not shadcn's `sheet`
  component. The ticket/design sanctioned `sheet` but MANDATED retrofitting its
  `tw-animate-css` keyframes to the repo's interruptible `[data-state]` transition
  pattern. Reusing the already-proven MobileNav drawer motion (identical pattern,
  same `.drawer-panel`/`.drawer-scrim`, spatial consistency) achieves the exact
  required behavior with zero keyframe risk and less code — so shadcn `sheet` was
  not installed. All other sanctioned shadcn components (input, checkbox, select,
  slider, badge, label) were installed via `npx shadcn add`; the Select's keyframe
  classes were retrofitted to `.select-content-motion` (M-3) per the design rule.
- **Result count moved into `SearchResults`** (inside Suspense) rather than
  `ActiveFilters`, because it must reflect the FILTERED total (known only after
  the RPC). It remains the `aria-live="polite"` node above the grid.

## Dependencies Added

- **None.** shadcn components vendor only radix-ui primitives already installed;
  no new npm packages. DB extensions `unaccent`/`pg_trgm` ship with the Supabase
  image.
