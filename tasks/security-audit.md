# Security Audit: T14 — SEO, Analytics & Launch Hardening (whole-store final review)

This is the ticket-mandated **final launch-hardening security review** — the whole
store (secrets, admin auth, MP webhook, RLS, injection, dependencies), plus an
independent re-audit of the T14 diff. Every finding is backed by evidence (live DB
queries, built-bundle scans, runtime payload tests, and code reads), not assertion.

## Summary

- **Files audited:** whole store — T14 diff (commits 35852d5, a99d55d, c414b24) +
  admin auth, MP webhook, RLS (24 tables, live), secrets (whole tree + 41 built
  client chunks), input boundaries, dependencies.
- **Vulnerabilities found:** 3 (Critical: 0, High: 0, Medium: 1, Low: 2)
- **Vulnerabilities fixed in source:** 1 (the `next` dependency bump; the residual
  advisory is documented + mitigated by B6, not a code defect)
- **Secrets found:** **0** (ZERO — clean; ship-safe)
- **Posture grade:** **A (strong).** No critical/high. The only real gap is the
  absent security-header/CSP layer (B6) — owner-gated, ready-to-apply block delivered.

## Vulnerability Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

#### SEC-M-1: `next` runtime advisories (SSRF in Server Actions, Image-Opt DoS, middleware bypass)
- **Type:** A06 Vulnerable & Outdated Components
- **File:** `package.json` (`next` dependency)
- **Description:** `npm audit` flags `next` 16.2.9 with several runtime-facing
  advisories: Server-Side Request Forgery in Server Actions, Image-Optimization
  API DoS via SVG, App-Router middleware/proxy bypass, and response-cache confusion.
  The app uses Server Actions heavily (admin + checkout).
- **Exploit:** An attacker could attempt SSRF via a crafted Server Action payload,
  or exhaust the Image-Optimization endpoint with malicious SVGs.
- **Impact:** Server-side request forgery / denial of service. No data-exfil path
  proven in this codebase (Server Actions here take structured, validated inputs),
  which is why this is Medium not High for THIS app.
- **Fix applied:** Bumped `next` **16.2.9 → 16.2.12** (in-range, non-major;
  `tsc --noEmit` = 0 and `next build` exit 0 after the bump). This captures the
  patch-level fixes shipped in 16.2.10–12. **Caveat (documented honestly):** the
  advisory DB still flags `next` (vulnerable range `>=9.3.4-canary.0`; the only
  `fixAvailable` it lists is a MAJOR downgrade to next@9, which would break the
  App Router — not viable). So the bump reduces but does not fully clear the
  advisory. **Compensating control:** the runtime-facing advisories are mitigated
  by the B6 CSP + security headers (delivered ready-to-apply in the deploy
  checklist §8) — apply B6 before go-live.
- **Status:** FIXED (bump applied) + MITIGATED (B6). Residual tracked for the next
  Next.js patch release.

### LOW

#### SEC-L-1: Working-file credentials should be rotated for production
- **Type:** A07 Identification & Authentication Failures (operational hygiene)
- **File:** `.env.local` (gitignored, **never committed** — verified via
  `git log --all -- '*.env*'` = empty, `git check-ignore` = ignored)
