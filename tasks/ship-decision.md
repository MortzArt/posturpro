# Ship Decision: T8 — Mercado Pago Integration (sandbox)

> ⚠️ **THIS SHIP VERDICT IS ADVISORY ONLY — DO NOT MERGE, DO NOT CHECK `[x] T8`.**
> T8 is PAYMENT code. Per BUILD_PLAN rule 3 and the standing HUMAN-REVIEW GATE, a
> SHIP verdict does NOT authorize merge. A human MUST sign off on the payment
> trust-boundary code before T8 is checked off. See "Standing Gates" below.
>
> ⚠️ **LIVE-SANDBOX VALIDATION IS A DOCUMENTED RESIDUAL (BLOCKED-ON-USER).** No
> working MP credentials exist; `.env.local` holds placeholders; every test in this
> pipeline mocks the MP API. Nothing here has ever touched a real Mercado Pago
> endpoint. The exact confirm-list is carved out below.

## Verdict: SHIP (advisory — see gates; do not auto-merge)

## Confidence: HIGH (for the pipeline's mocked scope; live-sandbox residual is explicitly open)

## Quality Score: 9/10

---

## Test Results (personally run by Verify — not trusted from prior reports)

| Suite | Total | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit / Component (Vitest, 60 files) | 1206 | 1206 | 0 | 0 |
| Integration (Vitest, live local Docker Supabase, 12 files) | 158 | 158 | 0 | 0 |
| E2E — T8 payment (prod build, chromium+mobile) | 8 | 8 | 0 | 0 |
| E2E — checkout (prod build, regression baseline) | 24 | 24 | 0 | 0 |
| E2E — cart (prod build, regression baseline) | 46 | 46 | 0 | 0 |
| **Total** | **1442** | **1442** | **0** | **0** |

Plus: `npx eslint src/` → clean (exit 0). `npx tsc --noEmit` → 0 errors.
`NEXT_QA_DIST_DIR=.next-t8-verify next build` → compiled successfully both locales;
`ƒ /api/webhooks/mercadopago` emitted (dynamic function), `ƒ /[locale]/checkout/confirmacion/[token]`
dynamic, checkout routes present. Integration run applied migrations 0001..0009
clean via `supabase db reset` (0009 idempotent). E2e ran against a PRODUCTION build
(`next start` on `.next-t8-verify`, `CHECKOUT_RATE_LIMIT_DISABLED=1`); DB reseeded
between order-placing suites (documented stock-depletion rule).

### Cleanup completed at end of verification
- Prod server killed; `.next-t8-verify` removed; `git checkout -- tsconfig.json`
  (no dist-dir globs remain — tsconfig has only the standard `.next/types` includes).
- Also swept two pre-existing leaked dist dirs (`.next-t5-ux`, `.next-t8-hacker` —
  both correctly gitignored by the `.next-*/` glob, never tracked) and a stray
  untracked `playwright.hacker.config.ts` (Stage-11 leftover).
- DB left pristine-seeded (0 orders, 70 variants, 5 discount codes). No stray servers.
- `git status --porcelain` → EMPTY. `git ls-files | grep .next` → only `next-env.d.ts`
  (the required Next.js env file; zero build-dir/dist cruft tracked).

---

## Acceptance Criteria Final Check (23/23 verified in code + test)

