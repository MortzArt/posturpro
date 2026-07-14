# Task: T7 — Checkout & Order Creation

## Priority

**Critical** — Checkout is the revenue gate of the store. Every prior task (T1–T6)
exists to funnel a shopper here; without it the catalog, cart, and shipping math
are unsellable. It is also the first task that writes an immutable financial
record and the last one before payments (T8), so getting the order snapshot,
stock reservation, and math exactly right is a hard dependency for T8–T12.

> **HUMAN-REVIEW GATE (BUILD_PLAN rule 3).** Checkout changes are ALWAYS flagged
> for human review before merge, regardless of any pipeline SHIP verdict. The
> pipeline may reach a green verdict, but the final merge decision is the user's.
> The Verify stage must surface this explicitly and NOT auto-merge.

## Complexity

**high** — Justified against the criteria:

- New subsystem: the first server-side write path to the commerce tables
  (`orders`, `order_items`, `customers`), a new multi-step client flow, new
  routes (`/checkout` + a confirmation route), a new pure validation lib (Mexican
  address + discount + totals), and a new atomic stock-reservation DB function.
- 15+ files touched: a Postgres migration (atomic reserve-and-create RPC +
  order-number helper), a new `src/lib/checkout/*` cluster (address validation,
  Mexican state/CP data, order-number generation, discount validation, totals
  assembly, live re-validation read), a `"use server"` action + form-state
  contract, a client form flow (contact → shipping → review), a confirmation
  page, seed additions (zero-stock variant + discount codes), a new `checkout`
  i18n namespace in both message files, and config constants.
- Architectural decisions: RLS-bypassing admin client for the write path,
  snapshot re-validation boundary (price + stock), atomic overselling protection
  under concurrency, and an idempotency strategy so a double-submit does not
  create two orders or double-decrement stock.

## Feature Type

**full-stack** — A substantial client surface (multi-step checkout form,
order-summary review, confirmation page, all states) AND a substantial backend
(server action, admin-client writes, atomic stock reservation, discount
validation, order-number generation). All pipeline stages run at full depth.

## User Story

As a **guest shopper in Mexico with items in my cart**, I want to **enter my
contact and shipping details, apply a discount code, review my order total with
shipping, and place the order**, so that **I receive an order confirmation and my
purchase is recorded — ready for me to pay (payment lands in T8).**

## Background

**What exists today (T1–T6, all complete):**

- The full commerce schema is migrated (`0003_commerce.sql`): `orders`,
  `order_items`, `order_status_history`, `customers`, `discount_codes` (table
  only), `store_settings`. All money is integer cents. `orders` has DB-level
  CHECK constraints checkout MUST satisfy exactly:
  - `orders_total_identity`: `total = subtotal + shipping + tax − discount`
  - `orders_discount_within_subtotal`: `discount ≤ subtotal`
  - `order_items_line_total_identity`: `line_total = unit_price × quantity`
  - `currency = 'MXN'`; `order_number` is `NOT NULL UNIQUE`; all `*_cents ≥ 0`.
  - An **immutability trigger** (`orders_block_snapshot_update`) freezes the
    financial/contact snapshot on any later UPDATE — checkout is the only place
    these columns are ever written.
- Order/payment lifecycle enums exist: `order_status` starts at
  `pending_payment`; `payment_status` starts at `pending`. Checkout leaves the
  order in exactly this pre-payment state (no capture — that is T8).
- The client cart is live (T6): `useCart()` from
  `@/components/cart/cart-provider` exposes `{ lines, itemCount, subtotalCents,
  hydrated, addItem, setQuantity, removeItem, keyFor }`. `CartLine`
  (`src/lib/cart/cart-line.ts`) is a **client snapshot** documented as NEVER
  authoritative at pay time.
- Pure shipping math exists (`src/lib/cart/shipping.ts`): `computeShipping`,
  `totalCents`, `freeShippingProgress` — integer cents, reads flat-rate +
  free-threshold from `store_settings` via `getStoreSettingsStatic()`. Free ship
  is `subtotal >= threshold`. Checkout MUST reuse these, never re-derive.
