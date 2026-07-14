# Code Review: T7 — Checkout & Order Creation

Reviewer: ultrareview (Stage 5). Commit under review: `d6cb836`.
Scope: all 34 changed files, line-by-line; migration `0008_checkout.sql`, the
`"use server"` action, the money math, Mexican validation, i18n, UI states,
motion, accessibility, and every AC/edge-case claim in `dev-done.md`.

## Summary

Genuinely strong work on the hard parts: the atomic reserve-and-create RPC is
race-safe (guarded decrement + matched-row lock + full rollback), the trust
boundary is correct (server re-reads live price/stock by id, ignores the cart
snapshot, validates every UUID, checks variant-belongs-to-product), the money
math is integer-cents throughout with defensive clamps that satisfy every DB
CHECK, and idempotency is sound. No SQL injection, no privilege escalation, no
`$NaN` crash path found in the money path. The defects are concentrated in the
**client UI accessibility layer** (a systematic broken `aria-describedby`/
duplicate-id bug across every field, focus-management wired for email only, a
live-region string emitted with an empty amount, an unlabeled textarea) and one
**responsive bug** (two live submit buttons render below `lg`, contradicting the
documented single-submit design). One privacy issue (sequential, enumerable
order numbers expose full PII on the confirmation page) is already flagged for
the Security stage but is live in this code.

No CRITICAL blockers in the write path. Several MAJORs must be fixed before the
human-review gate.

---

## Critical Issues (MUST FIX)

None. The commerce write path (RPC atomicity, rollback, idempotency short-circuit,
snapshot re-validation, discount clamp, DB-CHECK alignment, admin-client-only
grant) is correct. Findings that would normally be critical are contained to UI
accessibility/responsive layers (below) and do not corrupt data or oversell.

---

## Major Issues (SHOULD FIX)

### M-1: Duplicate DOM `id` + broken `aria-describedby` across EVERY text field
- **ID**: M-1
- **Severity**: MAJOR (accessibility correctness — defeats the exact wiring the component was built for)
- **File**: `src/components/checkout/checkout-fields.tsx:76-77, 91-92, 129, 134, 139, 145, 150` (and the primitive at `src/components/checkout/checkout-field.tsx:62, 74, 78, 84`)
- **Problem**: Every `TextField` is passed an `errorId` **equal to the input's own `id`**: e.g. `id="checkout-email"` with `errorId="checkout-email"` (`:65,:76`), `id="checkout-cp"` with `errorId="checkout-cp"` (`:147-150`), same for fullname/address1/address2/city/phone. In `checkout-field.tsx` the error renders `<p id={errorId}>` (`:84,:87`) and the input sets `aria-describedby={errorId}` (`:74`). So when a field has an error there are **two elements with the same `id`** (the `<input>` and the `<p>`) — invalid HTML — and `aria-describedby` resolves to the FIRST match (the input itself), so the error text is never announced as the field's description. Only `StateField` does it correctly (`id="checkout-state"` + `errorId="checkout-state-error"`, `checkout-fields.tsx:191,203`).
- **Impact**: Screen-reader users get no error description on any contact/shipping field; duplicate ids are an HTML validity + a11y-audit failure. Directly violates the UX-Requirements "`aria-describedby` wired" line and the error-states table.
- **Suggested Fix**: Give every field a distinct error id — pass `errorId={\`${id}-error\`}` (or hardcode `"checkout-email-error"` etc.). The `FieldError` `data-testid` already uses `${id}-error` so tests are unaffected.
- **Status**: FIXED — `checkout-fields.tsx`: every `TextField` now passes `errorId="checkout-<field>-error"` (distinct from the input `id`). No duplicate DOM ids; `aria-describedby` now resolves to the `<p>` error. `StateField` already correct. Verified no test queries checkout error testids (only the Q&A form does). tsc/lint/811 tests green.

