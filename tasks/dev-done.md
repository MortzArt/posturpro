# Dev Summary: T12 — Admin Order Management

Stage 4 (ultradev). Full-stack, full-feature. **47 files created, 10 modified.**
`tsc` clean · `eslint` clean (full repo) · migration 0012 applies cleanly (fresh
`db reset` 0001..0012) · unit 1482/1482 · integration 219/219 · prod build green ·
0 server symbols in the client bundle.

## Files Changed

### Migration
| Path | Change | Summary |
|------|--------|---------|
| `supabase/migrations/0012_admin_orders.sql` | created | (a) `orders` tracking cols (nullable text, outside the 0003 frozen set — verified mutable); (b) `order_internal_notes` table (RLS-deny + service_role, 1..2000 CHECK); (c) `cancel_order(uuid,text)` transactional RPC (lock → stock restore skipping null FKs → advance to cancelled with `transition_kind` via `email_transition_kind` → idempotent no-op) SECURITY DEFINER + empty search_path + service_role-only; (d) `admin_session_version` single-row source + `bump_admin_session_version()` RPC (AC-27 revocation); (e) `customers` lower(email)/lower(full_name) search indexes. |

### Types
| Path | Change | Summary |
|------|--------|---------|
| `src/lib/supabase/types/tables-commerce.ts` | modified | `orders` gains tracking cols (Row/Insert/Update); new `order_internal_notes` + `admin_session_version` table types. |
| `src/lib/supabase/types/rpc.ts` | modified | `CancelOrderArgs`/`CancelOrderResult` + `bump_admin_session_version` in `DatabaseFunctions` (kept `type` aliases — T8 never-collapse gotcha). |

### Session revocation (AC-27/28 gate)
| Path | Change | Summary |
|------|--------|---------|
| `src/lib/admin/session-version.ts` | created | `getAdminSessionVersion()` (React `cache`, per-request; `null` → fail-closed) + `bumpAdminSessionVersion()`. |
| `src/lib/admin/session-payload.ts` | modified | `encodePayload(iat, version=ADMIN_SESSION_VERSION)`; `decodePayload` now validates `v` as a finite number only (equality moved to the guard). |
| `src/lib/admin/session.ts` | modified | `createSessionCookieValue(nowSeconds, version=…)`; new `verifiedSessionPayload()` seam returning the verified payload. |
| `src/lib/admin/session-guard.ts` | modified | `hasValidAdminSession()` = signature+expiry THEN persisted-version equality (revocation); fails closed on a version-read error. |
| `src/app/admin/actions.ts` | modified | Login stamps the current persisted version into the minted cookie. |
| `src/lib/admin/session-guard.test.ts` / `session-payload.test.ts` | modified | Updated to the new codec contract + 2 new revocation tests (mismatch → false, null → false). |

### Lib — `src/lib/admin/orders/` (18 files, all created)
`order-status-meta.ts` (single-sourced labels/glyphs/variants/allowed-transition map/kind labels) · `order-list-filters.ts` + `order-list-query.ts` (mirror products, meta-char-stripped search) · `order-read.ts` (order+items+history+notes+refunded_total, section-isolated) · `order-status-input.ts`/`order-status-write.ts` (advanceOrderStatus + email branch on `transition_kind`) · `order-tracking-input.ts`/`order-tracking-write.ts` · `order-cancel-write.ts` (cancel_order RPC + sendCancelled) · `order-refund-input.ts`/`order-refund-write.ts` (first caller of `refundOrderPayment`, stable key, sendRefundIssued) · `order-notes-write.ts` · `customer-list-filters.ts`/`customer-list-query.ts` (batched order counts, no N+1) · `packing-slip.ts` (pure escaped print-HTML builder) · `dashboard-metrics.ts` · `order-action-types.ts` · `order-constants.ts` (client-safe note-length const).

