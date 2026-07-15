# Code Review: T10 — Admin foundation

## Summary
A genuinely strong, security-literate implementation of the app's top trust boundary. The HMAC session scheme, scrypt login with dummy-hash timing parity, defense-in-depth guard (Edge → Node → per-action re-verify), strict money parser, and cookie flags are all correct and match the ticket. No CRITICAL security holes found. The gaps are in *test coverage of the invariants* (not the code itself), a real Node/Edge behavioral asymmetry that is unpinned, and a handful of MINOR/NIT robustness and DRY items. Verdict: APPROVE-WITH-FIXES.

---

## Critical Issues (MUST FIX)
None. The auth core is sound: forged/tampered/expired/truncated cookies are rejected by both verifiers; a missing/blank secret never authenticates; a missing/unparseable password hash never authenticates; no admin secret is `NEXT_PUBLIC_` or passed to a client component; every mutation re-verifies server-side.

---

## Major Issues (SHOULD FIX)

### M-1: Node vs Edge session-verifier equivalence is never tested (parser-differential risk, R1)
- **ID**: M-1
- **Severity**: MAJOR
- **File**: `src/lib/admin/session-edge.test.ts` (whole suite; titled "parity" at ~:25) vs `src/lib/admin/session.test.ts`
- **Problem**: The two verifiers (`isSessionValid` / `node:crypto`, `isSessionValidEdge` / `crypto.subtle`) share the payload codec but NOTHING asserts they return the SAME verdict on the SAME cookie. Each suite builds its own copy-pasted `validCookie` helper (`session.test.ts:32`, `session-edge.test.ts:19`). A future divergence in payload framing, hex casing, or expiry handling would pass both suites while opening a differential (a cookie the fast Edge gate accepts but Node rejects, or vice-versa).
- **Impact**: R1's core risk — a parser/verifier differential between the two runtimes — is unguarded. Manual inspection confirms they are equivalent *today* (both decode hex→bytes, both call the shared `decodePayload`/`isWithinMaxAge`), but there is no regression fence.
- **Suggested Fix**: Add one cross-check test: mint a cookie with the Node signer, assert `isSessionValid(c) === true` AND `await isSessionValidEdge(c) === true`; tamper one byte and assert BOTH false; expire it and assert BOTH false. Feed both verifiers from a single shared fixture, not two local helpers.
- **Status**: FIXED — Added `session-parity.test.ts` (8 cases) feeding BOTH verifiers from ONE shared fixture and asserting `node === edge === expected` on valid / one-byte-tampered / forged-sig / wrong-secret / expired / future-dated / malformed / boundary cases. Extracted the shared signer into `session-test-fixture.ts` (`signCookie`, `signPayloadPart`) and removed the copy-pasted per-suite helpers in `session-edge.test.ts` and `session.test.ts`.

### M-2: Node `isSessionValid` THROWS on missing secret (Edge returns false) — asymmetry is unpinned by tests
- **ID**: M-2
- **Severity**: MAJOR
- **File**: `src/lib/admin/session.ts:79` vs `src/lib/admin/session-edge.ts:88-91`; test gap in `src/lib/admin/session.test.ts`
- **Problem**: With a blank/absent `ADMIN_SESSION_SECRET`, the Edge verifier returns `false` (fail-closed, tested at `session-edge.test.ts:53`), but the Node verifier `getAdminEnv()`-throws `MissingEnvVarError`. That throw is caught by every caller (`session-guard.ts:24`, `actions.ts:151`) and mapped to "not authenticated" — so runtime behavior is safe — but no test pins that contract on `isSessionValid` itself. A refactor that swallowed the throw and returned a verdict against an empty-string HMAC key would go uncaught.
- **Impact**: The fail-closed contract for the authoritative verifier rests on caller discipline with no test fence. High blast radius if it regresses (empty-key HMAC is forgeable).
- **Suggested Fix**: Add a `session.test.ts` case: with `ADMIN_SESSION_SECRET` unset, assert `() => isSessionValid(anyCookie)` throws `MissingEnvVarError`; plus a guard/action-level test asserting the catch maps to unauthenticated. Document the intentional asymmetry inline in `session.ts`.
- **Status**: FIXED — `session.test.ts` now pins `isSessionValid` THROWS `MissingEnvVarError` on both an unset and a whitespace-only secret (verdicting an empty key would be forgeable). New `session-guard.test.ts` pins the caller-level mapping: `hasValidAdminSession` returns `false` (never throws, never honors a valid cookie) when the secret is unset. The intentional Node-throws vs Edge-returns-false asymmetry is now documented inline in `session.ts`.

