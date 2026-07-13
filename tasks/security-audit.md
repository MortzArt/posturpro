# Security Audit: T5 — Search, Filters & Sorting

Stage 9 (ultrasecurity). FULL-depth audit of the store's first anon-executable SQL
function (`search_products` RPC) and its large user-controlled input surface
(search/filter/sort/price query params). Every input treated as hostile; every claim
in the prior Review (Stage 5) and QA (Stage 7) reports independently re-verified against
the live local Supabase and the running prod server — trust nothing.

## Summary
- Files audited: 20 T5-touched files (RPC migration, query/param libs, facets, page, 8
  client components, config, database types) + full-codebase secret/env sweep
- Vulnerabilities found: 0 Critical, 0 High, 0 Medium (2 informational/low notes)
- Vulnerabilities fixed: 0 (none required)
- Secrets found: **0** (SHIP-eligible)
- npm audit: 2 moderate (pre-existing, build-tool-only, transitive — not T5, report-only)

## Verdict: **SECURE-WITH-NOTES**

The T5 security posture is excellent and requires no code changes. The RPC is
SECURITY INVOKER, fully parameterized, and grant-disciplined; the param-parse lib is
defensively bounded; there is zero XSS surface (no `dangerouslySetInnerHTML`, all echoes
React-escaped); no secret or `cost_price_cents` reaches the client. The two notes are a
pre-existing transitive npm advisory and a low-severity worst-case DB timing observation,
both non-blocking.

---

## Live Verification Performed (attacker mindset)

All probes run against local Supabase (`supabase_db_posturpro` / PostgREST `:54321`) as
the **`anon`** role, and against the agent prod server on `:3000`. No destructive
mutations; no test artifacts left behind.

### 1. The RPC — `supabase/migrations/0007_search.sql` (highest scrutiny) — PASS

- **SECURITY INVOKER confirmed live**: `pg_proc.prosecdef = f` (invoker, not definer),
  `provolatile = s` (stable), `proconfig = {search_path=public}` (search_path pinned —
  hardening beyond what INVOKER strictly needs). So the function runs with the caller's
  rights; anon's RLS/grants fully apply.
- **Grant discipline verified live** (actual `pg_proc.proacl`, not migration text):
  `{postgres=X/postgres, anon=X/postgres, authenticated=X/postgres}` — **PUBLIC was
  revoked**; only the two storefront roles hold EXECUTE. Matches the `products_public`
  discipline from 0005.
- **Anon isolation proven** (SQL `SET ROLE anon` AND real HTTP/PostgREST as anon): the
  RPC returns rows, while `SELECT ... FROM products` (base table) raises `42501 permission
  denied for table products`. The RPC reads only `products_public` (which omits
  `cost_price_cents`) + `product_variants` + `product_categories`. `cost_price_cents` is
  unreachable by construction (view omits it AND base table ungranted — belt & suspenders).
- **RETURNS shape has no cost column**: the 14 returned columns are card fields +
  `effective_stock` + `distinct_color_count` + `total_count`. Confirmed over HTTP as anon —
  the JSON row contains no cost/margin field.
- **Injection surface — NONE**: the function body is a single static SQL statement; every
  filter is a bind parameter (`p_query`, `p_*_ids`, `p_colors`, `p_materials`, `p_price_*`,
  `p_sort`, `p_limit`, `p_offset`). Zero `format()`, zero `EXECUTE`, zero string
  concatenation of user input into SQL. `p_sort` is consumed only via `CASE WHEN p_sort =
  'literal'` comparisons (not injected into ORDER BY), so an unknown/hostile sort value
  simply falls through to the deterministic `name, id` tiebreak — harmless. Live probe:
  `search_products(p_query := ''';DROP TABLE products;--')` returns 0 rows, no error,
  tables intact.
- **Server-side length/known-set binding**: the 80-char `q` cap and unknown-facet dropping
  are enforced app-side (`search-params.ts` — see §2), NOT in the RPC. This is the correct
  layering: the RPC is injection-proof regardless of input length, and the app bounds the
  DB work. The RPC itself accepts any-length text safely (parameterized); the app is the
  DoS bound. Verified the RPC clamps `LIMIT`/`OFFSET` via `greatest(_, 0)` so a negative
  limit/offset cannot error or over-read.
