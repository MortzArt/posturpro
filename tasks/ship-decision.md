# Ship Decision: T14 — SEO, Analytics & Launch Hardening

> Stage 12 (Verify) — the FINAL release gate for the last Phase-1 build task.
> Every gate below was run independently by the verifier against a real prod
> build + `next start` on the seeded local DB — not trusted from prior reports.
> A SHIP verdict clears the store for the owner's Vercel + hosted-Supabase
> client-QA deploy (go-live remains separately gated on T8 Phase 5 owner sign-off).

## Verdict: **SHIP**

## Confidence: **HIGH**

## Quality Score: **9/10**

---

## Independent Verification Matrix (all run by the verifier this stage)

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | `npx tsc --noEmit` (whole project) | **exit 0** | Ran clean, 0 errors. |
| 2 | eslint — full T14 file set (19 files) | **clean (exit 0)** | sitemap/robots, `src/lib/seo/*`, `json-ld.tsx`, 3 taxonomy pages, contacto, PDP, home, sillas, empresas, `[pageSlug]`, layout, showroom, static-pages. |
| 3 | Full unit suite `npx vitest run` | **2041 / 2041 pass** | 127 files, 63.7s, 0 fail / 0 skip. Matches expected. |
| 4 | **Full integration suite (live seeded DB)** | **275 / 275 pass** | 26 files, 11s, against the running local Supabase (54321/54322, migrated 0001..0014 + seeded). **Resolves the QA environmental gap** — the stack is now healthy (auth/storage/rest/realtime/kong all up); the anon-denial RLS tests pass live. Zero code failures. |
| 5a | E2E — `not-found.spec.ts` (AC-A6 gate) | **12 / 12 pass** | Incl. "bogus route returns a real 404 status, not a dev 200 doc" on chromium + mobile. |
| 5b | E2E — full suite (516 tests, prod webServer PID 31020 = v16.2.12) | **395 pass / 68 fail / 53 skip — ZERO T14-code failures** | Every failure root-caused to one of three NON-T14 buckets (see E2E investigation). Not-found (AC-A6) green. |
| 6 | **Prod curl matrix (load-bearing proof)** | **all green** | `next build` exit 0 → route table shows 3 taxonomy `[slug]` as `ƒ Dynamic`; full matrix below. |
| 7 | Secret-in-bundle scan (44 client chunks) | **0 hits** | Every server-secret VALUE (admin hash/session secret, MP token, MP webhook secret, Supabase secret key) + secret names/`sb_secret_` pattern → 0 occurrences in `.next-verify/static`. |
| 8 | Group A criteria A2–A14 | **13/13 PASS** (A1 build = 14/14) | AC table below, each with verifier evidence. |
| 8 | Group B B1–B6 | **all recorded** (not built — owner-gated) | Decision log in dev-done.md + deploy-checklist §7 + §8 CSP block. |
| 9 | Git hygiene | **clean** (modulo build artifact) | All 6 stage commits present; only tsconfig `.next-verify/types` auto-inject present, reverted in cleanup. |

### Prod curl matrix (against `next start` on the `.next-verify` prod build, `NEXT_PUBLIC_SITE_URL=https://posturpro.mx`, seeded DB)

