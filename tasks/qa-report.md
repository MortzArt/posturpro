# QA Report: T8 — Mercado Pago integration (Stage 7, ultraqa)

> ⚠️ **HUMAN-REVIEW GATE (BUILD_PLAN rule 3) — READ FIRST.** This is PAYMENT code.
> This QA verdict is ADVISORY ONLY. A SHIP verdict does NOT authorize merge. A human
> MUST review signature verification, amount reconciliation, refund execution,
> order-state advancement, and secret handling before T8 is checked off.
>
> ⚠️ **LIVE-SANDBOX VERIFICATION IS BLOCKED-ON-USER.** No working MP credentials
> exist; `.env.local` holds PLACEHOLDERS. ALL tests mock the MP API. A real sandbox
> round-trip cannot run in this pipeline (documented in dev-done.md "How to Test").

## Test Suite Summary (deltas vs baseline)

| Type | Baseline | Written (this stage) | Total | Passed | Failed | Skipped |
|------|----------|----------------------|-------|--------|--------|---------|
| Unit / Component | 1126 | +51 | 1177 | 1177 | 0 | 0 |
| Integration (live local DB) | 151 | +3 | 154 | 154 | 0 | 0 |
| E2E — T8 payment | 8 | 0 | 8 | 8 | 0 | 0 |
| E2E — checkout | 24 | 0 | 24 | 24 | 0 | 0 |
| E2E — cart | 46 | 0 | 46 | 46 | 0 | 0 |
| **Total** | **1355** | **+54** | **1409** | **1409** | **0** | **0** |

- tsc `--noEmit`: **0 errors**. eslint: **clean**. next build (NEXT_QA_DIST_DIR=.next-t8-qa): **clean** — webhook route emitted `ƒ /api/webhooks/mercadopago`; `tsconfig.json` restored, dist dir removed after.
- DB left pristine-seeded (reseeded after every order-placing suite); no stray servers.

## Tests Written (this stage)

### Unit / Component (+51)
- **`src/app/api/webhooks/mercadopago/route.test.ts` (NEW, 20 tests)** — the repo's
  first route handler was previously exercised only "live with synthetic payloads",
  not automated. Now covers the full ROUTE trust boundary with Node's real `crypto`
  building valid signatures and the REAL `verifyWebhookSignature`:
  - Signature gate (AC-8): missing → 401, tampered → 401, malformed → 401, secret
    not configured → 401 (fail-closed), all with **no processing**.
  - **C-1 regression lock at the route seam**: a signature valid for the QUERY id
    verifies; a signature valid for the BODY id (query differs) is **rejected 401**.
    Discriminates the exact C-1 failure mode (wrong id source → false 401).
  - **M-5 body cap**: declared Content-Length > 64KB → 413 before read; a real >64KB
    streamed body with an under-declared/lying Content-Length → 413 via the bounded
    stream read.
  - Type dispatch (edge 12): non-payment type → 200 ignore (no processing); payment
    with no data.id → 200 ignore; non-JSON body after a valid signature → no crash.
  - httpOk → HTTP mapping: processed/duplicate/unknown/amount-mismatch → 200;
    advance-blocked (M-7) / mp-unavailable → 500; a thrown error → 500 that never
    leaks the raw message.
  - data.id sourcing: fetch prefers the query id, falls back to the body id; the
    body `action` is threaded through.
- **`src/components/checkout/payment-panel.test.tsx` (NEW, 15 tests)** — every panel
  state + overlay + a11y role: unpaid (pay CTA + restated total, no NaN), paid
  (role=status + method label + generic fallback), paid+refunded note, failed
  (role=alert + retry), processing (role=status + refresh reloads), pending-voucher
  (renders + null-voucher degrades to "generating"); pay action → redirect on
  success; unavailable/error/not-payable overlays; retry from failed re-launches with
  the SAME token (no re-create, AC-16/edge 4); unavailable→retry recovery to redirect.
