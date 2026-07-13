# Dev Summary: T6 — Cart

Stage 3 (Dev) of the standard pipeline. Full-feature implementation of a
persistent guest cart: localStorage lib + pure line/shipping math, a React
context provider, header badge, PDP add-to-cart island, and the `/carrito` page
with line rows, quantity steppers, free-shipping progress, order summary, and
empty state. Zero TODOs, zero placeholders. No new dependencies.

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `src/lib/config.ts` | modified | Added `CART_STORAGE_KEY="posturpro:cart:v1"`, `MAX_CART_ITEM_QUANTITY=99`, `CART_PATH="/carrito"`, `CHECKOUT_PATH="/checkout"`, `ADD_TO_CART_CONFIRM_MS=1500` — each documented (Rule 4). |
| `src/lib/cart/cart-line.ts` | created | `CartLine`/`CartLineInput` types + pure helpers: `cartLineKey`, `lineKey`, `sanitizeQuantity`, `isDroppableQuantity`, `lineTotalCents`, `subtotalCents`, `totalItemCount`, `addLine` (dedupe+increment+clamp), `setLineQuantity`, `removeLine`. Integer cents only; never formats. |
| `src/lib/cart/cart-storage.ts` | created | Guarded localStorage `readCart`/`writeCart` mirroring `recently-viewed.ts`: `hasStorage` SSR guard, `isCartLine` shape guard (rejects non-integer/`NaN` `unitPriceCents`), quantity drop/clamp on read, `warnOnce` per session, full try/catch (never throws). |
| `src/lib/cart/shipping.ts` | created | Pure `computeShipping`, `totalCents`, `freeShippingProgress`. `>=` threshold (edge 7); returns `unavailable`/`null` when settings null (edge 6); never `$NaN`. |
| `src/components/cart/cart-provider.tsx` | created | `"use client"` context + `useReducer` (functional actions coalesce rapid clicks, edge 9). Hydrates empty→storage on mount (no SSR mismatch), persists after hydration (no `[]` clobber), `storage` listener for cross-tab sync (edge 5). Exposes `useCart()`. |
| `src/components/cart/cart-count-badge.tsx` | created | Header island: 44×44 icon box, count as an **absolutely-positioned overlay pill** (no layout shift), scale-in motion, `99+` cap, ICU-plural `aria-label` via `t()`. Null count pre-hydration. |
| `src/components/cart/add-to-cart-button.tsx` | created | PDP island: fixed `h-11 w-full`, blur-masked interruptible label crossfade to "Agregado ✓", disabled when out-of-stock or pre-hydration, functional add. Labels via props (panel keeps no-client-i18n). SR-only `aria-live` add announcement. |
| `src/components/cart/quantity-stepper.tsx` | created | 44px +/- buttons + readOnly `tabular-nums` field. `−` disables at min, `+` at cap (AC-13). Icon-only buttons carry `aria-label`. Press-only motion. |
| `src/components/cart/cart-line-row.tsx` | created | `<li>` with thumb, PDP-linked name, variant label, unit price, stepper, ghost remove, `.price-value` line total. `StockBadge state="out"` + dimmed image when out-of-stock. `.stagger` entrance. |
| `src/components/cart/free-shipping-progress.tsx` | created | `transform: scaleX(pct)` fill (never width) via `.cart-progress-fill`, `role="progressbar"`, achieved tint + 🎉. Returns `null` when progress null (AC-9). |
| `src/components/cart/order-summary.tsx` | created | Subtotal/shipping/total via `formatMXN`; `free`/`flat`/`unavailable` shipping states (edge 6). Checkout CTA is a plain 44px `Link` to `CHECKOUT_PATH` (no form). |
| `src/components/cart/cart-empty-state.tsx` | created | Centered message + `Ver sillas` CTA to `/sillas`. `.enter-fade`. Rendered only after hydration confirms empty (AC-10). |
| `src/components/cart/cart-page-client.tsx` | created | `"use client"` body: `useTranslations("cart")`, derives totals from pure helpers, skeleton→(empty\|populated) crossfade, single page-level `aria-live` region, two-column `[2fr_1fr]` at `lg` with sticky summary. |
| `src/app/[locale]/carrito/page.tsx` | created | Server route: reads `getStoreSettingsStatic()` → flat/threshold cents (or null), i18n metadata, renders `CartPageClient`. SSG for both locales. |
| `src/app/[locale]/layout.tsx` | modified | Wrapped shell in `<CartProvider>` inside `NextIntlClientProvider`. |
| `src/components/layout/site-header.tsx` | modified | Mounted `<CartCountBadge />` in the right cluster before the language toggles. |
| `src/components/layout/mobile-nav.tsx` | modified | Added `MobileCartLink` (icon + "Carrito (3)") to the drawer nav list. |
| `src/components/product/product-purchase-panel.tsx` | modified | Renders `AddToCartButton` as the last info-column child; threads `productId`/`slug`/`basePriceCents`/`coverImageUrl` + `addToCartLabels`; snapshot uses `effectivePriceCents(selectedVariant, base)` + current stock state. |
| `src/app/[locale]/producto/[slug]/page.tsx` | modified | Threads product id/slug/price/cover + resolved `cart` labels into the panel. |
| `src/messages/es-MX.json`, `src/messages/en.json` | modified | New `cart` namespace (both locales, one edit). ICU plural on `badgeLabel`; `{count}`/`{amount}` templates for interpolation. |
| `src/messages/keys-used.test.ts` | modified | Added 31 consumed `cart.*` keys to the parity coverage list. |
| `src/app/globals.css` | modified | Added a T6 cart-motion block: `.cart-badge-pill` (scale-in), `.cart-add-label` (blur-mask crossfade), `.cart-press`/`.cart-step-press` (press feedback), `.cart-progress-fill` (scaleX). All transform/opacity, reduced-motion gated. |

