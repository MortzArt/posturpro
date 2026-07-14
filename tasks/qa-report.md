# QA Report: T9 — Transactional emails (Standard S5 — Quality Gate)

Standard pipeline S5 (QA) is the terminal quality gate (no verify stage). Verdict at bottom.

## Test Suite Summary

| Type | Scope | Added this stage | Passed | Failed | Skipped |
|------|--------|--------|--------|--------|---------|
| Unit | 68 files | +13 cases (3 files modified) | 1281 | 0 | 0 |
| Integration | 13 files | +13 cases (email.integration) | 180 | 0 | 0 |
| E2E (T8 regression gate) | 3 suites | 0 (regression only) | cart 46/46; checkout+payment: see note | — | — |
| **Total (unit+int)** | — | **+26** | **1461** | **0** | **0** |

Baselines (post-S4): unit 1271/1271 (68 files), integration 168/168 (13 files), tsc 0, eslint clean.
After S5: **unit 1281/1281**, **integration 180/180**, tsc 0, eslint clean. (vitest counts `it.each`
expansions, so reported case-count deltas differ from the raw +N per description.)

## Tests Written (this stage)

### Unit — `src/lib/email/dispatch.test.ts` (6 → 15)
- **bounded-send TIMEOUT branch (edge 2)**: fake-timers prove a hung provider resolves via the
  `send timeout` branch (NOT a throw); the ledger row is left un-finalized. Closes the S4-noted gap
  (Promise.race timeout vs throw was untested).
- **provider THROW vs `{ok:false}` reject**: both isolated, distinct reason strings, neither finalizes.
- **claim RPC error path**: `claim === "error"` → `{ok:false, reason:"claim failed"}`, never a send.
- **locale end-to-end (edge 3, AC-12)**: an `en` order's customer email builds the `/en/…` URL; the
  owner alert for the SAME order stays prefix-free (es-MX); an `es-MX` order stays prefix-free.

