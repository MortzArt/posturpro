# Research Report: T9 — Transactional emails

One-pass codebase scan. All file references verified against local files. Where something could not
be found, it is stated explicitly rather than assumed.

## Codebase Analysis

### Existing Patterns

- **Typed env accessor with named error** — `src/lib/env.ts`. `requireEnv(name, source)` throws
  `MissingEnvVarError`; secrets are exposed only through server-only accessors (`getServerEnv`,
  `getMercadoPagoEnv`) and NEVER prefixed `NEXT_PUBLIC_`. Reuse: add `getEmailEnv()` here in the
  same shape (`EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_OWNER_ADDRESS`).
- **Single-instantiation provider boundary** — `src/lib/payments/mp-client.ts` is the ONLY place
  the MP SDK is constructed; everything else imports typed getters. Reuse: `src/lib/email/provider.ts`
  is the ONLY place the email SDK is constructed; mockable in tests by mocking that module.
- **`server-only` guard on secret-touching modules** — `import "server-only"` at the top of
  `admin.ts`, `advance-order.ts`, `process-payment.ts`, `order-read.ts`. Apply to `provider.ts` and
  `dispatch.ts`.
- **Discriminated-union return types, never throw to caller** — `ProcessResult`, `AdvanceOutcome`
  (`advance-order.ts:15`), `StatusMapping` (`payments-status.ts:52`). Reuse: `sendEmail` and each
  `send*` returns a typed `{ ok: true } | { ok: false; reason }`; dispatch never throws.
- **Idempotency via insert-on-conflict claim RPC** — `record_payment_event` in `0009_payments.sql:338`
  (`on conflict … do nothing`, `if found` → `'new'`, else `'duplicate'`). Reuse VERBATIM as the
  shape for `claim_email_send(order_id, email_kind, dedupe_key)`.
- **RLS-deny + explicit service_role grant for later-created tables** — `0009` re-grants because the
  0005 blanket grant is point-in-time (`0009_payments.sql:95-99`). Apply the same for `email_sends`.
- **RPC returns a self-describing jsonb result** — `advance_order_status` already returns
  `{ applied, reason, from_status, to_status }` (`0009_payments.sql:311-316`). Add `transition_kind`
  to this object; the typed wrapper `advance-order.ts` passes `data` through untouched (no signature
  change needed there).
- **i18n via next-intl RSC translator** — `src/i18n/request.ts` loads `src/messages/<locale>.json`;
  server code uses `getTranslations` (seen in `page.tsx`, `layout.tsx`). Interpolation is
  SINGLE-BRACE `{var}` (verified: `es-MX.json` uses `{code}`, `{amount}`, `{count}`, `{brand}`).
  A `keys-used.test.ts` invariant enforces symmetric keys across locales — new `email` keys must be
  added to BOTH dictionaries.
- **Money is integer cents, formatted once** — `src/lib/money.ts` + `CURRENCY_LOCALE='es-MX'`
  (`config.ts:41`). Email templates format via this path, never re-implement.
- **Config centralization with "how to swap" header** — `config.ts` holds every non-secret tunable;
  `SEED_STORE_CONTACT_EMAIL='hola@posturpro.mx'` (`config.ts:107`), `confirmationPath(token)`
  (`config.ts:554`). Add email non-secret constants here.

### Relevant Files

| File | Purpose | Relevance | Action |
| ---- | ------- | --------- | ------ |
| `src/lib/env.ts` | Typed env accessors | Add `getEmailEnv()` | Modify |
| `src/lib/payments/mp-client.ts` | MP SDK single boundary | Template for `email/provider.ts` | Reference |
| `src/lib/payments/process-payment.ts` | Webhook processing core | Trigger `payment_received`/`voucher` after advance | Modify |
| `src/lib/payments/payments-status.ts` | MP-status → transition mapping | `note` text is set here; `transition_kind` derives from the same mapping | Reference |
| `src/lib/payments/advance-order.ts` | Typed RPC wrapper | Passes through the new `transition_kind` field | Reference (types via database.types) |
| `supabase/migrations/0009_payments.sql` | `advance_order_status`, `record_payment_event` | RPC to extend (transition_kind); pattern for `claim_email_send` | Reference/extend via 0010 |
| `supabase/migrations/0003_commerce.sql` | orders + order_status_history + immutability trigger | Add `locale` (orders), `transition_kind` (history); trigger must not freeze/allow locale mutation | Reference (extend via 0010) |
| `supabase/migrations/0008_checkout.sql` | `create_order` RPC | Persist `locale` onto the order | Extend via 0010 |
| `src/app/[locale]/checkout/actions.ts` | Checkout server action | Trigger confirmation + owner alert; pass locale into payload | Modify |
| `src/lib/checkout/order-read.ts` | Order read by confirmation token | Source of email content; extend for locale/method/items | Modify (or sibling reader) |
| `src/lib/store-settings.ts` | Store name/contact email | Email chrome (store name, from/reply) | Reference |
| `src/lib/money.ts` + `config.ts` | Money format, constants, `confirmationPath` | Amount formatting + confirmation link | Reference |
| `src/messages/es-MX.json` + `en.json` | i18n dictionaries | New `email` block (symmetric) | Modify |
| `src/app/api/webhooks/mercadopago/route.ts` | Webhook HTTP handler | Must stay email-free (AC-18) | Reference (do NOT add email here) |
| `scripts/run-integration.sh` | Integration harness | Mock provider; reset+seed local DB | Reference |

