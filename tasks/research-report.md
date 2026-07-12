# Research Report: T1 — Data Foundation (Supabase + Full Schema)

## Codebase Analysis

### Existing Patterns

- **`cn()` utility** — `src/lib/utils.ts:4`. `clsx` + `tailwind-merge`. Only shared helper today. New utils (`money.ts`, `env.ts`) should live alongside it under `src/lib/` and follow the same single-purpose, exported-function style.
- **Path alias `@/*` → `src/*`** — `tsconfig.json:22` and `vitest.config.ts` `resolve.alias`. All new modules must import via `@/lib/...`. The alias is wired for both build and test, so tests can import `@/lib/env` directly.
- **Test convention** — colocated `*.test.ts(x)` next to source (`src/lib/utils.test.ts`), vitest globals on, jsdom env (`vitest.config.ts`). Include glob is `src/**/*.test.{ts,tsx}` — a seed test placed under `scripts/` would be **excluded** unless the include glob is widened or the test is placed under `src/`. Recommendation: put seed-invariant tests under `src/lib/` importing the seed fixtures, or extend `vitest.config.ts` include.
- **shadcn / component conventions** — `components.json` (`style: radix-mira`, `baseColor: neutral`, `rsc: true`, `iconLibrary: hugeicons`). Not exercised this task (no UI) but confirms neutral design tokens + RSC-first, matching PRODUCT_SPEC "neutral design system now."
- **RSC-first** — `components.json` `rsc:true`, CLAUDE.md "Server components default." The server Supabase client must be built for Server Components / Route Handlers; browser client only where `"use client"` is genuinely needed (later tasks).
- **Env-var convention** — `.gitignore` ignores `.env*`; CLAUDE.md: no secret prefixed `NEXT_PUBLIC_`. Confirmed by the existing `.env.local`.

### Relevant Files

| File | Purpose | Relevance | Action |
| --- | --- | --- | --- |
| `.env.local` | Holds the 3 Supabase keys (already present, gitignored) | Source of creds; note **new-format** keys | Reference / confirm |
| `package.json` | Deps + scripts | Add Supabase libs, `server-only`, CLI, `tsx`; add `db:*` scripts | Modify |
| `next.config.ts` | Next config (currently empty) | Add `images.remotePatterns` for Storage host | Modify |
| `tsconfig.json` | `@/*` alias, strict | Governs typing rules for new code | Reference |
| `vitest.config.ts` | Test include `src/**/*.test.*` | May need include widened for seed tests | Reference / maybe modify |
| `src/lib/utils.ts` | `cn()` | Pattern for new `src/lib` utils | Reference |
| `src/lib/utils.test.ts` | Test style | Template for env/money tests | Reference |
| `src/app/layout.tsx` | Root layout (still CNA defaults: `lang="en"`, "Create Next App" title) | Not this task, but confirms nothing consumes data yet | Reference |
| `.npmrc` | `legacy-peer-deps=true` | Install must respect it (React 19 peer conflicts) | Reference |

### Data Flow

There is **no data flow today** — this task establishes it. Target flow the schema must support (built out in later tasks):

1. **Catalog read (T3/T4):** Server Component → `createServerClient()` (anon/publishable key) → `select` on `products` + joins → RLS allows only `active` rows and public-safe columns (no `cost_price`) → typed rows render.
2. **Question submit (T4):** `"use client"` form → server action / route handler → RLS allows anon `INSERT` into `product_questions` (unanswered, unpublished) → owner answers later via admin (secret client).
3. **Order create (T7):** Route handler (server) → **admin/secret client** (bypasses RLS) → insert `customers` (guest) + `orders` + `order_items` snapshot + initial `order_status_history` row inside a transaction/RPC → confirmation.
4. **Admin (T10–T12):** authenticated admin server context → secret client → full CRUD, bypassing RLS.

Money moves as **integer cents** end-to-end; only `formatMXN(cents)` converts to display.

### Similar Features (Reference Implementations)

None in-repo — this is greenfield. External reference patterns to follow (see External Research): official `@supabase/ssr` Next.js App Router client setup, and the Supabase CLI migration + `gen types` workflow.

## Dependency Analysis

### Existing Dependencies to Leverage

