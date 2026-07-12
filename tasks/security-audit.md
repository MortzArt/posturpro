# Security Audit: T2 — App Shell & Design System (LIGHTWEIGHT)

## Summary
- Scope: new T2 surface only (`git diff bebf036..HEAD -- src/ e2e/ next.config.ts package.json src/middleware.ts`). Data layer was fully audited in T1.
- Files audited: 15 security-relevant (middleware, i18n config, store-settings wrapper, whatsapp helpers + button, error.tsx, global-error.tsx, [locale]/layout, site-footer, language-toggle, config.ts, env.ts, supabase/server.ts) + full-codebase secrets sweep.
- Vulnerabilities found: 0 (Critical: 0, High: 0, Medium: 0, Low: 1 informational deferred to T14)
- Vulnerabilities fixed: 0 (none required)
- Secrets found: 0 (real secrets). Local Supabase demo JWTs present in `tests/integration/` are the public well-known `supabase start` keys — NOT secrets.

## Vulnerability Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

#### SEC-L-1: No security response headers set (X-Frame-Options / CSP / HSTS)
- **Type**: A05 Security Misconfiguration
- **File**: `next.config.ts` (no `headers()` block)
- **Description**: The storefront ships no `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, or `Strict-Transport-Security`. This is a hardening gap, not an exploitable T2 defect: T2 has no auth surface, no cookies beyond the non-sensitive `NEXT_LOCALE`, and no user-generated HTML sink (React auto-escapes; no `dangerouslySetInnerHTML` anywhere in the diff).
- **Impact**: Clickjacking / reduced defense-in-depth once authenticated flows (cart/checkout, admin T10) land.
- **Fix**: Add a `headers()` block in `next.config.ts` during launch hardening. Explicitly deferred to **T14 (launch hardening)** per audit scope — CSP must be authored against the full asset/script inventory (Supabase Storage image host, next-intl, fonts), which does not exist yet. Fixing now would be premature and likely broken by later tasks.
- **Status**: DEFERRED (T14) — documented, not fixed by design.

## Detailed Verification (checklist items in scope)

**Middleware locale handling (`src/middleware.ts`)** — CLEAN.
- Delegates entirely to `createMiddleware(routing)` (next-intl). No custom redirect construction, so no open-redirect vector. Locale is chosen only from the URL prefix or `NEXT_LOCALE` cookie against a fixed allowlist (`["es-MX","en"]`); an attacker-supplied `NEXT_LOCALE` value not in the set is ignored (falls back to default) — no header/cookie injection, no reflected value.
- Matcher `["/((?!api|_next|_vercel|.*\\..*).*)"]` correctly excludes API, Next/Vercel internals, and dotted static assets. No sensitive route is unintentionally exposed or shadowed; there is no auth gate to bypass at this stage.
- `localeDetection: false` — `Accept-Language` is never reflected into routing (AC-1), removing a header-driven behavior surface.

**Client bundle / secret leakage** — CLEAN.
- `getStoreSettings` (`src/lib/store-settings.ts`) is guarded by `import "server-only"` and uses `createClient()` from `src/lib/supabase/server.ts`, which reads **only** `NEXT_PUBLIC_*` values (URL + RLS-enforced publishable key) via `getPublicEnv()`. The RLS-bypassing `SUPABASE_SECRET_KEY` is reachable only through `getServerEnv()` in the `server-only` admin module — not touched anywhere in T2. store_settings is served RLS-enforced and rendered server-side in the layout/footer; the secret key cannot reach the browser bundle.
- Explicit column `select` (no `SELECT *`) — no over-fetching of unexpected columns.
- `NEXT_PUBLIC` grep across `src/`: only the two intended client-safe Supabase values + tests. No secret is prefixed `NEXT_PUBLIC_`.

**WhatsApp URL building (`src/lib/whatsapp.ts`, `whatsapp-button.tsx`)** — CLEAN.
- Phone and message are developer-controlled config constants (`WHATSAPP_PHONE_E164`, `WHATSAPP_PREFILL_MESSAGE_ES`), never user input — no injection vector. Phone is stripped to bare digits (`/\D/g`); message is `encodeURIComponent`-encoded defensively. Base host is a hardcoded `https://wa.me` literal, so no attacker-controlled scheme/host.
- Anchor uses `target="_blank"` **with** `rel="noopener noreferrer"` (AC-8) — no reverse-tabnabbing.
- Config-guarded: empty phone ⇒ `buildWhatsAppUrl` returns `null` ⇒ button not rendered; never a numberless `wa.me/` link.

**error.tsx / global-error.tsx** — CLEAN.
- `[locale]/error.tsx` renders only localized dictionary copy; `error.message`/`error.stack` are never placed in the DOM. The raw error goes to `console.error` (log, not the UI). Only `error.digest` (an opaque Next.js hash) is optionally shown as a support reference — safe, no PII/stack.
- `global-error.tsx` renders a static bilingual message with inline styles; no error internals surfaced. No leak in production.

**Dependencies (npm audit)** — CLEAN (no new advisories from T2).
- `next-intl@4.13.2` and `@radix-ui/react-focus-scope@1.1.10` (transitive via next-intl) introduced no new advisories.
- `npm audit`: 2 moderate, both the **pre-existing** transitive `postcss <8.5.10` (GHSA-qx2v-qp2m-jg93) reached via `next` — the accepted T1 baseline. Not introduced by T2. `audit fix --force` would downgrade `next` to 9.3.3 (breaking) — NOT run, per instruction.

**Secrets / env exposure** — CLEAN.
- `.env*` is gitignored; `.env.local` exists on disk but is NOT tracked and NEVER appears in git history (`git log --all -- .env.local` empty).
- Whole-repo secret-pattern sweep: only test fixtures (`sb_publishable_test`, `sb_secret_test` — dummy strings) and the public well-known Supabase local-dev JWTs in `tests/integration/local-supabase.ts` (documented as public, localhost-only, guarded against non-local URLs). No real credential committed.

## Checklist Results
| Category | Status | Notes |
|----------|--------|-------|
| Secrets | PASS | Zero real secrets. `.env.local` gitignored + never committed. Test JWTs are public local-dev demo keys. |
| Env var exposure | PASS | Only `NEXT_PUBLIC_*` (URL + publishable key) reach client. `SUPABASE_SECRET_KEY` server-only, untouched by T2. |
| Injection | PASS | No `dangerouslySetInnerHTML`; React auto-escapes. WhatsApp URL from config only, encoded. Typed Supabase query with explicit columns (no string interpolation). |
| Auth/AuthZ | PASS (N/A) | No auth surface in T2. Single public read is RLS-enforced (publishable key), never admin client. |
| Client/server boundary | PASS | `store-settings` + footer are `server-only`/async server; secret key cannot cross to bundle. |
| Data Exposure | PASS | Explicit column select (no `*`). Errors log server-side; UI shows localized copy + opaque digest only. |
| CORS/CSRF | PASS (N/A) | No custom API route / state-changing endpoint in T2. `NEXT_LOCALE` cookie is non-sensitive; toggle is a client navigation, not a privileged mutation. |
| Dependencies | PASS | No new advisories from `next-intl`/`react-focus-scope`. Only accepted pre-existing postcss moderates remain. |
| Security headers | DEFERRED | No CSP/X-Frame-Options (SEC-L-1) — deferred to T14 launch hardening. |

## Verdict: SECURE

No critical or high vulnerabilities. No fixes required. One low-severity hardening item (security response headers) is documented and intentionally deferred to T14. No files were modified by this stage — no lint/tsc/test/build re-run needed (no runtime behavior changed).
