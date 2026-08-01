# Research Report: T12 — Admin: Order Management

## Codebase Analysis

### Existing Patterns

- **Admin list read (count → clamp → range → stitch)** — `src/lib/admin/products/list-query.ts:77` (`listAdminProducts`). Two-phase: `countProducts` (head query) → `lastPageFor`/`parsePageParam`/`rangeFor` from `src/lib/catalog/pagination.ts` → ranged data read → batch-stitch derived fields (no N+1). **Reuse:** clone verbatim as `order-list-query.ts`; the "stitch" step becomes customer-name (already snapshotted on `orders.shipping_full_name`, so likely no stitch needed) and item-count. Search meta-char stripping (`list-query.ts:60`) is a security pattern to copy for the order search.
- **Pure, bounded filter parse** — `src/lib/admin/products/list-filters.ts:58` (`parseListFilters`). Length-caps search (`ADMIN_SEARCH_MAX_LENGTH = 120`), constrains enums, carries raw `page`. **Reuse:** clone as `order-list-filters.ts` with `status`/`payment` enums.
- **Paired `*-input.ts` / `*-write.ts`** — `product-input.ts` (pure parse/validate → typed `ProductParsed`) + `product-write.ts:37` (RLS-bypass admin client, maps raw PG error to a friendly enum, busts cache tags). **Reuse:** the input/write split for tracking, notes, refund, cancel. NOTE the ticket's directive: the order-form CONTRACT (types) goes in `src/lib/admin/orders/`, not the app dir — T11 inverted this (`products-form-state.ts` lives in the app dir) and T12 should not.
- **Server action posture** — `src/app/admin/(app)/products/actions.ts:82`. Every action: `"use server"`, `requireSession()` FIRST (`actions.ts:89`), pure-parse, write via admin client, map error to form state, redirect/return. Only async fns exported (state types live in `products-form-state.ts`). **Reuse:** `orders/actions.ts` follows this exactly.
- **Self-guarded route handler** — `src/app/admin/(app)/products/export/route.ts:13`. `export const dynamic = "force-dynamic"`; `if (!(await hasValidAdminSession())) return new Response("No autorizado", { status: 401 })`; try/catch → 500 with a friendly body, raw error logged not echoed. **Reuse:** the packing-slip route handler is a near-copy (returns `text/html` instead of CSV).
- **The ONE status-transition path** — `src/lib/payments/advance-order.ts:23` (`advanceOrderStatus`) wrapping the `advance_order_status` RPC (0009/0010). Typed outcome, never throws. **Reuse:** `order-status-write.ts` calls THIS, then branches email on the returned `transition_kind` — never a raw `.update({status})`.
- **Transactional stock RPC to mirror** — `record_inventory_adjustment` (0011, migration lines 71–143) and `create_order` (0010 lines 383–539). Both: lock the target row `FOR UPDATE`, mutate stock atomically with a ledger/history insert, `SECURITY DEFINER` + empty `search_path` + `service_role`-only execute. **Reuse:** `cancel_order` mirrors `create_order`'s guarded stock loop IN REVERSE (add quantity back).
- **Email dispatch (claim → render → send → finalize, failure-isolated)** — `src/lib/email/dispatch.ts:59` (`dispatchEmail`). Exactly-once via `claimEmailSend` (`email_sends` ledger, 0010). The T12 seams are `sendShipped` (`dispatch.ts:232`), `sendCancelled` (`:249`), `sendRefundIssued` (`:266`) — all built, unit-tested, NOT wired. **Reuse:** call these from the write layer; branch on `transition_kind`.
- **Auth core** — `hasValidAdminSession()` (`session-guard.ts:19`), `requireSession()` (`require-session.ts:15`), the crypto-free codec `session-payload.ts` (`{v, iat}` payload, `decodePayload` at `:68` checks `candidate.v !== ADMIN_SESSION_VERSION`), authoritative verify `session.ts:80` (`isSessionValid`). **Reuse + EXTEND:** AC-27 revocation.
- **Refund execution** — `src/lib/payments/refund.ts:68` (`refundOrderPayment(orderId, amountCents|null, idempotencyKey?)`). Full/partial, cumulative guard, ledger, state advance, typed `RefundResult`. **Reuse:** the refund action is its FIRST caller.

### Relevant Files

