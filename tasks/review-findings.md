# Code Review: T12 — Admin Order Management

> Stage 5 (ultrareview). Scope: commit `81b168e` (47 created + 10 modified). Every changed line read (session codec, migration 0012, refund/cancel/status/tracking/notes write layers, list/read queries, packing slip, server actions, route handler, and all 18 React components — the component sweep delegated to a parallel adversarial reviewer whose findings are folded in). Verified against the 30 ACs, 11 edge cases, the binding UI-design spec, the T12 GATES, and CLAUDE.md clean-code/animation rules.

## Summary

A genuinely strong, disciplined implementation. The session-revocation gate is correct and fail-closed, the refund idempotency contract is correct end-to-end, `cancel_order` is a proper single-transaction RPC (not the T11 compensation pattern), and both route handlers self-guard. **No critical defects.** The blocking issues are two correctness gaps in the money/email surface (a refund's "email not sent" signal is silently dropped, and a cancelled-order timestamp is factually wrong), plus an unbounded customer order-count read and a dashboard count/link mismatch. Ship after the four majors are fixed.

## Critical Issues (MUST FIX)

None. The trust boundary (session codec + revocation), the money path (refund idempotency + over-refund guard), and the transactional cancel all hold under adversarial reading.

## Major Issues (SHOULD FIX)

### M-1: Refund success silently discards `emailSent` — "correo no enviado" never shows for refunds (AC-10 / edge 7 gap)
- **ID**: M-1
- **Severity**: MAJOR
- **File**: `src/components/admin/orders/order-detail-actions.tsx:161-164` + `src/components/admin/orders/refund-modal.tsx:98-115`
- **Problem**: The refund action returns `{ ok: true, kind, emailSent }` (`actions.ts:139`), and `refundOrder` write correctly computes `emailSent` from the actual `sendRefundIssued` outcome (`order-refund-write.ts:57`). But `RefundModal.submit()` calls `onRefunded()` with **no arguments** (refund-modal.tsx:110), and the parent's `onRefunded` **hardcodes `emailSent: true`** (`order-detail-actions.tsx:162`). So when the refund succeeds but the customer email fails (provider down, order unreadable), the banner shows plain "Reembolso emitido" with NO "· correo no enviado" sub-line.
- **Impact**: Directly violates AC-10 / edge 7 for the refund path (the two other write paths — advance and cancel — thread `emailSent` correctly, so this is an inconsistency, not a pattern miss). The Owner believes the customer was notified of a real-money refund when they were not — a support/trust failure on the single most sensitive action.
- **Suggested Fix**: Change `RefundModalProps.onRefunded` to `(emailSent: boolean) => void`; in `submit()` on success call `onRefunded(result.emailSent)`; in the parent pass it through: `onRefunded={(emailSent) => { onBanner({ message: "Reembolso emitido", emailSent }); router.refresh(); }}`.
- **Status**: FIXED — `RefundModalProps.onRefunded` is now `(emailSent: boolean) => void`; `submit()` calls `onRefunded(result.emailSent)` (refund-modal.tsx); the parent threads it into the banner (order-detail-actions.tsx:161-164). Added `refund-modal.test.tsx` (3 tests) asserting emailSent=true, emailSent=false (the regression), and no-call-on-failure all propagate correctly.

### M-2: Cancelled-order stepper band displays the ORDER CREATION time as the cancellation time
- **ID**: M-2
- **Severity**: MAJOR
- **File**: `src/app/admin/(app)/orders/[id]/page.tsx:37`
- **Problem**: `const cancelledAt = order.orderStatus === "cancelled" ? order.createdAt : null;` passes `order.createdAt` into `OrderStatusStepper`'s cancelled band, which renders "Pedido cancelado · {formatRelativeDate(cancelledAt)}". For any order cancelled after creation (i.e. essentially all of them) the band shows the wrong time — "cancelled 3 weeks ago" when it was created 3 weeks ago and cancelled today.
- **Impact**: A factually incorrect audit statement on the operator's primary order surface. The true cancellation time is available in `order.history` (the newest `to_status='cancelled'` entry's `created_at`).
- **Suggested Fix**: Derive the real time from history: `const cancelledAt = order.orderStatus === "cancelled" ? (order.history?.find(h => h.toStatus === "cancelled")?.createdAt ?? null) : null;` (falls back to `null` — the band should render without a timestamp rather than a wrong one when history failed to load).
- **Status**: FIXED — `[id]/page.tsx:36-45` now derives `cancelledAt` from the newest `cancelled` history entry (`history` is newest-first, `find` returns the most recent), falling back to `null` when history failed to load so the band renders without a timestamp rather than a wrong one.

