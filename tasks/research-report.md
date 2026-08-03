# Research Report: T18 — Admin customer detail page

## The definitive customer-keying answer (the critical question)

**Customers are keyed by `customers.id` (UUID PK). Not by email, not by phone.**

Evidence chain (all read this pass):

1. **List grouping key** — `src/lib/admin/orders/customer-list-query.ts:107-124`
   (`readOrderCounts`) calls the `admin_customer_order_counts` RPC with the page's
   **`customers.id` array** and maps the result by `customer_id`. The list row
   (`AdminCustomerRow`, line 16-22) is keyed on `customers.id`.

2. **The RPC's aggregation key** — `supabase/migrations/0013_admin_customer_order_counts.sql`:
   ```sql
   select o.customer_id, count(*) as order_count
   from public.orders o
   where o.customer_id = any(p_customer_ids)
   group by o.customer_id;
   ```
   The count is `orders GROUP BY customer_id` — a `customers.id`/`orders.customer_id`
   FK join, **never email/phone**.

3. **The FK** — `supabase/migrations/0003_commerce.sql:28`:
   `customer_id uuid references customers (id) on delete set null`, with
   `orders_customer_id_idx` on `orders(customer_id)` (line 78).

4. **One customer row PER ORDER** (the fact that makes the screenshot make sense) —
   `supabase/migrations/0008_checkout.sql:200-208`, the `create_order` RPC:
   ```sql
   -- 3. Guest customer record (AC-11). No accounts in Phase 1 — one row per order.
   insert into public.customers (email, full_name, phone)
     values (payload->>'contact_email', payload->>'shipping_full_name',
             nullif(payload->>'contact_phone', ''))
     returning id into v_customer_id;
   ```
   There is **no `ON CONFLICT`, no lookup-by-email, no dedup**. Every checkout AND every
   manual order (which also goes through `create_order`, see
   `src/lib/admin/orders/manual-order-write.ts:203`) mints a fresh `customers` row.

**What this means for the detail page — the resolution of every concern in the brief:**

- The screenshot's repeated `manual-buyer@example.com` rows are **distinct `customers.id`
  rows**, each with its own single order. The list counts them separately *correctly*.
- **Recommended route param: `customers.id` (the raw UUID).** Not an encoded email/phone
  key. The detail page does `orders WHERE customer_id = {id}` and its count **equals the
  list's count by construction** (identical GROUP BY key). No encoding, no ambiguity, and
  it mirrors the order detail's `/[id]` param exactly.
- Email-less manual customers use the sentinel `sin-correo@pedido-manual.invalid`
  (`src/lib/email/recipient.ts:30`, `NO_EMAIL_PLACEHOLDER`) in `customers.email` /
  `orders.contact_email`. Because keying is by `customers.id`, **phone-distinct sentinel
  customers are already never collapsed** — no special handling needed for isolation. The
  only work is *rendering*: pass the email through `isMailableAddress()` so the sentinel
  shows "Sin correo".
- The customer's order count is, in practice, **1** for almost every customer (one row per
  order). The page must render count-1 and count-N correctly and never hardcode "1".

> **Note on the brief's phrasing.** The brief referenced a `no-email@manual-order.invalid`
> sentinel; the actual constant is `sin-correo@pedido-manual.invalid`. And the brief's
> worry about "distinct phone customers who share the sentinel" is a non-issue under
> `customers.id` keying — they are already distinct rows. Both confirmed by direct read.

## Codebase Analysis

### Existing Patterns

- **UUID-guard → null → `notFound()`**: `src/lib/admin/orders/order-read.ts:1-12, 89+`
  (`getAdminOrder`) guards the id with `UUID_PATTERN` (from `@/lib/config`), returns `null`
  for a bad/missing id; the page (`.../orders/[id]/page.tsx:38-41`) calls `notFound()`.
  Reuse strategy: `customer-read.ts` is a near-clone of this shape.
- **Section-isolated reads (never 500)**: `order-read.ts` returns `history: null` /
  `notes: null` on a section failure while the core order still renders. Reuse for the
  order-history / address / totals sections of the customer read.
- **Two-phase list read (count → ranged data)**: `customer-list-query.ts:46-60` and
  `order-list-query.ts`. Reuse for the bounded order-history read if paginated.
- **Grouped-count RPC (bounded, no 1000-row truncation)**: `admin_customer_order_counts`
  (0013) + its reader `customer-list-query.ts:107`. This is the template for the optional
  T18 aggregate RPC.