- `CHECKOUT_PATH = "/checkout"` already exists in config; the cart's checkout CTA
  links here and currently 404s until this task ships.
- The Q&A submission flow (`src/app/[locale]/producto/[slug]/actions.ts` +
  `qa-form.tsx` + `qa-form-state.ts`) is the exact precedent for a
  `useActionState` server-action form with a friendly-status result union.

**What's missing (this task):**

- The `/checkout` route and its multi-step client flow.
- Server-side re-validation of every cart line's **price and stock** against the
  live DB (the snapshot boundary).
- **Atomic stock reservation** to prevent overselling the last unit under
  concurrency.
- Discount-code **validation** against `discount_codes` (the FIELD is in scope;
  the management UI is Phase 2 and out of scope).
- Order + order-item + customer record creation via the RLS-bypassing admin
  client (RLS fully denies anon writes to these tables — confirmed).
- An order-confirmation page keyed by order number.

**Why it matters:** This is the money path. It writes an immutable financial
record and reserves inventory. A totals bug fails a DB CHECK (order won't
insert); an unatomic decrement oversells the last unit; a snapshot trusted at pay
time lets a client tamper price. All three are addressed here.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

**Flow & routing**

- [ ] AC-1: Visiting `/checkout` (and `/en/checkout`) with a **non-empty** cart
      renders the checkout flow: contact info, shipping address, delivery notes,
      discount field, and an order summary (subtotal, shipping, discount, total)
      computed via `computeShipping`/`totalCents` from `src/lib/cart/shipping.ts`.
- [ ] AC-2: Visiting `/checkout` with an **empty** cart (or a cart that becomes
      empty) shows an empty-state with a CTA back to the catalog (`CATALOG_PATH`),
      and NEVER lets the user submit an empty order.
- [ ] AC-3: The checkout page fetches shipping settings server-side via
      `getStoreSettingsStatic()` and passes `shipping_flat_rate_cents` /
      `free_shipping_threshold_cents` down, exactly as `carrito/page.tsx` does.
      Shipping is displayed with the same three-state (`flat` / `free` /
      `unavailable`) logic as the cart.

**Address & contact validation (Mexican)**

- [ ] AC-4: The shipping form validates a **Mexican postal code** as exactly 5
      digits (`/^\d{5}$/`), and the **state** against the closed list of 32
      Mexican states (single-sourced constant). An invalid CP or state blocks
      submit with a field-scoped, localized error.
- [ ] AC-5: Contact email is validated (non-empty, basic email shape),
      `shipping_full_name`, `address_line1`, `city`, `state`, `postal_code` are
      all required and non-blank after trim (mirroring the DB `NOT NULL` +
      `customers_full_name_nonblank` CHECK). `address_line2`, `contact_phone`,
      `delivery_notes`, and `rfc` are optional. All validation is a **pure,
      unit-tested** function (Q&A `submit-guard.ts` pattern), re-run on the
      server — the client check is UX only, never the security boundary.

**Discount code (field only — Phase 2 management UI is out of scope)**

- [ ] AC-6: An entered discount code is validated server-side against
      `discount_codes`: it must exist (case-insensitive/normalized match), be
      `is_active = true`, be within its `starts_at`/`ends_at` window (when set),
      respect `min_subtotal_cents` (when set), and respect `max_redemptions` vs
      `times_redeemed` (when set). A valid code applies its discount:
      `percentage` → `round(subtotal × value / 100)` (integer cents),
      `fixed_amount` → `min(value, subtotal)`. The applied discount is clamped so
      `discount_cents ≤ subtotal_cents` (DB CHECK).
- [ ] AC-7: An invalid/expired/inactive/unknown/below-min/exhausted discount code
      shows a friendly localized message and the order proceeds at full price (a
      bad code never blocks checkout). The discount field is optional.

**Stock re-validation & reservation (overselling protection)**

