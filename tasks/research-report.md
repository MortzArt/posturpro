# Research Report: T7 — Checkout & Order Creation

One-pass codebase scan. Verified against local files (not assumed). Where a
finding is uncertain it is flagged explicitly.

## Codebase Analysis

### Existing Patterns

- **Server-action form with `useActionState` (THE precedent for checkout).**
  `src/app/[locale]/producto/[slug]/actions.ts` (`submitQuestion`, lines 90–170)
  + `qa-form.tsx` + `qa-form-state.ts`. Contract: the action is
  `(slug, prevState, formData) => Promise<QaFormState>`; the form binds args and
  calls `useActionState(action, initialQaFormState)` for
  `[state, formAction, pending]`. The result is a **status union**
  (`"idle" | "success" | "invalid" | "rate-limited" | "unavailable" | "error"`)
  + optional `fieldErrors` + preserved `values` + an incrementing `submissionId`.
  Errors are mapped to friendly enums and NEVER echo `error.message`. **Reuse
  strategy:** copy this shape verbatim as `CheckoutFormState` with checkout-
  specific statuses (`success`, `invalid`, `out-of-stock`, `price-changed`,
  `shipping-unavailable`, `error`) and a per-line error array.
- **`"use server"` file cannot export non-async values.** The serializable
  state/type + initial-state object live in a SIBLING file (`qa-form-state.ts`),
  imported by both action and form. **Reuse:** create
  `checkout/checkout-form-state.ts` the same way.
- **Pure, unit-tested validation guards.** `src/lib/qa/submit-guard.ts`:
  validation trims BEFORE length checks, mirrors the DB CHECKs, returns
  `{ ok, values, fieldErrors }`, and is I/O-free. **Reuse:** model
  `src/lib/checkout/address.ts` + `discount.ts` + `order.ts` on this — pure,
  testable, DB CHECK is the floor not the first defense.
- **Pure money/shipping math, integer cents.** `src/lib/money.ts` (`formatMXN`
  is the ONLY cents→string boundary; throws on non-integer) and
  `src/lib/cart/shipping.ts` (`computeShipping`, `totalCents`,
  `freeShippingProgress`; three-state `flat`/`free`/`unavailable`; free =
  `subtotal >= threshold`). **Reuse:** checkout MUST call these, never re-derive.
- **Settings fetched server-side, passed as props.** `carrito/page.tsx` calls
  `getStoreSettingsStatic()` and passes `shipping_flat_rate_cents` /
  `free_shipping_threshold_cents` (or `null`) to the client. **Reuse:**
  `checkout/page.tsx` does the identical fetch+prop pattern.
- **Client-cart hydration gate.** `cart-provider.tsx` exposes a `hydrated` flag;
  the cart page renders a skeleton until hydrated (opacity crossfade,
  `aria-hidden`) to avoid a flash. **Reuse:** checkout renders a skeleton until
  `hydrated`, never a premature empty-state/`$NaN`.
- **Config single-sourcing (BUILD_PLAN rule 4).** `src/lib/config.ts` centralizes
  every non-secret tunable with a "HOW TO SWAP" docstring; `_CENTS` suffix
  convention; `UUID_PATTERN` already present. **Reuse:** add order-number format,
  CP regex, 32 states, tax rate here.
- **Admin (RLS-bypassing) client for privileged writes.**
  `src/lib/supabase/admin.ts` — `createAdminClient()`, `import "server-only"`
  guarded, docstring literally names "order/customer writes (T7)". **Reuse:**
  the ONLY write path for `orders`/`order_items`/`customers`.
- **Locale-aware navigation.** Import `Link`, `redirect`, `getPathname` from
  `@/i18n/navigation` (`createNavigation(routing)`); hrefs are prefix-free (the
  `/en` prefix is auto-added). **Reuse:** confirmation redirect + all links.

### Relevant Files

