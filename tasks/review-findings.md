# Code Review + Fix: T17 — Admin manual / phone order entry (S4 ReviewFix, standard tier)

## Summary

Single-pass adversarial review + inline fix across all 28 files of commit `c02dca9`. The trust core is genuinely solid — client prices are never trusted (`revalidateLines` is the sole price authority), `requireSession()` guards the RSC page, the create action, AND the catalog-search action; the idempotency key is minted server-side per page load; the AC-13 recipient guard covers all customer sends; the offline-paid path uses `advance_order_status` payment-only with no receipt email; and no XSS surface (React-escaped throughout, no `dangerouslySetInnerHTML`). **One real data-loss bug (M-1), two MAJOR UX/interaction defects (M-2, M-3), and the misdiagnosed config test** were found and fixed inline. 0 critical. Verdict: **APPROVE, 8.5/10** — all critical/major issues fixed in this pass.

## Issues Found & Resolved

### Critical Issues

None.

### Major Issues

#### M-1: "Nota interna" is collected, validated, then silently dropped (data loss)
- **Severity**: MAJOR
- **File**: `src/lib/admin/orders/manual-order-write.ts` (payload build, ~line 166) + form `manual-order-form.tsx:189`
- **Problem**: The form renders a "Nota interna" TextareaField with helper "Solo visible para el equipo; no se envía al cliente." `parseManualOrderInput` validates + bounds it into `input.internalNote`, but the write path NEVER persists it: `create_order` has no note field (confirmed in `0008_checkout.sql` and `CreateOrderPayload`), and internal notes actually live in the separate `order_internal_notes` table (via `addOrderNote`). The admin types a note, submits, the note vanishes with no error — a broken promise + data loss.
- **Impact**: Owner records "cliente pagó en efectivo, entregar el jueves" → note is silently discarded. On a phone-order tool for a non-technical owner, this is a trust-breaking failure.
- **Fix Applied**: Added `maybePersistInternalNote(orderId, internalNote, reused)` post-create step in the write orchestration. Reuses the existing `addOrderNote` (`order_internal_notes` insert) — the same store the detail's "Notas internas" panel reads and `addInternalNote` writes. Skipped when blank; skipped on an idempotent replay (`reused:true`) so a double-submit never double-inserts; failure-isolated (a note-write failure logs but NEVER rolls back the order, matching the paid/email post-create anti-rollback contract). Added 4 unit tests (blank skip, present insert, reused no-insert, failure no-rollback).
- **Status**: FIXED

#### M-2: Space key blocks multi-word catalog search
- **Severity**: MAJOR
- **File**: `src/components/admin/orders/manual-order-line-editor.tsx:212`
- **Problem**: The picker's `onKeyDown` treated both `Enter` and `" "` (Space) as the option-activation key inside a `type="search"` combobox. Since the handler `preventDefault()`s on activation, the admin could not type a space in the search box while the listbox was open — any multi-word query ("faja lumbar", "silla ergonómica") was impossible to type; Space kept adding the active row instead.
- **Impact**: Core search affordance broken for any product whose name/SKU search needs more than one word — directly undermines AC-5 (search catalog by name/SKU).
- **Fix Applied**: Dropped `" "` as an activation key; `Enter` only. Matches the ARIA APG editable-combobox pattern (Enter selects; Space stays a literal character). Comment added explaining why.
- **Status**: FIXED

#### M-3: Confirmation switch could submit "off" while shown "on"
- **Severity**: MAJOR (functionally guarded, but a UX-honesty defect on a money-adjacent action)
- **File**: `src/app/admin/(app)/orders/new/manual-order-form.tsx:288`
- **Problem**: The `send_confirmation` SwitchField is uncontrolled (`defaultChecked`) and only toggles `disabled`. Flow: admin enters a valid email → switches confirmation ON → then edits the email invalid/blank → the switch becomes `disabled` while still visually checked. A disabled checkbox is not submitted → `send_confirmation` reads `false`. The admin believes confirmation is enabled but it silently won't send. (The write layer double-gates on `isMailableAddress`, so no bad-address send ever occurs — the harm is purely the misleading "on" state.)
- **Fix Applied**: Re-key the SwitchField on `emailValid` so it REMOUNTS to unchecked (`defaultChecked={false}`) whenever the email is invalid — the UI never shows "on" while it will submit "off". Seeds from the echoed value only when a valid email is present. Comment added.
- **Status**: FIXED