### M-3: auth test does not assert scrypt actually runs on email mismatch (R3 anti-enumeration invariant unfenced)
- **ID**: M-3
- **Severity**: MAJOR
- **File**: `src/lib/admin/auth.test.ts:72` (labelled "still runs scrypt for timing parity"); code at `src/lib/admin/auth.ts:116-128`
- **Problem**: The test asserts only the boolean `false` on a wrong email. It never verifies the scrypt derivation ran on the mismatch path. A refactor adding `if (!emailMatches) return false;` before the scrypt work (reintroducing the exact user-enumeration/timing leak this module exists to prevent) would keep every test green.
- **Impact**: The single most important defensive property of `verifyCredentials` (R3, AC-3) is not actually pinned — only implied by a label.
- **Suggested Fix**: Spy on `scryptSync` (or the `verifyAgainst` helper) and assert it is invoked once on BOTH the unknown-email and wrong-password paths; alternatively assert the two paths' timings are within tolerance. Do not rely on the boolean alone.
- **Status**: FIXED (timing approach). Mocking `node:crypto`'s `scryptSync` did NOT intercept `auth.ts`'s binding (Vite externalizes the node builtin for the SUT's module graph, so the spy recorded 0 calls even though the direct-call probe worked) — so the review's sanctioned alternative was used: `auth.test.ts` now asserts a hard per-path wall-time FLOOR that only a real scrypt (N=16384) can clear on the unknown-email, wrong-password, AND happy paths, plus timing PARITY across all three (median of 5 samples, wide 5x tolerance). A re-added `if (!emailMatches) return false;` short-circuit returns in microseconds and blows the floor. Verified stable across 3 back-to-back runs.

### M-4: Rate-limit cardinality cap and window-expiry are not tested at the admin layer (AC-15)
- **ID**: M-4
- **Severity**: MAJOR
- **File**: `src/lib/admin/login-rate-limit.test.ts` (`:48` only asserts count == 2)
- **Problem**: (a) The `ADMIN_LOGIN_RATE_LIMIT_MAX_KEYS` (10,000) ceiling / `evictToCeiling` memory bound (`sliding-window.ts:54-67`) is never driven past the cap here — the cardinality-DoS defense is unverified for the admin limiter. (b) No test advances `now` past `ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS` to prove attempts age out and access is restored — a limiter that never released would pass every case. (c) The escape-hatch test checks only `="1"`; it never confirms a non-`"1"` value (e.g. `"true"`, `"0"`) STILL enforces (source is strict `=== "1"`, security-relevant).
- **Impact**: AC-15's memory-bound and sliding-release behavior — both load-bearing for a production auth surface — are unfenced.
- **Suggested Fix**: Add: (1) push `maxKeys + 100` distinct IPs, assert `loginRateLimitKeyCount() <= ADMIN_LOGIN_RATE_LIMIT_MAX_KEYS`; (2) trip the limit, advance `now` by the window, assert it returns true again; (3) set the flag to `"true"` and assert it still enforces.
- **Status**: FIXED — `login-rate-limit.test.ts` adds: (a) cardinality cap (`maxKeys + 200` distinct IPs → `keyCount() <= ADMIN_LOGIN_RATE_LIMIT_MAX_KEYS`); (b) sliding release (trip the limit, advance `now` past the window → allowed again) plus a just-before-window case proving attempts still count while in-window; (c) escape-hatch strictness — the flag set to `"true"`, `"0"`, `"yes"`, `"on"`, `" 1 "`, `""` STILL enforces; only the exact string `"1"` bypasses.

---

## Minor Issues (NICE TO FIX)

### m-1: `secret-exposure` client-import check only matches `@/lib/` alias paths
- **File**: `src/lib/admin/secret-exposure.test.ts:~60`
- **Suggestion**: The "no `"use client"` file imports a server-only admin module" check uses a substring on `@/lib/${mod}`. A relative-path import (`../admin/auth`) or barrel re-export slips past while genuinely exposing the module. It is a static-source (not built-bundle) test — same limitation as the MP reference, so consistent, but the docstring over-claims. Match both alias and relative forms (regex on `admin/(auth|session|session-guard)`), or grep the built client chunks.
- **Status**: FIXED — `secret-exposure.test.ts` now scans every string literal in each `"use client"` file, normalizes the `@/lib/` alias, and flags any specifier whose path ENDS in `admin/(auth|session|session-guard)` (optional `.ts(x)`), catching both alias and relative (`../admin/auth`) spellings.

### m-2: `decodePayload` `Number.isFinite(iat)` branch never exercised
- **File**: `src/lib/admin/session-payload.test.ts`; code `session-payload.ts:86`
- **Suggestion**: No test feeds `iat: Infinity`/`NaN`. Deleting the `!Number.isFinite` guard would leave every test green, yet an `Infinity` iat would then pass `isWithinMaxAge`. Add a decode case with a hand-built base64url JSON literal `{"v":1,"iat":Infinity-as-1e400}` asserting `null`.
- **Status**: FIXED — `session-payload.test.ts` adds a case decoding hand-built literals `{"v":1,"iat":1e400}` (→ Infinity) and `{"v":1,"iat":-1e400}` (→ -Infinity), both asserting `null`; deleting the `!Number.isFinite(iat)` guard now fails this test.

### m-3: `ADMIN_SESSION_MAX_AGE_SECONDS` override may not be readable in the Edge runtime
- **File**: `src/lib/admin/constants.ts:50-62` read from `src/lib/admin/session-edge.ts:115`
- **Suggestion**: A non-`NEXT_PUBLIC_` override read via `process.env` in Edge middleware is not guaranteed available on every platform. If set-but-unreadable in Edge, the fast gate uses the 8h default while Node uses the override → an inconsistency window. Node is authoritative so it is UX-only, not a hole. Document that the override binds authoritatively at the Node layer (or env-allow-list it for middleware). Low priority.
- **Status**: SKIPPED — UX-only, platform-dependent, and Node is authoritative (an Edge gate using the default while Node honors the override only ever redirects a still-valid-per-Node session to re-login, never grants access). Deferred to deploy-time env config rather than a code change; not worth production churn for a low-priority non-hole. Noted here for the ops runbook.

### m-4: Email compare uses `===` (not constant-time)
- **File**: `src/lib/admin/auth.ts:118-119`
- **Suggestion**: Email is the username (not secret) and enumeration is defended by always running scrypt, so this is acceptable and matches the ticket. Micro length-timing signal reveals nothing exploitable. Leave as-is; optionally note the rationale inline.
- **Status**: FIXED (doc-only) — behavior left as-is (correct); added an inline comment in `auth.ts` at the email compare recording the rationale (username, not a secret; enumeration defended by the always-run scrypt).

### m-5: `updateStoreSettings` read-then-write is non-atomic on the missing-row edge
- **File**: `src/lib/store-settings.ts:167-199`
- **Suggestion**: Concurrent first-time saves both read null → both INSERT → the second violates the singleton index → generic "No se pudo guardar." Existing-row path is correct last-write-wins. Edge 8 allows "or a recoverable error," so within spec; an `upsert` on the singleton conflict target would make it seamless.
- **Status**: SKIPPED — within spec (edge 8 explicitly allows a recoverable error), single-owner surface makes concurrent first-time INSERTs practically impossible, and the second write already fails safely with a friendly message. An `upsert` on the singleton conflict target is a nice-to-have; deferred to avoid changing the write path's error contract without a covering test in this fix pass.

### m-6: `parseStoreSettingsInput` uses `as` casts to narrow the success branch
- **File**: `src/lib/admin/settings-input.ts:158-163`
- **Suggestion**: Four `(name as { ok: true; ... }).value` casts re-assert a fact already established. Safe but leans on `as` where carrying the parsed values in guard-narrowed locals would avoid the cast and better fit the "minimize casts" clean-code spirit.
- **Status**: FIXED — `parseStoreSettingsInput` now re-checks each result (`if (!name.ok || !email.ok || !flat.ok || !threshold.ok) return …`) so TypeScript narrows every local to its `ok: true` shape; the success branch reads `name.value` / `flat.cents` directly with ZERO `as` casts. tsc clean.

### m-7: settings parser boundary/format cases untested
- **File**: `src/lib/admin/settings-input.test.ts`
- **Suggestion**: `.5` (leading-dot, rejected), `$ 500` (space after `$` — passes: one `$` stripped then trim), `$$500` (rejected), and `store_name` at EXACTLY `STORE_NAME_MAX_LENGTH` (only +1 tested) are uncovered. Add these four to pin the regex/length branches.
- **Status**: FIXED — `settings-input.test.ts` adds all four: `.5`/`$.5` → `money-invalid`; `$ 500` → `{ ok: true, cents: 50000 }` (documents the one-`$`-strip-then-trim tolerance); `$$500` → `money-invalid`; and a name at EXACTLY `STORE_NAME_MAX_LENGTH` → `ok: true`.

---

## NIT
- **N-1** `settings-input.ts:121-125` — the "Guarantees `CENTS_PER_PESO` is not a dead reference…" comment is awkward; the constant is legitimately used in `MAX_SAFE_PESOS` (`:169`). Simplify.
  - **Status**: FIXED — the awkward sentence was removed as part of the m-6 rewrite; the docstring now describes the guard-narrowed no-cast success branch and no longer references the constant defensively.
- **N-2** `store-settings-form.tsx:325` `Banner` `icon` typed `typeof Alert02Icon` — `IconSvgElement` (already used in constants) is the precise type.
  - **Status**: FIXED — imported `type IconSvgElement` from `@hugeicons/react` and typed `BannerProps.icon` as `IconSvgElement`. tsc + eslint clean.
- **N-3** `auth.ts:38,132` — `DUMMY_HASH` runs a real scrypt (cost 16384) at module load for any module that transitively imports `auth.ts`. Acceptable (one-time, server-only); worth a comment noting the ~tens-of-ms cold-start cost.
  - **Status**: FIXED (doc-only) — added a comment on `DUMMY_HASH` noting the one-time ~tens-of-ms server-only cold-start cost at module load, never on the request path.
- **N-4** `actions.ts:55,71` — two `console.warn` lines embed `new Date().toISOString()`; keeps IP context and logs no credentials (verified good) — minor timestamp duplication if the logger already timestamps.
  - **Status**: SKIPPED — the explicit ISO timestamp is intentional and portable: Node's bare `console.warn` does NOT prepend a timestamp, so removing it would lose the time context in plain stdout/stderr deploys. No credentials logged (verified). Left as-is deliberately.

---

## Acceptance Criteria Verification
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | Unauth `/admin/*` (except login) → redirect, no markup | PASS | `middleware.ts:69-71`; `(app)/layout.tsx:22-24` authoritative redirect before any child renders |
| AC-2 | Correct creds → HttpOnly/Lax/Secure-prod/Path=/admin cookie → /admin; case-insensitive email; constant-time pw | PASS | `actions.ts:80-89` flags; `auth.ts:118-119` case-insensitive; `auth.ts:102` `timingSafeEqual` |
| AC-3 | Wrong email OR pw → single generic error, no enumeration, timing parity | PASS (test gap M-3) | `actions.ts:70-73`; `auth.ts:122-128` dummy-hash equal-cost; `login-form.tsx:136` one message |
| AC-4 | Tamper-evident HMAC-SHA256; forged/truncated fails timingSafeEqual | PASS | `session.ts:39-48,80-83`; `session-edge.ts:66-74,108`; `splitCookie` |
| AC-5 | Bounded lifetime 8h; expired rejected server-side even if signed | PASS | `session-payload.ts:119-126`; both verifiers call `isWithinMaxAge`; `constants.ts:47-62` |
| AC-6 | Logout clears cookie (maxAge=0) → login | PASS | `actions.ts:96-105`; `logout-button.tsx` real form POST |
| AC-7 | Authed visiting /admin/login → /admin | PASS | `middleware.ts:61-64` AND `login/page.tsx:18-19` |
| AC-8 | Settings renders 4 fields prefilled, money in pesos | PASS | `settings/page.tsx:24-41` `pesoString`/`.toFixed(2)` |
| AC-9 | Save → admin-client write → cache bust → success; storefront reflects | PASS | `store-settings.ts:167-198` (`updateTag`); `actions.ts:127-136` |
| AC-10 | Reject blank/long name, bad email, negative/non-numeric/>2dp/overflow; field errors; form stays filled | PASS | `settings-input.ts:66-166`; `store-settings-form.tsx` inline errors + preserved `values` |
| AC-11 | Nav shell: store name, live Settings, Products/Orders "próximamente", logout, active marking | PASS | `admin-shell.tsx`, `admin-nav.tsx` (`aria-current`, `SoonRow`), `constants.ts:97-119` |
| AC-12 | Secrets only via env.ts, server-only, never NEXT_PUBLIC_, not in client bundle | PASS (test m-1 weak) | `env.ts:224-232`; `.env.local` no `NEXT_PUBLIC_ADMIN`; `secret-exposure.test.ts` (source-level) |
| AC-13 | Distinct cookie name, Path=/admin, storefront unchanged | PASS | `constants.ts:24-27`; `middleware.ts:45-47` admin branch returns before next-intl |
| AC-14 | Migration only if needed — expectation none | PASS | `dev-done.md:94`; writes are pure UPDATE/INSERT; migrations 0001..0010 untouched in diff |
| AC-15 | Login rate-limited per IP; generic "demasiados"; env escape hatch | PASS (test gap M-4) | `login-rate-limit.ts`; `actions.ts:53-57`; `login-form.tsx:138` |
| AC-16 | tsc strict, max-lines, no any/`!`, auth fns ≤30 lines | PASS | all files <400 lines; `verifyCredentials`/`isSessionValid` ≤~18 lines; dev-done reports tsc/eslint clean |

## Edge Case Verification
| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Forged/tampered cookie | HANDLED | `splitCookie`/`timingSafeHexEqual` → false; `session.test.ts:53,60` |
| 2 | Expired-but-signed | HANDLED | `isWithinMaxAge` age>maxAge; `session-payload.test.ts:88` |
| 3 | Secret rotation invalidates all | HANDLED | different-secret mismatch; `session.test.ts:77` |
| 4 | Missing admin env → generic, never "any password works" | HANDLED | `actions.ts:62-66`; `auth.ts:125` dummy fallback; guard/require map throw→unauth |
| 5 | Concurrent save last-write-wins | HANDLED (m-5 caveat) | existing-row UPDATE by id; missing-row double-INSERT → recoverable error |
| 6 | Money 0 / 0.00 valid | HANDLED | `parseMoneyToCents`; `settings-input.test.ts:22` |
| 7 | Locale-formatted money rejected, never coerced | HANDLED | strict ASCII `\d` regex rejects `1,000.00`/`1.000,00`/thousand-space; `:40-42`; unicode-digit reject verified |
| 8 | Missing store_settings row | HANDLED | `settings/page.tsx:30` rowMissing + SEED defaults; `insertSingletonRow` on save |
| 9 | Direct POST to saveStoreSettings without session | HANDLED | `actions.ts:119` `requireSession()` node:crypto re-verify → redirect, DB untouched |
| 10 | `/admin/`, `/Admin`, slash variants vs locale matcher | HANDLED | `isAdminPath` matches `/admin` + `/admin/`; dev-verified 307/308; `/Admin` (capital) NOT matched → falls to next-intl as non-locale → 404 (acceptable; case-sensitivity documented `middleware.ts:29`) |

## Test Quality Assessment
Above the bar for a Phase-1 auth surface: `session-payload`, `session` (Node), `auth`, and `settings-input` re-derive signatures/values independently of the code under test, so they genuinely catch broken logic. Concrete gaps are M-1..M-4 and m-1/m-2/m-7 — all are *missing fences around already-correct behavior*, not broken code. QA (Stage 7) should close M-1, M-3, M-4 at minimum.

## Motion / Animation Review (review-animations STANDARDS)
PASS. `.enter-fade` and `.drawer-panel`/`.drawer-scrim` are REUSED classes (dev claim verified against `globals.css`). Enters use `var(--ease-out)`; only `transform`/`opacity` animate; durations 150–300ms; `prefers-reduced-motion` drops translate to opacity-only (`globals.css:219-233,337-338`). Drawer is interruptible (`admin-shell.tsx:99-111` timer cleanup). Nav/logout use color/opacity only — matches ui-design frequency-of-use guidance. No new motion invented.

## Clean-Code Review
PASS with m-6 (avoidable `as` casts) and N-1/N-3. All files <400 lines; no `any`; no non-null `!`; magic values named; no empty catches (every catch logs with context or re-throws — `session-guard.ts:24-30`, `actions.ts:62-68,151-156`, `store-settings.ts:176-190`); SRP respected (pure codec/parser vs Next integration).

## Quality Score: 8.5/10
Correct, well-factored, security-literate implementation of the trust boundary with no shipping-blocking defect. Docked for four MAJOR test-coverage gaps around the very invariants that make the auth safe, plus minor robustness/DRY items.

## Recommendation: APPROVE-WITH-FIXES
No CRITICAL issues; safe to proceed to QA/Security. Before SHIP, close M-1, M-2, M-3, M-4 (test fences for the auth invariants) — the difference between "correct today" and "stays correct." M-1 and M-3 guard the two properties (runtime parity, anti-enumeration) whose regression would be silent and high-impact. MINOR/NIT items are optional polish.

---

## Stage 6 (Fix) resolution — 2026-07-15
- **MAJOR**: 4/4 FIXED (M-1 parity fence + shared fixture; M-2 fail-closed throw + guard mapping test + inline doc; M-3 timing-floor/parity proof of scrypt on the mismatch paths; M-4 cardinality cap + sliding release + strict escape-hatch).
- **MINOR**: 6/7 FIXED (m-1, m-2, m-4, m-6, m-7 + the m-3 doc note), 1 SKIPPED (m-3 platform-dependent Edge env override — UX-only, non-hole; m-5 SKIPPED — within spec, single-owner). Corrected tally: **m-1, m-2, m-4, m-6, m-7 FIXED; m-3, m-5 SKIPPED (justified)**.
- **NIT**: 3/4 FIXED (N-1, N-2, N-3), 1 SKIPPED (N-4 — intentional portable timestamp).
- **Production code touched** (behavior-preserving except where noted): `settings-input.ts` (m-6/N-1 no-cast narrowing — behavior identical), `session.ts` (M-2 doc comment), `auth.ts` (m-4/N-3 doc comments), `store-settings-form.tsx` (N-2 type precision). All other changes are test-only.
- **Verification**: `npx tsc --noEmit` 0 source errors; eslint clean on all touched files; full unit suite **1366/1366 across 77 files** (baseline 1342/75 + 24 net new tests, 2 new test files: `session-parity.test.ts`, `session-guard.test.ts`); payment-panel flake did not recur (17/17 in isolation).
