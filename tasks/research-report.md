# Research Report: T4 — Product detail page (PDP)

## Codebase Analysis

### Existing Patterns

- **Route + locale pattern** — `src/app/[locale]/marcas/[slug]/page.tsx:26-107`
  is the closest reference: `generateStaticParams` iterates `routing.locales`
  and a slug list, `generateMetadata` reads the entity and returns `{}` on miss,
  the page awaits `params`, calls `setRequestLocale`, fetches the entity, and
  `notFound()`s on null. The PDP page is a near-clone with a richer body. Reuse
  strategy: copy this skeleton verbatim, swap `getBrand` → `getProduct`.
- **Cookie-free cached read** — `src/lib/catalog/queries.ts` is the canonical
  read layer. `getBrand`/`getCategory` (`queries.ts:522-549`, `670-696`) are the
  single-entity `.maybeSingle()` reads to mirror for `getProduct`. The stitch
  pattern for batched children (`stitchCards`, `queries.ts:150-213`) is the model
  for fetching images+variants+questions by `product_id`. Reuse: write
  `getProduct` in a new `product-detail.ts` following these exact idioms
  (`createPublicClient()`, `unstable_cache`, tags, `fail()` error contract).
- **`fail()` error contract** — `queries.ts:121-125`: logs full detail
  server-side, throws a generic `Error` so the route boundary (`error.tsx`) shows
  a localized panel and DB internals never reach the DOM. Reuse for `getProduct`
  and inside the Q&A action's read/insert error handling.
- **`firstOrSelf` embed normalizer** — `queries.ts:127-130`: PostgREST to-one
  embeds may surface as object OR array; normalize defensively. Reuse if the PDP
  embeds `brands`/`styles` through the view.
- **Effective-stock + badge** — `src/lib/catalog/stock.ts`: `effectiveStock`
  (sum variants else product stock) + `stockState` (out/low/in). Pure, tested.
  Reuse unchanged for both product-level and per-variant stock (call
  `effectiveStock(null, [singleVariant])` per swatch, or `stockState(variant.stock)`).
