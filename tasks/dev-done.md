# Dev Summary: T18 — Admin customer detail page

Standard tier, Stage S3 (ultradev). Feature type: full-stack (logic-heavy).
Complexity: low. Pattern-copy on the fully-built T12 substrate.

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `supabase/migrations/0014_admin_customer_aggregates.sql` | created | `admin_customer_aggregates(p_customer_id uuid)` RPC → single row `(order_count bigint, total_cents bigint, first_order_at timestamptz, last_order_at timestamptz)` over ALL the customer's orders. Verbatim 0013 posture: `security definer` + pinned empty `search_path` + `revoke from public` + `grant execute to service_role`. `stable`, idempotent (`create or replace`). `sum(total_cents)`→bigint = exact integer math (AC-8); zero-order customer → count 0 / total 0 / NULL dates. |
| `src/lib/supabase/types/rpc.ts` | modified | Added `AdminCustomerAggregatesArgs` + `AdminCustomerAggregatesRow` **`type` aliases** (never `interface` — T8 gotcha) and the `admin_customer_aggregates` entry in `DatabaseFunctions`. |
| `src/lib/config/admin-products.ts` | modified | Added `CUSTOMER_ORDER_HISTORY_LIMIT = 50` (named const; bounds the history read below PostgREST's 1000-row cap — edge 3). |
| `src/lib/admin/orders/customer-read.ts` | created | `server-only` `getAdminCustomer(id): Promise<AdminCustomerDetail \| null>`. Clone of `order-read.ts`: `UUID_PATTERN`→`null`→`notFound()`; core `customers` read; section-isolated `Promise.all([readHistory, readTotals])` (either failing degrades, never throws to the page — AC-13). History bounded + newest-first (index-backed by `orders_customer_id_idx`). Totals from the 0014 RPC over ALL orders. Exports the PURE `dedupeAddresses` (dedup on full tuple, most-recent-first — AC-6/edge 4). |
| `src/lib/admin/orders/customer-read.test.ts` | created | Unit test for `dedupeAddresses`: empty→[], collapse-identical, distinct-most-recent-first, single-field-difference-is-distinct, delimiter-boundary safety, nullable line2 preserved. |
| `src/app/admin/(app)/orders/customers/[id]/page.tsx` | created | Server component (`dynamic = "force-dynamic"`). `try/catch`→top-level error branch; `getAdminCustomer`→`null`→`notFound()`. Single-column composition: back-link → identity (name/email-via-`isMailableAddress`/phone) → `TotalsPanel` → `OrderHistoryPanel` (desktop table + mobile cards, linked order numbers, `paymentBadgeIsRedundant` suppression, empty/section-error/truncated branches) → `ContactPanel` (contact + de-duped addresses). Copies the order-detail `Panel`/`TotalRow` helpers verbatim. |
| `src/app/admin/(app)/orders/customers/[id]/loading.tsx` | created | Opacity-only pulse skeleton (back-link + identity bars + 3 panel skeletons), cloning the order-detail `loading.tsx` shape for the single-column layout. |
| `src/components/admin/orders/customer-table.tsx` | modified | AC-1: wrapped the name cell (desktop `<td>` + mobile card `<p>`) in a `Link` to `${ADMIN_CUSTOMERS_PATH}/${row.id}` with `focus-visible:underline` + `data-testid={`admin-customer-row-${row.id}`}`; added `nav-hover hover:bg-muted/40` to the desktop `<tr>`. Email stays plain `select-text`. Imported `Link`; updated the "Rows do NOT link" docstring. |
| `src/components/admin/orders/customer-table.test.tsx` | created | AC-1 unit test: both desktop + mobile name links carry the right `href` + `data-testid`, focus affordance present, email is NOT a link, empty page renders no links. |
| `tests/integration/admin-customer-detail.integration.test.ts` | created | Live-DB integration test (serviceClient + tracked cleanup): aggregate count/int-cents-sum/first-last; **count-equals-list invariant** (AC-9, vs `admin_customer_order_counts`); null-customer exclusion; 0-paid customer sums order value (edge 1); zero-order shape (edge 5); email-less sentinel keyed by id never merged (edge 2); `dedupeAddresses` (AC-6/edge 4); anon-denied grant. |

**Counts:** 6 files created, 3 modified. 1 migration (0014). +3 test files (2 unit, 1 integration).

## Data-Testids Added
- `customer-back-link` — back-link to Clientes (page.tsx)
- `admin-customer-detail-error` — top-level read-failure alert (page.tsx)
- `customer-history-error` — section-scoped history-read-failed banner (page.tsx)
- `customer-history-empty` — zero-orders empty state (page.tsx)
- `customer-history-truncated` — "Mostrando los N más recientes de M" footer (page.tsx)
- `customer-order-row-{id}` — desktop history order-number link (page.tsx)
- `customer-order-card-{id}` — mobile history order-number link (page.tsx)
- `admin-customer-row-{id}` — customer-list name link, desktop + mobile (customer-table.tsx)

## Key Decisions
- **Migration ADDED (0014 RPC)** over an in-app aggregate query: the history read is bounded, so totals MUST be computed separately over ALL orders. Summing an unbounded PostgREST select would hit the same 1000-row cap 0013 exists to dodge. The RPC is one round-trip, exact, and mirrors 0013's security posture verbatim (research "RPC preferred").
- **Route param = raw `customers.id` UUID** — the detail's order set (`orders WHERE customer_id = id`) equals the list's count by construction (AC-9). Never keyed on email/phone (would merge distinct one-row-per-order customers).
- **"Total gastado" = sum of ALL order totals** (not paid-only) so the headline reconciles with the visible history + the list count (edge 1).
- **`dedupeAddresses` exported + pure** — testable without the DB; the DB-touching `getAdminCustomer` is covered by the live integration test.
- **Single readable column** (`flex flex-col gap-6`) at all breakpoints per the binding ui-design.md (low content volume; order history is the tallest section and wants full width).

## Deviations from Ticket
- None. The ticket/ui-design permitted either an RPC or an in-app aggregate; I chose the RPC (the recommended option). `CUSTOMER_ORDER_HISTORY_LIMIT` placed in the existing `config/admin-products` module (re-exported from `@/lib/config`) rather than a new file — consistent with the ticket's "small admin constants module" note and avoids a one-const file.

## Edge Cases Handled
- **Edge 1 (0-paid customer)**: totals sum order *value* regardless of payment status — asserted in the integration test; the RPC never filters by status.
- **Edge 2 (sentinel not collapsed)**: keyed on `customers.id`; two sentinel customers with differing phones each show only their own order — integration test + live spot-check ("Sin correo").
- **Edge 3 (long history)**: history bounded by `CUSTOMER_ORDER_HISTORY_LIMIT`; `ordersTruncated` → "Mostrando los N más recientes de M"; totals still reflect ALL M (from the RPC).
- **Edge 4 (differing addresses)**: `dedupeAddresses` on the full tuple, most-recent-first — unit + integration tested.
- **Edge 5 (zero orders / orphaned)**: RPC returns count 0 / total 0 / NULL dates; empty history panel; no divide-by-zero, no 500 — integration test.
- **Edge 6 (null phone / line2)**: phone omitted when null; line2 omitted from the address block when null.
- **Edge 7 (hostile id)**: `UUID_PATTERN` guard → `null` → `notFound()` before any DB call — live spot-check (`not-a-uuid` → 404).
- **AC-13 (section isolation)**: `historyFailed` renders a scoped `role="alert"` banner while totals/contact still render.

## How to Test
1. Log in at `/admin/login` (`admin@posturpro.mx` / `posturpro-dev-2026`).
2. Go to `/admin/orders/customers`; click a customer NAME → lands on `/admin/orders/customers/{id}` with identity, "Totales del cliente", "Historial de pedidos (N)" (linked order numbers → order detail), "Datos de contacto y envío".
3. Open an email-less manual customer → shows "Sin correo" (not the invalid literal).
4. Visit `/admin/orders/customers/not-a-uuid` and `/admin/orders/customers/11111111-1111-1111-1111-111111111111` → in-shell 404.
5. Resize to 375px → history renders as cards; no horizontal overflow.

## Known Limitations
- No history pagination (Phase-1 one-row-per-order reality; the truncation footer is the honest signal above `CUSTOMER_ORDER_HISTORY_LIMIT`). Documented in ui-design.md; a future ticket can add `ListPagination` if real volume demands it.
- Read-only view (editing/merging/deleting customers are explicitly out of scope).

## Dependencies Added
- None.

## Verification Status
- `npx tsc --noEmit`: **clean** (whole project).
- `eslint` on all 9 touched files: **clean**.
- Full unit suite: **2001 passed / 119 files** (+17 across the two new unit files).
- New unit tests: 11/11. New integration tests: **9/9** (`admin-customer-detail`); `admin-customer-counts` co-run 6/6 → 15/15 for the two customer-RPC files.
- Live spot-check on :3000 (minted admin session cookie): good customer → full detail w/ linked order; sentinel → "Sin correo"; non-UUID + missing-UUID → in-shell 404; customers list rows carry `admin-customer-row-{id}` links (AC-1).

### Environment note (NOT a T18 defect)
The FULL integration suite showed 8 residual failures unrelated to T18: the local
`supabase db reset` aborts on an **analytics/Studio container** Ecto migration
conflict (`schema_migrations_pkey`), so the reset never re-runs migrations in the
canonical role context. That leaves (a) storage buckets unprovisioned (the
`admin-storage` / image-reconciliation failures) and (b) a stray `pg_default_acl`
that auto-grants `EXECUTE` to `anon` on every new function — which makes the
"denied to the anon role" test fail **identically** for `admin_customer_aggregates`
(0014, mine), `admin_customer_order_counts` (0013), `cancel_order` (0012), and
`create_order` (0008). Proof it is environmental and my SQL is correct:
`has_function_privilege('public', 'admin_customer_aggregates', 'execute') = false`
(my `revoke from public` worked); after clearing the stray default ACL the two
customer-RPC files pass **15/15** including both anon-denial tests. On a clean CI
reset (historically 253/253 green) these pass. No T18 code change can or should
"fix" this — the RPC posture is verbatim 0013.

## Review + Fix Pass (S4 ReviewFix Stage, standard tier)

Single-pass adversarial review of `b4ba22c`. **0 critical, 0 major, 0 code-defect
minors.** No fixes required. APPROVE, 9/10. Details in `tasks/review-findings.md`.

### Issues Found & Fixed

| ID  | Severity | Title | Status  | File | Fix Applied / Justification |
| --- | -------- | ----- | ------- | ---- | --------------------------- |
| m-1 | MINOR | `dedupeAddresses` NUL-byte delimiter invisible in source | SKIPPED | `customer-read.ts:258` | Not a defect. The `.join()` delimiter is a NUL byte ` ` (byte-verified `join("\0")`), not the space it visually resembles — genuinely field-safe; boundary unit test passes. Changing the byte to a visible escape is cosmetic with regression risk on a green test. Backlog: add a clarifying comment. |
| m-2 | MINOR | Inlined `Panel`/`TotalRow` duplicated (2nd copy) | SKIPPED | `page.tsx:96,106` | Ticket + ui-design.md explicitly sanction the verbatim copy; DRY-with-judgment says extract at the 3rd consumer. Backlog: shared admin `Panel`/`TotalRow` when a 3rd page needs them. |

### Verifications (independently run, not trusted from S3)

- **AC-9 (count-equals-list):** PASS by construction. 0013 and 0014 both `count(*)
  ... where customer_id = ...` over `public.orders`, no status/soft-delete divergence,
  same keying. Integration test asserts `aggregate.order_count === listCount`.
- **Environmental issue:** Confirmed env artifact, NOT a code bug. Live-DB
  `has_function_privilege` = `anon=f / service_role=t / public=f` for
  `admin_customer_aggregates`; the anon-denial integration test **passes** on the
  running DB (9/9 whole file). The `db reset` container conflict is real but does not
  affect T18 correctness. No fix.
- **0014 grant posture:** verbatim 0013 (`revoke all from public` + `grant execute to
  service_role`); `rpc.ts` uses `type` aliases, not `interface`.
- **Money:** integer cents end to end (`sum(total_cents)`→bigint, `Number(...)`,
  `formatMXN` at edge only). AC-8 holds.
- **Section isolation / never-500:** UUID guard before any DB call; `readHistory`→null,
  `readTotals`→EMPTY_TOTALS on error; page try/catch → error branch. AC-13 holds.

### Gates (re-run this stage)

- `tsc --noEmit`: **0 errors** (whole project).
- `eslint` on all 9 touched files: **clean**.
- Full unit suite: **2001/2001** (119 files) — no regression (no code change made).
- T18 integration (isolated, against running local DB via `migration up`): **9/9**,
  including the anon-denial and the AC-9 invariant.

### Summary

- Critical: 0/0 fixed
- Major: 0/0 fixed
- Minor: 0/2 fixed, 2 SKIPPED (both justified)

Next: S5 QA (ultraqa) — standard-tier quality gate.
