# Deploy-Readiness Checklist — Vercel + Hosted Supabase (T14)

The client-QA deploy target: PosturPro storefront on **Vercel**, backed by a
**hosted Supabase** project. This checklist is the repeatable path the owner runs
to migrate + seed the hosted DB and configure Vercel so the deploy succeeds on
the first try. Covers AC-A8 (hosted-apply path) and AC-A14 (build determinism).

> Nothing here provisions the project or performs the deploy (owner action). It
> documents the exact commands + settings so the deploy is turnkey.

---

## 1. Environment variables (Vercel project settings)

Set these in the Vercel project (Production + Preview). **Never** prefix a secret
with `NEXT_PUBLIC_`.

### Public (client-safe, `NEXT_PUBLIC_`)

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Hosted Supabase project URL (also derives the `next/image` remote host). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | RLS-enforced anon/publishable key. |
| `NEXT_PUBLIC_SITE_URL` | **Canonical storefront origin** (e.g. `https://posturpro.mx`). Drives `metadataBase`, canonical/hreflang, sitemap `<loc>`, robots `Sitemap:`, JSON-LD `url`. **MUST be the real domain** — if unset, SEO URLs fall back to `http://localhost:3000` (see §5). |
| `NEXT_PUBLIC_SITE_ORIGIN` | Absolute origin for links in transactional emails (falls back to `NEXT_PUBLIC_SITE_URL` for SEO if that is unset). Keep it the same as `NEXT_PUBLIC_SITE_URL` unless emails need a distinct host. |

### Server-only (SECRET — never `NEXT_PUBLIC_`)

| Var | Purpose |
| --- | --- |
| `SUPABASE_SECRET_KEY` | RLS-bypassing service key (admin/server reads only). |
| `MERCADOPAGO_ACCESS_TOKEN` | MP REST API bearer token. |
| `MERCADOPAGO_WEBHOOK_SECRET` | HMAC key verifying the MP webhook `x-signature`. |
| `EMAIL_API_KEY` | Resend API key (transactional email). |
| `EMAIL_FROM_ADDRESS` | Verified sender address. |
| `EMAIL_OWNER_ADDRESS` | Owner inbox for order/contact alerts. |
| `ADMIN_EMAIL` | Owner login email. |
| `ADMIN_PASSWORD_HASH` | scrypt password hash (`N$r$p$salt$hash`). |
| `ADMIN_SESSION_SECRET` | HMAC key signing the admin session cookie (rotating it logs everyone out). |

> The four rate-limit escape hatches (`CHECKOUT_/QUOTE_/CONTACT_/ADMIN_LOGIN_RATE_LIMIT_DISABLED`)
> must **NOT** be set in production — they exist only for the e2e test server.

> **Credential rotation before go-live (Stage 9 finding, LOW — hygiene, not a leak).**
> The local `.env.local` (gitignored, never committed — verified) holds working-format
> values for the dev machine, and a commented-out hosted-Supabase `SUPABASE_SECRET_KEY`
> (`sb_secret_…`). Because those values have lived in a working file: **(1)** generate a
> fresh `ADMIN_SESSION_SECRET` (`node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'`)
> and a fresh `ADMIN_PASSWORD_HASH` for production; **(2)** confirm the production
> `MERCADOPAGO_ACCESS_TOKEN` is the intended live/sandbox credential (the dev value is
> `APP_USR-…` production-format, not `TEST-…`) and rotate it in the MP dashboard if it
> was ever shared; **(3)** rotate the hosted `SUPABASE_SECRET_KEY` when the hosted
> project goes live. Set all of these ONLY in the Vercel project env — never in a file.

### Group B (optional — set only when the owner chooses a vendor)

- Analytics: none required for `@vercel/analytics` (enabled in the Vercel project
  UI, no env). If a cookie-setting vendor is chosen, add its key + ship the
  consent banner + a CSP (see §6).
- Error monitoring (Sentry): `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (DSN is
  safe to expose) once the owner opts in.

---

## 2. Apply migrations + seed to the hosted Supabase project

The hosted project is currently **empty, never migrated, CLI unlinked**. Run once:

```bash
# 1. Link the CLI to the hosted project (interactive: paste the DB password).
supabase link --project-ref <YOUR_PROJECT_REF>

# 2. Push every migration 0001..0014 to the hosted DB.
supabase db push