### App — `src/app/admin/(app)/` (created unless noted)
`orders/page.tsx` (list + error banner) · `orders/loading.tsx` · `orders/actions.ts` (5 session-gated actions) · `orders/[id]/page.tsx` (detail) · `orders/[id]/loading.tsx` · `orders/[id]/packing-slip/route.ts` (self-guarded 401) · `orders/customers/page.tsx` · `page.tsx` **modified** (redirect stub → dashboard).

### Components — `src/components/admin/orders/` (18 files, all created)
`order-status-badge` · `payment-status-badge` · `order-table` · `order-filters` · `order-empty-state` · `order-row-actions` · `list-pagination` · `order-status-stepper` · `order-history-log` · `order-detail-actions` · `order-actions-panel` · `refund-modal` · `cancel-order-dialog` · `tracking-form` · `internal-notes` · `customer-table` · `customer-filters` · `new-order-indicator`.

### Nav
| Path | Change | Summary |
|------|--------|---------|
| `src/lib/admin/constants.ts` | modified | Orders nav `soon`→`live`; added `ADMIN_ORDERS_PATH` + `ADMIN_CUSTOMERS_PATH`. |

## AC Coverage (30/30)
- **AC-1..4 (list/search/filter):** `order-list-query` (25/page, created_at DESC, formatted MXN, badge pair) + pure bounded `parseOrderListFilters` (search meta-char-stripped, enums constrained). ✓
- **AC-5..7 (detail/history/404):** `getAdminOrder` full read; `OrderHistoryLog` chronological newest-first; non-UUID/missing → `notFound()`. ✓
- **AC-8..10 (status→email):** allowed-transition map offers only valid next; `advanceOrderStatus` only path; email branches on returned `transition_kind` (shipped→sendShipped, cancelled→sendCancelled); email failure ≠ rollback, surfaced as `emailSent:false`. ✓
- **AC-11/12 (tracking):** `setTracking` persists cols; empty tracking number allowed → shipped email `trackingNumber:null`; URL validated. ✓
- **AC-13..15 (cancel/restore):** `cancel_order` single SQL transaction (verified live: product 10→13, variant 7→9, payment_status stays paid, `transition_kind='cancelled'`, idempotent re-cancel = noop, null-FK skip). NOT compensation. sendCancelled once. ✓
- **AC-16..20 (refund):** `RefundModal` two-step (compose → typed REEMBOLSAR), first caller of `refundOrderPayment`, full→refunded/partial→paid, over-refund/mp-error friendly (raw MP never echoed). ✓
- **AC-18/19 (email once / idempotency):** sendRefundIssued deduped on MP refund id; stable per-open/submit key (`refund:{orderId}:{uuid}`). ✓
- **AC-21 (notes):** `order_internal_notes`, newest-first, never in history/email. ✓
- **AC-22/23 (packing slip):** self-guarded route (401 unauth, 404 missing), print-HTML `@media print`, CANCELADO band, no PDF dep. ✓
- **AC-24 (customers):** paginated list, email/name search, order counts (batched, no N+1). ✓
- **AC-25/26 (dashboard):** `NewOrderIndicator` (live count of pending_payment/paid), links to filtered list; owner email stays at checkout, not duplicated; no per-request marker. ✓
- **AC-27/28 (revocation):** persisted `admin_session_version` compared to cookie `v` on every authoritative verify; bump revokes all; revoked → false with no further access (tested). Live BEFORE refund ships. ✓
- **AC-29 (route self-guard):** packing-slip calls `hasValidAdminSession()` at entry → 401. ✓
- **AC-30 (action guard):** every action `requireSession()` FIRST. ✓

## Data-Testids Added (selection)
`admin-orders-table/search/count/pagination/error/empty`, `admin-order-row-{id}`, `order-actions-{id}`, `order-status-{s}`, `payment-status-{s}`, `order-stepper`, `order-history`, `order-detail-actions`, `advance-status-trigger`, `advance-to-{s}`, `refund-open/modal/mode-full/mode-partial/amount/continue/confirm-input/submit/error`, `cancel-open/cancel-order-dialog/cancel-confirm/cancel-shipped-warning`, `tracking-form/tracking-save`, `internal-notes/internal-note-save`, `order-action-banner`, `partial-refund-note`, `admin-customers-table/search`, `dashboard-new-orders`, `packing-slip-open`.

