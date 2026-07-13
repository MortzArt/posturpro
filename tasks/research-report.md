# Research Report: T6 — Cart

## Codebase Analysis

### Existing Patterns

- **Guest localStorage persistence** — `src/lib/recently-viewed.ts` (128 lines). The
  canonical guest-persistence pattern: a config-owned storage key + cap
  (`RECENTLY_VIEWED_STORAGE_KEY`, `RECENTLY_VIEWED_MAX`), an `hasStorage()` SSR guard
  (`typeof window !== "undefined" && typeof window.localStorage !== "undefined"`,
  lines 75–77), `readRecentlyViewed()` that JSON-parses, checks `Array.isArray`, filters
  through an `isEntry()` shape guard, and caps (lines 83–101), a `recordRecentlyViewed()`
  that de-dupes + caps + writes (lines 108–127), and `warnOnce()` (a
  `warnedThisSession` boolean, lines 63–72) so a failing storage warns at most once.
  **Reuse strategy:** clone this file structure verbatim as `src/lib/cart/cart-storage.ts`
  — same guards, same `warnOnce`, same `isEntry`→`isCartLine`. Add a `sanitizeQuantity`
  because cart entries carry an editable integer quantity (recently-viewed does not).
- **Client island that hydrates from storage without mismatch** —
  `src/components/product/recently-viewed.tsx` (lines 1–78). `"use client"`, state
  initialized to `null`, a single `useEffect` reads storage and sets state, returns
  `null` until hydrated. **Reuse strategy:** the cart provider and the header badge use
  the same mounted/`hydrated` gate so no server/client HTML divergence and no `window`
  access on the server (ticket edge 8, AC-4/AC-14).
- **Integer-cents money + single format boundary** — `src/lib/money.ts`. `formatMXN(cents)`
  throws on a non-integer (line 27) — it is the ONLY cents→string boundary; all cart
  math stays in integer cents. **Reuse strategy:** every cart price display calls
  `formatMXN`; line/subtotal/shipping math are pure integer functions in
  `src/lib/cart/cart-line.ts` + `shipping.ts` (AC-12).
- **Store-settings read with graceful degradation** — `src/lib/store-settings.ts`.
  `getStoreSettingsStatic()` (lines 129–136) is a cookie-free `unstable_cache` read
  (tag `store-settings`, revalidate `CATALOG_REVALIDATE_SECONDS`) returning the typed row
  or `null` (never throws). The row carries `shipping_flat_rate_cents` and
  `free_shipping_threshold_cents`. **Reuse strategy:** the `/carrito` server page calls
  `getStoreSettingsStatic()` and passes the two cents values (or `null`) into
  `CartPageClient`; a `null` result hides the free-shipping progress bar and shows a
  neutral shipping label (AC-8/AC-9, edge 6).
- **Config as the single home for placeholders/tunables** — `src/lib/config.ts`. Money
  constants end in `_CENTS`; durations end in `_MS`; storage keys are versioned
  (`RECENTLY_VIEWED_STORAGE_KEY = "posturpro:recently-viewed:v1"`, line 282); route
  segments are Spanish and locale-agnostic (`CATALOG_PATH = "/sillas"`, `productPath()`).
  **Reuse strategy:** add `CART_STORAGE_KEY`, `MAX_CART_ITEM_QUANTITY`, `CART_PATH`,
  `CHECKOUT_PATH`, `ADD_TO_CART_CONFIRM_MS` here (BUILD_PLAN Rule 4).
- **Server resolves i18n, client fills templates** — server components use
  `await getTranslations(ns)` (`site-header.tsx:31`, PDP page); trivial client
  interpolation uses the pure `interpolate("{token}", values)` helper
  (`src/lib/interpolate.ts`). Stateful client components with many strings use
  `useTranslations(ns)` directly (`mobile-nav.tsx:48`, `filter-sheet.tsx`, `error.tsx`).
  **Reuse strategy:** the cart page body is a heavy stateful client island, so it uses
  `useTranslations("cart")` directly (cleaner than threading ~20 strings), consistent
  with `mobile-nav`/`filter-sheet`. The transient "added" label uses `interpolate` for
  the count token.
