# Task: T3 — Catalog browsing

## Priority

**High** — T3 is the first shopper-facing surface with real product data and it unblocks T4 (PDP), T5 (search/filters), and T6 (cart). The shell (T2) and data foundation (T1) are shipped but there is currently no way to browse the 30 seeded products; every nav link (`/sillas`, `/marcas`, `/estilos`) is a dead 404 today. T3 is the critical path for the entire storefront.

## Complexity

**medium (leaning high)** — Justified against the criteria:

- It is a **new subsystem** (catalog): new data-read layer (`src/lib/catalog/*`), new cookie-free anon Supabase client, 5+ new route trees, ~12+ new files created and ~4 modified. That pushes past "low".
- It requires an **architectural refactor** (make catalog pages statically optimizable by removing `cookies()` from the render path + adding tag-based revalidation) and it standardizes a **new data-read pattern** (the PostgREST-view embedding decision). Those are high-complexity signals.
- BUT it introduces **no new external integration**, **no new data model / migration** (T1 shipped the full schema — see Data Model Changes), and it **follows every existing convention** (next-intl routing, server components, `cn()`, token utilities, `formatMXN`, motion tokens). That keeps it out of "high".

Net: classify **medium**; the static-render refactor and read-strategy decision are the two elements that warrant extra review scrutiny.

## Feature Type

**full-feature** — it has both a real UI surface (product grid, cards, category/brand/style pages, breadcrumbs, stock badges, pagination) AND a real data-read layer (typed catalog queries against Supabase). All pipeline stages run at full depth.

## User Story

As a **Mexican shopper browsing on my phone**, I want to **browse the full chair catalog and drill into categories, brands, and styles with clear stock signals and page navigation**, so that **I can find candidate chairs to view in detail (T4) without needing a search box (T5) yet.**

## Background

- **What exists today:** T1 shipped the full catalog schema (`brands`, `categories` [self-nesting via `parent_id`], `styles`, `products`, `product_variants`, `product_images`, `product_categories` M2M) with RLS, the `products_public` view (omits `cost_price_cents`), and a seed of **30 products / 69 variants / 129 images (1 primary product image + 1 per variant) / 5 brands / 6 categories (1 nested: `ejecutivas` under `oficina`) / 6 styles / 8 tags**. T2 shipped the shell (`[locale]/layout.tsx`, header/footer/mobile-nav), next-intl routing (`es-MX` default unprefixed, `en` under `/en`, `localePrefix: "as-needed"`), the motion token system in `globals.css`, and the `store_settings` read.
- **What is missing:** Every catalog route is a dead link caught by `[locale]/[...rest]/page.tsx` → localized 404. `NAV_ITEMS` already declares the canonical locale-agnostic paths `/sillas` (catalog), `/marcas` (brands), `/estilos` (styles) — T3 must fulfill exactly these. There is no data-read layer for the catalog and no way to render a product.
- **Why it matters:** Nothing can be sold until shoppers can browse. T4/T5/T6 all sit behind T3.
- **Two backlog items are explicitly routed here and MUST be resolved (see `tasks/clean-code-backlog.md`):**
  1. **PostgREST embedding through `products_public` (MED risk)** — standardize the catalog-read strategy. **Decision (evidence in research report): read the list via `products_public` and embed `brands`/`styles` through it (the view carries those two FKs forward — confirmed in `database.types.ts:849-862`), but fetch `product_images`, `product_variants`, and `product_categories` in separate batched queries keyed by product id — because their FK targets the base `products` table, not the view, so they are NOT embeddable from `products_public`.**
  2. **Fully dynamic shell defeats static catalog rendering (T3/T4)** — `getStoreSettings()` → `createClient()` (`server.ts:16`) → `cookies()` in `[locale]/layout.tsx:66` forces every route dynamic. **Decision: add a cookie-free anon read client (`createPublicClient()`) and a cookie-free `getStoreSettingsStatic()`; catalog data reads use the cookie-free client wrapped in `unstable_cache` with per-entity cache tags + a time-based `revalidate`, so catalog pages become statically optimized / ISR.**
