# Security Audit: T1 — Data Foundation (Supabase schema, RLS, clients, seed)

## Summary
- Files audited: 20 (src/lib config/env/money/supabase clients + database.types; migrations 0001–0005; config.toml; scripts/seed.ts + seed-data; tests/integration; next.config.ts; package.json/.npmrc; .gitignore)
- Vulnerabilities found: 6 (Critical: 0, High: 0, Medium: 2, Low: 4)
- Vulnerabilities fixed: 1 (the SECURITY-INVOKER trigger functions hardened; see SEC-L-1). Remaining 5 are documented residuals — all correctly scoped out of T1 or non-exploitable.
- Secrets found: **0** (SHIP-eligible on the secrets axis)
- Verification: independent adversarial RLS probes over PostgREST with the publishable (anon) key against a live local Supabase (Docker), plus the 49-test integration suite. All green after fixes.

This is a backend-only task audited at full depth. The Stage-5 review and Stage-7 QA already found and fixed the ship-blocking RLS/financial gaps (cost_price leak, missing grant baseline, immutability, financial CHECKs). This audit independently re-verified those live and found no new critical/high issues — the trust model holds up under direct attack.

---

## Vulnerability Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

#### SEC-M-1: Unauthenticated, unthrottled `product_questions` INSERT (spam / storage-exhaustion DoS)
- **Type**: OWASP A04:2021 Insecure Design / API4:2023 Unrestricted Resource Consumption
- **File**: `supabase/migrations/0005_rls_policies.sql:241-250` (anon INSERT policy); `supabase/migrations/0004_content_qa.sql:10-20`
- **Description**: The only public write surface. Anyone holding the publishable key (which ships to the browser by design) can INSERT rows into `product_questions`. Length is bounded (`author_name` 1–120, `question` 1–2000, forced `is_published=false`/`answer null`, and `is_active_product(product_id)` gate), but there is **no rate limit and no per-actor cap** — the database cannot enforce either.
- **Exploit**: Demonstrated live — a loop of 25 anonymous POSTs to `/rest/v1/product_questions` with the anon key returned 25× HTTP 201; row count grew unbounded. Scales to millions of junk rows / storage exhaustion / moderation-queue flooding.
- **Impact**: Availability/abuse only — **no data disclosure or integrity loss** (rows land unpublished and are invisible to other anon users; length bound caps single-row size). Not a confidentiality breach.
- **Fix**: Correctly deferred and NOT fixable in T1. The DB layer is already as tight as it can be (length CHECK + safe-initial-state WITH CHECK + active-product gate). Effective mitigation is app-layer (rate limiting / CAPTCHA / origin check) and belongs to the ticket that ships the question **form** — there is no public form or endpoint in T1. Tracked in `tasks/clean-code-backlog.md`.
- **Status**: DOCUMENTED (residual; out of T1 scope, correctly triaged by review M-6)

#### SEC-M-2: Project reference identifier disclosed in committed docs
- **Type**: OWASP A01/A05 (information disclosure — low value)
- **File**: `tasks/dev-done.md:48` (`supabase link --project-ref jyccfctyxstfevwowntn`)
- **Description**: The Supabase project ref is committed in dev-done.md. This is **not a credential** — it is already embedded in the public `NEXT_PUBLIC_SUPABASE_URL` hostname that ships to every browser, so it is not secret. It only names which project to attack; without a key, RLS still fully protects the data (verified below).
- **Exploit**: An attacker learns the project ref and can address its PostgREST endpoint — but they can do that from the client bundle anyway, and every privileged table is `permission denied` for anon.
- **Impact**: Negligible. Reconnaissance convenience only.
- **Fix**: No action required for T1. Optionally scrub from committed docs if the repo goes public.
- **Status**: DOCUMENTED (accepted; not a secret)

### LOW

#### SEC-L-1: `SECURITY INVOKER` trigger functions had a mutable `search_path` (defense-in-depth)
- **Type**: OWASP A05 Security Misconfiguration (hardening)
- **File**: `0001_extensions_and_enums.sql` (`set_updated_at`), `0002_catalog.sql` (`categories_check_no_cycle`), `0003_commerce.sql` (`orders_block_snapshot_update`, `order_items_block_update`)
- **Description**: Four trigger functions ran with the default (unpinned) `search_path`. All are `SECURITY INVOKER` (run as the caller), so this is **not** a privilege-escalation vector — an invoker function cannot gain rights — and none uses dynamic SQL. But an unpinned search_path is what Supabase's `function_search_path_mutable` linter flags, and pinning it removes any theoretical name-resolution ambiguity when a future `BYPASSRLS`/elevated role triggers them.
- **Fix**: **FIXED** — added `set search_path = ''` to all four; schema-qualified the one table reference (`public.categories`) in the cycle-check function. The only pre-existing `SECURITY DEFINER` function (`is_active_product`) was already correctly pinned to `search_path = public`.
- **Verification**: Re-ran the full 49-test live integration suite from a clean `db reset` + seed — all pass (updated_at bump, category-cycle rejection, and order/order_items immutability all still exercised and enforced). `pg_proc.proconfig` confirms all 5 functions now pin search_path.
- **Status**: FIXED

