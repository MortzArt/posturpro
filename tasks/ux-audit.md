# UX Audit: T8 — Mercado Pago payment surfaces (Stage 8, ultraux)

> ⚠️ **HUMAN-REVIEW GATE (BUILD_PLAN rule 3) — ADVISORY ONLY.** This is PAYMENT
> code. This UX pass changes UI copy/layout/focus only (no money-movement, no
> trust-boundary, no RPC/webhook logic), but the standing gate stays OPEN: a human
> must review payment code before merge regardless of any SHIP verdict.
> **LIVE-SANDBOX verification remains BLOCKED-ON-USER** — the OXXO/SPEI voucher was
> audited with a temporary synthetic full-voucher stub (reverted) and via the
> defensive-degradation path, because placeholder MP creds cannot mint a real voucher.

## Summary

- **Components audited:** 3 surfaces — `<PaymentPanel>` (7 states), `<OxxoSpeiInstructions>`
  (voucher, full + 4 degraded variants), confirmation `page.tsx` hero adaptation.
- **States observed live:** unpaid, failed(declined), failed(expired), paid, processing,
  pending-voucher(full), pending-voucher(degraded), unavailable — at **375 / 768 / 1280px
  in both locales** (30 base screenshots + targeted re-shoots), driven by synthetic DB rows.
- **Issues found:** 4 (🔴 1, 🟡 1, 🟢 2). **Issues fixed:** 4 (all).
- **States missing:** 0 (all designed states render; one previously-dead copy branch activated).
- **m-6 resolution:** signed off — no code change (see § m-6).
- **Suites after changes:** unit **1186/1186** (1177 + 9 new), integration **154/154**,
  e2e payment **8/8** + checkout **24/24** (prod build), tsc 0, eslint clean, build clean.

The T8 implementation entered this stage in excellent shape (calm/reassuring per the
design principles, defensive voucher rendering, correct a11y roles, no overflow anywhere).
The fixes below are correctness + polish, not rescues.

## Findings

### 🔴 Critical UX Issues

1. **[`order-payment-read.ts:158` + `config.ts`] Paid card/wallet orders showed the
   GENERIC "Pago confirmado" instead of "Pagado con tarjeta" / "Pagado con Mercado
   Pago".** The read-side `toPaymentMethodKey(value)` called `resolvePaymentMethod(value, value)`
   — re-running the MP-*type* heuristic on a value that is already our stored compact
   key. `resolvePaymentMethod("card","card")` → `PAYMENT_TYPE_TO_METHOD["card"]` is
   undefined (the map keys are `credit_card`/`account_money`, not `card`/`wallet`) → **null**
   → generic label. OXXO/SPEI survived only because their `payment_method_id`
   short-circuit matches. So every paid **card** and **wallet** order (the two most
   common rails) displayed a vague label instead of the method it was paid with —
   observed live on the paid screenshot ("Pago confirmado" under a `card` order).
   **Fixed:** added `parsePaymentMethodKey()` (read-side counterpart that validates a
   stored compact key against `PAYMENT_METHOD_KEYS`, case-insensitive, null-safe) in
   `config.ts`; `order-payment-read.ts` now uses it. Verified live: the paid card now
   reads "Pagado con tarjeta". Locked with 3 new `config.test.ts` cases (round-trips every
   compact key; rejects raw MP type names like `credit_card`). No regression test protected
   this path before (the panel component test fed `method:"card"` directly, bypassing the read).

### 🟡 Major UX Issues

