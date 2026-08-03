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

```bash
# Against the hosted DB, anon must be DENIED on orders/customers/payments/PII and
# on the privileged RPCs. Expect: anon = false for each grant.
psql "<hosted-connection-string>" -c "
  SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_can_exec
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname LIKE 'admin_%';
"
# Every row must show anon_can_exec = f. If any is t, REVOKE it before flipping traffic.
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
| Security headers / CSP (B6) | Add `headers()` (CSP, X-Frame-Options, HSTS, nosniff, Referrer-Policy). **Prerequisite before any third-party script.** | Scoped to Stage 9. |
