# Task: T18 — Admin customer detail page

## Priority

High — Owner-approved scope addition (2026-08-03). The Customers list (T12) already
ships but its rows are dead ends: an operator can see a customer exists and how many
orders they have, but cannot drill into that customer to see their order history,
the contact/shipping details, or lifetime value. This is the natural completion of
the T12 customer surface and a prerequisite for any future customer-centric workflow.
Not launch-blocking (go-live is gated on T8 Phase 5 + T14), but small, self-contained,
and high operator value.

## Complexity

**low** — Pattern copy on top of a fully-built substrate. It reuses the T12 order
list/detail grammar verbatim (AdminPage shell, `Panel`, `OrderStatusBadge`/
`PaymentStatusBadge`/`paymentBadgeIsRedundant`, `formatMXN`, `formatRelativeDate`,
`ListPagination`, `UUID_PATTERN`→`notFound()` guard). The only genuinely new pieces
are: one new read module (`customer-read.ts`) built from `customer-list-query.ts` +
`order-read.ts`, one new route (`customers/[id]/page.tsx`), and making the existing
`customer-table.tsx` rows into links. No new data model, no new migration required
(one small aggregate helper may reuse existing tables), no new dependencies. Estimated
~6–9 files changed, well under the medium threshold, and every pattern already exists.

## Feature Type

**full-stack** (logic-heavy) — A new server-rendered admin page + a new server-only
read module + a change to an existing server component. There IS a visible surface
(the detail page), so it is not `logic-only`, but the UI is a straight composition of
existing admin primitives with no new interaction model, no client island, and no new
motion — so UI Design and UX stages run lightweight.

## User Story

As a store operator, I want to click a customer in the Customers list and see that
customer's full profile — every order they placed (with a link to each order), the
contact and shipping details on record, and their lifetime totals — so that I can
answer "who is this person and what have they bought from us?" in one place without
manually cross-referencing the order list.

## Background

**What exists today.** T12 shipped a Customers list at `/admin/orders/customers`
(`src/app/admin/(app)/orders/customers/page.tsx`): a searchable, paginated table
(`customer-table.tsx`) of `customers` rows — full name, email, phone, and a per-customer
**order count**. That count comes from the `admin_customer_order_counts` RPC (migration
0013), which does `select customer_id, count(*) from orders where customer_id = any($ids)
group by customer_id`. The list rows explicitly **do not link anywhere** (see the
`customer-table.tsx` docstring: "Rows do NOT link (customer accounts are out of scope)").

**The customer-keying reality (the critical fact).** Customers are keyed by
`customers.id` (a UUID PK). `orders.customer_id` is an FK to it (`on delete set null`).
The `create_order` RPC (migration 0008, line ~200) inserts a **brand-new `customers`
row for every order** — comment: *"No accounts in Phase 1 — one row per order."* There
is **no dedup on email or phone**. Consequences that the detail page MUST respect:

- A customer's order count is, in practice, almost always **exactly 1** (one customer
  row per order). N>1 only occurs if orders were ever backfilled/linked to a shared id
  (not a current path) — so the page must correctly render count-1 AND count-N, and
  never assume 1.
- The "duplicate email" rows in the Customers screenshot (`manual-buyer@example.com`
  repeated) are **distinct `customers.id` rows** that happen to share an email — they
  are correctly counted separately by the list, and the detail page must aggregate
  **only** the orders sharing the clicked `customers.id`, never all orders with that
  email.
- Email-less manual (phone/offline) orders (T17) store the sentinel
  `sin-correo@pedido-manual.invalid` (`src/lib/email/recipient.ts`,
  `NO_EMAIL_PLACEHOLDER`) in both `customers.email` and `orders.contact_email`. Because
  each is its own `customers.id`, phone-distinct sentinel customers are **already not
  collapsed** — the keying handles this for free. The detail page must **render** the
  sentinel as "Sin correo" via `isMailableAddress()`, never as a literal invalid email.

**What's missing.** The route `/admin/orders/customers/[id]`, the read that fetches one
customer + their orders + aggregates, and the link from the list rows.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

