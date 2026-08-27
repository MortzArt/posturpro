# QA Report: T21 — Storefront restyle Phase B (Factorial grammar across the remaining storefront)

## Verdict: **PASS** · Confidence: **HIGH**

T21 is a class-only application of the T20 Factorial grammar across the remaining
storefront (catalog/taxonomy, PDP, cart, checkout+confirmation, /empresas, static,
in-shell 404/error). Every acceptance criterion is verified by a test or an
explicit computed-style/grep verification; the mandatory C-1 regression guard is
in place at BOTH the unit (class-contract) and e2e (real-cascade ≥1px) layers; all
frozen pins hold; the admin firewall is intact. Every e2e failure observed was
proven pre-existing (stale testids/copy from T16/T20, shared-server stock-drain,
parallel flake) — none is caused by this restyle. Zero code bugs found (ReviewFix
already fixed C-1/M-1/m-1; QA independently re-verified C-1 in the real browser).

## Test Suite Summary

| Type | Written (new) | Passed | Failed | Skipped |
|------|---------------|--------|--------|---------|
| Unit | 5 | 2192 / 2192 (full suite) | 0 | 0 |
| E2E (new Phase B grammar) | 41 specs × 2 projects = 82 runs | 82 | 0 | 0 |
| E2E (regression, T21-relevant, isolated) | — | all green in isolation | 0 (real) | a few env-gated |
| **Total new tests** | **46** (5 unit + 41 e2e) | **all green** | **0** | — |

Gate outputs (final, after new tests added):

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** |
| `eslint` (new/modified test files) | **0 errors / 0 warnings** |
| `npm test` (vitest full) | **2192 passed / 2192 (134 files)** — was 2187, +5 |
| `npm run build` | **exit 0 — 133/133 pages generated** |
| `NEXT_QA_DIST_DIR=.next-e2e next build` (e2e prod server) | **exit 0** |

## Tests Written

### Unit tests (5) — `src/components/checkout/payment-panel.test.tsx`
The MANDATORY C-1 regression (ReviewFix request), guarding the `semantic` flag seam
so the payment-panel status border can never silently collapse again:
- **failed (destructive) card keeps border+tint, drops `.factorial-card`** — asserts a
  semantic card does NOT carry `.factorial-card` (whose unlayered `border:0` would
  suppress the border) and DOES carry `border` + `border-destructive/30` +
  `bg-destructive/5` + `rounded-[var(--radius)]`.
- **warning cards (unavailable / processing / stale) keep border+tint** (`it.each`, 3
  cases) — same contract for the `border-warning/30` + `bg-warning/10` variants,
  driven through both DB-derived (`processing`) and action-result (`unavailable`,
  `not-payable`→stale) code paths.
- **neutral chrome cards (unpaid, paid) DO use `.factorial-card`** and carry NO
  semantic border/tint — proves signal-vs-chrome stays distinct.

Note: the class-contract unit test locks the fix seam; the real ≥1px proof (only a
browser resolves the unlayered-vs-layered cascade) lives in the e2e spec below.