- **Effective-stock read path:** per-variant stock is authoritative; product-level `stock` is the fallback for the no-variant case (documented in `0002_catalog.sql:112-116`). The card stock badge must compute effective stock from variants when present, else the product row.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

- [ ] **AC-1 (Catalog grid):** `GET /sillas` (ES) and `GET /en/sillas` (EN) render a responsive product grid of all `status='active'` products, showing per card: cover image, product name, brand name, and formatted MXN price via `formatMXN`. No product exposes `cost_price_cents` anywhere in the payload or DOM.
- [ ] **AC-2 (Category listing page):** `GET /categorias/[slug]` (ES) / `GET /en/categorias/[slug]` (EN) renders the category name + description and a grid of products in that category (via `product_categories`). The parent category page (`oficina`) surfaces products assigned to it (including `ejecutivas` children, which are seeded into both `oficina` and `ejecutivas`).
- [ ] **AC-3 (Category index):** `GET /categorias` / `GET /en/categorias` lists all active categories with nesting reflected (children shown under/indented within their parent `oficina`).
- [ ] **AC-4 (Brand page):** `GET /marcas/[slug]` / `GET /en/marcas/[slug]` renders the brand **logo** (or a typographic fallback when `logo_url` is null — all 5 seeded brands have null `logo_url`), the brand **name**, the brand **description**, and a grid of that brand's products.
- [ ] **AC-5 (Brand index):** `GET /marcas` / `GET /en/marcas` lists all 5 active brands (logo/fallback + name + description) linking to each brand page.
- [ ] **AC-6 (Style page + index):** `GET /estilos` / `GET /en/estilos` lists all 6 active styles; `GET /estilos/[slug]` renders the style name + description + a grid of products with that `style_id`.
- [ ] **AC-7 (Breadcrumbs):** Every catalog detail page renders an accessible breadcrumb (`<nav aria-label>` + ordered list) derived from the route + fetched entity — NOT hardcoded. Category breadcrumbs reflect nesting (`Inicio / Categorías / Oficina / Ejecutivas`). The last crumb is the current page and is not a link (`aria-current="page"`).
- [ ] **AC-8 (Stock indicator — exact copy):** Each product card shows exactly one stock state using effective stock (variant-authoritative, product fallback): **"En stock" / "In stock"** when effective stock `> LOW_STOCK_THRESHOLD`; **"Solo quedan {n}" / "Only {n} left"** when `1 ≤ effective stock ≤ LOW_STOCK_THRESHOLD`; **"Agotado" / "Out of stock"** when effective stock `= 0`. Effective stock for the badge = sum of variant stock when variants exist, else product `stock`.
- [ ] **AC-9 (Pagination — crawlable):** Grids paginate at `PRODUCTS_PER_PAGE` per page using real URL query params (`?page=N`) rendered as real `<a href>`/`Link` (SEO-crawlable, works with JS disabled). Page 1 is canonical without `?page=1`. Prev/next and numbered links are present; current page is marked `aria-current="page"`.
- [ ] **AC-10 (i18n both locales):** Every new page renders correctly in both `es-MX` (no prefix) and `en` (`/en` prefix). All UI chrome strings (breadcrumb root, stock copy, pagination labels, empty/error copy, "N colores") come from a new `catalog` message namespace in both `es-MX.json` and `en.json` — no hardcoded UI text. Product content (names, descriptions) stays in seeded Spanish (no product translation lookup in T3).
- [ ] **AC-11 (Static rendering):** Catalog list/category/brand/style pages are statically optimized or ISR — they do NOT render on-demand due to `cookies()`. `next build` reports them as static/ISR (not `ƒ` dynamic). `getStoreSettings` no longer forces the whole shell dynamic (cookie-free read path added).
- [ ] **AC-12 (PDP link strategy):** Every product card links to the canonical PDP route `/producto/[slug]` (ES) / `/en/producto/[slug]` (EN) using the locale-aware `Link`. This route is owned by T4 and MAY 404 until T4 ships (rendering the localized in-shell 404 via the existing catch-all) — T3 does NOT stub a fake PDP.
- [ ] **AC-13 (Read strategy — no cost leak, no view-embed error):** Catalog reads use `products_public` (never base `products`). Brand/style are embedded through the view; images, variants, and category joins are fetched separately (no PostgREST "could not find a relationship" error). Verified: the network payload for `/sillas` contains no `cost_price_cents`.
- [ ] **AC-14 (Invalid slug → 404):** A category/brand/style slug that does not exist (or is inactive) calls `notFound()` and renders the localized in-shell 404. A malformed/out-of-range `?page` (e.g. `?page=999`, `?page=0`, `?page=abc`) clamps to a valid page deterministically and never crashes.
- [ ] **AC-15 (Image handling):** Product cover images use `next/image` with a fixed aspect ratio, a `sizes` attribute matching the responsive grid, and a placeholder UI when a product has no image. Above-the-fold first-row images may use `priority`. `picsum.photos` and the Supabase Storage host remain the only allowed `next/image` remote hosts (unchanged `next.config.ts`).
- [ ] **AC-16 (Empty state):** A category/brand/style with zero active products renders a localized empty state (not a blank grid, not an error), with a link back to the full catalog.
- [ ] **AC-17 (Accessibility & responsiveness):** All pages are keyboard navigable, cards have accessible names, images have `alt` text (from `product_images.alt_text` or product name), breadcrumb/pagination are semantic `<nav>`s, and the grid reflows cleanly at 375px, 768px, and desktop with no horizontal scroll.
- [ ] **AC-18 (Tests):** Unit tests cover the effective-stock/stock-badge logic and pagination math; the catalog data-lib functions have tests (mocked Supabase) for the read shape; at least one e2e spec browses `/sillas`, opens a category, and paginates in both locales.