| File | Purpose | Relevance | Action |
| --- | --- | --- | --- |
| `supabase/migrations/0003_commerce.sql` | orders/order_items/customers/discount_codes/store_settings + CHECKs + immutability triggers | The exact write target + constraints checkout must satisfy | Reference |
| `supabase/migrations/0002_catalog.sql` | products/product_variants with `stock`, `price_cents`, `price_override_cents` | Source of live price/stock for re-validation & decrement | Reference |
| `supabase/migrations/0005_rls_policies.sql` | Commerce tables fully denied to anon; only `service_role` writes | Proves checkout MUST use the admin client | Reference |
| `supabase/migrations/0006_data_integrity_hardening.sql` | non-blank name CHECK, discount window CHECK, slug format | Mirror these in validation | Reference |
| `supabase/migrations/0008_checkout.sql` | NEW atomic reserve-and-create RPC + order-number helper | Overselling protection + single-transaction write | Create |
| `src/lib/cart/shipping.ts` | `computeShipping`/`totalCents`/`freeShippingProgress` | Reused verbatim for checkout totals | Reference |
| `src/lib/cart/cart-line.ts` | `CartLine` snapshot + `sanitizeQuantity` | Snapshot shape; quantity clamp reused server-side | Reference |
| `src/lib/money.ts` | `formatMXN` / integer-cents | The only display boundary | Reference |
| `src/lib/store-settings.ts` | `getStoreSettingsStatic()` | Server settings fetch for the page | Reference |
| `src/lib/supabase/admin.ts` | `createAdminClient()` | The write client | Reference |
| `src/lib/catalog/stock.ts` | `effectiveStock` (SUMS variants), `stockState` | Display stock; NOTE below on reservation | Reference |
| `src/lib/catalog/product-detail.ts` | `getProduct(slug)` (slug-only reads) | Model for a new by-id read | Reference |
| `src/app/[locale]/producto/[slug]/actions.ts` | Q&A server action | The action template | Reference |
| `src/app/[locale]/producto/[slug]/qa-form-state.ts` | serializable state contract | The form-state-file rule | Reference |
| `src/app/[locale]/carrito/page.tsx` | settings fetch + props | The page template | Reference |
| `src/components/cart/cart-provider.tsx` | `useCart()` / `hydrated` | Cart read contract | Reference |
| `src/components/cart/order-summary.tsx` | subtotal/shipping/total render | Mirror for checkout summary | Reference |
| `src/lib/config.ts` | tunables | New constants | Modify |
| `src/messages/es-MX.json` + `en.json` | i18n | New `checkout` namespace | Modify |
| `scripts/seed.ts` + `scripts/seed-data/products.ts` | seed | Zero-stock variant + discount codes | Modify |
| `src/lib/supabase/database.types.ts` | generated types | Add RPC signature | Modify |
| `src/lib/checkout/*` | validation/discount/totals/read | New lib cluster | Create |
| `src/app/[locale]/checkout/*` + `src/components/checkout/*` | route + flow + confirmation | New UI | Create |

### Data Flow

**Render:** `/checkout` request → `checkout/page.tsx` (server, `setRequestLocale`)
→ `getStoreSettingsStatic()` (cookie-free, cached, RLS-safe anon read) → renders
`checkout-flow-client.tsx` with `flatRateCents`/`freeThresholdCents` props →
client reads `useCart()` (localStorage snapshot, `hydrated` gate) → computes
display totals with `computeShipping`/`totalCents` → shows contact/shipping/
discount/summary.

**Submit:** user fills form → `useActionState` → `placeOrder(prevState, formData)`
(`"use server"`) →
1. Parse form fields + the serialized cart lines (hidden field / bound arg).
2. `validateAddress(...)` (pure) — bad → `{ status: "invalid", fieldErrors }`.
3. `checkout-read.ts` re-reads live product/variant rows **by id** (admin
   client) → re-validate: active, unit price == effective price, stock ≥ qty →
   any mismatch → `{ status: "price-changed" | "out-of-stock", lineErrors }`.
