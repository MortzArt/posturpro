# QA Report: T17 — Admin manual order entry (phone / offline orders)

Standard-tier S5 (QA) — the QUALITY GATE. Scope: `c02dca9` (dev) + `4d564d3` (reviewfix).
Verified INDEPENDENTLY (re-ran every gate; did not trust dev-done / review summaries) and
regressed the whole repo. This feature creates real orders, moves stock, and can mark money
received, so the trust boundary was verified in code AND by explicit new tests.

## Verdict: PASS — confidence HIGH

Zero known bugs. 20/20 ACs covered + passing, 7/7 edges handled + tested. The trust core
(client price never trusted, session-first on all 3 surfaces, idempotency, recipient-safety,
offline-paid without a receipt email, M-1 internal-note round-trip) is proven at unit,
integration, and e2e levels. No T17-caused regression anywhere in the suite.

## Test Suite Summary
| Type        | Ran  | Passed | Failed | Notes |
|-------------|------|--------|--------|-------|
| Unit        | 1985 | 1985   | 0      | was 1982 → **+3** new trust tests this stage |
| Integration | 257  | 257    | 0      | 24 files, full reset+reseed, incl. `admin-orders-manual` |
| E2E         | 3    | 3      | 0      | chromium, warm server (reused :3000) |
| tsc --noEmit | —   | 0 err  | —      | clean |
| eslint       | —   | 0 err  | —      | clean (all T17 files + edited tests) |

## New Tests Added This Stage (+3 unit)
Both target the ONE property that matters most for a money+stock feature — a tampered client
payload cannot change the charged total or oversell — making the trust boundary explicit and
regression-proof (a future dev adding a price field would now fail these).

- **`src/lib/admin/orders/manual-order-form-read.test.ts`** (+2):
  - "does NOT carry line_unit_price_cents into the raw validator input" — injects a hostile
    1-centavo `line_unit_price_cents` into FormData and asserts the raw line the validator
    consumes has EXACTLY `{line_key, line_product_id, line_variant_id, line_qty}` and no price
    property; the tampered value lands ONLY in the display echo (never a charge-driving field).
  - "ignores an injected top-level total / subtotal — no such raw field exists" — asserts a
    forged `total_cents`/`subtotal_cents` never appears in the raw input.
- **`src/lib/admin/orders/manual-order-write.test.ts`** (+1):
  - "charges the LIVE revalidated price, never a client-influenced value" — asserts the
    `create_order` payload's `unit_price_cents`, `line_total_cents`, `subtotal_cents`, and
    `total_cents` are all derived from the `revalidateLines` live line (499900) + the
    admin-confirmed shipping — never from the input.

## Trust-Boundary Verification (task focus #2)
| Property | How proven | Result |
|----------|-----------|--------|
| Client `unit_price` ignored | Structural: `readRawManualOrder` reads only key/pid/vid/qty; `line_unit_price_cents` → display echo only (form-read test + NEW tamper test). Write test: payload price = live revalidated price. | PASS |
| Tampered total can't change charge | `assembleOrder` snapshots totals from live lines; NEW write test contrasts payload totals against input | PASS |
| Oversell prevented | `create_order` guarded decrement `WHERE stock>=qty` (integration: stock decremented exactly once; idempotent replay = one decrement) | PASS |
| Out-of-stock at submit | `revalidateLines` → `line-issues` aborts BEFORE create; write test asserts `rpc` never called | PASS |
| Price-changed since add | `revalidateLines` → `price-changed` w/ live price; abort before create (write test) | PASS |
| Zero lines | `parseLines` → `no-items`; RPC never called (input test) | PASS |
| qty 0 / negative / non-int / >INT4 | `parseLine` integer∈[1,INT4_MAX] (input test, 4 cases) | PASS |
| Unknown product/variant UUID | `parseLine` UUID_PATTERN → `line-invalid` (input test: `../etc`, `not-a-uuid`) | PASS |

