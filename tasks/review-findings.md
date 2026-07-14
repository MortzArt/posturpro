# Code Review: T8 — Mercado Pago integration (commit 1713f6c)

> ⚠️ **HUMAN-REVIEW GATE (BUILD_PLAN rule 3).** This is PAYMENT code. Every
> pipeline verdict on T8 is ADVISORY ONLY. The findings below are the reviewer's
> input to the mandatory human review; an APPROVE verdict here does NOT authorize
> merge. A human must independently review signature verification, amount
> reconciliation, refund execution, order-state advancement, and secret handling.

## Summary

A genuinely strong, defense-in-depth payment implementation: the trust boundary
(signature-before-side-effect, authoritative Payment.get, mp_payment_events unique
spine, regression-guarded RPC, exact cents↔decimal boundary, server-only secrets)
is well-architected and the code quality is high. However, adversarial review
surfaced **2 CRITICAL correctness bugs** (webhook signature manifest uses the
wrong `data.id` source in the fallback path → self-inflicted 401s; the `refunded`
webhook regresses/mislabels order state), **several MAJOR gaps** (payment-id
dedupe drops the OXXO/SPEI pending→approved second webhook; no cumulative
over-refund guard; no replay-window/`ts` staleness check; unbounded-body DoS
surface; partial-refund leaves NO durable audit trail; a race between event-claim
and order-advance), and a set of MINOR/NIT items. This needs Stage 6 fixes before
it is fit for the human gate.

---

## Critical Issues (MUST FIX)

### C-1: Webhook signature manifest can be built from the WRONG `data.id` (body vs query), producing false 401s
- **ID**: C-1
- **Severity**: CRITICAL
- **File**: `src/app/api/webhooks/mercadopago/route.ts:46-49`, `src/lib/payments/webhook.ts:78-92`
- **Problem**: MP builds the signed manifest from the **query-string** `data.id`
  (`?data.id=...`), lowercased. This route computes
  `const dataId = queryDataId ?? normalizeId(body?.data?.id)` — it falls back to
  the **body** `data.id` when the query param is absent, and passes THAT into
  `verifyWebhookSignature`. When the query id is missing (real MP deliveries vary
  in shape) the verifier rebuilds the manifest from a body id that MP did not use
  to sign, so the recomputed HMAC will not match → **legitimate MP webhook
  rejected 401 → MP retries → gives up → order never marked paid** (money received,
  order stuck). `buildManifest` (webhook.ts:84) also OMITS the `id:` segment
  entirely when `dataId` is null, diverging further from what MP signed. Tests
  don't catch this because they construct the manifest from the same source the
  verifier reads.
- **Impact**: Breaks the happy path against the real gateway; silent
  paid-but-stuck orders. Highest-risk defect on the trust boundary.
- **Suggested Fix**: Verify using ONLY the query-string `data.id`
  (`url.searchParams.get("data.id")`), lowercased — never the body. Keep the body
  id solely as a `Payment.get` fetch fallback; pass the *query* id (or null) into
  the verifier. Add a unit test where the signed query id ≠ body id and assert the
  verifier ignores the body. Confirm against MP's live `x-signature` docs at the
  human gate (BLOCKED-ON-USER).

### C-2: The `refunded` MP webhook forces `order_status = 'paid'`, mislabeling / dropping refund state on advanced orders
- **ID**: C-2
- **Severity**: CRITICAL
- **File**: `src/lib/payments/payments-status.ts:101-110`, applied via `src/lib/payments/process-payment.ts:137-145`
- **Problem**: `mapMpStatus("refunded")` returns `orderStatus: "paid"`,
  `paymentStatus: "refunded"`. MP fires `refunded` for both full and partial
  refunds. In `process-payment.ts` this calls
  `advance_order_status(p_order_status: 'paid', p_payment_status: 'refunded')`.
  (1) If the order is past `paid` (`preparing`/`shipped` — reachable once the RPC
  is reused by T12, which the dev explicitly designed for), the regression guard
  (`order_status_rank`) returns `regression_blocked` and `payment_status` is
  **never set to `refunded`** — the refund webhook is silently dropped.
  (2) For a plain `paid` order it hits `noop_same_status`, which DOES set
  `payment_status='refunded'` but writes **no history row** — no audit trail for a
  material money-state change (AC-13 violation). The code hard-codes
  `orderStatus: "paid"` while the adjacent comment says "order status is decided by
  the refund flow, not here" — code contradicts comment.
