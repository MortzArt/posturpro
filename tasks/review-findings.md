# Code Review + Fix: T18 — Admin customer detail page

## Summary

Single-pass adversarial review of S3 commit `b4ba22c` (6 created, 3 modified, 3 test
files). The implementation is a clean, faithful pattern-copy of the T12 order grammar.
**Zero critical, zero major, zero code-defect minor issues.** The one construct that
looked like a critical bug on first read — the `dedupeAddresses` key delimiter — is
actually correct (the delimiter is a NUL byte ` `, not a space, verified at byte
level). AC-9 keying agreement, the 0014 grant posture, section-isolation, and integer-cents
money all verified in code and against the live DB. No fixes were required.

## Issues Found & Resolved

### Critical Issues

None.

### Major Issues

None.

### Minor Issues

#### m-1: `dedupeAddresses` NUL-byte delimiter is invisible/undocumented in source rendering

- **File**: `src/lib/admin/orders/customer-read.ts:258`
- **Observation**: The dedup key is `[...fields].join(" ")`. The delimiter is a
  literal NUL control byte, which renders as an invisible/space character in most
  editors and in `Read`/`sed`/`cat` output — making the source line *look* like
  `.join(" ")` (a space), which WOULD be a real collision bug (`"a b"+" "+"c"` ==
  `"a"+" "+"b c"`). It is in fact ` `, which cannot occur in any Postgres text
  column here, so the key is genuinely field-safe and the delimiter-boundary unit test
  (`customer-read.test.ts:85`) legitimately passes. Verified: byte dump shows
  `6a 6f 69 6e 28 22 00 22 29` (`join("\0")`); the pure function returns length 2 for
  the boundary case under vitest.
- **Status**: SKIPPED — not a defect; behavior is correct and covered by a test. A code
  comment already exists at line 244 ("a delimiter that cannot appear inside the values").
  A one-line clarification that the delimiter is ` ` (not the space it visually
  resembles) would aid future readers, but the JOIN uses the invisible byte deliberately
  and changing it (e.g. to a visible `" "` escape literal) is a cosmetic edit with
  regression risk on a green test — not worth touching in this pass. Noted for backlog.

#### m-2: Inlined `Panel` / `TotalRow` duplicated from the order-detail page

- **File**: `src/app/admin/(app)/orders/customers/[id]/page.tsx:96,106`
- **Observation**: `Panel` and `TotalRow` are copied verbatim from `orders/[id]/page.tsx`.
  This is the SECOND copy of each helper.
- **Status**: SKIPPED — explicitly sanctioned by the ticket and ui-design.md ("Copies the
  order-detail Panel/TotalRow helpers verbatim"; the order page itself inlines
  ContactPanel/ItemsPanel/PaymentPanel). Per CLAUDE.md DRY-with-judgment, two copies do
  not yet warrant a shared extraction. Backlog note: extract a shared admin `Panel` /
  `TotalRow` (e.g. `components/admin/panel.tsx`) at the THIRD consumer.

## Acceptance Criteria Verification

| #     | Criterion | Status | Evidence |
| ----- | --------- | ------ | -------- |
| AC-1  | List name cells link (desktop + mobile), focusable, focus style | PASS | `customer-table.tsx:44-52,66-73` — both `<Link>`s to `${ADMIN_CUSTOMERS_PATH}/${row.id}`, `focus-visible:underline`, `data-testid`; test `customer-table.test.tsx` asserts 2 links + focus + email-not-a-link |
| AC-2  | Detail renders in shell + back-link to `ADMIN_CUSTOMERS_PATH` | PASS | `page.tsx:51-58` back-link `customer-back-link` → `ADMIN_CUSTOMERS_PATH`; route under `(app)` |
| AC-3  | Identity: name, email via `isMailableAddress`, phone or "—" | PASS | `page.tsx:59-67` — name, `isMailableAddress` branch → "Sin correo" italic, phone omitted when null (spec allows omit; ContactPanel also shows it) |
| AC-4  | Order history: one row/order, `created_at DESC`, number/date/total/badges + `paymentBadgeIsRedundant` | PASS | `customer-read.ts:143` `.order created_at desc`; `page.tsx:177-217` table with all fields + `paymentBadgeIsRedundant` suppression |
| AC-5  | Each history row links to `${ADMIN_ORDERS_PATH}/{order.id}` | PASS | `page.tsx:196,227` |
| AC-6  | Contact & addresses: distinct shipping addresses de-duped | PASS | `page.tsx:248-293` ContactPanel; `dedupeAddresses` full-tuple key (`customer-read.ts:246`) |
| AC-7  | Lifetime totals: count (== list), total spent, first/last dates | PASS | `TotalsPanel` `page.tsx:115-132`; totals from 0014 RPC |
| AC-8  | Total spent in integer cents, format at edge only | PASS | `sum(o.total_cents)`→bigint in 0014; `Number(row.total_cents)` int; `formatMXN` only at render (`page.tsx:120`). Integration test asserts `Number.isInteger` + exact 429000 |
| AC-9  | Detail count EQUALS list count for same id | PASS | 0013 and 0014 filter identically: `where customer_id = ...`, no status/soft-delete divergence, same grouping. Integration test line 154-165 asserts `row.order_count === listCount` |
| AC-10 | Non-UUID / missing → `notFound()`, never 500 | PASS | `customer-read.ts:80` `UUID_PATTERN` guard → null before any DB call; `maybeSingle` → null on miss; `page.tsx:44-46` → `notFound()` |
| AC-11 | Admin-only under `(app)` guard; unauth → login | PASS | Route at `admin/(app)/...`; `(app)/layout.tsx:23-24` `hasValidAdminSession()` → redirect |
| AC-12 | All chrome es-MX, neutral admin theme | PASS | All strings hardcoded es-MX; no `.theme-storefront`; admin primitives |
| AC-13 | Server-only, admin client, never throws to page; section failures scoped | PASS | `import "server-only"`; `createAdminClient`; `readHistory`→null on error, `readTotals`→EMPTY_TOTALS; page try/catch → error branch; `getAdminCustomer` outer try/catch → null |
| AC-14 | Integration + unit tests; tsc + eslint clean; suites green | PASS | 9/9 integration (isolated run, incl. anon-denial + AC-9), 11/11 new unit; tsc 0, eslint 0; full unit 2001/2001 |
| AC-15 | 0014 idempotent, security definer, empty search_path, service_role-only; rpc.ts `type` aliases | PASS | Migration verified verbatim-0013 posture; `rpc.ts` uses `type` aliases (not interface). Live DB: anon=f, service_role=t, public=f |

