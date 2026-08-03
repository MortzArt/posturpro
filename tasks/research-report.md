# Research Report: T14 — SEO, Analytics & Launch Hardening

> Every claim below was verified against the CURRENT tree (grep/read + live
> command runs: `npm run build`, `npm run start` + `curl` of real seeded
> taxonomy slugs, `npm run db:reset`, `npm run db:seed`). Where the
> orchestrator's pipeline-state notes did not hold it is stated explicitly.
>
> **IMPORTANT (2026-08-03):** the planning pass initially marked the taxonomy-500
> FALSIFIED off a green build; the orchestrator re-verified at REQUEST time and
> found the bug is REAL (all 3 taxonomy detail pages return HTTP 500 with digest
> `DYNAMIC_SERVER_USAGE` on a seeded prod server) and the `force-dynamic` fix
> works. Section (a) and the risk/decision/anti-pattern entries were corrected.
> The db-reset finding (reset exits 0 on this machine; the real gap is that it
> does not seed) holds and is unchanged.

## Codebase Analysis

### Existing Patterns

- **Per-page metadata**: `generateMetadata` async pattern, `getTranslations({
  locale, namespace })`, present on layout + every page. Reuse: extend each with
  `alternates` + `openGraph` from a shared helper. (`layout.tsx:34`,
  `producto/[slug]/page.tsx` `generateMetadata`, `sillas/page.tsx:63`.)
- **Locale-aware URL building**: `getPathname({ href, locale })` from
  `src/i18n/navigation` — used at `sillas/page.tsx:126`. Reuse for sitemap
  `<loc>` and hreflang alternates so es-MX stays unprefixed and en is `/en/...`.
- **`t.raw()` for placeholder templates handed to a client counter**: the
  correct pattern, used at `empresas/page.tsx:147`, `product/qa-form.tsx` (via
  `t.raw("qa.form.counter")`, `producto/[slug]/page.tsx:231`), and
  `checkout/confirmacion/[token]/page.tsx:148`. The contact page violates it.
- **DB read wrappers** in `src/lib/catalog/queries.ts` (tag-cached): reuse for
  sitemap enumeration.
- **`truncateForMeta`** already used in PDP `generateMetadata` — reuse for OG
  descriptions / JSON-LD.
- **`next/image` discipline**: `priority` prop threaded through
  `product-grid.tsx` (`priorityCount=4`, line 57) and `product-card.tsx`;
  explicit `sizes` on hero (`home/hero.tsx:101`) and gallery
  (`product-gallery.tsx:121`). No net-new image work needed.

### Relevant Files

| File | Purpose | Relevance | Action |
| ---- | ------- | --------- | ------ |
| `src/app/[locale]/contacto/page.tsx` | Contact page server shell | Blocker: `:59` `t("charCount")` raw-key leak | Modify |
| `src/app/[locale]/contacto/contact-form.tsx` | Client form | Consumes `labels.charCount` template at `:235` via `<CharacterCounter template=…>` | Reference |
| `src/messages/es-MX.json` / `en.json` | i18n messages | `contact.charCount = "{count}/{max}"` (ICU w/ placeholders) | Reference |
| `playwright.config.ts` | e2e server | Blocker: runs `npm run dev`, missing 2 rate flags | Modify |
| `package.json` | scripts | Add e2e prod-server script; seed/reset chain | Modify |
| `supabase/config.toml` | local stack | `[analytics] enabled=false` already; no `[db.seed]` | Modify/Reference |
| `scripts/seed.ts` | seed data | `db:seed` entrypoint (separate from reset) | Reference |
| `src/app/sitemap.ts` | — | Does not exist | Create |
| `src/app/robots.ts` | — | Does not exist | Create |
| `src/lib/seo/metadata.ts` + `src/components/seo/json-ld.tsx` | — | Do not exist | Create |
| `src/lib/catalog/queries.ts` | catalog reads | `listBrands`/`listStyles`/`listCategories`/`listActiveProductSlugs` for sitemap | Reference |
| `src/i18n/navigation.ts` | `getPathname` | Locale-aware URLs for sitemap+hreflang | Reference |
| `src/app/[locale]/layout.tsx` | root metadata | Add `metadataBase` + default OG | Modify |
| `src/app/[locale]/{page,producto/[slug]/page,categorias/[slug]/page,marcas/[slug]/page,estilos/[slug]/page,sillas/page,empresas/page,[pageSlug]/page}.tsx` | surfaces | Add canonical/hreflang + JSON-LD per surface | Modify |
| `next.config.ts` | config | remotePatterns already correct; confirm only | Reference |