#### Config test (misdiagnosed as a "pre-existing env flake") — actually a stale test
- **Severity**: MAJOR (a red/failing test the dev-done wrongly attributed to a shell env leak)
- **File**: `src/lib/config.test.ts:74-75`
- **Problem**: dev-done + pipeline-state claimed `config.test.ts WHATSAPP_PHONE_E164` is a "pre-existing env flake / shell WHATSAPP env leak, not T17." That is a **misdiagnosis**. The test hard-codes `expect(WHATSAPP_PHONE_E164).toBe("")` and expects `isWhatsAppConfigured` → `false`, but the source constant `src/lib/config/shared.ts:69` is now `"5215512345678"` (the number enabled earlier). The test fails deterministically because the constant changed — nothing to do with the environment.
- **Fix Applied**: Rewrote the assertion to follow the constant rather than hard-code the empty default: `expect(isWhatsAppConfigured(WHATSAPP_PHONE_E164)).toBe(WHATSAPP_PHONE_E164.length > 0)`. This holds whether the number is set or empty and never goes stale on toggle. Full unit suite is now GREEN (1982/1982, 0 failures) — the "flake" is eliminated.
- **Status**: FIXED

### Minor Issues

#### m-1: Initial `activeIndex` could point at an out-of-stock (aria-disabled) row
- **File**: `src/components/admin/orders/manual-order-line-editor.tsx:120`
- **Fix Applied**: `setActiveIndex(0)` on new results could set `aria-activedescendant` to a non-selectable row. Added `firstSelectableIndex(found)` helper (reuses `flattenTargets`) to highlight the first in-stock target, falling back to 0.
- **Status**: FIXED

#### m-2: Duplicate `@/lib/money` import
- **File**: `src/app/admin/(app)/orders/new/manual-order-form.tsx:9-10`
- **Fix Applied**: Merged `formatMXN` + `pesosToCents` into one import line.
- **Status**: FIXED

#### m-3: Qty stepper clamps to `Number.MAX_SAFE_INTEGER` (no client stock cap)
- **File**: `src/components/admin/orders/manual-order-line-editor.tsx` (QtyStepper)
- **Suggestion**: Client allows arbitrarily large qty; server re-validates against live stock (`create_order` guarded decrement + `revalidateLines`), so NOT a security/oversell issue — only delayed feedback.
- **Status**: SKIPPED — not a correctness/security defect (server authoritative on stock, edge 1 holds); UX polish deferrable.

#### m-4: `manual-order-form-read.ts` uses two different count formulas for the same rows
- **File**: `src/lib/admin/orders/manual-order-form-read.ts:38,84`
- **Suggestion**: Not currently exploitable — the editor always emits every per-line hidden input (incl. empty `line_variant_id`), so the parallel arrays stay equal length. Fragile if a field ever becomes conditional.
- **Status**: SKIPPED — no current defect; noted for clean-code backlog (shared count helper / length assertion).

#### m-5: `manual-order-line-editor.tsx` is 554 lines (> ~400 soft cap)
- **File**: `src/components/admin/orders/manual-order-line-editor.tsx`
- **Suggestion**: Split into `manual-order-product-picker.tsx` + the line editor (~250 each).
- **Status**: SKIPPED — under the 1000-line hard cap; splitting mid-review risks churn. Noted for clean-code backlog.

#### m-6: Effective-price re-derivation duplicated (form `sumLines` vs editor `LineRow`)
- **File**: `manual-order-form.tsx:362` and `manual-order-line-editor.tsx` (LineRow)
- **Suggestion**: Extract a shared `effectiveUnitPrice(line, issue)`.
- **Status**: SKIPPED — both agree (no correctness bug); DRY-with-judgment, deferrable.

## Acceptance Criteria Verification

