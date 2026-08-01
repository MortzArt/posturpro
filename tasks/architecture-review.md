# Architecture Review: T12 — Admin Order Management

Stage 10 (ultraarch). Read-only architectural audit. Scope: commits `81b168e`, `70e8e1b`, `10994db`, `01e042b` — migrations 0012/0013, `src/lib/admin/orders/*`, `src/components/admin/orders/*`, `src/app/admin/(app)/orders/*`, the session-revocation trust-boundary change, and the dashboard.

## Summary

Principal-grade backend architecture. T12 adopts the T11 list/pagination/paired-write templates faithfully, corrects T11's known lib→app type inversion, lands a correct fail-closed session-revocation mechanism, and implements the money/inventory-critical paths (refund, `cancel_order`) exactly per the binding ADRs — cancel as a single transactional SQL RPC, refund as a thin idempotency-threading wrapper over the existing guarded path. The subsystem will still make sense in 6 months. Two real notes carry forward: the customer-search indexes added in 0012 cannot serve the query shape they were added for (leading-wildcard `ILIKE`), and a shared list-search constant is now owned by the `products` domain, softly coupling two admin domains that were meant to stay disjoint. Neither blocks ship.

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns (render / hook / lib) | ✅ | Components render + do local UX validation only; all derivation/money math/validation imported from `lib/admin/orders/`. No DB calls, no fetch, no status-rank logic inline (`refund-modal.tsx`, `order-detail-actions.tsx`, `internal-notes.tsx`, `tracking-form.tsx` all delegate). |
| Boundary validation | ✅ | `parseOrderListFilters` / `parseRefundInput` / `parseTrackingInput` / `parseStatusTransition` are pure, bounded, enum-constrained. Every action `UUID_PATTERN`-guards ids; refund amount guarded by `INT4_MAX` + `Number.isInteger` + `> 0` (`order-refund-input.ts:33-38`). DB CHECK on `order_internal_notes.body` (1..2000) is the ultimate authority. |
| Typed contracts (lib, not app) | ✅ | Action result types live in `src/lib/admin/orders/order-action-types.ts` — **T11's lib→app inversion is corrected**. Zero imports of `@/app/*` from any `lib/admin/orders/` module (verified). Contrast: T11's `products-form-state.ts` still sits in the app dir. |
| Service layer (page → action → write → RPC) | ✅ | `page.tsx` → `actions.ts` (`requireSession()` first) → `*-write.ts` (`server-only`) → RPC/`refund.ts`/`advance-order.ts`. Clean, one direction. |
| Type safety (no `any`, no `!`) | ✅ | RPC `type` aliases in `rpc.ts` preserve the T8 never-collapse fix. The `FilterableQuery` structural cast is a scoped, documented `as unknown as` at the PostgREST generic boundary (same posture as T11) — not an `any` escape. |
| shadcn / client-server split | ✅ | shadcn Dialog/AlertDialog/Badge reused; no `"use client"` component imports a `server-only` `*-write.ts` (verified). `order-constants.ts` exists precisely to give clients the note-length constant without pulling a server module — a deliberate, build-enforced seam. |
| RPC-only status transitions | ✅ | `order-status-write.ts` calls `advanceOrderStatus` only; no raw `.update({status})` anywhere. `cancel_order` advances status inside SQL. |
| `transition_kind`-driven email | ✅ | Email branches on the RPC-returned `transition_kind` (`order-status-write.ts:71,115-124`), never string-matches the note. Single-sourced via `email_transition_kind` in SQL. |

## Data Model Review

**Migration 0012** — schema quality is high. `order_internal_notes` is correctly modeled: `on delete cascade` FK, DB-authoritative length CHECK, RLS-deny + explicit `service_role` grant (created after the 0005 point-in-time grant, so the explicit grant is necessary and present), composite `(order_id, created_at desc)` index matching the newest-first read exactly. Tracking columns are nullable text outside the 0003 immutability-trigger frozen set — verified allowed, and the migration documents the reasoning inline. `cancel_order` is a textbook transactional RPC: `FOR UPDATE` lock → idempotent already-cancelled no-op → per-line stock restore skipping null FKs → status advance + history insert with single-sourced `transition_kind` → `SECURITY DEFINER` + pinned empty `search_path` + `service_role`-only execute. Mirrors `create_order` in reverse as specified. `admin_session_version` is a DB-enforced singleton (`id integer primary key check (id = 1)`), `version bigint >= 1`, seeded idempotently, with a `bump_admin_session_version()` RPC that upserts-and-increments atomically.

**Migration 0013** — `admin_customer_order_counts(uuid[])` is a `STABLE` grouped-count RPC returning ≤25 rows, correctly replacing the original unbounded per-row tally that would have truncated at PostgREST's 1000-row cap. Same hardened posture.