# 3. Seed the hosted catalog (6 categories / 5 brands / 6 styles / 30 products
#    + static pages + store settings). Point the seed at the HOSTED URL + secret
#    key via a .env override, or export them inline:
NEXT_PUBLIC_SUPABASE_URL=<hosted-url> \
SUPABASE_SECRET_KEY=<hosted-secret-key> \
  npm run db:seed
```

### Post-migrate RLS assertion (do NOT skip)

On some environments a stray `pg_default_acl` grant can hand `anon` EXECUTE on new
functions. Verify anon is denied on every privileged surface after `db push`:

> **CONFIRMED ON HOSTED (2026-08-23):** this drift is real, and worse than the
> original query below could see. Hosted Supabase default ACLs (`pg_default_acl`
> FOR ROLE postgres) grant ALL on tables + EXECUTE on functions to
> anon/authenticated for every object `db push` creates — EVERY privileged RPC
> (including SECURITY DEFINER `create_order`/`record_refund`, which bypass RLS)
> came out anon-executable. Migration `0015_enforce_grant_posture.sql` revokes
> the strays AND strips anon/authenticated from the default ACLs so later
> migrations can't re-drift. Keep running this sweep after every `db push`.

```bash
# Sweep ALL functions — not just admin_%. Allowlist: search_products +
# is_active_product are anon-executable BY DESIGN (0007/0002); everything else
# in public must show anon_exec = f.
psql "<hosted-connection-string>" -c "
  SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_exec
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname NOT IN ('search_products', 'is_active_product')
    AND proname !~ '^(gin_|gtrgm_|set_limit$|show_|similarity|word_similarity|strict_word)'
  ORDER BY proname;
"
# And sweep anon table DATA privileges — must be EXACTLY the storefront read
# surface (brands/categories/styles/tags/product_*/products_public/static_pages/
# store_settings/translations SELECT + product_questions SELECT,INSERT):
psql "<hosted-connection-string>" -c "
  SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee = 'anon'
    AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
  GROUP BY table_name ORDER BY table_name;
"
# Any extra row/privilege → REVOKE before flipping traffic (see migration 0015).
# No psql? The same queries run via the Management API:
#   curl -X POST https://api.supabase.com/v1/projects/<ref>/database/query \
#     -H "Authorization: Bearer <access-token>" -d '{"query":"..."}'
```

Also confirm RLS is enabled and anon reads only `products_public` (no
`cost_price_cents`) and published `static_pages` — never `orders`, `customers`,
`payments`, `discount_codes`.

---

## 3. Local reset + seed (repeatable dev path — AC-A7)

`supabase db reset` recreates the schema + applies migrations but does NOT seed
(there is no `seed.sql` / `[db.seed]` — a deliberate choice so reset stays fast).
Seed is a separate step. One command chains both:

```bash
npm run db:reset:seed     # supabase db reset && tsx scripts/seed.ts
# — or the two explicit steps —
npm run db:reset          # recreate schema + migrations 0001..0014 (NO data)
npm run db:seed           # populate the seed catalog
```

Both exit 0 on a clean local Docker Supabase.

---

## 4. Build command + region

- **Build command:** `next build` (Vercel default). No override needed.
- **Region:** pick a Vercel region + Supabase region close to Mexico (e.g. Vercel
  `iad1`/`gru1`, Supabase an `us-east`/`sa-east` region) to minimize RPC latency.
  Document the chosen pair in the Vercel project.
- **Remote image hosts:** `next.config.ts` auto-derives the Supabase Storage host
  from `NEXT_PUBLIC_SUPABASE_URL`; `picsum.photos` stays allow-listed until real
  product photography lands. No change needed.

---

## 5. Build-time DB reachability (AC-A14 — build determinism)

`sitemap.ts` and every taxonomy/product `generateStaticParams` read the DB.
**They degrade safely** — a DB outage at build time yields a reduced sitemap
(static routes only) and empty static-params (routes render on demand), never a
crashed build or an unhandled rejection. The 3 taxonomy `[slug]` pages and
`/sillas` are `force-dynamic`/dynamic, so they always render on request.

**Recommendation:** still ensure the hosted DB is reachable at build for the
richest sitemap/prerender. If a build must run with the DB down, the deploy stays
green and the sitemap self-heals on the next revalidation. `NEXT_PUBLIC_SITE_URL`
being set is the one hard requirement — otherwise canonicals resolve to
`http://localhost:3000`.

---

## 6. Post-deploy verification (smoke test the SEO + funnel)

