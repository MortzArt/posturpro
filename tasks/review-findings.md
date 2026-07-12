# Code Review: T1 — Data Foundation (Supabase + Full Schema)

## Summary

Strong, careful implementation: schema is coherent, money is integer-cents throughout, the env/secret trust model is well-reasoned, and 41 tests pass. However the whole thing is **unverified against a live database** (migrations were never applied), and there are several real correctness and security gaps — most notably an RLS gap that can leak internal `cost_price_cents` under a standard `db:reset`, missing GRANTs that make the anon policies inert-or-fragile, no seeded variant/product images (AC-7 partial), and a currency column with no constraint. Recommendation: **REQUEST CHANGES**.

## Severity Counts

- Critical: 3
- Major: 6
- Minor: 5
- Nit: 4

---

## Critical Issues (MUST FIX)

### C-1: `cost_price_cents` column REVOKE is fragile and likely ineffective after `db:reset` / default grants
- **Severity**: CRITICAL
- **File**: `supabase/migrations/0005_rls_policies.sql:43`
- **Problem**: Protection of the internal cost price relies solely on `revoke select (cost_price_cents) on products from anon;`. Two problems:
  1. **No explicit `GRANT` baseline.** The migration never issues `grant select on <tables> to anon`. On Supabase, `anon`/`authenticated` receive table privileges from bootstrap grants (`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`) and, critically, from `ALTER DEFAULT PRIVILEGES`. Because these tables are *created by this migration*, whether `anon` ends up with a table-level `SELECT` grant at all depends on the default-privileges state of the creating role — it is not guaranteed by anything in this repo. If `anon` has no table grant, every anon `SELECT` policy is dead (see C-2). If it does, the column revoke below is racing against it.
  2. **The revoke is order-fragile.** `supabase db reset` re-runs migrations against a fresh DB where Supabase re-applies its default grants; a `GRANT SELECT ON products TO anon` applied by tooling *after* this migration (or a later re-grant) silently re-exposes `cost_price_cents`. Column-level revokes are the first thing lost when someone runs `GRANT SELECT ON products TO anon` for any reason (a very natural thing to do).
- **Impact**: Internal margin data (`cost_price_cents`, ~55% of retail for every product) can be read by any visitor with the publishable key. This is the exact thing AC-12 and the Error-States table say must never happen, and it is the highest-value data leak in the schema.
- **Suggested Fix**: Make column protection structural, not a revoke of one column: expose the public catalog through a dedicated view (e.g. `products_public`) that simply omits `cost_price_cents`, grant `anon` SELECT on the view only, and keep the base `products` table ungranted to `anon` (server/service path only). Alternatively, explicitly `grant select (col, col, ...) on products to anon` enumerating every column *except* `cost_price_cents` (positive allow-list), which cannot be undone by a blanket table grant the way a column revoke can. Either way, add an explicit GRANT/REVOKE baseline so the outcome is deterministic and not inherited from ambient default privileges.
- **Status**: OPEN

### C-2: RLS policies never establish an explicit privilege baseline for `anon` — policies may be entirely inert or silently over-broad
- **Severity**: CRITICAL
- **File**: `supabase/migrations/0005_rls_policies.sql:19-43` (whole grant model)
- **Problem**: RLS policies only *filter* rows/commands for a role that already holds the underlying table privilege. This migration `ENABLE`s RLS and writes `... to anon` policies but never runs a single `GRANT`/explicit `REVOKE ALL` to define what `anon` may touch at the privilege layer. The correct result depends entirely on Supabase's ambient default privileges at migration time, which are not pinned anywhere in this repo. Result is non-deterministic across environments: either (a) `anon` lacks table grants and the storefront reads nothing, or (b) `anon` has broad table grants (INSERT/UPDATE/DELETE included) and RLS is the only thing standing between anon and writes — yet there are no `for insert/update/delete` policies except product_questions, so those would be denied, but you are now depending on RLS default-deny for write protection while the *grant* says writes are allowed. Belt without suspenders.
- **Impact**: The RLS model described in AC-12 is only *claimed*, never made explicit or verifiable. Because migrations were never applied (see C-3), nobody has observed the actual effective privileges. This is the single most important deliverable of the task and it rests on an unstated assumption.
- **Suggested Fix**: At the top of `0005`, make the baseline explicit and self-contained: `revoke all on all tables in schema public from anon, authenticated;` then `grant select on <the public catalog tables/views> to anon;` and `grant insert on product_questions to anon;`. This makes the trust model reproducible regardless of ambient defaults and is independently auditable.
- **Status**: OPEN