- **i18n key parity is test-enforced** — `src/messages/messages.test.ts` (ES/EN identical
  key sets) and `keys-used.test.ts` (every dotted key referenced in code exists in both
  locales). **Reuse strategy:** add the `cart` namespace to BOTH `es-MX.json` and
  `en.json` in the same edit; run these tests (AC-11).
- **Whole-card locale-aware Link + hugeicons** — `product-card.tsx` (`Link` from
  `@/i18n/navigation`, `HugeiconsIcon` + `Image01Icon`). **Reuse strategy:** the header
  cart badge is a locale-aware `Link` to `CART_PATH` with a hugeicons cart glyph
  (`ShoppingCart01Icon`); never mix icon sets (CLAUDE.md).

### Relevant Files

| File                                                        | Purpose                                    | Relevance                                             | Action    |
| ----------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- | --------- |
| `src/lib/recently-viewed.ts`                                | Guarded localStorage guest persistence     | The exact pattern the cart storage lib clones         | Reference |
| `src/lib/recently-viewed.test.ts`                           | Storage-guard unit tests                   | Test template for `cart-storage.test.ts`              | Reference |
| `src/components/product/recently-viewed.tsx`                | Hydrate-from-storage client island         | Mounted-flag / null-until-hydrated pattern            | Reference |
| `src/lib/money.ts`                                          | `formatMXN`, integer-cents boundary        | All cart price display + math discipline              | Reference |
| `src/lib/store-settings.ts`                                 | `getStoreSettingsStatic()` (flat/threshold)| The cart's ONLY backend read (AC-8/AC-9)              | Reference |
| `src/lib/config.ts`                                         | Centralized tunables                       | Add cart storage key / cap / paths / confirm delay    | Modify    |
| `src/app/[locale]/layout.tsx`                               | Shell (header/footer/WhatsApp), providers  | Wrap in `<CartProvider>` inside NextIntlClientProvider | Modify    |
| `src/components/layout/site-header.tsx`                     | Persistent top chrome                      | Mount the cart-count badge (~line 85 cluster)         | Modify    |
| `src/components/layout/mobile-nav.tsx`                      | Mobile drawer                              | Add a `/carrito` link                                 | Modify    |
| `src/components/product/product-purchase-panel.tsx`         | PDP selection island (variant SOT)         | Render `AddToCartButton` using selected variant       | Modify    |
| `src/app/[locale]/producto/[slug]/page.tsx`                 | PDP server page                            | Thread sku + cover image into the panel props         | Modify    |
| `src/lib/catalog/product-detail.types.ts`                   | `ProductDetail`, `ProductVariantView`      | Source fields for the cart-line snapshot              | Reference |
| `src/lib/catalog/types.ts`                                  | `CatalogProductCard`, `StockState`         | Snapshot field shapes; stock-state enum               | Reference |
| `src/messages/es-MX.json`, `src/messages/en.json`           | i18n dictionaries                          | Add `cart` namespace (both, same edit)                | Modify    |
| `src/messages/keys-used.test.ts`                            | Key-usage parity test                      | Extend for new keys                                   | Modify    |
| `src/i18n/navigation.ts` / `routing.ts`                     | Locale-aware `Link`, `getPathname`         | `/carrito` becomes `/en/carrito` automatically        | Reference |
| `src/components/ui/{button,input,badge}.tsx`                | shadcn primitives                          | Stepper (Button+Input), badge count, buttons          | Reference |
| `playwright.config.ts` / `e2e/product-detail.spec.ts`       | E2E harness (baseURL :3000, chromium+mobile)| Template for `e2e/cart.spec.ts`                       | Reference |

### Data Flow

**Add to cart (PDP):**
`ProductPurchasePanel` owns `selectedVariantId` (client state) → user clicks
`AddToCartButton` → `useCart().addItem(snapshot)` where `snapshot` = `{ productId, slug,
name, variantId, variantLabel, unitPriceCents (= priceOverrideCents ?? product.priceCents),
coverImageUrl, sku, quantity: 1 }` → `CartProvider` reducer calls `addLine(lines, snapshot)`
(dedupe by `cartLineKey(productId, variantId)`, increment + clamp) → `setState` → effect
persists via `writeCart(lines)` (localStorage) → context value changes → `CartCountBadge`
and the cart page re-render.