- **StockBadge** — `src/components/catalog/stock-badge.tsx`: three states, icon +
  text (colorblind-safe), pre-resolved label, `className` for placement ("inline
  on a PDP" is called out in its own doc comment at line 24). Reuse directly.
- **Money display** — `formatMXN()` (`src/lib/money.ts:26`) is the ONLY cents→string
  boundary and throws on non-integer input. Reuse for price + compare-at.
- **Compare-at rule** — `queries.ts:244-246` / `product-card.tsx:109-113`: strike
  only when `compareAt > price`. Replicate against the *effective* (variant) price.
- **Image handling** — `product-card.tsx:61-96`: `next/image` with `fill`,
  `sizes`, priority, and a Hugeicons `Image01Icon` placeholder when
  `coverImageUrl === null`; out-of-stock dims to `opacity-60`. Reuse the
  placeholder + alt-fallback (`alt_text ?? name`) idioms in the gallery.
- **Breadcrumbs** — `src/components/catalog/breadcrumbs.tsx`: takes an `items`
  array, localized `ariaLabel`/`moreLabel`, marks the last crumb current. Reuse
  directly: `[{home,'/'},{catalog,CATALOG_PATH},{product.name}]`.
- **Grid label pre-resolution** — `product-grid.tsx:26-47`: resolve
  `catalog.stock.*` labels ONCE in the server parent, pass to pure presentational
  children (SRP: cards do no i18n). Apply the same discipline — resolve labels in
  the server PDP page/section, pass into client islands as props where possible.
- **Motion primitives** — `globals.css` `.card-lift` / `.stagger` (lines ~389-440)
  + `prefers-reduced-motion` blocks; `transform`/`opacity` only. Reuse for the
  recently-viewed strip; add PDP-specific zoom/variant transitions to `globals.css`
  following the same `ease-out`, `<300ms`, reduced-motion-gated conventions.
- **Config single-sourcing** — `src/lib/config.ts` holds every non-secret tunable
  with a "how to swap" doc block; `MAX_PAGE` (line 135) documents the exact
  cache-key-cardinality discipline T4's Q&A form must respect. Add PDP constants
  here, not inline.

### Relevant Files

| File                                                | Purpose                                          | Relevance                                            | Action     |
| --------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- | ---------- |
| `src/app/[locale]/marcas/[slug]/page.tsx`           | Slug route with static params + 404              | Structural template for the PDP route                | Reference  |
| `src/app/[locale]/sillas/loading.tsx`               | Route-level skeleton wiring                       | Template for PDP `loading.tsx`                        | Reference  |
| `src/lib/catalog/queries.ts`                        | Read layer (single-entity + stitch + fail)       | Idioms `getProduct` must follow                       | Reference  |
| `src/lib/catalog/stock.ts`                          | Effective stock + badge state                    | Reuse for product + per-variant stock                 | Reference  |
| `src/lib/catalog/types.ts`                          | Catalog view models                               | Co-locate or import PDP view models                   | Modify/Ref |
| `src/lib/supabase/public.ts`                        | Cookie-free anon client                           | `getProduct` and the Q&A insert both use it           | Reference  |
| `src/lib/config.ts`                                 | Non-secret constants + paths                      | Add PDP constants; `productPath` already here         | Modify     |
| `src/lib/money.ts`                                  | `formatMXN`                                        | Price + compare-at display                            | Reference  |
| `src/components/catalog/stock-badge.tsx`            | 3-state badge                                     | Reuse on PDP                                          | Reference  |
| `src/components/catalog/breadcrumbs.tsx`            | Breadcrumb trail                                  | Reuse on PDP                                          | Reference  |
| `src/components/catalog/product-card.tsx`           | Card image/placeholder/price patterns            | Pattern source for gallery + recently-viewed tiles    | Reference  |
| `src/components/catalog/catalog-skeleton.tsx`       | Skeleton components                               | Add/borrow a PDP skeleton                             | Modify/Ref |
| `src/messages/es-MX.json`, `src/messages/en.json`   | i18n dictionaries (`catalog` namespace)          | Add a `product` namespace                             | Modify     |
| `src/app/[locale]/error.tsx`, `not-found.tsx`       | Route boundaries                                  | `getProduct` throw/`notFound()` targets               | Reference  |
| `src/app/[locale]/[...rest]/page.tsx`               | Catch-all 404                                      | The PDP route takes precedence once added             | Reference  |
| `supabase/migrations/0002_catalog.sql`              | products/variants/images schema                   | Exact columns + variant `price_override`/image `variant_id` | Reference  |
| `supabase/migrations/0004_content_qa.sql`           | `product_questions` schema + CHECKs               | Field lengths (120/2000) the form mirrors             | Reference  |
| `supabase/migrations/0005_rls_policies.sql`         | RLS: view + anon Q&A insert policy                | The write path's server-side contract                 | Reference  |
| `scripts/seed-data/products.ts`, `scripts/seed.ts`  | Seed shape: variant-linked images                 | Confirms `product_images.variant_id` is populated     | Reference  |
| `.claude/skills/emil-design-eng/SKILL.md`           | Motion/taste authority                             | Zoom + variant transition specs                       | Reference  |

### Data Flow

**Read (page render, static/ISR):**
`GET /producto/[slug]` → `page.tsx` awaits `params`, `setRequestLocale(locale)` →
`getProduct(slug)` (in `product-detail.ts`) → `unstable_cache([...'product',slug],
{tags:['catalog',`product:${slug}`], revalidate: CATALOG_REVALIDATE_SECONDS})` →
inside: `createPublicClient()` →
(1) `from('products_public').select(<detail cols, NO cost>).eq('slug',slug).eq?
maybeSingle()` (view already filters `status='active'`, so draft/archived → null);
(2) if found, `Promise.all` batched by `product_id`: `product_images`
(`.select('id,variant_id,url,alt_text,is_primary,sort_order').order(is_primary
desc, sort_order asc)`), `product_variants`
(`.select('id,color_name,color_hex,price_override_cents,stock,sort_order').order(sort_order)`),
`product_questions` (`.select('author_name,question,answer,answered_at,created_at')
.eq('is_published',true).order('created_at',{ascending:false})`) → stitch into
`ProductDetail` → return. Null → `page.tsx` calls `notFound()`.
Then the page renders breadcrumb (server) + `ProductPurchasePanel` (client island,
gets variants+images+base price) + `ProductSpecs` (server) + `RecentlyViewed`
(client) + `ProductQa` (server list) with `QaForm` (client) inside.

**Variant selection (client, no network):** user clicks a swatch →
`ProductPurchasePanel` sets `selectedVariantId` → pure helpers
(`variant-selection.ts`) recompute `imagesForVariant` (filter images by
`variant_id === selected || variant_id === null` fallback), `effectivePriceCents`
(`override ?? base`), and `stockState(variant.stock)` → gallery main image, price,
and badge re-render. Interruptible/idempotent (React state, no async).

**Recently-viewed (client, localStorage):** `RecentlyViewed` mounts → reads the
capped JSON array from `localStorage[RECENTLY_VIEWED_STORAGE_KEY]` (guarded) →
prepends the current `{slug,name,coverUrl,...}` de-duplicated, caps to
`RECENTLY_VIEWED_MAX`, writes back → renders tiles for entries !== current slug.

**Q&A submit (write, first public write path):** `QaForm` (`useActionState`) →
server action `submitQuestion(prevState, formData)` in `actions.ts` →
read honeypot (`website`) → if filled: return success WITHOUT insert →
trim name/question → validate lengths (1–120 / 1–2000) → check rate-limit
(in-memory Map keyed by IP+productId via `headers()`) → `createPublicClient()`
`.from('product_questions').insert({product_id, author_name, question})` → RLS
`product_questions_anon_insert` WITH CHECK enforces `is_published=false`,
`answer=null`, `answered_at=null`, lengths, and `is_active_product(product_id)` →
on success `revalidateTag('product:'+slug)` (so it appears after admin publishes)
and return success state → form clears, shows "received, will appear once
answered". Errors mapped: RLS/product-gone vs. transient.

### Similar Features (Reference Implementations)

- **Brand detail page** (`marcas/[slug]/page.tsx`) — closest full analog: static
  params, metadata, entity fetch, 404, header + Suspense body. Patterns to follow:
  the whole `generateStaticParams`/`generateMetadata`/`notFound()` triad and the
  `setRequestLocale` + `getTranslations("...")` sequence.
- **Catalog card** (`product-card.tsx`) — image/placeholder/price/compare-at/alt
  patterns for the gallery and recently-viewed tiles.
- **Category read with batched children** (`readCategoryProductPage`,
  `queries.ts:450-488`) + **`stitchCards`** — the batched `.in()`/`.eq()` +
  Map-stitch pattern `getProduct` reuses for images/variants/questions.
- **T3 cache-key hardening** (`canonicalPageKey`, `queries.ts:132-144`;
  `MAX_PAGE`, `config.ts:135`) — the security precedent: never let raw user input
  mint unbounded cache keys. Q&A form input must stay entirely OUT of any cache
  key (it flows only into an insert, which is correct).

## Dependency Analysis

### Existing Dependencies to Leverage

- `radix-ui` `^1.6.0` (already used by `button.tsx` via `Slot`) — use its
  `Dialog` for the zoom lightbox (built-in focus trap, Escape, backdrop,
  `aria-modal`), and it already ships `@radix-ui/react-focus-scope` as a direct
  dep. Satisfies AC-6 accessibility with no new dep.
- `@supabase/supabase-js` via `createPublicClient()` — both the read and the Q&A
  insert; RLS is the security boundary. version 2.110.2.
- `next-intl` `^4.13.2` — `getTranslations`/`setRequestLocale` (server), the
  `product` namespace, locale-aware `Link` from `@/i18n/navigation`.
- `@hugeicons/react` + `@hugeicons/core-free-icons` — gallery/zoom/close icons.
  CLAUDE.md forbids mixing icon sets; stay on Hugeicons.
- `next/cache` `unstable_cache` + `revalidateTag` — caching read + busting on
  Q&A submit.
- `next/image` — gallery + tiles; hosts already allow-listed in `next.config.ts`
  (supabase storage + picsum). No config change.

### New Dependencies Needed

- **None.** Explicitly avoid adding a form library (react-hook-form) or a
  validation library (zod) — the two DB CHECKs (name 1–120, question 1–2000) are
  trivial to hand-roll as pure functions, matching the Clean Code "DRY with
  judgment / no over-fetch of deps" rule. `useActionState` (React 19, installed)
  covers form state.

### Internal Dependencies

- `product-detail.ts` → `public.ts` (`createPublicClient`), `stock.ts`,
  `config.ts` (`CATALOG_REVALIDATE_SECONDS`), and its own types. Implication: keep
  `getProduct` in the read layer, not in the page (SRP; the page only renders).
- `actions.ts` → `public.ts`, `config.ts` (limits/window), `qa/submit-guard.ts`,
  `next/cache` (`revalidateTag`), `next/headers` (`headers()` for IP). Implication:
  `actions.ts` is server-only by virtue of `"use server"`; it uses the ANON
  client, NOT `admin.ts` (the write is intentionally RLS-bounded — do not reach
  for the secret key for a public write).
- `QaForm`/`RecentlyViewed`/`ProductGallery`/`VariantSelector` are client
  components; they must receive only serializable, cost-free props. Implication:
  the server page maps `ProductDetail` → plain props; no Supabase client or raw
  row crosses the client boundary.

## External Research

### API Documentation

- **Supabase PostgREST insert under RLS (anon)** — a `WITH CHECK` violation on the
  anon INSERT policy returns a PostgREST error (typically code `42501`
  insufficient privilege / RLS) rather than a thrown exception; the JS client
  surfaces it as `{ error }`, not a throw. Gotcha: the action must inspect
  `result.error` and MAP it (RLS/`is_active_product` failure = product gone =
  friendly "no longer available"; anything else = generic retryable) — never
  echo `error.message` to the client. The policy also forces the safe initial
  state, so the action should send ONLY `product_id, author_name, question` and
  let RLS/defaults set the rest (sending `is_published=true` would be rejected).
- **Next.js server actions** — invoked via `useActionState`; the action reads
  `formData`, returns a serializable state object. `headers()` is available in a
  server action for best-effort IP (`x-forwarded-for`). Gotcha: server-action
  in-memory state (the rate-limit Map) is per-server-instance and resets on
  redeploy/scale-out — acceptable as "best-effort" per the ticket; a durable
  limiter is a documented follow-up.
- **`next/image` with `fill`** — parent needs `position: relative` + a sized
  container; provide `sizes`. Gallery main image and thumbnails follow the card's
  `aspect-[4/5]` + `sizes` pattern.

### Library Documentation

- **Radix `Dialog` for the zoom lightbox** — provides `Dialog.Root/Trigger/
  Portal/Overlay/Content/Close`, focus trap, Escape + outside-click close,
  `aria-modal`, and scroll lock out of the box (AC-6, AC-18). Per emil-design-eng:
  MODALS keep `transform-origin: center` (do NOT use the trigger-origin rule that
  applies to popovers); animate `opacity` + a subtle `scale(0.95→1)` with a strong
  `ease-out` under ~200ms; gate on `prefers-reduced-motion` (fade only, no
  transform). Use CSS transitions (interruptible), not keyframes.
- **emil-design-eng motion rules for T4 specifics** — variant swatch selection is
  seen tens of times/session → keep it minimal and instant-feeling; the gallery
  main-image swap on variant change should crossfade `opacity` (optionally a 2px
  blur to mask the swap) under 200ms `ease-out`, NOT slide. Enter animations
  `ease-out`; only `transform`/`opacity`; `:active` scale(0.97) on the zoom
  trigger and swatches for press feedback; hover states gated behind
  `@media (hover:hover) and (pointer:fine)`.

## Risk Assessment

### Technical Risks

| Risk                                                                 | Likelihood | Impact | Mitigation                                                                                                     |
| -------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `cost_price_cents` leaks into the PDP payload / client bundle        | Low        | High   | Read the `products_public` VIEW only (structurally omits it); never `select('*')`; add a test asserting absence |
| Q&A insert bypasses validation (empty/oversized/spam) via direct POST | Med        | Med    | Validation lives on the SERVER action (client is convenience only); DB CHECKs + RLS `WITH CHECK` are the floor  |
| Q&A form abused as a spam/DoS vector (first public write path)       | Med        | Med    | Honeypot + in-memory per-IP+product rate limit + DB length caps; durable limiter documented as follow-up        |
| Server error `message` echoed to the DOM                             | Low        | Med    | `fail()` contract + action maps errors to friendly enums; never render `error.message`                          |
| Cache-key cardinality blow-up from user input (T3-class HIGH finding)| Low        | High   | Slug comes from a validated route segment; Q&A input flows ONLY into an insert, never a cache key               |
| Variant image fallback wrong (variant with no images shows blank)    | Med        | Low    | `imagesForVariant` falls back to shared (`variant_id === null`) images, then to placeholder                     |
| localStorage throws (private mode / quota) crashes the client tree   | Med        | Med    | All storage access wrapped in try/catch in `recently-viewed.ts`; SSR guard (`typeof window`)                    |
| Hydration mismatch: recently-viewed rendered server-side             | Med        | Med    | Render the strip CLIENT-only (effect-driven) with an empty SSR shell → no mismatch                              |
| Stale price/strike after rapid variant switching                     | Low        | Med    | Selection is synchronous React state via pure `effectivePriceCents`; no async race                             |

### Performance Considerations

- **Read count**: `getProduct` = 1 detail read + 3 batched child reads (images,
  variants, questions), all cached under `product:<slug>` with ISR. At seed scale
  each child set is tiny. Acceptable; matches the T3 stitch cost profile.
- **Static generation**: `generateStaticParams` over ~30 active slugs × 2 locales
  = ~60 prerendered pages. Trivial build cost. Keep the slug list read cached
  (reuse a light `listActiveProductSlugs` or the existing `listProducts` shape).
- **Image weight**: gallery loads multiple images; give only the primary
  `priority`, lazy-load the rest; correct `sizes`; thumbnails use small
  transformations. Zoom loads the full-res image on open (not eagerly).
- **Client JS**: keep islands small — gallery+selector+form+strip. No heavy libs.

### Security Considerations

- **The Q&A submission is the first public WRITE path** and the primary security
  focus of Stage 9. Controls, in layers: (1) DB `WITH CHECK` policy
  (`product_questions_anon_insert`) forces `is_published=false`, `answer=null`,
  `answered_at=null`, `char_length` bounds, and `is_active_product(product_id)`;
  (2) DB CHECK constraints on the columns; (3) server-action validation on the
  TRIMMED value; (4) honeypot; (5) in-memory per-IP+product rate limit. The anon
  key is used deliberately (RLS is the boundary) — the secret/admin client is NOT
  used for this write.
- **No secret exposure**: `getProduct` and `actions.ts` use `createPublicClient()`
  (publishable key, RLS-enforced), never `admin.ts`. `cost_price_cents` is
  unreachable by construction.
- **Input safety**: author name / question are stored as text and rendered as
  text (React auto-escapes) — no `dangerouslySetInnerHTML`. XSS surface is nil as
  long as answers/questions are rendered as text nodes.
- **Rate-limit honesty**: in-memory limiter is best-effort and per-instance;
  document its limits so Stage 9 doesn't flag it as a false guarantee.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Types + pure helpers first** (`product-detail.types.ts`,
   `variant-selection.ts`, `specs.ts`, `qa/submit-guard.ts`) — no I/O, unit-test
   immediately; everything downstream consumes them.
