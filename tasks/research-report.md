# Research Report: T8 — Mercado Pago integration (sandbox)

One-pass scan. Codebase claims are verified against local files (file:line). MP
claims are from the official Mercado Pago developer docs — cited inline, with
every unverified item explicitly flagged (never guessed). This report feeds the
`ultradev`/`ultrareview`/`ultrasecurity`/`ultraarch` stages; the ticket
(`tasks/next-ticket.md`) is the source of acceptance criteria.

> ⚠️ **Payment code — human-review gate is mandatory** (BUILD_PLAN rule 3).
> ⚠️ **Live MP sandbox is BLOCKED-ON-USER**; all tests mock the MP API.

## Codebase Analysis

### Existing Patterns

- **Atomic write via SECURITY DEFINER RPC** — `create_order` in
  `supabase/migrations/0008_checkout.sql:96-282`. `language plpgsql`,
  `security definer`, `set search_path = ''`, `revoke all … from public` +
  `grant execute … to service_role`. Idempotency short-circuit at the top
  (lines 121-139). **T8's `advance_order_status` RPC (Arch R-1) copies this
  posture exactly**, and writes `order_status_history` in the same transaction
  (the `create_order` initial-history insert is the model, lines 264-266).
- **Admin (service-role) client** — `src/lib/supabase/admin.ts:15-24`.
  `import "server-only"` guard (line 10), built from `getServerEnv()`, no
  session persistence. **All T8 privileged writes (webhook, refund) use this.**
  RPC call shape: `const { data, error } = await db.rpc("create_order", { payload })`
  (`actions.ts:412`). Reuse for `db.rpc("advance_order_status", { … })`.
- **Typed env accessor** — `src/lib/env.ts`: `requireEnv(name, source)` throws a
  named `MissingEnvVarError` on missing/blank; `getServerEnv()` composes public +
  secret. **T8 adds `getMercadoPagoEnv()` in the same file, same shape.** The
  test `src/lib/env.test.ts` is the pattern for testing the new accessor.
- **Centralized non-secret config** — `src/lib/config.ts` holds every placeholder/
  tunable with a "HOW TO SWAP REAL VALUES" header (lines 1-35) and per-const doc
  comments. Money constants end in `_CENTS`; `UUID_PATTERN` (line 378-379);
  `confirmationPath()` (lines 560-562); `ORDER_NUMBER_PREFIX` (line 536, mirrored
  in the RPC). **T8's MP tunables live here (BUILD_PLAN rule 4).**
- **Server action → typed state machine** — `placeOrder` in
  `checkout/actions.ts:216-241` returns a discriminated `CheckoutFormState`;
  raw PG/errors are mapped to friendly enums, never echoed (`mapThrownError`
  lines 423-447), logged with `[checkout]` context. **T8's `createPaymentPreference`
  action and the refund fn follow this "typed result, never echo raw" discipline.**
- **Best-effort in-memory rate limiter** — `src/lib/checkout/rate-limit.ts` + the
  `CHECKOUT_RATE_LIMIT_DISABLED=1` server-only bypass wired into
  `playwright.config.ts`. The webhook is server-to-server (MP-signed) so it does
  not need the same limiter, but the pattern (best-effort, per-instance, bounded
  keys) is available if abuse control is wanted on the pay-now action.
- **Token-addressed PII page** — `confirmacion/[token]/page.tsx` +
  `order-read.ts:48-86`: reads by unguessable `confirmation_token`, `notFound()`
  on miss, admin client, `UUID_PATTERN` pre-check before any DB hit. **T8's
  payment view reads by the same token; the MP `external_reference` = this token.**

### Relevant Files

