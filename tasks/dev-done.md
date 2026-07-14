# Dev Summary: T7 — Checkout & Order Creation

Full-stack implementation of the revenue write path: a single-page sectioned
checkout form, server-side re-validation of price + stock, an atomic Postgres
reserve-and-create RPC, discount validation, guest order creation, and an order
confirmation page. Zero TODOs. `tsc` clean, `eslint` clean, `next build` clean
(both locales), migration applied to local Docker Supabase, seed re-run, and the
RPC + routes smoke-tested end to end.

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `supabase/migrations/0008_checkout.sql` | created | `order_number_seq`; `orders.idempotency_key` col + partial-unique index; `create_order(jsonb)` SECURITY DEFINER RPC — guarded per-line stock decrement, customer/order/order_items/status_history inserts, sales_count bump, discount redemption bound-check, idempotency short-circuit, all in one transaction. Granted to `service_role` only. |
| `src/lib/config.ts` | modified | Added `MEXICAN_STATES` (32) + `isMexicanState`, `MEXICAN_CP_PATTERN`, `EMAIL_PATTERN`, `DELIVERY_NOTES_MAX`, `RFC_MAX`, `CONTACT_PHONE_MAX`, `ADDRESS_FIELD_MAX`, `ORDER_NUMBER_PREFIX`, `TAX_RATE=0`, `CHECKOUT_CONFIRMATION_SEGMENT`, `confirmationPath()`. Documented "HOW TO SWAP" block (rule 4). |
| `src/lib/checkout/address.ts` (+ `.test.ts`) | created | Pure Mexican address + contact validation on trimmed values; typed `{ ok, values, fieldErrors }`. |
| `src/lib/checkout/discount.ts` (+ `.test.ts`) | created | Pure discount eligibility + application (percentage/fixed), clamp ≤ subtotal, window/min/redemption checks; `normalizeDiscountCode`. |
| `src/lib/checkout/order.ts` (+ `.test.ts`) | created | Pure order-total assembly satisfying every DB identity CHECK; `formatOrderNumber`. |
| `src/lib/checkout/checkout-read.ts` | created | Server live re-read by id (batched `in(...)`) → per-line price/stock re-validation; `fetchDiscountCode` (case-insensitive, degrades on error). Admin client; `server-only`. |
| `src/lib/checkout/order-read.ts` | created | Server read of an order + items by number for the confirmation page (admin client; never throws → `null`). |
| `src/app/[locale]/checkout/actions.ts` | created | `"use server" placeOrder` — parse → validate → revalidate → shipping → discount → assemble → atomic RPC → friendly status union. Never echoes raw PG. |
| `src/app/[locale]/checkout/checkout-form-state.ts` | created | Serializable `CheckoutFormState` union + `initialCheckoutFormState` (sibling to the action, per the `"use server"` rule). |
| `src/app/[locale]/checkout/page.tsx` | created | Server page: `setRequestLocale`, `getStoreSettingsStatic()`, metadata, renders the client flow. |
| `src/app/[locale]/checkout/confirmacion/[orderNumber]/page.tsx` | created | Confirmation server page: reads order by number, renders summary + shipping + "no payment yet" note; `notFound()` on unknown. |
| `src/components/checkout/checkout-flow-client.tsx` | created | `"use client"` flow: `useCart()` + `useActionState(placeOrder)`, skeleton/empty/body, all states, banner, live region, sticky bar, redirect on success. |
| `src/components/checkout/checkout-fields.tsx` | created | Contact/Shipping/Notes sections; state `Select` + hidden input for FormData. |
| `src/components/checkout/checkout-field.tsx` | created | Shared `fieldClasses`, `TextField`, `FieldError`, `CheckoutCard` primitives. |
| `src/components/checkout/checkout-summary.tsx` (+ `.test.tsx`) | created | Itemized summary, three-state shipping, discount row, per-line issue rings, in-card submit. |
| `src/components/checkout/discount-code-field.tsx` | created | Controlled code input + applied/invalid/degraded display; never blocks submit. |
| `src/components/checkout/checkout-skeleton.tsx` | created | Pre-hydration skeleton sized to the real 2-col layout (opacity crossfade, no reflow). |
| `src/components/checkout/checkout-empty-state.tsx` | created | Empty-cart state + catalog CTA (mirrors `CartEmptyState`). |
| `src/components/checkout/sticky-checkout-bar.tsx` | created | Mobile/tablet canonical submit + total (translucent, safe-area). |
| `src/components/checkout/use-checkout-labels.tsx` | created | Resolves the whole `checkout` i18n namespace into typed label bundles. |
| `src/components/checkout/checkout-helpers.ts` | created | Pure cart→summary/payload/snapshot-price transforms. |
| `src/components/checkout/order-confirmation.tsx` | created | Tiny client child that clears the cart once on confirmation mount. |
| `src/lib/supabase/database.types.ts` | modified | Added `orders.idempotency_key`; `create_order` `Functions` entry; `CreateOrderPayload`/`CreateOrderItemPayload`/`CreateOrderResult` types. |
| `src/messages/es-MX.json` + `en.json` | modified | New `checkout` namespace (labels, validation, discount, summary, banners, confirmation, live region). |
| `scripts/seed-data/products.ts` | modified | Zero-stock variant appended to `silla-ergonomica-kids-junior` (exported `ZERO_STOCK_PRODUCT_SLUG`). |
| `scripts/seed-data/discounts.ts` | created | 5 discount codes: active pct (`AHORRA10`), active fixed (`MENOS200`), expired (`EXPIRADO`), below-min (`MINIMO5000`), exhausted (`AGOTADO`). |
| `scripts/seed.ts` | modified | Wires `seedDiscountCodes` + summary line. |