- **Impact**: Refunds on advanced orders silently fail to record; payment status
  disagrees with reality; no audit trail. Money-state correctness bug on a
  human-gate focus area.
- **Suggested Fix**: The `refunded` mapping must NOT assert an order_status. Add a
  mapping variant (e.g. `kind: "payment-only"`) or let `advance_order_status`
  accept a null `p_order_status` meaning "set payment fields, don't touch status",
  and WRITE a history row for the payment_status change. Add a test: `refunded`
  webhook on a `shipped` order still marks `payment_status='refunded'`.

---

## Major Issues (SHOULD FIX)

### M-1: `mp_payment_events` unique key is the payment id, so legitimate later status changes for one payment are dropped as "duplicate" — breaks OXXO/SPEI pending→approved (AC-18)
- **ID**: M-1
- **Severity**: MAJOR (arguably CRITICAL for OXXO/SPEI)
- **File**: `supabase/migrations/0009_payments.sql:40-55`, `src/lib/payments/process-payment.ts:93-107`
- **Problem**: The spine is `unique(mp_payment_id)`; the webhook claims the id and
  treats a 23505 as "duplicate → 200, no further processing". But one payment id
  emits MULTIPLE webhooks over its lifecycle: `pending` → `approved` (OXXO/SPEI
  paid out-of-band later), or `approved` → `refunded` → `charged_back`. Only the
  FIRST webhook for an id is ever processed; every later real status change is
  swallowed. The `pending` OXXO/SPEI webhook claims the id first, so the
  subsequent `approved` webhook is dropped and the **order never becomes paid** —
  directly breaking AC-18 and edge 5. The dedupe (claim at line 94) happens before
  the status is even mapped (line 116).
- **Impact**: Breaks the headline OXXO/SPEI flow and refund/chargeback follow-on
  webhooks. Also the mechanism the dev summary relies on for the partial-refund
  audit trail (M-3) never fires.
- **Suggested Fix**: Key the spine per **(mp_payment_id, mp_status)** or per MP
  notification/delivery id — not payment id alone. Or make the event table an
  append-only audit log and gate side effects on the RPC's own idempotency (the
  RPC already prevents double-advance). Re-test AC-18 pending→approved end-to-end
  (integration).

### M-2: No cumulative over-refund guard — edge 9 (partial then a second partial exceeding remaining balance) is NOT handled
- **ID**: M-2
- **Severity**: MAJOR
- **File**: `src/lib/payments/refund.ts:71-77`
- **Problem**: The only local check is `amountCents > order.totalCents` (single
  refund vs total). Edge 9 is a partial THEN a second partial exceeding the
  *remaining* balance. Since partials keep `payment_status='paid'` and write
  nothing durable (M-3), the function has no memory of prior refunds: two 60%
  partials both pass `> totalCents` and are both sent to MP. The dev claim
  "partial bounded ≤ total locally" only bounds a single partial. Relies entirely
  on MP's own guard (the documented "second backstop"), contradicting the ticket's
  "sum of refunds ≤ order total". Untested (`refund.test.ts:104` only covers the
  single-refund case).
- **Impact**: Over-refund possible; edge 9's stated "bounded locally" behavior is
  false.
- **Suggested Fix**: Before a partial, sum prior refunds for `mp_payment_id` (via
  `GET /payments/{id}` `transaction_amount_refunded` / `refunds[]`, or a refund
  ledger) and reject if `priorRefunded + amountCents > totalCents`. Add a
  cumulative-refund test.

### M-3: Partial refund leaves NO durable record — no history row, no event row, no ledger
- **ID**: M-3
- **Severity**: MAJOR
- **File**: `src/lib/payments/refund.ts:157-165`
- **Problem**: On a successful partial refund the code only `console.info` and
  returns. It relies on "the `mp_payment_events` row written when MP fires the
  `refunded` webhook" — but that webhook shares the original approval's
  `mp_payment_id`, so it hits the unique-guard duplicate branch (M-1) and is never
  recorded, and even if recorded the noop branch writes no history (C-2). Net: a
  partial refund of real money leaves zero durable trace in our DB.
- **Impact**: No reconciliation trail for partial refunds; combined with M-2,
  over-refunds are undetectable after the fact.
- **Suggested Fix**: Write an explicit refund record at success time in
  `executeRefund` (a row keyed on the MP *refund id*, not the payment id, or a
  history note via the RPC). Do not depend on the `refunded` webhook.

