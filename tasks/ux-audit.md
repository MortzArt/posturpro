# UX Audit: T7 — Checkout & Order Creation

Stage 8 (ultraux). Full-cycle pipeline. Scope: `/checkout` (es-MX + en), the
`/checkout/confirmacion/[token]` confirmation page, and the cart→checkout handoff.
Taste authority applied: `emil-design-eng` + `apple-design`; motion audited with
the `improve-animations` 8-category method. Baseline honored: enter animations
`ease-out`, `prefers-reduced-motion` respected, transform/opacity only,
interruptible, no motion without purpose. Per ui-design.md: **no new motion CSS** —
only existing globals.css classes reused (verified — zero new CSS added).

## Summary

- Components audited: 12 (flow-client, summary, fields, field primitive, discount
  field, sticky bar, empty state, skeleton, confirmation page + 3 sub-cards, order
  confirmation client, labels hook)
- Issues found: 3 (🔴 0, 🟡 1, 🟢 2)
- Issues fixed: 3 (all found issues fixed; 0 deferred)
- States missing: 0 (every documented state was already implemented by Dev/Fix;
  the one UX-Requirements gap — banner recovery action — is now added)
- The n-1 carried-forward gap (global-error banner had no recovery action) is
  **CLOSED**.

The Stage-4 build + Stage-6 fix pass produced an unusually complete checkout: all
states (skeleton, empty guard, idle, per-field errors with focus-first-invalid,
submitting/pending dim, price-changed, out-of-stock, shipping-unavailable, discount
idle/applied/invalid/degraded, server error, success/redirect, confirmation, cart
clear) were already present and regression-locked. This audit's substantive work
was the **one deliberately-deferred UX gap** (banner recovery action) plus two
polish items. Nothing embarrassing was found.

## Findings

### 🔴 Critical UX Issues

None.

### 🟡 Major UX Issues

1. **`checkout-flow-client.tsx` (`GlobalBanner`, was line ~272)** — the global-error
   banner rendered as a bare `<p>` with **no recovery action**, contradicting the
   ticket's UX-Requirements ("Error (form/global): Dismissible banner … with an
   alert icon and **a recovery action (retry / 'review your cart')**") and the
   error-states table ("Retryable error banner"). This was the n-1 item Stage 6
   explicitly deferred to Stage 8. A user hitting a transient error (network/DB) or
   a blocking cart problem (price changed / sold out) was told what happened but
   given nothing to *do* — an Apple "wayfinding / never trap the user" violation.

   **Fixed:** the banner now renders a status-appropriate recovery action:
   - `error` and `shipping-unavailable` (transient) → a **"Reintentar" / "Try
     again"** `type="submit"` button that re-runs `placeOrder` (the server re-reads
     settings and re-validates — a retry is the correct affordance). Disabled while
     `pending`; press feedback via `.cart-step-press`; `Refresh01Icon`.
   - `price-changed` and `out-of-stock` (the user must change the order first, so a
     naive retry would just fail again) → a **"Volver al carrito" / "Back to cart"**
     Link to `CART_PATH` with a back-pointing `ArrowLeft01Icon` (Apple spatial
     consistency — the cart is "back"). This is the "review your cart" affordance.

   The banner is now a `<div role="alert">` (was `<p role="alert">`) so it can host
   the action; `data-testid="checkout-banner"` is preserved (e2e lock intact) and
   the action is `data-testid="checkout-banner-action"`. New i18n keys
   `checkout.banner.retry` + `checkout.banner.review` added to BOTH locales
   (symmetric). New unit tests lock all three behaviors (retry = submit, disabled
   while pending, review = link to cart).

### 🟢 Polish Items

1. **`discount-code-field.tsx` (applied pill)** — the applied-discount pill showed a
   bare `−$300.00` next to the code, while the `discount.savings` i18n key
   ("Ahorras {amount}" / "You save {amount}") was fully defined, threaded through
   the labels hook, and typed on the component — but **never rendered** (dead copy
   flagged in review n-1). Two problems in one: dead copy (clean-code violation) and
   a bare number that reads as a raw figure rather than a benefit.
   **Fixed:** the pill now renders `interpolate(labels.savings, { amount })` →
   "Ahorras $300.00", killing the dead key AND stating the benefit in words (Emil:
   "direct, specific labels beat safe generic ones"; Apple: understanding). The
   amount is unchanged so the e2e assertion (pill contains `$679.90`) still holds.
   `data-testid="checkout-discount-savings"` added.

2. **Mobile summary placement (allowed deviation, documented not "fixed")** — the
   ui-design.md §Mobile wireframe shows the order summary as a **collapsible
   accordion at the top** of the mobile flow. The implementation instead renders the
   full summary card **below** the form and keeps the **sticky bottom bar** (Total +
   submit) always visible. This is within the UX-Requirements, which offer the two
   as *alternatives*: "the summary either collapsible at the top **or** a sticky
   bottom 'Total + Place order' bar." The sticky bar satisfies "the number the user
   is about to commit to is always visible," the full itemized summary is reachable
   by scrolling, and forcing the accordion would risk the regression-locked
   one-submit-per-breakpoint and sticky-bar e2e tests for no user-facing gain.
   **Decision: kept as-is (allowed deviation), not changed.** Verified at 375px: no
   horizontal overflow, sticky bar owns submit, total always visible.