## Data-Testids Added
- `cart-count-badge`, `cart-count-pill` — header badge (`cart-count-badge.tsx`)
- `mobile-nav-cart` — drawer cart link (`mobile-nav.tsx`)
- `add-to-cart-button`, `add-to-cart-live` — PDP button (`add-to-cart-button.tsx`)
- `quantity-stepper`, `quantity-decrease`, `quantity-increase`, `quantity-value` — stepper
- `cart-line-row`, `cart-line-name`, `cart-line-variant`, `cart-line-total`, `cart-line-remove`, `cart-line-image-link`, `cart-line-list` — line row + list
- `free-shipping-progress` — progress bar (with `data-achieved`)
- `order-summary`, `summary-subtotal`, `summary-shipping`, `summary-total`, `checkout-cta` — summary
- `cart-empty-state`, `cart-empty-cta` — empty state
- `cart-heading`, `cart-skeleton`, `cart-live-region` — page body

## Key Decisions
- **State: React context + `useReducer`** over a new lib — one cart, three consumers, matches the "built-ins first" grain. Functional reducer actions coalesce rapid clicks.
- **Null-until-hydrated via reducer-driven `hydrated` + a persist-gate ref** — the ref prevents the `lines` effect from writing `[]` over stored data before the mount read runs (would otherwise wipe the cart on every load).
- **ICU plurals resolve via `t()`, never `interpolate`** — `interpolate` only handles simple `{token}`. `badgeLabel` (plural) uses `t("badgeLabel", { count })` in client components; simple `{count}`/`{amount}` templates use `interpolate`.
- **PDP add announcement is count-free** (`announce.added` = "Se agregó al carrito") — the panel/button must not call `useTranslations`, so the label is pre-resolved server-side as a prop; a count-bearing plural would need client i18n. The header badge/aria-label carries the running count.
- **`sku` snapshot is `null`** — `ProductVariantView` carries no SKU; the field is nullable and T7 re-validates against the live DB, so a null snapshot is correct.
- **Line identity `productId::variantId`** (sentinel `productId` alone when no variant) so a no-variant product and a specific variant never collide (AC-2).

