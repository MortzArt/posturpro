# Code Review + Fix: T6 — Cart

## Summary

Strong, disciplined implementation that faithfully mirrors the proven
`recently-viewed` guest-persistence pattern and honors every scope fence (no
checkout, no mini-cart, no server writes, no URL coupling). Line-by-line review
found **one CRITICAL cross-tab write loop** and a few smaller hardening/DRY
items — all fixed in this pass. All 18 ACs verified against the actual code; all
10 edge cases handled. Gate stays green (lint / tsc / 634 unit / 110 integ).

## Issues Found & Resolved

### Critical Issues

#### C-1: Cross-tab `storage` sync can ping-pong into an infinite write loop

- **Severity**: CRITICAL
- **File**: `src/components/cart/cart-provider.tsx:100-118` (persist + storage effects)
- **Problem**: The `storage` listener dispatched `hydrate` with a fresh array
  from `readCart()`. That new reference changed `lines`, so the ref-gated persist
  effect ran `writeCart(lines)`. A `writeCart` fires a `storage` event in the
  **peer** tab, which re-read + re-wrote, which fired back in the first tab, and
  so on — two open tabs would hammer `localStorage` and re-render forever with
  content-identical payloads. This is exactly the loop the dev flagged as
  "scrutinize the storage re-read".
- **Impact**: With two tabs open, an unbounded write/event/re-read loop: pegged
  CPU, constant re-renders, `localStorage` thrash. Edge 5 (two tabs) broken.
- **Fix Applied**: Added a `lastPersistedRef` holding the last serialized payload
  this tab reconciled with storage. The persist effect now serializes `lines`,
  compares to `lastPersistedRef`, and **bails on a match** (no echo write). The
  `storage` listener records the incoming payload into `lastPersistedRef` before
  dispatching, so a cross-tab re-read is treated as already-reconciled and never
  echoed back. The mount hydrate seeds the ref too. Last-write-wins semantics
  preserved; genuine mutations still persist.
- **Status**: FIXED (verified: tsc clean, 634 unit + 110 integ green)

### Major Issues

#### M-1: Tampered `unitPriceCents` had no upper bound (overflow to nonsense)