- **`src/components/checkout/oxxo-spei-instructions.test.tsx` (NEW, 12 tests)** —
  voucher defensive-degradation matrix: fully-populated OXXO (reference/amount/expiry/
  link with target=_blank rel=noopener), SPEI title + CLABE label swap, select-all
  reference, amber-not-green styling; **every field missing** degrades with no crash,
  no "Invalid Date", no "undefined"; invalid ISO expiry dropped; expiry locale-
  formatted (es-MX ≠ en); pay-differently callback; copy button hidden when
  navigator.clipboard is unavailable (feature-detect).
- **`src/lib/payments/money-boundary.test.ts` (+4)** — exactness hardening: dense
  0..2000¢ round-trip sweep (all .x5 centavo boundaries), large realistic totals
  (up to 123,456,789¢) round-trip + 2-decimal string invariant, string↔number
  agreement across every centavo, documented half-centavo rounding guard.

### Integration (+3, live local DB via scripts/run-integration.sh reset+seed)
- **`advance_order_status` transition matrix** (`tests/integration/payments.integration.test.ts`):
  full LEGAL forward chain pending→paid→preparing→shipped→delivered (each `advanced`,
  4 history rows); every ILLEGAL backward transition from shipped → `regression_blocked`
  (order never regresses); legal forward JUMP paid→shipped (skip preparing).

## Acceptance Criteria Coverage (23/23)

| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| AC-1 | `getMercadoPagoEnv()` typed accessor, throws MissingEnvVarError | `env.test.ts` (getMercadoPagoEnv), route.test (secret-not-configured→401) | PASS |
| AC-2 | No MP secret NEXT_PUBLIC_; server-only guard | `secret-exposure.test.ts` | PASS |
| AC-3 | Non-secret MP tunables centralized | `config.test.ts` (resolvePaymentMethod, constants) | PASS |
| AC-4 | Preference: cents→decimal exact, external_reference=token, back_urls/notification_url | `money-boundary.test.ts`, `preference.ts` (urls.ts builders) | PASS |
| AC-5 | Confirmation page pay-now CTA for pending order | `payment-panel.test.tsx` (unpaid), `e2e/payment.spec.ts` (AC-5) | PASS |
| AC-6 | All four methods available (no method excluded by config) | `config.test.ts` / `preference.ts` (no exclusion set) | PASS |
| AC-7 | POST webhook route handler exists (first route.ts) | `route.test.ts` (all cases) | PASS |
| AC-8 | x-signature verified (constant-time) before side effect → 401 | `webhook.test.ts`, `route.test.ts` (signature gate + C-1) | PASS |
| AC-9 | Authoritative Payment.get; maps status | `process-payment.test.ts`, `payments-status.test.ts` | PASS |
| AC-10 | Idempotent dedupe spine (finalized replay → duplicate no-op) | `process-payment.test.ts`, integration record_payment_event | PASS |
| AC-11 | Match by external_reference/token; unknown → 200 no mutation | `process-payment.test.ts` (unknown-order) | PASS |
| AC-12 | Amount reconciliation zero-tolerance gates paid | `process-payment.test.ts` (amount-mismatch), `money-boundary.test.ts` | PASS |
| AC-13 | advance_order_status RPC is sole path; writes history atomically | integration (advance + history), `advance-order.ts` | PASS |
| AC-14 | MP status mapping unit-tested (all statuses + flag + unknown) | `payments-status.test.ts` | PASS |
| AC-15 | RPC-level idempotency (same-status no-op, no dup history) | integration (idempotent) | PASS |
| AC-16 | Card-decline retry, same order, token unchanged | `payment-panel.test.tsx` (retry), `process-payment.test.ts` (rejected→failed) | PASS |
| AC-17 | OXXO/SPEI pending voucher instructions | `oxxo-spei-instructions.test.tsx`, `payment-panel.test.tsx` (pending-voucher) | PASS |
| AC-18 | OXXO/SPEI pending→approved advances to paid | `process-payment.test.ts` (progression), integration (record_payment_event progression) | PASS |
| AC-19 | Refund execution full/partial + idempotency key + ledger | `refund.test.ts`, integration record_refund | PASS |
| AC-20 | Refund refuses non-approved; typed result; never echoes raw MP error | `refund.test.ts` (not-paid, mp-error, no-echo) | PASS |
| AC-21 | Every string in both locales; keys-used test | `keys-used.test.ts`, `e2e/payment.spec.ts` (EN copy) | PASS |
| AC-22 | Unit + integration + e2e all pass; MP mocked | this report — all suites green | PASS |
| AC-23 | Strict TS, clean code, baselines not regressed | tsc 0, eslint clean, baselines held | PASS |