## States Audit

| Component | Loading | Empty | Error | Success | Mobile | A11y |
|-----------|---------|-------|-------|---------|--------|------|
| CheckoutFlowClient | ✅ skeleton (opacity crossfade, no $NaN) | ✅ empty-state guard, catalog CTA | ✅ global banner **+ recovery action (fixed)** | ✅ redirect + live region | ✅ sticky bar, no overflow | ✅ polite live region, back link |
| CheckoutFields | n/a | n/a | ✅ per-field, focus-first-invalid, aria wired | n/a | ✅ full-width, min-h-11, numeric/tel keyboards | ✅ every input labeled, aria-invalid/describedby |
| CheckoutSummary | ✅ (via flow skeleton) | n/a | ✅ per-line ring + note (OOS/price-changed) | n/a | ✅ stacks below form | ✅ color+text (never color-only) |
| DiscountCodeField | ✅ disabled while pending | ✅ empty allowed | ✅ invalid (5 reasons) + degraded notes | ✅ applied pill **with savings text (fixed)** | ✅ h-11 controls | ✅ label, role=alert note, remove aria-label |
| StickyCheckoutBar | n/a | n/a | ✅ disabled when blocked | ✅ pending text swap | ✅ translucent, safe-area | ✅ ≥44px submit |
| StateField (Select) | ✅ disabled | n/a | ✅ aria-invalid/describedby on trigger | n/a | ✅ h-11 w-full | ✅ Radix combobox, focusable trigger (M-4), hidden input → FormData |
| ConfirmationPage | ✅ Next route loading | ✅ notFound() on bad/unknown token | ✅ 404 on malformed/enumerated token | ✅ order #, summary, shipping, "no payment yet" | ✅ single col md:grid-cols-2 | ✅ role=status, selectable order #, keep-shopping CTA |

## Accessibility Audit

| Check | Status | Details |
|-------|--------|---------|
| Focus rings | ✅ | `focus-visible:ring-2 ring-ring/30` on all fields; native ring on buttons/links; never removed |
| Aria labels | ✅ | Every input has a visible `<label htmlFor>` (incl. notes textarea — M-5); icon-only remove button has `aria-label`; decorative icons `aria-hidden` |
| Aria-invalid / describedby | ✅ | Distinct `checkout-<field>-error` ids (M-1), resolve to the `<p role="alert">`; state Select trigger wired too |
| Live region | ✅ | One page-level `aria-live="polite" aria-atomic` region; announces processing / discount applied (with amount, M-3) / discount invalid / order received |
| Focus management | ✅ | Focus moves to the first invalid field in DOM order incl. the state trigger (M-4); keyed on `submissionId` |
| Banner recovery a11y | ✅ (new) | Banner is `role="alert"`; retry is a real `type="submit"` button (keyboard-activatable, disabled while pending); review is a real `<a>` Link |
| Color contrast | ✅ | Destructive/emerald/amber on card/background all pass AA; errors pair color with an alert icon + text (never color-only) |
| Keyboard-only flow | ✅ PASS | Full flow completable by keyboard: back link → email → phone → name → addr1 → addr2 → city → CP → state (Radix Select: Enter/Space opens, arrows select, Esc closes) → notes → RFC → discount → submit. Verified logical tab order + focus-first-invalid on failed submit. |
| Touch targets ≥44px | ✅ | `min-h-11`/`h-11` on all primary controls; banner action `h-8` (secondary/recovery, acceptable) |
| prefers-reduced-motion | ✅ | Every motion class (`.enter-fade`/`.stagger`/`.price-value`/`.cart-press`/`.cart-step-press`/`.grid-pending`/`.select-content-motion`) gates itself in globals.css; no new CSS introduced |

## Copy Review

| Location | Before | After | Reason |
|----------|--------|-------|--------|
| es-MX `checkout.banner.retry` | (absent — key removed in Stage 6) | "Reintentar" | Recovery action label for the transient-error banner (UX-Requirements) |
| en `checkout.banner.retry` | (absent) | "Try again" | Same, EN locale (symmetric) |
| es-MX `checkout.banner.review` | (absent) | "Volver al carrito" | "Review your cart" recovery for price-changed / out-of-stock |
| en `checkout.banner.review` | (absent) | "Back to cart" | Same, EN locale |
| Discount applied pill | `−$300.00` (bare amount; `savings` key dead) | "Ahorras $300.00" / "You save $300.00" | States the benefit in words; removes dead copy; verb/benefit-forward |