#### SEC-L-2: `store_settings.currency` and `customers`/`orders` email fields are free-text (no format validation)
- **Type**: OWASP A03 (input validation — low)
- **File**: `0003_commerce.sql:31,155` (`contact_email`, `store_settings.currency`)
- **Description**: `orders.currency` IS constrained (`check (currency = 'MXN')`), but `store_settings.currency` is free-text (single admin-written row — acceptable). Email columns have no format CHECK. No security impact in T1 (no anon write path reaches them; all writes are server/secret-key). Field validation belongs at the checkout form (T7).
- **Status**: DOCUMENTED (out of scope; backlogged)

#### SEC-L-3: `translations` is polymorphic with no FK on `entity_id` (orphan rows possible)
- **Type**: OWASP A08 (data integrity — low)
- **File**: `0004_content_qa.sql:45-55`
- **Description**: Inherent to the polymorphic design. The anon SELECT policy correctly scopes reads to visible parent entities (verified — no leakage of translations for draft/unpublished content). Orphan rows after a parent delete are a housekeeping concern, not a disclosure. Cleanup job backlogged.
- **Status**: DOCUMENTED (accepted)

#### SEC-L-4: Two moderate `npm audit` advisories (transitive `postcss` via Next.js)
- **Type**: OWASP A06 Vulnerable & Outdated Components
- **File**: `package.json` / lockfile (transitive)
- **Description**: `npm audit` reports 2 moderate issues, both a `postcss < 8.5.10` "XSS via unescaped `</style>` in CSS stringify output" pulled in transitively by `next`. Not reachable in this task: no untrusted input is fed to PostCSS's stringifier; PostCSS runs at build time on first-party CSS. `npm audit fix --force` would **downgrade Next to 9.3.3** (a false remediation — do not run it). No advisories against `@supabase/supabase-js` (^2.110.2) or `@supabase/ssr` (^0.12.0). No typosquatted/unmaintained packages introduced by T1.
- **Fix**: No action; resolves when Next ships a patched postcss. Re-check at each dependency bump.
- **Status**: DOCUMENTED (accepted, non-exploitable)

---

## Anon Attack-Surface Matrix

Verified live via PostgREST with the publishable (anon) key against the local stack. `denied` = HTTP 401 `permission denied for table` (no grant) — belt-and-suspenders with the RLS default-deny.

| Table / View          | anon SELECT                          | anon INSERT                | anon UPDATE | anon DELETE | Notes |
|-----------------------|--------------------------------------|----------------------------|-------------|-------------|-------|
| `products` (base)     | **denied** (no grant)                | denied                     | denied      | denied      | Protects `cost_price_cents` structurally — anon never touches base table |
| `products_public`     | active rows only; `cost_price_cents` **absent** (column does not exist) | n/a | n/a | n/a | The public catalog path |
| `brands`/`categories`/`styles` | active rows only            | denied                     | denied      | denied      | `is_active = true` policy |
| `tags`                | all (no active flag)                 | denied                     | denied      | denied      | Non-sensitive |
| `product_variants`/`product_images`/`product_categories`/`product_tags` | rows for active products only (via `is_active_product()`) | denied | denied | denied | Child gates avoid granting base `products` |
| `store_settings`      | all (store name/shipping — no secrets)| denied                    | denied      | denied      | |
| `static_pages`        | published only                       | denied                     | denied      | denied      | |
| `translations`        | scoped to visible parent entities    | denied                     | denied      | denied      | Polymorphic; no leak of draft-parent translations |
| `product_questions`   | **published only**                   | **allowed** (bounded, forced unpublished, active product only) | denied | denied | See SEC-M-1 (spam/DoS) |
| `customers`           | **denied**                           | denied                     | denied      | denied      | PII (email/name/phone) — server-only |
| `orders`              | **denied**                           | denied                     | denied      | denied      | Financials + PII — server-only |
| `order_items`         | **denied**                           | denied                     | denied      | denied      | server-only |
| `order_status_history`| **denied**                           | denied                     | denied      | denied      | server-only |
| `discount_codes`      | **denied**                           | denied                     | denied      | denied      | No enumeration — server-only |

Attacks attempted and blocked (live):
- Read `cost_price_cents` via base `products` → 401. Via `products_public` → `column does not exist`.
- `select *` on base `products` → 401.
- Read `customers.email` / `orders.total_cents,contact_email` / `order_items` / `discount_codes` → all 401.
- INSERT self-published question (`is_published=true`) → RLS violation (privilege escalation blocked).
- INSERT question on nonexistent/inactive product → RLS violation (`is_active_product` gate).
- INSERT into `products` / `orders` → 401 (no grant).
- UPDATE published question (answer injection) → 401 (no UPDATE grant).
- PostgREST embed pivot `product_questions→products→customers` → no FK relationship, blocked.
- Valid unpublished question INSERT → 201 (correctly allowed; readback of own unpublished row is denied by the published-only SELECT policy — expected).

