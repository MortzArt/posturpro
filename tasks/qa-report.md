# QA Report: T1 — Data Foundation (Supabase + Full Schema)

Backend-only data/infrastructure task — no UI, so no e2e/DOM tests. Coverage is
split between **unit tests** (pure logic: env, money, config, client factories,
seed fixtures) and **live integration tests** against a local Supabase (Docker):
RLS matrix, `products_public` column protection, financial/immutability
constraints, category cycle trigger, Q&A insert policy, and seed idempotency.

## Test Suite Summary

| Type | Written (new) | Passed | Failed | Skipped |
|------|--------------|--------|--------|---------|
| Unit | 25 | 69 | 0 | 0 |
| Integration (live DB) | 49 | 49 | 0 | 0 |
| E2E | 0 (N/A — backend task) | — | — | — |
| **Total** | **74 new** | **118** | **0** | **0** |

- Unit suite total is **69** (44 pre-existing + 25 new). Run: `npm run test`.
- Integration suite total is **49** (all new). Run: `npm run test:integration`.

## Verification Results (all pass)

| Gate | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` | exit 0, 0 errors |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Unit tests | `npm run test` | 8 files / **69 passed** |
| Integration | `npm run test:integration` | 5 files / **49 passed** (from clean reset+seed) |
| Build | `npm run build` | Compiled successfully, TS check passed |

## How to Run Each Suite

- **Unit (fast, no DB):** `npm run test`
  - Config: `vitest.config.ts` (jsdom, `src/**/*.test.{ts,tsx}`).
- **Integration (live local Supabase):** `npm run test:integration`
  - Requires Docker + a started stack. The runner (`scripts/run-integration.sh`)
    does `supabase db reset` (applies migrations 0001→0005 from scratch) →
    `npm run db:seed` (idempotent) → `vitest --config vitest.integration.config.ts`.
  - Uses the **well-known public local Supabase demo keys** (not secrets; only
    valid against localhost). `tests/integration/local-supabase.ts` refuses to
    run against any non-loopback host (`assertLocalOnly`).
  - If the stack is not running: `npx supabase start` first; stop with
    `npx supabase stop` when done.

## Tests Written

### Unit Tests (new — 25)
- `src/lib/supabase/client.test.ts` — browser factory forwards ONLY the
  publishable key + URL, never the secret; admin factory forwards the SECRET
  key, disables session persistence, and propagates `MissingEnvVarError`.
- `src/lib/supabase/server.test.ts` — server factory uses the publishable key
  (RLS applies), bridges `getAll`/`setAll` to Next's async `cookies()`, and
  swallows the read-only-cookie error during a Server Component render.
- `src/lib/config.test.ts` — pins shipping cents (50000 = MX$500), free-shipping
  threshold (1000000 = MX$10,000), currency/locale, storage bucket, seed store
  identity; asserts money stays integer cents.
- `src/lib/seed-invariants-extra.test.ts` — category graph acyclicity, every
  parent resolves, ejecutiva products link both child + parent category, every
  product has ≥1 category/tag, compare-at > retail when present, positive
  integer dimensions/weight, overridden variant price distinct from base,
  static-page fixture integrity.

### Integration Tests (new — 49, live DB)
- `rls-matrix.integration.test.ts` — anon CAN read active catalog (products via
  `products_public`, brands, categories, styles, tags, variants, images, M2M
  joins, store_settings, static_pages); anon CANNOT read base `products` (so
  `cost_price_cents` is unreachable — selecting it errors) nor orders/customers/
  order_items/order_status_history/discount_codes; service key bypasses RLS and
  reads everything incl. `cost_price_cents`.
- `constraints.integration.test.ts` — orders total-identity + discount≤subtotal
  + currency='MXN' CHECKs; order snapshot immutability (blocks total_cents
  update, allows status update); order_items line-total identity + full
  immutability; order_status_history transition insert; category self-parent +
  3-node cycle + nonexistent-parent FK rejections; discount percentage>100
  rejected, fixed_amount>100 allowed.
- `qa-policy.integration.test.ts` — anon may insert an unpublished/unanswered
  question on an active product; may NOT self-publish, self-answer, exceed 2000
  chars, or use a blank author; anon cannot read its own unpublished row but CAN
  read a server-published one.
- `seed.integration.test.ts` — seeded counts (5/6/30/69/99), nested category
  present, single store_settings row with documented cents + MXN, inherited vs
  overridden variant prices both present, single- and multi-variant products
  both present, variant-linked images present, and **seed idempotency** (re-runs
  `npm run db:seed`, row counts unchanged).
- `visibility.integration.test.ts` — draft & archived products (and draft
  variants) hidden from anon, active shown; `set_updated_at()` bumps `updated_at`
  on update; **order_items snapshot survives product deletion** (product_id
  nulled, snapshot columns intact — edge case 8).

## Acceptance Criteria Coverage

| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| AC-1 | Supabase libs installed | `package.json` deps present (verified) | PASS |
| AC-2 | Typed env module, throws on missing, single source | `env.test.ts` (7 cases) | PASS |
| AC-3 | Browser factory uses publishable key only | `client.test.ts` browser cases | PASS |
| AC-4 | Server factory (`createServerClient`+cookies); admin `server-only`+secret | `server.test.ts`, `client.test.ts` admin cases | PASS |
| AC-5 | All 18 tables + i18n exist | migrations apply clean; RLS/seed touch every table | PASS |
| AC-6 | Full product model (dims, materials, flags, cost) | `seed-invariants*`; RLS reads columns; visibility create | PASS |
| AC-7 | Variant SKU/stock/override/color + variant images | `seed-invariants` variants; `seed.integration` variant images | PASS |
| AC-8 | Orders immutable financial snapshot + status enum | `constraints.integration` orders CHECKs + immutability | PASS |
| AC-9 | order_items snapshot at purchase, survives edits | `constraints` line-total/immutability; `visibility` delete-survival | PASS |
| AC-10 | order_status_history transitions | `constraints` status-history insert | PASS |
| AC-11 | store_settings single row, cents (500/10000) | `config.test.ts`, `seed.integration` store_settings | PASS |
| AC-12 | RLS on every table, guest trust model, no cost/orders to anon | `rls-matrix` (full matrix), `qa-policy`, `visibility` | PASS |
| AC-13 | Idempotent seed, ~5/6/6/30, nested cat, variants, links | `seed.integration` counts + idempotency; `seed-invariants*` | PASS |
| AC-14 | Generated types imported, no `any`/`!` | `tsc --noEmit` exit 0; factories typed via `Database` | PASS |
| AC-15 | `npm run test` + lint + tsc pass, incl. new tests | 69 unit pass; lint 0; tsc 0 | PASS |
| AC-16 | next.config images.remotePatterns for Storage host | `build` succeeds; seed image URLs allow-listed (`seed-invariants`) | PASS |
| AC-17 | Centralized named constants w/ units | `config.test.ts` pins all constants | PASS |

## Edge Case Coverage

| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Missing/blank env var throws named error | `env.test.ts` | PASS |
| 2 | Secret-key leakage blocked (`server-only`) | `admin.ts` guard + `build` passes; factory test | PASS |
| 3 | Re-running seed is a no-op (idempotent) | `seed.integration` idempotency (re-runs seed) | PASS |
| 4 | Nested category integrity + no cycle + FK | `constraints` self-parent/cycle/FK; `seed-invariants-extra` acyclicity | PASS |
| 5 | Variant price override precedence (null vs value) | `seed-invariants`; `seed.integration` inherited+overridden | PASS |
| 6 | Money never float (integer cents) | `money.test.ts`, `config.test.ts` | PASS |
| 7 | Zero/single vs many variants | `seed-invariants`; `seed.integration` single+multi | PASS |
| 8 | Order references deleted/edited product (snapshot) | `visibility.integration` product-delete survival | PASS |

## Bugs Found & Fixed

- **Q-1 (MAJOR): `order_items` immutability trigger blocked `ON DELETE SET NULL`.**
  - **How found:** the `visibility.integration` edge-case-8 test tried to delete
    a product referenced by an order_item and assert the item survived with
    `product_id = null`. The delete was silently blocked and the product row
    leaked (also surfaced as a 31-vs-30 product count).
  - **Root cause:** `order_items_block_update()` raised on **every** UPDATE.
    When a referenced product is deleted, Postgres performs
    `UPDATE order_items SET product_id = NULL` (the `on delete set null` FK) —
    the BEFORE UPDATE trigger rejected that cascade, making any product
    referenced by order history **undeletable**. This directly defeats the
    ticket's edge case 8 and its stated design ("FK `on delete set null`,
    snapshot columns are the source of truth").
  - **Fix:** `supabase/migrations/0003_commerce.sql` — the trigger now blocks
    only mutations of the snapshot columns (order_id, product_name, product_sku,
    variant_label, unit_price_cents, quantity, line_total_cents, created_at) and
    any *repointing* of the FK columns, while **permitting** `product_id`/
    `variant_id` to be cleared to NULL by a cascade. Production behavior
    hardened, not weakened: the financial/descriptive snapshot is still frozen.
  - **Covered by:** `visibility.integration.test.ts` ("order_items snapshot
    survives product deletion"), plus the existing order_items immutability test
    still proves a direct UPDATE is rejected. Verified live from a clean reset.

## Confidence: HIGH

- 100% of the 17 ACs and all 8 edge cases have at least one passing test.
- Every claim in `dev-done.md`'s "Live-DB Verification" section is now backed by
  a **repeatable, automated** test (`npm run test:integration`), not a one-off
  manual smoke test — including RLS denial, `cost_price_cents` protection,
  financial CHECKs, immutability, category cycles, and Q&A policy.
- A real, ship-blocking bug (Q-1) was found by the new edge-case-8 test and
  fixed in production SQL; the fix was verified from a clean migration reset.
- Lint, typecheck, unit, integration, and build all pass. No `any`, no `!`, no
  assertion-free tests; integration tests are deterministic (sequential, seed
  reset up front, self-cleaning fixtures, seed-scoped count assertions).

## Untested Areas

- **Remote/managed Supabase apply path** (`supabase link` + `db push` against the
  real project): out of scope for automated CI and requires a live access token /
  DB password not available here. The identical migrations are proven to apply
  and behave correctly against a local instance; `dev-done.md` documents the
  remote apply steps. Risk: LOW (same DDL, same seed).
- **App-layer question-form abuse controls** (rate limiting / captcha): deferred
  to the ticket that ships the form (tracked in `tasks/clean-code-backlog.md`).
  The DB-level length bound IS tested. Risk: LOW for T1 (no form yet).
- **Stock authority resolution view** (`effective_stock`): documented as out of
  scope (m-2, T4/T5). Per-product and per-variant stock columns are tested to
  exist and accept values. Risk: LOW.