| # | Criterion | Code | Test | Verdict |
|---|-----------|------|------|---------|
| AC-1 | `getMercadoPagoEnv()` typed, throws MissingEnvVarError | `env.ts` | `env.test.ts`, `route.ts` fail-closed | ✅ |
| AC-2 | No `NEXT_PUBLIC_` secret; `import "server-only"` | grep: 0 NEXT_PUBLIC secret; 7 server-only modules | `secret-exposure.test.ts` | ✅ |
| AC-3 | Non-secret MP tunables centralized | `payments/config.ts` | `config.test.ts` | ✅ |
| AC-4 | Preference: exact cents→decimal, ext_ref=token, urls | `preference.ts`, `money-boundary.ts`, `urls.ts` | `money-boundary.test.ts` | ✅ |
| AC-5 | Pay-now CTA on pending order | `payment-panel.tsx` | `payment-panel.test.tsx`, `payment.spec.ts` | ✅ |
| AC-6 | All 4 methods available (none excluded) | `preference.ts` / `config.ts` | `config.test.ts` | ✅ |
| AC-7 | POST webhook route (first route.ts) | `route.ts` | `route.test.ts` | ✅ |
| AC-8 | x-signature verified (constant-time) before side effect → 401 | `webhook.ts` (timingSafeEqual), `route.ts` (verify before process) | `webhook.test.ts`, `route.test.ts` (incl. C-1 seam) | ✅ |
| AC-9 | Authoritative Payment.get; body never trusted | `process-payment.ts:75-98` | `process-payment.test.ts` | ✅ |
| AC-10 | Idempotent dedupe (finalized replay → duplicate) | `process-payment.ts` claim-then-finalize | integration `record_payment_event` | ✅ |
| AC-11 | Match by ext_ref/token; unknown → 200 no mutation | `process-payment.ts` matchOrder | `process-payment.test.ts` | ✅ |
| AC-12 | Amount reconciliation zero-tolerance gates paid | `process-payment.ts:142-152` | `process-payment.test.ts` amount-mismatch | ✅ |
| AC-13 | advance_order_status sole path; atomic history | `0009` RPC; only status write path | integration advance+history | ✅ |
| AC-14 | MP status mapping (all + flag + unknown) | `payments-status.ts` | `payments-status.test.ts` | ✅ |
| AC-15 | RPC-level idempotency (same-status no-op) | `0009` advance_order_status | integration idempotent | ✅ |
| AC-16 | Card-decline retry, same order/token | `payment-panel.tsx` retry | `payment-panel.test.tsx` | ✅ |
| AC-17 | OXXO/SPEI voucher instructions | `oxxo-spei-instructions.tsx` | `oxxo-spei-instructions.test.tsx` | ✅ |
| AC-18 | OXXO/SPEI pending→approved advances to paid | `process-payment.ts` progression | integration progression | ✅ |
| AC-19 | Refund full/partial + idempotency key + ledger | `refund.ts` (per-attempt UUID key) | `refund.test.ts`, integration record_refund | ✅ |
| AC-20 | Refund refuses non-approved; typed; no raw echo; server-only | `refund.ts` | `refund.test.ts` | ✅ |
| AC-21 | Both locales; keys-used test | `es-MX.json`+`en.json` | `keys-used.test.ts`, `payment.spec.ts` EN | ✅ |
| AC-22 | Unit+integration+e2e pass; MP mocked | — | all suites green (verified above) | ✅ |
| AC-23 | Strict TS, clean code, baselines held | tsc 0, eslint clean | baselines: checkout 24 + cart 46 held | ✅ |

12/12 edge cases covered (per QA matrix, spot-confirmed in code: replay, out-of-order
regression guard, unknown→200, decline-retry, voucher-expiry honest copy, webhook-
before-redirect truth-from-DB, amount-mismatch, refund-pending, over-refund race-safe,
refund-failure state-unchanged, missing-creds friendly, malformed-body tolerated).

---

## High-Risk AC Spot-Check (read the code myself, not the summaries)

- **Webhook fail-closed on unset secret** — VERIFIED. `route.ts` `readWebhookSecret()`
  returns `null` on `MissingEnvVarError` → immediate 401 (never process blind); AND
  `verifyWebhookSignature` independently returns `{ok:false,"missing_secret"}` for a
  blank secret. Two independent gates. `requireEnv` treats whitespace as blank.
- **Authoritative Payment.get (body status never trusted)** — VERIFIED.
  `process-payment.ts` calls `paymentClient().get({id})` and reads status/amount from
  the MP-authoritative response; the notification body's `data.id` is used only to
  fetch, never for state.
