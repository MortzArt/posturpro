# Task: T21 — Storefront restyle Phase B: Factorial grammar across the remaining storefront

## Priority

**High** — T20 (Phase A) shipped and the owner explicitly approved the homepage + shell on 2026-08-27, unlocking Phase B. The rest of the storefront (catalog, PDP, cart, checkout, /empresas, static pages, error pages) still renders the old "Casa de Azulejo" page-level grammar (serif-era `uppercase tracking-wide` headings, `rounded-md border` info cards, green default buttons) inside the new Factorial shell — a visible inconsistency between the homepage and every deeper page. This is the last task before the storefront reads as one coherent design language. Not launch-blocking (the site works), but it is the highest-value open item and directly owner-requested.

## Complexity

**medium** — justified against the criteria:

- **Breadth is high (many pages)** but every page follows the SAME small set of transforms, and the *grammar already exists*: T20 created `.factorial-card`, `.stat-card`, `.pill-outline`, the `--gradient-*`/`--shadow-factorial` tokens, the `--radius: 1rem` bump, the DM Sans wiring, and the pill `Button` variants. Phase B is applying that vocabulary — not inventing it.
- **No new data models, no new dependencies, no architectural change.** It is class edits + a few `Button variant`/`className` swaps + uppercase removals + heading-tracking updates. `ui-only`.
- **Estimated ~35–45 files touched** — above the medium ceiling of 15 in raw count, but each edit is a mechanical pattern application, not new logic. The one genuinely non-trivial decision (the shared `Hero` on `/empresas` + retiring `headingSerif`) is resolved in this ticket (see AC-EMP block + Decision D-1). No file gains meaningful line count (class-only edits), so no `max-lines` risk.
- Not **high**: there is no new system, no integration, no schema. The risk surface is regression (firewall, style-pinned tests, css-line-count guard), not novel construction.

Feature Type + this classification route the standard pipeline: PlanResearch → **skip UI Design at full depth** (the T20 `tasks/ui-design.md` spec IS the design authority; the design stage, if run, only extends it with the interior-page decisions in this ticket) → Dev → ReviewFix → QA.

## Feature Type

