# Task: T12 — Admin: Order Management

## Priority

**Critical** — T12 is the last functional admin subsystem before launch prep (T14). It is refund-capable (real money movement via Mercado Pago) and is the operational surface the store Owner uses to fulfill every order: without it, no order can be advanced, shipped, cancelled, or refunded from the admin. It carries two binding security gates (session revocation, `/api/admin` self-guard) distilled from the T10/T11 audits that MUST close before refund-capable sessions ship. Blocked-by (T8/T9/T10) are all effectively done: the refund API, the status RPC, the email seams, and the auth core all exist and are tested — T12 is the wiring + UI layer that makes them live.

## Complexity

**high** — justified against the criteria:

- **New subsystem, 15+ files.** An entire `src/lib/admin/orders/` read/write/query/filter layer, a full `src/app/admin/(app)/orders/` route tree (list, detail, actions, packing-slip route), a new migration (0012), a session-payload change, dashboard wiring, and a nav flip. Easily 20+ files created/modified.
- **New data model + new RPC.** Migration 0012 adds order columns (tracking) + an internal-notes store + a session-version source + a NEW transactional `cancel_order` RPC (stock restore + status advance in one transaction), mirroring `create_order`'s guarded decrement in reverse.
- **New external integration wiring.** First live use of the T8 Mercado Pago refund API (`refundOrderPayment`) — full and partial refunds, cumulative-refund guard, idempotency, multi-payment complications (PP-000005 has 3 duplicate approved payments).
- **Architectural/security change.** Adds server-side session revocation (a SEC-M-1/ADR-2 gate) to the previously stateless admin session — touches the shared session codec used by every admin route.
- **Live-wiring three untested-in-prod email seams** branching on `transition_kind`.

Unambiguously the `high` tier (new system + new model + new integration + architectural change). Per `/full-cycle` auto-classification, `high` → run all 12 stages.

## Feature Type

- **Axis 1 (surface):** `full-feature` — substantial new admin UI (list, detail, history log, refund modal, packing slip) AND substantial new logic (RPC, refund wiring, email wiring, session revocation).
- **Axis 2 (stack):** `full-stack` — new SQL migration + RPC (backend), typed lib wrappers (backend), server actions + route handler (backend), and React server/client components (frontend).

All pipeline stages run at full depth. UI Design (3), UX (8), Security (9), Arch (10), Hacker (11) all apply.

## User Story

As the **store Owner**, I want to **find, inspect, and manage every order — advancing its status, shipping it with a tracking number, cancelling it with automatic stock restore, and issuing full or partial refunds — from one admin surface that keeps the customer informed by email at each step**, so that **I can fulfill and support orders end-to-end without touching the database, and never oversell, double-refund, or leave a customer uninformed.**

## Background

**What exists today (all backend, none wired to an admin UI):**

- **Schema (0003):** `orders` (immutable financial snapshot; mutable `status`, `payment_status`, `payment_method`, `mp_*`), `order_items` (immutable snapshot), `order_status_history` (with `transition_kind` from 0010), `customers` (guest records).
- **`advance_order_status` RPC (0009/0010):** the ONLY status-transition path. Atomic status + history write; idempotent; regression-guarded (`order_status_rank`); derives + persists `transition_kind`; payment-only mode (`p_order_status = null`) for refunds. Typed wrapper: `src/lib/payments/advance-order.ts` (`advanceOrderStatus`).
- **`record_refund` RPC + `payment_refunds` ledger + `refunded_total` (0009):** race-safe cumulative-refund guard, append-only, keyed by MP refund id.
- **`refundOrderPayment` (T8, `src/lib/payments/refund.ts`):** server-only full/partial refund via MP, idempotent, records the ledger, advances state. Called NOWHERE until T12 auth-gates it. Sandbox test data: **PP-000005** has 3 duplicate approved $6,999 payments; **PP-000004** an underpaid approved $2,499.
- **Email seams (T9, `src/lib/email/dispatch.ts`):** `sendShipped({trackingNumber, carrier, trackingUrl})`, `sendCancelled(reason)`, `sendRefundIssued(mpRefundId, refundedAmountCents)`, `sendNewOrderOwnerAlert` — all built + unit-tested, NOT live-wired for admin. Dedupe via `email_sends` ledger + `claimEmailSend`. Email kinds: `shipped`, `cancelled`, `refund_issued` (see `email-kinds.ts`).
- **Auth core (T10):** `hasValidAdminSession()`, `requireSession()`, session codec `session-payload.ts` with a reserved `{v, iat}` payload. `v` is currently a FORMAT version (`ADMIN_SESSION_VERSION = 1`), compared only for equality — there is NO server-side revocation, so a stolen cookie is valid for up to `getSessionMaxAgeSeconds()` (default 8h).
- **T11 patterns to adopt verbatim:** `src/lib/admin/products/{list-query,list-filters}.ts`, `src/lib/catalog/pagination.ts`, paired `*-input.ts`/`*-write.ts`, `src/app/admin/(app)/products/{page.tsx,actions.ts}`, and the self-guarded route handler `products/export/route.ts`.