### M-2: In-card submit is NOT `hidden lg:flex` — two live submit buttons render below `lg`
- **ID**: M-2
- **Severity**: MAJOR (responsive bug; contradicts documented single-submit design)
- **File**: `src/components/checkout/checkout-summary.tsx:153-165` (in-card submit) vs `src/components/checkout/sticky-checkout-bar.tsx:32` (`lg:hidden`)
- **Problem**: The sticky bar is correctly `lg:hidden` (visible only `<lg`). But the in-card `<Button type="submit" data-testid="checkout-submit">` is rendered whenever `showSubmit` is true, and `showSubmit` is passed `true` unconditionally (`checkout-flow-client.tsx:155`). There is **no `lg:` visibility class** on the in-card button or its column. So below `lg` BOTH `checkout-submit` (in-card) and `checkout-submit-sticky` are present and active. The docstrings at `checkout-summary.tsx:66` and `sticky-checkout-bar.tsx:9-12` explicitly claim the in-card submit is "`hidden lg:flex` so there is exactly one submit per form" — the code does not implement that claim.
- **Impact**: Two live submit buttons on mobile/tablet (redundant, confusing; both inside one `<form>` so one click still POSTs once, but it is dead/duplicate UI and a false design invariant). QA/e2e targeting `checkout-submit` on mobile interacts with a button the design says shouldn't be there.
- **Suggested Fix**: Add `hidden lg:flex` to the in-card `Button` className (`checkout-summary.tsx:158`), matching the docstring. Keep `showSubmit` for the confirmation reuse case.
- **Status**: FIXED — `checkout-summary.tsx`: in-card submit className is now `cart-press hidden h-11 w-full gap-1.5 text-sm lg:flex`. Below `lg` only the sticky bar submit is present; at `lg+` only the in-card submit. Exactly-one-submit invariant restored. The jsdom `checkout-submit` disabled test still passes (no viewport → element is in the DOM).

### M-3: `aria-live` "discount applied" announcement is emitted with an empty amount
- **ID**: M-3
- **Severity**: MAJOR (a11y — broken announced sentence)
- **File**: `src/components/checkout/checkout-flow-client.tsx:271-273`
- **Problem**: `resolveLiveMessage` returns `interpolate(t.raw("liveRegion.discountApplied"), { amount: "" })`. The es-MX string is `"Código aplicado. Ahorras {amount}."`, so the live region announces **"Código aplicado. Ahorras ."** — the `{amount}` placeholder is filled with `""`. The applied amount is available at `state.discount.discountCents` (the branch already knows `kind === "applied"`) but not passed.
- **Impact**: AT users hear a broken, information-free sentence at the exact moment a discount applies.
- **Suggested Fix**: Narrow on `state.discount.kind === "applied"` and pass `{ amount: formatMXN(state.discount.discountCents) }`.
- **Status**: FIXED — `checkout-flow-client.tsx` `resolveLiveMessage`: the applied branch now interpolates `{ amount: formatMXN(state.discount.discountCents) }` (added the `formatMXN` import). The live region now announces e.g. "Código aplicado. Ahorras $679.90." instead of a bare "…Ahorras ."