### C-3: Migrations, RLS, and seed were never executed against a database — zero runtime verification of the task's core deliverable
- **Severity**: CRITICAL
- **File**: `tasks/dev-done.md:36-41, 99-107`; all `supabase/migrations/*.sql`; `scripts/seed.ts`
- **Problem**: By the dev's own account, the schema "could not be applied to the live instance this session" and "RLS behavior verification is a QA concern." So: no migration has been proven to apply, no FK/CHECK/enum has been exercised, the REVOKE in C-1 has never been observed, idempotency of the `DO`/`if not exists` blocks has never been re-run, and the seed's upsert-onConflict behavior (which depends on real unique constraints) has never round-tripped. The 41 passing tests validate *pure fixture data and the env/money helpers only* — not one line of SQL and not one Supabase query.
- **Impact**: Every SQL-level claim in this task is unverified. A single typo in a policy `using` clause, a wrong `onConflict` target, or a missing unique index would not have been caught. AC-13's "running it twice does not create duplicates" is asserted, never demonstrated.
- **Suggested Fix**: Stand up the schema (local `supabase start` or the linked remote), run `db:push`, run `db:seed` twice capturing both summaries, and run an RLS smoke test with the publishable key proving: anon cannot read `cost_price_cents`, cannot read `orders`/`customers`/`discount_codes`, cannot read draft products, and *can* read active catalog. This must happen before ship; it cannot be waved to a later stage because it is the acceptance criterion.
- **Status**: OPEN

---

## Major Issues (SHOULD FIX)

### M-1: AC-7 partially unmet — variant-specific images are never seeded
- **Severity**: MAJOR
- **File**: `scripts/seed.ts:199-222`; `scripts/seed-data/products.ts:49-51`
- **Problem**: AC-7 requires variants that "link to variant-specific images," and AC-13 requires "≥1 color variant per product **with variant images**." The seed inserts exactly one product-level image per product (`variant_id` implicitly null) and never sets `variant_id` on any image. `seedImageUrl` only ever takes `(slug, 1)`. dev-done.md (Known Limitations) admits per-variant images are "supported by the schema but not seeded."
- **Impact**: AC-13's "with variant images" clause is FAIL. Downstream T4 variant-image display logic has no seed data to render, defeating the stated purpose of realistic seed data.
- **Suggested Fix**: Seed at least one `product_images` row with a non-null `variant_id` for multi-variant products (even reusing the placeholder URL with a variant suffix), so the variant→image relationship has coverage.
- **Status**: OPEN

### M-2: `orders.currency` and `store_settings.currency` are free-text with no constraint
- **Severity**: MAJOR
- **File**: `supabase/migrations/0003_commerce.sql:52, 134`
- **Problem**: `currency text not null default 'MXN'` with no CHECK and no enum. Any 3-char (or arbitrary) string can be written. For a financial snapshot table that AC-8 calls "immutable" and single-currency, an unconstrained currency invites silent data corruption (e.g. `'mxn'`, `'USD'`, `'$'`).
- **Impact**: A bug in T7/T8 order creation could persist a wrong or malformed currency into the immutable financial record with no DB guard. Money-integrity task; this is exactly the class of thing it exists to prevent.
- **Suggested Fix**: Add `check (currency = 'MXN')` in Phase 1 (or a `currency_code` enum). Tighten to a real ISO set only when multi-currency is actually built.
- **Status**: OPEN

### M-3: No cross-column financial consistency constraints on `orders` / `order_items`
- **Severity**: MAJOR
- **File**: `supabase/migrations/0003_commerce.sql:46-51, 84-86`
- **Problem**: Each money column is individually `>= 0`, but nothing enforces the relationships that make a financial snapshot trustworthy: `total_cents` is not constrained to equal `subtotal + shipping + tax - discount`, `discount_cents` is not bounded by `subtotal_cents`, and `order_items.line_total_cents` is not constrained to `unit_price_cents * quantity`. For a table whose entire reason to exist is immutable financial truth (AC-8/AC-9), the DB accepts internally-inconsistent rows.
- **Impact**: A totals-calculation bug in checkout (T7) writes a self-contradictory order and the DB happily stores it; the "immutable snapshot" is only as correct as the app code, with no backstop.
- **Suggested Fix**: Add CHECK constraints: `check (line_total_cents = unit_price_cents * quantity)` on `order_items`; `check (discount_cents <= subtotal_cents)` and `check (total_cents = subtotal_cents + shipping_cents + tax_cents - discount_cents)` on `orders`. If Phase-3 tax rules complicate the total identity, at minimum constrain the line-total identity and discount bound now.
- **Status**: OPEN