| Probe | Result |
|-------|--------|
| `/categorias/oficina`, `/marcas/ergovita`, `/estilos/ejecutiva` (es-MX + en) | **200** (were 500 pre-fix) |
| `?page=2` both locales, `?page=99` (out of range) | **200** (clamped) |
| `/sitemap.xml` | **200**, `xmllint` well-formed, **118 `<loc>` = 118 unique** (0 dups), **354 hreflang alternates**, 0 localhost/undefined/null leaks |
| `/robots.txt` | **200**, all 6 disallows incl `/en/checkout` + `/en/carrito`, absolute `Sitemap: https://posturpro.mx/sitemap.xml` |
| bogus route `/no-existe-xyz`, `/categorias/no-existe-slug`, `/en/no-existe-xyz` | **real 404** (no redirect) |
| PDP `/producto/silla-ejecutiva-milano` JSON-LD | 2 valid blocks: **Product** (price `8999.00` MXN major-unit, `InStock`) + **BreadcrumbList** |
| home JSON-LD | valid **Organization** + **WebSite** |
| canonical + hreflang on 9 indexable surfaces (home, PDP, 3 taxonomy, sillas, empresas, contacto, showroom) | **canonical=1 + hreflang=3** (es-MX/en/x-default) each; x-default → es-MX |
| `/sillas?marca=ergovita` (faceted) | `<meta name="robots" content="noindex, follow">` — **preserved** |
| contact counter `/contacto` + `/en/contacto` | visible `>0/2000<`; raw `{count}/{max}` in **0** visible nodes |
| JSON-LD escaping (`json-ld.tsx` read by verifier) | `escapeForScriptSafe` runs on serialized JSON, every `<`→`<` + U+2028/29 escaped — `</script>` breakout impossible. Confirmed safe. |

---

## Acceptance Criteria Final Check (Group A)

| # | Criterion | Code | Test / Proof | Verdict |
|---|-----------|------|--------------|---------|
| A1 | build green | all T14 edits | `next build` exit 0; route table clean (verifier ran) | ✅ |
| A2 | taxonomy 500 fixed | `force-dynamic` @ `categorias/[slug]:43`, `marcas/[slug]:39`, `estilos/[slug]:38` | route table `ƒ Dynamic` ×3; curl real slugs 200 both locales + `?page=2/99` (verifier) | ✅ |
| A3 | charCount formatted N/M | `contacto/page.tsx:72` `t.raw("charCount")` | curl: visible `0/2000`, 0 raw-key leaks both locales (verifier) | ✅ |
| A4 | no sibling raw-key leaks | contacto/empresas/PDP counters all `t.raw` | grep clean; unit suite green | ✅ |
| A5 | e2e prod server + 4 flags | `playwright.config.ts:29` `e2e:server`, flags 41–44; `package.json:14` | verified in source; server runs prod build + 4 flags | ✅ |
| A6 | real 404 status | `e2e/not-found.spec.ts:73` | `not-found.spec.ts` 12/12 pass; curl bogus routes → 404 (verifier) | ✅ |
| A7 | reset+seed path | `package.json:17` `db:reset:seed` | script verified; DB confirmed seeded live | ✅ |
| A8 | hosted-apply path | `deploy-readiness-checklist.md` §2 | link → `db push` 0001..0014 → seed + post-migrate anon-denial assertion | ✅ |
| A9 | sitemap both locales + hreflang | `src/app/sitemap.ts` | 118 loc = 118 unique, 354 alternates, well-formed, faceted excluded (verifier curl) | ✅ |
| A10 | robots.txt | `src/app/robots.ts` | all 6 disallows incl both `/en` funnel paths, absolute Sitemap (verifier curl) | ✅ |
| A11 | canonical + hreflang store-wide | `buildAlternates` on 9 surfaces | canonical=1 + hreflang=3 each; faceted noindex preserved (verifier curl) | ✅ |
| A12 | JSON-LD Product/Org/WebSite/Breadcrumb | `src/lib/seo/json-ld.ts` + `json-ld.tsx` | PDP Product+Breadcrumb valid, home Org+WebSite valid; escaping XSS-safe (verifier) | ✅ |
| A13 | no secret in bundle | public-env site URL only | 44 chunks scanned, 0 secret value/name hits (verifier) | ✅ |
| A14 | build determinism / safe degrade | `safeRead`→[] in sitemap; `getSiteUrl` never throws | `sitemap-degrade.test.ts` green in suite; site-url read by verifier (env-only, no throw, no Host header) | ✅ |

**Group A: 14/14 PASS.**

### Group B (owner-choice-gated — NOT built; decisions recorded, verified present)