## AC-by-AC Status
- **AC-1** PASS — `AddToCartButton` on the PDP panel adds the selected variant (or product) at qty 1.
- **AC-2** PASS — `addLine` dedupes/increments by `cartLineKey(productId, variantId)`; two variants are two lines.
- **AC-3** PASS — `readCart`/`writeCart` persist across refresh and sessions (localStorage); build confirms `/carrito` renders.
- **AC-4** PASS — `CartCountBadge` reads `itemCount` from shared context; updates on every mutation, every page.
- **AC-5** PASS — `/carrito` (SSG, `/carrito` + `/en/carrito`) lists image, name, variant label, unit price, stepper, remove, line total.
- **AC-6** PASS — stepper drives `setQuantity`; line total, subtotal, badge, progress all recompute off one context change.
- **AC-7** PASS — `−` disabled at 1; dedicated ghost `Eliminar` removes the line.
- **AC-8** PASS — `OrderSummary` shows subtotal/shipping/total from `computeShipping` reading store-settings cents (props from server; never hardcoded).
- **AC-9** PASS — `FreeShippingProgress` shows remaining/achieved + `scaleX` bar; returns `null` (hidden) when settings null; never `$NaN`.
- **AC-10** PASS — `CartEmptyState` (message + `/sillas` CTA) with no summary/progress/checkout when hydrated & empty.
- **AC-11** PASS — `cart` namespace in both `es-MX.json` + `en.json`; `messages.test.ts` + `keys-used.test.ts` pass (634 unit tests green).
- **AC-12** PASS — all display via `formatMXN`; all math integer cents; `isCartLine` blocks non-integer prices.
- **AC-13** PASS — `sanitizeQuantity` clamps `[1, 99]` on read/edit; stepper `+` disables at cap.
- **AC-14** PASS — corrupt/absent/foreign payload → empty cart + one `warnOnce`; no throw.
- **AC-15** PASS — checkout CTA (non-empty only) is a `Link` to `CHECKOUT_PATH`; no checkout logic in T6.
- **AC-16** PASS — keyboard-operable stepper/remove; single page-level `aria-live` for qty/remove; PDP add owns its own SR region; badge `aria-label` carries the count.
- **AC-17** PASS — cart state lives only in localStorage + context; no query-param coupling (no `useSearchParams` in any cart file).
- **AC-18** PASS — `AddToCartButton` disabled + "Agotado" when `display.stockState === "out"`; click is a guarded no-op.

## Deviations from Ticket
- **No per-row remove collapse animation.** The design's remove-row height/opacity collapse was deferred to the opacity-only fallback the spec explicitly allows (watch-out #10): React unmounts the row on optimistic remove and totals recompute; animating unmount height reliably without a motion library would add complexity for a rare one-off exit. Enter stagger + `.price-value`/`.cart-progress-fill` motion are all present. Flagged for UX (Stage 8) if a collapse is wanted.
- **`announce.added` dropped its plural count** (see Key Decisions) — deliberate, to preserve the panel's no-client-i18n invariant.

## Edge Cases Handled
1. **Corrupt/foreign localStorage** → `readCart` returns `[]` + one `warnOnce`; page renders empty state (`cart-storage.ts`, AC-14).
2. **Disabled/quota storage** → `writeCart` swallows with one warn; in-memory context still updates (`cart-provider.tsx` persist effect + `cart-storage.ts`).
3. **Tampered quantity (0/neg/NaN/>cap)** → `isDroppableQuantity` drops junk lines, `sanitizeQuantity` clamps the rest; missing/`NaN` `unitPriceCents` fails `isCartLine` and drops the line (no `$NaN`).
4. **Stale snapshot** → cart renders from the client snapshot; documented as a T7 re-validation concern (`cart-line.ts` docstring).
5. **Two tabs** → `storage` listener re-reads into state, last-write-wins (`cart-provider.tsx`).
6. **`store_settings` null** → `computeShipping` → `unavailable` (neutral label), `freeShippingProgress` → `null` (bar hidden), total = subtotal (`shipping.ts`, `order-summary.tsx`).
7. **Subtotal == threshold** → `>=` → free + achieved + 100% bar (`shipping.ts`).
8. **SSR/pre-hydration** → provider/badge/button render empty/inert until `hydrated`; no `window` at module top or during render.
9. **Rapid + / add clicks** → functional reducer updates + `sanitizeQuantity` cap.
10. **Removing last item** → transitions to empty state; badge → 0; summary/progress/checkout unmount.

