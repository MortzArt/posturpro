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

---
---

# Security Audit: T11 — Admin: Product Management

**Stage 9 (Security) — FULL DEPTH.** T11 adds the privileged catalog-WRITE
surface behind the T10 admin auth, plus two new real attack surfaces the T10
audit did not cover: **file upload** (to a public storage bucket) and **CSV
import/export**. Audited as hostile: every upload byte, every CSV cell, every
client-supplied id, every new anon-reachable surface. Ran parallel with Stage 10
(Arch) — did NOT touch `architecture-review.md` or `pipeline-state.md`.

## Summary
- Files audited: 24 (all of `src/lib/admin/{products,taxonomy,inventory,qa,csv}/*`,
  `src/app/admin/(app)/{products,taxonomy,qa}/*` incl. the export route,
  `supabase/migrations/0011_*.sql`, `supabase/config.toml` storage enable,
  `next.config.ts`, `vitest.integration.config.ts`, `src/lib/supabase/admin.ts`,
  `src/lib/config/admin-products.ts`).
- Vulnerabilities found: **0 Critical, 0 High, 2 Medium, 3 Low** (all new-surface).
- Vulnerabilities fixed: **n/a (no Critical/High found)** — no code change made this stage.
- **Secrets found: 0** (git history clean, `.env.local` gitignored + never committed,
  no `NEXT_PUBLIC_ADMIN_*`, and a **prod-build client-bundle scan** — this stage
  finally ran the `next build` grep SEC-L-2 asked for — shows zero admin secrets/symbols).
- New high/critical dependencies introduced: **0** (`git diff` on `package.json` over
  the T11 window is empty — the zero-dep constraint held).

## Verdict: **SECURE**

The T11 write surface is defensible. File upload sniffs magic bytes (SVG/polyglot
rejected), stores under a non-guessable server-derived path + server-derived
content-type, and caps size server-side. CSV import bounds bytes-before-parse and
rows-after-parse, re-parses server-side on confirm (never trusts a client plan),
and export applies formula-injection escaping end-to-end. The `0011` RPC has clean
`SECURITY DEFINER` hygiene (`search_path=''`, schema-qualified, service_role-only
execute, in-SQL bounds). No new anon-reachable surface leaks privileged data. The
S5 review's load-bearing security fixes were re-verified against the code (not the
report) and hold. Every mutating action re-verifies the session before any DB work.

---

## Prod-Build Client-Bundle Scan (closes T10 SEC-L-2)

Ran `NEXT_QA_DIST_DIR=.next-sec-scan next build` (exit 0; tsconfig restored via
`git checkout`; scan dir removed after). Grepped `.next-sec-scan/static/**` (the
authoritative prod client chunks) for every server-only secret + symbol:

| Pattern | Client-chunk hits |
|---------|-------------------|
| `SUPABASE_SECRET_KEY` | **0** |
| `service_role` | **0** |
| `ADMIN_SESSION_SECRET` | **0** |
| `ADMIN_PASSWORD_HASH` | **0** |
| `createAdminClient` | **0** |
| `record_inventory_adjustment` | **0** |
| `scryptSync` / `timingSafeEqual` | **0** |
| `verifyCredentials` / `createSessionCookieValue` | **0** |
| `NEXT_PUBLIC_ADMIN_*` | **0** |

**AC-34 verified on a real prod build.** The `import "server-only"` guard on
`admin.ts` + all write/session modules holds; the client components that reference
write modules do so via `import type` (type-erased). SEC-L-2 (T10) is now closed
for T11's surface — recommend wiring this exact grep into CI.

## Secrets Scan (repo-wide, T11 window)
- `.env.local` gitignored (`git check-ignore` matches); no `.env*` tracked; `git log
  --all -- '.env*'` empty (never committed).
- Only high-entropy literals in the tree are the **public Supabase local-demo JWTs**
  (`iss: supabase-demo`) in test/e2e fixtures (`tests/integration/*`, `e2e/*`) — the
  documented default keys shipped by `supabase start`, not sensitive. (LOW SEC-T11-L-3.)
