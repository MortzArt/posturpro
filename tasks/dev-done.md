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

## Fixes Applied (Stage 6)

### JS-off strategy chosen (C-1 / C-2 / M-1)

- **C-1 (checkbox facets)** — hidden-input mirroring. Each *selected* facet value
  (category/brand/style/material), including ones collapsed under "Ver más", renders a
  real `<input type="hidden" name={param} value={value}>`. The Radix `Checkbox` is left
  `name`-less (no hydrated `BubbleInput`) so it never double-submits — it stays the JS-on
  live toggle only. This also preserves any pre-existing `?marca=X` across a native submit.
- **C-2 (availability + mobile)** — availability is now a NATIVE
  `<input type="checkbox" name="disponibilidad" value="todos">` with "include out of stock"
  semantics (label `catalog.filters.includeOutOfStock`): unchecked posts nothing (in-stock
  default), checked posts `disponibilidad=todos`. Mobile JS-off gets a `<noscript>` block
  (`catalog-toolbar.tsx`, `lg:hidden`) rendering the same `FilterPanel` form always-expanded.
- **M-1 (price 100x)** — unified the URL contract on PESOS. `parsePriceBound` reads pesos and
  converts to internal cents (×100); `serializeFilters` converts cents back to pesos. The
  visible pesos field is the native submitter under the canonical `precioMin`/`precioMax`
  names, so JS-on and JS-off carry identical semantics. Internals (chips, RPC params, cache
  buckets) stay in cents.

### Issue Tracker

| ID | Severity | Title | Status | File | Notes |
|----|----------|-------|--------|------|-------|
| C-1 | CRITICAL | Checkbox facets submit nothing JS-off | FIXED | `filter-controls.tsx` (FacetCheckboxGroup) | Hidden-input mirror per selected value; Radix checkbox `name`-less |
| C-2 | CRITICAL | Availability opt-out inexpressible + no mobile filter UI JS-off | FIXED | `filter-controls.tsx`, `catalog-toolbar.tsx` | Native `disponibilidad=todos` checkbox; `<noscript>` mobile form |
| M-1 | MAJOR | Price 100x (pesos submitted, cents parsed) | FIXED | `search-params.ts`, `filter-controls.tsx` | URL contract = pesos; parser converts to cents; +unit test |
| M-2 | MAJOR | `badge.tsx` `transition-all` (AC-18) | FIXED | `ui/badge.tsx:8` | → `transition-[color,box-shadow,border-color]` |
| M-3 | MAJOR | Locale lost on `/en` native submit | FIXED | `page.tsx`, `site-header.tsx`, `filter-panel.tsx`, shell/toolbar | `getPathname({href,locale})` → `action="/en/sillas"` |
| M-4 | MAJOR | Controlled inputs never re-sync to URL | FIXED | `filter-controls.tsx` (PriceRange), `search-box.tsx` | "Adjust state during render" (lint forbids setState-in-effect) |
| M-5 | MAJOR | ✕ clear doesn't clear active query | FIXED | `search-box.tsx` | `requestSubmit()` on clear when a query was active |
| M-6 | MAJOR | FilterSheet no body scroll-lock | FIXED | `filter-sheet.tsx`, `mobile-nav.tsx` | `body.overflow=hidden` while open (widened to MobileNav) |
| M-7 | MAJOR | `aria-live` remounts inside Suspense | FIXED | `result-announcer.tsx` (new), `catalog-shell.tsx`, `search-results.tsx` | Persistent live region in shell + announcer bridge |
| m-1 | MINOR | `fail()` log prefix changed | SKIPPED | — | Intentional consolidation; redacted message; documented |
| m-2 | MINOR | JS unaccent vs Postgres unaccent divergence | SKIPPED | — | No live bug (Spanish only); future follow-up |
| m-3 | MINOR | Dead conditional in ActiveFilters | FIXED | `active-filters.tsx` | Removed always-true inner ternary |
| m-4 | MINOR | Magic string `"q"` | FIXED | `search-box.tsx` | `QUERY_FIELD = SEARCH_PARAM_KEYS.q` |
| m-5 | MINOR | `preservedParams` could double `q` | FIXED | `search-box.tsx` | Filters out `q`/`page` before emitting hidden inputs |
| m-6 | MINOR | `.grid-pending` no RM override | FIXED | `globals.css` | RM `transition-duration:0ms`, state kept |
| m-7 | MINOR | Manual `aria-modal` on forceMount sheet | SKIPPED | — | Same proven MobileNav pattern; Dialog.Title present; verified |