- **DoS worst-case timings (as anon, local seed = 30 products)**:
  | Probe | Result | Time |
  |-------|--------|------|
  | single-char `q='a'` (broad wildcard) | 12 rows | 29 ms |
  | huge offset `2e9` | 0 rows (no 416) | 499 ms |
  | extreme price bounds (int32 min/max) | 12 rows | 10 ms |
  | pathological wildcard `q` (`%_` ×40) | 12 rows | 4 ms |
  | 50,000-element color array | 0 rows | 57 ms |
  | 20,000 × 80-char material array | 0 rows | **1,450 ms** |
  | injection `';DROP TABLE...` | 0 rows | 7 ms |

  The one elevated timing (1.45 s) is a synthetic 20k-element material array — the material
  facet does `EXISTS (SELECT 1 FROM unnest(p_materials) ... LIKE ...)`, so a huge array
  multiplies substring work per product. **This is not reachable in production**: the app's
  `keepKnown(materials)` drops every value not in the catalog's real material set before the
  RPC is called, so the array is bounded by facet cardinality (single digits at seed scale).
  Documented as Low note SEC-L-1 for catalog-growth follow-up.

### 2. Query-param surface — `search-params.ts` / `search.ts` — PASS

- **Hostile inputs (edge 3)**: `firstValue`/`multiValues` handle array-form params,
  duplicate keys (de-dup via `Set`), and repeated params (first value for scalars). `q` is
  trimmed and hard-sliced to `SEARCH_QUERY_MAX = 80` (a 100k-char `q` is truncated before it
  can reach the RPC or a cache key). Price bounds require `^\d+$`, reject negative/NaN, and
  reject values above `PRICE_BOUND_MAX_CENTS`. Unknown category/brand/style/color/material
  values are dropped via `keepKnown` against the live facet sets — a bad or attacker-minted
  id never reaches the RPC. Sort outside the closed `SORT_KEYS` set → `DEFAULT_SORT`.
  Prototype-pollution-shaped keys (`__proto__`, `constructor`) are inert: the parser reads
  only fixed `SEARCH_PARAM_KEYS` and returns a fresh object literal, never iterating attacker
  keys into an object.
- **Reflected XSS via echoed `q` — NONE (live-verified)**: the echoed query flows into the
  search input `value`, the active-filter chips, the no-results echo, and the persistent
  aria-live announcer — all as React text/attribute props, which auto-escape. Live probe:
  `/sillas?q="><script>alert(1)</script>` renders the payload HTML-entity-escaped everywhere
  it appears in the DOM (`value="&quot;&gt;&lt;script&gt;..."`, chip text
  `&lt;script&gt;alert(1)&lt;/script&gt;`). The 3 raw `<script>` occurrences in the response
  are inside `self.__next_f.push([...])` RSC flight-data JSON string literals (backslash-
  escaped, inert data that hydrates the already-escaped DOM) — standard Next.js RSC, not an
  executable sink. Document title/metadata uses only static translated strings, never the
  echoed `q` (verified `generateMetadata` — title is `t("metadata.catalogTitle")`).
- **Cache discipline re-verified (Constraint 3)**: `isCacheableFilters` returns
  `filters.query === null`, so any request with free text provably bypasses `unstable_cache`
  and calls the RPC directly (control flow read in `searchProducts` — the `!isCacheable`
  branch returns `readSearchPage` with no cache wrapper). The filter-only cache key
  (`filterCacheKey`) is provably bounded: known-id facets only (unknowns already dropped),
  closed sort set, price snapped to `PRICE_BUCKET_CENTS` buckets, page via `canonicalPageKey`
  (bounded to `[1, MAX_PAGE]`). No unbounded user value can mint a distinct cache entry — the
  T3 cache-key DoS is closed.
- **Open redirect / header injection — NONE**: form `action`s are built from the
  `CATALOG_PATH` constant via next-intl `getPathname({href, locale})` (locale from the route,
  not user input). Client `router.push` targets `${CATALOG_PATH}?${serializeFilters(...)}` —
  a relative path with a hardcoded base and `encodeURIComponent`ed params. No user-controlled
  absolute URL ever reaches navigation. Canonical `<link>` points at the constant
  `CATALOG_PATH` (or `?page=N` from a validated numeric).

### 3. Client surfaces — PASS

