# Security Audit: T12 — Admin Order Management

> Stage 9 (ultrasecurity). Scope: T12 commits `81b168e`, `70e8e1b` (+ `10994db`,
> `01e042b`). Every new server action, route handler, write/read layer, input
> parser, both migrations (0012/0013 — RPCs, RLS, grants), and the session
> trust-boundary change (`session-guard.ts` / `session-version.ts` /
> `session-payload.ts` / `session.ts` / login stamp) were read line-by-line, not
> trusted from prior-stage reports. Money-movement (`refund.ts`) and the MP client
> boundary re-verified. Secrets scan run over the full repo, not just the diff.

## Summary

- Files audited: 25 (2 migrations, 6 session/trust-boundary, 11 lib/admin/orders write+read+parse, refund money path, 1 route handler, 5 server actions, client-boundary spot-checks across 9 `"use client"` components)
- Vulnerabilities found: 0 (Critical: 0, High: 0, Medium: 0, Low: 2)
- Vulnerabilities fixed: 0 (no critical/high to fix)
- Secrets found: 0 (SHIP requirement met)
- Dependencies added: 0 (no `npm audit` delta from this diff)

## Vulnerability Findings

### CRITICAL

None. The trust boundary (session codec + persisted-version revocation), the
money path (refund idempotency + over-refund guard + no raw-error echo), and the
transactional `cancel_order` all hold under adversarial reading.

### HIGH

None.

### MEDIUM

None.

### LOW

#### SEC-L-1: Login version-stamp fails to baseline (1) on a transient version-read error
- **Type**: A07 Identification & Authentication (session issuance robustness)
- **File**: `src/app/admin/actions.ts:84-89`
- **Description**: `setSessionCookie()` stamps `(await getAdminSessionVersion()) ?? ADMIN_SESSION_VERSION` into the minted cookie. If the version read transiently fails (`null`) while the persisted version has been bumped to N>1 (post-compromise rotation), the new cookie is stamped `v=1`.
- **Exploit**: Not exploitable. On the very next request the guard reads the (recovered) persisted version N, and `1 !== N` → the freshly-minted cookie is rejected as revoked. The failure mode is **fail-closed** (operator must re-login), never fail-open — a stale/baseline cookie can never out-live a bump.
- **Impact**: A rare re-login prompt during a DB blip that coincides with an active rotation. No security impact.
- **Fix**: Optional hardening — block login (surface a transient error) rather than baseline-fall-back when the version read fails during rotation. Not required; current behavior is safe. Documented, no code change.
- **Status**: OPEN (accepted — fail-closed, no action needed for ship).

#### SEC-L-2: Refund-issued email reads the "newest" ledger row, not the row for this specific refund
- **Type**: A04 Insecure Design (best-effort email correctness under concurrency)
- **File**: `src/lib/admin/orders/order-refund-write.ts:66-83` (`fireRefundEmail`)
- **Description**: After a successful refund, the write layer reads the newest `payment_refunds` row (`order created_at DESC limit 1`) to source the `mp_refund_id`+amount for `sendRefundIssued`. Under two near-simultaneous partial refunds on one order, both could read the same newest row.
- **Exploit**: Not a money/authz issue — refunds themselves are serialized by `record_refund`'s order lock and are exactly-once at MP via the idempotency key. Worst case: `sendRefundIssued` is dispatch-deduped on the MP refund id (`email_sends` ledger, AC-18), so a duplicate/mismatched email is suppressed or, at most, one partial's email reports the other partial's (equal-shape) id — a cosmetic email-content edge, no data leak beyond what the customer's own refund already exposes.
- **Impact**: Cosmetic under a rare concurrent-partial race. No PII crossover (same order/customer), no double-send (id-deduped).
- **Fix**: Optional Phase-2 — return the `mp_refund_id` from `refundOrderPayment` and thread it into the email call instead of re-reading the newest ledger row. Not required for ship.
- **Status**: OPEN (accepted — Phase-2 hardening, no security impact).

## Attack-Surface Detail (OWASP pass)

**A01 Broken Access Control / IDOR**
- Every one of the 5 server actions (`advanceStatus`, `setTracking`, `cancelOrder`, `refundOrder`, `addInternalNote`) calls `await requireSession()` as its FIRST statement, before any DB touch (AC-30). `requireSession` → `hasValidAdminSession()` → `redirect(ADMIN_LOGIN_PATH)` on failure. Verified in `actions.ts:60,88,106,125,147`.
- The packing-slip route handler self-guards: `if (!(await hasValidAdminSession())) return 401` at entry, before any read (AC-29). Middleware matcher `/((?!api|_next|_vercel|.*\\..*).*)` still covers it (no dot / not `/api`), so it is double-guarded — defense-in-depth holds.
- IDOR: the admin is a single-owner console (RLS-bypass service_role client, no per-tenant data). Order/customer ids are UUID-validated (`UUID_PATTERN.test`) in every action and every write layer before use; a non-UUID → `not-found`/`not-refundable` with no DB touch. No horizontal escalation surface exists (one operator, all orders).
- Cancel-without-restore bypass CLOSED: `cancelled` is not in any `ALLOWED_NEXT_STATUSES` set, and `parseStatusTransition` server-side rejects any target outside the offered set (`not-allowed`) — a crafted `advanceStatus(orderId, "cancelled")` cannot mark an order cancelled while skipping the `cancel_order` stock-restore transaction.

