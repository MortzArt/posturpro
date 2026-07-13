# Task: T6 — Cart

## Priority

**High** — T6 is the direct dependency of T7 (Checkout) and T8 (Payments), the
revenue path. Catalog, PDP, and search (T3–T5) are shipped; without a cart a
shopper can find a chair but cannot begin to buy it. It is next in BUILD_PLAN
order and its only blocker (T4) is satisfied.

## Complexity

**medium** — New client-side feature (persistent guest cart + cart page +
"add to cart" affordance) but it follows patterns already in the codebase:

- Guest localStorage persistence mirrors the existing `src/lib/recently-viewed.ts`
  (guarded read/write, versioned key, SSR guard, shape validation, single warn) — a
  proven pattern to copy, not invent.
- No new data model. The `orders`/`order_items` tables (0003_commerce.sql) are the
  **checkout** snapshot (T7), immutable by DB trigger — the cart writes to neither.
  Cart state is client-only (localStorage), consistent with the "no accounts in
  Phase 1" scope and the recently-viewed precedent.
- Free-shipping threshold + flat rate are already read via `getStoreSettingsStatic()`
  and seeded in `store_settings`; the cart reuses that read, no new backend.
- Estimated 10–15 files (a new `/carrito` route, a cart context provider, a
  localStorage lib + tests, a header cart-count island, an "add to cart" island on
  PDP, i18n keys in two locales, e2e + unit tests). New state management (a React
  context provider for cross-component cart access) is the one genuinely new piece,
  but it is a well-scoped island — hence medium, not high.

## Feature Type

**full-feature** — Adds both UI (cart page, header cart badge, add-to-cart button,
free-shipping progress bar) and logic (localStorage persistence lib, cart state
provider, quantity/line-total math, free-shipping computation). All standard-tier
stages run at full depth.

## User Story

As a **guest shopper in Mexico**, I want **to add chairs to a cart that survives a
page refresh and a return visit, review and adjust quantities, remove items, see
per-line and cart totals, and see how much more I need to spend to earn free
shipping**, so that **I can assemble my order with confidence before checking out**.

## Background

**What exists today:**

- Catalog (T3), PDP (T4 — `/producto/[slug]`, `ProductPurchasePanel`), and search
  (T5) are shipped. The PDP has a variant selector but **no "add to cart" control** —
  it currently renders gallery + price + stock + variants only.
- `store_settings` is seeded (flat rate `50_000` cents = MX$500, free-shipping
  threshold `1_000_000` cents = MX$10,000) and read via `getStoreSettingsStatic()`
  (`src/lib/store-settings.ts`), which degrades to `null` gracefully. The footer
  already renders a "free shipping over {threshold}" line.
- `src/lib/recently-viewed.ts` is a proven guest-persistence pattern: storage key +
  cap in config, guarded read/write, shape validation via `isEntry`, single-warn-
  per-session, SSR guard. Its component (`recently-viewed.tsx`) renders `null` until
  a mount effect hydrates it — no hydration mismatch.
- Money is integer cents everywhere; `formatMXN()` (`src/lib/money.ts`) is the ONLY
  cents→string boundary. `interpolate()` fills `{token}` templates client-side.

**What's missing:** A cart. No way to collect products, no cart page, no
persistence, no add-to-cart affordance.

**Why it matters:** T7 checkout reads the cart to build the order; without T6 the
store cannot transact. This is the last purely-client feature before the
server-side order/payment work begins.

**Scope guardrails (from BUILD_PLAN + PRODUCT_SPEC):**

- **NO checkout.** The cart page's primary CTA links toward checkout (`/checkout`,
  owned by T7) but T6 does **not** build the checkout page, order creation, stock
  reservation, or discount-code validation. If `/checkout` 404s until T7 ships, that
  is acceptable (same pattern T3 used linking to the then-unbuilt PDP route).
- **NO mini-cart / cart drawer.** PRODUCT_SPEC "Confirmed out of scope" explicitly
  lists **mini-cart** as SKIP. Adding to cart is confirmed via a header badge + inline
  button confirmation only — no slide-out drawer.
