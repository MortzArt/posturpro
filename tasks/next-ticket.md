# Task: T1 — Data Foundation (Supabase + Full Database Schema)

## Priority

**Critical** — This is the root dependency of the entire build plan. T2 (app shell), T3–T7 (catalog, cart, checkout), T10 (admin), and T13 (static pages) are all `blocked by: T1`. Nothing renders real data, no order can be created, and no admin screen can function until the schema, typed client, RLS, and seed data exist. It is also the only task that defines the persistence contract every later task codes against — getting the model wrong here forces schema rework across 13 downstream tasks.

## Complexity

**high** — Justified against the criteria:

- **New subsystem, not a pattern copy.** The repo is a bare Next.js scaffold (one `button.tsx`, one `cn()` util, no data layer at all). There is no existing Supabase client, no migration harness, no types, no seed pipeline to copy from — all of it is net-new.
- **15+ files changed.** ~18 database tables across multiple migration files, RLS policies, a generated types file, server + browser Supabase client wrappers, an env-config module, a seed script, seed data fixtures, `next.config.ts` image remote-patterns, plus tests.
- **New data models + architectural decisions.** Introduces the entire relational model (many-to-many product↔category, nestable categories via self-referential FK, variant/price-override logic, order immutability, guest-customer records, i18n content structure) and the RLS trust model for a guest-checkout store with a single admin owner. These are architectural choices the rest of the app is built on.

This maps directly to the CLAUDE.md `high` example "building the automation engine / new data models."

## Feature Type

**backend-only** (data/infrastructure layer).

There is **no visible UI surface** in this task — no pages, no components. Deliverables are the schema, RLS, typed data-access clients, env config, and seed data. Pipeline implication: **UI Design (Stage 3) and UX (Stage 8) run lightweight/skipped**; Security (Stage 9) and Arch (Stage 10) run at **full depth** (RLS correctness and data-model soundness are the whole point of this task). QA (Stage 7) focuses on migration idempotency, RLS policy behavior, seed correctness, and type-generation — not DOM tests.

## User Story

As the **store owner and every future task in the build plan**, I want a **complete, typed, secured Postgres schema on Supabase with realistic seed data**, so that **the storefront, cart, checkout, and admin can all be built against a stable, correct data contract without schema rework later**.

## Background

Today the repo (`/Users/MortzArt/Documents/projects/posturpro`) is a fresh Next.js 16 App Router scaffold: React 19, Tailwind v4, shadcn (radix-ui base), vitest + playwright configured, TS strict. The only source files are `src/app/{layout,page}.tsx`, `src/lib/utils.ts` (`cn()`), and `src/components/ui/button.tsx`. There is **no data layer of any kind**.

A Supabase project already exists and its credentials are in `.env.local` (gitignored). Notably these are the **new-format** Supabase keys, not the legacy JWT anon/service_role pair:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (client-safe, replaces the old anon key)
- `SUPABASE_SECRET_KEY` (server-only, replaces the old service_role key — **must never** reach the client bundle or be prefixed `NEXT_PUBLIC_`)

This task must (per PRODUCT_SPEC.md and BUILD_PLAN.md T1) deliver the full Phase-1 relational model, Row-Level Security, and seed data (~30 chairs, ~5 brands, ~6 categories, ~6 styles, color variants, realistic MXN prices; store settings seeded flat-rate MX$500 / free-shipping MX$10,000).

**Scope guardrail (from BUILD_PLAN rule 2 + PRODUCT_SPEC Phase 2):** the schema must *support* Phase-2 features but this task builds **no Phase-2 behavior**. That means: `discount_codes` is a **table only** (no validation logic, no management UI); no customer-account auth (guest `customers` records only); no rich-text/page-editing UI (static-page content stored as data); i18n is a **content structure** only (no runtime toggle — that is T2). CFDI fields (order-level RFC optional, full tax/amount breakdown columns) exist for Phase-3 readiness but are unused now.

## Acceptance Criteria

Each is binary PASS/FAIL.

