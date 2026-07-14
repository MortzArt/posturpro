# Security Audit: T7 — Checkout & Order Creation

Auditor: ultrasecurity (Stage 9). Runs in parallel with Stage 10 (arch, report-only).
Scope: the full checkout write path across commits `d6cb836`, `9ed3b05`,
`61b7159`, `48813c0` — migration `0008_checkout.sql`, the `"use server"`
`placeOrder` action, the server read modules, the client boundary, i18n, seed
data, and the confirmation page. Every input treated as hostile.

## Summary
- Files audited: 24 changed source/SQL files (+ config, env, admin client, RLS for context)
- Vulnerabilities found: 1 (Critical: 0, High: 1, Medium: 0, Low: 0)
- Vulnerabilities fixed: 1 (the 1 High — checkout rate limit)
- Secrets found: **0** (SHIP-eligible on the secrets gate)
- Accepted risks: 3 (all documented, all pre-existing or best-effort by design)

**Verdict: SECURE (subject to the standing HUMAN-REVIEW GATE for checkout).**

The genuinely dangerous parts — the atomic reserve-and-create RPC, the snapshot
trust boundary, the money math, the admin-client grant surface, and the M-6 IDOR
fix (opaque confirmation token) — are correct and were verified by reading the
code, not by trusting prior stages. The one open gap the pipeline had explicitly
deferred (no rate limit on the unauthenticated `placeOrder` write path) is now
closed with a proportionate, no-new-infra mitigation.

---

## Vulnerability Findings

### HIGH

#### SEC-H-1: No rate limit on the unauthenticated `placeOrder` write path
- **Type**: OWASP A04 Insecure Design / A05 (resource-exhaustion / business-logic abuse)
- **File**: `src/app/[locale]/checkout/actions.ts` (`placeOrder`)
- **Description**: `placeOrder` is an unauthenticated server action. Each success
  creates a `customers` + `orders` + `order_items` + `order_status_history`
  record, **decrements finite stock**, and **increments a discount's
  `times_redeemed`**. Nothing bounded the *rate* of calls. The atomic RPC bounds
  data *corruption* (no oversell, no double-order, stock floor at 0) but not
  *volume*.
- **Exploit**: A script POSTs valid-looking checkouts in a loop (valid Mexican
  address is trivial to synthesize; cart lines are a public product/variant id +
  qty). Consequences, all with zero auth:
  1. **Stock griefing** — drive a hot variant's stock to 0 so real buyers get
     "sold out"; the reservation is real even though payment (T8) never happens.
  2. **Discount exhaustion** — burn a limited code's `max_redemptions` so
     legitimate shoppers can't use it.
  3. **Order-table flooding** — unbounded `pending_payment` rows (junk data,
     storage, admin-queue noise for T12).
- **Impact**: Denial of inventory + denial of promotion + data pollution — a
  realistic pre-payment abuse vector for a public MX storefront. Rated HIGH (not
  Critical): no data breach or privilege escalation, and the DB atomicity caps
  the per-call blast radius; but it is a live, cheap, unauthenticated
  business-logic DoS.
- **Fix**: **FIXED.** Implemented a best-effort in-memory per-IP sliding-window
  throttle — the exact pattern already proven on the Q&A write path
  (`src/lib/qa/submit-guard.ts`), so **no new infra/dependency**:
  - New `src/lib/checkout/rate-limit.ts`: `checkCheckoutRateLimit(ip)` — sliding
    window, empty-key deletion, and a hard map-size ceiling with idle/oldest
    eviction (cardinality-DoS bound, mirroring the Q&A limiter). Unit-tested
    (`rate-limit.test.ts`, 6 cases: limit, window reset, per-IP isolation,
    shared "unknown" bucket, map-bound under IP rotation, e2e bypass).
  - `config.ts`: `CHECKOUT_MAX_ORDERS_PER_WINDOW = 5`,
    `CHECKOUT_RATE_LIMIT_WINDOW_MS = 60_000`,
    `CHECKOUT_RATE_LIMIT_MAX_KEYS = 10_000` — all named, documented constants
    (BUILD_PLAN rule 4). 5/min per IP leaves generous headroom for retries +
    shared NATs while cutting scripted spam to a trickle.
  - `actions.ts`: a `clientIp()` helper reusing the Q&A trust model
    (`x-vercel-forwarded-for` → rightmost XFF hop → `x-real-ip` → shared
    `"unknown"`), and the throttle wired **after** address validation + line
    revalidation (a bad/tampered request never consumes a slot) and **before**
    the RPC (no order, no stock decrement when tripped).
  - New serializable status `"rate-limited"` in `checkout-form-state.ts`, a
    localized banner (`banner.rateLimited` in both locales, symmetric) with a
    retry recovery action, wired through `use-checkout-labels.tsx` +
    `resolveBanner`. The submit stays enabled so a legitimate user can retry
    after the window.
  - **E2E escape hatch**: the authoritative checkout e2e places several real
    orders from one localhost IP in one window against a single server instance,
    which would legitimately trip the limiter. A **server-only** env var
    `CHECKOUT_RATE_LIMIT_DISABLED=1` (never `NEXT_PUBLIC_`, unset in real
    deploys) bypasses it; set in `playwright.config.ts` `webServer.env` and
    documented for the manual prod-build run.
