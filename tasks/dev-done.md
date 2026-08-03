# Dev Summary: T14 — SEO, Analytics & Launch Hardening (Group A)

Stage 4 (Dev) implemented **all Group A hard deploy-blockers (AC-A2..A14)** in
full, production-ready, zero TODOs. Group B is owner-gated and NOT built (decision
log below). Every AC verified end-to-end against a **prod build + `next start`**
against the seeded local DB — not just a green build.

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `src/app/[locale]/categorias/[slug]/page.tsx` | modified | `export const dynamic = "force-dynamic"` (A2 fix); `alternates` hreflang (A11); `BreadcrumbList` JSON-LD (A12). Kept Suspense/skeleton/EmptyState/grid verbatim. |
| `src/app/[locale]/marcas/[slug]/page.tsx` | modified | Same three: force-dynamic + hreflang + BreadcrumbList. Crumbs hoisted to a var to feed both `<Breadcrumbs>` + `<JsonLd>`. |
| `src/app/[locale]/estilos/[slug]/page.tsx` | modified | Same three. |
| `src/app/[locale]/contacto/page.tsx` | modified | **A3**: `t("charCount")` → `t.raw("charCount")` (mirrors empresas:147) + explanatory comment. Added canonical/hreflang (A11). |
| `src/app/[locale]/producto/[slug]/page.tsx` | modified | `Product` + `BreadcrumbList` JSON-LD (A12); canonical + hreflang + OG (A11). Offer omitted on null/zero price; availability from stockState (edge 7). |
| `src/app/[locale]/page.tsx` (home) | modified | `Organization` + `WebSite` JSON-LD (A12); canonical + hreflang + OG (A11). JSON-LD built in the existing `Promise.all`. |
| `src/app/[locale]/sillas/page.tsx` | modified | Added `alternates.languages` hreflang while PRESERVING the existing faceted-`noindex` + page-N canonical rule (A11). |
| `src/app/[locale]/empresas/page.tsx` | modified | canonical + hreflang + OG (A11). |
| `src/app/[locale]/[pageSlug]/page.tsx` | modified | canonical + hreflang + body-derived description (A11 + gap-inventory "+desc"). |
| `src/app/[locale]/layout.tsx` | modified | `metadataBase` from the public site-URL env + default `openGraph`/`twitter` (A11/A13/A14). |
| `src/app/sitemap.ts` | created | Root dynamic sitemap: both locales × products/brands/categories/styles/static-pages + home/`/sillas`/`/empresas`/`/contacto`, absolute URLs + per-URL hreflang. Degrades to static routes if the DB is down (A9/A14, edges 2/3/4/6). |
| `src/app/robots.ts` | created | Static robots policy (no DB), disallows `/admin` `/api` `/checkout` `/carrito` + faceted `/sillas?`; absolute `Sitemap:` pointer (A10). |
| `src/lib/seo/site-url.ts` | created | `getSiteUrl()` / `absoluteUrl()` — public-env origin resolver, never throws (A13/A14). |
| `src/lib/seo/metadata.ts` | created | `buildAlternates()` (canonical + hreflang incl. x-default) + `buildOpenGraph()`. Pure, DRY-single-sourced (A11). |
| `src/lib/seo/json-ld.ts` | created | Typed pure builders: `buildProductLd` / `buildOrganizationLd` / `buildWebSiteLd` / `buildBreadcrumbLd`, cents→MXN-major, stock→availability (A12). |
| `src/lib/seo/breadcrumb.ts` | created | `crumbsToBreadcrumbLd()` — bridges the visible `Breadcrumbs` items to BreadcrumbList JSON-LD (reuses the same ordered array). |
| `src/components/seo/json-ld.tsx` | created | Server component rendering `<script type="application/ld+json">` with `<`/U+2028/U+2029 escaping (XSS-safe, A12). Renders NO visible UI. |
| `src/lib/content/static-pages.ts` | modified | Added `listPublishedStaticPageSlugs()` for the sitemap (RLS-scoped, degrades to `[]`). |
| `playwright.config.ts` | modified | **A5**: webServer → prod build (`npm run e2e:server`, `NEXT_QA_DIST_DIR=.next-e2e`) + all 4 rate flags (CHECKOUT/QUOTE/CONTACT/ADMIN_LOGIN); 240s timeout. |
| `package.json` | modified | `e2e:server` (build+start into `.next-e2e`) + `db:reset:seed` convenience (A5/A7). |
| `e2e/not-found.spec.ts` | modified | **A6**: added a `request`-level test asserting a bogus route + missing taxonomy slug return a real **404** (proves the prod server, not a dev 200 doc). |
| `src/lib/seo/*.test.ts`, `src/components/seo/json-ld.test.ts` | created | 24 new unit tests for the helpers/builders/escaping. |
| `tasks/deploy-readiness-checklist.md` | created | Vercel + hosted-Supabase env/migrate+seed/region/RLS-assertion/smoke-test checklist (A8/A14 + Group-B decision log). |