## Edge-Case Coverage (12/12)

| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Webhook replay (same id twice) | `process-payment.test.ts` (duplicate), integration (finalized replay → duplicate) | PASS |
| 2 | Out-of-order webhooks (stale after approved) | integration (regression_blocked), route transition matrix | PASS |
| 3 | Unknown/unmatched payment → 200 no mutation | `process-payment.test.ts` (unknown-order), `route.test.ts` | PASS |
| 4 | Card decline then successful retry | `payment-panel.test.tsx` (retry same token), `process-payment.test.ts` | PASS |
| 5 | OXXO/SPEI voucher expiry (cancelled/expired) | `payments-status.test.ts` (cancelled→failed), `oxxo-spei-instructions.test.tsx` | PASS |
| 6 | Webhook-before-redirect race (truth from DB) | `panel-state.test.ts` (never flips on hint), `payment-panel.test.tsx` (processing) | PASS |
| 7 | Amount mismatch → not paid, flagged | `process-payment.test.ts` (amount-mismatch) | PASS |
| 8 | Refund a pending payment → not-refundable | `refund.test.ts` (not-paid) | PASS |
| 9 | Partial then over-refund bounded | `refund.test.ts` (over-refund pre-check), integration (record_refund cumulative guard) | PASS |
| 10 | Refund MP failure → state unchanged, no echo | `refund.test.ts` (mp-error, no-echo) | PASS |
| 11 | Missing/placeholder MP creds → friendly unavailable | `payment-panel.test.tsx` (unavailable overlay), `e2e/payment.spec.ts` (edge 11) | PASS |
| 12 | Malformed/non-payment webhook body | `route.test.ts` (non-payment 200, non-JSON no crash, no data.id) | PASS |

## Regression-Lock Table (every Stage-6 C/M finding)

| ID | Failure mode | Lock test | Discriminates? |
|----|--------------|-----------|----------------|
| C-1 | Verifier fed body data.id instead of query id → false 401s | `webhook.test.ts` "C-1 query vs body" + `route.test.ts` "signature valid for body id is REJECTED" | YES — a valid-for-body signature is 401'd; valid-for-query passes. Route-seam + pure-verifier both. |
| C-2 | refunded forced order_status=paid (dropped on shipped, no history on paid) | `payments-status.test.ts` (refunded→orderStatus null), integration payment-only on PAID + on SHIPPED (payment_status=refunded, history written, lifecycle untouched) | YES — shipped order stays shipped, payment refunded, history row exists. |
| M-1 | dedupe unique(mp_payment_id) dropped later statuses | `process-payment.test.ts` OXXO pending→approved progression (both claimed), integration record_payment_event progression + finalized-replay duplicate | YES — progression processes; only a finalized same-(id,status) replay is duplicate. |
| M-2 | No cumulative over-refund guard | `refund.test.ts` (remaining-balance pre-check, race SQL-guard→error), integration record_refund cumulative rejects race-safely | YES — over-refund rejected at SQL level; rejected refund does not record. |
| M-4 | No ts replay-window check | `webhook.test.ts` replay-window suite (fresh accepted, stale/future rejected, boundary, unparseable ts) | YES — stale valid signature 401'd. |
| M-5 | Unbounded body DoS | `route.test.ts` (Content-Length 413, lying-length streamed 413) | YES — both the declared-length gate and the streamed cap fire 413. |
| M-6 | Claim/advance not atomic → stuck order | `process-payment.test.ts` (finalize only after advance; unfinalized on error), integration reclaim unfinalized | YES — advance failure leaves claim unfinalized → retry reprocesses. |
| M-7 | Callers ignored RPC result.reason | `process-payment.test.ts` (regression_blocked → advance-blocked/500, unfinalized), `route.test.ts` (advance-blocked → 500) | YES — regression_blocked is a 500, not a false success. |
| M-3 (durable ledger) | Partial refund no durable audit | `refund.test.ts` (partial records ledger row), integration record_refund idempotent-by-refund-id | PASS |
| M-8 (atm miscategorization) | atm→spei wrong voucher UX | `config.test.ts` resolvePaymentMethod (atm→null; method_id primary) | PASS |

