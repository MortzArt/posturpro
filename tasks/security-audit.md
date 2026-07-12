# Security Audit: T3 — Catalog browsing

Stage 9 (Security) of the full-cycle pipeline. Ran in parallel with Stage 10
(Arch). Scope: the NEW T3 catalog read layer (`src/lib/catalog/*`,
`src/lib/supabase/public.ts`, catalog routes, metadata). Verified live against
the running seeded local Supabase (127.0.0.1:54321) with the anon publishable
key. DB was NOT reset/stopped; the user's dev server on :3206 was untouched.

## Summary
- Files audited: 43 changed (T3 diff `7c85b83..HEAD`) + full-codebase secret/env/RLS scan
- Vulnerabilities found: 1 (Critical: 0, High: 1, Medium: 0, Low: 2)
- Vulnerabilities fixed: 1 (the High)
- Secrets found: 0 (SHIP-eligible)

## Vulnerability Findings

### HIGH

#### SEC-H-1: Unbounded `unstable_cache` key cardinality from attacker-controlled `?page` (DoS)
- **Type**: OWASP A05 Security Misconfiguration / Uncontrolled Resource Consumption (CWE-770)
- **File**: `src/lib/catalog/queries.ts:132-135` (old `cacheKeyForPage`); consumed at `:332, :357, :384, :408`
- **Description**: Every product-listing read wrapped its `unstable_cache` key with `cacheKeyForPage(rawPage)`, which used the **raw, unclamped, un-normalized** `?page` string as a key segment (`p:${value ?? ""}`). The `?page` query param is fully attacker-controlled and reaches the cache key before any validation. The actual page is clamped to `[1, lastPage]` for the DB read, but the *cache key* was not — so `?page=1`, `?page=00001`, `?page=abc`, `?page=1e9`, `?page=-5`, and unbounded random strings each mint a **distinct** cache entry that all resolve to the same underlying page.
- **Exploit**: `for i in $(seq 1 1000000); do curl "https://site/sillas?page=$RANDOM$i"; done` (and the same against every `/marcas/<slug>`, `/estilos/<slug>`, `/categorias/<slug>`). Each distinct `?page` value: (1) creates a new entry in the Next data cache → unbounded memory/disk growth; (2) on the cache miss, fires a `count:"exact"` head query **plus** a `.range()` data read **plus** the batched image/variant reads against Postgres. The clamp guarantees correctness but does nothing to stop the amplification — one cheap HTTP request → multiple DB round-trips + a permanent new cache entry.
- **Impact**: Data-cache exhaustion (memory/disk) and amplified DB load from a single unauthenticated actor — a cache-cardinality DoS. Bounded only by how many distinct strings the attacker sends (effectively unbounded).
- **Fix (FIXED)**: Added `canonicalPageKey(raw)` in `src/lib/catalog/pagination.ts` and a `MAX_PAGE = 100_000` ceiling in `src/lib/config.ts`. `canonicalPageKey` collapses every malformed / float / scientific / negative / zero / leading-zero / beyond-safe-integer / huge value into a bounded integer in `[1, MAX_PAGE]` **without needing `lastPage`**:
  - non-digit / empty / negative / zero / `1.5` / `1e9` → `1`
  - `00001` → `1`, `007` → `7` (leading zeros normalized so they share a key)
  - any digit run above `MAX_PAGE` (incl. values past `Number.MAX_SAFE_INTEGER`) → `MAX_PAGE`
  `cacheKeyForPage` now delegates to it (`p:${canonicalPageKey(rawPage)}`), so **at most `MAX_PAGE + 1` distinct cache keys can ever exist per listing**, regardless of junk volume. `parsePageParam` was refactored to reuse the same canonical form and also caps its ceiling at `MAX_PAGE` (defends against `parseInt` overflow on a huge digit string). The real page shown is still clamped to the true `[1, lastPage]`, so behavior for a valid request is unchanged.
