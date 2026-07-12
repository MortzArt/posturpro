# Ship Decision: T3 — Catalog browsing

## Verdict: SHIP

## Confidence: HIGH

## Quality Score: 9/10

All gates were run fresh by the verifier against a production build (`next build`
+ `next start` on :3000) wired to the running seeded local Supabase (read-only;
the user's dev server on :3206 and the local Docker Supabase were left untouched).
Nothing was trusted from prior-stage reports without independent re-verification.

## Test Results
| Suite | Total | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit / Component (Vitest) | 297 | 297 | 0 | 0 |
| Read-only Integration (live seeded DB) | 4 | 4 | 0 | 0 |
| E2E (Playwright, chromium + mobile) | 126 | 122 | 0 | 4* |
| **Total** | **427** | **423** | **0** | **4*** |

Gates: `npm run lint` clean · `npx tsc --noEmit` exit 0 · `npm run build` success
(route table verified below) · `npm run test` 297/297 · integration 4/4 (via
`vitest --config vitest.integration.config.ts` on the single read-only file — the
destructive `scripts/run-integration.sh` was deliberately NOT used) · `npx
playwright test` 122/122.

\* The 4 E2E skips are by-design cross-project guards (desktop-only numbered
pagination / full breadcrumb assertions skip on the mobile project; mobile-only
2-column / collapse assertions skip on chromium). Not real skips, not failures.

## Acceptance Criteria Final Check
| # | Criterion | Code | Verification | Verdict |
|---|-----------|------|--------------|---------|
| AC-1 | Catalog grid: image/name/brand/MXN price, no cost leak | `sillas/page.tsx`, `product-card.tsx`, `queries.ts` | Live `/sillas`: 12 cards, `$10,000.00` etc., 0 `cost_price` DOM hits | PASS |
| AC-2 | Category page + parent aggregates children | `categorias/[slug]/page.tsx`, `readCategoryProductPage` | Live `/categorias/ejecutivas` 200; integ `oficina aggregates ejecutivas` | PASS |
| AC-3 | Category index with nesting | `categorias/page.tsx`, `category-tree.tsx` | Live `/categorias` 200, nested `<ul>/<li>` | PASS |
| AC-4 | Brand page: monogram fallback + name + desc + grid | `marcas/[slug]/page.tsx`, `brand-logo.tsx` | Live `/marcas/ergovita` 200, monogram (all seeded logos null) | PASS |
| AC-5 | Brand index | `marcas/page.tsx`, `index-tile.tsx` | Live `/marcas` 200 | PASS |
| AC-6 | Style index + style page | `estilos/page.tsx`, `estilos/[slug]/page.tsx` | Live `/estilos`, `/estilos/ergonomica` 200 | PASS |
| AC-7 | Accessible breadcrumbs, nesting, aria-current | `breadcrumbs.tsx` | Live: `<nav aria-label="Ruta de navegación">`, `aria-current="page"`, trail `Inicio/Categorías/Oficina/Ejecutivas` | PASS |
| AC-8 | Stock indicator exact copy + effective stock | `stock.ts`, `stock-badge.tsx` | Unit boundary tests + stitch; live 12× `data-state="in"` (no OOS seeded) | PASS |
| AC-9 | Crawlable pagination, page-1 canonical | `pagination.tsx`, `page-helpers.ts` | Live: 0 `?page=1` anchors, `?page=2` real anchors, page 2 = 12 distinct cards (0 overlap) | PASS |
| AC-10 | i18n both locales, catalog namespace parity | `es-MX.json`, `en.json` | 34 `catalog.*` keys in each, 0 divergence; `/en/*` live 200 | PASS |
| AC-11 | Static rendering; cookies() removed | `layout.tsx`, `site-footer.tsx`, `public.ts`, `store-settings.ts` | Build route table: shell + 3 indexes `●` SSG/ISR; `/sillas`+`[slug]` `ƒ` (searchParams-only, not cookies) | PASS |
| AC-12 | PDP link `/producto/[slug]` locale-aware, no stub | `product-card.tsx`, `config.ts` | Live href `/producto/silla-...` (ES) + `/en/producto/...` (EN); `/producto/*` 404s (T4 unbuilt) | PASS |
| AC-13 | products_public only, embed brand, batch children, no cost | `queries.ts`, `public.ts` | Anon probe: view has no `cost_price_cents` (42703), base `products` denied (42501); integ 4/4 | PASS |
| AC-14 | Invalid slug → real HTTP 404; malformed ?page clamps | `[slug]/page.tsx`, `pagination.ts` | Live: 6/6 invalid slugs 404 (ES+EN); `?page=0/-1/abc/1.5/999/1e9` all 200 clamped | PASS |
| AC-15 | next/image fixed aspect + sizes + placeholder | `product-card.tsx` | aspect-[4/5] + sizes matching grid; placeholder tile for null cover | PASS |
| AC-16 | Empty state, not blank/404 | `empty-state.tsx`, `paginated-product-listing.tsx` | e2e live `/estilos/industrial` (0 products) → empty state + CTA, 200 (ES+EN) | PASS |
| AC-17 | a11y + responsive, no horizontal scroll | all catalog components | e2e no-overflow 375/768/1280; 44px tap targets; semantic navs; H2 headings | PASS |
| AC-18 | Unit + e2e tests | `stock/pagination/queries.test.ts`, `catalog.spec.ts` | 297 unit + 4 integ + catalog e2e all green | PASS |

**18/18 acceptance criteria PASS.** All 10 edge cases verified (empty taxonomy,
OOS, missing cover, nested category, null brand logo/desc, invalid slug 404,
malformed page clamp, multi-category no-dupe, RLS/DB degradation, variant-stock
mismatch) — see QA + review edge-case tables; the ones directly re-checked live
(1, 4, 6, 7) all hold.

## Report Summary
| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review | 8/10 | 1 critical (soft-404) + 4 major + 4 minor — ALL fixed/resolved (m-3 skip is note-only). Re-verified: unknown slugs now return real HTTP 404. |
| QA | HIGH | Found + fixed a genuine app-wide `aria-hidden` a11y defect (T2 shell) and deflaked i18n tests. No product bugs open. |
| UX | 9/10 | Fixed 2 real invisible-to-sighted a11y defects (mislabeled breadcrumb landmark on every page; H1→H3 heading skip). All states present. |
| Security | SECURE | 1 High (unbounded cache-key DoS via `?page`) FIXED via `canonicalPageKey`+`MAX_PAGE`. Cost leak, draft leak, injection, XSS, secrets all verified absent (several proven live). |
| Architecture | 8.5/10 | APPROVE (sound). Layering disciplined; both backlog items closed; T5/T6/T7 limits documented and routed, not silently deferred. |

## Independent Verification Highlights (trust nothing)
- **Cost leak (AC-13):** anon HTTP probe — `products_public.cost_price_cents` →
  42703 (column absent); base `products` → 42501 (permission denied). 0 `cost_price`
  strings in rendered HTML of `/sillas`, `/en/sillas`, category, brand pages.
- **Real 404 (AC-14, ex-C-1):** curl 6/6 invalid slugs → HTTP 404 in both locales;
  valid slugs → 200. The Stage-5 soft-404 critical is genuinely closed.
- **canonicalPageKey (SEC-H-1):** present in `pagination.ts`, bounds cache keys to
  `[1, MAX_PAGE=100_000]`; `cacheKeyForPage` delegates to it. Malformed `?page`
  live-clamps (all 200) without crashing.
- **Static rendering (AC-11):** build route table shows shell + `/categorias` +
  `/marcas` + `/estilos` as `●` SSG/ISR (5m); the `ƒ` pages are dynamic purely from
  `searchParams`, not `cookies()` — the AC target is met.
- **Scope:** no `/producto` route, no filter/sort/search UI, no cart, no homepage
  changes. No T4/T5/T6/T13 build-ahead.
- **No `any` / no non-null `!` / no TODO** in new catalog code.

## Remaining Concerns
- **Live low/out-of-stock badges unverified:** no low/OOS product is seeded, so the
  "Solo quedan {n}" / "Agotado" badge states are unit-tested (pure boundary-covered
  function) but not live-E2E-verified. Low severity. Recommendation: seed a low/OOS
  product in T6 for a live badge screenshot.
- **`?page` listing pages render `ƒ` dynamic:** accepted, documented deviation —
  caused by `searchParams`, not `cookies()`; AC-11 target (kill the cookie taint) is
  fully met and data is tag-cached (no per-request DB storm). Full PPR needs Next 16
  `cacheComponents` (bans `unstable_cache`) — correctly deferred.
- **npm audit baseline (2 moderate postcss-via-next):** build-time only, `--force`
  fix downgrades Next to 9.x. T3 added 0 deps — no delta. Accepted; revisit at T14.
- **Category `.in(ids)` cap (1000) observability + T5 filter/sort DB path + missing
  indexes + effective-stock authority for T6/T7:** all documented and routed in
  `tasks/clean-code-backlog.md`. None are T3 defects (filters/sort/cart are out of
  scope for T3).

## What Was Built
T3 delivers the first shopper-facing catalog surface for PosturPro: a responsive
product grid (`/sillas`) plus category, brand, and style index and detail pages,
in both `es-MX` and `en`, with accessible breadcrumbs, crawlable `?page`
pagination, stock badges, and empty/loading/error states. It introduces a
cookie-free anon Supabase read layer that reads `products_public` (never exposing
`cost_price_cents`) and stitches images/variants/category joins via batched
queries, and it makes the app shell and taxonomy index pages statically
optimizable (ISR) by removing the `cookies()` taint from the render path.

## Summary
Every gate is green (297 unit / 4 integration / 122 e2e / lint / tsc / build),
all 18 acceptance criteria pass with several re-verified live, the one critical
(soft-404) and the one High security finding (cache-key DoS) are genuinely fixed,
no cross-user/cost data leaks by any path, and scope is clean with no build-ahead.
This ships.