### M-4: Focus-first-invalid-field is wired for `email` ONLY
- **ID**: M-4
- **Severity**: MAJOR (a11y / UX-Requirements + error-states table say "focus to first invalid field")
- **File**: `src/components/checkout/checkout-flow-client.tsx:99-103, 135` (and `checkout-fields.tsx:48, 78`, plus `StateField` accepts no ref at all: `checkout-fields.tsx:164-206`)
- **Problem**: `firstInvalidField` is hardcoded `state.fieldErrors?.email ? "email" : null` and the focus effect only calls `emailRef.current?.focus()` when `fieldErrors?.email` exists. If email is valid but postal_code / state / full_name / city is invalid, the error renders but **focus is never moved**; a keyboard/AT user is stranded at the submit button. `StateField` cannot receive focus programmatically because it takes no ref.
- **Impact**: The "focus first invalid field" requirement is half-implemented; most real validation failures (bad CP, missing state) get no focus.
- **Suggested Fix**: Compute the first invalid field in DOM order from `state.fieldErrors`, hand a ref to that field (and give `StateField` a `ref`/`focus` path to its trigger).
- **Status**: FIXED — `checkout-flow-client.tsx`: `firstInvalidFieldInDomOrder(fieldErrors)` walks `FOCUSABLE_FIELD_ORDER` (email → phone → full_name → address1 → address2 → city → postal_code → state) and returns the first with an error. A single `firstInvalidRef` (`FocusableFieldElement = HTMLInputElement | HTMLButtonElement`) is handed to `CheckoutFields`, which attaches it to whichever control matches (`refFor(field)` for inputs; `triggerRef` for the state `SelectTrigger`). `StateField` now accepts `triggerRef` forwarded to the Radix trigger button. The focus effect fires for any invalid field, not just email.

### M-5: `delivery_notes` textarea has no `<label>`
- **ID**: M-5
- **Severity**: MAJOR (a11y — UX-Requirements: "Every input has a visible `<label>`")
- **File**: `src/components/checkout/checkout-fields.tsx:219-228`
- **Problem**: The delivery-notes `<textarea name="delivery_notes">` has only a `placeholder` and sits under the card `<h2>` heading; it has **no associated `<label>`** (no `htmlFor`/`id` pairing, no `aria-label`, no `aria-labelledby`, no `id`). A placeholder is not an accessible name and disappears on input.
- **Impact**: Screen readers announce an unlabeled textarea; fails the "every input has a visible label" requirement.
- **Suggested Fix**: Add `id="checkout-notes"` and a `<label htmlFor="checkout-notes">` mirroring the other fields.
- **Status**: FIXED — `checkout-fields.tsx` `NotesSection`: added `id="checkout-notes"` + `<label htmlFor="checkout-notes">{labels.label}</label>` mirroring the TextField pattern. New `notes.label` i18n key added to BOTH locales ("Notas de entrega" / "Delivery notes"), wired through `CheckoutFieldLabels.notes.label` + `use-checkout-labels.tsx`.

### M-6: Sequential, enumerable order numbers expose full PII on the confirmation page
- **ID**: M-6
- **Severity**: MAJOR (data exposure / IDOR — already flagged for Security stage, but live here)
- **File**: `src/app/[locale]/checkout/confirmacion/[orderNumber]/page.tsx:40` + `src/lib/checkout/order-read.ts:44-53` + `supabase/migrations/0008_checkout.sql:29,171-172`
- **Problem**: Order numbers are `PP-000001`, `PP-000002`, … from `order_number_seq` — trivially enumerable. `getOrderByNumber` looks up purely by `order_number` with no secret/token, and the confirmation page renders full name, address line 1/2, city, state, CP, email, phone, delivery notes (`page.tsx:180-194`). Anyone can walk `/checkout/confirmacion/PP-000001…N` and harvest every customer's PII.
- **Impact**: Mass PII disclosure (name, full address, email, phone) with zero auth — a classic BOLA/IDOR. `dev-done.md` documents it as a known follow-up "flagged for Security," but the exposed code ships now.
- **Suggested Fix**: Add an unguessable token column (e.g. `orders.confirmation_token uuid default gen_random_uuid()`), route the confirmation by that token (not the sequential number), look up by token. The order number can still be *displayed*. (Security stage owns the fix; recorded here so it is not lost.)
- **Status**: FIXED (in full, not deferred) — end-to-end opaque-token mitigation:
  - **Migration 0008** (local-only, idempotent — amended per ticket authorization): `alter table orders add column if not exists confirmation_token uuid not null default gen_random_uuid()` + unique index `orders_confirmation_token_key`. The `create_order` RPC now `returning id, confirmation_token` and returns `confirmation_token` in its jsonb (both fresh + idempotent-reuse branches).
  - **Types**: `CreateOrderResult.confirmation_token: string`; `orders` Row/Insert/Update carry `confirmation_token`.
  - **Action** (`actions.ts`): `createOrderViaRpc` returns `data.confirmation_token`; success state carries `confirmationToken` (replaces `orderNumber`).
  - **Form-state**: `confirmationToken?: string` (was `orderNumber`).
  - **Config**: `confirmationPath(confirmationToken)` builds the URL from the TOKEN; docs updated.
  - **Read** (`order-read.ts`): `getOrderByToken(token)` — rejects a non-UUID before any DB hit, looks up by `confirmation_token`. `order_number` is still returned for DISPLAY only.
  - **Route**: dynamic segment renamed `[orderNumber]` → `[token]`; page reads `token`, calls `getOrderByToken`, still displays `#PP-…`.
  - **Verified live** (prod build): valid token → 200 (renders order); malformed UUID token → 404; the sequential `PP-000003` value → 404 (no longer an entry point). RPC smoke: happy path returns a token, idempotent re-call returns the SAME token (`reused:true`), out-of-stock rolls back (stock unchanged, 0 orders). Security stage may still review, but the IDOR is closed now.