- **Hidden-input mirroring (C-1 fix) — no smuggling**: `searchPreservedParams` in `page.tsx`
  serializes from **parsed/validated** filters (`serializeFilters({...filters, query:null})`),
  not raw params. So the hidden inputs emitted into the search form carry only canonicalized,
  known-value data — a crafted `?marca=<script>` is dropped by `keepKnown` before it could
  become a hidden input. `FacetCheckboxGroup` mirrors only `selected` values (already
  `keepKnown`-filtered), Radix checkbox is `name`-less (no double-submit). SearchBox
  additionally filters `q`/`page` out of `preservedParams` (m-5).
- **noscript panel**: the `<noscript>` mobile fallback (`catalog-toolbar.tsx`) renders the
  same `FilterPanel` native form — same validated-value contract, no new surface.
- **Result-count announcer (UX addition)**: `result-announcer.tsx` pushes the resolved count
  text (a translated ICU-plural string with a numeric count) into a persistent aria-live
  node — no user free text, no injection.
- **FilterSheet**: Radix Dialog with `forceMount`; no user input rendered as HTML.

### 4. Regression invariants from T3/T4 — PASS

- `cost_price_cents` unreachable everywhere: 0 occurrences in the live RPC response (HTTP as
  anon), 0 in the rendered `/sillas` HTML (with and without filters), 0 in the built client
  static chunks. Source references to `cost_price` are all omission-comments or the base-table
  type in `database.types.ts` (a type, not a reachable query).
- Q&A surfaces untouched by T5 (no changes to `product-qa.tsx` logic).
- No secrets in client bundles: `.next-t5-ux/static` grep = 0 for `service_role`,
  `cost_price`, `sb_secret`, `SUPABASE_SECRET`, `SERVICE_ROLE_KEY`.
- No `NEXT_PUBLIC_` secret: the only `NEXT_PUBLIC_*` vars are the Supabase URL and the
  RLS-enforced publishable/anon key — client-safe by design (`env.ts`).

### 5. Dependency & migration hygiene

- **npm audit**: 2 moderate, 0 high, 0 critical. Both are the same transitive advisory —
  `postcss < 8.5.10` (GHSA-qx2v-qp2m-jg93, XSS via unescaped `</style>` in CSS stringify
  output) pulled in by Next.js's build tooling. This is a **build-time** CSS-processing issue,
  not a runtime request-path vector in this app, and the suggested `audit fix --force`
  downgrades Next.js to 9.3.3 (a broken/false remediation). Pre-existing; not introduced by
  T5; no new dependencies were added by T5 (shadcn components vendor already-installed
  radix-ui). Report-only.
- **6 shadcn-vendored components** (`input, checkbox, select, slider, badge, label`): reviewed
  — thin wrappers over installed radix-ui primitives; no `dangerouslySetInnerHTML`, no eval,
  no network calls, no known-vulnerable patterns. Badge's `transition-all` was already fixed
  (M-2, motion not security).
- **Migration applied state matches file (live schema diff)**: all 7 T5 indexes present live
  (`products_name/description_trgm_idx`, `brands_name_trgm_idx`, `products_price_cents/
  created_at/sales_count_idx`, `product_variants_color_hex_idx`); RPC grants/security match
  the file. `.env*` is gitignored and no `.env` file is tracked in git.

### 6. OWASP Top 10 sweep over the new surface

| # | Category | Finding |
|---|----------|---------|
| A01 Broken Access Control | PASS — anon reads only anon-safe surfaces; base table + cost column denied (live-proven); RPC granted to anon/authenticated only, PUBLIC revoked. No IDOR (facet ids are catalog-public, no per-user data). |
| A02 Cryptographic Failures | N/A — no new secrets, tokens, or crypto in T5. |
| A03 Injection | PASS — RPC fully parameterized (live DROP-TABLE probe inert); facet reads use PostgREST builder (parameterized); no XSS sink (live payload echo escaped). |
| A04 Insecure Design | PASS — defense-in-depth: DB parameterization + app-side length cap + known-set dropping + bounded cache key. |
| A05 Security Misconfiguration | PASS — SECURITY INVOKER, search_path pinned, PUBLIC revoked; `.env` gitignored. |
| A06 Vulnerable Components | LOW — 2 moderate transitive (postcss, build-time only); no high/critical; zero new deps. |
| A07 Auth Failures | N/A — no auth surface added (public catalog read). |
| A08 Data Integrity Failures | PASS — no deserialization of untrusted data; RSC flight data is framework-managed. |
| A09 Logging/Monitoring Failures | PASS — `fail()` logs full detail server-side, throws redacted error (no stack/internal path to client). |
| A10 SSRF | N/A — no user-controlled URL reaches a server-side fetch; all reads go to the fixed Supabase client. |