### Unit — `src/lib/email/templates/templates.test.ts` (escaping sweep, AC-11/injection)
- Hostile **variant label** escaped in `order_confirmation` (HTML escaped, plain-text tag-free).
- Hostile **cancel reason** escaped in `cancelled`.
- Hostile **voucher reference + verification code** escaped in `voucher_instructions`.
  (customerName, productName, contact message were already covered; these close the remaining
  user/provider-supplied fields that reach live-template HTML — QA focus #5.)

### Unit — `src/lib/payments/process-payment.test.ts` (AC-13)
- Email dispatch **resolving `{ok:false}` (timeout/reject, not a throw)** still yields webhook
  `processed`+200 with the payment claim finalized — discriminates resolve-failure from the
  already-covered throw path.

### Integration — `tests/integration/email.integration.test.ts` (10 → 22)
- **transition_kind matrix (TD-2, AC-2)** against the live RPC: `paid`, `payment_pending` (real
  payment change), `payment_failed`, `preparing`, `shipped`, `delivered`, `cancelled`,
  `payment_authorized` (payment-only), `refunded` (payment-only from==to row).
- **Regression contract unchanged from T8**: backward move → `regression_blocked` + kind `noop`;
  nonexistent order → `order_not_found` + kind `noop`.
- **Concurrent claim race (edge 1, AC-5, QA focus #6)**: 8 concurrent `claim_email_send` for the same
  triple → exactly one `'new'`, seven `'duplicate'`, exactly one physical row.

## Acceptance Criteria Coverage (20/20 PASS)

| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| AC-1 | 0010 idempotent, applies on `db reset`, local-only | run-integration.sh resets 0001..0010 clean each run | PASS |
| AC-2 | `advance_order_status` returns `transition_kind` from fixed set, derived in-RPC | email.integration transition_kind matrix (10 kinds) | PASS |
| AC-3 | history `transition_kind` written on every insert | email.integration paid→history | PASS |
| AC-4 | `orders.locale` NOT NULL default es-MX + CHECK; persisted | email.integration persist + CHECK-reject; checkout builders supply locale | PASS |
| AC-5 | `email_sends` unique+RLS+grant+claim RPC (race-safe) | email.integration ledger + **concurrent-claim race**; anon RLS-deny | PASS |
| AC-6 | provider one module, `sendEmail`, env key, server-only | provider.test; `import "server-only"` | PASS |
| AC-7 | `getEmailEnv()` validates 3 vars, throws | provider.test partial-config | PASS |
| AC-8 | dev-preview no network, returns success | provider.test; verified LIVE (dev run logged `[email] PREVIEW`) | PASS |
| AC-9 | provider mocked; missing key swallowed | all tests mock provider; provider.test + process-payment isolation | PASS |
| AC-10 | 8 templates `{subject,html,text}` typed | templates.test (all 8) | PASS |
| AC-11 | 6 customer templates both locales; MXN; single-brace; injection-safe | templates.test both-locale + **escaping sweep**; keys-used symmetry green | PASS |
| AC-12 | owner+relay single-locale es-MX | templates.test + **dispatch locale test** (owner es-MX for an `en` order) | PASS |
| AC-13 | dispatch failure-isolated + non-blocking | dispatch throw/reject/**timeout**; process-payment isolation (throw + **resolve `{ok:false}`**) → 200 | PASS |
| AC-14 | checkout → confirmation + owner, non-blocking | actions.ts triggerOrderEmails; **verified LIVE** — dev order fired `order_confirmation` preview | PASS |
| AC-15 | paid → payment_received once (dedupe mp_payment_id) | process-payment 'paid'; dispatch dedupe; email.integration distinct-kind | PASS |
| AC-16 | pending voucher once; skip if no data | process-payment OXXO + skip-no-reference; voucher-data null path | PASS |
| AC-17 | shipped/cancelled/refund/contact seams built+tested, not wired | templates.test + dispatch seams; `// T12/T13 wiring seam` | PASS |
| AC-18 | webhook route email-free; trigger post-advance | route.ts zero email imports; trigger in process-payment after advance+finalize | PASS |
| AC-19 | hacker-report.md untouched | not modified | PASS |
| AC-20 | T7/T8 unchecked in BUILD_PLAN | not modified | PASS |

## Edge Case Coverage (7/7 PASS)

| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Duplicate/redelivered webhook → one email | email.integration claim once/dup + **concurrent-claim race**; dispatch duplicate short-circuit | PASS |
| 2 | Provider down/times out → 200, un-finalized | **dispatch TIMEOUT test** (distinct from throw) + process-payment **resolve-`{ok:false}`**; at-most-once confirmed S4 | PASS |
| 3 | Order in `/en/` → en emails, owner es-MX | **dispatch locale end-to-end** (en customer URL, prefix-free owner); email.integration en persist | PASS |
| 4 | OXXO paid days later → both emails once | email.integration distinct email_kind → distinct rows | PASS |
| 5 | charged_back/mismatch → no customer email | process-payment refund/mismatch/flagged (kind ≠ 'paid') | PASS |
| 6 | Undeliverable valid email | dispatch provider-failure isolation; logs never contain the address | PASS |
| 7 | Locale mutation attempt after creation | email.integration stable across a full transition sequence | PASS |

## Regression-Lock: S4 M-1 (unescaped email button `href`)

| Lock | Test | Status |
|------|------|--------|
| `renderButton` attribute-escapes href so `"` cannot break out | `layout.test.ts` — payload `https://x/"><img src=y onerror=alert(1)>` asserts `"><img` never verbatim + `&quot;&gt;&lt;img` present | PASS (locked) |
| Well-formed provider URL unchanged except HTML-significant `&` | layout.test "leaves a normal URL unchanged" | PASS |
| Live callers (MP voucherUrl, carrier trackingUrl) still render | voucher-instructions + shipped template tests pass | PASS |

The M-1 fix is covered by a dedicated adversarial test that fails if `escapeHtml(href)` is removed.

## Suite Results (authoritative, re-run this stage)

- `npx vitest run` → **68 files, 1281 passed, 0 failed**.
- `scripts/run-integration.sh` (fresh reset → seed → run, applies 0001..0010) → **13 files, 180 passed, 0 failed**.
- `tsc --noEmit` → **0 errors**; `eslint` on all 4 changed files → **clean**.
- E2E (T8 regression gate, prod build + NEXT_QA_DIST_DIR + CHECKOUT_RATE_LIMIT_DISABLED=1):
  **cart 46/46 PASS** on the production build; checkout/payment order-placing suites BLOCKED
  (environmental, not T9) — see below.

## E2E order-placing suites — investigation (checkout + payment)

The order-placing specs assert a client redirect to `/checkout/confirmacion/{token}` after the
`placeOrder` Server Action. On the **production build** (tested with BOTH `NEXT_QA_DIST_DIR=.next-qa`
and the default `.next`) these fail: the browser stays on `/checkout`, no order is created, no email
fires. This is **NOT a T9 regression**:

- **Proven correct on the dev server (identical T9 code):** `checkout.spec.ts` → **24/24 PASS**. Dev
  logs show `POST /checkout 200 → placeOrder → [email] PREVIEW (order_confirmation) → GET
  /checkout/confirmacion/…` — T9's AC-14 confirmation email fires end-to-end, live.
- **Root cause is a prod-build / harness Server-Action issue, orthogonal to T9.** A network probe
  showed the action POST returning 200 while the client navigation to the confirmation page is
  `ERR_ABORTED`; dev logs show many `placeOrder(..., {})` calls receiving **empty FormData** (a
  React 19 / Next 16.2.9 uncontrolled-form submission race). It equally affects T7's checkout core
  (previously shipped) and reproduces with the default dist dir — not introduced by T9, not caused by
  `NEXT_QA_DIST_DIR`.
- **Payment suite** (also placeOrder-then-redirect) fails the same way even serially/1-worker; the
  dev run again shows T9 email previews firing on orders that DO submit — the trigger wiring is fine.

Net: every T9-owned behavior on the checkout path is verified (unit + integration + the live dev-run
email preview). The unverifiable-on-prod-build item is the pre-existing client redirect after a
Server Action — a T7-surface/harness concern, not a T9 acceptance criterion.

## Bugs Found & Fixed

- **None in T9 code.** QA is test-only; no production code changed this stage. One of my new
  integration cases initially encoded a wrong premise (advancing to the identical
  `(pending_payment, pending)` state expecting `payment_pending`) — corrected to force a real
  payment_status change, which in turn *validates* the documented `noop`-on-no-material-change
  behavior (a redelivery must not re-trigger a customer email). Test fix, not a code bug.

## Untested Areas

- **Live email send** — BLOCKED-ON-USER (no `EMAIL_*` creds; no verified Resend domain). Provider
  mocked everywhere; dev preview verified live. Risk: LOW.
- **Order-placing e2e on the production build** — BLOCKED by an environmental prod-build Server-Action
  redirect issue (above). Same flows pass on dev with T9 code, T9 email trigger confirmed firing.
  Risk to T9: LOW. Broader release risk: MEDIUM and T7-scoped.

## Confidence: HIGH (for T9)

All 20 ACs and all 7 edge cases have passing tests; the S4 M-1 finding is regression-locked with an
adversarial payload; every item the QA focus flagged as possibly-missed — transition_kind matrix,
concurrent ledger race, timeout-vs-throw discrimination, locale end-to-end, injection sweep — is now
covered and green. Unit 1281/1281, integration 180/180, tsc 0, eslint clean, migrations 0001..0010
apply clean. The one unverifiable surface (prod order-placing e2e) is a pre-existing, non-T9,
T7/harness issue, and the identical flow is proven on dev including live T9 email dispatch.

**Standard-tier quality gate: PASS for T9.** No /full-cycle re-run required for T9 correctness. Flag
for the orchestrator: the prod-build e2e Server-Action reliability is an environment/T7 concern worth
a separate ticket, independent of T9.