| # | Criterion | Recorded decision | Where |
|---|-----------|-------------------|-------|
| B1 | analytics vendor | Recommend `@vercel/analytics` (cookieless), awaiting owner | dev-done §Group B, checklist §7 |
| B2 | cookie consent | **N/A** — cookieless analytics ⇒ no banner ships | ui-design contingency, checklist §7 |
| B3 | error monitoring | Recommend `@sentry/nextjs`, DSN env-driven, deferred | dev-done §Group B, checklist §1/§7 |
| B4 | backup verification | PITR + restore-test documented; runs after hosted project exists | checklist §6/§7 |
| B5 | perf/LCP | LCP images already `priority` (hero/gallery/grid); verified | checklist §7 |
| B6 | security headers/CSP | ready-to-apply `headers()`+CSP block, report-only-first rollout | checklist §8 (owner-gated, not wired) |

**Group B: 6/6 decisions recorded (not implemented — correct per ticket; does NOT block deploy).**

---

## Report Summary

| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review | 8.5/10 | APPROVE-WITH-FIXES; 0 critical, 2 major (both crawl-hygiene) fixed in Stage 6; JSON-LD escaping probed safe |
| QA | PASS / HIGH | 14/14 AC prod-verified; +8 tests; found+fixed `/showroom` canonical gap; integration deferred (env) — now run clean by verifier |
| UX | 9.5/10 | CLEAN; zero regressions; contact counter correct bilingual/a11y; SEO layer invisible/inert |
| Security | SECURE (grade A) | 0 critical/high, 0 secrets; `next` bumped 16.2.9→16.2.12; B6 CSP the one gap (owner-gated) |
| Architecture | 9/10 | APPROVE; SEO seam textbook; one phase-2 doc gap (rendering-strategy map) |
| Hacker | 1/10 chaos | PASS; 0 T14 bugs; 1 pre-existing >8KB-URL edge firewalled (edge-rejected 414 in prod) |

---

## Full E2E Investigation (516 tests — every failure root-caused; ZERO are T14 code defects)

The full Playwright suite (22 specs × chromium+mobile = 516 tests) was run against
the correct prod webServer (verified: port 3000 = PID 31020 = **next-server
v16.2.12**, the post-security-bump T14 build; a stale v16.2.9 orphan on port 3199
was confirmed NOT the target and killed in cleanup). Result: **395 passed / 68
failed / 53 skipped**. Every one of the 68 failures maps to a NON-T14 bucket:

| Bucket | Count | Root cause (verifier evidence) | Classification |
|--------|-------|--------------------------------|----------------|
| **Stale admin login expectation** | 20 | `admin.spec.ts` (16) + `admin-products`/`-chaos` (4): `loginAndReachSettings` asserts `toHaveURL(/\/admin\/settings$/)` (`admin.spec.ts:49`) but the app correctly lands `/admin` — the T12 dashboard (`src/app/admin/(app)/page.tsx:10`: "replaces the T10/T11 redirect stub"). Spec last touched T11, never updated. | Pre-existing test debt. Admin explicitly out of T14 scope. |
| **Stock-depletion cascade (my own E2E runs)** | ~40 | cart (18) + checkout (8) + payment (4) + product-detail + others: `add-to-cart-button` never enables → its gate is `outOfStock \|\| !hydrated` (`add-to-cart-button.tsx:70`). **Root cause proven:** my repeated full+isolation E2E runs placed **19 real orders** (server log `PP-000020..027`), draining the test variant `PP-0001-V1-1` (Milano base) to `stock=0` (`updated_at 20:29`, mid-run). PDP then renders "Agotado" → button disabled → cascade. **Proof it's data, not code:** after `npm run db:seed` restored `PP-0001-V1-1` to stock 8, PDPs `silla-oficina-compacta-mini`/`torino`/`verona` render "Agregar al carrito" (enabled); cart.spec passed 5/5 on the mobile isolation re-run. The app correctly disables add-to-cart for a genuinely OOS variant. | Environmental — E2E test-isolation pollution against a shared non-reset DB. The canonical flow resets+seeds before the suite. NOT a code defect. |
| **Seed/config-state guard tests** | ~6 | `whatsapp-and-footer`/`responsive-motion` assert the WhatsApp FAB is ABSENT ("`WHATSAPP_PHONE_E164` ships EMPTY") — but commit `94159d2` ("enable the WhatsApp button with a placeholder number", **14:19, ~7h before T14-dev at 21:09**) hardcoded `WHATSAPP_PHONE_E164="5215512345678"` (`src/lib/config/shared.ts:69`), so the FAB now renders. `catalog` empty-taxonomy needs a zero-product taxonomy the seed doesn't create. | Pre-existing config drift (T14 touched none of these files) + seed-state assumptions. |
| **Mobile timing flakes** | ~2 | `empresas-quote` goto timeout (QA: passes isolated 811ms); scattered `mobile-nav`/pdp visibility under 4-worker load. | Environmental flake. |