| File | Purpose | Relevance | Action |
| --- | --- | --- | --- |
| `supabase/migrations/0001_extensions_and_enums.sql:20-46` | `order_status` + `payment_status` enums | Both enums already cover T8; no new values | Reference |
| `supabase/migrations/0003_commerce.sql:25-77` | `orders` table — `mp_preference_id`/`mp_payment_id`/`mp_external_reference`/`payment_method`/`payment_status` columns (62-64, 58-59) already exist, nullable | T8 populates these | Reference |
| `supabase/migrations/0003_commerce.sql:112-121` | `order_status_history` shape (`from_status`/`to_status`/`note`) | `advance_order_status` writes here | Reference |
| `supabase/migrations/0006_data_integrity_hardening.sql:170-203` | Immutability trigger — freezes financial/contact snapshot, **leaves status/payment_status/payment_method/mp_\* MUTABLE** | Confirms T8 can update payment fields; trigger BLOCKS overwriting `total_cents` (amount-reconciliation backstop) | Reference |
| `supabase/migrations/0008_checkout.sql:96-282` | `create_order` RPC — the SECURITY DEFINER pattern | Template for `advance_order_status` | Reference |
| `src/lib/supabase/admin.ts` | Service-role client, server-only | Webhook + refund + RPC calls | Reference |
| `src/lib/env.ts` | `requireEnv` / `getServerEnv` | Add `getMercadoPagoEnv()` | **Modify** |
| `src/lib/config.ts` | Centralized non-secret config | Add MP tunables block | **Modify** |
| `src/lib/supabase/database.types.ts:58-88, 925-965` | `CreateOrderPayload`/`Result` + `Functions` typing | Add `advance_order_status` + `mp_payment_events` types | **Modify** |
| `src/app/[locale]/checkout/confirmacion/[token]/page.tsx:67-70` | "Sin pago todavía" placeholder block | Replace with `<PaymentPanel>` | **Modify** |
| `src/lib/checkout/order-read.ts` | `getOrderByToken` view model | Extend / sibling for payment view (payment_status, mp fields, voucher) | Reference / Modify |
| `src/components/checkout/checkout-flow-client.tsx:126-130, 299-347` | Success redirect to `confirmationPath`; `GlobalBanner` pattern | Reuse banner for decline/error; redirect stays | Reference |
| `src/messages/es-MX.json:300-415` + `en.json` | `checkout` i18n namespace | Add `checkout.payment.*`; update `confirmation.noPayment*` | **Modify** |
| `.env.local` | Has PLACEHOLDER `MERCADOPAGO_*` vars | Keep placeholders; document in dev-done | Reference |
| `scripts/run-integration.sh`, `vitest.integration.config.ts` | Live-DB integration runner (`tests/integration/**/*.integration.test.ts`, node env, sequential) | New `payments.integration.test.ts` | Reference |
| `playwright.config.ts` | e2e (chromium + mobile), dev-server, `CHECKOUT_RATE_LIMIT_DISABLED=1` | New `e2e/payment.spec.ts` (MP mocked) | Reference |

### Data Flow

**Pay-now (Checkout Pro redirect):**
1. Shopper lands on `confirmacion/[token]` (order in `pending_payment`).
2. `<PaymentPanel>` "Pay now" → server action `createPaymentPreference(token)`.
3. Action: admin-reads order by token → builds Preference (items, `unit_price`
   from cents, `external_reference=confirmation_token`, `notification_url`,
   locale `back_urls`, `date_of_expiration`) → `Preference.create` (MP SDK) →
   persist `mp_preference_id` via `advance_order_status` (or a scoped update RPC) →
   returns `{ init_point }`.
4. Client redirects browser to `init_point` (MP hosted checkout).
5. Shopper pays (card / OXXO voucher / SPEI CLABE / wallet).
6. MP redirects back to the `back_url` (display hint only) AND POSTs a webhook.

**Webhook (authoritative state):**
1. MP → `POST /api/webhooks/mercadopago` with `{ type, action, data:{ id } }` +
   `x-signature`, `x-request-id`.
2. Route: verify signature (HMAC-SHA256 of the manifest) — fail → 401, stop.
3. `type=payment` → `Payment.get({ id })` (MP SDK) for the authoritative status.
4. Match order via `external_reference`(=token) / `mp_preference_id` (admin read).
5. Reconcile: MP amount == order `total_cents`? mismatch → log, do NOT mark paid.
6. Map MP status → `{orderStatus, paymentStatus}`; apply status precedence.
7. `advance_order_status` RPC (updates mutable cols + writes history, in-txn) —
   guarded by `mp_payment_events` unique(`mp_payment_id`) for idempotency.
8. Return 200 (even for unknown/duplicate/ignored) so MP stops retrying.