- [ ] **AC-1:** Supabase client libraries (`@supabase/supabase-js`, `@supabase/ssr`) are installed and appear in `package.json` dependencies.
- [ ] **AC-2:** A typed environment-config module (e.g. `src/lib/env.ts`) reads the three Supabase env vars, throws a descriptive error at startup if any required var is missing, and is the single source of truth for them. `SUPABASE_SECRET_KEY` is only ever referenced from server-side code paths and is never imported into a `"use client"` file.
- [ ] **AC-3:** A browser Supabase client factory (`src/lib/supabase/client.ts`) uses only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] **AC-4:** A server Supabase client factory (`src/lib/supabase/server.ts`) uses `@supabase/ssr` `createServerClient` with Next 16 `cookies()` wiring; a separate admin/service client helper uses `SUPABASE_SECRET_KEY` and is exported from a server-only module (guarded with `import "server-only"`).
- [ ] **AC-5:** SQL migrations under `supabase/migrations/` create ALL of these tables: `brands`, `categories` (self-referential `parent_id` for nesting), `styles`, `tags`, `products`, `product_categories` (M2M join), `product_tags` (M2M join), `product_variants`, `product_images`, `product_questions`, `customers`, `orders`, `order_items`, `order_status_history`, `discount_codes`, `store_settings`, `static_pages`, and an i18n/translations structure for localizable content.
- [ ] **AC-6:** The `products` table covers the full spec product model: name, slug, description, `brand_id`, base price (MXN), `compare_at_price`, `cost_price` (internal, never client-exposed), SKU, stock, status enum (`draft`/`active`/`archived`), dimensions (width/depth/height/seat_height), weight, materials (frame/upholstery/finish), `best_seller`/sales-count field for best-selling sort, and `featured` flag.
- [ ] **AC-7:** `product_variants` has its own SKU, stock, optional `price_override`, color name + hex, and links to variant-specific images.
- [ ] **AC-8:** `orders` stores a complete immutable financial snapshot: order number, guest `customer_id`, contact + shipping address fields (incl. Mexican `state` + `postal_code`), delivery notes, optional `rfc` (CFDI Phase-3), subtotal, shipping amount, discount amount, tax breakdown columns, total, currency (MXN), status enum matching the spec pipeline (`pending_payment`/`paid`/`preparing`/`shipped`/`delivered`/`cancelled`), payment method/status, and Mercado Pago reference columns (nullable now, populated in T8).
- [ ] **AC-9:** `order_items` snapshot product name, SKU, unit price, quantity, and line total **at time of purchase** (not FKs alone) so historical orders survive product edits/deletes.
- [ ] **AC-10:** `order_status_history` records each status transition with timestamp, from/to status, and an optional note.
- [ ] **AC-11:** `store_settings` is seeded with a single row: store name, contact email, `shipping_flat_rate_cents` = 50000 (MX$500), `free_shipping_threshold_cents` = 1000000 (MX$10,000). All monetary values are stored as integer cents (documented convention), not floats.
- [ ] **AC-12:** Row-Level Security is **enabled on every table** and policies implement the guest-store trust model: public/anon can `SELECT` only active catalog data (active products, their variants/images, active categories/brands/styles/tags, published static pages, store settings, answered questions) and can `INSERT` product questions + (via server) orders; anon can never read `cost_price`, other customers' orders/customer records, or `discount_codes`. All privileged reads/writes go through the secret-key server client which bypasses RLS.
- [ ] **AC-13:** A repeatable seed script (`npm run db:seed`) populates ~5 brands, ~6 categories (including at least one nested child), ~6 styles, a tag set, ~30 chair products with realistic Spanish names and realistic MXN prices, ≥1 color variant per product with variant images, product↔category M2M links, and the store-settings row. Running it twice does not create duplicates (idempotent upsert on stable slugs/keys).
- [ ] **AC-14:** A generated TypeScript types file (`src/lib/supabase/database.types.ts`) reflects the schema and is imported by the client factories so queries are fully typed. No `any` and no non-null `!` used to satisfy the compiler (per CLAUDE.md).
- [ ] **AC-15:** `npm run test` passes, including new tests for the env-config module (missing-var throws), the cents/money helper, and seed-data invariants (counts, price ranges, referential integrity). `npm run lint` and `tsc --noEmit` (via `next build` typecheck) pass with zero errors.
- [ ] **AC-16:** `next.config.ts` `images.remotePatterns` allows the Supabase Storage hostname so seeded product image URLs render via `next/image` in later tasks.
- [ ] **AC-17:** All placeholder/config values (shipping amounts, currency, image bucket name, seed image base URL) are centralized in named constants with documented units and a short "how to swap real values" note in `tasks/dev-done.md`.

