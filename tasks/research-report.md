# Research Report: T3 — Catalog browsing

## Headline Deliverables (read these first)

### (a) Catalog-read strategy — DECISION WITH RLS/GRANT EVIDENCE

**Decision:** Read the catalog list through the `products_public` **view**, embedding `brands` and `styles` **through the view's forwarded FKs**, and fetch `product_images`, `product_variants`, and `product_categories` via **separate batched queries keyed by product id**, stitched in the typed data layer. Do NOT attempt to embed images/variants/category-joins through `products_public`.

**Why — the grant evidence (`supabase/migrations/0005_rls_policies.sql`):**

- Line 55: `revoke all on all tables in schema public from anon, authenticated;` — hard baseline, everything denied.
- Lines 66-77: `grant select on brands / categories / styles / tags / product_categories / product_tags / product_variants / product_images / store_settings ... to anon, authenticated;` — these child/taxonomy tables ARE directly readable by anon.
- Line 66 comment + absence from the grant list: **the base `products` table is deliberately NOT granted to anon.** ("`products` (the base table) is deliberately NOT granted to anon/authenticated — the public path reads `products_public` (view) which omits cost_price_cents.")
- Line 116-146: `create view products_public as select <columns except cost_price_cents> from products where status = 'active'; grant select on products_public to anon, authenticated;` — anon's ONLY path to product rows is the view, which structurally omits `cost_price_cents` and pre-filters to active.
- RLS row policies (lines 155-201) further gate every child table to active products via the `is_active_product(uuid)` SECURITY DEFINER helper (lines 90-102), so anon reading `product_variants`/`product_images` directly still only sees rows for active products — no leak.

**Why the embedding split is forced (evidence from `src/lib/supabase/database.types.ts`):**

- `products_public` view type (lines 849-862) carries FK relationships for `brand_id → brands` and `style_id → styles`. Because these FKs are surfaced on the view, PostgREST CAN resolve `products_public?select=*,brands(name,slug,logo_url),styles(name,slug)`. This is the supported embed.
- Child tables' FK relationships (`product_variants` line 356-363, `product_images` line 393-ish, `product_categories` line 276-289) all declare `referencedRelation: "products"` — the **base table**, NOT `products_public`. PostgREST embeds resolve along FK relationships; there is no FK from these children to the view, so `products_public?select=*,product_images(*)` fails with a "could not find a relationship" error. Hence images/variants/joins must be a second query filtered by `product_id in (...)`.

**Concrete query shape (in `src/lib/catalog/queries.ts`):**

```
// 1) page of products + embedded brand/style (through the view)
const { data: rows, count } = await db
  .from("products_public")
  .select("id,slug,name,price_cents,compare_at_price_cents,is_best_seller,sales_count,brand_id,style_id,brands(name,slug,logo_url),styles(name,slug)", { count: "exact" })
  .order("is_best_seller", { ascending: false })
  .order("sales_count", { ascending: false })
  .order("name", { ascending: true })
  .range(from, to);

const ids = rows.map(r => r.id);

// 2) cover images for those products (separate query — child FK points at base table)
const { data: images } = await db
  .from("product_images")
  .select("product_id,url,alt_text,is_primary,sort_order")
  .in("product_id", ids)
  .order("is_primary", { ascending: false })
  .order("sort_order", { ascending: true });

// 3) variants for stock + color count (separate query)
const { data: variants } = await db
  .from("product_variants")
  .select("product_id,stock,color_hex")
  .in("product_id", ids);

// stitch: cover = first image with is_primary else lowest sort_order; effectiveStock from variants
```

This is the standardized pattern every catalog read uses. It closes backlog item 1.

### (b) Static-rendering fix — DESIGN

**Root cause (evidence):** `src/app/[locale]/layout.tsx:66` calls `await getStoreSettings()`; `src/lib/store-settings.ts:39` calls `await createClient()`; `src/lib/supabase/server.ts:16` calls `await cookies()`. Any `cookies()` access in the render tree opts the whole route out of static rendering and forces on-demand (`ƒ`) rendering — so every page under the shell is dynamic, defeating static catalog rendering.

**Design:**

1. **New cookie-free client** `src/lib/supabase/public.ts`:
   ```
   import { createClient } from "@supabase/supabase-js";  // NOT @supabase/ssr
   import { getPublicEnv } from "@/lib/env";
   export function createPublicClient() {
     const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
     return createClient<Database>(supabaseUrl, supabasePublishableKey, {
       auth: { persistSession: false, autoRefreshToken: false },
     });
   }
   ```
   No `cookies()` — RLS still applies (publishable/anon key), and anon can only ever read the public catalog per 0005.
