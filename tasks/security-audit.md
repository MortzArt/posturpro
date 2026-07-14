# Security Audit: T8 — Mercado Pago Integration

> ⚠️ **HUMAN-REVIEW GATE (BUILD_PLAN rule 3) REMAINS OPEN.** This is payment code.
> This audit is ADVISORY. A SECURE verdict does NOT authorize merge. A human MUST
> review signature verification (`webhook.ts` + `route.ts`), amount reconciliation
> (`process-payment.ts`), refund execution (`refund.ts`), the RPCs
> (`0009_payments.sql`), and secret handling (`env.ts`, `mp-client.ts`) before merge.
>
> ⚠️ **LIVE-SANDBOX VERIFICATION IS BLOCKED-ON-USER.** No working MP credentials
> exist; `.env.local` holds placeholders; every test mocks the MP API. A real
> sandbox round-trip cannot run in this pipeline (see "Blocked-on-user").

## Summary

- Files audited: 33 T8 changed files (webhook route + core, refund, preference,
  pay-action, RPCs, env/secrets, client boundary, deps).
- Vulnerabilities found: 3 (Critical: 0, High: 1, Medium: 1, Low: 1)
- Vulnerabilities fixed: 1 High (SEC-H-1). Medium/Low documented as accepted risk.
- **Secrets found: 0** (MUST be zero for SHIP — confirmed).
- Suites after fix: unit **1192 passed** (60 files); tsc 0 errors; eslint clean;
  `next build` clean (webhook route emitted `ƒ /api/webhooks/mercadopago`);
  tsconfig clean; no stray artifacts.

## Vulnerability Findings

### HIGH

#### SEC-H-1: Unauthenticated payment-preference action had no rate limit
- **Type**: OWASP A04:2021 Insecure Design / A10 (resource-exhaustion amplification)
- **File**: `src/app/[locale]/checkout/pay-actions.ts` (`createPaymentPreference`)
- **Description**: `createPaymentPreference(token, locale)` is an unauthenticated
  `"use server"` action. Each invocation does two DB reads and one **live MP
  `Preference.create`** REST call. The sibling revenue path (`placeOrder`) was
  deemed to need a per-IP limiter for exactly this abuse class (T7 Security), but
  the pay action shipped without one.
- **Exploit**: An attacker who holds a single valid `confirmation_token` (trivially
  their own order) loops the action. Every call hits Mercado Pago's rate-quota'd,
  billable API and the DB with no ceiling — amplification against a paid third
  party and a self-inflicted DoS/quota-exhaustion (MP throttles the merchant, which
  breaks checkout for real shoppers).
- **Impact**: MP API quota exhaustion → legitimate preference creation fails for
  all shoppers; elevated DB load. No amount tampering / no order creation (that
  surface was already safe — see below), so scoped to availability/cost, not
  integrity — hence High, not Critical.
- **Fix (FIXED)**: Added a per-IP sliding-window limiter (`10/min/IP`,
  `PREFERENCE_MAX_PER_WINDOW`) checked **before any DB read or MP call**. Returns a
  new typed `{ status: "rate-limited" }` the `<PaymentPanel>` renders as the retry
  banner. Reuses the same E2E escape-hatch env var (`CHECKOUT_RATE_LIMIT_DISABLED`,
  server-only, never `NEXT_PUBLIC_`) already wired in `playwright.config.ts`, so
  the payment e2e run is unaffected. To avoid copy-paste, the sliding-window
  mechanics were extracted into a shared, unit-tested
  `src/lib/rate-limit/sliding-window.ts` (the T7 checkout limiter now delegates to
  it — public API unchanged, all its tests still green), and the duplicated
  `clientIp` trust-model resolver into `src/lib/request/client-ip.ts`.
  - New: `preference-rate-limit.ts` + `preference-rate-limit.test.ts` (7 tests:
    limit/window/per-IP isolation/shared-unknown-bucket/escape-hatch/cardinality cap).
- **Status**: FIXED.

### MEDIUM

#### SEC-M-1: `clientIp` trust model duplicated across three action files
- **Type**: Maintainability / defense-consistency (not directly exploitable)
- **File**: `producto/[slug]/actions.ts`, `checkout/actions.ts` (pre-existing copies)
- **Description**: The IP-resolution trust model (prefer `x-vercel-forwarded-for`,
  then rightmost XFF hop, then `x-real-ip`) is duplicated. If one copy drifts (e.g.
  someone "fixes" it to `split(",")[0]`), that limiter silently becomes bypassable
  per-request. SEC-H-1's fix created a canonical `src/lib/request/client-ip.ts` and
  routes the NEW pay action through it.