| #     | Criterion                                             | Status | Evidence |
| ----- | ----------------------------------------------------- | ------ | -------- |
| AC-1  | "Nuevo pedido" CTA in list actions, testid           | PASS   | `orders/page.tsx` CTA (+ error header), `data-testid="admin-orders-new"` |
| AC-2  | Page + action `requireSession()` before any DB        | PASS   | `new/page.tsx` session-first; `actions.ts:194` awaits `requireSession()` first; catalog action `:174` too |
| AC-3  | Contact + full MX shipping fields (incl. note)        | PASS   | Form sections; **note now persisted** (M-1 fix) |
| AC-4  | Same MX CP/state rules as checkout                    | PASS   | `manual-order-input.ts` reuses `MEXICAN_CP_PATTERN`/`isMexicanState`/`ADDRESS_FIELD_MAX` |
| AC-5  | Search catalog, variant required, qty ≥ 1             | PASS   | picker + `parseLine` UUID+qty; **multi-word search fixed** (M-2) |
| AC-6  | Live stock + server-recalculated price at selection   | PASS   | `manual-order-catalog.ts` `variant.price_override_cents ?? product.price_cents`; client never computes price |
| AC-7  | `revalidateLines` re-verify on submit; abort on issue | PASS   | `manual-order-write.ts:75` before create; write test asserts `rpc` not called on issues |
| AC-8  | Shipping default + admin override; `assembleOrder`     | PASS   | `parseShippingOverride` → `assembleOrder({kind:"flat"})` |
| AC-9  | Atomic `create_order`; idempotency prevents double     | PASS   | RPC call; key minted server-side in `page.tsx`, normalized in action |
| AC-10 | status=pending_payment, payment=pending, locale es-MX  | PASS   | `create_order` defaults + `payload.locale="es-MX"` |
| AC-11 | Email optional; blank still creates                   | PASS   | `parseEmail` blank→null; `NO_EMAIL_PLACEHOLDER` satisfies NOT NULL |
| AC-12 | Confirmation opt-in, gated on valid email             | PASS   | `maybeSendConfirmation` double-gates; switch UI honest (M-3 fix) |
| AC-13 | Recipient-safe skip on all customer sends             | PASS   | `resolveCustomerRecipient` guard added to all 6 sends in `dispatch.ts` |
| AC-14 | `payment_method='manual'` + detail badge             | PASS   | `stampManualSource` / advance carries it; `SourceBadge` on detail |
| AC-15 | Paid via `advance_order_status` payment-only          | PASS   | `markSourceAndPayment` `p_order_status=null,p_payment_status='paid'` |
| AC-16 | No payment-received email on offline paid             | PASS   | no `sendPaymentReceived` call; only optional confirmation |
| AC-17 | Appears in list + detail, packing slip printable      | PASS   | `revalidateOrder` + redirect to detail; detail renders full order |
| AC-18 | Input + write unit tests                              | PASS   | input matrix + write branch map (+4 new note tests this pass) |
| AC-19 | Integration end-to-end                               | PASS   | `admin-orders-manual.integration.test.ts` in 257-pass suite |
| AC-20 | Admin e2e                                            | PASS (dev-run) | `e2e/admin-orders-manual.spec.ts` 3/3 (not re-run this stage; no e2e-affecting change) |

## Edge Case Verification

| # | Edge Case                     | Status  | Evidence |
| - | ----------------------------- | ------- | -------- |
| 1 | Stock race on create          | HANDLED | `create_order` guarded decrement; revalidate + RPC floor |
| 2 | Zero-item order               | HANDLED | `parseLines` → `no-items`; RPC never called |
| 3 | Double / double-submit        | HANDLED | server-minted idempotency key → `reused:true`; note no-double-insert (M-1 fix) |
| 4 | Email absent                  | HANDLED | sentinel + recipient guard; later T12 send skips benignly |
| 5 | Price change mid-entry        | HANDLED | `revalidateLines` `price-changed` → abort before create |
| 6 | Invalid quantity              | HANDLED | `parseLine` integer/[1,INT4_MAX] |
| 7 | Marked-paid + email-less      | HANDLED | paid advance, no `sendPaymentReceived`, no confirmation |

## Fix Summary

- Critical: 0/0
- Major: 4/4 fixed (M-1 data loss, M-2 search, M-3 switch honesty, config test) — 0 skipped
- Minor: 2/6 fixed (m-1 active index, m-2 dup import), 4 skipped with justification (backlog)

## Quality Score: 8.5/10

Strong, trust-correct foundation that reuses the proven checkout boundary faithfully. Docked for: a real data-loss bug (silently-dropped internal note) that unit tests missed despite AC-18 claiming write-branch coverage, a broken multi-word search, and a dev-done misdiagnosis (a deterministic stale test reported as an environmental flake — a reporting-correctness miss). All fixed inline; gates green.

## Recommendation: APPROVE

All critical/major issues fixed in this pass. tsc 0, eslint 0, unit 1982/1982, integration 257/257. Proceed to S5 QA (standard-tier quality gate).
