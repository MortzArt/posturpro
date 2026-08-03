# Research Report: T17 — Admin manual / phone order entry

> One-pass codebase inventory for the standard pipeline. T17 rides on shipped stacks — the T7 atomic checkout (`create_order`), the T8/T9 payment + email plumbing (`advance_order_status`, `dispatch.ts`), and the T12 admin-orders grammar (`requireSession`-first actions, paired input/write libs, `AdminPage` `actions` slot). The genuinely new work is a catalog product/variant picker, the `contact_email` NOT-NULL resolution, and recipient-safe email sends. Every load-bearing claim below is cited to `file:line`.

---

## Codebase Analysis

### Existing Patterns (reuse strategy)

- **Atomic order creation** — `create_order(payload jsonb)` in `supabase/migrations/0008_checkout.sql:96` (`security definer`, `set search_path=''`, `grant execute … to service_role` at `:281`; `revoke all … from public` at `:280`). Reuse: call it verbatim from a new admin action; it doesn't inspect caller identity beyond the grant, and admin actions already use the service_role key (T12).
- **Server-side price/stock revalidation** — `revalidateLines(submitted)` in `src/lib/checkout/checkout-read.ts:147`. Reuse as the "same trust rules as checkout" line resolver (see Data Flow + Q5).
- **Totals assembly** — `assembleOrder(lines, shipping, discountCents)` in `src/lib/checkout/order.ts:61` → `OrderTotals`; clamps discount to `[0, subtotal]`, integer cents, satisfies the DB identity CHECKs.
- **Payment-only status advance** — `advance_order_status(…, p_order_status=NULL, …)` in `supabase/migrations/0009_payments.sql:200` (rewritten in `0010_email_transitions.sql:200+`). Reuse for "mark paid offline."
- **Admin write-action grammar** — `src/app/admin/(app)/orders/actions.ts`: `requireSession()` first (`:76,:104,:122,:141,:163`), then write, then `revalidatePath` (`:51-52`). Copy for `createManualOrder`.
- **Paired input/write libs** — `src/lib/admin/orders/order-status-input.ts` + `order-status-write.ts` (and refund, cancel, tracking). Copy the split: pure input module + I/O write module, each with a `.test.ts`.
- **Header CTA slot** — `AdminPage` (`src/components/admin/admin-page.tsx:10`) accepts an `actions?: React.ReactNode` slot (`:13,:18,:32`). The products list uses it for "Nuevo producto" (`src/app/admin/(app)/products/page.tsx:53`, `data-testid="admin-products-new"`).
- **Form primitives** — `src/components/admin/form/fields.tsx`: `TextField` (`:66`), `MoneyField` (`:134`, `$` adornment + `inputmode=decimal`), `NumberUnitField` (`:206`), `SelectField` (`:279`), `TextareaField` (`:347`), `SwitchField` (`:405` — for the confirmation opt-in), `Banner` (`:447`, tones info/error).

### Relevant Files

| File | Purpose | Relevance | Action |
| ---- | ------- | --------- | ------ |
| `supabase/migrations/0008_checkout.sql` | `create_order` RPC + `order_number_seq` | THE creation path; reused as-is | Reference |
| `supabase/migrations/0009_payments.sql` | `advance_order_status` (payment-only) | Mark-paid path | Reference |
| `supabase/migrations/0010_email_transitions.sql` | `email_transition_kind`, transition_kind column | `transition_kind='paid'` derivation | Reference |
| `supabase/migrations/0003_commerce.sql` | orders/customers/order_items schema | `contact_email`/`email` NOT NULL; `payment_method` col | Reference |
| `src/lib/checkout/checkout-read.ts` | `revalidateLines`, `SubmittedLine`, `ValidatedLine`, `LineIssue` | Reusable trust boundary (price+stock) | Reference/Reuse |
| `src/lib/checkout/order.ts` | `assembleOrder`, `OrderLine`, `formatOrderNumber` | Totals snapshot | Reference/Reuse |
| `src/lib/checkout/address.ts` | Mexican CP/state validators | Reuse for shipping validation (AC-4) | Reuse |
| `src/lib/email/dispatch.ts` | all customer sends | Add recipient-safety guard (AC-13) | Modify |
| `src/app/[locale]/checkout/actions.ts` | reference create flow (RPC + post-create emails at `:270-271`) | Shows unconditional confirmation send to mirror-then-diverge | Reference |
| `src/app/admin/(app)/orders/page.tsx` | order list; `actions` = Clientes only | Add "Nuevo pedido" CTA | Modify |
| `src/app/admin/(app)/orders/actions.ts` | admin order actions | Add `createManualOrder` | Modify |
| `src/lib/admin/orders/order-read.ts` | `AdminOrderDetail` (has `paymentMethod`, `:68/:284`) | Source badge source of truth | Reference |
| `src/lib/admin/orders/order-list-query.ts` | list select (no `payment_method`, `:124`) | Optional: add for list badge | Modify (optional) |
| `src/lib/admin/orders/order-status-meta.ts` | badge labels/glyphs | Add source badge | Modify |
| `src/lib/admin/orders/order-constants.ts` | admin order consts | Add `MANUAL_ORDER_PAYMENT_METHOD` | Modify |
| `src/components/admin/form/fields.tsx` | field primitives | Build the form from these | Reuse |
| `src/components/product/variant-selector.tsx` | storefront variant selector | Interaction pattern for the picker | Reference |
| `src/components/admin/products/product-filters.tsx` / list-query | catalog search grammar | Product search in the picker | Reference |
| `src/app/admin/(app)/orders/new/*` | NEW route + form | The feature | Create |
| `src/lib/admin/orders/manual-order-{input,write}.ts` | NEW input/write pair | The logic | Create |

