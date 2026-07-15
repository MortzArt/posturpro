# Security Audit: T10 — Admin foundation

**Stage 9 (Security) — FULL DEPTH.** This task IS the app's top trust boundary
(admin auth). Audited as if hostile: every input, every route, every response.

## Summary
- Files audited: 22 (all of `src/lib/admin/*`, `src/app/admin/*`, `src/components/admin/*`, `src/middleware.ts`, `src/lib/env.ts` getAdminEnv, `src/lib/store-settings.ts` updateStoreSettings, `src/lib/request/client-ip.ts`, `src/lib/rate-limit/sliding-window.ts`)
- Vulnerabilities found: 0 Critical, 0 High, 3 Medium, 3 Low
- Vulnerabilities fixed: n/a for Critical/High (none found); 1 QA-recommended hardening IMPLEMENTED
- **Secrets found: 0** (git history clean, `.env.local` gitignored + never committed, no `NEXT_PUBLIC_` admin var, zero admin refs in the client bundle)
- New high/critical dependencies introduced: **0** (T10 changed zero dependency manifests)

## Verdict: **SECURE**

The auth core is correct and defensible. The HMAC-signed cookie, scrypt login with
dummy-hash timing parity, defense-in-depth guard (Edge Web-Crypto → Node
`node:crypto` layout → per-action re-verify), strict money parser, and cookie flags
all hold up under adversarial review. S5's review + S6's fixes are verified intact
(re-read the code, not just the reports). No settled finding was re-litigated
without new evidence. The only code change made this stage is the QA-recommended
dev-only fail-fast guard for a dotenv-mangled password hash.

---

## Secrets Scan (entire repo + pipeline commits `41bf8c9..HEAD`)

| Check | Result |
|-------|--------|
| `.env.local` gitignored | ✅ `git check-ignore` matches |
| `.env.local` in git history | ✅ never committed (no log entries; no `.env*` tracked) |
| Real scrypt hash value in any tracked file | ✅ none |
| Real `ADMIN_SESSION_SECRET` value in any tracked file | ✅ none |
| `NEXT_PUBLIC_ADMIN_*` anywhere in src / `.env.local` | ✅ none (only a comment forbidding it + the secret-exposure test regex) |
| Pipeline commit diffs (`41bf8c9..HEAD`) for inline secrets | ✅ only the **dev fixture** password `posturpro-dev-2026` (see LOW SEC-L-1) |
| Admin secret / hash / dev-pw / `verifyCredentials` / `createSessionCookieValue` in built client chunks | ✅ zero matches (`node:crypto`, `scryptSync`, `timingSafeEqual`, cookie name, `ADMIN_EMAIL` value all absent from `.next/static`) |

**Client-bundle verification:** scanned the present `.next` build (contains 35 admin
route chunks, so it is a post-T10 build). Zero admin secrets, secret-derived values,
or server-only implementation symbols appear in any client chunk. Backed by
`secret-exposure.test.ts` (static-source: `server-only` guards present, no
`NEXT_PUBLIC_ADMIN_*`, no `"use client"` file imports `admin/auth|session|session-guard`
via alias OR relative path). **Residual (LOW):** the scanned build is `next dev`;
the authoritative CI artifact is a `next build` prod client scan — dev is *less*
tree-shaken, so a clean dev bundle is a conservative (stronger) signal, but a
prod-build grep should be the CI gate. Tracked as SEC-L-2.

## Dependency Scan (`npm audit`)
- Critical: 0 · High: 0 · Moderate: 2 · Low: 0
- The 2 moderates are `postcss <8.5.10` (GHSA-qx2v-qp2m-jg93, XSS via unescaped
  `</style>` in CSS stringify), **transitive via `next`** (`node_modules/next/node_modules/postcss`).
- **Pre-existing, NOT introduced by T10:** `git diff 41bf8c9..HEAD -- package.json package-lock.json` is empty — T10 added zero dependencies. The advisory is a build-time PostCSS path, not reachable from admin user input. Report to the arch/ops backlog; not a T10 blocker.

