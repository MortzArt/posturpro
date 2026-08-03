# Dev Summary: T17 — Admin manual / phone order entry

Standard-tier S3 (Dev). Full-stack, admin es-MX only. **Migration count: NONE added — 0013 stays latest** (rides `create_order`/`advance_order_status` unchanged; source-marks via `payment_method='manual'`; resolves email-optional via a non-delivering sentinel + recipient guard).

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `src/lib/email/recipient.ts` | created | `NO_EMAIL_PLACEHOLDER` + `isMailableAddress` + `resolveCustomerRecipient` — single recipient-safety authority (AC-13). |
| `src/lib/email/dispatch.ts` | modified | AC-13 guard on all 6 customer-facing sends: absent/malformed/sentinel recipient → benign `{ok:true,sent:false}` skip before any provider call. Real-email unchanged. |
| `src/lib/admin/orders/manual-order-input.ts` | created | PURE validator → `ManualOrderInput`. Email optional; shipping reuses CP/state/field-max rules (email-optional sibling of `validateAddress`); lines ≥1, qty∈[1,INT4_MAX], UUID ids; pesos→cents; payment-choice + confirm opt-in. |
| `src/lib/admin/orders/manual-order-write.ts` | created | revalidateLines→issues \| assembleOrder(flat)→create_order (sentinel email if blank, es-MX, live-priced items)→source stamp→optional paid advance→optional confirmation. Post-create failures never roll back. |
| `src/lib/admin/orders/manual-order-catalog.ts` | created | Picker search: active products by name/SKU + batch variants+covers; live `variant.price_override_cents ?? product.price_cents`. |
| `src/lib/admin/orders/manual-order-form-read.ts` | created | PURE FormData→raw + echoed values (parallel per-line arrays). |
| `src/app/admin/(app)/orders/manual-order-form-state.ts` | created | `ManualOrderFormState` union (no success — success redirects). |
| `src/app/admin/(app)/orders/new/page.tsx` | created | RSC shell: session-first, Store-Settings shipping seed, mint idempotency key, render form. |
| `src/app/admin/(app)/orders/new/manual-order-form.tsx` | created | useActionState island: 5 sections, live summary, sticky bar, disable-while-pending, values re-seed, focusFirstInvalid, confirm gated on valid email. |
| `src/components/admin/orders/manual-order-line-editor.tsx` | created | Picker (combobox+in-flow listbox, 300ms debounce, roving keys, agotado skipped) + line editor (cards, qty stepper, per-line issues, hidden inputs, next/image). |
| `src/components/admin/orders/source-badge.tsx` | created | `☎ Pedido manual / telefónico` badge. |
| `src/components/admin/orders/order-created-banner.tsx` | created | Detail landing banner (auto-hide success + persistent paid/email notices, role=status, .enter-fade, RM-safe). |
| `src/app/admin/(app)/orders/actions.ts` | modified | `createManualOrder(prevState,formData)` + `searchManualOrderCatalog(term)`, both session-first. |
| `src/app/admin/(app)/orders/page.tsx` | modified | "Nuevo pedido" primary CTA before Clientes (+ on error header). |
| `src/app/admin/(app)/orders/[id]/page.tsx` | modified | Source badge; "Sin correo" instead of sentinel; created banner from searchParams. |
| `src/lib/admin/orders/order-constants.ts` | modified | `MANUAL_ORDER_PAYMENT_METHOD`. |
| `src/lib/admin/orders/order-status-meta.ts` | modified | `isManualOrder` + `SOURCE_BADGE_META`. |
| `src/lib/config/admin-products.ts` | modified | `MANUAL_ORDER_CATALOG_LIMIT`. |
| `src/components/admin/form/fields.tsx` | modified | `MoneyField` optional `value`/`onChange` (backward-compatible) for the live total. |
| `src/lib/email/recipient.test.ts` | created | Guard unit tests. |
| `src/lib/email/dispatch.test.ts` | modified | +5 AC-13 skip cases. |
| `src/lib/admin/orders/manual-order-input.test.ts` | created | Input matrix. |
| `src/lib/admin/orders/manual-order-write.test.ts` | created | Write branch map (mocked). |
| `src/lib/admin/orders/manual-order-form-read.test.ts` | created | FormData reader. |
| `tests/integration/admin-orders-manual.integration.test.ts` | created | AC-19. |
| `e2e/admin-orders-manual.spec.ts` | created | AC-20. |

## AC Coverage: 20/20 (see per-AC map below)
- AC-1/2 CTA + session-first (page+action). AC-3/4 contact+shipping + shared CP/state. AC-5/6/7 picker variant-required + live stock/server price + revalidate re-verify (abort-before-create). AC-8 shipping default+override via assembleOrder. AC-9/10 atomic create + idempotency + pending/pending + es-MX. AC-11/12/13 email optional + confirm opt-in gated + recipient guard. AC-14 payment_method=manual + detail badge. AC-15/16 paid via advance_order_status payment-only + no payment-received email. AC-17 lands list+detail. AC-18/19/20 tests all green.