---

## Minor Issues (NICE TO FIX)

### m-1: Line/summary totals do not "refresh to live price" on price-drift (edge 1 partial)
- **File**: `src/components/checkout/checkout-summary.tsx:221-244`, `checkout-flow-client.tsx:105-111`
- **Problem**: On `price-changed` the per-line note shows the live price via `liveUnitPrices`, but the line total, subtotal, and grand total continue to render the **stale snapshot** price (the summary is built from `buildSummaryLines(lines)`, i.e. the client cart). Ticket edge 1 and the error-states table say "totals refresh to live price." Only a per-line note is shown; the numbers do not update until the cart line itself is edited.
- **Suggested Fix**: When `liveUnitPrices[key]` is present, recompute the line/summary totals from the live price (display only; the server remains authoritative). Or spec this as a documented deviation.
- **Status**: FIXED — new pure helper `applyLivePrices(lines, liveUnitPrices)` in `checkout-helpers.ts` recomputes each drifted line's unit + line total from the live price and rolls up the subtotal. In `checkout-flow-client.tsx`, when `state.status === "price-changed"` the summary + sticky bar now render the live-adjusted lines/subtotal/shipping/total (display only; server stays authoritative and already blocked the submit), matching ticket edge 1. Every other state renders the cart snapshot unchanged.

### m-2: Discount TOCTOU — RPC re-increments but does not re-check `is_active`/window/min
- **File**: `supabase/migrations/0008_checkout.sql:150-159`
- **Problem**: The RPC's redemption step only re-checks the redemption cap (`times_redeemed < max_redemptions`); it does not re-verify `is_active`, the `starts_at`/`ends_at` window, or `min_subtotal_cents`. Between the action's `fetchDiscountCode`/`applyDiscount` and the RPC, a code could be deactivated/expired yet still be applied and still increment `times_redeemed`. The eligibility snapshot is trusted from the action.
- **Suggested Fix**: Accept the small window as documented, or pass the eligibility snapshot to the RPC and re-assert `is_active` + window in the `UPDATE ... WHERE` guard.
- **Status**: FIXED — 0008 RPC redemption `UPDATE` now re-asserts `is_active AND (starts_at is null or starts_at <= now()) AND (ends_at is null or ends_at >= now())` in addition to the cap. A code deactivated/expired between the action's snapshot and commit → 0 rows → `DISCOUNT_EXHAUSTED` → graceful degrade (AC-7). `min_subtotal_cents` intentionally NOT re-checked (the action already clamped the discount to the validated subtotal; a live-subtotal recompute could reject a legitimate application) — documented in the SQL comment as an accepted gap. Smoke-verified: active code applies, expired code (window) rejected, exhausted code (cap) rejected — all rolled back.

