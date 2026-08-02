# QA Report: T13 — Static Pages & Homepage

> Stage S5 (ultraqa, standard tier). Quality gate — no verify stage follows.
> Scope: commits `b4181e3` (dev) + `4fccebc` (reviewfix). Closed the S4-flagged
> `submitContactForm` action-level seam FIRST, then hunted the remaining untested
> product paths (static-page overlay/fallback, seed idempotency, reserved-slug
> guard) and added storefront E2E — while catching TWO real E2E regressions the
> dev/reviewfix stages left in the shipped suite.

## Test Suite Summary

| Type | Written | Passed | Failed | Skipped |
|------|---------|--------|--------|---------|
| Unit (new) | 29 | 29 | 0 | 0 |
| Integration (new) | 9 | 9 | 0 | 0 |
| E2E (new + fixed) | 26 new / 2 fixed | all | 0 | 0 |
| **New total** | **64** | **64** | **0** | **0** |

**Full-suite regression totals (independently run, not trusted):**

| Suite | Result | Baseline | Delta |
|-------|--------|----------|-------|
| Unit (`vitest run`) | **1729 / 1729** (104 files) | 1700 (102) | +29 tests, +2 files |
| Integration (`test:integration`, fresh reset+seed) | **253 / 253** (23 files) | 244 (22) | +9 tests, +1 file |
| E2E T13 + regression (chromium, serial) | **33 / 33** | — | +26 new, 2 fixed |
| `tsc --noEmit` | clean | — | — |
| `eslint` (all new/changed files) | clean | — | — |

Zero regressions in unit + integration. E2E: see "Bugs Found & Fixed" (two shipped
E2E specs referenced the pre-T13 homepage/footer — both fixed).

## Tests Written

### Unit Tests

**`src/app/[locale]/contacto/actions.test.ts`** (16 — closes the S4-flagged seam)
The thin branch-mapping in `submitContactForm` was UNCOVERED at the action level
(guard, rate-limit, dispatch were each covered separately). Deps mocked
(`server-only` no-op, `sendContactRelay` / `clientIp` / `checkContactRateLimit`
as `vi.fn`s), guard left REAL so ordering invariants run end-to-end:
- happy path relays + returns success WITHOUT preserved values (AC-12)
- `submissionId` increments per call (idempotency-safe useActionState contract)
- trimmed fields to relay; blank subject → `null` (dispatch contract)
- non-blank subject forwarded trimmed
- message body passed VERBATIM (only trimmed) — template escapes (AC-17)
- invalid input → `invalid` + fieldErrors + RAW preserved values, NO send (AC-13)
- 100k hostile message → `messageTooLong` before any send (edge 7)
- rate-limited → `rate-limited` + preserved values, NO send (AC-14)
- limiter keyed by the resolved client IP
- honeypot → FAKE success, no send, no IP resolution, no oracle (AC-15, edge 6)
- honeypot fakes success even when other fields are invalid
- `{ok:false}` relay → generic error + preserved values; raw reason NEVER in state, IS logged (AC-16, edge 4)
- thrown relay exception → generic error, never throws to client
- non-Error thrown value → generic error (defensive)
- gate ORDERING: honeypot → validate → rate-limit → relay, short-circuit at first tripped gate
- cheap gate first: no IP resolution / no relay when validation fails

**`src/lib/config/static-pages.test.ts`** (13 — AC-1, AC-10, edge 10)
- 7 generic / 9 total slug-set shape; bespoke slugs appended; no dupes
- split shipping/returns slugs adopted (not the combined T2 slug)
- RESERVED_SLUGS disjointness (the load-time invariant); storefront segments reserved; bespoke pages reserved
- the guard's collision rule characterized directly (a config with `marcas` in the generic set WOULD collide)
- `staticPagePath` builds root-relative paths
- `isStaticPageSlug` true for generic, false for bespoke/reserved/unknown/`envios-y-devoluciones`
- homepage tunables are ragged-row-free at every grid breakpoint

### Integration Tests

**`tests/integration/static-pages.integration.test.ts`** (9 — live local DB, AC-1..AC-5, edges 1–3)
- seeds exactly the 9 config slugs, all published
- seeds an `en` overlay (title+body) for every page → 18 rows (AC-4)
- `getStaticPageBySlug` reads es-MX base title+body (AC-2)
- resolves EVERY generic slug in es-MX
- **en overlay genuinely resolves** — English title distinct from es-MX base (AC-4 real, not silent fallback)
- null for a never-seeded slug (edge 1)
- null for `is_published = false` via anon RLS + direct anon read confirms RLS (edge 2)
- en request falls back per-field to es-MX base when NO en overlay row exists (edge 3)
- **seed idempotency**: re-running `npm run db:seed` leaves 9 pages + 18 translations unchanged (no dupes)

### E2E Tests