- **`Panel` card + `AdminPage` shell**: `.../orders/[id]/page.tsx:122-128` (`Panel`) and
  `src/components/admin/admin-page.tsx:10-39` (`title`/`description`/`actions`/`children`).
  Reuse verbatim.
- **Row-links-to-detail**: `src/components/admin/orders/order-table.tsx:68-97` (desktop) &
  `100-131` (mobile) — links only the identifier cell, keeps other cells selectable, uses
  `nav-hover` + `hover:bg-muted/40` + `focus-visible:underline` + a `data-testid`. This is
  the exact recipe for the `customer-table.tsx` change (AC-1).
- **Badges + redundancy suppression**: `order-table.tsx:83-88` uses `OrderStatusBadge`,
  `PaymentStatusBadge`, `paymentBadgeIsRedundant(orderStatus, paymentStatus)`
  (`order-status-meta.ts:110`). Reuse for the order-history rows.
- **Email-sentinel rendering**: `.../orders/[id]/page.tsx:74, 133-142` gates on
  `isMailableAddress(order.contactEmail)` → shows the address or the italic "Sin correo".
  Reuse verbatim for AC-3.
- **List error branch**: `.../orders/customers/page.tsx:31-50` — `try/catch` around the
  read → `role="alert"` panel with a Reintentar link. Reuse for the detail top-level error.
- **Money**: `src/lib/money.ts:26` `formatMXN(cents: number)` — integer centavos in, es-MX
  string out, throws on non-finite-integer. Aggregate in cents, format only at the edge.
- **Relative dates**: `src/lib/admin/format.ts:31` `formatRelativeDate(iso, now?)`.

### Relevant Files

| File | Purpose | Relevance | Action |
| ---- | ------- | --------- | ------ |
| `src/lib/admin/orders/customer-list-query.ts` | List read + count RPC caller | Keying source of truth; clone conventions | Reference |
| `supabase/migrations/0013_admin_customer_order_counts.sql` | Grouped-count RPC | Proves keying + count semantics; RPC template | Reference |
| `supabase/migrations/0008_checkout.sql` | `create_order` RPC | Proves one-row-per-order, no dedup | Reference |
| `supabase/migrations/0003_commerce.sql` | `customers`/`orders` schema | Columns + FK + `orders_customer_id_idx` | Reference |
| `src/lib/admin/orders/order-read.ts` | Single-order detail read | The clone base for `customer-read.ts` | Reference |
| `src/app/admin/(app)/orders/[id]/page.tsx` | Order detail page | The clone base for the customer detail page | Reference |
| `src/app/admin/(app)/orders/customers/page.tsx` | Customers list page | Error branch + shell pattern | Reference |
| `src/components/admin/orders/customer-table.tsx` | Customers table | Make rows link (AC-1) | **Modify** |
| `src/components/admin/orders/order-table.tsx` | Order table | Row-link recipe (desktop+mobile) | Reference |
| `src/lib/admin/orders/order-status-meta.ts` | Badges/meta + `paymentBadgeIsRedundant` + `isManualOrder` | Order-history row badges | Reference |
| `src/lib/email/recipient.ts` | `isMailableAddress` + `NO_EMAIL_PLACEHOLDER` | Email-sentinel rendering (AC-3) | Reference |
| `src/lib/money.ts` / `src/lib/admin/format.ts` | `formatMXN` / `formatRelativeDate` | Totals + dates | Reference |
| `src/components/admin/admin-page.tsx` | `AdminPage` shell | Page wrapper | Reference |
| `src/lib/admin/constants.ts` | `ADMIN_CUSTOMERS_PATH` / `ADMIN_ORDERS_PATH` | URLs for links/back-link | Reference |
| `src/lib/supabase/types/rpc.ts` | RPC Args/Return types | Add types IF the aggregate RPC is chosen | Modify (conditional) |
| `tests/integration/admin-customer-counts.integration.test.ts` | Count RPC integration test | The clone base for the new integration test | Reference |
| `src/app/admin/(app)/orders/customers/[id]/page.tsx` | The new route | — | **Create** |
| `src/lib/admin/orders/customer-read.ts` | The new read | — | **Create** |

### Data Flow