### m-3: `upper(code)` redemption match can touch multiple rows / no functional-unique guard
- **File**: `supabase/migrations/0008_checkout.sql:151-154`
- **Problem**: `where upper(code) = upper(v_discount_code)` is not backed by a case-insensitive unique index; `code` is only case-sensitively unique. If both `abc` and `ABC` ever existed, the increment would hit both rows. Currently safe (seed + `normalizeDiscountCode` store upper-case), but the invariant is app-enforced, not DB-enforced.
- **Suggested Fix**: Add `unique index on discount_codes (upper(code))` (or a normalized column) so the match is provably single-row.
- **Status**: FIXED — 0008 adds `create unique index if not exists discount_codes_upper_code_key on discount_codes (upper(code))`. The redemption match is now DB-provably single-row (no longer only app-enforced). Applied to local Docker.

### m-4: Displayed total is computed from the client cart snapshot (display-trust)
- **File**: `src/components/checkout/checkout-flow-client.tsx:105-108`
- **Problem**: `subtotal`, `shipping`, and `total` shown in the summary + sticky bar are computed client-side from `useCart()` lines, not from server-validated prices; only `discountCents` is server-authoritative. Acceptable (the server recomputes and returns `price-changed`/`out-of-stock`), but the pre-submit total is not authoritative and can briefly mislead. Overlaps m-1.
- **Status**: SKIPPED (accepted deviation) — the pre-submit total is an intentional client estimate; the server is the boundary (re-reads live price/stock, returns `price-changed`/`out-of-stock`, never sells at the client total). With m-1 fixed the drift case now visibly refreshes to live prices, closing the one state where it could mislead. Making the whole pre-submit total server-authoritative would require a round-trip on every cart change, contradicting the single-`<form>` server-action design. No behavior corruption.

### m-5: State picker is Radix `Select`, not a native `<select>` (AC-4 / UX deviation)
- **File**: `src/components/checkout/checkout-fields.tsx:185-202`
- **Problem**: UX-Requirements name "a native `<select>` (or accessible combobox)". The vendored shadcn/Radix `Select` + hidden input is keyboard-accessible and `aria-invalid`/`aria-describedby` are wired on the trigger, so it satisfies the "or accessible combobox" clause — but it forgoes the native mobile OS wheel picker for a 32-item list. Documented in the ui-design decision; noting as an allowed deviation.
- **Status**: SKIPPED (allowed deviation, ui-design.md) — satisfies the "or accessible combobox" clause of AC-4; keyboard + `aria-invalid`/`aria-describedby` wired, and now also focusable via the new `triggerRef` (M-4). Changing to a native `<select>` is a UX-stage design call, not a correctness fix.

### m-6: `noValidate` disables all native client validation
- **File**: `src/components/checkout/checkout-flow-client.tsx:122`
- **Problem**: `noValidate` means `required`/`type=email`/`maxLength` never trigger native browser validation; every failed attempt is a full server round-trip with no instant client feedback. Intentional (server-action pattern), noted for UX.
- **Status**: SKIPPED (intentional) — the server action is the single validation boundary (server re-runs `validateAddress`); native browser bubbles would fight the field-scoped localized errors + focus-first-invalid the design relies on. Consistent with the Q&A form precedent.

### m-7: `contact_phone` uses `inputMode="numeric"` (blocks `+`)
- **File**: `src/components/checkout/checkout-fields.tsx:84-85`
- **Problem**: `type="tel"` + `inputMode="numeric"` presents a digits-only keypad, so a user cannot type a leading `+` (E.164). Phone is optional/unshaped, so low impact; consider `inputMode="tel"`.
- **Status**: FIXED — `contact_phone` now uses `inputMode="tel"` (the tel keypad includes `+`/`*`/`#`), so a leading `+` for E.164 is typeable.

---

## Nits (NIT)

