# Task: T17 — Admin: manual order entry (phone / offline orders)

## Priority

**High** — The owner is non-technical and sells by phone / in-showroom (PRODUCT_SPEC: "Operator: the business owner… Admin UX must be simple and forgiving"). Today an offline sale cannot be recorded at all: the only way an order exists is a customer completing storefront checkout + Mercado Pago. Every phone/showroom sale is currently invisible to stock, order history, packing slips, and the customer list. This closes a real revenue-recording gap and is an owner-approved scope addition (2026-08-03). Not launch-blocking for the storefront itself, hence High not Critical.

## Complexity

**medium** — New feature surface (a create-order form + product/variant picker + one server action + one lib input/write pair + a source badge), ~8–14 files changed, but it **rides entirely on existing, proven infrastructure**: the atomic `create_order` RPC (0008), the reusable server-side price/stock resolver `revalidateLines` + `assembleOrder` (`src/lib/checkout/`), the `advance_order_status` payment-only path (0009/0010), the `AdminPage` `actions` slot, the `TextField`/`MoneyField`/`SelectField`/`SwitchField` primitives, and the `requireSession()`→write→`revalidatePath` action grammar (T12). **No new order-creation RPC, no new order data model.** The genuinely new work is (a) a catalog product/variant picker UI, (b) resolving the `contact_email` NOT NULL constraint for email-less phone customers, and (c) making customer-facing email sends recipient-safe. NOT `high`: no new subsystem, no architectural change, no new integration, no new migration (recommended). NOT `low`: >5 files, a new UI surface (picker), and a real constraint decision.

## Feature Type

**full-feature** (full-stack). New admin UI (create form + product picker) AND new server logic (manual-order input validation, atomic create, source marking, optional offline-payment marking, recipient-safe emails). All standard-tier stages run at full depth. Admin surface is **es-MX only** (ADMIN FACTS) — no bilingual parity work.

## User Story

As the **store owner taking a phone or in-showroom order**, I want to **create a real order on a customer's behalf — picking catalog products with live stock and server-verified prices, entering their contact + shipping details, and marking it either pending-payment (charge later / on delivery) or already paid offline** — so that **the sale reserves stock, gets an order number, appears in my normal order list/detail with a clear "phone/manual" marker, and flows through the same fulfillment pipeline as an online order, without forcing a phone customer to have an email address.**

## Background

**What exists today** (verified in code — see research report):