**What's missing:** every admin UI and every wire. No `/api/admin/*` handler exists yet. `orders` has no tracking/carrier columns and no internal-notes store. The admin session cannot be revoked. The Orders nav item is `status: "soon"`. The dashboard (`/admin`) is a redirect stub with a T11/T12 seam comment.

**Why it matters:** this is the Owner's daily operational tool and the only refund path. It moves real money, so correctness (no double-refund, no oversell on cancel, exactly-once email) and security (no stolen-cookie refund window) are non-negotiable.

## Acceptance Criteria

Each is binary PASS/FAIL.

**Order list, search, filter**

- [ ] AC-1: `/admin/orders` renders a paginated list (25/page) of orders ordered by `created_at DESC`, each row showing order number, customer name, date, total (formatted MXN), order-status badge, and payment status.
- [ ] AC-2: A `?search=` term matches `order_number` (case-insensitive) OR `contact_email` OR `shipping_full_name`; PostgREST filter meta-chars are stripped from the term (mirrors `list-query.ts` m-3 defense).
- [ ] AC-3: A `?status=` filter constrains to one `order_status` (`pending_payment|paid|preparing|shipped|delivered|cancelled`) or `all`; a `?payment=` filter constrains to a `payment_status` or `all`; filters compose with search + pagination and are preserved across page changes.
- [ ] AC-4: Filters/search are parsed by a pure, bounded `parseOrderListFilters` (search length-capped, enums constrained) — a crafted `?` param can neither crash the read nor mint unbounded query shapes.

**Order detail + history log**

- [ ] AC-5: `/admin/orders/[id]` (id = order UUID) renders the full order: contact + shipping snapshot, line items (name/SKU/variant/qty/unit/line total), financial totals, current status + payment status, persisted tracking/carrier, and internal notes.
- [ ] AC-6: The detail page renders `order_status_history` as a chronological log (consistent direction), each entry showing from→to status, `transition_kind`, note, and timestamp.
- [ ] AC-7: A non-UUID or non-existent `[id]` renders `notFound()` (404), never a 500 or a partial render.

**Status pipeline + manual status → email**

- [ ] AC-8: The detail page offers only the valid next-status transitions (per `order_status_rank` forward-only lifecycle); an invalid/regressive transition is not offered and, if forced, is rejected by `advance_order_status` (`regression_blocked`) and surfaced as a friendly error — never a 500.
- [ ] AC-9: A manual status advance calls `advanceOrderStatus` (never a raw `.update`), and on `applied: true` fires the corresponding customer email exactly once, branching on the RETURNED `transition_kind`: `shipped` → `sendShipped`, `cancelled` → `sendCancelled`. Email NEVER string-matches note text.
- [ ] AC-10: An email-send failure does NOT roll back or block the status transition; it is logged and the UI still shows the transition succeeded (best-effort, T9 dispatch isolation).