## M-1 Regression (internal-note data-loss fix — task focus #3)
| Case | Test | Result |
|------|------|--------|
| Note present → persisted to `order_internal_notes` via `addOrderNote` | write test "inserts the internal note onto the created order" | PASS |
| Blank note → no row | write test "does not insert a note when blank/null" | PASS |
| Double-submit (reused key) → not double-inserted | write test "does NOT re-insert on an idempotent replay (reused:true)" | PASS |
| Note-write failure never rolls back the order | write test "never rolls back the order when the note insert fails" | PASS |
Note is stored in the same `order_internal_notes` table the detail "Notas internas" panel reads
(via `addOrderNote`), so it round-trips to the detail render.

## Payment Paths (task focus #4)
| Path | Assertion | Result |
|------|-----------|--------|
| Pending | leaves `pending_payment`/`pending`; source stamped via direct UPDATE `payment_method='manual'` | PASS (integration + write test) |
| Offline paid | `advance_order_status` payment-only (`p_order_status=null`, `p_payment_status='paid'`, `p_payment_method='manual'`) → `transition_kind='paid'` history row; NO payment-received email | PASS (integration asserts paid + method + kind='paid' row; write test asserts no `sendPaymentReceived`) |
| Both | stock decremented exactly once + order number `PP-XXXXXX` issued | PASS (integration) |

## Email Safety (task focus #5)
| Case | Test | Result |
|------|------|--------|
| Email-less order → placeholder never mailed | recipient + dispatch tests: sentinel/blank/malformed → `{ok:true,sent:false}`, no provider call, no claim | PASS |
| "Sin correo" shown, sentinel never leaked | detail gates on `isMailableAddress`; e2e asserts "Sin correo" visible + "pedido-manual.invalid" count 0 | PASS |
| Later T12 status email (shipped) does NOT throw | dispatch test "skips a later shipped email (benign) — no 500"; integration asserts `resolveCustomerRecipient` → null | PASS |
| Guard transparent for real emails | dispatch "still sends normally when the order has a real email" | PASS |
All 6 customer-facing sends (`sendOrderConfirmation`/`PaymentReceived`/`Shipped`/`Cancelled`/`RefundIssued`/`VoucherInstructions`) route through `resolveCustomerRecipient`.

## Idempotency (task focus #6)
Server-minted key (`normalizeIdempotencyKey` → `randomUUID()` when blank). Integration: a repeat
key returns the original order (`reused:true`) with ONE stock decrement. Write test: `reused:true`
skips the note re-insert. PASS.

## E2E (task focus #7) — warm server, chromium 3/3
Admin login → `/admin/orders` "Nuevo pedido" CTA (`admin-orders-new`) → `/admin/orders/new`
→ picker search "silla" → add first in-stock option → fill EMAIL-LESS contact + shipping →
confirm switch disabled (email blank) → submit pending → lands on detail
`?created=` with `order-created-banner` + `order-source-manual` (☎ Pedido manual / telefónico)
badge + "Sin correo" (no leaked sentinel). Separate test: invalid CP stays on form with
`manual-order-cp-error`, no order created (AC-4). The b7a6b3c no-duplicate-status-badge fix holds:
a pending_payment/pending manual order is exactly the redundant pair `paymentBadgeIsRedundant()`
hides on list rows (unit-tested, 7 cases); the detail header renders both by design.

## Auth (task focus #8)
`requireSession()` is line 1 of the RSC page (`new/page.tsx`), the `createManualOrder` action,
AND the `searchManualOrderCatalog` action — before any DB read/write. It calls the unit-tested
`hasValidAdminSession` (`session-guard.test.ts`) and `redirect()`s to `/admin/login` when absent.
A logged-out request is rejected before any write. Verified in code (all 3 session-first).

