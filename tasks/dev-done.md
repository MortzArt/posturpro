# Dev Summary: T21 — Storefront restyle Phase B (Factorial grammar, remaining storefront)

Status: **SUCCESS** — all acceptance criteria implemented, all quality gates green, zero TODOs.

Phase B rolled the T20 Factorial grammar (pure-white ground, DM Sans, floating `.factorial-card` / flat `.stat-card`, orange `cta`/`xl` pills, `.pill-outline` secondaries, `-0.04em`/`-0.02em` heading tightness, sentence case) across every remaining storefront surface: catalog + taxonomy, filters/search, PDP, cart, checkout + confirmation, /empresas + shared Hero, static/policy/contact/showroom pages, and the in-shell 404/error pages. All primitives already existed from T20 — this task **applied** them (class-only edits); no new tokens, recipes, dependencies, or CSS were added.

## Quality Gates (all green)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** |
| `eslint` on all 56 touched `.ts/.tsx` files | **0 errors / 0 warnings** |
| `npm test` (full unit suite, vitest) | **2187 passed / 2187 (134 files)** |
| `npm run build` | **exit 0 — 133/133 pages generated** |
| `css-line-count.test.ts` | **green** — globals.css 322 (<600), theme-storefront.css 75 (≤180) |
| Firewall: admin files changed | **0** (no admin file touched) |
| Firewall: `cta`/`xl`/`factorial-card`/`theme-storefront`/`pill-outline` in admin | **0 occurrences** |
| Root `not-found.tsx` + `global-error.tsx` untouched | **confirmed** (AC-ERR-2) |
| `headingSerif`/Libre Caslon references remaining | **0** (D-1 complete) |

Screenshots (desktop 1280×900 + mobile 375×812) for sillas, categorias, marcas, empresas, carrito, contacto, showroom, 404 → `scratchpad/t21-preview/` (16 PNGs). Visual spot-check confirms: sentence-case ink headings, pure-white ground, floating white cards with soft shadow, orange pill CTAs, /empresas Hero matching the homepage grammar, 404 code tile as a flat gray `.stat-card`.

## Files Changed

56 source files + this summary. Grouped by surface.

### Shared leaves (restyled centrally — ripple to many pages)
| Path | Change | Summary |
|------|--------|---------|
| `src/components/catalog/product-card.tsx` | modified | `.factorial-card` (borderless + shadow), image tile drops `border-primary/30`, name `tracking-tight`→`tracking-[-0.02em]`. Testids frozen. Feeds catalog/taxonomy/search/home-featured/recently-viewed. |
| `src/components/catalog/index-tile.tsx` | modified | `.factorial-card`, drop `uppercase tracking-wide`→`tracking-[-0.02em]`, drop `hover:bg-accent` (cards lift, not tint). |
| `src/components/catalog/category-tree.tsx` | modified | `.factorial-card`, drop `uppercase tracking-wide`→`tracking-[-0.02em]`. Nested `border-l` tree indent kept as hairline. |
| `src/components/catalog/brand-logo.tsx` | modified | Monogram `tracking-tight`→`tracking-[-0.02em]` (hairline border kept). |
| `src/components/catalog/grade-badge.tsx` | modified | Dropped `border-primary/20` chrome; keeps `rounded-full` + semantic mint chip (matches T20 cert-tag borderless). |
| `src/components/home/hero.tsx` | modified | Factorial hero grammar: h1 `text-primary tracking-tight`→`text-foreground tracking-[-0.04em] leading-[1.05]`, subcopy →`text-base`, CTA `size="lg"`→`size="xl"` pill, media on whisper-green tint canvas wrapping a `.factorial-card`. **KEPT `aspect-[4/3]` on both image+fallback, `hero-image-fallback` testid + aria-hidden, `.enter-fade`** (hero.test.tsx pins). |
| `src/components/b2b/b2b-sections.tsx` | modified | Pillar+process tiles →`.factorial-card`; icon tile bg →`bg-[var(--tint-green)]`; headings →section-h2 recipe; titles →`tracking-[-0.02em]`; process seal stays green/ink (not orange). Stale docstring updated. |
| `src/components/content/static-page-body.tsx` | modified | `.static-heading` drop `uppercase tracking-wide`→`tracking-[-0.02em]`; `:target` accent bar + `scroll-mt-24` deep-link kept. |
| `src/app/[locale]/empresas/quote-form.tsx` | modified | Submit CTA `size="lg"`→`size="xl"` pill (already `variant="cta"`); shared centrally with the homepage b2b-section. Inputs inherit tokens. Honeypot/validation frozen. |