- [ ] AC-8: On submit, the server re-reads every cart line's live
      product/variant from the DB and re-validates: (a) the product exists and is
      `active`; (b) the **unit price** equals the current effective price
      (variant `price_override_cents ?? product price_cents`); (c) live stock ≥
      requested quantity for the specific variant (or product, no-variant case).
      Any mismatch aborts the order with a specific, per-line, localized message
      and NO order is written.
- [ ] AC-9: Order creation reserves stock **atomically**: a single Postgres
      function decrements each line's `product_variants.stock` (or
      `products.stock` for no-variant lines) with a guard that the row still has
      enough stock, and inserts the `orders` + `order_items` +
      `order_status_history` rows in the **same transaction**. If any line lacks
      stock at commit time, the whole transaction rolls back — no partial order,
      no partial decrement. Two concurrent checkouts for the last unit: exactly
      one succeeds, the other gets an out-of-stock error. Stock never goes
      negative (DB `stock >= 0` CHECK is the floor).
- [ ] AC-10: On successful reservation the purchased product's `sales_count` is
      incremented by the quantity within the same transaction (feeds
      best-selling sort). [If deliberately deferred to T8-on-payment, that must
      be stated in dev-done.md; default is: increment at order creation.]

**Order record & confirmation**

- [ ] AC-11: A successful checkout writes: one `customers` row (guest record:
      email, full_name, phone), one `orders` row with `status =
      'pending_payment'`, `payment_status = 'pending'`, a unique generated
      `order_number`, the full contact+shipping snapshot, and the financial
      snapshot (`subtotal_cents`, `shipping_cents`, `discount_cents`,
      `tax_cents = 0`, `tax_base_cents = 0`, `total_cents`) satisfying every DB
      CHECK, plus one `order_items` row per cart line with snapshot
      `product_name`, `product_sku`, `variant_label`, `unit_price_cents`,
      `quantity`, `line_total_cents`. An `order_status_history` row records the
      initial `pending_payment` state (`from_status = null`).
- [ ] AC-12: All commerce writes go through the **admin client**
      (`createAdminClient`, RLS-bypassing) — anon has no grant/policy on these
      tables (confirmed in `0005_rls_policies.sql`). The secret key never enters
      the client bundle (the `import "server-only"` guard already enforces this).
- [ ] AC-13: After success the user lands on a confirmation page that shows the
      order number, an order summary (items, totals), the shipping address, and a
      "no payment yet — payment is the next step (T8)" note. The client cart is
      cleared on confirmation.
- [ ] AC-14: A double-submit (double click / retry) does NOT create two orders or
      double-decrement stock. [Idempotency strategy — a client-generated
      idempotency key threaded to the action, or a submit lock + a unique
      constraint on that key — is chosen in dev and documented in dev-done.md.]

**Placeholder / config discipline**

- [ ] AC-15: Every new tunable (order-number prefix/format, CP regex, the 32
      states list, tax rate = 0 for Phase 1, confirmation route) is a NAMED,
      documented constant in `src/lib/config.ts` (BUILD_PLAN rule 4). Tax is `0`
      in Phase 1 but written to `tax_cents`/`tax_base_cents` so CFDI (Phase 3)
      needs no schema rework — this is documented.

**i18n & money**

- [ ] AC-16: All user-facing strings live in a new `checkout` namespace in BOTH
      `src/messages/es-MX.json` and `src/messages/en.json` (Spanish default). No
      hardcoded copy. All money renders via `formatMXN` only; all arithmetic is
      integer cents.

## Edge Cases

At least five — the unhappy paths that MUST be handled:

1. **Price drift between add-to-cart and checkout.** A product's price changed
   after it entered the cart, so the snapshot `unitPriceCents` no longer matches
   the live effective price. → Server re-validation (AC-8) detects the mismatch,
   aborts, and shows a per-line "price updated, please review" message; the cart
   line is refreshed to the live price (or the user re-confirms). No order is
   written at the stale price.

2. **Last-unit race (overselling).** Two shoppers submit checkout for the last
   unit of the same variant within milliseconds. → The guarded atomic decrement
   (AC-9) guarantees exactly one succeeds; the loser's transaction rolls back and
   they see "this item just sold out" with the affected line highlighted. Stock
   never goes negative.

