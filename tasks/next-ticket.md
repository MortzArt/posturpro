# Task: T8 — Mercado Pago integration (sandbox)

> ⚠️ **HUMAN-REVIEW GATE — READ FIRST.** This ticket delivers PAYMENT code. Per
> BUILD_PLAN rule 3 and the standing gate in `tasks/pipeline-state.md`, **every
> pipeline verdict on T8 is advisory only.** A SHIP verdict does NOT authorize
> merge. A human MUST review the payment code (webhook signature verification,
> amount reconciliation, refund execution, order-state advancement, secret
> handling) before this task is checked off in BUILD_PLAN.md. The pipeline runs
> end-to-end; the merge itself waits on the user. Flag this prominently in every
> downstream artifact.
>
> ⚠️ **LIVE-SANDBOX VERIFICATION IS BLOCKED-ON-USER.** No working Mercado Pago
> credentials exist. `.env.local` contains PLACEHOLDER MP values only. All tests
> mock the MP API; a real sandbox round-trip cannot be run in this pipeline. The
> exact env var names and where to obtain sandbox credentials are documented in
> "Dependencies" below and must be repeated in `tasks/dev-done.md`. Never
> fabricate credentials; no MP secret is ever `NEXT_PUBLIC_`.

## Priority

**Critical** — T8 is the payment capture step that makes the store sellable
(PRODUCT_SPEC Phase 1: "A customer can find a chair, pay with Mercado Pago…").
T7 creates orders in `pending_payment`; without T8 no order is ever paid. It is
also on the critical path for T9 (emails: payment-received, OXXO/SPEI
instructions, refund-issued) and T12 (admin order management calls T8's refund
execution API). Highest risk in the build (money movement, external webhook
trust boundary) — hence the mandatory human-review gate.

## Complexity

**high** — justified against the criteria:

- **New subsystem**: a payment provider integration (SDK client, preference
  creation, webhook ingestion, refund execution) that did not exist before —
  this is the store's first outbound third-party API and its first inbound
  webhook (there are zero `route.ts` handlers in the repo today).
- **New data model + migration**: a new `advance_order_status` RPC (T7 Arch R-1),
  a new `mp_payment_events` idempotency-spine table (T7 Arch R-3), and new
  indexes on `mp_payment_id`/`mp_external_reference` (T7 Arch R-4).
- **Architectural / trust-boundary work**: an unauthenticated public webhook
  endpoint verifying HMAC-SHA256 signatures, an amount-reconciliation guard
  against the immutable order snapshot, and a state machine advancing orders on
  external events. Money movement + external trust boundary.
- **File count**: ~18–24 files created/modified (migration, DB types, env
  accessor, config constants, MP client lib, preference lib, webhook lib +
  route, refund lib, payment-status read, order-state RPC caller, payment-method
  UI, pending-instructions UI, confirmation-page wiring, i18n ×2, plus unit +
  integration + e2e tests).

`/full-cycle` auto-classification: **high → run all 12 stages** (UI Design,
Dev, Review, Fix, QA, UX, Security, Arch, **Hacker**, Verify). Security and Arch
run at FULL depth — this is the highest-risk task in the plan.

## Feature Type

**full-feature** — both UI (payment-method selection at checkout,
pending-payment OXXO/SPEI instructions on the confirmation page, card-decline
retry flow, both locales) and logic (MP SDK client, preference creation, webhook
ingestion + signature verification + idempotent state advancement, refund
execution API). All stages run at full depth. Note: the webhook route and refund
API are **logic-only surfaces** (no UI) but the checkout/confirmation changes are
UI — the feature as a whole is full-feature.

## User Story

As a **shopper in Mexico**, I want to **pay for my order with a card, OXXO cash,
SPEI transfer, or my Mercado Pago wallet — and clearly retry if my card is
declined or see exactly how to complete an OXXO/SPEI payment** — so that **I can
actually buy the chair I ordered and know my payment was received.**

As the **store owner (via the T12 admin, out of scope here except the API it
calls)**, I want **a reliable refund execution capability and orders that
automatically advance to Paid when Mercado Pago confirms payment** — so that
**paid orders are trustworthy and I can refund customers when needed.**

## Background

**What exists today (T7, shipped, SHIP verdict — human-review gate still open):**