| File                                                        | Purpose                                             | Relevance                                  | Action    |
| ----------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ | --------- |
| `supabase/migrations/0012_admin_orders.sql`                 | tracking cols, notes table, `cancel_order`, session-ver | NEW schema + RPC                        | Create    |
| `src/lib/admin/orders/order-list-filters.ts`                | pure filter parse (mirror products)                 | list search/filter                         | Create    |
| `src/lib/admin/orders/order-list-query.ts`                  | paginated order read                                 | list                                       | Create    |
| `src/lib/admin/orders/order-read.ts`                        | full order + items + history + notes                | detail                                     | Create    |
| `src/lib/admin/orders/order-status-write.ts`                | advance + email branch on transition_kind           | status pipeline                            | Create    |
| `src/lib/admin/orders/order-cancel-write.ts`                | `cancel_order` RPC + sendCancelled                  | cancel + restore                           | Create    |
| `src/lib/admin/orders/order-refund-write.ts`                | `refundOrderPayment` + sendRefundIssued             | refund                                     | Create    |
| `src/lib/admin/orders/order-tracking-{input,write}.ts`      | validate + persist tracking                          | tracking + shipped email                   | Create    |
| `src/lib/admin/orders/order-notes-write.ts`                 | internal notes                                       | notes                                      | Create    |
| `src/lib/admin/orders/customer-list-query.ts`               | customer list + order counts                         | customer list                              | Create    |
| `src/lib/admin/orders/packing-slip.ts`                      | print-HTML builder                                   | packing slip                               | Create    |
| `src/lib/admin/orders/order-status-meta.ts`                 | es-MX labels, badges, allowed transitions            | UI + validation                            | Create    |
| `src/app/admin/(app)/orders/{page,actions}.tsx/.ts`         | list + server actions                                | list + all writes                          | Create    |
| `src/app/admin/(app)/orders/[id]/page.tsx`                  | detail                                               | detail                                     | Create    |
| `src/app/admin/(app)/orders/[id]/packing-slip/route.ts`     | self-guarded print route                             | packing slip                               | Create    |
| `src/app/admin/(app)/orders/customers/page.tsx`             | customer list page                                   | customer list                              | Create    |
| `src/components/admin/orders/*`                              | table, filters, badges, stepper, modal, notes, slip  | all UI                                     | Create    |
| `src/lib/admin/constants.ts`                                | flip Orders nav to `live`; add paths/version const  | nav + revocation                           | Modify    |
| `src/lib/admin/session-payload.ts` / `session.ts` / `session-edge.ts` | revocation version check                   | AC-27 gate                                 | Modify    |
| `src/app/admin/(app)/page.tsx`                              | dashboard w/ new-order indicator (was a redirect stub) | AC-25                                    | Modify    |
| `src/lib/checkout/order-read.ts`                            | (optional) tracking fields for shipped email        | tracking → email                           | Modify?   |
| `src/lib/supabase/types/tables-commerce.ts`                 | order/customer/notes row types                       | typed boundaries                           | Modify    |
| `src/lib/supabase/types/rpc.ts`                             | `cancel_order` Args/Result (`type` aliases)         | typed RPC                                  | Modify    |
| `src/lib/payments/refund.ts`                                | refund fn (unchanged; now called)                   | refund                                     | Reference |
| `src/lib/payments/advance-order.ts`                         | status wrapper (unchanged; now called by admin)     | status                                     | Reference |
| `src/lib/email/dispatch.ts`                                 | send seams (unchanged; now called)                  | emails                                     | Reference |
| `src/app/admin/(app)/products/export/route.ts`              | self-guard template                                 | packing-slip route                         | Reference |
| `src/lib/admin/products/list-query.ts` / `list-filters.ts`  | list template                                       | list                                       | Reference |

### Data Flow

**Status-update → email (e.g. mark Shipped):**
`OrderDetailActions` (client) → `advanceStatus(orderId, "shipped")` server action → `requireSession()` → `order-status-write.ts` → `advanceOrderStatus({ p_order_id, p_order_status: "shipped", p_payment_status: <current>, p_note })` → RPC (0010) locks row, writes `orders.status`, inserts `order_status_history` with `transition_kind='shipped'`, returns `{applied:true, transition_kind:'shipped'}` → write layer reads `transition_kind`, calls `sendShipped(orderId, {trackingNumber, carrier, trackingUrl})` → `dispatch.ts` claims `email_sends` (kind `shipped`, dedupe `''`), renders `renderShipped`, sends, finalizes → action returns `{ok:true}` → `revalidatePath`/router refresh → detail shows new status + history entry. Email failure is caught in dispatch and does NOT fail the action (edge 7).

