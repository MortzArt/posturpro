# Task: T4 — Product detail page (PDP)

## Priority

High — T4 is the conversion surface of the storefront and unblocks T6 (Cart).
Every catalog card already links to `/producto/[slug]` (`productPath()` in
`src/lib/config.ts`), so that route currently 404s via the `[...rest]` catch-all.
Until T4 ships, the store cannot show a product. It is next in the linear build
order and its dependency (T3) is COMPLETE/SHIPPED.

## Complexity

**medium** — reclassified DOWN from the full-cycle tier recommendation.

Evidence against `high`: no new data model (every table T4 reads already exists
from T1: `products_public` view, `product_images`, `product_variants`,
`product_categories`, `product_questions`); no new integration; the read layer,
ISR/cache pattern, i18n scaffold, and stock logic are all established in T3 and
reused. Evidence against `low`: this is a net-new route with a net-new detail
read (`getProduct(slug)` returning full detail, not a card), multiple net-new
client components (interactive gallery + zoom, variant selector, recently-viewed
strip, Q&A form), the **first public WRITE path** (Q&A submission via server
action against the anon INSERT policy), and ~15 files touched. That is squarely
`medium`. Per CLAUDE.md, `medium` → full-cycle runs all stages EXCEPT the hacker
stage (Stage 11).

## Feature Type

**full-feature** (full-stack). It adds both a logic surface (new detail read
`getProduct`, a variant/price/stock selection model, a Q&A submit server action
with validation + spam controls) and a substantial UI surface (gallery with
zoom, variant selector, specs, Q&A). All pipeline stages run at full depth;
Security (Stage 9) runs at FULL depth because of the new public write path.

## User Story

As a shopper browsing PosturPro, I want a rich product page where I can inspect
a chair's photos up close, pick a color variant and see its exact price and
availability, read its dimensions/materials, see other shoppers' answered
questions and ask my own, and quickly return to chairs I viewed earlier — so
that I can decide to buy with confidence before any cart or account exists.

## Background

T3 shipped the catalog (grid, category/brand/style pages, breadcrumbs, stock
badges, pagination) and locked these decisions the PDP MUST honor:

- **Route**: `/producto/[slug]` under `src/app/[locale]/`. Locale routing is
  `as-needed` (es-MX unprefixed, `/en` prefix for English) — use the locale-aware
  `Link` from `@/i18n/navigation`, never hardcode locale prefixes.
- **Reads**: public reads go through the cookie-free `createPublicClient()`
  (`src/lib/supabase/public.ts`) + `unstable_cache` with a per-entity tag. Base
  `products` is NOT granted to anon; read product detail from the `products_public`
  view (omits `cost_price_cents` structurally). Children (`product_images`,
  `product_variants`, `product_categories`, `product_questions`) are separate
  `.in()`/`.eq()` queries — they cannot embed through the view.
- **Stock**: effective stock = sum(variant stock) when variants exist, else
  `product.stock`; badge states from `stockState()` (`src/lib/catalog/stock.ts`);
  `LOW_STOCK_THRESHOLD = 5`. Copy exists in the `catalog.stock.*` i18n namespace.
- **Money**: integer cents everywhere; `formatMXN()` (`src/lib/money.ts`) is the
  only display boundary. `compare_at_price_cents` is struck ONLY when
  `> price_cents` (a variant override changes the effective base — recompute).
- **Cache-key discipline**: any user-influenced value flowing into an
  `unstable_cache` key must be bounded (T3 fixed a HIGH finding via
  `canonicalPageKey`). The PDP slug comes from a validated/prerendered route
  segment, so slug-in-key is acceptable, but the Q&A form input must NEVER touch
  a cache key.

What's missing: the route itself, a full-detail read, and every PDP component.

Out-of-phase features shoppers might expect but that are NOT in scope:
add-to-cart (T6), search/filter (T5), admin answering of questions (T11),
related products (Phase 2), reviews/ratings, product video, size variants,
assembly/care info (all client-marked SKIP in PRODUCT_SPEC.md). Do not build
ahead.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