- Orders are created by the `create_order` RPC (`supabase/migrations/0008_checkout.sql`)
  from the checkout server action (`src/app/[locale]/checkout/actions.ts`),
  landing at `status='pending_payment'`, `payment_status='pending'`. **No payment
  is captured** — the confirmation page literally says "Sin pago todavía / No
  payment yet" (`confirmation.noPaymentTitle` / `noPaymentYet`).
- The order is addressed by an **unguessable `confirmation_token` (uuid)** at
  `/[locale]/checkout/confirmacion/[token]`; the enumerable `order_number`
  (`PP-000001…`) is display-only and 404s as a URL (IDOR fix). Read path:
  `getOrderByToken()` in `src/lib/checkout/order-read.ts`.
- The `orders` table (`supabase/migrations/0003_commerce.sql:62-64`) ALREADY has
  the columns T8 needs, all **nullable and MUTABLE by the immutability trigger**
  (`0006_data_integrity_hardening.sql:170-203` deliberately leaves `status`,
  `payment_status`, `payment_method`, `mp_preference_id`, `mp_payment_id`,
  `mp_external_reference` mutable while freezing the financial/contact snapshot).
- The `payment_status` enum is `pending | authorized | paid | failed | refunded`
  and `order_status` is `pending_payment | paid | preparing | shipped |
  delivered | cancelled` (`0001_extensions_and_enums.sql`). **No new enum values
  are needed.**
- All money is **integer cents (MXN centavos)**; DB CHECKs enforce the totals
  identity; the immutable snapshot is DB-enforced even against the service_role
  client.