**Refund → MP → ledger → email:**
`RefundModal` (client) → `refundOrder(orderId, {mode, amountMxn})` server action → `requireSession()` → `order-refund-write.ts` converts MXN→cents, mints/threads a STABLE per-action idempotency key → `refundOrderPayment(orderId, amountCents|null, key)` (`refund.ts:68`) → validates UUID/amount → `readRefundableOrder` (must be `payment_status==='paid'` + `mp_payment_id`) → `readRefundedTotal` (RPC `refunded_total`) local pre-check → `refundClient().create({ payment_id, body: full? undefined : {amount}, requestOptions:{idempotencyKey} })` → `record_refund` RPC (order-locked cumulative guard, ledger insert keyed by MP refund id) → if full: `advanceOrderStatus({p_order_status:null, p_payment_status:'refunded'})` (payment-only, writes `transition_kind='refunded'` history row); if partial: stays `paid` → returns `RefundResult` → write layer, on `{status:'refunded'}`, calls `sendRefundIssued(orderId, mpRefundId, refundedAmountCents)` (deduped on MP refund id) → action returns typed result → modal closes / shows error. On `mp-error`/`over-refund`/`error`, NO state change (or logged reconcile-by-hand) and NO email.

**Cancel → stock restore:**
`cancelOrder(orderId, reason)` → `requireSession()` → `order-cancel-write.ts` → `cancel_order` RPC (0012): lock order `FOR UPDATE`; if already `cancelled` → no-op; else loop `order_items`, for each non-null `product_id`/`variant_id` add `quantity` back to stock; advance to `cancelled` writing history (`transition_kind='cancelled'`); commit → write layer calls `sendCancelled(orderId, reason)` → action returns `{ok:true}`.

### Similar Features (Reference Implementations)

- **T11 product list** (`products/page.tsx` + `list-query.ts` + `list-filters.ts` + `pagination.ts`) — the exact template for the order list AND customer list: server component parses filters, `Promise.all` the reads, renders table or empty state. Key patterns: two-phase count/read, meta-char-stripped search, bounded filter parse.
- **T11 product form/write** (`actions.ts` + `product-input.ts` + `product-write.ts`) — the template for every T12 write action: session-first, pure parse, admin-client write, friendly-error mapping.
- **T11 CSV export route** (`products/export/route.ts`) — the template for the packing-slip route handler (self-guard, `force-dynamic`, friendly 500).
- **T8 create_order / T11 record_inventory_adjustment RPCs** — the template for `cancel_order` (atomic stock + history, `SECURITY DEFINER`, `service_role`-only).
- **T8 webhook refund path** (`refund.ts` + `advance-order.ts`) — the exact refund contract the admin action wraps.

## Dependency Analysis

### Existing Dependencies to Leverage

- **`mercadopago` SDK** via `src/lib/payments/mp-client.ts` (`refundClient()` → `PaymentRefund`). Already installed and server-only. Refunds go through `refund.ts`; the admin action never touches the SDK directly.
- **`refundOrderPayment`** (`refund.ts`) — full/partial, idempotent, cumulative-guarded, ledger-recording, state-advancing. Version: current repo T8 code.
- **`advanceOrderStatus`** (`advance-order.ts`) → `advance_order_status` RPC. The status authority.
- **`record_refund` / `payment_refunds` / `refunded_total`** (0009) — the refund ledger + guard.
- **Email seams** `sendShipped` / `sendCancelled` / `sendRefundIssued` (`dispatch.ts`) + `email_sends` ledger + `claim_email_send`/`finalize_email_send` (0010).
- **List/pagination** `list-query.ts` / `list-filters.ts` / `pagination.ts`.
- **UI** `shadcn/ui` (Dialog, Badge, Button, Table), `@hugeicons/react` + `@hugeicons/core-free-icons` (`ShoppingCart01Icon` already imported in `constants.ts`), `cn()`, `AdminPage`/`AdminShell` chrome.

### New Dependencies Needed

