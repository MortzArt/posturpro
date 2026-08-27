# Research Report: T21 — Storefront restyle Phase B (Factorial grammar, remaining storefront)

Single-pass codebase scan (2026-08-27), parallelized across catalog/search, PDP/product, and cart/checkout inventories plus a direct scan of /empresas, static, error, and shared surfaces. This is a **presentation-layer** restyle. All content/copy/data/SEO/i18n/behavior is frozen (T21 AC-8). The Factorial grammar, tokens, primitives, and pill `Button` variants already exist from T20 — Phase B applies them; it does not build them.

## Codebase Analysis

### Existing Patterns (T20 primitives to reuse — do NOT rebuild)

- **`.factorial-card`** — `theme-storefront.css:30`. Floating white card: `border-radius: var(--radius)` (16px), `background: var(--card)`, `box-shadow: var(--shadow-factorial)` (layered triple soft shadow), `border: 0`. Reuse strategy: swap every page-body `rounded-md border border-border bg-card` info/summary/panel card to `.factorial-card`.
- **`.stat-card`** — `theme-storefront.css:38`. Flat gray canvas card: `border-radius: var(--radius)`, `background: var(--muted)`, no shadow/border. Reuse: no-results/empty-state icon tiles, PDP Q&A answer block + qa-form success note, the 404 code tile.
- **`.pill-outline`** — `theme-storefront.css:48`. 2px ink-outline pill secondary CTA with 100ms hover color-swap, reduced-motion-safe. Reuse: confirmation "Keep Shopping", `/empresas` hero secondary (optional).
- **Pill `Button` variants** — `src/components/ui/button.tsx`. `variant="cta"` = orange `rounded-full` + 2px self-border + dark AA fg + `transition-colors`; `size="xl"` = `h-12 rounded-full px-8 text-base font-semibold`. Admin never uses these (firewall). Reuse: every primary CTA on a restyled page.
- **Token seam** — `.theme-storefront` block in `globals.css`: `--background` pure white, `--radius: 1rem`, `--muted`/`--muted-foreground` (gray card + soft ink), `--border` hairline, `--shadow-factorial`, `--tint-green`/`--tint-orange`, `--gradient-factorial`, `--font-heading-family` rebound to DM Sans. Every restyle value flows through these — no new hex (AC-2).
- **Section-h2 recipe (T20)** — `font-heading text-2xl font-bold tracking-[-0.04em] leading-[1.15] text-foreground sm:text-[2rem]` (see `home/section-header.tsx:26` for the live example already using it). Reuse for every restyled section heading.
- **Radius auto-resolution** — because T20 raised `--radius` to `1rem` storefront-wide, existing `rounded-md` (→~12.8px) and `rounded-lg` (→16px) classes ALREADY render at Factorial radii on the storefront. Most "radius" work is therefore automatic; the real edits are card *finish* (shadow/border), uppercase removal, heading tracking, and CTA pills.
- **`.card-lift` / `.stagger` / `.enter-fade`** — existing reduced-motion-gated motion classes (globals + motion-*.css). KEEP on cards/tiles being restyled; no new motion (T20 motion-restraint rule).

### Relevant Files

