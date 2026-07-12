# Architecture Review: T1 — Data Foundation (Supabase + Full Schema)

## Summary

This is an unusually well-architected data foundation. The relational model is
correct, normalized where it should be and deliberately denormalized (order/line
snapshots) where history integrity demands it; the three-client factory pattern
is clean and the secret-key trust boundary is airtight; money-as-cents is
enforced end-to-end at the DB (integer columns + CHECKs) and the app (single
`formatMXN` boundary). The schema cleanly supports T2–T14 with one genuine
architectural gap that must be owned before T7: **there is no race-safe stock
reservation primitive** — the model has the columns but not the mechanism, and
this is exactly the class of decision that is cheap now and expensive after
checkout is built. Verdict: **sound**, with T7-scoped recommendations.

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns | ✅ | `config` (constants), `money` (compute/format), `env` (validated secrets), `supabase/{client,server,admin}` (transport) are each single-purpose leaf modules. No business logic in transport layers. |
| Boundary validation | ✅ | `env.ts` validates + throws `MissingEnvVarError` on missing/blank; `money.ts` throws `TypeError` on non-integer cents; DB CHECKs validate every money/dimension column and the anon INSERT policy validates Q&A shape. |
| Typed contracts | ✅ | `Database` type imported by all three factories; `Tables`/`TablesInsert`/`TablesUpdate`/`Views` helpers exported for downstream tasks. `db:types` script keeps it regenerable (documented anti-drift note in the header). |
| Service layer | ✅ (N/A now) | No services this task by design; the factory trio is the correct seam. Data-access flow (SC → server client → RLS; writes → admin client) is documented in the research report and matches the RLS model. |
| Type safety | ✅ | `tsc --noEmit` clean; no `any`, no `!`. The one `as never` in `seed.ts:81` is the documented, standard Supabase typed-`upsert` workaround at a uniform runtime call — justified and isolated. |
| Money-as-cents boundary | ✅ | Integer cents in every column; `CENTS_PER_PESO` named constant; `_CENTS` suffix convention; `formatMXN` is the only cents→display point. Enforced, not aspirational. |
| Config centralization | ✅ | All non-secret tunables in `config.ts` with unit-suffixed names + "how to swap" doc (AC-17); secrets only via `env.ts`. Correctly distinguishes seed-default constants from the runtime `store_settings` source of truth. |
| Secret isolation | ✅ | `admin.ts` is `import "server-only"`; secret only reachable via `getServerEnv()`; never `NEXT_PUBLIC_`-prefixed. |
| shadcn patterns | N/A | Backend-only task, no UI surface. |

## Data Model Review

