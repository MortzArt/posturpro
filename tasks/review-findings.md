# Code Review: T14 — SEO, Analytics & Launch Hardening (Group A)

## Summary
Strong, disciplined implementation of all 14 Group-A blockers. The security-load-bearing
JSON-LD escaping is **correct** (verified against a real `</script>` + U+2028/U+2029 probe),
site-URL is env-only (no host-header injection), all gates pass (tsc 0, eslint clean,
2025/2025 unit tests). Two real correctness defects: `robots.txt` disallow rules miss the
English `/en/...` funnel paths, and the sitemap emits a **duplicate** `/contacto`
entry. Neither is a security hole; both are SHOULD-FIX before the client-QA crawl.

Gate results (independently run, not trusted from dev-done):
- `npx tsc --noEmit` → **exit 0** (whole project).
- eslint on all changed dirs (`src/app`, `src/lib/seo`, `src/components/seo`, `static-pages.ts`) → **clean**.
- `npx vitest run` → **2025 passed / 2025** (123 files).
- JSON-LD escape probe (`</script><script>`, raw U+2028, raw U+2029) → **all neutralized** (evidence below).

---

## Critical Issues (MUST FIX)

_None._ I attacked the JSON-LD serialization and the site-URL resolver specifically and
could not break either. Evidence recorded so the next stages don't have to re-derive it.