**Tracking entry → email**

- [ ] AC-11: The Owner can enter a tracking number + carrier (+ optional tracking URL) on the detail page; it persists to the new `orders` tracking columns and, when the order is advanced to (or already at) `shipped`, `sendShipped` is called with those values.
- [ ] AC-12: Tracking input is validated (bounded length, trimmed); an empty tracking number is allowed (ship without tracking) and the shipped email renders with `trackingNumber: null`.

**Cancel → stock restore (transactional)**

- [ ] AC-13: Cancelling calls a NEW transactional `cancel_order` RPC (migration 0012) that, in ONE transaction: restores each line item's `quantity` to the product/variant `stock` (reverse of `create_order`'s decrement), advances status to `cancelled` writing an `order_status_history` row with `transition_kind='cancelled'`, and is idempotent (cancelling an already-cancelled order restores nothing twice).
- [ ] AC-14: On successful cancel, `sendCancelled` fires exactly once with the admin-supplied reason (nullable). Stock restore uses `order_items` snapshot quantities; a since-deleted product/variant (FK set null) is skipped without failing the cancel.
- [ ] AC-15: Cancel is NOT built on the T11 compensation pattern (no app-level "delete then re-insert on error") — it is a single SQL RPC transaction (mirrors `create_order` / `record_inventory_adjustment`).

**Full + partial refund via MP**

- [ ] AC-16: A "Refund" action opens a modal offering FULL or a PARTIAL amount (integer MXN → cents); it calls `refundOrderPayment(orderId, amountCents|null, idempotencyKey)` through a session-gated server action (the FIRST caller of `refund.ts`).
- [ ] AC-17: A full refund sets `payment_status='refunded'` (RPC payment-only path); a partial leaves it `paid`; both write a `payment_refunds` ledger row; a partial exceeding the remaining balance is refused (`over-refund`) with a friendly message, never a 500 and never a partial money move.
- [ ] AC-18: On a successful refund, `sendRefundIssued(mpRefundId, refundedAmountCents)` fires exactly once (deduped on the MP refund id, so repeated partials each email once).
- [ ] AC-19: The refund action threads a STABLE per-action idempotency key so a network retry of the same action is safe at MP (no double-refund), while two DISTINCT partial refunds of the same amount do NOT collide (per `refund.ts` H-1 contract).
- [ ] AC-20: A raw Mercado Pago error is NEVER echoed to the UI; the modal shows a friendly `mp-error` message and the order state is unchanged.

**Internal notes**

- [ ] AC-21: The Owner can add an internal note to an order, stored where only the admin reads it — never in `order_status_history.note` and never emailed; notes are shown newest-first with a timestamp.

**Packing slip (printable)**

- [ ] AC-22: A "Packing slip" action produces a printable slip (order number, ship-to, line items with qty/SKU) via a SELF-GUARDED `/admin/orders/[id]/packing-slip` route handler returning 401 when unauthenticated (mirrors `products/export/route.ts`).
- [ ] AC-23: The packing slip is print-optimized HTML (browser print-to-PDF), NOT a new PDF dependency (unless the research report justifies one); it renders for any order and shows a prominent "CANCELADO" banner for a cancelled order.

**Customer list**

- [ ] AC-24: A customer list (`/admin/orders/customers` or `/admin/customers`) renders a paginated list of `customers` (email, name, phone, order count), reusing the list-query/pagination pattern; searchable by email/name.

**New-order dashboard indicator + owner email**

- [ ] AC-25: The admin dashboard (`/admin`, replacing the redirect stub) shows a new-order indicator (count of orders in `pending_payment`/`paid` not yet advanced, or a since-last-viewed count) linking to the filtered list.
- [ ] AC-26: The owner new-order email (`sendNewOrderOwnerAlert`) stays wired at order creation (T9); T12 does NOT duplicate it — it only surfaces the dashboard indicator. A "last viewed" marker, if used, is persisted, not per-request.