4. `getStoreSettingsStatic()` → `computeShipping(subtotal, settings)`; if
   `unavailable` → `{ status: "shipping-unavailable" }` (never write).
5. `applyDiscount(subtotal, fetchedCode)` (pure) → discount cents (clamped).
6. `assembleOrder(...)` (pure) → totals satisfying the DB identity CHECK.
7. `admin.rpc('create_order_…', payload)` → **single transaction**: guarded
   stock decrement per line + insert `customers`, `orders`, `order_items`,
   `order_status_history`, bump `sales_count`. Any line short → rollback →
   `{ status: "out-of-stock", lineErrors }`.
8. Success → `{ status: "success", orderNumber }` → client clears cart →
   `redirect(confirmationPath(orderNumber))`.

**Confirmation:** `confirmacion/[orderNumber]/page.tsx` (server) → admin client
reads the order + items by `order_number` → renders summary/shipping/"payment
next".

### Similar Features (Reference Implementations)

- **Q&A submission** (`producto/[slug]/actions.ts`, `qa-form.tsx`,
  `submit-guard.ts`, `qa-form-state.ts`) — the closest sibling: a public form →
  pure validation → server write → friendly status union → `useActionState` +
  `pending` + preserved values + field errors + `updateTag`. Key patterns to
  follow: status enum mapping, `clientIp()` helper (reuse if rate-limiting
  checkout), "never echo `error.message`", the sibling form-state file.
- **Cart page** (`carrito/page.tsx`, `cart-page-client.tsx`, `order-summary.tsx`)
  — settings fetch + prop-drill, `computeShipping`/`totalCents` usage, hydration
  skeleton, `formatMXN` rendering, i18n `cart` namespace. Checkout mirrors this
  layout and math.
- **Idempotent seed** (`scripts/seed.ts`) — upsert on natural keys; add the
  zero-stock variant + discount codes here following `seedVariants`/the store-
  settings singleton pattern.

## Dependency Analysis

### Existing Dependencies to Leverage

- `@supabase/supabase-js` (admin + public clients) — order writes via
  `createAdminClient()`, `.rpc(...)` for the atomic function.
- `next-intl` — `useTranslations`/`getTranslations` + `@/i18n/navigation` for the
  new `checkout` namespace and locale-aware redirect.
- shadcn/ui + Tailwind + `cn()` — form inputs/buttons; `@hugeicons/react`
  (+ core-free-icons) for icons (never mix icon sets).
- Existing `money.ts`, `cart/shipping.ts`, `store-settings.ts`, `config.ts`.

### New Dependencies Needed

- **None.** No zod/react-hook-form/valibot in the project (confirmed via
  `package.json` grep) and the Q&A path established hand-rolled pure validation as
  the convention. Mexican CP is a trivial `/^\d{5}$/`; a full CP→state authority
  table is Phase-3 carrier work and out of scope (see Key Decisions).

### Internal Dependencies

- Checkout depends on T6 cart (`useCart`, `CartLine`, `shipping.ts`) — complete.
- Checkout depends on `store_settings` being present — degrade to
  "shipping-unavailable" when absent (edge 5).
- T8 (Mercado Pago) depends on the order landing in `pending_payment` — do NOT
  advance status or capture payment here.
- T12 (admin orders) will read what T7 writes — the `order_status_history` seed
  row + immutable snapshot make that clean.

## External Research

### API Documentation

- **None required.** No third-party API in T7 (Mercado Pago is T8). All work is
  local Postgres + Next server actions.

### Library Documentation