## Data-Testids Added
`checkout-skeleton`, `checkout-empty-state`, `checkout-empty-cta`, `checkout-back-link`, `checkout-heading`, `checkout-live-region`, `checkout-form`, `checkout-email-input`, `checkout-phone-input`, `checkout-fullname-input`, `checkout-address1-input`, `checkout-address2-input`, `checkout-city-input`, `checkout-cp-input`, `checkout-state`, `checkout-notes-input`, `checkout-rfc-input`, `checkout-discount-field`, `checkout-discount-input`, `checkout-discount-note`, `checkout-discount-applied`, `checkout-discount-remove`, `checkout-summary`, `checkout-summary-lines`, `checkout-summary-line`, `checkout-subtotal`, `checkout-discount`, `checkout-shipping`, `checkout-total`, `checkout-submit`, `checkout-submit-sticky`, `checkout-sticky-bar`, `checkout-banner`, `confirmation-heading`, `confirmation-order-number`, `confirmation-summary`, `confirmation-total`, `confirmation-shipping`, `confirmation-keep-shopping`.

## Key Decisions
- **Idempotency (AC-14):** a client-generated UUID per submission attempt threaded to the RPC + a partial-unique index on `orders.idempotency_key`. A repeat call with the same key returns the ORIGINAL order (`reused:true`) — no second order, no double decrement. A corrected resubmit mints a fresh key (new `submissionId`). Verified by DB smoke test.
- **Discount UX = validate-on-submit (design option B):** the code is a controlled field carried into the single `placeOrder`; the applied/invalid/degraded result is rendered from `CheckoutFormState.discount`, never claimed by the client. Keeps to "one form, one action" (Q&A precedent) and avoids a second server action. A bad code never blocks submit (AC-7).
- **Reserve at ORDER CREATION (default):** stock decremented in the RPC now; T12 handles restore-on-cancel. Matches the T6 forward note.
- **Admin client for the whole trust boundary:** live re-read AND write both go through `createAdminClient()` in server-only modules, so the entire boundary lives server-side (AC-12).
- **Order number = DB sequence** (`order_number_seq`), formatted `PP-000123`. Uniqueness is DB-guaranteed; `formatOrderNumber` is the TS display twin (prefix duplicated in the RPC by design — documented).
- **`sales_count` bumped at creation (AC-10)** inside the same transaction.