**GATE — Session revocation (SEC-M-1 / ADR-2)**

- [ ] AC-27: Admin sessions gain a server-side revocation mechanism: a persisted session-version source is compared against the cookie payload's `v` on EVERY authoritative verify (`isSessionValid`/`hasValidAdminSession`), so incrementing the stored version invalidates all outstanding cookies (bounding the stolen-cookie window below the 8h max-age). If a version source is deemed out of scope, the max-age is shortened for refund-capable sessions instead — research picks one; the chosen mechanism MUST be live BEFORE the refund action ships.
- [ ] AC-28: A revoked/old-version cookie is rejected as unauthenticated (redirect to `/admin/login` for pages; 401 for route handlers) with no DB access.

**GATE — `/api/admin` self-guard**

- [ ] AC-29: EVERY T12 route handler (packing slip, and any other `route.ts`) self-calls `hasValidAdminSession()` at entry and returns 401 on failure — the middleware matcher excludes `/api` and route handlers are not covered by the `(app)` layout guard (mirrors `products/export/route.ts`).
- [ ] AC-30: Every T12 server action calls `requireSession()` FIRST, before any DB touch (mirrors `products/actions.ts`).

## Edge Cases

At least 8 that MUST be handled:

1. **Refund exceeds remaining balance** — a partial amount > (order total − prior refunded) is refused locally by `refund.ts` AND race-safely by `record_refund` (`over_refund`); UI shows "El monto supera el saldo reembolsable", order state unchanged.
2. **Partial refund of PP-000005's 3 duplicate approved $6,999 payments** — `orders.mp_payment_id` holds ONE payment id; `refundOrderPayment` refunds against that single id. The cumulative guard uses the ORDER total (not the sum of the 3 payments), so refunds cannot exceed the order total even though 3 payments landed. Reconciling the 2 extra duplicate charges is a manual MP-dashboard action (out of scope); the UI must NOT imply all 3 were refunded.
3. **Cancel after already shipped** — `cancel_order` still restores stock and marks `cancelled` (`cancelled` rank 5 is highest, so no regression-block), but the UI warns "El pedido ya fue enviado" and requires explicit confirmation; the shipped email already sent is not un-sent.
4. **Double status-transition race (two tabs / double-click)** — `advance_order_status` locks the row `FOR UPDATE`; the second call hits the idempotent same-status branch (`noop_same_status`, no duplicate history row, `transition_kind='noop'` → no second email).
5. **Invalid/regressive transition via `advance_order_status`** — e.g. `delivered` → `paid` returns `regression_blocked`; the action maps it to "Transición no permitida", no history row, no email, no 500.
6. **Refund on a cancelled order** — cancel does not change `payment_status`; a cancelled-but-`paid` order is still refundable (the refund path checks `payment_status === 'paid'`, not order status). Refunding a `pending`/`failed` payment returns `not-refundable` (`not-paid`) with a friendly message.
7. **Email-send failure mid-transition** — the DB write commits; `sendShipped`/`sendCancelled`/`sendRefundIssued` failure is caught + logged by dispatch, returns `{ok:false}`; the transition/refund is NOT rolled back and the UI reports success with a subtle "correo no enviado" note where surfaced.
8. **Packing slip for a cancelled order** — renders with a prominent "CANCELADO" banner so it is never mistaken for fulfillable; still self-guards (401 if unauth).
9. **Stolen-cookie window post-refund (security headline)** — after the revocation gate ships, a version bump immediately invalidates the stolen cookie so it cannot issue a further refund; before the gate the window is up to 8h — which is why AC-27 blocks the refund action from shipping without it.
10. **Concurrent partial refunds racing past the local pre-check** — two partials whose sum exceeds the total: the local pre-check may pass both, but `record_refund` (order-locked) rejects the second (`over_refund`); the second's MP money may have moved → `refund.ts` returns `error` and logs "reconcile by hand". UI shows a generic error and instructs the Owner to check the MP dashboard.
11. **Cancel with a since-deleted product/variant** — `order_items.product_id`/`variant_id` are `on delete set null`; `cancel_order` must skip a null reference when restoring stock without aborting the cancel.