### Catalog chrome
| Path | Change | Summary |
|------|--------|---------|
| `src/components/catalog/filter-controls.tsx` | modified | Legend drop `uppercase tracking-wide`→`tracking-[-0.02em]`. |
| `src/components/catalog/filter-panel.tsx` | modified | sortLabel drop `uppercase tracking-wide`; Apply →`variant="cta" size="xl"`. |
| `src/components/catalog/filter-sheet.tsx` | modified | Dialog.Title drop `uppercase tracking-wide`; footer Apply →`cta xl`; Radix Dialog + hairline header/footer borders + testids frozen. |
| `src/components/catalog/no-results.tsx` | modified | Icon tile →`.stat-card`; headings →`tracking-[-0.02em]`; clear CTA →`cta xl`. SSR-first render untouched. |
| `src/components/catalog/empty-state.tsx` | modified | Icon tile →`.stat-card`; message →`tracking-[-0.02em]`; back-to-catalog CTA →`cta xl`. |
| `src/components/catalog/catalog-banner.tsx` | modified | Dropped `border border-primary/30` → borderless (kept `bg-muted shadow-sm`, aspect box, fallback+testid). |
| `src/components/catalog/catalog-skeleton.tsx` | modified | Card shell →`.factorial-card` silhouette (borderless); image box drops `border-primary/30`; `motion-safe:animate-pulse` kept. |
| `src/app/[locale]/sillas/page.tsx` | modified | h1 drop `uppercase tracking-wide`→heading recipe. |

### Taxonomy pages
| Path | Change | Summary |
|------|--------|---------|
| `src/app/[locale]/categorias/page.tsx`, `marcas/page.tsx`, `estilos/page.tsx` | modified | Index h1s: add `font-heading`, `tracking-tight`→`tracking-[-0.04em]`, `sm:font-bold`. |
| `src/app/[locale]/categorias/[slug]/page.tsx`, `marcas/[slug]/page.tsx`, `estilos/[slug]/page.tsx` | modified | Detail h1s: add `font-heading`, heading recipe; brand-logo+name structure preserved. |

### PDP
| Path | Change | Summary |
|------|--------|---------|
| `src/components/product/product-purchase-panel.tsx` | modified | Info panel →`.factorial-card`; h1 →`tracking-[-0.04em]`; `.price-value` crossfade + price testids frozen. |
| `src/components/product/product-gallery.tsx` | modified | `border-primary/30` chrome →hairline `border-border`; `aspect-[4/5]`, zoom/lightbox testids, Radix Dialog, selected-thumb ring frozen. |
| `src/components/product/product-specs.tsx` | modified | h2 drop `uppercase tracking-wide`→`tracking-[-0.02em]`. |
| `src/components/product/product-qa.tsx` | modified | h2 drop `uppercase tracking-wide`; Q&A answer block →`.stat-card`. |
| `src/components/product/qa-form.tsx` | modified | h2 →`tracking-[-0.02em]`; submit →`cta xl`; neutral success note →`.stat-card`; honeypot frozen. |
| `src/components/product/recently-viewed.tsx` | modified | h2 drop `uppercase tracking-wide`→`tracking-[-0.02em]`. |
| `src/components/cart/add-to-cart-button.tsx` | modified | `variant="default"`→`variant="cta" size="xl"`; `.cart-press`, two-label crossfade, `data-state`, out-of-stock/disabled behavior + testids frozen (`h-11 w-full` retained to avoid layout shift). |