## Edge Cases

1. **Empty category / brand / style** — a taxonomy entity with zero active products → render the localized empty state (AC-16) with a "ver todo el catálogo" link; do NOT 404 (the entity exists), do NOT render an empty grid with no explanation.
2. **Out-of-stock product** — effective stock 0 → card shows "Agotado" / "Out of stock" badge, remains clickable to its PDP (browsing an out-of-stock product is allowed; purchase blocking is T6), image is visually marked but not hidden.
3. **Missing cover image** — a product with no `is_primary` image row (data drift) → card renders a neutral placeholder block with the product name as accessible label; never a broken `<img>` or layout shift.
4. **Nested category** — `ejecutivas` (child of `oficina`): the `ejecutivas` page shows its products; the `oficina` page shows products assigned to `oficina` (which includes `ejecutivas` products, since the seed assigns them to both — see `products.ts:155-156`). Breadcrumb on the child = `Inicio / Categorías / Oficina / Ejecutivas`. The category index indents children under their parent.
5. **Brand with no description / no logo** — all 5 seeded brands have `logo_url = null`; the brand page/card must render a typographic logo fallback (brand initial or wordmark) and must not render an empty description block when `description` is null.
6. **Invalid slug → 404** — `/categorias/no-existe`, `/marcas/fantasma`, `/estilos/xyz`, or an inactive entity → `notFound()` → localized in-shell 404 (never a blank page, never leaking a Supabase error).
7. **Page number out of range / malformed** — `?page=0`, `?page=999`, `?page=-1`, `?page=abc`, `?page=1.5` → clamp to page 1 (or last valid page) deterministically; the grid never crashes and pagination controls never render a link to a non-existent page.
8. **Product in multiple categories** — `ejecutivas` products belong to both `oficina` and `ejecutivas` → the product appears on BOTH category pages; per-category pagination counts must be correct; no duplicate card within a single category page.
9. **RLS denial / DB unreachable degradation** — if the anon read fails (RLS misconfig, network, missing env) the page degrades to the localized error boundary (`[locale]/error.tsx`) — never a stack trace, raw Supabase error object, or white screen.
10. **Variant vs product stock mismatch** — a product whose base `stock` disagrees with the sum of its variants → the badge uses variant-authoritative stock (sum of variants) when variants exist, ignoring the stale product-level `stock`; never shows "En stock" when all variants are 0.

