# QA Report: T5 — Search, Filters & Sorting

Stage 7 (ultraqa). Comprehensive unit + integration + e2e coverage for search,
filters, sorting, and the JS-off path.

## Test Suite Summary

| Type | Before | Written | After | Passed | Failed | Skipped |
|------|--------|---------|-------|--------|--------|---------|
| Unit | 537 | +32 | 569 | 569 | 0 | 0 |
| Integration | 78 | +32 | 110 | 110 | 0 | 0 |
| E2E | 167 | +92 | 259 | 259 | 0 | 0 |
| **Total** | **782** | **+156** | **938** | **938** | **0** | **0** |

Gates: `tsc --noEmit` clean · `eslint` clean (source/tests/e2e) · unit + integration + full
e2e suite green. Three consecutive full T5 e2e runs at default parallelism: 92/92 each.

### How each suite was run
- **Unit**: `npx vitest run` (jsdom, DB-free).
- **Integration**: `INTEGRATION_SUPABASE_URL=http://127.0.0.1:54321 npx vitest run --config
  vitest.integration.config.ts` — **read-only, NO `db reset`** (0007 is already applied to the
  running stack; a reset would drop it since the integration runner only applies 0001–0005).
  The one write-and-cleanup block (synthetic OOS/variantless product) runs as `service_role`
  and deletes its rows in `afterAll`, verified by a post-cleanup existence check. DB confirmed
  clean afterward: 30 products, 0 leftover synthetic rows.
- **E2E**: own **prod** server on `:3000` (`next build` + `next start`, `NEXT_QA_DIST_DIR=.next-t5-qa`,
  local Supabase keys), chromium + Pixel-7 projects. The user's `:3206` dev server and Docker
  Supabase were left untouched.

## New Test Files
- `src/lib/catalog/active-filter-chips.test.ts` — 11 unit tests (pure chip builder).
- `src/lib/catalog/page-helpers.test.ts` — 8 unit tests (`makeHrefForPage`, AC-15).
- `src/lib/catalog/search-params.test.ts` — **+13** hostile-input tests (existing file, 18 → 31).
- `tests/integration/search-rpc.integration.test.ts` — 32 RPC integration tests.
- `e2e/search-filter-sort.spec.ts` — JS-on flows (both projects, desktop-pinned).
- `e2e/search-filter-sort-mobile.spec.ts` — mobile Sheet, reduced motion, desktop-layout guard.
- `e2e/search-filter-sort-nojs.spec.ts` — `javaScriptEnabled:false` Stage-6 regression proofs.

## Tests Written (highlights)

### Unit
- **search-params hostile inputs (edge 3)**: `<script>` color dropped; injection-shaped `orden`
  → default while a valid `marca` survives; 10 KB `q` truncated to `SEARCH_QUERY_MAX`; repeated
  scalar param uses first value; empty `?marca=` → no constraint; all-unknown facets → unfiltered
  (never empties the catalog); unicode/accents preserved raw; float/`4e3`/over-max price dropped;
  `min===max` band is valid (not inverted); only exact `disponibilidad=todos` opts into OOS;
  parse→serialize→parse fixed point for a hostile mix.
- **active-filter-chips (AC-14, edge 4)**: default → no chips; in-stock default never chips; OOS
  opt-in chips + `removeHref` → clean `/sillas`; per-value multi-facet chips each removing only
  themselves; color hex→name label; full-range vs open-ended `desde`/`hasta` price chips
  (pesos↔cents via `formatMXN`); fixed facet order; every `removeLabel` wraps its own label.
- **page-helpers (AC-15)**: page-1 self-canonical (no `?page=1`); filters carried on every page
  link; `&page=N` for 2+; empty query == unfiltered; taxonomy base paths.

### Integration (live seeded DB, anon role)
- **Security (AC-2)**: RPC returns rows to anon; base `products` denied (`42501`);
  `cost_price_cents` absent from the RPC result shape.
- **Keyword (AC-3, edge 7)**: `ergonomica`==`ergonómica`==`ERGONOMICA` (6); `oficina`/`OFICINA`/
  `oficína` equal; null `q` == filter-only; no-match → 0 rows (not an error).
- **Facets (AC-4)**: brand/style/category(M2M)/color/material/price each filter; OR-within
  (brand A+B == A + B; color negro+azul ≥ negro); AND-across (brand ∩ color ≤ either);
  contradiction (brand + a color it lacks) → exactly 0 rows.