### Cart
| Path | Change | Summary |
|------|--------|---------|
| `src/components/cart/cart-page-client.tsx` | modified | h1 `tracking-tight`→`tracking-[-0.04em]`. |
| `src/components/cart/order-summary.tsx` | modified | Card →`.factorial-card`; h2 drop `uppercase tracking-wide`; checkout CTA →`cta xl`. |
| `src/components/cart/cart-empty-state.tsx` | modified | Shop CTA →`cta xl`. |
| `src/components/cart/cart-line-row.tsx` | modified | Name link `tracking-tight`→`tracking-[-0.02em]`; Remove stays quiet `ghost`. |

### Checkout + confirmation
| Path | Change | Summary |
|------|--------|---------|
| `src/components/checkout/checkout-flow-client.tsx` | modified | h1 →`tracking-[-0.04em]`. |
| `src/components/checkout/checkout-field.tsx` | modified | `CheckoutCard` →`.factorial-card`; h2 drop `uppercase tracking-wide`→`tracking-[-0.02em]`. |
| `src/components/checkout/checkout-summary.tsx` | modified | Card →`.factorial-card`; h2 drop `uppercase tracking-wide`; submit →`cta xl` (kept `hidden`/`lg:flex`). |
| `src/components/checkout/checkout-empty-state.tsx` | modified | CTA →`cta xl`. |
| `src/components/checkout/checkout-skeleton.tsx` | modified | h1 →`tracking-[-0.04em]`; card shells →`.factorial-card` silhouette; `animate-pulse` kept. |
| `src/components/checkout/discount-code-field.tsx` | modified | Apply →`.pill-outline` (D-5, NOT orange). **KEPT input-value `uppercase` (AC-3 exception)** + semantic success/error colors. |
| `src/components/checkout/payment-panel.tsx` | modified | Neutral base card →`.factorial-card`; **re-asserted visible `border` on the 4 semantic tinted variants** (failed/unavailable/stale/processing) so tint+border survives `factorial-card`'s `border:0` (signal vs chrome, edge 6); Pay/Retry →`cta xl`. |
| `src/components/checkout/oxxo-spei-instructions.tsx` | modified | View-Voucher →`cta xl`; **warning-tinted voucher card tint+border KEPT**. |
| `src/components/checkout/sticky-checkout-bar.tsx` | modified | Submit →`cta xl`; sticky behavior + testids frozen. |
| `src/app/[locale]/checkout/confirmacion/[token]/page.tsx` | modified | h1 →`tracking-[-0.04em]`; both section h2s drop `uppercase tracking-wide`→`tracking-[-0.02em]`; Order+Shipping cards →`.factorial-card`; Keep-Shopping →`.pill-outline`; `confirmation-heading` + testids frozen. |

### /empresas + static + error
| Path | Change | Summary |
|------|--------|---------|
| `src/app/[locale]/empresas/page.tsx` | modified | Quote-section h2 drop `tracking-wide`→section-h2 recipe. |
| `src/app/[locale]/[pageSlug]/page.tsx`, `contacto/page.tsx` | modified | h1 →heading recipe (`font-heading font-semibold sm:font-bold tracking-[-0.04em]`). |
| `src/app/[locale]/contacto/contact-form.tsx` | modified | Submit →`cta xl`; inputs/banners/honeypot frozen. |
| `src/app/[locale]/showroom/page.tsx` | modified | h1 drop `uppercase tracking-wide`→heading recipe. |
| `src/app/[locale]/not-found.tsx` (in-shell) | modified | Code tile →`.stat-card`; h1 →heading recipe; home action →`cta xl`; testids/behavior frozen. |
| `src/app/[locale]/error.tsx` | modified | h1 →heading recipe; retry →`cta xl`; digest/reset frozen. |