- **Decision (ACCEPTED / partially fixed)**: The pay action uses the shared helper.
  The two pre-existing T7 copies were **left untouched** on purpose — refactoring
  shipped, well-tested revenue-path actions during a security-only stage risks a
  regression for no security gain (the copies are byte-identical and correct today).
  Tracked for a follow-up dedup. Rationale: minimize blast radius of a security pass.

### LOW

#### SEC-L-1: Attacker-influenced payment id logged as plaintext (log-injection surface)
- **Type**: OWASP A09 (logging) — CRLF/log-forging into plaintext server logs
- **File**: `process-payment.ts:89,92` (`trimmed` = the fetch `data.id`)
- **Description**: The pre-fetch payment id (from the query string / body) is
  interpolated into `console.warn/error` before MP confirms it resolves. An
  attacker who passes the signature check (needs the secret) could embed newlines
  to forge extra log lines. Everything else logged is an internal enum, a `Number`,
  or an MP-authoritative field.
- **Decision (ACCEPTED)**: Low severity — reaching this code requires a valid HMAC
  signature (secret unknown to an attacker; fail-closed proven below), the sink is
  plaintext server stdout (not HTML, not a query-able structured store), and the
  raw body / `x-signature` are **never** logged (verified). No fix; documented. A
  hardening nice-to-have (strip control chars before logging ids) is deferred.

## Blast-Radius Analysis (Forgery Economics)

**Secret UNKNOWN (the real-world attacker):** NOTHING advances an order.
- The webhook verifies the HMAC **before any DB read or state change**
  (`route.ts` step 3, before step 5). Order of operations: body-cap → `data.id`
  extract → **signature verify (401 on fail)** → type gate → process.
- No unsigned path, no debug bypass, no "skip if header absent" branch. A missing
  `x-signature` → `malformed_signature_header` → 401. A wrong secret → HMAC
  mismatch → 401. A stale `ts` (>5 min, checked AFTER HMAC) → 401.
- **Fail-CLOSED confirmed** when `MERCADOPAGO_WEBHOOK_SECRET` is unset/empty:
  `route.ts` `readWebhookSecret()` returns `null` on `MissingEnvVarError` →
  immediate 401 (never processes blind); AND `verifyWebhookSignature` independently
  returns `{ ok:false, reason:"missing_secret" }` for a blank secret. Two
  independent fail-closed gates. `requireEnv` treats whitespace-only as blank.

**Secret LEAKED (hypothetical worst case):** an attacker can post a valid signed
webhook. Blast radius is **bounded** by authoritative re-fetch + amount reconciliation:
- The body status is never trusted (AC-9): `process-payment` calls `Payment.get`
  and reads the **authoritative** MP status/amount. So they cannot declare "paid" —
  MP must actually report the payment approved.
- To mark an order paid, they need a real MP payment whose `external_reference`
  matches an order's `confirmation_token` AND whose `transaction_amount` equals the
  order total to the cent (`AMOUNT_RECONCILIATION_TOLERANCE_CENTS = 0`). A mismatch
  → `amount-mismatch`, NOT paid, logged (edge 7).
- Replay is bounded by the `(mp_payment_id, mp_status)` dedupe spine and the 5-min
  `ts` window. Regression (paid→pending) is refused by `advance_order_status`.
- Net: a leaked webhook secret does **not** let an attacker mark an arbitrary
  unpaid order paid without an actual matching, correctly-priced MP payment. The
  worst realistic abuse is replaying/forwarding legitimately-signed notifications,
  which the dedupe + amount + regression guards absorb.

**Can an attacker force infinite MP retries or suppress legitimate ones?**
- 200 is returned for processed/duplicate/unknown/mismatch/flag → MP stops
  retrying (correct, AC-11). 500 only for genuine transient failure (MP env
  missing, MP down, DB error, `advance-blocked`) → MP retries → converges. An
  attacker cannot force a 500 loop without controlling MP/DB availability, and
  cannot suppress a real retry (the 500 paths are keyed to genuine internal errors,
  not attacker input).

## SSRF Review

- The MP client base URL is fixed by the SDK (no attacker-controlled host reaches
  it). `Payment.get({ id })` / `PaymentRefund.create({ payment_id })` take an **id**,
  not a URL — no attacker-controlled URL is ever fetched server-side.