3. **Cart mutated in another tab during checkout.** The user empties the cart in
   another tab, then submits here. → The submit finds zero valid lines (client
   and/or server) and redirects to the empty-state (AC-2) rather than writing a
   zero-line order.

4. **Tampered cart snapshot.** A client edits localStorage to set
   `unitPriceCents` to 1 cent, `quantity` to 9999, or an invalid
   `productId`/`variantId`. → The server IGNORES the snapshot price entirely and
   recomputes from the live DB (AC-8); quantity is clamped to
   `[1, MAX_CART_ITEM_QUANTITY]` then re-checked against live stock; a
   non-UUID/absent id makes that line invalid and aborts checkout. Cart money is
   NEVER trusted for the order total.

5. **`store_settings` unavailable at checkout.** The single settings row is
   missing/unreadable → `computeShipping` returns `{ kind: "unavailable" }`. The
   flow MUST NOT silently write `shipping_cents = 0`. Behavior: block submission
   with "shipping can't be calculated right now, please try again"; settings are
   required to place an order. Never render `$NaN`.

6. **Discount code that would exceed subtotal.** A `fixed_amount` code worth more
   than the cart subtotal. → Discount is clamped to the subtotal (AC-6) so
   `discount ≤ subtotal` (DB CHECK) and `total ≥ 0`; never a negative total.

7. **Double-submit / network retry.** User double-clicks "Place order" or the
   request times out and they retry. → Idempotency (AC-14) yields a single order;
   the button is disabled while `pending` (Q&A precedent), and the server path is
   idempotent as the real backstop.

8. **DB CHECK rejection (defense-in-depth).** A totals-assembly bug produces
   `total ≠ subtotal + shipping − discount`. → `orders_total_identity` rejects
   the insert; the action maps this to a generic "couldn't place order, please
   try again" (never echoing the raw PG error) and logs it with context. No
   partial write survives (single transaction).

## Error States Table

| Trigger | User Sees | System Does |
| --- | --- | --- |
| Required field empty / bad email / bad CP / non-Mexican state | Field-scoped localized error; focus to first invalid field; entered values preserved | Client + server pure validation reject before any DB write |
| Discount code invalid/expired/inactive/below-min/exhausted | Inline "code not valid" note under the field; order proceeds at full price | Server validates against `discount_codes`; discount = 0; no throw |
| Price drift (snapshot ≠ live) | Per-line "price changed, please review"; totals refresh to live price | Server re-validation aborts; cart line updated to live price; no order written |
| Line out of stock / last-unit race lost | Per-line "just sold out"; line highlighted; submit blocked | Guarded decrement fails; transaction rolls back; no order, no partial decrement |
| Cart empty at submit | Empty-state with catalog CTA | Redirect to empty-state; zero-line order never created |
| `store_settings` unreadable | "Shipping can't be calculated right now — please try again" banner; submit disabled | `computeShipping` → `unavailable`; action refuses to write an order |
| Double-submit / retry | Button disabled/pending; second identical submit yields the SAME confirmation | Idempotency key / submit lock; single transaction |
| Discount > subtotal | Discount shown clamped to subtotal; total ≥ 0 | Discount clamped so DB CHECK passes |
| Admin/DB write failure (RLS, connection, CHECK violation) | Generic "we couldn't place your order, please try again" | Error mapped to a friendly enum; raw PG message logged, never echoed; nothing partial persists |
| Network failure mid-submit | Retryable error banner; form + entered values preserved | Action returns retryable status; server idempotent on retry |

## UX Requirements

For EVERY state the checkout UI can be in:

- **Loading (pre-hydration):** The cart is client/localStorage-hydrated. Before
  `hydrated` is true, render a checkout skeleton (mirror the cart's
  `CartSkeleton` opacity-crossfade) — never a flash of the empty-state or a $NaN
  total.
- **Loading (submitting):** "Place order" shows a disabled/pending state with a
  spinner and localized "Procesando…" (Q&A `pending` precedent). The whole form
  is non-interactive during submit; the action is not re-callable.