2. **Cookie-free settings read** — add `getStoreSettingsStatic()` to `src/lib/store-settings.ts` that uses `createPublicClient()` and wraps the read in `unstable_cache(fn, ["store-settings"], { tags: ["store-settings"], revalidate: CATALOG_REVALIDATE_SECONDS })`. Keep the graceful-degrade-to-null contract.
3. **Layout swap** — `layout.tsx:66` becomes `const settings = await getStoreSettingsStatic();`. No other change; `storeName` fallback logic is unchanged. The shell no longer touches cookies, so pages become static/ISR.
4. **Catalog reads** use `createPublicClient()` + `unstable_cache` with per-entity tags (`catalog`, `brand:<slug>`, `category:<slug>`, `style:<slug>`) and `revalidate: CATALOG_REVALIDATE_SECONDS`. Admin CRUD (T10) will call `revalidateTag(...)` to bust the relevant page — the tag vocabulary is designed here so T10 slots in.
5. **Caveat to verify at dev stage:** `unstable_cache` cannot wrap a function that itself reads `cookies()`/`headers()` — the cookie-free client guarantees this. Also confirm the pages don't otherwise opt into dynamic (`searchParams` for `?page` is fine and keeps the page static per-param under ISR; if Next treats `searchParams` as dynamic, the page still benefits from the shell being static and the data being tag-cached).

This closes backlog item 2.

### (c) i18n routing — RECOMMENDATION

**Recommendation: keep a single set of Spanish, locale-agnostic path segments** (`/sillas`, `/marcas`, `/marcas/[slug]`, `/estilos`, `/estilos/[slug]`, `/categorias`, `/categorias/[slug]`, `/producto/[slug]`), served unprefixed in `es-MX` and under `/en/...` in English via the existing `localePrefix: "as-needed"`. Do **NOT** introduce next-intl `pathnames` (localized `/categories` vs `/categorias`) in T3.

**Evidence / justification:**

- `src/components/layout/nav-items.ts:19-22` already hardcodes the canonical Spanish segments `/sillas`, `/marcas`, `/estilos`, `/contacto` as **locale-agnostic** hrefs, and `navigation.ts` adds the `/en` prefix automatically. T3 must fulfill exactly these — introducing localized pathnames would break the nav contract.
- `routing.ts:26` uses `localePrefix: "as-needed"`; `navigation.ts` comment confirms `<Link href="/sillas">` → `/sillas` (ES) and `/en/sillas` (EN). English pages are still distinct crawlable URLs (good for SEO / T14) without a second pathname map to maintain.
- **Slugs stay Spanish and stable** (they are seeded Spanish: `ergovita`, `oficina`, `ejecutiva`, etc., and `0006` enforces the canonical lowercase-ascii slug shape). Only the *path segment* differs by locale — and here we keep even that constant. Localizing slugs would require a translation lookup + redirect map that is explicitly "T3+/T5" territory and out of scope.
- The nav uses `/sillas` (catalog) but there is no `/categorias` nav item; `/categorias` is a new index route T3 introduces (reachable from breadcrumbs / category cards). Its segment stays Spanish for consistency with the rest.
- **Enumerated routes (both locales):** catalog `/sillas`; category index `/categorias`; category `/categorias/[slug]`; brand index `/marcas`; brand `/marcas/[slug]`; style index `/estilos`; style `/estilos/[slug]`; (PDP, T4) `/producto/[slug]`. English variants are the same with a `/en` prefix.

---

## Codebase Analysis

### Existing Patterns

