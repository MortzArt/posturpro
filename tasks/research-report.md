# Research Report: T20 — Storefront restyle in the Factorial design language (Phase A)

Single-pass codebase scan (2026-08-27). Style source: `tasks/reference/factorial-style-analysis.md`. Owner decisions: `tasks/reference/T20-brief.md`. This is a **presentation-layer** restyle of the homepage + shared shell only; all T19 content/data/copy/SEO is frozen.

## Codebase Analysis

### Existing Patterns

- **Two-world token firewall** — `src/app/globals.css`. The neutral `:root` (+ `.dark`) block is the **admin world**; the `.theme-storefront` block (applied on the storefront `<body>` in `src/app/[locale]/layout.tsx:108`) is the **storefront world**. A storefront rebrand is done by editing ONLY `.theme-storefront` + the font binding — no storefront component hardcodes a color/radius; every value flows through a token utility (`bg-primary`, `text-foreground`, `rounded-md`, `bg-cta`, etc.). **Reuse strategy:** do the entire color-role remap, pure-white ground, pastel tints, gradient, and shadow spec inside `.theme-storefront`. This is the single most important lever — it keeps admin untouched by construction.
- **Font-family resolver seam** — `globals.css:21-25` binds the `font-heading` utility to `--font-heading-family`, which defaults to `--font-sans` (Inter, admin) and is overridden to Libre Caslon Text ONLY under `.theme-storefront` (`globals.css:248-249`). **Reuse strategy:** wire DM Sans the same way — a new `next/font` variable in `fonts.ts`, then rebind `--font-heading-family` (and add a storefront body-font override) inside `.theme-storefront`. Never touch `--font-sans` (shared with admin).
- **shadcn Button via `cva`** — `src/components/ui/button.tsx`. Variants: `default`(green), `outline`, `secondary`(mint), `ghost`, `destructive`, `link`, `cta`(orange, AA dark-brown fg via `--cta`/`--cta-foreground`). Sizes incl. `xl` (h-11, ≥44px). Base radius `rounded-md`. **Reuse strategy:** add pill radius to the storefront-used variants (`cta`, `xl`, and the secondary/outline used on the storefront) or apply `rounded-full` at call sites; keep admin variants on `rounded-md`.
- **Section band helper** — `src/app/[locale]/page.tsx:263-285` (`Section`): toggles `bg-muted`/`bg-background` and `py-14 md:py-20`, wraps the shared `CONTAINER` (`mx-auto max-w-(--breakpoint-xl) px-4 md:px-6 lg:px-8`). **Reuse strategy:** collapse to pure-white, apply Factorial rhythm here once; every section inherits it.
- **CSS-only accordion** — `faq-accordion.tsx` uses native `<details>/<summary>` + `.faq-chevron` rotate (CSP-safe, zero JS). **Reuse strategy:** keep the mechanism; restyle to hairline rows (border-b, remove card, chevron rotate).
- **Motion layer** — `motion-shell.css` / `motion-catalog.css` / `motion-cart.css` (imported at top of `globals.css`), consuming `--ease-*` tokens. Classes in scope: `.enter-fade`, `.stagger`, `.card-lift`, `.fab-pop`, `.drawer-panel/.drawer-scrim`, `.link-arrow`, `.calc-bar-fill`, `.price-value`, `.toggle-*`. All reduced-motion-safe. **Reuse strategy:** keep; Factorial adds NO scroll reveals, so do not add new entrance motion (design stage decides whether to keep or trim existing subtle entrances).
- **Icon set** — `@hugeicons/react` + `@hugeicons/core-free-icons` everywhere in home/shell (CLAUDE.md-mandated). Do not introduce lucide or swap sets.

### Relevant Files