**Index coverage — the one real gap.** See Scalability. `orders` inherits `created_at`, `status`, `customer_id` indexes from 0003 (cover the default sort, `?status=`, `?new=` `IN`, and the dashboard count). There is **no index on `orders(payment_status)`** (the `?payment=` filter seq-scans) and the two `customers(lower(email))` / `lower(full_name))` indexes added in 0012 **cannot serve the actual query** (`email.ilike.%term%` — leading wildcard, and against raw `email`, not `lower(email)`). History and notes growth is per-order-bounded and index-covered; no concern.

## API Review

No REST surface added beyond one route handler — the design is server-actions-first, consistent with T10/T11.

- **`GET /admin/orders/[id]/packing-slip`** — self-guards with `hasValidAdminSession()` at entry → 401, `force-dynamic`, `Cache-Control: no-store` (PII), friendly 404/500 with raw errors logged not echoed. Mirrors `products/export/route.ts` exactly (AC-29). Correct.
- **Server actions** — every one calls `requireSession()` as its first statement before any DB touch (AC-30, verified across all five in `actions.ts`). Result shapes are typed discriminated unions (`{ ok: true, ... } | { ok: false, reason }`); raw MP errors are mapped to a friendly `reason` bucket in `order-refund-write.ts`, never surfaced (AC-20). Idempotency key is validated non-empty in the action and threaded stably from the client per open/submit cycle (AC-19).
- **Pagination** — every list read is two-phase count→clamp→range at 25/page via the shared `catalog/pagination.ts`. No unbounded list read remains after the 0013 fix.

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| Order-list **search is leading-wildcard `ILIKE`** on `order_number`/`contact_email`/`shipping_full_name` — no b-tree index can serve it; every search full-scans `orders` | Med (Low at launch) | At 10k+ orders add a `pg_trgm` GIN index on the searched columns, or restrict to a prefix/exact `order_number` fast-path. Fine for launch volume; note for the first scale ticket. |
| **0012 `customers(lower(email))` / `lower(full_name)` indexes are effectively dead** — the query is `email.ilike.%term%` (leading wildcard, raw column), which a functional b-tree index cannot use | Low | Either drop the two indexes (they cost write-time maintenance for zero read benefit) or convert to `pg_trgm` GIN and keep the query. Current state is misleading — indexes that imply coverage they don't provide. |
| No index on **`orders(payment_status)`** — `?payment=` filter seq-scans | Low | Add a partial or plain index if payment-filtered browsing becomes common; negligible at launch. |
| **Dashboard count on every visit** (`force-dynamic` → `countNewOrders` runs per request) | Low | It's a HEAD count over the indexed `status IN (...)` — cheap and bounded. Acceptable. Consider a short revalidate window only if the dashboard gets hot. |
| **Notes / history unbounded growth** | Low | Both are per-order bounded in practice and index-covered by `(order_id, created_at desc)`. Detail read fetches all of one order's rows (no pagination) — fine for a single-owner store; a pathological hundreds-of-notes order is not a real threat. |
| **Refund under concurrent admins** | Low | Correctly delegated: MP idempotency key + `record_refund` order-locked cumulative guard + `payment_refunds` unique-on-refund-id. The write layer adds no new race; second concurrent partial is rejected race-safely (edge 10). Session-revocation bump is the compromise kill-switch. |

## Tech Debt Ledger

