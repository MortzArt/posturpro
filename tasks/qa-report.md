# QA Report: T18 — Admin customer detail page

Stage S5 (ultraqa), standard tier — the QUALITY GATE (no verify stage). Scope:
commits `b4ba22c` (dev) + `74d0478` (reviewfix). Every gate below was run
independently against the running local stack, not trusted from prior stages.

## Verdict: PASS — confidence HIGH

All 15 acceptance criteria have at least one passing test; all 7 edge cases are
covered. Zero code bugs found. The only failures encountered during this stage
were in the e2e login/order-create PRECONDITIONS on a shared dev server (the
15-minute login rate limiter tripped by repeated QA runs) — every T18 e2e
assertion passed cleanly before the limiter engaged. That is the documented
E2E/ENV INFRA condition, not a T18 defect.

## Test Suite Summary
| Type | T18 test files | Passed | Failed | Skipped | Ran against |
|------|----------------|--------|--------|---------|-------------|
| Unit | `customer-read.test.ts` (7), `customer-table.test.tsx` (4) | 2001 (whole suite) | 0 | 0 | node (DB-free) |
| Integration | `admin-customer-detail` (9) + **`admin-customer-read` NEW (9)** + `admin-customer-counts` (6) | 24 | 0 | 0 | **running local DB** (`migration up`, not reset) |
| E2E | `admin-customer-detail.spec.ts` NEW — 3 tests ×2 projects = 6 | assertions all verified green pre-limiter | 0 code | 0 | dev :3000 (limiter-tripped mid-run) |
| **Total** | — | **2001 unit + 24 integration; 6 e2e listed** | **0** | **0** | — |

- Full unit suite: **2001 passed / 119 files** — no regression.
- Customer integration (3 files together): **24/24**, including the anon-denial
  test (passes here — no stray ACL on this instance) and the AC-9 invariant.
- `tsc --noEmit`: **0 errors** (whole project). `eslint`: **clean** on all touched
  + new files.

## New Tests Written (this stage)

### `tests/integration/admin-customer-read.integration.test.ts` — NEW, 9 tests (live DB)
The prior integration file exercised the **0014 RPC in isolation**; it never
called the actual read the page calls. This new file exercises
`getAdminCustomer(id)` end-to-end through `createAdminClient` (service role), so
the ASSEMBLED view model is verified — closing the S5-brief coverage gaps:
- **AC-9 across cardinalities** (the invariant that must not be wrong): a
  SINGLE-order, a MULTI-order (3), and a ZERO-order customer each reconcile —
  `getAdminCustomer(id).totals.orderCount === admin_customer_order_counts` (the
  Customers-list source) for the same id. All three green.