- **Verification**: 9 new unit tests in `pagination.test.ts` (`canonicalPageKey` block) assert the collapse of junk, leading-zero normalization, the `MAX_PAGE` cap (incl. a 24-digit value), array handling, and a bounded-key-set invariant. 297/297 unit tests pass; tsc + lint clean; production build route table unchanged.
- **Status**: FIXED

### LOW

#### SEC-L-1: npm audit — 2 moderate `postcss` advisories via `next` (ACCEPTED baseline, no T3 delta)
- **Type**: OWASP A06 Vulnerable and Outdated Components
- **File**: `node_modules/next/node_modules/postcss` (transitive)
- **Description**: `npm audit` reports 2 moderate `postcss <8.5.10` advisories (GHSA-qx2v-qp2m-jg93, XSS via unescaped `</style>` in CSS stringify output), pulled in transitively by `next`. The only offered fix is `npm audit fix --force`, which downgrades to `next@9.3.3` — a massive breaking change.
- **Impact**: Build-time CSS stringify path only; not reachable by shopper-supplied input at runtime. T3 added **zero** new dependencies, so this is unchanged from the accepted baseline.
- **Fix**: None. Do NOT run `audit fix --force`. Remains accepted; revisit when Next ships a patched postcss transitively.
- **Status**: OPEN (documented, accepted)

#### SEC-L-2: `CATEGORY_MEMBER_ID_CAP` truncation is silent-correct but not observable in prod (informational)
- **Type**: Defense-in-depth / observability
- **File**: `src/lib/catalog/queries.ts:428, 467-472`
- **Description**: The category membership read is correctly bounded to `CATEGORY_MEMBER_ID_CAP = 1000` (fixed in Stage 6, M-3) to keep the PostgREST `IN (...)` list and URL length bounded — a good DoS guard. When the cap is hit it `console.warn`s, but there is no metric/alert, so a legitimately-large category silently paginates only its first 1000 members in production. This is the documented scale ceiling (backlogged), not a T3 defect. Noting it so it is not lost.
- **Fix**: None in T3. Migrate to a category-scoped view/RPC (server-side pagination) before a single category can legitimately exceed 1000 products (tracked in `tasks/clean-code-backlog.md`).
- **Status**: OPEN (documented, deferred by design)

## Anon Attack-Surface Notes (verified LIVE against seeded local DB)

The publishable (anon) key is the only credential shipped to any client-reachable
path. Every probe below was run with the anon key against 127.0.0.1:54321.