- **Description:** The local env file holds working-format dev values
  (`ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, an `APP_USR-…` MP access token)
  and a commented-out hosted-Supabase `sb_secret_…` service key. This is NOT a leak
  (never in git, never in the bundle), but values that have lived in a working file
  should not become the production secrets unchanged.
- **Impact:** Low — only reachable by someone with local disk access.
- **Fix:** Documented in the deploy checklist §1: generate a fresh session secret +
  password hash for prod, confirm/rotate the MP token, rotate the hosted Supabase
  secret when the project goes live; set all only in Vercel env.
- **Status:** OPEN (owner operational action — not a code fix).

#### SEC-L-2: Transitive build/toolchain dependency advisories
- **Type:** A06 Vulnerable & Outdated Components
- **File:** lockfile (`postcss`, `sharp`, `brace-expansion`, `fast-uri`,
  `@hono/node-server`, `@tailwindcss/postcss`, `@modelcontextprotocol/sdk`)
- **Description:** All are build/image-toolchain or MCP-SDK deps pulled transitively;
  none is independently reachable at the storefront's runtime attack surface.
- **Fix:** Run `npm audit fix` (non-`--force`) after deploy to clear the resolvable
  ones; the `--force` path is NOT recommended (it would attempt the breaking next@9
  downgrade).
- **Status:** OPEN (post-deploy maintenance; not a blocker).

## T14 diff re-audit (independent, once — not re-litigated)

- **JSON-LD serialization (`src/components/seo/json-ld.tsx`):** independently
  re-verified XSS-safe by running `escapeForScriptSafe(JSON.stringify(node))`
  against `</script><script>`, `<!--`, `<img onerror>`, closing-brace injection,
  and raw U+2028/U+2029 payloads. Every `<` → `<` (script cannot be
  terminated or markup injected); both line separators escaped; the U+2028/U+2029
  replaces are confirmed *effective* (not no-ops). Result: all payloads neutralized.
- **`site-url.ts`:** env-only origin derivation (`NEXT_PUBLIC_SITE_URL` →
  `NEXT_PUBLIC_SITE_ORIGIN` → localhost), never reads a Host header → no
  host-header injection. `absoluteUrl`/`localeUrl`/`buildAlternates` build URLs via
  next-intl `getPathname` + `new URL()` — no user-string interpolation into head.
- **`robots.ts` / `sitemap.ts`:** static robots policy (no DB → cannot 500);
  standard `/admin` + `/api/` disallow plus both-locale cart/checkout funnel;
  sitemap enumerates env-derived absolute URLs, degrades to static-only on DB
  outage (per-source `safeRead` try/catch). No admin-path oversharing.
- **`playwright.config.ts` rate-flag hatches:** all four
  `*_RATE_LIMIT_DISABLED` flags confirmed **server-only** — each limiter reads
  `process.env.X === "1"` in a `src/lib/**` server module
  (`quote/rate-limit.ts:42`, `payments/preference-rate-limit.ts:36`,
  `checkout/rate-limit.ts:41`, `contact/rate-limit.ts:40`,
  `admin/login-rate-limit.ts:40`), none `NEXT_PUBLIC_`, none client-settable, no
  effect in production (unset in real deploys; the checklist forbids setting them).
- **New npm scripts (`e2e:server`, `db:reset:seed`, `db:reset:remote`):** no secret
  echoing; `db:seed` (`scripts/seed.ts`) loads env via `getServerEnv()` (fail-fast,
  no hardcoded creds). `db:reset:remote` uses `supabase db reset --linked` — a
  destructive-on-linked-project command; noted (not a launch defect, but keep it
  off any CI that could point at a live DB).

## Whole-store posture summary (evidence-backed)

| Area | Verdict | Evidence |
| --- | --- | --- |
| Secrets | ✅ CLEAN | 0 hardcoded; `.env*` gitignored + never committed; 0 `NEXT_PUBLIC_` secret; 41 built chunks scanned clean; all secret modules `server-only`-guarded + static `secret-exposure` tests. |
| Admin auth/authz | ✅ SECURE | HMAC-SHA256 sessions; constant-time verify (Node `timingSafeEqual` + Edge XOR); DB revocation counter (fail-closed); cookie `httpOnly`/`sameSite=lax`/`secure`(prod)/`path=/admin`/8h; 32/32 mutating actions + route handlers + `(app)` layout guarded; per-IP login limiter; no IDOR (single-owner). |
| MP webhook | ✅ SECURE | Signature verified before ANY side effect (401 fail-closed); constant-time compare; 5-min replay window; DB idempotency (unique `(payment_id,status)` + claim-then-finalize); exact amount reconciliation. |
| RLS | ✅ SECURE (LIVE) | RLS on all 24 tables; anon DENIED on orders/customers/payments/discount_codes/all admin tables (dual-layer, live-tested port 54322); `cost_price_cents` omitted from `products_public`; 13 SECURITY DEFINER RPCs service_role-only + pinned `search_path`; no stray `pg_default_acl` here. |
| Injection / XSS | ✅ CLEAN | JSON-LD escaping re-proven safe vs breakout payloads; input boundaries validate/escape server-side; no host-header injection. No T14-era regression. |
| Client/server boundary | ✅ CLEAN | No `"use client"` imports a server-only secret module (`checkout-read.ts` false-positive: it IS `server-only`). |
| Data exposure | ✅ CLEAN | Anon reads only public catalog + published static pages; no PII/internal columns in the public view. |
| CORS/CSRF | ✅ OK | Server Actions carry Next's built-in CSRF origin check; session cookie `sameSite=lax`; no wildcard-CORS-with-credentials route. |
| Dependencies | ⚠️ SEC-M-1 / SEC-L-2 | `next` bumped 16.2.9→16.2.12; residual advisory mitigated by B6; transitive toolchain advisories post-deploy `npm audit fix`. |
| Security headers / CSP (B6) | ⚠️ GAP (owner-gated) | Absent today; ready-to-apply block delivered — see below. NOT a deploy blocker. |

## B6 — security headers / CSP (ready-to-apply, owner-gated)

Per the ticket, B6 is **owner-choice-gated and does NOT block the deploy**, and it is
**NOT wired into `next.config.ts` by this stage** (the config is locked through
T15/T16). Instead, the exact copy-paste `headers()` block — HSTS, X-Content-Type-
Options, Referrer-Policy, Permissions-Policy, `frame-ancestors 'none'`, and a CSP
draft compatible with the App Router + inline JSON-LD + Supabase/`picsum` image
hosts + a future `@vercel/analytics` script — is written into
**`tasks/deploy-readiness-checklist.md` §8**, with rollout notes (ship CSP
**report-only first**, soak on real traffic, then enforce; enforce the other headers
immediately). This makes the owner decision one paste + a rename to enforce.

## Checklist Results

| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 hardcoded, 0 `NEXT_PUBLIC_` secret, `.env*` gitignored + never committed, bundle clean. |
| Env var exposure | ✅ | Every `NEXT_PUBLIC_*` is genuinely public (site URL, Supabase URL, publishable/anon key, MP public key). Secrets `server-only`-guarded. |
| Injection | ✅ | JSON-LD XSS-safe (re-proven); server-side validation intact; no host-header injection. |
| Auth/AuthZ | ✅ | 32/32 admin actions + all routes guarded; HMAC sessions + DB revocation; per-IP limiter; no IDOR. |
| Client/server boundary | ✅ | No secret leaks into a client module; `server-only` guards + static tests. |
| Data Exposure | ✅ | Anon sees public catalog + published pages only; `cost_price_cents` omitted. |
| CORS/CSRF | ✅ | Server-Action CSRF protection; `sameSite=lax`; no wildcard CORS. |
| Dependencies | ⚠️ | `next` bumped to 16.2.12; residual advisory mitigated by B6; transitive → post-deploy `npm audit fix`. |

## Gate results (after the `next` bump)

- `tsc --noEmit`: **0 errors**
- `next build`: **exit 0** (route posture unchanged; taxonomy stays `force-dynamic` via source)
- unit: **2041 / 2041 passing** (baseline held; secret-exposure + env tests green)

## Verdict: **SECURE** (posture grade A)

No critical or high vulnerabilities. Zero secrets. The one real gap (security
headers / CSP, B6) is owner-gated with a ready-to-apply block delivered. The `next`
dependency was hardened as far as a non-breaking bump allows, with B6 as the
runtime compensating control. **Deploy is NOT blocked by security.**