- `notification_url` / `back_urls` are built from the **request origin**
  (`x-forwarded-host`/`host`, or `NEXT_PUBLIC_SITE_URL`) and sent TO MP, not
  fetched by us. A forged `x-forwarded-host` only mis-points MP's callbacks at a
  host the attacker chose — it does not cause a server-side fetch. Residual: a
  spoofed host could send MP's back-redirect elsewhere, but the webhook (truth
  source) is unaffected and the DB remains authoritative. Accepted (matches T7's
  documented XFF trust model; behind Vercel the header is trustworthy).

## Refund Path Review

- **Not client-reachable.** `refundOrderPayment` is `import "server-only"`, exported
  but called by **nothing** in the codebase (grep-confirmed) — reserved for T12's
  admin action behind auth. Correct posture.
- **Over-refund guard is race-safe in SQL.** `record_refund` locks the order row
  (`for update`), sums the `payment_refunds` ledger, and refuses if cumulative >
  total — a friendly app pre-check plus the locked SQL authority plus MP as a third
  backstop. A concurrent refund that races past the pre-check is caught under the
  lock; if MP already moved the money, it is logged loudly for hand reconciliation,
  never silently swallowed.
- **Idempotent.** Per-refund `X-Idempotency-Key` (`refund:<order>:<full|cents>`);
  ledger keyed unique on `mp_refund_id` (retry = no-op `duplicate`).
- **No internal leak.** Raw MP errors are logged, never echoed — the caller sees a
  typed `mp-error`/`error` (AC-20).

## RPC Hygiene (0009_payments.sql)

- All 6 functions (`advance_order_status`, `record_payment_event`,
  `finalize_payment_event`, `record_refund`, `refunded_total`, `order_status_rank`)
  are `SECURITY DEFINER` with **`set search_path = ''`** (fully-qualified
  `public.*` refs) — no search-path hijack.
- **Least privilege enforced:** `revoke all ... from public` then
  `grant execute ... to service_role` for every function. anon/authenticated
  **cannot** call them. (Note: `order_status_rank` is revoked from public but not
  re-granted to service_role — harmless, it is called internally by
  `advance_order_status` which runs as definer; documented, not a gap.)
- **RLS posture:** `mp_payment_events` and `payment_refunds` have RLS enabled with
  **no policies** → anon/authenticated fully denied; only `service_role` (RLS-bypass)
  reads/writes. Both get an explicit `grant all ... to service_role` (0005's
  point-in-time blanket grant does not cover later-created tables — correct).
- **Transition matrix enforced in-DB:** regression guard (`order_status_rank`)
  refuses moving an order backwards even if the app layer erred (belt-and-suspenders
  behind `payments-status.ts`). Amount-tamper on `total_cents` is blocked by the
  0003 immutability trigger as defense-in-depth.

## Secrets & Client/Server Boundary

- **Zero secrets in git:** no `.env*` tracked (`git ls-files` clean), none in
  history, `.env*` gitignored (two entries). `.env.local` MP values are placeholders
  (`TEST-000…`, `whsec_placeholder_replace_me`) — not real credentials.
- **No `NEXT_PUBLIC_` secret:** grep for `NEXT_PUBLIC_*(SECRET|TOKEN|KEY)` (minus
  the safe publishable key / site URL) → none. The MP public key is intentionally
  NOT read (redirect surface needs only the server token).
- **`server-only` enclosure:** `mp-client.ts` (the only reader of the access token),
  `preference.ts`, `refund.ts`, `process-payment.ts`, `order-payment-read.ts`,
  `advance-order.ts` all `import "server-only"` → importing them from a client
  component is a build error. The `secret-exposure.test.ts` static assertion proves
  (a) the guard is present, (b) no MP secret is `NEXT_PUBLIC_`, (c) no `"use client"`
  file imports a server-only MP module. The clean `next build` is the runtime
  backstop (a boundary violation fails the build).
  - Note on the static test's airtightness: it scans **source**, not the built
    bundle. The authoritative guarantee is the combination of `import "server-only"`
    (build-time enforcement) + a clean `next build` — verified this stage. The
    source scan is a fast additional tripwire, not the sole guarantee. Documented.

## PII