- **Status**: **FIXED.**
- **Residual (accepted)**: Best-effort by design — per-instance memory (a
  horizontally-scaled deploy has one map per instance) and IP-keyed (shared NATs
  bucket together; XFF is only trustworthy behind an edge that overwrites it).
  The DB atomicity + `stock >= 0` CHECK remain the hard backstops. A
  distributed/edge limiter is a proportionate follow-up once T8 payment adds a
  cost to each attempt (payment itself becomes the strongest natural throttle).

---

## Accepted Risks (documented, no action this stage)

- **AR-1 — `npm audit`: 2 moderate, dev/build-only.** `postcss <8.5.10`
  (GHSA-qx2v-qp2m-jg93, XSS via unescaped `</style>` in CSS stringify) reached
  only transitively through `next`'s build toolchain. It is a build-time
  dependency, not shipped to the runtime/client bundle, and the only "fix" is a
  forced downgrade to `next@9` (a massive breaking change). Pre-existing (noted
  in the prompt), not introduced by T7. Accepted; revisit on the next Next.js
  major bump.
- **AR-2 — Discount `min_subtotal_cents` not re-asserted in the RPC.** The RPC
  redemption `UPDATE` re-checks `is_active` + start/end window + cap (m-2 fix)
  but intentionally NOT `min_subtotal_cents`: the action already clamped the
  discount to the validated live subtotal, and a live-subtotal recompute in the
  RPC could reject a legitimate application. Documented in the SQL. Accepted — no
  security consequence (the discount is always ≤ subtotal, DB CHECK enforces it).
- **AR-3 — Rate limiter is best-effort.** See SEC-H-1 residual. Accepted for the
  pre-payment phase.

---

## Checklist Results
| Category | Status | Notes |
|----------|--------|-------|
| Secrets | ✅ | 0 hits in diff/repo; no tracked `.env*`; seed carries no secrets |
| Env var exposure | ✅ | no `NEXT_PUBLIC_` secret; `SUPABASE_SECRET_KEY` server-only via admin.ts; new bypass flag server-only |
| Injection | ✅ | jsonb-cast RPC (no dynamic SQL); PostgREST builder; no `dangerouslySetInnerHTML`; UUID-gated route |
| Auth/AuthZ | ✅ | admin-only RPC grant; anon EXECUTE denied; M-6 IDOR closed by opaque token; idempotency-key not cross-tenant |
| Client/server boundary | ✅ | no client import of admin/read/action internals; serializable state only |
| Data Exposure | ✅ | display-only view model; raw PG never echoed; no PII in logs; qty/cents int-bounded |
| CORS/CSRF | ✅ | no custom API routes; Server-Action built-in CSRF; no permissive CORS |
| Dependencies | ✅ | no new deps; 2 moderate dev-only findings accepted (AR-1) |
| Input DoS | ✅ | server-side length bounds on all free-text; anchored regexes (no ReDoS) |
| RLS posture (other tables) | ✅ | 0008 touches no policy/RLS; only its own function grant |

---

## Detailed Verification Notes

### Secrets scan (full diff + repo)
- Diff scan for `sk_live/sk_test/pk_live`, PEM blocks, `service_role` literals,
  `password=`, high-entropy `secret:` — **0 hits**.
- `git ls-files | grep .env` → **no tracked env files**; `.gitignore` covers `.env*`.
- Seed discount codes + zero-stock variant carry no secrets.

### Env-var exposure (Next.js)
- `grep NEXT_PUBLIC | grep -i secret/admin` → empty. The two `NEXT_PUBLIC_*` are
  URL + RLS-publishable key (client-safe). `SUPABASE_SECRET_KEY` reached only via
  `getServerEnv()` → `admin.ts` (`import "server-only"`). New
  `CHECKOUT_RATE_LIMIT_DISABLED` is a plain server env var, `undefined` in browser.

