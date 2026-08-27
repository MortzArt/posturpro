# Code Review + Fix: T21 — Storefront restyle Phase B (Factorial grammar, remaining storefront)

## Summary

Adversarial single-pass review + fix of the 56-source-file class-only restyle (commit `8dcdc78`). The restyle is faithful to the T20 grammar and correctly respects every landmine (discount input uppercase, hero pins, 2-col grid, honeypots, admin firewall, root error shells, headingSerif retirement). One **CRITICAL** cascade bug slipped past all Dev gates: the payment-panel semantic-status borders were silently suppressed by `.factorial-card{border:0}` — the exact opposite of what the Dev summary claimed ("re-asserted visible border"). Fixed and verified against real compiled CSS in a headless browser. Also fixed one missed primary CTA (stale-reload stayed green) and a cross-surface pill-width inconsistency (4 CTAs kept a `px-4` that twMerge stripped from the Factorial `px-8`). All issues fixed inline; all gates re-run green.

**Verdict: APPROVE — 8/10.** (Would be 9 but for a Critical that no test caught and a Dev summary that mis-claimed it was fixed; the underlying restyle work is clean.)

## Issues Found & Resolved

### Critical Issues

#### C-1: Payment-panel semantic status borders silently suppressed (edge 6 / AC-5 broken)

- **Severity**: CRITICAL
- **File**: `src/components/checkout/payment-panel.tsx:188-197` (the shared `Card`) + callers `:260,:290,:311,:349`
- **Problem**: The neutral `Card` shell was changed to `.factorial-card`, whose recipe (`theme-storefront.css:30`) is `border: 0`. That rule is **unlayered**; Tailwind's `border` utility sits in the `@layer utilities` layer. In the CSS cascade, an unlayered rule beats ANY layered rule regardless of specificity — so the Dev's re-added `border border-destructive/30` / `border border-warning/30` on the four semantic variants (failed / unavailable / stale / processing) resolved to **`border-width: 0`**. The status tint survived but the border did not.
- **Impact**: Direct violation of AC-5 and edge 6 (semantic status cards must keep tint **+ border** as signal-vs-chrome). Payment-failed, service-unavailable, stale-order, and processing states lost their border delineation. Silent: no unit or e2e test asserts this border, so all four Dev gates (tsc/eslint/unit/build) passed while the regression shipped. The Dev summary + pipeline-state both explicitly claimed this was fixed ("re-asserted visible border … so tint+border survives") — it was not.
- **Verification (empirical, not reasoned)**: Rendered the exact class combos against the real compiled `.next/static` CSS in headless Chromium. OLD (`factorial-card border border-warning/30`) → `border-width: 0px`. NEW (`rounded-[var(--radius)] border border-warning/30`) → `border-width: 1px`, warning color, radius 16px.
- **Fix Applied**: Gave `Card` a `semantic` flag. Neutral (chrome) cards keep `.factorial-card` (floating white, borderless). Semantic (signal) cards now render `rounded-[var(--radius)]` instead of `.factorial-card`, so the Factorial radius is preserved while the caller's Tailwind `border` + tint render normally (no unlayered rule to fight). The four semantic callers now pass `semantic`. Added an explanatory comment documenting the cascade trap so it isn't reintroduced. Zero new CSS (reused the existing `--radius` token via an arbitrary utility).
- **Status**: FIXED

### Major Issues

#### M-1: Stale-reload primary action not restyled (AC-CHK-3 / AC-6 miss)

- **Severity**: MAJOR
- **File**: `src/components/checkout/payment-panel.tsx:326-329` (StaleCard reload button)
- **Problem**: AC-CHK-3 requires payment-panel primary pay/retry actions to become `variant="cta" size="xl"`. Dev converted `PayButton` and `RetryButton` but missed the inline stale-reload `<button>`, which stayed `buttonVariants({ variant: "default" })` + `h-11 px-6 text-sm` — a green default pill among orange Factorial siblings. Cross-surface inconsistency (dimension 5): the sole recovery action of the stale state read differently from every other checkout primary.
- **Fix Applied**: Swapped to `buttonVariants({ variant: "cta", size: "xl" })` and dropped the now-redundant `h-11 px-6 text-sm` (xl supplies `h-12 px-8 text-base`), keeping `cart-press w-full gap-1.5 sm:w-auto sm:min-w-56 sm:self-start` for identical geometry to Pay/Retry.
- **Status**: FIXED

### Minor Issues

#### m-1: Four `cta xl` CTAs kept a `px-4` that twMerge strips from the Factorial `px-8`