---

## OWASP Top 10 Pass (new surface)

| Category | Finding |
|----------|---------|
| A01 Broken Access Control | Defense-in-depth: Edge middleware gate (fast, Web-Crypto) → `(app)` layout authoritative `node:crypto` verify → every mutation `requireSession()` re-verifies. Direct POST to `saveStoreSettings` without a valid cookie → `redirect(login)`, DB untouched (unit + integration tested). No IDOR: single-owner, singleton row, no user-controlled id in any query. ✅ |
| A02 Cryptographic Failures | HMAC-SHA256 signed cookie (`timingSafeEqual`, never `===`); scrypt N=16384/r=8/p=1/keylen=64 (OWASP-aligned) with per-hash random salt; constant-time password compare. Empty/blank secret **cannot** produce a verdict (Node throws, Edge fails closed). ✅ |
| A03 Injection | No SQL/NoSQL injection: writes go through the Supabase client's parameterized `.update()`/`.insert()` — no string interpolation of user input. No command injection (no `child_process`). No dynamic imports/paths from input. Store name/email/money all pass the strict pure parser before the DB, and DB CHECKs are defense-in-depth. ✅ |
| A04 Insecure Design | Session lifetime bounded (8h, expired-but-signed rejected server-side). Rate-limit + expensive scrypt bound brute-force + CPU amplification. Missing-env fails closed, never "any password works." ✅ |
| A05 Security Misconfig | Cookie flags: HttpOnly + SameSite=Lax + Secure(prod) + Path=/admin + maxAge. `robots: noindex,nofollow` on the admin root layout. Errors never echo raw PG/stack (mapped enums + generic messages). ✅ |
| A06 Vulnerable Components | 0 new deps; 2 pre-existing transitive `postcss` moderates (above). ✅ |
| A07 Auth Failures | No user enumeration (dummy-hash timing parity on unknown email — proven by the timing-floor test, not just the boolean); single generic error; password never echoed back; rate-limited. ✅ |
| A08 Data Integrity | Cookie is tamper-evident (forged/truncated/wrong-secret/expired all rejected by BOTH verifiers — parity-tested). ✅ |
| A09 Logging | Login failures + rate-limit trips logged with client IP + ISO timestamp, **no credentials** (verified). ✅ |
| A10 SSRF / Open Redirect | **No open-redirect surface:** every `redirect()`/`NextResponse.redirect` target is a hardcoded constant (`ADMIN_ROOT_PATH`/`ADMIN_LOGIN_PATH`/`ADMIN_SETTINGS_PATH`). No `?next=`/return-URL param exists. No user-controlled URL reaches server-side `fetch`. ✅ |

---

## Session Attack Analysis

- **Replay after logout:** logout sets `maxAge=0` (browser drops the cookie) but the
  scheme is **stateless — there is NO server-side revocation list.** A cookie
  exfiltrated before logout remains cryptographically valid until its `iat + 8h`
  expiry. This is **by design and in-spec** (ticket "Out of Scope": no session
  revocation lists / device management in Phase 1) and mitigated by: HttpOnly
  (no JS theft), Secure-in-prod (no plaintext interception), 8h bounded lifetime,
  and the `ADMIN_SESSION_SECRET` rotation lever (invalidates ALL sessions at once,
  edge 3). Documented residual (SEC-M-1). Acceptable for a single-owner surface.
- **Fixation:** N/A — the cookie value is minted server-side on successful auth
  (`createSessionCookieValue`) from a fresh `iat`; a pre-auth attacker cannot plant
  a value that becomes valid, because any value they set fails the HMAC. ✅
- **Cookie scoping / path-traversal bypass:** `Path=/admin` is enforced by the
  browser on the *normalized* request path — `/admin/../x`, `%2e%2e`, and dot-segment
  tricks are collapsed by the browser/Next before path matching, so they cannot
  smuggle the cookie to a storefront route or evade the guard. The guard uses an
  exact `=== "/admin"` or `startsWith("/admin/")` on the already-normalized
  `nextUrl.pathname`. macOS-dev-vs-Linux-prod case sensitivity: `/Admin` (capital)
  is NOT matched by the admin branch → falls to next-intl → 404 (documented in
  `middleware.ts:29`); it cannot reach a real admin page because Next route
  resolution is case-sensitive in prod, so there is no lowercase-`/admin` page
  served for `/Admin`. **Not a bypass** (SEC-L-3 tracks the dev/prod note). ✅