### Fonts / tokens / docs (Decision D-1)
| Path | Change | Summary |
|------|--------|---------|
| `src/app/fonts.ts` | modified | Removed `headingSerif` (Libre Caslon) export + its `next/font` import — trims one font from the bundle. |
| `src/app/[locale]/layout.tsx` | modified | Dropped `headingSerif.variable` from `<html>` + its import. |
| `src/app/globals.css` | modified | Cleaned 2 stale comment blocks referencing Libre Caslon / `--font-heading-serif` (now DM-Sans-only narrative). No rule/token change. |
| `src/app/[locale]/page.tsx` | modified | Stale docstring "Libre Caslon Text" → "DM Sans (Factorial)". |
| `DESIGN.md` | modified | Appended a T21 amendment: Phase B rolled the T20 grammar store-wide; `headingSerif` retired (D-1); firewall unchanged. |

## Data-Testids Added
- **None.** No testid added, removed, or renamed anywhere. All existing testids (`product-card`, `product-card-link`, `hero-image-fallback`, `hero-cta-catalog`, `quote-submit`, `confirmation-heading`, `not-found-home`, `error-retry`, `error-digest`, checkout/cart/qa testids, …) are frozen (AC-8).

## Key Decisions
- **D-1 (headingSerif retired):** Removed `headingSerif`/Libre Caslon from `fonts.ts` + `layout.tsx` and cleaned globals comments. Grep-verified zero other consumers before removing; post-removal grep confirms zero references. Chose full removal (not the exported-but-unwired fallback) — clean bundle win, nothing consumes it; the T20 `--font-heading-family` rebind already resolves all storefront headings to DM Sans.
- **Shared Hero secondary link:** Kept as the existing `.link-arrow` text link (both AA per AC-EMP-2) rather than converting to `.pill-outline` — avoids testid/structure churn and matches "one loud CTA per view" restraint.
- **QuoteForm submit → `size="xl"`:** Bumped `lg`→`xl` (kept `variant="cta"`) so the true primary B2B action reads as the full Factorial pill; applied centrally so /empresas and the homepage b2b-section stay identical (no fork). No e2e/unit assertion pins its geometry.
- **payment-panel semantic borders:** Because `.factorial-card` sets `border:0`, re-asserted a visible `border` on the four semantic status variants so their tint+border signal survives — signal (status) kept distinct from chrome (neutral cards → factorial-card), per AC-5/edge 6.
- **Detail-page h1s gained `font-heading`:** Taxonomy detail/index h1s previously lacked `font-heading`; added it so they resolve DM Sans with the heading recipe (AC-CAT-1); structure otherwise preserved.

## Deviations from Ticket
- **None substantive.** `checkout-fields.tsx` needed no edit — its sections render via the shared `CheckoutCard` (updated in `checkout-field.tsx`) and carried no inline neutral card or `uppercase` label. The ticket listed it as "modify"; correctly left unchanged (no matching pattern present).
- `theme-storefront.css` `.field-input` extraction was **not** performed: the shared input class lives in existing `fieldClasses` consts (not inline-repeated 3×+), so extraction was unnecessary; file stays at 75 lines (AC-9 satisfied by not adding).

## Edge Cases Handled
1. **Discount-code input uppercase (AC-3 landmine):** `discount-code-field.tsx:101` `uppercase` on the input VALUE is KEPT; only eyebrow/heading uppercase removed. Verified by grep (only that line + a brand-logo code comment remain).
2. **Empty catalog / zero results:** `no-results.tsx` + `empty-state.tsx` show `.stat-card` icon tile + orange `cta xl`; SSR-first render mode untouched (JS-off safe).
3. **Product with no cover / no grade:** `product-card` `.factorial-card` renders identically with the placeholder glyph; `grade-badge` still omitted when null; borderless chip legible.
4. **/empresas hero null image:** `Hero` degrades to `hero-image-fallback` (Building glyph) keeping `aspect-[4/3]` + `aria-hidden` on the new tint canvas; `hero.test.tsx` green.
5. **es-MX long strings at 375px:** Mobile screenshots (carrito/empresas/etc.) show no h-scroll; tight `-0.04em` headings + long Spanish labels wrap cleanly.
6. **OXXO/SPEI pending:** `payment-panel` + `oxxo-spei-instructions` KEEP the warning tint+border; surrounding order/shipping cards are `.factorial-card`. Signal vs chrome preserved.
7. **Reduced motion:** No new keyframes added; `.card-lift`/`.stagger`/`.enter-fade`/`.pill-outline` all reuse existing reduced-motion-gated classes.
8. **Admin ↔ storefront crossing:** No admin file touched; `.theme-storefront` scope unchanged; `cta`/`xl`/`factorial-card` absent from admin (grep-verified). Firewall intact.