2. **`getProduct` read layer** — depends on the types; mirror `getBrand` +
   `stitchCards`. Add a test asserting the returned shape has NO `cost_price_cents`.
3. **PDP route + `loading.tsx` + server sections** (specs, Q&A list) — depends on
   `getProduct`; get a static page rendering end-to-end (no interactivity yet).
4. **`ProductPurchasePanel` + gallery + variant selector** (client) — depends on
   the page passing serializable props; wires selection → price/stock/gallery.
5. **Zoom lightbox** — extends the gallery with Radix Dialog.
6. **Q&A form + server action** — depends on `submit-guard.ts` + the anon insert;
   the write path. Wire `useActionState`, honeypot, counters, `revalidateTag`.
7. **Recently-viewed** (client + `recently-viewed.ts`) — independent; add last.
8. **i18n `product` namespace + config constants** — filled in alongside each
   component (don't leave copy hardcoded to "do later").

### Key Decisions

- **Selection state lives in one client island (`ProductPurchasePanel`)**, not
  scattered — so price, stock badge, and gallery stay in sync from a single source
  of truth (AC-7). Recommended over prop-drilling from the server page (server
  can't hold interactive state).
- **Q&A write uses the ANON client + RLS**, not the secret/admin client. Chosen
  because the RLS `WITH CHECK` policy already encodes the exact safe-insert
  contract; using the secret key would bypass that guard and enlarge the trust
  surface for a public action.
- **Recently-viewed is client-only, effect-driven**, with an empty SSR shell to
  avoid hydration mismatch. Chosen over any cookie/server approach because Phase 1
  has no accounts and localStorage is the spec's implied mechanism.
- **Zoom via Radix Dialog** over a hand-rolled overlay. Chosen for free focus
  trap / Escape / aria-modal (AC-6, AC-18) with zero new deps.
- **Hand-rolled validation** over zod/react-hook-form. Chosen per Clean Code /
  no-over-fetch-of-deps; two length checks + a trim + a honeypot are pure functions.

### Anti-Patterns to Avoid

- Don't `select('*')` or read the base `products` table — always the
  `products_public` view, so `cost_price_cents` can never leak.
- Don't render a disabled/dead "Add to cart" button — cart is T6; a dead
  affordance is worse than its absence (hacker/UX will flag it).
- Don't let Q&A form input reach an `unstable_cache` key (T3-class DoS). It flows
  only into an insert.
- Don't render questions/answers with `dangerouslySetInnerHTML` — text nodes only.
- Don't animate the gallery main-image swap with a slide or `scale(0)`; crossfade
  `opacity` (optionally +2px blur), `ease-out`, <200ms, reduced-motion → fade only.
- Don't put business/selection logic inside presentational components — pure
  helpers in `lib/`, state in the one client island, rendering in components (SRP).
- Don't use the secret/admin client for the public Q&A write.
- Don't SSR-render the recently-viewed list (hydration mismatch) — hydrate it in
  an effect.