| File | Purpose | Relevance | Action |
| --- | --- | --- | --- |
| `src/components/ui/button.tsx` | Pill CTA variants (T20) | Source of `cta`/`xl` pill | Reference (no change) |
| `src/app/theme-storefront.css` | Factorial recipes (T20) | Source of `.factorial-card`/`.stat-card`/`.pill-outline` | Reference; optional `.field-input` add if ≤180 lines |
| `src/app/globals.css` | `.theme-storefront` tokens (T20) | Token source; stale `--font-heading-serif` comments | Modify (clean comments only) |
| `src/app/fonts.ts` | Font exports (Inter/DM Sans/Libre Caslon) | `headingSerif` now dead | Modify (remove `headingSerif`, D-1) |
| `src/app/[locale]/layout.tsx` | `<html>` font-var wiring | `headingSerif.variable` on `<html>` | Modify (drop it, D-1) |
| **`src/components/catalog/product-card.tsx`** | Most-reused card (catalog/taxonomy/search/home/recently-viewed) | Single highest-leverage restyle | Modify → `.factorial-card` |
| `src/components/catalog/index-tile.tsx`, `category-tree.tsx` | Brand/style/category link cards (shared) | `.factorial-card` + uppercase | Modify |
| `src/components/catalog/filter-panel.tsx`, `filter-sheet.tsx`, `filter-controls.tsx` | Filter chrome (shared sidebar + drawer) | `uppercase tracking-wide` legends; Apply CTA | Modify |
| `src/components/catalog/no-results.tsx`, `empty-state.tsx` | Empty states | `.stat-card` tile + `cta` CTA | Modify |
| `src/components/catalog/catalog-banner.tsx`, `brand-logo.tsx`, `catalog-skeleton.tsx`, `pagination.tsx`, `breadcrumbs.tsx`, `stock-badge.tsx`, `grade-badge.tsx`, `active-filters.tsx`, `sort-select.tsx`, `search-box.tsx`, `search-results.tsx`, `catalog-shell.tsx`, `catalog-grid-region.tsx` | Catalog sub-chrome | Token/radius/border inheritance | Modify (light) |
| `src/components/catalog/product-grid.tsx` | Grid layout | Column count FROZEN (`catalog.spec.ts`) | Reference (verify only) |
| `src/app/[locale]/sillas/page.tsx`, `categorias/**`, `marcas/**`, `estilos/**` | Catalog + taxonomy pages | `<h1>` uppercase/tracking | Modify (headers) |
| `src/components/product/product-purchase-panel.tsx`, `product-gallery.tsx`, `product-specs.tsx`, `product-qa.tsx`, `qa-form.tsx`, `variant-selector.tsx`, `recently-viewed.tsx`, `pdp-skeleton.tsx` | PDP surfaces | Cards/headings/CTA/hairlines | Modify |
| `src/components/cart/add-to-cart-button.tsx` | PDP add-to-cart (currently `variant="default"`) | → `variant="cta" size="xl"` | Modify |
| `src/components/cart/cart-page-client.tsx`, `cart-line-row.tsx`, `cart-empty-state.tsx`, `order-summary.tsx`, `free-shipping-progress.tsx`, `quantity-stepper.tsx`, `cart-count-badge.tsx` | Cart surfaces | Heading/`.factorial-card`/CTA/radius | Modify |
| `src/components/checkout/checkout-flow-client.tsx`, `checkout-fields.tsx`, `checkout-field.tsx`, `checkout-summary.tsx`, `checkout-empty-state.tsx`, `checkout-skeleton.tsx`, `discount-code-field.tsx`, `oxxo-spei-instructions.tsx`, `payment-panel.tsx`, `sticky-checkout-bar.tsx` | Checkout surfaces | `.factorial-card`/uppercase/CTA; KEEP tints + discount uppercase | Modify |
| `src/app/[locale]/checkout/confirmacion/[token]/page.tsx` | Confirmation page | Heading/section-heading/cards/keep-shopping | Modify |
| `src/components/home/hero.tsx` | Shared hero — /empresas ONLY | Factorial hero grammar (keep `aspect-[4/3]`) | Modify |
| `src/components/b2b/b2b-sections.tsx` | /empresas pillars + process tiles | `.factorial-card` + tint icon | Modify |
| `src/app/[locale]/empresas/page.tsx`, `empresas/quote-form.tsx` | B2B page + shared quote form | `<h2>` recipe; verify pill CTA | Modify |
| `src/components/content/static-page-body.tsx` | Static body renderer (all policy pages) | `.static-heading` uppercase | Modify |
| `src/app/[locale]/[pageSlug]/page.tsx`, `contacto/page.tsx`, `contacto/contact-form.tsx`, `showroom/page.tsx` | Static page shells + contact form | Heading + `cta` submit + tokens | Modify |
| `src/app/[locale]/not-found.tsx`, `error.tsx` | In-shell error pages | Factorial grammar (`.stat-card` tile, `cta`) | Modify |
| `src/app/not-found.tsx`, `src/app/global-error.tsx` | Root last-resort shells | Deliberately un-themed | **Reference (do NOT touch, AC-ERR-2)** |
| `src/components/admin/**`, `src/app/[locale]/admin/**` | Admin | Firewall | **Reference (do NOT touch, AC-1)** |

### Data Flow

This is presentation-only; there is no new data flow. Existing flow for a representative restyled page (catalog):