**Refund (T12 calls it):**
1. T12 admin action → `refundOrderPayment(orderId, amountCents|null)`.
2. Read order → guard `payment_status ∈ {paid}` else `not-refundable`.
3. `PaymentRefund.create({ payment_id: mp_payment_id, body: amount? })` with
   per-request `X-Idempotency-Key`.
4. Success → `advance_order_status`→`refunded` (full rule) + history; typed result.

### Similar Features (Reference Implementations)

- **`create_order` RPC + `placeOrder` action** (`0008_checkout.sql`,
  `checkout/actions.ts`) — the closest analog: an atomic DB mutation behind a
  SECURITY DEFINER RPC, invoked from a server boundary that maps raw errors to a
  typed friendly state. T8's webhook→`advance_order_status` mirrors this. Key
  patterns to follow: idempotency short-circuit inside the RPC; `[context]`-prefixed
  logging; never echo raw errors; service_role-only execute grant.
- **`getOrderByToken`** (`order-read.ts`) — token-addressed admin read with a
  `UUID_PATTERN` pre-check and `null`-on-miss. T8's payment view is a sibling.
- **`GlobalBanner` + `resolveBanner`** (`checkout-flow-client.tsx:299-376`) — the
  destructive-alert + recovery-action UI for the decline/error states (AC-16).
- **Q&A action** (`producto/[slug]/actions.ts`) — the client-IP + best-effort
  limiter precedent, if the pay-now action wants abuse control.

## Dependency Analysis

### Existing Dependencies to Leverage

- **`@supabase/supabase-js` ^2.110.2** — RPC + admin reads (webhook, refund).
- **Node built-in `crypto`** — `createHmac('sha256', secret)` + `timingSafeEqual`
  for webhook verification. No new package needed for HMAC.
- **`next-intl` ^4.13.2** — `getTranslations({ locale, namespace: "checkout" })`
  in server components (confirmation page pattern, `page.tsx:33,46`);
  `useTranslations("checkout")` in client components.
- **`@hugeicons/react` + core-free-icons** — icons (never mix sets). Use existing
  `CheckmarkCircle02Icon`, `Alert02Icon`, `Refresh01Icon`.

### New Dependencies Needed

- **`mercadopago` ^3.2.0** — official Node SDK. v3.x is the current major (v3.0.0
  released 2026-05-21; latest 3.2.0 verified via npm registry + GitHub releases).
  Ships bundled TypeScript types (`"types": "dist/index.d.ts"`) — no `@types/`
  package. **Gotcha: most tutorials online show v2**; use v3 shapes:
  `new MercadoPagoConfig({ accessToken })`, `new Payment(client)`,
  `new Preference(client)`, `new PaymentRefund(client)`. Idempotency per request:
  `requestOptions: { idempotencyKey }`. Alternative considered: raw `fetch` against
  the REST API — rejected for money code (reimplements SDK request/retry/idempotency).

### Internal Dependencies

- `advance_order_status` RPC (new) is depended on by: the webhook route, the
  refund fn, and **T12's admin status updates** (build it as a reusable, general
  transition RPC, not webhook-specific).
- `mp_payment_events` (new) depends on `orders` (FK) and is the idempotency spine
  for the webhook — SEPARATE from `orders.idempotency_key` (T7 Arch R-3).
- `getMercadoPagoEnv()` → `mp-client.ts` → preference/refund/webhook libs. The
  `server-only` guard on `mp-client.ts` keeps the access token out of any bundle.

## External Research

### Mercado Pago — Integration Surface (Checkout Pro vs Checkout API/Bricks)

| Product | Card | OXXO | SPEI | Wallet | Model | PCI |
| --- | --- | --- | --- | --- | --- | --- |
| **Checkout Pro** | ✅ | ✅ | ✅ ("SPEI Transfer") | ✅ | Redirect (hosted) | **SAQ-A** |
| Checkout API (raw) | ✅ | ✅ | ✅ (`clabe`, `bank_transfer`) | — | On-site (you build all) | not classified in doc |
| Payment Brick | ✅ | ✅ (`oxxo`) | ⚠️ **UNCONFIRMED** | ✅ | On-site component | not classified in doc |