**Normalization & relationships — correct.** Catalog is properly normalized:
brands/styles as dimension tables (`on delete set null` on products — losing a
brand doesn't destroy products), M2M joins for categories/tags with composite
PKs and the reverse-side index (`product_categories_category_id_idx`,
`product_tags_tag_id_idx`) needed for "products in category X" queries. Nestable
categories use a self-FK with `on delete restrict` (no orphaning) plus a
`no_self_parent` CHECK **and** an ancestor-walk trigger with a depth guard for
deep cycles — this is the rare implementation that handles the A→B→C→A case, not
just the trivial one.

**Order immutability — exemplary.** `orders`/`order_items` snapshot
name/SKU/price/quantity at purchase, FK to product is `on delete set null`, and
the immutability is enforced by triggers (`orders_block_snapshot_update`,
`order_items_block_update`) that even bind the RLS-bypassing secret client. The
Stage-7 fix (Q-1) — allowing the FK-nulling cascade while still blocking snapshot
mutation and FK repointing — is subtle and correct; it's the difference between
"a product can never be deleted once ordered" (a T11/T12 foot-gun) and a clean
history model. Cross-column CHECKs (`total_identity`, `discount ≤ subtotal`,
`line_total = unit_price * quantity`) make the financial record self-consistent
at the DB level, which will backstop calculation bugs in T7.

**CFDI / MP forward-compat — right call.** `rfc`, `tax_base_cents`, `tax_cents`
and the `mp_*` reference columns exist and are nullable now. This is the correct
"columns without behavior" approach for Phase-3/T8 readiness — no schema rework
later.

**i18n structure — reasonable, with a known trade-off.** The polymorphic
`translations(locale, entity_type, entity_id, field)` table with a unique
constraint is a defensible generic design that avoids per-column translation
sprawl. The trade-off is deliberately accepted and logged: no FK (orphan rows on
base-row delete — backlog item) and per-locale reads require a join keyed on
`(entity_type, entity_id)` (indexed). Acceptable for T2; see risk table for the
read-pattern note.

**Indexes vs. query patterns — well-anticipated.** `products.status`,
`brand_id`, `style_id`, `is_best_seller`, `is_featured` all indexed;
`orders.status`/`created_at`/`customer_id` indexed; all FK/join reverse sides
indexed; unique on slug/SKU. This directly serves T3/T5 filter+sort and T12 order
lists. Gaps are noted below (composite/price/text-search indexes are correctly
deferred to T5 where the real query shapes are known).

## API Review

No HTTP endpoints this task (data access via typed factories). Two forward-looking
API-shape observations:

- **PostgREST read path is view-fronted.** The public catalog is read through
  `products_public` (a view that structurally omits `cost_price_cents` and bakes
  in `status = 'active'`). This is the right column-protection pattern, but note
  for T3/T4: PostgREST cannot embed related rows through a view the same way it
  can through a base table. Catalog reads that want variants/images/brand in one
  round-trip will either query the base-table policies (which exist and are
  correct) or issue separate queries. This is a T3/T5 query-design decision, not
  a T1 defect — flagged so it isn't discovered mid-T3.
- **Pagination readiness — present.** `orders.created_at` and product ordering
  columns are indexed; keyset/range pagination is feasible. No list surface exists
  yet, so nothing to enforce here.

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| No race-safe stock reservation primitive (columns only, no mechanism) | **High** | T7 must add a `SELECT ... FOR UPDATE` decrement or an atomic RPC (`reserve_stock(items[])`) with a `stock >= qty` guard, inside the order-creation transaction. Do NOT implement read-then-write in app code. See Tech Debt. |
| `is_active_product()` SECURITY DEFINER called per-row in child-table RLS (variants/images/joins) | Med | Correct for correctness/security. At 30 products it's free; at catalog scale the per-row subquery on large image/variant scans could add up. Re-measure in T5; if hot, consider a denormalized `is_active` flag on child tables maintained by trigger, or route heavy catalog reads through purpose-built views. Do not pre-optimize now. |
| `translations` read requires join on polymorphic key for every localized field | Med | T2 i18n runtime should batch-fetch translations per page/entity-set, not per-field. The `(entity_type, entity_id)` index supports this. Flag in T2 so it isn't N+1-per-field. |
| Best-selling sort backed by `sales_count` column, not live aggregate over `order_items` | Low (good) | Correct denormalization for T5 sort performance. Ensure T7/T12 increment `sales_count` on paid/fulfilled (define authoritative write point — see risk by task). |
| No full-text / trigram index for keyword search | Low | Correctly deferred to T5 per ticket scope. Add `pg_trgm` or `tsvector` there against the real search shape. |
| No composite index for common filter combos (e.g. status+brand+price) | Low | Defer to T5. Single-column indexes suffice at seed scale; composite/covering indexes should be driven by T5's actual filter query plans. |

## Risks & Recommendations by Future Task

- **T3 (Catalog):** View-vs-base-table embedding decision (above). Recommend
  standardizing catalog reads on the base-table anon policies for
  relationship embedding, reserving `products_public` for flat product lists —
  or add sibling views. **Absorb in T3.**
- **T4 (PDP / variants):** Stock authority is documented (per-variant
  authoritative, product-level fallback) but not enforced by a view or generated
  column, so a consumer can read the wrong column. Ship the `effective_stock`
  read path here. **Absorb in T4** (already backlogged, m-2).
- **T5 (Search/filter/sort):** Add text-search + composite/price indexes driven
  by real query plans. Confirm `sales_count`-backed best-selling sort. **Absorb
  in T5.**
- **T7 (Checkout) — highest risk:** Implement race-safe stock reservation as a DB
  transaction/RPC (see Tech Debt). Add Mexican state/postal validation
  (backlogged n-1). Add app-layer rate limiting on the anon Q&A INSERT before the
  form ships (backlogged M-6). **Absorb in T7.**
- **T8 (Payments):** Webhook idempotency has **no dedicated support column/table
  yet**. `mp_payment_id` exists but there is no unique-constraint-backed
  idempotency key or processed-events ledger to make webhook handling safe
  against duplicate deliveries. Recommend adding a `mp_webhook_events` table (or a
  unique constraint on a processed-event id) in T8. `payment_status` enum
  correctly includes `refunded`. **Absorb in T8.**
- **T12 (Admin orders):** Define the authoritative write point for `sales_count`
  increment and for stock **restore** on cancel (the ticket calls for automatic
  stock restore). Immutability triggers correctly permit status transitions, so
  the pipeline is unblocked. Ensure cancel-restore is transactional with the
  status change. **Absorb in T12.**

## Tech Debt Ledger

| Item | Type | Impact | Effort to Fix |
|------|------|--------|---------------|
| No stock-reservation primitive (race-safe decrement) | Deferred (design boundary) | High — oversell risk is the whole point of T7 | M (RPC + tx in T7) |
| No webhook idempotency ledger/constraint for MP | Not-yet-introduced | High — duplicate webhook = double-advance/refund | S–M (T8) |
| `effective_stock` authority not enforced (doc-only) | Deferred (m-2) | Med — consumer may read wrong stock column | S (view in T4) |
| `translations` polymorphic, no FK → orphan rows | Deferred (n-4) | Low — data hygiene | S (cleanup job / delete hook, T2+) |
| Q&A anon INSERT has no app-layer rate limit | Deferred (M-6) | Med — abuse surface once form ships | S (T7/form ticket) |
| MX state/postal are free text | Deferred (n-1) | Low–Med — data quality at checkout | S (T7 form) |
| Migrations/seed proven only on local Docker Supabase, not the managed remote | Introduced (env constraint) | Low — identical DDL/seed, but unverified on target | S (one `db push` + `db:seed` when token available) |
| `sales_count` / stock-restore write points undefined | Not-yet-introduced | Med — correctness of best-seller sort + inventory | S (define in T7/T12) |

Net assessment: **this task reduced future tech debt more than it introduced.**
The immutability triggers, cross-column CHECKs, explicit privilege baseline, and
cycle trigger are all debt that would otherwise have surfaced painfully in
T7/T11/T12. The one genuinely open architectural hole (stock reservation) is
correctly out of T1 scope but must be owned explicitly by T7 — not rediscovered.

## Refactors Applied

None. This stage is review-only per orchestration constraints (Stage 9 Security
is concurrently editing `supabase/`, `src/`, `scripts/`). All findings are
advisory and routed to the future task that should absorb each. No code was
modified. Backlog already captures m-2, n-1, n-4, M-6; the two **new** forward
risks worth adding to the backlog are the **T7 stock-reservation primitive** and
the **T8 webhook-idempotency ledger** (see recommendation to append below).

## Architecture Score: 9/10

Will this make sense to a new developer in 6 months with 2x the team? Yes. The
schema is self-documenting (extensive intent comments explaining *why*, not just
*what*), the trust model is written out at the top of `0005`, the money and
config conventions are stated once and enforced structurally, and the type
workflow is regenerable rather than hand-drifting. The one point off is not for
anything built — it's for the two unaddressed forward-looking primitives (stock
reservation for T7, webhook idempotency for T8) that are the schema's job to make
*possible* and which, while legitimately out of T1's build scope, deserved an
explicit "here is the intended mechanism" note in `dev-done.md` rather than only
surfacing under review. Everything actually implemented is at or above the bar.

## Recommendation: APPROVE

The T1 data foundation is architecturally sound and a strong base for all of
T2–T14. Approve as-is. Carry two explicit forward-obligations into the plan so
they are designed, not discovered:

1. **T7 must build a race-safe stock-reservation RPC/transaction** (not app-level
   read-then-write) using the `stock` columns provided.
2. **T8 must add a webhook-idempotency mechanism** (processed-events ledger or a
   unique constraint) before handling Mercado Pago callbacks.

Recommend appending both to `tasks/clean-code-backlog.md` so they survive context
resets.