1. **[`panel-state.ts` + `payment-panel.tsx`] An expired OXXO/SPEI voucher was
   mislabeled "Tu pago fue rechazado" (Your payment was declined) — inaccurate,
   blaming copy.** A voucher that expires unpaid is NOT a decline (the window closed,
   the shopper didn't fail). Both `rejected` (card) and `cancelled/expired` (voucher)
   collapsed to `{ kind: "failed" }` with the single "declined" message, and the design's
   `payment.expired.body` key was present in both locales but **wired nowhere (dead copy)**.
   **Fixed:** `derivePanelState` now emits `{ kind: "failed"; reason: "declined" | "expired" }`
   (a failed voucher-method → `expired`, else `declined`); `FailedCard` picks the copy by
   reason and tags `data-failure-reason`. Added `expired.title` to both locales
   ("Tu pago no se completó" / "Your payment wasn't completed"), activating the
   previously-dead `expired.body`. Verified live (failed-SPEI order now reads "Tu pago no
   se completó a tiempo. Puedes intentar de nuevo." + `data-failure-reason="expired"`).
   Retry CTA unchanged (never traps the user). Locked with 2 new panel-state tests +
   1 new component test (expired copy present, "declined" absent).

### 🟢 Polish Items

1. **[`payment-panel.tsx`, `oxxo-spei-instructions.tsx`] `sm:w-auto` on the primary
   CTAs was dead — the pay/retry/view-voucher buttons rendered FULL-BLEED on
   tablet/desktop instead of sized-to-content.** The buttons carried `sm:w-auto
   sm:min-w-56` per the design spec, but their parent `flex flex-col` uses default
   `align-items: stretch`, which overrides `width:auto` for flex children — so the
   intent-vs-reality diverged and the wide `max-w-2xl` card showed a heavy full-width
   black bar. **Fixed:** added `sm:self-start` so `sm:w-auto` wins (full-width thumb
   target on mobile, content-width left-aligned on ≥sm — matching the checkout /
   "Seguir comprando" proportions). Verified: mobile pay btn = full-width (309px in a
   343px card); desktop = auto-width. Applies to pay, retry, and view-voucher CTAs.

2. **[`oxxo-spei-instructions.tsx`] Fully-degraded voucher showed two redundant
   email lines, and the plain buttons used the UA-default focus outline.** With no
   reference AND no voucherUrl the card rendered both "Estamos generando tu comprobante…
   Revisa tu correo." (generating) and "Te enviamos el comprobante por correo." (no-url)
   — duplicate email guidance. **Fixed:** the no-url fallback shows only when a reference
   IS present (a real voucher just lacking the printable link); when the reference is also
   absent, the generating copy already covers it. Also added the house `focus-visible`
   ring (`ring-ring/30`/`ring-ring/40`) to the four plain `<button>`s (copy, refresh,
   processing-retry, pay-differently) for cohesion with the shadcn CTAs. Updated the
   "all fields missing" defensive test to assert the de-duplication.

## States Audit

| Component | Loading | Empty/Unpaid | Error | Success | Pending | Mobile | A11y |
|-----------|---------|--------------|-------|---------|---------|--------|------|
| PaymentPanel (unpaid) | ✅ (redirect text-swap + aria-busy) | ✅ | — | — | — | ✅ | ✅ |
| PaymentPanel (failed·declined) | ✅ | — | ✅ role=alert | — | — | ✅ | ✅ |
| PaymentPanel (failed·expired) | ✅ | — | ✅ honest copy | — | — | ✅ | ✅ |
| PaymentPanel (paid) | — | — | — | ✅ role=status, method label FIXED | — | ✅ | ✅ |
| PaymentPanel (processing) | ✅ | — | — | — | ✅ role=status + refresh/retry | ✅ | ✅ |
| PaymentPanel (unavailable) | ✅ | — | ✅ neutral (not user's fault) | — | — | ✅ | ✅ |
| OxxoSpei (full voucher) | — | — | — | — | ✅ amber-not-green, copyable ref | ✅ | ✅ |
| OxxoSpei (degraded ×4) | — | — | — | — | ✅ guides user (check email) | ✅ | ✅ |
| Hero (paid vs received) | — | — | — | ✅ green | ✅ muted (not triumphant) | ✅ | ✅ role=status |

No horizontal overflow at 375/768/1280 in either locale (measured `scrollWidth` in every state).

## Accessibility Audit

| Check | Status | Details |
|-------|--------|---------|
| Focus rings (shadcn CTAs) | ✅ | `buttonVariants` → `focus-visible:border-ring ring-2 ring-ring/30`; pay/retry/view-voucher covered |
| Focus rings (plain buttons) | ✅ FIXED | copy/refresh/processing-retry/pay-differently now carry the house ring (were UA-default outline) |
| Keyboard nav to pay CTA | ✅ | Tab reaches `payment-pay-now` through header, no traps (verified) |
| Tab order | ✅ | heading → total → primary CTA → secondary link (logical top-down) |
| Aria labels (icon/copy/link) | ✅ | copy `aria-label="Copiar referencia de pago"`; view-voucher aria announces "opens in a new tab" |
| Live regions | ✅ | redirect + copied → sr-only `role=status aria-live=polite`; paid/processing → `role=status`; failed/unavailable → `role=alert` |
| Color never sole signal | ✅ | pending = amber + Clock icon + "Esperando pago" text; paid = emerald + check + text; failed = red + Alert icon + text |
| External link safety | ✅ | view-voucher `rel="noopener noreferrer" target="_blank"` |
| Reference selectable | ✅ | `user-select: all` even where copy is unavailable (feature-detected clipboard) |
| Reduced motion | ✅ | all motion via `.enter-fade`/`.cart-press` (built-in `prefers-reduced-motion` branch); no new motion CSS added |
| Touch targets ≥44px | ✅ | pay CTA `h-11`, copy btn `h-11`, view-voucher `h-11` |

## Copy Review

| Location | Before | After | Reason |
|----------|--------|-------|--------|
| Paid card method (card) | "Pago confirmado" (generic) | "Pagado con tarjeta" | Read-side key resolution bug lost the method label on card/wallet (🔴) |
| Failed card (expired voucher) | "Tu pago fue rechazado" / "No se completó el cobro" | "Tu pago no se completó" / "Tu pago no se completó a tiempo. Puedes intentar de nuevo." | An expired voucher is not a decline — honest, non-blaming copy (🟡); activates dead `expired` key |
| `payment.expired.title` (both locales) | (absent) | es "Tu pago no se completó" · en "Your payment wasn't completed" | New title so the expired banner isn't title-less |
| Degraded voucher (no ref + no url) | "generating…" + "emailed you the voucher." (both) | "generating…" only | Removed duplicate email guidance (🟢) |

No other copy changed — the es-MX register was already natural and store-consistent
(reviewed all `checkout.payment.*` keys in both locales; parity test passes).

## Responsive Results (375 / 768 / 1280, both locales)

- **375px:** every state full-width card; primary CTAs full-width thumb targets;
  voucher reference `font-mono break-all` + copy btn stack; no horizontal scroll (measured).
- **768px:** panel spans full-width ABOVE the `md:grid-cols-2` summary/shipping grid
  (per spec); CTAs now sized-to-content (fix); voucher reference + copy inline.
- **1280px (`max-w-2xl`):** single-column; CTAs auto-width left-aligned (fix) — matches
  the checkout house proportions instead of a full-bleed bar.

## Keyboard Results

- Tab order reaches the pay CTA logically; Enter/Space activate; no focus trap.
- All interactive controls show a visible `:focus-visible` ring (house ring after the fix).
- Redirect state sets `aria-busy` and swaps to a disabled "Redirigiendo…"; announced politely.

## m-6 Resolution (binary_mode / processing UX — was SKIPPED in review pending UX sign-off)

**Signed off — no code change.** `MP_BINARY_MODE = false` is a hard functional
requirement: `binary_mode: true` auto-rejects any non-instant method, which would drop
OXXO and SPEI entirely. The UX consequence the reviewer flagged is that a **card** can
land `in_process` (MP antifraud review) → our `derivePanelState` maps `authorized`/pending
→ the `processing` state. I audited that state live at all breakpoints in both locales:
it shows an amber Clock icon, "Estamos confirmando tu pago · Esto puede tardar un
momento", an "Actualizar" (reload) affordance and a "¿Problemas? Reintentar el pago"
escape hatch, with `role="status"` (polite). This is the correct UX for a card-in-review —
honest, non-alarming (not the red failed banner), wayfinding-complete (never traps the
user), and a reload reflects the truth once the webhook lands (live-updating is explicitly
out of scope for Phase 1). The processing copy is shared with the webhook-before-redirect
race and reads correctly for both. **Decision: `binary_mode:false` stays; the `processing`
state is an appropriate sign-off UX. Confirm end-to-end against a live sandbox
(BLOCKED-ON-USER) before launch.**

## Fixed vs Deferred

**Fixed (4):** paid method label (🔴); expired-voucher honest copy + dead-key activation
(🟡); `sm:w-auto` CTA width via `sm:self-start` (🟢); degraded-voucher duplicate email
line + plain-button focus rings (🟢).

**Deferred (with reason):**
- **Live-sandbox visual verification of the real OXXO/SPEI voucher** — BLOCKED-ON-USER
  (no MP creds). Audited via a temporary synthetic stub (reverted) + the defensive path.
- **Live card-in-process `processing` end-to-end** — BLOCKED-ON-USER; state audited with
  synthetic data. Confirm at the human/live gate (m-6).
- **Statement descriptor / real legal trade name (N-3)** — launch-time config, BLOCKED-ON-USER.

## Test Coordination (per QA report regression locks)

No `data-testid` or a11y role was removed or renamed. New assertions strengthen locks:
- amber-not-green voucher: unchanged ✅
- returnHint-never-drives-state: unchanged (panel-state tests still pass) ✅
- no-NaN totals, no 375px overflow: re-verified live ✅
- The `failed` panel test now passes `reason` (TS-required) and adds an expired-copy lock;
  panel-state `failed` test strengthened to lock the reason branch; a new
  `parsePaymentMethodKey` suite locks the paid-label fix. All e2e text assertions
  (Pagar ahora / Pay now / Recibimos tu pedido / We received your order) are unchanged.

## Final Suite Results

| Suite | Result |
|-------|--------|
| Unit / component | **1186/1186** (baseline 1177 + 9 new) |
| Integration (live local DB) | **154/154** |
| E2E payment (prod build) | **8/8** |
| E2E checkout (prod build) | **24/24** |
| tsc `--noEmit` | **0 errors** |
| eslint | **clean** |
| next build (NEXT_QA_DIST_DIR) | **clean** (webhook route `ƒ /api/webhooks/mercadopago`) |

Cleanup done: QA dist dir removed, temp harness/config removed, `tsconfig.json` restored,
DB pristine-seeded (0 synthetic orders), no stray servers.

## UX Score: 9/10

A calm, trustworthy, defensively-rendered payment surface that honors every design
principle (truth-from-DB, never-pending-as-success, total-always-restated, ≥44px targets,
no motion without purpose). The one point off was a real correctness bug (paid card/wallet
lost its method label) plus copy that blamed a shopper for an expired voucher — both fixed.
Residual risk is entirely BLOCKED-ON-USER live-sandbox verification, not craft.