### Data Flow

**Sitemap:** crawler → `GET /sitemap.xml` → `src/app/sitemap.ts` (server) →
`listCategories()`+`flattenSlugs`, `listBrands()`, `listStyles()`,
`listActiveProductSlugs()`, static-pages reader → for each entity × each locale
build `getPathname({href, locale})` prefixed with `metadataBase` →
`MetadataRoute.Sitemap[]` with per-entry `alternates.languages` → XML.

**JSON-LD (PDP):** request → `producto/[slug]/page.tsx` → `getProduct(slug)`
(gives `name`, `brandName`, `priceCents`, `stockState`, image) → `buildProductLd`
in `src/lib/seo/json-ld.ts` (cents→major-unit MXN, stockState→schema
availability) → `<JsonLd data={…}/>` server component emits
`<script type="application/ld+json">` in the page body.

**charCount:** `contacto/page.tsx` `buildLabels` reads `t.raw("charCount")` (after
fix) → passes `"{count}/{max}"` template string → `<ContactForm labels>` →
`<CharacterCounter template={labels.charCount} count max>` interpolates
client-side. (Today `t("charCount")` throws `FORMATTING_ERROR` server-side.)

### Similar Features (Reference Implementations)

- **`/sillas` metadata** (`sillas/page.tsx:63-85`) — the canonical + faceted-
  `noindex` + `getPathname` pattern to generalize into `src/lib/seo/metadata.ts`.
- **`/empresas` charCount fix** (`empresas/page.tsx:144-147`) — the exact
  `t.raw` fix and its explanatory comment; copy verbatim for contact.
- **PDP `generateMetadata`** — `truncateForMeta`, store-name resolution
  (`getStoreSettingsStatic` / `SEED_STORE_NAME`) reusable for OG + JSON-LD.

## Dependency Analysis

### Existing Dependencies to Leverage

- `next` (App Router) — `MetadataRoute.Sitemap`, `MetadataRoute.Robots`,
  `Metadata.alternates`/`openGraph`. No new dep for any Group-A SEO work.
- `next-intl` — `getPathname`, `getTranslations`, `t.raw`.
- `src/lib/catalog/queries.ts` — all enumeration reads for the sitemap.

### New Dependencies Needed

- **Group A: NONE.** All SEO built on Next.js built-ins → keeps the no-CDN,
  strict-CSP, all-local posture intact.
- **Group B (owner-choice-gated):** `@vercel/analytics` (cookieless, first-party
  — recommended), or Plausible; `@sentry/nextjs` (error monitoring). Both are
  deferred behind owner decision + env; neither blocks the deploy.

### Internal Dependencies

- `sitemap.ts` depends on catalog queries → implication: it needs DB access at
  build/request time; must degrade safely if the DB is down at build (edge 3).
- The shared `src/lib/seo/metadata.ts` will be imported by ~8 page files →
  implication: keep it tiny and pure (no DB) so it doesn't fan out server-only
  imports into client boundaries.

## External Research

### API Documentation

- **schema.org / Google rich results**: `Product` needs `name`, `image`,
  `offers{@type:Offer, priceCurrency, price, availability}`; `availability` is a
  schema.org URL enum (`https://schema.org/InStock` / `OutOfStock`). `price` must
  be a plain decimal string in major units — convert integer MXN cents `/100`
  with 2dp. `BreadcrumbList` uses `itemListElement[{@type:ListItem, position,
  name, item}]`.
