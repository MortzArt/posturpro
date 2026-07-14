# QA Report: T7 — Checkout & Order Creation

Stage 7 (ultraqa). Full-cycle pipeline. Verdict basis: comprehensive unit,
component, integration (live local Docker Supabase), and production-build e2e
coverage of every AC and every edge case.

## Test Suite Summary

| Type | Written (new) | Passed | Failed | Skipped |
|------|---------------|--------|--------|---------|
| Unit + Component | 104 | 104 | 0 | 0 |
| Integration (live DB) | 25 | 25 | 0 | 0 |
| E2E (prod build, ×2 projects) | 24 (12×2) | 24 | 0 | 0 |
| **New total** | **153** | **153** | **0** | **0** |

Full-suite regression status:
- **Unit/component**: 915 passed / 915 (was 811 baseline → +104). 46 files, 0 fail.
- **Integration**: 135 passed / 135 (11 files, 0 fail). Runs against a reset+seeded local Docker Supabase.
- **E2E checkout**: 24/24 green across `chromium` + `mobile (Pixel 7)`, run twice consecutively for determinism.
- **E2E full suite**: the pre-existing, documented `getByTestId('breadcrumbs'/'product-gallery') resolved to 2 elements` strict-mode flake in the T3/T4 `product-detail.spec.ts` / `catalog.spec.ts` fires non-deterministically under parallel load with `retries:0` (a different subset fails each run; each fails in isolation on the mobile project only). This is a pre-existing PDP-spec selector bug (dual breadcrumb navs), NOT introduced by T7, and matches the binding T6 QA infra note verbatim. `checkout.spec.ts` has ZERO failures in every run.

## Tests Written

### Unit / Component Tests (Vitest + RTL)
- `src/lib/checkout/address.test.ts` (+37): all 32 Mexican states accepted (parametrized), state list is exactly 32 + no dupes, wrong-casing/whitespace handling, CP 5-digit boundary (5 ok / 6 rejected / leading-letter rejected / whitespace-trimmed), required-field max-length boundaries, delivery-notes/address-line2/RFC/phone caps at their exact limits, and "reports EVERY invalid field at once".
- `src/lib/checkout/discount.test.ts` (+8): redemption-cap boundary (`< max` applies, `== max` exhausted), min-subtotal boundary (`>= min`), `ends_at` instant boundary, applied-outcome preserves the stored upper-cased code, fixed_amount == subtotal clamp (total→0), and `normalizeDiscountCode` case-insensitive normalization.
- `src/lib/checkout/order.test.ts` (+5): flat-rate shipping charge, defensive `unavailable`→0 (no $NaN), full identity with shipping AND clamped discount together, no-variant line totals.
- `src/components/checkout/checkout-helpers.test.ts` (NEW, 14): `buildSummaryLines` (variant/no-variant keying, order, empty), `buildLinesPayload` (ids+qty only, never the snapshot price), `buildSnapshotPrices`, and `applyLivePrices` (m-1 drift refresh up/down, untouched non-drift lines, undefined/empty map).
- `src/components/checkout/discount-code-field.test.tsx` (NEW, 13): idle/applied-pill/savings, every invalid reason message + `aria-invalid`, muted degraded note, remove clears the code, disabled while pending, and "never renders a submit-blocking control" (AC-7).
- `src/components/checkout/checkout-fields.test.tsx` (NEW, 13): every input labeled, **M-5** notes `<label>` association, **m-7** `inputMode=tel`, CP `inputMode=numeric`+maxlength 5, **M-1** distinct `checkout-<field>-error` ids + `aria-describedby` resolution + no describedby on clean fields, state Select trigger error wiring, and **M-4** first-invalid focus ref plumbing to inputs AND the state Select `<button>` trigger.
- `src/components/checkout/checkout-flow-client.test.tsx` (NEW, 7): empty-state (AC-2/edge 3) with catalog CTA + no form, populated body renders form/summary/sticky bar, flat & free shipping totals via `computeShipping`/`totalCents` (no $NaN), **M-2** exactly one in-card `checkout-submit` + one `checkout-submit-sticky` with the `hidden lg:flex` / `lg:hidden` classes, polite live region, and shipping-unavailable → both submits disabled (edge 5).
- `src/components/checkout/checkout-states.test.tsx` (NEW, 5): empty-state CTA href, aria-hidden skeleton with title (loading), sticky-bar total + submit label + pending state + `lg:hidden`.