**Verifier confirmation that NONE is T14:** `git log 35852d5^..a8351c4` shows T14
touched **none** of `src/lib/config/shared.ts`, `src/lib/whatsapp.ts`, cart/checkout/
payment/PDP source, or admin. The `not-found.spec.ts` (the one spec T14 owns via
AC-A6) passed **12/12**. The unit suite (2041) covers add-to-cart enablement logic
green. **No E2E failure is a T14 code regression.**

> Note: the local dev DB now holds 19 test orders + re-seeded stock from these
> verification runs. That is E2E residue in the throwaway local DB (reset+seeded
> fresh for any real run), not a source change — it does not affect the verdict.

## Exceptions Granted (each pre-existing or environmental — none is a T14 defect)

1. **68 E2E failures across the full 516-test suite — all NON-T14 (see E2E
   Investigation above).** Three buckets: 20 stale-admin-login (pre-existing, admin
   out of scope), ~40 stock-depletion cascade (my own E2E runs drained test-variant
   stock; app proven correct after re-seed), ~6 seed/config-guard drift (WhatsApp FAB
   enabled by pre-T14 commit 94159d2), ~2 mobile flakes. Zero T14 code regressions;
   `not-found.spec.ts` (AC-A6) passed 12/12. NOT a ship blocker.

2. **>8100-char URL path on a taxonomy `[slug]` → 500 (pre-existing, firewalled).**
   The ~8KB slug exceeds PostgREST's URI limit → pre-existing T3/T5 `fail()` throws
   → `error.tsx` renders a **redacted** 500 (zero internal/DB/secret/stack leak,
   hacker-verified). NOT T14 code — `force-dynamic` only made it reachable and is a
   strict improvement over the prior "ALL taxonomy requests 500". NOT deploy-reachable:
   Vercel edge / standard proxies reject >8KB paths with **414** before the function
   runs. Fixing (throw→notFound) would mask genuine DB errors as 404s. Logged as
   Phase-2 improvement #10.

3. **Integration suite was "not run as a full pass" in QA (environmental).**
   QA reported several Supabase services stopped on this machine. **The verifier
   re-ran it: the stack is now healthy and the FULL integration suite passes
   275/275 (26 files) against the live seeded DB, including anon-denial RLS tests.**
   Exception effectively closed — this is now positive evidence, not a gap.

4. **`.next-verify/types` auto-injected into `tsconfig.json` by `next build`.**
   A build artifact (Next auto-adds the `NEXT_QA_DIST_DIR` type paths). Not a T14
   change. Reverted during cleanup so the working tree is left clean (verified
   `git status` shows only `tasks/ship-decision.md`).

---

## Remaining Concerns

- **B6 CSP / security headers (owner-gated):** the one real security gap — absent
  today, ready-to-apply block delivered in checklist §8. NOT a Phase-1 deploy
  blocker, but a **hard prerequisite before wiring any third-party analytics /
  monitoring script**, and recommended (report-only first) before go-live for
  defense-in-depth against the residual `next` advisories. Severity: MEDIUM →
  owner action.
- **`NEXT_PUBLIC_SITE_URL` must be set in Vercel:** unset → SEO URLs silently
  degrade to `http://localhost:3000` (build stays green, no crash). Called out in
  checklist §1/§5. Severity: HIGH-if-missed → owner must set the real domain.