### Data Flow (manual order creation)

```
Admin @ /admin/orders/new
  → picks product(s) via search → variant-selector → qty  (client shows live stock + server-recalc price at pick time)
  → fills contact (email OPTIONAL) + shipping + shipping-override + payment-choice + confirm opt-in
  → submit (idempotency key minted on load) → server action createManualOrder(formData)
      → requireSession()                                            [AC-2]
      → manual-order-input.parse/validate (pure)                    [AC-3,4,5,6-input,11,edges 2/6]
      → manual-order-write:
          → revalidateLines([{productId,variantId,quantity}])       [AC-7, edges 1(pre)/5]
              ↳ re-reads products/variants BY ID (createAdminClient)
              ↳ unitPrice = variant.price_override_cents ?? product.price_cents   (checkout-read.ts:242)
              ↳ stock >= qty else issue                             (checkout-read.ts:206/243)
              → issues? return {lineIssues} (no order)
          → assembleOrder(validatedLines, shipping, 0)              [AC-8] → totals
          → resolve contact_email (real OR store/sentinel)          [AC-11 decision]
          → create_order(payload{idempotency_key, contact_*, shipping_*, totals, locale:'es-MX', items})  [AC-9,10]
              ↳ guarded per-line decrement WHERE stock>=qty         (0008:152) — race-safe (edge 1 hard stop)
              ↳ order_number = 'PP-'||lpad(nextval(order_number_seq)) (0008:211)
              ↳ customers + orders + order_items + history(transition_kind) inserted in one tx
              ↳ returns {order_id, order_number, confirmation_token, reused}
          → stamp orders.payment_method='manual'                    [AC-14]  (create_order doesn't accept it)
          → if payment-choice=paid:
              advance_order_status(order_id, NULL, 'paid', 'manual', NULL, note)  [AC-15] → transition_kind='paid'
          → if confirm-opt-in AND valid email: sendOrderConfirmation(order_id)     [AC-12] (recipient-safe)
      → revalidatePath(list + detail) → redirect /admin/orders/[id]  [AC-17]
```

### Similar Features (Reference Implementations)

- **Checkout order creation** — `src/app/[locale]/checkout/actions.ts` is the closest sibling: it revalidates lines, assembles totals, calls `create_order`, then fires `sendOrderConfirmation(orderId)` + `sendNewOrderOwnerAlert(orderId)` at `:270-271`. T17 is "checkout, but admin-initiated, email-optional, and possibly pre-paid." Key divergences: confirmation is opt-in (not unconditional), no MP preference/redirect, `payment_method='manual'`, optional immediate paid-marking.
- **T12 cancel_order flow** — `src/lib/admin/orders/order-cancel-write.ts` + `tests/integration/admin-orders-cancel.integration.test.ts` show the exact integration-test shape (service-role client, insert fixtures, call RPC, assert stock + history, cleanup) to mirror for AC-19.
- **Products "new" page** — `src/app/admin/(app)/products/new/page.tsx` shows the RSC-shell → client-form-island pattern (`useActionState`) to mirror for the new route.

---

## Dependency Analysis

### Existing Dependencies to Leverage

