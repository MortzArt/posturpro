# Code Review: T3 — Catalog browsing

## Summary
Strong, disciplined implementation. The read strategy (view + batched stitch), the cookie-free static-render fix, pagination math, stock logic, i18n parity, and motion discipline are all correct and well-tested (279 unit tests pass, tsc clean, lint clean). Two disclosed deviations are real: one is acceptable (searchParams dynamism), one is a genuine SEO defect that must be fixed before T14 (invalid slug returns HTTP 200). A handful of major/minor correctness and fidelity gaps remain.

## Critical Issues (MUST FIX)

### C-1: Invalid-slug 404 returns HTTP 200 (SEO / crawler defect)
- **ID**: C-1
- **Severity**: CRITICAL
- **File**: `src/app/[locale]/categorias/[slug]/page.tsx:90-93`, `marcas/[slug]/page.tsx:60-63`, `estilos/[slug]/page.tsx:59-62`; corroborated by `e2e/catalog.spec.ts:98-108` (asserts UI, deliberately NOT status) and `tasks/dev-done.md:107`.
- **Problem**: The dev discloses that `notFound()` on an unknown/inactive slug renders the correct localized 404 UI but responds with **HTTP 200**, not 404. The e2e test was written to assert only the visible UI, sidestepping the status code. AC-14 says the slug "calls `notFound()` and renders the localized in-shell 404" — the functional half passes, but a soft-404 (200 body that looks like a 404) is exactly what Google penalizes: crawlers index the fake page, dilute crawl budget, and never drop the dead URL. T14 (SEO) explicitly depends on this.
- **Impact**: Every `/categorias|marcas|estilos/<garbage>` URL becomes a 200-status indexable page. Directly undermines T14. Also means uptime/monitoring checks can't distinguish a real 404.
- **Assessment of the dev's root-cause claim**: The stated cause ("`notFound()` fires after the shell begins flushing") is technically shaky. In each detail page, `getCategory/getBrand/getStyle` is `await`ed and `notFound()` is called BEFORE any JSX in the page returns and before the `<Suspense>` child mounts — there is no page-level flush before the throw. The likely real cause is the async layout shell streaming in parallel, or these routes being `ƒ` dynamic where Next resolves status differently. This needs empirical confirmation, not a hand-wave.
- **Suggested Fix**: Verify empirically with a production build + `curl -I /categorias/no-existe` to capture the real status. If 200 is confirmed: (1) **the e2e test MUST assert `response.status() === 404`** so the regression is caught; (2) investigate hoisting the taxonomy existence check so the throw resolves before the layout streams, or use `generateStaticParams` + `dynamicParams=false` so unknown slugs 404 statically. At minimum, correct the "acceptable" framing in dev-done.md — a soft-404 is not acceptable; if genuinely unfixable in-cycle it must be an explicit ticketed deferral, not silent.

## Major Issues (SHOULD FIX)