- **Server-component page + `setRequestLocale` + `getTranslations`** — `src/app/[locale]/page.tsx:18-22`. Every catalog page follows this: `await params`, `setRequestLocale(locale)`, `getTranslations("catalog")`. Reuse verbatim.
- **Locale-aware `Link`** — `src/i18n/navigation.ts:16`. Cards/breadcrumbs/pagination use this `Link` (not `next/link`) so the `/en` prefix is automatic. Reuse.
- **Graceful-degrade typed data wrapper** — `src/lib/store-settings.ts:36-71`. The catalog queries follow the same shape: explicit column select, typed row, log-with-context on error, return a safe value (or throw to the error boundary for a hard failure). `React cache()` for per-request dedup where the same read is used twice in a render.
- **Centralized non-secret config** — `src/lib/config.ts`. `PRODUCTS_PER_PAGE`, `LOW_STOCK_THRESHOLD`, `CATALOG_REVALIDATE_SECONDS`, route segments go here (Rule 4). `SEED_IMAGE_BASE_URL` (picsum) already lives here.
- **MXN formatting boundary** — `src/lib/money.ts:26` `formatMXN(cents)`. The ONLY place cents → display string. Cards call it; never format money inline.
- **Token-only styling + `cn()`** — `globals.css` (`:root` tokens, brand-swap seam) + `src/components/ui/button.tsx`. No hardcoded colors; grids/cards use `bg-card`, `text-muted-foreground`, `border-border`, `rounded-md`, `--ease-out`.
- **Motion via CSS transitions + `@starting-style`, transform/opacity only, hover gated** — `globals.css:242-380` (`.fab-pop` pop-in, `.enter-fade`, `.link-arrow` directional hint, `.nav-hover`, all with `prefers-reduced-motion` fallbacks). Card stagger/hover reuses this exact vocabulary and easings.
- **In-shell 404 via catch-all + `notFound()`** — `src/app/[locale]/[...rest]/page.tsx` + `[locale]/not-found.tsx`. Invalid slugs call `notFound()`; the PDP link 404s here until T4. Real routes take precedence over the catch-all as they're added.
- **Client error boundary** — `src/app/[locale]/error.tsx` (localized, no stack leak). Catalog hard failures throw to it.
- **shadcn `Button` with `asChild`** — `src/components/ui/button.tsx`. Empty-state CTA and pagination controls use it.
- **Icons** — `@hugeicons/react` + `@hugeicons/core-free-icons` only (e.g. `ArrowRight01Icon` in `page.tsx:5`). Never mix icon sets.

### Relevant Files

| File | Purpose | Relevance | Action |
| ---- | ------- | --------- | ------ |
| `supabase/migrations/0002_catalog.sql` | Catalog schema, stock authority comment (112-116), M2M joins, image cover flags | Defines every column the cards/pages read | Reference |
| `supabase/migrations/0005_rls_policies.sql` | Grants + RLS: `products` NOT granted, children + view ARE | THE evidence for the read strategy | Reference |
| `supabase/migrations/0006_data_integrity_hardening.sql` | Slug format constraint, non-blank names, bounded text | Slugs are safe URL tokens; names never blank | Reference |
| `src/lib/supabase/database.types.ts` | Generated types incl. `products_public` view FKs (849-862) & child FKs → base table | Confirms embed-via-view for brand/style, split for children; types the data layer | Reference |
| `src/lib/supabase/server.ts` | Cookie-reading server client (the dynamic culprit) | Shows why a cookie-free client is needed | Reference |
| `src/lib/supabase/client.ts` | Browser client pattern | Template for the cookie-free client | Reference |
| `src/lib/store-settings.ts` | Cookie-based settings read | Add `getStoreSettingsStatic()`; layout swaps to it | Modify |
| `src/app/[locale]/layout.tsx` | Shell; calls `getStoreSettings()` at line 66 | The dynamic-rendering fix point | Modify |
| `src/lib/config.ts` | Centralized constants + picsum base URL | Add pagination/stock/revalidate/route constants | Modify |
| `src/lib/money.ts` | `formatMXN` | Card price rendering | Reference |
| `src/i18n/routing.ts` / `navigation.ts` | Locale set, `as-needed` prefix, `Link` | Routing model for all new pages/links | Reference |
| `src/components/layout/nav-items.ts` | Canonical `/sillas`, `/marcas`, `/estilos` | Routes T3 must fulfill | Reference |
| `src/messages/es-MX.json` / `en.json` | i18n dictionaries | Add `catalog` namespace (parity enforced by tests) | Modify |
| `src/app/[locale]/page.tsx` | Server-component page pattern | Template for catalog pages | Reference |
| `src/app/[locale]/not-found.tsx` / `[...rest]/page.tsx` / `error.tsx` | In-shell 404 + error boundary | Invalid slug → 404; hard fail → error | Reference |
| `globals.css` | Motion tokens, `@starting-style`, reduced-motion | Card/grid motion vocabulary | Reference |
| `next.config.ts` | `next/image` remotePatterns (picsum + supabase host) | Already allows the image hosts — no change | Reference |
| `scripts/seed-data/*.ts` | Seed counts, Spanish slugs, category nesting, category-product links | Ground truth for slugs/nesting/counts | Reference |
| `playwright.config.ts` / `e2e/*.spec.ts` | Test harness (chromium + Pixel 7 projects) | e2e catalog spec conventions | Reference |