**Cart page render (`/carrito`):**
Server `page.tsx` → `getStoreSettingsStatic()` → `{ flatRateCents, freeThresholdCents } |
null` → passes to `<CartPageClient flatRateCents freeThresholdCents />` → client reads
`useCart()` for `lines` (hydrated from `readCart()` on mount) → computes `subtotalCents =
subtotalCents(lines)`, `shipping = computeShipping({subtotal, flat, threshold})`,
`progress = freeShippingProgress(...)` → renders line rows + summary + progress bar or,
when `lines.length === 0`, the empty state.

**Cross-tab sync:** tab A `writeCart()` fires a `storage` event → tab B's `CartProvider`
`storage` listener re-runs `readCart()` → `setState` → badge/page re-render (edge 5).

**Persistence round-trip:** refresh → `CartProvider` mount effect `readCart()` → parse →
`isCartLine` filter → `sanitizeQuantity` clamp → state (AC-3). Corrupt/foreign payload →
`[]` + one warn (AC-14).

### Similar Features (Reference Implementations)

- **Recently-viewed strip** (`src/lib/recently-viewed.ts` + `recently-viewed.tsx`) — the
  closest analog: guest, client-only, localStorage, shape-guarded, hydration-safe,
  degrade-silently. Patterns to follow: config-owned key+cap, `hasStorage`/`isEntry`/
  `warnOnce`, `null`-until-mounted rendering, storing a *view-model snapshot* (not just
  an id) so the UI renders without a re-fetch. Cart adds: editable quantity (needs
  `sanitizeQuantity`), a header badge, and a React context (recently-viewed is a single
  local island; the cart must be read from three places — header, PDP, cart page —
  hence a provider).
- **PDP purchase panel** (`product-purchase-panel.tsx`) — already the single source of
  truth for `selectedVariantId` (lines 82–91) and computes the displayed price/stock per
  variant. The add-to-cart button hangs off this same selection so "what you see is what
  you add." Follow its "server resolves display strings, island stays presentational"
  discipline — but the add button legitimately needs `useCart()`, so it is a small
  logic-bearing island.
- **Footer free-shipping line** (`footer.freeShipping` key + `getStoreSettingsStatic`) —
  proves the threshold is already surfaced from store settings with a `{threshold}`
  template; the cart's progress copy is the same value in a richer widget.

## Dependency Analysis

### Existing Dependencies to Leverage

- `next-intl` (^4.13.2) — `useTranslations` (client) / `getTranslations` (server).
- `@hugeicons/react` (^1.1.9) + `@hugeicons/core-free-icons` (^4.2.2) — cart icon
  (`ShoppingCart01Icon`); never mix icon sets.
- shadcn `Button`, `Input`, `Badge` (`src/components/ui/`) — stepper + badge + CTAs.
- React 19 (built-in `createContext`/`useReducer`/`useSyncExternalStore` if preferred).
- `src/lib/money.ts` `formatMXN`; `src/lib/interpolate.ts` `interpolate`; `cn()` utility.
- `@/i18n/navigation` `Link` — locale-aware routing for `/carrito`.
- `@supabase/*` — NOT needed by the cart (no server read beyond store-settings, which is
  already wrapped). The browser client (`client.ts`) is available if T7 later needs live
  re-validation, but T6 does not touch it.

### New Dependencies Needed

**None.** State via React context; persistence via localStorage; progress bar via
Tailwind (`transform: scaleX`, compositor-friendly). No `Sheet`/`Dialog` — mini-cart is
out of scope. Introducing a state library (Zustand/Jotai) is unwarranted for one cart
and would break the "no new deps without cause" grain of the codebase.

### Internal Dependencies

- `CartProvider` must sit inside `NextIntlClientProvider` in `[locale]/layout.tsx` so
  child islands can call both `useCart` and `useTranslations`. Implication: one provider
  at the shell level; every route (including PDP and `/carrito`) is a descendant.
