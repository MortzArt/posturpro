# Ship Decision: T10 — Admin foundation

## Verdict: SHIP

## Confidence: HIGH

## Quality Score: 9/10

Stage 11 (Hacker) was **SKIPPED** — task classified `medium` complexity, per the
full-cycle auto-classification rule (medium → skip hacker; Security + Arch run at
full depth because this is the app's top trust boundary). This is noted and does
not affect the verdict: the auth surface received full-depth adversarial Security
(Stage 9) and Architecture (Stage 10) review in lieu of chaos testing.

---

## Verification Matrix (every check run by the gatekeeper, not trusted from reports)

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | `tsc --noEmit` | ✅ 0 errors | Ran clean; ZERO source and ZERO `.next/dev/types` errors (port 3000 was clear, no stale validator artifacts) |
| 2 | ESLint (whole project) | ✅ clean | `npx eslint .` exit 0, no output |
| 3 | Unit suite | ✅ **1376/1376 (78 files)** | `npx vitest run` — matches expected exactly, 0 failed / 0 skipped |
| 4 | Integration suite | ✅ **188/188 (14 files)** | `bash scripts/run-integration.sh` (resets + seeds local Supabase first) |
| 5 | Prod build | ✅ exit 0 | `NEXT_QA_DIST_DIR=.next-qa-t10-verify next build` — admin routes dynamic (`ƒ`), storefront SSG/dynamic unchanged, middleware compiled (Edge Web-Crypto OK). Rebuilt after each reseed per SEQUENCING RULE; `git checkout -- tsconfig.json` after each build |
| 6 | Live prod smoke (unauth) | ✅ all correct | `/`=200, `/en`=200, `/admin`=307→login, `/admin/login`=200, `/admin/settings`(unauth)=307→login, `/admin/`=308→`/admin`; **0 admin-markup matches** in unauth `/admin` body |
| 7 | E2E storefront regression (PROD build, R2) | ✅ **78/78** | chromium 39/39 + mobile 39/39 (payment 8 + checkout 24 + cart 46 across both projects), reseed + rebuild between projects. Middleware `/admin` branch does NOT regress storefront |
| 8 | E2E admin unauth-guard (PROD build) | ✅ **6/6** | `admin.spec.ts -g "unauthenticated route protection"` (3 tests × chromium+mobile) on the authoritative prod server |
| 9 | E2E admin authed (DEV server, serial) | ✅ **30/30** | Full `admin.spec.ts --workers=1` on a fresh dev server (Secure cookie can't ride plain HTTP on `next start` — documented product behavior). All 15 tests × chromium+mobile pass |
| 10 | Migrations | ✅ 0001..0010 (no 0011) | `ls supabase/migrations/` — T10 added none (AC-14). `supabase db reset` applied all 10 clean; seed produced the full fixture (30 products, 70 variants, singleton store_settings) |
| 11 | Secret: `.env.local` not tracked | ✅ | `git check-ignore .env.local` matches; `git ls-files .env.local` = 0 (never committed) |
| 12 | Secret: no `NEXT_PUBLIC_ADMIN_*` | ✅ | Only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public; the 3 admin vars (`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_SESSION_SECRET`) carry no public prefix |
| 13 | Secret: hash `$`-escaped in `.env.local` | ✅ | 5 backslash-escaped `$` present (the QA P1 fix — `scrypt\$N\$r\$p\$salt\$hash`); prevents dotenv `$`-expansion collapse |
| 14 | Middleware: `/admin` branch before next-intl | ✅ | `src/middleware.ts:45-46` `isAdminPath()` returns via `handleAdmin()` BEFORE `intlMiddleware(request)` at :50 — read the file directly |
| 15 | Cookie flags (AC-2/6/13) | ✅ | `actions.ts:82-87` set: `httpOnly:true`, `sameSite:"lax"`, `secure:IS_PRODUCTION`, `path:/admin`, `maxAge:getSessionMaxAgeSeconds()`; logout `maxAge:0` (:98-103) |
| 16 | HMAC-SHA256 + timingSafeEqual (AC-4) | ✅ | `session.ts:16,31,48` — `createHmac("sha256",...)` + `timingSafeEqual`, never `===` |
| 17 | Session max-age default 8h (AC-5) | ✅ | `constants.ts:47` `DEFAULT_SESSION_MAX_AGE_SECONDS = 8*60*60`, env-overridable |
| 18 | DB left pristine | ✅ | Final reseed: store_settings @ seed ($500 flat / $10000 threshold / MXN), 0 orders, 70 variants, MILANO stock 8/11 |

---

## Acceptance Criteria Final Check

| # | Criterion | Code | Test / Live Evidence | Verdict |
|---|-----------|------|----------------------|---------|
| AC-1 | Unauth `/admin/*` (except login) → redirect, no markup | `middleware.ts:69-71`, `(app)/layout.tsx` guard | e2e unauth 6/6 + live curl: `/admin`,`/admin/settings`=307→login, 0 admin-markup in body | ✅ |
| AC-2 | Correct creds → HttpOnly/Lax/Secure(prod)/Path=/admin cookie → /admin; case-insensitive email; constant-time pw | `actions.ts:82-89`, `auth.ts` (case-insensitive email, `timingSafeEqual`) | e2e "correct creds land…scoped HttpOnly cookie" (30/30 serial); unit `auth.test.ts`/`session.test.ts` | ✅ |
| AC-3 | Wrong email OR pw → single generic error, no enumeration, timing parity | `actions.ts` generic error, `auth.ts` dummy-hash | e2e "wrong password"/"unknown email…SAME error"; unit `auth.test.ts` timing-floor + parity | ✅ |
| AC-4 | Tamper-evident HMAC-SHA256; forged/truncated fails `timingSafeEqual` | `session.ts:16,31,48`; `session-edge.ts` | unit `session.test.ts`, `session-parity.test.ts` (Node↔Edge identical), `session-edge.test.ts` | ✅ |
| AC-5 | Bounded lifetime 8h; expired-but-signed rejected server-side | `constants.ts:47`; `session-payload.ts` `isWithinMaxAge` | unit `session.test.ts` "expired-but-signed", `session-payload.test.ts` | ✅ |
| AC-6 | Logout clears cookie (maxAge=0) → login; AC-1 holds after | `actions.ts:98-103` | e2e "after logout, /admin redirects to login again" | ✅ |
| AC-7 | Authed `/admin/login` → /admin | `middleware.ts:61-64` + `login/page.tsx` | e2e "while authed, /admin/login redirects to /admin" | ✅ |
| AC-8 | Settings renders 4 fields prefilled, money in pesos | `settings/page.tsx` (`centsToPesos().toFixed(2)`) | e2e "settings form is pre-populated" (flat=500.00) — passes serially (see anomaly note) | ✅ |
| AC-9 | Save → admin-client write → cache bust → success; storefront reflects | `store-settings.ts:updateStoreSettings` (`updateTag`); `actions.ts` | e2e round-trip: change flat→save→success→reload persists→cart shipping shows 742.00→restore (serial); integration UPDATE+updated_at; unit `actions.test.ts` | ✅ |
| AC-10 | Reject blank/long name, bad email, negative/non-numeric/>2dp/overflow money; field errors; form stays filled | `settings-input.ts` strict parser | e2e "thousand-separator rejected", "blank name rejected"; unit `settings-input.test.ts`; integration DB CHECKs | ✅ |
| AC-11 | Nav shell: store name, Settings live+active, Products/Orders disabled placeholders, logout | `admin-shell.tsx`, `admin-nav.tsx`, `constants.ts` `ADMIN_NAV_ITEMS` | e2e "Settings live+active; Products/Orders disabled" (aria-current/aria-disabled) | ✅ |
| AC-12 | Secrets only via env.ts, server-only, never NEXT_PUBLIC_, absent from client bundle | `env.ts` `getAdminEnv()` | unit `secret-exposure.test.ts`; live: no `NEXT_PUBLIC_ADMIN_*`; Security stage confirmed 0 admin symbols in client chunks | ✅ |
| AC-13 | Distinct cookie name (`posturpro_admin_session`), Path=/admin, storefront byte-unchanged | `constants.ts`, `middleware.ts` | e2e cookie-name assertion; storefront regression 78/78; `/`&`/en`=200 throughout | ✅ |
| AC-14 | No migration (row+CHECKs+trigger already exist) | — | `ls migrations/` = 0001..0010 only; integration confirms singleton+CHECKs live | ✅ |
| AC-15 | Login rate-limited per IP; generic error; env-flag escape hatch | `login-rate-limit.ts` (shared sliding-window) | unit `login-rate-limit.test.ts` (cap/release/strict `==="1"` hatch) | ✅ |
| AC-16 | tsc strict, ESLint max-lines, no `any`/`!`, session fns ≤30 lines | all admin files <400 lines | `tsc --noEmit` 0 errors; `eslint .` clean; largest admin file 344 lines | ✅ |

**16/16 acceptance criteria met with concrete evidence.** All 10 documented edge cases
are covered (verified in QA + Security reports and cross-checked against code:
forged/expired/rotated cookie, missing env, concurrent save, money 0/locale-formatted,
missing row, direct-POST-without-session, `/admin/` slash/case variants).

---

## Report Summary

| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review (S5) | 8.5/10 APPROVE-WITH-FIXES | 0 critical; 4 MAJOR = test-coverage gaps around already-correct auth invariants; all closed in S6 |
| Fix (S6) | — | 4/4 MAJOR + 5/7 MINOR + 3/4 NIT fixed; 4 items SKIPPED with justification (within-spec / platform / portable) |
| QA (S7) | PASS / HIGH | AC 16/16, edges 10/10; caught + fixed a real **P1** (`$`-mangled password hash → login 100% broken), regression-locked by e2e |
| UX (S8) | 9.5/10 | Every spec'd state renders/reachable; 2 className-only fixes (double-dim, disabled-label contrast); 0 a11y holes |
| Security (S9) | SECURE | 0 critical / 0 high; 3 medium + 3 low accepted residuals; 0 secrets leaked; implemented dev-only fail-fast for the mangled-hash P1 |
| Architecture (S10) | 9/10 APPROVE | Clean layering + acyclic admin graph; T11/T12 seams real; 2 items gated for **T12** (revocation, `/api` matcher) |
| Hacker (S11) | SKIPPED | medium complexity — Security + Arch at full depth substitute for chaos testing on this trust boundary |

---

## E2E Anomaly Investigated (why the verdict is still SHIP)

During the authoritative run I hit two DIFFERENT intermittent admin-e2e failures.
I root-caused BOTH to **test-harness issues, not T10 product defects**, and proved
the fix:

1. **First run (mobile only, 29/30):** the AC-9 round-trip test's `add-to-cart`
   button rendered `disabled` with label "Agotado". Diagnosis: the running **dev
   server held a stale route/data cache** of the product page (MILANO stock depleted
   by earlier storefront order-placing e2e in the same session) even after I reseeded
   the DB — the exact cache-staleness class the SEQUENCING RULE warns about, here on
   the dev server. Direct DB query confirmed MILANO stock was actually 8/11 (fresh);
   only the server's cache was stale.

2. **Second run (both projects, 28/30):** a *different* test failed — AC-8
   pre-population read flat rate `742.00` instead of the seed `500.00`. Diagnosis:
   **parallel-worker race on the shared `store_settings` singleton** — Playwright's
   `fullyParallel: true` (chromium + mobile + workers) let the AC-9 round-trip test
   (which mutates the flat rate to 742.00 then restores it) run concurrently with the
   AC-8 read test. Direct DB query confirmed the row was restored to 500.00.

3. **Proof:** on a **fresh dev server + fresh seed + `--workers=1` (serial)**, the
   full `admin.spec.ts` passed **30/30** (both chromium + mobile). This matches QA's
   documented 30/30 and confirms the auth/settings/cache-bust/storefront-reflection
   product logic is correct. The failures were shared-mutable-state test isolation +
   dev-server cache staleness, reproducible only under parallel/stale-cache execution.

This is a genuine **test-quality** finding (logged below as a residual), but it does
not gate the release: the feature is correct, and the suite is green under the
correct, documented execution discipline (fresh server, serial, reseed-between).

---

## Residual Risks Accepted

All previously documented; none blocking. Verified they are documented and did not
re-block on them:

- **SEC-M-1** — Stateless session, no server-side revocation. Stolen cookie valid
  ≤8h. In-spec (Phase-1). Mitigated by HttpOnly + Secure-in-prod + 8h max-age +
  secret-rotation lever. **Arch flags this as a T12 GATE** (refund-capable session
  must become revocable) — carry forward to T12 planning.
- **SEC-M-2** — Per-IP best-effort limiter; IP-rotation/XFF-spoof bypass. In-spec;
  real defense is scrypt cost + password entropy; `maxKeys=10,000` bounds memory-DoS.
- **SEC-M-3** — `ADMIN_SESSION_MAX_AGE_SECONDS` Edge/Node override drift. Fail-safe
  (Node authoritative; an Edge-default gate only ever forces a re-login, never grants).
- **SEC-L-1** — dev fixture password in `e2e/admin.spec.ts` (ensure deploy pw ≠ fixture).
- **SEC-L-2** — client-bundle secret scan should gate on a PROD build in CI (dev scan
  clean; prod scan is the definitive gate).
- **SEC-L-3** — case-sensitive `/admin` matcher (`/Admin`→404, documented non-bypass).
- **Test isolation (NEW, this stage)** — `admin.spec.ts` AC-8 and AC-9 tests share
  the mutable `store_settings` singleton; under `fullyParallel` they race. Run admin
  e2e serially (`--workers=1`) or `test.describe.serial`, and restart the dev server /
  reseed before it. LOW risk; test-only; does not affect product behavior.
- **Pre-existing** — cross-project mobile stock-depletion e2e race (reseed-between);
  2 moderate transitive `postcss` advisories (via `next`, build-time, not T10);
  payment-panel unit flake (passed here in the full 1376/1376 run).
- **Env-gated blocked-on-user** (unchanged by T10) — live MP/email side effects use
  placeholder creds; authed prod-build e2e over HTTPS not run (Secure-cookie
  constraint is intentional).

---

## SHIP Criteria Checklist

- [x] All tests pass — unit 1376/1376, integration 188/188, storefront e2e 78/78,
      admin unauth 6/6, admin authed 30/30 (serial). Zero product-code failures.
- [x] All acceptance criteria verified in code — 16/16 with concrete evidence.
- [x] Quality score ≥ 8/10 — 9/10.
- [x] No critical security vulnerabilities — 0 critical / 0 high (Security: SECURE).
- [x] No critical bugs remaining — the P1 (`$`-mangled hash) was found + fixed + regression-locked.
- [x] UX states complete — loading/empty/error/success all present (UX 9.5/10, 0 holes).
- [x] Mobile responsive verified — no h-scroll 320–1440px; admin e2e green on Pixel 7.
- [x] Auth enforced and data scoped — defense-in-depth (Edge → Node layout → per-action re-verify); single-owner singleton, no IDOR; secrets server-only, absent from client bundle.

No NO-SHIP condition is present.

---

## What Was Built

A self-managed, HMAC-SHA256-signed, HttpOnly session-cookie admin authentication
system (deliberately NOT Supabase Auth) fronting a locale-free `/admin` shell with a
Store Settings editor. Defense-in-depth route protection (Edge Web-Crypto middleware
gate → Node `node:crypto` layout guard → per-action re-verification), a single-owner
scrypt credential check with dummy-hash timing parity and anti-enumeration, a per-IP
rate limiter, and a strict pesos↔cents money parser. Store settings write through the
RLS-bypass admin client and bust the storefront cache tag so the footer/checkout
reflect changes on next render. Zero new dependencies, no schema migration.

---

## Summary

T10 is a correct, security-literate, well-architected implementation of the app's top
trust boundary that passes every gate under the documented execution discipline; the
only anomalies encountered were test-harness isolation/caching artifacts (proven, not
product defects) and pre-accepted residuals correctly deferred to Phase 2 / T12.
**SHIP.**