| Item | Type | Impact | Effort to Fix |
|------|------|--------|---------------|
| `customers(lower(...))` indexes don't match the `ILIKE %term%` query (dead / misleading) | Introduced | Low | S |
| Order-list search un-indexable at scale (`pg_trgm` deferred) | Introduced (known) | Med at scale | M |
| `ADMIN_SEARCH_MAX_LENGTH` imported by `orders`/`customers` filters **from the `products` domain** (`order-list-filters.ts:10`, `customer-list-filters.ts:6`) — cross-domain coupling the T11 arch review wanted "disjoint by construction" | Introduced | Low | S |
| `FilterableQuery` structural-typing dance + `applyFilters` shape duplicated per domain (orders/customers/products) rather than a shared generic helper | Existing (from T11) | Low | M |
| Two pagination components now coexist (`ListPagination` generalized for orders/customers vs T11's product-specific `AdminPagination`) | Introduced (justified) | Low | S — fold `AdminPagination` into `ListPagination` in a T11-touch ticket |
| Refund idempotency key lost on client remount (m-1, accepted) — server-derived key is the Phase-2 hardening | Existing (documented) | Low | M |
| ADR-1 compensation→`create_product_with_links` RPC at multi-admin trigger (T11 carry) | Existing | Med | L |

**Debt reduced by T12:** corrected T11's lib→app type inversion (types now in lib); replaced the original unbounded customer-count tally with a bounded RPC (0013); added a real session-revocation control that closes the SEC-M-1 stolen-cookie window the whole admin console inherited.

## Module Boundaries

- **Dependency direction is clean** — no `lib/admin/orders/*` file imports from `app/`. Flow is strictly page → action → write → RPC. (Verified by grep.)
- **No circular dependencies.** Shared machinery (`catalog/pagination.ts`, `lib/money`, `lib/config` `INT4_MAX`/`UUID_PATTERN`, `payments/refund.ts`, `payments/advance-order.ts`, `email/dispatch.ts`) is consumed one-directionally.
- **Client/server boundary enforced** — no client component reaches a `server-only` module; type-only imports (e.g. `AdminInternalNote`) are compile-time-erased and safe.
- **One coupling smell:** the orders and customers domains borrow `ADMIN_SEARCH_MAX_LENGTH` from `products`. It should live in a neutral `src/lib/admin/constants.ts` (or a `list.ts`) so no admin domain owns another's constant. Minor.
- **File sizes** — all T12 files ≤ 301 lines; largest are `refund-modal.tsx` (301) and `order-read.ts` (295), both single-responsibility with internal helpers, no god objects. Well under the 400 soft / 1000 hard cap.

## ADR Notes (for future stages / tasks to inherit)

- **ADR — `cancel_order` (transactional RPC) vs T11 compensation (ADR-1): boundary is now articulated.** Precedent set: **inventory/money-critical, multi-row atomic mutations use a single `SECURITY DEFINER` SQL RPC** (`create_order`, `record_inventory_adjustment`, now `cancel_order`) — lock, mutate, audit, all-or-nothing, idempotent. The **app-level compensation pattern (delete-then-restore-on-error) is retained only for the pre-existing product-write path** and is itself slated to collapse into `create_product_with_links` at the multi-admin trigger (ADR-1). Rule of thumb for T13/T14: if stock or money moves, it is a transaction in SQL, never app-level compensation. This boundary is documented in pipeline-state and now demonstrated by a second RPC that follows it.
- **ADR — session-version revocation (SEC-M-1 / ADR-2) is the multi-admin foundation.** The design is deliberately decoupled: the crypto-free codec (`session-payload.ts`) validates only that `v` is a finite number; the persisted-equality check is I/O and lives at the authoritative Node guard (`session-guard.ts`), memoized per-request via React `cache`. A bumped version is therefore a *revocation*, not a *decode failure*. Fail-closed on a version-read error (`getAdminSessionVersion() === null` → not authed). The Edge pre-check stays fast and does NOT do the revocation read — an accepted defense-in-depth asymmetry (authoritative Node verify owns revocation). This single global counter is the seam a future per-admin/per-user session table (ADR-2) grows from; the `bigint` counter is future-proof, the JS `number` carry is documented-safe until bumps become high-frequency.
- **ADR — `NEW_ORDER_STATUSES` single-sourcing.** `["pending_payment","paid"]` is defined once (`order-list-filters.ts:37`) and consumed by the dashboard count, the `?new=1` list seam, and the indicator link — so the count and the list it links to are provably one definition (M-4). Any future "new order" surface must consume this constant, not re-list the statuses.

## Refactors Applied

None — this stage is read-only per orchestrator instruction (runs in parallel with Stage 9 Security). All findings are documented for the backlog / a future scale ticket, not edited.

## Architecture Score: 9/10

Backend is principal-grade and will read cleanly to a new engineer in 6 months: the write layers are thin and single-purpose, the RPCs are correct and consistently postured, the trust-boundary change is minimal and fail-closed, and the T11 templates were followed *and improved* (inversion corrected, pagination generalized, counts bounded). One point off for the index/query mismatch on customer search (indexes that don't serve their query is a genuine, if low-impact, data-model defect) and the cross-domain constant coupling. Neither is a correctness or security issue; both are cheap to resolve.

## Recommendation: APPROVE-WITH-NOTES

Ship. Track as non-blocking backlog:
1. **`customers(lower(email))`/`lower(full_name)` indexes vs the `ILIKE %term%` query** — drop them or convert to `pg_trgm` GIN so index and query agree (S).
2. **Order-list `pg_trgm` search index** before 10k+ orders (M) — the only true scale cliff.
3. **Move `ADMIN_SEARCH_MAX_LENGTH` to a neutral `admin/` module** so orders/customers don't import it from `products` (S).
4. Fold `AdminPagination` into the generalized `ListPagination` next time the product list is touched (S, Boy-Scout).