- [ ] AC-1: `/producto/[slug]` renders for a valid active-product slug in both
      locales; `/en/producto/[slug]` renders the English UI. An unknown, draft,
      or archived slug calls `notFound()` and renders the localized
      `[locale]/not-found.tsx` inside the shell (header + footer).
- [ ] AC-2: `generateStaticParams` prerenders every active product slug × both
      locales at build; the page is static/ISR (cookie-free read, tag-cached
      under `product:<slug>` + `catalog`, `revalidate = CATALOG_REVALIDATE_SECONDS`).
- [ ] AC-3: `generateMetadata` sets `<title>` to a `"{product.name} — {store}"`
      pattern and `description` to the (truncated) product description, returning
      `{}` for a missing product (mirrors the brand page).
- [ ] AC-4: Breadcrumb trail renders via the existing `Breadcrumbs` component:
      `Inicio › Sillas › {product.name}` (last crumb = current, not a link).
- [ ] AC-5: Image gallery shows the product images; a thumbnail rail lets the
      user switch the main image. First image is the primary (`is_primary` then
      `sort_order`). With zero images, a labeled placeholder tile renders (reuse
      the card placeholder pattern) — never a broken `<img>`.
- [ ] AC-6: Activating the main image opens a zoom view (lightbox) showing the
      image larger; dismissible by Escape, backdrop click/tap, and a visible
      close control; focus is trapped while open and returns to the trigger on
      close.
- [ ] AC-7: When a product has ≥1 variant, a color-variant selector renders one
      swatch per variant (`color_hex`, labeled with `color_name`). Selecting a
      variant updates: (a) the gallery to that variant's images
      (`product_images.variant_id = variant.id`), falling back to shared product
      images when the variant has none; (b) the displayed price to the variant's
      effective price (`price_override_cents ?? product.price_cents`); (c) the
      stock badge to that variant's stock state.
- [ ] AC-8: A product with NO variants shows no selector and uses product-level
      price/stock/images.
- [ ] AC-9: Price displays `formatMXN(effectivePrice)`. `compare_at_price_cents`
      renders struck-through ONLY when `> effectivePrice`; otherwise it is
      omitted (never a strike equal to or below the sale price).
- [ ] AC-10: Specs section renders dimensions (width/depth/height/seat height,
      converted mm → cm for display), weight (g → kg), and materials
      (frame/upholstery/finish). Any spec that is `null` is OMITTED (no empty
      "Ancho: —" rows). If ALL specs are null, the whole specs section is hidden.
- [ ] AC-11: Stock indicator uses the existing three-state `StockBadge` with the
      `catalog.stock.*` copy, driven by the selected variant's (or product's)
      effective stock. Out-of-stock is legible without color (icon + text).
- [ ] AC-12: A recently-viewed strip shows up to `RECENTLY_VIEWED_MAX` (=8)
      previously viewed products (excluding the current one), newest-first, each
      linking to its PDP. It is client-side/localStorage only (no accounts in
      Phase 1). The current product is recorded on view. With no history (or only
      the current product), the strip does not render.
- [ ] AC-13: The Q&A section lists PUBLISHED (answered) questions for the product:
      author name, question, answer, newest-first. When there are none, an empty
      state inviting the visitor to ask renders.
- [ ] AC-14: A question submission form (name + question) posts via a server
      action to `product_questions` using the anon INSERT policy. On success the
      form clears and shows a confirmation that the question was received and will
      appear once answered (it is NOT shown immediately — `is_published` defaults
      false). Validation: name 1–120 chars, question 1–2000 chars (mirrors DB
      CHECK constraints); enforced on BOTH client and server against the TRIMMED
      value.
- [ ] AC-15: The Q&A form has a hidden honeypot field; a filled honeypot is
      silently accepted (no DB write, success UI shown). Submissions are
      rate-limited server-side per IP+product (best-effort, in-memory) with a
      friendly "please wait" message on trip.
- [ ] AC-16: `cost_price_cents` appears NOWHERE in the PDP payload, HTML, JSON, or
      client bundle (structurally guaranteed by reading the view; verified).
