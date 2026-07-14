# Dev Summary: T9 — Transactional emails

Standard pipeline S3 (Dev). Feature type: logic-only (email has an inbox surface, no in-app UI).
Provider: **Resend** behind a one-module `provider.ts` boundary. Migration 0010 applied LOCAL-only.

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `supabase/migrations/0010_email_transitions.sql` | created | TD-2 `transition_kind` (derived in-RPC + returned + written to history); `orders.locale`; `email_sends` ledger + `claim_email_send`/`finalize_email_send`; `create_order` persists locale. Idempotent, LOCAL-only. |
| `src/lib/email/email-kinds.ts` | created | `EMAIL_KINDS` const + `EmailKind` type + `ONE_PER_ORDER_DEDUPE_KEY`. No magic strings. |
| `src/lib/email/brand.ts` | created | Single swap point for neutral email brand tokens (colors, layout, typography, store-name fallback, logo slot). |
| `src/lib/email/render.ts` | created | Pure render helpers: `escapeHtml`, `money` (via money.ts), item-table + totals builders, plain-text derivations. |
| `src/lib/email/layout.ts` | created | 600px table shell (`wrapEmail`), header/footer chrome, `renderButton`/`renderHeading`/`renderParagraph`/`renderCallout`. Inline styles only. |
| `src/lib/email/provider.ts` | created | The single Resend boundary. `sendEmail(...)`; dev-preview short-circuit (AC-8); `import "server-only"`. Provider swap = one function (`deliver`). |
| `src/lib/email/ledger.ts` | created | Typed `claimEmailSend`/`finalizeEmailSend` wrappers over the RPCs. Never throw. |
| `src/lib/email/order-url.ts` | created | Absolute confirmation URL builder (`/en` prefix for English). |
| `src/lib/email/voucher-data.ts` | created | Pure adapter from the T8 `VoucherView` → email `VoucherData` (reuses `extractVoucher`, no duplicate extraction). |
| `src/lib/email/dispatch.ts` | created | Orchestration: claim → render → send → finalize, failure-isolated. Live sends + T12/T13 seams. |
| `src/lib/email/templates/types.ts` | created | `RenderedEmail`, `EmailTranslator`, `EmailChrome`, per-template input types. |
| `src/lib/email/templates/sections.ts` | created | Shared localized content sections (items table, totals, view-order button, greeting, callout). |
| `src/lib/email/templates/order-confirmation.ts` | created | Template (customer, both locales). |
| `src/lib/email/templates/payment-received.ts` | created | Template (customer, both locales, names paid amount). |
| `src/lib/email/templates/voucher-instructions.ts` | created | Template (customer, both locales, OXXO/SPEI branch). |
| `src/lib/email/templates/shipped.ts` | created | Template (customer, both locales) — T12 seam. |
| `src/lib/email/templates/cancelled.ts` | created | Template (customer, both locales) — T12 seam. |
| `src/lib/email/templates/refund-issued.ts` | created | Template (customer, both locales) — T12 seam. |
| `src/lib/email/templates/new-order-owner.ts` | created | Owner alert — single-locale es-MX (AC-12). |
| `src/lib/email/templates/contact-relay.ts` | created | Contact relay — single-locale es-MX, quotes msg verbatim in body — T13 seam. |
| `src/lib/email/templates/test-translator.ts` | created | Test-only translator built from the real dictionaries (used by templates.test). |
| `src/lib/env.ts` | modified | Added `EmailEnv` + `getEmailEnv()` (mirrors `getMercadoPagoEnv`). |
| `src/lib/config.ts` | modified | Added `siteOrigin()`, `EMAIL_DEV_PREVIEW_ENV`, `EMAIL_SEND_TIMEOUT_MS`, `OWNER_EMAIL_LOCALE`. |
| `src/lib/supabase/database.types.ts` | modified | `TransitionKind` type; `transition_kind` on `AdvanceOrderStatusResult` + history; `locale` on orders + `CreateOrderPayload`; `email_sends` table; `ClaimEmailSendArgs`/`FinalizeEmailSendArgs` + Functions. |
| `src/lib/payments/process-payment.ts` | modified | After a successful advance+finalize, branch on `transition_kind` to trigger `payment_received`/`voucher_instructions`. Fully isolated; route stays email-free (AC-18). |
| `src/app/[locale]/checkout/actions.ts` | modified | Persist active locale into `create_order` payload; trigger confirmation + owner alert on success (isolated, non-blocking). |
| `src/lib/checkout/order-read.ts` | modified | Added `getOrderForEmail` sibling reader (locale/method/token/items) — confirmation view model unchanged. |
| `src/messages/es-MX.json`, `src/messages/en.json` | modified | New symmetric `email` block. |
| `tests/integration/checkout-{rpc,read}.integration.test.ts` | modified | Added `locale` to test `CreateOrderPayload` builders (now required). |
| email `*.test.ts`, `tests/integration/email.integration.test.ts`, `process-payment.test.ts` | created/modified | Unit + integration coverage (see Test Counts). |
| `package.json` / `package-lock.json` | modified | Added `resend` `^4.8.0`. |

