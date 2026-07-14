# Ship Decision: T7 — Checkout & Order Creation

## Verdict: SHIP

> **⚠️ HUMAN-REVIEW GATE (BUILD_PLAN rule 3) — DOES NOT AUTO-MERGE.**
> Checkout is ALWAYS flagged for human review before merge, regardless of this
> SHIP verdict. The pipeline MUST NOT auto-merge and MUST NOT check `[x]` T7 in
> `BUILD_PLAN.md`. The green verdict below means the code cleared every automated
> gate; the merge decision is the user's. See "Human-Review Gate" section for the
> exact list the reviewer should look at first.

## Confidence: HIGH

## Quality Score: 9/10

Deducted 1 point only for accepted, LOW/documented items (best-effort per-instance
rate limiter pending a distributed one at T8+; two accepted UX deviations; a
tamper-only duplicate-line LOW with no financial impact) plus one pipeline-hygiene
discrepancy I found and fixed (see Discrepancies). No CRITICAL or HIGH open.

## Test Results (all run by me in this Verify session)
| Suite | Total | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit / Component (Vitest) | 924 | 924 | 0 | 0 |
| Integration (Vitest, local Docker Supabase) | 137 | 137 | 0 | 0 |
| Checkout E2E (Playwright, PROD build) | 24 | 24 | 0 | 0 |
| **Total** | **1085** | **1085** | **0** | **0** |

- Static gates: `eslint` clean, `tsc --noEmit` clean, `next build` clean for BOTH
  locales — `/[locale]/checkout` prerenders static (es-MX + en), the confirmation
  route `/[locale]/checkout/confirmacion/[token]` is dynamic (ƒ). Exactly as spec.
- E2E ran against a **production build** in a separate dist dir
  (`NEXT_QA_DIST_DIR=.next-t7-verify`, `next start`, `CHECKOUT_RATE_LIMIT_DISABLED=1`)
  on freshly-reseeded local Docker Supabase: 12×chromium + 12×mobile, 24/24 green.
- The documented pre-existing T3/T4 PDP "resolved to 2 elements" flake is NOT in the
  checkout spec; I ran the checkout spec in isolation and it was deterministically
  green, so it does not gate T7.

## Acceptance Criteria Final Check (16/16 PASS)
| # | Criterion | Code | Verified By | Verdict |
|---|-----------|------|-------------|---------|
| AC-1 | `/checkout` + `/en/checkout` render flow w/ shipping math | `checkout/page.tsx`, `checkout-flow-client.tsx`, `checkout-summary.tsx` (reuses `cart/shipping.ts`) | e2e "renders fields, summary, correct flat-rate totals" (chromium+mobile) | ✅ |
| AC-2 | Empty cart → empty-state + catalog CTA, no submit | `checkout-flow-client.tsx` | e2e "empty cart guard" | ✅ |
| AC-3 | Server-side `getStoreSettingsStatic()`, 3-state shipping | `page.tsx`, `checkout-summary.tsx` | e2e totals + build (server-rendered settings) | ✅ |
| AC-4 | CP `/^\d{5}$/` + 32-state closed list, field errors | `lib/checkout/address.ts`, `config.ts` MEXICAN_STATES/CP | unit `address.test.ts` + e2e "rejects bad CP / missing state" | ✅ |
| AC-5 | Email + required trimmed fields, pure & server re-run | `address.ts` (pure), `actions.ts` re-validates | unit + e2e "empty form field-scoped errors" | ✅ |
| AC-6 | Discount validated server-side; %/fixed; clamp ≤ subtotal | `lib/checkout/discount.ts`, `checkout-read.ts` fetchDiscountCode | unit `discount.test.ts` + integration + e2e "valid % code applies" + LIVE AHORRA10 redeemed 0→2 | ✅ |
| AC-7 | Bad code never blocks; friendly localized note | `discount.ts`, `discount-code-field.tsx` | e2e "invalid code inline note, never blocks" | ✅ |
| AC-8 | Server re-reads live product/variant by id; price+stock | `checkout-read.ts` revalidateLines, `actions.ts` | integration `checkout-read.integration.test.ts` + e2e OOS-tamper | ✅ |
| AC-9 | Atomic guarded decrement + inserts in one txn; no oversell | `0008_checkout.sql` create_order (guarded UPDATE ... WHERE stock>=qty) | integration `checkout-rpc` last-unit race + LIVE stock 702→694 (exactly −8) | ✅ |
| AC-10 | `sales_count += qty` same txn | `0008_checkout.sql` | integration + LIVE sales_count bumped | ✅ |
| AC-11 | customers+orders+order_items+status_history, full snapshot, all DB CHECKs | `0008_checkout.sql`, `actions.ts` | LIVE: 8 orders all pass total-identity + discount≤subtotal + MXN + pending/pending; 8 items, 8 customers, 8 history | ✅ |
| AC-12 | All writes via `createAdminClient` (RLS-bypassing, server-only) | `lib/supabase/admin.ts` (`import "server-only"`) | code read + RPC granted service_role only | ✅ |
| AC-13 | Confirmation page: order#, summary, address, "payment next", cart cleared | `confirmacion/[token]/page.tsx` | e2e "lands on token-addressed confirmation with cleared cart" | ✅ |
| AC-14 | Double-submit → one order, no double-decrement | client UUID idempotency key + partial-unique index; RPC idempotent | integration idempotency (reused:true) + e2e | ✅ |
| AC-15 | Every tunable a named config constant; TAX_RATE=0 documented | `lib/config.ts` | code read (ORDER_NUMBER_PREFIX, MEXICAN_CP_PATTERN, MEXICAN_STATES, confirmationPath, TAX_RATE) | ✅ |
| AC-16 | `checkout` namespace both locales, no hardcoded copy, formatMXN | `messages/es-MX.json` + `en.json` | e2e i18n EN places an order; build | ✅ |