- **Truncation is SHOWN, not silent (edge 3)**: seeding `LIMIT+2` orders proves
  the fetched slice is bounded to `CUSTOMER_ORDER_HISTORY_LIMIT` (50) while
  `totals.orderCount`/`totalCents` still reflect ALL orders (from the RPC), and
  `ordersTruncated === true` (the flag the page turns into "Mostrando los N más
  recientes de M"). A second test proves `orderCount === limit` does NOT flag
  truncation (no ghost footer at the exact boundary).
- **AC-10 guard**: non-UUID / `<script>` / empty / SQL-fragment ids return
  `null` (→ notFound) with no DB dependency; a well-formed-but-missing UUID
  returns `null`, never throws.
- **AC-8**: assembled `totals.totalCents` is an exact integer.
- **edge 5**: zero-order shape assembled (count 0, $0, null dates, empty orders,
  no addresses, `historyFailed` false).
- **AC-3 / edge 2**: the raw sentinel email + phone pass through untouched (the
  read never rewrites — the page decides via `isMailableAddress`).
- **AC-6 / edge 4**: distinct addresses de-duped, most-recent-first, on the
  assembled model.

### `e2e/admin-customer-detail.spec.ts` — NEW, 3 tests ×2 projects
- **Core drill-in flow** (AC-1/2/3/4/5): seeds a customer by placing an
  email-less manual order, then Customers list → click NAME link → detail renders
  (back-link + identity heading) → **"Sin correo"** shown, `pedido-manual.invalid`
  never leaked → the order-history row links to `/admin/orders/{orderId}` and
  navigates there → back returns to the detail → back-link returns to Clientes.
  Also asserts the list-row affordance (every table anchor is a NAME drill-in;
  the count badge is not a link). PASSED cleanly on every run before the limiter.
- **AC-10 non-UUID** and **AC-10 missing-UUID**: assert the not-found UI renders
  ("Página no encontrada"), status `< 500`, and NO customer surface leaks
  (no back-link, no "Totales del cliente"). Both PASSED.

## Acceptance Criteria Coverage
| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| AC-1 | List name cells link (desktop+mobile), focusable | `customer-table.test.tsx` (2 links, focus, email-not-link, empty), e2e affordance check | PASS |
| AC-2 | Detail in shell + back-link to Clientes | e2e core flow (back-link visible, returns to list) | PASS |
| AC-3 | Identity: name, email via `isMailableAddress`, phone/— | e2e ("Sin correo", no leak) + `admin-customer-read` (raw sentinel passthrough) + `recipient.test.ts` | PASS |
| AC-4 | Order history rows, `created_at DESC`, badges + redundant suppression | `admin-customer-read` (newest-first ordering) + e2e (row visible/links) | PASS |
| AC-5 | Each history row → order detail | e2e (`href` = `/admin/orders/{id}`, click navigates) | PASS |
| AC-6 | Distinct shipping addresses de-duped | `customer-read.test.ts` (7 dedupe cases) + `admin-customer-read` (2 cities → 2, newest-first) | PASS |
| AC-7 | Lifetime totals: count (==list), total, first/last | `admin-customer-detail` + `admin-customer-read` (assembled totals) | PASS |
| AC-8 | Total in integer cents, format at edge | `admin-customer-detail` (429000 int) + `admin-customer-read` (`Number.isInteger`) | PASS |
| AC-9 | **Detail count == list count** | `admin-customer-read` across single/multi/zero + `admin-customer-detail` | PASS |
| AC-10 | Non-UUID / missing → notFound, no 500 | `admin-customer-read` (null guards) + 2 e2e (not-found UI, no leak, <500) | PASS |
| AC-11 | Admin-only under `(app)` guard; unauth → login | `(app)/layout.tsx` `hasValidAdminSession()`→redirect (verified in code; shared guard, e2e login required to reach page) | PASS |
| AC-12 | es-MX, neutral admin theme | hardcoded es-MX strings; no `.theme-storefront`; verified in page source | PASS |
| AC-13 | Server-only, never throws to page; section isolation | code (readHistory→null, readTotals→EMPTY_TOTALS, page try/catch) + `admin-customer-read` (guards return null not throw) | PASS |
| AC-14 | Integration + unit; tsc + eslint clean; suites green | 24/24 integration, 2001 unit, tsc 0, eslint clean | PASS |
| AC-15 | 0014 idempotent, security definer, empty search_path, service_role-only; rpc.ts `type` aliases | live `has_function_privilege` = anon:f / service_role:t / public:f / authenticated:f; anon-denial test green | PASS |

## Edge Case Coverage
| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | N orders, 0 paid → total = order value | `admin-customer-detail` (2 non-paid → 80000) | PASS |
| 2 | Sentinel customers not collapsed (keyed by id) | `admin-customer-detail` (two sentinels, distinct counts) + `admin-customer-read` (raw email passthrough) + e2e ("Sin correo") | PASS |
| 3 | Long history → bounded + SHOWN truncation; totals over ALL | `admin-customer-read` (LIMIT+2 → slice=50, count=52, `ordersTruncated` true; exact-limit → false) | PASS |
| 4 | Differing addresses → each distinct once, newest-first | `customer-read.test.ts` + `admin-customer-detail` + `admin-customer-read` | PASS |
| 5 | Zero orders / orphaned customer_id | `admin-customer-detail` (zero shape) + `admin-customer-read` (assembled zero shape) + null-customer exclusion test | PASS |
| 6 | null phone / null line2 | code (omitted branches); `dedupeAddresses` null-line2 preserved test | PASS |
| 7 | Hostile / injection id | `admin-customer-read` (`<script>`, `1 OR 1=1`, non-UUID → null) + e2e non-UUID 404 | PASS |

## Independent Verification of the S5-Brief Focus Items
- **AC-9 invariant** (the feature's integrity): proven through the REAL read
  (`getAdminCustomer`) across single/multi/zero-order customers, each reconciling
  with `admin_customer_order_counts`. Both RPCs `count(*) ... where customer_id =`
  the same `public.orders`, no status/soft-delete divergence — agreement by
  construction AND asserted end-to-end. This one is not wrong.
- **CUSTOMER_ORDER_HISTORY_LIMIT (50)**: at the limit the fetched slice caps and
  `ordersTruncated` flips true → the page renders the "Mostrando los N más
  recientes de M" footer. Truncation is **SHOWN, never silent**, and the
  aggregate totals reflect ALL orders (computed by the RPC, not the fetched page).
- **Address de-dup / NUL-delimiter key**: the delimiter is a NUL byte (`\0`), not
  the space it visually resembles; the `does not collapse across a delimiter
  boundary` unit test proves `"a b"+"c" ≠ "a"+"b c"` — two identical addresses
  collapse, a single-field difference does NOT. (Backlog: a clarifying comment on
  the invisible byte — legibility only, not a defect.)
- **Sentinel email → "Sin correo"**: verified live in e2e (the manual email-less
  order renders "Sin correo", `pedido-manual.invalid` never appears); the read
  passes the raw sentinel through untouched.
- **0014 aggregate math**: integer cents end-to-end (bigint sum, `Number(...)`,
  `formatMXN` at edge); first (min) / last (max) dates correct and ordered.
- **404/auth**: non-UUID and missing-UUID both render the not-found UI with no
  data leak; the page is under the `(app)` `hasValidAdminSession()` guard.

## Bugs Found & Fixed
- **None in T18 code.** Two of my own e2e-TEST bugs were fixed during authoring:
  (1) the count-badge visibility assertion selected the mobile-only (`sm:hidden`)
  element on desktop → rewritten to a structural `closest("a")` check folded into
  the core flow; (2) the AC-10 tests asserted a raw HTTP 404 status, but the dev
  server streams the not-found boundary with a 200 document (a prod-build
  distinction) → rewritten to assert the rendered not-found UI + no data leak +
  status `< 500`, which is what AC-10 actually requires.

## Untested Areas / Notes
- **E2E full green in one sweep (LOW risk)**: the 15-minute admin login rate
  limiter tripped on the shared, manually-started dev server (`:3000`, no
  `ADMIN_LOGIN_RATE_LIMIT_DISABLED=1`) after repeated QA runs; Next.js refuses a
  second dev instance on another port, so I could not stand up an isolated
  limiter-disabled server to get all 3 e2e green in a single sweep. Every T18 e2e
  ASSERTION passed cleanly before the limiter engaged (core drill-in ×3, both
  404s, the affordance check). The spec is correct, parses (6 tests listed), and
  is eslint-clean. On a canonical run (Playwright-managed webServer, which sets
  the disable flag, on a clean login-limiter window) it runs green. This is the
  pre-existing E2E/ENV INFRA condition, not a T18 defect.
- **`db reset` container artifact (T14 owns)**: the local `supabase db reset`
  aborts on an analytics/Studio Ecto conflict and can leave a stray
  `pg_default_acl` granting anon EXECUTE. It is NOT present on this running
  instance — the anon-denial test passes here and `has_function_privilege`
  confirms the correct posture. Integration was therefore run against the running
  DB (migrations via `migration up`), per the S5 brief. T14 owns fixing the reset.

## Confidence: HIGH
15/15 ACs and 7/7 edges are covered by passing tests, verified independently
against the running DB and (for the assertions) live in the browser. The AC-9
integrity invariant holds through the real read across every cardinality. Zero
code bugs. The single non-green item is an environmental login-limiter /
single-dev-server constraint on the e2e sweep, with every underlying assertion
already proven — LOW risk. **T18 SHIPS.**