## Acceptance Criteria Coverage (20/20)
| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| AC-1 | "Nuevo pedido" CTA, testid | e2e clicks `admin-orders-new` → form | PASS |
| AC-2 | Page + action `requireSession()` first | code: 3 surfaces session-first | PASS |
| AC-3 | Contact + full MX shipping (incl. note persisted) | input test + M-1 write tests | PASS |
| AC-4 | Same MX CP/state rules | input test (cp-invalid, state-invalid) + e2e | PASS |
| AC-5 | Search catalog, variant required, qty≥1 | picker + parseLine; e2e add-via-picker | PASS |
| AC-6 | Live stock + server price at selection | catalog action `variant.price_override_cents ?? product.price_cents` | PASS |
| AC-7 | `revalidateLines` re-verify, abort on issue | write test: rpc not called on issues | PASS |
| AC-8 | Shipping default + override; `assembleOrder` | write test: totals from assembleOrder + admin shipping | PASS |
| AC-9 | Atomic `create_order`; idempotency | integration create + idempotency; write test key | PASS |
| AC-10 | pending_payment/pending, es-MX | integration `pending`; write test `locale='es-MX'` | PASS |
| AC-11 | Email optional; blank creates | input test (blank→null); write test (sentinel) | PASS |
| AC-12 | Confirmation opt-in, gated on valid email | write tests (4 branches) | PASS |
| AC-13 | Recipient-safe skip on all sends | recipient + dispatch tests | PASS |
| AC-14 | `payment_method='manual'` + detail badge | write test stamp; e2e `order-source-manual` | PASS |
| AC-15 | Paid via advance payment-only | integration + write test | PASS |
| AC-16 | No payment-received email on paid | write test: no `sendPaymentReceived` | PASS |
| AC-17 | Appears in list + detail, packing slip | `revalidatePath` + redirect; e2e detail; list-badge unit-tested | PASS |
| AC-18 | Input + write unit tests | present + extended (+3 this stage) | PASS |
| AC-19 | Integration end-to-end | `admin-orders-manual.integration.test.ts` 4 tests green | PASS |
| AC-20 | Admin e2e | `admin-orders-manual.spec.ts` 3/3 warm | PASS |

## Edge Case Coverage (7/7)
| # | Edge | Test | Status |
|---|------|------|--------|
| 1 | Stock race on create | integration guarded decrement; revalidate abort | PASS |
| 2 | Zero-item order | input test `no-items`; RPC never called | PASS |
| 3 | Double / double-submit | integration idempotency (one decrement); write reused skip | PASS |
| 4 | Email absent | sentinel + guard; e2e email-less; integration later-send skip | PASS |
| 5 | Price change mid-entry | write test `price-changed` abort before create | PASS |
| 6 | Invalid quantity | input test (0/neg/1.5/INT4+1) | PASS |
| 7 | Marked-paid + email-less | integration paid + no receipt; recipient guard | PASS |

## Bugs Found & Fixed
None. The S4 ReviewFix pass had already fixed the one real defect (M-1 internal-note data loss),
the multi-word search (M-2), the confirmation-switch honesty (M-3), and the stale config test.
This stage independently re-verified all four hold and added +3 trust-boundary tests to lock in
the most security-critical property.

## Untested Areas (accepted, low risk)
- **Action-level auth rejection test** (a logged-out POST to `createManualOrder`): not added as a
  standalone test — server actions with `"use server"` + `redirect()` are awkward to unit-test in
  isolation, and the guarantee is already strong: `requireSession()` is line 1 of all 3 surfaces,
  delegates to the unit-tested `hasValidAdminSession`, and redirects before any DB call. LOW risk.
- **Optional list source-badge / source filter**: deliberately deferred per ticket (may-defer); the
  required detail badge is present and e2e-verified. No AC affected. LOW risk.

## Environment Notes
- One unit flake observed on the FIRST full run: `checkout/rate-limit.test.ts >
  cardinality-DoS bound` timed out at 5s while tsc+eslint competed for CPU. Confirmed a
  CPU-contention flake — passed 6/6 in isolation (2.15s) and 0 failures on the clean final run
  (1985/1985). NOT a T17 regression.
- e2e reused the warm dev server on :3000 (`reuseExistingServer` local) — avoids the documented
  cold-compile flakiness. The pre-existing prod-build taxonomy 500 (T14-owned) and Pixel-7
  gotoPDP gotchas are out of T17 scope and were not exercised.