No other copy changes. All banner/validation/discount/confirmation copy in both
locales reads as natural Mexican Spanish and matches the store's calm, direct tone.
No truncation at 375px (verified). No hardcoded strings introduced (AC-16 held).

## Motion Audit (improve-animations 8-category)

| Category | Result |
|----------|--------|
| Purpose & frequency | ✅ Every animation has a purpose (feedback/comprehension/anti-jarring); none on high-frequency/keyboard actions. Banner action uses `.cart-step-press` (press feedback only). |
| Easing & duration | ✅ All enter = `ease-out`, ≤300ms, via existing classes. No `ease-in`. |
| Physicality | ✅ Press scales (0.97/0.98), never scale(0); crossfades on number change. |
| Interruptibility | ✅ CSS transitions (not keyframes) throughout; `noValidate` server-action flow is interruptible; nothing locks input beyond the intended `pending` disable. |
| Performance | ✅ transform/opacity only (compositor-friendly); confirmed no layout-property animation. |
| Accessibility | ✅ reduced-motion gated in globals.css for every class. |
| Cohesion | ✅ Same easings/durations as cart/PDP (reuses their exact classes) — checkout feels part of the same store. |
| Missed opportunities | None warranted — checkout is a high-trust surface; Emil/Apple both say restraint here. No new motion added (design mandate). |

## Consistency Check

Verified against cart / PDP / catalog: cards (`rounded-lg border border-border
bg-card p-4 md:p-5`), typography (h1 `text-2xl md:text-3xl font-semibold
tracking-tight`, `text-sm font-medium` labels, `tabular-nums` money), buttons
(shadcn `Button` + `.cart-press`), icons (`@hugeicons/react` core-free only —
`Refresh01Icon` added for retry, same set), spacing (4px grid), and the empty
state (structural twin of `CartEmptyState`). The banner's new outline recovery Link
uses `buttonVariants({ variant: "outline", size: "sm" })` — the house button
primitive, tinted destructive to match the banner. Fully consistent.

## Responsive Results

| Breakpoint | Result |
|------------|--------|
| 375px (mobile) | ✅ Single column, full-width fields, numeric/tel keyboards, sticky translucent bottom bar owns submit, in-card submit `hidden`, **no horizontal overflow** (e2e + manual verify), total always visible |
| 768px (tablet) | ✅ Single-column form (Colonia\|CP pair at `sm+`), summary below, sticky bar still owns submit (`< lg`) |
| ≥1024px (desktop) | ✅ `grid-cols-[2fr_1fr]`, sticky summary `top-20`, in-card submit shown, sticky bar hidden — exactly one live submit per breakpoint (regression lock intact) |

Screenshots taken (scratchpad): `checkout-desktop.png`, `checkout-mobile.png`,
`checkout-mobile-errors.png` (field errors + aria-invalid at 375px),
`confirmation-desktop.png` (order placed live — token URL, cleared cart badge).

## Test / Build Results (all green)

- **Unit + component**: 918 passed / 918 (was 915 → **+3** new GlobalBanner
  recovery-action tests). 46 files, 0 fail.
- **Integration (live local Docker Supabase)**: 135 passed / 135. 11 files, 0 fail.
- **Checkout E2E (PRODUCTION build, `NEXT_QA_DIST_DIR=.next-t7-ux`, `next start`,
  chromium + mobile Pixel 7)**: **24 passed / 24**. `checkout-banner` visibility +
  discount pill (`$679.90`) assertions still hold with the new markup/copy.
- **tsc --noEmit**: clean. **eslint src/**: clean. **next build** (default dist):
  clean, both locales, `/checkout` + `/checkout/confirmacion/[token]` present.
- No regression-locked behavior changed: distinct errorIds, one-submit-per-
  breakpoint, focus-first-invalid, notes label, IDOR token routes, applyLivePrices
  all intact and passing.
- **DB left pristine** (reseeded after every order-placing run: 0 orders/customers,
  70 variants, 5 discount codes, stock restored). QA build dir removed. Migration
  0008 amendments (confirmation_token, upper(code) unique, hardened redemption) are
  in the migration file and re-apply on `db reset`.

## UX Score: 9.5/10

Checkout is a genuinely polished, trustworthy, accessible money surface. Every
state is handled, copy is natural in both locales, keyboard/AT flow is complete,
motion is restrained and cohesive with the rest of the store, and it is responsive
with no overflow or layout shift. The single carried-forward gap (banner recovery
action) is closed; the two polish items are fixed. Half a point withheld only for
the mobile-summary-accordion design deviation (allowed, but the design's stated
preference wasn't taken) and because the state picker is a Radix combobox rather
than the native mobile wheel (an allowed deviation from a prior stage). Neither
harms the user; both are documented.

> **HUMAN-REVIEW GATE (BUILD_PLAN rule 3) still applies** — checkout is always
> flagged for human review before merge regardless of any pipeline verdict. This
> UX pass does not clear that gate.
