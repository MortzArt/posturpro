# Task: T9 — Transactional emails

## Priority

**High** — T9 is on the Phase-1 critical path: it is the "core automatic behavior" the spec
explicitly scopes in (order emails + stock restore) and is a hard `blocked by` dependency of
T12 (admin order management triggers shipped/cancelled/refund emails). T8 is code-complete, so
T9 is unblocked. It is not "Critical" only because no revenue write depends on it — an email
failure must never break checkout or the webhook.

## Complexity

**medium** — justification against the criteria:

- New subsystem (`src/lib/email/`) but it follows established seams, not a new architecture: a
  typed lib wrapper (like `src/lib/payments/*`), a mockable provider boundary (like `mp-client.ts`),
  i18n via the existing `next-intl` message dictionaries, config via the existing `env.ts` accessor.
- Estimated 12–15 files changed/created (one migration, one provider client, one dispatch module,
  8 templates, i18n keys in 2 dictionaries, 3 trigger-seam edits, config additions). Top of the
  `medium` band, not `high`.
- It touches the payment webhook and checkout action (the two most sensitive write paths), so the
  trigger wiring must be non-blocking and failure-isolated — but the SEAMS already exist (T8 arch
  review confirmed them). No architectural change.
- The one genuinely-new data concern (TD-2 `transition_kind` + an email ledger + an `orders.locale`
  column) is a single small migration, not a new subsystem.

It is NOT `high` (no new integration surface beyond one email provider, no state-machine change —
`advance_order_status` gains one out-field, no 15+-file blast radius). It is NOT `low` (new
subsystem, new provider boundary, new migration, touches two write paths).

## Feature Type

**logic-only** — with an explicit S2 UI Design decision below.

Emails have a *visual surface in the recipient's inbox*, but they have **no in-app UI**: no route,
no component in the Next.js tree, no shopper- or admin-facing screen. The deliverables are server
lib modules (provider client, dispatch, templates), i18n strings, a migration, and trigger wiring.
There is no browser render, no responsive breakpoint in the app, no interaction state.

### S2 UI Design decision: **SKIP S2 (UI Design) — with binding constraints carried into S3.**

Rationale: the pipeline's UI Design stage (`ultradesign`) designs *app components, interaction
patterns, wireframes, and motion* — none of which exist for a transactional email. Running it
would produce an empty or misapplied artifact. **However**, email HTML is a real visual artifact
with hard constraints, so instead of a design stage we impose the following as S3 DEV REQUIREMENTS:

- Table-based layout, inline styles only (no `<style>` blocks, no external CSS, no flexbox/grid —
  Outlook/Gmail strip them). Max content width 600px, centered.
