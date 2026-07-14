# Hacker Report: T8 — Mercado Pago Payment Subsystem

Chaos-tested the payment trust boundary and money paths: the public unauthenticated
webhook (`/api/webhooks/mercadopago`), the Checkout Pro preference/redirect flow,
`<PaymentPanel>` + OXXO/SPEI voucher card on the confirmation page, the refund
execution path, and the payment RPCs (`advance_order_status`, `record_payment_event`,
`finalize_payment_event`, `record_refund`, `refunded_total`). Drove the webhook with
mocked MP (as the QA tests do) and exercised the state machine against a LIVE local
Supabase; verified the live webhook `401` on a PRODUCTION `next start`. Hunted BEYOND
the Security / UX / QA / Arch reports.

## Summary
- Dead UI found: 2 (both misleading-copy defects — FIXED)
- Visual bugs: 0 new (320px/375px voucher + panel held — `break-all`, `sm:self-start`, `tabular-nums`)
- Logic bugs: 2 (1 money bug FIXED, 1 UI-truth bug FIXED)
- Missing states: 1 (no honest "already paid / status changed" recovery state — ADDED)
- Items fixed: 4
- Product improvements suggested: 4 (NOT implemented — phase discipline)

## Chaos Score: 3/10 (target ≤ 3 — PASS)
The trust boundary and money math are hardened and held under every adversarial
webhook I threw at them. All four defects were in **client recovery-UX on the
non-happy payment paths** (rate-limited, already-paid, anomalous refund) plus one
latent money bug in the not-yet-wired refund path. None let an attacker mark an
unpaid order paid, over-refund, or bypass the signature/replay/reconciliation gates.

---

## Attempts by Category — what HELD

### Webhook forgery / abuse (all SOUND)
| Attack | Result |
|--------|--------|
| Unsigned body | 401, no DB read (verified LIVE on prod `next start`) |
| Wrong-secret / tampered v1 | 401 (`timingSafeEqual`, route.test.ts) |
| Body-id signature (C-1 seam) | 401 — only the query-string `data.id` is signed |
| Replay: finalized `(id,status)` | `duplicate` no-op, 200, no double-advance |
| Replay: unfinalized claim (crash sim) | reclaimable → reprocessed (advance is idempotent) |
| Out-of-order (approved before pending; refund before approved) | `order_status_rank` regression guard refuses backward moves |
| `charged_back` after `refunded` | mapped to `flag` — no advance, flagged for human |
| 2× / 3× identical webhooks racing | `unique(mp_payment_id, mp_status)` + `on conflict do nothing` + `for update` row lock ⇒ exactly ONE event row, ONE history row (new integration test) |
| Amount-tampered payment (`Payment.get` wrong amount) | zero-tolerance reconciliation blocks the paid transition, `amount-mismatch`, 200 flag |
| `total_cents` tamper via direct write | immutability trigger REJECTS it (new integration test) |
| Unknown payment id / foreign external_reference | `unknown-order`, 200, no mutation |
| Malformed / non-JSON / empty body | tolerated → 200 ignore (signature still verified first) |
| Lying / oversized Content-Length | 413 before read; bounded stream read caps actual bytes |
| Weird x-signature (missing ts/v1, non-hex) | `malformed_signature_header`/mismatch → 401 |
| Stale / future / non-numeric ts | 5-min replay window → `stale_timestamp`/`unparseable_ts` → 401 (checked AFTER HMAC) |
| MP down (`Payment.get` throws) | 500 retryable, NO partial state (claim left unfinalized) |

### Preference / redirect abuse (all SOUND)
| Attack | Result |
|--------|--------|
| Preference for a PAID order | `not-payable` (guard: `status='pending_payment'` only) |
| Foreign / non-UUID token | `not-payable` (UUID_PATTERN + token match) |
| Spam the pay action (SEC-H-1 limiter) | 10/min/IP sliding window BEFORE any DB/MP call; enforced without the `CHECKOUT_RATE_LIMIT_DISABLED` bypass |
| Tampered `?mp_status=success` on an unpaid order | display hint ONLY — `derivePanelState` reads DB truth; never flips to paid |
| Double-click "Pagar ahora" | `useTransition` disables the CTA while pending — no double-submit |

### UI / visual (all SOUND)
320px/375px: voucher reference/CLABE uses `break-all` + `select-all`; panel CTAs
`w-full` on mobile → `sm:self-start sm:w-auto` on ≥sm (no full-bleed bar); totals
`tabular-nums`; MX$99,999+ renders via `formatMXN` (no overflow). Long
reference/order-number wrap. Copy button feature-detected (`useSyncExternalStore`).
Missing voucher fields degrade to "check your email", no `undefined`/`Invalid Date`.

---

## Dead UI

| # | Element | File:Line | Issue | Fixed? |
|---|---------|-----------|-------|--------|
| 1 | rate-limited pay result | `payment-panel.tsx` `handleResult` | `rate-limited` mapped to the generic error overlay → rendered `FailedCard` "Tu pago fue rechazado / your payment was declined". The correct copy `checkout.payment.rateLimited.*` existed in BOTH locale files but was **never wired** (dead key). The card was never even charged. | ✅ |
| 2 | not-payable pay result | `payment-panel.tsx` `handleResult` | `not-payable` (order paid mid-session via webhook, a 2nd tab, or gone) mapped to the same false "declined" + a Retry button wired to the same action → **infinite loop** (the order can never be re-paid, so it never recovers). The correct `checkout.payment.stale.*` copy existed in both locales but was **never wired** (dead key). | ✅ |

