# Ship Decision: T10 — Admin foundation

## Verdict: SHIP

## Confidence: HIGH

## Quality Score: 9/10

Stage 11 (Hacker) was **SKIPPED** — task classified `medium` complexity, per the
full-cycle auto-classification rule (medium → skip hacker; Security + Arch run at
full depth because this is the app's top trust boundary). This is noted and does
not affect the verdict: the auth surface received full-depth adversarial Security
(Stage 9) and Architecture (Stage 10) review in lieu of chaos testing.

---

## Verification Matrix (every check run by the gatekeeper, not trusted from reports)

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | `tsc --noEmit` | ✅ 0 errors | Ran clean; ZERO source and ZERO `.next/dev/types` errors (port 3000 was clear, no stale validator artifacts) |
| 2 | ESLint (whole project) | ✅ clean | `npx eslint .` exit 0, no output |
| 3 | Unit suite | ✅ **1376/1376 (78 files)** | `npx vitest run` — matches expected exactly, 0 failed / 0 skipped |
| 4 | Integration suite | ✅ **188/188 (14 files)** | `bash scripts/run-integration.sh` (resets + seeds local Supabase first) |
| 5 | Prod build | ✅ exit 0 | `NEXT_QA_DIST_DIR=.next-qa-t10-verify next build` — admin routes dynamic (`ƒ`), storefront SSG/dynamic unchanged, middleware compiled (Edge Web-Crypto OK). Rebuilt after each reseed per SEQUENCING RULE; `git checkout -- tsconfig.json` after each build |
| 6 | Live prod smoke (unauth) | ✅ all correct | `/`=200, `/en`=200, `/admin`=307→login, `/admin/login`=200, `/admin/settings`(unauth)=307→login, `/admin/`=308→`/admin`; **0 admin-markup matches** in unauth `/admin` body |
| 7 | E2E storefront regression (PROD build, R2) | ✅ **78/78** | chromium 39/39 + mobile 39/39 (payment 8 + checkout 24 + cart 46 across both projects), reseed + rebuild between projects. Middleware `/admin` branch does NOT regress storefront |
| 8 | E2E admin unauth-guard (PROD build) | ✅ **6/6** | `admin.spec.ts -g "unauthenticated route protection"` (3 tests × chromium+mobile) on the authoritative prod server |
| 9 | E2E admin authed (DEV server, serial) | ✅ **30/30** | Full `admin.spec.ts --workers=1` on a fresh dev server (Secure cookie can't ride plain HTTP on `next start` — documented product behavior). All 15 tests × chromium+mobile pass |
| 10 | Migrations | ✅ 0001..0010 (no 0011) | `ls supabase/migrations/` — T10 added none (AC-14). `supabase db reset` applied all 10 clean; seed produced the full fixture (30 products, 70 variants, singleton store_settings) |
| 11 | Secret: `.env.local` not tracked | ✅ | `git check-ignore .env.local` matches; `git ls-files .env.local` = 0 (never committed) |
| 12 | Secret: no `NEXT_PUBLIC_ADMIN_*` | ✅ | Only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public; the 3 admin vars (`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_SESSION_SECRET`) carry no public prefix |
| 13 | Secret: hash `$`-escaped in `.env.local` | ✅ | 5 backslash-escaped `$` present (the QA P1 fix — `scrypt\$N\$r\$p\$salt\$hash`); prevents dotenv `$`-expansion collapse |
| 14 | Middleware: `/admin` branch before next-intl | ✅ | `src/middleware.ts:45-46` `isAdminPath()` returns via `handleAdmin()` BEFORE `intlMiddleware(request)` at :50 — read the file directly |
| 15 | Cookie flags (AC-2/6/13) | ✅ | `actions.ts:82-87` set: `httpOnly:true`, `sameSite:"lax"`, `secure:IS_PRODUCTION`, `path:/admin`, `maxAge:getSessionMaxAgeSeconds()`; logout `maxAge:0` (:98-103) |
| 16 | HMAC-SHA256 + timingSafeEqual (AC-4) | ✅ | `session.ts:16,31,48` — `createHmac("sha256",...)` + `timingSafeEqual`, never `===` |
| 17 | Session max-age default 8h (AC-5) | ✅ | `constants.ts:47` `DEFAULT_SESSION_MAX_AGE_SECONDS = 8*60*60`, env-overridable |
| 18 | DB left pristine | ✅ | Final reseed: store_settings @ seed ($500 flat / $10000 threshold / MXN), 0 orders, 70 variants, MILANO stock 8/11 |

---

## Acceptance Criteria Final Check

| # | Criterion | Code | Test / Live Evidence | Verdict |
|---|-----------|------|----------------------|---------|
| AC-1 | Unauth `/admin/*` (except login) → redirect, no markup | `middleware.ts:69-71`, `(app)/layout.tsx` guard | e2e unauth 6/6 + live curl: `/admin`,`/admin/settings`=307→login, 0 admin-markup in body | ✅ |
| AC-2 | Correct creds → HttpOnly/Lax/Secure(prod)/Path=/admin cookie → /admin; case-insensitive email; constant-time pw | `actions.ts:82-89`, `auth.ts` (case-insensitive email, `timingSafeEqual`) | e2e "correct creds land…scoped HttpOnly cookie" (30/30 serial); unit `auth.test.ts`/`session.test.ts` | ✅ |
| AC-3 | Wrong email OR pw → single generic error, no enumeration, timing parity | `actions.ts` generic error, `auth.ts` dummy-hash | e2e "wrong password"/"unknown email…SAME error"; unit `auth.test.ts` timing-floor + parity | ✅ |
| AC-4 | Tamper-evident HMAC-SHA256; forged/truncated fails `timingSafeEqual` | `session.ts:16,31,48`; `session-edge.ts` | unit `session.test.ts`, `session-parity.test.ts` (Node↔Edge identical), `session-edge.test.ts` | ✅ |
| AC-5 | Bounded lifetime 8h; expired-but-signed rejected server-side | `constants.ts:47`; `session-payload.ts` `isWithinMaxAge` | unit `session.test.ts` "expired-but-signed", `session-payload.test.ts` | ✅ |
| AC-6 | Logout clears cookie (maxAge=0) → login; AC-1 holds after | `actions.ts:98-103` | e2e "after logout, /admin redirects to login again" | ✅ |
| AC-7 | Authed `/admin/login` → /admin | `middleware.ts:61-64` + `login/page.tsx` | e2e "while authed, /admin/login redirects to /admin" | ✅ |
| AC-8 | Settings renders 4 fields prefilled, money in pesos | `settings/page.tsx` (`centsToPesos().toFixed(2)`) | e2e "settings form is pre-populated" (flat=500.00) — passes serially (see anomaly note) | ✅ |
| AC-9 | Save → admin-client write → cache bust → success; storefront reflects | `store-settings.ts:updateStoreSettings` (`updateTag`); `actions.ts` | e2e round-trip: change flat→save→success→reload persists→cart shipping shows 742.00→restore (serial); integration UPDATE+updated_at; unit `actions.test.ts` | ✅ |
| AC-10 | Reject blank/long name, bad email, negative/non-numeric/>2dp/overflow money; field errors; form stays filled | `settings-input.ts` strict parser | e2e "thousand-separator rejected", "blank name rejected"; unit `settings-input.test.ts`; integration DB CHECKs | ✅ |
| AC-11 | Nav shell: store name, Settings live+active, Products/Orders disabled placeholders, logout | `admin-shell.tsx`, `admin-nav.tsx`, `constants.ts` `ADMIN_NAV_ITEMS` | e2e "Settings live+active; Products/Orders disabled" (aria-current/aria-disabled) | ✅ |
| AC-12 | Secrets only via env.ts, server-only, never NEXT_PUBLIC_, absent from client bundle | `env.ts` `getAdminEnv()` | unit `secret-exposure.test.ts`; live: no `NEXT_PUBLIC_ADMIN_*`; Security stage confirmed 0 admin symbols in client chunks | ✅ |
| AC-13 | Distinct cookie name (`posturpro_admin_session`), Path=/admin, storefront byte-unchanged | `constants.ts`, `middleware.ts` | e2e cookie-name assertion; storefront regression 78/78; `/`&`/en`=200 throughout | ✅ |
| AC-14 | No migration (row+CHECKs+trigger already exist) | — | `ls migrations/` = 0001..0010 only; integration confirms singleton+CHECKs live | ✅ |
| AC-15 | Login rate-limited per IP; generic error; env-flag escape hatch | `login-rate-limit.ts` (shared sliding-window) | unit `login-rate-limit.test.ts` (cap/release/strict `==="1"` hatch) | ✅ |
| AC-16 | tsc strict, ESLint max-lines, no `any`/`!`, session fns ≤30 lines | all admin files <400 lines | `tsc --noEmit` 0 errors; `eslint .` clean; largest admin file 344 lines | ✅ |

**16/16 acceptance criteria met with concrete evidence.** All 10 documented edge cases
are covered (verified in QA + Security reports and cross-checked against code:
forged/expired/rotated cookie, missing env, concurrent save, money 0/locale-formatted,
missing row, direct-POST-without-session, `/admin/` slash/case variants).

---

## Report Summary

| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review (S5) | 8.5/10 APPROVE-WITH-FIXES | 0 critical; 4 MAJOR = test-coverage gaps around already-correct auth invariants; all closed in S6 |
| Fix (S6) | — | 4/4 MAJOR + 5/7 MINOR + 3/4 NIT fixed; 4 items SKIPPED with justification (within-spec / platform / portable) |
| QA (S7) | PASS / HIGH | AC 16/16, edges 10/10; caught + fixed a real **P1** (`$`-mangled password hash → login 100% broken), regression-locked by e2e |
| UX (S8) | 9.5/10 | Every spec'd state renders/reachable; 2 className-only fixes (double-dim, disabled-label contrast); 0 a11y holes |
| Security (S9) | SECURE | 0 critical / 0 high; 3 medium + 3 low accepted residuals; 0 secrets leaked; implemented dev-only fail-fast for the mangled-hash P1 |
| Architecture (S10) | 9/10 APPROVE | Clean layering + acyclic admin graph; T11/T12 seams real; 2 items gated for **T12** (revocation, `/api` matcher) |
| Hacker (S11) | SKIPPED | medium complexity — Security + Arch at full depth substitute for chaos testing on this trust boundary |

---

## E2E Anomaly Investigated (why the verdict is still SHIP)

During the authoritative run I hit two DIFFERENT intermittent admin-e2e failures.
I root-caused BOTH to **test-harness issues, not T10 product defects**, and proved
the fix:

1. **First run (mobile only, 29/30):** the AC-9 round-trip test's `add-to-cart`
   button rendered `disabled` with label "Agotado". Diagnosis: the running **dev
   server held a stale route/data cache** of the product page (MILANO stock depleted
   by earlier storefront order-placing e2e in the same session) even after I reseeded
   the DB — the exact cache-staleness class the SEQUENCING RULE warns about, here on
   the dev server. Direct DB query confirmed MILANO stock was actually 8/11 (fresh);
   only the server's cache was stale.

2. **Second run (both projects, 28/30):** a *different* test failed — AC-8
   pre-population read flat rate `742.00` instead of the seed `500.00`. Diagnosis:
   **parallel-worker race on the shared `store_settings` singleton** — Playwright's
   `fullyParallel: true` (chromium + mobile + workers) let the AC-9 round-trip test
   (which mutates the flat rate to 742.00 then restores it) run concurrently with the
   AC-8 read test. Direct DB query confirmed the row was restored to 500.00.

3. **Proof:** on a **fresh dev server + fresh seed + `--workers=1` (serial)**, the
   full `admin.spec.ts` passed **30/30** (both chromium + mobile). This matches QA's
   documented 30/30 and confirms the auth/settings/cache-bust/storefront-reflection
   product logic is correct. The failures were shared-mutable-state test isolation +
   dev-server cache staleness, reproducible only under parallel/stale-cache execution.

This is a genuine **test-quality** finding (logged below as a residual), but it does
not gate the release: the feature is correct, and the suite is green under the
correct, documented execution discipline (fresh server, serial, reseed-between).

---

## Residual Risks Accepted

All previously documented; none blocking. Verified they are documented and did not
re-block on them:

- **SEC-M-1** — Stateless session, no server-side revocation. Stolen cookie valid
  ≤8h. In-spec (Phase-1). Mitigated by HttpOnly + Secure-in-prod + 8h max-age +
  secret-rotation lever. **Arch flags this as a T12 GATE** (refund-capable session
  must become revocable) — carry forward to T12 planning.
- **SEC-M-2** — Per-IP best-effort limiter; IP-rotation/XFF-spoof bypass. In-spec;
  real defense is scrypt cost + password entropy; `maxKeys=10,000` bounds memory-DoS.
- **SEC-M-3** — `ADMIN_SESSION_MAX_AGE_SECONDS` Edge/Node override drift. Fail-safe
  (Node authoritative; an Edge-default gate only ever forces a re-login, never grants).
- **SEC-L-1** — dev fixture password in `e2e/admin.spec.ts` (ensure deploy pw ≠ fixture).
- **SEC-L-2** — client-bundle secret scan should gate on a PROD build in CI (dev scan
  clean; prod scan is the definitive gate).
- **SEC-L-3** — case-sensitive `/admin` matcher (`/Admin`→404, documented non-bypass).
- **Test isolation (NEW, this stage)** — `admin.spec.ts` AC-8 and AC-9 tests share
  the mutable `store_settings` singleton; under `fullyParallel` they race. Run admin
  e2e serially (`--workers=1`) or `test.describe.serial`, and restart the dev server /
  reseed before it. LOW risk; test-only; does not affect product behavior.
- **Pre-existing** — cross-project mobile stock-depletion e2e race (reseed-between);
  2 moderate transitive `postcss` advisories (via `next`, build-time, not T10);
  payment-panel unit flake (passed here in the full 1376/1376 run).
- **Env-gated blocked-on-user** (unchanged by T10) — live MP/email side effects use
  placeholder creds; authed prod-build e2e over HTTPS not run (Secure-cookie
  constraint is intentional).

---

## SHIP Criteria Checklist

- [x] All tests pass — unit 1376/1376, integration 188/188, storefront e2e 78/78,
      admin unauth 6/6, admin authed 30/30 (serial). Zero product-code failures.
- [x] All acceptance criteria verified in code — 16/16 with concrete evidence.
- [x] Quality score ≥ 8/10 — 9/10.
- [x] No critical security vulnerabilities — 0 critical / 0 high (Security: SECURE).
- [x] No critical bugs remaining — the P1 (`$`-mangled hash) was found + fixed + regression-locked.
- [x] UX states complete — loading/empty/error/success all present (UX 9.5/10, 0 holes).
- [x] Mobile responsive verified — no h-scroll 320–1440px; admin e2e green on Pixel 7.
- [x] Auth enforced and data scoped — defense-in-depth (Edge → Node layout → per-action re-verify); single-owner singleton, no IDOR; secrets server-only, absent from client bundle.

No NO-SHIP condition is present.

---

## What Was Built

A self-managed, HMAC-SHA256-signed, HttpOnly session-cookie admin authentication
system (deliberately NOT Supabase Auth) fronting a locale-free `/admin` shell with a
Store Settings editor. Defense-in-depth route protection (Edge Web-Crypto middleware
gate → Node `node:crypto` layout guard → per-action re-verification), a single-owner
scrypt credential check with dummy-hash timing parity and anti-enumeration, a per-IP
rate limiter, and a strict pesos↔cents money parser. Store settings write through the
RLS-bypass admin client and bust the storefront cache tag so the footer/checkout
reflect changes on next render. Zero new dependencies, no schema migration.

---

## Summary

T10 is a correct, security-literate, well-architected implementation of the app's top
trust boundary that passes every gate under the documented execution discipline; the
only anomalies encountered were test-harness isolation/caching artifacts (proven, not
product defects) and pre-accepted residuals correctly deferred to Phase 2 / T12.
**SHIP.**

---
---

# Ship Decision: T11 — Admin Product Management

## Verdict: SHIP

## Confidence: HIGH

## Quality Score: 9/10

Full-cycle, HIGH complexity — all 12 stages ran (incl. Stage 11 Hacker). Every
verification below was re-run independently at this gate against the live local
Supabase and fresh builds/servers; I trusted no report's numbers.

---

## Test Results (independently re-run this stage)

| Suite | Total | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit (Vitest) | 1469 | 1469 | 0 | 0 |
| Integration (`scripts/run-integration.sh`, live DB) | 219 | 219 | 0 | 0 |
| E2E storefront chromium regression — prod build (payment 8 + checkout 12 + cart 19) | 39 | 39 | 0 | 0 |
| E2E admin unauth-guard / login-session — prod build (chromium + mobile) | 20 | 20 | 0 | 0 |
| E2E admin-products — dev serial (chromium + mobile) | 46 | 46 | 0 | 0 |
| E2E admin-products-chaos — dev serial (chromium + mobile) | 4 | 4 | 0 | 0 |
| E2E admin core (T10 regression) — dev serial (chromium + mobile) | 30 | 30 | 0 | 0 |
| **Total** | **427** | **427** | **0** | **0** |

Static gates: **tsc --noEmit = 0**, **eslint . = clean (exit 0, incl. `max-lines`)**,
**`next build` = exit 0** (all admin routes present: `/admin/products`,
`/admin/products/[id]/edit`, `/admin/products/new`, `/admin/products/export`,
`/admin/qa`, `/admin/taxonomy`). tsconfig restored after the `NEXT_QA_DIST_DIR` build.

## Verification Matrix (with evidence)

| # | Check | Evidence | Result |
|---|-------|----------|--------|
| 1 | Unit 1469/1469 | `npx vitest run` → 87 files, 1469 passed | ✅ |
| 2 | Integration 219/219 | `bash scripts/run-integration.sh` → 19 files, reset+seed+run | ✅ |
| 3 | Migrations 0001..0011 apply clean | `supabase db reset` applied 0011 with only idempotent-guard NOTICEs | ✅ |
| 4 | AC-2: storage survives `stop && start && db reset` | full cycle run live; `STORAGE_S3_URL` issued on start; after reset `product-images` bucket `public=t` present | ✅ |
| 5 | AC-1: ledger + RPC exist post-reset | `inventory_adjustments` table present (RLS on, 0 policies); `record_inventory_adjustment` `prosecdef=t`, `proconfig={search_path=""}`, EXECUTE granted only to postgres+service_role | ✅ |
| 6 | Storefront chromium regression (prod) | 39/39 — proves `next.config.ts` image-protocol change did not regress storefront | ✅ |
| 7 | Admin unauth-guard + login-session (prod) | 20/20 both projects | ✅ |
| 8 | Authed admin-products e2e (dev, fresh seed+server, serial) | 46/46 — full T11 surface live | ✅ |
| 9 | Chaos e2e (dev serial) | 4/4 — int4-overflow → friendly field error, no 500, no raw "out of range", no write | ✅ |
| 10 | T10 admin core intact after AdminShell widening | admin.spec 30/30 (settings validation + save round-trip + storefront reflect + login/logout + locale routing); nav-flip test asserts Products LIVE, Orders disabled | ✅ |
| 11 | AC-34: client bundle secret scan on **prod build** | grep of `.next-verify-t11/static` → 0 hits for SUPABASE_SECRET_KEY, service_role, ADMIN_SESSION_SECRET, ADMIN_PASSWORD_HASH, createAdminClient, record_inventory_adjustment, scryptSync, timingSafeEqual, verifyCredentials, createSessionCookieValue, NEXT_PUBLIC_ADMIN | ✅ |
| 12 | AC-34: export route unauth | live `GET /admin/products/export` (no session) → 307 → `/admin/login`; body has 0 SKU/slug/cost leaks; handler also self-guards 401 | ✅ |
| 13 | AC-33: file-size cap | no src file > 1000 (hard cap); largest T11 file `fields.tsx`=466 (under cap, eslint green); no `: any` / `as any` in admin lib/app | ✅ |
| 14 | Cache discipline | `updateTag`/`revalidateTag` single-sourced in `cache-tags.ts` — 0 other callers in `src/lib/admin`+`src/app/admin` | ✅ |
| 15 | T12 API gate respected | no `/api/admin/*` handler exists (only `/api/webhooks/mercadopago`, signature-auth) | ✅ |
| 16 | `.env.local` untracked | `git check-ignore .env.local` matches; git history clean | ✅ |

## Acceptance Criteria Final Check (35/35 + 10 edges)

| # | Criterion | Code | Evidence | Verdict |
|---|-----------|------|----------|---------|
| AC-1 | Migration 0011 idempotent; ledger+RPC+indexes; types | `0011_admin_inventory_and_storage.sql`; `types/tables-content.ts`, `types/rpc.ts` | reset applied clean; ledger/RPC present in DB; integration RPC atomicity/negative tests; tsc 0 | ✅ |
| AC-2 | config.toml storage re-enable; healthy; public bucket | `supabase/config.toml` `[storage] enabled=true` | full stop/start/reset cycle live → bucket `public=t` survives | ✅ |
| AC-3 | Nav products→live; guard inherited | `src/lib/admin/constants.ts` | admin.spec:150 nav test (Products LIVE, Orders disabled) | ✅ |
| AC-4 | Admin list: any status, admin client, BASE table, paginated, uncached | `products/list-query.ts` | admin-products list/draft-filter/pagination e2e | ✅ |
| AC-5 | Table cols cover/name/brand/SKU/price/stock/status/updated | `product-table.tsx` | admin-products:96 | ✅ |
| AC-6 | Search + brand/category/status/stock filters, URL-synced, AND | `list-filters.ts` | admin-products search/brand-filter e2e | ✅ |
| AC-7 | Pagination clamp + empty state | `pagination.ts`, `product-empty-state.tsx` | admin-products:132/143 clamp + empty | ✅ |
| AC-8 | Row→edit + "Nuevo" CTA | products routes | admin-products list e2e | ✅ |
| AC-9 | Full product model | `product-input.ts` | create/edit e2e persists model | ✅ |
| AC-10 | Peso-string money; strict cm/kg parsers | `units.ts`, `settings-input.ts` | dup/validation e2e; CSV thousand-sep unit+e2e; int4 chaos e2e | ✅ |
| AC-11 | Create/edit write+bust; session first | `product-write.ts` | create→storefront + edit-price→PDP e2e; M-1/M-2 integration; export-guard | ✅ |
| AC-12 | Dup slug/SKU → field error, no 500 | `product-write.ts` (23505 map) | admin-products:221 dup-SKU field error | ✅ |
| AC-13 | Inline errors, form filled, focus-first-invalid; generic banner | `product-form.tsx` | validation e2e; UX audit live (focus-first + 4 aria-invalid) | ✅ |
| AC-14 | Upload jpeg/png/webp ≤5MB; server re-validates (magic bytes) | `image-write.ts` | image upload e2e; bad-type reject e2e; magic-byte integration | ✅ |
| AC-15 | Drag + kbd reorder; single cover | `usePointerReorder`, `image-manager.tsx` | ↑/↓ reorder + cover e2e; setCover never-zero integration | ✅ |
| AC-16 | Delete row+object; failed object-delete keeps row; promote cover | `image-write.ts` | delete e2e (M-7 lock); promote-next integration | ✅ |
| AC-17 | Storefront reflects image; next/image renders | `cache-tags.ts`, `next.config.ts` | upload e2e; create→storefront cache-bust proof | ✅ |
| AC-18 | Variant CRUD hex/SKU/stock/override/sort | `variant-input.ts` | variant editor e2e | ✅ |
| AC-19 | Variant-image assoc; remove handles images + warn | `variant-write.ts`, `image-write.ts` | duplicate copies variants (integration); editor warn | ✅ |
| AC-20 | Variant writes strict; dup SKU field error | `variant-input.ts` (M-6 stable key) | admin-products:386 in-form dup-SKU | ✅ |
| AC-21 | Brand/style/tag CRUD; slug uniqueness | `taxonomy-write.ts` | taxonomy create e2e; 23505→slug-dup integration | ✅ |
| AC-22 | Category nesting; cycle client+server | `category-tree.tsx`, 0002 trigger | admin-products:435 nesting; cycle trigger integration | ✅ |
| AC-23 | Delete restrict/set-null/detach | `taxonomy-write.ts` | admin-products:462 delete-restrict; 23503 integration | ✅ |
| AC-24 | is_active hide facet after bust | `cache-tags.ts` | status flip→storefront-removed e2e; M-2 old+new bust integration | ✅ |
| AC-25 | Manual adjustment delta/absolute + reason; atomic | `inventory-write.ts` + RPC | admin-products:486 (stock updates + ledger row); RPC integration | ✅ |
| AC-26 | Negative rejected (CHECK + friendly) | RPC + `inventory-input.ts` | negative-block e2e; RPC negative integration | ✅ |
| AC-27 | Duplicate deep copy, unique slug/SKU, draft | `product-duplicate.ts` | admin-products:287 draft/-copia; deep-copy contents integration | ✅ |
| AC-28 | Q&A unanswered-first; one-write answer; unpublish; delete; bust | `qa-write.ts` | admin-products:541 ask→answer→storefront; qa integration | ✅ |
| AC-29 | Export all, columns, RFC-4180, headers | `csv-generate.ts` | export e2e (header + line count); formula-escape integration | ✅ |
| AC-30 | Import dry-run preview, ZERO writes | `csv-product-map.ts` | admin-products:617 (Crear/errores, 0 writes) | ✅ |
| AC-31 | Confirm by slug; resilient; counts; bust once | `csv-import-write.ts` | CSV confirm e2e (good row only); M-3 within-row atomicity integration | ✅ |
| AC-32 | Malformed CSV rejected, zero writes | `csv-parse.ts` | bad-money/unknown-brand reported-not-written e2e; parser unit | ✅ |
| AC-33 | tsc/eslint/build; no >400 (cap 1000); no any/! | — | tsc 0, eslint clean, build exit 0 (this stage); largest 466; no any/! in admin | ✅ |
| AC-34 | Secret not in client; no route bypasses requireSession | `server-only` guards, `export/route.ts` | prod-build bundle scan 0 hits; export 307→login live; no `/api/admin/*` | ✅ |
| AC-35 | Storefront regression green; admin e2e serial | — | storefront chromium 39/39 + guard 20/20 prod; admin 30/30 + admin-products 46/46 + chaos 4/4 dev serial | ✅ |

**Edge cases (10/10):** dup slug/SKU race (AC-12 e2e + 23505 integration), category cycle
(trigger integration + client-hide), delete-restrict/set-null/detach (admin-products:462 +
23503), image failures (bad-type e2e + reconciliation integration), CSV chaos (parser unit +
thousand-sep/unknown-slug e2e + **int4 overflow chaos e2e**), concurrent inventory (RPC
row-lock integration), variant-vs-product stock (explicit dialog target), session expiry
(export 307→login live; every action `requireSession()` first — verified in security audit),
unpublish cached question (qa bust integration + e2e), storage re-enable boot (full
stop/start/reset cycle run live this stage). All evidenced.

## Report Summary

| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review | 8/10 → all fixed | APPROVE-WITH-FIXES; 0 critical, 9 major + 9 minor all FIXED (S6); trust boundary sound |
| QA | PASS / HIGH | 35/35 AC + 10 edges evidenced; mobile storefront flake proven pre-existing (T11-untouched) |
| UX | 9/10 | Critical fix: full ARIA-APG keyboard tree; mobile save bar; focus rings/targets; scroll-spy deferred (justified) |
| Security | SECURE | 0 crit/high; upload magic-byte sniff, CSV bounds+re-parse+formula-escape, RPC hygiene, prod-bundle scan 0 hits |
| Architecture | 9/10 | APPROVE; T10 list/API recs all landed; compensation-vs-RPC is deliberate Phase-2 debt (not T12) |
| Hacker | 2/10 chaos (target ≤3) | 3 real bugs found+fixed: int4 overflow (CRITICAL-class), variant double-submit, CSV blank-row drop |

## Remaining Concerns (all documented non-blockers — verified, not re-blocked)

- **SEC-T11-M-1** (MEDIUM): client entity ids not uniformly UUID-validated. Not a hole —
  ids flow into parameterized `.eq()` (malformed → 22P02 caught → generic banner), single-owner
  so no IDOR. Recommendation: extend M-4 guard uniformly. → clean-code backlog.
- **SEC-T11-M-2** (MEDIUM): stateless session (no server-side revocation) now covers catalog
  writes. In-spec Phase 1; **the T12 gate** — land session-version/shorter max-age before
  refund-capable T12. Payload `v` field reserved and untouched. → T12.
- **T10 residuals** SEC-M-1/2/3, SEC-L-1/2/3 (SEC-L-2 now closed for T11 via prod-bundle scan).
- **Mobile gotoPDP harness flaw** (storefront `getByTestId("product-gallery")` strict-mode 2
  elements): pre-existing, T11 made zero logic changes to checkout/cart/PDP; chromium (the
  oracle) fully green. → clean-code backlog, not a T11 gate.
- **Arch nits:** compensation-vs-RPC for product/CSV writes (Phase-2 multi-admin trigger, not
  T12); `taxonomy-write.ts:bustEntity` dead `map`/`void map` (XS Boy-Scout); type-only lib→app
  contract import. None blocking.
- **postcss ×2 moderate** transitive via `next` (build-time, pre-existing). → ops backlog.
- Payment-panel unit flake: passed here in the full isolated run (1469/1469). Admin
  stale-cache first-run flake did NOT recur — fresh server + fresh seed gave a clean 30/30.

## What Was Built

Full admin product-management surface behind the existing HMAC session auth: a paginated,
filterable product list over the base table; a full-model add/edit form; multi-image upload
with drag/keyboard reorder + cover; color-variant CRUD; brand/category(nested)/style/tag
taxonomy management; atomic inventory adjustments with an audit ledger (migration 0011 +
`record_inventory_adjustment` RPC); product duplication; a Q&A answering inbox; and a
zero-dependency RFC-4180 CSV import (mandatory dry-run) / export. Supabase Storage was
re-enabled locally with a public `product-images` bucket. Zero new runtime dependencies.

## Summary

T11 is a large, disciplined, well-tested extension of the admin subsystem that passes every
gate under the documented execution discipline. All 427 tests I re-ran pass with zero
failures, all 35 acceptance criteria and 10 edge cases carry concrete evidence, the migration
and storage boot cycle verify live, the prod client bundle is secret-free, and T10 remains
intact. The only open items are pre-accepted, documented residuals correctly scoped to Phase
2 / the T12 gate. **SHIP.**
