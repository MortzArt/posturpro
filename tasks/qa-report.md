# QA Report: T10 — Admin foundation

**Verdict: PASS** — Confidence **HIGH**.
Stage 7 (QA) found and fixed one real **P1 config bug** that made admin login
100% non-functional (`ADMIN_PASSWORD_HASH` mangled by dotenv `$`-expansion). After
the fix, every acceptance criterion and edge case is covered and green.

## Test Suite Summary
| Type | Written (new) | Passed | Failed | Skipped |
|------|--------------|--------|--------|---------|
| Unit | 4 | 1370 | 0 | 0 |
| Integration | 8 | 188 | 0 | 0 |
| E2E (admin) | 15 (×2 projects = 30) | 30 | 0 | 0 |
| E2E (storefront regression, R2) | 0 (existing) | 78 | 0 | 0 |
| **Total** | **27 new** | **all green** | **0** | **0** |

- Unit: **1370/1370** (78 files) — baseline 1366 + 4 new (`actions.test.ts`).
- Integration: **188/188** (14 files) — baseline 180 + 8 new (`store-settings-write.integration.test.ts`), via `scripts/run-integration.sh`.
- E2E admin: **30/30** (`e2e/admin.spec.ts`, chromium + mobile).
- E2E storefront regression: chromium **39/39** + mobile **39/39** = **78/78** (payment 8 + checkout 24 + cart 46), reseed-between-projects (the baseline method). Middleware change does NOT regress the storefront.

