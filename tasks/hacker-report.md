# Hacker Report: T12 — Admin Order Management

> Stage 11 (ultrahacker). Full-cycle, complexity HIGH. Live chaos against the real
> T12 admin surface (localhost:3000) driven by Playwright + direct SQL edge-data
> seeding. MP left unreachable/unexercised (owner's Phase-5 refund pass reserved) —
> the refund path was chaosed up to but NOT through the money-moving REEMBOLSAR
> submit. DB left in a sane state (see DB State Note).

## Summary

- Dead UI found: **0**
- Visual bugs: **0** (the floating "N" is the Next.js dev-mode indicator, not app UI — ruled out; dev-only)
- Logic bugs: **0**
- Missing states: **0** (loading/empty/error/404/0-item/no-orders all present)
- Robustness gaps found & FIXED: **1** (unbounded status-history note — cancel reason / advance note)
- Items fixed: **1**
- Product improvements suggested: **5**

The T12 surface is **exceptionally robust**. The upstream stages (Review/Fix/QA/UX)
had already closed the big-ticket items (mobile horizontal overflow, refund
`emailSent` propagation, customer-count truncation, dashboard count/link parity).
Every chaos vector below — URL tampering, garbage input, two-tab races, XSS,
malformed ids, empty sets, viewport 320→200%-zoom — was handled correctly. The
single new finding is a defense-in-depth consistency gap, not an exploitable break.

## Dead UI

| # | Element | File:Line | Issue | Fixed? |
|---|---------|-----------|-------|--------|
| — | (none) | — | Every button/link/menu on list, detail, customer list, packing slip, row-actions ⋮ menu, filters, dialogs is wired. 0 `href="#"`/dead links across detail (8 links), list (13), customers (6). | ✅ n/a |

## Visual Bugs

| # | Issue | File:Line | Viewport | Fixed? |
|---|-------|-----------|----------|--------|
| — | No horizontal overflow at 320 / 375 / desktop on list, detail (incl. long-content + XSS + RTL order), customers, packing slip. Long strings `break-words`; hostile customer name truncates with ellipsis in the list. | — | 320–1280 | ✅ n/a |
| i | The dark circular **"N"** overlapping the bottom-left (all admin pages) is the **Next.js dev-mode indicator** (dev-only shadow-DOM portal), NOT app markup. Does not ship to production. | — | all | Not a bug |

## Logic Bugs

| # | Bug | File:Line | Steps to Reproduce | Fixed? |
|---|-----|-----------|---------------------|--------|
| — | Two-tab advance race → **exactly one** history row (RPC `FOR UPDATE` + idempotent `noop_same_status`); both tabs report success, no double email. | `advance_order_status`/`cancel_order` RPC | Open same order in 2 tabs, advance to `paid` simultaneously | ✅ already safe |
| — | Double-click advance / note-save → single write (button disabled during `useTransition`; menu closes). Verified 1 history row, 1 note. | `order-detail-actions.tsx`, `internal-notes.tsx` | Rapid double-click confirm | ✅ already safe |
| — | Rapid filter toggling during pagination → converges to a consistent state, no 500, page resets. | `order-filters.tsx` | Toggle status select 6× fast | ✅ already safe |
| — | Back/forward mid-flow → detail re-renders intact. | — | list → detail → back → forward | ✅ already safe |

## Missing States

| # | Component | State | File:Line | Present? |
|---|-----------|-------|-----------|----------|
| 1 | Orders list | Empty (`admin-orders-empty`), page-beyond-range clamp, zero-result search | `order-empty-state.tsx`, `order-list-query.ts` | ✅ |
| 2 | Order detail | 0-item order ("Artículos (0)", $0.00), no-history ("Sin historial."), no-notes ("Sin notas."), notes/history section-read-failure banners | `orders/[id]/page.tsx`, `internal-notes.tsx` | ✅ |
| 3 | Detail 404 | Non-UUID (`banana`), malformed (`aaaa-…-8000`), non-existent UUID, `<script>` → localized 404 "Página no encontrada", never 500 (AC-7) | `orders/[id]/page.tsx`, `order-read.ts` | ✅ |
| 4 | Customers | No-orders customer (count 0), empty search set | `customer-table.tsx` | ✅ |
| 5 | Packing slip | 0-item ("Sin artículos."), cancelled ("CANCELADO" band), 401 unauth | `packing-slip.ts`, `packing-slip/route.ts` | ✅ |

## Security / Injection (all defended)

- **XSS:** `<script>alert(1)</script>` in customer name, `<img src=x onerror=alert(1)>` in
  product name, `<script>` in SKU — all render as **literal escaped text** on the detail
  page AND the raw-HTML packing slip. Zero `alert()` dialogs fired. (React escaping +
  `packing-slip.ts` escaper.)
- **SQL/PostgREST injection:** `'; DROP TABLE orders;--` and `%_()*.:\,` in order search
  and customer search are meta-char-stripped (`order-list-query.ts` m-3 defense) → benign
  no-match, no error.
- **URL param tampering:** `?page=-1|0|banana|99999|1e9` clamp; `?status=garbage`,
  `?payment=' OR 1=1`, `?new=banana`, repeated `?status=paid&status=cancelled`,
  `?page[]=…` arrays → all bounded by `parseOrderListFilters` (200, correct sets, no 500).
- **Auth:** unauth `/admin/orders*` and `/admin/orders/customers` → 307 → login;
  post-logout access → login. `javascript:` tracking URL rejected server-side.
- **Refund modal:** garbage amounts (`abc`,`1.5`,`-100`,emoji,`0`,`1e9`,whitespace) disable
  Continue; over-refund pre-checked; confirm gated on `REEMBOLSAR` (lowercase accepted);
  modal resets (fresh idempotency key) on reopen. No MP call made.

## Fix Applied (1)

**[ROBUSTNESS] Unbounded status-history note (cancel reason + manual-advance note).**
`order_status_history.note` is `text` with **no DB length CHECK**, and both
`cancel_order` (RPC) and `advanceOrderStatus` insert the caller-supplied note
verbatim. The cancel reason is ALSO emailed to the customer. The client textareas
cap at 2000 via `maxLength`, but that is a client-only guard (bypassable by a
scripted/compromised client, and inconsistent with `order_internal_notes`, which
has a `1..2000` DB CHECK). A large note would persist forever and be emailed
unbounded.

- `src/lib/admin/orders/order-constants.ts` — added `STATUS_NOTE_MAX_LENGTH = 2000`
  with a doc note explaining the missing DB CHECK and the trim-to-cap (not reject) policy.
- `src/app/admin/(app)/orders/actions.ts` — new `boundStatusNote()` helper (trim →
  null-if-empty → `slice(0, cap)`); applied in `advanceStatus` (replacing the inline
  trim) and `cancelOrder`. Bounds the note server-side before it reaches the RPC/email.
- `src/components/admin/orders/cancel-order-dialog.tsx` — reason textarea `maxLength`
  now references `STATUS_NOTE_MAX_LENGTH` (semantic clarity; same 2000 value).

**Verified live:** cancelled a 0-item order with a 2000-char reason → history note
stored at 1999 chars (trimmed+clamped), status `cancelled`, no error on the empty
stock-restore path. `tsc` clean · eslint clean · orders unit 102/102 · admin unit 294/294.

## Product Improvements (backlog — not implemented)

| # | Improvement | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | **Live character counter** on the internal-note / cancel-reason / advance-note textareas (e.g. `1980 / 2000`). Users currently discover the 2000 cap only by silent `maxLength` truncation; a counter prevents surprise mid-compose. | Med | S | P2 |
| 2 | **Multi-payment refund UI for PP-000005-style orders** (3 duplicate approved MP payments). Today refund targets a single `mp_payment_id`; the extra charges are a manual MP-dashboard action. A per-payment refund picker (list each approved payment + its refundable balance) would close the only manual-money gap and prevent "why is $X still charged?" support tickets. | High | M | P1 |
| 3 | **Bulk actions on the orders list** (multi-select → "Advance to preparing", "Print packing slips", "Export"). Fulfilling 25 orders one-detail-page-at-a-time is the Owner's most repetitive daily task; a select-column + action bar is a 10x speedup for launch-day volume. | High | M | P1 |
| 4 | **Undo window for cancel** (5-second "Pedido cancelado — Deshacer" toast that re-advances + re-decrements before the cancelled email is dispatched). Cancel is destructive (stock restore + customer email); a soft undo prevents fat-finger cancellations from mailing customers. | High | M | P2 |
| 5 | **Keyboard-first order triage:** `/` focuses search, `j/k` move row selection, `Enter` opens detail, `e` advances status, `p` prints slip. Power-Owner throughput; matches the Linear-tier bar the UX audit set. | Med | M | P3 |

## Chaos Score: 1 / 10

(Lower = more robust.) One non-exploitable robustness gap (unbounded history note),
now fixed. No dead UI, no visual defects, no logic bugs, no missing states, no XSS,
no injection, no race double-writes. The surface absorbed every hostile input,
malformed URL, viewport extreme, and concurrent-tab race thrown at it.

## Tests After Fixes

- `tsc --noEmit`: **clean (exit 0)**
- ESLint (touched files): **clean (exit 0)**
- Unit (orders): **102 / 102 pass**
- Unit (all admin — `src/app/admin` + `src/lib/admin`): **294 / 294 pass**
- Live verification: 0-item cancel with 2000-char reason → note bounded to 1999, no error.

## DB State Note

- **Started:** the local Supabase had **0 orders / 0 customers** (a prior stage had reset
  it; the real PP-000001..PP-000006 sandbox orders were already absent — NOT deleted by me).
- **During:** seeded 7 `CHAOS-0000NN` orders (normal-paid, pending, shipped+tracking,
  cancelled+history, **0-item**, **hostile/XSS/RTL/long-content**, delivered-linked-to-customer)
  + 3 customers (one no-orders, one long-RTL name) covering every edge. A few chaos orders
  were mutated by the tests (pending→paid, paid→preparing, empty→cancelled).
- **Left:** **all CHAOS-* orders/items/history/notes and all seeded customers DELETED.** DB
  is back to the pristine empty state it was found in (verified: 0/0/0/0/0). No real PP-*
  order was touched. No MP refund API call was made.