## Bugs Found & Fixed

**None (zero known bugs).** No real code defect surfaced during test authoring — the
Stage-6 rework holds under adversarial tests. The only test-authoring corrections were
mine: a Supabase VoucherView field (`verificationCode`) missing in a fixture, and a
`vi.mock` hoisting fix in the route test — both test-side, no source change.

**Note (not a bug — documented infra behavior):** running `e2e/payment.spec.ts` and
`e2e/checkout.spec.ts`/`cart.spec.ts` back-to-back depletes the seeded Milano-chair
stock (both buy the same variant), causing order-placing tests in the later suite to
fail. This is the documented "reseed before/after order-placing e2e" infra rule. Each
suite passes green in isolation after a reseed (payment 8/8, checkout 24/24, cart 46/46);
DB left pristine-seeded.

## Untested Areas (residual risk)

- **Live MP round-trip** (preference create / Payment.get / refund against a real
  sandbox) — BLOCKED-ON-USER (no credentials). All MP calls mocked. **Risk: MEDIUM** —
  the field paths (voucher `transaction_details.*` vs `point_of_interaction.*`, exact
  `payment_type_id`/`payment_method_id` values, whether the webhook secret differs
  test/prod) are heuristics read defensively; they must be confirmed against a live
  sandbox before launch (documented in dev-done.md BLOCKED-ON-USER).
- **Paid / pending-voucher / failed VISUAL states end-to-end via a real webhook** —
  driven in unit/component tests (derivePanelState + PaymentPanel + OxxoSpei) rather
  than a live webhook e2e (blocked-on-user). **Risk: LOW** — the state derivation and
  every render branch are unit-covered.
- **binary_mode UX sign-off (m-6)** and **statement descriptor (N-3)** — intentional
  launch-time config, human/live sign-off. **Risk: LOW.**

## Verdict

**SHIP — advisory only.** Confidence: **HIGH**.

Justification: 23/23 acceptance criteria and 12/12 edge cases have passing tests; every
Stage-6 CRITICAL and MAJOR finding is locked by a test that discriminates its exact
failure mode (verified — C-1 rejects a body-id-valid signature, M-5 fires 413 on a
lying Content-Length, M-7 turns regression_blocked into a 500, C-2 refunds a shipped
order without regressing it). The webhook trust boundary — the repo's only public
unauthenticated write endpoint and the highest-risk surface — now has an automated route
test that was previously only exercised by hand. All 5 suites are green (unit 1177,
integration 154, e2e 8+24+46), tsc/eslint clean, DB pristine.

Confidence is HIGH for the pipeline's mocked scope. It is **explicitly gated** by two
standing blocks that keep the real-world risk open regardless of this verdict:
(1) the **HUMAN-REVIEW GATE** on all payment code before merge, and (2) the
**BLOCKED-ON-USER live-sandbox verification** — no test in this pipeline has ever
touched a real Mercado Pago endpoint. Do not check T8 off in BUILD_PLAN until both clear.