- **NO customer accounts / server-persisted cart.** Phase 2. Cart is guest-only,
  localStorage-backed.
- **NO min/max order quantities.** PRODUCT_SPEC "out of scope" lists this as SKIP.
  The only quantity ceiling is a UX sanity cap (`MAX_CART_ITEM_QUANTITY`), not a
  business rule; real overselling protection is enforced server-side at checkout (T7).
- Placeholder/tunable values (max qty cap, storage key, checkout path, confirm delay)
  are centralized in `src/lib/config.ts` per BUILD_PLAN rule 4.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

- [ ] **AC-1**: An "Agregar al carrito" / "Add to cart" button appears on the PDP
      purchase panel. Clicking it adds the currently-selected variant (or the product
      itself if it has no variants) to the cart at quantity 1.
- [ ] **AC-2**: Adding the same product+variant again increments its quantity rather
      than creating a duplicate line. Two different variants of the same product are
      two distinct lines (keyed by `productId + variantId`).
- [ ] **AC-3**: The cart persists across a full page refresh AND across closing and
      reopening the browser (localStorage), for a guest with no account.
- [ ] **AC-4**: A cart-item-count badge in the site header reflects the total quantity
      of items in the cart and updates immediately on add/remove/quantity change, on
      every page, without a full reload.
- [ ] **AC-5**: A cart page exists at `/carrito` (locale-aware: `/carrito` for ES,
      `/en/carrito` for EN) listing every cart line with: cover image, product name,
      variant/color label (when applicable), unit price, a quantity control, a remove
      control, and a per-line total (`unit price × quantity`).
- [ ] **AC-6**: The quantity control lets the user increase and decrease a line's
      quantity; the line total, cart subtotal, header badge, and free-shipping progress
      all recompute immediately.
- [ ] **AC-7**: Decreasing quantity below 1 is not possible via the stepper; a
      dedicated "Eliminar" / "Remove" control removes the line entirely.
- [ ] **AC-8**: The cart page shows an order summary: subtotal (sum of line totals), a
      shipping line, and a total. Shipping is **free** when subtotal ≥
      `store_settings.free_shipping_threshold_cents`; otherwise it shows the flat rate
      `store_settings.shipping_flat_rate_cents`. **Neither value is hardcoded** — both
      read from store settings (seed defaults only in config).
- [ ] **AC-9**: A free-shipping progress element shows how much more the shopper must
      add to reach the threshold (e.g. "Te faltan $X para envío gratis") with a bar
      filling toward the threshold. At subtotal ≥ threshold it shows an achieved state
      ("¡Tienes envío gratis!"). It is hidden entirely if store settings are
      unavailable (graceful degradation, never `$NaN`).
- [ ] **AC-10**: An empty cart shows a friendly empty state with a CTA to browse the
      catalog (`/sillas`); no summary, no checkout button, no progress bar.
- [ ] **AC-11**: All cart UI copy is present in BOTH `es-MX.json` and `en.json` under a
      new `cart` namespace; the language toggle switches every string. ES is default.
      `messages.test.ts`/`keys-used.test.ts` parity tests pass.
- [ ] **AC-12**: All monetary display goes through `formatMXN()`; all internal cart
      math is in integer cents. No floating-point money, no `$NaN`.
- [ ] **AC-13**: Quantity is clamped to `[1, MAX_CART_ITEM_QUANTITY]` per line (config
      constant). A stored/edited quantity above the cap is clamped on read; the
      stepper's "+" disables at the cap.
- [ ] **AC-14**: Corrupt/absent/foreign localStorage data yields an empty cart (never a
      thrown error, never a broken page); a single guarded `console.warn` per session,
      mirroring `recently-viewed`.
- [ ] **AC-15**: A checkout CTA appears when the cart is non-empty and links to the T7
      checkout route (`CHECKOUT_PATH`); T6 does not implement checkout itself.
- [ ] **AC-16**: The cart is fully keyboard-operable (tab to stepper/remove, Enter/Space
      activate), quantity changes announce via an `aria-live` region, and the header
      badge has an accessible label (e.g. "Carrito, 3 artículos").