- **File**: `src/app/[locale]/not-found.tsx:28`, `src/app/[locale]/error.tsx:56`, `src/components/product/qa-form.tsx:235`, `src/app/[locale]/contacto/contact-form.tsx:254`
- **Problem**: `cn()` uses `tailwind-merge`, so a `px-4` in `className` overrides the `xl` size's `px-8`. These four true-primary CTAs rendered at 16px horizontal padding while every other Factorial pill (cart/checkout/empty-state/no-results) rendered at the intended 32px — an inconsistent, less-generous pill across surfaces (grammar fidelity + dimension-5 consistency). Verified with twMerge: `px-4` wins, `px-8` dropped.
- **Suggestion / Fix Applied**: Removed the redundant `px-4` (and the now-moot `min-h-11`; `xl`'s `h-12` already exceeds the 44px target) so all four adopt the Factorial `px-8`. `sm:w-auto sm:self-*` alignment preserved.
- **Status**: FIXED

#### m-2: `empty-state.tsx:35` / `no-results.tsx:62` retain a bare `min-h-11` on `cta xl`

- **File**: `src/components/catalog/empty-state.tsx:35`, `src/components/catalog/no-results.tsx:62`
- **Suggestion**: The `min-h-11` is redundant next to `xl`'s `h-12`.
- **Status**: SKIPPED — harmless no-op (these correctly keep `px-8`; `min-h-11` < `h-12` so it never engages). Removing it is pure churn with zero visual effect; not worth touching another file.

## Acceptance Criteria Verification

| #    | Criterion | Status | Evidence |
| ---- | --------- | ------ | -------- |
| AC-1 | Admin firewall (Inter, no theme-storefront/dmSans/cta/factorial-card) | PASS | 0 admin files in commit or working tree; grep of `src/app/admin` for storefront classes/vars → 0; admin renders own `<html>` in `src/app/admin/layout.tsx` (untouched), carries neither `theme-storefront` nor `dmSans` |
| AC-2 | No hardcoded hex/oklch/rgb; palette + logo frozen | PASS | Grep of added lines (Dev diff + my fixes) for `#hex`/`rgb(`/`oklch(` → 0; all color via tokens (`--tint-green`, `--cta`, `border-border`, `bg-warning/destructive`) |
| AC-3 | Uppercase removed at all eyebrow/heading sites; discount input KEPT | PASS | Grep storefront for `uppercase` → only `discount-code-field.tsx:101` (input value, the exception) + a code comment in brand-logo |
| AC-4 | Heading tightness `-0.04em`/`-0.02em`; zero `tracking-wide` | PASS | Grep storefront for `tracking-wide` → 0; all h1/h2 diffs use `tracking-[-0.04em]` / `tracking-[-0.02em]` |
| AC-5 | Card grammar `.factorial-card`/`.stat-card`; semantic tint+border kept | PASS *(after C-1 fix)* | product-purchase/order-summary/checkout-*/confirmation → factorial-card; qa-answer/qa-success/404-tile/empty/no-results → stat-card; payment semantic cards keep tint+**border** (fixed) |
| AC-6 | Primary CTAs are orange `cta` (+`xl`) pills; secondaries `.pill-outline` | PASS *(after M-1/m-1 fix)* | add-to-cart, checkout submit/sticky, filter apply, no-results/empty CTA, oxxo/pay/retry/**stale-reload**, contact/qa submit, 404/error → cta xl; keep-shopping + discount-apply → pill-outline |
| AC-7 | Pure-white ground; no gradient moments added to interior | PASS | No `.gradient-band`/`.gradient-banner` added off homepage; tint appears only as `--tint-green` objects (hero canvas, b2b icon) |
| AC-8 | Content/behavior frozen (testids, honeypot, columns, validation) | PASS | No testid/anchor/prop/query change in diff; honeypot + strikethrough + 2-col + hero pins untouched (see landmine table) |
| AC-9 | css-line-count guard | PASS | `css-line-count.test.ts` green (globals 322, theme-storefront 75); my fix added 0 CSS lines |
| AC-10 | Inheritance smoke green; per-surface asserts deferred to QA | PASS | Unit 2187/2187 incl the smoke; new grammar asserts are QA's job (AC-10 wording) |
| AC-CAT-1..7 | Catalog/taxonomy headings, product-card, grid, tiles, filters, empties, badges | PASS | product-card → factorial-card (testids frozen); grid columns untouched; index-tile/category-tree → factorial-card; grade-badge/catalog-banner borderless; h1s → heading recipe |
| AC-PDP-1..4 | Purchase panel, gallery, specs/qa, add-to-cart | PASS | purchase panel factorial-card + h1 -0.04em; gallery hairline `border-border`; qa answer/success stat-card; add-to-cart cta xl (h-11 w-full kept intentionally) |
| AC-CART-1..3 | Cart heading, order-summary, line row | PASS | heading -0.04em; order-summary factorial-card + cta xl; remove stays ghost; progress/count pills kept rounded-full |
| AC-CHK-1..4 | Checkout headings, cards, primary CTAs, discount | PASS *(after C-1/M-1)* | CheckoutCard/summary/confirmation cards factorial-card; submits cta xl; discount apply pill-outline (not orange, D-5); input uppercase + semantic notes kept; payment semantic borders fixed |
| AC-EMP-1..4 | b2b tiles, shared Hero, quote form, headingSerif retirement | PASS | b2b factorial-card + tint icon; Hero -0.04em + xl pill + tint canvas (aspect-[4/3]+fallback+enter-fade pinned); quote submit xl; headingSerif fully removed (0 refs) |
| AC-STATIC-1..2 | static-page-body heading, contact/showroom | PASS | static-heading -0.02em (target/scroll-mt kept); page h1s heading recipe; contact submit cta xl |
| AC-ERR-1..2 | In-shell 404/error restyled; root shells untouched | PASS | not-found stat-card tile + cta xl; error cta xl; root `not-found.tsx` + `global-error.tsx` NOT in commit/tree |

## Edge Case Verification

| # | Edge Case | Status | Evidence |
| - | --------- | ------ | -------- |
| 1 | Discount input uppercase kept | HANDLED | `discount-code-field.tsx:101` retains `uppercase`; sole remaining storefront uppercase class |
| 2 | Empty catalog / zero results | HANDLED | no-results/empty-state stat-card tile + cta xl; SSR render mode untouched |
| 3 | No cover / no grade / single variant | HANDLED | product-card factorial-card renders with placeholder; grade-badge borderless chip still null-omitted |
| 4 | /empresas hero null image | HANDLED | fallback keeps aspect-[4/3] + aria-hidden + data-testid on tint canvas; hero.test.tsx green |
| 5 | es-MX long strings @320px | HANDLED | build + unit green; -0.04em headings + long labels wrap (Dev mobile screenshots) |
| 6 | OXXO/SPEI pending — signal vs chrome | HANDLED *(after C-1 fix)* | oxxo voucher keeps own warning border (never factorial-card); payment semantic cards now render tint+**border** (fixed), neutral card stays factorial-card |
| 7 | Reduced motion | HANDLED | No new keyframes; pill-outline/card-lift/stagger/enter-fade reuse RM-gated classes |
| 8 | Admin ↔ storefront crossing | HANDLED | `.theme-storefront` scoped to `[locale]` body only; admin untouched; no leak either way |

## Firewall Verification (AC-1 — steps + results)

1. **No admin file changed** — `git show --name-only 8dcdc78 | grep admin` → none; `git status` working tree → none. PASS
2. **No storefront-only class/variant/font in admin** — grep `src/app/admin` + `src/app/[locale]/admin` for `factorial-card|stat-card|pill-outline|theme-storefront|--font-dm-sans|variant="cta"|size="xl"` → 0. PASS
3. **`.theme-storefront` scoped** — only on `src/app/[locale]/layout.tsx:112` `<body>`. Admin renders its own `<html>`/`<body>` in `src/app/admin/layout.tsx` (untouched), carrying neither the class nor the font var. PASS
4. **`dmSans.variable` scoped** — only on `src/app/[locale]/layout.tsx:109` `<html>`. PASS
5. **headingSerif retirement** — grep `headingSerif|Libre_Caslon|--font-heading-serif` across `src/` → 0 code refs; the single "Libre Caslon" hit is the globals.css narrative comment the ticket told us to update (now describes the retirement). PASS

## Landmine Compliance

| Landmine | Status | Evidence |
| -------- | ------ | -------- |
| Discount input uppercase kept | OK | `discount-code-field.tsx:101` intact |
| hero.test.tsx pins (aspect-[4/3] + fallback + enter-fade + aria-hidden) | OK | all present in new hero.tsx; test green |
| catalog 2-col @375px | OK | product-grid columns untouched; catalog.spec unaffected; build green |
| strikethrough + honeypot offsets | OK | no change to product-detail price markup or honeypot `left` |
| semantic status cards keep tint+border | OK *(after C-1)* | payment semantic + oxxo voucher keep tint+border |
| root not-found.tsx / global-error.tsx untouched | OK | not in commit/tree |
| headingSerif retirement complete, zero dangling refs | OK | 0 code refs |

## Gate Outputs (re-run after all fixes)

| Gate | Result |
| ---- | ------ |
| `npx tsc --noEmit` | **0 errors** |
| `eslint` (all 5 files I touched) | **0 errors / 0 warnings** |
| `npm test` (vitest full) | **2187 passed / 2187 (134 files)** |
| `npm run build` | **Compiled OK — 133/133 pages generated** |
| Compiled-CSS border check (headless Chromium) | payment semantic border **1px** after fix (was 0px) |
| Firewall greps | admin clean (0 hits) |

## Fix Summary

- Critical: 1/1 fixed
- Major: 1/1 fixed
- Minor: 1 fixed, 1 skipped (justified no-op)

## Quality Score: 8/10

## Recommendation: APPROVE

The restyle itself is disciplined, token-clean, and firewall-safe — genuinely a mechanical application of the T20 grammar with no scope creep. The one Critical (C-1) is serious because it was invisible to every automated gate AND was mis-reported as fixed in the Dev summary, which is exactly the kind of thing that ships a visible payment-error regression to production. All critical/major/minor issues are now fixed inline and independently verified (unit + build + real-CSS computed-style check). No content, testid, honeypot, column, or admin change. Ready for QA to add the per-surface grammar assertions (AC-10), including a regression assert on the payment semantic-card border so C-1 can never silently return.