## Error States Table

| Trigger                              | User Sees                                                                 | System Does                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| MP refund API failure / MP down      | "No se pudo procesar el reembolso. Intenta de nuevo." (modal stays open)  | `refund.ts` catches → `mp-error`; order/payment state UNCHANGED; raw error logged, not echoed        |
| Invalid/regressive status transition | "Esa transición no está permitida."                                       | `advance_order_status` → `regression_blocked`; no history row, no email; action returns typed error  |
| Stock-restore RPC failure (cancel)   | "No se pudo cancelar el pedido."                                          | `cancel_order` transaction rolls back atomically; stock + status unchanged; error logged             |
| Session expired / revoked mid-action | Redirect to `/admin/login` (page) or 401 (route handler)                  | `requireSession()`/`hasValidAdminSession()` fails BEFORE any DB touch                                 |
| Email provider down (any transition) | Transition shows success; subtle "correo no enviado" where surfaced       | Dispatch catches + logs; transition/refund NOT rolled back (T9 isolation)                            |
| Concurrent status update (two tabs)  | Both show the same final status; no duplicate history                     | `FOR UPDATE` lock + idempotent same-status branch; second call `noop_same_status`, no second email   |
| Over-refund (single or cumulative)   | "El monto supera el saldo reembolsable."                                  | Local pre-check + `record_refund` guard reject; `over-refund` result; no state change                |
| Non-UUID / missing order id          | 404 page (detail) / 401 or 404 (packing slip)                             | `notFound()`; route handler self-guards then validates the id                                        |
| Refund on non-paid payment           | "Este pago no es reembolsable."                                          | `refund.ts` → `not-refundable` (`not-paid`/`no-payment-id`)                                           |

## UX Requirements

**Order list**

- **Loading:** skeleton rows (match `ProductTable` skeleton cadence); enter animation `ease-out`, respect `prefers-reduced-motion`.
- **Empty:** "Aún no hay pedidos." with illustration; filtered → "Ningún pedido coincide con los filtros." + "Limpiar filtros" CTA (mirror `ProductEmptyState`).
- **Error:** inline banner "No se pudieron cargar los pedidos." with a retry link.
- **Success:** rows with status/payment badges; row click → detail.
- **Mobile (375px):** table collapses to stacked cards (order number + total + status prominent); filters in a sheet.
- **Tablet (768px):** condensed table inside an `overflow-x-auto` container; body never scrolls horizontally.

**Order detail**

- **Loading:** section skeletons for summary / items / history.
- **Empty:** n/a (detail always has an order or 404s).
- **Error:** section-scoped error if history/notes partially fail; the core order still renders.
- **Success:** clear status-pipeline stepper (current step highlighted), action buttons (Advance, Ship, Cancel, Refund, Packing slip) enabled per state.
- **Mobile (375px):** single-column stack; actions in a sticky bottom bar or menu; compact history log.
- **Tablet (768px):** two-column (summary + items | history + actions).

**Refund modal**

- **Loading:** submit button spinner + disabled while the MP call is in flight; modal not dismissable mid-request.
- **Error:** friendly message inline (see table); modal stays open with the amount preserved.
- **Success:** modal closes; detail shows updated payment status + a new ledger entry + toast "Reembolso emitido".
- **Mobile (375px):** modal becomes a full-height sheet; large tap-target amount input with an MXN affordance.
- **Tablet (768px):** centered dialog, max-width bounded.

**Packing slip**

- **Loading:** print view opens in a new tab / print dialog; spinner while the route responds.
- **Error:** 401 → login redirect; 500 → "No se pudo generar la guía."
- **Success:** print-optimized layout (`@media print`), no admin chrome, print button or auto `window.print()`.
- **Mobile/Tablet:** print stylesheet is device-agnostic; on-screen fallback scrolls vertically only.

## Technical Approach