```bash
BASE=https://<prod-domain>
curl -s -o /dev/null -w "%{http_code}\n" $BASE/sitemap.xml      # 200, valid XML
curl -s -o /dev/null -w "%{http_code}\n" $BASE/robots.txt       # 200, text
curl -s -o /dev/null -w "%{http_code}\n" $BASE/categorias/<seed-slug>   # 200 (NOT 500)
curl -s -o /dev/null -w "%{http_code}\n" $BASE/marcas/<seed-slug>       # 200
curl -s -o /dev/null -w "%{http_code}\n" $BASE/estilos/<seed-slug>      # 200
curl -s $BASE/producto/<seed-slug> | grep -o 'application/ld+json'      # Product JSON-LD present
```

- Repoint the **Mercado Pago webhook URL** to the prod domain (T8 Phase 5).
- Verify PITR / daily backups are enabled on the hosted Supabase project
  (AC-B4) and run one restore test.
- Confirm the contact form character counter shows `0/1200` (not the raw key).

---

## 7. Group B — deferred, owner-gated (does NOT block this deploy)

| Item | Recommendation | Status |
| --- | --- | --- |
| Analytics vendor (B1) | **`@vercel/analytics`** — first-party, cookieless, CSP-friendly. | Awaiting owner decision. No env needed; toggle in Vercel UI. |
| Cookie consent banner (B2) | **N/A if cookieless** (recommended). Only ships if a cookie-setting vendor is chosen. | Not built (cookieless default). |
| Error monitoring (B3) | `@sentry/nextjs`, DSN env-driven. | Awaiting owner decision + DSN. |
| Backup verification (B4) | PITR + daily backups + one restore test. | Do after the hosted project is live. |
| LCP / bundle (B5) | LCP images already `priority` (hero / gallery / grid). | Verified — no change. |
| Security headers / CSP (B6) | Add `headers()` (CSP, X-Frame-Options, HSTS, nosniff, Referrer-Policy). **Prerequisite before any third-party script.** | Ready-to-apply block written in §8 (owner-gated; do NOT block deploy). |

---

## 8. Security posture (Stage 9 audit — final launch review)

Whole-store security audit ran at T14 (the ticket-mandated final review). **Posture
grade: A (strong).** Verified with evidence, not assertion:

- **Secrets:** ZERO hardcoded secrets in source. `.env*` is gitignored (`.gitignore`
  lines 38/47) and **never** committed (verified `git log --all -- '*.env*'` empty).
  No secret is `NEXT_PUBLIC_`-prefixed. Built client bundle (41 chunks) scanned:
  zero secret values / secret env-var names. Every secret module is
  `import "server-only"`-guarded (`supabase/admin.ts`, `payments/mp-client.ts`,
  `email/provider.ts`, `admin/auth.ts`, `admin/session.ts`) with static
  `secret-exposure` tests enforcing it.
- **Admin auth:** HMAC-SHA256 signed sessions, constant-time verify in BOTH Node
  (`timingSafeEqual`) and Edge (XOR `constantTimeEqual`), DB-backed revocation
  counter (fail-closed on read error). Cookie flags: `httpOnly`, `sameSite=lax`,
  `secure` in production, `path=/admin`, 8h `maxAge`. Every one of the 32 mutating
  admin server actions calls `requireSession()`; route handlers (export,
  packing-slip) self-guard; the `(app)` route-group layout guards all pages. Login
  is per-IP rate-limited server-side. No auth bypass, no IDOR (single-owner model,
  UUID-scoped reads).
- **Mercado Pago webhook:** HMAC signature verified BEFORE any side effect (401
  fail-closed), constant-time compare, 5-minute replay window, DB-enforced
  idempotency (unique `(mp_payment_id, mp_status)` + claim-then-finalize), exact
  amount reconciliation. An unauthenticated attacker cannot forge a paid order.
- **RLS (verified LIVE against the local Docker DB, port 54322):** RLS enabled on
  all 24 tables. `anon` is provably DENIED select/insert/update/delete on
  `orders`, `customers`, `payments`/`payment_refunds`, `discount_codes`,
  `order_items`, `mp_payment_events`, `email_sends`, `inventory_adjustments`,
  `order_internal_notes`, `admin_session_version` (dual-layer: no grant + no
  policy). `cost_price_cents` is structurally omitted from the anon-readable
  `products_public` view. All 13 SECURITY DEFINER RPCs are `service_role`-EXECUTE
  only with a pinned empty `search_path`; no stray `pg_default_acl` anon grant on
  this instance. **The post-migrate anon-denial assertion in §2 is the runnable
  guard for OTHER envs (CI/hosted) where the stray ACL can reappear — do NOT skip
  it.**