- [ ] **AC-17**: The feature has **no coupling to URL/search-filter state** (T5 carry-
      over note): cart state lives only in localStorage + context, never in query
      params; navigating a filtered catalog URL never mutates the cart.
- [ ] **AC-18**: Adding an out-of-stock variant/product is prevented — the add-to-cart
      button is disabled (with a clear "Agotado" label) when the selected variant/
      product stock is 0.

## Edge Cases

At least 5 required; the following MUST be handled:

1. **Corrupt localStorage JSON** (`"posturpro:cart:v1"` = `"{not json"` or an array of
   the wrong shape) → cart reads as empty, one guarded `console.warn`, page renders the
   empty state. Mirror the `recently-viewed` `isEntry` shape guard.
2. **localStorage disabled / private mode / quota exceeded** → adds are swallowed
   gracefully (in-memory context state still updates for the session; write failure
   warns once); the page never throws.
3. **Stored quantity ≤ 0 / non-integer / negative / `NaN` / > cap** (tampered storage)
   → clamped to `[1, MAX]` on read; a `0`/junk quantity drops the line rather than
   rendering "0 × price". A missing `unitPriceCents` drops the line (no `$NaN`).
4. **A cart line references a product/variant that no longer exists or changed price** —
   the cart stores a client snapshot (name, unit price, image, sku) and renders from
   it. Re-validation against live prices/stock is a **T7 checkout** concern, explicitly
   out of scope; documented so the snapshot is never treated as authoritative at pay.
5. **Two browser tabs open** — adding in tab A reflects in tab B via a `storage` event
   listener that re-reads localStorage into context; last write wins, no crash on a
   concurrent-write race.
6. **store_settings unavailable** (`getStoreSettingsStatic()` returns `null`) → summary
   shows subtotal only (neutral shipping label), the free-shipping progress bar is
   hidden, and totals never render `$NaN`.
7. **Subtotal exactly equal to the threshold** → free shipping (`≥`, not `>`); progress
   bar at 100%, achieved state shown.
8. **Add-to-cart / badge during SSR / before hydration** — the add-to-cart island and
   header badge render an inert/`null` shell until hydrated (mirror `RecentlyViewed`'s
   mounted-flag pattern) so there is no hydration mismatch and no `window` access on the
   server.
9. **Rapid repeated clicks on "+" or "Add to cart"** — increments use functional state
   updates so they are coalesced correctly, never lost or double-applied, never exceed
   the cap.
10. **Removing the last item** → transitions cleanly to the empty state (badge → 0,
    summary/progress/checkout hidden).

## Error States Table

| Trigger                                        | User Sees                                                         | System Does                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Corrupt/foreign localStorage payload           | Empty cart + empty-state CTA                                     | `readCart()` returns `[]`; one guarded `console.warn`; state initialized empty  |
| localStorage write fails (quota/private mode)  | Item still appears this session; no error toast                  | In-memory context updated; write swallowed with one `console.warn`; no throw    |
| `store_settings` read returns `null`           | Subtotal + neutral shipping label; NO free-shipping progress bar | Summary from subtotal only; progress element not rendered; no `$NaN`            |
| Tampered quantity (0 / negative / NaN / > cap) | Clamped value shown, or line dropped                             | `sanitizeQuantity` clamps to `[1, MAX]`; `0`/junk drops the line on read        |
| Selected variant is out of stock               | "Agotado" disabled add-to-cart button                            | Button `disabled` + `aria-disabled`; add action guarded/no-op                   |
| Add-to-cart before hydration (SSR)             | Inert control; no badge-count flash                              | Island renders `null`/inert until `mounted`; no `window` access server-side     |
| Cross-tab concurrent edit                      | Cart re-syncs to latest                                          | `storage` listener re-reads localStorage into context; last write wins          |

## UX Requirements

- **Loading**: The cart page body is a client island reading localStorage; before
  hydration it shows a minimal skeleton (or the server-rendered empty shell) — never a
  flash of a wrong count. The header badge renders no number until hydrated, then fades
  the count in (`enter-fade`, `ease-out`, reduced-motion respected).
- **Empty**: Centered friendly message ("Tu carrito está vacío" / "Your cart is empty")
  + a primary CTA button "Ver sillas" → `/sillas`. No summary, no progress, no checkout.