### Injection
- **SQLi**: RPC takes one `jsonb`, `->>` extract + `::uuid`/`::integer` casts —
  no concatenation. Reads use `.eq/.in/.ilike` (parameterized). `SECURITY DEFINER`
  with `set search_path = ''` and schema-qualified objects.
- **XSS**: zero `dangerouslySetInnerHTML`; PII renders as escaped text nodes.
- **Path traversal / SSRF / command-injection**: none — UUID-validated route
  segment, no fs/dynamic-import/shell/user-URL-fetch in the path.

### Auth / AuthZ / IDOR
- `create_order`: `revoke all from public; grant execute to service_role` —
  anon/authenticated EXECUTE denied (re-verified in source; QA verified live).
- M-6 IDOR closed: confirmation addressed by unguessable `confirmation_token`
  (v4 uuid, unique) validated before any DB hit; sequential `order_number` is
  display-only and 404s as a URL. Equality match on 122-bit token — not
  enumerable, no timing oracle.
- Idempotency short-circuit returns the original order ONLY to the caller with
  the matching key; returned payload is the caller's own token — no cross-tenant
  leak.

### Data exposure & logging
- `OrderView` returns display fields only (no `idempotency_key`, `customer_id`,
  or token echoed to render). `mapThrownError` maps raw PG to friendly enums and
  logs with context; logs reference order_number/product_id only — **no PII
  (email/name/address) is logged**.
- Integer overflow: cents/qty cast to int4; qty `sanitizeQuantity`-clamped before
  the RPC; identity CHECKs are the DB backstop. No overflow path.

### Input DoS
- `validateAddress` bounds all free-text server-side (`ADDRESS_FIELD_MAX=200`,
  `DELIVERY_NOTES_MAX=1000`, `CONTACT_PHONE_MAX=30`, `RFC_MAX=20`, email pattern)
  — a megabyte-string is rejected before any write. Anchored/fixed-length regexes.

### RLS posture (other tables)
- `0008_checkout.sql` adds a sequence, two columns + indexes, a
  `discount_codes (upper(code))` unique index, and `create_order` + its grant.
  Touches no policy, enables/disables no RLS, grants nothing else. Other tables
  unchanged.

---

## Explicit Rate-Limit Decision (prompt item 4)

**Decision: IMPLEMENTED a proportionate mitigation (not accepted-as-risk).**

The prior stages deferred this ("the atomic RPC + stock floor bound real
damage"). That reasoning bounds *per-call* damage but not *aggregate abuse
volume* — stock griefing and discount-exhaustion are real, cheap,
unauthenticated attacks the RPC does not stop. Because a proven no-new-infra
pattern already exists in this codebase (the Q&A per-IP in-memory limiter), a
proportionate mitigation was feasible and has been implemented (SEC-H-1). The
best-effort nature (per-instance, IP-keyed) is the documented, accepted residual;
a distributed limiter is a follow-up that becomes cheaper/more natural once T8
payment attaches a cost to each attempt.

---

## Verification Evidence (code changed this stage)
- `npx tsc --noEmit`: **clean.**
- `npx eslint` (changed files): **clean.**
- `npx vitest run` (full unit): **924/924 passed** (918 baseline + 6 new
  `rate-limit.test.ts`); i18n symmetry green (both locales carry
  `banner.rateLimited`).
- `npm run build`: **clean**, both locales (`es-MX` + `en`) prerender.
- Integration (135) + checkout e2e (24) not re-run here: they exercise the RPC/DB
  path directly (integration imports neither the action nor the limiter) and the
  in-memory throttle runs before the RPC; the e2e bypass env
  (`CHECKOUT_RATE_LIMIT_DISABLED=1`) is wired in `playwright.config.ts` so the
  authoritative run is unaffected. **No DB writes were made by this stage — no
  reseed required.**

## Files changed (Stage 9)
- `src/lib/checkout/rate-limit.ts` (new) + `rate-limit.test.ts` (new)
- `src/app/[locale]/checkout/actions.ts` (clientIp + throttle wiring)
- `src/app/[locale]/checkout/checkout-form-state.ts` (`"rate-limited"` status)
- `src/components/checkout/checkout-flow-client.tsx` (banner case)
- `src/components/checkout/use-checkout-labels.tsx` (label wiring)
- `src/lib/config.ts` (3 constants + doc block)
- `src/messages/es-MX.json` + `src/messages/en.json` (`banner.rateLimited`)
- `playwright.config.ts` (e2e bypass env)

## Verdict: SECURE
Subject to the **BUILD_PLAN rule-3 HUMAN-REVIEW GATE** — this SECURE verdict does
NOT authorize auto-merge.