### M-4: Immutability of orders/order_items is claimed but not enforced
- **Severity**: MAJOR
- **File**: `supabase/migrations/0003_commerce.sql:25-88`; AC-8/AC-9
- **Problem**: AC-8 says orders store an "immutable financial snapshot" and AC-9 says snapshots must "survive product edits/deletes." Nothing in the schema actually prevents mutation of the financial columns — there is an `orders_set_updated_at` UPDATE trigger, which implies UPDATEs are expected, and no rule/trigger locks the snapshot columns after creation. `order_items` has no `updated_at` (good) but also no guard against UPDATE.
- **Impact**: "Immutable" is aspirational. Any code with the service key (all order access) can silently rewrite a historical order's totals, breaking the accounting guarantee the column-snapshot design was chosen to provide.
- **Suggested Fix**: Either document explicitly that immutability is enforced at the application layer (and where), or add a trigger that rejects UPDATE/DELETE of the financial snapshot columns on `order_items` and the frozen money columns on `orders` once created. At minimum, state the enforcement boundary — right now it is neither enforced nor scoped.
- **Status**: OPEN

### M-5: `db:reset` uses `--linked`, pointing destructive reset at the REMOTE database
- **Severity**: MAJOR
- **File**: `package.json:14`
- **Problem**: `"db:reset": "supabase db reset --linked"`. `db reset` drops and recreates the database. With `--linked` this targets the *linked remote project*, not a local dev DB. A developer running `npm run db:reset` expecting a local wipe will destroy the shared remote database (and its real orders/customers once live).
- **Impact**: Foot-gun with data-loss blast radius on a production-ish instance. Especially dangerous because this is the same instance the seed talks to.
- **Suggested Fix**: Make `db:reset` target local (`supabase db reset` against `supabase start`), and if a remote reset is ever needed, give it a distinct, obviously-dangerous name (`db:reset:remote`) with a confirmation. Never wire the plain `db:reset` verb to `--linked`.
- **Status**: OPEN