---

## Findings

### CRITICAL — none
### HIGH — none
### MEDIUM — none

### LOW / INFORMATIONAL (document + recommend, no fix required)

#### SEC-L-1: Material-facet EXISTS/unnest is O(array × products) if an unbounded array ever reached the RPC
- **Type**: A04 Insecure Design (DoS, mitigated)
- **File**: `supabase/migrations/0007_search.sql:176-184`
- **Description**: The material facet does `EXISTS (SELECT 1 FROM unnest(p_materials) m(term) WHERE ... LIKE '%'||m.term||'%')`. A synthetic 20,000-element material array measured 1.45 s as anon.
- **Why not exploitable today**: the app drops every unknown material via `keepKnown` before
  the RPC call, so `p_materials` is bounded by the catalog's real distinct-material count
  (single digits). The measured slow case is unreachable through the app.
- **Impact**: none in current architecture; forward-looking as the catalog/material vocabulary
  grows or if any future caller passes the RPC an unfiltered array.
- **Recommendation**: (a) keep the app-side `keepKnown` bound as the primary defense; (b) when
  the catalog grows, add an explicit array-length guard in the RPC (e.g. cap `p_materials`
  cardinality) and revisit the trigram/functional-index strategy noted in the migration header.
- **Status**: OPEN (documented; no live risk).

#### SEC-L-2: Transitive `postcss < 8.5.10` build-tool advisory (GHSA-qx2v-qp2m-jg93)
- **Type**: A06 Vulnerable & Outdated Components
- **File**: `node_modules/next/node_modules/postcss` (transitive, not a direct dep)
- **Description**: `npm audit` reports 2 moderate for a postcss CSS-stringify XSS. It is a
  build-time code path bundled by Next.js, not a runtime request handler in this app.
- **Impact**: negligible in this app's runtime; the auto-fix would downgrade Next.js to 9.3.3
  (breaking, incorrect remediation).
- **Recommendation**: do not run `audit fix --force`; upgrade via a future Next.js minor when
  it ships the patched postcss. Track in the dependency backlog. Pre-existing, not T5.
- **Status**: OPEN (report-only; not introduced by T5).

---

## Checklist Results
| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 in code/tests/config/bundles; `.env*` gitignored, none tracked |
| Env var exposure | ✅ | Only client-safe `NEXT_PUBLIC_SUPABASE_URL`/publishable key; no server secret in client |
| Injection | ✅ | RPC fully parameterized (live DROP probe inert); no XSS sink (live echo escaped); PostgREST builders |
| Auth/AuthZ | ✅ | SECURITY INVOKER; PUBLIC revoked, anon/authenticated only; base table + cost denied live; no IDOR |
| Client/server boundary | ✅ | RPC returns only card columns; no cost/internal shape; `server-only` on read modules |
| Data Exposure | ✅ | `cost_price_cents` 0 occurrences (RPC/HTML/bundle); `fail()` redacts errors |
| CORS/CSRF | ✅ | GET-only reads (no state mutation); relative-path navigation; no wildcard-CORS-with-creds |
| Dependencies | ⚠️ | 2 moderate transitive (postcss, build-only); 0 high/critical; 0 new deps in T5 |

## Fixes Applied
None — no critical, high, or medium issues were found. The Stage 5/6 fixes (C-1, C-2,
M-1..M-7) were functional/UX, not security, and were independently re-verified not to have
introduced any injection or smuggling surface (hidden inputs carry only validated values).

## Residual Risk: LOW
- SEC-L-1: material-array DoS is unreachable via the app (bounded by `keepKnown`); revisit at
  catalog scale.
- SEC-L-2: transitive build-tool postcss advisory; not runtime-exploitable here; upgrade with a
  future Next.js.
- Neither blocks ship. The T5 attack surface (first anon-executable SQL + large query-param
  input) is well-defended in depth: injection-proof at the DB, bounded at the app, escaped at
  the render layer, and grant-isolated from cost data.
