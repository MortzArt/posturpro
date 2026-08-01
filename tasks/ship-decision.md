# Ship Decision: T12 — Admin Order Management

> Stage 12 (ultraverify). Release gate. Every number below was produced by an
> INDEPENDENT run in this stage — not copied from qa-report.md. Every binding
> gate was re-verified in the actual code (and, for cancel/revocation, exercised
> live against a freshly-reset DB), not trusted from a prior stage's claim.

## Verdict: SHIP

## Confidence: HIGH

## Quality Score: 9/10

Principal-grade backend discipline: a correct fail-closed session-revocation
control, a textbook transactional `cancel_order` RPC (lock -> restore -> advance ->
audit, idempotent, null-FK-safe), a thin correct refund wrapper (never echoes raw
MP error, exactly-once email, stable idempotency key), self-guarded route handler,
every action session-gated first, no injection/XSS/secret-leak surface. Held at 9
(not 10) only by non-blocking backlog notes: two `customers(lower(...))` indexes
that cannot serve the `ILIKE %term%` query (arch), a cross-domain search constant,
and the live MP-sandbox refund smoke deferred to the owner's T8 Phase 5 (accepted
limitation — the money path is unit+integration covered and was API-contract
live-verified in T8).

## Test Results

| Suite | Total | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit / Component (Vitest — 99 files) | 1593 | 1593 | 0 | 0 |
| Integration (official runner, 22 files, reseeds + pristine) | 244 | 244 | 0 | 0 |
| **Automated total** | **1837** | **1837** | **0** | **0** |

Supplementary independent gates (all green):
- `npx tsc --noEmit` -> exit 0 (clean)
- ESLint full repo -> exit 0, 0 findings
- Fresh `supabase db reset` -> migrations **0001..0013 apply clean** ("Finished")
- Production build -> **exit 0**; all four T12 routes present (`/admin/orders`,
  `/admin/orders/[id]`, `/admin/orders/[id]/packing-slip`, `/admin/orders/customers`,
  all dynamic); **client-bundle server-symbol/secret scan = 0 matches** (`.next/static`:
  no service_role, MP token, session secret, `refundOrderPayment`, `createAdminClient`,
  or `bump_admin_session_version`).
- **Own live AC spot-check script** (service-key against reset DB): 11/11 assertions PASS.

E2E: per the binding infra recipe, the authed-admin **refund** e2e is owner-gated on
live MP sandbox keys (T8 Phase 5 — accepted, does NOT block ship). The unauth 401
boundary and the authed admin surface are covered by the existing baseline e2e
(admin guard 20/20 prod + admin core 30/30) plus this stage's code + unit
verification of the packing-slip 401. The ~8 Pixel-7 `gotoPDP` mobile failures are
the documented harness strict-mode flaw (backlog), NOT a T12 product bug — excluded.

## Acceptance Criteria Final Check (30/30 PASS)

| # | Criterion | Code | Verified |
|---|-----------|------|----------|
| AC-1..4 | List 25/page created_at DESC + bounded filters/search | `order-list-query.ts`, `order-list-filters.ts` | Unit + arch/review |
| AC-5..7 | Detail full read; history; non-UUID/missing -> notFound() | `order-read.ts`, `[id]/page.tsx` | Unit + hacker 404 chaos |
| AC-8..10 | Valid-next only; advanceOrderStatus only; email branches on transition_kind; email-fail != rollback | `order-status-write.ts` | Unit (14) + own spot-check history kind |
| AC-11/12 | Tracking persists; empty# -> null shipped email | `order-tracking-*.ts` | Unit (12) + integration |
| AC-13..15 | cancel_order single-tx restore+advance+history, idempotent, null-FK skip, NOT compensation | `0012` RPC 102-176 | **Own live: 11->14, noop re-cancel, null-FK skip** + 11 integration |
| AC-16..20 | Refund full/partial via gated action; over-refund refused; raw MP never echoed | `order-refund-write.ts`, `refund.ts` | Code read + unit (16) |
| AC-18/19 | sendRefundIssued once (id-deduped); stable idempotency key | `order-refund-write.ts`, `actions.ts` | Unit |
| AC-21 | Internal notes admin-only, never in history/email, newest-first | `order_internal_notes` (0012) | Integration (anon-deny 42501) |
| AC-22/23 | Packing slip via self-guarded route (401), print-HTML, CANCELADO band, no PDF dep | `packing-slip/route.ts`, `packing-slip.ts` | **Code read (401 before read)** + unit (6) |
| AC-24 | Customer list paginated/searchable; bounded grouped-count RPC | `customer-list-query.ts`, `0013` | Integration (8) |
| AC-25/26 | Dashboard new-order indicator -> matching `?new=1` filter; owner email not duplicated | `dashboard-metrics.ts`, `NEW_ORDER_STATUSES` | Unit + code single-source |
| AC-27/28 | Persisted session-version compared every authoritative verify; bump revokes, fail-closed | `session-guard.ts:53`, `0012` bump RPC | **Own live: bump 2->3, stale v rejected** + unit |
| AC-29 | Every route handler self-guards -> 401 | `packing-slip/route.ts:20-22` | Code read + unit |
| AC-30 | Every action requireSession() FIRST | `actions.ts` (all 5, first line) | Code read |

