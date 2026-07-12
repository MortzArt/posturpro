# Hacker Report — T1 Data Foundation (Stage 11, Chaos / Data Layer)

**Status: SUCCESS.** Backend-only task, so the chaos surface was the data layer
(migrations, RLS, seed, money/env helpers). A live local Supabase (Docker) was
stood up, reset + seeded from scratch, and chaos batteries were run via `psql`
and raw PostgREST HTTP.

- Bugs found: **7** — all fixed in `supabase/migrations/0006_data_integrity_hardening.sql`
- Regression tests added: **15** (`tests/integration/hardening.integration.test.ts`)
- Chaos Score: **2/10** after fixes (was ~5 before) — target ≤ 3 met

## Bugs found & fixed

| # | Severity | Bug | Reproduce | Fix |
|---|----------|-----|-----------|-----|
| H-1 | MAJOR | `store_settings` singleton not enforced — a 2nd row was insertable; storefront settings read becomes nondeterministic | `INSERT INTO store_settings(...)` → 2 rows | Partial unique index `store_settings_singleton on ((true))` |
| H-2 | MAJOR | Blank `'   '`, uppercase `ErgoVita`, trailing-space `ergovita ` all accepted as distinct slugs → broken/ambiguous URLs | Insert those slugs | `*_slug_format` CHECK (`^[a-z0-9]+(-[a-z0-9]+)*$`) on brands/categories/styles/tags/products/static_pages |
| H-3 | MAJOR | Whitespace-only / emoji-RTL display names accepted (`char_length` passes on `'   '`) | `INSERT brands(name='   ')` | `*_name_nonblank` CHECK (`char_length(btrim(...)) between 1 and N`) on catalog + customers + store_settings |
| H-4 | MAJOR | Unbounded free text — 5 MB `products.description` inserted fine; same for materials, static-page body, translation value | `description = repeat('A', 5000000)` | `*_len` CHECKs with generous-but-finite bounds |
| H-5 | MINOR | Garbage i18n locale `zz-GARBAGE-🔥` accepted | `INSERT translations(locale='zz-GARBAGE-🔥')` | `translations_locale_format` BCP-47-shape CHECK |
| H-6 | MINOR | Whitespace-only Q&A `author_name`/`question` accepted via anon (201) | anon `POST /product_questions` | Non-blank table CHECK + tightened anon INSERT policy |
| H-7 | MINOR | `discount_codes` with `ends_at < starts_at` accepted — a never-valid window | Insert reversed dates | `discount_codes_window_valid` CHECK |

Every fix was verified live: chaos vector rejected **and** a companion
legitimate write still succeeds. Seed re-runs clean against the hardened
schema; migration 0006 is fully idempotent (re-applied on itself, exit 0). No
existing constraint was weakened — all changes are additive, with 0-row
violations confirmed against current seed data before adding each.

## What survived the chaos (no bug — prior stages solid)

- **PostgREST attack surface**: `cost_price_cents` unreachable via base table,
  `products_public` view, `order=cost_price_cents`, and embedded joins (all
  `42501`/`42703`). `orders`/`customers`/`discount_codes`/`order_items` fully
  denied to anon. NaN filter → `22P02` rejected. `Range: 0-999999999` clamped.
- **Money math**: `formatMXN` handles 0, negatives, `MAX_SAFE_INTEGER`; throws
  on non-integer/NaN/Infinity. Free-shipping boundary correct at
  999999/1000000/1000001 cents.
- **Category deep cycle** (A→B→C→A) rejected by trigger. Int overflow
  (2147483648) rejected. Negative stock blocked by CHECK.
- **Race conditions**: two concurrent `db:seed` runs → both exit 0, zero
  duplicates. Atomic `stock = stock - 1` safe.
- **DX**: missing `SUPABASE_SECRET_KEY` → clear error, exit 1.

## Deferred (roadmap notes — domain rules that belong to T7)

- **Order subtotal decoupled from `order_items` sum** — a checkout-transaction
  invariant (items are inserted after the order), not a static schema CHECK.
  T7 must enforce it inside the order-creation transaction.
- **Lost-update on concurrent stock decrement** — schema supports the safe
  atomic pattern and blocks negatives; T7 checkout code must use
  `stock = stock - qty`, never read-modify-write.
- **DX nit**: seed against an unreachable DB prints `TypeError: fetch failed`
  — clear enough and exits 1, but could suggest "is Supabase running?".

## Top 5 "10x" product improvements (suggestions only — not built)

1. **`effective_stock` view / generated column** — resolve product-vs-variant
   stock authority once in SQL (backlogged as m-2). Unblocks accurate in-stock
   badges + oversell prevention across T4/T5/T7.
2. **Full-text search column** — `tsvector` generated over
   name/description/materials + GIN index makes T5 search instant instead of
   `ILIKE` scans.
3. **Slug-history table** — on admin slug rename (T10), keep old slugs → 301
   redirect. Cheap table, saves SEO and dead links.
4. **`inventory_movements` ledger** — append-only stock deltas (reason:
   sale/restock/adjust). Auditable stock history for free; complements the
   immutable-order model.
5. **Low-stock / merchandising signals** — `sales_count` + per-variant `stock`
   already exist; a view flagging `stock < threshold AND is_best_seller`
   powers restock alerts and "almost gone" badges with no new writes.

## Final gate

- `npm run lint` → clean (0 warnings)
- `npx tsc --noEmit` → exit 0
- `npm run test` → 69 unit passed
- `npm run test:integration` → 64 passed (49 prior + 15 new hardening), from a
  clean `db:reset` applying migrations 0001→0006 + seed
- `npm run build` → compiled successfully, TS check passed
