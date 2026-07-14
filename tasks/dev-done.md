# Dev Summary: T8 — Mercado Pago integration (sandbox)

> ⚠️ **HUMAN-REVIEW GATE (BUILD_PLAN rule 3) — MANDATORY BEFORE MERGE.** This is
> PAYMENT code. Every downstream pipeline verdict on T8 is ADVISORY. A SHIP
> verdict does NOT authorize merge. A human MUST review the signature
> verification (`webhook.ts` + `route.ts`), amount reconciliation
> (`process-payment.ts`), refund execution (`refund.ts`), order-state
> advancement (`0009_payments.sql` RPC), and secret handling (`env.ts`,
> `mp-client.ts`) before this task is checked off.
>
> ⚠️ **LIVE-SANDBOX VERIFICATION IS BLOCKED-ON-USER.** No working MP credentials
> exist; `.env.local` holds PLACEHOLDERS. ALL tests mock the MP API. A real
> sandbox round-trip cannot run in this pipeline. See "BLOCKED-ON-USER" +
> "Env vars / sandbox creds" below.

## Chosen surface

**Checkout Pro (redirect / preference).** The confirmation page's `<PaymentPanel>`
pay CTA calls a server action that creates an MP Preference and returns
`init_point`; the client redirects the browser to MP's hosted checkout. MP posts
an authoritative webhook back to `/api/webhooks/mercadopago`. Truth lives in the
DB (set by the webhook); the `back_url` `?mp_status` param is a display hint only.

## Files Changed

### Created

