# Architecture Review: T3 — Catalog browsing

## Summary

The catalog data-read layer is well-factored, correctly type-safe, and closes both routed backlog items cleanly. It is a **sound foundation for T4 (PDP), T6 (cart), and T14 (SEO)** — but the view+stitch read strategy is a **known wall for T5 filters/sorts on variant-level attributes (color/material) and for cross-page ordering by price/newest**, and that limit should be flagged to T5 now so it plans a DB-side (RPC / view) query path rather than trying to extend `queries.ts`.

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns | ✅ | Textbook. `queries.ts` reads/stitches, `stock.ts`/`pagination.ts` are pure compute, `types.ts` owns view models, components render, pages compose. `ProductCard` is a pure presentational server component with pre-resolved labels (no i18n inside — SRP). |
| Boundary validation | ✅ | `?page` parsed+clamped in `parsePageParam` (rejects `abc`/`1.5`/`-1`/arrays); slugs go through the parameterized query builder + `notFound()` on miss; stock coerced via `normalizeCount`. No unvalidated input reaches a query. |
| Typed contracts | ✅ | Public signatures fully typed; `CatalogProductCard`/`CatalogPage<T>` are the only shapes that escape the lib, so no `cost_price_cents`-bearing row leaks. One controlled `as unknown as` at the PostgREST embed boundary (documented). |
| Service layer | ✅ | Pages → `queries.ts` → `createPublicClient()`. No component touches Supabase; no business logic in components. Matches the `getStoreSettings` wrapper template from T2. |
| Type safety | ✅ | No `any`, no non-null `!`. `firstOrSelf` defensively normalizes the array/object embed ambiguity instead of asserting. |
| shadcn / token styling | ✅ | Token classes only (`bg-card`, `text-muted-foreground`, `--ease-out`), `cn()`, `Button asChild` on CTAs, hugeicons single set, motion via `.card-lift`/`.stagger` (transform/opacity, hover+reduced-motion gated). |
| i18n conventions | ✅ | New `catalog` namespace key-parallel in both dicts (parity enforced by tests); labels resolved once in the grid and passed down; single Spanish path segments per the routing decision. |

## Data Model Review

**No migration in T3 — correct.** T1 shipped the full schema; deferring `effective_stock` and a catalog-card view was the right call (avoids speculative DB surface on the critical path). Findings:

- **Read strategy is correctly forced by the grants.** `products_public` is the only anon-readable product path; `brands` embeds through the view's forwarded FK; `product_images`/`product_variants`/`product_categories` FK the base table so they are batch-fetched by `.in(product_id, ids)`. The stitch is O(1) queries per page (2 batches regardless of item count), not N+1. Sound.
- **Effective-stock split (lib vs deferred DB view, backlog m-2) is SAFE for T3, a DRIFT RISK for T6.** `stock.ts` computes variant-authoritative effective stock in the app layer purely for a *display badge*. That is fine — a badge being up to 5 minutes stale (ISR window) harms nothing. **But T6 cart needs *authoritative, race-safe* stock**, and if T6 re-implements "sum variants else product.stock" independently, the two code paths will drift. Route to T6: the cart must not read stock through this display path; the backlogged `effective_stock` view (or the atomic reservation RPC already backlogged for T7) is the single authority. `stock.ts` should be explicitly labeled "display-only, not authoritative."
- **Indexes are the real T5 gap (see Scalability).** `products` has indexes on `status`, `brand_id`, `style_id`, `is_best_seller`, `is_featured` — good for T3's filters and default sort. There is **no index on `price_cents`, `created_at`, or `sales_count`**, and **variant `color_hex`/`color_name` and product `material_frame/upholstery/finish` are unindexed**. T5's price/newest sorts and color/material filters will table-scan.

## API Review

No REST handlers (server components read directly) — appropriate for a read-only catalog and consistent with the codebase. Data-layer "API" review:

- **Function surface is clean and composable**: `listProducts`/`listProductsBy{Brand,Style,Category}` all funnel through `readProductPage(filter, rawPage, pageSize)` with a filter closure — a good seam. Adding a new *product-level* eq filter (e.g. availability by product row) is a one-line closure.
- **Count-then-range (M-2 fix) is the right shape**: a `head:true` count query resolves `lastPage`, clamps, then one `.range()` read. Never 416s, no double full read. Pagination is crawlable (`?page=N` real anchors, page-1-canonical). Good for T14.
- **Consistent error contract**: `fail()` logs server-side with context and throws an opaque message → route `error.tsx`. No Supabase error object reaches the DOM. `null` on slug miss → `notFound()`. Clean boundary.

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| **T5 variant-attribute filters (color/material) cannot compose on this foundation** | **High (for T5)** | Color lives on `product_variants`, materials on `products` scalar columns — neither is on `products_public`, and a variant-color filter must be applied *before* pagination (you can't page products then discover which have a red variant). The view+stitch model pages products first, so it structurally can't do this. **Flag to T5 now: build a server-side filtered/sorted query — a Postgres RPC or a `products_filterable` view that pre-joins variant color/material aggregates — so filtering + counting + ranging all happen in the DB.** Do not try to extend `queries.ts` client-side stitching for T5 filters. |
| **T5 price/newest/best-selling sorts need indexes** | **High (for T5)** | Sorting by `price_cents` / `created_at` runs in the DB across the full result set before `.range()`. The current `.order().range()` shape supports it, but there are **no indexes** on `price_cents`, `created_at`, `sales_count`. Add them in a T5 migration; without them every sorted page is a full sort scan. |
| **Category membership `.in(ids)` ceiling** | **Med (deferred)** | Already mitigated (capped at 1000, de-duped, logged) and backlogged. At 30-product seed it is fine. The correct long-term fix is the same DB-side query path T5 needs — so **T5 and this item should be solved together**, not twice. |
| **Cache-key cardinality explodes with T5 params** | **Med (for T5)** | Today the `unstable_cache` key includes only `?page` + pageSize + slug — bounded. T5 adds category×brand×style×price×color×material×availability×sort → a combinatorial key space that will thrash the cache (near-zero hit rate) and bloat the cache store. **T5 should NOT keep wrapping every filter combo in `unstable_cache`.** Options to flag: (a) tag-cache only the unfiltered/common views and let filtered queries hit the DB (cheap at this catalog size), or (b) move filtered browsing to client-side fetching against a cached RPC. Decide in T5 planning. |
| **`count: "exact"` on every read** | **Low** | Fine at 30 products; one extra count query per page. If the catalog grows large *and* filters land, revisit (estimated count, or cache the count under the tag). Note for T5, not T3. |
| **`?page` pages render `ƒ` dynamic** | **Low** | Honest, documented deviation. Cause is `searchParams`, not `cookies()` — the AC-11 target (kill the cookie taint) is fully met and the shell + index pages are `●` SSG/ISR. Data is tag-cached so no per-request DB storm. Full PPR needs Next 16 `cacheComponents` (bans `unstable_cache`) — correctly deferred. Acceptable long-term for T3; T5 param growth is the thing to watch. |

## Frontend / Component Architecture

- **`ProductCard` is a pure server component** — the correct default, but **T6 will need a client "add to cart" affordance on the card**. The seam is clean: the card is already a single `<Link>` wrapper with a self-contained content block. T6 should add cart interactivity as a *nested client island* (e.g. a `<QuickAddButton>` client component slotted into the card), NOT by converting `ProductCard` to `"use client"`. The current structure supports that without refactor. Flag to T6.
- **`Breadcrumbs` is T14-ready**: the doc comment already notes the ordered `items` array is the single source a future `BreadcrumbList` JSON-LD emitter consumes, and it explicitly does not build JSON-LD itself. Correct forward-planning.
- **Suspense-isolated `PaginatedProductListing`** keeps the shell static while the `?page` slice streams — good boundary design; the `read` closure prop makes it reusable across all four listing types.
- File sizes healthy: `queries.ts` at 712 lines is the largest and is approaching the ~400-line guidance. It is cohesive (one concern: catalog reads) but **T5 filter logic must not be piled into it** — that is when it should split (e.g. `queries/products.ts`, `queries/taxonomy.ts`). Note for T5.

## Tech Debt Ledger

| Item | Type | Impact | Effort to Fix | Owner |
|------|------|--------|---------------|-------|
| No DB-side filtered/sorted query path (view/RPC); view+stitch can't filter on variant color/material pre-pagination | Existing (surfaced) | High | L | **T5** |
| Missing indexes: `price_cents`, `created_at`, `sales_count`, variant `color_*`, product `material_*` | Existing (surfaced) | Med | S | **T5** |
| `unstable_cache` key cardinality under multi-param filtering | Introduced (latent) | Med | M | **T5** |
| Effective-stock computed in app layer (display) vs. no authoritative DB view; drift risk when cart reads stock | Existing (backlogged m-2) | Med | M | **T6/T7** |
| Card is pure server component; needs client-island seam for add-to-cart | Neutral (by design) | Low | S | **T6** |
| Category `.in(ids)` unbounded pattern (capped, backlogged) | Introduced (mitigated) | Low | M | **T5 (fold into DB query path)** |
| `queries.ts` size (712 lines) will exceed guidance if T5 logic is added | Neutral | Low | S | **T5** |

Net: T3 **reduced** debt (closed 2 backlog items — PostgREST embedding strategy standardized, cookie taint eliminated) and **introduced** no unmanaged debt — every new limit is documented and routed. No time bombs; the `.in()` cap and the ISR staleness are bounded and logged.

## Refactors Applied

None. This stage is review-only on `src/` (Stage 9 owns fixes this cycle). No code changed; only this artifact and (append-only) `tasks/clean-code-backlog.md` were written. The findings above are routed to owning tasks rather than fixed here — none are T3 defects (T3 explicitly scopes out filters/sorts/cart).

## System Boundaries

Clean. The cookie-free read client is a distinct, documented boundary (`public.ts`, marked "not for authenticated access"); `server-only` guards the lib; view models are the only cross-boundary shape; error propagation is one-way (log server-side, opaque throw to boundary). No circular deps. The `NEXT_PUBLIC_` publishable key is RLS-gated and correctly the only client-exposed credential.

## Architecture Score: 8.5/10

Will this make sense in 6 months with 2× the team? **Yes.** The layering is disciplined, every non-obvious decision carries an evidence-bearing comment, and the forward-looking seams (breadcrumb JSON-LD source, card link wrapper, filter-closure query shape) are real, not decorative. The 1.5-point deduction is entirely about T5: the view+stitch strategy is presented as "the ONE standardized shape every catalog read uses," which is true for T3 but will mislead a T5 developer into extending it for variant-attribute filters — where it hits a hard wall. That expectation should be corrected in the query-layer doc and in T5 planning before T5 starts.

## Recommendation: **APPROVE** (sound)

Approve T3 as shipped. No changes required in T3 scope. Mandatory follow-ups routed to owning tasks (see `tasks/clean-code-backlog.md`): T5 must adopt a DB-side filtered/sorted query path with supporting indexes and a deliberate cache strategy rather than extending the T3 stitch; T6/T7 must treat `stock.ts` as display-only and read authoritative stock through the deferred DB view / reservation RPC.