- Checkout Pro overview lists all four Mexico rails: https://www.mercadopago.com.mx/developers/en/docs/checkout-pro/overview
- PCI scope table (Checkout Pro = SAQ-A): https://www.mercadopago.com.mx/developers/en/docs/security/pci
- Bricks non-card methods list only ticket-type (oxxo/paycash/bancomer/banamex),
  never SPEI: https://www.mercadopago.com.mx/developers/en/docs/checkout-bricks/payment-brick/payment-submission/other-payment-methods
- **RECOMMENDATION: Checkout Pro (Preference + redirect).** Only product confirmed
  to cover all four rails in Mexico, lowest PCI burden, least effort, composes with
  our token-addressed confirmation page. Bricks' unconfirmed SPEI support is a real
  risk; OXXO/SPEI hand off out-of-band anyway (voucher/CLABE), weakening on-site.
- SPEI MXN note: uses CLABE; MP recommends ~3-day `date_of_expiration` (crediting
  can take up to ~2 business hours). https://www.mercadopago.com.mx/developers/en/docs/checkout-api/payment-integration/spei-transfers
- Enablement: no OXXO/SPEI-specific activation documented (only seller onboarding).
  ⚠️ docs are silent — silence ≠ confirmed "none required".

### MP — Node SDK (`mercadopago` v3)

```ts
import { MercadoPagoConfig, Payment, Preference, PaymentRefund } from 'mercadopago';
const client = new MercadoPagoConfig({ accessToken, options: { timeout: 5000 } });
await new Preference(client).create({ body: { items, external_reference, notification_url, back_urls } });
await new Payment(client).get({ id: paymentId });                       // webhook status fetch
await new PaymentRefund(client).create({ payment_id, body: { amount } }); // omit body = full refund
```
Access token on the config constructor; per-request idempotency via
`requestOptions.idempotencyKey`. README: https://github.com/mercadopago/sdk-nodejs

### MP — Webhook `x-signature` Verification (the critical trust boundary)

Doc: https://www.mercadopago.com.mx/developers/en/docs/your-integrations/notifications/webhooks