**A02 / Secrets & Env Exposure**
- Full-repo secrets scan: 0 hardcoded credentials, keys, or tokens in `src`/`supabase`. No `sk_`/`pk_`/`APP_USR-`/`TEST-`/PEM patterns outside `process.env`/`getAdminEnv`/`getMpEnv` accessors.
- No `.env*` tracked in git; `.env*` is gitignored.
- 0 `NEXT_PUBLIC_`-prefixed secrets. The only `NEXT_PUBLIC_` reference in the diff is `NEXT_PUBLIC_SUPABASE_URL` (a public URL, not a secret) in a doc line.
- Client/server boundary: all 9 `"use client"` order components import ONLY server actions (`@/app/admin/(app)/orders/actions`) and pure modules (`order-status-meta`, `order-constants`, `order-tracking-input`, `order-action-types`) — never a `server-only` write/read module or `refund.ts`. The admin/service_role client and MP client never cross into a client bundle.

**A03 Injection**
- **SQL/PostgREST**: all filters are parameterized `.eq/.in/.rpc`. The two `.or()` free-text searches (`order-list-query.ts:59`, `customer-list-query.ts:41`) strip PostgREST filter meta-chars `[%,()*.:\\]` from the term before interpolation, neutralizing the `or()` operator grammar (comma/dot/paren/wildcard) — the established m-3 defense. Search length is capped (`ADMIN_SEARCH_MAX_LENGTH`) by the pure `parseOrderListFilters` before it reaches the query.
- **RPC injection**: `cancel_order`, `bump_admin_session_version`, `admin_customer_order_counts` all take typed params (`uuid`, `uuid[]`, `text`) — no dynamic SQL, no string concatenation. Bodies use qualified `public.*` references (required under `search_path = ''`).
- **Command injection / dynamic import / path traversal**: none — no `child_process`, no user-controlled file paths, no dynamic `import()` in the surface.

**A04 SSRF**
- The only user-controlled URL is `tracking_url`, validated to `http:`/`https:` protocol only (`order-tracking-input.ts:40-47`) and never fetched server-side — it is stored and (in Phase 1) not even rendered as an href. No server-side `fetch` of a user URL anywhere in T12.

**A05 Security Misconfiguration (RLS / grants / SECURITY DEFINER)**
- `order_internal_notes` + `admin_session_version`: `enable row level security` with NO policies → anon/authenticated fully denied; explicit `grant all ... to service_role` (which bypasses RLS). Correct 0011/0009 posture.
- `cancel_order`, `bump_admin_session_version`, `admin_customer_order_counts`: `SECURITY DEFINER` + pinned `set search_path = ''` + `revoke all from public` + `grant execute ... to service_role`. anon/authenticated cannot execute; no `search_path` hijack (empty path forces fully-qualified `public.*` resolution, which the bodies use). No privilege-escalation path — a definer function only does what its fixed body does, callable solely by the service_role admin client.
- `admin_session_version` is a DB-enforced singleton (`id integer primary key default 1 check (id = 1)`, `version bigint check (version >= 1)`) — version cannot be downgraded below 1 and the bump RPC is monotonic (`version + 1`).

**A07 Auth — Session Revocation Gate (SEC-M-1 / AC-27/28)**
- Trust boundary verified end-to-end. `verifiedSessionPayload` recomputes HMAC-SHA256 over the payload part and compares it `timingSafeEqual` (constant-time, length-checked, non-hex → mismatch) BEFORE decode; then expiry (`isWithinMaxAge`, future-`iat` rejected). Only then does `hasValidAdminSession` read the persisted `admin_session_version` and require `payload.v === currentVersion`.
- **No bypass found**: (a) a bumped-version cookie is a *revocation*, not a decode failure (the codec accepts any finite `v`; equality is owned by the guard) — a stale cookie after a bump is rejected on the next request; (b) version *downgrade* is impossible (DB monotonic + `check (version >= 1)`); (c) a version-read error (`null`) fails CLOSED in the guard (`return false`); (d) a missing session secret THROWS in the Node verifier and is mapped to unauthenticated by every caller (never verifies against an empty/forgeable key); (e) Edge/Node divergence is the documented, acceptable defense-in-depth split — the Edge middleware does a fast crypto pre-check WITHOUT the DB version read, and the authoritative Node guard (which gates every DB touch and every action/route) performs the revocation read. An attacker cannot reach a DB mutation through the Edge path alone.
- Login stamps the current persisted version into the minted cookie (`admin/actions.ts:87`); cookie flags: `httpOnly`, `sameSite: "lax"`, `secure: IS_PRODUCTION`, path-scoped to `/admin`. Session token is never in `localStorage`.