- [ ] **AC-1** Each row in the existing Customers table (`customer-table.tsx`), both the
      desktop `<table>` and the mobile card list, is a link to
      `/admin/orders/customers/{customers.id}`. The link is keyboard-focusable and has a
      visible focus style (mirror `order-table.tsx`'s row-link treatment).
- [ ] **AC-2** Navigating to `/admin/orders/customers/{id}` for a customer that exists
      renders a detail page inside the `AdminPage` shell with a "back to Clientes" link
      to `ADMIN_CUSTOMERS_PATH`.
- [ ] **AC-3** The page shows the customer identity: `full_name`, and email rendered via
      `isMailableAddress()` — a real email shows as text; the `sin-correo@pedido-manual.invalid`
      sentinel (or any blank/malformed value) shows "Sin correo", never the literal
      invalid string. Phone shows the value or "—" when null.
- [ ] **AC-4** The page shows an **Order history** section: one row per order belonging to
      this customer (`orders where customer_id = {id}`), ordered `created_at DESC`. Each row
      shows the order number, relative created date (`formatRelativeDate`), total
      (`formatMXN`), an `OrderStatusBadge`, and a `PaymentStatusBadge` suppressed via
      `paymentBadgeIsRedundant` exactly as the order list does.
- [ ] **AC-5** Each order-history row links to that order's detail page
      (`${ADMIN_ORDERS_PATH}/{order.id}`).
- [ ] **AC-6** The page shows a **Contact & addresses** section: the contact email/phone
      on record for the customer, plus the distinct shipping addresses used across their
      orders (`shipping_full_name`, `line1`, `line2`, `city`, `state`, `postal_code`,
      `country`). Identical addresses across multiple orders are de-duplicated to one entry.
- [ ] **AC-7** The page shows **Lifetime totals**: order count (== the count the list row
      showed for this customer — verified equal by construction), total spent
      (`sum(total_cents)` across the customer's orders, rendered with `formatMXN`), and
      first-order / last-order dates.
- [ ] **AC-8** Total spent is computed in **integer cents** and only formatted at the edge
      (`formatMXN`) — no floating-point peso arithmetic anywhere in the aggregation.
- [ ] **AC-9** The lifetime **order count on the detail page equals** the count the
      Customers list showed for the same `customers.id`. (Both derive from
      `orders where customer_id = {id}`; asserted by an integration test seeding N orders
      for one customer and comparing the RPC count to the detail read.)
- [ ] **AC-10** A request to `/admin/orders/customers/{id}` where `{id}` is not a valid
      UUID, or is a well-formed UUID that matches no `customers` row, calls `notFound()`
      (in-shell 404), never a 500 (mirror `order-read.ts`'s `UUID_PATTERN`→`null` guard).
- [ ] **AC-11** The page is admin-only. It lives under `src/app/admin/(app)/` so the
      `(app)` layout's `hasValidAdminSession()` guard protects it (same mechanism as the
      order detail page — pages do not call `requireSession` directly; that is for actions).
      An unauthenticated request is redirected to the login page.
- [ ] **AC-12** All page chrome is **es-MX** (hardcoded, admin is es-MX only — no i18n
      message files for admin), consistent with the neutral admin theme (no `.theme-storefront`).
- [ ] **AC-13** The detail read is **server-only**, uses the admin (service-role) client,
      and **never throws to the page** for the order-history / address / totals sections:
      a section read failure degrades to a section-scoped state, and a missing/invalid
      customer degrades to `null`→`notFound()` — the page never 500s (mirror
      `order-read.ts`'s section-isolation principle).
- [ ] **AC-14** New read logic is covered by an integration test against the live local
      Supabase (mirroring `admin-customer-counts.integration.test.ts`): seeds a customer +
      orders, asserts the aggregate (count, total_cents sum, first/last dates, distinct
      address de-dup) and the count-equals-list invariant; plus a unit test for any new
      pure helper and for the customer-table row-link change. `tsc --noEmit` and `eslint`
      are clean on all touched files, and the full unit + integration suites stay green.
- [ ] **AC-15** No new migration is required unless an aggregate RPC is chosen (see
      Technical Approach); if one is added it is the next number (0014), idempotent,
      `security definer` + pinned empty `search_path` + `service_role`-only execute, and
      its Args/Return are declared as `type` aliases in `rpc.ts` (never `interface`).

## Edge Cases

At least five specific edge cases that MUST be handled:

1. **Customer with N orders but 0 paid** — e.g. all orders are `pending_payment` /
   `cancelled` and none `paid`. Order count and history render normally; **total spent**
   sums `total_cents` of the orders as displayed (the order *value*), matching the list's
   count semantics (count = order rows, not paid orders). Do NOT silently filter to
   paid-only — that would make the detail count disagree with the list count (AC-9).
   Decision: headline "Total gastado" = sum of all the customer's order totals so it
   always reconciles with the visible history and the list count. (A paid-only total, if
   ever wanted, is a *separate labeled line*, not the headline.)
2. **Email-less / sentinel manual customers not collapsed** — two distinct manual
   customers both storing `sin-correo@pedido-manual.invalid` with **different phones**
   are two `customers.id` rows; clicking each shows only its own single order. The detail
   read keys strictly on `customers.id`, never on email, so they are never merged. The
   email field renders "Sin correo" for both.
3. **Very long order history** — a customer with, hypothetically, dozens of orders. The
   order-history section must render bounded/scrollable and the read must be bounded (no
   unbounded fetch that could truncate at PostgREST's 1000-row cap). Cap the history read
   at a named `CUSTOMER_ORDER_HISTORY_LIMIT` (or reuse `ADMIN_PRODUCTS_PER_PAGE`=25); if
   `orderCount > limit`, show "Mostrando los N más recientes de M" — the aggregate totals
   (count, sum, first/last) MUST still reflect **all** orders (computed by an aggregate
   query/RPC, not by tallying the fetched page).
4. **Addresses that differ across orders** — a customer whose orders used different
   shipping addresses shows **each distinct address once** (de-duped on the full tuple),
   most-recent first. A customer whose orders all used the same address shows exactly one
   address entry.
5. **`customer_id` orphaned to null / customer with zero orders** — a `customers` row
   whose only order had its `customer_id` set to null by the FK's `on delete set null`,
   or that otherwise has no orders. The page still renders identity + contact, an **empty
   order-history state** ("Este cliente no tiene pedidos."), lifetime count 0, total spent
   `$0.00`, and no first/last dates ("—"). It must not 500 or divide by zero.
6. **Order with null contact_phone / null address_line2** — history rows and address
   entries tolerate nullable columns; line2 omitted when null, phone shows "—".
7. **Hostile / injection id in the URL** — `<script>`, SQL fragments, over-long strings
   in `[id]` are rejected by the `UUID_PATTERN` guard → `notFound()` before any DB call
   (mirror `order-read.ts`).

## Error States Table

| Trigger | User Sees | System Does |
| ------- | --------- | ----------- |
| `[id]` not a UUID, or valid UUID with no matching customer | In-shell admin 404 ("no encontrado") | `customer-read` returns `null` after `UUID_PATTERN` guard / empty query → page calls `notFound()`; no DB call for a bad UUID |
| Core customer read fails (DB down) | Top-level "No se pudieron cargar los datos del cliente." alert with a Reintentar link to the same URL | Read throws caught at the page (mirror the Customers list `try/catch`); logs `[admin-customer-detail] ...`; renders alert, not a 500 |
| Order-history section read fails but customer core loaded | Identity + contact render; the history section shows a scoped "No se pudo cargar el historial de pedidos." banner | Section read isolated (returns `null`); page renders section banner (mirror `order-read.ts` history/notes isolation) |
| Unauthenticated request | Redirect to `/admin/login` | `(app)` layout `hasValidAdminSession()` fails → redirect before the page renders |
| Customer has zero orders | Empty order-history state + count 0 + total `$0.00` + first/last "—" | Aggregate returns zeros/nulls; page renders the empty branch, no error |

## UX Requirements

- **Loading**: Server-rendered page; a `loading.tsx` (reuse the orders section's skeleton
  pattern if present, else a simple `AdminPage` title + muted "Cargando…") covers the
  navigation gap. No spinner inside the composed sections.
- **Empty** (customer with no orders): order-history section shows a dashed-border empty
  panel with a receipt/`UserGroupIcon` glyph and "Este cliente no tiene pedidos." (mirror
  `CustomerEmptyState` / `order-empty-state.tsx`). Lifetime totals show count 0, `$0.00`,
  dates "—".
- **Error**: top-level read failure → `role="alert"` destructive-tinted panel with a
  "Reintentar" link to the same URL (verbatim the Customers list error branch). Section
  failure → scoped banner inside that section.
- **Success**: the composed detail — identity header, Lifetime totals, Order history
  (linked rows), Contact & addresses — renders. Each order row is an obvious link (hover
  underline + focus ring), and clicking navigates to that order's detail.
- **Mobile (375px)**: single-column stack. Order history uses a card list (mirror
  `order-table.tsx`'s `MobileCards`), addresses stack. `min-w-0` + `break-words` on every
  free-text field (email, address, name) so a long unbroken email never causes horizontal
  overflow (this was the T12 UX critical fix — honor it here).
- **Tablet (768px)**: the two-column `md:grid-cols-2` panel layout of the order detail is
  optional; a single readable column is acceptable given the low content volume. If two
  columns are used, `min-w-0` on both. Order history remains a full-width table ≥640px.

## Technical Approach

### Files to Create

- `src/app/admin/(app)/orders/customers/[id]/page.tsx` — the detail route. Server
  component, `export const dynamic = "force-dynamic"`. Reads `{ id }` from `params`, calls
  `getAdminCustomer(id)`; `null` → `notFound()`. Composes: back-link → identity header →
  Lifetime totals panel → Order history panel (linked rows, desktop table + mobile cards)
  → Contact & addresses panel. Reuses `AdminPage`, the `Panel` grammar, `OrderStatusBadge`,
  `PaymentStatusBadge`, `paymentBadgeIsRedundant`, `formatMXN`, `formatRelativeDate`,
  `isMailableAddress`, and `ListPagination` only if history is paginated. No client island.
- `src/lib/admin/orders/customer-read.ts` — `server-only`. Exports `AdminCustomerDetail`
  interface + `getAdminCustomer(id: string): Promise<AdminCustomerDetail | null>`. Guards
  `id` with `UUID_PATTERN` (→ `null`); reads the `customers` row (→ `null` if missing);
  reads that customer's orders (`orders where customer_id = id`, `created_at DESC`, bounded
  by `CUSTOMER_ORDER_HISTORY_LIMIT`); computes aggregates (count, `sum(total_cents)`,
  first/last `created_at`) — see the RPC decision below; derives the distinct address set.
  Section reads isolated (never throw to page). Built from `customer-list-query.ts` +
  `order-read.ts` conventions.
- `src/lib/admin/orders/customer-read.test.ts` — unit test for the pure pieces (address
  de-dup, total-in-cents, empty/zero-order shaping) with the DB mocked.
- `tests/integration/admin-customer-detail.integration.test.ts` — live-DB integration test
  mirroring `admin-customer-counts.integration.test.ts` (serviceClient, tracked cleanup):
  seeds a customer + N orders (varied statuses, some sharing an address, some differing),
  asserts count / total_cents sum / first-last dates / distinct-address de-dup, the
  count-equals-`admin_customer_order_counts` invariant (AC-9), the null-customer_id
  exclusion, and the zero-order shape.
- *(conditional)* `supabase/migrations/0014_admin_customer_aggregates.sql` — only if the
  aggregate-RPC option is chosen (see Research §Key Decisions). Idempotent, `security
  definer`, empty `search_path`, `service_role`-only, returns `(order_count bigint,
  total_cents bigint, first_order_at timestamptz, last_order_at timestamptz)` for one id.

### Files to Modify

- `src/components/admin/orders/customer-table.tsx` — wrap the desktop row name cell (and
  the mobile card) in a `Link` to `${ADMIN_CUSTOMERS_PATH}/${row.id}` (mirror
  `order-table.tsx`, which links only the order-number cell so the email stays selectable).
  Update the docstring (currently "Rows do NOT link"). Add
  `data-testid={`admin-customer-row-${row.id}`}`.
- `src/lib/config/*` (a small admin constants module) — add `CUSTOMER_ORDER_HISTORY_LIMIT`
  (named constant; no magic number) if the history read is bounded/paginated.
- `src/lib/admin/constants.ts` — *(optional)* a `customerDetailPath(id)` builder for a
  single URL source; inlining `${ADMIN_CUSTOMERS_PATH}/${id}` is consistent with the order
  detail's inlined path and acceptable — no change strictly required.
- `src/lib/supabase/types/rpc.ts` — *(conditional, only if the RPC option is chosen)* add
  the Args/Return **`type` aliases** and the Database `Functions` entry for the new
  aggregate RPC (never `interface` — collapses the generic to `never`).

### Data Model Changes

- **None required.** The page reads existing tables: `customers` (`id`, `email`,
  `full_name`, `phone`) and `orders` (`id`, `order_number`, `customer_id`, `created_at`,
  `total_cents`, `status`, `payment_status`, `contact_email`, `contact_phone`, all
  `shipping_*`). Index coverage already exists: `orders_customer_id_idx` on
  `orders(customer_id)` (migration 0003) serves both the history read and the aggregate.
- **Optional aggregate RPC** (0014) — a read-only helper; adds a function, not a table.

### API Endpoints

- **None.** This is server-component data fetching, not an HTTP API. The read is
  `getAdminCustomer(id)` in `customer-read.ts` (server-only), invoked directly by the RSC.
  No `/api/admin/*` route is added (so no route-handler self-guard is needed).

### Dependencies

- **None.** All primitives (badges, formatters, pagination, `notFound`, `Link`, hugeicons)
  already exist. No new npm package.

## Out of Scope

- Customer **accounts / auth** — Phase 1 has no customer login; this is an admin-only
  read view of guest records.
- **Editing** a customer (name/email/phone) or **merging** duplicate-email customer rows —
  read-only view only. (Merge is a real feature given the one-row-per-order model; flag
  for a future ticket, do not build here.)
- **Deleting** a customer.
- Cross-customer analytics, cohorts, LTV charts, or CSV export of customer data.
- Changing the `create_order` one-row-per-order behavior or adding email/phone dedup — the
  detail page must work correctly *with* the current keying, not change it.
- Any storefront-facing surface. Admin-only, neutral theme, es-MX.