- [ ] AC-17: All PDP UI strings live in a `product` i18n namespace in BOTH
      `src/messages/es-MX.json` and `src/messages/en.json`; no hardcoded copy in
      components. Spanish is the default.
- [ ] AC-18: Every image has a non-empty `alt` (`alt_text` or the product name);
      swatches have accessible names; the gallery, variant selector, and Q&A form
      are fully keyboard-operable and screen-reader labeled.
- [ ] AC-19: Layout is mobile-first responsive: single column on 375px (gallery →
      info → specs → recently-viewed → Q&A), two-column (gallery left, info right)
      from `lg`. No horizontal scroll at 320px.
- [ ] AC-20: Motion respects the project baseline: enter animations `ease-out`,
      only `transform`/`opacity` animated, `prefers-reduced-motion` honored,
      zoom/variant transitions under 300ms.

## Edge Cases

At least 5 required; the following MUST be handled:

1. **Product exists but has zero images** → gallery renders the labeled
   placeholder tile (card pattern), zoom control is not shown, no broken `<img>`.
2. **All variants out of stock (each stock 0)** → effective stock = 0 → "Agotado"
   badge; variant swatches still selectable (so the shopper can inspect each
   color) but each reflects its own out-of-stock state; NO add-to-cart (T6) so no
   dead "buy" affordance is rendered.
3. **Variant `price_override_cents` LOWER than base while `compare_at` equals
   base** → struck compare-at renders because it is `> effectivePrice`; selecting
   a different variant whose override is `>= compare_at` removes the strike.
   Price/strike recompute per selection, never stale.
4. **Q&A submission with leading/trailing whitespace or an all-whitespace
   question** → trimmed server-side; an all-whitespace/empty question fails
   validation with a field error, never inserts an empty row (trim BEFORE the
   1–2000 length check so the DB CHECK is never the first line of defense).
5. **Q&A submission for a slug whose product was archived between page render and
   submit** → the anon INSERT policy's `is_active_product(product_id)` check
   fails; the action catches the RLS denial and shows a friendly "no longer
   available" message, not a raw error.
6. **Malformed/absent slug or a slug the view rejects** → `getProduct` returns
   `null` → `notFound()`. A slug with URL-unsafe characters is treated as
   not-found and never passed unbounded into a cache key beyond the validated
   route segment.
7. **localStorage unavailable/full/disabled (private mode, quota)** → the
   recently-viewed strip degrades silently: reads yield empty, writes are
   swallowed (no thrown error, no console spam beyond one guarded warn); the rest
   of the page is unaffected.
8. **Duplicate rapid variant clicks / clicking a swatch mid-transition** → the
   selection is idempotent and interruptible; the gallery retargets to the latest
   selected variant without flicker or a stuck intermediate image.
9. **A hard read failure (RLS/network/env) in `getProduct`** → throws a typed
   error caught by `[locale]/error.tsx` (localized panel); cost data or raw DB
   messages never reach the DOM (mirror the `fail()` contract in `queries.ts`).
10. **Very long product name / question / author name (up to the 120/2000 caps)**
    → text wraps/clamps gracefully; no layout overflow; the 375px column holds.

## Error States Table

| Trigger                                    | User Sees                                                             | System Does                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Unknown/draft/archived slug                | Localized 404 page inside the shell                                  | `getProduct` returns `null` → `notFound()`                                         |
| `getProduct` read throws                   | Localized error panel (`error.tsx`), no raw detail                   | `fail()` logs full detail server-side; typed error bubbles to the route boundary   |
| Q&A: empty/whitespace name or question     | Inline field error, form stays filled, focus on first invalid field  | Server action trims + validates; returns field-scoped error; no DB insert          |
| Q&A: over length (name>120 / q>2000)       | Inline field error + character counter in error state                | Client caps input; server re-validates; no insert                                  |
| Q&A: honeypot filled                       | Success confirmation (indistinguishable from real success)           | Action short-circuits, NO insert, logs a bot-suspected metric                      |
| Q&A: rate limit tripped                    | Friendly "you've asked recently, please wait a moment" message       | Action rejects before insert; in-memory per-IP+product window                      |
| Q&A insert fails (RLS / product archived)  | "This product is no longer available" (or generic submit-failed)     | Action catches Supabase error, maps RLS denial vs. transient; logs server-side     |
| Q&A insert transient DB error              | "Could not send your question, please try again" + retry             | Action returns a retryable error state; input preserved                            |
| Gallery image fails to load                | `next/image` fallback → placeholder tile, no broken icon             | `onError` swaps to placeholder; alt text retained                                  |
| localStorage read/write throws             | Recently-viewed strip simply absent; page otherwise normal           | try/catch swallows; one guarded `console.warn`; no crash                           |