- `create_order(payload jsonb)` (0008) is a `SECURITY DEFINER`, `search_path=''`, **`service_role`-only** RPC that atomically: guarded-decrements per-line stock (race-safe last-unit floor via `WHERE stock >= qty RETURNING id`), bumps `sales_count`, creates a `customers` row + `orders` snapshot + `order_items` + initial `order_status_history` row (with `transition_kind`), generates the `PP-000000` order number from `order_number_seq`, and is idempotency-keyed (a repeat key returns the original order, `reused:true`). Admin actions already invoke `service_role` RPCs (T12 `cancel_order`, `advance_order_status`), so **`create_order` is callable from an admin action as-is** — it does not inspect caller identity beyond the grant.
- `revalidateLines(submitted)` + `assembleOrder(...)` (`src/lib/checkout/checkout-read.ts`, `order.ts`) are a **clean, reusable server-side trust boundary**: given `{ productId, variantId, quantity }[]` (no trusted price), they re-read products/variants by id from the live DB, compute the effective unit price (`variant.price_override_cents ?? product.price_cents`), re-check live stock, and return either validated live-priced lines or per-line issues (`out-of-stock` / `price-changed` / `unavailable`). This IS "the same trust rules as checkout."
- `advance_order_status(p_order_id, p_order_status, p_payment_status, p_payment_method, p_mp_payment_id, p_note)` (0009/0010, `service_role`-only) supports a **payment-only mode** (`p_order_status = NULL`): sets `payment_status` (+ optional `payment_method`), derives `transition_kind='paid'` (`email_transition_kind`), and writes an audit history row. This is the legal path to "record offline payment as paid" (matches T12's payment-only precedent).
- `orders.payment_method text` (nullable) already exists, is already read into `AdminOrderDetail.paymentMethod`, and is displayed on the order detail. The admin order list/detail, filters, list-query, `AdminPage` `actions` slot, and form primitives (`src/components/admin/form/fields.tsx`: `TextField`, `MoneyField`, `SelectField`, `TextareaField`, `SwitchField`, `Banner`) are all in place.

**What's missing / why this matters:**

- **No create-order entry point in admin.** The orders list header (`AdminPage actions`) has only a "Clientes" link — no create affordance (`src/app/admin/(app)/orders/page.tsx`).
- **`orders.contact_email` is NOT NULL AND `customers.email` is NOT NULL** (0003). `create_order` inserts `contact_email` verbatim (no `nullif`) into BOTH tables. A phone customer may have no email → this constraint must be resolved.
- **Customer-facing email sends are not recipient-safe.** In `src/lib/email/dispatch.ts`, `sendOrderConfirmation` / `sendPaymentReceived` / `sendShipped` / `sendCancelled` / `sendVoucherInstructions` all resolve `to: order.contactEmail` and guard **only** `order unreadable` — there is no recipient-format guard. An email-less manual order would push an empty/sentinel `to` to the provider on any later T12 status change (shipped/cancelled/refund), producing repeated `{ok:false}` provider failures + log noise. This must be hardened as part of T17.
- **No source marker is set for manual orders.** Existing orders leave `payment_method` NULL until a payment webhook stamps `card|oxxo|spei|wallet`.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

**Entry point & auth**

- [ ] AC-1: The admin order list (`/admin/orders`) shows a primary "Nuevo pedido" button in the `AdminPage` `actions` slot (mirroring the products-list `admin-products-new` CTA: `Button asChild` + `PlusSignIcon` + `Link`), linking to `/admin/orders/new`, with `data-testid="admin-orders-new"`. The existing "Clientes" link is retained.
- [ ] AC-2: `/admin/orders/new` renders the manual-order form only for an authenticated admin. The page AND the `createManualOrder` server action each call `requireSession()` **before any DB read/write** (T12 AC-30). An unauthenticated request is redirected to login and the action performs no write.

**Form — customer & shipping**

- [ ] AC-3: The form collects contact name, contact email (**optional** — AC-11), contact phone (optional), and the full Mexican shipping address (full name, line1, optional line2, city, state, postal code, optional delivery notes, optional RFC) — matching the columns `create_order` persists.
- [ ] AC-4: Shipping state and postal code are validated with the **same** Mexican-address rules used at checkout (reuse `src/lib/checkout/address.ts`); an invalid CP/state fails validation with a field-level error and no order is created.

**Form — product/variant picker with live trust**

- [ ] AC-5: The admin adds one or more line items by searching the catalog (by name/SKU) and picking a product; if the product has variants, a variant MUST be chosen; quantity per line is entered (integer ≥ 1).
- [ ] AC-6: The picker shows **live stock** for the selected product/variant and the **server-recalculated** unit price at selection time — the live effective price (`variant.price_override_cents ?? product.price_cents`), never an admin-entered price (v1: catalog prices only; manual price override is Out of Scope).
- [ ] AC-7: On submit, line prices and stock are **re-verified server-side** via `revalidateLines` — client-sent prices are ignored. If any line is out-of-stock or its price changed since selection, the order is **not** created and the admin sees a per-line message (which line, live price / live stock) to adjust and resubmit.

**Shipping charge**

- [ ] AC-8: Shipping defaults to the value derived from Store Settings (flat rate / free-shipping threshold, via the existing checkout shipping resolver applied to the revalidated subtotal) and is **admin-overridable** on the form (a `MoneyField`). The final `shipping_cents` is whatever the admin confirms. Totals (`subtotal`/`shipping`/`discount`/`tax`/`total`) are assembled server-side by `assembleOrder` so every DB CHECK (`orders_total_identity`, `order_items_line_total_identity`) holds.

**Atomic creation**

- [ ] AC-9: Submitting a valid form creates a real order through the existing atomic `create_order` RPC: stock reserved (decremented), `order_number` issued from the sequence, `order_items` + an initial `order_status_history` row written, and a `customers` row created — all in one transaction. A generated per-submission idempotency key prevents a double-submit creating two orders.
- [ ] AC-10: The created order has `status = pending_payment` and (unless marked paid, AC-15) `payment_status = pending`, identical to a fresh checkout order — so it enters the normal list/detail/status pipeline with no special-casing. `locale` in the payload is set to `es-MX` (owner-taken order).

**Email-optional / contact_email**

- [ ] AC-11: The contact email field is **optional**. If blank, the order is still created (constraint resolved per the Technical Approach decision). A blank email never blocks creation.
- [ ] AC-12: The confirmation email is **opt-in** for manual orders (a `SwitchField`, default OFF — phone customers commonly lack email / the owner already spoke to them). When opted in AND a valid email was provided, `sendOrderConfirmation` fires. When not opted in, or no valid email, no confirmation is sent and this is NOT an error.
- [ ] AC-13 (recipient-safety, cross-cutting): After T17, the customer-facing sends (`sendOrderConfirmation`, `sendPaymentReceived`, `sendShipped`, `sendCancelled`, `sendVoucherInstructions`) **skip the provider call and return a benign result (`{ ok: true, sent: false }`) when `order.contactEmail` is absent or not a valid email**, so a later T12 status change (shipped/cancelled/refund) on an email-less manual order never errors or spams the provider. The status-change action surfaces this as `emailSent: false`, exactly like today's email-fail path — never a 500.

**Source marking**

- [ ] AC-14: The created manual order is marked manual/phone-sourced via `orders.payment_method = 'manual'` (single-sourced constant `MANUAL_ORDER_PAYMENT_METHOD` in `order-constants.ts`). The order **detail** displays a clear glyph+text badge "Pedido manual / telefónico". Listing/filtering the source is a nice-to-have (see Technical Approach) — the detail badge is the required surface.

**Offline payment as paid**

- [ ] AC-15: The form offers a payment choice: **"Marcar pendiente de pago"** (default — charge later / on delivery) or **"Registrar pago recibido (offline)"**. Choosing "pago recibido" marks the order paid via `advance_order_status` **payment-only mode** (`p_order_status = NULL`, `p_payment_status = 'paid'`, `p_payment_method = 'manual'`) **after** creation, writing a `transition_kind='paid'` audit history row. Choosing pending leaves `payment_status = 'pending'`.
- [ ] AC-16: When an offline order is marked paid, **no "payment received" email is sent** by default: `sendPaymentReceived` is a payment-webhook seam dedupe-keyed on `mp_payment_id` (which a manual order lacks), and `fireTransitionEmail` intentionally sends nothing for `transition_kind='paid'`. The only possible customer email is the AC-12 confirmation (if opted in with a valid email).

**Pipeline integration**

- [ ] AC-17: The created order appears immediately in `/admin/orders` (list revalidated) and its detail (`/admin/orders/[id]`) renders the full order (contact, shipping, items, totals, history incl. the create + optional paid rows, source badge) with zero errors, and a packing slip can be printed for it.

**Tests**

- [ ] AC-18: A pure `manual-order-input.ts` has unit tests: valid payload; missing required contact/shipping fields; invalid CP/state; zero-item order; invalid quantity (0/neg/non-int/INT4 cap); blank vs valid email branching; payment-choice branching; confirmation opt-in branching. A `manual-order-write.ts` has unit tests: `create_order` payload shape (deps mocked); the optional confirmation-send branch; the optional `advance_order_status` paid branch; source-marking. Mirrors the T12 `order-*-input.test.ts` / `order-*-write.test.ts` pairs.
- [ ] AC-19: An integration test against local Supabase creates a manual order end-to-end through `create_order` and (paid variant) `advance_order_status` via the service-role client, asserting: stock decremented, order number issued, `payment_method='manual'`, history rows present with correct `transition_kind`; and — email-less variant — that the recipient-safe guard makes a subsequent `sendShipped`-style resolve to the no-recipient skip (not an error). Mirrors `tests/integration/admin-orders-*.integration.test.ts` (server-only aliased to empty.js).
- [ ] AC-20: An admin e2e (serial DEV-server project per E2E/ENV INFRA) logs in, opens `/admin/orders/new`, adds a line via the picker, fills contact (email-less variant) + shipping, submits pending-payment, and asserts the new order appears and opens on detail with the manual badge.

## Edge Cases

1. **Stock race on create** — Admin picks a product showing stock 1; between selection and submit another order (online or another admin tab) buys the last unit. Expected: `create_order`'s guarded decrement matches zero rows → raises `OUT_OF_STOCK:<pid>:<vid|->` → whole transaction rolls back → the action maps it to a per-line "sin stock" message; NO partial order, NO negative stock. (Reuses the exact checkout mechanism.)
2. **Zero-item order** — Admin submits with no line items. Expected: input validation rejects ("Agrega al menos un producto"); `create_order` is never called (an empty `items` array would otherwise create a $0, line-less order).
3. **Duplicate / double submit** — Admin double-clicks submit or the action re-runs. Expected: a per-submission idempotency key (minted once on form load) is threaded into `create_order`; the second call returns the original (`reused:true`) → exactly one order, one stock decrement. Submit is also disabled while in flight.
4. **Email absent** — Phone customer has no email; admin leaves it blank and does not opt into confirmation. Expected: order created successfully (constraint resolved), `payment_method='manual'`, no customer email attempted; a later "Marcar enviado" sends no email and shows `emailSent:false` without error (AC-13).
5. **Price change mid-entry** — Admin selected a product at $4,999; before submit the live price changed to $5,499. Expected: `revalidateLines` flags the line `price-changed` with the live price; order not created; admin sees "el precio cambió a $5,499" per line and can resubmit — never silently charges the stale price.
6. **Invalid quantity** — Admin enters 0, negative, non-integer, or beyond the INT4 sanity cap. Expected: input validation rejects with a field error; `create_order` never called (defends the `quantity > 0` CHECK and the shared INT4 parser boundary).
7. **Marked-paid + email-less** — Admin records offline payment as paid for an email-less order. Expected: `advance_order_status` payment-only sets `paid` + `payment_method='manual'` + a `transition_kind='paid'` history row; no `sendPaymentReceived` (no `mp_payment_id`); no confirmation unless opted-in with a valid email; no error.

## Error States Table

| Trigger | User Sees | System Does |
| ------- | --------- | ----------- |
| Out-of-stock line on submit (edge 1) | Per-line banner "Sin stock — quedan N" on the affected line; values preserved | `create_order` raises `OUT_OF_STOCK`, tx rolls back; action maps to line issue; no order, no stock change |
| Price changed since selection (edge 5) | Per-line "El precio cambió a $X"; values preserved | `revalidateLines` returns `price-changed`; action aborts before `create_order`; nothing written |
| Zero items (edge 2) | Form-level error ("Agrega al menos un producto") | Input validation fails; no RPC call |
| Invalid CP / state (AC-4) | Field-level error on postal code / state | `address.ts` validators fail; no RPC call |
| Invalid quantity (edge 6) | Field-level error on the line quantity | Input validation fails; no RPC call |
| Double submit (edge 3) | Button disabled ("Creando…"); one order on completion | Idempotency key → `create_order` returns `reused:true`; one order |
| Session expired mid-form | Redirect to `/admin/login` on submit | `requireSession()` redirects before any write |
| `advance_order_status` paid step fails after create | Order still created (pending); banner "Pedido creado, pero no se pudo marcar pagado — hazlo desde el detalle" | Create succeeded; paid step non-applied; NOT rolled back (order exists) |
| Confirmation email fails (opted in, valid email) | Non-blocking notice "Pedido creado. El correo de confirmación no pudo enviarse." | Order created; `sendOrderConfirmation` `{ok:false}`; surfaced as `emailSent:false`, no rollback |
| Email-less order later shipped/cancelled (AC-13) | On the T12 status action: "Estado actualizado (sin correo — falta email)" | Send skipped at the no-recipient guard; `emailSent:false`; no provider call, no 500 |

## UX Requirements

For every state of `/admin/orders/new`:

- **Loading**: Standard admin shell (`AdminPage title="Nuevo pedido"`); the catalog product search shows a spinner/skeleton while querying; submit shows "Creando…" and is disabled during the in-flight action.
- **Empty**: Fresh form with zero line items — a clear "Agrega productos al pedido" empty row with the product-search affordance prominent; totals show $0 until a line is added.
- **Error**: Field-level errors under the relevant inputs (contact/shipping/quantity); per-line issue banners (out-of-stock / price-changed) attached to the offending line with the live value; a form-level error region (`role="alert"`, `Banner tone="error"`) for whole-form failures (zero items, session). Values preserved on re-render.
- **Success**: On create, redirect to the new order's detail (`/admin/orders/[id]`) with an inline success banner ("Pedido PP-000123 creado", `role="status"`, `.enter-fade`, auto-hide ~6s) — the standard T12 create→detail landing so the owner continues fulfillment.
- **Mobile (375px)**: Single-column stacked form; line items render as stacked cards (product, variant, qty, live price, remove), not a wide table; `min-w-0` + `break-words` on long product names/SKUs (T12 UX overflow fix); product-search results full-width, tappable; no horizontal overflow.
- **Tablet (768px)**: Two-column contact/shipping where space allows; line items may use a compact table; totals panel visible alongside or below.

Motion follows the shipped admin grammar (enter `ease-out`, transform/opacity only, `prefers-reduced-motion` honored, hover gated to hover-capable pointers). Status/source badges are **glyph + text**, never color alone (mirror `ProductStatusBadge` / order badges). Admin copy is **es-MX only**.

## Technical Approach

### Files to Create

- `src/app/admin/(app)/orders/new/page.tsx` — create-order route (RSC shell): `requireSession()`, resolve Store Settings for the default shipping charge, render the client form. Mirrors `products/new/page.tsx`.
- `src/app/admin/(app)/orders/new/manual-order-form.tsx` — client form island (`"use client"`, `useActionState`): contact + shipping fields (`TextField`/`SelectField`/`TextareaField`), the line-items editor + product/variant picker, shipping-override `MoneyField`, payment-choice radio/select, confirmation-email `SwitchField` (default off), submit with in-flight disable + idempotency key.
- `src/components/admin/orders/manual-order-line-editor.tsx` (+ a product-picker subcomponent) — searchable catalog product/variant picker showing live stock + server-recalculated price. Reuse the products `list-query`/search for search, `dropdown.tsx` grammar, and the storefront `variant-selector.tsx` interaction pattern (no existing admin product picker exists — this is the main new UI).
- `src/lib/admin/orders/manual-order-input.ts` (+ `.test.ts`) — **pure** input parse/validate → typed `ManualOrderInput`; contact (optional email via `EMAIL_PATTERN`), shipping (reuse `address.ts`), lines (≥1, `quantity>0` via the shared INT4 parser), payment choice, confirmation opt-in. No I/O.
- `src/lib/admin/orders/manual-order-write.ts` (+ `.test.ts`) — write orchestration: `revalidateLines` → on issues, return them; else `assembleOrder` → `create_order` (service-role, idempotency key, resolved `contact_email`, `locale='es-MX'`, `payment_method` NOT settable via create_order so stamp after) → set `payment_method='manual'` → if paid-choice, `advance_order_status` payment-only paid (also carries `payment_method='manual'`) → if confirmation opt-in + valid email, `sendOrderConfirmation`. Returns typed result (orderId, orderNumber, lineIssues?, emailSent, markedPaid).
- `tests/integration/admin-orders-manual.integration.test.ts` — end-to-end against local Supabase (AC-19).
- `e2e/admin-orders-manual.spec.ts` — admin serial e2e (AC-20).

### Files to Modify

- `src/app/admin/(app)/orders/page.tsx` — add the "Nuevo pedido" CTA to `AdminPage actions` (copy the `admin-products-new` pattern; keep the Clientes link).
- `src/app/admin/(app)/orders/actions.ts` — add `createManualOrder(prevState, formData)`: `requireSession()` first → call `manual-order-write` → `revalidatePath(ADMIN_ORDERS_PATH)` (+ detail) → redirect to detail on success. Follows the existing `advanceStatus`/`cancelOrder` grammar.
- `src/lib/email/dispatch.ts` — **recipient-safety guard (AC-13)**: add a `resolveCustomerRecipient(order)` helper returning a valid address or null (validate with `EMAIL_PATTERN`); in each customer-facing send, if null → return `{ ok: true, sent: false }` (benign skip) instead of pushing an empty `to`. Real-email behavior unchanged. Add a unit test for the skip branch.
- `src/lib/admin/orders/order-constants.ts` — add `MANUAL_ORDER_PAYMENT_METHOD = "manual"`.
- `src/lib/admin/orders/order-status-meta.ts` — add the source badge label/glyph (a `sourceBadge`/`isManualOrder` helper) so the detail (and optionally list) renders "Pedido manual / telefónico" from `payment_method === 'manual'`.
- `src/app/admin/(app)/orders/[id]/page.tsx` (or the detail header component) — render the manual-source badge when `paymentMethod === 'manual'`.
- (Optional, if cheap) `src/lib/admin/orders/order-list-query.ts` — add `payment_method` to the row select so the list can badge manual orders; `order-list-filters.ts` — a `source` filter (nice-to-have; may be deferred without failing an AC).

### Data Model Changes

- **None required.** `orders.payment_method` (nullable text) carries the `'manual'` marker. `create_order`, `advance_order_status`, `customers`, `order_items`, `order_status_history` are reused unchanged. Migration count stays at **0013**.
- **Contact_email decision (recommended, no migration):** keep `contact_email`/`customers.email` NOT NULL; when the admin leaves email blank, `manual-order-write` substitutes a **single, well-defined non-delivering placeholder** (e.g. the store's own contact email from Store Settings, or a documented no-reply sentinel) so both NOT NULL columns are satisfied, AND the recipient-safety guard (AC-13) ensures no send is ever attempted to that placeholder (guard treats the sentinel / store-address-as-customer as no-recipient). This avoids a 2-column nullable migration + auditing every downstream reader that assumes a string. See research report Q2 for the tradeoff of the rejected alternatives (nullable migration; raw sentinel visible in list/search).

### API Endpoints

- **No new HTTP endpoints.** All work is via the Next server action `createManualOrder` (`orders/actions.ts`), consistent with the whole admin surface. Underlying DB access is the existing `service_role` RPCs `create_order` and `advance_order_status`.

### Dependencies

- **None new.** Reuses in-repo modules: `@/lib/checkout/checkout-read` (`revalidateLines`), `@/lib/checkout/order` (`assembleOrder`, `formatOrderNumber`), `@/lib/checkout/address`, the Store-Settings shipping resolver, `@/lib/email/dispatch`, `@/lib/admin/require-session`, the `@/lib/admin/rpc` typed args for `create_order`/`advance_order_status`, `@/components/admin/form/fields`, `@/components/admin/admin-page`, `@/components/product/variant-selector` (pattern), `@/lib/config/checkout` (`EMAIL_PATTERN`).

## Out of Scope

- **Manual price override / manual discount per line** — v1 uses catalog prices only (server-recalculated); a price-override field is explicitly deferred (flagged, not built).
- **Discount-code entry on manual orders** — the `create_order` discount path exists but is not exposed here in v1.
- **A "payment received (offline)" customer email** — not sent (AC-16); `sendPaymentReceived` stays a payment-webhook seam.
- **Editing an existing order's line items after creation** — manual orders are immutable snapshots like online orders (status transitions only, via T12).
- **Customer account linking / dedupe** — a manual order creates a guest `customers` row exactly like checkout (Phase 1 has no accounts).
- **True nullable `contact_email` / `customers.email` schema change** — recommended against (see decision); documented as the alternative if a later review requires it (would be migration 0014).
- **A dedicated `source`/`channel` enum column** — reusing `payment_method='manual'` is the least-invasive marker; a first-class source column is a Phase-2 cleanup if manual orders proliferate.
- **Bilingual admin** — admin is es-MX only.