| Path | Summary |
|------|---------|
| `supabase/migrations/0009_payments.sql` | (1) `advance_order_status` RPC (R-1): the ONE path that transitions order status/payment fields; writes `order_status_history` atomically; idempotent (no-op on same status) + regression-guarded (`order_status_rank` helper). SECURITY DEFINER, empty search_path, execute → service_role only. (2) `mp_payment_events` table (R-3) with `unique(mp_payment_id)` idempotency spine + `grant all … to service_role`. (3) R-4 indexes on `orders(mp_payment_id)` / `orders(mp_external_reference)`. Idempotent, LOCAL-only. |
| `src/lib/payments/config.ts` | Centralized NON-secret MP tunables (AC-3): currency, statement descriptor, voucher-expiry window, `binary_mode=false`, `AMOUNT_RECONCILIATION_TOLERANCE_CENTS=0`, webhook path, return-status param, `payment_type_id`→method map (`resolvePaymentMethod`). "How to swap real values" header. |
| `src/lib/payments/money-boundary.ts` | The ONE cents↔MP-decimal boundary (exact integer/string math, no float drift). `centsToMpAmount`, `centsToDecimalString`, `mpAmountToCents`. |
| `src/lib/payments/mp-client.ts` | `import "server-only"` MP SDK client factory from `getMercadoPagoEnv()` (bounded timeout). `preferenceClient`/`paymentClient`/`refundClient`. The only place the access token is read. |
| `src/lib/payments/webhook.ts` | PURE `x-signature` verification (AC-8): parse `ts,v1`; rebuild manifest `id:<lc>;request-id:<>;ts:<>;`; HMAC-SHA256; `timingSafeEqual`. Fail-closed on any anomaly. |
| `src/lib/payments/payments-status.ts` | Pure MP-status → `{orderStatus, paymentStatus}` mapping (AC-14): approved→paid; pending/in_process→pending; authorized→authorized; rejected/cancelled→failed; refunded→refunded; charged_back/in_mediation/unknown→**flag** (never auto-paid). |
| `src/lib/payments/urls.ts` | Absolute, locale-correct `back_urls` + `notification_url` builders keyed off `confirmation_token`. |
| `src/lib/payments/preference.ts` | `createPreferenceForOrder` — reads the pending order, builds the preference (items cents→decimal, `external_reference`=token, `notification_url`, `back_urls`, `date_of_expiration`), `Preference.create`, persists `mp_preference_id`/`mp_external_reference`. Typed result, never throws/echoes raw (AC-4, AC-6, edge 11). |
| `src/lib/payments/advance-order.ts` | Thin typed wrapper over the `advance_order_status` RPC (the single sanctioned transition path). |
| `src/lib/payments/process-payment.ts` | The webhook core (AC-9..AC-15): authoritative `Payment.get` → `mp_payment_events` claim (dedupe) → order match → zero-tolerance amount reconciliation → map → RPC advance. Every terminal outcome → typed `ProcessResult` (200 for processed/dup/unknown/mismatch/flag; 500 only for internal/MP-down). |
| `src/lib/payments/refund.ts` | `refundOrderPayment(orderId, amountCents\|null)` (AC-19, AC-20): guards `paid`; full→`refunded` via RPC, partial→stays `paid`; per-request idempotency key; typed `refunded`/`not-refundable`/`mp-error`/`error`; never echoes raw MP error. |
| `src/lib/payments/order-payment-read.ts` | `getOrderPaymentByToken` — live DB payment view; for pending OXXO/SPEI, fetches the voucher live from MP and `extractVoucher` reads it DEFENSIVELY (`transaction_details.*` first, `point_of_interaction.*` fallback, every field nullable). |
| `src/lib/payments/panel-state.ts` | Pure `derivePanelState` — DB fields (+ display-only `returnHint`) → discriminated panel state. Never flips to paid on a hint alone (EC-6). |
| `src/lib/payments/ui-constants.ts` | `COPIED_RESET_MS` (client-importable UI timing; no secret). |
| `src/app/api/webhooks/mercadopago/route.ts` | The repo's FIRST route handler (AC-7). POST: verify signature BEFORE any side effect → 401 on bad; non-payment → 200 ignore; payment → `processPaymentNotification`. `runtime="nodejs"` (crypto). |
| `src/app/[locale]/checkout/pay-actions.ts` | `"use server"` `createPaymentPreference(token, locale)` → `PayActionResult` (`redirect`/`unavailable`/`not-payable`/`error`). Resolves origin from request headers (or `NEXT_PUBLIC_SITE_URL`). |
| `src/components/checkout/payment-panel.tsx` | `"use client"` `<PaymentPanel>` state machine (unpaid/failed/processing/pending-voucher/paid + client unavailable/error overlays). Owns the pay/retry call + `window.location.assign(initPoint)` redirect. Reuses `.enter-fade`/`.cart-press`; `role=alert`/`role=status`; text-swap redirect + `aria-busy`. |
| `src/components/checkout/oxxo-spei-instructions.tsx` | `<OxxoSpeiInstructions>` amber/neutral voucher card. Defensive rendering (no undefined/Invalid Date/empty href); feature-detected copy (`useSyncExternalStore`, no setState-in-effect); `Intl.DateTimeFormat` expiry. |
| `src/components/checkout/payment-labels.ts` | Resolves `checkout.payment.*` i18n into the typed `PaymentPanelLabels` bundle (server-side; keeps the panel presentational). |
| `src/lib/payments/*.test.ts` (8 files) | Unit tests: webhook signature, status mapping, money boundary, panel-state, config/method map, process-payment (mocked MP+DB), refund (mocked), extract-voucher, secret-exposure. |
| `tests/integration/payments.integration.test.ts` | Live-DB RPC advance + history + idempotency + regression + `order_not_found`; `mp_payment_events` unique + cascade. |
| `e2e/payment.spec.ts` | Prod-build e2e (chromium+mobile, both locales): pay-now panel on a pending order (AC-5), pay-now→unavailable with placeholder creds (edge 11), EN copy (AC-21), no mobile overflow. |

### Modified