## UX Requirements

For every state the UI can be in:

- **Loading**: route-level `loading.tsx` renders a PDP skeleton (gallery block,
  title/price lines, spec rows, Q&A block) mirroring the T3 skeleton style
  (`animate-pulse`, `bg-muted`). The recently-viewed strip and Q&A form (client
  components) render nothing until hydrated (progressive, non-blocking).
- **Empty**:
  - No images → labeled placeholder tile (reuse card placeholder + Hugeicons
    `Image01Icon`), no zoom affordance.
  - No published Q&A → friendly empty state ("Sé el primero en preguntar") with
    the submission form directly below as the CTA.
  - No recently-viewed history → strip not rendered at all (no empty shell).
- **Error**:
  - Read failure → localized `error.tsx` panel with a retry.
  - Q&A submit failure → inline, field- or form-scoped message with input
    preserved and a clear recovery action.
- **Success**:
  - Variant selected → price, stock badge, and gallery update immediately
    (<300ms, `ease-out`); the selected swatch shows a clear selected ring.
  - Q&A submitted → form clears, an inline success note explains the question is
    received and will publish once answered; focus moves to the note.
- **Mobile (375px)**: single column, gallery first (full-width, `aspect-[4/5]`),
  thumbnails as a horizontally scrollable rail beneath; specs as a two-column
  definition list; Q&A stacks; swatches wrap; tap targets ≥44px.
- **Tablet (768px)**: gallery + info may stay single column or begin the split at
  your discretion, but the two-column PDP layout is required by `lg` (1024px). No
  horizontal scroll at any width down to 320px.

## Technical Approach

### Files to Create

- `src/app/[locale]/producto/[slug]/page.tsx` — PDP route: `generateStaticParams`
  (active slugs × locales), `generateMetadata`, server component that calls
  `getProduct(slug)`, `notFound()` on null, renders breadcrumb + gallery + info +
  specs + recently-viewed + Q&A. Mirrors `marcas/[slug]/page.tsx`.
- `src/app/[locale]/producto/[slug]/loading.tsx` — PDP skeleton.
- `src/app/[locale]/producto/[slug]/actions.ts` — `"use server"` Q&A submit
  action: trim + validate (hand-rolled to match DB CHECKs), honeypot, rate-limit,
  insert via `createPublicClient()` (anon, RLS-enforced), return a typed result.
  `revalidateTag('product:<slug>')` on success so the question appears once
  admin publishes.
- `src/lib/catalog/product-detail.ts` — `getProduct(slug)` returning a
  `ProductDetail` view model (product fields, variants[], images[], published
  Q&A[], specs). Cookie-free read + `unstable_cache` tagged `product:<slug>` +
  `catalog`. Batched child queries mirroring `stitchCards`. NEVER selects
  `cost_price_cents` (reads the view).
- `src/lib/catalog/product-detail.types.ts` (or extend `types.ts`) —
  `ProductDetail`, `ProductVariantView`, `ProductImageView`, `ProductQuestionView`,
  `ProductSpecs`.
- `src/lib/catalog/variant-selection.ts` — pure helpers: `effectivePriceCents`,
  `imagesForVariant`, `variantStockState`, `defaultVariant`. Unit-testable.
- `src/lib/catalog/specs.ts` — pure mm→cm / g→kg formatting + `buildSpecRows`
  that omits null specs. Unit-testable.
- `src/lib/qa/submit-guard.ts` — pure validation + honeypot check + rate-limit
  window logic (in-memory Map). Testable in isolation.