### E2E tests (41 specs) — `e2e/factorial-restyle-phaseb.spec.ts` (NEW)
Extends the T20 computed-style grammar checks to Phase B surfaces (does not
duplicate T20's homepage/shell checks):
- **DM Sans + pure-white ground** on 7 interior pages (catalog, PDP, cart, checkout,
  empresas, static `/envios`, contact) — computed `font-family` + `background-color`.
- **Sentence-case headings with Factorial tracking** — `main h1` on all 7 surfaces:
  `text-transform !== "uppercase"`, DM Sans, negative `letter-spacing`.
- **Primary CTAs are orange full-radius pills** — /empresas hero, PDP add-to-cart,
  catalog filter Apply, contact submit (radius ≥ height/2, 2px self-border); plus a
  warm-orange (`lab a>0 ∧ b>0`) fill check proving `--cta`, not brand green.
- **Neutral cards float** — PDP purchase panel + cart order-summary are
  `.factorial-card` (layered box-shadow ≥2 color stops, `border-width: 0`).
- **In-shell 404** — code tile is a flat borderless `.stat-card` (no shadow, no
  border), home CTA is an orange pill, h1 sentence-case.
- **C-1 real-cascade regression** — resolves BOTH class combos against the live
  compiled CSS in the browser: `.factorial-card border` still collapses to **0px**
  (documents the trap), the shipped fix `rounded-[var(--radius)] border` renders
  **≥1px** for destructive AND warning tints.
- **320px overflow sweep** — 6 restyled interior pages × {320, 375, 768}px, no
  h-scroll (edge 5, long es-MX strings).

## Acceptance Criteria Coverage

| # | Criterion | Test(s) / Verification | Status |
|---|-----------|------------------------|--------|
| AC-1 | Admin firewall (Inter, no theme-storefront/dmSans/cta/factorial-card) | `theme-firewall.spec` 6/6 (admin login RAN, DB up) + `factorial-restyle.spec` admin computed-font checks green; grep of `admin` for storefront classes → 0; 0 admin files in T21 diff | PASS |
| AC-2 | No hardcoded hex/oklch/rgb; palette + logo frozen | Grep of T21 diff added lines for `#hex`/`rgb(`/`oklch(` (excl `var(--`) → 0 | PASS |
| AC-3 | Uppercase removed at eyebrow/heading sites; discount input KEPT | Storefront grep for `uppercase` → only `discount-code-field.tsx:101` (input value) + a brand-logo code comment; new e2e h1 `text-transform !== uppercase` on 7 surfaces + 404 | PASS |
| AC-4 | Heading tightness -0.04/-0.02em; zero `tracking-wide` | Storefront grep for `tracking-wide` → 0; new e2e negative-`letter-spacing` on 7 h1s | PASS |
| AC-5 | Card grammar `.factorial-card`/`.stat-card`; semantic tint+border kept | new e2e: PDP/cart cards `.factorial-card` (shadow, 0 border), 404 tile `.stat-card` (flat); **C-1 e2e ≥1px** + 5 unit semantic-card tests | PASS |
| AC-6 | Primary CTAs orange `cta`(+`xl`) pills; secondaries `.pill-outline` | new e2e pill geometry on hero/add-to-cart/filter-apply/contact/404-home + warm-orange fill; source grep confirms `variant="cta" size="xl"` at all enumerated sites | PASS |
| AC-7 | Pure-white ground; no gradient moments on interior | new e2e body background white on 7 pages; grep: no `.gradient-band`/`.gradient-banner` off homepage | PASS |
| AC-8 | Content/behavior frozen (testids, honeypot, columns, validation) | `catalog.spec:311` 2-col@375 PASS; `product-detail.spec:56` strikethrough PASS; `static-pages-contact` + `empresas-quote` honeypot pins PASS; no testid in T21 diff | PASS |
| AC-9 | css-line-count guard | `css-line-count.test.ts` green (unit suite); globals 322 (<600), theme-storefront 75 (≤180); 0 CSS added by ReviewFix | PASS |
| AC-10 | Inheritance smoke green + per-surface asserts added | `factorial-restyle.spec` 46/46 (6-page smoke + 404) unchanged; new `factorial-restyle-phaseb.spec` adds the per-surface grammar asserts | PASS |
| AC-CAT-1 | Taxonomy/`sillas` h1 heading recipe, drop uppercase/tracking-wide | new e2e catalog h1 sentence-case + DM Sans + negative tracking; source `sillas/page.tsx:147` uses recipe | PASS |
| AC-CAT-2 | product-card `.factorial-card`, name -0.02em, testids frozen | Source verified: `card-lift factorial-card`, `tracking-[-0.02em]`, `product-card`/`-link` testids intact; `catalog.spec` 40/40 | PASS |
| AC-CAT-3 | product-grid column counts frozen (2-up @375) | `catalog.spec:311` (mobile) PASS in isolation | PASS |
| AC-CAT-4 | index-tile/category-tree `.factorial-card`, names -0.02em | Source verified; `catalog.spec` taxonomy tiles render | PASS |
| AC-CAT-5 | Filter chrome drops uppercase; Apply → `cta`; sheet Radix frozen | `search-filter-sort.spec` 40/40 + `search-filter-sort-nojs` green; new e2e filter-apply pill; `filter-panel.tsx:202` `variant="cta"` | PASS |
| AC-CAT-6 | no-results/empty-state `.stat-card` + `cta xl`; banner borderless | Source verified (`no-results.tsx:45/62`, `empty-state.tsx:30/35`); `catalog.spec:294` empty-taxonomy PASS in isolation | PASS |
| AC-CAT-7 | stock/grade badge `rounded-full` + semantic; grade drops border chrome | `grade-badge.test.tsx` 6/6 green; source: `rounded-full bg-secondary`, no `border-primary/20` | PASS |
| AC-PDP-1 | purchase panel `.factorial-card`; h1 -0.04em; price testids frozen | new e2e PDP `.factorial-card` (shadow, 0 border); `product-detail.spec` price/testids | PASS |
| AC-PDP-2 | gallery hairline border + radius; zoom/lightbox testids frozen | `product-detail.spec` gallery+lightbox pass in isolation | PASS |
| AC-PDP-3 | specs/qa/recently-viewed drop uppercase → -0.02em; qa answer stat-card; qa submit cta xl | Source verified; grep: 0 uppercase in these files | PASS |
| AC-PDP-4 | add-to-cart `cta xl`, `.cart-press`/crossfade/disabled frozen | T21 diff of add-to-cart-button = ONLY `variant`/`size` (no logic touch); new e2e pill geometry | PASS |
| AC-CART-1..3 | cart h1 -0.04em; order-summary `.factorial-card` + `cta xl`; line-row -0.02em; remove stays ghost | new e2e order-summary `.factorial-card`; `cart.spec` 46/46; `order-summary.test.tsx` green | PASS |
| AC-CHK-1..3 | checkout/confirmation h1 -0.04em; cards `.factorial-card`; submits `cta xl` | `checkout.spec` 24/24 (orders placed both locales); `checkout-summary.test`/`checkout-states.test` green; source `checkout-summary.tsx:92/164` | PASS |
| AC-CHK-4 | discount input `uppercase` KEPT; applied-code semantic colors | `discount-code-field.test.tsx` green; grep confirms `:101` uppercase intact | PASS |
| AC-EMP-1 | b2b tiles `.factorial-card`, tint icon, headings recipe | Source verified; `empresas-quote.spec` b2b sections render | PASS |
| AC-EMP-2 | shared Hero Factorial grammar; aspect-[4/3]+fallback+enter-fade pinned | `hero.test.tsx` 9/9 green (all pins); new e2e hero CTA orange pill | PASS |
| AC-EMP-3 | empresas quote-section h2 recipe; QuoteForm central pill CTA | Source `empresas/page.tsx` h2 recipe; `quote-form.tsx` `variant="cta" size="xl"` | PASS |
| AC-EMP-4 | headingSerif retired (D-1) | Grep `headingSerif`/`Libre_Caslon`/`font-heading-serif` across `src/` → **0** | PASS |
| AC-STATIC-1 | static-heading -0.02em (target/scroll-mt kept); page h1s recipe | new e2e `/envios` h1 + DM Sans; source `static-page-body.tsx:48` | PASS |
| AC-STATIC-2 | contact submit `cta xl`; showroom tokens; banners semantic | new e2e contact-submit pill; `static-pages-contact.spec` 40/40 | PASS |
| AC-ERR-1 | in-shell 404/error Factorial (stat-card tile, cta xl) | new e2e 404 stat-card + home pill + sentence-case; `not-found.spec` 404 status/lang/overflow pass | PASS |
| AC-ERR-2 | root not-found.tsx + global-error.tsx untouched | Both absent from T21 diff (`git diff` name-only) | PASS |

## Edge Case Coverage

| # | Edge Case | Test | Status |
|---|-----------|------|--------|
| 1 | Discount input uppercase kept (AC-3 landmine) | `discount-code-field.test.tsx` + grep `:101` intact | PASS |
| 2 | Empty catalog / zero results (SSR-first) | `catalog.spec:294` empty-taxonomy (isolated) + source `.stat-card`+`cta xl`; served HTML shows `empty-state`+`empty-state-cta` | PASS |
| 3 | Product no cover / no grade / single variant | `grade-badge.test.tsx` null-omit; product-card placeholder path renders `.factorial-card` (new e2e PDP/catalog load) | PASS |
| 4 | /empresas hero null image → fallback | `hero.test.tsx` (aspect-[4/3] + fallback + aria-hidden pins) 9/9 | PASS |
| 5 | es-MX long strings @320px | new e2e overflow sweep 6 pages × {320,375,768} → ≤1px | PASS |
| 6 | OXXO/SPEI pending — signal vs chrome (C-1) | 5 unit semantic-card tests + e2e real-cascade ≥1px regression | PASS |
| 7 | Reduced motion | No new keyframes (grep); pill/card classes reuse RM-gated globals | PASS |
| 8 | Admin ↔ storefront crossing | `theme-firewall.spec` 6/6 (scoped `.theme-storefront`); 0 admin files touched | PASS |

## Bugs Found & Fixed
- **None found by QA.** The one real bug (C-1: `.factorial-card{border:0}` unlayered
  suppressing the payment semantic border) was already caught and fixed in the
  ReviewFix stage (the `Card` `semantic` flag). QA independently RE-VERIFIED the fix
  against the live compiled CSS in headless Chromium (`.factorial-card border` = 0px;
  `rounded-[var(--radius)] border` = ≥1px) and added the missing regression guard the
  ReviewFix stage requested — at both the unit (class-contract) and e2e (computed
  ≥1px) layers, so C-1 can never silently return.

## Pre-existing-failure proofs (every e2e failure investigated; NONE is T21)

1. **`empresas-quote.spec.ts:276` (footer-link-offices)** — fails 3/3 even isolated.
   Proof: `footer-link-offices` is **absent from all current source** (`git log -S`
   shows it was never in `site-footer.tsx`); the spec was last touched at **T16**
   (commit f359770); T21's diff touches **no** footer / footer-links / nav file. The
   footer's internal empresas link is now `footer-link-quote` — the testid diverged
   during the T19/T20 shell rebuild. **Stale test, pre-existing, not T21.**
2. **`not-found.spec.ts:39` (back-home CTA)** — the `not-found-home` CTA correctly
   navigates to `/` (URL assertion passes); it then asserts the homepage h1 says
   `sillas ergonómicas`, but the homepage headline is now `"Eleva tu mobiliario."`
   (message `home.hero.headlineL1`, introduced by **T20** — `git log -S` → commit
   248a45d). T21 touched neither this spec nor the homepage copy. **Stale copy
   assertion broken by T20's homepage, not T21.**
3. **`payment.spec.ts` (4–8 failures)** — all fail at **setup line 31**
   (`add-to-cart-button` `toBeEnabled` → "Agotado"/disabled) before ever reaching the
   payment panel. Proof: T21's diff of `add-to-cart-button.tsx` is **exactly two
   lines** (`variant="default"` → `variant="cta" size="xl"`) with **zero** stock/
   disabled logic change; the DB shows MILANO in stock (8+11 units) yet the prod
   e2e server's ISR-cached PDP renders "Agotado" (real orders placed by
   `checkout.spec`/prior `payment` runs drained the *server cache's* availability).
   This is the documented **shared-webServer stock-drain** debt (T19/T20 QA:
   "shared-webServer stock drain ~43; cart.spec isolated 23/23"). **Environmental
   harness limitation, not a restyle regression.**
4. **Intermittent parallel flake** (`product-detail:56`, `catalog:294`, various) —
   each **PASSES in isolation** (e.g. strikethrough pin 184–317ms; empty-taxonomy
   1.0s) but fails non-deterministically under the fully-parallel shared server. This
   is the documented **i18n/parallel flake ×N — green in isolation** debt from T20 QA.
   A different failing set each run confirms flake, not regression.

## Isolated regression suites confirmed green (T21-relevant)

| Suite | Result |
| --- | --- |
| `factorial-restyle.spec.ts` (T20, must stay green) | **46/46** (incl admin firewall computed-font + 6-page inheritance smoke + 404) |
| `theme-firewall.spec.ts` (AC-1) | **6/6** (admin login RAN — DB up — not skipped) |
| `factorial-restyle-phaseb.spec.ts` (NEW) | **82/82** (41 × 2 projects) |
| `cart.spec.ts` | **46/46** |
| `checkout.spec.ts` | **24/24** (orders placed both locales; confirmation restyle intact) |
| `static-pages-contact.spec.ts` | **40/40** (honeypot + footer route/anchor pins) |
| `search-filter-sort.spec.ts` + `-nojs` | **40/40** (chromium; filter chrome restyle) |
| `catalog.spec.ts` pins (2-col@375 mobile; empty-taxonomy) | PASS in isolation |
| `product-detail.spec.ts` strikethrough pin (`:56`) | PASS in isolation |

## Untested Areas (residual risk)

- **Payment panel semantic states rendered on a LIVE confirmation page** — the ≥1px
  border is proven via the e2e real-cascade probe (production class strings resolved
  against the live compiled CSS) and 5 unit class-contract tests, but not via an
  actually-rendered pending-payment order (that needs a seeded pending order + a live
  MP round-trip, which is blocked-on-user and stock-drain-limited in the shared
  harness). Risk: **LOW** — the probe resolves the exact same cascade the real card
  would, and the visual states are additionally unit-covered.
- **1024px header overflow** — at the `lg` breakpoint boundary the SHARED shell
  `<header>` CTA cluster overflows ~11px; this reproduces identically on the
  untouched homepage and vanishes when the header is removed (every Phase B page
  *body* overflows 0px at 1024px). Pre-existing T19/T20 shell fit debt, **out of T21
  scope**; flagged for a future shell/tablet-layout ticket. Risk: **LOW** (cosmetic,
  shell-only, not a Phase B surface).

## Recommendation
**PASS — HIGH confidence.** Ship. 100% of acceptance criteria are covered and
passing; all 8 edges covered; the mandatory C-1 regression guard is in place at two
layers; the admin firewall and every frozen pin hold; and every e2e failure was
proven to be pre-existing stale-test / stock-drain / parallel-flake debt unrelated to
this class-only restyle. No `/full-cycle` re-run needed.