## Error States Table

| Trigger | User Sees | System Does |
| ------- | --------- | ----------- |
| Catalog list query fails (RLS/network/env) | Localized error panel with Retry (via error boundary) | Throw to `[locale]/error.tsx`; log full error server-side with context; never leak the Supabase error to the DOM |
| Category/brand/style slug not found or inactive | Localized in-shell 404 ("Página no encontrada") | `notFound()` → `[locale]/not-found.tsx`; no DB error surfaced |
| `?page` out of range / malformed | Page 1 grid (clamped) | Parse+clamp page param to `[1, lastPage]`; malformed → treat as page 1 |
| Valid taxonomy entity with zero products | Localized empty state with "ver todo el catálogo" CTA | Render empty state; do not `notFound()` (valid state) |
| Product missing cover image | Neutral placeholder tile with product name | Card selects `is_primary` image; on none, first image by `sort_order`; on none, placeholder component |
| Image host 404 / slow (picsum) | Reserved aspect-ratio box; no layout shift | Fixed width/height + `sizes`; optional blur placeholder; no CLS |
| PDP link clicked before T4 ships | Localized in-shell 404 | `/producto/[slug]` unmatched → existing `[locale]/[...rest]` catch-all → `notFound()` |
| Both `es-MX` and `en` requested | Correct locale strings + correct URL prefix | next-intl resolves via segment; `catalog` namespace keys present in both dictionaries |

## UX Requirements

Motion vocabulary uses the exact terms from `.claude/skills/emil-design-eng` and `.claude/skills/apple-design`, consistent with the tokens already in `globals.css` (`--ease-out: cubic-bezier(0.23,1,0.32,1)`, `@starting-style` entrances, transform/opacity only, hover gated behind `@media (hover:hover) and (pointer:fine)`).

- **Loading:** Route-level `loading.tsx` shows a **skeleton grid** of card-shaped placeholders (image box + two text bars) matching the real grid columns and aspect ratio (no layout shift on swap). Subtle `--muted` pulse, NOT a spinner. Emil rule: reserve exact space; never pop content in from `scale(0)`.
- **Empty:** Centered localized message ("No hay sillas en esta categoría todavía." / "No chairs in this category yet.") + a `Button asChild` linking to `/sillas`. Uses the existing `.enter-fade` entrance (opacity + `translateY(8px)` via `@starting-style`, 200ms `--ease-out`).
- **Error:** Falls through to the existing `[locale]/error.tsx` boundary (localized, `role="alert"`, Retry, opaque `digest` only — no stack trace). Reuse the shell's boundary; no new error UI invented.
- **Success:** Grid of product cards. Cards enter with a **staggered fade + rise** ("stagger", each card an `.enter-fade`-style entrance with a small incremental delay, transform/opacity only, dropped under `prefers-reduced-motion`). Card hover (hover-capable pointers only): image scales a hair (`scale(1.02)`, `--ease-out`, ≤200ms) and/or a subtle shadow lift — never `transition: all`, never on touch. Card press: `:active { transform: scale(0.99) }` for instant feedback (Emil "respond on pointer-down"). Pagination navigates to a new URL; the next `loading.tsx` skeleton bridges the transition.
- **Mobile (375px):** Grid is **2 columns** (compact) or 1 (decided in UI-design stage), ≥44px tap targets on cards/crumbs/pagination. Breadcrumb collapses to root + current with horizontal-scroll suppressed. Pagination shows Prev/Next + "Página X de Y", not every numbered page. No horizontal page scroll.
- **Tablet (768px):** Grid is **3 columns**. Breadcrumb shows the full trail. Pagination shows a windowed set of numbered pages + Prev/Next.
- **Reduced motion:** All card stagger/hover/press motion collapses to opacity-only or none under `@media (prefers-reduced-motion: reduce)`, matching the established `globals.css` pattern.

## Technical Approach