- **Concurrent sessions:** stateless — multiple valid cookies coexist (single owner
  on multiple devices). Last-write-wins on the singleton settings row (edge 5).
  Acceptable. ✅

## Login / Brute-Force Analysis (real numbers)

- Rate limit: **10 attempts / 15-min window per IP** → **40/hour/IP**, **960/day/IP**.
- Each attempt runs a real scrypt derivation (measured **~30 ms** on this machine,
  N=16384) on EVERY path including unknown-email (timing parity + CPU cost as a
  credential-stuffing damper).
- Against a strong owner password (the dev fixture is 18 chars; a real deploy should
  use ≥ high-entropy), 40 guesses/hr is negligible. Even ignoring the limiter, scrypt
  cost + password entropy make online brute-force infeasible.
- **Lockout bypass via IP rotation:** the limiter is best-effort per-IP; an attacker
  rotating IPs (or spoofing XFF without a trusted edge) evades the per-IP cap. This is
  a **documented residual** (`client-ip.ts` trust model + `sliding-window.ts`
  best-effort note): the real defense against rotation is password entropy + scrypt
  cost, not the limiter (which exists to trim abuse rate + CPU amplification). The
  `maxKeys=10,000` ceiling bounds the memory-DoS from rotation. Acceptable per spec
  (SEC-M-2).
- **Timing side-channel (post-S6 re-verify):** confirmed. `verifyCredentials` selects
  the real vs dummy parsed hash WITHOUT short-circuiting and always runs
  `verifyAgainst` (scrypt); the boolean is composed at the end. Pinned by the
  timing-floor + parity test (`auth.test.ts`). Email `===` is a non-secret username
  compare (defended by the always-run scrypt) — acceptable (m-4, settled). ✅

---

## Client / Server Boundary (Next.js)

- Server components pass ONLY `storeName` to client forms (`login/page.tsx`,
  `(app)/layout.tsx`) — no secret, no internal shape crosses. ✅
- `constants.ts` is deliberately Next-import-free + non-secret (safe in Edge +
  client); secrets live ONLY in `env.ts` `getAdminEnv()` (`server-only` callers). ✅
- Settings read selects explicit columns (no `*` over-fetch); the write path maps
  raw PG errors to a friendly enum, never echoing them. ✅
- `session-edge.ts` correctly omits `import "server-only"` (it throws in the Edge
  bundle) and reads the secret from `process.env` without ever exporting it. ✅

---

## Vulnerability Findings

### CRITICAL — none
### HIGH — none

### MEDIUM

#### SEC-M-1: Stateless sessions have no server-side revocation (stolen-cookie window)
- **Type**: A07 Identification & Authentication Failures (design residual)
- **File**: `src/lib/admin/session.ts`, `src/app/admin/actions.ts` (logout)
- **Description**: Logout clears the cookie client-side (`maxAge=0`) but there is no
  server-side blocklist; a cookie stolen before logout stays valid until `iat + 8h`.
- **Exploit**: Attacker who exfiltrates the cookie (e.g. via a separate XSS on the
  admin origin — none found here) could replay it post-logout for up to 8h.
- **Impact**: Bounded (8h) unauthorized admin access if a cookie is already stolen.
- **Fix / Disposition**: **In-spec** (revocation lists explicitly Out of Scope, Phase
  1). Mitigations in place: HttpOnly, Secure-in-prod, 8h max-age, `ADMIN_SESSION_SECRET`
  rotation as the global logout lever. **Recommendation (Phase 2):** shorten max-age
  or add a server-side session-version/`iat`-floor stored alongside the secret to
  enable per-event invalidation.