- **Injection / XSS:** JSON-LD is serialized then escaped (`escapeForScriptSafe`)
  so every `<` becomes `<` and U+2028/U+2029 are escaped — independently
  re-verified against `</script>`, `<!--`, `<img onerror>`, and raw-separator
  payloads: all neutralized, no script breakout. Input boundaries (checkout,
  contact, quote, Q&A, admin forms) validate/escape server-side; no T14-era
  regression. Sitemap/robots/site-url are env-only (never read a Host header → no
  host-header injection).

### Dependency advisories (`npm audit`)

`next` was bumped **16.2.9 → 16.2.12** (in-range, non-major; `tsc` + `next build`
stay green) to pick up the patch-level fixes in 16.2.10–12. **Note:** the advisory
DB still flags `next` (vulnerable range `>=9.3.4-canary.0` with no forward-fixed
16.x published; the only "fix" it lists is a major downgrade to next@9, which would
break the App Router — not viable). The runtime-facing `next` advisories (Server
Actions SSRF, Image-Optimization DoS via SVG, middleware/proxy bypass) are
**mitigated by the B6 CSP + security headers below** — apply B6 before go-live for
defense-in-depth. Remaining transitive advisories (`postcss`, `sharp`,
`brace-expansion`, `fast-uri`, `@hono/node-server`, `@tailwindcss/postcss`) are all
build/image-toolchain deps, not independently reachable at runtime; run
`npm audit fix` (non-`--force`) after deploy to clear the resolvable ones. **None is
a deploy blocker.**

### B6 — ready-to-apply security headers + CSP (OWNER-GATED — do NOT wire in now)

The one clear gap the audit found is the absent security-header layer. It is
**owner-choice-gated and MUST NOT block this deploy.** Below is the exact,
copy-paste `headers()` block for `next.config.ts`. It is compatible with the
Next.js App Router, the inline JSON-LD `<script>`s, Supabase + `picsum.photos`
image hosts, and a future `@vercel/analytics` script.

**Rollout: ship it `Content-Security-Policy-Report-Only` FIRST** (rename the header
key to `Content-Security-Policy-Report-Only`), watch the browser console / a report
endpoint for a full week of real traffic across both locales, then flip to the
enforcing `Content-Security-Policy` key once clean. HSTS/nosniff/Referrer-Policy/
Permissions-Policy/frame-ancestors can be enforced immediately — only the CSP needs
the report-only soak.

```ts
// next.config.ts — add to the config object returned/exported.
// NOTE: inline JSON-LD requires 'unsafe-inline' in script-src OR a nonce. A nonce
// needs a middleware that injects it per-request AND passing it to <JsonLd>; until
// that plumbing exists, 'unsafe-inline' for script-src is the pragmatic App-Router
// default (Next itself also emits inline bootstrap scripts). Prefer moving to a
// nonce before enabling any third-party <script>.
async headers() {
  const isProd = process.env.NODE_ENV === "production";
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : "";
  const csp = [
    "default-src 'self'",
    // Next.js App Router hydration + inline JSON-LD. Add https://va.vercel-scripts.com
    // only if @vercel/analytics is enabled by the owner (B1).
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Product images: Supabase Storage + picsum seed host. data: for inlined SVGs.
    `img-src 'self' data: https://picsum.photos https://*.picsum.photos ${supabaseHost}`.trim(),
    "font-src 'self' data:",
    // Supabase REST/Realtime + (if enabled) Vercel Analytics beacon.
    `connect-src 'self' ${supabaseHost}`.trim(),
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const securityHeaders = [
    // CSP: ship as report-only first (see rollout note), then rename to enforce.
    { key: "Content-Security-Policy", value: csp },
    // Enforce immediately — no soak needed:
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" }, // legacy twin of frame-ancestors
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    // HSTS: only after HTTPS is confirmed on the apex + all subdomains. Start with
    // a short max-age, raise to 63072000 + preload once verified.
    ...(isProd
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
      : []),
  ];

  return [{ source: "/:path*", headers: securityHeaders }];
}
```

**Verify after applying (report-only phase):**

```bash
curl -sI https://<prod-domain>/ | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy|x-frame'
# Then load the storefront + a PDP in a browser and confirm ZERO CSP violation
# reports for the inline JSON-LD, Supabase images, and next hydration scripts.
```