## How to Test
1. `npm run dev`, open a PDP (`/producto/silla-ejecutiva-milano`), click "Agregar al carrito" → button confirms "Agregado ✓", header badge shows `1`.
2. Refresh → cart persists; open a second tab and add → first tab's badge updates.
3. Go to `/carrito` → adjust quantity (+/−), watch line total, subtotal, total, progress bar, and badge recompute; `−` disables at 1, `+` disables at 99.
4. Remove the last line → empty state with "Ver sillas".
5. Add ~MX$10,000 of chairs → free shipping unlocks (achieved state + "Gratis").
6. Toggle EN → all copy switches (`/en/carrito`). Select an out-of-stock variant on a PDP → button disabled "Agotado".
7. `localStorage.setItem("posturpro:cart:v1","{bad")` → reload `/carrito` → empty state, one console warn.

## Known Limitations
- Out-of-stock flag on a cart line is a best-effort snapshot (not re-checked live) — T7 checkout owns authoritative stock/price re-validation (by design).
- No remove-collapse animation (see Deviations).

## Dependencies Added
- **None.** React context, localStorage, existing shadcn `Button`/`Input`, `@hugeicons`, `next-intl`, `formatMXN`/`interpolate`.

## Verification Results
- `npm run lint` — clean (0 warnings/errors).
- `npx tsc --noEmit` — clean (strict, no `any`/`!`).
- `npm run build` — green against seeded local Supabase. `/carrito` builds **SSG** (both locales); index pages **SSG**, PDP **SSG**, `/sillas` **Dynamic** — T3/T4/T5 rendering modes unchanged.
- `npx vitest run` — 634/634 unit tests pass (parity + keys-used include the new `cart` keys).
- `npm run test:integration` — 110/110 pass.
- No new tests written (QA/Stage 7 owns that); existing suites unbroken.

## What ReviewFix should scrutinize
- **`CartProvider` hydration/persist ordering** — the ref-gated persist effect vs. the reducer-driven `hydrated`. Confirm the `lines` effect can never write `[]` before the mount read (the ref guards this) and that the `storage` re-read cannot loop.
- **ICU plural vs. `interpolate` boundary** — verify no `t.raw(pluralKey)` is fed to `interpolate` anywhere (badge/mobile link now use `t()`).
- **No-layout-shift contract** on `CartCountBadge` (overlay pill) and the skeleton→content crossfade (identical box sizes).
- **`formatMXN` never reaches a non-integer** — `isCartLine` enforces integer `unitPriceCents`; `lineTotalCents`/`subtotalCents`/`totalCents` stay integer.
- **44px targets** on stepper buttons, remove, add-to-cart, checkout CTA, header badge, empty CTA.
- **Reduced-motion coverage** of the new `globals.css` cart-motion classes.

## Review + Fix Pass (ReviewFix Stage 4)

### Issues Found & Fixed

| ID  | Severity | Title                                        | Status  | File | Fix Applied |
| --- | -------- | -------------------------------------------- | ------- | ---- | ----------- |
| C-1 | CRITICAL | Cross-tab `storage` sync infinite write loop | FIXED   | `cart-provider.tsx:81-136` | Added `lastPersistedRef`; persist effect bails on content-identical payload; storage listener records incoming payload before dispatch → no cross-tab echo. Last-write-wins preserved. |
| M-1 | MAJOR    | Tampered `unitPriceCents` had no upper bound | FIXED   | `cart-storage.ts:32-48` | `isCartLine` now rejects `unitPriceCents > PRICE_BOUND_MAX_CENTS` (reuses catalog's sane cents ceiling); prevents overflow to nonsense totals. |
| m-1 | MINOR    | Subtotal math duplicated (DRY)               | FIXED   | `cart-page-client.tsx:128` | Use pure `subtotalCents(lines)` instead of inline reduce. |
| m-2 | MINOR    | `handleQuantityChange` inline clamp          | SKIPPED | —    | Value is already a bounded finite integer; inline min/max reads clearly for a display-only announcement. |
| m-3 | MINOR    | Stepper sends absolute value from stale prop | SKIPPED | —    | Safe (no lost/over-applied/cap-breach); design treats stepper as non-coalescing. Delta-based rewrite not worth the churn. |

### Summary

- Critical: 1/1 fixed
- Major: 1/1 fixed
- Minor: 1/3 fixed, 2 skipped (justified)

### Verification (post-fix)
- `npm run lint` — clean. `npx tsc --noEmit` — clean.
- `npx vitest run` — 634/634 unit pass. `npm run test:integration` — 110/110 pass.
- All 18 ACs re-verified against actual code; all 10 edge cases handled.
- **Recommendation: APPROVE** — ready for QA (Stage 5).