- `AddToCartButton` depends on `CartProvider` being mounted — it is, via the shell.
- The cart page depends on `getStoreSettingsStatic()`; that read already degrades to
  `null`, so the dependency is safe (no crash if the row/DB is missing).
- `cart-line.ts` / `shipping.ts` are pure and depend only on `config` constants — unit-
  testable in isolation with no DOM or network.

## External Research

### API Documentation

- **None required.** T6 introduces no external API. Mercado Pago is T8; the only backend
  touchpoint is the already-built Supabase `store_settings` read.

### Library Documentation

- **localStorage / `storage` event (MDN)** — the `storage` event fires on *other* tabs of
  the same origin, not the tab that wrote it; use it for cross-tab sync (edge 5). Wrapping
  every access in try/catch is mandatory (private-mode Safari throws on `setItem`; quota
  can throw `QuotaExceededError`) — already the `recently-viewed` discipline.
- **next-intl (v4)** — client components must be under `NextIntlClientProvider` (already
  in the shell) to call `useTranslations`; server pages use `getTranslations({ locale, ns })`.
  Locale-aware navigation uses `@/i18n/navigation` `Link`, which auto-prefixes `/en`.
- **React 19** — functional state updates (`setLines(prev => …)`) are required to coalesce
  rapid add/`+` clicks correctly (edge 9). `useSyncExternalStore` is the idiomatic way to
  subscribe to an external store (localStorage) with SSR-safe `getServerSnapshot` returning
  an empty cart — an alternative to the mounted-flag pattern; either is acceptable, but the
  mounted-flag mirrors the existing `recently-viewed` island most closely.

## Risk Assessment

### Technical Risks

| Risk                                                              | Likelihood | Impact | Mitigation                                                                                     |
| ----------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------- |
| Hydration mismatch from reading localStorage during SSR           | Med        | High   | Provider/badge render `null`/empty until a mount effect sets `hydrated`; mirror recently-viewed |
| Scope creep into checkout (order creation, stock reservation)     | Med        | High   | Ticket "Out of Scope" is explicit; CTA only *links* to `CHECKOUT_PATH`; no table writes         |
| Building a mini-cart drawer (it feels natural)                    | Med        | Med    | PRODUCT_SPEC lists mini-cart as SKIP; confirmation is header badge + inline button only         |
| Hardcoding MX$500 / MX$10,000 instead of reading store settings   | Low        | High   | AC-8 forbids it; read `getStoreSettingsStatic()`; config holds only *seed defaults*             |
| Floating-point money / `$NaN` on tampered data                    | Low        | High   | Integer-cents math; `formatMXN` throws on non-integer; `sanitizeQuantity` + line-drop guards    |
| Cross-tab desync / lost updates on rapid clicks                   | Med        | Low    | `storage` listener re-sync; functional state updates; last-write-wins is acceptable for a cart  |
| Stale snapshot price treated as authoritative at checkout         | Med        | Med    | Documented as a T7 concern; T7 re-validates against live prices/stock before order creation     |
| i18n key drift (ES/EN out of sync)                                | Low        | Med    | Add both dictionaries in one edit; `messages.test.ts` + `keys-used.test.ts` fail on drift       |
| URL/search-filter coupling regressing T5                          | Low        | Med    | AC-17: cart state never touches query params; e2e asserts filtered URL nav leaves cart intact   |

### Performance Considerations

- **No network cost.** Cart is localStorage + in-memory; the only DB read
  (`getStoreSettingsStatic`) is already `unstable_cache`d with ISR.
- **Progress bar** must animate `transform: scaleX` / `opacity` (compositor), never
  `width` (layout) — respect `prefers-reduced-motion` (CLAUDE.md baseline rules).
- **Provider re-renders**: memoize the context value and derived totals so a quantity
  change re-renders only the affected rows + summary, not every card on the page.

### Security Considerations

- **All localStorage is attacker-controlled** — treat it as hostile: validate shape
  (`isCartLine`), clamp quantity, drop lines with a missing/`NaN` `unitPriceCents`. This
  is display-only data client-side; the money that matters is recomputed server-side at
  T7 checkout from live product prices — the cart snapshot is never trusted for the order
  total.