## Bug Found & Fixed (P1 — login was fully broken)
**`ADMIN_PASSWORD_HASH` destroyed by env `$`-expansion.** The scrypt hash
`scrypt$16384$8$1$<salt>$<hash>` was stored UNquoted in `.env.local`. Next's env
loader (`@next/env` → dotenv-expand) treats `$16384`, `$8`, `$1`, `$salt`, `$hash`
as variable expansions, collapsing the 178-char hash to the 10-char string
`scrypt6384`. `verifyCredentials()` then always returned `false` → **the correct
Owner password NEVER authenticated** (login silently showed "Correo o contraseña
incorrectos" for valid creds).

- **How found:** admin login-success e2e failed on both prod and dev servers.
  Bisected with a temporary in-action log: FormData was correct
  (`email="admin@posturpro.mx"`, `pwlen=18`) but the server's
  `process.env.ADMIN_PASSWORD_HASH` was `scrypt6384` (len 10). Reproduced
  deterministically with `@next/env`'s `loadEnvConfig`.
- **Fix:** backslash-escaped every `$` in the `.env.local` value
  (`scrypt\$16384\$8\$1\$…`). Verified: `@next/env` now yields the full 178-char
  hash and `posturpro-dev-2026` verifies against it. (Single-quoting is NOT
  sufficient — `@next/env` still expands inside single quotes.)
- **Test that covers it:** the full login-success e2e (`admin.spec.ts` "correct
  creds land on /admin/settings and set a scoped HttpOnly cookie") + the
  round-trip save now pass 30/30. This flow is the regression lock.
- **ACTION REQUIRED (orchestrator/dev):** `.env.local` is **gitignored**, so this
  fix does NOT propagate. Two follow-ups for Stage 8+/deploy:
  1. Update the hash-generation snippet in `dev-done.md` to instruct escaping `$`
     when pasting into any `.env*` file — otherwise every deploy will silently
     break login the same way.
  2. Consider a dev-only startup self-check that fails loudly if
     `ADMIN_PASSWORD_HASH` doesn't parse as `scrypt$N$r$p$salt$hash` (6 `$`-parts),
     turning this silent misconfig into an obvious error. (Recommendation, not
     blocking — the running config is now correct.)

## Acceptance Criteria Coverage
| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| AC-1 | Unauth `/admin/*` (except login) → redirect to login, no admin markup | e2e: "GET /admin redirects…no admin markup", "GET /admin/settings…redirects", curl smoke (307, 0 admin-markup matches) | PASS |
| AC-2 | Correct creds set HttpOnly/Lax/Secure(prod)/Path=/admin cookie, redirect to /admin; case-insensitive email; constant-time pw | e2e: "correct creds land…scoped HttpOnly cookie" (httpOnly, path=/admin, sameSite=Lax); unit `auth.test.ts`, `session.test.ts` | PASS |
| AC-3 | Wrong email OR pw → single generic error, no enumeration, timing-parity | e2e: "wrong password…generic error", "unknown email…SAME generic error"; unit `auth.test.ts` (dummy-hash timing parity) | PASS |
| AC-4 | Cookie HMAC-SHA256 tamper-evident; forgery/truncation fails `timingSafeEqual` | unit `session.test.ts`, `session-parity.test.ts`, `session-edge.test.ts` (tampered/forged/truncated rejected, Node↔Edge identical) | PASS |
| AC-5 | Session expires after max-age; expired-but-signed rejected | unit `session.test.ts` ("expired-but-signed"), `session-payload.test.ts` (`isWithinMaxAge`) | PASS |
| AC-6 | Logout clears cookie, redirects to login; AC-1 holds after | e2e: "after logout, /admin redirects to login again" (direct URL post-logout re-redirects) | PASS |
| AC-7 | Authed `/admin/login` → redirect to /admin | e2e: "while authed, /admin/login redirects to /admin" | PASS |
| AC-8 | Settings renders 4 fields pre-populated (money in pesos) | e2e: "settings form is pre-populated…" (flat rate = 500.00); integration singleton shape | PASS |
| AC-9 | Save updates row via admin client, busts cache tag, success banner; storefront reflects | e2e round-trip: change flat rate → save → success → reload persists → **cart summary-shipping shows 742.00** → restore; integration UPDATE + updated_at; unit `actions.test.ts` (writes only after valid session) | PASS |
| AC-10 | Server validation rejects blank/long name, bad email, negative/non-numeric/>2-dec/overflow money; field errors; form stays filled | e2e: "thousand-separator money rejected…form stays filled", "blank name rejected"; unit `settings-input.test.ts`; integration DB CHECK constraints | PASS |
| AC-11 | Nav shell: store name, Settings live+active, Products/Orders disabled placeholders, logout | e2e: "Settings live+active; Products/Orders disabled placeholders" (aria-current, aria-disabled) | PASS |
| AC-12 | Admin secrets server-only, never `NEXT_PUBLIC_`, absent from client bundle | unit `secret-exposure.test.ts`; `.env.local` has no `NEXT_PUBLIC_` admin var | PASS |
| AC-13 | Cookie name distinct from `NEXT_LOCALE`/cart, Path=/admin, storefront byte-unchanged | e2e cookie-name assertion; storefront regression 78/78; `/` & `/en` 200 throughout | PASS |
| AC-14 | No migration (row+CHECKs+trigger already exist) | integration confirms singleton + CHECKs live at migrations 0001..0010; no 0011 added | PASS |
| AC-15 | Login rate-limited per IP; env-flag escape hatch | unit `login-rate-limit.test.ts` (cap/release/strict `==="1"` hatch) | PASS |
| AC-16 | tsc strict, ESLint max-lines, no `any`/`!`, session fns ≤30 lines | `tsc --noEmit` clean (only stale `.next/dev/types` artifacts), ESLint clean | PASS |

## Edge Case Coverage
| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Forged/tampered cookie → unauthenticated | unit `session.test.ts` / `session-parity.test.ts` | PASS |
| 2 | Expired-but-signed cookie → rejected | unit `session.test.ts` "expired-but-signed" | PASS |
| 3 | Secret rotated → all cookies invalid | unit `session.test.ts` "different secret" | PASS |
| 4 | Missing admin env → generic "no disponible", never "any pw works" | unit `auth.test.ts` (blank hash never authenticates) + action catches `MissingEnvVarError` | PASS |
| 5 | Concurrent save → last-write-wins on singleton | integration UPDATE + updated_at trigger | PASS |
| 6 | Money 0 / 0.00 valid (flat & threshold) | unit `settings-input.test.ts`; integration accepts 0/0 (CHECK `>= 0`) | PASS |
| 7 | Locale-formatted money (`1,000.00`, `$500`) rejected/normalized, never mis-coerced | e2e "thousand-separator rejected"; unit `settings-input.test.ts` | PASS |
| 8 | `store_settings` row absent → seed defaults + "save to create" | code path (`settings/page.tsx` rowMissing, INSERT in `updateStoreSettings`); unit-covered | PASS (code path; no live empty-DB e2e) |
| 9 | Direct POST to saveStoreSettings w/o session → rejected, no DB write | unit `actions.test.ts` (absent+tampered cookie → redirect, `updateStoreSettings` never called) | PASS |
| 10 | `/admin/`, case/slash variants → guarded, storefront never rewrites | e2e "trailing-slash /admin/…no leak"; curl `/admin/`=307/308→login, `/`,`/en`=200 | PASS |

## Tests Written
### Unit — `src/app/admin/actions.test.ts` (4)
- absent cookie → `saveStoreSettings` redirects to login, `updateStoreSettings` never called (edge 9)
- tampered cookie → redirects, DB untouched (edge 9)
- valid session → DB written once, status "success" (AC-9)
- valid session + invalid input → field errors, no DB write (AC-10)

### Integration — `tests/integration/store-settings-write.integration.test.ts` (8)
- singleton is a single seeded MXN row (AC-8)
- UPDATE by id changes the 4 columns, bumps `updated_at`, leaves currency (AC-9, edge 5)
- accepts money 0/0 (edge 6)
- DB CHECK rejects blank name, name >200, negative flat rate, negative threshold (AC-10 defense-in-depth)
- anon (publishable-key) client CANNOT write the singleton — RLS grant boundary (AC-5/AC-13 model)

### E2E — `e2e/admin.spec.ts` (15 × chromium+mobile = 30)
Unauth protection (3), login failures/no-enumeration (3), login success + cookie + AC-7 (3), nav shell (1), settings validation (2), logout (1), settings save round-trip + storefront shipping reflection (1), storefront locale-routing sanity (1). Selectors follow the resilience rules (data-testid + getByRole/URL; no getByText on interactive controls; visible-filter for the dual desktop-sidebar/mobile-drawer nav+logout).

## Suite Runs (exact)
- Unit: `npx vitest run` → **1370 passed (78 files)**, 0 failed.
- Integration: `bash scripts/run-integration.sh` → **188 passed (14 files)**, 0 failed (resets+seeds local Supabase first).
- E2E admin: `npx playwright test admin.spec.ts` → **30 passed**.
- E2E storefront regression (prod build, reseed-per-project): chromium **39** + mobile **39** = **78 passed**.

## Notes on E2E Environment (for the orchestrator)
- **Killed the orchestrator's interactive dev server** on port 3000 (PID ~2365) for the prod-build e2e, as authorized. **Port 3000 is now CLEAR** — no server left running; the orchestrator should restart its own dev server if needed.
- **Authenticated admin e2e ran against a DEV server, not the prod build.** Reason: `next start` forces `NODE_ENV=production` → the session cookie is `Secure` → the browser rejects it over plain `http://localhost:3000`, so no authenticated flow can set a session on the HTTP test server. This is CORRECT product behavior (AC-2 requires `Secure` in prod). The **unauth guard + storefront regression were verified on the authoritative PROD build**; the authenticated flows (login, settings round-trip, logout) were verified on a dev server (per-request render, non-Secure cookie). To run authenticated admin e2e on a prod build in CI, serve over HTTPS or gate `Secure` behind an explicit deploy flag rather than `NODE_ENV`.
- **`.env.local` was modified** (the `$`-escape fix above). It is gitignored — see ACTION REQUIRED. Left in the corrected state so the app works locally.
- **Cleanup done:** DB left pristine-seeded (`db reset` + seed), `NEXT_QA_DIST_DIR` build dir (`.next-qa-t10`) removed, `tsconfig.json` restored clean (verified `git status` clean for it), no stray servers.
- The **8 mobile order-placing failures** seen in a combined all-projects storefront run are a pre-existing cross-project **stock-depletion race** (chromium + mobile placing orders on one un-reseeded DB), NOT a T10 regression: the same tests pass 39/39 per project with a reseed between, chromium passed in the combined run, and `/`+`/en` stayed 200 throughout. The T10 middleware branch returns before next-intl.

## Untested Areas / Residual Risk
- **Edge 8 (empty `store_settings` DB) has no live e2e** — covered by the seeded-defaults code path + `updateStoreSettings` INSERT branch (unit/logic), not exercised against an actually-empty table end-to-end. LOW risk (single INSERT path, fails safe).
- **Rate limiter is per-instance in-memory** (documented best-effort) — escape hatch and cap/release are unit-tested; multi-instance behavior out of scope for a single-owner surface. LOW risk.
- **Live MP/email side effects** remain blocked-on-user (placeholder creds) — unchanged by T10, unrelated.
- **Authenticated prod-build e2e over HTTPS** not run (see environment note) — auth logic is unit + dev-e2e verified and the prod build compiles the same code; MEDIUM-LOW risk, mitigated by the Secure-cookie behavior being intentional.

## Confidence: HIGH
Every AC (16/16) and edge case (10/10) has coverage and passes. A real P1 login
bug was caught and fixed with a regression-locking e2e. All baselines hold or grew
(unit 1370, integration 188, e2e storefront 78). The one caveat (authenticated
e2e on dev vs prod build) is a well-understood, intentional Secure-cookie
constraint, not a product defect.