- **No card data (PAN) is ever stored or logged** — the redirect (Checkout Pro)
  surface never touches card numbers; MP hosts the card form. We persist only
  references/status: `mp_payment_id`, `mp_preference_id`, `mp_external_reference`,
  `payment_status`, `payment_method`, and a PII-free `mp_payment_events` audit
  (status/detail/action/amount, no `raw` blob) + `payment_refunds` ledger.
- **Confirmation-page exposure via token:** the page renders the buyer's own
  shipping name/address/email/phone — expected for a buyer viewing their own order,
  gated behind the unguessable `confirmation_token` (UUIDv4, `UUID_PATTERN`
  validated; RLS-denied to anon; read via the admin client server-side). Not an
  IDOR — the enumerable order number is never an entry point (`notFound()` on a bad
  token). Same model as T7.
- **Logs:** raw body and `x-signature` never logged (verified). See SEC-L-1 for the
  one low-severity attacker-influenced id logged as plaintext.

## Dependencies

- `mercadopago@3.2.0` (official SDK, bundled TS types). No known CVE found for this
  version (web search + `npm audit` clean for it). HMAC uses Node built-in `crypto`
  (no extra dep). Not typosquatted (official package).
- `npm audit`: **2 moderate**, both **pre-existing and dev-only** (`postcss <8.5.10`
  XSS-in-stringify, transitively via `next`'s build toolchain — not a runtime/prod
  dependency path). No new vulnerable dependency introduced by T8. Not fixing here
  (the only `audit fix --force` path downgrades `next` to 9.3.3 — a breaking change,
  out of scope for a payment security stage; accepted, tracked).

## Checklist Results

| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 in git/history; `.env*` gitignored; values are placeholders. |
| Env var exposure | ✅ | No `NEXT_PUBLIC_` secret; MP public key intentionally unread. |
| Injection | ✅ | Parameterized Supabase queries; SDK takes ids not URLs; no `dangerouslySetInnerHTML`; log-injection is Low (SEC-L-1). |
| Auth/AuthZ | ✅ | Webhook = HMAC-before-side-effect, fail-closed; refund server-only/unreached; RPCs service_role-only; token-gated reads. |
| Client/server boundary | ✅ | `server-only` guards + clean build; secret-exposure static test. |
| Data Exposure | ✅ | No PAN stored; typed errors, no raw MP/stack echo; token-gated PII. |
| CORS/CSRF | ✅ | Server actions have built-in CSRF protection; webhook is intentionally public (HMAC-authed); no custom CORS `*`+credentials. |
| Dependencies | ✅ | `mercadopago@3.2.0` no CVE; 2 moderate pre-existing dev-only (postcss via next). |

## Fix Verification Evidence

- `npx tsc --noEmit` → 0 errors.
- `npx eslint` on all changed files → clean (exit 0).
- `npx vitest run` → **1192 passed** (60 files); includes 7 new
  `preference-rate-limit.test.ts` and the unchanged checkout `rate-limit.test.ts`
  (proving the shared-limiter refactor preserved behavior).
- `npm run build` → clean; `ƒ /api/webhooks/mercadopago` emitted; no client-bundle
  leak (build would fail on a `server-only` boundary violation).
- `tsconfig.json` clean; no build artifacts staged.

## Files Changed This Stage (SEC-H-1 fix)

- `src/lib/rate-limit/sliding-window.ts` (new) — shared limiter core.
- `src/lib/request/client-ip.ts` (new) — canonical IP trust-model resolver.
- `src/lib/payments/preference-rate-limit.ts` (new) — preference limiter.
- `src/lib/payments/preference-rate-limit.test.ts` (new) — 7 tests.
- `src/lib/config.ts` — `PREFERENCE_*` constants.
- `src/lib/checkout/rate-limit.ts` — delegate to shared core (API unchanged).
- `src/app/[locale]/checkout/pay-actions.ts` — throttle before side effects; new
  `rate-limited` result.
- `src/components/checkout/payment-panel.tsx` — handle `rate-limited` (retry banner).

## Blocked-on-user / Standing Gates

- **HUMAN-REVIEW GATE OPEN** — payment code requires human sign-off before merge.
- **Live MP sandbox round-trip** — no credentials; all tests mock MP. Run the
  dev-done "How to Test" checklist against a real sandbox before launch.
- **Voucher field paths** (`transaction_details.*` vs `point_of_interaction.*`) —
  read defensively; confirm against a real sandbox OXXO/SPEI response.
- **Confirm the webhook secret differs (or not) between test/prod** in the dashboard.

## Verdict: SECURE (advisory — HUMAN-REVIEW GATE still required before merge)
