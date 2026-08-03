# Hacker Report: T14 — SEO, Analytics & Launch Hardening

Stage 11 (Chaos Gremlin) — the LAST bug hunt before the Vercel + hosted-Supabase
client-QA deploy. Run against a **prod build** (`NEXT_PUBLIC_SITE_URL=https://posturpro.mx`,
`NEXT_QA_DIST_DIR=.next-hacker`) + `next start` on the seeded local DB. Focus: the
T14-touched surfaces (taxonomy `[slug]` `force-dynamic`, sitemap, robots, JSON-LD,
canonical/hreflang, contact counter) under hostile/weird input.

## Summary
- Dead UI found: **0**
- Visual bugs: **0** (SEO surfaces render no visible UI; contact counter renders `0/2000`)
- Logic bugs (T14-introduced): **0**
- Race conditions: **0** (21 parallel hits → all 200, zero server-log errors)
- Missing states: **0**
- Items fixed: **0** (nothing T14-introduced was broken; see firewall note)
- Pre-existing edges documented (NOT fixed, firewall): **1** (>8 KB URL-path 500)
- Product improvements suggested: **10**

## Chaos Matrix Results

### 1. URL garbage on T14 routes — all controlled 200/404, zero uncontrolled 500s

| Probe | Result | Verdict |
|-------|--------|---------|
| `/categorias/oficina`, `/marcas/ergovita`, `/estilos/ejecutiva` (es-MX + en) | 200 | PASS — AC-A2 fix holds; route table shows all 3 as `ƒ Dynamic` |
| `?page=-1`, `?page=0`, `?page=abc`, `?page=999999999999`, `?page=9e9`, `?page=%20` | 200 | PASS — pagination clamps deterministically to `[1,lastPage]` |
| `?page=1&page=2` (duplicated), `?page[]=2` (array param) | 200 | PASS — `canonicalPageKey` takes `raw[0]`, clamps |
| `?page=2` | 200 | PASS — real page-2 grid served |
| unknown category/brand/style slug | 404 | PASS — real `notFound()` status |
| emoji slug `/categorias/🪑`, unicode `/categorias/café` | 404 | PASS |
| `%00` (null byte), `%2e%2e` (`..`) | 200 | PASS — middleware collapses empty segment to `/categorias` **index** (real page, h1 "Categorías"); NOT a category-detail 500, NOT path traversal |
| encoded traversal `/categorias/%2e%2e/%2e%2e/admin` | 307 | PASS — no admin leak |
| 100–8000-char slug | 404 | PASS |
| **>8100-char slug** | **500** | pre-existing edge — see Finding 1 |

### 2. sitemap.xml / robots.txt

| Probe | Result | Verdict |
|-------|--------|---------|
| `GET /sitemap.xml` | 200 `application/xml`, **XML well-formed** (`xmllint` clean), **118 `<loc>` = 118 unique**, zero `undefined`/`null`/`NaN`/`localhost` leaks | PASS |
| `GET /robots.txt` | 200 `text/plain`, all disallows present (`/admin`, `/api/`, cart/checkout ×2 locales, faceted `/sillas?` ×2), absolute `Sitemap:` pointer | PASS |
| `?query` string on both | 200 | PASS |
| `POST/PUT/DELETE/PATCH/OPTIONS /sitemap.xml` | **405** | PASS — non-idempotent methods rejected |
| `HEAD /sitemap.xml`, `HEAD /robots.txt` | 200 | PASS |
| `Range: bytes=0-10` on sitemap | 200 (full body) | PASS — no crash |
| Googlebot UA / empty UA / `Accept: image/png` / `Accept-Language: zz-ZZ` | 200 | PASS |

### 3. Locale garbage

| Probe | Result | Verdict |
|-------|--------|---------|
| `/zz/...`, `/en-GB/...`, `/xx` | 404 | PASS — in-shell 404, not 500 |
| `/EN/...` (uppercase), `/es-mx/...` (lowercase) | 307 → `/en/...` / clean | PASS — safe canonical redirect, no loop |

### 4. JSON-LD correctness under adversarial data (all 30 seeded products scanned)

| Check | Result |
|-------|--------|
| Valid `Product` LD (name, url, image, brand, offers) per product | **30/30 valid** (JSON.parse clean) |
| Literal `undefined` / `":null"` / `NaN` leaking into output | **0** |
| `offers` price is major-unit decimal (`"10499.00"`), currency MXN, availability from stockState | correct |
| Missing-optional handling (null image/brand/description, zero price, out-of-stock) | conditionally spread — field omitted, never emitted as string |
| `BreadcrumbList` LD (positions 1-based, last crumb omits `item`) | correct on PDP + all 3 taxonomy pages |
| Home `Organization` + `WebSite` LD | valid |
| `<script>` escaping (`escapeForScriptSafe` → `<`, U+2028/9) | applied; no `</script>` breakout path found |