### M-3: Customer order counts are silently truncated at PostgREST's 1000-row default (wrong counts + unbounded fetch)
- **ID**: M-3
- **Severity**: MAJOR
- **File**: `src/lib/admin/orders/customer-list-query.ts:101-120` (`readOrderCounts`)
- **Problem**: To tally per-customer order counts, this fetches ALL `orders` rows for the page's 25 customer ids with `.select("customer_id").in("customer_id", ids)` and no range/limit. PostgREST caps an un-ranged read at the configured max (default 1000). Two failures: (a) if the 25 customers collectively have >1000 orders, the in-memory tally silently under-counts; (b) it pulls up to 1000 rows into memory every customer-list render just to count — an unbounded read the ticket's own "no N+1 / no unbounded query" bar forbids.
- **Impact**: Displayed order counts become wrong at scale, and the read cost grows with total order volume rather than page size. Not a launch-day blocker (low order volume), but it is a latent correctness + performance bug on a list surface.
- **Suggested Fix**: Replace the client-side tally with a grouped aggregate — a small SQL RPC (`select customer_id, count(*) from orders where customer_id = any($1) group by customer_id`, `service_role`-only, mirroring the 0011/0012 RPC posture) — so the DB returns 25 count rows, not up to 1000 order rows. This also removes the truncation entirely.
- **Status**: FIXED — added migration `0013_admin_customer_order_counts.sql`: a `STABLE SECURITY DEFINER` `admin_customer_order_counts(uuid[])` RPC (pinned empty search_path, service_role-only execute, anon denied) that returns one grouped `{customer_id, order_count}` row per input id. `customer-list-query.ts:readOrderCounts` now calls it (≤25 count rows, never the order rows — no truncation, bounded by page size). Added `admin_customer_order_counts` Args/Row types to `rpc.ts`. Verified locally: fresh `db reset` applies 0001..0013 clean; RPC returns correct grouped counts (2/1), excludes null-customer orders, and omits ids with no orders (app maps missing→0).

### M-4: New-order dashboard indicator links to a filter that excludes half of what it counts (AC-25 consumer mismatch)
- **ID**: M-4
- **Severity**: MAJOR (borderline; product-correctness of the headline metric)
- **File**: `src/components/admin/orders/new-order-indicator.tsx` (link target) vs `src/lib/admin/orders/dashboard-metrics.ts:19-25` (count definition)
- **Problem**: `countNewOrders` counts `status IN ('pending_payment','paid')`, but the indicator's "Ver pedidos" link targets `?status=paid` only. The card says "5 nuevos" and the destination list shows a subset (only the `paid` ones), omitting the `pending_payment` orders that were counted.
- **Impact**: The Owner clicks the count and lands on fewer orders than the number promised — the new-order indicator (the whole point of AC-25) is internally inconsistent. Erodes trust in the dashboard's primary signal. The dev-done "Risks for Review" flags this exact ambiguity.
- **Suggested Fix**: Make the link and the count agree. Either (a) link to a `?new=1` seam that the list read maps to `status IN (pending_payment, paid)`, or (b) narrow the count to `paid` only if "new = paid but not yet advanced" is the intended definition. Pick one definition and align both sides.
- **Status**: FIXED — chose definition (a): "new = awaiting fulfilment = `pending_payment` OR `paid`", which is the AC-25 wording verbatim ("count of orders in pending_payment/paid not yet advanced"). Single-sourced the pair as `NEW_ORDER_STATUSES` in `order-list-filters.ts`; both `dashboard-metrics.countNewOrders` (the count) and the new `?new=1` list-filter seam (`applyFilters` → `.in("status", NEW_ORDER_STATUSES)`) consume it, so count and destination are one definition. Indicator link changed `?status=paid` → `?new=1`. The seam is mutually exclusive with an explicit `?status=` (a narrowed single-status filter always wins, never silently re-widened). Added `order-list-filters.test.ts` (10 tests) covering parse/precedence/round-trip of the seam.

## Minor Issues (NICE TO FIX)