- **Status**: OPEN (accepted residual, documented)

#### SEC-M-2: Rate limiter is per-IP + per-instance best-effort (IP-rotation bypass)
- **Type**: A04 Insecure Design (documented residual)
- **File**: `src/lib/admin/login-rate-limit.ts`, `src/lib/request/client-ip.ts`
- **Description**: Per-IP sliding window; an attacker rotating IPs (or spoofing XFF
  behind an untrusted edge) evades the 40/hr cap. Per-instance memory means a
  multi-instance deploy multiplies the effective cap.
- **Exploit**: Distributed credential-stuffing at a higher aggregate rate than 40/hr.
- **Impact**: Increases online-guess throughput; still gated by scrypt cost + password
  entropy (the real defense).
- **Fix / Disposition**: **In-spec** ("best-effort limiter", single-owner surface).
  `maxKeys=10,000` bounds memory-DoS from rotation. **Recommendation (deploy):** put
  admin behind a trusted edge/WAF that overwrites XFF, and/or a shared-store limiter
  if admin ever becomes multi-tenant.
- **Status**: OPEN (accepted residual, documented)

#### SEC-M-3: `ADMIN_SESSION_MAX_AGE_SECONDS` override may differ Edge vs Node
- **Type**: A05 Security Misconfiguration (UX-only, non-hole)
- **File**: `src/lib/admin/constants.ts` (`getSessionMaxAgeSeconds`), read by both verifiers
- **Description**: A non-`NEXT_PUBLIC_` env override read via `process.env` in the Edge
  runtime is not guaranteed available on every platform; if set-but-unreadable in Edge,
  the fast gate uses the 8h default while Node honors the override.
- **Impact**: **Fail-safe only** — an Edge gate using the shorter default merely
  redirects a still-Node-valid session to re-login; it NEVER grants access Node would
  deny. Node is authoritative.
- **Fix / Disposition**: No code change (matches S5 m-3 SKIPPED rationale). **Ops
  runbook:** if tuning the override, env-allow-list it for middleware or accept that
  Node binds it authoritatively.
- **Status**: OPEN (accepted, ops-config)

### LOW

#### SEC-L-1: Dev fixture password committed in `e2e/admin.spec.ts`
- **Type**: A05 (informational)
- **File**: `e2e/admin.spec.ts:27` (`const ADMIN_PASSWORD = "posturpro-dev-2026"`), also in `tasks/dev-done.md`
- **Description**: The local-dev password is inline in the e2e spec. It is NOT a
  production secret — the real hash/secret live only in gitignored `.env.local`, and
  this matches the existing repo pattern (`e2e/checkout.spec.ts`, `e2e/payment.spec.ts`
  use the same inline-test-cred convention).
- **Impact**: None in production; the fixture only authenticates against the local dev
  hash. Deploys MUST use a distinct, high-entropy password (dev-done.md documents the
  hash-gen command).
- **Status**: OPEN (accepted — dev fixture, consistent with repo convention). Ensure
  the deploy password ≠ the dev fixture.

#### SEC-L-2: Client-bundle secret check should gate on a PROD build in CI
- **Type**: A05 (test rigor)
- **File**: `src/lib/admin/secret-exposure.test.ts`
- **Description**: The exposure test is static-source; the runtime bundle scan this
  stage ran was against a `next dev` build. Both are clean, but the definitive gate is
  a `next build` client-chunk grep for admin secrets.
- **Status**: OPEN (recommendation — add a prod-build client-scan step to CI).

#### SEC-L-3: `/admin` matcher is case-sensitive (macOS dev vs Linux prod)
- **Type**: A01 (documented, non-hole)
- **File**: `src/middleware.ts:29`
- **Description**: `/Admin` (capital) is not matched by the admin branch → next-intl →
  404. Not a bypass (no lowercase `/admin` page is served for `/Admin`; Next routing is
  case-sensitive in prod). Behavior is documented inline.
- **Status**: OPEN (accepted, documented).

---

## Fix Applied This Stage