| File | Purpose | Relevance | Action |
| --- | --- | --- | --- |
| `src/app/globals.css` (~290 ln) | Token worlds, firewall, font seam | Central lever for color/font/shadow/radius/gradient | **Modify** (`.theme-storefront` only) |
| `src/app/fonts.ts` | next/font wiring (Inter + Libre Caslon) | Add DM Sans variable | **Modify** |
| `src/app/[locale]/layout.tsx` | Storefront shell, `<html>` font vars, `theme-storefront` body | Add DM Sans var to `<html>` | **Modify** |
| `src/app/admin/layout.tsx` | Admin root, imports `sans` (Inter) | Firewall boundary — must NOT change | **Reference (do not touch)** |
| `src/app/[locale]/page.tsx` | Homepage composition + `Section` helper | Pure-white ground + rhythm | **Modify** |
| `src/components/ui/button.tsx` | Button `cva` (incl. `cta`, `xl`) | Pill grammar | **Modify** |
| `src/components/home/home-hero.tsx` (100) | Hero | Factorial centered hero, pill CTAs | **Modify** |
| `src/components/home/hero-stats.tsx` (34) | 3-figure stat row | Oversized naked numerals | **Modify** |
| `src/components/home/cert-tag.tsx` (41) | Cert overlay badge (`uppercase`) | Remove uppercase, restyle | **Modify** |
| `src/components/home/brand-bar.tsx` (42) | Trust strip | Factorial logo-bar/marquee feel | **Modify** |
| `src/components/home/values-impact.tsx` (108) | Value cards + impact figures (`uppercase`) | Cards + naked figures | **Modify** |
| `src/components/home/process-steps.tsx` (65) | 4 numbered steps (`uppercase`) | Numbers + rhythm | **Modify** |
| `src/components/home/b2b-section.tsx` (150) | B2B pitch + T16 QuoteForm embed | Restyle pitch; QuoteForm shared w/ /empresas | **Modify (careful)** |
| `src/components/home/social-proof.tsx` (68) | Testimonial cards | Factorial testimonial cards | **Modify** |
| `src/components/home/savings-calculator.tsx` (162, client) | Model select + savings bars | Form/pill styling; **math frozen** | **Modify (style only)** |
| `src/components/home/trust-faq.tsx` (72) | Guarantees + FAQ (`uppercase`) | Hairline FAQ | **Modify** |
| `src/components/home/faq-accordion.tsx` (50) | Native details accordion | Hairline rows | **Modify** |
| `src/components/home/cta-banner.tsx` (53) | Closing green band | Factorial radius-32 gradient banner | **Modify** |
| `src/components/home/section-header.tsx` (45) | "{heading} Ver todas →" | **Shared** w/ featured-brands | **Modify (careful)** |
| `src/components/home/featured-products.tsx` (40) | Wraps `ProductGrid` | Section wrapper only | **Modify (wrapper only)** |
| `src/components/layout/site-header.tsx` (137) | Sticky nav | White hairline + pill CTA | **Modify** |
| `src/components/layout/site-topbar.tsx` (52) | Deep-green utility row | Restyle | **Modify** |
| `src/components/layout/site-footer.tsx` (252) | Deep-green footer | White Factorial footer (content frozen) | **Modify** |
| `src/components/layout/mobile-nav.tsx` (323, client) | Drawer (focus-trap, scroll-lock) | Restyle; behavior/a11y frozen | **Modify (style only)** |
| `src/components/layout/whatsapp-button.tsx` (62) | WhatsApp FAB | Keep; align grammar | **Modify (light)** |
| `src/components/layout/language-toggle.tsx` (122, client) | Locale toggle | Light restyle; behavior frozen | **Modify (light)** |
| `src/components/layout/nav-items.ts` | Nav data | Data only | **Reference** |
| `src/components/layout/direction-contract.tsx` (41) | Comment-only invariant | Zero visual footprint | **Reference** |
| `src/components/catalog/product-card.tsx` (132) | Product card | **Shared w/ catalog — DO NOT restyle** | **Reference (Phase B)** |
| `src/components/catalog/product-grid.tsx` | Grid + stagger | Shared w/ catalog | **Reference (Phase B)** |
| `src/components/home/hero.tsx`, `featured-brands.tsx` | Used by `/empresas`, `/marcas` | Not the homepage — do not restyle for those pages | **Reference (Phase B)** |
| `src/app/css-line-count.test.ts` | CSS ≤600/1000 guard | Constrains globals.css growth | **Reference (must stay green)** |

### Data Flow

Restyle is presentation-only; the data flow is unchanged from T19 and is documented only to prove nothing in it is touched:

`HomePage` (server, `page.tsx`) `Promise.all([getTranslations("home"), readFeaturedProducts(), buildHomeJsonLd()])` → passes resolved strings + `CatalogProductCard[]` as props into each `home/*` section → sections render tokens/utilities → browser resolves `.theme-storefront` CSS vars. `readFeaturedProducts()` degrades to `[]` on catalog failure → featured section returns `null`. `generateMetadata` + `JsonLd` emit SEO verbatim. **T20 changes only the class/token layer at the leaf render step and the token definitions in `globals.css`; no function call, prop, query, or metadata path changes.**

### Similar Features (Reference Implementations)

- **T15 "Casa de Azulejo" re-skin** — the whole `.theme-storefront` block + the `--font-heading-family` resolver + `fonts.ts` Libre Caslon wiring is the exact precedent for T20: a scoped re-skin that left admin untouched. Key patterns to follow: scope every new value to `.theme-storefront`; wire the new font as a resolver-overridden variable; document the seam in the CSS comment.
- **T19 CTA orange** — `--cta`/`--cta-foreground` (dark warm-brown, AA 5.30:1) + the Button `cta` variant is the model for "loud color only on CTAs with an AA-safe foreground." The pill restyle keeps these exact tokens; only the radius/border grammar changes.
- **Button `cva` variants** — the established way to add a button treatment without editing call sites; extend it for the pill grammar.