- **None recommended.** Packing slip = print-optimized HTML + `@media print` + `window.print()`. **Rationale:** (1) no PDF lib exists in the repo today (grep for `pdf`/`packing`/`print` found only the OXXO/SPEI voucher component, unrelated); (2) a server-side PDF renderer (`@react-pdf`, `puppeteer`, `pdfkit`) adds heavy weight, a serverless cold-start/binary risk on Vercel, and a new attack surface for an es-MX single-owner tool where the browser's print-to-PDF is sufficient; (3) HTML print keeps the slip a pure function (`packing-slip.ts`) that's trivially testable. **Alternatives (if a hard requirement emerges):** `@react-pdf/renderer` (React-native PDF, no headless browser) or `pdfkit` (imperative). Both are Phase-2 justifications, not Phase-1.

### Internal Dependencies

- `order-status-write.ts` → `advance-order.ts` → `advance_order_status` RPC → `email_transition_kind` — implication: the email branch MUST read the RPC's returned `transition_kind`, not re-derive or string-match (single-sourced in SQL).
- `order-refund-write.ts` → `refund.ts` → (`refunded_total`, `record_refund` RPCs, `advance-order.ts`, `mp-client.ts`) — implication: the action's only job is auth-gate + MXN→cents + stable idempotency key + `sendRefundIssued` on success; do NOT re-implement any guard.
- Session verify (`session-guard.ts` → `session.ts` → `session-payload.ts` → `constants.ts` `ADMIN_SESSION_VERSION`) — implication: AC-27 revocation must thread a PERSISTED version read into the verify without breaking the codec's crypto-free/runtime-agnostic split (Node `session.ts` + Edge `session-edge.ts` share `session-payload.ts`). The persisted read is I/O, so it belongs in the `session-guard.ts` boundary (Node) — the Edge middleware can stay a fast pre-check and let the authoritative Node verify do the revocation check.

## External Research

### API Documentation — Mercado Pago Refunds

Confirmed against MP developer docs and matching the repo's `refund.ts` contract exactly:

- **Endpoint:** `POST /v1/payments/{id}/refunds` (the SDK's `PaymentRefund.create({ payment_id })`).
- **Full vs partial:** an EMPTY body = full refund; a body with `{ "amount": <number> }` = partial. The repo does exactly this (`refund.ts:185`: `body: isFull ? undefined : { amount: centsToMpAmount(refundCents) }`). `amount` is a decimal major-unit value (pesos), so `centsToMpAmount` converts integer cents → MP's expected number.
- **Idempotency:** the `X-Idempotency-Key` header makes a retry of the SAME request a no-op returning the first result. MP has made it MANDATORY. The repo threads it via `requestOptions: { idempotencyKey }` (`refund.ts:186`). **Gotcha (H-1, already handled):** the key must be per-LOGICAL-attempt, never per (order, amount) — two distinct same-amount partials sharing a key collapse into one at MP. The admin action MUST thread a STABLE key per user action (retry-safe) but a FRESH key per new refund.
- **Multiple refunds on one payment:** MP allows more than one refund per payment as long as the cumulative refunded ≤ the original amount. The repo enforces this against the ORDER total via `record_refund`'s order-locked guard (not MP's per-payment sum) — the stricter, race-safe authority.
- **PP-000005 caveat (3 duplicate payments):** `orders.mp_payment_id` stores ONE payment id, so a refund targets that single approved payment. Refunding the other two duplicate charges is NOT possible through this Phase-1 path (out of scope); the UI must not imply it.