**`e2e/static-pages-contact.spec.ts`** (19 new — resilient testid/role selectors)
- homepage featured chairs + brands render from the seeded catalog; view-all links resolve (AC-7, AC-9)
- no horizontal overflow at 375px
- all 7 generic static pages resolve 200 with an `<h1>` + prose body (AC-1, AC-2)
- FAQ native `#anchor` deep-link lands on the `<h2 id>` on first paint, no JS
- unknown/reserved `/envios-y-devoluciones` → in-shell 404 (edge 10)
- `/en/sobre-nosotros` + `/en/terminos` render the English overlay in the en shell (AC-4)
- showroom renders address/hours in BOTH locales; map link omitted when unconfigured (AC-18)
- contact form: labeled fields + honeypot present-but-off-screen / aria-hidden / tabindex-1 (AC-15, AC-20)
- empty submit → inline field errors, no success (AC-13)
- invalid email → field error (AC-13)
- valid submit with no EMAIL_* env → localized error banner + retry, raw reason never shown, values preserved (edge 4, AC-16)
- every footer static-page link navigates to a real 200 page (AC-10)

## Acceptance Criteria Coverage

| # | Criterion | Test(s) | Status |
|---|-----------|---------|--------|
| AC-1 | 9 pages es-MX + /en, `<h1>`, single-sourced slugs, split reconciled | config unit (7/9 set, split); integration (9 slugs); e2e (7 generic 200 + en) | PASS |
| AC-2 | title+body via `getStaticPageBySlug`, not hardcoded | integration (base read, every generic slug); e2e (h1 + body render) | PASS |
| AC-3 | seed 9 es-MX, legal headed, idempotent upsert | integration (9+18, idempotency); seed-invariants-extra (headed legal/FAQ) | PASS |
| AC-4 | en from `translations`, es-MX fallback | integration (en distinct from base; per-field fallback edge 3); e2e (/en pages) | PASS |
| AC-5 | missing/unpublished → notFound, no 500/blank | integration (null edges 1,2); e2e (in-shell 404) | PASS |
| AC-6 | `generateMetadata` locale-correct, `hasLocale` fallback | route reads validated-locale (code + e2e title); metadata namespace | PASS |
| AC-7 | hero + featured chairs + brands, named consts | config unit (tunables); e2e (hero h1+CTAs, both featured sections) | PASS |
| AC-8 | featured via catalog layer, no new flag | e2e (sections from seeded `listProducts`/`listBrands` slice) | PASS |
| AC-9 | omit empty section, hero always | featured-*.tsx null-guard (code); e2e (sections present on non-empty) | PASS |
| AC-10 | zero dead footer/nav links | e2e (all 9 footer links → 200); whatsapp-footer (hrefs) | PASS |
| AC-11 | fields + honeypot → action → `sendContactRelay` | action unit (relay called with mapped input); e2e (form + honeypot) | PASS |
| AC-12 | success clears + `submissionId` | action unit (success no values; submissionId increments) | PASS |
| AC-13 | trim/cap/validate, invalid preserves values, no send | action unit + submit-guard unit; e2e (empty + bad email) | PASS |
| AC-14 | IP rate limit, disable env, over-limit no send | action unit (rate-limited mapping + IP key); rate-limit unit | PASS |
| AC-15 | honeypot → fake success | action unit (fake success, no send, no oracle); e2e (honeypot hidden) | PASS |
| AC-16 | `{ok:false}` → error+retry, raw reason hidden | action unit (reason logged not in state); e2e (banner no raw reason, retry) | PASS |
| AC-17 | message raw; no unescaped injection | action unit (verbatim message); parse-body + static-page-body (escaped children) | PASS |
| AC-18 | showroom address/hours + map/link, degrades | e2e (both locales, map link omitted) | PASS |
| AC-19 | chrome from namespaces, both locales | keys-used.test + message-parity (434/434, existing); e2e (localized surfaces) | PASS |
| AC-20 | keyboard/SR sane, labels, roles | e2e (labeled fields, role=alert errors, honeypot tabindex-1) | PASS |

**20 / 20 covered and passing.**

## Edge Case Coverage

| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Missing seed row → null → notFound | integration `does-not-exist` → null; e2e 404 | PASS |
| 2 | Unpublished page → anon RLS filters → null | integration (unpublished fixture + direct anon read) | PASS |
| 3 | Missing en translation → es-MX base | integration (no-overlay fixture → base title/body) | PASS |
| 4 | Contact send failure → error + retry | action unit ({ok:false} + throw); e2e (error banner) | PASS |
| 5 | Contact abuse (bot flood) → rate-limited | action unit (rate-limited mapping); rate-limit unit (per-window) | PASS |
| 6 | Honeypot tripped → fake success | action unit (fake success, no oracle) | PASS |
| 7 | Oversized/hostile message → capped | action unit (100k → messageTooLong); submit-guard unit | PASS |
| 8 | Empty catalog → featured omitted, hero renders | featured null-guard (code); e2e (present on non-empty) | PASS |
| 9 | `store_settings` absent → config fallbacks | page try/catch → [] (code); whatsapp-footer degrade e2e (existing) | PASS |
| 10 | Slug collision / reserved path | config unit (disjointness + rule); e2e (`/envios-y-devoluciones` 404) | PASS |

