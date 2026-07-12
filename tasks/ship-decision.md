# Ship Decision: T1 — Data Foundation (Supabase + Full Database Schema)

## Verdict: SHIP

## Confidence: HIGH

## Quality Score: 9/10

## Test Results

All suites run fresh by the verifier from a clean state (unit locally; integration
against a live local Supabase / Docker with `db reset` applying migrations 0001–0006
+ seed, then `supabase stop`).

| Suite | Total | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit / Component (Vitest — `npm run test`) | 69 | 69 | 0 | 0 |
| Integration (live DB — `npm run test:integration`) | 64 | 64 | 0 | 0 |
| E2E (Playwright) | 0 (N/A — backend-only task, no UI) | — | — | — |
| **Total** | **133** | **133** | **0** | **0** |

Gate commands (all green, re-run by the verifier):

| Gate | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` | exit 0, 0 errors |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Unit | `npm run test` | 8 files / 69 passed |
| Integration | `npm run test:integration` | 6 files / 64 passed (fresh reset → migrations 0001–0006 → seed → tests) |
| Build | `npm run build` | Compiled successfully; TypeScript check passed |

Seed summary from the live reset (matches ticket expectation): brands 5, categories 6,
styles 6, tags 8, products 30, variants 69, product_images 99, static_pages 4,
store_settings 1 — "✓ Seed complete (idempotent — safe to re-run)."

## Acceptance Criteria Final Check

| # | Criterion | Code | Test | Verdict |
|---|-----------|------|------|---------|
| AC-1 | Supabase libs in deps | `package.json` (`@supabase/supabase-js`, `@supabase/ssr`) | build/import resolve | ✅ |
| AC-2 | Typed env module, throws on missing, single source | `src/lib/env.ts` | `src/lib/env.test.ts` | ✅ |
| AC-3 | Browser client publishable key only | `src/lib/supabase/client.ts` | `client.test.ts` | ✅ |
| AC-4 | Server client `createServerClient`+`cookies()`; admin `server-only`+secret | `server.ts`, `admin.ts:10 import "server-only"` | `server.test.ts`, `client.test.ts` | ✅ |
| AC-5 | All 18 tables + self-ref categories + i18n | migrations 0002/0003/0004; 18 tables enumerated | integration reset applies clean | ✅ |
| AC-6 | Full product model incl. `cost_price_cents` | `0002_catalog.sql:128` | `rls-matrix` / seed invariants | ✅ |
| AC-7 | Variant SKU/stock/override/color + variant images | `0002`; seed writes 69 variant-linked images | `seed.integration` | ✅ |
| AC-8 | Orders immutable financial snapshot + status enum + currency/identity CHECKs | `0003:55,73,74` + `orders_block_snapshot_update` | `constraints.integration` | ✅ |
| AC-9 | order_items snapshot survives product delete | `0003:102` + `order_items_block_update` (permits FK-null cascade) | `visibility.integration` | ✅ |
| AC-10 | order_status_history from/to/note/timestamp | `0003` | `constraints.integration` | ✅ |
| AC-11 | store_settings single row, 50000/1000000 cents, integer money | seed `SHIPPING_FLAT_RATE_CENTS`/`FREE_SHIPPING_THRESHOLD_CENTS`; `0006` singleton | `config.test.ts`, `seed.integration` | ✅ |
| AC-12 | RLS on every table; anon denied cost_price/orders/customers/discounts | `0005` REVOKE ALL baseline + narrow grants + `products_public` view | `rls-matrix.integration` | ✅ |
| AC-13 | Idempotent seed, correct counts, nested cat, variant images | `scripts/seed.ts` upserts on natural keys | `seed.integration` (re-run, counts unchanged) | ✅ |
| AC-14 | Generated types imported, no `any`/`!` | `database.types.ts`; grep = 0 `any`/`!`/TODO in new code | `tsc --noEmit` exit 0 | ✅ |
| AC-15 | test + lint + tsc pass incl. new tests | — | all green (verifier re-ran) | ✅ |
| AC-16 | next.config remotePatterns for Storage host | `next.config.ts` | `build` succeeds | ✅ |
| AC-17 | Centralized constants + units + swap note | `src/lib/config.ts` (unit-suffixed, documented) | `config.test.ts` | ✅ |

All 8 edge cases verified present in code + covered by tests (env throw, `server-only`
guard, seed idempotency, category acyclicity trigger, variant override precedence,
integer-cents money guard, zero-vs-many variants, order snapshot survives delete).

## Report Summary

| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review | 6.5 → APPROVE | 3 critical / 6 major all FIXED and verified live (cost_price leak, grant baseline, immutability, financial CHECKs); minors/nits fixed or backlogged with rationale |
| QA | HIGH | 74 new tests; found & fixed Q-1 (immutability trigger blocked ON DELETE SET NULL cascade — edge case 8); 100% AC + edge coverage |
| UX | N/A | Backend-only task, no UI surface (per Feature Type) |
| Security | SECURE / SHIP | 0 critical, 0 high, 0 secrets; anon attack matrix verified live — cost_price/PII/orders/discounts all denied; residual is app-layer Q&A rate-limit (no form in T1) |
| Architecture | 9/10 APPROVE | Model sound, immutability exemplary; two forward-obligations (T7 stock-reservation RPC, T8 webhook idempotency) documented in backlog |
| Hacker | 2/10 chaos | 7 integrity gaps found & fixed in `0006` (slug/name/length/singleton/locale/window CHECKs) + 15 regression tests |

## Remaining Concerns

- **Migrations not applied to the managed remote Supabase project**: accepted context.
  Identical DDL/seed proven correct against local Docker; apply sequence documented in
  `dev-done.md` (link → `db:push` → `db:types` → `db:seed`). Severity: LOW — no code
  change needed, one operational step when a live token is available.
- **Q&A anon INSERT has no rate limit**: correctly deferred — the DB bounds length but
  cannot rate-limit; no public question form ships in T1. Tracked in
  `clean-code-backlog.md`. Severity: LOW for T1 (no exposed surface).
- **T7 stock-reservation primitive & T8 webhook-idempotency ledger**: forward
  architectural obligations, out of T1 scope, tracked in the backlog. Severity: N/A
  for this task; must be owned by the named future tasks.

None of these are ship-blockers: no failing test, no open critical/high vulnerability,
no unmet AC, no cross-user data-leak path (verified live), quality ≥ 8.

## What Was Built

A complete, typed, RLS-secured Postgres schema on Supabase for the PosturPro store:
18 tables (catalog, commerce, content, i18n) across six ordered/idempotent migrations,
a three-client factory pattern (browser publishable / server SSR / secret-key admin
with `server-only` guard), integer-cents money handling with a single format boundary,
and an idempotent seed producing ~30 chairs, 5 brands, 6 categories (1 nested), 6 styles,
color variants (inherited + overridden prices), variant images, and the store-settings
row (MX$500 flat / MX$10,000 free-ship). The guest-store trust model is enforced by an
explicit privilege baseline plus a `products_public` view that structurally hides
internal cost data.

## Summary

Every gate passes from a clean run, all 17 acceptance criteria and 8 edge cases are
verified in the actual code and backed by passing tests, the RLS trust model was
independently confirmed live (anon cannot reach cost_price, PII, orders, or discounts),
no secrets are committed, and scope is clean (no Phase-2 build-ahead). This is a strong,
production-ready data foundation. **SHIP.**