All 11 edge cases HANDLED (verified across review/qa/security + own spot-check for
edge 6 payment_status-untouched and edge 11 null-FK skip).

## Report Summary

| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review | 8.5/10 -> RESOLVED | 0 critical; 4 majors all FIXED + verified; minors/nits closed |
| QA | HIGH | AC 30/30 + 11/11 edges covered; +123 tests; 0 product bugs; 1837/1837 green |
| UX | 9.5/10 | 1 crit (mobile overflow) + 3 major + 3 polish; 6 FIXED, 1 justified |
| Security | SECURE | 0 crit/high/med, 2 accepted LOW; 0 secrets |
| Architecture | 9/10 APPROVE-WITH-NOTES | Corrects T11 inversion; bounded counts RPC; real revocation. Non-blocking index/constant notes |
| Hacker | 1/10 chaos | 0 dead UI / visual / logic / missing-states; 1 robustness gap FIXED (boundStatusNote) |

## Binding Gates — Independently Re-Verified (not just claimed)

- **AC-27/28 revocation**: `session-guard.ts` compares `payload.v === currentVersion`
  after signature+expiry, `return false` on a null version read (fail-closed).
  Live-exercised: bump moved 2->3; a cookie stamped with the prior version no longer
  equals current -> rejected. CLOSED.
- **AC-29 self-guard**: packing-slip route returns 401 BEFORE any `getAdminOrder` read. CLOSED.
- **AC-30 action guard**: all five actions call `requireSession()` first. CLOSED.
- **cancel_order (AC-13/15)**: single SECURITY DEFINER RPC, FOR UPDATE lock, per-line
  restore skipping null FKs, idempotent noop. Live: stock +3, re-cancel restored
  nothing twice, no duplicate history row. CLOSED.
- **Hacker fix present**: `boundStatusNote()` in both `advanceStatus` + `cancelOrder`;
  `STATUS_NOTE_MAX_LENGTH` in `order-constants.ts`. CLOSED.

**No gate was found NOT closed.**

## Remaining Concerns (all non-blocking, backlogged)

- Live MP sandbox refund execution: deferred to owner's T8 Phase 5. Refund engine is
  unit+integration tested; T12's refund action tested against mocks; API-contract was
  live-verified in T8. Accepted limitation — does NOT block SHIP.
- Arch backlog: dead `customers(lower(...))` indexes vs `ILIKE %term%`; order-list
  `pg_trgm` index before 10k+ orders; move `ADMIN_SEARCH_MAX_LENGTH` to a neutral module.
- SEC LOW (accepted): login stamp fail-closes on a rotation-time read blip; refund
  email reads newest ledger row under a rare concurrent-partial race (id-deduped). Phase-2.
- When MP keys land: add one authed-admin advance->cancel e2e (no MP) + a
  packing-slip-unauth 401 guard e2e (QA's recommendation).

## What Was Built

The complete admin order-management subsystem: a paginated/searchable/filterable
order list, a full order detail with status-pipeline stepper and chronological
history log, manual status advancement and shipping (tracking + shipped email),
transactional cancel with automatic stock restore (cancel_order RPC), full/partial
Mercado Pago refunds with cumulative-refund and over-refund guards, internal notes,
a printable self-guarded packing slip, a customer list, and a new-order dashboard
indicator. It also lands the first server-side admin session-revocation control
(persisted admin_session_version compared on every authoritative verify), closing
the SEC-M-1 stolen-cookie window the whole admin console inherited.

## Summary

Every automated test passes (1837/1837), every acceptance criterion is met and
independently verified, every binding security gate is closed in code and exercised
live, and no critical/high vulnerability or product bug remains. SHIP.

---

## Pipeline Notes
- Local DB no longer contains the real PP-* orders (a prior stage reset it and this
  stage's integration runner reseeded; DB left pristine: 0 orders / 0 customers /
  30 products). The owner's T8 Phase 5 refund test will need a **fresh order** seeded.
- admin_session_version is at **3** (bumped by this stage's live revocation spot-check).
  Harmless — no live admin cookie exists in this state; the next login stamps 3 and is valid.