### M-4: No replay window / `ts` staleness check — a captured valid webhook can be replayed indefinitely
- **ID**: M-4
- **Severity**: MAJOR
- **File**: `src/lib/payments/webhook.ts:100-125`
- **Problem**: The verifier HMACs over `ts` but never checks `ts` is recent.
  Anyone who once captured a valid `x-signature`+body can replay it forever and it
  verifies `ok: true`. The DB dedupe limits damage only for an already-processed
  id (and given M-1, first-seen wins). The module docstring calls itself
  "replay-safe" (webhook.ts:4) — inaccurate; it is replay-safe only via DB dedupe,
  not at the signature layer.
- **Impact**: Replay attack surface on the trust boundary; misleading claim.
- **Suggested Fix**: After HMAC verification, parse `ts` (handle the ms-vs-s
  ambiguity noted in-file) and reject if `|now - ts| > WEBHOOK_REPLAY_TOLERANCE_MS`
  (documented constant), 401. Add valid-but-stale and valid-and-fresh tests.

### M-5: Unbounded request body — DoS surface on a public unauthenticated endpoint
- **ID**: M-5
- **Severity**: MAJOR
- **File**: `src/app/api/webhooks/mercadopago/route.ts:41`
- **Problem**: `await request.text()` reads the entire body into memory with no
  size cap, and it must run BEFORE signature verification (the body is needed to
  extract id/type). This is the app's only public unauthenticated write endpoint.
  An attacker can POST huge / many concurrent bodies to exhaust memory before the
  signature check ever protects anything.
- **Impact**: Memory-exhaustion / DoS.
- **Suggested Fix**: Cap body size (reject `content-length` over a small limit such
  as 64KB with 413 before reading, or read via a bounded stream). MP notifications
  are tiny. Document the limit constant.

### M-6: Race between `mp_payment_events` claim and order advance — a failure between them permanently blocks reprocessing
- **ID**: M-6
- **Severity**: MAJOR
- **File**: `src/lib/payments/process-payment.ts:94-150`
- **Problem**: Claim (insert, commits) and advance (separate RPC txn) are not
  atomic. If the advance fails after the claim committed, the route returns 500 so
  MP retries — but the retry now finds the claim present → returns `duplicate`
  (line 102) → 200 without advancing. Money received, order stuck, MP has stopped
  retrying. Classic "claim before the real work commits" idempotency hazard.
- **Impact**: A transient advance failure becomes a permanent stuck-order bug.
- **Suggested Fix**: Make claim+advance a single transaction (one RPC inserts the
  event AND advances, rolling back both on failure), or finalize the claim only
  after a successful advance (claim `pending`, finalize after; retry reprocesses a
  non-finalized claim). Fold with M-1's spine rework. Add an integration test:
  advance-fails-then-retries must eventually advance.

### M-7: `advanceOrderStatus` callers never inspect `result.reason` — a blocked/no-op RPC is treated as success
- **ID**: M-7
- **Severity**: MAJOR
- **File**: `src/lib/payments/advance-order.ts:31-35`; callers `process-payment.ts:146-150`, `refund.ts:141-154`
- **Problem**: Callers only check `advance.ok` (a DB-error flag) and ignore
  `result.reason`. A `regression_blocked` or `order_not_found` outcome is reported
  as full success. For the refund full-path, if the RPC returns
  `regression_blocked` (C-2 scenario) the refund still returns
  `{ status: "refunded", kind: "full" }` while `payment_status` was never set —
  the caller cannot tell. Also the RPC returns raw `jsonb`; the
  `AdvanceOrderStatusResult` type is compile-time only, so `data` is unvalidated
  at runtime.
- **Impact**: Silent state divergence; compounds C-2.
- **Suggested Fix**: Callers must branch on `result.reason` and treat
  `regression_blocked`/`order_not_found` as failures (log + distinct outcome).
  Optionally validate the jsonb shape at the boundary.

### M-8: `payment_type_id === 'atm' → 'spei'` miscategorization; method mislabel drives wrong voucher UX
- **ID**: M-8
- **Severity**: MAJOR
- **File**: `src/lib/payments/config.ts:117-147`; consumed at `order-payment-read.ts:94-96`
- **Problem**: `PAYMENT_TYPE_TO_METHOD` maps `atm: "spei"`. MP's `atm` type is not
  SPEI. The persisted `payment_method` gates the voucher fetch (only `oxxo`/`spei`
  fetch a voucher), so a mislabel means either a real OXXO/SPEI pending payment
  never renders its voucher (AC-17) or a card payment triggers a spurious voucher
  fetch. The whole map is a heuristic over ambiguous MP fields (dev-flagged) and
  BLOCKED-ON-USER, but `atm` is wrong on its face.