### Files to Create

- `src/lib/supabase/public.ts` — **cookie-free** anon Supabase client (`createPublicClient()`) via `createClient` from `@supabase/supabase-js` (NOT `@supabase/ssr`) with the publishable key + `{ auth: { persistSession: false, autoRefreshToken: false } }`. No `cookies()` → safe for static rendering. Read client for ALL catalog queries.
- `src/lib/catalog/queries.ts` — typed catalog data layer: `listProducts`, `listProductsByCategory`, `listProductsByBrand`, `listProductsByStyle`, `getBrand`, `getCategory` (+ ancestor chain), `getStyle`, `listBrands`, `listCategories` (tree), `listStyles`. Each read wrapped in `unstable_cache` with tags (`catalog`, `brand:<slug>`, `category:<slug>`, `style:<slug>`) + `revalidate`. Implements the read strategy: query `products_public`, embed `brands(name,slug,logo_url)` + `styles(name,slug)` via the view FKs, then batch-fetch `product_images` (cover), `product_variants` (stock/color count), `product_categories` by product id, and stitch in code.
- `src/lib/catalog/stock.ts` — `effectiveStock(product, variants)` + `stockState(effective): "in" | "low" | "out"` using `LOW_STOCK_THRESHOLD`. Pure, unit-tested.
- `src/lib/catalog/types.ts` — stitched view models: `CatalogProductCard` (id, slug, name, brandName, priceCents, coverImageUrl, coverAlt, colorCount, stockState, lowStockN), `CatalogPage<T>` (items, page, pageSize, total, lastPage). Fully typed, no `any`.
- `src/lib/store-settings.ts` (extend) — add `getStoreSettingsStatic()`: reads `store_settings` via the cookie-free client, `unstable_cache`d with tag `store-settings`. Used by the layout so the shell no longer forces dynamic. Keep the existing `getStoreSettings` for cookie-aware callers if any remain.
- `src/components/catalog/product-card.tsx` — server-component card (`next/image`, name, brand, `formatMXN` price, `StockBadge`, link to PDP via `Link`).
- `src/components/catalog/product-grid.tsx` — responsive grid wrapper + staggered entrance.
- `src/components/catalog/stock-badge.tsx` — three stock states with `catalog` namespace copy.
- `src/components/catalog/breadcrumbs.tsx` — reusable accessible breadcrumb (`<nav aria-label>` + `<ol>`, `aria-current="page"` on last crumb). Accepts `{ label, href? }[]`.
- `src/components/catalog/pagination.tsx` — crawlable pagination (real `Link` hrefs with `?page=N`, windowed numbers on tablet+, Prev/Next + count on mobile, `aria-current`).
- `src/components/catalog/brand-logo.tsx` — brand logo with typographic fallback when `logo_url` is null.
- `src/components/catalog/empty-state.tsx` — localized empty state with catalog CTA.
- `src/app/[locale]/sillas/page.tsx` + `loading.tsx` — catalog grid + skeleton.
- `src/app/[locale]/categorias/page.tsx` — category index (tree).
- `src/app/[locale]/categorias/[slug]/page.tsx` + `loading.tsx` — category page.
- `src/app/[locale]/marcas/page.tsx` — brand index.
- `src/app/[locale]/marcas/[slug]/page.tsx` + `loading.tsx` — brand page.
- `src/app/[locale]/estilos/page.tsx` — style index.
- `src/app/[locale]/estilos/[slug]/page.tsx` + `loading.tsx` — style page.
- `src/lib/catalog/stock.test.ts`, `src/lib/catalog/queries.test.ts` — unit tests.
- `e2e/catalog.spec.ts` — e2e browse/category/paginate in both locales.

### Files to Modify