### Data Flow

**Order confirmation + owner alert (live in T9):**
`shopper submits checkout form → placeOrder (actions.ts) → runCheckout step 8 create_order RPC (now
persists locale) → returns confirmation_token → step 9: read order fields → dispatch.sendOrderConfirmation
(order.locale) + dispatch.sendNewOrderOwnerAlert (es-MX) → each: claim_email_send → render template →
provider.sendEmail → catch+log on failure → return success to shopper regardless.`

**Payment received / voucher (live in T9, webhook-driven):**
`MP posts webhook → route.ts verifies signature → processPaymentNotification → Payment.get
(authoritative) → matchOrder → claimPaymentEvent (dedupe) → mapMpStatus → advanceOrderStatus RPC
(returns transition_kind) → on success finalizePaymentEvent → NEW: branch on transition_kind: 'paid'
→ dispatch.sendPaymentReceived; 'payment_pending' + OXXO/SPEI method → dispatch.sendVoucherInstructions
→ each claim_email_send(order_id, kind, mp_payment_id) → render (order.locale) → provider.sendEmail →
catch+log. The route's 200/500 is decided by ProcessResult ONLY, never by email outcome.`

**Locale sourcing (the crux):** locale is a REQUEST concept at checkout (`/es-MX/…` vs `/en/…`) but
the webhook has NONE (server-to-server). So locale is PERSISTED on the order at creation and READ by
the webhook path. This is why `orders.locale` is a required part of the migration, not optional.

### Similar Features (Reference Implementations)

- **`record_payment_event` (idempotency claim)** — `0009_payments.sql:338-386`. Structurally
  identical to the needed `claim_email_send`: unique key, `on conflict do nothing`, `if found` →
  `'new'` else inspect existing → `'duplicate'`. Follow this exactly (simpler — no finalize needed
  unless we adopt claim-then-finalize for email retries, edge 2).
- **`getMercadoPagoEnv` + `mp-client.ts`** — env-secret → single client boundary → mockable. The
  email provider mirrors this 1:1.
- **`payments-status.ts` mapMpStatus** — the pure decision function that ALSO produces the `note`.
  The RPC's new `transition_kind` should mirror the same taxonomy so the app-side and DB-side agree
  (`approved`→`paid`, `refunded`→`refunded`, etc.).
- **Confirmation page read `order-read.ts`** — the exact shape of "read an order for presentation";
  the email content reader is a near-sibling (add locale + payment_method + items already present).

## Dependency Analysis

### Existing Dependencies to Leverage

- `next-intl` (already a dep) — localization + `getTranslations` server-side; no new i18n dep.
- `src/lib/money.ts` — MXN formatting; no new formatting dep.
- `@supabase/supabase-js` via `createAdminClient()` — the `email_sends` ledger + `claim_email_send`
  RPC calls; same client the payment spine uses.
- `server-only` — guard the provider + dispatch modules.

### New Dependencies Needed

- **`resend`** — recommended (rationale below). Version: latest 4.x, pin at install.
  - Alternatives considered: `postmark` (excellent deliverability + a sandbox "test" API token;
    heavier SDK, transactional-first — a strong second choice), `@aws-sdk/client-ses` (cheapest at
    scale but the most config/verification overhead: IAM, domain + DKIM, sandbox-mode sending limits
    — overkill for a Phase-1 single-tenant store), `nodemailer` + SMTP (most generic/provider-agnostic
    but you still need an SMTP provider, and it has no first-class typed API or dev-preview mode).

### Internal Dependencies

- `email/dispatch.ts` depends on `email/provider.ts`, `email/templates/*`, `email/render.ts`, the
  order reader, and `claim_email_send`. Implication: dispatch is the ONLY module that does I/O +
  orchestration; templates/render stay pure (SRP; unit-testable without a DB or network).