Also dead (noted, not fixed — pure a11y niceties, no misleading behavior):
`checkout.payment.liveRegion.paid` / `.declined` are never announced (only
`redirecting`/`copied` are). Low-value; deferred.

## Logic Bugs

| # | Bug | File:Line | Steps to Reproduce | Fixed? |
|---|-----|-----------|---------------------|--------|
| 1 | **Refund idempotency-key collision (money)** — the MP `X-Idempotency-Key` was `refund:${orderId}:${amountCents}` (keyed by amount, not attempt). Two legitimately-separate partial refunds of the SAME cents on the same order collide at MP → MP returns the FIRST refund's cached response → `record_refund` sees the same `mp_refund_id` → `duplicate` → refund.ts reports `{status:"refunded", kind:"partial"}` (false success) while **no second money moved and no new ledger row**. Merchant believes they refunded twice; customer got one. | `refund.ts` `executeRefund` idempotencyKey | Call `refundOrderPayment(id, 10000)` twice → 2nd is silently collapsed, reported as fresh. (Latent: `refundOrderPayment` has no caller yet — T12 owns the admin action — so not live, but shipped money code.) | ✅ |
| 2 | **Refunded-but-never-paid shows "Payment received · Refunded"** — `derivePanelState` returned the paid-hero `refunded` variant for ANY `payment_status='refunded'`, ignoring `order_status`. A `refunded` webhook on an order the amount-mismatch guard NEVER let mark paid (order still `pending_payment`) rendered a reassuring "Pago recibido · Reembolsado" for a payment we never accepted. | `panel-state.ts:52` | DB: `payment_status=refunded`, `order_status=pending_payment` → confirmation page lies "paid". Confirmed at the DB level with a new integration test (payment-only refunded leaves order pending). | ✅ |

## Missing States

| # | Component | Missing State | File:Line | Added? |
|---|-----------|---------------|-----------|--------|
| 1 | `<PaymentPanel>` | "order status changed / already paid — reload" recovery | `payment-panel.tsx` | ✅ new `StaleCard` (`payment-panel-stale`, `role=status`, reload CTA revealing authoritative DB state) |

## Fixes Applied
- **H-1 refund idempotency (refund.ts):** key is now unique PER ATTEMPT — optional
  caller-supplied `idempotencyKey` param (T12 threads a stable per-action key for
  network-retry safety) defaulting to a fresh `randomUUID()` so two distinct
  same-amount refunds never collide. +2 discriminating tests.
- **M-1 rate-limited copy (payment-panel.tsx + labels + messages):** `rate-limited`
  now renders an honest amber "Demasiados intentos, espera un momento" via a
  parameterized `UnavailableCard`. Wired `checkout.payment.rateLimited.*` (both
  locales). +1 test (rate-limited is NOT a decline).
- **M-2 not-payable recovery (payment-panel.tsx + StaleCard + messages):** new
  `StaleCard` with reload CTA; `not-payable` → stale reveal instead of a false
  decline + retry loop. Wired `checkout.payment.stale.*` (both locales) + keys-used.
  +1 test (stale card reveals reload, no looping retry).
- **L-1 refunded-never-paid (panel-state.ts):** the paid-hero `refunded` variant is
  gated on `order_status !== 'pending_payment'`; the anomaly falls through to neutral
  unpaid copy. +2 panel-state tests.
- **Integration chaos (payments.integration.test.ts, +105 lines):** refunded-on-
  never-paid; duplicate refunded no-op writes no dup history; 3× concurrent identical
  claims → exactly one row; `total_cents` immutability rejects amount-tamper.

## Product Improvements (LISTED — not implemented, phase discipline)

| # | Improvement | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | Cache voucher fields (reference/URL/expiry) on the order at webhook time instead of a live `Payment.get` in the confirmation page's `Promise.all` (currently blocks up to `MP_API_TIMEOUT_MS`=8s on every pending-voucher page load). | High | M | P2 |
| 2 | Auto-refresh the `processing`/`pending-voucher` panel so the webhook-before-redirect race self-resolves without a manual "Actualizar" click. | Med | S | P2 |
| 3 | `not-payable` should say WHY: if the order is already paid, surface "¡Ya está pagado!" with a positive tone (needs the action to return the reason). | Med | S | P2 |
| 4 | Use `router.refresh()` instead of `window.location.reload()` in Stale/Processing recovery to avoid a full-page reflow + cart-clear re-run. | Low | S | P3 |

## Tests After Fixes
- **Unit: 1206 / 1206** (baseline 1192 + 14 new).
- **Integration: 158 / 158** (baseline 154 + 4 new webhook/state-machine chaos).
- **tsc: 0 errors. eslint: clean. `next build`: clean** (webhook route `ƒ /api/webhooks/mercadopago`).
- **Live prod `next start`:** unsigned webhook → **401** confirmed.
- **Prod-build e2e sweep NOT run to green** by this stage: the payment e2e precondition
  (PDP add-to-cart / order placement) hit the DOCUMENTED postgREST schema-cache /
  `NEXT_QA_DIST_DIR` infra flake (same one QA/UX flagged — NOT a payment regression;
  the panel/overflow/state/overlay logic is fully locked by 15 component tests +
  `derivePanelState` unit tests, all green). The authoritative prod-build e2e sweep is
  Stage 12 (Verify)'s to own.

## Standing gates (UNCHANGED — advisory pass only)
- **HUMAN-REVIEW GATE** (payment code) remains OPEN regardless of this report.
- **LIVE-SANDBOX verification** remains BLOCKED-ON-USER (no MP creds; MP mocked).

## Cleanup
DB reset + reseeded to pristine (0 orders, 30 products); hacker build dir + temp
playwright config + test-results removed; `tsconfig.json` restored; no stray servers.