## AC-by-AC Status
- **AC-1** Non-empty `/checkout` (+ `/en`) renders contact/shipping/notes/discount/summary via `computeShipping`/`totalCents` — DONE.
- **AC-2** Empty cart → empty-state + `CATALOG_PATH` CTA; zero-line submit blocked (client empty-state + server empty guard) — DONE.
- **AC-3** `getStoreSettingsStatic()` server-side, cents prop-drilled, three-state shipping identical to cart — DONE.
- **AC-4** CP `/^\d{5}$/` + 32-state closed list, field-scoped localized errors, re-run on server — DONE.
- **AC-5** Email + required fields validated on trimmed values (pure, unit-tested); optionals bounded — DONE.
- **AC-6** Server discount validation (exists/active/window/min/redemptions) + percentage/fixed application clamped ≤ subtotal — DONE.
- **AC-7** Any bad code → friendly note, order proceeds at full price, never blocks — DONE.
- **AC-8** Server re-reads live product/variant by id; active + live price + live stock ≥ qty; mismatch aborts per-line — DONE.
- **AC-9** Single-transaction guarded decrement + inserts; last-unit race → one wins, loser rolls back; stock never negative — DONE (DB smoke verified).
- **AC-10** `sales_count += qty` in the same transaction (increment at creation) — DONE.
- **AC-11** customers + orders (`pending_payment`/`pending`, unique number, full snapshot, tax=0) + order_items + initial status_history — DONE.
- **AC-12** All commerce writes via `createAdminClient` (server-only) — DONE.
- **AC-13** Confirmation page: number + summary + shipping + "no payment yet"; cart cleared on mount — DONE.
- **AC-14** Idempotency key + unique index → single order on double-submit; button disabled while pending — DONE (DB smoke verified).
- **AC-15** Every tunable a named, documented `config.ts` constant; tax=0 written for CFDI-readiness — DONE.
- **AC-16** All copy in the new `checkout` namespace (both locales); money via `formatMXN`; integer cents — DONE.

## Deviations from Ticket
- **Discount async pre-check (design option A) not implemented** — chose the simpler, lower-risk validate-on-submit (option B), which the design explicitly allowed. Same states are rendered; feedback arrives with the submit result rather than before it.
- **`checkout-read.ts` returns `coverImageUrl: null`** — the order snapshot stores no image; the summary uses the client snapshot's image for display, so the write path avoids an extra image join. Documented in the module.
- **Discount management UI, payment capture, confirmation email, CFDI** — all explicitly out of scope (T8/T9/Phase 2/3).

## Edge Cases Handled
1. **Price drift** — `detectPriceDrift` compares live price to the submitted snapshot map → `status:"price-changed"` + per-line amber note; no order written (`actions.ts`).
2. **Last-unit race / oversell** — guarded `UPDATE ... WHERE stock >= qty` in `create_order`; zero rows → `raise OUT_OF_STOCK` → full rollback. Verified against the zero-stock seed variant (0 orders written).
3. **Cart emptied in another tab** — `parseSubmittedLines` empty → `status:"error"`; the client shows the empty state (hydrated + no lines). Zero-line order never created.
4. **Tampered snapshot** — server ignores snapshot price (recomputes from live DB), clamps qty (`sanitizeQuantity`), validates every id as UUID, and checks the variant belongs to the product; a bad id → line "unavailable" → abort.
5. **`store_settings` unavailable** — `computeShipping` → `unavailable` → `status:"shipping-unavailable"`, submit disabled, never writes `shipping=0`, never `$NaN`.
6. **Discount > subtotal** — `applyDiscount` + `assembleOrder` both clamp to subtotal; total ≥ 0.
7. **Double-submit / retry** — button `disabled` while `pending` (client) + idempotency key (server backstop). Verified.
8. **DB CHECK rejection** — `assembleOrder` is unit-tested to the identity math; any residual violation surfaces as generic `status:"error"` (raw PG logged, never echoed).