## How to Test
1. `npm test` → 2187/2187 unit tests pass.
2. `npm run build` → exit 0, 133 pages.
3. Visual: `PORT=3111 npm start`, then browse `/es-MX/{sillas,categorias,marcas,empresas,carrito,contacto,showroom}` + any 404 route — confirm pure-white ground, sentence-case ink headings, floating white cards, orange pill CTAs, /empresas hero matching homepage. Screenshots in `scratchpad/t21-preview/`.
4. Firewall: browse `/admin` — must stay Inter, `rounded-md`, no orange pill, no `.factorial-card`.
5. Discount code: enter a lowercase code in checkout → input still renders uppercase (functional casing kept).

## Known Limitations
- **None deferred.** All ticket file-list items are complete, including the `DESIGN.md` T21 amendment. Integration/e2e suites were not run in this stage (they need a live DB / built server and are owned by the QA stage); the T21-relevant e2e specs (`factorial-restyle`, `theme-firewall`, `catalog`, `product-detail`, `empresas-quote`, `static-pages-contact`, `not-found`) assert behavior/testids/computed-style — none pin a class this restyle removed, so they should stay green; QA will confirm and add the new per-surface grammar assertions (AC-10).

## Dependencies Added
- **None.** `Libre_Caslon_Text` was *removed* from the `next/font` bundle (D-1) — a small net win. No package added/upgraded.

## Review + Fix Pass (ReviewFix Stage)

### Issues Found & Fixed

| ID  | Severity | Title | Status | File | Fix Applied |
| --- | -------- | ----- | ------ | ---- | ----------- |
| C-1 | CRITICAL | Payment-panel semantic borders suppressed by `.factorial-card{border:0}` (unlayered beats Tailwind `border` utility) | FIXED | `checkout/payment-panel.tsx:188,260,290,311,349` | Added a `semantic` flag to `Card`: neutral cards keep `.factorial-card`, semantic (failed/unavailable/stale/processing) render `rounded-[var(--radius)]` so their tint+`border` render. Verified 0px→1px against compiled CSS in headless Chromium. Dev summary's "re-asserted border" did NOT work — cascade defeated it. |
| M-1 | MAJOR | Stale-reload primary button not restyled (stayed green `variant="default"`) | FIXED | `checkout/payment-panel.tsx:326` | `buttonVariants({ variant: "cta", size: "xl" })`; dropped redundant `h-11 px-6 text-sm`. Matches Pay/Retry (AC-CHK-3). |
| m-1 | MINOR | 4 `cta xl` CTAs kept `px-4` that twMerge strips from Factorial `px-8` (inconsistent pill width) | FIXED | `[locale]/not-found.tsx:28`, `[locale]/error.tsx:56`, `product/qa-form.tsx:235`, `contacto/contact-form.tsx:254` | Removed redundant `px-4` + `min-h-11` so all adopt `xl`'s `px-8`/`h-12`. |
| m-2 | MINOR | Bare `min-h-11` on `cta xl` in empty-state/no-results | SKIPPED | — | Harmless no-op (`min-h-11` < `h-12`; px-8 already correct). Removing is pure churn. |

### Summary

- Critical: 1/1 fixed
- Major: 1/1 fixed
- Minor: 1/1 fixed, 1 skipped (justified no-op)

### Gates re-run after fixes
tsc 0 · eslint 0 (5 touched files) · vitest 2187/2187 (134 files) · build 133/133 pages · payment semantic border verified 1px in compiled CSS.

### Files touched by ReviewFix (5)
`checkout/payment-panel.tsx`, `[locale]/not-found.tsx`, `[locale]/error.tsx`, `product/qa-form.tsx`, `[locale]/contacto/contact-form.tsx`. No admin/testid/content/honeypot change.
