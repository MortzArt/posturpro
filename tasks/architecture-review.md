# Architecture Review: T7 — Checkout & Order Creation

**Reviewer:** ultraarch (Stage 10) · **Mode:** report-only on source (no edits) ·
**Parallel with:** Stage 9 (Security)

## Summary

Staff-level quality. The checkout subsystem is cleanly layered (pure math ->
server reads -> server action -> single atomic RPC), the client/server trust
boundary has a genuine single choke point, and the write path fits
`0003_commerce.sql`'s immutable-order model almost perfectly. It is well-
positioned for T8/T9/T12. The remaining risks are forward-looking (T8 webhook
concurrency + missing MP-reference indexes), and there is only one trivial NOW
item worth doing while the subsystem has zero production data.

**Grade: A- (9/10). Recommendation: APPROVE** (subject to the standing T7
human-review gate — this review does not waive it).

---

## 1. Layering & Boundaries

**Verdict: Excellent. The strongest part of the change.**

The subsystem is layered with real discipline; each layer has one reason to
change:

| Layer | Modules | Concern | I/O? |
|-------|---------|---------|------|
| Pure math/rules | `address.ts`, `discount.ts`, `order.ts`, `checkout-helpers.ts` | Validation, eligibility, total assembly, cart->payload transforms | None (unit-tested) |
| Server reads | `checkout-read.ts` (`revalidateLines`, `fetchDiscountCode`), `order-read.ts` | Live re-read + per-line re-validation; confirmation read | Admin client, `server-only` |
| Orchestration | `actions.ts` (`placeOrder`) | Parse -> validate -> revalidate -> ship -> discount -> assemble -> RPC -> friendly status | Delegates all I/O |
| Atomicity | `0008_checkout.sql` `create_order` | The whole reserve-and-create transaction | DB |
| Contract | `checkout-form-state.ts`, `database.types.ts` | Serializable UI/RPC types | None |

Strengths:

- **Single trust choke point.** Every commerce read AND write for the boundary
  goes through `createAdminClient()` inside `server-only` modules; the client
  never sees anything but a serializable `CheckoutFormState`. The snapshot
  (price/qty) is display-only and provably ignored: `revalidateLines` re-derives
  the unit price from the live DB (`variant.price_override_cents ??
  product.price_cents`), clamps quantity via `sanitizeQuantity`, and validates
  every id against `UUID_PATTERN` before it touches the DB. Textbook.
- **The action is a thin orchestrator.** `placeOrder` decomposes into small named
  helpers (`runCheckout`, `resolveDiscount`, `createOrderViaRpc`,
  `mapThrownError`), each well under the 30-line target. No business math in the
  action; it delegates to the pure libs. Clean-code compliant.
- **Pure libs are genuinely pure** — `applyDiscount` injects `now` for
  determinism, `assembleOrder` re-clamps the discount defensively. These are the
  correct SRP seams and the ones T8/T12 will reuse.
- **RPC pattern follows house style.** `search_products`
  (`src/lib/catalog/search.ts`, `SECURITY INVOKER`) is the read-path precedent;
  `create_order` is its write-path analog (`SECURITY DEFINER`). The DEFINER vs
  INVOKER split is deliberate and correct — the write path must own the tables
  regardless of caller, the read path must respect RLS.

Minor layering nit (LATER): `actions.ts` maps RPC failures by
`message.includes("OUT_OF_STOCK:")` — a string-sniff boundary. It works and is
defensive (raw PG never echoed) but couples the action to the RPC raise text.
See TD-3.

---

## 2. Data Model Usage & Fit for the Immutable-Order Model

**Verdict: Very good. The order write fits `0003_commerce.sql` cleanly; the CHECK
constraints are a backstop, not the first line of defense.**

- `assembleOrder` is engineered to satisfy every DB identity CHECK
  (`orders_total_identity`, `orders_discount_within_subtotal`,
  `order_items_line_total_identity`) in integer cents; the constraints are the
  floor. Correct posture.
- The immutability trigger (`orders_block_snapshot_update`) freezes the
  financial/contact snapshot while leaving `status`, `payment_status`,
  `payment_method`, and the `mp_*` columns mutable — **exactly** the shape T8
  needs: the webhook can advance status/payment without fighting the trigger, and
  the money snapshot written today can never be silently rewritten later.
- `order_status_history` seeded with `from_status=null -> pending_payment` gives
  T12's admin status pipeline a real audit spine from row one.
- `order_items` FK `on delete set null` + the `order_items_block_update` trigger
  (permits only FK-nulling) means order history survives product deletes/edits —
  T12 refunds/cancels read a stable snapshot.