### 5. Race / timing (force-dynamic = every nav hits the server)

| Probe | Result |
|-------|--------|
| 20 parallel `?page=N` taxonomy hits + 1 sitemap | **21/21 → 200**, zero 500s, no pool-exhaustion |
| Rapid nav: 5 categories × 3 pages sequential | **15/15 → 200** |
| Server-log scan after full chaos burst | **0 error / unhandled-rejection / `DYNAMIC_SERVER_USAGE` lines** |

### 6. Contact / empresas counter under weird input

| Check | Result |
|-------|--------|
| SSR counter renders `0/2000` (es-MX + en), NOT the raw `charCount` key or `{count}/{max}` | PASS (AC-A3) |
| `charCount` / `{count}/{max}` appears ONLY in serialized RSC props (the template), never a visible span | PASS (AC-A4) |
| empresas twin (`quote-counter`) | renders `0/2000` |
| Counter math vs. multi-byte emoji / RTL | sound — `value.length` (UTF-16 units) is consistent with the `maxLength` cap the browser enforces on the same field; no overflow, no layout break |

## Findings

### Finding 1 (PRE-EXISTING — documented, NOT fixed per firewall)
**>8100-character URL path on a taxonomy `[slug]` route returns HTTP 500.**

- **Repro:** `GET /categorias/<8200×'a'>` → 500 (also `/marcas/...`, `/estilos/...`).
  Threshold ≈ 8100 chars (8 KB). ≤8000 chars → clean 404.
- **Root cause:** the ~8 KB slug makes the PostgREST query URI (`?slug=eq.<8KB>`)
  exceed PostgREST's URI limit → `error` returned → `fail()` in
  `src/lib/catalog/read-primitives.ts:36` throws the **redacted** `Catalog read
  failed: category:<slug>`, which the route's `error.tsx` boundary renders as a
  localized panel (HTTP 500). The `unstable_cache` tag-length warning also fires.
- **Why this is NOT a T14 bug (firewall):** `getCategory` / `fail()` / the
  `unstable_cache` tagging are pre-existing T3/T5 catalog code with a deliberate,
  tested error contract (a hard DB read failure → `error.tsx` panel, edge case 9).
  T14's `force-dynamic` merely makes this reachable at request time — and it is a
  strict IMPROVEMENT: **before** the T14 fix, ALL taxonomy requests (valid or not)
  returned 500 (`DYNAMIC_SERVER_USAGE`).