- `src/app/[locale]/layout.tsx` — swap `getStoreSettings()` (line 66) for `getStoreSettingsStatic()` (cookie-free) so the shell stops forcing every route dynamic (AC-11). No visual change.
- `src/lib/config.ts` — add centralized constants: `PRODUCTS_PER_PAGE` (recommend **12** — divisible by 2/3/4 grid columns), `LOW_STOCK_THRESHOLD` (recommend **5**), `CATALOG_REVALIDATE_SECONDS`, and route-segment constants for the PDP/catalog links so the linking strategy is single-sourced (Rule 4).
- `src/messages/es-MX.json` + `src/messages/en.json` — add a `catalog` namespace: grid/empty/error copy, stock states (`inStock`, `lowStock` with `{count}`, `outOfStock`), pagination (`previous`, `next`, `pageOf` with `{page}`/`{total}`), breadcrumb roots (`home`, `categories`, `brands`, `styles`), `colorsCount` (`{count} colores`). Keep both dictionaries key-parallel (`keys-used.test.ts` + `messages.test.ts` enforce parity).
- `tasks/clean-code-backlog.md` — check off the two T3 backlog items (embedding strategy, static-render fix) once implemented.

### Data Model Changes

**NONE.** T1 shipped the complete catalog schema and RLS. T3 adds **no migration**. Explicitly considered and rejected:

- An `effective_stock` view/column (backlog "Effective-stock read path"): **NOT added in T3.** T3 computes effective stock in the typed data layer (`stock.ts`) from the already-granted `product_variants` rows. A DB view is only warranted when cart/inventory logic lands (T6/T7); adding it now would be speculative. Remains a documented deferred item.
- A new "catalog card" view that pre-joins images/brand/category: **NOT added in T3.** The separate-query stitch (see read strategy) works within the existing grants and avoids a migration on the critical path. Revisit only if profiling shows the batch reads are a bottleneck.

### API / Data-Layer Functions

No REST/route handlers (server components read directly). Signatures in `src/lib/catalog/queries.ts`:

- `listProducts(opts): Promise<CatalogPage<CatalogProductCard>>` — `products_public` with `brands(...)`/`styles(...)` embedded + `.range()` pagination + `count: "exact"`; then batch image/variant/category fetch; default order `is_best_seller desc, sales_count desc, name asc` (stable — real sort is T5).
- `listProductsByCategory/Brand/Style(slug, opts)` — same, filtered (`brand_id`/`style_id` eq, or product ids from `product_categories` for category); 404 if the taxonomy entity is missing/inactive.
- `getCategory(slug) → { category, ancestors }`, `getBrand(slug)`, `getStyle(slug)`, `listCategories() → tree`, `listBrands()`, `listStyles()` — for pages, indexes, and breadcrumbs.

### Dependencies

- **No new npm packages.** Present and used: `@supabase/supabase-js` (cookie-free client), `next/image`, `next-intl`, `@hugeicons/react` + `@hugeicons/core-free-icons`, shadcn `Button`, `cn()`. `unstable_cache`/`revalidateTag` are Next built-ins.
- Uses existing `formatMXN` (`src/lib/money.ts`), motion tokens (`globals.css`), and `Link` from `@/i18n/navigation`.
- Env: existing `NEXT_PUBLIC_*` publishable key via `getPublicEnv` — no new env vars.

## Out of Scope

- **T4 — Product detail page.** T3 only LINKS to `/producto/[slug]` (ES) / `/en/producto/[slug]` (EN); T4 owns that route. No image gallery, variant selector, specs, or Q&A. The PDP link may 404 until T4.
- **T5 — Search, filters, sorting.** NO keyword search box, NO filter sidebar (category/brand/style/price/color/material/availability), NO sort dropdown, NO no-results page. T3 ships a fixed default order only.
- **T6 — Cart.** No add-to-cart, no cart affordance on cards, no free-shipping progress.
- **T13 — Homepage / static pages.** No hero, featured strip, or collections. The existing minimal homepage is untouched.
- **Phase 2/3 & SKIP items:** collections, product reviews, comparison, related-products strip, mini-cart, back-in-stock — none.
- **Product content translation.** Product names/descriptions stay in seeded Spanish; no `translations`-table content lookup in T3 (only UI chrome is bilingual).
- **New migrations / DB views** (effective_stock, catalog-card view) — deferred as documented above.