All 8 edge cases covered (price drift, last-unit race, cart mutated, tampered
snapshot, settings-unavailable → block, discount>subtotal clamp, double-submit,
DB-CHECK backstop) — verified across unit/integration/e2e per QA + Hacker reports
and my live spot-checks.

## Report Summary
| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review (Stage 5) | 8/10 APPROVE-WITH-FIXES | 0 critical, 6 major (all fixed), incl. M-6 IDOR closed via opaque token |
| QA (Stage 7) | SHIP / HIGH | 153 new tests, 0 production bugs; e2e depletes seed stock (reseed noted) |
| UX (Stage 8) | 9.5/10 | banner recovery action added; 2 accepted deviations |
| Security (Stage 9) | SECURE | 0 crit, 1 HIGH fixed (rate limiter); 3 accepted risks (AR-1/2/3) |
| Architecture (Stage 10) | A- (9/10) APPROVE | clean single trust choke point; T8 design inputs recorded |
| Hacker (Stage 11) | 2/10 chaos (PASS) | 1 real bug fixed (discount LIKE-injection → `.eq`); 1 LOW tamper-only open |

## Independent Verification Highlights (I did not trust the reports)
- **IDOR (M-6) live:** real `confirmation_token` URL → 200; sequential `PP-000007`
  order number → **404**; malformed token → 404; unknown UUID → 404. `getOrderByToken`
  gates on `UUID_PATTERN` before any DB hit.
- **Discount LIKE-injection fix present:** `checkout-read.ts` uses
  `.eq("code", code)` on the upper-cased arg — no `.ilike`.
- **Atomicity live:** 8 e2e orders decremented variant stock exactly 702→694;
  sales_count incremented; AHORRA10 `times_redeemed` 0→2.
- **Financial integrity live:** all 8 orders satisfy `total = subtotal+shipping+tax−discount`,
  `discount ≤ subtotal`, `currency='MXN'`, `pending_payment`/`pending`.
- **RPC security:** `create_order` is `security definer`, `set search_path = ''`,
  `revoke all ... from public` + `grant execute ... to service_role`.
- **Secret hygiene:** admin client `import "server-only"`; no `NEXT_PUBLIC_` secret;
  no hardcoded secret in the T7 diff; `CHECKOUT_RATE_LIMIT_DISABLED` is server-only
  and wired ONLY in `playwright.config.ts`.
- **Migration 0008** applied to LOCAL Docker only (remote never touched).

## Discrepancies Found vs Prior Reports
1. **tsconfig.json carried dead build-artifact globs.** The committed `tsconfig.json`
   `include` array still contained `.next-t7-qa/types/**/*.ts` and
   `.next-t7-qa/dev/types/**/*.ts` — QA-stage build scaffolding for a directory that
   no longer exists. Stage 8's note claimed "tsconfig build-artifact edit reverted
   (kept clean)", but these two lines survived into the tree. Harmless (globs match
   nothing; tsc/build/lint all pass with or without them) but not part of the T7
   feature. **Fixed in this Verify commit** (removed both lines; re-ran tsc + lint,
   both clean). No behavior change.
   - Note for future runs: `next build` with `NEXT_QA_DIST_DIR` auto-injects the QA
     dist-dir types glob into tsconfig — always `git checkout -- tsconfig.json` after
     a QA/verify prod build so it doesn't leak into the diff.