- `@/lib/checkout/checkout-read` `revalidateLines` — the trust boundary; no admin-specific variant needed.
- `@/lib/checkout/order` `assembleOrder` / `formatOrderNumber` — totals + display number.
- `@/lib/checkout/address` — Mexican CP/state validators (AC-4).
- `@/lib/email/dispatch` — sends (to be recipient-hardened).
- `@/lib/admin/rpc` — typed args for `create_order` + `advance_order_status`.
- `@/components/admin/form/fields` + `admin-page` + `dropdown` — UI.
- `@/lib/config/checkout` `EMAIL_PATTERN` — validate the optional email + drive the recipient-safety guard.

### New Dependencies Needed

- **None.** No new npm packages; no new migration (contact_email resolved without schema change — see Key Decisions).

### Internal Dependencies

- `create_order` and `advance_order_status` are `service_role`-only (`0008:281`, `0009:504`). The admin action must call them through the service-role client (as T12 does) — never anon/authenticated. Implication: the write module lives in `src/lib/admin/orders/` and is exercised in integration tests via the `server-only`→`empty.js` alias (`vitest.integration.config.ts`).
- `create_order` does NOT accept `payment_method` in its payload (0008:214-224 inserts `status,'pending_payment'` / `payment_status,'pending'` only). Implication: source-marking (`payment_method='manual'`) is a **post-create step** — either a direct UPDATE, or carried by the `advance_order_status` paid call (which accepts `p_payment_method`). For a pending-payment manual order, a small UPDATE stamps it; for a paid one, the advance call stamps it. Single-source both on `MANUAL_ORDER_PAYMENT_METHOD`.

---

## External Research

- **None required.** No external API/library work — Mercado Pago is deliberately NOT invoked for manual orders (that's the whole point: charge-later / offline-paid). The email provider (Resend, via `dispatch.ts`) is already integrated; T17 only adds a recipient guard in front of it. No web/doc lookup needed.

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Email-less order later triggers a T12 status email → provider error/log spam / possible unhandled throw | High (if unaddressed) | Med | AC-13: `resolveCustomerRecipient` guard in `dispatch.ts` → benign `{ok:true,sent:false}` skip; unit-test the skip branch; integration-test a shipped-style resolve on an email-less order. |
| Contact_email NOT NULL on TWO tables blocks email-less creation | High | High (blocks the feature) | Resolve via store/sentinel placeholder (no migration) — see Key Decisions; guard ensures the placeholder never receives mail. |
| Stale price/stock between pick and submit → wrong charge or oversell | Med | High (money/inventory) | `revalidateLines` on submit ignores client prices; `create_order` guarded decrement is the hard floor (edge 1); price-changed aborts (edge 5). |
| Double-submit creates two orders / double stock decrement | Med | High | Per-submission idempotency key → `create_order` `reused:true`; in-flight submit disable. |
| Source-marking forgotten because `create_order` ignores `payment_method` | Med | Low | Explicit post-create stamp (UPDATE or via the paid advance); unit-assert `payment_method='manual'`; integration-assert. |
| Zero-item order → $0 line-less order | Low | Med | Input validation rejects before `create_order` (edge 2). |
| Paid-step fails after successful create → inconsistent perception | Low | Low | Do NOT roll back the order; surface "created but not marked paid, fix on detail"; order is valid + refundable/advanceable via T12. |

### Performance Considerations

- `revalidateLines` batches product + variant reads into two `in(...)` queries (`checkout-read.ts:159`) — a manual order has few lines; negligible cost.
- Product-picker search reuses the admin catalog list query (already paginated/bounded); debounce the search input as `product-filters` does.

### Security Considerations

- **Auth**: page + action both `requireSession()` first (AC-2), matching T12 AC-30. No `/api` route (server action only), so no self-guard route handler needed.
- **Trust boundary**: client-sent prices are never trusted; `revalidateLines` re-reads from DB (same as checkout) — an admin cannot set an arbitrary price in v1 (price override is Out of Scope, so no privileged-price path to abuse).
- **Injection/XSS**: all free-text (names, address, notes) is snapshotted into the order and rendered by the existing T12 detail/packing-slip which already HTML-escape hostile data (T12 hacker stage verified). No new render surface for untrusted text beyond the picker's own catalog data (trusted).
- **Placeholder email**: the sentinel/store-address substitution must never be a real customer's address and must be filtered by the recipient guard so it is never emailed — verified by the AC-13 guard + tests.

---

## Implementation Recommendations

### Suggested Order of Implementation

1. **`dispatch.ts` recipient-safety guard (AC-13)** — first, because it's an independent, cross-cutting hardening that unblocks the email-less path and de-risks the whole feature; add its unit test. (Also quietly benefits any future email-less order.)
2. **`manual-order-input.ts` (pure) + tests** — the validation contract; no I/O, fast to TDD (edges 2/4/6, email branching, payment-choice).
3. **`manual-order-write.ts` + tests** — orchestration over `revalidateLines`/`assembleOrder`/`create_order`/`advance_order_status`; mock deps in unit, real in integration.
4. **`createManualOrder` action + orders `order-constants` + source badge meta** — wire the write into the admin action grammar; `payment_method='manual'` single-sourced.
5. **Route + form + product/variant picker UI** — the largest new surface; build from `fields.tsx` + `variant-selector` pattern; states per UX Requirements.
6. **"Nuevo pedido" CTA + detail badge (+ optional list column/filter)** — small wiring.
7. **Integration test (AC-19) + admin e2e (AC-20)** — end-to-end proof against local Supabase / DEV-server admin project.

### Key Decisions

- **RPC decision — REUSE, don't fork.** Use `create_order` as-is (it's `service_role`-callable and admin-agnostic); do NOT write a sibling `create_manual_order` RPC. Source-marking and paid-marking are post-create steps (`payment_method` UPDATE / `advance_order_status`), which keeps the atomic creation path single-sourced and avoids a new migration. This honors the T12 ADR ("inventory/money-critical multi-row mutation = one SECURITY DEFINER RPC") — we reuse that RPC rather than add compensation logic.
- **contact_email decision — required-with-store/sentinel fallback, NO migration (recommended).** Keep both NOT NULL columns; when email is blank, substitute a single well-defined non-delivering placeholder (store contact email from Store Settings, or a documented `no-reply` sentinel) so `create_order` succeeds, AND extend the AC-13 recipient guard to treat that placeholder as "no recipient" so it's never emailed. Tradeoffs of the alternatives:
  - *Nullable migration (rejected):* cleanest semantically but touches TWO NOT NULL columns (`orders.contact_email`, `customers.email`) + every downstream reader/typing that assumes `string` (order-read, email data, packing slip, customer list) — a wide, medium-risk change for a phone-order edge; also `create_order` inserts `contact_email` verbatim and would need `nullif`. Highest blast radius.
  - *Raw sentinel visible everywhere (rejected):* a literal like `phone@no-email.local` in `contact_email` shows up in the order-list search/display (`order-list-query.ts:61,124`) and the customer list — ugly and confusing for the owner.
  - *Store-address fallback + guard (recommended):* satisfies the constraint invisibly, reuses the store's own known-safe address, and the recipient guard guarantees no send. Lowest blast radius, zero migration. Document the choice so the detail can label "sin correo" rather than show the placeholder.