- **Next.js Metadata routes**: one `sitemap.ts` per app root; `robots.ts`
  returns a `MetadataRoute.Robots`. `alternates.languages` keys are BCP-47 tags
  (`es-MX`, `en`) plus `x-default`. `metadataBase` (a `URL`) is required for
  correct absolute canonical/OG resolution.

### Library Documentation

- **`@vercel/analytics`** (Group B): `<Analytics />` component in the root
  layout; cookieless; script is served first-party from the Vercel domain
  (CSP-friendly if `script-src 'self'` + the analytics endpoint is allowed). No
  consent banner legally required for cookieless analytics → makes AC-B2 N/A if
  chosen.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Taxonomy `[slug]` pages 500 (`DYNAMIC_SERVER_USAGE`) on prod build/start — CONFIRMED live | High (today) | High | Add `export const dynamic="force-dynamic"` to the 3 `[slug]/page.tsx` (matches `/sillas`). VERIFIED: fixes all 3 → HTTP 200 both locales incl. `?page=2`, build stays green. AC-A2 must curl a REAL seeded slug against a PROD server (build exit 0 alone does NOT prove 200 — the throw is request-time) |
| Sitemap DB read fails during a Vercel build → build breaks | Medium | High | Wrap enumeration in try/catch; return static routes on failure; or checklist mandates build-time DB reachability (edge 3, AC-A14) |
| Adding a 3rd-party analytics/monitoring script with NO CSP present | Medium | Medium | Ship CSP first (AC-B6) allow-listing the exact host; keep Group-B default = cookieless Vercel Analytics (first-party) |
| `metadataBase` unset on Vercel → relative canonical/OG | Medium | Medium | Derive from `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_SITE_ORIGIN` (already in env) and assert non-empty; add to checklist |
| Hosted Supabase never migrated → deploy reads an empty DB | High (state today) | High | Checklist: `supabase link` → `db push` 0001..0014 → seed; verify before flipping traffic |

### Performance Considerations

- LCP images already `priority` on home/PLP/PDP (hero:100, gallery:93, grid:57)
  with `sizes` — no regression risk from T14. JSON-LD is a tiny inline script.
- Sitemap over a large catalog: enumeration is a few cached list reads; fine for
  the seed catalog size. If it grows, paginate the sitemap later (not now).

### Security Considerations

- No secret is `NEXT_PUBLIC_` (verified). `metadataBase` uses only public URL
  env. JSON-LD must `JSON.stringify` + escape `<` to avoid `</script>` breakout.
- The one real gap surfaced by the review: **no CSP / security response
  headers** anywhere (see §8). Non-blocking for the SEO deploy but should ship as
  AC-B6, and is a prerequisite before any third-party analytics script.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Blocker fixes first** (fast, unblock the deploy): taxonomy `force-dynamic`
   on the 3 `[slug]/page.tsx` (the #1 blocker — CONFIRMED 500 today, fix
   verified); contact `t.raw` (`contacto/page.tsx:59`) + grep sweep for
   siblings; playwright prod-server + 4 rate flags; seed/reset chain +
   `db:reset` note. — smallest surface, highest deploy leverage.
2. **`src/lib/seo/metadata.ts`** shared helper (canonical + hreflang + OG) — every
   later page edit depends on it.
3. **`metadataBase` + default OG in `layout.tsx`** — pages inherit absolute URLs.
4. **`robots.ts`** (static, no DB) — trivial, unblocks the `Sitemap:` pointer.
5. **`sitemap.ts`** (DB-backed) — after helper + metadataBase exist.
6. **JSON-LD builder/component + per-surface insertions** (PDP → home →
   taxonomy) — depends on nothing but the product/entity reads already present.
7. **Deploy-readiness checklist** doc (captures AC-A8/A14, backup plan).
8. **Group B**: record analytics/monitoring recommendation + stub behind env;
   scope CSP/security-headers for Stage 9.

### Key Decisions