| Path | What changed |
|------|--------------|
| `src/lib/env.ts` | Added `getMercadoPagoEnv()` + `MercadoPagoEnv` (server-only MP secrets; named-error on missing; public key intentionally NOT read — redirect surface, AC-1 note). |
| `src/lib/supabase/database.types.ts` | Added `mp_payment_events` table Row/Insert/Update, the `advance_order_status` Function entry, and `AdvanceOrderStatusArgs`/`Result` **type aliases** (see Key Decisions — interfaces break Supabase's `Record<string,unknown>` Args constraint). |
| `src/app/[locale]/checkout/confirmacion/[token]/page.tsx` | Replaced the "Sin pago todavía" muted block with `<PaymentPanel>`; hero icon/title branch on paid vs not (paid→emerald+`paidTitle`, else muted+`receivedTitle`); reads `getOrderPaymentByToken` + derives panel state; reads `?mp_status` display hint. Summary/shipping/container unchanged. |
| `src/messages/es-MX.json` + `en.json` | Added `checkout.payment.*` (both locales, symmetric); added `confirmation.paidTitle`/`receivedTitle`; updated `summary.noPaymentYet`; REMOVED stale `confirmation.title`/`noPaymentTitle`/`noPaymentYet`. |
| `src/messages/keys-used.test.ts` | Registered the new consumed `checkout.payment.*` + `confirmation.*` keys. |
| `src/lib/env.test.ts` | Added `getMercadoPagoEnv` tests. |
| `.env.local` (gitignored) | Reformatted the MP placeholder block with a documented "where to get" header (values unchanged; still placeholders). |
| `package.json` / `package-lock.json` | Added `mercadopago@^3.2.0`. |

## Data-Testids Added

- `payment-panel-unpaid`, `payment-panel-failed`, `payment-panel-paid`, `payment-panel-processing`, `payment-panel-unavailable`
- `payment-pay-now`, `payment-retry`, `payment-unavailable-retry`, `payment-processing-retry`, `payment-refresh`
- `payment-total`, `payment-method-label`
- `payment-voucher`, `payment-voucher-reference`, `payment-voucher-copy`, `payment-voucher-amount`, `payment-voucher-expires`, `payment-voucher-link`, `payment-voucher-no-url`, `payment-voucher-generating`, `payment-voucher-pay-differently`

## Key Decisions

- **Supabase `Args` typing must be a `type` alias, not `interface`.** An `interface` used as a Function's `Args` fails Supabase's `GenericFunction.Args extends Record<string, unknown>` constraint (interfaces lack an implicit index signature) → the WHOLE `Database` type collapses to `never` (222 cascade errors). Switching `AdvanceOrderStatusArgs`/`Result` to `type` aliases fixed it. Documented so no one "cleans it up" back to an interface.
- **`advance_order_status` is a GENERAL, reusable transition RPC** (not webhook-specific) so T12 reuses it. Regression guard via `order_status_rank`; idempotent same-status no-op (no dup history) refines payment fields but writes no history row.
- **`mp_payment_events` needs its own `grant … to service_role`** — 0005's blanket grant was point-in-time over then-existing tables; a table created in 0009 is not covered.
- **Amount reconciliation gates ONLY the paid transition** (tolerance 0). Pending/failed carry no money movement to reconcile.
- **Partial refund keeps `payment_status='paid'`** (documented AC-19 rule); no history row (the RPC's no-op branch writes none) — the partial's audit trail is the MP refund record + the `refunded` webhook's `mp_payment_events` row. A partial-refund ledger is T12's concern.
- **Voucher fields fetched LIVE from MP on confirmation-page load** (not stored on the order) — read defensively; a fetch failure degrades to the "check your email" card, never a broken UI.
- **Redirect handoff is a text swap** ("Pagar ahora"→"Redirigiendo…", `aria-busy`), no invented spinner (Emil/checkout precedent). All motion reuses existing globals.css classes.

## Deviations from Ticket

- **`MERCADOPAGO_PUBLIC_KEY` is not read anywhere** (AC-1 note): the redirect baseline needs only the server access token. Documented; if a client Wallet Brick is ever added, expose it as `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`.
- **Partial-refund history row**: the RPC's idempotent design deliberately writes no history on a no-op (same-status) transition, so a partial refund logs to console + relies on the MP refund record / `refunded` webhook rather than a synthetic history row. Documented above.
- **Live "unknown payment → 200" cannot be shown with placeholder creds** — `Payment.get` fails auth (MP 401) first, so the live synthetic-webhook test returns 500 (transient → MP retries, correct). The unknown-order→200 path is proven by unit test (`process-payment.test.ts`).

## Edge Cases Handled

1. **Webhook replay (same payment id twice)** — `mp_payment_events` unique guard → `duplicate`, 200, no double-advance (unit + integration).
2. **Out-of-order webhooks** — `advance_order_status` regression guard refuses paid→pending; `mapMpStatus` + RPC (unit + integration).
3. **Unknown/unmatched payment** — matched by `mp_external_reference` or `confirmation_token`; unmatched → logged, 200, no mutation (unit).
4. **Card decline then retry** — `rejected`→`failed`, order stays pending; `<PaymentPanel state=failed>` retry re-creates a preference for the SAME order (unit + e2e panel).
5. **OXXO/SPEI voucher expiry** — `cancelled/expired`→`failed`; page offers a fresh attempt; stock NOT restored (T12 owns that).
6. **Webhook-before-redirect race** — page reads live DB (never the `?mp_status` hint) → correct by construction; `processing` state + reload (unit `derivePanelState`).
7. **Amount mismatch** — zero-tolerance reconciliation; NOT marked paid, logged, `amount-mismatch` (unit).
8. **Refund a pending payment** — `not-refundable/not-paid`, no MP call (unit).
9. **Partial then over-refund** — partial bounded ≤ total locally; over → `not-refundable/amount-invalid` (unit).
10. **Refund MP failure** — `mp-error`, state UNCHANGED, raw error logged not echoed (unit).
11. **Missing/placeholder MP creds** — `getMercadoPagoEnv()` throws named error; pay action → `unavailable`; webhook fails-closed 401 if no secret (unit + e2e + live).
12. **Malformed/non-payment webhook body** — signature still verified; non-payment → 200 ignore; non-JSON body tolerated (route + live test).

## How to Test (manual, once real sandbox creds exist — BLOCKED-ON-USER)

1. Put real MP TEST creds in `.env.local` (see env table). Restart the app.
2. Place an order → confirmation page shows "Pagar ahora" → click → redirected to MP hosted checkout.
3. Pay with a test card named `APRO` → MP redirects back + fires the webhook → reload → "Pago recibido".
4. Card named `OTHE` → `rejected` → confirmation shows "Reintentar pago" → retry with `APRO`.
5. OXXO/SPEI → voucher card with reference + "Ver comprobante" + expiry (approval cannot be simulated in test — post a signed synthetic webhook, or use the dashboard Webhooks Simulator, to drive pending→approved).
6. Webhook signature must be configured in the MP dashboard (Webhooks → Configure notifications) pointing at your public `/api/webhooks/mercadopago` (use a tunnel for localhost).

## Env vars / sandbox creds (BLOCKED-ON-USER — repeat of ticket)

| Var | Scope | Where to get it |
|-----|-------|-----------------|
| `MERCADOPAGO_ACCESS_TOKEN` | server-only **SECRET** | MP dashboard → Your integrations → your app → Testing → **Test credentials** → Access Token |
| `MERCADOPAGO_WEBHOOK_SECRET` | server-only **SECRET** | MP dashboard → your app → **Webhooks → Configure notifications** → signing secret |
| `MERCADOPAGO_PUBLIC_KEY` | public (only if a client SDK is added; then `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`) | MP dashboard → Test credentials → Public Key (currently unused by the redirect surface) |
| `NEXT_PUBLIC_SITE_URL` | public, OPTIONAL | Only needed behind an opaque proxy; otherwise the origin is derived from request headers. |

Sandbox model: MP has no separate sandbox URL — test credentials + test users
(dashboard → Test accounts, choose Mexico) hit production endpoints. **OXXO/SPEI
approval CANNOT be simulated in test** — use a signed synthetic webhook (or the
dashboard Notifications Simulator) to exercise pending→approved. No MP secret is
ever `NEXT_PUBLIC_`; `.env*` is gitignored; never commit real values.

## BLOCKED-ON-USER (explicit)

- **Real MP sandbox round-trip** — no credentials; all tests mock MP. Run the
  "How to Test" checklist against a real sandbox before launch.
- **Voucher field paths** (`transaction_details.*` vs `point_of_interaction.*`) —
  read defensively; CONFIRM against a real sandbox OXXO/SPEI payment response.
- **Whether the webhook secret differs between test/prod modes** — verify in the
  dashboard.
- **Human review of all payment code** before merge (standing gate).

## Dependencies Added

- `mercadopago@^3.2.0` — official Node SDK (v3 shapes; bundled TS types). Used for
  `Preference.create`, `Payment.get`, `PaymentRefund.create`. HMAC uses Node's
  built-in `crypto` (no extra dep).

## Verification Evidence

- `tsc --noEmit`: **0 errors**.
- `eslint .`: **clean** (exit 0).
- `next build` (both locales, `NEXT_QA_DIST_DIR`): **clean**; webhook route emitted
  as `ƒ /api/webhooks/mercadopago`; `tsconfig.json` restored after.
- Unit (`npm run test`): **1107 passed** (baseline 924 + 183 new).
- Integration (`npm run test:integration`, live local DB reset+seed): **144 passed**
  (baseline 137 + 7 new) — RPC advance/idempotency/regression + `mp_payment_events`
  unique/cascade verified.
- E2E (`e2e/payment.spec.ts`, PRODUCTION build, chromium+mobile): **8 passed** —
  pay-now panel, pay-now→unavailable (edge 11), EN copy, no mobile overflow.
- Migration 0009: applies cleanly on `supabase db reset` + seed.
- Webhook route exercised live with signed synthetic payloads: valid sig →
  processed/gated; **bad sig → 401**; **missing sig → 401**; **non-payment → 200
  ignore**. Replay/amount-mismatch/unknown covered by unit + integration.
- DB left pristine-seeded; no stray servers; `.env.local` gitignored; `tsconfig.json` clean.