- `.env.local` contains PLACEHOLDER MP vars with the spec's names
  (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`,
  `MERCADOPAGO_WEBHOOK_SECRET`). No MP code exists anywhere in the repo.

**What's missing (T8):**

1. A way to actually charge the customer (card / OXXO / SPEI / MP wallet).
2. A webhook that confirms payment and advances the order to `paid` — idempotently
   and only after verifying the notification is genuinely from Mercado Pago.
3. A pending-payment experience for OXXO/SPEI (voucher/instructions).
4. A card-decline retry flow.
5. A refund execution API (full + partial) that T12's admin UI will call.

**Chosen integration surface: Mercado Pago Checkout Pro (redirect / preference).**
Rationale (see research report for citations): Checkout Pro is the ONLY MP
product the official docs confirm covers all four required rails in Mexico
(card + OXXO + SPEI + MP wallet) in one flow, at the lowest PCI burden (SAQ-A —
card data never touches our servers), with the least implementation effort
(create a Preference, redirect, handle webhooks). Checkout API / Payment Bricks
would be on-site but **SPEI support in Bricks is UNCONFIRMED in the docs** (a
real risk), and OXXO/SPEI hand off out-of-band anyway, weakening the on-site
argument. Checkout Pro's redirect model composes cleanly with our existing
token-addressed confirmation page: the MP `back_urls` and `notification_url` both
key off the order's `confirmation_token`.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

**Configuration & secrets**

- [ ] AC-1: A typed accessor `getMercadoPagoEnv()` (in `src/lib/env.ts`, mirroring
      `getServerEnv()`) reads `MERCADOPAGO_ACCESS_TOKEN` and
      `MERCADOPAGO_WEBHOOK_SECRET` as server-only required vars and throws
      `MissingEnvVarError` (named var) when absent/blank. `MERCADOPAGO_PUBLIC_KEY`
      is read only if the client actually needs it (Checkout Pro redirect does
      NOT need the public key in the browser — see AC-note).
- [ ] AC-2: No MP secret is ever prefixed `NEXT_PUBLIC_`. A test asserts the MP
      access token / webhook secret are absent from any client bundle path
      (mirrors the T1 secret-exposure discipline). The MP SDK client module is
      guarded by `import "server-only"`.
- [ ] AC-3: All non-secret MP tunables (currency `MXN`, statement descriptor,
      `date_of_expiration` window for OXXO/SPEI, `binary_mode` choice, the
      `back_urls`/`notification_url` builders, the payment-method → order-state
      map, the amount-reconciliation tolerance = 0) are centralized in
      `src/lib/config.ts` (or a `src/lib/payments/` constant module) and
      documented with a "how to swap real values" block, per BUILD_PLAN rule 4.

**Payment initiation (Checkout Pro preference)**

- [ ] AC-4: A `pending_payment` order can be turned into an MP Checkout Pro
      Preference via a server action / lib that: sends the order's line items and
      total (integer cents → MP's decimal `unit_price`, converted exactly with no
      float drift), sets `external_reference` to the order's `confirmation_token`,
      sets `notification_url` to the webhook route, and sets `back_urls`
      (success/pending/failure) to locale-correct confirmation URLs. The returned
      `preference.id` and `init_point` are persisted (`mp_preference_id`) / returned.
- [ ] AC-5: The confirmation page (`/checkout/confirmacion/[token]`) shows a
      **"Pay now / Pagar ahora"** CTA for any order whose `payment_status='pending'`
      and `status='pending_payment'`, launching Checkout Pro (redirect to
      `init_point`, or Wallet Brick — implementer's choice, redirect is the
      baseline). The "no payment yet" placeholder block is REPLACED by this.
- [ ] AC-6: All four methods (card, OXXO, SPEI, MP wallet) are available in the
      Checkout Pro preference for Mexico (no method is excluded by our config;
      MP surfaces what the account supports).

**Webhook ingestion (the trust boundary)**

- [ ] AC-7: A route handler at `src/app/api/webhooks/mercadopago/route.ts`
      (POST) accepts MP `type=payment` notifications. It is the FIRST `route.ts`
      in the repo — it is public and unauthenticated by MP's design; the ONLY
      auth is the signature check (AC-8).
- [ ] AC-8: The webhook **verifies the `x-signature` header** before any
      side-effect: parses `ts=…,v1=…`, rebuilds the manifest
      `id:<data.id-lowercased>;request-id:<x-request-id>;ts:<ts>;`, computes
      HMAC-SHA256 with `MERCADOPAGO_WEBHOOK_SECRET`, and compares to `v1` with a
      **constant-time comparison** (`crypto.timingSafeEqual`). A missing/malformed/
      mismatched signature → **401** (or 403), no DB read, no state change. The
      `data.id` uppercase→lowercase conversion is applied.
- [ ] AC-9: On a verified `type=payment` notification the handler **fetches the
      authoritative payment** via `GET /v1/payments/{data.id}` (the notification
      body carries no status) using the server access token, and maps MP
      `status`/`status_detail` to our `payment_status`/`order_status`
      (mapping in AC-14).
- [ ] AC-10: **Idempotent handling.** A `mp_payment_events` table with a UNIQUE
      constraint on `mp_payment_id` (per T7 Arch R-3 — a SEPARATE spine from
      `orders.idempotency_key`) records each processed payment id. A duplicate or
      out-of-order webhook for the same payment id does NOT double-advance the
      order and does NOT re-run side effects; the handler returns 200 (so MP stops
      retrying). Reprocessing is safe (upsert / guarded insert).
- [ ] AC-11: The order is matched from the payment's `external_reference`
      (= `confirmation_token`) OR from the stored `mp_preference_id`. An unknown /
      unmatched payment is logged and 200'd (do not 500 — MP would retry
      forever), without creating or mutating any order.
- [ ] AC-12: **Amount reconciliation.** Before advancing an order to `paid`, the
      handler verifies the MP payment's amount equals the order's `total_cents`
      (converted exactly). A mismatch does NOT mark the order paid; it is logged
      as a discrepancy and the order stays `pending_payment` (or a dedicated flag)
      for human review. Tolerance is ZERO (documented constant).

**Order-state advancement (through the RPC, never ad-hoc)**

- [ ] AC-13: A new `advance_order_status(...)` Postgres RPC (T7 Arch R-1) is the
      ONLY path that changes `orders.status` / `payment_status` / `payment_method`
      / `mp_payment_id`. It updates the mutable columns AND writes an
      `order_status_history` row (`from_status`→`to_status`, note) in ONE
      transaction. `SECURITY DEFINER`, pinned empty `search_path`, execute granted
      only to `service_role` — matching the `create_order` RPC posture. No
      `.update({status})` anywhere in T8 code.
- [ ] AC-14: MP status mapping is implemented and unit-tested:
      `approved` → order `paid` / payment `paid`; `pending`/`in_process` →
      stays `pending_payment` / payment `pending` (OXXO/SPEI awaiting payment or
      card in review); `rejected`/`cancelled` → payment `failed`, order stays
      `pending_payment` (so the shopper can retry — AC-16); `refunded` → payment
      `refunded` (order state handled by refund flow, AC-17);
      `charged_back`/`in_mediation` → logged, payment left as-is / flagged, never
      silently marks paid. Unknown status → logged, no state change.
- [ ] AC-15: Advancing a `pending_payment` order to `paid` is IDEMPOTENT at the
      RPC level too: a second `advance_order_status(... 'paid')` on an
      already-`paid` order is a no-op (no duplicate history row, no error) — a
      belt-and-suspenders guard alongside AC-10.

**Pending-payment (OXXO/SPEI) & decline retry UX**

- [ ] AC-16: **Card-decline retry.** When MP returns to the failure `back_url`
      (or the payment is `rejected`), the confirmation page shows a clear,
      localized "payment failed / try again" message and a retry CTA that
      re-launches Checkout Pro for the SAME order (a new preference or re-using
      init_point) — the order is NOT re-created, stock is NOT re-decremented, the
      confirmation token is unchanged.
- [ ] AC-17: **OXXO/SPEI pending instructions.** When a payment is `pending` with
      an OXXO/SPEI voucher, the confirmation page shows the voucher: the
      barcode/reference and a link to the printable voucher
      (`transaction_details.external_resource_url` — see research §5 field-path
      caveat; read defensively), plus the expiration, in both locales. The order
      shows a "waiting for payment" state, not "paid".
- [ ] AC-18: When the OXXO/SPEI webhook later confirms `approved`, the order
      advances to `paid` (AC-9/AC-13) and, on next confirmation-page load, the UI
      reflects paid. (Live-updating the open page is out of scope — a reload
      suffices; email confirmation is T9.)

**Refund execution API (T12 will call it; UI is T12)**

- [ ] AC-19: A server-side refund execution function (e.g.
      `refundOrderPayment(orderId, amountCents | null)` in `src/lib/payments/`)
      calls `POST /v1/payments/{mp_payment_id}/refunds` — empty body = full
      refund, `{ amount }` = partial (converted from cents exactly) — with a
      per-request `X-Idempotency-Key`. On success it advances the order/payment to
      `refunded` (partial refund handling documented — a partial refund does NOT
      set order to `refunded` unless fully refunded; a `payment_status` of
      `refunded` is only for full refunds — implementer picks a documented rule).
- [ ] AC-20: The refund function refuses to refund a payment that is not
      `approved`/`paid` (MP cannot refund pending — those are cancelled), returns
      a typed result (success / not-refundable / MP-error), and never echoes a raw
      MP error to a caller-facing surface. It is server-only and callable only
      from privileged code (the admin path in T12).

**i18n, quality, tests**

- [ ] AC-21: Every new user-facing string exists in BOTH `src/messages/es-MX.json`
      and `src/messages/en.json` under the `checkout` namespace (Spanish default);
      no hardcoded copy in components. The `keys-used` message test passes.
- [ ] AC-22: `npm run test` (unit), `npm run test:integration` (live local DB),
      `npm run test:e2e` (playwright, chromium + mobile) all pass. New tests cover:
      signature verification (valid/invalid/replay/out-of-order/unknown/amount-
      mismatch), status mapping, the `advance_order_status` RPC + history +
      idempotency (integration), refund full/partial/not-refundable, and the UX
      states (payment-method selection, pending instructions, decline retry) in
      both locales. The MP HTTP API is MOCKED in all tests (no live sandbox call).
- [ ] AC-23: Strict TS (no `any`, no non-null `!`), Clean Code rules (small
      functions/files, no magic values, no silenced errors), and the existing
      test baseline (unit 924, integration 137, checkout e2e 24, cart e2e 46) are
      not regressed. New migration is idempotent and LOCAL-only (never remote push).

> AC-note (AC-1): whether `MERCADOPAGO_PUBLIC_KEY` is needed depends on the
> chosen launch surface — a pure redirect to `init_point` needs only the
> server-side access token; a Wallet Brick / client-side SDK render needs the
> public key exposed as `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` (public keys are
> safe to expose; access tokens are NOT). If the redirect baseline is used, the
> public key stays server-only/unused and this is documented.

## Edge Cases

At least 5 required; T8's risk profile demands more. Each lists expected behavior.

1. **Webhook replay (same payment id twice).** MP retries deliveries and fires on
   every status change. Expected: the second delivery for an already-processed
   `(mp_payment_id)` is a no-op via the `mp_payment_events` unique guard (AC-10);
   order not double-advanced; no duplicate `order_status_history` row; return 200.
2. **Out-of-order webhooks (`approved` arrives, then a stale `pending` arrives).**
   Expected: state never regresses. `advance_order_status` refuses to move a
   `paid` order back to `pending_payment`; a stale/lower-precedence status is
   logged and dropped; 200 returned. (Status precedence is an explicit, tested
   ordering.)
3. **Unknown / unmatched payment (no order for that `external_reference`/preference).**
   Expected: logged with the payment id, NO order created or mutated, return 200
   (never 500 — a 500 makes MP retry forever). Signature is still verified first.
4. **Card decline then successful retry.** Expected: first payment `rejected` →
   payment `failed`, order stays `pending_payment`, confirmation page shows retry
   CTA (AC-16). Shopper retries → new MP payment `approved` → order `paid`. The
   order, stock decrement, and confirmation token are unchanged across the retry
   (no re-`create_order`).
5. **OXXO/SPEI voucher expiry with no payment.** Expected: MP sends
   `cancelled`/`status_detail=expired`. Order stays `pending_payment`, payment
   `failed`; the confirmation page offers a fresh payment attempt (new preference);
   stock is NOT restored by T8 (auto-restore on cancel is T12's cancel flow — do
   not build ahead). Documented as intentional.
6. **Webhook-before-redirect race.** MP may POST the `approved` webhook before the
   shopper's browser returns to the `back_url`. Expected: the webhook advances the
   order to `paid` authoritatively; when the browser lands on the confirmation
   page it reads live state and shows "paid" (never relies on the redirect params
   for truth — `back_urls` query params are display hints only, never trusted for
   state). Conversely if the page loads before the webhook, it shows
   pending/processing and a reload reflects paid.
7. **Amount mismatch between MP and the order.** MP payment amount ≠ order
   `total_cents` (tampered preference, currency confusion, partial capture).
   Expected: order is NOT marked paid; the discrepancy is logged; order stays
   `pending_payment` / flagged for human review (AC-12). Never trust the webhook's
   amount to overwrite the immutable order total (the trigger blocks it anyway).
8. **Refund a pending (not-yet-approved) payment.** Expected: the refund function
   returns `not-refundable` (MP refunds only approved payments); no MP call that
   would 400, or a caught MP error mapped to `not-refundable`. The caller (T12)
   surfaces "cancel instead of refund".
9. **Partial refund then a second partial that exceeds the remaining balance.**
   Expected: the second refund is bounded (sum of refunds ≤ order total); MP
   rejects an over-refund and our function returns a typed MP-error, never marks
   the order more-than-refunded. Full-vs-partial `payment_status` rule is applied
   consistently (AC-19).
10. **Refund failure (MP down / insufficient MP balance).** Expected: the refund
    function returns a typed `mp-error`, the order/payment state is UNCHANGED (not
    marked refunded on a failed refund), and the raw MP error is logged but never
    echoed to the caller UI. Retriable via the same idempotency key.
11. **Missing/placeholder MP credentials at runtime.** Expected: `getMercadoPagoEnv()`
    throws `MissingEnvVarError`; the "Pay now" action surfaces a friendly
    "payment temporarily unavailable" state (never a stack trace), and the webhook
    route 500s ONLY internally (logged) — but since live sandbox is blocked, this
    path is covered by a mocked test, not a live call.
12. **Malformed webhook body / non-`payment` type (e.g. `merchant_order`, test
    ping).** Expected: signature still verified; a non-`payment` type is
    acknowledged 200 and ignored; a body that isn't valid JSON after a valid
    signature is logged and 400/200 (documented) without a crash.

## Error States Table

| Trigger | User Sees | System Does |
| --- | --- | --- |
| MP env vars missing/placeholder at "Pay now" | Localized "El pago no está disponible por el momento / Payment temporarily unavailable" + retry later | `getMercadoPagoEnv()` throws; action returns a `payment-unavailable` state; logs with context; no order mutation |
| Preference creation fails (MP 5xx/network) | Same "payment temporarily unavailable" + retry CTA | Catches MP error, logs raw, returns typed `mp-error`; order stays `pending_payment` |
| Card declined at MP (`rejected`) | "Tu pago fue rechazado. Inténtalo de nuevo / Your payment was declined. Try again" + retry CTA | Webhook maps `rejected`→payment `failed` via RPC; order stays `pending_payment`; history row written |
| OXXO/SPEI selected (payment `pending`) | Voucher: reference/barcode, printable-voucher link, expiration, "esperando tu pago / awaiting payment" | Order stays `pending_payment`/`pending`; voucher fields read from payment `transaction_details.*` |
| Webhook signature invalid/missing | (nothing — server-to-server) | Return 401/403, no DB read, no state change; log the rejection (no secret in logs) |
| Webhook for unknown payment/order | (nothing) | Log payment id; return 200; no order created/mutated |
| Webhook amount ≠ order total | (nothing to shopper; flagged internally) | Order NOT marked paid; discrepancy logged; stays `pending_payment`/flagged for human review |
| Duplicate/out-of-order webhook | (nothing; idempotent) | `mp_payment_events` unique guard / status-precedence check → no-op; return 200 |
| Refund on non-approved payment | (T12 admin) "No se puede reembolsar un pago pendiente / cannot refund a pending payment" | Refund fn returns `not-refundable`; no MP call side-effect; order unchanged |
| Refund MP failure | (T12 admin) "No pudimos procesar el reembolso. Inténtalo de nuevo" | Typed `mp-error`; order/payment state unchanged; raw error logged only |
| Refund success | (T12 admin) "Reembolso realizado" | `advance_order_status`→`refunded` (full) / partial rule; history row; (email is T9) |

## UX Requirements

For EVERY state the payment UI can be in (confirmation page + checkout method
selection). Both locales (es-MX default, en). Mobile-first.

- **Loading (launching Checkout Pro / creating preference)**: the "Pay now"
  button shows a disabled, spinner/"Redirigiendo…" state; the page keeps the
  order summary visible; no layout shift. `aria-busy` on the action region.
- **Empty / no-payment-yet (order just created, not yet paid)**: prominent
  "Pagar ahora / Pay now" primary CTA replacing the old "Sin pago todavía" block,
  with the order total restated next to it and a one-line "elige tu método de
  pago en el siguiente paso / choose your payment method next".
- **Pending (OXXO/SPEI voucher issued)**: a distinct "esperando tu pago / awaiting
  your payment" card with the reference/barcode (monospace, selectable), a
  primary "Ver comprobante / View voucher" link (opens `external_resource_url`),
  and the expiration date formatted per locale. Secondary "pay a different way"
  link. NOT styled as success (no green checkmark).
- **Error (declined / failed / MP unavailable)**: a `role="alert"` banner
  (reuse the checkout `GlobalBanner` pattern from `checkout-flow-client.tsx`) in
  destructive styling with a clear message and a **retry CTA** that re-launches
  Checkout Pro for the same order. For "MP unavailable" the recovery is "try
  again later"; for "declined" it is "try again now".
- **Success (paid)**: the existing green-check confirmation, but the "Sin pago
  todavía" block is replaced by a "Pago recibido / Payment received" confirmation
  with the method used (card/OXXO/SPEI/wallet). `role="status"`, polite live region.
- **Mobile (375px)**: the pay CTA is full-width and thumb-reachable; the voucher
  reference wraps/scrolls without breaking layout; the "View voucher" link is a
  ≥44px tap target. No horizontal scroll.
- **Tablet (768px)**: the pay CTA and order summary sit in the existing two-column
  confirmation grid (`md:grid-cols-2`); voucher card spans full width above the
  summary/shipping cards.
- **Reduced motion**: any redirect spinner / enter animations respect
  `prefers-reduced-motion` (project baseline); enter animations use `ease-out`.

## Technical Approach

### Files to Create

- `supabase/migrations/0009_payments.sql` — (1) `mp_payment_events` idempotency-
  spine table with `unique (mp_payment_id)` (T7 Arch R-3); (2) `advance_order_status`
  RPC (SECURITY DEFINER, empty search_path, writes `order_status_history`, granted
  to service_role only — T7 Arch R-1); (3) indexes on `orders(mp_payment_id)` and
  `orders(mp_external_reference)` (T7 Arch R-4). Idempotent; LOCAL-only.
- `src/lib/payments/mp-client.ts` — `import "server-only"`; builds the
  `MercadoPagoConfig` client from `getMercadoPagoEnv()`. Single source for the SDK
  client. No secret leaves this module boundary.
- `src/lib/payments/preference.ts` — build + create a Checkout Pro Preference for
  an order (items, `external_reference=confirmation_token`, `notification_url`,
  locale `back_urls`, `date_of_expiration` for OXXO/SPEI). Cents→MP decimal
  conversion helper (exact, tested).
- `src/lib/payments/webhook.ts` — PURE signature verification (parse `x-signature`,
  rebuild manifest, HMAC-SHA256, `timingSafeEqual`) kept separate from the route so
  it is testable without HTTP.
- `src/lib/payments/payments-status.ts` — MP `status`/`status_detail` →
  `{ orderStatus, paymentStatus }` mapping + status precedence (out-of-order guard).
- `src/lib/payments/refund.ts` — `refundOrderPayment(orderId, amountCents|null)`;
  server-only; typed result; per-request idempotency key.
- `src/lib/payments/order-payment-read.ts` — read an order's payment view
  (payment_status, mp fields, voucher fields) by confirmation token for the
  confirmation page (extends the existing `order-read.ts` shape, or a sibling).
- `src/app/api/webhooks/mercadopago/route.ts` — the POST webhook handler (the
  repo's FIRST route.ts). Thin: verify signature → fetch payment → reconcile
  amount → `advance_order_status` via RPC → record `mp_payment_events` → 200.
- `src/app/[locale]/checkout/pay-actions.ts` — `"use server"` action(s): create
  preference / re-launch payment for a pending order (returns `init_point` or a
  typed error state).
- `src/components/checkout/payment-panel.tsx` — client component rendering the
  pay-now CTA / pending-instructions / decline-retry states on the confirmation
  page (consumes the payment view + labels).
- `src/components/checkout/oxxo-spei-instructions.tsx` — the voucher/instructions
  card (reference, view-voucher link, expiration).
- Test files: `src/lib/payments/*.test.ts` (unit: signature, mapping, cents
  conversion, refund result mapping), `tests/integration/payments.integration.test.ts`
  (RPC advance + history + idempotency + `mp_payment_events` unique against live
  local DB), `e2e/payment.spec.ts` (method selection, pending instructions,
  decline retry — MP mocked at the boundary), both locales.

### Files to Modify

- `src/lib/env.ts` — add `getMercadoPagoEnv()` + `MercadoPagoEnv` interface,
  mirroring `getServerEnv()` (required-var, `requireEnv`, throws named error).
- `src/lib/config.ts` — add the CENTRALIZED MP non-secret constants block
  (currency confirm, statement descriptor, OXXO/SPEI expiry window, back_url /
  notification_url builders keyed off `confirmation_token`, payment-method→state
  map, amount tolerance = 0, `MP_WEBHOOK_PATH`) with a "how to swap real values"
  header (BUILD_PLAN rule 4).
- `src/lib/supabase/database.types.ts` — add `advance_order_status` to `Functions`
  (typed Args/Returns), add the `mp_payment_events` table Row/Insert/Update,
  following the `create_order` typing pattern.
- `src/app/[locale]/checkout/confirmacion/[token]/page.tsx` — replace the
  hardcoded "Sin pago todavía" block (lines 67-70) with `<PaymentPanel>` driven by
  the order's live payment state; read voucher/payment fields; handle the success/
  pending/failed branches. Keep the token-only addressing (no order_number entry).
- `src/messages/es-MX.json` + `src/messages/en.json` — add `checkout.payment.*`
  keys (pay CTA, pending instructions, voucher labels, decline retry, method
  names, error copy). Update the now-stale `confirmation.noPayment*` keys.
- `.env.local` — keep the existing PLACEHOLDER MP vars; do NOT commit real values.
  (Also add an `.env.example`-style documented block in `dev-done.md`.)

### Data Model Changes

- **New table `mp_payment_events`** — `id uuid pk`, `mp_payment_id text unique
  not null`, `order_id uuid fk`, `mp_status text`, `action text`, `raw jsonb`
  (optional, for audit), `created_at`. The UNIQUE(`mp_payment_id`) is the
  idempotency spine (T7 Arch R-3), SEPARATE from `orders.idempotency_key`.
- **New RPC `advance_order_status(p_order_id uuid, p_order_status order_status,
  p_payment_status payment_status, p_payment_method text, p_mp_payment_id text,
  p_note text)`** (final signature at implementer's discretion; must write
  `order_status_history` and be idempotent per AC-15). Returns a small jsonb
  result. SECURITY DEFINER, empty search_path, service_role-only.
- **New indexes** on `orders(mp_payment_id)` and `orders(mp_external_reference)`
  (T7 Arch R-4).
- **No new enum values** — existing `order_status` / `payment_status` cover T8.
- **No changes to the immutable snapshot** — T8 only writes the already-mutable
  `status`/`payment_status`/`payment_method`/`mp_*` columns.

### API Endpoints

- **POST `/api/webhooks/mercadopago`** — MP notification receiver. Request:
  MP notification JSON (`{ type, action, data: { id } }`) + headers `x-signature`,
  `x-request-id`. Response: `200` on accepted/ignored/duplicate, `401/403` on bad
  signature. No auth other than the signature. Locale-agnostic (not under `[locale]`).
- **Server action `createPaymentPreference(token)`** (not a public REST endpoint)
  — from the confirmation page's pay CTA; returns `{ init_point }` or a typed
  error state.
- **Server function `refundOrderPayment(orderId, amountCents|null)`** — internal,
  called by T12's admin action (NOT exposed as a public endpoint in T8).
- **Outbound to MP**: `POST /checkout/preferences` (via SDK `Preference.create`),
  `GET /v1/payments/{id}` (via SDK `Payment.get`), `POST /v1/payments/{id}/refunds`
  (via SDK `PaymentRefund.create`).

### Dependencies

- **`mercadopago` (official Node SDK)** — needed for preference creation, payment
  fetch, and refunds. **Recommended version: `^3.2.0`** (v3.x is the current
  major, released 2026-05; ships its own TypeScript types — no `@types/` package).
  Most online tutorials show v2; use v3 API shapes (`MercadoPagoConfig`, `Payment`,
  `Preference`, `PaymentRefund`). Install with npm (project uses npm). Alternative:
  raw `fetch` against the REST API (avoids a dependency but reimplements the SDK's
  request/idempotency handling — not recommended for money code).
- **No other new runtime deps.** HMAC uses Node's built-in `crypto`
  (`createHmac`, `timingSafeEqual`) — no new package.

**Exact env vars (repeat in `dev-done.md`):**

| Var | Scope | Where to get it |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | server-only (SECRET) | MP dashboard → Your integrations → your app → Testing → **Test credentials** → Access Token |
| `MERCADOPAGO_WEBHOOK_SECRET` | server-only (SECRET) | MP dashboard → your app → **Webhooks → Configure notifications** → signing secret |
| `MERCADOPAGO_PUBLIC_KEY` | public (safe to expose IF a client SDK/Wallet Brick is used; then `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`) | MP dashboard → Test credentials → Public Key |

Sandbox model: MP has no separate sandbox URL — test credentials + test users
(dashboard → Test accounts, choose Mexico) hit production endpoints. **OXXO/SPEI
approval CANNOT be simulated in test** (docs confirm only request creation is
verifiable) — exercise the pending→approved branch with a signed synthetic
webhook or a card using the `APRO` cardholder name. This is why live-sandbox
verification is BLOCKED-ON-USER and all tests mock MP.

## Out of Scope

- **Transactional emails** (payment-received, OXXO/SPEI instructions, refund-issued,
  new-order alert) — that is **T9**. T8 advances state; T9 sends the mail.
- **Admin order-management UI, the refund BUTTON, cancel-with-stock-restore, the
  order pipeline UI** — that is **T12**. T8 delivers only the refund EXECUTION API
  that T12 calls, and the `advance_order_status` RPC T12 reuses. Do NOT build the
  admin surface, and do NOT auto-restore stock on cancel/expiry (T12 owns that).
- **Meses sin intereses (installments)** — explicitly excluded by PRODUCT_SPEC.
- **Live-updating the open confirmation page** (websockets/polling) when the
  webhook lands — a reload suffices in Phase 1.
- **Real sandbox round-trip / live credentials** — BLOCKED-ON-USER; T8 mocks MP.
- **Checkout API / Payment Bricks on-site flow** — Checkout Pro (redirect) is the
  chosen surface; Bricks are not built (and SPEI-in-Bricks is unconfirmed).
- **Payment via any provider other than Mercado Pago; multi-currency; CFDI.**
- **Distributed/durable webhook queue or the T7 distributed rate limiter (TD-2)** —
  documented follow-ups, not this ticket.