- **Error**: No user-facing hard error — all failures degrade to empty/inert (see Error
  States). If storage is unavailable the cart works in-memory for the session and simply
  does not persist; no scary message.
- **Success (item added)**: The header badge count increments with a subtle count-change
  animation; on the PDP the add button briefly confirms ("Agregado ✓" for
  `ADD_TO_CART_CONFIRM_MS`, then reverts) — inline, NOT a mini-cart drawer. Animation is
  compositor-friendly (transform/opacity), interruptible, reduced-motion gated.
- **Populated cart page**: Line rows (image, name, variant, unit price, qty stepper,
  remove, line total), a sticky-on-desktop order-summary card (subtotal, shipping,
  total), the free-shipping progress bar, and the checkout CTA.
- **Mobile (375px)**: Single-column line rows; image thumbnail left, details right, qty
  stepper + remove below; summary stacks under the list; no horizontal scroll at 320px.
  Tap targets ≥ 44px (matches the T5 facet fix). Checkout CTA full-width.
- **Tablet (768px)**: Two-column line row layout; summary in a right rail or below per
  width; progress bar full-width above the summary.

## Technical Approach

### Files to Create

- `src/lib/cart/cart-storage.ts` — Guarded localStorage read/write mirroring
  `recently-viewed.ts`: versioned key (`CART_STORAGE_KEY`), `readCart()`, `writeCart()`,
  `isCartLine()` shape guard, `sanitizeQuantity()`, single-warn-per-session,
  `hasStorage()` SSR guard. Pure functions, no React.
- `src/lib/cart/cart-line.ts` — `CartLine` type + pure helpers: `lineTotalCents`,
  `subtotalCents`, `totalItemCount`, `addLine` (dedupe by key, increment, clamp),
  `setLineQuantity`, `removeLine`, and `cartLineKey(productId, variantId)`.
- `src/lib/cart/shipping.ts` — Pure `computeShipping({ subtotalCents, flatRateCents,
  freeThresholdCents })` and `freeShippingProgress(...)` → `{ remainingCents, achieved,
  pct }`; a "settings unavailable" variant when the inputs are null.
- `src/components/cart/cart-provider.tsx` — `"use client"` context provider holding
  cart lines in state, hydrating from `readCart()` on mount, persisting on change,
  listening to the `storage` event for cross-tab sync, exposing `useCart()` (`lines`,
  `addItem`, `setQuantity`, `removeItem`, `itemCount`, `subtotalCents`, `hydrated`).
- `src/components/cart/add-to-cart-button.tsx` — `"use client"` PDP island; reads
  `useCart()`, adds the selected variant, shows the transient "added" confirmation,
  disables when out of stock or before hydration.
- `src/components/cart/cart-count-badge.tsx` — `"use client"` header island rendering
  the item count (null before hydration), accessible label + count animation, links to
  `/carrito` with a `@hugeicons` cart icon (e.g. `ShoppingCart01Icon`).
- `src/components/cart/cart-page-client.tsx` — `"use client"` cart page body: line list,
  summary, progress bar, empty state. Receives store-settings cents (flat rate +
  threshold) as props from the server page; copy via `useTranslations("cart")`.
- `src/components/cart/cart-line-row.tsx` — one line row.
- `src/components/cart/quantity-stepper.tsx` — accessible +/- stepper (shadcn `Button` +
  `Input`), clamps `[1, MAX]`, disables at bounds.
- `src/components/cart/free-shipping-progress.tsx` — Tailwind progress bar (transform:
  scaleX, compositor-friendly) + remaining/achieved copy; hidden when settings null.
- `src/app/[locale]/carrito/page.tsx` — the `/carrito` route (server component: reads
  `getStoreSettingsStatic()` for flat-rate/threshold cents, resolves i18n metadata,
  renders `CartPageClient`). Locale-aware via existing routing.
- `src/lib/cart/*.test.ts` — unit tests (storage guard, line math, shipping, quantity
  sanitization), mirroring `recently-viewed.test.ts` / `money.test.ts`.