- **Availability (AC-5/6)**: `effective_stock` == `COALESCE(SUM(variant.stock), product.stock)`
  for **every** product (0 mismatches); default shows only `>0`; `p_in_stock_only=false` ≥ default.
- **Sorting (AC-7)**: price asc/desc ordering; name-asc == reverse(name-desc); all six sorts
  **deterministic across two calls**; unknown sort falls through to the `name,id` tiebreak.
- **Pagination (AC-8, edge 2)**: `total_count = COUNT(*) OVER()` identical on every row & equal to
  the true total; LIMIT/OFFSET slice with no page-1/page-3 overlap; offset-past-end → 0 rows (no
  416); negative offset/limit clamp via `greatest()`.
- **Synthetic (edges 5, 6)**: a variant-less product is included w/o a color filter
  (`effective_stock` from `products.stock`, `distinct_color_count=0`) and excluded under a color
  filter; an all-variants-OOS product has `effective_stock=0` (not the product-level 50) and is
  hidden under the default in-stock filter.

### E2E
- JS-on: accented search from the toolbar (both locales); each facet (brand checkbox, color
  swatch, price, availability); chip add/remove/clear-all; sort change + page-reset-on-change;
  pagination preserving filters; no-results + popular strip; shareable-URL cold load; browser
  Back; SEO `robots`/`canonical`; persistent `aria-live` count; `/en` locale-aware forms.
- Mobile: Sheet open/apply/scroll-lock(M-6)/Escape; chip-row no horizontal overflow (edge 12);
  2-col grid; reduced-motion still toggles state; desktop-layout guard (sidebar visible, no Sheet
  trigger).
- JS-off: native search form contract; hidden-input mirroring (C-1); Radix checkbox name-less;
  native availability checkbox (C-2); pesos price contract & no-100x (M-1); native `<select
  name=orden>` with all six options; chips as real anchors; `/en` form actions; `<noscript>`
  mobile form (C-2); **plus QA-BUG-1 pin (below)**.

## Acceptance Criteria Coverage

| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| AC-1 | Migration + RPC + grants + indexes apply cleanly | integration security block runs against the applied 0007 | PASS |
| AC-2 | RPC reads only public surfaces; base denied; no cost | `anon security invariants` (3 tests) | PASS |
| AC-3 | Keyword name/brand/desc, case+accent-insensitive; empty→filter-only | integration keyword block + `search-params` q parsing | PASS |
| AC-4 | Facets individually + combined; AND-across / OR-within | integration facet block (11 tests) + e2e facet clicks | PASS |
| AC-5 | Default in-stock only; explicit OOS opt-in | integration availability + e2e/JS-off availability toggle | PASS |
| AC-6 | `effective_stock` == `effectiveStock()`; 3 badges | integration parity test (all products, 0 mismatch) + `stock.test` | PASS |
| AC-7 | Six deterministic sorts; default best-selling | integration sorting block (5 tests) + e2e sort | PASS |
| AC-8 | Pagination on filtered set; COUNT OVER; clamp; filter→page1 | integration pagination block + e2e sort-resets-page | PASS |
| AC-9 | Shareable crawlable params; single-sourced names | `search-params` serialize/round-trip + e2e cold-load | PASS |
| AC-10 | Enhances in place; dynamic w/ params; unfiltered cached | build output (`ƒ /sillas`) + e2e unfiltered/filtered | PASS (see QA-BUG-1) |
| AC-11 | canonical→clean; filtered=noindex,follow; unfiltered indexable | e2e SEO block — verified `noindex, follow` + `canonical=/sillas` | PASS |
| AC-12 | Header search → /sillas?q; keyboard; locale-aware; JS-off native | e2e search + JS-off form contract + `/en` action | PARTIAL (QA-BUG-1) |
| AC-13 | Filter panel (sidebar ≥lg / Sheet mobile); options from DB | e2e mobile Sheet + desktop sidebar + JS-off `<noscript>` | PARTIAL (QA-BUG-1) |
| AC-14 | Removable chips + Clear-all; filtered count | `active-filter-chips` unit + e2e chip remove/clear-all | PASS |
| AC-15 | ≥1 match → grid + pagination preserving filters | `page-helpers` unit + e2e pagination-preserves-filters | PASS |
| AC-16 | 0 match → no-results + popular strip (best-selling, ≤8) | e2e no-results block + integration popular ordering | PASS |
| AC-17 | New strings in both dicts; keys-used/messages pass | existing `keys-used`/`messages` unit tests green | PASS |
| AC-18 | Motion per skills; RM; no transition:all | e2e reduced-motion Sheet toggles; `badge.tsx` fixed (M-2) prior | PASS |