## Dependency Analysis

### Existing Dependencies to Leverage

- **`next/font/google`** (bundled with `next`) — already used for Inter + Libre Caslon; `DM_Sans` is a supported loader, no install.
- **`class-variance-authority` + `cn()`** — Button variants + conditional classes (existing).
- **`@hugeicons/react` + `@hugeicons/core-free-icons`** — icon set (existing; keep).
- **Tailwind v4 CSS-first config** — there is **no `tailwind.config.*` file**; all theme config lives in `globals.css` `@theme inline` + `:root`/`.theme-storefront`. New radius/shadow/pastel/gradient tokens are added there.

### New Dependencies Needed

- **None.** `DM_Sans` ships with `next`. No npm install; no new runtime deps.

### Internal Dependencies

- `[locale]/layout.tsx` + `admin/layout.tsx` both depend on `fonts.ts`'s `sans` export → **implication:** adding DM Sans as a new export is safe; rebinding `sans` is NOT (would hit admin).
- `home/featured-products.tsx` depends on `catalog/product-grid.tsx` → `catalog/product-card.tsx`, which `/sillas` + `/marcas/[slug]` also depend on → **implication:** restyling the card leaks to catalog (Phase B) — restyle only the section wrapper/header.
- `home/section-header.tsx` is depended on by both `featured-products.tsx` and `featured-brands.tsx` → **implication:** its restyle must not visually change the `/marcas` featured-brands usage in a page-level way.
- `home/b2b-section.tsx` embeds the T16 QuoteForm shared with `/empresas` → **implication:** restyle the section chrome, not the shared form component, unless the form change is acceptable inherited-shell behavior.
- `home/hero.tsx` + `featured-brands.tsx` are depended on by `/empresas` (NOT the homepage) → **implication:** they are not stale; do not restyle them for Phase A.

## External Research

### API Documentation

- **N/A** — no external APIs. Data wiring is frozen; no network calls added.

### Library Documentation

- **`next/font/google` — `DM_Sans`:** import `{ DM_Sans } from "next/font/google"`; config `{ subsets: ["latin","latin-ext"], weight: ["400","500","600","700"], variable: "--font-dm-sans", display: "swap" }`. DM Sans is a variable font (100–1000) but pinning the four weights keeps the bundle bounded (mirrors the Libre Caslon config). Self-hosted at build time by Next (no external request at runtime — CSP-safe). Fallback stack `"DM Sans", Helvetica, Arial, sans-serif` per the analysis. `display:"swap"` avoids invisible text; keep a metrics-reasonable fallback to bound CLS (AC-24).
- **Tailwind v4 arbitrary values** — tight tracking via `tracking-[-0.04em]`, pill via `rounded-full`, the layered shadow via a custom `--shadow-factorial` token applied through an arbitrary `shadow-[...]` or a small utility. No config file to edit; tokens live in `globals.css`.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| DM Sans leaks into `/admin` (wired on shared `--font-sans`) | Med | High | Wire via a storefront-scoped variable only (reuse the `--font-heading-family` seam); browser-verify `/admin` shows Inter (AC-5). Do not touch `admin/layout.tsx`. |
| Restyling `product-card.tsx`/`section-header.tsx` leaks into catalog/marcas (Phase B) | High | High | Restyle featured section at the wrapper/header level only; leave `product-card.tsx` untouched; verify `/sillas` + `/marcas` unchanged (AC-18). |
| `globals.css` breaches the 600-line guidance ceiling | Med | Med | Extract a small imported CSS file if needed (mirror `motion-*.css`); `css-line-count.test.ts` enforces (AC-23). |
| Pure-white ground removes contrast cues the current mint bands provided; sections blur together | Med | Med | Use Factorial rhythm (~112px) + tinted cards + the two gradient moments for separation; UX review at 320/768/1440. |
| Orange-on-white AA drift when orange is used as text (not fill) | Low | High | Use `--cta-text` (darkened orange) for text; keep white-on-orange banned; orange stays fill-only with dark-brown fg. |
| Font swap causes layout shift | Low | Med | `display:"swap"` + sensible fallback; verify no CLS regression (AC-24). |
| Tight `-0.04em` headings clip long `es-MX` strings at 320px | Med | Med | Responsive size steps (h1 44→36), `latin-ext` subset, wrap testing both locales at 320px (AC-22). |
| Footer flips deep-green→white on every page (shell is global) | Med | Med | Intended shell inheritance; confirm white footer reads on non-home page bodies at UX review (edge 8). |
| Existing behavioral tests break | Low | Low | Home tests are behavioral (brand-bar split, calculator `43%`/`50%`/`aria-live`); the only class-pinning test (`hero.test.tsx` `aspect-[4/3]`) is on the /empresas Hero, out of scope. |