### M-1: Numbered pagination links are 32px tall — below the 44px tap target
- **ID**: M-1
- **Severity**: MAJOR
- **File**: `src/components/catalog/pagination.tsx:96-98, 107-108` vs `src/components/ui/button.tsx:28`
- **Problem**: Numbered page links and the current-page span use `buttonVariants({ variant, size: "lg" })` + `min-w-9`. In this repo's custom button scale, `size="lg"` is only `h-8` (32px) — the shadcn defaults were shrunk here. Only Prev/Next get `controlBase` (`min-h-11`). So numbered links are 32px tall, violating AC-17 and the ui-design "≥44px tap targets on pagination" (ui-design.md:92, :107).
- **Impact**: Sub-minimum touch targets on tablet (768px, touch) where the numbered set is shown. Mobile (Prev/Next/count row) is compliant.
- **Suggested Fix**: Add `min-h-11 sm:min-h-9` (or reuse `controlBase`'s height rule) to the numbered link + current-span className.

### M-2: `readClampedProductPage` always issues a redundant page-1 read for any page > 1
- **ID**: M-2
- **Severity**: MAJOR
- **File**: `src/lib/catalog/page-helpers.ts:28-39`
- **Problem**: To learn `lastPage` for clamping, the helper unconditionally reads page 1 first, then reads the requested page when it isn't 1. For `?page=2` that is two full reads (each = 1 view query + 2 batched image/variant queries = 6 round-trips cold). The clamp only needs `count`, not page 1's rows.
- **Impact**: 2x DB work for every non-first page on cache miss. Bounded and ISR-cached, so not fatal, but avoidable and scales with taxonomy pages. Design anticipated a single clamped read.
- **Suggested Fix**: Either read the requested (unclamped) page directly and, on PostgREST 416, fall back to a clamped re-read using returned `count`; or add a count-only query (`head:true, count:"exact"`) to compute `lastPage` before a single row read. The latter is clean and keeps the never-416 guarantee.

### M-3: Category product query loads all member ids into an unbounded `.in()`
- **ID**: M-3
- **Severity**: MAJOR
- **File**: `src/lib/catalog/queries.ts:384-402`
- **Problem**: `readCategoryProductPage` fetches every `product_id` for the category (no limit) then passes the whole array to `.in("id", memberIds)`. Fine for 30 seeded products, but there is no ceiling — a large `oficina` parent aggregating children builds an ever-growing `IN (...)` list and a large PostgREST URL. Latent scale/perf issue; deviates from the "bounded batch" intent.
- **Impact**: Fine at seed scale; degrades and risks URL-length limits as the catalog grows. Not a correctness bug today.
- **Suggested Fix**: Push the membership filter server-side (category-scoped view or RPC) so pagination happens in the DB, or cap + document the ceiling. Acceptable to defer with a `clean-code-backlog.md` entry — but flag it, don't leave it silent.

### M-4: No test that per-category `total` equals the distinct active member count (edge case 8)
- **ID**: M-4
- **Severity**: MAJOR (verify)
- **File**: `src/lib/catalog/queries.ts:377-403`
- **Problem**: Per-category pagination `total` is the `count:"exact"` of `products_public.in("id", memberIds)`. Correct only if `product_categories` has one row per (product, category) and no duplicate active member is double-counted. Edge case 8 (a product in both `oficina` and `ejecutivas`) is handled within a single page, but nothing asserts the count/grid can't double-count if data ever inserts a duplicate membership row.
- **Impact**: A future duplicate `(product_id, category_id)` row would double-count with no test catching it.
- **Suggested Fix**: Add a query test seeding a duplicated membership row, asserting no duplicate card + correct `total`. Cheap AC-2/edge-8 insurance.

## Minor Issues (NICE TO FIX)

### m-1: `styles(...)` embed is fetched and never consumed
- **File**: `src/lib/catalog/queries.ts:53-54, 90, 188-224`
- **Suggestion**: `PRODUCT_CARD_SELECT` embeds `styles(name,slug)` and defines `EmbeddedStyle`, but `toCard` never reads `row.styles`. Pure over-fetch on every product-card query. Drop the style embed + type, or use it. Same for `brand_id`/`style_id` scalar columns — selected but unread in `toCard` (brand comes from the embed).

### m-2: Breadcrumb mobile collapse is untested — risk of a doubled chevron
- **File**: `src/components/catalog/breadcrumbs.tsx:61-64, 109-120`
- **Suggestion**: On mobile the collapsed `…` placeholder renders its own chevron (116-119) while the per-item `<Separator/>` (61) still renders around the hidden middle `<li>`s. Trace the 375px output (`Inicio › … › Ejecutivas`) to confirm no doubled chevron, and add a Playwright assertion at 375px — the mobile crumb rendering is currently untested.

### m-3: Skeleton grid renders 12 cards regardless of last-page size
- **File**: `src/components/catalog/catalog-skeleton.tsx:27-40`
- **Suggestion**: A 3-item last page briefly shows 12 skeletons then collapses to 3 — a layout shift contradicting "reserve exact space" for short pages. Count isn't known at loading time so acceptable; the common full-grid case is correct. Note only.

### m-4: `firstOrSelf` defends against an array embed but only for `brands`
- **File**: `src/lib/catalog/queries.ts:113-116, 198`
- **Suggestion**: Consistent with m-1 — since `styles` is unused, the asymmetry is moot once the embed is removed. If kept, normalize both or neither for clarity.

## Acceptance Criteria Verification
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | Catalog grid, per-card image/name/brand/price, no cost leak | PASS | `sillas/page.tsx`; `product-card.tsx:99-114`; `queries.ts` select omits cost |
| AC-2 | Category listing + parent aggregates children | PASS | `categorias/[slug]/page.tsx`, `readCategoryProductPage` via `product_categories` |
| AC-3 | Category index with nesting | PASS | `categorias/page.tsx` + `category-tree.tsx` nested `<ul>/<li>` |
| AC-4 | Brand page: logo/fallback + name + description + grid | PASS | `marcas/[slug]/page.tsx:76-102`, `brand-logo.tsx` monogram |
| AC-5 | Brand index | PASS | `marcas/page.tsx` + `index-tile.tsx` |
| AC-6 | Style index + style page | PASS | `estilos/page.tsx`, `estilos/[slug]/page.tsx` |
| AC-7 | Accessible breadcrumbs, nesting, aria-current | PASS | `breadcrumbs.tsx` (`<nav><ol>`, `aria-current`), `buildCategoryCrumbs` uses ancestor chain |
| AC-8 | Stock indicator exact copy + effective stock | PASS | `stock.ts` variant-authoritative; messages match exactly |
| AC-9 | Crawlable pagination, page-1 canonical, aria-current | PASS | `pagination.tsx` real Link hrefs, `makeHrefForPage`; e2e:35-52 |
| AC-10 | i18n both locales, catalog namespace, parity | PASS | 33/33 keys parallel (verified); no hardcoded UI strings |
| AC-11 | Static rendering; cookies() removed | PARTIAL PASS | Shell + 3 index pages `●` SSG/ISR (layout + footer both swapped); `/sillas` + `[slug]` `ƒ` due to searchParams — acceptable per AC-11's cookies()-scoped wording |
| AC-12 | PDP link `/producto/[slug]` locale-aware, no stub | PASS | `product-card.tsx:57` `productPath()` via `@/i18n/navigation` Link |
| AC-13 | products_public only, embed brand/style, batch children, no cost | PASS | reads `products_public`; view omits cost (`0005:127`); e2e:27-33 |
| AC-14 | Invalid slug → 404; malformed ?page clamps | PARTIAL FAIL | Clamping correct + tested; 404 returns HTTP 200 — see C-1 |
| AC-15 | next/image fixed aspect + sizes + placeholder | PASS | `product-card.tsx:61-90` aspect-[4/5], sizes matches grid, placeholder tile |
| AC-16 | Empty state, not blank/404 | PASS | `paginated-product-listing.tsx:44-52` + `empty-state.tsx` |
| AC-17 | a11y + responsive, no horizontal scroll | PARTIAL PASS | Semantic navs, alt text, focus rings present; numbered pagination 32px tap target (M-1) |
| AC-18 | Unit tests + e2e | PASS | stock/pagination/queries tests + e2e; 279 pass. e2e 404 test avoids status assertion (C-1) |

## Edge Case Verification
| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Empty taxonomy → empty state | HANDLED | `paginated-product-listing.tsx:44` |
| 2 | Out-of-stock still clickable, marked | HANDLED | `product-card.tsx:47,70-72` |
| 3 | Missing cover image → placeholder | HANDLED | `product-card.tsx:74-90` role=img + label |
| 4 | Nested category breadcrumb + tree | HANDLED | `buildCategoryCrumbs` + `walkAncestors`; nested ul |
| 5 | Brand null logo/desc | HANDLED | `brand-logo.tsx`; desc omitted (`index-tile.tsx:49`) |
| 6 | Invalid slug → 404 | PARTIAL | UI correct; HTTP status wrong (C-1) |
| 7 | Malformed ?page clamps | HANDLED | `parsePageParam` rejects abc/1.5/-1/1e3/0; unit-tested |
| 8 | Product in multiple categories, no dupes | HANDLED (untested count) | View + membership ids; no dedup-count test (M-4) |
| 9 | RLS/DB failure → error boundary | HANDLED | `fail()` logs server-side + throws to `[locale]/error.tsx` |
| 10 | Variant vs product stock mismatch | HANDLED | `effectiveStock` sums variants, ignores stale product stock; tested |

## Animation & Motion Review
- Easing: enter uses `--ease-out`; no `ease-in`. PASS
- Properties: only transform/opacity animated. PASS
- Duration: 160-200ms UI, 1600ms gated skeleton pulse. PASS
- Stagger cap: `min(index,5)*40ms` ≤200ms, resets per page. PASS
- Hover gating: `@media (hover:hover) and (pointer:fine)`. PASS
- Reduced motion: `.stagger`/`.card-lift`/`motion-safe:animate-pulse` all collapse. PASS
- Purpose: all motion justified; breadcrumb/pagination motion-light. PASS
No animation findings.

## Security / RLS Review
- Public client uses publishable (anon) key, `persistSession:false`, cookie-free. PASS (`public.ts`)
- Only `products_public` read; base `products` never queried (test asserts). PASS
- `cost_price_cents` absent from selects/types/payload/DOM. PASS
- anon RLS policies exist for brands/categories/styles/images/variants (`0005`). PASS
- Errors logged server-side only; generic message thrown to boundary. PASS

## Quality Score: 8/10
Clean, well-tested, convention-following, correct data/security/motion. Held back by one real SEO defect framed as "acceptable" (C-1), a doubled DB read (M-2), and a touch-target miss (M-1).

## Recommendation: REQUEST CHANGES
Fix C-1 (or convert it to an explicit, ticketed deferral WITH a corrected e2e status assertion) before this feeds T14. Address M-1 and M-2. M-3/M-4 and the minors can be backlogged. Do not ship the soft-404 silently under an "acceptable" label.