### Data Flow

`GET /sillas?page=2` (ES) →
1. next-intl middleware (`src/middleware.ts`) resolves locale `es-MX` (no prefix), rewrites to `[locale]/sillas`.
2. `[locale]/layout.tsx` renders the shell; `getStoreSettingsStatic()` reads `store_settings` via the **cookie-free** client (tag-cached) — no `cookies()`, so the route stays static/ISR.
3. `[locale]/sillas/page.tsx` (server component): `setRequestLocale`, `getTranslations("catalog")`, parse+clamp `?page`.
4. `listProducts({ page: 2, pageSize: PRODUCTS_PER_PAGE })` (in `queries.ts`, `unstable_cache`d, tag `catalog`):
   a. `createPublicClient()` → `products_public` select with `brands(...)`/`styles(...)` embedded + `.range()` + `count:"exact"`.
   b. separate `product_images.in(product_id, ids)` and `product_variants.in(product_id, ids)`.
   c. stitch → `CatalogProductCard[]` + compute `effectiveStock`/`stockState` (`stock.ts`) + `CatalogPage` totals.
5. `<Breadcrumbs>` (Inicio / Sillas), `<ProductGrid>` → `<ProductCard>` each: `next/image` cover, name, `brands.name`, `formatMXN(price_cents)`, `<StockBadge>`, `Link` to `/producto/[slug]`.
6. `<Pagination>` renders `?page=N` `Link`s. Invalid slug on a taxonomy page → `notFound()`; hard read failure → throw → `[locale]/error.tsx`.

### Similar Features (Reference Implementations)

- **`getStoreSettings` (`store-settings.ts`)** — the exact template for a typed, degrade-gracefully Supabase read wrapper. The catalog queries mirror its structure (explicit select, typed row, contextual logging).
- **`[locale]/page.tsx` homepage** — the template for a localized server-component page with `Button asChild` + `Link` CTAs (the empty-state CTA copies this).
- **`.fab-pop` / `.enter-fade` in `globals.css`** — the reference for card entrance/press motion (pop-in from `scale(0.95)`, `@starting-style`, reduced-motion fallback).
- **`mobile-nav.tsx`** — reference for the interruptible-CSS-transition + reduced-motion pattern (only relevant if a client island is needed; T3 grid is mostly server components).

## Dependency Analysis

### Existing Dependencies to Leverage

- `@supabase/supabase-js` (^2.110.2) — provides the cookie-free `createClient` for `public.ts`.
- `next-intl` (^4.13.2) — routing, `Link`, `getTranslations`, `setRequestLocale`.
- `next/image` (Next 16.2.9) — cover images; hosts already allow-listed in `next.config.ts`.
- `@hugeicons/react` + `@hugeicons/core-free-icons` (^4.2.2) — pagination arrows, placeholder/empty-state icons.
- shadcn `Button` + `cn()` + `class-variance-authority` — CTAs and control styling.
- Next built-ins `unstable_cache` / `revalidateTag` — caching + tag revalidation (no package).
- `react` `cache()` — per-request dedup for shared reads (e.g. category + its ancestors).

### New Dependencies Needed