### m-1: Refund idempotency key lives only in component state — a mid-flight remount loses retry-safety
- **File**: `src/components/admin/orders/refund-modal.tsx:62,94`
- **Suggestion**: The key is minted in `goToConfirm` and held in `useState`. The non-dismissable-while-pending guard makes loss unlikely, but a parent-driven remount or hard reload between submit and response would mint a fresh key on the "same" refund → a possible double-charge at MP. The bulletproof form derives/persists the key server-side per (order, compose-cycle). Acceptable to ship as-is; document the residual risk. (Confirmed by both reviewers: the key IS stable across an in-place network retry and unique per distinct attempt — this is only the remount edge.)
- **Status**: DOCUMENTED / accepted as-is (the reviewer's own recommendation). The key is stable across an in-place network retry and unique per distinct attempt; only a hard remount/reload between submit and response mints a fresh key, and the non-dismissable-while-pending guard makes that window practically unreachable. A server-derived-per-(order, compose-cycle) key is a Phase-2 hardening, tracked as the residual risk here. No code change this stage.

### m-2: `crypto.randomUUID()` throws in a non-secure context with no fallback
- **File**: `src/components/admin/orders/refund-modal.tsx:94`
- **Suggestion**: On a misconfigured plain-`http` non-localhost host, `crypto.randomUUID()` throws, and `goToConfirm` surfaces an uncaught error with no friendly message. Admin is HTTPS-only in prod, but add a guard/fallback or wrap in try/catch mapping to the generic error copy.
- **Status**: FIXED — added `randomKeySuffix()` in refund-modal.tsx: it feature-detects `globalThis.crypto.randomUUID`, calls it inside a `try/catch`, and falls back to a `Date.now()`+`Math.random()` token when unavailable/throwing. Uniqueness (not crypto strength) is all the idempotency key needs, so the fallback is sufficient and `goToConfirm` can no longer surface an uncaught error.

### m-3: Refund confirm + amount inputs are not associated with their `FieldError` for screen readers
- **File**: `src/components/admin/orders/refund-modal.tsx:162-171` (amount) and `:211-219` (confirm)
- **Suggestion**: The step-1 amount input and step-2 confirm `TextField` render a `FieldError` (`refund-step1-error` / `refund-step2-error`) but neither input carries `aria-describedby` pointing at it, nor `aria-invalid` on error. A screen-reader user won't hear the validation error tied to the field. The design spec's a11y checklist explicitly requires the typed-confirmation input's reason be associated — wire `aria-describedby`/`aria-invalid`.
- **Status**: FIXED — step-1 amount input now sets `aria-invalid` (when over-balance with a non-empty value) and `aria-describedby` pointing at its hint (`refund-amount-hint`, id added) plus `refund-step1-error` when present. Step-2 now passes `error={error}` into the shared `TextField`, which wires its own `aria-invalid` + `aria-describedby` and renders the associated `FieldError` (testid `refund-confirm-input-error`) — removing the previously-detached standalone error line.

### m-4: `bump_admin_session_version` returns `bigint` typed as `number` in TS
- **File**: `src/lib/supabase/types/rpc.ts:267-270`, `src/lib/admin/session-version.ts:67`
- **Suggestion**: The RPC returns a `bigint` counter; the TS type is `number` and `getAdminSessionVersion` compares `payload.v === currentVersion` as numbers. Realistically the version never approaches 2^53, so this is safe today, but it is a latent precision cliff. A named comment documents the assumption.
- **Status**: FIXED (documented) — added a PRECISION NOTE to the `session-version.ts` module docstring explaining the `bigint`→`number` carry is safe because the version is a manual rotate-on-compromise counter that can never approach `Number.MAX_SAFE_INTEGER`, and instructing a future editor to switch to a bigint/string comparison if bumps ever became automatic/high-frequency.

### m-5: `advance_order_status` payment-status is a call-time snapshot, not a live re-read (document, don't "optimize")
- **File**: `src/lib/admin/orders/order-status-write.ts:43-53`
- **Suggestion**: `advanceOrderTo` reads `payment_status` then passes it into the RPC. The RPC is `FOR UPDATE`-locked and authoritative, so a concurrent payment webhook flipping `payment_status` between the read and the call cannot corrupt state (the RPC re-derives `transition_kind` under its own lock from the passed value). This is correct, but add a one-line comment that the RPC treats `p_payment_status` as the desired payment state, not a stale read, so a future editor doesn't introduce a TOCTOU assumption.
- **Status**: FIXED (documented) — added the clarifying comment above the `advanceOrderStatus` call in `order-status-write.ts` stating `p_payment_status` is the desired payment state (not a trusted live read), the RPC is `FOR UPDATE`-locked and re-derives the kind under its own lock, so this is not a TOCTOU assumption to "optimize" away.

### m-6: `copyNumber` gives no success feedback ever
- **File**: `src/components/admin/orders/order-row-actions.tsx` (copy handler)
- **Suggestion**: `void navigator.clipboard?.writeText(...)` silently succeeds or silently fails (insecure context / denied permission). The operator never sees a "Copiado" confirmation. Add a transient confirmation.
- **Status**: FIXED — `copyNumber` now handles the `writeText` promise: on success it shows a transient `role="status"` "Copiado" pill (with a tick icon, `.enter-fade`, auto-hides after 1.5 s) rendered next to the trigger so it survives the dropdown closing; on rejection it logs with context instead of silently swallowing (no empty catch). Added testid `order-copied-{id}`.

## Nits

- **n-1**: `refund-modal.tsx:65-66` — whole-peso-only refund (`^\d+$` → `amountPesos * 100`). Cannot partial-refund a centavo amount (e.g. $0.50 of a $199.50 payment). Matches the dev-done "whole pesos, Phase 1" decision; confirm the product intent. — **SKIPPED** (product intent, not a defect): this matches the explicit dev-done "whole pesos, Phase 1" decision. Changing the input granularity is a product-scope decision, not a fix; the whole-peso constraint is correct and safe (never exceeds the balance). Left as-is pending a product call; not a code fix for this stage.
- **n-2**: `order-status-stepper.tsx` — inline `style={{ transitionTimingFunction: "var(--ease-out)" }}` duplicates the Tailwind `ease-out` class; drop one. — **FIXED**: removed the inline `style` (the Tailwind `ease-out` class already applies the timing function) and added `motion-reduce:transition-none`.
- **n-3**: Hover-arrow `translate-x-0.5` nudges on the dashboard/indicator cards have no `prefers-reduced-motion` gate. A 2px translate is negligible, but the strict RM bar wants transforms gated. — **FIXED**: added `motion-reduce:transform-none motion-reduce:transition-none` to the hover-arrow in both `new-order-indicator.tsx` and the dashboard `page.tsx` catalog card.
- **n-4**: `packing-slip.ts:8-11` — the module docstring contains a rambling half-retracted sentence ("passes pre-formatted strings is avoided … No: we accept …"). Cosmetic; clean up — it reads like a thinking-out-loud draft. — **FIXED**: rewrote the docstring; the slip renders NO prices (fulfilment document — ship-to + line items + qty/SKU only), so the money paragraph was not only rambling but inaccurate and is now removed.

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | Paginated list 25/page, created_at DESC, MXN, badge pair | PASS | `order-list-query.ts:79-85,120-121`; `created_at DESC` |
| AC-2 | `?search=` matches number/email/name, meta-chars stripped | PASS | `order-list-query.ts:53-62` strips `[%,()*.:\\]`, `or(...)` on 3 cols |
| AC-3 | `?status`/`?payment`/`all`, composes with search+page | PASS | `order-list-query.ts:63-64`; `order-list-filters.ts:84-96` |
| AC-4 | Bounded pure `parseOrderListFilters` | PASS | `order-list-filters.ts:69-76` length-caps + enum-constrains |
| AC-5 | Detail: contact/shipping/items/totals/status/tracking/notes | PASS | `order-read.ts:47-81`; `[id]/page.tsx:110-190` |
| AC-6 | History chronological, from→to/kind/note/ts | PASS | `order-read.ts:172-176` newest-first; `order-history-log.tsx` |
| AC-7 | Non-UUID/missing id → notFound (404), never 500 | PASS | `order-read.ts:90`; `[id]/page.tsx:32-34` |
| AC-8 | Only valid next transitions; forced → regression_blocked friendly | PASS | `order-status-meta.ts:135-142`; `order-status-input.ts:42` |
| AC-9 | advanceOrderStatus only path; email branches on returned kind | PASS | `order-status-write.ts:48-66,105-124` — no string-match |
| AC-10 | Email failure ≠ rollback; UI shows success | PASS | All three paths thread `emailSent` — refund now threads it too (M-1 FIXED) |
| AC-11 | Tracking persists + threads into sendShipped | PASS | `order-tracking-write.ts:23-37`; `order-status-write.ts:110-116` |
| AC-12 | Empty tracking number allowed → shipped email null | PASS | `order-tracking-input.ts:32-37` empty→null |
| AC-13 | cancel_order single-tx: restore+advance+history, idempotent | PASS | `0012:102-180` `FOR UPDATE`, `noop` on already-cancelled |
| AC-14 | sendCancelled once; since-deleted product/variant skipped | PASS | `order-cancel-write.ts:61-65`; `0012:146-155` |
| AC-15 | NOT compensation — single SQL RPC | PASS | `0012:102-176` one transactional fn |
| AC-16 | Refund modal FULL/partial → refundOrderPayment via gated action | PASS | `refund-modal.tsx`; `actions.ts:120-140` first caller |
| AC-17 | Full→refunded, partial→paid, over-refund refused, no partial move | PASS | `refund.ts:104-111,228-249` |
| AC-18 | sendRefundIssued once, deduped on MP refund id | PASS | `dispatch.ts:277`; `order-refund-write.ts:66-83` |
| AC-19 | Stable per-action idempotency key; distinct partials don't collide | PASS | `refund-modal.tsx:94` mint-once; `refund.ts:53-66,116` H-1 |
| AC-20 | Raw MP error NEVER echoed; friendly mp-error | PASS | `refund.ts:189-198`; `refund-modal.tsx:39-45` |
| AC-21 | Internal notes admin-only, never in history/email, newest-first | PASS | `order_internal_notes` (0012); `order-read.ts:202-206` |
| AC-22 | Packing slip via self-guarded route, 401 unauth | PASS | `packing-slip/route.ts:20-22` |
| AC-23 | Print-HTML (no PDF dep), CANCELADO band | PASS | `packing-slip.ts:60-63,123-128` escaped |
| AC-24 | Customer list paginated, email/name search, order counts | PASS | Grouped-count RPC (0013) — no truncation, bounded read (M-3 FIXED) |
| AC-25 | Dashboard new-order indicator linking to filtered list | PASS | Count + `?new=1` link single-sourced on `NEW_ORDER_STATUSES` (M-4 FIXED) |
| AC-26 | Owner email stays at checkout; no per-request marker | PASS | `dashboard-metrics.ts:5-8` live count, owner alert untouched |
| AC-27 | Persisted session-version compared on every authoritative verify | PASS | `session-guard.ts:47-53`; `0012:195-233` |
| AC-28 | Revoked/old-version cookie rejected, no DB access | PASS | `session-guard.ts:43-53`; test `session-guard.test.ts:73-86` |
| AC-29 | Every route handler self-calls hasValidAdminSession → 401 | PASS | Both `route.ts` self-guard (packing-slip + export) |
| AC-30 | Every server action requireSession() FIRST | PASS | `actions.ts:60,88,106,125,147` first line |

**Unmet / partial ACs: NONE remaining.** AC-10 / AC-24 / AC-25 (previously partial, mapped to M-1 / M-3 / M-4) are all FIXED in Stage 6; all 30 ACs now PASS.

## Edge Case Verification

| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Refund > remaining balance refused, state unchanged | HANDLED | `refund.ts:104-111` local + `record_refund` |
| 2 | PP-000005 3 dup payments — guard uses ORDER total | HANDLED | `refund.ts:104` guards on `totalCents`; balance line only |
| 3 | Cancel after shipped — restores+cancels (rank 5), UI warns | HANDLED | `0012:158-168`; `cancel-order-dialog.tsx:79-87` |
| 4 | Double status race — FOR UPDATE + noop_same_status, no 2nd email | HANDLED | RPC lock + `order-status-write.ts` no email on noop |
| 5 | Regressive transition → regression_blocked, no side effects | HANDLED | `order-status-write.ts:58-60`; friendly map |
| 6 | Refund on cancelled-but-paid order still allowed | HANDLED | `0012:159` payment_status untouched; keys on `payment_status` |
| 7 | Email failure mid-transition — commit, log, not rolled back | HANDLED | All three write paths surface `emailSent`; refund now threads it (M-1 FIXED) |
| 8 | Packing slip for cancelled — CANCELADO band, self-guards | HANDLED | `packing-slip.ts:60-63`; route guards regardless of status |
| 9 | Stolen-cookie post-refund — version bump revokes | HANDLED | `session-guard.ts:47-53`; `bump_admin_session_version` |
| 10 | Concurrent partials past pre-check — record_refund rejects 2nd | HANDLED | `refund.ts:205-223` `over-refund`→`error`, reconcile log |
| 11 | Cancel with since-deleted product/variant — skip null FK | HANDLED | `0012:146-155` variant/product null-checks |

## Security Review Notes (attack-surface pass)

- **Session codec/revocation**: Correct. `decodePayload` accepts any finite `v` (so a bumped-version cookie is a *revocation*, not a decode failure — the guard owns equality), signature verified constant-time (`timingSafeHexEqual`) BEFORE decode, expiry checked, then version-equality with fail-closed on read error (`session-guard.ts:49-53`). Edge/Node asymmetry (Edge pre-check skips the DB version read) is the documented, acceptable defense-in-depth split — the authoritative Node guard gates every DB touch. No downgrade path found. Login stamps the live version (`admin/actions.ts:87`).
- **Injection**: PostgREST filters are parameterized `.eq/.in`; search terms meta-char-stripped before the `or()` string (`order-list-query.ts:58`, `customer-list-query.ts:40`). `cancel_order`/`bump` are `SECURITY DEFINER`, pinned empty `search_path`, `service_role`-only execute. No raw SQL interpolation.
- **IDOR / route auth**: Packing slip self-guards then UUID-validates the id; unauth → 401 before any read. Every action `requireSession()` first. Admin is single-owner.
- **XSS**: Packing slip HTML escapes all 5 significant chars on every customer-controlled field (`packing-slip.ts:16-23,75-147`). React escapes all admin-UI JSX text. No `dangerouslySetInnerHTML`; only inline handler is the static `window.print()`.
- **Data exposure**: All write layers map DB/MP errors to typed reasons; raw errors are `console.error`-logged with context only, never echoed (AC-20).
- **CSRF**: Server actions + same-site `Lax` cookie scoped to `/admin`; state-changing actions re-verify server-side.

## Animation & Motion Review (Emil-Kowalski STANDARDS bar)

PASSES. `.dialog-content-motion` and `.enter-fade` animate transform+opacity only, enter uses `--ease-out`, exit shorter (140ms vs 180/200), `prefers-reduced-motion` drops transforms to opacity-only, transitions interruptible, no `ease-in` on any enter, no layout-property animation, and the persistent new-order amber tint is correctly static (no pulsing). Nits only: redundant inline timing-function on the stepper (n-2) and un-gated 2px hover-arrow transforms (n-3).

## Clean-Code Review

PASSES. Largest new file `refund-modal.tsx` = 277 lines (under 400 soft / 1000 hard cap). No `any`, no compiler-silencing `!`, no empty `catch` (every catch narrows `instanceof Error` + logs with context), named constants throughout, paired `*-input.ts`/`*-write.ts` per the T12 gate, type contracts in `lib/admin/orders/` (not the T11 app inversion), es-MX-only admin copy. DRY vs T11: list/filters/pagination/dropdown/fields/dialog grammar reused verbatim. One cosmetic docstring to tidy (n-4).

## Quality Score: 8.5/10

Principal-grade backend discipline (transactional RPC, fail-closed revocation, correct idempotency, no injection/XSS/auth-bypass surface). Held back from 9+ by two real correctness bugs on the money/email surface (M-1 drops the refund "email not sent" signal; M-2 shows a wrong cancellation time), one unbounded read (M-3), and one dashboard count/link mismatch (M-4) — all straightforward fixes, none critical.

## Recommendation: REQUEST CHANGES → RESOLVED (Stage 6, ultrafix)

Original: not a block — no critical defect, money movement sound; M-1..M-4 must-fix.

**Stage 6 outcome:** all 4 majors FIXED and verified; all 6 minors FIXED (m-1 documented/accepted per the reviewer's own recommendation); 3 of 4 nits FIXED, n-1 SKIPPED (product-intent, not a defect). Migration 0013 added for M-3 and verified against a fresh `db reset` (0001..0013) + a functional RPC check. `tsc --noEmit` clean, `eslint` clean on all touched files, full unit suite 1495/1495 pass (+13 new tests: 10 for the `?new=1` filter seam, 3 for the refund `emailSent` propagation regression). All 30 ACs now PASS. Ready to advance to QA (Stage 7).