2. **Test-count drift across reports is expected** (stages added tests): 811 → 924
   unit, 135 → 137 integration, 24 e2e stable. Latest authoritative baseline (which I
   reproduced exactly) is **924 / 137 / 24**.

## Remaining Concerns (all LOW / accepted — none block ship)
- **AR-3 rate limiter is best-effort, per-instance in-memory:** correct for the
  pre-payment phase; a distributed limiter is a T8+ follow-up. DB atomicity is the
  hard backstop. — LOW, accepted, revisit before horizontal scale / launch.
- **Hacker Logic Bug #2 (duplicate line via tampered `lines` payload):** creates a
  valid 2-identical-line order via localStorage tampering only; unreachable from the
  real cart (dedupes by key); financial integrity holds. — LOW, deferred de-dupe merge.
- **AR-1:** 2 moderate `npm audit` findings (postcss <8.5.10, transitive via Next,
  dev/build-only, pre-existing). — LOW, accepted.
- **TD-1:** `ORDER_NUMBER_PREFIX` ("PP") is duplicated in TS config and the RPC
  literal with no agreement test (~5 min). — NIT, non-blocking.
- **Two UX deviations** (mobile sticky bar instead of top accordion; Radix Select
  state picker instead of native mobile wheel) — documented/allowed.

## What Was Built (changelog / release notes)
Guest checkout for the Mexican store: a single-page `/checkout` flow (contact +
Mexican shipping address + delivery notes + discount field + live order summary)
that re-validates every cart line's price and stock against the live DB, applies
and clamps discount codes, and creates the order through one atomic `create_order`
Postgres function that guarded-decrements stock, writes the immutable order/items/
customer/status-history snapshot, bumps sales_count, and is idempotent on retry.
Orders land at `pending_payment` (payment is T8). Confirmation is served on an
unguessable token URL. Bilingual (es-MX default / en), integer-cents money math,
per-IP submit rate limiting.

## Human-Review Gate — What the reviewer must look at FIRST
Per BUILD_PLAN rule 3, a human must review before merge. Prioritize:
1. **The SECURITY DEFINER migration** `supabase/migrations/0008_checkout.sql` —
   the `create_order` function: pinned `search_path=''`, guarded decrement, txn
   boundary/rollback, `service_role`-only grant, total-identity/discount CHECKs.
2. **The server-action trust boundary** `src/app/[locale]/checkout/actions.ts` —
   snapshot is NOT trusted; price/stock re-read live by id; discount validated
   server-side; raw PG errors never echoed.
3. **The rate limiter** `src/lib/checkout/rate-limit.ts` — per-IP sliding window,
   best-effort caveat (AR-3), and the `CHECKOUT_RATE_LIMIT_DISABLED=1` escape hatch
   (server-only; confirm it is UNSET in every real deploy).
4. **The money math** `src/lib/checkout/order.ts` + `discount.ts` + reused
   `cart/shipping.ts` — integer cents, clamp `discount ≤ subtotal`, `total ≥ 0`.

### T8 design inputs recorded by Architecture (carry forward — NOT T7 changes)
- **R-1:** order status transitions must go through a new `advance_order_status` RPC
  that writes `order_status_history` (never ad-hoc `.update`).
- **R-3:** payment idempotency is a SEPARATE spine — a unique `mp_payment_id` guard
  is needed (T7's `orders.idempotency_key` only covers creation retry).
- **R-4:** index `mp_payment_id` / `mp_external_reference` in T8's migration.

## Summary
T7 checkout cleared every automated gate — 1085/1085 tests green (924 unit, 137
integration, 24 checkout e2e on a production build), all 16 ACs and 8 edge cases
verified in code and live, no open CRITICAL/HIGH, financial integrity and IDOR and
atomic stock reservation confirmed by direct DB inspection. **SHIP — but do NOT
auto-merge; the checkout human-review gate is mandatory and T7 stays unchecked in
BUILD_PLAN until the user approves.**