**None.** Everything required is already installed. (If the UI-design stage wants a dedicated shadcn Breadcrumb/Pagination component, prefer hand-rolling with existing primitives over adding a dependency — the accessible markup is small and the repo's convention is token-styled bespoke components.)

### Internal Dependencies

- `queries.ts` depends on `public.ts` (client), `stock.ts` (badge logic), `types.ts`, `database.types.ts`, `config.ts` (page size / revalidate). Implication: `public.ts` + `types.ts` + `stock.ts` land first, then `queries.ts`, then pages/components.
- Pages depend on `queries.ts` + components + `catalog` message keys. Implication: add message keys before wiring components (tests enforce parity).
- `layout.tsx` depends on `getStoreSettingsStatic()` (new). Implication: the static-render fix can ship independently and be verified with `next build` before the catalog pages exist.

## External Research

### next-intl `pathnames` / `localePrefix` (v4)

- `localePrefix: "as-needed"` serves the default locale without a prefix and others with one; `navigation.ts`'s `Link`/`redirect` add the prefix automatically. Confirmed by the routing config and its inline docs. **No `pathnames` map is used** (decision (c)); the same Spanish segment serves both locales. If localized segments are ever wanted (T5+), `pathnames` is the mechanism, keyed by an internal pathname → per-locale external pathname map.
- next-intl auto-emits `hreflang` alternates for the locale set (per `routing.ts` docs comment), which benefits T14 SEO without extra work here.

### Next/Image `remotePatterns`

- `next.config.ts` already allow-lists `picsum.photos` (`/**`) and the Supabase Storage host (`/storage/v1/object/public/**`). Seed images are `https://picsum.photos/seed/<slug>-<n>/800/800` (800×800). Cards should set an explicit aspect ratio (e.g. 4:3 or 1:1), a `sizes` string matching the grid breakpoints, and reserve space to avoid CLS. `priority` only on the first visible row. No config change needed (AC-15).

### Supabase PostgREST view-embedding limitation

- PostgREST resolves embedded resources (`select=*,related(*)`) via **foreign-key relationships** it detects in the schema cache. A **view** exposes only the FKs that its source columns carry forward and that PostgREST can associate. `products_public` forwards `brand_id`/`style_id` (surfaced as FK relationships in the generated types, lines 849-862), so `brands`/`styles` embed cleanly. Child tables (`product_images`, `product_variants`, `product_categories`) have their FK declared **to the base `products` table**, and there is no FK from them to the view — so PostgREST cannot resolve `products_public?...product_images(*)` and returns a "could not find a relationship / embedding disabled" error. This is the documented behavior underpinning decision (a): embed brand/style through the view, fetch children separately. (Confirmed against the generated relationship metadata; a live query attempt was intentionally NOT run to avoid touching the running Docker stack.)

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| PostgREST embed error if a dev embeds children through the view | Med | Med | Standardize the split-read pattern in `queries.ts`; document in dev-done; unit-test the query shape against mocked responses |
| Page still renders dynamic despite the fix (a stray `cookies()`/`headers()` or `searchParams` opt-out) | Med | Med | Verify with `next build` route table (AC-11); cookie-free client + `unstable_cache`; if `?page` forces dynamic, the shell + tag-cached data still cut DB load and the page is ISR |
| N+1 / over-fetch: batch image+variant reads per page | Low | Med | Single `.in(product_id, ids)` batch per resource per page (not per product); default page size 12 keeps `ids` small; profile at QA |
| Cost data leak via wrong client/table | Low | High | Read ONLY `products_public` via the anon key; never the base `products` table; AC-13 verifies no `cost_price_cents` in payload |
| Stock badge shows stale product-level stock | Med | Med | `effectiveStock` prefers summed variant stock when variants exist (`stock.ts`); unit-tested; edge case 10 |
| Breadcrumb infinite loop on a corrupt category chain | Low | Low | DB trigger `categories_no_cycle` (0002:47-85) already prevents cycles; ancestor walk still bounded with a depth guard in the query |
| i18n key drift between dictionaries | Med | Low | `keys-used.test.ts` + `messages.test.ts` enforce parity; add keys to both at once |
| Pagination link to non-existent page | Med | Low | Clamp page to `[1, lastPage]`; compute `lastPage` from `count`; never render a link past it (edge case 7) |

### Performance Considerations

- **Static/ISR is the headline win:** with the cookie-free path, catalog pages become cacheable (build-time static or ISR via `revalidate`), so most requests never hit the DB. Tag-based `revalidateTag` (T10) busts only affected pages.
- **Batched reads:** 3 queries per grid page (products+embed, images, variants) regardless of item count — not per-product. Page size 12 keeps payloads small on mobile.
- **Image weight:** 800×800 picsum images through `next/image` with correct `sizes` avoids shipping oversized images to 375px phones; `priority` only first row.
- **`count: "exact"`** adds a count query cost; acceptable for a 30-product catalog. If it becomes hot, switch to `estimated` or cache the count under the same tag.

### Security Considerations

- **Column protection by construction** — anon can never reach `cost_price_cents`: base `products` is ungranted; the view omits the column (0005:66, 116-146). T3 must not add a code path that reads the base table with the anon key.
- **RLS still enforced** on the cookie-free client (publishable/anon key) — it only changes cookie handling, not the trust boundary. Draft/archived products and inactive taxonomy stay hidden (view `where status='active'` + `is_active` policies).
- **No user input reaches SQL** — slugs come from the URL and are used via the Supabase query builder (parameterized); still validate/normalize the slug and 404 on miss rather than trusting it. `?page` is parsed to a bounded integer.
- **No new secrets, no `NEXT_PUBLIC_` secret** — reuses the existing publishable key via `getPublicEnv`.
- **Error hygiene** — never surface Supabase error objects to the DOM; log server-side, degrade to the localized 404/error boundary (edge case 9, matches T2 `error.tsx` contract).

## Implementation Recommendations

### Suggested Order of Implementation

1. **`src/lib/supabase/public.ts`** (cookie-free client) — foundation for everything; no dependencies.
2. **`getStoreSettingsStatic()` in `store-settings.ts` + swap in `layout.tsx`** — ship + verify with `next build` that the shell is no longer forcing dynamic (isolates the static-render fix, AC-11).
3. **`config.ts` constants** (`PRODUCTS_PER_PAGE`, `LOW_STOCK_THRESHOLD`, `CATALOG_REVALIDATE_SECONDS`, route segments) — single-sourced before use.
4. **`stock.ts` + `types.ts` + their unit tests** — pure logic, TDD-friendly.
5. **`queries.ts`** — the read layer (view + split children stitch), with mocked-Supabase tests for the query shape (AC-13).
6. **`catalog` message keys** in both dictionaries — before components (parity tests).
7. **Presentational components** — `brand-logo`, `stock-badge`, `breadcrumbs`, `pagination`, `product-card`, `product-grid`, `empty-state`.
8. **Routes** — `/sillas` first (proves grid + pagination + static render), then `/categorias(+/[slug])`, `/marcas(+/[slug])`, `/estilos(+/[slug])`, each with `loading.tsx`.
9. **e2e `catalog.spec.ts`** (both locales) + check off the two backlog items.

### Key Decisions

- **Read strategy:** embed brand/style via `products_public`; fetch images/variants/category-joins separately. (Recommended — the only option that satisfies both the grants and PostgREST embedding.)
- **Static rendering:** cookie-free client + `unstable_cache` with per-entity tags. (Recommended over `export const dynamic` overrides, which don't fix the underlying `cookies()` opt-out.)
- **i18n:** single Spanish path segments, `as-needed` prefix, stable Spanish slugs. (Recommended over `pathnames` localized segments — matches the existing nav contract, less to maintain, still crawlable.)
- **Pagination:** numbered + Prev/Next crawlable URL links (`?page=N`), page 1 canonical without the param. (Recommended over load-more/infinite — SEO-crawlable for T14, works with JS off, mobile-friendly with a windowed control.) Page size **12**.
- **Stock thresholds:** `LOW_STOCK_THRESHOLD = 5`; effective stock = summed variant stock when variants exist, else product `stock`. Card in-stock iff any variant has stock.
- **Card color info:** show a lightweight **"N colores" count** (from the variants batch) — NOT interactive color swatches. The variant *selector* is PDP/T4. (Recommended: a count is cheap and informative without pre-empting T4.)
- **Image cover selection:** first `product_images` row with `is_primary=true`, else lowest `sort_order`, else placeholder. (Matches the seed: one `is_primary` product-level image per product, `seed.ts:222-229`.)

### Anti-Patterns to Avoid

- **Don't** embed `product_images`/`product_variants`/`product_categories` through `products_public` — it throws a PostgREST relationship error. Fetch them separately.
- **Don't** read the base `products` table with the anon key (re-exposes `cost_price_cents` risk and is ungranted → will fail). Always `products_public`.
- **Don't** call `cookies()`/`headers()` (or the `@supabase/ssr` `createClient`) anywhere in the catalog render path — it re-breaks static rendering. Use `createPublicClient()`.
- **Don't** format money inline — always `formatMXN` (`money.ts`).
- **Don't** hardcode UI strings or route labels — use the `catalog` namespace; add keys to BOTH dictionaries (parity tests will fail otherwise).
- **Don't** use `transition: all` or animate layout properties for card hover — transform/opacity only, gated behind `@media (hover:hover)`, with a `prefers-reduced-motion` fallback (Emil rules, existing `globals.css` convention).
- **Don't** stub a fake PDP — link to `/producto/[slug]` and let it 404 via the catch-all until T4.
- **Don't** add a migration/view for effective stock in T3 — compute it in `stock.ts`; a DB view is deferred to cart/inventory (T6/T7).
- **Don't** build search/filter/sort UI — that is T5, explicitly out of scope.