`user → /sillas (RSC, reads searchParams) → parseCatalogFilters + loadFacetOptions (cached, catalog-tagged) → SearchResults awaits the listing RPC INLINE (no Suspense — SSR-first, JS-off safe) → ProductGrid → ProductCard × N (pre-resolved labels) → HTML`.

Phase B changes ONLY the class strings emitted by `ProductCard`, `ProductGrid`'s wrapper, the page `<h1>`, and the filter chrome. The RPC, the render mode, the caching, the `searchParams` parse, and the `noindex,follow` metadata are all untouched. Same principle holds for PDP (variant-state island), cart (localStorage provider), checkout (server-action state machine), and forms (contact/quote/qa `useActionState` + honeypot + server re-validation) — the restyle never crosses the client/server boundary.

### Similar Features (Reference Implementations)

- **T20 homepage (`src/app/[locale]/page.tsx` + `src/components/home/*`)** — the DONE reference. Every Phase B transform has a live homepage precedent: `values-impact.tsx` shows the `.factorial-card` + `bg-[var(--tint-green)]` icon-tile treatment to copy onto `b2b-sections.tsx`; `home-hero.tsx` shows the hero grammar to copy onto `hero.tsx`; `cta-banner.tsx` + `savings-calculator.tsx` show the pill CTA + `.factorial-card` float; `section-header.tsx` shows the live section-h2 recipe; `trust-faq.tsx` shows the hairline-row treatment. **Follow these files as the pattern source** — Phase B is "make the interior pages look like these."
- **`home/section-header.tsx`** — shared by `featured-products` + `featured-brands`; already Factorial. Its `.link-arrow` + `text-primary` link is the pattern for taxonomy "view all" links.
- **`b2b-section.tsx` (homepage)** and `empresas/quote-form.tsx` — the homepage B2B block and the /empresas page BOTH embed the same `QuoteForm`; restyling the form once satisfies both (no fork). The homepage `b2b-section` was already restyled in T20; the /empresas consumers inherit it.

## Dependency Analysis

### Existing Dependencies to Leverage

- **`next/font/google` DM Sans** — wired via `--font-dm-sans` (T20). No change; `headingSerif`/Libre Caslon is *removed* (D-1), trimming the font bundle.
- **`@hugeicons/react` + `@hugeicons/core-free-icons`** — the ONLY icon set (CLAUDE.md: never mix). All restyled icons already use it.
- **shadcn base `Button`** (`ui/button.tsx`) — extended with `cta`/`xl` in T20. Radix `Dialog` (filter-sheet, gallery zoom, mobile-nav), `Select` (sort), `Checkbox`, `Slider` — all installed, behavior frozen.
- **`cn()`** (`@/lib/utils`) — conditional-class helper, used throughout.

### New Dependencies Needed

- **None.** No package added or upgraded.

### Internal Dependencies

- `product-card.tsx` is imported by: catalog `product-grid` (→ /sillas + taxonomy detail + search), `recently-viewed` (PDP), and homepage `featured-products`. Implication: restyle it ONCE and 5+ surfaces update; a per-page fork would violate CLAUDE.md DRY and T21's central-restyle mandate.
- `index-tile` + `brand-logo` are imported by taxonomy index pages AND homepage `featured-brands`. Same central-restyle implication.
- `Hero` (`home/hero.tsx`) is imported ONLY by `/empresas` (the homepage uses `home-hero.tsx`, a different file). Implication: restyling `Hero` affects only /empresas + the `hero.test.tsx` unit (which pins `aspect-[4/3]`). Safe to restyle without touching the homepage.
- `QuoteForm` (`empresas/quote-form.tsx`) is imported by homepage `b2b-section` AND `/empresas`. Central restyle covers both.
- `checkout-field.tsx` `CheckoutCard` + `fieldClasses` are the shared card/input primitives for the whole checkout form; `contact-form.tsx` + `qa-form.tsx` define their OWN local `fieldClasses` string (same shape). Implication: a `.field-input` recipe extraction (optional) would DRY three copies — but only if `theme-storefront.css` stays ≤180 lines.

## External Research

### API Documentation

- **N/A** — no external API, SDK, or service is involved in a CSS/class restyle. The Factorial visual grammar was already reverse-engineered in T20 (`tasks/reference/factorial-style-analysis.md`, measured live via Playwright); no further external investigation is needed. Do not re-fetch the reference site.