- `clsx` + `tailwind-merge` (via `cn`) — unrelated to data but confirms the util style.
- `vitest` 4.x + `@testing-library` — for env/money/seed-invariant unit tests.
- `@playwright/test` — not used this task (no UI to drive).
- TypeScript 5 strict — enforces the "no `any`/no `!`" rule on generated types + factories.

### New Dependencies Needed

- **`@supabase/supabase-js`** — core client. Recommended: latest v2.x. Alternatives: raw `postgres`/Drizzle (rejected — loses Supabase Storage/RLS/type-gen integration the spec relies on).
- **`@supabase/ssr`** — canonical App Router integration (cookie-based). Recommended: latest. Alternatives: deprecated `@supabase/auth-helpers-nextjs` (do NOT use — superseded).
- **`server-only`** — build-time guard for the secret client. Tiny, official Next package.
- **`supabase`** (devDep) — CLI for `migration`, `db push`, `gen types`. Alternative: hand-run SQL in the dashboard (rejected — not repeatable/reviewable).
- **`tsx`** (devDep) — execute the TS seed script. Alternative: compile-then-node (more friction).
- **`dotenv`** (devDep, maybe) — load `.env.local` into the standalone seed script (Next auto-loads it for app code but not for a bare `tsx` script). Confirm whether `tsx` + Next's env loading suffices; otherwise add.

### Internal Dependencies

- `env.ts` is depended on by all three Supabase client factories and the seed script — build it first.
- `config.ts` (constants) + `money.ts` are leaf modules; downstream tasks (cart T6, checkout T7, settings T10) depend on them, so name/units must be right now.
- `database.types.ts` is generated from the migrations — it depends on migrations being applied; regenerate whenever schema changes.

## External Research

### API / Library Documentation