- `src/components/product/product-purchase-panel.tsx` — `"use client"` island
  owning selected-variant state; composes gallery, price, stock badge, and
  variant selector so a selection updates all three (AC-7).
- `src/components/product/product-gallery.tsx` — `"use client"` gallery: main
  image + thumbnail rail + zoom (Radix Dialog for the lightbox — built-in focus
  trap). Receives images for the selected variant.
- `src/components/product/variant-selector.tsx` — `"use client"` swatches; raises
  the selected variant to the purchase panel.
- `src/components/product/product-specs.tsx` — server component; definition list.
- `src/components/product/recently-viewed.tsx` — `"use client"`; records the
  current product on mount, renders a strip of tiles (reuse `ProductCard` shape
  where possible). Guarded storage access.
- `src/lib/recently-viewed.ts` — typed localStorage helpers (get/add, capped,
  SSR-safe, quota-guarded).
- `src/components/product/product-qa.tsx` — server component listing published
  Q&A + rendering the client `QaForm`.
- `src/components/product/qa-form.tsx` — `"use client"`; form + honeypot +
  counters + `useActionState` wired to the server action; loading/success/error.
- `src/components/product/pdp-skeleton.tsx` — skeleton (or add to catalog-skeleton).

### Files to Modify

- `src/messages/es-MX.json` and `src/messages/en.json` — add a `product`
  namespace (gallery labels, zoom close, "Color: {name}", specs labels + units,
  recently-viewed heading, Q&A headings/empty/form labels/validation/success/
  rate-limit copy, metadata title/description pattern).
- `src/lib/config.ts` — add PDP constants: `RECENTLY_VIEWED_MAX = 8`,
  `RECENTLY_VIEWED_STORAGE_KEY`, `QA_RATE_LIMIT_WINDOW_MS`,
  `QA_MAX_SUBMISSIONS_PER_WINDOW`, `AUTHOR_NAME_MAX = 120`, `QUESTION_MAX = 2000`.
  (`productPath()` already exists.) No magic values in components.
- `src/components/catalog/catalog-skeleton.tsx` — optionally export a PDP
  skeleton alongside the grid/page skeletons.

### Data Model Changes

None. All tables exist from T1. The PDP reads `products_public`, `product_images`
(including the already-seeded `variant_id` column), `product_variants`,
`product_categories`, and `product_questions`. The anon INSERT policy for
`product_questions` already exists (`0005_rls_policies.sql`). **No migration.**

### API Endpoints

No REST endpoints. The single write is a Next.js **server action**
(`actions.ts`) invoked from the Q&A form:

- **Q&A submit (server action)** — input `{ productId, authorName, question,
  website(honeypot) }`; returns `{ status: 'success' | 'invalid' | 'rate-limited'
  | 'error', fieldErrors?, message? }`. Inserts one `product_questions` row via
  the anon client (RLS enforces `is_published=false`, `answer=null`,
  `is_active_product`). Trims, length-checks, honeypot-checks, and rate-limits
  first.

### Dependencies

- No new npm dependencies. `radix-ui` (installed) provides Dialog/FocusScope for
  the zoom lightbox; `@hugeicons/react` + `@hugeicons/core-free-icons` for icons;
  `next-intl` for i18n; `@supabase/supabase-js` via `createPublicClient()`. Do
  NOT add a form/validation library — hand-roll validation to match the DB CHECKs.

## Out of Scope

- Add-to-cart / buy button / cart interaction (T6 — do not render a dead buy CTA).
- Search, filters, sorting, related / "you may also like" products (T5 / Phase 2).
- Admin answering of questions or any admin surface (T11).
- Customer accounts, wishlists, server-side saved history (Phase 2 — recently
  viewed is localStorage only).
- Product structured data / JSON-LD and sitemap entries (T14 — but keep the
  breadcrumb `items` array shape reusable, as T3 did).
- Reviews & ratings, product video, size variants, assembly/care info,
  downloadable spec sheets, social sharing, back-in-stock (client SKIP list).
- CAPTCHA / third-party anti-spam service (honeypot + in-memory rate limit only;
  a durable/global rate limiter is a documented follow-up, not this ticket).