### Library Documentation

- **DM Sans / next/font** — already configured (subsets `latin`+`latin-ext` for es-MX glyphs, weights 400/500/600/700, `display:"swap"`). No config change. Removing `Libre_Caslon_Text` from `fonts.ts` drops one `next/font` call — verify `next build` still bounds CLS (it will; the storefront never rendered Libre Caslon under `.theme-storefront` anyway).
- **Tailwind v4 `@theme inline` radius scale** — already keyed off `--radius`; the storefront bump to `1rem` (T20) recomputes `rounded-md`/`rounded-lg`/`rounded-3xl` automatically. No Tailwind config edit.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Naive `uppercase` sweep strips the FUNCTIONAL discount-code input casing (`discount-code-field.tsx:101`) | Med | Med | AC-3 explicitly carves it out; dev greps + hand-classifies each of the 15 `uppercase` hits before removing. Edge case 1. |
| Breaking the shared `Hero`'s `aspect-[4/3]`/`hero-image-fallback`/`.enter-fade` pins (`hero.test.tsx`) | Med | High | AC-EMP-2 mandates keeping the inner `aspect-[4/3]` on BOTH image + fallback and the `.enter-fade`; only type/CTA/canvas classes change. Run `hero.test.tsx` after the edit. |
| `product-grid` column-count regression (`catalog.spec.ts` 2-up@375px) | Low | High | AC-CAT-3 freezes column classes; gap may change but not `grid-cols-*`. Re-run `catalog.spec.ts`. |
| Firewall regression — DM Sans / `.factorial-card` / orange pill leaking into `/admin` | Low | High | No admin file is touched; `theme-firewall.spec.ts` + `factorial-restyle.spec.ts` admin checks re-run and must stay green (AC-1). The `cta`/`xl` variants are storefront-only by convention; grep admin for their usage (expect none). |
| Blurring semantic status cards (error/warning/success) into `.factorial-card` chrome | Med | Med | AC-5 + edge 6: status cards KEEP their tinted border; only neutral chrome cards become `.factorial-card`. Reviewer checks each `destructive/*`/`warning/*`/`success/*` card is untouched. |
| css-line-count guard breach if a shared recipe is inline-repeated | Low | Med | AC-9: any repeated recipe goes into `theme-storefront.css` (keep ≤180); `css-line-count.test.ts` re-run. |
| Unit render tests asserting a removed class string (e.g. `uppercase`) fail | Med | Low | Test-Impact table: grep tests for `uppercase`/`tracking-wide` assertions first; update the few that pin removed classes to assert sentence-case (the only test edits AC-8 permits). |
| Retiring `headingSerif` breaks an unseen consumer | Low | Med | Grep confirms no `--font-heading-serif` / `.font-heading-serif` consumer outside `fonts.ts` + `layout.tsx` + stale comments. Zero-risk fallback documented in AC-EMP-4 (leave exported-but-unwired). |

### Performance Considerations

- **Bundle:** removing Libre Caslon is a small net win (one fewer font in the graph). No new JS, no new CSS files (recipes reused). Class-only edits do not change render cost.
- **CLS:** unchanged — `aspect-[4/5]`/`aspect-[4/3]` boxes are preserved on every media slot; skeletons mirror the restyled silhouette (UX loading state) so hydration has no jump.
- **SSR-first invariant:** the `/sillas` no-Suspense inline-await render mode is NOT touched — JS-off catalog visibility preserved (edge 2).

### Security Considerations

- **No new attack surface.** No `dangerouslySetInnerHTML` added (static-page-body stays escaped-children only). No server action, RPC, query, or validation touched. Honeypot offsets frozen (AC-8). Form server-side re-validation boundary unchanged. This is a class/token restyle; the security stage runs lightweight (ui-only).

## Implementation Recommendations

### Suggested Order of Implementation