**JSON-LD escaping — VERIFIED SAFE (not a finding, documented so it isn't re-litigated):**
`escapeForScriptSafe` (`src/components/seo/json-ld.tsx:26-31`) runs on the **serialized**
JSON string (`escapeForScriptSafe(JSON.stringify(node))`, line 45), not selectively on
fields. Traced attack `name: "</script><script>alert(1)</script>"`:
`JSON.stringify` → `{"name":"</script>..."}` → escape turns every `<` into `<` →
`{"name":"</script>..."}`. No raw `<` survives, so the `</script>` sequence cannot
terminate the element. Raw U+2028/U+2029 (which `JSON.stringify` passes through unescaped)
are replaced with literal ` `/` ` — confirmed the `new RegExp("\\u2028","g")`
matches the actual code point, not a literal backslash-u. `&` and `>` are left un-escaped,
which is **fine inside a `<script>`** (they are not markup-significant in raw-text element
content once `<` is neutralized).

---

## Major Issues (SHOULD FIX)

### M-1: robots.txt disallow rules do not cover English (`/en/...`) funnel paths
- **ID**: M-1
- **Severity**: MAJOR
- **File**: `src/app/robots.ts:19-28`
- **Problem**: The disallow list is `["/admin", "/api/", "/checkout", "/carrito", "/sillas?", "/en/sillas?"]`.
  `/carrito` and `/checkout` are locale-prefixed routes under `src/app/[locale]/` (confirmed:
  both folders exist under `[locale]`), so the English funnel is served at `/en/carrito` and
  `/en/checkout` — **neither is disallowed**. The faceted-noindex rule was correctly duplicated
  for `/en/sillas?`, but the cart/checkout equivalents were not. `/admin` and `/api` ARE
  app-root routes (confirmed `src/app/admin`, `src/app/api` are NOT under `[locale]`), so those
  two are correct.
- **Impact**: Crawlers can index the English cart and checkout pages (transient,
  duplicate-content funnel URLs). Not a data leak (those pages are gated/empty for anon), but
  it is exactly the crawl-surface hygiene AC-A10 is meant to enforce, asymmetrically applied
  between locales.
- **Suggested Fix**: Add `"/en/checkout"` and `"/en/carrito"` to the disallow array. (robots
  prefix matching means `/checkout` covers `/checkout/*` but NOT `/en/checkout`.)
- **Status**: OPEN

### M-2: Sitemap emits a duplicate `/contacto` entry (both locales)
- **ID**: M-2
- **Severity**: MAJOR
- **File**: `src/app/sitemap.ts:45-50, 91, 99, 119-120`
- **Problem**: `STATIC_HREFS` hard-codes `staticPagePath(CONTACT_SLUG)` = `/contacto` (line 49).
  Separately, `listPublishedStaticPageSlugs()` returns **every** published static-page slug —
  and the seed publishes all 9 (`sobre-nosotros, envios, devoluciones, garantia,
  preguntas-frecuentes, aviso-de-privacidad, terminos, contacto, showroom`; verified in
  `scripts/seed-data/content.ts`), so `contacto` is mapped again at line 99. The final
  `allHrefs` (line 119) therefore contains `/contacto` twice, producing a duplicate `<loc>`
  per locale (4 duplicate rows total). Verified by simulation: `DUPLICATES: [ [ '/contacto', 2 ] ]`.
- **Impact**: AC-A9's "no orphan/duplicate URLs" is violated. Duplicate `<loc>` entries are a
  sitemap validity smell for a launch-QA crawl. `/showroom` is also pulled in via the dynamic
  list — that one is CORRECT (it is a real crawlable route) and should stay.
- **Suggested Fix**: De-dupe before emitting. Simplest: drop `staticPagePath(CONTACT_SLUG)`
  from `STATIC_HREFS` (already covered by the published-slugs read), OR dedupe `allHrefs`
  with a `Set` keyed on the resolved href in `sitemap()`. Prefer the `Set` so a future overlap
  between STATIC_HREFS and the catalog reads can't reintroduce the bug.
- **Status**: OPEN

---

## Minor Issues (NICE TO FIX)

### m-1: Sitemap `<loc>` URLs are not XML-escaped for a literal `&` in a slug
- **File**: `src/lib/seo/site-url.ts:57` (`new URL().toString()`), surfaced in `sitemap.ts`
- **Detail**: `new URL(pathname, origin).toString()` percent-encodes spaces, `<`, `>`, and
  unicode (verified: `a&b<c` → `a&b%3Cc`; `sillón-café` → `sill%C3%B3n-caf%C3%A9`) but leaves
  a literal `&` intact. Next.js's `MetadataRoute.Sitemap` serializer XML-escapes `<loc>`
  content, so this is defended one layer up, and slugs are DB-kebab-case in practice (no `&`).
  Defensive-only; no action strictly required. Edge case 4 is otherwise satisfied.

### m-2: Product JSON-LD & OG images assume absolute URLs with no guard
- **File**: `src/lib/seo/json-ld.ts:86`, `producto/[slug]/page.tsx:96,136`
- **Detail**: `buildProductLd`/`buildOpenGraph` pass `primaryImage.url` straight through. OG
  images get resolved against `metadataBase` by Next if relative, but **JSON-LD does not** — a
  relative image URL would emit an invalid schema.org `image`. All image URLs are absolute
  today (picsum in seed; Supabase `publicUrl` in prod), so correct now. Consider normalizing to
  absolute in `buildProductLd` to make the invariant explicit rather than latent.

### m-3: PDP OpenGraph `type: "article"` for a product page
- **File**: `src/app/[locale]/producto/[slug]/page.tsx:94`
- **Detail**: A PDP uses OG `type: "article"`. The richer value for a product is `product`, but
  Next's typed `openGraph` union favors `website`/`article` and `article` is defensible/valid.
  Cosmetic; no functional impact.

### m-4: `metadata.test.ts` mocks `getPathname`, under-verifying the store-wide hreflang scheme
- **File**: `src/lib/seo/metadata.test.ts:14-17`
- **Detail**: The test hard-codes the `as-needed` prefix rule in a mock rather than exercising
  the real next-intl `getPathname`. The mock matches `routing` today, but a future routing
  change (e.g. `localePrefix: "always"`) would silently pass this test while shipping a wrong
  store-wide hreflang scheme. Dev correctly notes it is verified end-to-end by the build+curl
  gate, but the unit test gives false confidence. Consider a guard test on `routing.localePrefix`.

---

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| A1 | build green | PASS | `tsc --noEmit` exit 0; eslint clean; dev-verified `next build` exit 0. |
| A2 | taxonomy 500 fixed (force-dynamic ×3) | PASS | `export const dynamic = "force-dynamic"` on all 3: `categorias/[slug]:43`, `marcas/[slug]:39`, `estilos/[slug]:38`. Suspense/skeleton/EmptyState/grid untouched. Request-time 200 verified end-to-end (orchestrator + dev). |
| A3 | charCount renders formatted N/M | PASS | `contacto/page.tsx:72` `charCount: t.raw("charCount")`. Renders `0/2000` (config `CONTACT_MESSAGE_MAX`; AC's 1200 was an estimate — intent met). |
| A4 | no sibling raw-key leaks | PASS | PDP `qa.form.counter` (producto:266), recentlyViewed/stock templates, empresas `form.charCount` all use `t.raw`. No bare `t()` on an ICU template introduced. |
| A5 | e2e prod server + 4 flags | PASS | `playwright.config.ts:29` → `npm run e2e:server` (`NEXT_QA_DIST_DIR=.next-e2e next build && next start`, package.json:14); all 4 flags (config:41-44); isolated dist dir. |
| A6 | real 404 status | PASS | `e2e/not-found.spec.ts:73-87` `request.get(..., {maxRedirects:0})` asserts `status()===404` for bogus route AND missing taxonomy slug. |
| A7 | reset+seed path | PASS | `package.json:17` `db:reset:seed` chains reset && seed; existing scripts preserved; checklist §3. |
| A8 | hosted-apply path | PASS | `deploy-readiness-checklist.md` §2: link → `db push` 0001..0014 → seed + post-migrate anon-denial RLS assertion. |
| A9 | sitemap both locales + hreflang | PASS (M-2) | Both locales × products/brands/categories(flattened)/styles/static-pages + home/`/sillas`/`/empresas`/`/contacto`, absolute `<loc>` + per-URL `alternates.languages`. Faceted excluded. **Defect: `/contacto` duplicated (M-2).** |
| A10 | robots.txt | PASS (M-1) | Allows `/`, disallows `/admin` `/api/` `/checkout` `/carrito` + faceted `/sillas?`/`/en/sillas?`, absolute `Sitemap:`. **Defect: `/en/checkout` `/en/carrito` not disallowed (M-1).** |
| A11 | canonical + hreflang store-wide | PASS | `buildAlternates` single-sources canonical + es-MX/en/x-default; applied home:55, PDP:89, empresas:66, contacto:48, `[pageSlug]`:59, taxonomy ×3, `/sillas` (sillas:86 adds `languages`, PRESERVES faceted-noindex + page-N canonical sillas:77-91). x-default → es-MX (metadata.ts:55). |
| A12 | JSON-LD Product/Org/WebSite/Breadcrumb | PASS | PDP `[Product, BreadcrumbList]` (producto:142); home `[Organization, WebSite]` (page:123); taxonomy ×3 BreadcrumbList. Price = cents/100 2dp (`centsToMajorString`, unit-tested 129900→"1299.00" — no x100 error), MXN, availability from stockState, offer omitted when price<1 cent (edge 7). |
| A13 | no secret in bundle | PASS | Site URL from `NEXT_PUBLIC_SITE_URL`/`_ORIGIN` only; no server secret in client; `static-pages.ts` is `import "server-only"`; secret-exposure tests green (2025/2025). |
| A14 | build determinism / safe degrade | PASS | `sitemap.ts` `safeRead`→`[]` per source (no throw); `getSiteUrl` never throws (unit-tested); `listPublishedStaticPageSlugs`→`[]`; checklist §5 documents `NEXT_PUBLIC_SITE_URL` requirement. |

**Group A: 14/14 PASS** — A9 and A10 carry MAJOR crawl-hygiene defects (M-2, M-1); functional behavior is correct.

---

## Edge Case Verification

| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Taxonomy `?page=99` → 200 clamped | HANDLED | force-dynamic legalizes deep `await searchParams`; query layer clamps (pre-existing). |
| 2 | Taxonomy zero active products | HANDLED | `<EmptyState>` branch untouched; sitemap includes the taxonomy URL safely. |
| 3 | DB unreachable at build | MOSTLY HANDLED | `safeRead`→`[]` in sitemap; routes are force-dynamic/dynamic so render on request. NOTE: taxonomy `generateStaticParams` (categorias:54/marcas:42/estilos:41) are NOT try/catch-wrapped — a build-time DB outage could still surface there. Low risk + checklist recommends build-time DB reachability; acceptable per AC-A14's "OR the checklist mandates". |
| 4 | Slug with URL-unsafe chars | MOSTLY HANDLED | `new URL()` encodes spaces/unicode/`<`/`>`; literal `&` left raw (m-1) but Next serializer XML-escapes `<loc>`. |
| 5 | Locale-prefixed vs default URLs | HANDLED | `getPathname` with `as-needed`: es-MX unprefixed, en `/en`; x-default → es-MX (metadata.ts:55, sitemap.ts:66). |
| 6 | Faceted `/sillas?marca=` excluded | HANDLED | Sitemap enumerates only clean hrefs; faceted view `noindex,follow` (sillas:91); robots disallows `/sillas?`/`/en/sillas?`. |
| 7 | Product null/zero price / OOS in JSON-LD | HANDLED | `buildProductLd` omits `offers` when `priceCents<1` (json-ld.ts:90); `out`→OutOfStock. Unit-tested. |
| 8 | Cookie banner reduced-motion / no-JS | N/A | Group B; cookieless analytics ⇒ banner not shipped. |

---

## Craft / Conventions
- Strict TS; no `any`, no `!` in the diff; `JsonLdObject` typed recursively.
- Small single-purpose functions; largest new file json-ld.ts:161 (well under caps).
- Named constants for currency, availability enum, price threshold, locale tags — no magic values.
- Error handling never silenced: every catch logs with context and degrades (sitemap, static-pages, home/empresas).
- Tests meaningful: escape test asserts the security property (`not.toContain("<")`); `centsToMajorString` covers the x100 boundary; `buildProductLd` covers offer omission.
- DRY: canonical/hreflang single-sourced (metadata.ts); breadcrumb JSON-LD reuses the visible `Crumb[]` array.
- No animation code changed → `review-animations` STANDARDS not applicable.

---

## Quality Score: 8.5/10
Blocker fixes are correct and the security-critical serialization is genuinely safe (probed,
not assumed). Loses points for two real crawl-hygiene defects (M-1 English disallow gap, M-2
sitemap duplicate) and the mocked-`getPathname` test that under-verifies the hreflang scheme.

## Recommendation: APPROVE-WITH-FIXES
Ship after Stage 6 fixes M-1 (add `/en/checkout`, `/en/carrito` to robots disallow) and M-2
(de-dupe `/contacto` in the sitemap). Minors m-1..m-4 are optional hardening. No CRITICAL
issues; nothing blocks the pipeline from proceeding to Fix.