- **Severity**: MAJOR
- **File**: `src/lib/cart/cart-storage.ts:32-45` (`isCartLine`)
- **Problem**: The shape guard accepted any non-negative integer `unitPriceCents`.
  Storage is explicitly attacker-controlled (per the file's own docstring); a
  payload with an absurd price (e.g. `1e21`) would pass, and `lineTotalCents` /
  `subtotalCents` would render a nonsense figure. `formatMXN` does not throw here
  (inputs stay integer, so no `$NaN`/crash — AC-12 holds) but the display is
  garbage and the totals math is meaningless.
- **Fix Applied**: `isCartLine` now rejects `unitPriceCents > PRICE_BOUND_MAX_CENTS`
  (`100_000_000` = MX$1,000,000), reusing the catalog's existing sane cents
  ceiling (same constant `search-params` uses to drop absurd price bounds).
  Root-cause hardening at the trust boundary; docstring updated.
- **Status**: FIXED

### Minor Issues

#### m-1: Subtotal math duplicated instead of using the pure helper (DRY)

- **File**: `src/components/cart/cart-page-client.tsx:128-131` (`PopulatedCart`)
- **Suggestion**: `PopulatedCart` recomputed the subtotal inline
  (`lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0)`) while
  `subtotalCents()` in `cart-line.ts` is the single source of truth.
- **Fix Applied**: Imported and used `subtotalCents(lines)`. Clean Code DRY;
  one source of truth for line math.
- **Status**: FIXED

#### m-2: `handleQuantityChange` re-implements the clamp inline

- **File**: `src/components/cart/cart-page-client.tsx:63`
- **Suggestion**: The announcement clamp uses `Math.min(Math.max(next, 1), MAX)`
  rather than `sanitizeQuantity`. Functionally correct (the stepper only ever
  passes a finite in-range integer), but duplicates the clamp intent.
- **Status**: SKIPPED — `sanitizeQuantity` floors + finite-guards a value that is
  already a bounded integer here; swapping it in changes nothing observable and
  the inline min/max reads clearly for a display-only announcement. Not worth a
  churn edit. Noted for QA to assert the announced count equals the clamped qty.

#### m-3: Stepper sends an absolute value from a possibly-stale `value` prop

- **File**: `src/components/cart/quantity-stepper.tsx:62,79`
- **Suggestion**: `onClick={() => onChange(value - 1)}` reads the `value` prop
  (a render snapshot). Very rapid `+`/`−` bursts coalesce to a **single** step
  rather than N steps.
- **Status**: SKIPPED — this is safe (no lost/over-applied updates, no cap
  breach, no negative), and the design explicitly treats the stepper as a
  non-coalescing high-frequency control (unlike add-to-cart, which is functional).
  Making it delta-based would require a reducer "incrementQuantity" action for a
  cosmetic gain. Documented; acceptable.

## Dev Self-Flagged Concerns — Verdict

1. **Hydration/persist ordering** — CORRECT (and now hardened). The `hydratedRef`
   gate prevents a pre-hydration `[]` clobber; the new `lastPersistedRef` prevents
   both the empty-load spurious write and the cross-tab loop (C-1). Stored data is
   never overwritten before the mount read.
2. **ICU-plural vs interpolate boundary** — CLEAN. Only `cart.badgeLabel` uses ICU
   plural syntax, and it is resolved via `t("badgeLabel", { count })` in the badge
   and the mobile link. Every `t.raw(...) → interpolate` target (`titleCount`,
   `item.colorLabel`, `item.removeItem`, `freeShipping.remaining`,
   `announce.quantity`) is a simple `{token}` template — no plural reaches
   `interpolate`. Verified against both message files.
3. **No remove-row collapse animation** — ACCEPTABLE. Design watch-out #10
   explicitly allows the opacity-only fallback; row just unmounts. Clean.
4. **`announce.added` is count-free** — ACCEPTABLE. Preserves the PDP panel's
   no-client-i18n invariant (labels are server-resolved props). The running count
   lives in the header badge `aria-label` (which uses client i18n legitimately).
5. **No-layout-shift / 44px / reduced-motion** — CONFIRMED. Badge count is an
   absolutely-positioned overlay pill (never a flex sibling); skeleton is sized to
   the real layout; every control is `h-11`/`size-11` (≥44px); all cart-motion
   classes are reduced-motion gated; progress is `transform: scaleX` (never width).

## Acceptance Criteria Verification

| #     | Criterion                              | Status | Evidence |
| ----- | -------------------------------------- | ------ | -------- |
| AC-1  | Add-to-cart on PDP, qty 1              | PASS   | `product-purchase-panel.tsx:229`, `add-to-cart-button.tsx:69-85` |
| AC-2  | Dedupe by product+variant             | PASS   | `cart-line.ts:44-49,112-128` (`cartLineKey`, `addLine`) |
| AC-3  | Persist across refresh + sessions     | PASS   | `cart-storage.ts` read/write; provider mount hydrate |
| AC-4  | Header badge live count, every page   | PASS   | `cart-count-badge.tsx`, provider in `[locale]/layout.tsx` |
| AC-5  | `/carrito` line rows (all fields)     | PASS   | `carrito/page.tsx`, `cart-line-row.tsx` |
| AC-6  | Qty control recomputes everything     | PASS   | one context change drives line/subtotal/badge/progress |
| AC-7  | `−` disabled at 1; Remove control     | PASS   | `quantity-stepper.tsx:46,62`; `cart-line-row.tsx:150-160` |
| AC-8  | Summary reads store settings (not hardcoded) | PASS | `shipping.ts:computeShipping`, props from server page |
| AC-9  | Free-ship progress; hidden if null    | PASS   | `free-shipping-progress.tsx:40-42`, `shipping.ts:87-101` |
| AC-10 | Empty state, no summary/progress/CTA  | PASS   | `cart-page-client.tsx:85-96`, `cart-empty-state.tsx` |
| AC-11 | `cart` namespace both locales; parity | PASS   | both message files; `keys-used.test.ts` +31 keys; 634 green |
| AC-12 | `formatMXN` only; integer cents; no `$NaN` | PASS | integer guards in `isCartLine`+`sanitizeQuantity`; totals integer |
| AC-13 | Clamp `[1, MAX]`; `+` disables at cap | PASS   | `sanitizeQuantity`, `quantity-stepper.tsx:47` |
| AC-14 | Corrupt/absent/foreign → empty + 1 warn | PASS | `cart-storage.ts:73-94` try/catch + `warnOnce` |
| AC-15 | Checkout CTA (non-empty) → `CHECKOUT_PATH` | PASS | `order-summary.tsx:84-94` plain `Link`, no form |
| AC-16 | Keyboard + `aria-live` + badge label  | PASS   | page-level live region; icon-button aria-labels; badge label |
| AC-17 | No URL/search-filter coupling         | PASS   | grep: no `useSearchParams`/`useRouter`/`location` in cart |
| AC-18 | Out-of-stock add prevented ("Agotado")| PASS   | `add-to-cart-button.tsx:70,87,111`; guarded no-op |

## Edge Case Verification

| #   | Edge Case                          | Status  | Evidence |
| --- | ---------------------------------- | ------- | -------- |
| 1   | Corrupt localStorage JSON          | HANDLED | `readCart` try/catch → `[]` + `warnOnce` |
| 2   | Storage disabled / quota           | HANDLED | `writeCart` swallow + warn; in-memory state persists session |
| 3   | Tampered qty / price               | HANDLED | `isDroppableQuantity`, `sanitizeQuantity`, `isCartLine` (+ price ceiling, M-1) |
| 4   | Stale snapshot                     | HANDLED | renders from client snapshot; T7 re-validates (documented) |
| 5   | Two tabs mutating                  | HANDLED | `storage` listener re-read; **loop-guarded (C-1)**; last-write-wins |
| 6   | store_settings null                | HANDLED | `computeShipping`→unavailable, progress→null, total=subtotal |
| 7   | Subtotal == threshold              | HANDLED | `>=` in `computeShipping`/`freeShippingProgress` |
| 8   | SSR / pre-hydration                | HANDLED | null-until-hydrated island; no `window` at module top |
| 9   | Rapid add clicks                   | HANDLED | functional reducer `add` action coalesces; cap clamped |
| 10  | Removing last item                 | HANDLED | transitions to empty state; badge→0; summary unmounts |

## Fix Summary

- Critical: 1/1 fixed
- Major: 1/1 fixed
- Minor: 1/3 fixed, 2 skipped (justified)

## Quality Score: 9/10

Excellent pattern discipline, thorough edge-case coverage, clean motion, tight
scope. Lost a point only for the cross-tab write loop (a real reliability defect
that would have shipped) — now fixed. Everything else was hardening or polish.

## Recommendation: APPROVE

All critical/major issues fixed inline and verified (lint clean, tsc clean,
634/634 unit, 110/110 integration green). Ready for QA (Stage 5).