- **n-1 Dead i18n copy** (defined in both locales, referenced nowhere): `checkout.discount.apply`, `checkout.discount.checking` (validate-on-submit has no Apply/checking button), `checkout.banner.dismiss`, `checkout.banner.retry` (the `GlobalBanner` renders no dismiss/retry action — note the UX-Requirements ask for "a recovery action (retry / review your cart)" in the global-error banner, so `retry` being unused may indicate that requirement is unimplemented, not just dead copy), and `checkout.summary.itemsCount` (summary uses `itemQuantity`). Delete or wire up. `src/messages/{es-MX,en}.json`.
  - **Status**: PARTIALLY FIXED — deleted the 5 dead keys from BOTH locales (`discount.apply`, `discount.checking`, `banner.dismiss`, `banner.retry`, `summary.itemsCount`); locales remain symmetric (i18n symmetry test green). The UX-Requirements "recovery action in the global-error banner" is a genuine UX gap, NOT dead copy — deferred to the UX stage (Stage 8) to design/wire the banner recovery action rather than resurrect an unused key here.
- **n-2 Money math / floats**: PASS. All arithmetic is integer cents; `assembleOrder` (`order.ts:61-92`) re-clamps discount to `[0, subtotal]` and computes `total = subtotal + shipping + tax − discount` matching `orders_total_identity`; `formatMXN` throws on non-integer (safe guard). No float anywhere.
- **n-3 Strict TS**: PASS. No `any`, no non-null `!`, no unsafe casts in production files (one `as Record<string, unknown>` is test-only, `checkout-summary.test.tsx`). Unions (`DiscountResult`/`ShippingResult`/`CheckoutStatus`) exhaustively handled.
- **n-4 Motion**: PASS (review-animations STANDARDS). No new motion CSS or inline `transition`/`animation`; reuses only `.enter-fade / .stagger / .price-value / .cart-press / .cart-step-press / .grid-pending / .select-content-motion`. Enter uses `ease-out`; the only inline style is `transitionDelay` on `.stagger` (a delay, not a new transition; globals force it to 0 under `prefers-reduced-motion`). Compositor-friendly (opacity/transform only).
- **n-5 SQL injection / privilege**: PASS. The RPC takes a single `jsonb`, extracts via `->>` and casts (`::uuid`, `::integer`) — no dynamic SQL, no concatenation into SQL. `SECURITY DEFINER` with `set search_path = ''` and all objects schema-qualified (`public.*`, `pg_catalog` builtins). `execute` revoked from `public`, granted to `service_role` only. Immutability trigger is UPDATE-only, does not interfere with the INSERTs.
- **n-6 Idempotency correctness**: PASS. Key is a client UUID under a partial-unique index; short-circuit returns only `{order_number, order_id, reused}` (no PII), keyed to the caller's own key. Concurrent same-key calls: both pass the pre-insert `select`, both decrement, the second fails the unique index and the whole txn (incl. its decrement) rolls back → single order, no double-decrement. `readIdempotencyKey` regenerates when the client value isn't a UUID (safe fallback).
- **n-7 React keys**: PASS/NOTE. `SummaryLine key={line.key}` is stable. Confirmation `OrderSummaryCard` uses `key={index}` (`confirmacion/.../page.tsx:120`) — acceptable there (a frozen immutable order snapshot that never reorders), but prefer a stable field if available.