- All prod secrets flow through `requireEnv()` in `src/lib/env.ts`
  (`SUPABASE_SECRET_KEY`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`) — no literals,
  none `NEXT_PUBLIC_`-prefixed.

## Dependency Scan
- `npm audit`: **Critical 0 · High 0** · Moderate 2 (pre-existing transitive `postcss`
  via `next`, unchanged from T10) · Low 0.
- T11 added **0 runtime dependencies** (CSV parser/generator hand-rolled; drag/tree/
  stepper hand-rolled; shadcn primitives vendored as source). `git diff` on
  `package.json`/lockfile over the T11 window is empty.

---

## Audit Priority 1 — FILE UPLOAD (highest risk) — PASS

Path: `image-actions.uploadImageAction` → `image-write.uploadProductImage`
(`src/lib/admin/products/image-write.ts`).

- **Magic-byte sniff, not extension/MIME trust.** `validateFile` first rejects any
  `file.type` not in the 3-item allow-list, then **sniffs the leading 12 bytes**
  (`sniffImageType`: JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `RIFF….WEBP`) and returns
  the **sniffed canonical MIME**. A file whose bytes match no allowed image is rejected
  (`bad-type`). **SVG is deliberately absent** from the sniffer → cannot be stored.
- **Polyglot / stored-XSS defense.** The stored object's `contentType` AND path
  extension both derive from the **sniffed bytes**, never from client `file.type`
  (line 100–104). A GIF+JS / image+HTML polyglot that begins with valid JPEG/PNG/WEBP
  magic is stored as `image/jpeg|png|webp` with a `.jpg/.png/.webp` extension, so the
  public bucket serves it with an image content-type — a browser will not execute it as
  HTML/JS. A file whose HTML/script is at the FRONT fails the magic-byte sniff. No
  content-type/extension is attacker-controlled → no drive-by via the public URL.
- **Size cap enforced server-side.** `file.size <= 0 || file.size > IMAGE_MAX_BYTES`
  (5 MB) before any buffer work.
- **Path construction — no traversal, no overwrite.** `path = ${productId}/${randomUUID()}.${ext}`
  — the filename is a server-minted UUID (non-guessable, collision-free), and `upsert:false`
  makes an overwrite of another product's object impossible even on a UUID collision. The
  `productId` prefix is not attacker-shaped into `../` because it is only ever a segment,
  and Supabase Storage rejects path traversal in object keys.
- **Orphan cleanup can't delete arbitrary objects.** `removeStorageObject` derives the
  key by slicing AFTER the literal `/product-images/` marker of the row's OWN stored
  `url`; a non-bucket URL (e.g. a seeded picsum URL) returns early. Delete is always
  scoped to `.eq("id", imageId).eq("product_id", productId)` first, so the row (hence the
  URL) is the product's own. No arbitrary-object-delete primitive is exposed.
- **Bucket policy (0011).** `storage.buckets` insert is `public:true` (public READ).
  **No `storage.objects` policy grants anon/authenticated INSERT/UPDATE/DELETE** → writes
  are impossible except via the service_role admin client (which bypasses storage RLS).
  Public read is by-design (same posture as the pre-existing picsum URLs; `next/image`
  needs it). ✅

## Audit Priority 2 — CSV IMPORT / EXPORT — PASS

- **DoS / memory bound.** `readCsvText` rejects `size===0` and `size > CSV_MAX_BYTES`
  (5 MB) **before** `arrayBuffer()`, so the in-memory buffer is bounded. After parse,
  `rows-1 > CSV_MAX_ROWS` (5 000) is rejected with zero writes. The parser is a single-pass
  O(n) state machine over plain text — **no compression, no zip-bomb amplification**.
- **Formula injection on EXPORT — escaping verified applied end-to-end.** A product name
  authored as `=SUM(1)` (via any write path) is exported through `generateProductsCsv` →
  `generateCsv` → `escapeCsvCell`, which prefixes a `'` for leading `= + - @` **and** TAB
  (0x09) / CR (0x0D) (the m-2 fix), then RFC-4180-quotes. Confirmed every cell routes
  through `escapeCsvCell` (`csv-parse.ts:115`) and the export uses `generateCsv`
  (`csv-generate.ts:57`). ✅
- **Confused-deputy via taxonomy-by-slug.** A CSV row references brand/style/category by
  **slug**, resolved against the KNOWN slug set in the dry-run (`resolveTaxonomy`/
  `resolveCategories` throw a per-row error on an unknown slug — never silent creation).
  The confirm path re-resolves slug→id from live maps; a row can only link to taxonomy that
  already exists, and only for the single owner's own catalog. No unintended-link primitive.
- **Client plan is never trusted.** `confirmImportAction` RE-PARSES the uploaded file
  server-side and re-runs the diff; it does not accept a client-supplied row plan. Both
  dry-run and confirm `requireSession()` first.
- **Money/stock strictness.** Thousand-separator money (`"1,500.00"`), `NaN`/negative stock,
  bad status/slug are per-row errors surfaced in the dry-run; good rows still commit
  (resilient batch); one bad row never aborts, with within-row M2M atomicity (M-3). ✅

## Audit Priority 3 — RPC `record_inventory_adjustment` (0011) — PASS

- `SECURITY DEFINER` + `set search_path = ''` + **every** table reference schema-qualified
  (`public.products`, `public.product_variants`, `public.inventory_adjustments`) → no
  search-path hijack.
- Grants: `revoke all … from public` + `grant execute … to service_role` ONLY. PostgREST
  would otherwise expose an RPC to `anon`/`authenticated`; the explicit revoke-from-public
  blocks anon/authenticated invocation. The ledger table has RLS enabled, **no policies**,
  and `grant all … to service_role` only → not anon-reachable for read or write.
- **In-SQL input validation** (independent of the app parser): reason `btrim` length 1..500
  (`check_violation`); `p_delta`/`p_absolute` both-null rejected; target `for update`
  row-lock (serializes vs a T7 checkout decrement); negative result rejected BEFORE the write
  with `check_violation`; the `resulting_stock >= 0` table CHECK is the backstop. ✅

## Audit Priority 4 — EXPORT ROUTE (`products/export/route.ts`) — PASS

- **Double-guarded.** Middleware covers `/admin/*` AND the handler self-guards at entry:
  `if (!(await hasValidAdminSession())) return 401` before ANY catalog read (AC-34). A
  direct unauth GET returns `401 "No autorizado"` and never dumps the catalog.
- **Response headers.** `Content-Type: text/csv; charset=utf-8`, `Content-Disposition:
  attachment; filename="productos-YYYY-MM-DD.csv"`, `Cache-Control: no-store`. Filename is a
  server-built ISO date (no user input, no header-injection vector).
- **Data scope (documented, intentional).** Export includes draft/archived products (by
  design — the owner's working catalog) AND `cost_price` (the internal cost). This is the
  Owner's own private admin export behind auth — cost is legitimately the owner's data. It
  does NOT leak customer/order data or the `cost_price` to any storefront/anon path (the
  storefront reads `products_public`, which omits `cost_price_cents`). Documented residual
  SEC-T11-L-1 (be explicit that the export carries cost). ✅
- Errors return a generic `"No se pudo exportar."` + server-side log; no PG/stack leak.

## Audit Priority 5 — ADMIN WRITE SURFACE — PASS

**Every mutating action `requireSession()` BEFORE any DB work / use of input** (verified
by reading each file, not the report):

| Action | File | requireSession first? |
|--------|------|-----------------------|
| `saveProductAction` (create/update) | `products/actions.ts` | ✅ |
| `duplicate` / `archive` / `delete` product | `products/actions.ts` | ✅ |
| `uploadImageAction`, `reorderImagesAction`, `setCoverAction`, `setImageVariantAction`, `deleteImageAction` | `products/image-actions.ts` | ✅ (all 5) |
| `saveVariantsAction` | `products/variant-actions.ts` | ✅ |
| `adjustInventory` | `products/inventory-actions.ts` | ✅ |
| `dryRunImportAction`, `confirmImportAction` | `products/csv-actions.ts` | ✅ |
| `saveBrand/Style/Tag/Category`, `toggleActive`, `deleteTaxonomy` | `taxonomy/actions.ts` | ✅ |
| `answerQuestion`, `setPublished`, `deleteQuestion` | `qa/actions.ts` | ✅ |
| CSV export | `products/export/route.ts` | ✅ (self-guard 401) |

- **Mass-assignment: NOT present.** Every action reads named FormData keys explicitly
  (`str("name")`, `formData.getAll("category_ids")`, `formData.get("file")`) and maps to an
  explicit column object in the write layer — no FormData/object spread reaches a DB write.
  Extra client fields are ignored. `uploadImageAction` reads only `file`.
- **Client-supplied ids into PostgREST filters.** All ids flow into **parameterized
  `.eq("id", value)`** calls (never `.or()`/`.filter()` string interpolation). See below —
  this is why the un-UUID-validated ids are NOT a Critical/High hole on this single-owner
  surface.
- **Error messages.** Every write layer maps PG errors to a friendly enum
  (`23505`→duplicate, `23514`/`P0001`→cycle, `23503`→restrict, else `write-failed`) and logs
  the raw cause server-side. No raw PG/SQL/stack/path reaches the client. ✅

## Audit Priority 6 — Storefront / anon exposure (new surface) — PASS

- **`inventory_adjustments`** — RLS on, no policies, service_role-only grant → not
  anon-reachable via PostgREST. ✅
- **`record_inventory_adjustment` RPC** — revoked from public, service_role-only → anon
  cannot call. ✅
- **Storage public URLs** — new anon-readable surface, but serves only product images
  (image content-type, by design). ✅
- **`next/image` protocol change (`next.config.ts`)** — `http` is allow-listed ONLY when
  `NEXT_PUBLIC_SUPABASE_URL` has an `http:` scheme (local dev = `http://127.0.0.1:54321`).
  In prod the URL is `https://<ref>.supabase.co`, so `http` is **never** allow-listed in
  prod — the remote-image/SSRF surface is NOT widened in prod. Host is still the project's
  own Supabase host (`/storage/v1/object/public/**`), unchanged from T10. ✅
- **`vitest.integration.config.ts` `server-only` alias** — the `server-only`→no-op stub is
  confined to the integration vitest config, loaded only by `npm run test:integration` /
  `scripts/run-integration.sh`. `next build` uses `next.config.ts`, which has no such alias.
  **Confirmed it cannot leak the secret key into a prod bundle** (the prod-build scan above
  is the empirical proof: 0 hits). ✅

---

## Vulnerability Findings (T11)

### CRITICAL — none
### HIGH — none

### MEDIUM

#### SEC-T11-M-1: Client-supplied entity ids are not UUID-format-validated before reaching PostgREST `.eq()` filters
- **Type**: A03 Injection (defense-in-depth) / A04 Insecure Design
- **File**: `products/image-actions.ts`, `products/inventory-actions.ts`, `qa/actions.ts`,
  `taxonomy/actions.ts`, `products/product-duplicate.ts` (`sourceId`), `product-input.ts`
  (`categoryIds`/`optionalId`) — the only exception is `variant-input.ts`, which DOES
  UUID-guard (the M-4 fix).
- **Description**: `productId`/`imageId`/`questionId`/`categoryId`/`brandId`/`styleId`/
  `parentId`/`sourceId` are passed straight into `.eq("id", value)` without a
  `UUID_PATTERN` check like variants got (M-4).
- **Why it is NOT High/Critical here (the load-bearing distinction)**:
  1. **Not injection.** These values flow into **parameterized** `.eq()` filters, not into
     `.or()`/`.filter()` string interpolation. On a `uuid` column, a malformed value yields
     PostgreSQL `22P02 invalid input syntax for type uuid`, which the write layer catches
     and maps to a generic `write-failed` — never echoed. The only string-interpolated
     PostgREST filter in T11 is `list-query.ts`'s `.or()` search, which **is** sanitized
     (see below) — the actual M-4 surface.
  2. **No IDOR.** This is a **single-owner** admin: one authenticated principal owns the
     ENTIRE catalog. There is no tenant B whose rows could be reached. Passing an arbitrary
     valid UUID lets the owner touch a row the owner already owns and is authorized to touch;
     image/variant ops additionally co-scope with `.eq("product_id", productId)`. Enumerating
     UUIDs grants nothing beyond the owner's existing entitlement.
- **Exploit (bounded)**: An authenticated owner (or a CSRF-defeating attacker — see CSRF
  note) sending a malformed id gets a generic error banner instead of a clean field error.
  No data crosses a trust boundary.
- **Impact**: UX/robustness (generic banner vs field error) + a lost defense-in-depth layer.
- **Fix / Disposition**: **Accepted residual for Phase 1** (single-owner, parameterized
  filters, no IDOR). **Recommendation (low-effort hardening):** extend the M-4
  `UUID_PATTERN` guard to all id-accepting actions at the action boundary so a malformed id
  is rejected uniformly before any query — cheap, consistent, and future-proofs the surface
  if admin ever becomes multi-principal. Tracked for the clean-code backlog.
- **Status**: OPEN (accepted residual, documented; recommend the uniform guard)

#### SEC-T11-M-2: Inherited stateless-session residual applies to the new write surface
- **Type**: A07 Identification & Authentication Failures (inherited from T10 SEC-M-1)
- **File**: `src/lib/admin/session.ts` (unchanged by T11)
- **Description**: T11's catalog-write actions inherit T10's stateless session (no
  server-side revocation; a cookie stolen pre-logout is valid until `iat+8h`). T11 widens the
  blast radius of a stolen cookie from "edit store settings" to "full catalog write + image
  upload + CSV import". T11 did NOT regress the scheme (the reserved payload `v` field is
  untouched).
- **Impact**: Bounded (8h) unauthorized catalog write if a cookie is already stolen.
- **Fix / Disposition**: In-spec (revocation Out of Scope Phase 1). **This is the documented
  T12 GATE**: land the session-version/`iat`-floor check (or a shorter max-age) before
  refund-capable T12 sessions — now with added weight because T11 made the session more
  powerful. Mitigations unchanged: HttpOnly, Secure-in-prod, 8h cap, secret-rotation global
  logout.
- **Status**: OPEN (accepted residual, T12 gate)

### LOW

#### SEC-T11-L-1: CSV export carries `cost_price` (internal) and draft/archived rows
- **Type**: A01/A05 (by-design data scope)
- **Description**: The authenticated owner's CSV export includes `cost_price` and non-active
  products. This is the owner's own private data behind auth; the export route is 401-guarded
  and `no-store`. The storefront/anon path (`products_public`) still omits `cost_price`.
- **Status**: OPEN (accepted, documented — ensure operators treat the export file as
  confidential; it contains cost margins).

#### SEC-T11-L-2: `list-query` search uses a denylist strip, not an allowlist
- **Type**: A03 (hardening)
- **File**: `src/lib/admin/products/list-query.ts:60`
- **Description**: The single string-interpolated PostgREST filter in T11 — the `.or(name.ilike
  … , sku.ilike …)` search — strips the PostgREST meta-chars `% , ( ) * . : \` from the term
  (the m-3 fix). This **correctly** neutralizes filter-structure injection: with `,` `.` `(`
  `)` all removed, a term cannot start a new condition or a nested boolean group; it stays
  trapped inside the two `ilike` patterns. Term length is bounded to 120 (`ADMIN_SEARCH_MAX_LENGTH`).
  Verified safe. Residual is stylistic: a denylist is inherently more fragile than an allowlist.
- **Status**: OPEN (accepted — mitigation is sufficient; recommend an allowlist/escape helper
  or PostgREST param-object API if this pattern spreads).

#### SEC-T11-L-3: Public Supabase local-demo JWTs inline in test fixtures
- **Type**: A05 (informational)
- **File**: `tests/integration/*`, `e2e/*`
- **Description**: The documented public `supabase start` demo keys are inline in tests. Not
  sensitive (they only authenticate the local Docker instance). Consistent with the repo's
  existing test-fixture convention.
- **Status**: OPEN (accepted — dev/test fixture; centralizing them in one constant is a nicety).

---

## Checklist Results (T11)
| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 leaked; `.env.local` gitignored + never committed; only public local-demo JWTs in fixtures (L-3) |
| Env var exposure (NEXT_PUBLIC / client) | ✅ | No `NEXT_PUBLIC_ADMIN_*`; **prod-build** client scan = 0 admin secrets/symbols (closes T10 SEC-L-2) |
| Injection | ✅ | File upload sniffs bytes (SVG/polyglot rejected); CSV re-parsed server-side + formula-escaped; RPC schema-qualified; the one `.or()` search is sanitized; all ids via parameterized `.eq()` |
| Auth / AuthZ | ✅ | Every mutating action `requireSession()` first; export route self-guards 401; no IDOR (single-owner) |
| Client/server boundary | ✅ | `admin.ts` + write/session modules `server-only`; client refs to write modules are `import type`; `server-only` test-alias can't reach prod build |
| Data exposure | ✅ | Mapped error enums, no raw PG/stack; export cost/draft is owner-private behind auth (L-1); storefront `products_public` still omits cost |
| CORS / CSRF | ✅ | Server actions carry Next's origin-check CSRF protection; the export GET route is read-only + session-guarded; no custom CORS, no `*`+credentials |
| Dependencies | ✅ | 0 new deps; 0 new high/critical; 2 pre-existing transitive `postcss` moderates (unchanged) |
| File upload (T11) | ✅ | Magic-byte sniff, server size cap, non-guessable server path, no arbitrary-object delete, public-READ-only bucket |
| CSV (T11) | ✅ | Bytes-before-parse + rows-after-parse caps, server re-parse on confirm, formula escaping applied, unknown-slug rejected |
| RPC 0011 (T11) | ✅ | SECURITY DEFINER + search_path='' + schema-qualified + service_role-only + in-SQL bounds + row-lock |

---

## Verification After Audit (T11)
- No source code changed this stage (0 Critical/High found) — audit-only + a prod build for
  the client-bundle scan.
- `next build` (`NEXT_QA_DIST_DIR=.next-sec-scan`): **exit 0**; tsconfig restored via `git
  checkout`; scan dir removed after grep.
- Unit: **1462/1462 (87 files)** — baseline unchanged (no code change). 0 failed, 0 skipped.
- Integration: NOT re-run (no code change; would reset/seed the shared local DB and this
  stage must leave it pristine). Baseline 202/202 from Stage 6 stands.
- DB left pristine-seeded; port 3000 clear; tsconfig unchanged; no git commit;
  `pipeline-state.md` untouched (Stage 10 owns it this cycle).

## Residual Risks (carry forward from T11)
- **SEC-T11-M-1** un-UUID-validated ids (parameterized `.eq()`, single-owner, no IDOR;
  recommend uniform M-4 guard) — clean-code backlog.
- **SEC-T11-M-2** stolen-cookie replay now covers catalog writes — **T12 gate** (land session
  revocation / shorter max-age before refund-capable T12).
- SEC-T11-L-1 export carries cost/draft (owner-private, treat file as confidential).
- SEC-T11-L-2 search filter uses a (sufficient) denylist strip — prefer an allowlist if the
  pattern spreads.
- SEC-T11-L-3 public local-demo JWTs in fixtures (not sensitive).
- Carried from T10: SEC-M-1/2/3 (session revocation, IP-rotation limiter, Edge/Node max-age
  drift); pre-existing `postcss` moderate ×2.