## Key Decisions
- **Session revocation via persisted `admin_session_version`** (research's pick) over max-age shortening — a real "log out everywhere". Read cached per-request; enforced at the async Node guard, Edge pre-check untouched.
- **Codec decoupled from version equality:** `decodePayload` accepts any finite `v`; the guard owns the persisted-equality check — required so a bumped-version cookie is a *revocation*, not a *decode failure*.
- **`ListPagination` generalized** (hrefFor builder) to serve both order + customer lists without duplicating `AdminPagination`.
- **`order-constants.ts`** holds the client-safe note-length constant so client components never import a `server-only` write module (build-enforced — the prod build caught + fixed this).
- **Packing slip = escaped print-HTML**, no PDF dependency (research-confirmed).

## Deviations from Ticket
- None. Every listed file/AC delivered; refund action is gated behind the now-live revocation (AC-27 order honored).

## Edge Cases Handled
1. Over-refund → `over-refund` friendly, no state change (refund.ts + record_refund). 2. PP-000005 duplicates → refund targets single `mp_payment_id`, balance line never implies more. 3. Cancel-after-shipped → allowed (rank 5) + `alreadyShipped` warning. 4. Double-transition race → RPC `FOR UPDATE` + `noop_same_status` (no 2nd email). 5. Regressive transition → not offered; forced → `regression_blocked` → "Transición no permitida". 6. Refund on cancelled-but-paid → Refund stays enabled + helper line. 7. Email-send failure → committed, `emailSent:false`, "correo no enviado". 8. Cancelled packing slip → CANCELADO band, still self-guarded. 9. Stolen cookie post-refund → version bump revokes. 10. Concurrent partials → record_refund rejects 2nd, "error" → reconcile message. 11. Since-deleted product/variant → cancel skips null FK (verified live).

## How to Test
1. `npm run db:seed` (30 products). Log in at `/admin`. Dashboard shows new-order count.
2. `/admin/orders` — search/filter/paginate; row → detail.
3. Detail: advance status (Avanzar), Ship (tracking form → advance to Enviado → shipped email), Cancel (AlertDialog → stock restore), Refund (two-step modal → typed REEMBOLSAR).
4. `/admin/orders/[id]/packing-slip` in a new tab (print). Log out → 401.
5. Bump `admin_session_version` in DB → the current admin cookie is instantly rejected on the next request.

## Known Limitations
- New-order indicator is a live count (pending_payment/paid), not a "since last viewed" marker — simplest AC-25/26-compliant form (no marker to persist).
- Refund is single-payment (`orders.mp_payment_id`); PP-000005's 2 extra charges are a manual MP-dashboard action (out of scope, UI never implies otherwise).

## Dependencies Added
- None. Reused shadcn Dialog/AlertDialog/Badge/Button, `@hugeicons`, `refundOrderPayment`/`advanceOrderStatus`/email seams, list/pagination patterns.

## Risks for Review (Stage 5)
- **Session codec contract change** touches the shared trust boundary — the Edge middleware still does a fast pre-check that does NOT do the revocation read (by design; the authoritative Node guard does). Reviewer should confirm the Edge/Node asymmetry is acceptable (it matches the existing defense-in-depth split).
- **`refund-modal.tsx` partial amount** is whole-pesos (× 100 → cents); confirm no fractional-centavo expectation.
- **`cancel_order` leaves `payment_status` untouched** by design (edge 6) — reviewer should confirm a cancelled+paid order SHOULD remain refundable.
- **Dashboard new-order count** semantics (pending_payment OR paid) — confirm "paid but not yet advanced" is the intended definition of "new".