- **Signature manifest uses QUERY id only (C-1 fix)** — VERIFIED. `route.ts:91` feeds
  `signatureDataId` (query only) to the verifier; body id is fetch-only. Route-seam
  regression test rejects a body-id-valid signature.
- **Amount reconciliation** — VERIFIED. Zero-tolerance (`AMOUNT_RECONCILIATION_TOLERANCE_CENTS=0`);
  gates ONLY the `paid` transition; mismatch → `amount-mismatch`, NOT paid, logged.
- **advance_order_status is the ONLY status path** — VERIFIED. `refund.ts` and
  `process-payment.ts` both transition exclusively via `advanceOrderStatus` → RPC;
  no `.update({status})` in payment code (Arch grep-confirmed; re-confirmed here).
- **mp_payment_events (id,status) dedupe + claim-then-finalize** — VERIFIED.
  `record_payment_event` claims with `processed_at=NULL`; `finalize_payment_event`
  sets it only after a successful advance; a transient advance failure leaves the
  claim unfinalized → 500 → MP retries → converges (advance is idempotent).
- **Over-refund guard race-safety** — VERIFIED. Local pre-check + `record_refund`
  RPC locks the order row (`for update`), sums the `payment_refunds` ledger, and
  refuses cumulative > total under the lock; MP is a third backstop.
- **Refund server-only + unreachable by clients** — VERIFIED. `import "server-only"`;
  H-1 fix present (per-attempt `randomUUID()` idempotency key at `refund.ts:116`,
  threaded to MP at 181-187) so two distinct same-amount partial refunds never
  collide at MP.
- **No secret in client bundle / no NEXT_PUBLIC_ secret** — VERIFIED. grep for
  `NEXT_PUBLIC_*(SECRET|TOKEN|ACCESS)` → none; access token/webhook secret referenced
  only in server-only/env/test modules; clean `next build` is the runtime backstop.
- **Migration 0009 local-only, RPC hygiene** — VERIFIED. All 6 functions
  `security definer` + `set search_path = ''` + `revoke all from public` +
  `grant execute to service_role`; tables `grant all to service_role` (RLS enabled,
  no policies). Highest-numbered migration; applied clean on `db reset` (idempotent).

## 4 Hacker (Stage 11) Fixes — all present + regression-locked

1. **not-payable → StaleCard** — `payment-panel.tsx:119,308` (`payment-panel-stale`,
   role=status, Reload reveals authoritative state). ✅
2. **rate-limited honest copy** — parameterized `UnavailableCard` with amber
   `rateLimitedBody`/`rateLimitedRetry`, `payment-panel.tsx:109-112,175-178`. ✅
3. **refund per-attempt idempotency key** — `refund.ts:116` fresh UUID per invocation. ✅
4. **refunded-on-never-paid neutral copy** — `panel-state.ts:58-61` falls through to
   neutral unpaid/pending copy when `refunded` on an order still `pending_payment`. ✅
   Regression tests present in `payment-panel.test.tsx`, `panel-state.test.ts`,
   `refund.test.ts`; i18n `stale.*`/`rateLimited.*` symmetric in both locales.
   All green in the 1206-test unit run.

---

## Report Summary

| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review | 6.5/10 → fixed | 2 CRITICAL (C-1 signature id source, C-2 refunded regression) + 8 MAJOR; all fixed in Stage 6, verified structurally resolved. |
| QA | HIGH / SHIP (advisory) | 23/23 AC + 12/12 edge cases; every Stage-6 C/M locked by a discriminating test. |
| UX | 9/10 / SHIP (advisory) | Paid-method label bug + expired-voucher honest copy fixed; a11y/keyboard/responsive verified. |
| Security | SECURE (advisory) | 0 critical, 1 HIGH fixed (SEC-H-1 preference rate limit); 0 secrets; leaked-secret blast radius bounded by authoritative fetch + amount reconciliation. |
| Architecture | 9/10 (A) / APPROVE | One money boundary, one write path, fail-closed trust boundary, claim-then-finalize durability; TD-1/TD-2/TD-3 flagged for T9/T12. |
| Hacker | 3/10 chaos (PASS) | Trust boundary + money math held under adversarial webhook chaos; 4 client recovery-UX bugs fixed + regression-locked. |