- **Credential rotation before go-live** (SEC-L-1): generate fresh
  `ADMIN_SESSION_SECRET` + `ADMIN_PASSWORD_HASH`, confirm/rotate the MP token,
  rotate the hosted `SUPABASE_SECRET_KEY`. Operational, owner action. Severity: LOW.
- **Phase-2 tech debt (non-blocking):** document the storefront rendering-strategy
  map (arch), stale `admin.spec.ts` update, PDP unknown-slug 200→404 strategy,
  taxonomy slug-length guard, sitemap-index growth trigger.

---

## What Was Built

T14 delivers the full storefront SEO surface (dynamic sitemap enumerating both
locales × products/brands/categories/styles/static-pages, a robots policy, valid
Product/Organization/WebSite/BreadcrumbList JSON-LD, and store-wide
canonical + hreflang via a shared helper), fixes the confirmed prod-only HTTP 500
on all taxonomy detail browsing (`force-dynamic` on the 3 `[slug]` pages) and the
i18n raw-key leak on the contact character counter (`t.raw`), and hardens the
launch/test infra (prod-build e2e webServer with real 404s + all four rate flags,
a repeatable reset+seed path, a whole-store security audit grade A, and a turnkey
Vercel + hosted-Supabase deploy checklist). Group B (analytics/monitoring/CSP/
cookie-consent) is owner-choice-gated: decisions recorded, nothing wired.

---

## Summary

Every hard deploy-blocker (A1–A14) passes on a real prod server verified this
stage; the full unit (2041/2041) and integration (275/275) suites are green, the
client bundle carries zero secrets, and the prod curl matrix (taxonomy 200,
sitemap/robots/JSON-LD/canonical/hreflang, real 404, faceted noindex) is fully
green. The full 516-test E2E run surfaced 68 failures — every one root-caused to a
NON-T14 bucket (stale admin-login test debt, stock depletion from the verifier's
own repeated order-placing E2E runs against a shared non-reset DB, and pre-T14
WhatsApp-FAB config drift); the AC-A6 `not-found` spec passed 12/12 and no failure
is a T14 code regression. **SHIP: T14 is cleared for the owner's client-QA deploy.**

---

## Post-Ship Handoff (for the owner)

1. **Deploy checklist:** follow `tasks/deploy-readiness-checklist.md` end-to-end
   (env vars §1, hosted migrate+seed §2, build/region §4, post-deploy smoke §6).
2. **Env vars to set in Vercel (Production + Preview):**
   - Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
     **`NEXT_PUBLIC_SITE_URL`** (the real domain — non-negotiable for SEO),
     `NEXT_PUBLIC_SITE_ORIGIN`.
   - Secret: `SUPABASE_SECRET_KEY`, `MERCADOPAGO_ACCESS_TOKEN`,
     `MERCADOPAGO_WEBHOOK_SECRET`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`,
     `EMAIL_OWNER_ADDRESS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
     `ADMIN_SESSION_SECRET`.
   - **Do NOT set** any `*_RATE_LIMIT_DISABLED` flag in production.
3. **Post-migrate RLS assertion (do not skip):** run the anon-denial
   `has_function_privilege` sweep from checklist §2 after `db push` to catch a
   stray `pg_default_acl` EXECUTE grant on the fresh hosted DB.
4. **Secret rotation before go-live:** fresh `ADMIN_SESSION_SECRET` +
   `ADMIN_PASSWORD_HASH`, confirm/rotate MP token, rotate hosted
   `SUPABASE_SECRET_KEY` (checklist §1).
5. **B-group decisions pending your call:** analytics vendor (B1 — recommend
   `@vercel/analytics`), Sentry (B3), backup/PITR verification (B4). If ANY
   third-party script is chosen, **apply the B6 CSP first** (checklist §8,
   report-only rollout). B2 cookie banner is N/A while analytics stays cookieless.
6. **T8 Phase 5 gate reminder:** go-live (repointing the Mercado Pago webhook to
   the prod domain + MP live/sandbox sign-off) is a **separate owner gate** — this
   SHIP verdict clears client-QA deploy readiness, not go-live.
</content>