```
Operator clicks a Customers-list row (customer-table.tsx <Link href=/admin/orders/customers/{id}>)
  → App Router matches src/app/admin/(app)/orders/customers/[id]/page.tsx
    → (app) layout hasValidAdminSession() guard (redirect to /admin/login if invalid)  [AC-11]
    → page awaits params.{id}
    → getAdminCustomer(id)  (customer-read.ts, server-only, admin/service-role client)
        1. UUID_PATTERN.test(id) → false ⇒ return null ⇒ notFound()               [AC-10]
        2. select id,email,full_name,phone from customers where id=id → none ⇒ null ⇒ notFound()
        3. select id,order_number,created_at,total_cents,status,payment_status,
             contact_email,contact_phone,shipping_* from orders
             where customer_id=id order by created_at desc limit CUSTOMER_ORDER_HISTORY_LIMIT
           (uses orders_customer_id_idx)  → history rows                          [AC-4]
        4. aggregate: count / sum(total_cents) / min,max(created_at)
             — either a 2nd bounded query with head+aggregate OR the 0014 RPC     [AC-7,8,9]
        5. derive distinct shipping-address tuples from the orders                [AC-6]
        (each section read isolated: failure → null section, page still renders)  [AC-13]
    → RSC renders AdminPage → identity header → Lifetime totals → Order history
       (rows link to ${ADMIN_ORDERS_PATH}/{order.id}) → Contact & addresses       [AC-2,5]
```

### Similar Features (Reference Implementations)

- **Order detail** (`.../orders/[id]/page.tsx` + `order-read.ts`) — the closest analog:
  a UUID-param admin detail page reading one entity + related rows, `notFound()` on miss,
  section-isolated, composed of `Panel`s. **Follow this structure almost verbatim.**
- **Customers list** (`.../orders/customers/page.tsx` + `customer-list-query.ts`) — the
  entity, the client, the error branch, the es-MX copy voice.
- **Order table** (`order-table.tsx`) — the row-link + badge + `formatMXN`/`formatRelativeDate`
  recipe the order-history section reuses directly.
- **Count-RPC integration test** (`admin-customer-counts.integration.test.ts`) — the exact
  `serviceClient()` + tracked-cleanup + seed-helper structure for the new integration test.

## Dependency Analysis

### Existing Dependencies to Leverage

- `@/lib/supabase/admin` (`createAdminClient`) — service-role read (RLS-bypass), same as
  every other admin read.
- `@/lib/config` (`UUID_PATTERN`, `ADMIN_PRODUCTS_PER_PAGE`).
- `@/lib/money` (`formatMXN`), `@/lib/admin/format` (`formatRelativeDate`).
- `@/lib/email/recipient` (`isMailableAddress`, `NO_EMAIL_PLACEHOLDER`).
- `@/lib/admin/orders/order-status-meta` (`paymentBadgeIsRedundant`; optionally `isManualOrder`
  + `SourceBadge` if the history rows should mark manual orders).
- `next/navigation` (`notFound`), `next/link` (`Link`), `@hugeicons/*` (icons).
- `@/components/admin/orders/{order-status-badge,payment-status-badge,list-pagination}`.

### New Dependencies Needed

- **None.**

### Internal Dependencies

- `customer-read.ts` depends on `createAdminClient` + `UUID_PATTERN` — implication: it is
  `server-only` and must NOT be imported by any client component (same rule the other read
  modules follow).
- `customer-table.tsx` (currently a pure presentational server component) will depend on
  `next/link` + `ADMIN_CUSTOMERS_PATH` after the change — trivial, both already used in
  sibling files.

## External Research

- **None required.** No external API or library surface — this is an internal read on
  existing Supabase tables using primitives already in the repo. (Supabase PostgREST's
  1000-row default cap is the only external behavior that matters, and it is already
  handled everywhere via bounded reads + aggregate RPCs — the reason 0013 exists.)

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Detail count disagrees with list count (AC-9 fail) | Low | High | Both key on `customers.id`/`orders.customer_id`; the integration test asserts equality against the same RPC. Do not filter by status/payment in the count. |
| Aggregating totals by tallying only the fetched (capped) history page | Med | Med | Compute count/sum/first/last via a **separate aggregate** query or the 0014 RPC over ALL rows, never over the limited history slice (edge 3). |
| Accidentally aggregating by email (collapsing distinct customers) | Low | High | Query strictly `where customer_id = {id}`. Never `where email = ...`. Called out in ticket + tests (edge 2). |
| Float money math on total spent | Low | Med | Sum integer `total_cents`; `formatMXN` only at render (AC-8). |
| Rendering the sentinel invalid email as literal text | Med | Low | Route every email through `isMailableAddress()` (AC-3), reusing the order-detail branch. |
| Mobile horizontal overflow from long email/address (the T12 crit) | Med | Med | `min-w-0` + `break-words` on every free-text field; card list < 640px. |
| `[id]` route collision with the sibling order `[id]` | None | — | Different directory (`customers/[id]` vs `orders/[id]`); App Router segments are independent. No collision. |

### Performance Considerations