### Summary

- Critical: 2/2 fixed
- Major: 7/7 fixed, 0 skipped
- Minor: 5/7 fixed, 2 skipped (justified: no live bug / intentional deviation)

### Files touched (Stage 6)

- `src/components/catalog/filter-controls.tsx` — C-1 hidden mirrors, C-2 native availability, M-1 pesos field, M-4 render-sync
- `src/components/catalog/filter-panel.tsx` — `action` prop (M-3), `includeOutOfStock` label (C-2), dropped unused `clearHref`
- `src/components/catalog/catalog-toolbar.tsx` — thread `catalogAction`, `<noscript>` mobile fallback (C-2)
- `src/components/catalog/catalog-shell.tsx` — thread `catalogAction` (M-3), `ResultAnnouncerProvider` (M-7)
- `src/components/catalog/search-box.tsx` — m-4/m-5, M-4 render-sync, M-5 clear-submits
- `src/components/catalog/search-results.tsx` — M-7 announcer, visible count no longer a live region
- `src/components/catalog/active-filters.tsx` — m-3
- `src/components/catalog/result-announcer.tsx` — NEW (M-7 persistent live region)
- `src/components/catalog/filter-sheet.tsx` — M-6 scroll-lock
- `src/components/layout/mobile-nav.tsx` — M-6 scroll-lock (widened)
- `src/components/layout/site-header.tsx` — M-3 locale-aware search action
- `src/components/ui/badge.tsx` — M-2
- `src/app/[locale]/sillas/page.tsx` — M-3 `catalogAction`, `includeOutOfStock` label
- `src/lib/catalog/search-params.ts` — M-1 pesos↔cents contract
- `src/lib/catalog/search-params.test.ts` — M-1 unit test (+1)
- `src/messages/keys-used.test.ts` — `inStockOnly` → `includeOutOfStock` consumed key
- `src/app/globals.css` — m-6 RM override

### Test Results After Fixes

- Unit: 537 passed / 0 failed / 0 skipped (was 536; +1 M-1 price-contract test)
- Integration (read-only, no db reset): 78 passed / 0 failed
- e2e (chromium + mobile): 167 passed / 5 skipped / 0 failed
- `tsc --noEmit`: clean
- `eslint`: clean
- `next build`: succeeds (`/sillas` = `ƒ` dynamic, 107 static pages generated)

### JS-off verification (curl, fresh prod server on :3000)

- Checkbox facet: `/sillas?marca=<id>` → renders `<input type="hidden" name="marca" value="<id>">`; Radix button has no `name`.
- Availability: `?disponibilidad=todos` parsed; native `<input type=checkbox name=disponibilidad value=todos>` rendered.
- Mobile: `<noscript>` block contains a full native filter form (availability checkbox + `<select name=orden>` + price fields).
- Price: `?precioMin=5000` (pesos) → 13 chairs; `?precioMin=100000` → 0; chip "Precio: desde $5,000.00" (no 100x error).
- Locale: `/en/sillas` filter form and search form both `action="/en/sillas"`.

---

## Stage 7b Fix — QA-BUG-1 (JS-off browser saw a perpetual skeleton)

### Root cause
`/sillas` is a **dynamic** route (`ƒ`, reads `searchParams`). It combined (a) a
route-level `src/app/[locale]/sillas/loading.tsx` (`CatalogPageSkeleton`) AND
(b) a `<Suspense fallback={<ProductGridSkeleton />}>` around `SearchResults`. On a
dynamic route Next.js streams a suspended subtree into a `<div hidden id="S:N">`
holder that a client `$RC` script swaps into place on hydration. With JS OFF that
script never runs, so a no-JS browser was stuck on the skeleton forever — the real
markup was in the response body (SEO/crawlers fine, AC-11 held) but invisible to a
no-JS human, breaking the visible halves of AC-10/12/13 and edge 11 ("SSR-first").

### Fix (architectural — constraint 1 satisfied)
1. **Deleted** `src/app/[locale]/sillas/loading.tsx` — removed the segment-level
   Suspense boundary that forced the whole page into a hidden holder.
2. **Removed the `<Suspense>`** around `SearchResults` in `sillas/page.tsx`; the RPC
   read is now `await`ed **inline**, so shell + toolbar + chips + sidebar + grid all
   land in the **visible** server-rendered tree. Confirmed **zero** `hidden id="S:"`
   holders in the served HTML and full visibility in a real `javaScriptEnabled:false`
   Playwright browser (bbox non-null for grid, cards, result-count, sidebar panel,
   chips) — screenshot-verified for `/sillas?q=…` and `/sillas?marca=<id>` in **both**
   `es-MX` and `en`.