- `e2e/cart.spec.ts` — Playwright: add from PDP, persist across reload, qty edit,
  remove, empty state, free-shipping progress, header badge, ES/EN copy.

### Files to Modify

- `src/lib/config.ts` — Add `CART_STORAGE_KEY = "posturpro:cart:v1"`,
  `MAX_CART_ITEM_QUANTITY` (e.g. `99`), `CART_PATH = "/carrito"`,
  `CHECKOUT_PATH = "/checkout"`, `ADD_TO_CART_CONFIRM_MS` (~1500). Document each (Rule 4).
- `src/app/[locale]/layout.tsx` — Wrap the shell in `<CartProvider>` (inside
  `NextIntlClientProvider`) so header badge + PDP button + cart page share one cart.
- `src/components/layout/site-header.tsx` — Add `CartCountBadge` in the right-hand
  control cluster (`ml-auto flex shrink-0 …`, ~line 85), before/after the language
  toggle.
- `src/components/layout/mobile-nav.tsx` — Add a cart link so mobile users reach
  `/carrito`.
- `src/components/product/product-purchase-panel.tsx` — Render `AddToCartButton`, passing
  the selected variant id/label, effective price cents, product snapshot (id, name, slug,
  cover image, sku), and out-of-stock flag. The panel's existing selection state is the
  source of truth for which variant is added.
- `src/app/[locale]/producto/[slug]/page.tsx` — Thread the product snapshot fields (sku,
  cover image url) the add button needs into `ProductPurchasePanel` props.
- `src/messages/es-MX.json` + `src/messages/en.json` — Add a `cart` namespace (keys
  below).
- `src/messages/keys-used.test.ts` — extend parity coverage for the new keys.

### Data Model Changes

**None.** The cart is client-side (localStorage) per the Phase-1 "persistent guest
cart" scope and the `recently-viewed` precedent. The `orders`/`order_items` tables
(0003_commerce.sql) are the immutable **checkout** snapshot written by T7, not by the
cart. Do NOT write to any table in T6.

### API Endpoints

**None.** No server writes. The only backend read is the existing
`getStoreSettingsStatic()` (flat rate + free-shipping threshold), already built.

### Dependencies

**None new.** React context (built-in) for state; localStorage for persistence; existing
shadcn `Button`/`Input`/`Badge`; `@hugeicons/react` + `@hugeicons/core-free-icons` for
the cart icon; `next-intl` for copy; `formatMXN`/`interpolate` for display. No
`Sheet`/`Dialog` (mini-cart out of scope). Prefer a plain Tailwind progress bar over the
`slider` component.

### i18n keys (new `cart` namespace, both locales)

`cart.title`, `cart.empty.title`, `cart.empty.cta`, `cart.item.remove`,
`cart.item.increase`, `cart.item.decrease`, `cart.item.quantityLabel`,
`cart.item.lineTotalLabel`, `cart.summary.heading`, `cart.summary.subtotal`,
`cart.summary.shipping`, `cart.summary.shippingFree`, `cart.summary.total`,
`cart.freeShipping.remaining` (template `Te faltan {amount}…`),
`cart.freeShipping.achieved`, `cart.checkout`, `cart.addToCart`, `cart.added`,
`cart.outOfStock`, `cart.badgeLabel` (template `Carrito, {count} artículos`),
`cart.headerLink`, `cart.metadata.title`.

## Out of Scope

- **Checkout** (T7): the checkout page, order/order-item creation, stock reservation,
  Mexican postal-code/state validation, discount-code validation, order confirmation.
- **Payments** (T8): Mercado Pago, any payment capture.
- **Mini-cart / cart drawer** — explicitly SKIP in PRODUCT_SPEC.
- **Customer accounts / server-persisted or synced cart** — Phase 2.
- **Min/max order quantities** — explicitly SKIP in PRODUCT_SPEC (only a UX sanity cap).
- **Live price/stock re-validation of cart lines** against the DB — a T7 concern; the
  cart renders from its client snapshot.
- **Saved-for-later / wishlist** — Phase 2. **Abandoned-cart emails** — Phase 3.
- **Discount-code entry** on the cart page — the field lives in T7 checkout.