### Performance Considerations

- **Font weight count:** four weights of one family is lighter than today's two families (Inter + Libre Caslon each with subsets). If the design drops Inter from the storefront entirely (DM Sans-only), storefront font payload likely stays flat or shrinks; admin keeps Inter. Net neutral-to-positive.
- **No new JS, no new network calls, no client components added** — homepage stays SSR/ISR. No runtime perf regression expected.

### Security Considerations

- **Admin firewall** is the only security-relevant surface: the font/theme swap must not cross into `/admin`. Enforced by scoping to `.theme-storefront` + not editing `admin/layout.tsx` or `:root` (AC-5/AC-6).
- **CSP:** Next self-hosts Google fonts at build time (no runtime external font fetch), and the calculator bar fill already uses `transform: scaleX()` for CSP-safety — keep any new inline styles CSP-safe (no external URLs, no inline `<style>` beyond existing patterns).
- No inputs, no auth, no data exposure surface touched.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Tokens + fonts first** (`fonts.ts` → `globals.css` `.theme-storefront` → `[locale]/layout.tsx`) — wire DM Sans (scoped), set pure-white ground, add pastel/gradient/shadow/pill-radius tokens. This is the foundation every component consumes; verify the admin firewall (`/admin` = Inter) immediately after. *First because every later step reads these.*
2. **Button pill grammar** (`ui/button.tsx`) — establishes the pill CTA used by hero, banner, header. *Depends on step 1 tokens.*
3. **Page `Section` helper** (`page.tsx`) — pure-white + Factorial rhythm; unblocks correct spacing for all sections. *Depends on step 1.*
4. **Shell** (`site-header`, `site-topbar`, `site-footer`, `mobile-nav`, `whatsapp-button`, `language-toggle`) — the shared frame the homepage renders in; get the white hairline nav/footer + pill CTA right. *Depends on steps 1–2.*
5. **Home sections** in reading order (`home-hero` + `hero-stats` + `cert-tag` → `brand-bar` → `values-impact` → `featured-products` wrapper → `process-steps` → `b2b-section` → `social-proof` → `savings-calculator` → `trust-faq` + `faq-accordion` → `cta-banner` + `section-header`) — apply DM Sans scale, cards/shadows, naked numerals, hairline FAQ, sentence case. *Depend on steps 1–3.*
6. **Cross-cutting sweeps** — remove all `uppercase`; verify anchor IDs + `scroll-mt`; 320px both locales; reduced-motion; AA contrast; `npm run test` + `lint` + `build`. *Last — validates the whole.*

### Key Decisions

- **Font wiring:** recommend rebinding `--font-heading-family` → DM Sans AND adding a storefront body-font override, both inside `.theme-storefront`, so the whole storefront is DM Sans while admin/not-found stay Inter via the `:root` default. (Do not rebind `--font-sans`.)
- **Cards:** recommend a single reusable Factorial-card wrapper (`ui/card.tsx` or `home/factorial-card.tsx`) rather than pasting the triple-shadow into ~6 sections (DRY, CLAUDE.md).
- **Existing entrances (`.enter-fade`/`.stagger`):** recommend KEEPING them — they are subtle, reduced-motion-safe, and don't read as the scroll-reveal spam Factorial avoids; do not add new scroll motion. (Design stage confirms; this is a taste call, either way passes AC-21.)
- **Footer:** the analysis mandates a white footer; recommend following it (deep-green→white) since a green footer contradicts the "white page, tinted objects" principle — flag for owner as a visible change at the approval gate.
- **Featured products:** recommend leaving the product card exactly as-is and restyling only the section header/spacing, to hold the Phase A boundary cleanly.

### Anti-Patterns to Avoid

- Don't wire DM Sans on `--font-sans` because it leaks into `/admin` — instead scope it to `.theme-storefront`.
- Don't edit `product-card.tsx` / `product-grid.tsx` because it leaks into the catalog (Phase B) — instead restyle the homepage featured section wrapper only.
- Don't hardcode hex/oklch/rgb or raw radii in components (breaks the token firewall and the "one seam" rebrand) — instead add tokens to `.theme-storefront` and consume utilities.
- Don't add scroll-triggered reveal animations — Factorial is static on scroll; it would fight the design and the reduced-motion bar.
- Don't restyle `home/hero.tsx` or `featured-brands.tsx` for /empresas/marcas effect — they're not the homepage (Phase B).
- Don't let `globals.css` cross 600 lines — extract a CSS file first (the guard test will fail the build otherwise).
- Don't use white text on orange (3.34:1, fails AA) — keep the dark warm-brown `--cta-foreground`.