## Edge Cases (7/7)
stock race (guarded decrement); zero-item (no-items); double-submit (idempotency + in-flight disable); email absent (sentinel+guard); price-change (lineIssues adopt live price); invalid qty (line-invalid); paid+email-less (paid, no send).

## Migration = NONE (0013 latest confirmed).

## Test Status
- tsc --noEmit: clean. eslint (all touched incl tests+e2e): clean.
- Unit: +60 new/updated (recipient 8, dispatch +5, input 24, write 14, form-read 9). Full suite 1977 pass / 1 PRE-EXISTING env flake (`config.test.ts` WHATSAPP_PHONE_E164 — fails identically on clean baseline with my changes stashed; a shell WHATSAPP env leak, not T17).
- Integration: full suite 24 files / 257 tests pass after reset+reseed (was 253/23 → +4, +1 file).
- e2e admin-orders-manual (chromium): 3/3 pass.

## Live Spot-Check (:3000)
Email-less pending order → detail with ☎ badge + "Sin correo" + created banner + order number; CP-invalid blocks with field error (no order). Paid path + with-email confirmation proven in integration (paid → payment_status=paid, payment_method=manual, transition_kind=paid history row). Stock decrement + idempotency asserted vs live local Supabase.

## Deviations
None material. Optional list-badge/source filter (may-defer per ticket) not added — required detail badge present. Manual price override / discount code stay Out of Scope.

## Dependencies Added
None (no npm packages, no migration).

## Review + Fix Pass (S4 ReviewFix — ultrareviewfix, standard tier)

Single-pass review + inline fix over all 28 files of `c02dca9`. Trust core verified in code (not trusted from this summary): client prices never trusted (`revalidateLines` sole authority), `requireSession()` on page + create action + catalog-search action, server-minted idempotency key, AC-13 guard on all 6 sends, offline-paid via `advance_order_status` payment-only (no receipt email), no XSS surface. **0 critical.**

### Issues Found & Fixed

| ID  | Severity | Title                                              | Status  | File                                             | Fix Applied |
| --- | -------- | -------------------------------------------------- | ------- | ------------------------------------------------ | ----------- |
| M-1 | MAJOR    | "Nota interna" collected but silently dropped (data loss) | FIXED | `manual-order-write.ts`                    | Post-create `maybePersistInternalNote` → `order_internal_notes` via `addOrderNote`; blank/reused-skip; failure never rolls back; +4 unit tests |
| M-2 | MAJOR    | Space key blocks multi-word catalog search         | FIXED   | `manual-order-line-editor.tsx:212`               | Drop `" "` as activation key; Enter-only (ARIA APG editable combobox) |
| M-3 | MAJOR    | Confirmation switch submits "off" while shown "on" | FIXED   | `manual-order-form.tsx:288`                       | Re-key SwitchField on `emailValid` → remounts unchecked when email invalid |
| —   | MAJOR    | config.test.ts WHATSAPP flake **misdiagnosed** as env leak — actually STALE test | FIXED | `config.test.ts:74`      | Source `WHATSAPP_PHONE_E164` is now `5215512345678`; assertion rewritten to follow the constant. Unit suite now 1982/1982 GREEN, 0 failures |
| m-1 | MINOR    | Initial activeIndex could target aria-disabled row | FIXED   | `manual-order-line-editor.tsx:120`               | `firstSelectableIndex(found)` — highlight first in-stock target |
| m-2 | MINOR    | Duplicate `@/lib/money` import                     | FIXED   | `manual-order-form.tsx:9`                         | Merged into one import |
| m-3 | MINOR    | Qty stepper clamps to MAX_SAFE_INTEGER (no client stock cap) | SKIPPED | —                                     | Server authoritative on stock (edge 1); UX-only, deferrable |
| m-4 | MINOR    | Two count formulas in form-read parallel-array reader | SKIPPED | —                                             | Not exploitable (editor emits all per-line fields); backlog |
| m-5 | MINOR    | `manual-order-line-editor.tsx` 554 lines (> soft cap) | SKIPPED | —                                             | Under 1000 hard cap; split risky mid-review; backlog |
| m-6 | MINOR    | Effective-price re-derivation duplicated form↔editor | SKIPPED | —                                             | Both agree; DRY-with-judgment; backlog |

### Summary
- Critical: 0/0
- Major: 4/4 fixed, 0 skipped
- Minor: 2/6 fixed, 4 skipped (clean-code backlog)

### Gates (re-run, not trusted)
- tsc --noEmit: **0**. eslint (changed files): **0**.
- Unit: **1982/1982 (117 files)** — the previously-reported "flake" is eliminated (it was the stale config test, now fixed). +4 new manual-order-write tests.
- Integration: **24 files / 257 tests pass** (after reset+reseed) incl. `admin-orders-manual.integration.test.ts`.
- e2e: not re-run this stage (no e2e-affecting change; dev-run 3/3 stands).

### Verdict: APPROVE, 8.5/10. Proceed to S5 QA (standard-tier quality gate).