- **No secrets, no XSS surface** — cart copy is i18n strings; product names/images come
  from the already-sanitized catalog view models; render as text/`next/image`, never
  `dangerouslySetInnerHTML`.
- **No PII** — the cart stores product snapshots only; contact/shipping data is a T7
  checkout concern, not stored in the cart.

## Implementation Recommendations

### Suggested Order of Implementation

1. **`src/lib/config.ts` constants** — everything downstream references them; add first.
2. **`src/lib/cart/cart-storage.ts` + `cart-line.ts` + `shipping.ts` (+ tests)** — pure,
   DOM-free logic; TDD against the recently-viewed/money test templates. Depends only on
   config.
3. **`CartProvider` + `useCart`** — wire storage + state + `storage`-event sync; the
   integration seam every UI piece needs.
4. **Mount `<CartProvider>` in `[locale]/layout.tsx`** — enables all islands.
5. **`CartCountBadge` in the header** — smallest UI surface; verifies the provider works
   end-to-end (add elsewhere → badge updates).
6. **`AddToCartButton` + wire into `ProductPurchasePanel` / PDP page** — first real add
   path; depends on the provider and the panel's selection state.
7. **`/carrito` page + `CartPageClient` + line row + stepper + progress** — the main
   surface; depends on everything above + store-settings read.
8. **i18n `cart` namespace in both locales + extend key tests.**
9. **`e2e/cart.spec.ts` + unit test gaps** — verify AC-1…AC-18 end to end.

### Key Decisions

- **State container: React context + `useReducer`** (recommended) over a new state
  library — one cart, three consumers, no new dep; matches the codebase's "built-ins
  first" grain. `useSyncExternalStore` is a valid alternative for storage subscription but
  the mounted-flag mirrors the shipped `recently-viewed` island most closely.
- **Cart line stores a snapshot** (name, unit price, image, sku, variant label) —
  recommended, mirroring `RecentlyViewedEntry`; the cart renders instantly with no
  re-fetch, and T7 re-validates prices/stock at checkout. Storing only ids would force a
  network read to render the cart, contradicting the client-only Phase-1 grain.
- **Line identity = `productId + variantId`** — recommended; a product with no variant
  uses a sentinel (e.g. `variantId = null` → key `productId`), so a no-variant product and
  a specific variant never collide (AC-2).
- **Copy delivery on the cart page: `useTranslations("cart")` inside the client body** —
  recommended over threading ~20 strings as props, consistent with `mobile-nav`/
  `filter-sheet`. The PDP `AddToCartButton` is small enough to receive its 3 labels as
  props (matching the panel's presentational discipline) OR use `useTranslations` — either
  is fine; prefer props to keep the panel's "no client i18n" invariant.
- **Free-shipping comparison is `≥`** (edge 7).

### Anti-Patterns to Avoid

- **Don't** hardcode MX$500 / MX$10,000 anywhere — read `store_settings`; config holds
  only seed defaults (AC-8).
- **Don't** compute money in floats or `parseFloat` a peso string — stay in integer cents;
  `formatMXN` is the only boundary (AC-12).
- **Don't** access `window`/`localStorage` at module top level or during render — guard
  with `hasStorage()` and a mount effect (edge 8).
- **Don't** build a mini-cart drawer, a discount-code field, or any checkout logic — all
  out of scope (SKIP / T7).
- **Don't** put cart state in the URL / search params (AC-17, T5 carry-over) — keep it in
  localStorage + context so filtered-catalog navigation never mutates the cart.
- **Don't** write to `orders`/`order_items` — those are the immutable T7 checkout snapshot
  (DB triggers block mutation anyway).
- **Don't** trust stored quantities/prices — validate + clamp + drop malformed lines; the
  server recomputes the authoritative total at checkout.
- **Don't** animate the progress bar's `width` — animate `transform: scaleX`; respect
  reduced-motion.
- **Don't** let a `null` store-settings read produce `$NaN` — hide the progress bar and
  show a neutral shipping label (edge 6).