- Header: `x-signature: ts=<ts>,v1=<hex-hmac>` (comma-separated).
- **Manifest template (exact):** `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
  — order id → request-id → ts, each segment ends with `;`.
- **Secret:** dashboard → your app → Webhooks → Configure notifications.
- **Algorithm:** HMAC-SHA256, hex digest, compare to `v1` with `timingSafeEqual`.
- **`data.id` gotcha (verbatim from docs):** if `data.id` has uppercase chars,
  **lowercase it** before building the manifest. Numeric payment ids unaffected.
- ⚠️ `ts` appears as ms in newer examples, seconds in older — **use the raw string
  as-is, never reformat**. Absent segments are omitted (medium-high confidence).

```ts
const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
const digest = crypto.createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
// timingSafeEqual(Buffer.from(digest), Buffer.from(v1))
```

### MP — Sandbox / Test Credentials Model

- **No separate sandbox URL** — test credentials + test users hit production
  endpoints. Test accounts: dashboard → Your integrations → app → Test accounts →
  create (choose **Mexico**, max 15, non-deletable). https://www.mercadopago.com.ar/developers/en/docs/your-integrations/test/accounts
- Credentials: app → Testing → **Test credentials** (Access Token + Public Key);
  production requires business info. https://www.mercadopago.com.mx/developers/en/docs/your-integrations/credentials
  ⚠️ test tokens can ALSO carry the `APP_USR-` prefix — prefix alone ≠ test vs prod.
- Webhook secret: separate, under Webhooks → Configure notifications.
  ⚠️ **UNVERIFIED** whether test-mode and prod-mode use different secrets — check
  the dashboard.
- Mexico test cards (⚠️ values rotate — reconfirm before hardcoding):
  Mastercard `5474 9254 3267 0366`, Visa `4075 5957 1648 3764`, Amex
  `3711 803032 57522` (CVV 1234); CVV `123` (Amex 1234); any future expiry.
  https://www.mercadopago.com.mx/developers/en/docs/checkout-pro/integration-test/test-purchases
- **Force result via cardholder name:** APRO (approved), OTHE (error), CONT
  (pending), CALL, FUND (insufficient), SECU (bad CVV), EXPI, FORM. ⚠️ exact MX
  identity-document value to pair is not documented (`12345678909` is Brazil CPF).
- ⚠️ **CRITICAL verified negative — OXXO/SPEI CANNOT be force-approved in test.**
  Docs: offline-method testing "only allows verification of correct payment flow
  creation, but not obtaining a final status". Test buyer email must be
  `@testuser.com`. **To exercise pending→approved for OXXO/SPEI, post a signed
  synthetic webhook to our own endpoint** (or use a card with `APRO`). Dashboard
  has a Webhooks Notifications Simulator.
  https://www.mercadopago.com.mx/developers/es/docs/checkout-api-v2/integration-test/spei-transfers
- Env var naming: MP prescribes none (docs call them `access_token`, `public_key`).
  This project uses the PRODUCT_SPEC names already stubbed in `.env.local`:
  `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`.

### MP — Payment Lifecycle / Status Mapping

⚠️ Two API generations exist — classic `/v1/payments` (what the SDK `Payment`
resource + Checkout Pro webhooks use, mapped below) vs the newer Orders API. Use
the classic Payments statuses.

- **`status`:** `pending`, `approved`, `authorized`, `in_process`, `in_mediation`,
  `rejected`, `cancelled` (double-L; incl. expiry), `refunded`, `charged_back`.
  https://www.mercadopago.com.ar/developers/en/docs/checkout-api-payments/response-handling/query-results
- **`status_detail` examples:** `accredited`, `pending_waiting_payment` (OXXO),
  `pending_waiting_transfer` (SPEI), `expired`, `cc_rejected_*`. Rejection reasons:
  https://www.mercadopago.com.mx/developers/en/docs/checkout-pro/how-tos/improve-payment-approval/reasons-for-rejection
- **Proposed mapping (implement + unit-test, AC-14):**
  | MP status | our `payment_status` | our `order_status` |
  | --- | --- | --- |
  | `approved` | `paid` | `paid` |
  | `pending`, `in_process` | `pending` | `pending_payment` (unchanged) |
  | `authorized` | `authorized` | `pending_payment` (unchanged; capture is a later event) |
  | `rejected`, `cancelled` | `failed` | `pending_payment` (allow retry) |
  | `refunded` | `refunded` | (refund flow decides; not auto-`cancelled`) |
  | `charged_back`, `in_mediation` | (unchanged / flag) | (unchanged) — log, never mark paid |
  | unknown | (unchanged) | (unchanged) — log |
- **OXXO/SPEI voucher fields — IMPORTANT correction to a common assumption:**
  current docs put the voucher under **`transaction_details`**, NOT
  `point_of_interaction`:
  `transaction_details.external_resource_url` (voucher/instructions URL),
  `transaction_details.payment_method_reference_id` (reference/barcode),
  `transaction_details.verification_code`; expiry via top-level
  `date_of_expiration`.
  https://www.mercadopago.com.mx/developers/en/docs/checkout-api-payments/integration-configuration/other-payment-methods
  ⚠️ `point_of_interaction.transaction_data.ticket_url/.barcode` could NOT be
  confirmed for OXXO/SPEI (that structure is PIX/Brazil). **Read defensively:
  prefer `transaction_details.*`, treat `point_of_interaction` as fallback, and
  inspect a real sandbox response before finalizing field paths** (blocked-on-user).
- **Webhooks carry only `data.id`** (no status) — MUST
  `GET https://api.mercadopago.com/v1/payments/{id}` (Bearer access token) to
  resolve status. Notifications fire on creation and every status change — that is
  how OXXO/SPEI pending→approved reaches us. https://www.mercadopago.com.ar/developers/en/reference/payments/_payments_id/get

### MP — Refund API

- **Endpoint:** `POST https://api.mercadopago.com/v1/payments/{id}/refunds`.
  https://www.mercadopago.com.mx/developers/en/reference/chargebacks/_payments_id_refunds/post
- **Full refund:** empty body. **Partial:** `{ "amount": <number> }`; multiple
  partials allowed up to the original total.
- **Idempotency:** `X-Idempotency-Key` header listed REQUIRED — always send it.
- **Refund status:** `approved`, `in_process` documented. ⚠️ `rejected`/`cancelled`
  as refund statuses NOT confirmed — don't build enum exhaustiveness on them.