- Neutral brand tokens ONLY, sourced from a single `email/brand.ts` constants module so the client
  logo/colors swap in one place later (spec: "neutral design system now; centralize all brand
  tokens"). No `@hugeicons`, no Tailwind, no `cn()` — none of the app's UI stack applies to email.
- A plain-text alternative part for EVERY email (deliverability + accessibility).
- All monetary amounts formatted through the existing MXN path (`src/lib/money.ts`,
  `CURRENCY_LOCALE`), never re-implemented.

## User Story

As a **guest customer of the store**, I want to **receive clear, correctly-localized emails at each
step of my order** (confirmation, payment received, OXXO/SPEI payment instructions), so that **I
have a durable record of my purchase and know exactly how and when to pay** — even though I have no
account to log into.

As the **store owner**, I want to **be emailed the moment a new order is placed**, so that **I can
begin fulfillment without watching the dashboard**.

## Background

**What exists today.** T7 built checkout (order creation via `create_order` RPC) and a
confirmation page addressed by `orders.confirmation_token`. T8 built the Mercado Pago webhook: a
single authoritative transition path (`advance_order_status` RPC) called from
`src/lib/payments/process-payment.ts`, plus a durable idempotency spine (`mp_payment_events`,
claim-then-finalize) and a refund ledger. Config/secrets go through `src/lib/env.ts` (typed,
`MissingEnvVarError`, never `NEXT_PUBLIC_` for secrets). i18n is `next-intl` with `es-MX` (default)
+ `en` dictionaries in `src/messages/`. Money is integer cents, formatted via `src/lib/money.ts`.

**What is missing.** There is no email capability of any kind — no provider, no templates, no
dispatch. The word "email" appears only as a data field (`contact_email`) and in comments that
defer sending to "T9" (e.g. `config.ts:525` — "the confirmation email is T9"). The spec lists eight
neutral-branded templates; none exist.

**Why this matters now.** (1) The spec scopes order emails as required Phase-1 automatic behavior.
(2) T12 is `blocked by: T9` and expects the shipped/cancelled/refund send functions to already
exist as callable seams. (3) The T8 architecture review flagged **TD-2** as a "fix before T9" item:
the transition record has no structured type, so T9 email triggers would otherwise have to
string-match free-text notes — a fragile anti-pattern across two subsystems.

**Two structural gaps this ticket must close before any email can be correctly sent:**

1. **No transition type (TD-2).** `order_status_history` has `from_status`, `to_status`, `note`
   (free text). A payment-only refund writes `from==to` (verified: `0009_payments.sql:249-251`) and
   is distinguishable from a paid-order no-op ONLY by the free-text note. Emails must NOT string-match.
2. **No persisted locale.** `orders` has NO `locale` column (verified against `0003_commerce.sql`).
   Checkout runs under `/es-MX/` or `/en/`, but the webhook is a server-to-server MP call with **no
   locale context**. Without a persisted per-order locale, payment-received / voucher emails cannot
   be localized to the customer's chosen language. This ticket adds `orders.locale`.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

**Migration & data model (TD-2 + locale + ledger) — do FIRST**

- [ ] AC-1: A new numbered migration `0010_email_transitions.sql` exists, is idempotent
  (`create … if not exists`, `add column if not exists`), and applies cleanly via
  `supabase db reset` against the LOCAL Docker stack. It is NEVER pushed to remote.
- [ ] AC-2: `advance_order_status` returns an additional field `transition_kind` (text) in its
  jsonb result, from a fixed set: `paid | payment_pending | payment_failed | payment_authorized |
  refunded | shipped | cancelled | delivered | preparing | noop`. The value is derived from
  `(from_status, to_status, payment_status, p_order_status IS NULL)` INSIDE the RPC — never from the
  note text. `database.types.ts` `AdvanceOrderStatusResult` is updated to include it.
- [ ] AC-3: `order_status_history` gains a nullable `transition_kind text` column written by the
  RPC on every history-row insert, so the audit trail is self-describing (no note parsing ever).
- [ ] AC-4: `orders` gains a `locale text not null default 'es-MX'` column constrained to the
  shipped locale set (`check (locale in ('es-MX','en'))`), and the `create_order` RPC + checkout
  payload persist the active request locale onto the order.
- [ ] AC-5: A durable send-ledger table `email_sends` exists, keyed uniquely on
  `(order_id, email_kind, dedupe_key)`, RLS-enabled, `grant all … to service_role`, with a claim
  RPC `claim_email_send(order_id, email_kind, dedupe_key)` returning `'new' | 'duplicate'` (insert …
  on conflict do nothing, mirroring `record_payment_event`) so a duplicate webhook delivery can
  never double-send.

**Provider & config**

- [ ] AC-6: An email provider is integrated behind a single module `src/lib/email/provider.ts`
  exposing one async `sendEmail({ to, subject, html, text, replyTo? })`. The provider is
  instantiated in exactly ONE place (mirroring `mp-client.ts`), reads its API key via
  `src/lib/env.ts` (`getEmailEnv()`), never `NEXT_PUBLIC_`, never hardcoded. `import "server-only"`.
- [ ] AC-7: `getEmailEnv()` reads and validates these exact env vars, throwing `MissingEnvVarError`
  when absent: `EMAIL_API_KEY` (secret), `EMAIL_FROM_ADDRESS`, `EMAIL_OWNER_ADDRESS`. A missing var
  never throws into a critical path — dispatch swallows it (AC-13).
- [ ] AC-8: When `EMAIL_DEV_PREVIEW=1` (or `EMAIL_API_KEY` is absent in dev), the provider does NOT
  hit the network: it logs the rendered subject + recipient + writes the HTML to a documented
  preview sink and returns success. Live send is BLOCKED-ON-USER and documented in `dev-done.md`
  with exact var names + where to get creds.
- [ ] AC-9: In ALL unit and integration tests the provider is mocked — no test performs a real
  network send. A test asserts a missing `EMAIL_API_KEY` (non-preview) results in a logged,
  swallowed failure and NO throw into checkout/webhook.

**Templates & localization**

- [ ] AC-10: Eight templates render to `{ subject, html, text }` from typed inputs:
  `order_confirmation`, `payment_received`, `voucher_instructions` (OXXO/SPEI), `shipped`,
  `cancelled`, `refund_issued`, `contact_relay`, `new_order_owner`.
- [ ] AC-11: All SIX customer-facing templates render correctly in BOTH `es-MX` and `en`, sourcing
  every string from a new `email` block in `src/messages/es-MX.json` and `src/messages/en.json`
  (symmetric keys — the existing `keys-used.test.ts` invariant must stay green). Money is
  MXN-formatted via `src/lib/money.ts`. Interpolation uses next-intl `{var}` (single-brace)
  convention, consistent with the existing dictionaries.
- [ ] AC-12: The two owner/relay templates are **single-locale es-MX** (decision: the owner is the
  Mexican store operator; `contact_relay` is a relay TO the owner, so it uses es-MX chrome and
  quotes the customer's message verbatim). Stated in `dev-done.md`.

**Dispatch, triggers & idempotency**

- [ ] AC-13: Email dispatch is **failure-isolated and non-blocking**: a send failure (provider
  error, missing config, timeout) is caught, logged with context (`console.error`, order id + kind),
  and NEVER propagates into the checkout action's return or changes the webhook's HTTP status.
  Checkout still returns `success`; the webhook still returns its correct 200/500 based on payment
  processing alone.
- [ ] AC-14: On checkout success (`placeOrder` → `runCheckout` step 9), TWO emails are triggered:
  `order_confirmation` to the customer (in the order's locale) and `new_order_owner` to the owner.
  Neither blocks the `success` return.
- [ ] AC-15: On the webhook advancing to a PAID transition (`transition_kind = 'paid'`),
  `payment_received` is sent to the customer in the order's locale — exactly once per order even
  across duplicate/redelivered webhooks (guarded by `email_sends`).
- [ ] AC-16: When an order is first-known as OXXO/SPEI **pending** (`transition_kind =
  'payment_pending'` with an OXXO/SPEI method), `voucher_instructions` is sent once, carrying the
  voucher/reference data. If voucher data is not available at the trigger point, the email is not
  sent and the seam is documented (no partial email). See Out of Scope for voucher-data sourcing.
- [ ] AC-17: `shipped`, `cancelled`, `refund_issued` templates + typed `send*` functions exist and
  are unit-tested, but are **NOT live-wired** in T9 (their triggers are T12 admin actions). Each is
  exported and callable; a `// T12 wiring seam` comment marks the call-site gap. `contact_relay`
  template + send function exist but are **NOT wired** (depends on the Contact page, T13); seam
  documented.
- [ ] AC-18: The webhook route (`route.ts`) contains ZERO email code — emails are triggered from the
  transition outcome inside `process-payment.ts` (or a dispatch helper it calls), AFTER a successful
  advance, so a slow send never blocks the webhook's 200 and never triggers MP retries.

**Housekeeping**

- [ ] AC-19: `tasks/hacker-report.md` is NOT touched by any T9 stage (stale T7 artifact; T8 hacker
  work is committed in `4474f8b`). It is not treated as T9 context.
- [ ] AC-20: T7 and T8 remain UNCHECKED in `BUILD_PLAN.md` (human-review gates open). T9 does not
  check them off.

## Edge Cases

1. **Duplicate/redelivered webhook for the same payment.** MP redelivers the same
   `(payment_id, status)`. The payment spine already no-ops the DB advance, but the first delivery
   and a crash-retry could both reach the email trigger. Expected: `claim_email_send(order_id,
   'payment_received', payment_id)` returns `'new'` exactly once; the second returns `'duplicate'`
   and no email is sent. The customer receives ONE "payment received" email.

2. **Email provider is down / times out during the webhook.** Expected: dispatch catches the error,
   logs it, and the webhook STILL returns 200 (payment processed successfully) — MP does not retry
   (retrying wouldn't fix email). The `email_sends` claim is left un-finalized (`sent_at` null) so a
   later manual/redelivery retry can re-attempt. Payment state is never coupled to email state.
   (Decision to confirm in dev-done: claim-then-finalize vs. best-effort claim.)

3. **Order placed in `/en/`.** Expected: `orders.locale = 'en'`; the confirmation email AND the
   later webhook-driven payment-received/voucher emails all render in English, even though the
   webhook has no request-locale context (it reads `orders.locale`). Owner alert stays es-MX.

4. **OXXO voucher paid at the store days later.** The `voucher_instructions` email was sent at
   pending; days later MP fires `approved`. Expected: `payment_received` sends now (a DISTINCT
   `email_kind`, distinct `email_sends` row), in the order's locale, exactly once. No duplicate.

5. **Amount-mismatch / flagged payment (`charged_back`, `in_mediation`, unknown status).** Expected:
   NO customer email is sent (the order was NOT marked paid — `transition_kind` is not `'paid'`).
   These paths already log for human review in T8; T9 adds no auto-email (a mismatch email would
   confuse the customer). Documented as intentional.

6. **Undeliverable but syntactically valid `contact_email`.** `create_order` guarantees
   `contact_email` NOT NULL, so "missing" cannot occur post-creation; an undeliverable address is a
   provider-side bounce — dispatch logs the provider response, swallows it, order flow unaffected
   (AC-13). No retry storm.

7. **Locale mutation attempt after order creation.** The 0003 immutability trigger freezes the
   financial/contact snapshot. `locale` is set once at creation and never mutated by
   `advance_order_status` (the RPC's UPDATE sets never include `locale`). A test asserts locale is
   stable across a full transition sequence.

## Error States Table

Emails have no in-app UI, so "user sees" is the recipient inbox / the operator's logs.

| Trigger | User Sees | System Does |
| ------- | --------- | ----------- |
| Provider API 5xx / network error during send | Nothing changes in-app; email doesn't arrive | Catch, `console.error("[email] send failed: kind=… order=… reason=…")`, swallow; checkout/webhook outcome unchanged (AC-13); `email_sends` left un-finalized for retry |
| `EMAIL_API_KEY` missing in production | Nothing changes in-app | `getEmailEnv()` throws `MissingEnvVarError`; dispatch catches, logs `email disabled: missing EMAIL_API_KEY`, swallows; no throw into critical path |
| `EMAIL_DEV_PREVIEW=1` / key absent in dev | Dev sees rendered subject + HTML in preview sink | Provider short-circuits, no network call, returns `{ ok: true, preview: true }` (AC-8) |
| Duplicate webhook delivery | Customer receives exactly one email | `claim_email_send` returns `'duplicate'`; dispatch returns early, no send |
| Owner alert send fails | Owner misses alert; order still placed & visible later (T12) | Logged; customer confirmation attempted independently (per-send isolation, not all-or-nothing) |
| Template render throws (bad input) | No email sent | Render is pure + typed; a defensive try/catch around each render logs and skips that ONE email |
| Voucher data absent at pending trigger | No voucher email (avoids a broken email) | Logged `voucher email skipped: no voucher data for order …`; documented seam (AC-16) |

## UX Requirements

No in-app UI. The "UX" surface is the rendered email and the developer preview experience.

- **Loading**: N/A. Checkout/webhook never wait on email — the shopper's success screen and the
  webhook 200 return independently of send completion.
- **Empty**: N/A.
- **Error**: The customer never sees an email error; a failed send is invisible to them by design
  (AC-13). The operator's "error UI" is a structured log line with order id + email kind + reason.
- **Success**: A well-formed, localized email. Every customer email includes the store name (from
  store settings / `SEED_STORE_CONTACT_EMAIL` chrome), the order number (`PP-000123`), an itemized
  summary with MXN-formatted line totals, and an absolute link back to the confirmation page
  (`confirmationPath(token)`). Payment-received names the paid amount; voucher includes the
  OXXO/SPEI reference + expiry + amount.
- **Mobile (375px inbox)**: single 600px-max centered table that reflows to full width on narrow
  clients; font-size ≥ 14px; the confirmation link/button ≥ 44px tall; no horizontal scroll.
- **Tablet (768px)**: same 600px centered column with side gutters. Fluid tables, not app breakpoints.
- **Reduced-motion / plain-text**: every email ships a plain-text alternative; no animation, no web
  fonts, no remote CSS; renders identically with images off.

## Technical Approach

### Files to Create

- `supabase/migrations/0010_email_transitions.sql` — TD-2 `transition_kind` (RPC return + history
  column), `orders.locale`, `email_sends` ledger + `claim_email_send` RPC. Idempotent, LOCAL-only.
- `src/lib/email/provider.ts` — the single provider boundary. `sendEmail(...)`; dev-preview
  short-circuit; instantiates the provider once. `import "server-only"`.
- `src/lib/email/brand.ts` — neutral brand tokens for emails (colors, store-name fallback, logo
  slot, footer text) — the single swap point (spec: centralize brand tokens).
- `src/lib/email/layout.ts` — shared 600px table shell (header/footer chrome) each HTML template
  composes into; keeps each template within its own concern (SRP, ≤400 lines/file).
- `src/lib/email/render.ts` — pure render helpers: money via `money.ts`, item-table builder,
  plain-text derivation. No I/O.
- `src/lib/email/templates/*.ts` — 8 template modules, each a pure `(input, t?) => { subject, html,
  text }`. Typed inputs; localized customer templates take a `next-intl` translator, owner/relay
  templates use es-MX directly.
- `src/lib/email/dispatch.ts` — orchestration: reads order fields, claims via `claim_email_send`,
  renders, calls `sendEmail`, isolates failures. Exposes `sendOrderConfirmation`,
  `sendNewOrderOwnerAlert`, `sendPaymentReceived`, `sendVoucherInstructions`, and the T12/T13 seams
  `sendShipped`, `sendCancelled`, `sendRefundIssued`, `sendContactRelay`.
- `src/lib/email/email-kinds.ts` — the `EmailKind` const (no magic strings).
- `*.test.ts` alongside each module + an integration test exercising dispatch against the local DB
  with a mocked provider.

### Files to Modify

- `src/lib/env.ts` — add `EmailEnv` + `getEmailEnv()` (mirrors `getMercadoPagoEnv`).
- `src/lib/supabase/database.types.ts` — add `transition_kind` to `AdvanceOrderStatusResult`; add
  `locale` to orders Row/Insert; add `email_sends` types + `claim_email_send` args/result.
- `src/lib/payments/process-payment.ts` — after a successful advance, branch on
  `advance.result.transition_kind` to dispatch `payment_received` / `voucher_instructions`
  (isolated; does not affect the returned `ProcessResult`). Route stays email-free (AC-18).
- `src/app/[locale]/checkout/actions.ts` — `runCheckout` step 9: after `createOrderViaRpc`, trigger
  `sendOrderConfirmation` + `sendNewOrderOwnerAlert`, isolated, before returning `success`. Persist
  the active locale into the `create_order` payload (locale from the action's route segment/params).
- `src/lib/checkout/order-read.ts` — extend (or add a sibling reader) to surface the fields the
  emails need (locale, payment_method, order_number, items) without changing the confirmation page's
  view model.
- `src/lib/config.ts` — add non-secret email constants (from-name fallback, owner-alert locale
  constant, dev-preview flag name, `EMAIL_SEND_TIMEOUT_MS`) with a "how to swap" note.
- `src/messages/es-MX.json` + `src/messages/en.json` — new `email` block (symmetric keys).

### Data Model Changes

- `orders` — add `locale text not null default 'es-MX' check (locale in ('es-MX','en'))`.
- `order_status_history` — add `transition_kind text` (nullable; written by the RPC).
- `advance_order_status` — return jsonb gains `transition_kind`; derived in-RPC, never from note.
- `email_sends` — `id uuid pk`, `order_id uuid fk on delete cascade`, `email_kind text`,
  `dedupe_key text` (mp_payment_id for payment_received; `''` for one-per-order kinds),
  `sent_at timestamptz`, `created_at`. `unique (order_id, email_kind, dedupe_key)`. RLS on,
  service_role grant. `claim_email_send` = insert-on-conflict-do-nothing → `'new'`/`'duplicate'`.
- `create_order` RPC — persist `payload->>'locale'` onto the new column.

### API Endpoints

- None. T9 adds NO HTTP route. Sends are triggered from existing server code (checkout action,
  webhook processing). The Contact relay endpoint is T13.

### Dependencies

- **New:** `resend` (see research report for rationale — first-class TypeScript SDK, trivially
  mockable, native dev/test story, works from the Next.js Node server runtime). Add to
  `dependencies`; pin the 4.x version at install and record it in `dev-done.md`.
- No other new dependencies. i18n uses existing `next-intl`; money uses existing `src/lib/money.ts`.

## Out of Scope

- **Live email sending / real credentials.** No `EMAIL_*` creds exist; live-send verification is
  BLOCKED-ON-USER. Tests mock the provider; dev uses preview mode.
- **Live wiring of `shipped`, `cancelled`, `refund_issued`** — triggers are T12 admin actions. T9
  builds templates + send functions + a documented seam only.
- **`contact_relay` wiring** — depends on the Contact page (T13). Template + send function only.
- **Branded (non-neutral) templates, pending-payment reminders, abandoned-cart emails** — Phase 2/3.
- **Voucher-data capture/persistence.** T9 sends the voucher email from voucher data already
  available at the trigger. If voucher fields are not persisted on the order, T9 sends only where
  the data is present and documents the gap; it adds NO new voucher-persistence schema.
- **An operator "email log" UI** — `email_sends` is data only; any admin view is T12.
- **Retry/queue infrastructure** (durable job queue, backoff). Phase-1 dispatch is in-request,
  isolated, best-effort; the `email_sends` ledger enables a future retry without double-sends.

## Housekeeping (carry-forward)

- `tasks/hacker-report.md` on disk is STALE (still the T7 report). T8 hacker work is committed in
  `4474f8b` but the report was never regenerated. **S3 Dev must NOT touch it** and must NOT treat it
  as T9 context.
- Migrations are **LOCAL Docker Supabase only** — never `db push`. `0010` is a NEW numbered
  migration (preferred over amend-in-place per TD-5).
- T7 and T8 human-review gates remain OPEN; do not check them off in `BUILD_PLAN.md`.
- `.env.local` currently holds the three `MERCADOPAGO_*` vars + Supabase vars. It has NO `EMAIL_*`
  vars. Do not fabricate them; document the exact names in `dev-done.md`.