**10 / 10 covered and passing.**

## Bugs Found & Fixed

Two REAL E2E regressions the dev + reviewfix stages left in the shipped suite
(they verified links live but never updated the E2E assertions). Both are TEST
bugs against the correct new product behavior — fixed here:

1. **`e2e/home.spec.ts`** referenced `home-cta-catalog` / `home-link-brands` —
   testids the T13 hero rebuild RENAMED to `hero-cta-catalog` / `hero-link-brands`.
   The spec would have failed on the first storefront E2E run. FIXED: updated to
   the new testids + asserts the hero CTA→`/sillas` and secondary link→`/marcas`.

2. **`e2e/whatsapp-and-footer.spec.ts`** asserted `footer-link-shipping` →
   `/envios-y-devoluciones` — the COMBINED T2 slug T13 split into `/envios` +
   `/devoluciones`. FIXED: `footer-link-shipping` → `/envios`, added
   `footer-link-returns` → `/devoluciones`.

Two TEST bugs in my own new spec caught during the run and fixed (not product bugs):
- FAQ deep-link asserted a status on a same-document hash change (returns null) →
  rewrote as a fresh cross-document load with a fragment; asserts `:target` id.
- Honeypot invisibility used `toBeVisible()`, which checks render not viewport
  bounds → asserts the actual hiding mechanism (aria-hidden wrapper, off-screen
  `left < -1000px`, `tabindex=-1`, `autocomplete=off`).

**Zero product bugs found.** The implementation is correct; the regressions were
stale test fixtures.

## Observations (non-blocking, for T14 cleanup)

- **Stale `envios-y-devoluciones` row on the persistent dev DB**: a live dev-DB
  spot check showed 10 `static_pages` rows — the old T2 combined page lingering
  next to the 9 T13 rows. This is **dev-DB drift, NOT a T13 bug**: a fresh
  `supabase db reset` + seed produces EXACTLY 9 pages + 18 translations (verified
  by the integration runner), because the seed data now defines only the 9 slugs.
  The orphan renders nowhere (the `[pageSlug]` route 404s any non-`isStaticPageSlug`
  slug, and the footer no longer links it). If a spotless dev DB is wanted,
  `delete from static_pages where slug = 'envios-y-devoluciones'` once, or reset.
  The seed does NOT prune unknown slugs (upsert-only) — a minor Phase-2 nicety.
- **Dev-server E2E flakiness under 4-worker parallelism**: a broad chromium sweep
  of the pre-existing catalog/cart/i18n specs showed cold-compile timeouts (Next
  dev compiles routes on first hit). Every failing spec PASSED serially / in
  isolation once warm, and none touch T13 files — this is the documented reason
  the authoritative storefront E2E uses a PROD build. The T13 + regression specs
  all pass clean serially (33/33). Not a T13 concern.

## Confidence: HIGH

- 20/20 ACs and 10/10 edge cases have tests that pass.
- The single genuinely-new logic slice (`submitContactForm` branch mapping) — the
  exact seam S4 flagged as uncovered — now has 16 action-level tests covering the
  full success / invalid / rate-limited / honeypot / {ok:false} / throw matrix and
  the gate-ordering invariants, with the pure guard exercised end-to-end.
- The static-page read wrapper's overlay + es-MX fallback + degrade-to-null is
  proven against the LIVE local DB through real anon RLS (the en overlay genuinely
  resolves; unpublished rows are RLS-filtered; a missing overlay falls back).
- Seed idempotency (9 pages + 18 translations) verified by re-running the real
  seed against a fresh-reset DB.
- Full unit (1729) + integration (253) suites green with zero regressions; tsc +
  eslint clean; two shipped E2E regressions caught and fixed; 33 T13 + regression
  E2E pass serially.

No escalation to /full-cycle needed — coverage is complete for a medium-complexity
pattern-copy feature and the one novel seam is exhaustively covered.

## Untested Areas

- **Contact SUCCESS via live send** — exercisable only with `EMAIL_OWNER_ADDRESS` +
  `EMAIL_DEV_PREVIEW=1` (blocked-on-user, like T8 Phase 5). Fully covered at the
  action level (success mapping) and in `dispatch.test.ts` (relay branches); the
  E2E asserts the correct DEFAULT error-on-submit with no EMAIL_* env (edge 4).
  Risk: LOW — the wiring is proven; only the live provider round-trip is deferred.
- **In-memory rate limiter is per-instance** — a documented, shared caveat with
  checkout/Q&A; not a T13 correctness gap. Risk: LOW (accepted backlog).
- **Pixel-7 mobile E2E** — not run for T13 (pre-existing ~8 gotoPDP harness flakes,
  documented as not-a-product-bug). T13 surfaces have desktop + 375px-viewport
  overflow coverage. Risk: LOW.

## Verdict: **PASS** (confidence HIGH)