---

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | Non-empty `/checkout` renders full flow via `computeShipping`/`totalCents` | PASS | `checkout-flow-client.tsx:106-108`, `checkout-summary.tsx`, `page.tsx` |
| AC-2 | Empty cart → empty-state + `CATALOG_PATH`; no zero-line order | PASS | `checkout-flow-client.tsx:52-60` + `actions.ts:195-198` (server empty guard) |
| AC-3 | Server `getStoreSettingsStatic()`, cents prop-drilled, three-state shipping | PASS | `page.tsx`, `checkout-summary.tsx:254-273` (flat/free/unavailable) |
| AC-4 | CP `/^\d{5}$/` + 32-state closed list, field-scoped, re-run on server | PASS (a11y wiring broken, M-1) | `config.ts:438-490`, `address.ts:177-186`; 32 states verified (31 + CDMX) |
| AC-5 | Email + required trimmed; optionals bounded; pure + re-run on server | PASS | `address.ts:128-199`; server calls `validateAddress` at `actions.ts:189` |
| AC-6 | Server discount validation + %/fixed application clamped ≤ subtotal | PASS | `discount.ts:75-109`, `checkout-read.ts:266-294`, `actions.ts:296-312` |
| AC-7 | Bad code → friendly note, proceeds at full price, never blocks | PASS | `resolveDiscount` never throws; `discount-code-field.tsx:143-156` |
| AC-8 | Server re-reads live product/variant by id; active + live price + stock | PASS | `checkout-read.ts:147-257` (ignores snapshot price, validates UUID + variant-belongs-to-product) |
| AC-9 | Single-transaction guarded decrement + inserts; last-unit race; no negative | PASS | `0008_checkout.sql:112-146` (`WHERE stock >= qty`, zero rows → raise → rollback) |
| AC-10 | `sales_count += qty` in same transaction | PASS | `0008_checkout.sql:143-145` |
| AC-11 | customers + orders(pending_payment/pending, unique #, full snapshot, tax=0) + items + status_history | PASS | `0008_checkout.sql:161-226`; satisfies every 0003 CHECK |
| AC-12 | All commerce writes via `createAdminClient` (server-only) | PASS | `actions.ts:364`, `checkout-read.ts:18-19`, `order-read.ts:12-13`; RPC granted service_role only |
| AC-13 | Confirmation shows #, summary, shipping, "no payment yet"; cart cleared | PASS (but M-6 PII exposure) | `confirmacion/.../page.tsx`, `order-confirmation.tsx` |
| AC-14 | Double-submit → single order / no double-decrement | PASS | idempotency key + partial-unique index; `0008_checkout.sql:98-110`; `useIdempotencyKey` |
| AC-15 | Every tunable a named documented `config.ts` constant; tax=0 written | PASS | `config.ts:406-558` (all constants + HOW-TO-SWAP block) |
| AC-16 | `checkout` namespace both locales; `formatMXN` only; integer cents | PASS (dead keys n-1) | 89 keys es == 89 keys en, symmetric; all money via `formatMXN` |

All 16 ACs functionally met. AC-4/AC-13 carry the M-1 and M-6 defects above.

## Edge Case Verification

| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Price drift snapshot ≠ live | PARTIAL | `detectPriceDrift` aborts + per-line note (`actions.ts:141-156`), but totals do NOT refresh to live price (m-1) |
| 2 | Last-unit race / oversell | HANDLED | Guarded `UPDATE ... WHERE stock >= qty` → rollback (`0008:124-139`); RPC error → `out-of-stock` (`actions.ts:384-389`) |
| 3 | Cart emptied in another tab | HANDLED | `parseSubmittedLines` empty → `status:"error"` + client empty-state (`actions.ts:195-198`) |
| 4 | Tampered snapshot | HANDLED | server ignores snapshot price, clamps qty, UUID-validates ids, variant-belongs-to-product (`checkout-read.ts`, `actions.ts:88-117`) |
| 5 | `store_settings` unavailable | HANDLED | `computeShipping` → unavailable → `status:"shipping-unavailable"`, submit disabled (`actions.ts:267-269`, `checkout-flow-client.tsx:109`) |
| 6 | Discount > subtotal | HANDLED | clamped in both `applyDiscount` and `assembleOrder` (`discount.ts:104`, `order.ts:76`) |
| 7 | Double-submit / retry | HANDLED | idempotency key + button disabled while pending (`useIdempotencyKey`, `submitDisabled`) |
| 8 | DB CHECK rejection | HANDLED | `assembleOrder` unit-tested to identity; residual → generic `error`, raw PG logged not echoed (`actions.ts:398-399`) |

## Quality Score: 8/10

Excellent backend/security/money engineering (the genuinely dangerous parts are
right). Held back by a systematic field-error accessibility bug (M-1), a
responsive double-submit-button regression that contradicts its own docs (M-2),
three more a11y defects (M-3, M-4, M-5), a partial edge-1 implementation (m-1),
and a live PII-enumeration exposure (M-6, already routed to Security).

## Recommendation: APPROVE-WITH-FIXES

The write path is safe to build on; nothing here corrupts data or oversells.
Fix the six MAJORs before the human-review gate — M-1 (duplicate id / broken
`aria-describedby`), M-2 (two live submit buttons `<lg`), M-3 (empty live-region
amount), M-4 (focus first invalid field), M-5 (unlabeled textarea), and M-6 (PII
enumeration — coordinate with Security stage). The MINORs (esp. m-1 totals
refresh, m-2 discount TOCTOU) should follow. This remains subject to the
BUILD_PLAN rule-3 HUMAN-REVIEW GATE regardless of any later SHIP verdict.

---

## Stage 6 (ultrafix) Resolution Summary

| ID | Sev | Title | Status | Key change |
|----|-----|-------|--------|------------|
| M-1 | MAJOR | Duplicate id / broken aria-describedby | FIXED | `errorId="<id>-error"` on every field |
| M-2 | MAJOR | Two live submit buttons `<lg` | FIXED | in-card submit `hidden lg:flex` |
| M-3 | MAJOR | Empty live-region amount | FIXED | `formatMXN(discountCents)` interpolated |
| M-4 | MAJOR | Focus-first-invalid email-only | FIXED | DOM-order first-invalid + `StateField` `triggerRef` |
| M-5 | MAJOR | Unlabeled notes textarea | FIXED | `<label htmlFor="checkout-notes">` + `notes.label` i18n |
| M-6 | MAJOR | Enumerable order # → PII IDOR | FIXED | `confirmation_token` column + RPC + token-routed page |
| m-1 | MINOR | Totals don't refresh on drift | FIXED | `applyLivePrices` on `price-changed` |
| m-2 | MINOR | Discount TOCTOU | FIXED | RPC re-asserts `is_active` + window |
| m-3 | MINOR | `upper(code)` multi-row risk | FIXED | `unique index (upper(code))` |
| m-4 | MINOR | Client-snapshot total | SKIPPED | accepted deviation (server authoritative) |
| m-5 | MINOR | Radix Select vs native | SKIPPED | allowed deviation (accessible combobox) |
| m-6 | MINOR | `noValidate` | SKIPPED | intentional server-action pattern |
| m-7 | MINOR | `inputMode="numeric"` blocks `+` | FIXED | `inputMode="tel"` |
| n-1 | NIT | Dead i18n copy | PARTIAL | 5 dead keys deleted; banner recovery-action → UX stage |

**Tally**: MAJOR 6/6 FIXED · MINOR 5/7 FIXED, 2 justified SKIPs (both accepted deviations, no behavior corruption) · NIT n-1 dead copy removed.

**Verification**: `tsc --noEmit` clean · `eslint` clean · `vitest` 811/811 pass · `next build` clean (both locales, route now `/[locale]/checkout/confirmacion/[token]`). Migration 0008 (amended: `confirmation_token`, discount `upper(code)` unique index, hardened redemption guard) re-applied to local Docker + reseeded. RPC smoke (in rolled-back txns): happy path returns `confirmation_token`; idempotent re-call returns the same token + `reused:true`; out-of-stock raises `OUT_OF_STOCK` with full rollback (stock unchanged, 0 orders); discount active/expired/exhausted behave correctly. Live prod-server confirmation: valid token 200, malformed token 404, sequential `PP-000003` 404. Smoke data cleaned; DB left seeded.

**Note**: T7 checkout remains subject to the BUILD_PLAN rule-3 HUMAN-REVIEW GATE. M-6 is closed in code but the Security stage may still audit the token scheme.