## Edge Case Coverage

| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Contradictory filters → 0 rows, not error/404 | integration "contradictory filters" + e2e no-results | PASS |
| 2 | `?page=99999` → clamp, no 416 | integration offset-past-end + existing catalog clamp e2e | PASS |
| 3 | Junk/hostile params | `search-params` hostile-input block (13 tests) | PASS |
| 4 | Price min>max → drop both + note | `search-params` inverted-price + `active-filter-chips` | PASS |
| 5 | Variant-less product + color filter | integration synthetic edge-5 (2 tests) | PASS |
| 6 | All variants OOS but product.stock>0 | integration synthetic edge-6 (2 tests) | PASS |
| 7 | Accent/diacritic & case | integration keyword accent tests | PASS |
| 8 | Empty catalog / popular strip empty | e2e no-results (popular strip renders ≤8) | PASS (see gap) |
| 9 | RPC/DB read failure → error boundary | not newly tested (see Untested Areas) | GAP |
| 10 | Facet lists fail → page boundary | not newly tested (see Untested Areas) | GAP |
| 11 | JS disabled | JS-off spec (form contract works; **visibility fails — QA-BUG-1**) | PARTIAL |
| 12 | Long chip row at 375px scrolls | e2e mobile chip-row overflow test | PASS |

## Bugs Found

### QA-BUG-1 — [MEDIUM/HIGH] `/sillas` shows only a skeleton to a no-JS *browser* (real content trapped in a hidden streaming holder)
- **How found**: writing the JS-off (`javaScriptEnabled:false`) regression proofs. Playwright
  reported the `product-grid` and filter sidebar as 0×0 / hidden; DOM inspection showed a hidden
  ancestor `<div hidden id="S:0">`.
- **Root cause**: T5 made `/sillas` a **dynamic** route (`ƒ`) and it has a route-level
  `src/app/[locale]/sillas/loading.tsx` (`CatalogPageSkeleton`). Next.js therefore streams the
  whole page: the browser paints the `loading.tsx` full-page skeleton first, and the **entire real
  page** (grid, filter sidebar, toolbar, chips, and even the `<noscript>` mobile form) is delivered
  inside `<div hidden id="S:0">`, swapped into view by a client `$RC` script. **With JS off that
  script never runs**, so a no-JS *browser* is stuck on the skeleton forever.
- **Verified**: raw HTML (`curl`) contains the correct results in the hidden holder; the visible
  slot after `<template id="B:0">` is a full skeleton of `animate-pulse` placeholders; JS-on the
  skeleton correctly swaps to a visible 928×838 grid. So the defect is strictly **JS-off browser
  visibility** — not the SSR payload.
- **Impact on ACs**: the response body is correct, so **AC-11 indexability holds** (crawlers/curl
  see everything, `noindex,follow` + canonical correct) and all crawlable-content assertions pass.
  But **edge 11 ("results render server-side… SSR-first")** and the *browser-visible* halves of
  **AC-10 / AC-12 / AC-13** FAIL for a no-JS human. Stage 6's "curl-verified JS-off" only exercised
  the response body, never a real no-JS browser — which is why it was marked FIXED.
- **Fix status**: **NOT fixed in QA.** The fix is architectural (e.g. drop/relocate the route-level
  `loading.tsx` for the dynamic route, or render the results outside the top-level Suspense so
  they land in the visible tree) and trades off against the AC "Loading" skeleton UX; that is a
  dev/verify decision, not a test change. Flagged here for the verify stage. The T3 taxonomy pages
  (`/marcas` etc.) are **not** affected (still SSG — 0 hidden holders), confirming this is a
  T5-introduced regression tied to the dynamic route + `loading.tsx`.
- **Test coverage**: `search-filter-sort-nojs.spec.ts` first test **pins** the buggy behavior
  (`hidden id="S:"` present, skeleton visible, content correct-but-hidden) so a future fix must
  deliberately flip it; the remaining JS-off tests assert the served-HTML contract (attributes,
  names, hrefs, counts on hidden nodes), which is the honest scope of what works today.