### M-6: `product_questions` anon INSERT policy is an unauthenticated, unbounded write with no length/rate guard
- **Severity**: MAJOR
- **File**: `supabase/migrations/0005_rls_policies.sql:151-161`; `0004_content_qa.sql:10-20`
- **Problem**: Anon can INSERT questions freely. `author_name` and `question` are unbounded `text` with no length CHECK, no per-IP throttle (understood — DB can't rate-limit), and no CAPTCHA hook. Combined with default-deny elsewhere this is the one public write surface and it is wide open to spam/abuse and to multi-megabyte payloads.
- **Impact**: Storage-exhaustion / spam vector reachable by anyone holding the publishable key (which ships to the browser). Not exploitable for data theft, but a real availability/abuse concern for the only anon write path.
- **Suggested Fix**: Add length CHECKs (`char_length(question) between 1 and 2000`, `char_length(author_name) between 1 and 120`) at minimum. Note the need for app-layer rate limiting / captcha in T-whatever ships the question form, and record it in the backlog.
- **Status**: OPEN

---

## Minor Issues (NICE TO FIX)

### m-1: Deep category cycles (A→B→A) not prevented at the DB level
- **File**: `supabase/migrations/0002_catalog.sql:37`; dev-done.md:148-150
- **Problem**: Only the trivial self-parent (`parent_id <> id`) is blocked. Edge case 4 says "a category cannot be its own ancestor" — a 2+ node cycle satisfies the current CHECK. Dev acknowledges this and defers to the T10 admin UI.
- **Suggested Fix**: Acceptable to defer for Phase 1 since seed builds well-formed trees, but the ticket's edge case is literally "cannot be its own ancestor." Consider a trigger using a recursive ancestor walk, or explicitly downgrade the edge case in the ticket. Track in `tasks/clean-code-backlog.md`.

### m-2: Stock authority rule is documented but not enforceable/derivable
- **File**: `supabase/migrations/0002_catalog.sql:66-70`; seed `products.ts:169`
- **Problem**: "When a product has variants, per-variant stock is authoritative; product-level stock is the fallback." The seed sets product `stock = sum(variant stock)`, so the two agree today, but nothing keeps them consistent and no view/column marks which is authoritative. Downstream code must remember the rule.
- **Suggested Fix**: Consider a generated/derived read path (view) that resolves effective stock, so consumers can't pick the wrong column. At minimum keep the rule in one canonical doc consumers are pointed to.

### m-3: `seedImages` returns an inflated count and swallows the read error
- **File**: `scripts/seed.ts:201, 220-221`
- **Problem**: `const { data: existing } = await db.from("product_images").select("url");` ignores the error field (unlike every other read which calls `fail` on error). And the function `return PRODUCTS.length` regardless of how many rows were actually inserted or already existed, so the printed `product_images` count is fictional on a partial run. Contradicts AC-13's "readable per-table summary" and the dev-UX requirement of an accurate summary.
- **Suggested Fix**: Handle the `error` from the existing-images read via `fail(...)` like the other reads, and report the true resulting row count (existing + newly inserted), not `PRODUCTS.length`.

### m-4: `product_images` idempotency keys on URL, but URL is not unique in the schema
- **File**: `scripts/seed.ts:200-218`; `0002_catalog.sql:152-161`
- **Problem**: Idempotency for images is done in application code by fetching existing URLs into a Set and skipping. There is no unique constraint on `product_images.url` (or `(product_id, url)`), so a concurrent seed or a direct insert bypasses the guard and creates duplicates. Other tables get real DB-level upsert; images get a weaker app-level check.
- **Suggested Fix**: Add `unique (product_id, url)` and use a real `upsert(onConflict: "product_id,url")` for images too, matching the pattern used everywhere else.

### m-5: `SEED_IMAGE_BASE_URL` is not a real Unsplash URL — seeded image URLs will 404
- **File**: `src/lib/config.ts:63-64`; `scripts/seed-data/products.ts:49-51`
- **Problem**: `https://images.unsplash.com/photo-office-chair` + `/{slug}-1.jpg` is not a valid Unsplash asset path (Unsplash photos are `photo-<id>?...`). Every seeded image URL will 404. It is allow-listed in `next.config.ts` so `next/image` won't reject the host, but the images won't load.
- **Suggested Fix**: Fine as an explicit placeholder given the documented swap note, but the URL shape guarantees 404s even as a placeholder. Use a working placeholder host (e.g. `picsum.photos/seed/<slug>/800/800`) so seeded data renders something during T2–T5 development.

---

## Nits

### n-1: `orders.shipping_country` default `'MX'` but no constraint tying it to MXN/Mexican states
- **File**: `0003_commerce.sql:37-39` — `shipping_state`/`shipping_postal_code` are free text; fine for Phase 1, but note there is no validation of Mexican state values.

### n-2: `discount_codes.value` overloads two meanings (percentage 0-100 vs cents) in one column with only `>= 0`
- **File**: `0003_commerce.sql:112-114` — a `percentage` row can store `value = 5000` (5000%) with no upper bound. Table-only in Phase 1, but a `check (discount_type <> 'percentage' or value <= 100)` would cost nothing now.

### n-3: `import "dotenv"` side-effect ordering in seed relies on hoist behavior
- **File**: `scripts/seed.ts:19-38` — `loadEnv()` is called at line 22 between two import groups; ES module imports are hoisted above it, so `getServerEnv` is imported before `loadEnv` runs. It works because env is read lazily at call time, but the visual ordering is misleading. A short comment already exists; consider moving all env-dependent work strictly after load, or use `tsx --env-file`.

### n-4: `translations` has no FK on `entity_id` (by design, polymorphic) — acceptable, but orphan rows are possible
- **File**: `0004_content_qa.sql:45-55` — polymorphic association can't have a single FK; RLS scopes reads, but deleting a product leaves orphan translation rows. Note for a future cleanup job.

---

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | Supabase libs in deps | PASS | `package.json:21-22` `@supabase/ssr`, `@supabase/supabase-js` |
| AC-2 | Typed env module, throws on missing, single source | PASS | `src/lib/env.ts:20-85`; tested in `env.test.ts` |
| AC-3 | Browser client uses publishable key only | PASS | `src/lib/supabase/client.ts:13-16` |
| AC-4 | Server client `createServerClient`+`cookies()`; admin `server-only` | PASS | `server.ts:15-38`, `admin.ts:10-24` |
| AC-5 | All 18 tables incl. self-ref categories + i18n | PASS | migrations 0002/0003/0004; `translations` in 0004 |
| AC-6 | Full product model | PASS | `0002_catalog.sql:72-99` covers every listed field |
| AC-7 | Variant SKU/stock/override/color + variant images | PARTIAL FAIL | Schema present (`0002:132-165`); **variant-linked images never seeded** (M-1) |
| AC-8 | Orders full immutable financial snapshot + statuses | PARTIAL | Columns all present (`0003:25-65`); "immutable" not enforced (M-4); currency unconstrained (M-2) |
| AC-9 | order_items snapshot name/SKU/price/qty/total | PASS | `0003:76-88`; FK `on delete set null` |
| AC-10 | order_status_history from/to/note/timestamp | PASS | `0003:95-102` |
| AC-11 | store_settings single row, correct cents, integer money | PASS (fixture) | seed `seedStoreSettings` fixed id, 50000/1000000; unverified on live DB (C-3) |
| AC-12 | RLS on every table + guest trust model; no anon cost_price/orders/discounts | FAIL | RLS enabled + policies written, but **no GRANT baseline (C-2)** and **cost_price protection fragile (C-1)**; never verified (C-3) |
| AC-13 | Repeatable seed, correct counts, nested cat, variant images, idempotent | PARTIAL FAIL | Counts/nesting/variants correct (tests pass); **variant images missing (M-1)**; idempotency **never demonstrated (C-3)** |
| AC-14 | Generated types imported, no `any`/`!` | PASS | `database.types.ts`; clients import `Database`; single `as never` at uniform upsert (documented, not `any`/`!`) |
| AC-15 | `npm run test` + lint + typecheck pass | PASS (partial scope) | `npm run test` → 41 passed (verified). dev claims lint/build pass; note seed SQL untested |
| AC-16 | next.config remotePatterns for Supabase host | PASS | `next.config.ts:12-31` |
| AC-17 | Centralized constants + swap note in dev-done | PASS | `src/lib/config.ts`; dev-done.md table |

## Edge Case Verification

| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Missing/blank env throws named error | HANDLED | `env.ts:31-40`; `env.test.ts` |
| 2 | Secret key leakage → build error | HANDLED | `admin.ts:10` `import "server-only"` |
| 3 | Re-run migrations/seed idempotent | PARTIAL | `if not exists`/guarded DO + upserts present; **never executed twice against a DB (C-3)**; images use weaker app-level guard (m-4) |
| 4 | Nested category integrity, no cycle, no orphan | PARTIAL | Self-parent CHECK + `on delete restrict` (`0002:29,37`); **deep cycles not blocked (m-1)** — edge case says "own ancestor" |
| 5 | Variant price override precedence, both cases seeded | HANDLED | `products.ts:148-149`; asserted in `seed-invariants.test.ts:114-118` |
| 6 | Money never float; single format boundary | HANDLED | integer cents everywhere; `money.ts` throws on non-integer; tested |
| 7 | Zero-vs-many variants; stock authority rule | HANDLED (doc-only for authority) | single & multi variant seeded + asserted; authority rule documented not enforced (m-2) |
| 8 | Order refs deleted/edited product via snapshot | HANDLED | `order_items` snapshot cols + FK `on delete set null` (`0003:79-86`) |

## Quality Score: 6.5/10

Clean, well-documented, thoughtfully typed code with genuinely good instincts (integer cents, server-only guard, drop-then-create idempotent policies). Held back by an RLS privilege model that is asserted rather than made explicit/verifiable, the highest-value data (cost price) protected by the most fragile mechanism, financial-integrity constraints left to app code on the very tables designed to be the source of truth, a dangerous `db:reset --linked` foot-gun, and — most importantly — the entire SQL/RLS/seed layer never having touched a database.

## Recommendation: REQUEST CHANGES

Do not ship until: (C-3) the schema is applied and the seed round-trips twice against a real DB; (C-1/C-2) the anon privilege baseline is made explicit and `cost_price_cents` protection is structural (view or column allow-list) and verified with the publishable key; (M-5) `db:reset` no longer points at `--linked`; and (M-1) at least one variant-linked image is seeded to satisfy AC-7/AC-13. M-2/M-3/M-4 (financial constraints + immutability) should be fixed or explicitly scoped since data-integrity is the entire mandate of this task.