- **Constraints:** only **approved** payments can be refunded (pending/in_process
  are *cancelled* instead via `PUT /v1/payments/{id}` status=cancelled). **Refund
  window: 180 days from approval** (verbatim). Requires sufficient MP balance or
  the refund fails. List/get: `GET /v1/payments/{id}/refunds[/{refund_id}]`.
  https://www.mercadopago.com.mx/developers/en/docs/sales-processing/cancellations-and-refunds

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Webhook signature bypass (attacker forges a "paid" webhook → free order) | Med | **Critical** | Verify HMAC-SHA256 before ANY side-effect; `timingSafeEqual`; reject on any parse/mismatch; NEVER trust webhook body for state — always `Payment.get`. Human-review this file. |
| Amount tampering (preference/webhook amount ≠ order total) | Med | **Critical** | Amount reconciliation vs immutable `total_cents` (AC-12, tolerance 0); DB trigger already blocks overwriting `total_cents`. |
| Duplicate / out-of-order webhooks double-advance or regress state | High | High | `mp_payment_events` unique(`mp_payment_id`) spine (R-3) + status-precedence guard + idempotent `advance_order_status` (AC-10/AC-15). |
| Float drift converting cents ↔ MP decimal `unit_price`/`amount` | Med | High | Exact integer-cents → decimal conversion helper, unit-tested with edge amounts; never `Number` arithmetic that rounds. |
| Wrong OXXO/SPEI voucher field path (docs ambiguous) | High | Med | Read `transaction_details.*` first, `point_of_interaction` fallback; verify against a live sandbox response (blocked-on-user); render defensively (hide the card if fields absent). |
| Bricks-vs-Checkout-Pro / SPEI-in-Bricks confusion | Low (mitigated by choosing Checkout Pro) | High | Ticket mandates Checkout Pro; Bricks explicitly out of scope. |
| MP SDK v2 vs v3 API drift (tutorials show v2) | Med | Med | Pin `^3.2.0`; use v3 shapes; TS types catch misuse. |
| Live sandbox blocked → integration gaps ship unverified | High | High | ALL tests mock MP; the human-review gate + a documented "run this against real sandbox before launch" checklist in dev-done are the backstop. Flag loudly. |
| Webhook returns 500 on unknown/dup → MP retries forever | Med | Med | Return 200 for unknown/duplicate/ignored; 401 only for bad signature (AC-11). |
| Refund on non-approved / over-refund | Med | Med | Guard `payment_status` before the MP call; bound partials ≤ total; typed `not-refundable`/`mp-error` results (AC-19/AC-20). |

### Performance Considerations

- Webhook handler must be FAST and return 200 quickly (MP retries on slow/failed
  deliveries). The `Payment.get` round-trip + one RPC is fine; avoid heavy work
  inline. No new indexes on the hot path beyond R-4 (`mp_payment_id`,
  `mp_external_reference`) which the webhook filters by.
- Preference creation is user-blocking (behind the pay-now spinner) — set an SDK
  `timeout` and surface a friendly "try again" on timeout.

### Security Considerations

- **Secrets:** `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET` are
  server-only; NEVER `NEXT_PUBLIC_`. `mp-client.ts` gets `import "server-only"`.
  Only `MERCADOPAGO_PUBLIC_KEY` may be exposed, and only if a client SDK/Wallet
  Brick is used (redirect baseline needs none). Never log the secret or full token.
- **Unauthenticated public endpoint:** the webhook is the store's first public
  `route.ts`. The signature IS the authentication. Verify before reading the DB.
- **IDOR:** the pay-now action and payment view are addressed by
  `confirmation_token` only (never `order_number`) — inherits the T7 IDOR fix.
- **No raw MP/PG errors to the UI** — map to typed friendly states (T7 discipline).
- **Immutability:** the DB trigger prevents even the service-role client from
  overwriting the financial snapshot — a defense-in-depth backstop behind AC-12.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Migration `0009_payments.sql`** (`mp_payment_events` + `advance_order_status`
   RPC + R-4 indexes) — everything else depends on the RPC and the idempotency
   spine. Add DB types alongside. Write the integration test first (RPC advance +
   history + idempotency).