## How to Test
1. `npm run db:seed` (adds the zero-stock variant + discount codes).
2. Add items to the cart, go to `/checkout` (and `/en/checkout`).
3. Submit empty → field errors; fix → place order → confirmation at `/checkout/confirmacion/PP-XXXXXX`; header cart badge → 0.
4. Apply `AHORRA10` (10% off) / `MENOS200` (MX$200 off) — discount row appears; `EXPIRADO` / `MINIMO5000` (small cart) / `AGOTADO` / a random code → inline note, order still submittable at full price.
5. Add the zero-stock `silla-ergonomica-kids-junior` "Blanco" variant to the cart via tampering → submit → out-of-stock banner, no order.

## Verification Evidence
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npm run build`: clean; `/checkout` prerenders static (ES + EN); confirmation route dynamic.
- `npm test`: **811 passed** (764 existing + 47 new checkout: address 40, discount 17, order 14, summary 12 — approximate per file).
- Migration `0008` applied to local Docker Supabase (`supabase_db_posturpro`): sequence, column, index, function, grant all created.
- Seed re-ran: variants 69→70, discount_codes 5.
- RPC smoke tests (via psql in the DB container): happy path (`PP-000001`, stock 8→7, `from_status null → pending_payment`, 1 item), idempotent re-call (`reused:true`, no double decrement), out-of-stock raise + full rollback (0 orders), discount-exhausted raise. All DB smoke data cleaned up afterward.
- Dev-server smoke: `/checkout` 200 (ES+EN), unknown confirmation → 404, real confirmation page renders order number + item + buyer.

## Placeholder / Config Documentation (BUILD_PLAN rule 4)
- `TAX_RATE = 0` — Phase 1; written to `tax_cents`/`tax_base_cents` as 0 so CFDI (Phase 3) needs no schema rework.
- `MEXICAN_CP_PATTERN` = `/^\d{5}$/` — 5-digit CP only; **no CP↔state cross-validation** in Phase 1 (SEPOMEX authority table is a carrier/Phase-3 upgrade — known follow-up).
- `ORDER_NUMBER_PREFIX = "PP"` — duplicated in the RPC by design (the RPC reads no TS constant); change both together.
- RFC captured/stored optional, upper-cased, shape unchecked (CFDI Phase 3).

## Known Limitations / Follow-ups
- **Confirmation reads by guessable `order_number`** — ✅ RESOLVED in Stage 6 (M-6). Now addressed by an unguessable `confirmation_token`; the sequential order number is display-only and no longer a URL entry point. See "Fixes Applied (Stage 6)" below.
- **No rate limit on `placeOrder`** — could reuse the Q&A `clientIp()` + limiter as best-effort order-spam mitigation (deferred; the atomic RPC + stock floor bound real damage).
- **Discount async pre-check** (option A) is a possible UX upgrade.
- **Global-error banner recovery action** — the UX-Requirements ask for a retry/"review your cart" action in the global banner; not yet wired (dead `banner.retry` key removed). Deferred to the UX stage (Stage 8).

## Dependencies Added
- **None.** Hand-rolled pure validation (Q&A precedent); Mexican states/CP are local constants; existing `money.ts`/`shipping.ts`/`Select` reused.

---

## Fixes Applied (Stage 6)

### Issue Tracker
| ID | Severity | Title | Status | File | Notes |
|----|----------|-------|--------|------|-------|
| M-1 | MAJOR | Duplicate id / broken aria-describedby | FIXED | `checkout-fields.tsx` | every field `errorId="checkout-<field>-error"` (≠ input id) |
| M-2 | MAJOR | Two live submit buttons `<lg` | FIXED | `checkout-summary.tsx` | in-card submit `hidden lg:flex` |
| M-3 | MAJOR | Empty live-region discount amount | FIXED | `checkout-flow-client.tsx` | interpolate `formatMXN(discountCents)` |
| M-4 | MAJOR | Focus-first-invalid email-only | FIXED | `checkout-flow-client.tsx`, `checkout-fields.tsx` | DOM-order first-invalid + `StateField` `triggerRef` |
| M-5 | MAJOR | Unlabeled notes textarea | FIXED | `checkout-fields.tsx`, i18n, `use-checkout-labels.tsx` | `<label htmlFor="checkout-notes">` + `notes.label` key |
| M-6 | MAJOR | Enumerable order # → PII IDOR | FIXED | `0008_checkout.sql`, `order-read.ts`, `confirmacion/[token]/page.tsx`, `actions.ts`, `checkout-form-state.ts`, `config.ts`, `database.types.ts` | `confirmation_token` column + RPC returns it + token-routed confirmation |
| m-1 | MINOR | Totals don't refresh on drift | FIXED | `checkout-helpers.ts`, `checkout-flow-client.tsx` | `applyLivePrices` on `price-changed` |
| m-2 | MINOR | Discount TOCTOU | FIXED | `0008_checkout.sql` | RPC re-asserts `is_active` + start/end window |
| m-3 | MINOR | `upper(code)` multi-row risk | FIXED | `0008_checkout.sql` | `unique index (upper(code))` |
| m-4 | MINOR | Client-snapshot displayed total | SKIPPED | — | accepted deviation; server authoritative; m-1 closes the drift case |
| m-5 | MINOR | Radix Select vs native `<select>` | SKIPPED | — | allowed deviation (accessible combobox, ui-design.md) |
| m-6 | MINOR | `noValidate` | SKIPPED | — | intentional server-action pattern |
| m-7 | MINOR | `inputMode="numeric"` blocks `+` | FIXED | `checkout-fields.tsx` | `inputMode="tel"` |
| n-1 | NIT | Dead i18n copy | PARTIAL | `messages/{es-MX,en}.json` | 5 dead keys deleted; banner recovery-action → UX stage |

### Summary
- Critical: 0/0 (none found in review)
- Major: 6/6 fixed, 0 skipped
- Minor: 5/7 fixed, 2 skipped (both justified accepted deviations)
- Nit: n-1 dead copy removed (banner recovery action deferred to UX stage)

### File manifest delta (Stage 6)
- **Renamed**: `src/app/[locale]/checkout/confirmacion/[orderNumber]/page.tsx` → `.../[token]/page.tsx` (dynamic segment now the confirmation token).
- **Migration 0008 amended** (local-Docker-only, idempotent — authorized by ticket): `orders.confirmation_token uuid not null default gen_random_uuid()` + unique index; `discount_codes` `unique index (upper(code))`; RPC returns `confirmation_token` and hardened redemption guard (`is_active` + window). Re-applied to local Docker + reseeded.
- **Modified**: `checkout-fields.tsx`, `checkout-field.tsx` (unchanged — primitive already used `${id}-error` testid), `checkout-flow-client.tsx`, `checkout-summary.tsx`, `checkout-helpers.ts`, `use-checkout-labels.tsx`, `order-read.ts` (`getOrderByNumber` → `getOrderByToken`), `actions.ts`, `checkout-form-state.ts` (`orderNumber` → `confirmationToken`), `config.ts` (`confirmationPath(token)`), `database.types.ts`, `messages/es-MX.json`, `messages/en.json`.

### Config / contract docs changed
- `confirmationPath(confirmationToken)` now builds the URL from the order's **confirmation token**, not the order number (config header updated).
- **Confirmation-token contract (for QA/e2e)**: `create_order` RPC result and `CreateOrderResult` now include `confirmation_token: string` (uuid). Success `CheckoutFormState.confirmationToken` drives the redirect to `/checkout/confirmacion/<token>`. The page reads by token (`getOrderByToken`, UUID-validated before DB); a malformed/unknown token → 404; the sequential order number is DISPLAY-only and is NOT a valid confirmation URL.
- New i18n key `checkout.notes.label` (both locales). Removed dead keys: `checkout.discount.apply`, `checkout.discount.checking`, `checkout.banner.dismiss`, `checkout.banner.retry`, `checkout.summary.itemsCount`.

### Test Results After Fixes
- Total: 811 | Passed: 811 | Failed: 0 | Skipped: 0
- `tsc --noEmit`: clean · `eslint`: clean · `next build`: clean (both locales)
- RPC smoke (rolled-back txns): happy (token returned), idempotent (same token, `reused:true`), out-of-stock (rollback, stock unchanged, 0 orders), discount active/expired/exhausted correct.
- Live prod-server confirmation: valid token 200, malformed token 404, sequential `PP-000003` 404. Smoke data cleaned; DB left seeded.