- `process-payment.ts` and `actions.ts` depend on `dispatch.ts`. Implication: the two most sensitive
  write paths gain a dependency on email — so dispatch MUST be failure-isolated (catch everything;
  never rethrow) or an email bug becomes a checkout/webhook bug.
- `advance_order_status` return shape is consumed by `advance-order.ts` → `process-payment.ts`.
  Implication: adding `transition_kind` to the jsonb is backward-safe (additive) and needs a
  `database.types.ts` update so the branch is typed (no `any`).

## External Research

### Email-Provider Research (provider choice)

**Recommendation: Resend.** Rationale specific to this codebase and the ticket constraints:

1. **Mockability (AC-9, hard requirement).** Resend's SDK is a thin class (`new Resend(apiKey)`
   → `resend.emails.send({...})`). Instantiated in one module, it is trivially mocked with vitest
   (`vi.mock('@/lib/email/provider')`), exactly like `mp-client.ts` is mocked in the payment tests.
2. **Dev/preview mode (AC-8, hard requirement).** Resend supports a test/dev flow, and — more
   importantly — our own `provider.ts` short-circuit (`EMAIL_DEV_PREVIEW=1` → log + no network) gives
   a provider-agnostic preview without any account. Resend also offers per-request idempotency keys
   if we later want provider-side dedupe (we don't need it — `email_sends` is our dedupe authority).
3. **TypeScript-first, Next.js-native.** First-class typed SDK; runs from the Node server runtime
   (our webhook already forces `runtime="nodejs"`; the checkout action is server-side). No edge
   constraints.
4. **Single secret via env.** One `EMAIL_API_KEY` (server-only). Fits the `getEmailEnv()` shape with
   no OAuth/IAM dance (unlike SES).
5. **Neutral-branding fit.** HTML is authored by us (table-based, inline styles), not the provider,
   so swapping to branded templates later touches only `email/brand.ts` + templates — provider-agnostic.

**Gotchas to bake into the ticket/implementation:**
- Verified sender domain required for LIVE send (`EMAIL_FROM_ADDRESS` must be on a verified domain).
  This is part of the BLOCKED-ON-USER setup — document it; dev-preview needs no verification.
- Rate limits exist on the free tier — irrelevant at Phase-1 volume and behind our per-order dedupe.
- No HTML `<style>`/CSS support guarantees across inboxes — this is an EMAIL constraint, not a Resend
  one: inline all styles, table layout (already a ticket requirement).

### Library / API notes

- **next-intl outside a request (webhook path).** `getTranslations({ locale })` can be called with
  an explicit locale (not just the ambient request locale). The webhook reads `orders.locale` and
  passes it explicitly — this is the supported server API and avoids needing a request context.
- **Confirmation link.** `confirmationPath(token)` (`config.ts:554`) yields a locale-agnostic path;
  the email must prepend the site origin (an env-configured base URL) and the `/en` prefix when
  `locale === 'en'`, to produce an ABSOLUTE URL (relative links don't work in email).

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| An email failure/throw breaks checkout or the webhook (couples email to revenue) | Med | High | Dispatch catches ALL errors, never rethrows; process-payment/actions ignore the send outcome; AC-13 + a test asserting missing-key does not throw |
| Duplicate webhook double-sends "payment received" | Med | Med | `email_sends` unique `(order_id, kind, dedupe_key=mp_payment_id)` + `claim_email_send`; edge 1 test |
| Wrong-language email (webhook has no request locale) | High if not handled | Med | Persist `orders.locale` at creation; webhook reads it; `getTranslations({locale})`; edge 3 test |
| T9 emails string-match free-text notes (fragile, TD-2) | High if not fixed | Med | Add structured `transition_kind` to the RPC result + history; branch on it, never on `note`; AC-2/AC-3 |
| Amend-in-place migration on a non-resettable env (TD-5) | Low now | Med later | New numbered `0010`; LOCAL-only; standing note honored |
| Voucher email sent with missing/partial reference data | Med | Med | Send only when voucher data present; else log + skip (AC-16, edge — no broken email) |
| Email HTML renders broken in Outlook/Gmail | Med | Low | Table layout, inline styles, 600px, plain-text part (S3 dev requirements) |
| Leaking PII into logs (address/email in error logs) | Low | Med | Log order id + email kind + reason only — never the address body (mirror payment-log discipline) |

### Performance Considerations

- **Send latency on the shopper's critical path.** The confirmation trigger runs inside `runCheckout`
  before returning `success`. Recommendation: fire-and-forget or bounded (`EMAIL_SEND_TIMEOUT_MS`)
  so a slow provider never delays the shopper's success screen. The success return must not block on
  network I/O; if awaited, wrap in a timeout + isolation.
- **Webhook 200 latency.** Same concern, sharper: a slow send inside the webhook delays the 200 and
  can trigger MP retries. Trigger AFTER `finalizePaymentEvent`, bounded/isolated, never blocking the
  ProcessResult → HTTP mapping (AC-18).
- **Extra DB round-trips** (order read + claim_email_send per email) — negligible at Phase-1 volume;
  the reads are indexed by order id / confirmation token.

### Security Considerations

- **Secrets.** `EMAIL_API_KEY` is server-only, never `NEXT_PUBLIC_`, read only via `getEmailEnv()`
  from server-only modules — identical posture to `MERCADOPAGO_ACCESS_TOKEN`.
- **PII in email + logs.** Emails carry PII (name, address) by necessity; that is fine (they go to
  the customer/owner). LOGS must not — log ids + kinds + reasons only.
- **No new attack surface.** T9 adds no HTTP route; the webhook trust boundary is unchanged. Owner
  address is env-configured (`EMAIL_OWNER_ADDRESS`), not user-supplied, so `new_order_owner` cannot
  be redirected by input.
- **Email-injection.** Recipient/subject are derived from stored order fields (validated at
  checkout) and constants — not from raw untrusted headers. `contact_relay` (T13, not wired now)
  will quote a user message into the BODY only, never into headers.
- **RLS.** `email_sends` is RLS-deny + service_role grant; anon/authenticated have zero access.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Migration `0010` first** — `transition_kind` (RPC + history column), `orders.locale`,
   `create_order` persists locale, `email_sends` + `claim_email_send`. Everything downstream types
   off this. Regenerate/patch `database.types.ts`. Verify `supabase db reset` clean.
2. **`env.getEmailEnv()` + `email/provider.ts`** — the mockable boundary with dev-preview
   short-circuit. Unit-test the preview + missing-key paths BEFORE any template exists.
3. **`email/brand.ts` + `layout.ts` + `render.ts`** — pure chrome + helpers; unit-test rendering.
4. **i18n `email` block** in both dictionaries (keep `keys-used.test.ts` green).
5. **8 templates** — pure render functions; unit-test both locales for the 6 customer templates.
6. **`email/dispatch.ts`** — claim → render → send → isolate; unit + integration test (mocked
   provider, live local DB, assert `email_sends` rows + dedupe).
7. **Wire triggers** — checkout action (confirmation + owner alert; persist locale) and
   process-payment (payment_received / voucher on transition_kind). Add T12/T13 seam comments.
8. **Integration/e2e** — assert checkout success + webhook 200 are UNAFFECTED when the provider is
   forced to fail; assert exactly-once across a duplicate webhook.

### Key Decisions

- **Provider: Resend** — mockable, dev-preview-friendly, TS-first, single-secret. (Postmark is the
  fallback if the user prefers it; the `provider.ts` boundary makes the swap a one-file change.)
- **Dedupe authority: our `email_sends` ledger**, not provider idempotency — keyed
  `(order_id, email_kind, dedupe_key)` where dedupe_key = mp_payment_id for payment-linked emails,
  `''` for one-per-order emails. Mirrors the payment spine's proven pattern.
- **Locale: persist on the order** (`orders.locale`, default `es-MX`, constrained to shipped set).
  Owner/relay emails: SINGLE-LOCALE es-MX (owner is the Mexican operator).
- **TD-2: `transition_kind` derived IN the RPC** and returned + written to history — never inferred
  from `note`. Payment-only refund (`from==to`) becomes `transition_kind='refunded'`, unambiguous.
- **Dispatch trigger site: `process-payment.ts`, not `route.ts`** — keeps the HTTP handler email-free
  and the 200/500 decoupled from send outcome.

### Anti-Patterns to Avoid

- **Don't** string-match `order_status_history.note` to decide the email — use `transition_kind`
  (the entire point of TD-2).
- **Don't** let a send throw into checkout/webhook — catch everything in dispatch; the email outcome
  never changes a `ProcessResult` or a `CheckoutFormState`.
- **Don't** put email code in `route.ts` — trigger from the transition outcome in `process-payment.ts`.
- **Don't** re-implement money formatting or an ad-hoc locale — reuse `money.ts` and `orders.locale`.
- **Don't** add `NEXT_PUBLIC_` for any email secret; don't hardcode the API key or from/owner address.
- **Don't** amend `0009` in place — write a new `0010`; LOCAL-only, never `db push`.
- **Don't** touch `tasks/hacker-report.md` (stale T7 artifact) or check off T7/T8 in `BUILD_PLAN.md`.
- **Don't** send a voucher email with missing reference data — skip + log instead of a broken email.