**ui-only** (maps to `full-cycle`'s `ui-only` class: Security & Arch run lightweight; the whole task is presentation).

Determines pipeline depth: this is a pure restyle — no server actions, RPCs, queries, i18n messages, testids, anchors, or props change except where a **test must be updated for a deliberate visual change** (AC-3 uppercase removals; see Test-Impact table). No backend stage runs at depth.

## User Story

As a **shopper (or B2B buyer) moving from the homepage into the catalog, a product page, the cart, checkout, /empresas, or a policy page**, I want **every storefront page to look like the same brand — the pure-white, DM Sans, orange-pill Factorial language the homepage now uses** — so that **the store feels like one polished, trustworthy product instead of a redesigned front door bolted onto older interior pages.**

## Background

**What exists today:** T20 restyled the homepage (`/[locale]`, 13 sections) and the shared shell (topbar, header, footer, mobile-nav, WhatsApp FAB) to the Factorial grammar, scoped under `.theme-storefront` with a new `--font-dm-sans` and a `--radius: 1rem` bump. The shell change means every storefront page ALREADY inherits: DM Sans body/heading font, pure-white background, white hairline footer, and pill nav/header CTA. The `factorial-restyle.spec.ts` "inheritance smoke" test already proves 6 interior pages render the white footer + DM Sans + no overflow.

**What's still old:** the *page bodies* of every non-home surface still carry the pre-Factorial grammar:
- `uppercase tracking-wide` section/eyebrow headings (13 component sites + 4 page/heading sites — full list in AC-3).
- `rounded-md border border-border bg-card` info/panel cards instead of `.factorial-card` (floating white, layered soft shadow) or `.stat-card` (flat gray).
- `variant="default"` / `variant="secondary"` / `size="lg"` primary buttons instead of the orange `variant="cta"` pill grammar.
- `tracking-tight` / `tracking-wide` page `<h1>`s instead of the Factorial `-0.04em` heading tightness.
- The shared `Hero` (used ONLY by `/empresas`, since the homepage uses `home-hero`) still uses `text-primary`, `tracking-tight`, `size="lg"` green CTA, and a bordered media box — pre-Factorial. `headingSerif` (Libre Caslon) is still exported in `fonts.ts` and wired on `<html>`, kept alive in T20 *specifically for a Phase B decision on `/empresas`* (see Decision D-1).

**Why it matters:** the homepage sets the expectation; the interior pages break it. This closes the gap with zero content/behavior change.

**Authority stack (in order):**
1. `tasks/ui-design.md` (the 753-line T20 spec) — owns the *look*: exact token values, the `.factorial-card`/`.stat-card`/`.pill-outline` recipes, the pill `Button` contract, the `-0.04em` heading rule, the "no uppercase / sentence case" rule, motion restraint. **This ticket does NOT redefine any of that** — it maps it onto the remaining pages.
2. `tasks/reference/factorial-style-analysis.md` — the measured source grammar.
3. `DESIGN.md` T20 amendment — the canonical narrative.
4. This ticket — resolves the interior-page-specific decisions the T20 spec deferred (Hero/`headingSerif`, interior page rhythm, badge/pill treatment, error-page grammar) and enumerates per-surface acceptance criteria + test impact.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

### Global / cross-cutting

- [ ] **AC-1 (Firewall — hard constraint):** `/admin` and `/admin/login` compute **Inter**, carry **no** `.theme-storefront` class and **no** `--font-dm-sans` custom property on `<body>`, keep `rounded-md` (admin `--radius: 0.625rem`), and show no orange `cta` pill / no `.factorial-card`. Verified by the existing `theme-firewall.spec.ts` + `factorial-restyle.spec.ts` admin checks passing unchanged. No admin file is touched by this task.
- [ ] **AC-2 (Palette + logo frozen):** No hardcoded hex/oklch/rgb is introduced in any touched file. Brand greens (`--primary` `#094220`, `--ring`/brand green `#0f7f3c`), orange CTA (`--cta` `#f95326` with its dark AA foreground), and the logo SVGs are unchanged. Every color flows through an existing token.
- [ ] **AC-3 (No uppercase — sentence case everywhere):** The `uppercase` utility is removed from every storefront **eyebrow/heading** site (sentence-case copy already lives in i18n). The complete removal set: `catalog/category-tree.tsx`, `catalog/filter-panel.tsx`, `catalog/filter-sheet.tsx` (Dialog.Title), `catalog/filter-controls.tsx` (FacetGroup legend), `catalog/no-results.tsx`, `catalog/index-tile.tsx`, `content/static-page-body.tsx` (`.static-heading`), `product/product-qa.tsx`, `product/product-specs.tsx`, `product/recently-viewed.tsx`, `checkout/checkout-field.tsx`, `checkout/checkout-summary.tsx`, `cart/order-summary.tsx`, plus page `<h1>`s in `sillas/page.tsx`, `showroom/page.tsx`, and the two `checkout/confirmacion/[token]/page.tsx` section headings. **EXCEPTION (must be KEPT):** `checkout/discount-code-field.tsx:101` uses `uppercase` on the discount-code **input value** — this is functional (codes are entered uppercase), NOT an eyebrow. Do NOT remove it.
- [ ] **AC-4 (Heading tightness):** Every restyled page `<h1>`/section `<h2>` uses the Factorial tracking (`tracking-[-0.04em]` for large headings ≥24px, `tracking-[-0.02em]` for small labels) and DM Sans weight 600/700 per the T20 section-h2 recipe. No storefront heading uses `tracking-wide` after this task (grep returns zero in touched files).
- [ ] **AC-5 (Card grammar):** Every page-body info/panel/summary card that was `rounded-md/lg border border-border bg-card` becomes either `.factorial-card` (floating white, layered `--shadow-factorial`, borderless — for content/summary/product panels) or `.stat-card` (flat gray, borderless — for quiet canvases/answer blocks), per the per-surface mapping below. Semantic status cards that intentionally carry a tint+border (error `destructive/*`, warning `warning/*`, success `success/*`) KEEP their tinted border — they are signal, not chrome (see AC-14 / edge 6).
- [ ] **AC-6 (Primary CTA pills):** Every **primary** call-to-action on a restyled page is an orange pill via `variant="cta"` (+ `size="xl"` where it was `size="lg"` / a large button), rendering `rounded-full`, solid `--cta` fill, 2px self-colored border, dark AA foreground, 100ms hover color-swap, no lift. Secondary/tertiary actions use `.pill-outline` (2px ink-outline pill) or stay quiet text links. The specific CTA set is enumerated per surface below.
- [ ] **AC-7 (Pure white ground):** No restyled page introduces or retains an alternating full-bleed tinted section background. Page ground stays `--background` (pure white); separation comes from rhythm + tinted *objects* (`.stat-card`, `--tint-green` canvases). The two homepage gradient moments (`.gradient-band`/`.gradient-banner`) are NOT added to interior pages.
- [ ] **AC-8 (Content/behavior frozen):** No copy, i18n key, server action, RPC, query, prop, `data-testid`, anchor id, `scroll-mt`, aria attribute, honeypot offset, form validation, or column-count changes — except the test updates required by AC-3. The `catalog.spec.ts` 2-column-at-375px grid assertion still passes; `product-detail.spec.ts` strikethrough assertion still passes; `empresas-quote.spec.ts` + `static-pages-contact.spec.ts` honeypot `left` offset assertions still pass.
- [ ] **AC-9 (css-line-count guard):** `globals.css` stays < 600 (currently 320) and < 1000 hard cap; `theme-storefront.css` stays ≤ ~180 lines (currently 75) even after any shared recipe additions. If a new shared recipe is needed (e.g. a reused field-input recipe), it goes in `theme-storefront.css`, not inline-repeated. `css-line-count.test.ts` passes.
- [ ] **AC-10 (Inheritance smoke stays green + extends):** `factorial-restyle.spec.ts`'s existing 6-page inheritance smoke (white footer + DM Sans + no h-overflow + no console errors, incl. 404) passes unchanged. New per-surface grammar assertions (a catalog page `<h1>` is not `uppercase`; a PDP `.factorial-card` exists with shadow + no border; the /empresas hero CTA is an orange pill) are added at QA.

### Catalog & taxonomy (`/sillas`, `/categorias`(+slug), `/marcas`(+slug), `/estilos`(+slug))

- [ ] **AC-CAT-1:** Page `<h1>`s (`sillas`, category/brand/style index + detail) drop `uppercase`/`tracking-wide`/`tracking-tight` and adopt the Factorial heading recipe (`font-heading font-semibold sm:font-bold tracking-[-0.04em]`). Detail-page `<h1>`s that show a brand logo + name keep their structure; only type classes change.
- [ ] **AC-CAT-2:** `product-card.tsx` (the single most-reused component; shared by catalog, taxonomy, search, homepage featured, and recently-viewed) is restyled **once, centrally**: outer `Link` becomes a `.factorial-card` (floating white, layered shadow, borderless) keeping `.card-lift` hover + `overflow-hidden` + focus ring; the inner image tile keeps `aspect-[4/5]` (layout-critical) and its rounded clip resolves via `--radius`; the product-name `<h2>` uses `tracking-[-0.02em]` (drop `tracking-tight`). `data-testid="product-card"`/`"product-card-link"` frozen. No per-page fork.
- [ ] **AC-CAT-3:** `product-grid.tsx` keeps its exact column counts (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`) — the `catalog.spec.ts` 2-up-at-375px assertion must stay green. Gap may align to the Factorial rhythm but column count is frozen.
- [ ] **AC-CAT-4:** `index-tile.tsx` + `category-tree.tsx` link cards become `.factorial-card` (keeping `.card-lift`, `.stagger`, nested `border-l` tree indent as a hairline), names drop `uppercase tracking-wide` → `tracking-[-0.02em]`. Used by `/marcas`, `/estilos`, `/categorias`, and homepage `featured-brands` — restyle centrally.
- [ ] **AC-CAT-5:** Filter/search chrome — `filter-panel.tsx`, `filter-sheet.tsx`, `filter-controls.tsx` legends/titles drop `uppercase tracking-wide`; the filter Apply button becomes `variant="cta"`; `filter-sheet` keeps its Radix Dialog behavior, hairline header/footer borders resolve via `--border`. `active-filters.tsx` chips, `sort-select.tsx`, `search-box.tsx` inherit new tokens; verify chips read as quiet pills/badges (no orange).
- [ ] **AC-CAT-6:** `no-results.tsx` + `empty-state.tsx` — heading drops `tracking-tight`, icon tile becomes a `.stat-card` (flat gray, borderless), CTA becomes `variant="cta" size="xl"`. `catalog-banner.tsx` + `brand-logo.tsx` + `catalog-skeleton.tsx` + `pagination.tsx` + `breadcrumbs.tsx` inherit new radius/tokens; `catalog-banner` drops its `border-primary/30` for the hairline/borderless treatment; pagination buttons keep `outline` behavior (they are navigation, not the primary CTA).
- [ ] **AC-CAT-7:** `stock-badge.tsx` and `grade-badge.tsx` keep `rounded-full` (they are already pills) and their semantic colors; `grade-badge` drops the `border-primary/20` if it reads as chrome, keeping the tint chip legible (matches the T20 cert-tag borderless treatment). Color is never the only signal (icons stay).

### Product detail page (`/producto/[slug]`)

- [ ] **AC-PDP-1:** `product-purchase-panel.tsx` info panel becomes `.factorial-card`; `<h1>` becomes `tracking-[-0.04em]`, no uppercase; the `.price-value` crossfade class + all price testids frozen.
- [ ] **AC-PDP-2:** `product-gallery.tsx` main image + thumbnails: borders resolve to hairline `--border`, radius via `--radius`; `aspect-[4/5]` and all zoom/lightbox testids + Radix Dialog behavior frozen.
- [ ] **AC-PDP-3:** `product-specs.tsx`, `product-qa.tsx`, `recently-viewed.tsx` section headings drop `uppercase tracking-wide` → sentence-case `font-heading` label with `tracking-[-0.02em]`; spec/Q&A hairline row dividers resolve via `--border`; the Q&A answer block + `qa-form.tsx` success note become `.stat-card` (flat gray) or a quiet tinted block; the Q&A submit button becomes `variant="cta" size="xl"`.
- [ ] **AC-PDP-4:** `add-to-cart-button.tsx` becomes `variant="cta" size="xl"` (orange pill), keeping the `.cart-press` press feedback, the two-label crossfade, `data-state`, and disabled/out-of-stock behavior. `variant-selector.tsx` swatch borders resolve to hairline; selected `ring-2 ring-primary` frozen. `pdp-skeleton.tsx` radius bumps inherit via `--radius`.

### Cart (`/carrito`)

- [ ] **AC-CART-1:** `cart-page-client.tsx` `<h1>` drops `tracking-tight` → Factorial heading recipe, no uppercase.
- [ ] **AC-CART-2:** `order-summary.tsx` card becomes `.factorial-card`; its heading drops `uppercase tracking-wide`; the checkout CTA becomes `variant="cta" size="xl"`. `cart-empty-state.tsx` CTA becomes `variant="cta" size="xl"`.
- [ ] **AC-CART-3:** `cart-line-row.tsx` name drops `tracking-tight`, image link keeps `.card-lift` + radius via `--radius`; the Remove button stays a quiet `ghost` text action (destructive-adjacent, not a primary CTA). `quantity-stepper.tsx`, `free-shipping-progress.tsx`, `cart-count-badge.tsx` inherit radius/tokens; the progress bar stays `rounded-full` (a pill bar reads correctly); the count pill stays `rounded-full`.

### Checkout (`/checkout` + `/checkout/confirmacion/[token]`)

- [ ] **AC-CHK-1:** `checkout-flow-client.tsx` + confirmation-page `<h1>`s drop `tracking-tight` → Factorial recipe, no uppercase. Confirmation section headings drop `uppercase tracking-wide`.
- [ ] **AC-CHK-2:** `checkout-field.tsx` `CheckoutCard` + `checkout-fields.tsx` sections + `checkout-summary.tsx` + confirmation `OrderSummaryCard`/`ShippingCard` become `.factorial-card`; their `uppercase tracking-wide` section headings become sentence-case with `-0.02em`. `checkout-skeleton.tsx` card shells mirror `.factorial-card` for a matching pre-hydration silhouette.
- [ ] **AC-CHK-3:** Primary submit CTAs — `checkout-summary` submit, `sticky-checkout-bar.tsx` submit, `checkout-empty-state.tsx` CTA, `payment-panel.tsx` pay/retry primary buttons, `oxxo-spei-instructions.tsx` View-Voucher CTA — become `variant="cta" size="xl"` (orange pill). The confirmation "Keep Shopping" button becomes `.pill-outline` (secondary). Field inputs (`fieldClasses`, discount input, reference code) inherit radius via `--radius`; the discount Apply button reads as a pill/outline secondary (not orange — orange is reserved for the true primary action).
- [ ] **AC-CHK-4:** `discount-code-field.tsx` keeps its input-value `uppercase` (AC-3 exception); the applied-code pill + savings/error notes keep their semantic `success`/`destructive` colors.

### /empresas B2B landing + shared Hero (Decision D-1)

- [ ] **AC-EMP-1:** `b2b-sections.tsx` (`B2BPillars` + `B2BProcess`) tiles become `.factorial-card`; the pillar icon tile bg becomes `bg-[var(--tint-green)]` (matching the homepage `values-impact` icon-tile treatment); titles drop `tracking-tight`→`tracking-[-0.02em]`; headings adopt the section-h2 recipe (drop `tracking-wide`); the process step number seal stays quiet (green/ink, NOT orange). `.enter-fade`/`.stagger` + all testids frozen.
- [ ] **AC-EMP-2:** The shared `Hero` (`home/hero.tsx`, used ONLY by `/empresas`) is restyled to the Factorial hero grammar to match `home-hero`: `<h1>` `text-primary tracking-tight` → `text-foreground tracking-[-0.04em] leading-[1.05]`; subcopy steps up to `text-base`; primary CTA `size="lg"`→`size="xl"` pill (already `variant="cta"`); the secondary link may become a `.pill-outline` OR stay the `.link-arrow` text link (dev's call, both AA); the media box canvas adopts the `home-hero` treatment (whisper-tint canvas wrapping a borderless floating media card) **while keeping the inner `aspect-[4/3]` box on BOTH the image and the fallback tile — the `hero.test.tsx` unit test pins `aspect-[4/3]` + `hero-image-fallback` + `.enter-fade` and MUST stay green.**
- [ ] **AC-EMP-3:** The `/empresas` page-level quote-section `<h2>` (`empresas/page.tsx:237`) drops `tracking-wide` → section-h2 recipe. The `QuoteForm` (`empresas/quote-form.tsx`, shared with the homepage `b2b-section`) is restyled **once, centrally**: its container/card and submit button already use the T20 pill CTA (verify `variant="cta"`); its inputs inherit new tokens. No per-page fork — the homepage `b2b-section` and `/empresas` both consume the same restyled form.
- [ ] **AC-EMP-4 (Decision D-1 — retire `headingSerif`):** `Libre Caslon Text` (`headingSerif`) is no longer referenced by any storefront surface after this task. Because the `--font-heading-family` rebind under `.theme-storefront` already resolves headings to DM Sans, Libre Caslon renders nowhere on the storefront even today — the export + `<html>` variable are now dead weight kept only "for the /empresas decision." **Decision: remove `headingSerif` from `fonts.ts`, drop `headingSerif.variable` from `[locale]/layout.tsx`, and clean the now-stale comments in `globals.css` referencing "Phase B via `--font-heading-serif`."** Safe: grep confirms no `.font-heading-serif` utility or `--font-heading-serif` consumer exists outside those two files + comments. (Zero-risk fallback if the reviewer prefers: leave `headingSerif` exported-but-unwired and only delete the comments; ship the removal, note the fallback in dev-done.)

### Static pages + error pages

- [ ] **AC-STATIC-1:** `content/static-page-body.tsx` `.static-heading` drops `uppercase tracking-wide` → sentence-case `font-heading` heading with `tracking-[-0.02em]` (keeps the `:target` accent-bar + `scroll-mt-24` deep-link behavior). Covers About/Shipping/Returns/Warranty/FAQ/Privacy/Terms via `[pageSlug]`, plus Contact + Showroom bodies. Page `<h1>`s in `[pageSlug]`, `contacto`, `showroom` adopt the Factorial heading recipe (showroom drops `uppercase`).
- [ ] **AC-STATIC-2:** `contacto/contact-form.tsx` submit becomes `variant="cta" size="xl"`; field inputs inherit radius/tokens; success/error banners keep their semantic colors. Showroom map panel + `viewOnMaps` link inherit new tokens (border → hairline).
- [ ] **AC-ERR-1:** `[locale]/not-found.tsx` + `[locale]/error.tsx` (both render inside the `.theme-storefront` shell) adopt the Factorial grammar: `<h1>` heading recipe, the 404 code tile becomes a `.stat-card` (flat gray, borderless), the primary action becomes `variant="cta" size="xl"`. These pages already inherit DM Sans + white ground from the shell.
- [ ] **AC-ERR-2 (deliberate exclusions, documented):** `src/app/not-found.tsx` (root, no-locale) and `src/app/global-error.tsx` (root layout crash) render their OWN `<html>` OUTSIDE `.theme-storefront` (root not-found uses only `sans.variable`=Inter; global-error uses inline `system-ui`). These are intentionally minimal, firewall-adjacent last-resort shells and are **out of scope** — they must NOT gain DM Sans or `.theme-storefront` (that would require a second full shell). Leave both unchanged; note the exclusion in dev-done.

## Edge Cases

At least 5, each with expected behavior:

1. **Discount-code input uppercase (AC-3 landmine):** A naive `uppercase`-removal sweep would strip `discount-code-field.tsx:101`, breaking functional code-entry casing. Expected: that one `uppercase` is KEPT; only eyebrow/heading `uppercase` is removed. Dev greps and hand-classifies each hit.
2. **Empty catalog / zero results:** `/sillas` with a filter that matches nothing renders `no-results.tsx`; a category/brand/style with zero products renders `empty-state.tsx`. Expected: both show the restyled `.stat-card` icon tile + orange `cta` CTA, still SSR-visible with JS off (the `sillas` page's no-Suspense SSR-first invariant is preserved — no restyle touches the render mode).
3. **Product with no cover image / no grade / single variant:** `product-card` renders the placeholder glyph tile; `grade-badge` is omitted when `conditionGrade` is null. Expected: `.factorial-card` renders identically with the placeholder; badge omission unchanged; no broken layout.
4. **`/empresas` hero with null image (`B2B_HERO_IMAGE` null):** `Hero` degrades to `hero-image-fallback` (Building glyph tile). Expected: the fallback tile keeps `aspect-[4/3]` + `aria-hidden` (the `hero.test.tsx` pins), now sitting on the new tint-canvas treatment — no CLS, no broken `<img>`, the unit test stays green.
5. **es-MX long strings at 320px on restyled pages:** tight `-0.04em` headings + long Spanish labels ("Solicitar cotización", checkout field labels, `no-results` copy). Expected: no horizontal scroll, no glyph clip at 320px in either locale (`latin-ext` already loaded); the `factorial-restyle.spec.ts` overflow smoke stays ≤1px.
6. **Confirmation page in OXXO/SPEI pending state:** `payment-panel` shows the warning-tinted voucher card. Expected: the warning `warning/*` border+tint is KEPT (a payment-status signal, not chrome), while surrounding order/shipping cards become `.factorial-card`. Signal vs chrome not blurred.
7. **Reduced-motion user on any restyled page:** Expected: pill hover is color-only (no transform), `.card-lift`/`.stagger`/`.enter-fade` degrade per the existing RM rules; no new keyframes introduced.
8. **Admin session navigating to a storefront page mid-session:** Expected: crossing from `/admin` to `/sillas` swaps `<body>` from Inter/neutral to DM Sans/Factorial cleanly (the firewall is a `.theme-storefront` scope, not a global mutation); admin stays untouched. No leak either direction.

## Error States Table

| Trigger | User Sees | System Does |
| --- | --- | --- |
| Catalog RPC fails / DB down on `/sillas` | The `[locale]/error.tsx` boundary — now Factorial-styled: DM Sans heading, orange `cta` retry pill, digest reference | Logs the error client-side; never leaks stack; `reset()` re-renders |
| Zero products match a filter | Restyled `no-results.tsx`: `.stat-card` icon tile, sentence-case heading, popular-chairs strip, orange `cta` CTA | Renders SSR-first (JS-off safe), `noindex,follow` metadata unchanged |
| Category/brand/style has no products | Restyled `empty-state.tsx`: `.stat-card` tile + orange `cta` "back to catalog" | No behavior change; label resolution unchanged |
| Unknown static slug / unpublished page | `notFound()` → restyled `[locale]/not-found.tsx` (in-shell, Factorial) | Route guard unchanged; localized copy unchanged |
| Contact/quote form validation fails | Restyled inputs with `aria-invalid` + semantic `destructive` error text (colors KEPT); orange `cta` submit shows retry | Server re-validates (boundary unchanged); honeypot offset frozen |
| OXXO/SPEI payment pending on confirmation | Warning-tinted voucher card (tint KEPT) beside `.factorial-card` order/shipping cards; orange `cta` View-Voucher | Payment polling/state machine unchanged |
| Add-to-cart while out of stock | Disabled orange `cta` pill (`opacity-50`, `pointer-events-none`), `data-state` unchanged | Stock guard unchanged |
| Root layout crash (no locale) | `global-error.tsx` bilingual `system-ui` fallback — DELIBERATELY un-restyled | Unchanged (firewall-adjacent last resort) |

## UX Requirements

For every state a restyled page can be in:

- **Loading:** `catalog-skeleton.tsx`, `pdp-skeleton.tsx`, `checkout-skeleton.tsx`, `cart-skeleton` (`animate-pulse` bars) mirror the restyled silhouette — skeleton card shells match `.factorial-card` radius so there is no visual jump on hydration. Radius resolves via `--radius`; no new spinner.
- **Empty:** Cart → restyled `cart-empty-state` (icon + copy + orange `cta` "shop" CTA). Catalog no-results / entity empty → restyled `.stat-card` tile + orange `cta`. Q&A empty → `qa-empty` message. All keep their testids + CTAs.
- **Error:** `[locale]/error.tsx` Factorial retry pill; form-level `destructive` banners keep semantic red; payment failure card keeps `destructive` tint. Recovery action = the orange `cta` retry / `reset()`.
- **Success:** Order confirmation page — status icon + `.factorial-card` order/shipping cards + `.pill-outline` "keep shopping". Contact/quote success banner keeps its muted/status styling; add-to-cart shows the "Agregado ✓" crossfade.
- **Mobile (375px):** Product grid stays exactly 2-up (frozen). Filter chrome collapses to the `filter-sheet` drawer (behavior frozen). Checkout shows the `sticky-checkout-bar` orange `cta`. Cart/checkout collapse to single column. All headings + long es-MX labels wrap with no h-scroll (edge 5). Container `px-4` unchanged.
- **Tablet (768px):** Catalog sidebar `catalog-shell` 2-col grid engages at `lg`; below `lg` the sheet drawer is used (frozen). Taxonomy tiles go 2-up. Cart/checkout keep single-column until `lg`.

## Technical Approach

### Files to Create

- **None required.** All primitives (`.factorial-card`, `.stat-card`, `.pill-outline`, `--tint-green`, `--shadow-factorial`, pill `Button` variants) already exist from T20. If dev finds a form-input recipe repeated ≥3× across cart/checkout/contact/quote (the shared `fieldClasses` string), extract it to a `.theme-storefront .field-input` recipe in `theme-storefront.css` (DRY, CLAUDE.md) — but only if it keeps that file ≤180 lines total. Otherwise edit in place.

### Files to Modify

_Catalog / taxonomy (shared — restyle centrally):_
- `src/components/catalog/product-card.tsx` — `.factorial-card`, name tracking. **Highest-leverage file** (5+ consumers).
- `src/components/catalog/index-tile.tsx`, `category-tree.tsx` — `.factorial-card`, drop `uppercase tracking-wide`.
- `src/components/catalog/filter-panel.tsx`, `filter-sheet.tsx`, `filter-controls.tsx` — drop `uppercase tracking-wide`; filter Apply → `variant="cta"`.
- `src/components/catalog/no-results.tsx`, `empty-state.tsx` — `.stat-card` tile, heading tracking, `variant="cta" size="xl"` CTA.
- `src/components/catalog/catalog-banner.tsx`, `brand-logo.tsx`, `catalog-skeleton.tsx`, `pagination.tsx`, `breadcrumbs.tsx`, `stock-badge.tsx`, `grade-badge.tsx`, `active-filters.tsx`, `sort-select.tsx`, `search-box.tsx`, `search-results.tsx`, `catalog-shell.tsx`, `catalog-grid-region.tsx` — token/radius inheritance + borderless/hairline cleanup where flagged; verify no orange leak.
- Page `<h1>`s: `src/app/[locale]/sillas/page.tsx`, `categorias/page.tsx`(+`[slug]`), `marcas/page.tsx`(+`[slug]`), `estilos/page.tsx`(+`[slug]`) — heading recipe, drop `uppercase`/`tracking-wide`/`tracking-tight`.
- `src/components/catalog/product-grid.tsx` — verify column counts frozen (likely no change).

_PDP:_
- `src/components/product/product-purchase-panel.tsx`, `product-gallery.tsx`, `product-specs.tsx`, `product-qa.tsx`, `qa-form.tsx`, `variant-selector.tsx`, `recently-viewed.tsx`, `pdp-skeleton.tsx` — cards → `.factorial-card`/`.stat-card`, drop uppercase headings, `qa-form` submit → `variant="cta" size="xl"`.
- `src/components/cart/add-to-cart-button.tsx` — `variant="cta" size="xl"`.

_Cart:_
- `src/components/cart/cart-page-client.tsx`, `cart-line-row.tsx`, `cart-empty-state.tsx`, `order-summary.tsx`, `free-shipping-progress.tsx`, `quantity-stepper.tsx`, `cart-count-badge.tsx` — heading, `.factorial-card` summary, `variant="cta"` CTAs, radius inheritance.

_Checkout:_
- `src/components/checkout/checkout-flow-client.tsx`, `checkout-fields.tsx`, `checkout-field.tsx`, `checkout-summary.tsx`, `checkout-empty-state.tsx`, `checkout-skeleton.tsx`, `discount-code-field.tsx`, `oxxo-spei-instructions.tsx`, `payment-panel.tsx`, `sticky-checkout-bar.tsx` — `.factorial-card`, drop uppercase headings, `variant="cta"` primaries, KEEP semantic tints + discount input uppercase.
- `src/app/[locale]/checkout/confirmacion/[token]/page.tsx` — heading, section headings, `.factorial-card`, `.pill-outline` keep-shopping.

_/empresas + shared:_
- `src/components/home/hero.tsx` — Factorial hero grammar (keep `aspect-[4/3]` + fallback + `.enter-fade`).
- `src/components/b2b/b2b-sections.tsx` — `.factorial-card` tiles, tint icon, headings.
- `src/app/[locale]/empresas/page.tsx` — quote-section `<h2>` recipe.
- `src/app/[locale]/empresas/quote-form.tsx` — verify pill CTA, input tokens (central, shared with homepage).
- `src/app/fonts.ts` + `src/app/[locale]/layout.tsx` — remove `headingSerif` (Decision D-1); clean stale `--font-heading-serif` comments in `globals.css`.

_Static + error:_
- `src/components/content/static-page-body.tsx` — `.static-heading` drop uppercase.
- `src/app/[locale]/[pageSlug]/page.tsx`, `contacto/page.tsx`, `contacto/contact-form.tsx`, `showroom/page.tsx` — headings + `variant="cta"` submit + token inheritance.
- `src/app/[locale]/not-found.tsx`, `error.tsx` — Factorial grammar (`.stat-card` code tile, `cta` action).

_Docs:_
- `DESIGN.md` — append a short T21 note (Phase B rolled the T20 grammar store-wide; `headingSerif` retired).

**Do NOT touch:** all of `src/components/admin/**` + `src/app/[locale]/admin/**`; `src/app/not-found.tsx` (root); `src/app/global-error.tsx`; `:root`/`.dark` token blocks; `motion-*.css`; `nav-items.ts`; `direction-contract.tsx` logic; any server action / query / RPC / i18n message file; the `discount-code-field` input `uppercase`.

### Data Model Changes

- **None.** No migration, no schema, no generated-types change.

### API Endpoints

- **None.** No route handler, server action, or RPC changes.

### Dependencies

- **None added.** DM Sans, `@hugeicons/react`, Radix, shadcn base are all installed and wired from T20/prior tasks. `headingSerif` (Libre Caslon) is *removed* from the font bundle (Decision D-1) — a small bundle win, not a dep change.

## Test Impact (existing suites affected by this restyle)

| Test | Impact | Action |
| --- | --- | --- |
| `factorial-restyle.spec.ts` | Owns the T20 grammar checks + the 6-page inheritance smoke | Must stay green; QA EXTENDS it with per-surface assertions (catalog h1 not-uppercase, PDP `.factorial-card`, /empresas hero orange pill) |
| `theme-firewall.spec.ts` | Admin firewall (Inter, no theme-storefront) | Must stay green unchanged (AC-1) — no admin file touched |
| `hero.test.tsx` | Pins `aspect-[4/3]` + `hero-image-fallback` + `.enter-fade` on shared `Hero` (/empresas) | KEEP all pins; only type/CTA/canvas classes change (AC-EMP-2) — must stay green |
| `catalog.spec.ts` | Pins 2-column grid at 375px (`gridTemplateColumns`) | Column count frozen (AC-CAT-3) — must stay green |
| `product-detail.spec.ts` | Pins compare-at `textDecorationLine` (strikethrough) | Strikethrough preserved — must stay green |
| `empresas-quote.spec.ts`, `static-pages-contact.spec.ts` | Pin honeypot `left` off-screen offset | Honeypot untouched (AC-8) — must stay green |
| `faq-accordion.test.tsx` | T20 FAQ grammar (homepage) | Homepage not in Phase B scope — no impact |
| Tests asserting `uppercase` | AC-3 removes uppercase at 17 sites | **Grep tests for `uppercase`/`tracking-wide` assertions first**; update any that pin the removed classes to assert sentence-case instead (these are the ONLY test changes AC-8 permits) |
| `css-line-count.test.ts` | `globals.css`/`theme-storefront.css` caps | Keep both under caps (AC-9) — must stay green |
| Unit render tests (product-card, order-summary, checkout-*, b2b) | Class-only edits; testids frozen | Should pass unchanged unless a test asserts a removed class string — update to new class |
| Product-grade / cart / checkout / search e2e | Behavior frozen | Should pass unchanged; QA re-runs to confirm no regression from token/class swaps |

## Out of Scope

- Any change to `/admin` (firewall — AC-1).
- `src/app/not-found.tsx` (root) and `src/app/global-error.tsx` — deliberately un-themed last-resort shells (AC-ERR-2).
- Any content, copy, i18n key, prop, testid, anchor, server action, RPC, query, validation, or column-count change (AC-8) — except the AC-3 test updates.
- Adding the two homepage gradient moments (`.gradient-band`/`.gradient-banner`) to interior pages (AC-7).
- New animations, scroll-reveals, marquees, or the Factorial sticky-nav "utility scrolls away" trick (T20 already decided against these).
- Phase 2 features (customer accounts, rich-text editing, discount-code management UI).
- Re-measuring or altering the Factorial source grammar — `tasks/reference/factorial-style-analysis.md` + `tasks/ui-design.md` are frozen authority.