- **Impact**: Wrong persisted method; wrong pending-voucher UX.
- **Suggested Fix**: Remove/correct the `atm` mapping; prefer `payment_method_id`
  (`oxxo`, `clabe`) as the primary signal. Flag the full map for live-sandbox
  verification. Add `atm`/ambiguous-case tests.

---

## Minor Issues (NICE TO FIX)

### m-1: `noop_same_status` branch discards `p_note` and writes no history for a payment_status change
- **File**: `supabase/migrations/0009_payments.sql:165-180`
- **Suggestion**: Persist a history/payment-history row (and the note) when
  `payment_status` materially changes even if `order_status` does not (supports the
  refund audit trail, AC-13).

### m-2: `matchOrder` runs two round-trips with a misplaced comment; largely redundant
- **File**: `src/lib/payments/process-payment.ts:154-189`
- **Problem**: The "Fallback: confirmation_token" comment (169-171) sits above the
  `if (data) return` block but describes the block below. Since
  `persistPreference` always sets `mp_external_reference = confirmation_token`, the
  two lookups are near-duplicates.
- **Suggestion**: Collapse to one `.or()` query (both columns indexed) or fix the
  comment.

### m-3: Voucher `verification_code` read via untyped index on a widened SDK type
- **File**: `src/lib/payments/order-payment-read.ts:114-145`
- **Suggestion**: Add a realistic MP OXXO/SPEI response fixture test once live
  paths are confirmed; keep defensive reads.

### m-4: `resolveOrigin` derives proto from a host substring — fragile for `::1`/`.local`
- **File**: `src/app/[locale]/checkout/pay-actions.ts:74-76`
- **Suggestion**: Trust `x-forwarded-proto` strictly; default https + rely on
  `NEXT_PUBLIC_SITE_URL` for local, or broaden the local-host check.

### m-5: `auto_return: "approved"` string inline in the preference body (AC-3 wants all tunables centralized)
- **File**: `src/lib/payments/preference.ts:174`
- **Suggestion**: Move to `config.ts`.

### m-6: `binary_mode: false` means card payments can land `in_process` (processing UX) — intentional, flag for human sign-off
- **File**: `src/lib/payments/config.ts:62-67`, `preference.ts:175`
- **Suggestion**: No code change; confirm UX in live test.

---

## NIT

- **N-1** `src/lib/env.ts:1-17`: docstring still says "single source of truth for
  Supabase credentials" — stale now that MP env lives here.
- **N-2** `src/app/[locale]/checkout/confirmacion/[token]/page.tsx:22-29`:
  docstring still describes the old "no payment yet" note; update for PaymentPanel.
- **N-3** `src/lib/payments/config.ts:50` `MP_STATEMENT_DESCRIPTOR = "POSTURPRO"`
  is a placeholder trade name — set the real legal name before launch (documented).
- **N-4** `process-payment.ts:78` comment "impossible — valid signature" is glib;
  a spoofed query `data.id` after a valid signature is exactly C-1 — reword.
- **N-5** `mp_payment_events.raw jsonb` (0009:48) is documented as an audit trail
  but is NEVER written (`claimPaymentEvent` omits it). Populate (PII-free) or drop.