- **`@supabase/ssr` (App Router):** create three clients — `createBrowserClient(url, key)` for client components; `createServerClient(url, key, { cookies: { getAll, setAll } })` wired to Next 16 `cookies()` for Server Components/Route Handlers; a plain `createClient(url, secretKey, { auth: { persistSession: false } })` for the admin/service path. Gotcha: in Next 16 `cookies()` is async — the server factory must `await cookies()`. Gotcha: `setAll` from a Server Component throws unless caught (middleware/route-handler is the write context) — wrap in try/catch per the official pattern.
- **New Supabase key format:** the project uses `sb_publishable_…` / `sb_secret_…` (the newer API-key scheme) rather than legacy `anon`/`service_role` JWTs. Functionally: publishable key = client-safe (RLS-enforced), secret key = server-only (RLS-bypassing). Client factories must be written to accept these key strings directly — no assumption of a JWT.
- **Supabase CLI type gen:** `supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts` (or `--local`). Requires either linking the remote project or running local. Store as `db:types` script.
- **Supabase Storage + `next/image`:** product images served from `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/…`. Must whitelist that host in `next.config.ts` `images.remotePatterns` (AC-16). For seed data, either upload placeholder images to a bucket or use a stable public placeholder URL centralized in `config.ts`.
- **RLS for guest checkout + single owner:** the clean model — public role gets narrow `SELECT`/`INSERT` grants via policies; there are **no per-customer JWT identities** in Phase 1 (guests aren't authenticated), so orders/customers are **not** publicly readable at all — they are created and read exclusively through the secret-key server client. This avoids the "how does a guest read their own order" problem (deferred: tokenized order-tracking is Phase 2). Rate-limiting on the public question-insert is a T4/hardening concern, noted not built here.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Secret key leaks into client bundle | Med | High | `import "server-only"` in `admin.ts`; env module never exposes secret to browser factory; add a test/grep check |
| RLS too permissive (exposes `cost_price`, orders, discount codes) | Med | High | Default-deny; explicit narrow SELECT policies on catalog only; keep orders/customers/discounts server-only; Stage 9 (Security) verifies each table's policies |
| RLS too restrictive (breaks legit anon catalog reads) | Med | Med | QA writes a policy test: anon client can read active products but not `cost_price`/draft/orders |
| Money stored as float → rounding errors at checkout | Low | High | Integer cents everywhere; `money.ts` is the only conversion boundary; test rounding |
| Seed not idempotent → duplicates on re-run | Med | Med | Upsert on natural keys (slug/SKU); seed test asserts stable counts across two runs |
| New-format keys behave unexpectedly with `@supabase/ssr` | Low | Med | Smoke-test a real query in the seed script before relying on it; document key format in dev-done |
| Next 16 async `cookies()` / `setAll` misuse | Med | Med | Follow official `@supabase/ssr` App Router snippet exactly; try/catch `setAll` |
| Category self-reference cycles / orphans | Low | Med | Self-FK + `on delete restrict`; seed only well-formed trees; document delete rule |
| Seed test excluded by vitest include glob | Med | Low | Place invariant tests under `src/` or widen `vitest.config.ts` include |

### Performance Considerations

- Add indexes now: `products.slug` (unique), `products.status`, FK columns (`brand_id`, join tables), `orders.order_number` (unique), `product_variants.product_id`. Cheap to add in the migration, expensive to retrofit once T3/T5 query patterns exist.
- Best-selling sort (T5) needs a sales-count column or aggregate — add a `sales_count`/`best_seller` field to `products` now (AC-6) rather than computing across `order_items` live.

### Security Considerations

- **Secret key** is the crown jewel — server-only module + `server-only` import + never `NEXT_PUBLIC_`. Confirmed `.env*` gitignored.
- **RLS default-deny** on all 18 tables; public gets only what the storefront must show.
- **`cost_price`** must never be selectable by the public role — exclude via policy/column-level strategy (or serve catalog through a view that omits it). Flag for Stage 9.
- **Discount codes** are readable only server-side (validation happens server-side in T7); no anon SELECT.
- **PII** (guest customer name/email/address in `customers`/`orders`) is server-only access — never anon-readable.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Install deps + add `db:*` scripts** — unblocks everything; respect `legacy-peer-deps`.
2. **`env.ts` + `config.ts` + `money.ts` (+ tests)** — leaf modules everything depends on; TDD the env-throws and money-format behavior.
3. **Migrations 0001→0004 (schema)** — extensions/enums → catalog → commerce → content/qa; declare FKs after referenced tables; add indexes.
4. **Migration 0005 (RLS)** — enable + policies last, once tables exist.
5. **Generate `database.types.ts`** — after migrations apply.
6. **Supabase client factories** (`client`/`server`/`admin`) — typed against generated types.
7. **Seed script + fixtures (+ invariant test)** — idempotent upserts; realistic MXN data; store-settings row.
8. **`next.config.ts` image host + `dev-done.md` docs** — including the "swap real values" note (AC-17).

### Key Decisions

- **Migrations via Supabase CLI over dashboard SQL** — repeatable, reviewable, versioned in `supabase/migrations/`.
- **`@supabase/ssr` over `auth-helpers`** — the latter is deprecated for App Router.
- **Integer cents over decimals/floats** — recommended; the only safe money representation; document the convention prominently.
- **Guest orders are server-only (no anon RLS read)** — recommended; matches Phase-1 "no accounts" and defers tokenized tracking to Phase 2 cleanly.
- **Generated types committed to the repo** — recommended so downstream tasks get types without a live DB, with a `db:types` script to regenerate.
- **Seed image strategy** — recommend a single centralized placeholder base URL in `config.ts` (or a seeded Storage bucket) so real photos swap in trivially per BUILD_PLAN rule 4.

### Anti-Patterns to Avoid

- Don't put the secret key in any `NEXT_PUBLIC_` var or import it into a client component — instead isolate it in a `server-only` admin module.
- Don't store money as `numeric`/float and format ad-hoc — instead store integer cents and convert only in `money.ts`.
- Don't hardcode shipping MX$500 / MX$10,000 in code as the runtime source of truth — instead seed them into `store_settings` (admin-editable in T10); constants in `config.ts` are only seed defaults.
- Don't hand-write `database.types.ts` — generate it, or it drifts from the schema.
- Don't build Phase-2 surface (discount validation, account auth, page-editing UI) even though the tables exist — BUILD_PLAN rule 2.
- Don't rely on `orders`/`order_items` FKs alone for history — snapshot name/SKU/price so product edits don't rewrite past orders.
- Don't leave RLS disabled "to unblock" — default-deny from the first migration; it is the entire security posture for a public-key client.