## Edge Cases

At least five that MUST be handled:

1. **Missing/blank env var at boot** — `src/lib/env.ts` throws a clear, named error (`Missing required env var SUPABASE_SECRET_KEY`) instead of a downstream cryptic "fetch failed"/undefined error.
2. **Secret key leakage** — any attempt to import the service/secret client into a client component must fail the build. Guard the module with `import "server-only"` so a `"use client"` import errors at compile time rather than shipping the key.
3. **Re-running migrations or seed** — migrations use `if not exists` / are ordered and idempotent; seed uses upsert on stable natural keys (slug/SKU) so a second `npm run db:seed` is a no-op, not a duplicate-key crash or duplicate rows.
4. **Nested category integrity** — a category's `parent_id` must reference an existing category and must not allow a self-cycle (a category cannot be its own ancestor); deleting a parent with children must be handled (restrict or reparent, not orphan). Root categories have `parent_id = null`.
5. **Variant price override precedence** — a variant with `price_override = null` inherits the product base price; a variant with a value overrides it. Seed data must include at least one variant of each kind so downstream price-display logic (T4) has both cases to render.
6. **Money as float** — prices must never be stored/computed as floating point. Store integer cents everywhere; a `formatMXN(cents)` helper is the only place cents→display conversion happens. (Prevents MX$4999.999999 rounding bugs at checkout in T7.)
7. **Product with zero variants vs. many** — schema and seed must support a product sold with no color variants (single default) and one with several; stock lives on the product AND per-variant, with a documented rule for which is authoritative when variants exist.
8. **Order references a later-deleted/edited product** — because `order_items` snapshot name/SKU/price, an admin editing or archiving a product (T11) must not mutate historical order line items. FK to product is nullable/`on delete set null`, snapshot columns are the source of truth for order history.

## Error States Table

(This is a backend task; "User Sees" is the developer/operator experience since there is no shopper UI yet.)

| Trigger | User Sees | System Does |
| --- | --- | --- |
| Required Supabase env var missing at startup | Build/boot fails with `Missing required env var: <NAME>` | `env.ts` throws before any client is constructed; no partial init |
| `SUPABASE_SECRET_KEY` imported from a client component | `next build` fails with a `server-only` import error | `import "server-only"` in the admin-client module halts the build |
| `npm run db:seed` run twice | Console logs "upserted N rows (0 new)"; exits 0 | Upsert on natural keys; no duplicate rows, no unique-violation crash |
| Seed run with a missing/invalid `SUPABASE_SECRET_KEY` | Clear "Cannot seed: secret key invalid/missing" message, exit 1 | Script validates env via `env.ts` before connecting; fails fast |
| Anon client queries `cost_price` or another customer's order | Empty result / permission denied for restricted columns/rows | RLS policy denies; column excluded from public-safe views/selects |
| Migration references a table out of order | Migration runner errors with the offending statement | Migrations are numbered/ordered; FKs declared after referenced tables |
| Category `parent_id` points to a nonexistent category | Insert rejected with FK violation | Self-referential FK constraint enforces integrity |

## UX Requirements

Not applicable as shopper-facing UI — this is a backend/data task with no rendered surface (see Feature Type). The equivalent "developer UX" requirements:

- **Seed script output:** prints a readable per-table summary (`brands: 5, categories: 6, products: 30, variants: 41, ...`) and a final ✓/✗ status; nonzero exit on failure.
- **Types ergonomics:** importing `Database` types gives autocomplete on table rows in client/server factories; a `Tables<'products'>` helper type is exported for downstream tasks.
- **Config discoverability:** a single documented location (`src/lib/config.ts` or similar) holds shipping/currency/bucket constants with unit-suffixed names (`SHIPPING_FLAT_RATE_CENTS`).
- **Mobile/Tablet/Loading/Empty/Success states:** N/A (no UI this task).

## Technical Approach

### Files to Create