- **Supabase RPC / transactions.** Multi-statement atomicity in Supabase is
  achieved with a Postgres function (all statements in one function body run in a
  single implicit transaction; any `raise exception` rolls back the whole call).
  This is the correct primitive for AC-9 — the JS client cannot span a
  transaction across multiple `.from().insert()` calls, so the reserve-and-create
  MUST be one `create or replace function ... language plpgsql` invoked via
  `admin.rpc(...)`. Follow the existing migrations' `SECURITY`/`set search_path =
  ''` + schema-qualified table refs style.
- **Guarded atomic decrement pattern.** `UPDATE product_variants SET stock =
  stock - $qty WHERE id = $id AND stock >= $qty RETURNING id;` — if zero rows
  return, the row lacked stock → `raise exception` → rollback. This is the
  race-safe primitive for the last-unit case (AC-9, edge 2); the row lock Postgres
  takes on the matched row serializes concurrent decrements.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Non-atomic writes across multiple `.insert()` calls → partial order / oversell | High | High | Single Postgres function (`0008_checkout.sql`); guarded decrement + inserts in one transaction; `raise exception` rolls back |
| Totals-assembly bug fails a DB CHECK, opaque error to user | Med | High | Pure `order.ts` with unit tests for the identity math; action maps the CHECK error to a friendly enum; the CHECK itself is the backstop |
| Client tampers cart price/qty/id | Med | High | Server ignores snapshot price, recomputes from live DB; qty clamped; id validated as UUID; edge 4 |
| Double-submit creates two orders / double-decrements | Med | High | `pending`-disabled button + a server idempotency key (client-generated) with a unique guard; AC-14 |
| `LOCAL Docker Supabase` only; remote is empty/unlinked | High | Med | All dev/test/e2e run against local (per memory + T6 QA notes). Migration `0008` applies locally; do NOT attempt remote push. Document in dev-done. |
| `store_settings` missing → silent `shipping_cents = 0` sale | Low | High | Block submit on `unavailable` (edge 5); settings required to place an order |
| Discount race (concurrent redemptions exceed `max_redemptions`) | Low | Med | Increment `times_redeemed` inside the same transaction with a bound check; over-limit → rollback. (Schema deliberately does NOT constrain this — the app owns it.) |
| `getProduct` is slug-only; no by-id read | High | Low | Add `checkout-read.ts` by-id read (admin client / `products_public`); cart snapshot already carries `productId`+`slug` |

### Performance Considerations

- **Batch the live re-read.** Fetch all cart-line products/variants in one or two
  `in (...)` queries, not N round-trips. Cart is small (≤ a handful of lines).
- **The RPC is one round-trip** for the entire order — good. Keep the function
  body tight; no per-row client calls.
- **No caching on the write path.** The confirmation read is a direct admin read
  by `order_number` (unique index exists) — fast, uncached (order data must be
  fresh and is never public/anon-cacheable).

### Security Considerations

- **Admin (secret) client is server-only.** `admin.ts` has `import
  "server-only"`; the action file must stay server-side. Never import it into a
  `"use client"` module. AC-12.
- **RLS is genuinely closed for commerce tables** (confirmed 0005 lines 252–258:
  no grant + no policy for `customers`/`orders`/`order_items`/
  `order_status_history`/`discount_codes`). The write path bypasses RLS via the
  secret key — so the SERVER is the entire trust boundary; validate everything
  server-side.
- **Never echo raw PG errors** to the client (Q&A precedent) — map to enums, log
  with context.
- **Input hostility:** treat every cart line + form field as attacker-controlled
  (edge 4). Recompute money from the DB; validate ids as UUIDs; clamp quantities;
  bound free-text (delivery notes, names) to sane lengths mirroring the DB CHECKs.
- **Consider a best-effort rate limit** on `placeOrder` (reuse `clientIp()` +
  the `submit-guard` limiter pattern) to blunt order-spam; document as best-effort
  (in-memory, per-instance) like Q&A.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Config + i18n scaffolding** (`config.ts` constants, `checkout` namespace in
   both message files) — everything else references these; no logic risk.
2. **Pure libs first** (`address.ts`, `discount.ts`, `order.ts` + tests) — they
   are I/O-free, fully testable, and encode the DB CHECK math. TDD them.
3. **Migration `0008_checkout.sql`** (atomic reserve-and-create RPC + order-number
   helper) — apply to LOCAL Supabase; verify with a manual `.rpc` call and the
   last-unit race. This is the correctness core.
4. **`checkout-read.ts`** (by-id live re-validation read) — depends on nothing
   above except types.
5. **Server action** (`actions.ts` + `checkout-form-state.ts`) — composes 2–4
   into the status union.
6. **UI** (`page.tsx`, `checkout-flow-client.tsx`, `checkout-summary.tsx`, all
   states) — mirrors the cart page + Q&A form.
7. **Confirmation page.**
8. **Seed additions** (zero-stock variant + discount codes) — enables live e2e.
9. **Tests last at the integration/e2e layer** (QA stage) — unit tests land with
   steps 2–5.

### Key Decisions

- **Reserve stock at ORDER CREATION (default), not at payment.** The spec says
  "stock reservation during checkout to prevent overselling the last unit" and
  BUILD_PLAN puts reservation in T7. Decrement now; T12 handles restore on
  cancel. (If the team prefers reserve-on-payment, that pushes overselling risk
  into T8 and contradicts the T6 forward note — NOT recommended; document if
  chosen.)
- **`effectiveStock` SUMS variant stock (verified in `stock.ts`) — it is a
  DISPLAY helper, NOT a reservation helper.** Reservation MUST decrement the
  SPECIFIC variant the line bought (or the product row for no-variant lines).
  Do not reserve against the summed number.
- **Mexican CP = `/^\d{5}$/` only; no CP→state cross-validation in Phase 1.** A
  full authoritative CP↔state table (SEPOMEX) is carrier/Phase-3 territory and
  out of scope. State is validated against the closed 32-state list. Flag this
  boundary in dev-done so a later CP-verification upgrade is a known follow-up.
- **Use the admin client for ALL commerce reads AND writes in the action.** The
  live re-read can use `products_public` (anon-safe) OR the admin client; using
  the admin client for both read and write in one place keeps the trust boundary
  in one file. (Reading via `products_public` is also fine since `stock` is
  visible there.)
- **`order_number` format** — a documented config constant (e.g. prefix +
  zero-padded sequence or date + short random). Generate inside the RPC (or via a
  sequence) so uniqueness is DB-guaranteed, satisfying `NOT NULL UNIQUE`.
- **Tax = 0 in Phase 1**, written to `tax_cents`/`tax_base_cents` so CFDI (Phase
  3) needs no schema change. Documented constant.
- **Server action, NOT a route handler** — the codebase has zero route handlers;
  all mutations are `"use server"`. Do not introduce `app/api/**/route.ts`.

### Anti-Patterns to Avoid

- Don't trust the cart snapshot's `unitPriceCents`/`quantity` for the order —
  recompute from the live DB (edge 4). The snapshot is display-only.
- Don't write `orders` and `order_items` with two separate `.insert()` calls —
  a crash between them leaves a headless order. One transaction (the RPC).
- Don't decrement stock in app code with read-then-write — that races (edge 2).
  Use the guarded `WHERE stock >= qty` decrement inside the transaction.
- Don't silently sell with `shipping_cents = 0` when settings are unavailable —
  block (edge 5).
- Don't echo `error.message`/PG codes to the user — map to friendly enums, log
  server-side (Q&A precedent).
- Don't let a bad discount code block checkout — it degrades to full price
  (AC-7).
- Don't format money anywhere but `formatMXN`; don't do float arithmetic.
- Don't attempt a REMOTE Supabase push/migrate — the app runs on LOCAL Docker
  Supabase; the remote project is empty and unlinked (project memory).
- Don't hardcode the checkout/confirmation paths, states, CP regex, or order
  format — single-source them in `config.ts` (BUILD_PLAN rule 4).