- **Empty:** Cart empty → centered empty-state: icon, "Tu carrito está vacío",
  primary CTA to `CATALOG_PATH`. No form shown.
- **Error (field):** Inline error under the field, `aria-invalid` +
  `aria-describedby` wired, focus to the first invalid field, entered values
  preserved across the failed submit.
- **Error (form/global):** Dismissible banner atop the summary with an alert icon
  and a recovery action (retry / "review your cart"). Reuse the Q&A
  `HugeiconsIcon` alert pattern.
- **Success:** Redirect to the confirmation route; confirmation shows the order
  number prominently, a "we've received your order — payment is the next step"
  note, the order summary, and shipping address, plus a CTA to keep shopping. The
  client cart is cleared.
- **Mobile (375px):** Single-column stacked flow: contact → shipping → discount →
  summary, with the summary either collapsible at the top or a sticky bottom
  "Total + Place order" bar. Full-width inputs, ≥44px tap targets, correct mobile
  keyboards (`type="email"`, `inputMode="numeric"` for CP and phone). No
  horizontal scroll.
- **Tablet (768px):** Two-column — form left, sticky order summary right — or a
  comfortable single column; summary stays visible while filling the form.
- **Accessibility:** Every input has a visible `<label>`; the state selector is a
  native `<select>` (or accessible combobox) of the 32 states; the discount
  result and global errors announce via an `aria-live` region; keyboard-only
  users can complete the flow; respects `prefers-reduced-motion` on any step
  transitions.

## Technical Approach

### Files to Create

- `supabase/migrations/0008_checkout.sql` — Postgres function(s) for **atomic
  order creation + stock reservation**: single transaction that (a) guarded-
  decrements each line's `product_variants.stock`/`products.stock`, (b) inserts
  `orders` + `order_items` + initial `order_status_history`, (c) increments
  `sales_count`. Optionally a `next_order_number()` sequence/helper.
  `SECURITY DEFINER` with a pinned `search_path` (matching existing migration
  style), granted to `service_role` only. Idempotent (`create or replace` in
  guarded DO blocks).
- `src/lib/checkout/address.ts` (+ `.test.ts`) — pure Mexican address + contact
  validation: `MEXICAN_STATES` (32), CP regex, email shape, required-field checks
  on TRIMMED values; returns a typed `{ ok, values, fieldErrors }` (Q&A
  `submit-guard.ts` shape).
- `src/lib/checkout/discount.ts` (+ `.test.ts`) — pure discount application:
  `applyDiscount(subtotalCents, code)` for `percentage` / `fixed_amount` with
  clamp (`discount ≤ subtotal`), min-subtotal, window, redemption bounds. The
  live lookup happens in the action; this module is the pure math + eligibility
  given a fetched code row.
- `src/lib/checkout/order.ts` (+ `.test.ts`) — pure order-total assembly:
  validated live-price lines + shipping result + discount → `{ subtotal,
  shipping, discount, tax: 0, total }` in integer cents, guaranteed to satisfy
  the DB identity CHECKs; plus `formatOrderNumber(...)` from config.
- `src/lib/checkout/checkout-read.ts` — server read wrapper: fetch live
  product/variant rows **by id** for the cart lines (fills the "no getProductById"
  gap) and re-validate price + stock, returning per-line results.
- `src/app/[locale]/checkout/actions.ts` — `"use server"`
  `placeOrder(prevState, formData): Promise<CheckoutFormState>` following the Q&A
  action pattern: parse → validate address → re-validate lines → validate
  discount → assemble totals → call the atomic RPC (admin client) → return the
  order number or a friendly per-line/global error (never echo raw PG errors).
- `src/app/[locale]/checkout/checkout-form-state.ts` — serializable
  `CheckoutFormState` union + `initialCheckoutFormState` (kept OUT of the
  `"use server"` file, per the Q&A `qa-form-state.ts` rule).
- `src/app/[locale]/checkout/page.tsx` — server component: `setRequestLocale`,
  `getStoreSettingsStatic()`, render the client flow with settings props +
  metadata (`checkout` namespace).