## Edge Case Verification

| #  | Edge Case | Status | Evidence |
| -- | --------- | ------ | -------- |
| 1  | N orders, 0 paid → total = order value, not paid-only | HANDLED | 0014 never filters by status; integration test line 141-151 (2 non-paid orders → total 80000) |
| 2  | Sentinel customers not collapsed (keyed by id) | HANDLED | Read keys on `customers.id`; integration test line 195-211 (two sentinel customers, distinct counts) |
| 3  | Very long history → bounded read + truncation footer; totals over ALL | HANDLED | `.limit(CUSTOMER_ORDER_HISTORY_LIMIT=50)`; `ordersTruncated` (`customer-read.ts:208`); footer `page.tsx:152-156`; totals from RPC over all orders |
| 4  | Differing addresses → each distinct once, most-recent-first | HANDLED | `dedupeAddresses` keeps first occurrence, input newest-first; unit + integration tested |
| 5  | Zero orders / orphaned customer_id | HANDLED | RPC returns count 0/total 0/NULL dates; empty history panel; no divide-by-zero. Integration test line 180-192 |
| 6  | null contact_phone / null line2 | HANDLED | phone omitted when null (`page.tsx:65,260`); line2 omitted in AddressBlock (`page.tsx:286`) |
| 7  | Hostile / injection id | HANDLED | `UUID_PATTERN` guard → null before any DB call; p_customer_id is typed `uuid` (no string injection surface) |

## AC-9 Verdict

**PASS — agree by construction.** The list count (`admin_customer_order_counts`, 0013)
does `count(*) ... where o.customer_id = any($ids) group by o.customer_id`. The detail
aggregate (`admin_customer_aggregates`, 0014) does `count(*) ... where o.customer_id =
p_customer_id`. Same table (`public.orders`), same filter column, no status filter, no
soft-delete filter, no off-by-one on either side. Both key strictly on `customer_id`,
never email/phone. The integration test seeds N orders for one id and asserts
`aggregate.order_count === listCount` directly (line 154-165), and also asserts the
zero-order case reconciles (both show 0, line 191).

## Environmental-Issue Verdict

**Genuinely environmental, NOT a code bug — and less severe than the dev-done write-up
implies.** Independently verified:

1. **0014 SQL grants are correct** — `revoke all ... from public` + `grant execute ... to
   service_role`, no anon/authenticated grant. Byte-identical posture to 0013.
2. **Live DB confirms the posture holds** — `has_function_privilege` on the running local
   instance returns `anon=f, service_role=t, public=f` for `admin_customer_aggregates`.
3. **The anon-denial integration test PASSES** on the currently-running DB (migrations
   applied via `supabase migration up --local`, not `db reset`): the full T18 integration
   file runs **9/9 green, including the anon-denial test**. The dev-done note said this
   test "fails identically" due to a stray `pg_default_acl` from the aborted `db reset`;
   that ACL is not present on this instance, so the test passes here. The `db reset`
   container conflict (analytics/Studio `schema_migrations_pkey`) is a real environmental
   artifact, but it does not make T18 code wrong and does not need chasing. No fix.

## Fix Summary

- Critical: 0/0 fixed
- Major: 0/0 fixed
- Minor: 0/2 fixed, 2 SKIPPED (both justified: m-1 not-a-defect, m-2 ticket-sanctioned copy)

## Quality Score: 9/10

Faithful, complete, well-tested pattern-copy. Every AC and edge case verified in code and
(for the DB-touching ones) against the live database — not trusted from dev-done. AC-9
integrity holds by construction and is asserted. Money is integer-cents end to end.
Section isolation and the UUID→notFound guard mirror the shipped order-read exactly. One
point off only for the NUL-delimiter's invisible-in-source rendering (a legibility trap
for future maintainers, though functionally correct) and the acknowledged 2nd-copy
Panel/TotalRow duplication now on the DRY radar.

## Recommendation: APPROVE

No critical or major issues to fix; both minors are justified skips (one is a non-defect,
one is explicitly ticket-sanctioned with a backlog note). Gates green: tsc 0, eslint 0,
unit 2001/2001, T18 integration 9/9 (isolated). Proceed to S5 (QA, ultraqa) — the
standard-tier quality gate. Suggested QA focus: re-confirm AC-9 and the anon-denial on a
clean CI reset if the local `db reset` container conflict can be cleared; exercise the
375px mobile card layout and long-history truncation footer live.