- `sales_count` bumped inside the transaction (always the product row, never the
  variant) is the correct single-counter design and the inverse T12 will
  decrement on cancel/restock.
- **RLS confirmed:** `customers`/`orders`/`order_items`/`order_status_history`/
  `discount_codes` are RLS-enabled with **no anon grant and no anon policy** —
  fully denied (`0005_rls_policies.sql`). `service_role` has full DML and the RPC
  is `grant execute` to `service_role` only. Belt-and-suspenders least privilege.

**Forward-shape (T12 inverse):** the guarded decrement
`UPDATE ... SET stock = stock - qty WHERE ... AND stock >= qty` is **symmetric
and reusable**. T12's cancel-with-restock is the exact inverse
(`stock + qty`, `sales_count - qty`), and because each line snapshot stores
`variant_id`/`product_id`/`quantity`, T12 can reverse a specific order without
re-deriving anything. No shape problem here.

---

## 3. The `create_order` RPC Pattern

**Verdict: The right call. One big SECURITY DEFINER function is correct here, and
it grows well — with one caveat for T8.**

Why one function is right:

- The Supabase JS client cannot span a transaction across multiple `.insert()`
  calls. Reserve-and-create is inherently one transaction (decrement + 4 inserts
  + counter bump + redemption). A single plpgsql function is the only clean way
  to get atomicity; splitting it reintroduces the partial-write bug it prevents.
- `SECURITY DEFINER` + `set search_path = ''` + `revoke all ... grant execute to
  service_role` matches the repo's established posture (`is_active_product`,
  `search_products`) and the RLS model. Least privilege is correct.
- Idempotency short-circuit at the top (select by `idempotency_key`, return the
  existing order) is placed correctly — before any stock is touched.

**Growth path for T8/T12:** `create_order` is a *creation* function and should
stay that way. T8 (payment webhooks) and T12 (cancel/refund) are **different
transactions** and must NOT be bolted on. The guarded-decrement idiom is the
reusable primitive; the wrappers should be siblings:

- `create_order` (exists) — decrement + create.
- `advance_order_status(order_id, to_status, ...)` (T8/T12) — the payment/admin
  state machine, writing `order_status_history` in the same txn.
- `cancel_order_restock(order_id, ...)` (T12) — the inverse: increment stock +
  decrement `sales_count` + status transition, one transaction.

The current function blocks none of this and is already factored so the siblings
can share the guarded-UPDATE idiom. See R-1/R-2.

**Concurrency correctness (verified by reading):** the guarded
`UPDATE ... WHERE stock >= qty RETURNING id` locks the matched row, serializing
concurrent decrements; zero rows -> raise -> full rollback. The `stock >= 0` CHECK
(confirmed on both `products` and `product_variants` in `0002_catalog.sql`) is
the hard floor. Last-unit race resolves to exactly one winner. Correct.

---

## 4. Idempotency + Confirmation-Token Contracts (Durability for T8's Webhook World)

**Verdict: Durable for user-retry. Needs one explicit T8 contract decision — flag
now so it isn't discovered mid-T8.**

Solid:

- Client-generated UUID idempotency key + partial-unique index
  (`orders_idempotency_key_key WHERE idempotency_key IS NOT NULL`) + top-of-RPC
  short-circuit. A double-click/retry returns the ORIGINAL order (`reused:true`),
  no second decrement. Verified in dev/QA smoke.
- `readIdempotencyKey` validates the client key against `UUID_PATTERN` and falls
  back to a server-minted UUID — never trusts the client blindly, never crashes on
  a missing key.
- Confirmation token (M-6) is the right IDOR remedy: the PII-bearing confirmation
  page is addressed by an unguessable `gen_random_uuid()`, the sequential
  `order_number` is display-only, `getOrderByToken` UUID-validates before the DB
  hit, uniquely indexed. This is exactly the durable link T9's email should use
  (email the token URL, never the order number).

**The T8 gap to make explicit (R-3):** the idempotency guarantee today is scoped
to *this order-creation submission*. In T8's webhook world the concurrency is
different — a Mercado Pago webhook may confirm/advance an order **while the user is
still retrying**, or MP may deliver the **same webhook twice**. That's a *payment*
idempotency problem, not an *order-creation* one, and the current key does not
cover it. T8 needs its own spine (unique `mp_payment_id`, or the MP idempotency
header). Nothing in T7 blocks this; cheaper to note now than to discover as a
double-capture bug.

---

## 5. Config / Constants, i18n Structure, Seed Strategy

**Verdict: Exemplary config discipline (BUILD_PLAN rule 4). i18n and seed scale
fine.**