- **Taxonomy render mode**: ADD `export const dynamic="force-dynamic"` to the 3
  `[slug]/page.tsx` — CONFIRMED FIX. Live prod build/start returns HTTP 500
  (`DYNAMIC_SERVER_USAGE`) on all 3 taxonomy detail pages today; the fix demotes
  them to `ƒ Dynamic` (like `/sillas`) and they return 200. This is a real
  Group-A blocker, not a hypothetical. Verify by curling a REAL seeded slug
  against a running prod server — a green `npm run build` alone is NOT proof
  (the throw is request-time; the build passes because there are no prerendered
  params to fail on).
- **Sitemap location**: single ROOT `src/app/sitemap.ts` enumerating both locales
  itself (App Router honors one sitemap per app), NOT a `[locale]`-nested one.
- **Analytics default**: Vercel Analytics (cookieless, first-party) → avoids a
  cookie banner entirely and fits strict-CSP; flag as owner decision.
- **Seeding**: keep reset and seed as two explicit steps but document + add a
  convenience chain; do NOT wire a heavy `seed.sql` that could slow reset.

### Anti-Patterns to Avoid

- Don't trust a green `npm run build` as proof the taxonomy pages work — the
  `DYNAMIC_SERVER_USAGE` 500 is REQUEST-time and only reproduces when you curl a
  real seeded slug against a running prod server. The build passes anyway.
- Don't leave the 3 taxonomy `[slug]` pages without `force-dynamic` — they 500
  in prod today (confirmed). This is the #1 deploy blocker.
- Don't hand a placeholder ICU template to `t("...")` — always `t.raw("...")`
  when a client counter interpolates it (the whole class of blocker 2).
- Don't inline a third-party analytics `<script>` without a CSP — ship CSP first.
- Don't build a `[locale]`-nested sitemap — App Router won't merge them cleanly.
- Don't emit unescaped JSON-LD — escape `<` to prevent `</script>` breakout.

---

## APPENDIX — Hard Evidence (required deliverables)

### (a) Taxonomy-500 root cause — CONFIRMED (real hard blocker; fix verified)

> **CORRECTION (orchestrator, 2026-08-03):** an earlier draft of this section
> marked the bug FALSIFIED after seeing `npm run build` exit 0. That conclusion
> was WRONG — it never issued a request to a taxonomy detail page against a
> running prod server with seeded data, which is where the error actually
> throws. The orchestrator reproduced the 500 empirically, captured the
> `DYNAMIC_SERVER_USAGE` digest, and verified the fix end-to-end. The bug is a
> genuine Group-A deploy blocker. Evidence below.

Claim (pipeline-state BUG-1): `/categorias/[slug]`, `/marcas/[slug]`,
`/estilos/[slug]` throw `DYNAMIC_SERVER_USAGE` / HTTP 500 on a prod
build/start because they are SSG (`generateStaticParams`) yet await
`searchParams` inside a `<Suspense>` boundary. **CONFIRMED.**

**Root-cause chain (file:line):**

- `categorias/[slug]/page.tsx:26` `searchParams: Promise<{page?…}>`, `:38`
  `export async function generateStaticParams()`, `:84` receives `searchParams`
  and `:119-128` passes it DOWN into `<PaginatedProductListing searchParams=…>`
  inside `<Suspense fallback={<ProductGridSkeleton/>}>`.
- `marcas/[slug]/page.tsx:22/26/54/97` — identical shape.
- `estilos/[slug]/page.tsx:21/25/53/88` — identical shape.
- `paginated-product-listing.tsx:43` — `const { page } = await searchParams;`
  (the actual `searchParams` await — deep inside the Suspense subtree).
- **Contrast `/sillas` (`sillas/page.tsx:53` `generateStaticParams` + `:68`
  `const raw = await searchParams`):** it awaits `searchParams` at the TOP level
  of the page component (NOT inside Suspense). That top-level dynamic read makes
  Next 16 mark the whole route `ƒ (Dynamic)`, so the read is legal.