No other bugs found. No security/data-loss defects. Data/RPC/security/sort/parity/i18n layers are
excellent and fully verified.

## Notes on Test Determinism (no flaky tests shipped)
- `/sillas` is a **streaming dynamic route**. Two anti-flake measures were required and applied:
  1. **No `networkidle`** waits — the streaming connection never settles, so `waitForLoadState
     ("networkidle")` hangs to timeout. Readiness is a deterministic wait for the streamed
     `product-grid`/`no-results` node to be visible (`gotoReady`).
  2. **Client interactions retry-until-effect** (`clickUntilUrl` / `toPass`): a `router.push`
     control can be clicked a hair before React hydration attaches its handler; the helper re-fires
     only if the first click produced no navigation (URL-guarded, safe for toggles). Native search
     submit works pre-hydration (`<form method=get>`), wrapped the same way.
- The JS-on spec is **pinned to a desktop viewport file-wide** (the header search collapses to an
  icon below `md`; facets live in the `≥lg` sidebar) so identical logic runs deterministically on
  both the chromium and Pixel-7 projects; mobile layout/Sheet is covered separately.
- Two mid-run failures were traced to the ENVIRONMENT, not the tests: a transient Supabase
  transaction-aborted / statement-timeout (the known env incident) and the single prod server
  being OOM-reaped under 3× back-to-back dual-project runs. With the server healthy, the T5 e2e is
  green across repeated runs (incl. `--repeat-each=2` on the previously-flaky toggles: 8/8).

## Confidence: HIGH (for the shipped scope) — with one explicit caveat for verify

The query/RPC/security/parity/sort/pagination/i18n core is verified to a high bar (live-DB
integration, byte-for-byte stock parity across all products, determinism across calls, anon grant
discipline). All 156 new tests plus the full 259-test e2e suite (T4 PDP guard included) pass
deterministically. The **one caveat** is QA-BUG-1: the JS-off *browser* experience is broken by the
streaming/`loading.tsx` interaction — the content is correct in the payload (so SEO/crawlers are
fine) but invisible to a no-JS human. That is a real, ticket-relevant defect (edge 11 + the visible
halves of AC-10/12/13) that QA has flagged and pinned but not fixed, because the fix is an
architectural trade-off best decided at verify/dev.

## Untested Areas / Gaps (noted, not filled)
- **Edge 9 (RPC/DB read failure → localized error boundary)** and **edge 10 (facet-list read
  failure → page boundary, never half-populated)**: not newly tested. Simulating a live RLS/network
  failure against a healthy seeded DB without a mock harness is out of scope for the read-only
  integration suite; the `fail()` redaction path is unit-covered indirectly via existing
  `queries.test`/`product-detail.test`. Risk: LOW (the `fail()`→`error.tsx` contract is unchanged
  from T3/T4 and covered there). Recommend a fault-injection integration test in a future pass.
- **Edge 8 (popular strip ALSO empty)**: the `safePopular()` empty-degrade branch is asserted at the
  code level but not e2e-exercised (the seed always has ≥8 popular products, and the catalog was not
  emptied to avoid a destructive DB mutation). Risk: LOW.
- **`facets.ts` internal pure helpers** (`luminance`, `unaccentLower`, `flattenCategories`) are not
  exported, so they are covered only indirectly (via `loadFacetOptions` at integration/e2e level).
  Risk: LOW. Minor `m-2` (JS `unaccentLower` vs Postgres `unaccent` divergence for non-Spanish
  glyphs) remains a documented no-live-bug follow-up.
- **`search.ts` caching branch** (`filterCacheKey`, `priceBucketKey`, `unstable_cache` keying): the
  cacheability decision is unit-tested (`isCacheableFilters`), but the actual key/bucketing is not
  asserted (it requires the Next runtime). Risk: LOW — bounding logic is simple and DoS-safety was
  security-reviewed in Stage 9.
- **Codebase-wide**: the pre-existing `button.tsx` `transition-all` (out of T5 scope per M-2 note)
  remains; the in-memory Q&A rate-limiter (T4) has no eviction test. Neither is T5.

## Cleanup
- Synthetic integration rows removed (verified 0 leftover, 30 products intact).
- Temporary e2e build dir `.next-t5-qa/` (untracked) remains only because the running prod server
  serves from it; it is not committed and is safe to delete after the server is stopped.