---

## Client / Server Boundary (secret-key leakage) — the highest-risk axis

- `src/lib/supabase/admin.ts` (the only reader of the secret key via `getServerEnv()`) begins with `import "server-only"` — a transitive import from a `"use client"` file is a build error.
- `src/lib/supabase/client.ts` and `server.ts` use **only** `getPublicEnv()` (URL + publishable key). The secret is never referenced on a client path.
- `src/lib/env.ts` reads the secret only inside `getServerEnv()`; the module imports nothing secret at module scope, so `getPublicEnv` is client-safe.
- The secret is **never** prefixed `NEXT_PUBLIC_`.
- **Verified on the built output**: neither `SUPABASE_SECRET_KEY`/`supabaseSecretKey` nor the actual secret value from `.env.local` appears anywhere in `.next/static` (the client bundle). `npm run build` passes with the guard enforced.

---

## Checklist Results
| Category | Status | Notes |
|----------|--------|-------|
| Secrets | PASS | `.env.local` never committed (verified across full git history); no `sb_secret_`/`sb_publishable_` real keys in any commit; `.env*` gitignored (twice). Only "secrets" in tracked files are the **public** well-known Supabase local demo JWTs (`iss: supabase-demo`, localhost-only) in the integration test harness — explicitly documented as such and guarded by `assertLocalOnly`. |
| Env var exposure | PASS | Secret only via `getServerEnv()` in `server-only`-guarded `admin.ts`; never `NEXT_PUBLIC_`; absent from client bundle (grep-verified). |
| Injection | PASS | No dynamic SQL anywhere. Seed uses the parameterized Supabase client. `is_active_product` (SECURITY DEFINER) is `language sql`, parameterized, `search_path=public`. `color_hex` regex-validated. No shell/`child_process`/path/SSRF surface in T1. |
| Auth/AuthZ | PASS | Guest-store trust model enforced: explicit `REVOKE ALL` baseline + narrow grants; every privileged table default-denies anon (verified live); no IDOR surface (anon can't read any per-customer row). |
| Client/server boundary | PASS | See section above — secret confined to server, verified in build output. |
| Data Exposure | PASS | `cost_price_cents` structurally omitted from the anon path; customers/orders/order_items/discount_codes fully denied to anon; `products_public` returns only UI-needed columns; PostgREST `max_rows=1000` caps bulk extraction. |
| CORS/CSRF | PASS (N/A depth) | No custom API routes or server actions in T1. PostgREST auth is key+RLS, not cookie-ambient, so CSRF is not applicable. `config.toml` exposes only the `public` schema. |
| Dependencies | PASS (w/ note) | No `@supabase/*` advisories; 2 moderate transitive `postcss`(via Next) advisories are non-exploitable here (SEC-L-4); no typosquats. `.npmrc legacy-peer-deps=true` is required for React 19 and benign. |

---

## Fixes Applied
1. **SEC-L-1** — pinned `search_path` on the four `SECURITY INVOKER` trigger functions (`set_updated_at`, `categories_check_no_cycle`, `orders_block_snapshot_update`, `order_items_block_update`); schema-qualified `public.categories` in the cycle check. Migrations edited in place (0001/0002/0003). Behavior-preserving; verified live.

## Residual Risks (all documented, none ship-blocking for T1)
- **SEC-M-1**: unthrottled anon question INSERT — availability/abuse only, no data risk; mitigation is app-layer and scoped to the future question-form ticket (no form ships in T1). Backlogged.
- **SEC-M-2 / SEC-L-2 / SEC-L-3 / SEC-L-4**: information-disclosure / input-validation / housekeeping / transitive-dependency items — all low or non-exploitable, out of T1 scope, tracked.
- **Remote apply path** untested (no live token) — same DDL proven correct against local Docker; low risk.

## Gate Results (after fix)
- `npm run lint` → clean
- `npx tsc --noEmit` → exit 0
- `npm run test` → 8 files / 69 passed
- `npm run test:integration` → 5 files / 49 passed (live DB, from clean reset+seed)
- `npm run build` → compiled successfully; `server-only` guard enforced; no secret in client bundle

## Verdict: **SECURE** — SHIP
Zero critical, zero high, zero secrets. The guest-store RLS trust model — the core deliverable — was independently verified under direct adversarial probing with the publishable key: internal cost data, customer PII, order financials, and discount codes are all unreachable by anon, and the only public write surface is bounded and correctly scoped. The one meaningful residual (question-form abuse) is an app-layer concern with no form in this task.