- Every T7 tunable is a named, documented constant in `config.ts` with a "HOW TO
  SWAP" block: `MEXICAN_STATES` (+ set-backed `isMexicanState`),
  `MEXICAN_CP_PATTERN`, `EMAIL_PATTERN`, field-max caps, `ORDER_NUMBER_PREFIX`,
  `TAX_RATE=0` (written to the CFDI columns so Phase 3 needs no schema rework),
  `CHECKOUT_CONFIRMATION_SEGMENT`, `confirmationPath()`. Best-documented config
  file in this codebase.
- **The one acceptable duplication:** `ORDER_NUMBER_PREFIX = "PP"` is duplicated
  as the literal `'PP-'` in the RPC (plpgsql can't import TS). It's documented in
  *both* places to change together. Pragmatic, not drift. TD-1 (a test asserting
  the two agree would close it permanently).
- i18n: single `checkout` namespace in both `es-MX.json` (default) and `en.json`,
  kept symmetric across the Stage 6/8 deltas. State names are correctly config
  (proper nouns, locale-invariant), not i18n keys. Self-contained; scales fine.
- **Seed (verified):** `discounts.ts` adds 5 codes covering every eligibility
  branch (active pct/fixed, expired, below-min, exhausted) + a zero-stock variant
  for live oversell coverage. Codes are pre-**uppercased** and seeded via an
  **idempotent upsert on `code`** (`seed.ts`), which the `upper(code)` unique
  index (0008) backs. No concern — the earlier TD-4 verify item is **resolved**.

---

## 6. Scalability / Performance

**Verdict: Appropriate for the domain. Checkout is a low-QPS, high-value path;
the design correctly optimizes for correctness over throughput.**

| Concern | Assessment |
|---------|------------|
| Checkout page fetch | `page.tsx` server component: cached single-row `getStoreSettingsStatic()` + renders the client flow. No unbounded fetch. |
| `revalidateLines` reads | Batched into at most **two** `in(...)` queries (products, variants) via `Promise.all`, regardless of cart size — no N+1. |
| RPC lock contention | Per-row lock for the txn duration; contention only under genuine last-unit races per variant — bounded and *desired* (it's the oversell guard). No action at this scale. |
| Confirmation read | Two indexed point-reads (`confirmation_token`, then items by `order_id`). Fine. |
| Order-number lookup | `order_number UNIQUE` -> implicit unique index -> covered. |
| **Index gap (T8)** | `mp_payment_id` / `mp_external_reference` are **not indexed** (confirmed across all migrations). T8's webhook looks orders up by exactly these. See R-4. |

No unbounded fetches, no expensive work in a hot path, no missing cache on a
cacheable read. The write path is correctly not cached.

---

## 7. Frontend Architecture (brief — logic-heavy ticket)

**Verdict: Compliant with house patterns.** DB calls live in the server action
and `server-only` read modules, never in components; the client flow uses
`useCart()` + `useActionState(placeOrder)`; pure transforms
(`checkout-helpers.ts`) are extracted out of the flow component and unit-tested;
types live in `checkout-form-state.ts` / `address.ts` / `discount.ts`. Composed
component tree (flow -> fields/summary/discount/sticky-bar/skeleton), no god
component. Faithful to the Q&A `useActionState` precedent.

---

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns | PASS | Pure libs / server reads / action / RPC cleanly split; SRP-clean helpers |
| Boundary validation | PASS | UUID + qty clamp + live re-read; snapshot price/qty never trusted |
| Typed contracts | PASS | `CheckoutFormState`, `CreateOrderPayload/Result` typed end to end |
| Service-layer analog | PASS | action = orchestrator; `checkout-read`/`order-read` = data layer; RPC = txn |
| Type safety (no `any`/`!`) | PASS | No `any`, no non-null bang in the T7 modules |
| shadcn / UI conventions | PASS (N/A-heavy) | Reuses `buttonVariants`, `cn`, existing motion classes; no new deps |
| Config centralization (rule 4) | PASS | Every tunable a documented `config.ts` constant |
| RLS / least privilege | PASS | Commerce tables anon-denied; RPC `grant execute` to `service_role` only |
| DB CHECK as backstop | PASS | `assembleOrder` satisfies identities; CHECKs are the floor |

---

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| No index on `mp_payment_id`/`mp_external_reference` (T8 webhook lookup key) | Med | Add in T8's migration (T7 writes neither column). LATER-ok, logged. |
| Single-variant lock contention under a flash sale | Low | Accept — serialization is the desired oversell guard. Revisit only on a real hot-variant event. |
| RPC failure classification by string-match | Low | Prefer a structured `SQLSTATE` per raise (TD-3). |

---

## Tech Debt Ledger

| Item | Type | Impact | Effort |
|------|------|--------|--------|
| TD-1: `ORDER_NUMBER_PREFIX` "PP" duplicated in TS + RPC literal | Introduced (documented, accepted) | Low | S — test asserting `formatOrderNumber` prefix matches an RPC-returned number |
| TD-2: No rate limit on `placeOrder` (order/customers-row spam) | Introduced (deferred) | Low-Med | M — reuse Q&A `clientIp()` + limiter; RPC + stock floor bound real damage |
| TD-3: Action maps RPC errors by `message.includes(...)` string-sniff | Introduced | Low | M — raise distinct `SQLSTATE`s, switch on `error.code` |
| TD-4: Discount seed idempotency + upper-cased code | RESOLVED | — | Verified: idempotent upsert on `code`, pre-uppercased, backed by `upper(code)` unique index |
| TD-5: RPC redemption guard intentionally skips `min_subtotal_cents` re-check | Introduced (accepted, documented) | Low | S — accept; revisit only if discounts become abusable |
| TD-6: No CP<->state cross-validation (SEPOMEX) — 5-digit shape only | Existing (documented Phase-3) | Low | L — carrier/Phase-3 work |
| TD-7: `coverImageUrl: null` from `checkout-read` (summary uses client snapshot image) | Introduced (documented) | Low | S — accept; write path correctly avoids an image join |

None are time bombs. TD-2 (rate limit) is the one I'd most want closed before a
public launch, but it's not a T7 blocker — the atomic RPC + stock floor cap the
real damage of spam to junk rows, not oversell or double-charge.

---

## Risks for T8 / T9 / T12 — NOW vs LATER

**R-1 (T8/T12) — Establish a status-transition RPC; don't hand-write status
UPDATEs.** *LATER (T8), decide now.* The immutability trigger allows raw
`status`/`payment_status` UPDATEs from the service key. T8 should advance state
through `advance_order_status(...)` that also writes `order_status_history` in the
same txn, so the audit spine T7 started is never bypassed. Ad-hoc
`.update({ status })` in the webhook would silently skip history. *T7 needs no
change.*

**R-2 (T12) — Cancel/restock is a sibling transaction, not an extension of
`create_order`.** *LATER (T12).* The guarded-decrement idiom is already reusable
for the inverse. Keep `create_order` a pure creation function. *No T7 change.*

**R-3 (T8) — Payment idempotency is a separate spine from order-creation
idempotency.** *LATER (T8), design now.* A duplicated MP webhook, or a webhook
confirming an order mid-retry, is not covered by `orders.idempotency_key`. T8
needs its own guard (unique `mp_payment_id`, or the MP idempotency header). The
confirmation-token contract T7 shipped is already the correct durable link for
T9's email.

**R-4 (T8) — Index the MP lookup columns.** *T8 (cheap).* `mp_payment_id` /
`mp_external_reference` are unindexed; the webhook filters orders by them. Add
`create index if not exists orders_mp_payment_id_idx on orders (mp_payment_id) where mp_payment_id is not null;`
(and the same for `mp_external_reference`) in T8's migration — T7 writes neither
column, so it belongs there. Pairs with the unique index from R-3.

**Concrete NOW list (optional, cheap, zero production data):**
1. TD-1 — add the prefix-agreement test (~5 min; closes the one real drift risk).

Everything else is correctly deferred to the ticket that owns it.

---

## Architecture Score: 9/10

Will this make sense in 6 months with 2x the team? Yes. The layering is legible,
each module has one reason to change, the trust boundary is a single choke point,
and the data model was respected rather than worked around. The atomicity story
is correct and verified. The point off is forward-facing: the payment-state
machine and payment idempotency (R-1, R-3) are the natural next architectural
seams and aren't stubbed yet — correct scoping for T7, but a T8 reviewer will have
to establish them, so I'm flagging them loudly rather than letting them surprise.
Nothing needs a redesign; this is a solid, extensible foundation for the money
path.

## Recommendation: APPROVE

Ship-quality architecture (subject to the standing T7 human-review gate — this
review does not waive it). No refactors required. One optional 5-minute NOW item
(TD-1); R-1/R-3/R-4 handed forward to T8 as explicit design inputs.

---

*Report-only stage (ran in parallel with Security/Stage 9). No source files,
`tasks/pipeline-state.md`, or `tasks/security-audit.md` were modified; no commit
made — the orchestrator commits Stages 9+10 together.*