- The 3 taxonomy pages never touch `searchParams` synchronously in the page
  body (only the child component does, under Suspense), so Next keeps the route
  `● (SSG)` and attempts static generation → the deep searchParams read →
  `DYNAMIC_SERVER_USAGE`. This is the exact SSG-vs-dynamic asymmetry.

**Empirical reproduction (prod build + start, seeded local DB, Next 16.2.9):**

- `npm run build` exits **0** (this is the trap — the build passes because the
  taxonomy `[slug]` routes have NO `generateStaticParams` values to prerender at
  build time, so nothing fails during `Generating static pages`; the route table
  shows them as `● (SSG)`, NOT `ƒ Dynamic`).
- `npm run start` then `curl -L` a REAL seeded slug:
  - `/es-MX/categorias/oficina` → **HTTP 500**
  - `/es-MX/marcas/ergovita` → **HTTP 500**
  - `/es-MX/estilos/ejecutiva` → **HTTP 500**
  - `?page=2` and `/en/categorias/oficina` → **HTTP 500**
  - control `/es-MX/sillas` and `/es-MX/sillas?marca=ergovita` → **HTTP 200**
- Server log digest on every taxonomy request: **`digest: 'DYNAMIC_SERVER_USAGE'`**.

**Fix — VERIFIED end-to-end:** add `export const dynamic = "force-dynamic";` to
each of the 3 `[slug]/page.tsx` (matching `/sillas`'s effective posture). After
the fix: rebuild exits 0, the route table shows all 3 as `ƒ (Dynamic)`, and
`curl -L` returns **HTTP 200** for all three (both locales, incl. `?page=2`)
with `data-testid="product…"` grid markup in the server-rendered HTML.
Tradeoff: the taxonomy detail pages lose SSG/prerender and render on demand —
**acceptable**, and identical to what `/sillas` already does (both are
DB-backed, `catalog`-tagged/cached reads, so per-request cost is one bounded
query). Alternative (hoist the `searchParams` await to the page body like
`/sillas`) also works but touches more lines; `force-dynamic` is the minimal,
proven fix. **Verdict: REAL Group-A hard blocker (AC-A2), one line per page.**

### (b) charCount bug — CONFIRMED (+ siblings clean)

- `contacto/page.tsx:59` → `charCount: t("charCount")` on the ICU template
  `contact.charCount = "{count}/{max}"` → next-intl `FORMATTING_ERROR` →
  raw-key leak. Consumed by `contact-form.tsx:235`
  `<CharacterCounter template={labels.charCount} …>`.
- Fix: `t("charCount")` → `t.raw("charCount")` (mirrors `empresas/page.tsx:147`).
- Sibling sweep (`grep t.raw` + `t(...charCount`): the ONLY offender. Correct
  `t.raw` usages: `empresas/page.tsx:147`, `producto/[slug]/page.tsx:134,231`,
  `checkout/confirmacion/[token]/page.tsx:148`. No other `t("...")` on a
  placeholder template found. **Verdict: 1-line fix, no siblings.**

### (c) Metadata / SEO gap inventory

| Surface | title | desc | OG | canonical | hreflang | JSON-LD | Action |
| ------- | ----- | ---- | -- | --------- | -------- | ------- | ------ |
| Home `[locale]/page.tsx` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | +canonical/hreflang/OG, +Organization+WebSite LD |
| `/sillas` | ✅ | (title only) | ❌ | ✅ (+faceted noindex) | ❌ | ❌ | +hreflang/OG |
| PDP `producto/[slug]` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | +canonical/hreflang/OG, +Product+BreadcrumbList LD |
| `/categorias/[slug]` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | +canonical/hreflang, +BreadcrumbList LD |
| `/marcas/[slug]` | ✅ (`:47`) | ✅ (`:48`) | ❌ | ❌ | ❌ | ❌ | +canonical/hreflang, +BreadcrumbList LD |
| `/estilos/[slug]` | ✅ (`:46`) | ✅ (`:47`) | ❌ | ❌ | ❌ | ❌ | +canonical/hreflang, +BreadcrumbList LD |
| `/empresas` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | +canonical/hreflang/OG |
| Static `[pageSlug]` | ✅ (title only, `:48`) | ❌ | ❌ | ❌ | ❌ | ❌ | +desc/canonical/hreflang |
| Contact | ✅ (title only, `:42`) | ❌ | ❌ | ❌ | ❌ | ❌ | +canonical/hreflang |
| Root layout | ✅ (`:34`) | ✅ | ❌ | — | — | — | +`metadataBase` + default OG |

`metadataBase`, `openGraph`, `twitter`, `alternates.languages`, and JSON-LD are
absent store-wide (grep-confirmed). Canonical exists ONLY on `/sillas`.

### (d) next/image audit

- Production code uses `next/image` throughout (`home/hero.tsx`,
  `home/editorial-band.tsx`, `catalog/product-card.tsx`, `catalog/product-grid.tsx`,
  `catalog/catalog-banner.tsx`, `catalog/brand-logo.tsx`, `product/product-gallery.tsx`,
  `checkout/checkout-summary.tsx`, `cart/cart-line-row.tsx`, showroom). No raw
  `<img>` outside test mocks and the (escaped) packing-slip XSS test.
- `priority`: hero (`:100`), PDP gallery main (`:93`), first-row grid cards
  (`product-grid.tsx:57`, `priorityCount=4`); catalog banner deliberately lazy.
  `sizes` set on hero (`:101` `(min-width:1024px)50vw,100vw`) and gallery
  (`:121` `90vw`).
- `next.config.ts` `remotePatterns`: Supabase Storage host (derived from
  `NEXT_PUBLIC_SUPABASE_URL`, protocol http/https aware) + `picsum.photos`
  (seed via `SEED_IMAGE_BASE_URL="https://picsum.photos/seed"`,
  `config/shared.ts:104`). **Verdict: image layer is production-ready; T14 perf
  work = verify + document only.**

### (e) db-reset failure — FALSIFIED (+ real seeding finding)

- Claim: `supabase db reset` fails on analytics/Studio Ecto
  `schema_migrations_pkey` (+ stray anon `pg_default_acl` EXECUTE grant).
- `npm run db:reset` exited **0**; migrations 0001..0014 applied cleanly; only
  benign idempotent-guard `NOTICE`s. `config.toml:34-35` already has
  `[analytics] enabled=false`; `docker ps -a` shows NO analytics/vector/logflare
  container — so the Ecto conflict cannot occur. No `pg_default_acl` warning.
- **Real finding**: no `supabase/seed.sql` and no `[db.seed]` → reset logs
  `WARN: no files matched pattern: supabase/seed.sql` and does NOT seed. Seeding
  is the separate `npm run db:seed` (`tsx scripts/seed.ts`, idempotent upsert via
  the secret key, loads `.env.local`). **Verdict: reset is fine; deliverable is a
  documented/one-command reset+seed path + the hosted apply path.**

### (f) e2e webServer fix — CONFIRMED

- `playwright.config.ts`: `webServer.command = "npm run dev"`; `webServer.env`
  sets `CHECKOUT_RATE_LIMIT_DISABLED=1` + `QUOTE_RATE_LIMIT_DISABLED=1` only.
- Missing: `CONTACT_RATE_LIMIT_DISABLED` (`src/lib/contact/rate-limit.ts:40`) and
  `ADMIN_LOGIN_RATE_LIMIT_DISABLED` (`src/lib/admin/login-rate-limit.ts:40`).
- Dev `notFound()` streams a 200 doc → masks 404 status; cold-compile flaky.
- Fix: `webServer.command` → build to `NEXT_QA_DIST_DIR` + `next start`
  (`next.config.ts` already honors `NEXT_QA_DIST_DIR`), and add the two missing
  flags to `webServer.env`. The config's own comment already anticipates a
  separately-started prod server.

### (g) Vercel + hosted-Supabase DEPLOY-READINESS CHECKLIST

- **Env vars (Vercel project):**
  - Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
    `NEXT_PUBLIC_SITE_URL` (→ `metadataBase`), `NEXT_PUBLIC_SITE_ORIGIN`.
  - Server-only (NEVER `NEXT_PUBLIC_`): `SUPABASE_SECRET_KEY`,
    `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `EMAIL_API_KEY`,
    `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`. (All read via server-only
    accessors in `src/lib/env.ts`.)
  - Group B (optional): analytics/monitoring env once vendor chosen.
- **Migration apply (hosted, empty/never-migrated/unlinked project):**
  `supabase link --project-ref <ref>` → `supabase db push` (applies
  0001..0014) → seed via `npm run db:seed` pointed at the hosted URL/secret (or a
  data import). Confirm RLS policies active post-apply.
- **Remote image hosts:** ensure prod `NEXT_PUBLIC_SUPABASE_URL` host is
  allow-listed (auto-derived in `next.config.ts`); `picsum.photos` stays until
  real photos land.
- **Build command:** `next build` (Vercel default); needs build-time DB
  reachability for `generateStaticParams` + `sitemap.ts` (or those must degrade
  — edge 3 / AC-A14).
- **Region:** pick a Vercel + Supabase region pair close to MX (e.g.
  `us-east`/`gru`-adjacent) to minimize RPC latency; document the choice.
- **Post-deploy:** repoint the MP webhook URL to the prod domain (T8 Phase 5);
  verify PITR/daily backups (AC-B4); smoke-test the 4 Group-A SEO endpoints.

### (h) Security-review inventory (file:line pointers for Stage 9)

- **Secrets:** no `NEXT_PUBLIC_` secret. Server secrets read only via
  `src/lib/env.ts` (`getServerEnv` `:84`, `getMercadoPagoEnv` `:130-131`,
  `getEmailEnv` `:176`, `getAdminEnv` `:229-230`); consumers `import "server-only"`
  (`supabase/admin.ts`, `payments/mp-client.ts`, `admin/session.ts:15`).
  Regression tests: `payments/secret-exposure.test.ts:49`,
  `admin/secret-exposure.test.ts:42`. Stage 9 residual: confirm no server→client
  secret prop-passing (tests only cover env prefixes).
- **Admin auth/revocation:** mint `admin/actions.ts:82-95`; verify (constant-time
  HMAC) `admin/session.ts:101-122`; edge check `middleware.ts:57,69-71`;
  revocation counter table `0012_admin_orders.sql:195-203`, compared at
  `admin/session-guard.ts:47-53` (fail-closed); cookie flags
  `admin/actions.ts:89-95` (`httpOnly`, `sameSite:lax`, `secure:IS_PRODUCTION`).
  Stage 9: confirm `secure` covers all non-local HTTPS envs.
- **MP webhook** `src/app/api/webhooks/mercadopago/route.ts`: HMAC verify before
  side effects `:82-97` (`payments/webhook.ts:127-165`), manifest uses
  query-string id `:75,91`, replay ±5min `webhook.ts:155-163`, invalid sig →
  401 no-op `:94-97`, idempotency claim `process-payment.ts:111-124` backed by
  UNIQUE `(mp_payment_id, mp_status)` `0009_payments.sql:81-82`, 64KB cap
  `:37,46-66`.
- **RLS:** enabled + anon-scoped across catalog (`0005:31-48`), anon DENIED on
  customers/orders/order_items/discount_codes/payment tables
  (`0005:40-44,252-258`, `0009:92-99,123-124`, `0010:302-307`, `0011:50-55`,
  `0012:74-78,201-203`); anon reads `products_public` view (no `cost_price_cents`)
  `0005:116-146`; privileged RPCs `REVOKE ALL FROM public`.
- **CSP / security headers:** **NONE.** `next.config.ts:34-61` defines only
  `images` + `allowedDevOrigins`; no `headers()`; no CSP/HSTS/X-Frame-Options/
  nosniff/Referrer-Policy anywhere. → Stage 9 primary finding + AC-B6; a
  prerequisite before any third-party analytics/monitoring script.