## Acceptance Criteria Map (Group A) — all verified against a running prod server

| AC | How satisfied | How verified |
|----|---------------|--------------|
| A1 build green | All T14 edits compile | `npm run build` exit 0; route table clean |
| **A2 taxonomy 500 fixed** | `dynamic="force-dynamic"` ×3 | Route table shows all 3 `[slug]` as `ƒ Dynamic`; `curl -L` real seeded slugs → **200** both locales incl. `?page=2` (were 500) |
| A3 charCount | `t.raw("charCount")` | Rendered `<span data-testid="contact-counter">0/2000</span>` (formatted N/M, not the raw key); RSC prop = `"{count}/{max}"` template |
| A4 no sibling leaks | grep sweep | No bare `t("...charCount"/"...counter")` remains; all counter templates use `t.raw` |
| A5 e2e prod server | webServer → `next start` + 4 flags | `playwright.config.ts` + `package.json` `e2e:server` |
| A6 real 404 | new `request`-level test | `curl` bogus + missing taxonomy slug → **404** (real status, not dev 200 doc) |
| A7 reset+seed path | `db:reset:seed` | Documented; two-step also documented |
| A8 hosted-apply path | deploy checklist | link → `db push` 0001..0014 → seed, with commands + post-migrate RLS assertion |
| A9 sitemap | `src/app/sitemap.ts` | `/sitemap.xml` → 200 `application/xml`, well-formed; 120 `<loc>` + 360 hreflang alternates, real product/taxonomy/static URLs, both locales |
| A10 robots | `src/app/robots.ts` | `/robots.txt` → 200; disallows + absolute `Sitemap:` pointer |
| A11 canonical + hreflang | shared helper store-wide | Every indexable surface: canonical=1 + hreflang=3 (es-MX/en/x-default); `/sillas?marca=` still `noindex,follow` + canonical→clean |
| A12 JSON-LD | builders + component | PDP: valid Product (price 8999.00 MXN, InStock) + BreadcrumbList; home: Organization + WebSite; all parse as valid JSON |
| A13 no secret in bundle | public-env site URL only | grep of `.next/static` for every server-secret VALUE → **0 hits**; no `NEXT_PUBLIC_` secret names |
| A14 build determinism | safe-degrade reads | sitemap + generateStaticParams wrapped try/catch → static-only fallback; checklist documents build-time DB + `NEXT_PUBLIC_SITE_URL` requirement |

## Data-Testids Added
- None new. Existing `data-testid="contact-counter"` now renders `0/2000` instead
  of the leaked key. Existing `product…`/`breadcrumbs`/`not-found-home` testids
  unchanged. JSON-LD/sitemap/robots render no interactive UI (no testids needed).

## Key Decisions
- **force-dynamic over hoisting searchParams**: minimal, proven 1-line-per-page
  fix matching `/sillas`'s effective posture; the read is one bounded cached query.
- **Single root sitemap** enumerating both locales itself (App Router honors one
  sitemap per app) — not a `[locale]`-nested one.
- **`hrefLang` alternates via `Metadata.alternates.languages`** + `x-default` →
  es-MX; canonical is self-referential per active locale.
- **JSON-LD escaping** escapes `<` + U+2028/U+2029 (written with ASCII `\uXXXX`
  regex escapes so the source has no raw separator bytes) — XSS-safe embed.
- **Site URL** from `NEXT_PUBLIC_SITE_URL` → `NEXT_PUBLIC_SITE_ORIGIN` →
  localhost; never throws so the build stays deterministic.