### Integration Tests (live local Docker Supabase, service-role client)
- `tests/integration/checkout-rpc.integration.test.ts` (NEW, 11): the atomic `create_order` RPC end-to-end — happy path (customer+order+items+status-history written, stock −qty, `sales_count` +qty, `confirmation_token` uuid returned, `pending_payment`/`pending`, tax=0, currency MXN); idempotency (same key → same order, `reused:true`, no double decrement); zero-stock line raise + FULL rollback (0 orders, stock stays 0); multi-line rollback (one OOS line rolls back the other's decrement+sales bump); **last-unit race** (two concurrent calls, exactly one wins, stock lands at 0, never negative); discount redemption increment for an active code; `DISCOUNT_EXHAUSTED` + rollback for exhausted AND expired codes (m-2 RPC re-assert of `is_active`+window); DB total-identity CHECK backstop + rollback (edge 8); required non-empty idempotency key; and anon-role execute denied (AC-12).
- `tests/integration/checkout-read.integration.test.ts` (NEW, 12): the server trust boundary — `revalidateLines` (validates an in-stock line to the LIVE price/label, flags zero-stock + over-qty as out-of-stock, marks tampered non-UUID / non-existent product / variant-not-belonging-to-product as `unavailable`, edge 4/AC-8); `fetchDiscountCode` (case-insensitive lookup, null for unknown/empty, never throws, AC-6/7); and **`getOrderByToken`** (reads the full order by token; returns `null` for a malformed token AND for the sequential `PP-…` order number AND for an unknown uuid — the M-6 IDOR fix verified against a real order).
- `tests/integration/seed.integration.test.ts` (+2, and 1 fixed): asserts the 5 T7 discount codes are seeded, exactly one zero-stock variant exists, and **fixed the stale count** (variants 69→70, images 99→100) that the T7 seed addition invalidated.

### E2E Tests (Playwright, PRODUCTION build + `next start`, separate `.next-t7-qa`, local Docker Supabase)
`e2e/checkout.spec.ts` (NEW, 12 tests × chromium + mobile):
- empty-cart guard → empty-state + catalog CTA, no form (AC-2, edge 3).
- non-empty render → fields + summary + flat-rate totals ($8,999 + $500 = $9,499), no $NaN (AC-1, AC-3).
- empty-form submit → field-scoped error, stays on `/checkout` (AC-4, AC-5).
- bad CP + missing state → both field errors (AC-4).
- invalid discount code → proceeds to confirmation at full price (AC-7).
- valid `AHORRA10` → 10% ($899.90) discount row on confirmation (AC-6).
- tampered zero-stock line (real ids read via anon REST) → out-of-stock banner, no order (AC-8, AC-9, edge 2/4).
- happy path → redirect to `/checkout/confirmacion/<uuid-token>` (NOT `PP-…`, M-6), order number displayed, total, shipping name, cart badge cleared, keep-shopping CTA (AC-11, AC-13, AC-14).
- `PP-000001` sequential number → HTTP 404 (IDOR closed, M-6).
- malformed token → HTTP 404 (M-6).
- English `/en/checkout` renders + places an order (AC-16).
- 375px: no horizontal overflow, sticky bar owns submit.

## Acceptance Criteria Coverage

| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| AC-1 | `/checkout` (+`/en`) renders full flow via `computeShipping`/`totalCents` | e2e "checkout renders"; flow-client "renders form/summary/sticky", "flat/free totals" | PASS |
| AC-2 | Empty cart → empty-state + `CATALOG_PATH`; no zero-line order | e2e "empty cart guard"; flow-client "empty state"; states "CheckoutEmptyState" | PASS |
| AC-3 | Server settings → three-state shipping (flat/free/unavailable) | e2e "flat-rate totals"; flow-client "free shipping", "shipping unavailable"; summary three-state | PASS |
| AC-4 | CP `/^\d{5}$/` + 32-state closed list, field-scoped, re-run on server | address (32 states + CP boundaries); fields "CP inputMode/maxlength"; e2e "bad CP + missing state" | PASS |
| AC-5 | Email + required trimmed; optionals bounded; pure + server re-run | address (required/optional bounds, "reports every invalid field"); e2e "empty form" | PASS |
| AC-6 | Server discount %/fixed application clamped ≤ subtotal | discount (percentage/fixed/clamp/boundaries); checkout-read `fetchDiscountCode`; rpc "increments times_redeemed"; e2e "AHORRA10" | PASS |
| AC-7 | Bad code → friendly note, proceeds at full price, never blocks | discount-code-field (every invalid reason + "never blocks"); e2e "invalid code proceeds" | PASS |
| AC-8 | Server re-reads live variant by id; active + price + stock | checkout-read `revalidateLines` (live price, OOS, over-qty, tamper); e2e "tampered zero-stock" | PASS |
| AC-9 | Single-tx guarded decrement + inserts; last-unit race; no negative | rpc (happy, OOS rollback, multi-line rollback, **last-unit race**, stock=0 floor) | PASS |
| AC-10 | `sales_count += qty` in same transaction | rpc "happy path" (sales_count assertion + restore) | PASS |
| AC-11 | customers+orders(pending/pending, unique #, snapshot, tax=0)+items+history | rpc "happy path" (all rows + status/tax/currency asserted); e2e confirmation | PASS |
| AC-12 | All commerce writes via admin/service_role client | rpc "anon denied"; RPC granted service_role only (constraints/rls-matrix suites) | PASS |
| AC-13 | Confirmation #, summary, shipping, "no payment yet"; cart cleared | e2e "happy path" (number/total/shipping/badge-cleared/CTA); checkout-read `getOrderByToken` | PASS |
| AC-14 | Double-submit → single order / no double-decrement | rpc "idempotency" (same order, reused:true, single decrement); flow-client idempotency-key host | PASS |
| AC-15 | Every tunable a named documented `config.ts` constant; tax=0 written | address/discount/order import the config constants; rpc asserts tax=0/tax_base=0 | PASS |
| AC-16 | `checkout` namespace both locales; `formatMXN` only; integer cents | e2e "English /en"; summary/flow-client/states "no $NaN"; all money via `formatMXN` | PASS |

**All 16 ACs have ≥1 passing test.**

## Edge Case Coverage

| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Price drift snapshot ≠ live | checkout-helpers `applyLivePrices` (m-1 refresh); summary "price-changed line"; drift path in action | PASS |
| 2 | Last-unit race / oversell | rpc "last-unit race" (1 wins/1 rolls back), "zero-stock rollback"; e2e "tampered zero-stock" | PASS |
| 3 | Cart emptied in another tab | flow-client "empty state" (hydrated+no lines); e2e "empty cart guard" | PASS |
| 4 | Tampered snapshot (price/qty/id) | checkout-read `revalidateLines` (non-UUID/non-existent/variant-mismatch); helpers "payload omits price"; e2e "tampered zero-stock" | PASS |
| 5 | `store_settings` unavailable | flow-client "shipping unavailable → submit disabled, no $NaN"; order "defensive unavailable→0" | PASS |
| 6 | Discount > subtotal | discount "clamp fixed to subtotal"; order "clamp over-large / negative" | PASS |
| 7 | Double-submit / retry | rpc "idempotency"; flow-client idempotency-key regeneration on new submissionId | PASS |
| 8 | DB CHECK rejection | rpc "total-identity CHECK backstop + rollback"; order "identity math" | PASS |

**All 8 edge cases have ≥1 passing test.**

## Bugs Found & Fixed
- **Stale seed-count test (test bug, fixed).** `tests/integration/seed.integration.test.ts` still expected 69 variants / 99 images; the T7 seed addition (zero-stock variant + its cover image) legitimately makes it 70 / 100. Updated the expected counts and ADDED coverage that the change was intentional (5 discount codes seeded, exactly one zero-stock variant).
- **`count()` helper type union (test bug, fixed).** The seed-test helper's table union excluded `discount_codes`; added it so the new discount-count assertion type-checks (`tsc` clean).
- **No production code bugs found.** The write path (RPC atomicity/rollback/idempotency, live re-validation, discount clamp, DB-CHECK alignment, M-6 IDOR token) behaves exactly as specified under live-DB integration and prod-build e2e. The Stage-6 MAJOR fixes (M-1..M-6) and MINORs (m-1/m-2/m-3/m-7) all carry explicit regression-lock tests and hold.

## Notes on Test Infrastructure
- E2E ran against a **production build** (`NEXT_QA_DIST_DIR=.next-t7-qa`), a separate dist dir from dev's `.next` (never shared), on `next start -p 3000`, against local Docker Supabase with the well-known public local keys. The QA build dir was removed and the DB reset+seeded afterward — the user's Docker Supabase is left cleanly seeded (0 orders/customers, Milano Negro stock=8, AHORRA10 redeemed=0).
- **E2E stock note (for downstream/Verify):** each order-placing e2e test writes a REAL order that decrements the finite seed stock (~8 orders per full checkout-spec run against the Negro base variant). A single suite run is safe on a fresh seed; running the checkout spec repeatedly without reseeding will eventually deplete the default variant and disable its add-to-cart (surfacing as `toBeEnabled` timeouts in `gotoPDP`). This is a fixture-lifecycle property of live-order e2e, not a code or test defect — **reseed (or `supabase db reset` + seed) before an authoritative e2e run.** Two consecutive runs on a stock-restored DB were both 24/24 green.

## Confidence: HIGH

Every AC and every edge case has at least one passing test; the dangerous parts
(atomicity, last-unit race, idempotency, snapshot-untrust, discount clamp, DB
CHECKs, M-6 IDOR) are verified against a LIVE database and a production build, not
just mocks. The Stage-6 MAJOR/MINOR fixes are regression-locked. `tsc` clean,
`eslint` clean, 915 unit + 135 integration + 24 checkout e2e all green. The only
red in the full e2e suite is a pre-existing, documented T3/T4 PDP-spec flake
unrelated to T7.

## Verdict (QA perspective): SHIP

From QA's perspective T7 is shippable. **This remains subject to the BUILD_PLAN
rule-3 HUMAN-REVIEW GATE** — checkout is always flagged for human review before
merge regardless of any pipeline SHIP verdict; the Verify stage must surface this
and must NOT auto-merge.

## Untested Areas
- **`placeOrder` server action wiring end-to-end in isolation** — the action's
  orchestration is covered transitively by the prod-build e2e (which drives the
  real action) and unit-covered at every pure step it composes (`validateAddress`,
  `applyDiscount`, `assembleOrder`, `revalidateLines`, `fetchDiscountCode`,
  `create_order` RPC). A direct unit test of the action would require mocking
  `server-only` + `next-intl/server` + the admin client; the e2e path exercises it
  authentically instead. Risk: LOW.
- **Rate limiting on `placeOrder`** — none exists (documented dev follow-up; the
  atomic RPC + stock floor bound real damage). Out of T7 scope. Risk: LOW.
- **Confirmation-page PII rendering with an authenticated cross-user** — N/A in
  Phase 1 (guest-only, no accounts); the M-6 token is the sole access control and
  is integration+e2e verified. Risk: LOW.