### QA P1 hardening — dev-only fail-fast on a mangled `ADMIN_PASSWORD_HASH` (IMPLEMENTED)
- **Why**: QA found a P1 where Next's dotenv `$`-expansion silently collapses the
  178-char scrypt hash to `scrypt6384`, making login 100% broken with the misleading
  "Correo o contraseña incorrectos" and no error. QA recommended a dev-only startup
  parse-check; I concur — it converts a silent, high-cost misconfig into a loud,
  actionable failure.
- **What**: Added `assertAdminPasswordHashFormat(passwordHash?)` in
  `src/lib/admin/auth.ts` — reuses the existing `parsePasswordHash` (DRY), returns a
  no-op for a missing/blank hash (that path is already `MissingEnvVarError`), and
  throws with backslash-escape remediation guidance when a PRESENT hash fails the
  `scrypt$N$r$p$saltHex$hashHex` (6-field) shape. Invoked ONCE at module load, gated
  `if (process.env.NODE_ENV !== "production")` — **zero cost on the production request
  path** (the guard branch is skipped in prod; the format is validated by deploy
  hash-gen tooling).
- **Server-only**: the function lives in the already `server-only`-guarded `auth.ts`;
  no new client surface, no secret exposure.
- **Verified against real config**: the current `.env.local` hash parses to 6 fields
  (`scrypt` tag) → the guard does NOT false-fire on the working dev environment.
- **Tests**: added 6 cases to `src/lib/admin/auth.test.ts`
  (`assertAdminPasswordHashFormat`): well-formed passes; missing/blank/whitespace is a
  no-op; the exact `scrypt6384` corruption throws with the "does not parse" message;
  the throw includes "backslash-escaped" guidance; wrong-tag/wrong-field-count throw;
  default reads `process.env.ADMIN_PASSWORD_HASH`.

---

## Checklist Results
| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 leaked; `.env.local` gitignored + never committed; only a dev fixture pw (SEC-L-1) |
| Env var exposure (NEXT_PUBLIC / client) | ✅ | No `NEXT_PUBLIC_ADMIN_*`; zero admin secrets/symbols in client bundle |
| Injection | ✅ | Parameterized Supabase writes; strict pure parser; DB CHECKs; no cmd/path/SSRF |
| Auth / AuthZ | ✅ | Defense-in-depth guard; per-action re-verify; no IDOR; fail-closed on missing env |
| Client/server boundary | ✅ | Only `storeName` crosses; server-only guards intact |
| Data exposure | ✅ | Explicit column select; mapped error enums; no stack/PG leak; robots noindex |
| CORS / CSRF | ✅ | Server actions (Next origin-check CSRF protection); no custom public API route; no CORS `*`+credentials |
| Dependencies | ✅ | 0 new; 0 new high/critical; 2 pre-existing transitive `postcss` moderates |

---

## Verification After Fix
- `npx tsc --noEmit`: **0 source errors** (only the known-stale `.next/dev/types/validator.ts` route-type artifacts from a running dev server — unrelated, no routes/config touched).
- `npx eslint src/lib/admin/auth.ts src/lib/admin/auth.test.ts`: **clean** (exit 0).
- Unit: **1376/1376 (78 files)** — baseline 1370 + 6 new `assertAdminPasswordHashFormat` cases. 0 failed, 0 skipped.
- DB left pristine (no reset/seed run). No stray servers started. No git commit. `pipeline-state.md` untouched.

## Residual Risks (carry forward)
- SEC-M-1 stolen-cookie replay window (8h, in-spec; Phase-2 revocation).
- SEC-M-2 IP-rotation rate-limit bypass (best-effort, in-spec; deploy behind trusted edge).
- SEC-M-3 Edge/Node max-age override drift (fail-safe, ops-config).
- SEC-L-1 dev fixture pw (ensure deploy pw ≠ fixture); SEC-L-2 add prod-build client scan to CI; SEC-L-3 case-sensitive matcher (documented).
- Pre-existing `postcss` moderate ×2 (transitive via `next`) — ops/arch backlog.