---

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | getMercadoPagoEnv server-only, throws named error; public key not read | PASS | `env.ts:125-132` |
| AC-2 | No NEXT_PUBLIC_ MP secret; import "server-only"; exposure test | PASS | `mp-client.ts:10`; `secret-exposure.test.ts:43-73` |
| AC-3 | Non-secret tunables centralized + swap block | PARTIAL | good, but `auto_return` inline (m-5) |
| AC-4 | Preference: cents→decimal exact, external_reference=token, notification_url, back_urls | PASS | `preference.ts:151-179`, `money-boundary.ts`, `urls.ts` |
| AC-5 | Pay-now CTA for pending; replaces "no payment yet" | PASS | `page.tsx:93-99`, UnpaidCard |
| AC-6 | All four methods available | PASS | no excluded methods in preference body |
| AC-7 | POST route at /api/webhooks/mercadopago, first route.ts | PASS | `route.ts:38` |
| AC-8 | Verify x-signature before side effect; timingSafeEqual; lowercase id; 401 | **FAIL** | body-fallback id source (C-1); no ts staleness (M-4) |
| AC-9 | Authoritative Payment.get; map | PASS | `process-payment.ts:70` |
| AC-10 | Idempotent via unique; duplicate no-op 200 | PARTIAL | exact-dupe works; later status changes dropped (M-1) |
| AC-11 | Match by ext_ref/preference; unknown → 200 | PASS | `matchOrder`; `process-payment.ts:109-114` |
| AC-12 | Zero-tolerance reconciliation gates paid | PASS | `process-payment.ts:126-134` |
| AC-13 | advance_order_status ONLY status path; SECURITY DEFINER/empty search_path/service_role; history | PARTIAL | posture correct; refund/refunded skips history (C-2, m-1) |
| AC-14 | Status mapping complete + tested | PARTIAL | present + tested, but refunded→paid order status wrong (C-2) |
| AC-15 | RPC idempotent on repeat paid | PASS | noop_same_status (0009:168-180) |
| AC-16 | Card-decline retry, same order, no re-create | PASS | `preference.ts:64`, FailedCard retry |
| AC-17 | OXXO/SPEI pending voucher, defensive | PASS (UI) | `oxxo-spei-instructions.tsx`; method mislabel risk (M-8) |
| AC-18 | Later approved webhook advances to paid | **FAIL** | payment-id unique guard drops second webhook (M-1) |
| AC-19 | Refund full/partial; idempotency key; documented rule | PARTIAL | full ok; partial no audit + no cumulative guard (M-2, M-3) |
| AC-20 | Refuse non-paid; typed result; never echo raw error; server-only | PASS | `refund.ts:64-69`, typed result, server-only |
| AC-21 | Strings both locales; keys-used test | PASS (not re-run) | payment-labels + messages; QA to confirm |
| AC-22 | test/integration/e2e pass; MP mocked | NOT VERIFIED | dev claims 1107/144/8; Stage 7 owns |
| AC-23 | Strict TS, Clean Code, baseline; migration idempotent local-only | PARTIAL | migration idempotent; M-7 compile-time-only cast |

## Edge Case Verification

| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Webhook replay (same id twice) | HANDLED | unique guard → duplicate 200 |
| 2 | Out-of-order (approved then stale pending) | HANDLED | order_status_rank guard (0009:156-163) |
| 3 | Unknown/unmatched payment → 200, no mutation | HANDLED | `process-payment.ts:109-114` |
| 4 | Card decline then retry | HANDLED | rejected→failed, retry re-creates preference |
| 5 | OXXO/SPEI voucher expiry | PARTIAL | cancelled/expired maps, but pending→approved broken (M-1) |
| 6 | Webhook-before-redirect race | HANDLED | truth-from-DB; hint never trusted (panel-state.ts) |
| 7 | Amount mismatch | HANDLED | zero-tolerance, not paid, logged |
| 8 | Refund a pending payment | HANDLED | not-refundable/not-paid before MP call |
| 9 | Partial then over-refund (cumulative) | **MISSING** | only single-refund bound checked (M-2) |
| 10 | Refund MP failure → state unchanged, not echoed | HANDLED | `refund.ts:126-136` |
| 11 | Missing/placeholder creds | HANDLED | MissingEnvVarError → unavailable; webhook 401 |
| 12 | Malformed / non-payment body | HANDLED | parseBody tolerant; non-payment → 200 |
| — | Crash between claim and advance | **MISSING** | permanent stuck-order (M-6) |
| — | Replay-window / ts staleness | **MISSING** | no ts freshness (M-4) |
| — | Unbounded body DoS | **MISSING** | uncapped request.text() (M-5) |

## Quality Score: 6.5/10

High-craft implementation with an excellent trust-boundary skeleton and money
boundary, but adversarial review found 2 CRITICAL correctness bugs (signature id
source, refund order-state) and a MAJOR that breaks the headline OXXO/SPEI
pending→approved flow (M-1), plus real hardening gaps (replay window, body cap,
claim/advance atomicity). These are exactly the classes of defect the human gate
exists to catch, and they must be fixed before this is merge-eligible.

## Recommendation: REQUEST CHANGES

Do NOT advance to merge. Stage 6 (ultrafix) must resolve **C-1, C-2, and M-1 at
minimum** (they break correctness against the real gateway and the OXXO/SPEI
requirement), then M-2/M-3/M-4/M-5/M-6/M-7/M-8. After fixes, re-run the full test
suite (AC-22) and add tests exercising the multi-webhook lifecycle and the
query-vs-body signature id. **Regardless of any subsequent SHIP verdict, the
standing HUMAN-REVIEW GATE remains OPEN — this payment code requires human
sign-off before merge.**