**Refund money path (AC-16..20, edges 1/2/9/10)**
- `refundOrderPayment` is UUID-guarded; rejects non-integer/≤0 amounts; refuses non-`paid` payment (`not-paid`) and missing `mp_payment_id` (`no-payment-id`); refuses a single amount > order total and a cumulative amount > remaining balance (local pre-check + the race-safe `record_refund` order-locked guard as authority; MP as third backstop). Over-refund → `over-refund`, no money moves.
- **Amount tampering**: negative/zero/float cents are rejected by `parseRefundInput` (`Number.isInteger`, `> 0`, `INT4_MAX` ceiling) AND re-checked in `refundOrderPayment`. Whole-peso→cents conversion is `pesosToCents` with `Number.isSafeInteger` guard. No path admits a negative or fractional refund.
- **Idempotency-key predictability**: the key is `refund:{orderId}:{uuid}` (or a caller-supplied stable per-action key). It is stable across an in-place network retry (retry-safe at MP) and unique per distinct attempt (two same-amount partials do NOT collide). Not attacker-relevant — the key only affects MP dedupe, and the caller is already session-gated. The client-side `crypto.randomUUID()` mint has an insecure-context fallback (m-2).
- **MP error/secret leakage**: raw MP errors are `console.error`-logged (server-side, `orderId`/`paymentId` only — no token/secret, no PII) and mapped to a typed `mp-error`/`error`/`over-refund`/`not-refundable`; NEVER echoed to the client (AC-20). Confirmed no MP token/secret appears in any log statement.
- **PP-000005 (3 duplicate approved payments)**: the cumulative guard keys on the ORDER total, not the sum of payments, so refunds can never exceed the order total even with 3 landed charges. Refund targets the single `orders.mp_payment_id`. No over-refund vector.

**A09 Logging / Data Exposure**
- No PII (email/name/phone/address/note body) in any log statement across the T12 write layers and `refund.ts` — logs carry `orderId`/`paymentId` UUIDs + error messages only.
- Packing slip (`text/html`) sets `Cache-Control: no-store` (carries shipping PII); route returns 401 before any read when unauth.
- Error responses are typed friendly strings; no stack traces or internal paths returned to the client.

**XSS**
- Packing-slip HTML builder escapes all five significant chars (`& < > " '`) on EVERY customer-controlled field (order number, shipping name, address lines, phone, product name/SKU, variant label). Numeric fields (quantity, total) are DB integers, safe unescaped. No `dangerouslySetInnerHTML` anywhere in the T12 surface; the only inline handler is a static `window.print()`. React escapes all admin-UI JSX by default.

**CSRF**
- State-changing operations are Next server actions (built-in origin/action-id protection) + a same-site `Lax` cookie scoped to `/admin`; each re-verifies the session server-side. The one route handler is a read-only GET, self-guarded. No custom cross-origin CORS surface introduced.

## Checklist Results

| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 hardcoded secrets in full repo; no `.env*` tracked; gitignored |
| Env var exposure | ✅ | 0 `NEXT_PUBLIC_` secrets; service_role/MP clients server-only, absent from client bundle |
| Injection | ✅ | PostgREST meta-chars stripped on `.or()`; RPCs typed-param, no dynamic SQL; empty `search_path` |
| Auth/AuthZ | ✅ | Every action `requireSession()` first; route self-guards 401; revocation gate fail-closed, no bypass |
| Client/server boundary | ✅ | Client components import only actions + pure modules; no server-only/`refund.ts` leak |
| Data Exposure | ✅ | No PII/secret in logs; packing slip `no-store` + 401; typed friendly errors, no raw MP echo |
| CORS/CSRF | ✅ | Server actions + `Lax` `/admin`-scoped cookie; read-only self-guarded GET; no `*`+credentials |
| Dependencies | ✅ | 0 new dependencies added by T12 — no CVE surface delta |

## Residual Risk

- **SEC-L-1** (login baseline-stamp on a rotation-time read blip) — fail-closed, cosmetic re-login. Accept.
- **SEC-L-2** (refund email reads newest ledger row under a concurrent-partial race) — id-deduped, no double-send, no PII crossover. Phase-2 hardening. Accept.
- Both are LOW, neither blocks ship. No critical/high/medium findings required fixing.

## Verdict: SECURE