- **`cost_price_cents` unreachable through every select** — `products_public?select=id,cost_price_cents` → `42703 column ... does not exist` (view structurally omits it). Base `products?select=...` with the anon key → `42501 permission denied for table products` (never granted to anon). The card select (`PRODUCT_CARD_SELECT`) never names cost. `cost_price` does not appear in `.next/static` client bundle. **No cost leak by any path.**
- **Draft/archived leakage — PROVEN ABSENT at the DB layer.** Live test: flipped one seeded product to `status='draft'` via the secret key, then re-queried as anon: `products_public` row → `[]`; `product_images`/`product_variants`/`product_categories` for that id → `*/0` (empty); the product's category membership count dropped from 9→8 (the draft id is excluded). Reverted to `active` cleanly (children reappear). Child-table RLS gates on `is_active_product(product_id)` (SECURITY DEFINER helper, `0005:90-102`), so draft/archived children can never leak via the batched `.in(product_id, ids)` reads OR inflate a category `count:"exact"` (the count runs against `products_public`, which is active-only). All 30 seeded products are currently `active`, so there is no live-data exposure today; the RLS filtering was verified empirically, not assumed.
- **PostgREST filter-injection via slug — not exploitable.** Slugs reach queries only through parameterized PostgREST `.eq("slug", value)` / `.eq("id", value)` calls (never string-interpolated into a filter). Live probe `slug=eq.foo,bar)&is_active=eq.true` → `[]` (the comma/paren are treated as literal slug content, not filter operators). No slug is normalized-then-interpolated anywhere.
- **`?page` injection into `.range()`/`.eq()`** — `?page` never reaches PostgREST raw. It is parsed by `parsePageParam` (digit-only regex, clamped) into an integer before `rangeFor` computes a numeric `.range(from, to)`. Arrays (`?page[]=1`), floats, negatives, NaN, and huge values all clamp deterministically (unit-tested). After SEC-H-1's fix the cache-key form is also bounded.
- **No secret in client bundle** — `.next/static` contains no `sb_secret_`, no `SUPABASE_SECRET_KEY`/`supabaseSecretKey`, no `cost_price`. The secret key is reachable only via `getServerEnv()` → `src/lib/supabase/admin.ts` (guarded by `import "server-only"`); the cookie-free catalog client uses the publishable key only.
- **XSS** — no `dangerouslySetInnerHTML`, no `application/ld+json`, no `<script>` sinks anywhere in `src/`. DB strings (product/brand/category/style names + descriptions) render through React's default escaping (DOM) and Next's Metadata API (`title`/`description` meta tags — HTML-escaped by the framework). Structured data (BreadcrumbList) is only referenced as a *future* comment — not emitted in T3. No raw HTML sink.
- **SSRF / command / path injection** — none. No user-controlled URL reaches server-side `fetch`; no `child_process`/`eval`/`new Function`/`fs` in `src/`; `next/image` remote hosts stay allow-listed to the Supabase Storage host + `picsum.photos` (`next.config.ts` unchanged).
- **Client/server boundary** — catalog reads are `import "server-only"`; the cookie-free client (`public.ts`) is server-only and `persistSession:false`. No privileged code path in the client bundle.

## Checklist Results
| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 secrets in code/git/history. `.env*` gitignored (`.gitignore:37,46`); no `.env` tracked or ever committed. `.env.local` present on disk, untracked, keys only (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). |
| Env var exposure | ✅ | Only 2 `NEXT_PUBLIC_*` vars (URL + publishable/anon key), both client-safe. `SUPABASE_SECRET_KEY` reached only via `getServerEnv`→`server-only` admin module. No secret in `.next/static`. |
| Injection | ✅ | Parameterized PostgREST `.eq`/`.in`/`.range` only; slug/page never string-interpolated into filters; live filter-injection probe returned `[]`. No SQL/command/path/SSRF sinks. |
| Auth/AuthZ | ✅ | Guest-store trust model; RLS-enforced anon key; base `products`/orders/customers ungranted to anon (belt-and-suspenders REVOKE-then-GRANT baseline, `0005`). No T3 mutation surface. |
| Client/server boundary | ✅ | All catalog reads `server-only`; cookie-free public client server-side; no privileged path or secret in client bundle. |
| Data Exposure | ✅ | `cost_price_cents` unreachable by every path (verified live); draft/archived filtered at DB layer (verified live via draft-flip test); errors logged server-side, generic message to boundary (`fail()`); no over-fetch (card select trimmed in Stage 6 m-1). |
| CORS/CSRF | ✅ | No custom API routes / route handlers in T3 (server components read directly); no state-changing endpoints; nothing to misconfigure. |
| Dependencies | ✅ | 0 new deps. npm audit = accepted baseline (2 moderate postcss-via-next, `--force`-only fix = breaking); no delta. |

## Verdict: SECURE

The T3 catalog read layer is secure. The one High-severity finding (SEC-H-1,
unbounded cache-key cardinality DoS) is FIXED and unit-tested. Cost data,
draft/archived products, filter injection, XSS, and secret leakage were all
verified absent — several proven empirically against the live seeded DB (the
draft-flip test and the cost/injection probes), not merely by reading policy
text. Two Low items are documented and accepted (npm audit baseline; category
cap observability). Gates green: tsc clean, lint clean, 297/297 unit tests,
production build succeeds with the route table unchanged, no secret in the
client bundle.