## Migration 0010 contents (LOCAL-only; verified via `supabase db reset`)

- **TD-2**: `order_status_history.transition_kind text` (nullable). New pure helper `email_transition_kind(to_status, payment_status, payment_only)` derives the fixed set `paid | payment_pending | payment_failed | payment_authorized | refunded | shipped | cancelled | delivered | preparing | noop`. `advance_order_status` rewritten (same signature/behavior) to return `transition_kind` in the jsonb AND write it to every history row. An idempotent re-notification with no material change reports `noop` (so a redelivery never re-triggers a customer email).
- **`orders.locale text not null default 'es-MX' check (locale in ('es-MX','en'))`**. Set once at creation; NOT in the advance UPDATE set → never mutated (edge 7).
- **`email_sends`** ledger: `unique(order_id, email_kind, dedupe_key)`, `dedupe_key` NOT NULL default `''`, `sent_at` for claim-then-finalize, `order_id` FK ON DELETE CASCADE. RLS enabled, no policies, `grant all ... to service_role` (explicit — 0005's blanket grant does not cover later tables).
- **`claim_email_send(order_id, email_kind, dedupe_key) -> 'new'|'duplicate'`** (insert-on-conflict-do-nothing) + **`finalize_email_send(...)`**. SECURITY DEFINER, empty search_path, service_role-only execute.
- **`create_order`** re-declared (0008 body verbatim + `locale` clamp to shipped set with es-MX fallback + `transition_kind='noop'` on the initial history row).

## Trigger wiring points

- **Order confirmation + owner alert** — `src/app/[locale]/checkout/actions.ts` `runCheckout` step 9, after `createOrderViaRpc` (only when not an idempotent reuse). `Promise.allSettled` + belt-and-suspenders catch; never changes the `success` return (AC-13/AC-14). Locale from `getLocale()`.
- **Payment received / voucher** — `src/lib/payments/process-payment.ts` `triggerTransitionEmail`, after `finalizePaymentEvent`, branching on `advance.result.transition_kind` (`paid` → `payment_received`; `payment_pending` + OXXO/SPEI + voucher data present → `voucher_instructions`). Fully isolated; the webhook route (`route.ts`) has ZERO email code (AC-18).
- **T12 seams** (`// T12 wiring seam` comments in dispatch.ts): `sendShipped`, `sendCancelled`, `sendRefundIssued` — built + unit-tested, not wired.
- **T13 seam**: `sendContactRelay` — built + unit-tested, not wired (depends on the Contact page).

## Env var names (LIVE SEND IS BLOCKED-ON-USER)

No `EMAIL_*` vars exist in `.env.local`. Add these to `.env.local` to go live (read only via `getEmailEnv()`, never `NEXT_PUBLIC_`):

- `EMAIL_API_KEY` — **secret**. Resend API key. Create at https://resend.com → API Keys (`re_...`).
- `EMAIL_FROM_ADDRESS` — the verified sender, e.g. `pedidos@tudominio.mx`. **Must be on a domain verified in Resend** (Domains → add domain → set the DKIM/SPF DNS records). Unverified domains cannot send live.
- `EMAIL_OWNER_ADDRESS` — the store operator's inbox for owner alerts + contact relay.
- `NEXT_PUBLIC_SITE_ORIGIN` (public) — absolute origin for links in emails, e.g. `https://tienda.mx` (no trailing slash). Dev falls back to `http://localhost:3000`.

Until set: `EMAIL_DEV_PREVIEW=1` (or simply no `EMAIL_API_KEY`) makes the provider short-circuit — it logs `[email] PREVIEW (no network): to=... subject="..." htmlBytes=... textBytes=...` to stdout and returns success (AC-8). No account needed to preview.

## Test counts

- Unit: **1268 passed** (baseline 1206; +62 T9 tests across render/templates/provider/ledger/dispatch/order-url/voucher-data + the process-payment trigger block).
- Integration: **168 passed** (baseline 158; +10 in `tests/integration/email.integration.test.ts` covering AC-1..AC-5, edges 1/3/4/7 + RLS).
- `tsc --noEmit`: 0 errors. `eslint .`: clean. `next build`: exit 0. `supabase db reset`: 0010 applies clean (idempotent). DB left pristine-seeded; tsconfig unchanged; no stray servers.

## Key decisions

- **Reused the T8 `extractVoucher`** (`src/lib/payments/order-payment-read.ts`) instead of writing a second voucher extractor (DRY) — bridged to the email shape by the small pure `voucher-data.ts` adapter. This is the only place the two shapes meet.
- **Dedupe authority = `email_sends` ledger**, not provider idempotency. `dedupe_key` = mp_payment_id for payment-linked emails, `''` for one-per-order.
- **Bounded send** (`EMAIL_SEND_TIMEOUT_MS = 8000`) raced in dispatch so a slow provider never blocks checkout success or the webhook 200.
- **Claim-then-finalize for email** (edge 2): a claim lands `sent_at` NULL; finalized only after the provider accepts. A provider-down send leaves the row un-finalized. Decision: Phase-1 dispatch does NOT auto-re-attempt an un-finalized claim (`claim_email_send` returns `duplicate` for any existing row) — the ledger enables a FUTURE manual/queue retry without double-sending. Payment state is never coupled to email state.
- **Owner + relay emails single-locale es-MX** (AC-12): the operator is the Mexican merchant; `contact_relay` is a relay TO the owner (es-MX chrome, customer message quoted verbatim in the body, customer email as `replyTo` — never in a header).
- **Email HTML**: table layout, inline styles only, 600px max centered, plain-text alternative on every email, MXN via `money.ts`, all input HTML-escaped (injection defense). No app UI stack (no Tailwind/hugeicons/cn).

## Edge cases handled

- **Edge 1 (duplicate webhook)**: `claim_email_send(order, 'payment_received', mp_payment_id)` → 'new' once, 'duplicate' after → exactly one email. (dispatch.test + email.integration.test)
- **Edge 2 (provider down during webhook)**: dispatch catches + logs; webhook still 200; `email_sends` row left un-finalized. (process-payment.test isolation test)
- **Edge 3 (order in /en/)**: `orders.locale='en'` persisted at checkout, read by the webhook path via `getTranslations({ locale })`; owner alert stays es-MX. (email.integration.test)
- **Edge 4 (OXXO paid days later)**: `payment_received` is a distinct `email_kind` from `voucher_instructions` → distinct ledger row → both send once. (email.integration.test)
- **Edge 5 (charged_back / mismatch)**: never reach the trigger (transition_kind ≠ 'paid'); no customer email. (process-payment.test refund test)
- **Edge 6 (undeliverable address)**: provider bounce → dispatch logs + swallows; order flow unaffected (AC-13). Logs carry order id + kind + reason only — never the address.
- **Edge 7 (locale mutation attempt)**: locale stable across a full transition sequence. (email.integration.test)
- **Voucher data absent at pending**: logged `voucher email skipped: no voucher data ...`, no partial email (AC-16). (process-payment.test skip test)
- **Template render throws**: `dispatchEmail` try/catch around render+send logs + skips that one email.
- **Missing `EMAIL_API_KEY` in prod**: `getEmailEnv()` throws `MissingEnvVarError` → provider/dispatch catch + swallow, no throw into critical path. (provider.test partial-config test)

## How to test (manual, dev preview)

1. `npx supabase start` then `npm run db:reset && npm run db:seed`.
2. `EMAIL_DEV_PREVIEW=1 npm run dev` (or leave `EMAIL_API_KEY` unset — same effect).
3. Place an order in the storefront → watch the dev server logs for two `[email] PREVIEW` lines (order_confirmation to the customer, new_order_owner to the owner). Switch to `/en` and place another to see English copy in the confirmation preview.
4. To verify the webhook path without live MP: the integration suite (`npm run test:integration`) exercises the ledger + transition_kind end-to-end; the unit suite exercises the trigger with a mocked provider.

## Known limitations

- **No live-send verification** — BLOCKED-ON-USER (no `EMAIL_*` creds; no verified Resend domain). All tests mock the provider; dev uses preview mode.
- **No auto-retry / queue** — Phase-1 dispatch is in-request, best-effort, isolated. The `email_sends` ledger (claim-then-finalize) is the substrate for a future retry without double-sends; T9 does not build the retry loop.
- **Voucher email only where MP returns reference data** — T8 does not persist OXXO/SPEI voucher fields (they are re-fetched from MP). T9 extracts the voucher from the authoritative payment the webhook already fetched; if the reference is absent it skips (no partial email). No new voucher-persistence schema was added (documented gap).
- **`shipped`/`cancelled`/`refund_issued`/`contact_relay` are not live-wired** (T12/T13) — templates + send functions + documented seams only.

## Dependencies added

- `resend` `^4.8.0` — first-class TypeScript SDK, trivially mockable (single-module boundary), works from the Node server runtime. Postmark remains the documented fallback (swapping = replace `deliver()` in `provider.ts`).

## Deviations from the ticket

- **Voucher extraction reuses the existing T8 `extractVoucher`** rather than a new `email/voucher-extract.ts` (the ticket's file list implied a fresh module). Rationale: DRY (CLAUDE.md) — a well-tested extractor already existed; a duplicate would drift. The email-specific mapping lives in the small pure `voucher-data.ts` adapter instead.
- **Added `finalize_email_send` RPC + `NEXT_PUBLIC_SITE_ORIGIN`** (not explicitly listed): claim-then-finalize needs a finalize step (mirrors the payment spine, edge 2), and absolute email links require a configurable origin. Both are additive and non-breaking.
- **`CreateOrderPayload.locale` is required** (not optional): the checkout action always sends it, and the RPC clamps a bad/missing value to es-MX. Two existing integration test builders were updated to supply it.