- **Offline-paid decision — `advance_order_status` payment-only, NO payment-received email.** Mark paid via `advance_order_status(order_id, NULL, 'paid', 'manual', NULL, note)` → `transition_kind='paid'`. Do NOT send `sendPaymentReceived`: it's dedupe-keyed on `mp_payment_id` (absent for manual orders) and `fireTransitionEmail` (`order-status-write.ts:110`) intentionally sends nothing for `paid`. The owner took the payment in person/by phone, so a "we received your payment" email is redundant/confusing. The only optional customer email is the AC-12 confirmation.
- **Source marker — `payment_method='manual'`, not a new column.** `payment_method` is nullable, already read into the detail (`order-read.ts:68/284`), and free to badge. A dedicated `source`/`channel` column is deferred to Phase 2 if manual orders proliferate.
- **Price/stock trust — reuse `revalidateLines` verbatim; no admin price override in v1.** Catalog prices only; flag override as future. This keeps the admin path's trust rules byte-identical to checkout.

### Anti-Patterns to Avoid

- **Don't** trust client-sent line prices — always `revalidateLines` on the server (checkout's rule; `checkout-read.ts` comment at `:4-11`). Instead recompute from live DB.
- **Don't** add a nullable migration for the email edge before trying the store/sentinel fallback — it's a wide, risky change for a narrow case.
- **Don't** send `sendPaymentReceived` for a manual paid order (no `mp_payment_id`, redundant to the owner).
- **Don't** roll back a successfully-created order if the post-create paid/confirmation step fails — the order is valid; surface the sub-failure and let the owner fix it on the detail (matches T12's "email-fail ≠ rollback" posture).
- **Don't** push an empty/placeholder `to` to the email provider — guard it (AC-13). The current sends only guard `order unreadable` (`dispatch.ts:155/170/195/218/239/256/274`), not recipient validity.
- **Don't** invent a new order-creation RPC — reuse `create_order`; source/paid marking are post-create steps.
- **Don't** allow a zero-item order to reach `create_order` — validate `items.length >= 1` at the input layer (edge 2).