- **History read** is bounded (`LIMIT CUSTOMER_ORDER_HISTORY_LIMIT`) and index-backed by
  `orders_customer_id_idx` — O(limit), independent of total order volume.
- **Aggregate** (count/sum/min/max) is a single grouped scan on the same index; at Phase-1
  volumes (and the one-row-per-order reality where most customers have 1 order) this is
  trivial. An RPC pushes it fully into PG (recommended for exactness — see Key Decisions).
- Page is `dynamic = "force-dynamic"` (live read), consistent with all admin surfaces.

### Security Considerations

- **Auth**: page under `(app)` → layout `hasValidAdminSession()` guard (defense-in-depth:
  middleware → layout). No new route handler, so no `/api` self-guard gap (AC-11).
- **Injection**: `id` is UUID-guarded before any query; all queries are parameterized
  PostgREST `.eq("customer_id", id)` — no string interpolation. No user-supplied search on
  this page.
- **PII exposure**: the page shows customer email/phone/address — this is exactly the
  admin-only data already exposed on the order detail; no new exposure class, and it never
  reaches a client bundle (server-only read, RSC render).
- **Optional RPC**: if added, follow 0013's posture verbatim — `security definer`, pinned
  empty `search_path`, `revoke ... from public` + `grant execute ... to service_role`.

## Implementation Recommendations

### Suggested Order of Implementation

1. **`customer-read.ts` + its unit test** — the pure/isolated read logic first; establishes
   `AdminCustomerDetail` shape (identity, history rows, aggregate, distinct addresses).
   Why first: everything else consumes its types.
2. **Integration test** (`admin-customer-detail.integration.test.ts`) — clone the count
   test; seed a customer + N varied orders; assert count/sum/first-last/address-dedup + the
   count-equals-`admin_customer_order_counts` invariant. Why here: locks the keying + AC-9
   before the UI is built.
3. **`customers/[id]/page.tsx`** — compose the page from `customer-read` + existing
   primitives (`Panel`, badges, `formatMXN`, `formatRelativeDate`, `isMailableAddress`).
   `notFound()` + top-level `try/catch` error branch. Depends on step 1's types.
4. **`customer-table.tsx` row-link change** + its unit test — last, once the target route
   exists so no link is dead. Assert the `href` and `data-testid`.
5. **`loading.tsx`** for the route (small skeleton) — polish.

### Key Decisions

- **Route param = raw `customers.id` UUID** (not an encoded email/phone key). Recommended
  because it makes the detail's order set == the list row's set by construction, mirrors
  the order detail's `/[id]`, and needs no encode/decode. This is THE decision the brief
  asked for.
- **Aggregate strategy — recommend a small `0014` aggregate RPC** returning
  `(order_count, total_cents, first_order_at, last_order_at)` for one customer id, mirroring
  0013's posture. Why over an in-app query: it computes over ALL orders (never truncates),
  keeps the total exact regardless of history-page size (edge 3), and is one round-trip.
  **Acceptable alternative** (avoids a migration): a second bounded query using PostgREST's
  aggregate selection / `head:true count` + a `min/max/sum` — but summing `total_cents`
  over an unbounded set via PostgREST risks the same 1000-row cap the project already fought
  in 0013, so the RPC is the cleaner, consistent choice. **Ticket allows either; RPC preferred.**
- **Headline total = sum of ALL the customer's order totals** (not paid-only), so the detail
  reconciles with the visible history and the list count (edge 1). A paid-only figure, if
  desired, is a separate labeled line.
- **Distinct addresses** de-duped on the full shipping tuple, most-recent-first (edge 4).
- **Manual-order marking**: optional but nice — render a `SourceBadge` on history rows where
  `isManualOrder(payment_method)` (needs `payment_method` in the history select). Low effort;
  defer if it complicates the read.

### Anti-Patterns to Avoid

- **Don't** key the detail on email or phone — it would collapse the distinct
  one-row-per-order customers and break AC-9. Key on `customers.id`.
- **Don't** compute totals from the (capped) fetched history page — aggregate over all rows.
- **Don't** filter the count/total to paid orders — it would disagree with the list count.
- **Don't** render `order.contact_email` raw — the sentinel must map to "Sin correo".
- **Don't** add a client component or a server action — this is a pure read; no mutation, no
  island, no `requireSession` in the page (that's for actions; the layout guards pages).
- **Don't** declare the new RPC's types as `interface` in `rpc.ts` — must be `type` aliases
  (the T8 gotcha that collapses the Database generic to `never`).
- **Don't** forget `min-w-0` + `break-words` — the T12 mobile-overflow critical fix applies.