- **Breadcrumb JSON-LD reuses the visible `Breadcrumbs` items array** (the
  component's documented T14 intent) — no duplicate crumb source, and NO visible
  breadcrumb UI was added (BreadcrumbList is metadata only).

## Group B Decision Log (owner-gated — NOT built)
- **B1 analytics**: Recommend `@vercel/analytics` (first-party, cookieless,
  CSP-friendly). Awaiting owner. No env; toggled in the Vercel UI.
- **B2 cookie consent**: **N/A — cookieless analytics ⇒ no banner ships.** Not
  built (per ui-design.md contingency gate). Spec preserved if a cookie vendor is
  later chosen.
- **B3 error monitoring**: Recommend `@sentry/nextjs`; DSN env-driven. Deferred.
- **B4 backup verification**: PITR + restore test — documented in the checklist,
  runs after the hosted project exists.
- **B5 LCP/bundle**: LCP images already `priority` (hero/gallery/grid) — verified,
  no change. AC-A13 bundle scan clean.
- **B6 security headers/CSP**: The one real security gap; scoped to Stage 9. A CSP
  is a prerequisite before any third-party analytics/monitoring script.

## Deviations from Ticket
- Contact counter renders `0/2000` (not `0/1200`): `CONTACT_MESSAGE_MAX = 2000`
  in config. The AC's intent — a FORMATTED `N/M`, not the raw key — is met; the
  literal 1200 in the AC text was an estimate.
- `[pageSlug]` gained a body-derived meta `description` (via `truncateForMeta`) to
  satisfy the gap-inventory "+desc", since the reader returns only title+body.

## Edge Cases Handled
- `?page=99` out-of-range → 200 clamped (verified) — taxonomy `force-dynamic`.
- Taxonomy with zero active products → sitemap safe, page renders `<EmptyState>` 200.
- DB unreachable at build → sitemap degrades to static routes; generateStaticParams
  empty; no throw (A14). `safeRead` per source in sitemap.
- Slug with unsafe chars → next-intl `getPathname` + `URL` encode; XML stays valid.
- es-MX unprefixed / en `/en` → per-locale `getPathname`; `x-default` → es-MX.
- Faceted `/sillas?marca=` → excluded from sitemap, stays `noindex,follow`.
- Product null/zero price → `offers` omitted; out-of-stock → `OutOfStock`.

## How to Test
1. `npm run db:reset:seed` (or ensure the local DB is seeded).
2. `NEXT_PUBLIC_SITE_URL=http://localhost:3000 npm run build && npm run start`.
3. `curl -L localhost:3000/es-MX/categorias/oficina` (and `/marcas/ergovita`,
   `/estilos/ejecutiva`, `?page=2`, `/en/...`) → all **200**.
4. `curl localhost:3000/sitemap.xml` → 200 XML; `/robots.txt` → 200.
5. View-source a PDP → 2 `application/ld+json` (Product + BreadcrumbList).
6. Open `/es-MX/contacto` → counter shows `0/2000`.
7. `curl -o /dev/null -w "%{http_code}" localhost:3000/no-existe-xyz` → **404**.

## Env / Infra Notes for QA
- e2e now runs a PROD server: `npm run test:e2e` triggers `npm run e2e:server`
  (build into `.next-e2e` + `next start`) with all 4 rate flags. First run is
  slower (real build); timeout raised to 240s.
- `NEXT_PUBLIC_SITE_URL` drives all SEO URLs — set it for prod (checklist §1/§5).
- `.next-e2e` is a throwaway dist dir (NEXT_QA_DIST_DIR pattern; add to .gitignore
  if not already covered by `.next*`).

## What Review (Stage 5) Should Scrutinize
- `src/components/seo/json-ld.tsx` escaping (security-load-bearing): confirm the
  `<`/U+2028/U+2029 escape can't be bypassed; the source uses `\uXXXX` escapes.
- `buildAlternates`/`localeUrl` for `x-default` correctness across locales.
- Sitemap `safeRead` degrade-to-empty paths (no unhandled rejection on DB down).
- The 3 taxonomy pages: confirm Suspense/skeleton/EmptyState/grid untouched.
- `metadataBase` inheritance: per-page `openGraph` merges correctly over layout.

## Gates (independently run)
- `npx tsc --noEmit`: **0 errors** (whole project).
- eslint: **clean** on every touched + new file.
- Unit suite: **2025/2025 passing** (123 files; +24 new SEO tests, no regressions;
  was 2001/2001).
- Load-bearing: build exit 0; `next start` + curl matrix — taxonomy 200 (both
  locales + `?page=2`), sitemap.xml/robots.txt 200, bogus route 404, PDP JSON-LD
  valid, contact counter `0/2000`, canonical+hreflang on every indexable surface,
  faceted noindex preserved, **zero server secrets in the client bundle**.

## Dependencies Added
- None. All Group-A SEO uses Next.js App Router built-ins + existing next-intl.

Status: **success** — all Group A criteria implemented and verified.