2. **`getMercadoPagoEnv()` + config MP constants** — the wiring seam; unit-test the
   env accessor (missing/blank → named error) and the constant builders.
3. **`mp-client.ts` + `webhook.ts` (pure signature + `payments-status.ts` mapping)**
   — the pure, heavily-unit-tested core (valid/invalid/replay/out-of-order/unknown/
   amount-mismatch, status mapping, cents↔decimal). No HTTP, no DB.
4. **Webhook route** (`route.ts`) — compose the pure pieces: verify → fetch →
   reconcile → RPC → record event → 200. Integration-test with a mocked `Payment.get`.
5. **`preference.ts` + pay-actions + `<PaymentPanel>`/instructions UI + confirmation
   page wiring + i18n** — the shopper-facing flow (pay-now, pending, decline retry),
   both locales. e2e with MP mocked at the boundary.
6. **`refund.ts`** — the T12-facing execution API (full/partial/not-refundable/
   mp-error), unit-tested. No admin UI (that is T12).
7. **Docs:** `dev-done.md` with the exact env vars, where to get sandbox creds,
   the "run against real sandbox before launch" checklist, the field-path caveat,
   and a PROMINENT human-review flag.

### Key Decisions

- **Checkout Pro (redirect), not Bricks/Checkout API** — only confirmed all-four-
  rails Mexico surface, lowest PCI, least effort, composes with the token page.
- **`advance_order_status` as a general reusable RPC** (not webhook-specific) so
  T12 reuses it for manual status changes — satisfies Arch R-1 once for both tasks.
- **Idempotency spine = `mp_payment_events` unique(`mp_payment_id`)**, separate
  from `orders.idempotency_key` (Arch R-3) — the two dedupe different things
  (order creation vs payment events).
- **Never trust `back_url` params for state** — the webhook + `Payment.get` are the
  single source of truth; the page reads live DB state on load.
- **Amount tolerance = 0** — MXN is integer-cents; any mismatch is a discrepancy.
- **Refund `payment_status='refunded'` only for a full refund** — partial refunds
  keep `paid` and are recorded in history (documented rule for AC-19).

### Anti-Patterns to Avoid

- Don't mark an order `paid` from the webhook BODY — it carries no status; always
  `Payment.get`. Don't trust `back_url` query params either.
- Don't `.update({ status })` an order directly — go through `advance_order_status`
  (Arch R-1); ad-hoc updates skip the history row and the immutability contract.
- Don't 500 on unknown/duplicate webhooks — return 200 or MP retries forever.
- Don't do money math in floats — integer cents in, exact decimal conversion out.
- Don't compare signatures with `===` — use `timingSafeEqual` (timing attack).
- Don't `NEXT_PUBLIC_` the access token or webhook secret; don't log them.
- Don't hardcode voucher field paths blind — docs are ambiguous; read defensively
  and verify against a real sandbox response (blocked-on-user).
- Don't build ahead into T9 (emails) or T12 (admin UI, cancel-with-stock-restore) —
  only the refund EXECUTION API and the reusable RPC belong to T8.
- Don't assume OXXO/SPEI can be force-approved in test — they can't; use signed
  synthetic webhooks to exercise the pending→approved branch.

## "Could Not Verify" — Open Items (do not paper over)

1. **Payment Brick SPEI support in Mexico** — undocumented (moot: we chose
   Checkout Pro; SPEI is confirmed for Checkout Pro).
2. **Exact SAQ tier for Checkout API / Bricks** — PCI table only classifies
   Checkout Pro (SAQ-A). Moot for our choice.
3. **`point_of_interaction.transaction_data.*` for OXXO/SPEI** — use
   `transaction_details.*`; verify against a live sandbox response.
4. **`date_of_expiration` presence in the OXXO response body** — high confidence,
   not quote-confirmed.
5. **Whether the webhook secret differs between test and prod modes** — check dashboard.
6. **MX identity-document value for test cards; card numbers rotate.**
7. **Refund statuses beyond `approved`/`in_process`.**
8. **OXXO/SPEI method-specific enablement** — docs silent (implies none beyond onboarding).

All of the above are gated behind the blocked-on-user live-sandbox verification;
the human reviewer must confirm the field paths and credential model against a
real MP sandbox before launch.