- `src/lib/env.ts` — validated env accessor; throws on missing required vars; single source of truth for Supabase creds.
- `src/lib/config.ts` — centralized non-secret constants: `CURRENCY = "MXN"`, `SHIPPING_FLAT_RATE_CENTS`, `FREE_SHIPPING_THRESHOLD_CENTS` (seed defaults; real values live in `store_settings` and are admin-editable in T10), `SUPABASE_STORAGE_BUCKET`, seed image base URL. Documented with units + swap instructions.
- `src/lib/money.ts` — `formatMXN(cents)` + cents helpers; the only cents→display boundary.
- `src/lib/supabase/client.ts` — browser client factory (`createBrowserClient` from `@supabase/ssr`).
- `src/lib/supabase/server.ts` — server client factory (`createServerClient` + Next 16 `cookies()`).
- `src/lib/supabase/admin.ts` — secret-key service client; `import "server-only"` guard.
- `src/lib/supabase/database.types.ts` — generated types (via `supabase gen types typescript`).
- `supabase/migrations/0001_extensions_and_enums.sql` — pgcrypto/uuid, status enums.
- `supabase/migrations/0002_catalog.sql` — brands, categories (self-ref), styles, tags, products, product_categories, product_tags, product_variants, product_images.
- `supabase/migrations/0003_commerce.sql` — customers, orders, order_items, order_status_history, discount_codes, store_settings.
- `supabase/migrations/0004_content_qa.sql` — product_questions, static_pages, i18n translations structure.
- `supabase/migrations/0005_rls_policies.sql` — enable RLS + all policies.
- `supabase/config.toml` — Supabase CLI project config (if local CLI workflow adopted).
- `scripts/seed.ts` — idempotent seed script (uses admin client).
- `scripts/seed-data/*.ts` — brand/category/style/tag/product/variant fixtures.
- Tests: `src/lib/env.test.ts`, `src/lib/money.test.ts`, `scripts/seed.test.ts` (or a seed-invariants test).

### Files to Modify

- `package.json` — add `@supabase/supabase-js`, `@supabase/ssr`, `server-only`, dev-dep `supabase` (CLI) + `tsx`/`dotenv` for the seed script; add scripts `db:seed`, `db:reset`, `db:types`.
- `next.config.ts` — add `images.remotePatterns` for the Supabase Storage host.
- `.env.local` — (already present) confirm all three keys; add any new keys as documented placeholders. Do NOT commit (gitignored).
- `tasks/dev-done.md` — document config, migration/seed/type-gen workflow, and the "swap real values" note.

### Data Model Changes

All new (see AC-5). Key relationships:

- `categories.parent_id → categories.id` (nestable).
- `product_categories(product_id, category_id)` and `product_tags(product_id, tag_id)` — M2M joins.
- `product_variants.product_id → products.id`; `product_images.product_id/variant_id`.
- `orders.customer_id → customers.id`; `order_items.order_id → orders.id` with snapshot columns; `order_status_history.order_id → orders.id`.
- Money stored as integer **cents**; `status` columns use Postgres enums.

### API Endpoints

None this task. Data access is via typed Supabase client factories (server/browser/admin) that later tasks call from Server Components / Route Handlers.

### Dependencies

- `@supabase/supabase-js` — core client, latest v2.
- `@supabase/ssr` — App Router cookie-based auth/session wiring (replaces deprecated `auth-helpers`), latest.
- `server-only` — build-time guard preventing secret client from entering the client bundle.
- `supabase` (dev) — CLI for migrations + type generation.
- `tsx` (dev) — run the TypeScript seed script; `dotenv` if needed to load `.env.local` in the script.
- Note: repo uses `legacy-peer-deps=true` (React 19) — install with that respected.

## Out of Scope

- Any shopper or admin **UI** (that is T2+ and T10+).
- Discount-code **validation logic or management UI** (Phase 2 — table only here).
- Customer-account **auth** / login / order-history (Phase 2 — guest `customers` records only).
- Rich-text / page-content **editing UI** (Phase 2 — static-page content stored as data only).
- Runtime **i18n language toggle** (T2 — this task only defines the content/translation structure).
- Mercado Pago integration, webhooks, payment capture (T8 — order columns exist but stay nullable).
- Email sending (T9).
- CFDI invoicing logic (Phase 3 — only the optional RFC + amount/tax columns exist for future-proofing).
- Search indexing / full-text config beyond basic columns (tuned in T5).
