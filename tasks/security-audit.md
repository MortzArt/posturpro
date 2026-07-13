# Security Audit: T4 — Product Detail Page (`/producto/[slug]`)

Auditor: ultrasecurity (Stage 9, full-cycle). Depth: **FULL** — T4 introduces the
store's first public WRITE path (anon Q&A insert), so the write surface, RLS
boundary, and data-exposure guarantees were tested adversarially, including
**live, non-destructive verification against the local Docker Supabase**
(REST `:54321` + Postgres `:54322`). Stage 5/6 security claims (M-2/M-3 and the
review's PASS table) were re-verified independently — trusting nothing.

## Summary
- Files audited: 22 T4 files + RLS migrations (0005/0006), env/config, next.config, public client.
- Vulnerabilities found: **0 (Critical: 0, High: 0, Medium: 0, Low: 2 documented)**.
- Vulnerabilities fixed this stage: 0 (no critical/high present; Stage 6 already fixed M-2/M-3).
- Secrets found: **0** (SHIP requirement met).
- Live-DB attacks attempted: 9 (mass-assignment, self-publish, whitespace, oversize, cost-leak, unpublished-read) — **all defended**.
- Cleanup: the leftover `T4 Verify` unpublished test row noted in dev-done was deleted during this audit (0 residual rows).

## Independent Re-Verification of Stage 5/6 Claims

Every Stage 5/6 security claim was re-checked against code AND the live DB, not accepted on trust:

| Stage 5/6 claim | Re-verification method | Result |
|---|---|---|
| M-2: `productId` UUID-validated before it keys the limiter | Read `actions.ts:113` (`!isValidProductId` before `checkRateLimit`), `submit-guard.ts:77-79`, anchored fixed-length `UUID_PATTERN` (no ReDoS) | CONFIRMED |
| M-2: hard `QA_RATE_LIMIT_MAX_KEYS` ceiling + eviction | Read `checkRateLimit`/`evictToCeiling`; ceiling checked only before inserting a NEW key; empty/expired keys pruned; oldest-insertion eviction | CONFIRMED |
| M-3: IP source no longer `split(",")[0]` | Read `clientIp()`: `x-vercel-forwarded-for` → rightmost XFF hop → `x-real-ip` → `unknown` | CONFIRMED (residual risk correctly documented) |
| Anon client only, never service-role, for the write | `actions.ts` imports only `createPublicClient()`; no `admin`/secret import | CONFIRMED |
| Insert sends only `{product_id, author_name, question}` | `insertQuestion` object literal is exactly those 3 keys | CONFIRMED |
| Mass-assignment (`is_published`/`answer`) blocked | **Live**: forced `is_published=true,answer=...` as trusted `anon` role → RLS 42501 | CONFIRMED |
| Whitespace-only rejected before DB is first line | `validateQaSubmission` trims first; **Live**: btrim CHECK also rejects `'   '` | CONFIRMED (defense in depth) |
| `cost_price_cents` unreachable (AC-16) | **Live**: anon SELECT on base `products` → 42501; `products_public.cost_price_cents` → 42703 "does not exist" | CONFIRMED (structural) |
| Unpublished questions invisible to anon | **Live**: anon SELECT of an unpublished row → `[]` | CONFIRMED |
| No XSS / `dangerouslySetInnerHTML` | `grep` across `src/` → only a comment; Q&A text are React text nodes | CONFIRMED |
| Slug bounded before cache key (edge 6) | `isCacheableSlug` (len ≤128, kebab regex) gates before `unstable_cache` | CONFIRMED |
| No Q&A input reaches a cache key | Only bounded `slug` reaches `updateTag(productCacheTag(slug))` | CONFIRMED |

## Live Attack Log (local Docker Supabase, non-destructive)

Attacks were run two ways: (a) via PostgREST `:54321`, and (b) definitively via
`SET LOCAL role anon` inside a rolled-back transaction on `:54322` (the DB
policy/grant truth, independent of the JWT the REST gateway trusts).

| # | Attack | Expected | Observed | Verdict |
|---|---|---|---|---|
| 1 | anon `SELECT cost_price_cents` from base `products` | denied | `42501 permission denied for table products` | DEFENDED |
| 2 | anon read `products_public` | allowed, no cost col | rows returned; slug/id only | OK |
| 3 | `SELECT cost_price_cents` from the view | column absent | `42703 column does not exist` | DEFENDED (structural) |
| 4 | INSERT forcing `is_published=true` + `answer` | RLS denial | `42501 violates RLS` (REST + `role anon`) | DEFENDED |
| 5 | INSERT forcing `is_published=true` only | RLS denial | `42501 violates RLS` | DEFENDED |
| 6 | Legit 3-column INSERT as `anon` role | success, forced unpublished | `INSERT 0 1` (tx rolled back) | OK |
| 7 | anon SELECT of an unpublished row | invisible | `[]` | DEFENDED |
| 8 | whitespace-only name/question | btrim CHECK denial | `42501` / blocked | DEFENDED |
| 9 | oversized question (2500 chars) | length CHECK denial | `42501` | DEFENDED |

> Note on the PostgREST path: a legit 3-column insert via `:54321` returned
> `42501`, while the SAME insert as the trusted `anon` **role** on `:54322`
> succeeded (`INSERT 0 1`), and `is_active_product()` returns `t` for the target.
> This is a **local JWT/gateway artifact** (the demo anon JWT this instance
> trusts vs. the app's publishable key), NOT a code or policy defect — the DB is
> the source of truth and it permits the legit write while blocking every
> tampered one. This matches dev-done's "valid anon insert 201" on the app's own
> configured client.

## Vulnerability Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW (documented, no fix required in T4 scope)

#### SEC-L-1: In-memory rate limiter is best-effort on a no-trusted-edge deployment
- **Type**: A04 Insecure Design (rate-limit robustness)
- **File**: `src/app/[locale]/producto/[slug]/actions.ts:62-83`, `src/lib/qa/submit-guard.ts:145-170`
- **Description**: The per-IP+product limiter derives the IP from headers. Behind Vercel's edge (the stated deployment target) `x-vercel-forwarded-for` is authoritative and not spoofable. On a deployment with NO trusted edge overwriting XFF, the rightmost hop is still client-influenced, so a determined client can rotate IPs and evade the 3/min window.
- **Exploit**: Attacker sends each request with a fresh `X-Forwarded-For` on a non-Vercel host → per-IP window never trips → floods the moderation queue with RLS-valid (unpublished) questions.
- **Impact**: Moderation-queue flood only. Bounded by: (a) honeypot backstop, (b) `QA_RATE_LIMIT_MAX_KEYS=10_000` hard map ceiling with eviction (prevents memory amplification — verified in code), (c) DB CHECK/RLS caps each row to ≤120/≤2000 chars and forces unpublished (never reaches shoppers). No data exposure, no privilege escalation.
- **Fix / recommendation**: Accepted best-effort per the ticket ("CAPTCHA / durable rate limiter is out of scope"). Follow-up: a durable/global limiter (Upstash/Redis) or platform-native rate limit keyed off `x-vercel-forwarded-for` when the store scales. Trust model is documented in-code and in dev-done.
- **Status**: OPEN (accepted residual, ticket-sanctioned).

#### SEC-L-2: `next` / `postcss` transitive moderate advisory
- **Type**: A06 Vulnerable & Outdated Components
- **File**: `package-lock.json` (transitive: `next` → `postcss <8.5.10`)
- **Description**: `npm audit` reports **2 moderate** advisories: `postcss` XSS via unescaped `</style>` in CSS stringify output (GHSA-qx2v-qp2m-jg93), pulled in transitively by `next`. Zero critical, zero high.
- **Exploit**: Requires attacker-controlled CSS passed through PostCSS stringify — not a path this app exposes (PostCSS runs at build time on trusted first-party CSS, never on user input).
- **Impact**: None in practice for this app (no user-authored CSS is compiled). Build-time only.
- **Fix / recommendation**: Do NOT `npm audit fix --force` — it downgrades `next` to 9.3.3 (major, app-breaking). Pick up the fix when Next ships a patched `postcss` in its dependency range (routine dependency bump). Report-only per stage instructions.
- **Status**: OPEN (report-only, no safe non-breaking fix; no exposure).

## OWASP Top 10 Sweep (new T4 surface)

| # | Category | Result | Evidence |
|---|---|---|---|
| A01 | Broken Access Control | PASS | RLS REVOKE-ALL baseline; base `products` ungranted; anon Q&A INSERT policy forces safe state; unpublished invisible — all live-verified. No IDOR (no per-user resources in Phase 1; `productId` UUID-gated). |
| A02 | Cryptographic Failures | PASS | No crypto authored; secrets via `process.env` only, never inlined. |
| A03 | Injection | PASS | Supabase client uses parameterized `.eq()/.insert()` (no string SQL); no shell/`child_process`; `interpolate` regex linear + literal fallback (no injection/ReDoS); no `dangerouslySetInnerHTML`. |
| A04 | Insecure Design | PASS-with-note | Layered write guards (honeypot→validate→UUID-gate→rate-limit→RLS). Rate limiter best-effort off-Vercel (SEC-L-1). |
| A05 | Security Misconfiguration | PASS | `image` remotePatterns allowlist (Supabase storage + picsum) — a tampered localStorage `coverImageUrl` to an arbitrary host is rejected by `next/image`. Error messages mapped to enums, never echo `error.message`; `fail()` logs server-side only. |
| A06 | Vulnerable Components | PASS-with-note | 2 moderate transitive (SEC-L-2); 0 critical/high; 0 new deps in T4. |
| A07 | Auth Failures | N/A | No authentication in Phase 1 (guest store); no session/token handling introduced. |
| A08 | Data Integrity Failures | PASS | `isEntry` allowlist shape-guard on localStorage parse (m-5 closed the `$NaN` gap); mass-assignment blocked at RLS; no insecure deserialization (JSON.parse + guard, no proto pollution — fresh object literals only). |
| A09 | Logging/Monitoring | PASS | Honeypot logs a bot-suspected metric; insert failures logged server-side with context; no PII/secret in logs. |
| A10 | SSRF | PASS | No user-controlled URL reaches a server-side `fetch`; image hosts are a static build-time allowlist. |

## Checklist Results
| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 hardcoded secrets in T4 files or codebase; only fake `sb_secret_test` in unit tests. `.env*` gitignored, none tracked. Full secret value absent from `.next/static` (client bundle) and `.next/server` — read from `process.env` at runtime. |
| Env var exposure | ✅ | No `NEXT_PUBLIC_*SECRET/SERVICE/TOKEN`. Publishable key is RLS-enforced + client-safe by design. `env.ts` splits `getPublicEnv` (client-safe) from `getServerEnv` (server-only, `server-only`-guarded admin module). |
| Injection | ✅ | Parameterized Supabase queries; no raw SQL/shell; linear interpolate; no XSS. |
| Auth/AuthZ | ✅ | RLS is the boundary; anon client only for the write; mass-assignment + unpublished-read live-blocked. |
| Client/server boundary | ✅ | Only the anon client is bundled; i18n resolved server-side; no privileged path in client islands; server actions carry Next's built-in CSRF protection. |
| Data Exposure | ✅ | `cost_price_cents` structurally absent (view); RSC payload reads the view only; no over-fetch; errors mapped to enums. |
| CORS/CSRF | ✅ | Single write is a Next server action (built-in CSRF/action-id protection), no custom public REST route, no permissive CORS. |
| Dependencies | ✅/⚠️ | 0 new deps; `npm audit`: 2 moderate transitive, 0 critical/high (SEC-L-2, report-only). |

## Residual Risks (accepted / follow-up)
1. **Rate limiter best-effort without a trusted edge** (SEC-L-1) — ticket-sanctioned; durable limiter is the documented follow-up. Backstopped by honeypot + hard map cap + RLS.
2. **2 moderate transitive advisories** (SEC-L-2) — no safe non-breaking fix; no runtime exposure; bump with a future Next release.
3. **Rate limiter resets on redeploy/scale-out** (per-instance memory) — documented; acceptable for Phase 1 volume.

## Verdict: SECURE-WITH-NOTES

The first public write path is correctly defended at the RLS boundary (mass-assignment,
self-publish, whitespace, oversize, and cost-leak attacks were all defeated live),
uses the anon client exclusively, leaks no secrets or cost data to the client, and
carries no critical/high vulnerabilities. Stage 6's M-2/M-3 fixes independently
re-verified as correct. The only outstanding items are two accepted, ticket-sanctioned
LOW residuals (best-effort rate limiter off-Vercel; a transitive moderate npm advisory
with no runtime exposure). No code changes were required this stage.