3. Removed the now-dead `CatalogPageSkeleton` export (only `loading.tsx` used it) and
   the unused `cn` import from `catalog-skeleton.tsx`; refreshed stale "Suspense
   fallback" doc comments in `search-results.tsx` and `catalog-grid-region.tsx`.

### Why this option over the others evaluated
- **Delete `loading.tsx` alone** (keep inner Suspense): TESTED with a real no-JS
  browser — the inner `<Suspense>` still streamed the grid into `hidden id="S:0"`
  (grid/count/cards bbox `null`). Insufficient. This is why the task's "TEST, don't
  assume" caveat mattered: the inner-Suspense option has the **same** `$RC` defect.
- **Inline `await` (chosen)**: the only pattern that puts the results in the visible
  SSR tree with no `$RC` dependency. Correct for a no-JS human AND still dynamic.

### JS-on loading UX impact
- The route no longer shows a route/grid **skeleton** on cold navigation; instead the
  server response now **blocks on the one-round-trip `search_products` RPC** before
  first byte (against local Supabase this is a single fast round trip; the RPC is
  `pg_trgm`-indexed and `LIMIT 12`).
- In-page **pending indication is preserved**: every client-side filter/sort/search
  change still runs through the `CatalogGridRegion` `useTransition` **dim** (M-7,
  opacity-only / RM-safe) — the previous results stay visible-but-dimmed until the new
  RSC payload lands, which is a smoother UX than a skeleton flash on fast local reads
  (Emil: "prevent jarring changes"). Taxonomy routes (`/marcas`, `/categorias`,
  `/estilos`) are **unaffected** — they are SSG so their `<Suspense>` resolves at build
  time (no hidden holder).
- Trade-off noted: inline rendering makes each `/sillas` request hold its worker for
  the RPC duration, so under **very high** e2e parallelism on the single shared prod
  server the pre-existing hydration/contention flake on the chip-nav tests is a touch
  more visible (green in isolation and at `--workers=2`; see gate note).

### Test contract flipped
`e2e/search-filter-sort-nojs.spec.ts` — the first `describe` previously **pinned** the
buggy behavior (`hidden id="S:"` present, skeleton visible). It is now
`"QA-BUG-1: JS-off results are SSR-visible (no streaming holder)"` and asserts the
**fixed** contract: `body` has **no** `hidden id="S:"` and **no**
`product-grid-skeleton`, and `result-count` / `product-grid` / first `product-card` /
the desktop sidebar `filter-panel` are all `toBeVisible()` with JS off.

### Files changed (Stage 7b)
| File | Change |
|------|--------|
| `src/app/[locale]/sillas/loading.tsx` | **Deleted** (route-level full-page skeleton) |
| `src/app/[locale]/sillas/page.tsx` | Removed `<Suspense>` + `ProductGridSkeleton`/`Suspense` imports + `suspenseKey`; `SearchResults` awaited inline; rewrote rendering-mode doc (SSR-first / QA-BUG-1) |
| `src/components/catalog/catalog-skeleton.tsx` | Removed dead `CatalogPageSkeleton` export + unused `cn` import |
| `src/components/catalog/search-results.tsx` | Doc comment: inline render, not a Suspense fallback |
| `src/components/catalog/catalog-grid-region.tsx` | Doc comment: transition dim is the sole in-page pending indication |
| `e2e/search-filter-sort-nojs.spec.ts` | Flipped the QA-BUG-1 pin to assert the fixed (visible, no-holder) behavior; refreshed header |

### Gates After Fix
- Unit: **569 passed** / 0 failed / 0 skipped
- Integration (read-only, no db reset): **110 passed** / 0 failed
- E2E (chromium + mobile, prod server on :3000 vs local Supabase :54321):
  **259 passed / 5 skipped / 0 failed** (`--workers=2`; the flipped QA-BUG-1 test green
  on both projects). Full-parallelism runs intermittently trip the pre-existing single-
  server chip-nav contention flake (green in isolation and at `--workers=2`).
- `tsc --noEmit`: clean · `eslint .`: clean · `next build`: succeeds (`/sillas` = `ƒ`,
  107 static pages, **0** `hidden id="S:"` holders).
- Manual no-JS check: screenshot-verified visible grid + toolbar + chips + sidebar for
  `/sillas?q=ergonomica&color=#111111` and `/sillas?marca=<id>` in `es-MX` **and** `en`.