---

## Discrepancies vs Prior Reports (found during verification — none block SHIP)

1. **`tasks/hacker-report.md` on disk is the T7 report, not T8.** The file was never
   overwritten for T8 (last touched by commit 0708911, title "T7 — Checkout & Order
   Creation"). The actual T8 Stage-11 work IS committed (4474f8b, 13 files) and its
   4 fixes + regression tests are present and passing (verified above). This is a
   DOCUMENTATION gap, not a code gap — the chaos findings live in `pipeline-state.md`
   Stage-11 notes, which are accurate. **Recommend regenerating hacker-report.md for
   T8 before archiving the task.** Does not affect the code verdict.
2. **Task prompt referenced commit `d23eff0`; that hash is NOT in history.** The real
   Stage-11 T8 commit is `4474f8b`. The described work (`.next-*/` .gitignore
   hardening, StaleCard, panel-state neutral copy, refund key, +regression tests) all
   matches 4474f8b's diff. No integrity concern.
3. **Suite counts slightly higher than prior stages** (unit 1206 vs QA's 1177 —
   Security +6, Hacker +14 = 1206; integration 158 vs 154 — Hacker +4). Consistent
   with the documented deltas across Stages 9/11. My numbers are the authoritative
   current-tree counts.

---

## Remaining Concerns (residual — none are ship blockers within mocked scope)

- **Live-sandbox validation (BLOCKED-ON-USER)**: MEDIUM residual — see confirm-list below.
- **No durable "needs-review" surface (Arch TD-1)**: MED — chargeback/mediation/
  unknown-status/amount-mismatch are `console.error`+200 only. Fix before T12.
- **order_status_history has no structured transition_kind (Arch TD-2)**: MED — fix
  before T9 hardcodes note string-matching.
- **SEC-L-1** (attacker-influenced payment id logged plaintext, post-HMAC-gate): LOW,
  accepted. **SEC-M-1** (clientIp trust model duplicated in two T7 files): LOW, accepted.
- **2 pre-existing dev-only npm-audit moderates** (postcss via next build toolchain):
  not a runtime path; accepted.

---

## BLOCKED-ON-USER — Live-Sandbox Residual (exact confirm-list)

The following can be confirmed ONLY against a real Mercado Pago sandbox and are NOT
covered by any test in this pipeline (all mock MP). Run the dev-done "How to Test"
checklist against a real sandbox before launch:

1. **OXXO/SPEI voucher field paths** — `transaction_details.external_resource_url` /
   reference / expiry vs the `point_of_interaction.*` fallback. Read defensively today;
   confirm the actual shape from a real OXXO/SPEI payment response.
2. **Real x-signature format end-to-end** — a genuine MP-signed webhook against the
   real secret (manifest id/request-id/ts composition, ts seconds-vs-ms).
3. **Real payment-type → method mapping** — actual `payment_type_id`/`payment_method_id`
   values MP returns for card/OXXO/SPEI/wallet vs `resolvePaymentMethod`.
4. **Actual redirect round-trip** — `init_point` redirect → back_urls return →
   webhook-before-redirect race resolving to the correct DB truth.

**Env vars the user must set (never `NEXT_PUBLIC_` for the secrets):**
- `MERCADOPAGO_ACCESS_TOKEN` (server-only SECRET — MP dashboard → Test credentials → Access Token)
- `MERCADOPAGO_WEBHOOK_SECRET` (server-only SECRET — MP dashboard → Webhooks → Configure notifications → signing secret)
- `MERCADOPAGO_PUBLIC_KEY` (only if a client Wallet Brick is later added; then `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`; unused by the redirect surface)
- `NEXT_PUBLIC_SITE_URL` (optional — only behind an opaque proxy)

---

## Standing Gates (BOTH remain OPEN regardless of this SHIP verdict)

### (a) HUMAN-REVIEW GATE — BUILD_PLAN rule 3
Payment code requires human sign-off before merge. **Do NOT check `[x] T8` in
BUILD_PLAN.md.** This advisory SHIP does not authorize merge. (Same gate is still
open for T7.)

### (b) Human-Reviewer Focus List
The human reviewer must independently review:
- **Webhook trust boundary** — `src/app/api/webhooks/mercadopago/route.ts` +
  `src/lib/payments/webhook.ts` (signature-before-side-effect, fail-closed, C-1
  query-id-only manifest, replay window, body cap).
- **Amount reconciliation** — `src/lib/payments/process-payment.ts` (authoritative
  Payment.get, zero-tolerance amount gate, claim-then-finalize dedupe).
- **Refund execution** — `src/lib/payments/refund.ts` (server-only, over-refund
  race-safety, per-attempt idempotency key, no raw-error echo).
- **Order-state RPCs** — `supabase/migrations/0009_payments.sql` (SECURITY DEFINER,
  empty search_path, service_role-only, regression guard, payment-only mode).
- **Secret handling** — `src/lib/env.ts`, `src/lib/payments/mp-client.ts`
  (server-only, no NEXT_PUBLIC secret).
- **Preference-creation rate limit** — `src/app/[locale]/checkout/pay-actions.ts` +
  `src/lib/payments/preference-rate-limit.ts` (SEC-H-1 fix).

### (c) T9 / T12 Design Inputs (from Arch, carry forward)
- **Before T9:** add a structured `transition_kind`/`event_type` to the transition
  record (Arch TD-2, effort S) so email routing doesn't string-match free-text
  `note`. Payment-only refund rows have `from==to` — ambiguous without it.
- **Before T12:** (1) add a durable "needs-review" surface (Arch TD-1) — a
  `payment_review_queue` table or `orders.needs_review` flag written by the
  flag/mismatch paths (currently console-only). (2) design cancel-with-stock-restore
  as ONE atomic `cancel_order_with_restock` RPC (Arch TD-3) — two sequential app
  calls risk partial-failure stock corruption; expired-voucher orders leak stock
  until this exists. Also: `refundOrderPayment` trusts its caller for auth — T12
  MUST gate it behind admin authorization.

---

## What Was Built

Mercado Pago Checkout Pro (redirect/preference) payment capture for the store: a
pay-now flow on the token-addressed confirmation page (card/OXXO/SPEI/wallet), the
repo's first webhook route with fail-closed HMAC signature verification and
authoritative payment re-fetch, an idempotent claim-then-finalize event spine, a
zero-tolerance amount-reconciliation guard, a single regression-guarded
`advance_order_status` RPC as the only order-state write path, and a server-only
refund execution API (full/partial, race-safe over-refund guard, durable ledger)
for T12's admin. All money crosses one exact cents↔decimal boundary; no secret ever
reaches the client bundle.

## Summary

Every suite I ran myself is green (1442 total: unit 1206, integration 158, e2e
8+24+46), tsc/eslint clean, the production build emits the webhook function, and the
highest-risk trust-boundary code holds up to line-by-line reading and adversarial
tests. T8 is technically ship-ready within the pipeline's mocked scope, but it is
PAYMENT code: the HUMAN-REVIEW GATE and the BLOCKED-ON-USER live-sandbox validation
both remain OPEN — do not merge or check off T8 until a human reviews the trust
boundary and a real MP sandbox round-trip confirms the four residual field-path/
signature/mapping/redirect items.