### Files to Create

**Migration**

- `supabase/migrations/0012_admin_orders.sql` — (a) `orders` columns `tracking_number`, `tracking_carrier`, `tracking_url` (nullable text; verify against the 0003 immutability trigger's frozen set — new columns are not listed, so allowed; add them to the trigger's allowed-mutable reasoning if needed); (b) NEW `order_internal_notes` table (`id, order_id fk on delete cascade, body text check length, created_at`), RLS-deny + `service_role` grant (mirror 0011 posture); (c) NEW transactional `cancel_order(p_order_id uuid, p_note text)` RPC: lock the order, restore each `order_items` line's quantity to `products`/`product_variants` stock (skip null FKs), advance to `cancelled` writing the history row via `email_transition_kind` (`transition_kind='cancelled'`), idempotent (no-op if already cancelled), `SECURITY DEFINER` + empty `search_path` + `service_role`-only execute; (d) the session-revocation source per AC-27 (a single-row `admin_session_version`/`store_settings` value the verifier reads, or documented max-age shortening — decided in research); (e) supporting indexes (`orders(created_at desc)` already exists in 0003; add `customers` search indexes as needed). Idempotent, LOCAL-only, integer cents.

**Lib — `src/lib/admin/orders/`** (paired `*-input.ts` / `*-write.ts`; type contract lives HERE, not in app — avoid T11's lib→app inversion)

- `order-list-filters.ts` — pure `parseOrderListFilters` + `hasActiveFilters` + `buildOrderListQueryString` (mirror `products/list-filters.ts` verbatim in shape).
- `order-list-query.ts` — `listAdminOrders(filters)` (count → clamp → range via `pagination.ts`; search on order_number/email/name; status + payment filters). Mirror `products/list-query.ts`.
- `order-read.ts` — `getAdminOrder(id)` (order + items + history + notes + tracking); returns null → `notFound()`.
- `order-status-input.ts` / `order-status-write.ts` — parse/validate the requested transition (allowed next statuses from `order_status_rank`); write wraps `advanceOrderStatus` then branches email on the returned `transition_kind`.
- `order-tracking-input.ts` / `order-tracking-write.ts` — validate + persist tracking columns.
- `order-cancel-write.ts` — call the `cancel_order` RPC + `sendCancelled`.
- `order-refund-input.ts` / `order-refund-write.ts` — validate the amount, call `refundOrderPayment`, then `sendRefundIssued`; thread a stable idempotency key.
- `order-notes-write.ts` — insert/read `order_internal_notes`.
- `customer-list-query.ts` — `listAdminCustomers(filters)` (+ order counts).
- `packing-slip.ts` — pure print-HTML builder.
- `order-status-meta.ts` — es-MX status labels, badge variants, allowed-transition map (single-sourced constants — no magic strings).

**App — `src/app/admin/(app)/orders/`**

- `page.tsx` — list server component (mirror `products/page.tsx`).
- `actions.ts` — server actions `advanceStatus`, `setTracking`, `cancelOrder`, `refundOrder`, `addInternalNote` — each `requireSession()` first; only async exports.
- `orders-form-state.ts` — typed action state (state types NOT exported from `actions.ts`, per T10 rule).
- `[id]/page.tsx` — order detail + history + actions.
- `[id]/packing-slip/route.ts` — SELF-GUARDED route handler (mirror `products/export/route.ts`).
- `customers/page.tsx` — customer list.

**Components — `src/components/admin/orders/`**

- `order-table.tsx`, `order-filters.tsx`, `order-empty-state.tsx`, `order-status-badge.tsx`, `order-status-stepper.tsx`, `order-history-log.tsx`, `order-detail-actions.tsx` (client), `refund-modal.tsx` (client, shadcn Dialog), `tracking-form.tsx` (client), `internal-notes.tsx` (client), `packing-slip-view.tsx`, `customer-table.tsx`, `new-order-indicator.tsx`.

**Types**

- Add order/customer/notes row types to `src/lib/supabase/types/tables-commerce.ts` (hand-authored convention) and `cancel_order` Args/Result to `src/lib/supabase/types/rpc.ts` (keep as `type` aliases — the T8 `never`-collapse gotcha).

### Files to Modify

- `src/lib/admin/constants.ts` — flip the `orders` nav item `status: "soon"` → `"live"` (href already `/admin/orders`); add `ADMIN_ORDERS_PATH`, a per-page constant, and the session-version constant if the version source lives here.
- `src/lib/admin/session-payload.ts` + `session.ts` + `session-edge.ts` — extend the payload/verify so `v` (or a new field) is checked against the persisted revocation source (AC-27). Keep the codec crypto-free; wire the version read at the `session-guard.ts` / `isSessionValid` boundary. (If the decision is max-age shortening, modify `constants.ts` `getSessionMaxAgeSeconds` policy instead.)
- `src/app/admin/(app)/page.tsx` — replace the `redirect(ADMIN_SETTINGS_PATH)` stub with the dashboard overview + new-order indicator (the seam comment names this).
- `src/lib/checkout/order-read.ts` — the shipped email needs tracking fields; prefer passing `{trackingNumber, carrier, trackingUrl}` at the `sendShipped` call site (the seam already accepts them) rather than widening `getOrderForEmail`.
- `src/messages/es-MX.json` / `en.json` — confirm the `email` namespace has `shipped`/`cancelled`/`refund_issued` keys (T9 added them); admin page/nav copy stays inline es-MX (T10/T11 decision).

### Data Model Changes

- **`orders`** — add `tracking_number`, `tracking_carrier`, `tracking_url` (nullable text). Confirm outside the 0003 immutability trigger's frozen set (new → not listed → allowed).
- **`order_internal_notes`** — NEW table, RLS-deny + `service_role` grant.
- **Session version source** — a single-row `admin_session_version` (or a `store_settings` column) the verifier reads, OR a shortened max-age policy (research decides). If a table: RLS-deny + `service_role` grant.

### API Endpoints

- **`GET /admin/orders/[id]/packing-slip`** (route handler) — self-guarded (`hasValidAdminSession()` → 401). Response: `text/html` print view, `Cache-Control: no-store`. No body.
- **Server actions (not REST):**
  - `advanceStatus(orderId, targetStatus, note?)` → `{ ok, reason?, transitionKind? }`.
  - `setTracking(orderId, { trackingNumber, carrier, trackingUrl })` → `{ ok }`.
  - `cancelOrder(orderId, reason?)` → `{ ok, reason? }`.
  - `refundOrder(orderId, { mode: "full" | "partial", amountMxn? })` → `RefundResult`-derived `{ ok, kind?, reason? }`; threads a stable idempotency key.
  - `addInternalNote(orderId, body)` → `{ ok }`.

### Dependencies

- **No new runtime dependency for the packing slip** — print-optimized HTML + `@media print` + `window.print()` (the codebase has no PDF lib; research confirms none warranted). A server-side PDF lib would need a named justification in the research report; default is HTML print.
- Reuse: `@hugeicons/react` + `@hugeicons/core-free-icons`, `shadcn/ui` (Dialog for the refund modal, Badge for status), the Mercado Pago SDK via `refund.ts` (already a dependency).

## Out of Scope

- Customer accounts / order-history login (guest-only in Phase 1).
- Manual order creation from the admin (orders originate at checkout).
- Sales/revenue analytics dashboard (only a new-order indicator here).
- Bulk actions (multi-select status change / bulk refund).
- Low-stock alerts (separate Continuous-Improvement/Phase-2 item).
- CFDI / tax-invoice generation (Phase 3).
- Reconciling PP-000005's 2 extra duplicate MP charges from the admin (manual MP-dashboard action).
- Refund across multiple distinct MP payment ids for one order (Phase 1 refunds against `orders.mp_payment_id` only).
- A full session-management / admin-accounts system (the revocation gate is a single version bump, not per-user sessions).