- `src/components/checkout/checkout-flow-client.tsx` — `"use client"` multi-step
  flow: `useCart()` + `useActionState(placeOrder, …)`; renders contact/shipping/
  discount/summary + all states; clears the cart on success.
- `src/components/checkout/checkout-summary.tsx` — order summary (reuse
  `computeShipping`/`totalCents`/`formatMXN`; mirror `order-summary.tsx`).
- `src/app/[locale]/checkout/confirmacion/[orderNumber]/page.tsx` — confirmation
  page: read the order by number via admin client, render summary + shipping +
  "payment next" note. Route segment single-sourced in config.
- `src/components/checkout/*.test.tsx` — component tests for the form states.

### Files to Modify

- `src/lib/config.ts` — add `ORDER_NUMBER_PREFIX` + format, `MEXICAN_CP_PATTERN`,
  `MEXICAN_STATES`, `CHECKOUT_CONFIRMATION_PATH` (or a `confirmationPath(n)`
  builder), `TAX_RATE = 0` (documented Phase-1 placeholder). Keep `CHECKOUT_PATH`.
- `src/messages/es-MX.json` + `src/messages/en.json` — add the `checkout`
  namespace (labels, validation, discount messages, summary, confirmation copy,
  error banners).
- `scripts/seed.ts` + `scripts/seed-data/products.ts` — add a **zero-stock seed
  variant** (T6 forward note) for live overselling e2e coverage; add **discount
  codes** (active percentage, active fixed, expired, below-min, exhausted) so
  AC-6/AC-7 have real data.
- `src/lib/supabase/database.types.ts` — extend to include the new RPC signature
  so the action calls it typed (`Functions` section).
- `tasks/pipeline-state.md` + `BUILD_PLAN.md` — advance state; check `[x]` T7
  only AFTER the human-review gate.

### Data Model Changes

- **No new tables/columns** — `0003_commerce.sql` already models everything.
  Migration `0008_checkout.sql` adds only a **function** (atomic reserve-and-
  create) and optionally an order-number sequence. Tax columns already exist and
  are written as `0` in Phase 1.

### API Endpoints

- **No REST route handlers.** The codebase has ZERO `app/api/**/route.ts`; every
  mutation is a `"use server"` server action (confirmed). Checkout follows suit:
  - `placeOrder(prevState, formData) → CheckoutFormState` (`"use server"`).
  - The atomic reservation is a Postgres RPC (`supabase.rpc('create_order_…')`)
    called from the action via the admin client.

### Dependencies

- **No new npm dependencies.** Validation is hand-rolled pure functions (project
  has no zod/react-hook-form; the Q&A path set the precedent). Mexican states +
  CP regex are local constants. Money via existing `money.ts`; icons via
  `@hugeicons/react`; forms via existing shadcn/ui `Input`/`Textarea`/`Button`
  (+ vendor the shadcn `Select` for the state picker if not already present — a
  component add, not an npm dep).

## Out of Scope

- **Payment capture / Mercado Pago (T8).** No card/OXXO/SPEI/wallet, no MP
  preference, no webhook. The order stops at `pending_payment` /
  `payment_status = 'pending'`.
- **Discount-code MANAGEMENT UI (Phase 2).** Only the checkout FIELD validating
  against the existing `discount_codes` table is in scope. No admin CRUD.
- **Customer accounts / login / saved addresses / order history (Phase 2).**
  Guest checkout only; the `customers` row is a guest record.
- **Confirmation EMAIL (T9).** The on-screen confirmation page is in scope; the
  transactional email is T9.
- **CFDI / RFC invoicing logic (Phase 3).** `rfc` is captured optional and
  stored; no invoice generated. Tax stays `0`.
- **Multiple shipping options / rate-by-region (Phase 3).** Flat-rate +
  free-threshold from `store_settings` only.
- **Admin order management (T12).** No order list/detail/status pipeline here.
- **Min/max order quantities** (explicit spec SKIP) — quantity is only clamped to
  the existing UX cap and to live stock.