- **Why it is not a deploy risk:** an >8 KB URL path is beyond standard proxy
  header limits — Vercel's edge (and nginx `large_client_header_buffers`, default
  8 KB) rejects such a request with **414** before the function ever runs. The bare
  local `next start` has no such guard, so the request reaches the function and
  produces a controlled, **redacted** error-boundary render (verified: **zero**
  internal detail — no `Catalog read failed`, no DB host/port, no stack, no
  secrets — leaks to the DOM; body is Next's production error page).
- **Why NOT fixed:** turning the `fail()` throw into a `notFound()` would mask
  GENUINE DB errors (RLS/network) as 404s and regress the tested T3 error-state
  design. The correct owner is a future ticket if desired: add a length guard
  (e.g. treat `slug.length > MAX_SLUG_LEN` as `notFound()`) in the taxonomy pages
  BEFORE the cached read — a page-level guard, not a change to the catalog contract.
  Recommended as Phase-2 improvement #10 below.

### Everything else: clean
- Subagent read-audit of all 8 T14 pages + breadcrumbs found **no dead UI, no
  logic bug, no notFound/metadata gap**. Every breadcrumb / 404-CTA / footer link
  resolves in BOTH locales (es-MX unprefixed, en `/en/...`) — spot-verified live
  (`/categorias`↔`/en/categorias`, taxonomy index routes, `not-found-home` CTA,
  empresas hash-anchor CTAs `#cotizacion`/`#como-funciona` hit real section ids).
- One low-severity symmetry note (NOT a bug, no live defect): PDP `generateMetadata`
  passes `primaryImage.url` to OG `images` without an `absoluteUrl()` wrap, whereas
  the home page wraps `absoluteUrl(HERO_IMAGE)`. Safe today (every image URL in the
  DB is absolute by construction — seed `picsum.photos/...`, admin uploads persist
  Supabase `getPublicUrl().publicUrl`). Flagged for defense-in-depth only; left
  unchanged (no defect to fix, reported for the owner rather than silently patched
  at the deploy gate).

## Dead UI
| # | Element | File:Line | Issue | Fixed? |
|---|---------|-----------|-------|--------|
| — | (none found) | — | Every link/button/CTA on T14-touched pages resolves in both locales | n/a |

## Visual Bugs
| # | Issue | File:Line | Viewport | Fixed? |
|---|-------|-----------|----------|--------|
| — | (none) | — | — | n/a — SEO surfaces render no visible UI; counter legible at `0/2000` |

## Logic Bugs
| # | Bug | File:Line | Steps to Reproduce | Fixed? |
|---|-----|-----------|---------------------|--------|
| 1 | >8 KB URL path → 500 (not 404) | `src/lib/catalog/read-primitives.ts:36` (pre-existing T3/T5) | `curl /categorias/<8200 chars>` | ❌ pre-existing, firewalled (see Finding 1); edge-rejected 414 in prod |

## Missing States
| # | Component | Missing State | File:Line | Added? |
|---|-----------|---------------|-----------|--------|
| — | (none) | Loading (skeleton), empty (`EmptyState`), error (`error.tsx`), 404 (`notFound`) all present and verified | — | n/a |

## Product Improvements (Phase 2 — do NOT implement now)
| # | Improvement | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | **`noindex` + canonical on taxonomy INDEX pages** — so garbage URLs (`%00`, `%2e%2e`) that collapse to the index don't get indexed as duplicate content of the real detail listing | Med (SEO) | S | P2 |
| 2 | **`sitemap` `lastModified` + `changeFrequency`/`priority`** — entries carry only `<loc>`+hreflang today; adding `lastmod` from product `updated_at` helps crawlers prioritize fresh products | Med (SEO) | M | P2 |
| 3 | **Product `AggregateRating` / `review` JSON-LD** once reviews exist — unlocks star rich-results, a major B2C CTR lift | High (SEO/CTR) | M | P2 |
| 4 | **Vercel Analytics (cookieless)** — wire `@vercel/analytics` behind the env flag already recommended in the deploy checklist; zero-cookie so no consent banner needed | High | S | P1 |
| 5 | **Security headers / CSP layer (AC-B6)** — the one gap the security inventory flagged; a CSP is also the prerequisite for any 3rd-party analytics/monitoring script | High (security) | M | P1 |
| 6 | **`@sentry/nextjs` error monitoring** — so a request-time 500 like Finding 1 is caught in prod telemetry instead of only local logs | High | S | P1 |
| 7 | **OG image per PDP via `opengraph-image.tsx`** — a branded social card (product photo + name + price) instead of the default site OG; big share-CTR win | Med | M | P3 |
| 8 | **Visible breadcrumb UI on PDP** — the `BreadcrumbList` JSON-LD exists but the PDP renders no VISIBLE breadcrumb; adding it improves navigation + matches the taxonomy pages | Med (UX) | S | P2 |
| 9 | **`Product.sku` / `gtin` / `mpn` in JSON-LD** — required for Google Merchant / Shopping eligibility; add once SKUs are modeled | Med | M | P3 |
| 10 | **Slug-length guard on taxonomy pages** — `if (slug.length > MAX_SLUG_LEN) notFound()` BEFORE the cached read, so a pathological URL returns a clean 404 even without an edge proxy (defense-in-depth for Finding 1; keeps the T3 `fail()` contract intact for genuine DB errors) | Low | S | P3 |

## Fixes Applied
- **None.** No T14-introduced defect was found. The single 500 (Finding 1) is
  pre-existing catalog behavior, edge-rejected as 414 in production, and firewalled
  per the stage rules. No working-tree changes were made.

## Cleanup
- Prod server (port 3111) killed.
- Throwaway `.next-hacker` dist dir removed; `tsconfig.json` auto-injected
  `.next-hacker/types` paths reverted (`git checkout`).
- **Working tree clean** (`git status` empty). No test DB rows inserted (all
  probing was read-only; products are RLS-denied to anon anyway).

## Chaos Score: 1/10
(Target ≤ 3. The T14 SEO surfaces are exceptionally robust — every garbage/hostile
input produced a controlled 200/404/405/307, zero uncontrolled 500s within
real-world URL limits, zero server-log errors under concurrency, zero JSON-LD/sitemap
data leaks. The lone 500 requires an >8 KB URL path that no real client or edge proxy
would forward, and it degrades to a redacted error-boundary panel with no data leak.)

## Tests After Fixes (no fixes needed — gate re-run to confirm tree health)
- Type check: `npx tsc --noEmit` → **exit 0** (whole project)
- Unit suite: `npx vitest run` → **2041 passed / 2041** (127 files)
- Sitemap/robots degrade + regression tests: **7/7 passing**
- Prod build: `next build` → **exit 0**; route table: all 3 taxonomy `[slug]` = `ƒ Dynamic`, `sitemap.xml`/`robots.txt` present

Status: **success**
