# Task: T14 — SEO, Analytics & Launch Hardening

## Priority

**Critical** — This is the LAST Phase-1 build task and the gate to the OWNER's
Vercel + hosted-Supabase client-QA deploy. It contains a confirmed prod-only
HTTP 500 on ALL taxonomy detail browsing (`/categorias|marcas|estilos/[slug]`,
`DYNAMIC_SERVER_USAGE` — reproduced live, fix verified), a confirmed
user-visible i18n leak (contact character counter renders a raw key),
broken/unhardened e2e test infra, and the entire net-new SEO surface (sitemap /
robots / JSON-LD / canonical / hreflang / OG) the store needs to be indexable.
A deployed client-QA build MUST NOT 500 on category browsing. Nothing ships
until the Group-A blockers below pass.

> **VERIFICATION NOTE (read before implementing) — CORRECTED by orchestrator
> 2026-08-03:** The planning pass initially marked the taxonomy-500 blocker
> "falsified" after seeing a green `npm run build`. The orchestrator
> re-verified at REQUEST time and the bug is **REAL**. Corrected findings:
>
> - **"PROD-BUILD 500 on taxonomy pages" — CONFIRMED, real hard blocker.**
>   `npm run build` (Next.js 16.2.9) exits 0 BUT the route table shows the 3
>   taxonomy `[slug]` routes as **`● (SSG)`** (not `ƒ Dynamic`). On
>   `npm run start` with a seeded DB, `curl -L` of a real slug
>   (`/es-MX/categorias/oficina`, `/marcas/ergovita`, `/estilos/ejecutiva`,
>   `?page=2`, `/en/...`) returns **HTTP 500** with server-log digest
>   `DYNAMIC_SERVER_USAGE`; `/sillas` returns 200. Root cause: the 3 pages have
>   `generateStaticParams` and pass `searchParams` into `PaginatedProductListing`
>   inside `<Suspense>` (the page body never reads `searchParams` synchronously,
>   so Next keeps the route SSG and the deep await throws during static
>   generation). **FIX (verified end-to-end):** add
>   `export const dynamic = "force-dynamic";` to each of the 3 `[slug]/page.tsx`
>   (matching `/sillas`'s effective posture) → routes become `ƒ Dynamic`, build
>   stays green, all 3 return **HTTP 200** both locales incl. `?page=2`. This is
>   AC-A2 and the #1 Group-A blocker.
> - **"`supabase db reset` broken (Ecto `schema_migrations_pkey`)" — did NOT
>   reproduce on this machine.** `npm run db:reset` exits **0**; migrations
>   0001..0014 apply cleanly; `[analytics] enabled=false` and no analytics/
>   Logflare container exists (the only source of the Ecto conflict; pipeline-
>   state itself noted the stray ACL was "NOT present on this running instance").
>   The REAL, smaller finding: there is **no `supabase/seed.sql` / `[db.seed]`**,
>   so `db:reset` does not seed — seeding is a separate `npm run db:seed`
>   (`tsx scripts/seed.ts`, confirmed: reset then seed yields 6 categories /
>   5 brands / 6 styles / 30 products). T14 makes reset+seed one repeatable path
>   and documents the hosted-apply path. (Note for CI/hosted: the stray anon
>   `pg_default_acl` EXECUTE grant flagged in prior stages can still appear on
>   OTHER environments — the deploy checklist must assert the anon-denial RLS
>   posture post-migrate.)

## Complexity

**high** — justified against the criteria:

- **15+ files touched**: 2 new App-Router special files (`sitemap.ts`,
  `robots.ts`), a new shared SEO metadata helper + a new JSON-LD builder/component
  inserted on PDP / home / taxonomy, `next.config.ts` / layout (`metadataBase` +
  default OG), the contact page (blocker), `playwright.config.ts` + `package.json`
  (e2e infra), seed/reset wiring + deploy checklist, plus the cross-cutting
  security-review inventory feeding Stage 9.
- **New subsystems**: a dynamic sitemap enumerating both locales × products ×
  brands × categories × styles × static pages; a structured-data (JSON-LD)
  layer; a canonical/hreflang/OG metadata convention that did not exist before.
- **Cross-cutting security review** of the whole store (secrets, admin auth, MP
  webhook, RLS, missing CSP/security headers) — see the inventory in the report.
- Not a pattern copy: net-new server routes, a confirmed prod-500 render-mode
  fix (`force-dynamic` on 3 pages), and a bilingual conditional UI surface.

## Feature Type

**full-feature** (full-stack). SEO metadata is logic + `<head>`; `sitemap.ts` /
`robots.ts` are new DB-reading server routes; JSON-LD is server-rendered markup;
the (conditional) cookie banner is client UI; the security review is
cross-cutting. All pipeline stages run at full depth.

## User Story

As the **store owner (and Google/Bing crawlers, and prospective B2B/B2C
customers)**, I want the storefront to be **fully crawlable and richly indexed
(canonical, hreflang, sitemap, robots, product rich-results), free of the raw
i18n key leaking on the contact form, and running on hardened deploy/test
infra**, so that the client-QA deploy succeeds on the first try, search engines
index every product/taxonomy page in both locales, and no user sees a broken
counter.

## Background

**What exists today (verified in current tree):**

- Per-page `generateMetadata` (title + description) exists on the locale layout
  (`src/app/[locale]/layout.tsx:34`), homepage, `/empresas`, `/sillas`, PDP
  (`producto/[slug]/page.tsx`), all 3 taxonomy detail pages, contact, and the
  generic static `[pageSlug]` page.
- `/sillas` has a `canonical` + faceted-`noindex` rule (`sillas/page.tsx:63-85`)
  — the ONLY canonical in the store — and reuses `getPathname` for locale-aware
  URLs (`sillas/page.tsx:126`).
- `next/image` is used everywhere with `priority` on above-the-fold images (hero
  `home/hero.tsx:100` + `sizes`, PDP gallery `product-gallery.tsx:93`, first-row
  grid cards `product-grid.tsx:57`). No raw `<img>` in production code.
  `next.config.ts` allow-lists the Supabase Storage host (derived from
  `NEXT_PUBLIC_SUPABASE_URL`) + `picsum.photos` (seed images).
- Product detail type carries everything Product JSON-LD needs: `name`,
  `brandName`, `priceCents`, `stockState`, cover image URL, alt
  (`src/lib/catalog/types.ts:22-34`); `truncateForMeta` already exists in PDP
  `generateMetadata`.
- Rate-limit escape hatches honored server-side: `CHECKOUT_`, `CONTACT_`,
  `QUOTE_`, `ADMIN_LOGIN_RATE_LIMIT_DISABLED` (all read with `=== "1"`, never
  `NEXT_PUBLIC_`).
- Security posture is already strong (see report §8): no secret is
  `NEXT_PUBLIC_`; admin sessions are HMAC-signed with a DB-backed revocation
  counter; the MP webhook verifies HMAC + replay window + idempotency before any
  side effect; RLS denies anon on every orders/customers/payments/PII table.

**What is missing / broken (verified):**

0. **Taxonomy prod-500 (blocker #1 — CONFIRMED LIVE):** all 3 taxonomy detail
   pages (`categorias/[slug]`, `marcas/[slug]`, `estilos/[slug]`) return HTTP
   500 (`DYNAMIC_SERVER_USAGE`) on a prod build + `next start` with a seeded DB,
   because they are `● SSG` (`generateStaticParams`) yet await `searchParams`
   inside `<Suspense>` via `PaginatedProductListing`. `/sillas` (which awaits
   `searchParams` at the page top level) is `ƒ Dynamic` and returns 200. Fix
   (verified → 200): `export const dynamic = "force-dynamic";` on the 3 pages.
   See the VERIFICATION NOTE above and report §(a).
1. **charCount raw-key leak (blocker — CONFIRMED):** `contacto/page.tsx:59`
   calls `t("charCount")` on the ICU template `"{count}/{max}"`
   (`src/messages/es-MX.json` `contact.charCount`) with no args → next-intl
   `FORMATTING_ERROR` → the raw key can render to users. The `/empresas` twin was
   fixed with `t.raw("form.charCount")` (`empresas/page.tsx:147`); the QA form
   (`product/qa-form.tsx`) and confirmation page also use `t.raw`. Contact is the
   sole remaining offender (grep-confirmed, report §2).
2. **e2e infra (blocker — CONFIRMED):** `playwright.config.ts` `webServer` runs
   `npm run dev` (cold-compile flaky; `notFound()` streams a **200** doc in dev,
   masking real 404 status) and sets only `CHECKOUT_/QUOTE_RATE_LIMIT_DISABLED` —
   missing `CONTACT_` and `ADMIN_LOGIN_`. `next.config.ts` already supports the
   isolated `NEXT_QA_DIST_DIR` build-dir escape hatch for a dedicated prod e2e
   server.
3. **Seed/reset + hosted-apply path (launch hardening — reframed from
   blocker 4):** `db:reset` works but does not seed (no `seed.sql` / `[db.seed]`);
   the hosted Supabase project is empty, never migrated, CLI unlinked — the
   deploy needs a documented, repeatable clean migrate+seed path.

**SEO net-new (verified ABSENT — report §3):** NO `sitemap.ts`, NO `robots.ts`,
NO JSON-LD (`application/ld+json`) anywhere, NO `metadataBase`, NO
`openGraph`/`twitter`, NO `alternates.languages` (hreflang); canonical only on
`/sillas`.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

### GROUP A — HARD DEPLOY-BLOCKERS (must all pass before the Vercel/hosted-Supabase client-QA deploy)

- [ ] **AC-A1 (build green):** `npm run build` completes with exit 0 and ZERO
      errors after all T14 edits. (Note: a green build does NOT by itself prove
      AC-A2 — the taxonomy 500 is a request-time error; AC-A2 must be verified by
      an actual request against a running prod server.)
- [ ] **AC-A2 (blocker #1 — taxonomy 500 FIXED):** Add
      `export const dynamic = "force-dynamic";` to `categorias/[slug]/page.tsx`,
      `marcas/[slug]/page.tsx`, `estilos/[slug]/page.tsx`. On a PROD build +
      `next start` with a SEEDED DB, `GET /categorias/<seed-slug>`,
      `/marcas/<seed-slug>`, `/estilos/<seed-slug>` (and `/en/...` variants) each
      return HTTP **200** (NOT 500 / `DYNAMIC_SERVER_USAGE`) with the product grid
      (`data-testid="product…"`) in the server-rendered HTML; `?page=2` also
      returns 200 with page-2 items. Verification: `curl -L` a real seeded slug —
      this is the ONLY way to prove the fix (build exit 0 is insufficient).
      Confirmed today: WITHOUT the fix all three are HTTP 500; WITH it all three
      are 200 and the route table shows them as `ƒ Dynamic`.
- [ ] **AC-A3 (blocker — charCount):** The contact form message counter renders
      the formatted `"0/1200"` (count/max), NOT the literal `charCount` key or
      `{count}/{max}`, in both es-MX and en. Fix: `contacto/page.tsx:59`
      `t("charCount")` → `t.raw("charCount")`.
- [ ] **AC-A4 (blocker — no sibling raw-key leaks):** Grep confirms no other
      storefront `t("...")` is called on a placeholder-bearing ICU template that
      must be `t.raw()`. Confirmed clean or all fixed.
- [ ] **AC-A5 (blocker — e2e prod server):** `playwright.config.ts` `webServer`
      runs a PROD server (build to `NEXT_QA_DIST_DIR` + `next start`), NOT
      `npm run dev`, and exports all four flags: `CHECKOUT_`, `QUOTE_`,
      `CONTACT_`, `ADMIN_LOGIN_RATE_LIMIT_DISABLED=1`.
- [ ] **AC-A6 (blocker — real 404):** Against the prod e2e server, a
      known-missing route returns a real **404** status (not the dev 200 doc).
- [ ] **AC-A7 (reset+seed path):** A single documented command sequence brings a
      clean LOCAL DB to migrated + seeded (`npm run db:reset && npm run db:seed`,
      or a wired `[db.seed]`/`seed.sql`), verified exit 0.
- [ ] **AC-A8 (hosted-apply path):** The deploy checklist documents a repeatable
      clean migrate+seed for the hosted Supabase project (link → `db push`
      0001..0014 → seed/import), with the exact commands.
- [ ] **AC-A9 (SEO — sitemap):** `GET /sitemap.xml` returns 200
      `application/xml` enumerating, for BOTH locales, every active product,
      brand, category, style, `/sillas`, homepage, and published static page,
      with absolute URLs from `metadataBase` and per-URL `alternates` hreflang.
- [ ] **AC-A10 (SEO — robots):** `GET /robots.txt` returns 200 allowing
      storefront crawl, disallowing `/admin`, `/api`, `/checkout`, `/carrito`,
      and faceted `/sillas` query URLs, with `Sitemap:` pointing at the absolute
      `/sitemap.xml`.
- [ ] **AC-A11 (SEO — canonical + hreflang):** Every indexable surface (home,
      unfiltered `/sillas`, PDP, the 3 taxonomy detail pages, static pages,
      `/empresas`) emits a self-referential `canonical` + `alternates.languages`
      for `es-MX`, `en`, and `x-default`, via a shared helper. `/sillas`'s
      existing faceted-`noindex`/canonical rule is preserved.
- [ ] **AC-A12 (SEO — JSON-LD):** PDP emits valid `Product` JSON-LD (name, image,
      `brand`, `offers` with `priceCurrency:"MXN"`, `price` as major-unit decimal
      from integer cents, `availability` from `stockState`); home emits
      `Organization` + `WebSite`; taxonomy + PDP emit `BreadcrumbList`. Validates
      with no required-field errors.
- [ ] **AC-A13 (secrets in bundle):** Client bundle contains ZERO server
      secrets — no MP access token, Resend key, Supabase `service_role`, or MP
      webhook secret is `NEXT_PUBLIC_`-prefixed or reachable from a client
      component (existing `secret-exposure` tests still green). `metadataBase` /
      site URL come from a non-secret env var (`NEXT_PUBLIC_SITE_URL` /
      `NEXT_PUBLIC_SITE_ORIGIN`, already present).
- [ ] **AC-A14 (build determinism):** `sitemap.ts` and `generateStaticParams`
      degrade safely (empty/partial, no throw) if the DB is unreachable at build,
      OR the deploy checklist mandates build-time DB access and documents it.

### GROUP B — OWNER-CHOICE-GATED / NICE-TO-HAVE (do NOT block the deploy)

- [ ] **AC-B1 (analytics vendor):** Recommend Vercel Analytics
      (`@vercel/analytics` — first-party, cookieless, CSP-friendly) as default,
      vs. Plausible. **Waits on:** owner vendor decision + any env. PASS =
      decision recorded and wiring stubbed behind an env flag, or explicitly
      deferred. If chosen, note it needs the (missing) CSP to allow its script.
- [ ] **AC-B2 (cookie consent — CONDITIONAL):** IF the chosen analytics sets
      cookies → ship a bilingual, design-system-consistent consent banner
      (LFPDPPP). IF Vercel Analytics (cookieless) → banner NOT required, AC N/A.
      **Waits on:** AC-B1 outcome.
- [ ] **AC-B3 (error monitoring):** Recommend Sentry (`@sentry/nextjs`) or
      equivalent; DSN + config env-driven. **Waits on:** owner decision + DSN
      env. PASS = decision recorded or deferred.
- [ ] **AC-B4 (backup verification):** Document a PITR / daily-backup +
      restore-test checklist for the hosted Supabase project. **Waits on:** the
      live project existing post-deploy.
- [ ] **AC-B5 (perf/LCP verify):** Confirm LCP images on home/PLP/PDP are
      `priority` (already true — hero:100, gallery:93, grid:57) + record a
      bundle-size sanity note. Verify + document.
- [ ] **AC-B6 (security headers — from review, non-blocking):** Recommend adding
      a `headers()`/middleware security-header layer (CSP, X-Frame-Options/
      frame-ancestors, HSTS, X-Content-Type-Options, Referrer-Policy) — the one
      clear gap the security inventory found. Scope for Stage 9; a CSP is a
      prerequisite if a third-party analytics/monitoring script is chosen.

## Edge Cases

1. **Taxonomy `?page=99` (out of range) on prod** → query layer already clamps
   to `lastPage` (M-2); page must return 200 with the clamped last page, never
   500. (Only true AFTER the `force-dynamic` fix — without it the page 500s on
   ANY request regardless of `?page`.)
2. **Category/brand/style with ZERO active products** → sitemap includes-or-
   safely-excludes without throwing; the page renders its `<EmptyState>` (200).
3. **DB unreachable at build on Vercel** → `sitemap.ts` +
   `generateStaticParams` must not crash the build (empty/partial + on-demand
   fallback) OR the checklist mandates build-time DB access. No unhandled
   rejection.
4. **Slug with URL-unsafe characters** → sitemap URLs properly encoded; XML
   stays valid.
5. **Locale-prefixed vs default URLs** → es-MX is unprefixed default, en is
   `/en/...`. hreflang + sitemap `<loc>`/alternates use per-locale `getPathname`
   (as `sillas/page.tsx:126`); `x-default` → the es-MX URL.
6. **Faceted `/sillas?marca=...`** → MUST NOT appear in the sitemap (it is
   `noindex,follow`); only clean `/sillas` + `?page=N` canonicals are indexable.
7. **Product with null/zero price or out-of-stock in JSON-LD** → omit the
   invalid `offers` field / map `availability` to `OutOfStock`; never emit
   malformed JSON.
8. **Cookie banner (if shipped) with `prefers-reduced-motion` / no-JS** →
   dismissible without motion, does not block content for a no-JS browser.

## Error States Table

| Trigger | User Sees | System Does |
| ------- | --------- | ----------- |
| Contact counter with unformatted key (pre-fix) | literal `charCount` / `{count}/{max}` | next-intl `FORMATTING_ERROR` — MUST be eliminated via `t.raw` |
| `/sitemap.xml` requested, DB read fails | valid but reduced sitemap (static routes only) | log error with context, return 200 with buildable routes; never 500 |
| `/robots.txt` requested | plain-text robots policy | served with no DB dependency |
| Missing route on prod e2e server | localized 404 page | returns real 404 status (fixes dev 200-doc masking) |
| `db:reset` run on a dev machine | schema recreated, migrations applied, NO data | developer must run `db:seed` next — documented so no confusion |
| Analytics/monitoring env absent (Group B) | no analytics; app works | feature is a no-op behind an env flag; never throws / blocks render |
| JSON-LD for a product with null price/stock | product page renders; offer omitted / availability=OutOfStock | JSON-LD omits invalid field, stays valid |
| Third-party analytics script with no CSP | works, but no CSP protection | Stage 9 adds CSP allow-listing that host (AC-B6) |

## UX Requirements

Storefront-facing surfaces of this task (contact counter fix, conditional cookie
banner, and the taxonomy pages that must keep working):

- **Loading:** Taxonomy pages keep the `<ProductGridSkeleton>` Suspense fallback
  (`categorias/[slug]/page.tsx:119`); the SEO edits must NOT remove it.
- **Empty:** Taxonomy `<EmptyState>` (`empty.category/brand/style`) unchanged and
  still 200. Sitemap of an empty catalog is valid XML with static routes only.
- **Error:** `/sitemap.xml` on DB error degrades to static routes (no 500).
  Cookie banner (if shipped) never traps focus.
- **Success:** Contact counter shows `"0/1200"` live-updating as the user types
  (es-MX and en). Crawlers receive canonical + hreflang + JSON-LD + OG in head.
- **Mobile (375px):** Cookie banner (if shipped) is a full-width bottom bar/sheet
  that does not cover the primary CTA and is thumb-dismissible; contact counter
  legible.
- **Tablet (768px):** Cookie banner is a bounded bar; taxonomy grids unaffected;
  no horizontal overflow.

Any cookie banner MUST follow the `emil-design-eng` + `apple-design` skills:
enter `ease-out`, respect `prefers-reduced-motion`, animate transform/opacity
only, interruptible.

## Technical Approach

### Files to Create

- `src/app/sitemap.ts` — a single ROOT dynamic sitemap (App Router calls one
  `sitemap` per app; enumerate both locales itself). Reuse
  `listActiveProductSlugs`, `listBrands`, `listStyles`, `listCategories`
  (+ `flattenSlugs`), and the static-pages reader; build per-locale URLs with
  `getPathname` (`src/i18n/navigation`) and add `alternates.languages` per entry.
- `src/app/robots.ts` — static robots policy + absolute `Sitemap:` from
  `metadataBase`; disallow `/admin`, `/api`, `/checkout`, `/carrito`.
- `src/lib/seo/metadata.ts` — shared helper: `buildAlternates(pathname)` →
  `{ canonical, languages: { "es-MX", "en", "x-default" } }` and a
  `buildOpenGraph(...)` helper. Single-sources the convention (DRY per CLAUDE.md).
- `src/lib/seo/json-ld.ts` + `src/components/seo/json-ld.tsx` — typed builders
  for `Product`, `Organization`, `WebSite`, `BreadcrumbList` + a server
  component rendering `<script type="application/ld+json">` with safe escaping.
- `tasks/deploy-readiness-checklist.md` — Vercel + hosted-Supabase checklist
  (env vars, migrate+seed apply path, image hosts, build command, region, backup
  plan, security-headers note).
- (Conditional, Group B) `src/components/consent/cookie-consent.tsx` — bilingual
  banner, ONLY if a cookie-using analytics vendor is chosen.

### Files to Modify

- `src/app/[locale]/contacto/page.tsx:59` — **blocker fix**: `t("charCount")` →
  `t.raw("charCount")`.
- `playwright.config.ts` — **blocker fix**: `webServer.command` → build to
  `NEXT_QA_DIST_DIR` + `next start`; add `CONTACT_RATE_LIMIT_DISABLED=1` and
  `ADMIN_LOGIN_RATE_LIMIT_DISABLED=1` to `webServer.env`.
- `package.json` — add the e2e prod-server script the playwright config invokes
  (build with `NEXT_QA_DIST_DIR` then `next start`); optionally a
  `db:reset:seed` convenience that chains reset + seed.
- `supabase/config.toml` (or add `supabase/seed.sql`) — wire seeding so a fresh
  reset optionally seeds, OR document the two-step. (No schema change.)
- `next.config.ts` — no functional change needed to remotePatterns (already
  covers prod Supabase host); confirm and leave locked.
- `src/app/[locale]/layout.tsx` — set `metadataBase` (from `NEXT_PUBLIC_SITE_URL`/
  `NEXT_PUBLIC_SITE_ORIGIN`) + default `openGraph` in the root `generateMetadata`
  so all pages inherit absolute URLs.
- `src/app/[locale]/producto/[slug]/page.tsx` — add `Product` + `BreadcrumbList`
  JSON-LD + canonical + hreflang.
- `src/app/[locale]/page.tsx` (home) — add `Organization` + `WebSite` JSON-LD +
  canonical + hreflang.
- `src/app/[locale]/categorias/[slug]/page.tsx`, `marcas/[slug]/page.tsx`,
  `estilos/[slug]/page.tsx` — **blocker #1 fix**: add
  `export const dynamic = "force-dynamic";` (fixes the confirmed prod-500 /
  `DYNAMIC_SERVER_USAGE`; verified → HTTP 200). ALSO add canonical + hreflang +
  `BreadcrumbList` JSON-LD.
- `src/app/[locale]/sillas/page.tsx`, `empresas/page.tsx`, `[pageSlug]/page.tsx`
  — add hreflang `alternates.languages` (sillas already has canonical).

### Data Model Changes

None. Read-only against schema 0001..0014. No new tables/columns/migrations.
(Blocker 3 is a migrate+seed **apply-path** item, not a schema change.)

### API / Route Additions

- `GET /sitemap.xml` (via `src/app/sitemap.ts`) — dynamic, DB-backed, both
  locales.
- `GET /robots.txt` (via `src/app/robots.ts`) — static policy + sitemap pointer.
- No new REST/server-action endpoints.

### Dependencies

- **None required for Group A.** sitemap/robots/JSON-LD/canonical/hreflang/OG all
  use built-in Next.js App Router APIs (`MetadataRoute.Sitemap`,
  `MetadataRoute.Robots`, `Metadata.alternates`/`openGraph`, plain `<script>` for
  JSON-LD) + existing `next-intl` navigation — consistent with no-CDN/strict-CSP.
- **Group B (owner-choice-gated, flagged):**
  - `@vercel/analytics` — first-party, cookieless, CSP-friendly. Recommended
    default. Owner approval + Vercel project setting.
  - `@sentry/nextjs` — error monitoring. Owner approval + DSN env.
  - Cookie banner (only if a cookie-using analytics is chosen) — no new dep;
    build on existing shadcn/ui + Tailwind.

## Out of Scope

- Admin (`src/app/admin/**`) SEO — admin is out of the storefront crawl surface;
  do NOT touch `admin/` or `ui/*`.
- Any `next.config.ts` change beyond confirming remotePatterns (locked through
  T15/T16), other than a possible security-headers `headers()` block scoped to
  Stage 9 (AC-B6).
- Net-new schema/migrations (blocker 3 is apply-path only).
- Provisioning the hosted Supabase project / performing the Vercel deploy (owner
  action; T14 delivers the checklist + clean apply path).
- Selecting the analytics/monitoring vendor and adding production keys
  (owner-gated Group B).
- Real product photography (seed picsum images remain).
- MP live-sandbox sign-off (T8 Phase 5, separate gate).