Sources:
- [Refund partial amount — Mercado Pago](https://www.mercadopago.com.co/developers/en/docs/wallet-connect/payment-flow/refund-payment/refund-partial-amount)
- [Create refund — Mercado Pago API Reference](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-api-payments/create-refund/post)
- [Refunds and cancellations — Mercado Pago](https://www.mercadopago.com.ar/developers/en/docs/checkout-api/payment-management/cancellations-and-refunds)
- [Idempotency key mandatory — Mercado Pago](https://www.mercadopago.com.ar/developers/en/news/2023/01/04/Idempotency-key-usage-will-be-mandatory)

### Library Documentation

- **`mercadopago` (SDK)** — `PaymentRefund` resource; `create({ payment_id, body?, requestOptions: { idempotencyKey } })`. The response `id` (numeric) is the MP refund id (`refund.ts:293` `extractRefundId` handles string/number, falls back to the idempotency key). Client is timeout-bounded (`MP_API_TIMEOUT_MS`) via `mp-client.ts`.
- **Next.js App Router** — route handler self-guard (matcher excludes `/api`; `(app)` layout does not cover route handlers). `export const dynamic = "force-dynamic"` prevents caching an authed response.
- **next-intl** — email templates use `getTranslations({ locale, namespace: "email" })`; admin page/nav copy is inline es-MX (T10/T11 decision), so T12 UI strings are inline, NOT catalog keys.

## Risk Assessment

### Technical Risks

| Risk                                               | Likelihood | Impact | Mitigation                                                                                                             |
| -------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| **Refund double-execution** (double-click / retry) | Med        | High   | Stable per-action `X-Idempotency-Key` (MP dedupe) + `record_refund` order-locked cumulative guard + `payment_refunds` unique on MP refund id. Disable the submit button in-flight; modal non-dismissable mid-request. |
| **Stolen-cookie + refund** (SEC-M-1)               | Med        | High   | AC-27 revocation gate (persisted session-version checked on every authoritative verify) MUST ship before the refund action. Headline security item. |
| **Stock-restore non-atomicity** (T11 compensation trap) | Med    | High   | `cancel_order` is a single SQL RPC transaction (mirror `create_order`), NOT app-level delete/re-insert. Idempotent, skips null FKs, locks the order. |
| **transition_kind mismatch** (email fires on wrong event / string-matching note) | Low | Med | Branch ONLY on the RPC-returned `transition_kind` (single-sourced in `email_transition_kind`). Never parse `note`. Tests assert the exact kind→send mapping. |
| **Refund state-write partial failure** (MP moved, ledger/advance failed) | Low | High | `refund.ts` already logs "reconcile by hand" and returns `error`; the action surfaces a generic error + "revisa el panel de MP". Idempotent advance converges on retry. |
| **Immutability trigger blocks tracking write**     | Low        | Med    | New tracking columns are NOT in the 0003 frozen set → allowed. VERIFY in the migration test (a `.update({tracking_number})` on an order must succeed). |
| **`/api/admin` unguarded packing slip leaks order data** | Low  | High   | Self-guard `hasValidAdminSession()` → 401 at entry (mirror export route). Covered by AC-29 + a route test. |
| **Over-refund race across concurrent partials**    | Low        | Med    | Local pre-check + race-safe `record_refund`. Second refund rejected; if MP already moved money, logged for manual reconcile. |

### Performance Considerations

- **List read** — copy the two-phase count/range + batch-stitch to avoid N+1. `orders` already has indexes on `status`, `created_at`, `customer_id` (0003). Add a `customers` search index (name/email) in 0012 for the customer list. Order-count-per-customer should be a single grouped query, not per-row.
- **Detail read** — one order + one items query + one history query + one notes query, `Promise.all`'d. History is bounded per order; no pagination needed.
- **Session revocation read** — the persisted version is a single-row read on every authoritative verify (every admin page + action). Keep it a trivial indexed single-row select (or a short-lived in-process cache) so it doesn't add latency to every admin request.

### Security Considerations

- **Session revocation (SEC-M-1 / ADR-2) — THE headline.** Stateless sessions give a stolen cookie an ≤8h window. For a refund-capable console, add a persisted session-version compared against payload `v` on every authoritative verify; a version bump revokes all cookies. Must be live before the refund action ships (AC-27/28).
- **`/api/admin` self-guard (AC-29).** The middleware matcher excludes `/api` and route handlers escape the `(app)` layout guard — the packing-slip route MUST self-guard or it leaks full order/customer PII. Template: `products/export/route.ts`.
- **Action auth (AC-30).** Every write action `requireSession()` FIRST, before any DB touch — a direct POST without a valid cookie must never reach the RPC.
- **No raw MP error to the client (AC-20).** `refund.ts` already returns typed results; the action must not widen them into raw strings.
- **PII in the packing slip.** It carries ship-to PII; it is authed-only and `Cache-Control: no-store`.
- **es-MX only.** Admin surfaces are es-MX; no locale negotiation to exploit.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Migration 0012 + the session-`v` revocation gate FIRST** — tracking columns, `order_internal_notes`, `cancel_order` RPC, the session-version source. The revocation gate is a security prerequisite for the refund action (AC-27) and touches shared auth code, so land it before any refund-capable surface. Add the `cancel_order` Args/Result + row types to the type files.
2. **Read + list** — `order-list-filters.ts`, `order-list-query.ts`, `orders/page.tsx`, the table/filters/empty-state components. Flip the nav to `live`. (No writes yet — safe to ship incrementally.)
3. **Detail + internal notes** — `order-read.ts`, `[id]/page.tsx`, history-log + stepper components, `order-notes-write.ts` + `addInternalNote` action. Read-heavy, low-risk.
4. **Status pipeline + email** — `order-status-input/write.ts`, `advanceStatus` action, wired to `advanceOrderStatus` + `sendShipped`/`sendCancelled` branching on `transition_kind`. (`preparing`/`delivered` = no template → no email.)
5. **Tracking + shipped email** — `order-tracking-input/write.ts`, `setTracking` action; thread tracking into the `sendShipped` call at the ship step.
6. **Cancel + stock restore** — `order-cancel-write.ts`, `cancelOrder` action, wired to `cancel_order` RPC + `sendCancelled`. Depends on step 1's RPC.
7. **Refund (full + partial)** — `order-refund-input/write.ts`, `refundOrder` action, `RefundModal`. FIRST caller of `refund.ts`. Gated behind step 1's revocation (money-movement; human-review gate per BUILD_PLAN rule).
8. **Packing slip** — `packing-slip.ts`, `[id]/packing-slip/route.ts` (self-guarded), `packing-slip-view.tsx`. Independent; can run in parallel with 6/7.
9. **Customer list** — `customer-list-query.ts`, `customers/page.tsx`, `customer-table.tsx`. Reuses the list pattern.
10. **Dashboard new-order indicator** — replace the `/admin` redirect stub with the overview + `new-order-indicator.tsx`. Confirm `sendNewOrderOwnerAlert` stays wired at checkout (do NOT duplicate).

### Key Decisions

- **PDF vs HTML print:** RECOMMEND print-optimized HTML (`@media print` + `window.print()`), NO new dependency. Justified above (no existing PDF lib, serverless weight/cold-start, single-owner es-MX tool, testable pure builder). Reopen only on a hard server-side-PDF requirement.
- **Session revocation mechanism:** RECOMMEND a persisted single-row `admin_session_version` (a table or a `store_settings` column) compared against payload `v` at the Node authoritative verify (`session-guard.ts`/`isSessionValid` boundary), keeping the Edge pre-check unchanged. Preferred over merely shortening max-age because it gives an actual "log out everywhere / rotate on compromise" control, which a refund console warrants. Keep the read cheap (indexed single-row, optional short cache). Fallback if scope-cut: shorten `getSessionMaxAgeSeconds` for refund sessions (weaker; document the residual window).
- **Partial refund across multiple payments:** Phase 1 refunds against `orders.mp_payment_id` (one id) and guards against the ORDER total. Multi-payment reconciliation (PP-000005's duplicates) is out of scope; the UI states the refundable balance clearly and never implies it touched other charges.
- **Internal notes storage:** a dedicated `order_internal_notes` table (append-only, admin-only), NOT `order_status_history.note` — the history note feeds customer-facing derivation context and must not carry private admin text.
- **Tracking → shipped email:** pass `{trackingNumber, carrier, trackingUrl}` at the `sendShipped` call site (the seam already accepts them) rather than widening `getOrderForEmail`/`OrderEmailData` — smaller blast radius on the shared email read.

### Anti-Patterns to Avoid

- **Don't string-match `order_status_history.note`** to decide which email to send — branch on the RPC-returned `transition_kind`. The note is free text; the kind is the single-sourced contract (`email_transition_kind`, 0010).
- **Don't use the T11 compensation pattern for stock restore** (`product-write.ts`'s app-level delete-then-restore-on-error). Cancel is money/inventory-critical: use the single-transaction `cancel_order` SQL RPC (mirror `create_order`).
- **Don't add an unguarded `/api/admin` route handler.** The matcher excludes `/api`; self-guard `hasValidAdminSession()` at entry (mirror `products/export/route.ts`).
- **Don't call `refundOrderPayment` without a stable idempotency key** — a bare call mints a fresh UUID per invocation, so a double-clicked action could double-refund. Thread ONE stable key per user action.
- **Don't re-implement the cumulative-refund or regression guards** in the action — `record_refund` and `advance_order_status` own them race-safely.
- **Don't do a raw `.update({ status })`** anywhere — the ONLY transition path is `advanceOrderStatus`.
- **Don't echo raw MP errors** to the modal (AC-20) — surface the typed `RefundResult` mapped to friendly es-MX copy.
- **Don't put the order-form type contract in the app dir** (T11's lib→app inversion) — types live in `src/lib/admin/orders/`.
