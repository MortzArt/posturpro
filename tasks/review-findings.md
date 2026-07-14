# Code Review + Fix: T9 — Transactional emails (commit bdd37bc)

## Summary

T9 is a high-quality implementation. The money-adjacent write paths (checkout action,
process-payment) keep email dispatch airtight-isolated; migration 0010 preserves every T8
`advance_order_status` behavior and only adds `transition_kind`; the `email_sends` ledger is
race-safe; user input is HTML-escaped in templates. One MAJOR defense-in-depth gap was found
(unescaped `href` in the email button) and FIXED inline with a regression test. Everything else
is minor/nit. All acceptance criteria met.

## Issues Found & Resolved

### Critical Issues

None.

### Major Issues

#### M-1: `renderButton` injected `href` unescaped into the anchor attribute

- **Severity**: MAJOR
- **File**: src/lib/email/layout.ts:132 (was `<a href="${href}" ...>`)
- **Problem**: `renderButton(href, label)` interpolated `href` into `<a href="${href}">`
  WITHOUT escaping. Two callers pass PROVIDER-sourced URLs, not app-built ones:
  `voucher-instructions.ts:98` passes `voucher.voucherUrl` (from the Mercado Pago payment
  response) and `shipped.ts:36` passes `input.trackingUrl` (carrier URL, T12). A URL containing
  a double-quote would close the `href` attribute and inject arbitrary markup into the email body
  (attribute-breakout → stored HTML injection in the recipient's inbox). The label was already
  escaped; the href was the gap.
- **Impact**: A malformed/hostile provider URL (or a future admin-supplied tracking URL) could
  break out of the attribute and inject markup into a customer email. Email clients don't execute
  `javascript:`, but markup injection (a fake link/image) is still a phishing/defacement vector.
- **Fix Applied**: Wrapped the href in `escapeHtml(href)` so `"` becomes `&quot;`, closing the
  attribute-breakout. `escapeHtml` is a no-op for well-formed URLs (verified: existing template
  tests using `https://mp.test/v.pdf` and `https://track.test/TRK-1` still pass). Added
  `src/lib/email/layout.test.ts` (3 tests) including an explicit breakout payload
  (`https://x/"><img src=y onerror=alert(1)>`) asserting the raw `"><img` sequence never appears.
- **Status**: FIXED

### Minor Issues

#### m-1: `config.ts` comment names `SITE_ORIGIN`, code reads `NEXT_PUBLIC_SITE_ORIGIN`

- **File**: src/lib/config.ts (email config block, "HOW TO SWAP REAL VALUES")
- **Suggestion**: The prose comment says links are built from `SITE_ORIGIN`; `siteOrigin()` reads
  `NEXT_PUBLIC_SITE_ORIGIN`. Cosmetic only — code is correct and consistent with dev-done/env docs.
- **Status**: SKIPPED — comment cosmetics, zero behavior/security impact.

#### m-2: `renderParagraph(text, escape=false)` escape-bypass has no live caller

- **File**: src/lib/email/layout.ts:146 (`renderParagraph(text, escape = true)`)
- **Suggestion**: The `escape=false` branch exists but no caller uses it (verified by grep). Latent
  foot-gun; left as-is because it's currently unreachable with unsafe input and the default is safe.
- **Status**: SKIPPED — no live unsafe caller; default path is safe.

### Nits

#### n-1: `scripts/run-integration.sh` header says "applies 0001..0005" (stale)

- **File**: scripts/run-integration.sh (header)
- **Note**: `supabase db reset` applies ALL migrations regardless; behavior correct. Not a T9 file.
- **Status**: SKIPPED — out-of-scope, comment-only.

## Crash-Between-Claim-and-Send Verdict

**Deliberate at-most-once — documented and justified. ACCEPTED (not a bug).**

`claim_email_send` does `insert … on conflict do nothing` and returns `'new'` only when a row was
actually inserted (PL/pgSQL `FOUND` after `INSERT … ON CONFLICT DO NOTHING` is true only on a real
insert — race-safe: concurrent duplicate webhooks → exactly one `'new'`). The claimed row lands
`sent_at = NULL`; `finalize_email_send` stamps it only after the provider accepts.

If the process crashes AFTER claim but BEFORE send/finalize, the row persists with `sent_at = NULL`,
and a later redelivery's `claim_email_send` hits the unique conflict → `'duplicate'` → the email is
permanently suppressed. This is **at-most-once**, and DIFFERS from the T8 payment spine (which
reclaims unfinalized claims for at-least-once payment processing). The divergence is intentional and
documented in three places: migration 0010 comments (316–320), dev-done.md "Key decisions", and
ticket edge 2 (which asked the dev to confirm the choice). Rationale is sound: an email is not
money; a lost email is far less harmful than a lost/duplicate payment, and the un-finalized ledger
row is the substrate for a FUTURE manual/queue retry without double-sending. No fix required.

Timeout-leak check: `sendWithTimeout` uses `Promise.race([sendEmail, timeout])` and clears the timer
in `finally`. The race loser is not cancelled, but `Promise.race` attaches internal handlers to BOTH
promises, so a late `sendEmail` rejection is NOT an unhandled rejection. No leak.

## Acceptance Criteria Verification

| #     | Criterion | Status | Evidence |
| ----- | --------- | ------ | -------- |
| AC-1  | 0010 idempotent, applies on `db reset`, local-only | PASS | reset applied 0001..0010 clean; `if not exists` / `create or replace` throughout |
| AC-2  | `advance_order_status` returns `transition_kind` from fixed set, derived in-RPC | PASS | 0010:82-126 helper; returned in all 5 jsonb paths; types updated |
| AC-3  | history `transition_kind` written on every insert | PASS | all `insert into order_status_history` include it (189,228,255,529) |
| AC-4  | `orders.locale` NOT NULL default es-MX + CHECK; create_order + payload persist | PASS | 0010:45-52; clamp 405-409; `CreateOrderPayload.locale` required; actions.ts `getLocale()` |
| AC-5  | `email_sends` unique+RLS+grant+claim RPC | PASS | 0010:287-346 |
| AC-6  | provider one module, `sendEmail`, env key, server-only | PASS | provider.ts single `deliver()`, `getEmailEnv()`, `import "server-only"` |
| AC-7  | `getEmailEnv()` validates 3 vars, throws | PASS | env.ts:172-180 |
| AC-8  | dev-preview no network, returns success | PASS | provider.ts `isPreviewMode` → `logPreview` → `{ok,preview}` |
| AC-9  | provider mocked; missing key swallowed | PASS | provider.test + process-payment isolation test |
| AC-10 | 8 templates `{subject,html,text}` typed | PASS | all 8 present |
| AC-11 | 6 customer templates both locales; MXN; single-brace | PASS | keys symmetric 50/50; money.ts; no `{{` |
| AC-12 | owner+relay single-locale es-MX | PASS | inline es-MX copy; OWNER_EMAIL_LOCALE |
| AC-13 | dispatch failure-isolated + non-blocking | PASS | dispatch/trigger/checkout catches; isolation test proves 200 when send throws |
| AC-14 | checkout → confirmation + owner, non-blocking | PASS | actions.ts:351-353 (only `!reused`) |
| AC-15 | paid → payment_received once | PASS | process-payment `'paid'` branch; dedupe=mpPaymentId |
| AC-16 | pending voucher once; skip if no data | PASS | `toVoucherData` null → logged skip |
| AC-17 | shipped/cancelled/refund/contact seams built+tested, not wired | PASS | `// T12/T13 wiring seam` comments |
| AC-18 | webhook route email-free; trigger post-advance | PASS | grep: no email import in route.ts |
| AC-19 | hacker-report.md untouched | PASS | not modified |
| AC-20 | T7/T8 unchecked | PASS | BUILD_PLAN not modified |

## Edge Case Verification

| # | Edge Case | Status | Evidence |
| - | --------- | ------ | -------- |
| 1 | Duplicate webhook → one email | HANDLED | unique conflict → 'duplicate' short-circuits |
| 2 | Provider down/timeout → 200, un-finalized | HANDLED | bounded timeout; isolation test; at-most-once documented |
| 3 | /en/ → en emails | HANDLED | `orders.locale`; `getTranslations({locale})`; owner es-MX |
| 4 | OXXO paid later → both once | HANDLED | distinct email_kind → distinct ledger rows |
| 5 | charged_back/mismatch → no email | HANDLED | returns before advance; kind ≠ 'paid'; refund test |
| 6 | Undeliverable valid email | HANDLED | bounce logged+swallowed; no address in logs |
| 7 | Locale mutation attempt | HANDLED | locale not in advance UPDATE set |

## Fix Summary

- Critical: 0/0
- Major: 1/1 fixed (M-1 href escaping)
- Minor: 0/2 fixed, 2 skipped (m-1 comment cosmetics, m-2 unreachable escape-bypass) — justified
- Nit: 0/1 fixed, 1 skipped (out-of-scope script comment)

## Verification (post-fix)

- `tsc --noEmit`: 0 errors
- `eslint .`: clean
- Unit: **1271 passed** (68 files) — 1268 baseline + 3 new `layout.test.ts` regression tests
- Integration: **168 passed** (13 files) via `scripts/run-integration.sh` (fresh reset+seed, exit 0)
- `supabase db reset`: 0001..0010 apply clean (idempotent)
- DB left pristine-seeded (0 orders, 0 email_sends); tsconfig.json unchanged; no stray servers

## Quality Score: 9/10

## Recommendation: APPROVE

The one MAJOR finding (unescaped email button `href`) is FIXED inline with a dedicated regression
test. Failure isolation on both money paths is airtight, the migration is behavior-preserving over
T8, the ledger is race-safe, and the at-most-once email choice is deliberate and documented. Ready
to proceed to QA (S5).