1. **Shared leaf components first** (`product-card`, `index-tile`, `category-tree`, `brand-logo`, `stock-badge`, `grade-badge`, `Hero`, `quote-form`, `static-page-body`) — because they ripple to many pages; getting them right once resolves the bulk of the surface. Verify each against its homepage precedent.
2. **`Button` CTA swaps** (`add-to-cart-button`, cart/checkout/empty-state/contact/qa submits) — mechanical `variant`/`size` changes; batch them.
3. **Catalog + taxonomy pages/chrome** (`sillas`, taxonomy `<h1>`s, filter-panel/sheet/controls, no-results/empty-state, banner, pagination) — depends on step 1's `product-card`/`index-tile`.
4. **PDP surfaces** (purchase-panel, gallery, specs, qa, recently-viewed, skeleton) — depends on step 1 (`product-card` in recently-viewed) + step 2 (add-to-cart).
5. **Cart + checkout** (page-client, line-row, summaries, fields, payment-panel, confirmation) — the `.factorial-card` + CTA cluster; KEEP semantic tints.
6. **/empresas + b2b-sections** — depends on step 1 (`Hero`, `quote-form`).
7. **Static + error pages** — depends on step 1 (`static-page-body`) + step 2 (contact submit); smallest surface, do last.
8. **`headingSerif` retirement** (`fonts.ts`, `layout.tsx`, globals comments) — last, after confirming no storefront heading needs it (it doesn't).
9. **DESIGN.md T21 note + test updates** — final housekeeping.

### Key Decisions

- **D-1 — Retire `headingSerif` (Libre Caslon):** REMOVE it (`fonts.ts` + `layout.tsx` + globals comments). Rationale: T20's `--font-heading-family` rebind already resolves all storefront headings to DM Sans, so Libre Caslon renders nowhere; it was kept alive ONLY pending this /empresas decision, and /empresas is now getting DM Sans like everything else. Grep-verified no other consumer. Zero-risk fallback (leave exported-but-unwired) documented if the reviewer objects.
- **D-2 — Interior page vertical rhythm:** KEEP the existing interior page-shell padding (`py-8 md:py-10`, 32/40px) rather than importing the homepage's `py-10 sm:py-16 lg:py-28` (40/64/112px) band family. Rationale: interior pages are utility surfaces (catalog grids, forms, policy prose), not a marketing homepage; the homepage's 112px sections would make dense catalog/checkout pages feel sparse and reflow the shared shell. The Factorial "white page + tinted objects + hairlines" reads correctly at the tighter interior rhythm. The `/empresas` page (a marketing surface) MAY keep its slightly larger `py-16 md:py-24` hero section — it is closest to a landing page.
- **D-3 — Two gradient moments stay homepage-only:** `.gradient-band`/`.gradient-banner` are NOT rolled onto interior pages (AC-7). They are the homepage's two signature punctuation moments; scattering them dilutes the "exactly twice" discipline from the Factorial analysis.
- **D-4 — Badges & progress bars stay `rounded-full`:** `stock-badge`, `grade-badge`, `cart-count-pill`, and the free-shipping progress bar keep `rounded-full` — they are pill/bar primitives, consistent with the "everything is a pill" rule; only their border-as-chrome is cleaned up.
- **D-5 — Discount Apply button is NOT orange:** orange `cta` is reserved for the single primary action per view (checkout submit / add-to-cart / quote submit). The discount "Apply" is a secondary utility → `.pill-outline`/quiet. This preserves the T20 "loud color rationed, ≤5 CTAs/screen" rule.

### Anti-Patterns to Avoid

- **Don't** remove ALL `uppercase` blindly — the discount-code input value depends on it (edge 1). Classify each hit as eyebrow (remove) vs functional (keep).
- **Don't** fork `product-card`/`index-tile`/`Hero`/`quote-form` per page — restyle centrally (CLAUDE.md DRY; T21 mandate). A per-page copy is the exact mistake this task exists to prevent.
- **Don't** turn semantic status cards (error/warning/success) into `.factorial-card` — that erases a signal. Chrome → `.factorial-card`; signal → keep the tint+border (edge 6).
- **Don't** add hardcoded hex/oklch — route every color through an existing token (AC-2). If a value seems to need a new hex, it's wrong; find the token.
- **Don't** touch the render mode, RPCs, server actions, honeypots, or column counts — they are frozen (AC-8) and pinned by e2e tests. A restyle that changes behavior is a bug.
- **Don't** add scroll-reveals, marquees, or new keyframes — T20 already decided motion is restrained; interior pages get none of it.
- **Don't** touch `/admin`, root `not-found.tsx`, or `global-error.tsx` — firewall + deliberate exclusions (AC-1, AC-ERR-2).
