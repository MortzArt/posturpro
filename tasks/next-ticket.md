# Task: T20 — Storefront restyle in the Factorial design language (Phase A: homepage + shared shell)

## Priority

**High** — Owner-requested (recorded 2026-08-27), blocks the Phase B whole-storefront rollout, and gates on owner approval. Not Critical: the storefront is already shipped and functional (T19); this is a presentation upgrade, not a defect fix or launch blocker. But it is the owner's active priority and the single next deliverable, so High.

## Complexity

**medium** — justified against the criteria:

- NOT low: it touches **well more than 5 files** (globals.css tokens + fonts.ts + locale layout + Button primitive + 12 homepage section components + 6 shell components ≈ 20–24 files), and introduces **new design primitives** that don't exist today — a DM Sans wiring, a pill-button grammar, a Factorial radius-16 + layered-triple-shadow card spec, an oversized naked-stat treatment, and hairline FAQ rows.
- NOT high: **no new data models, no new API endpoints, no new integrations, no architectural change, no backend.** Content, copy, i18n, data wiring, SEO/JSON-LD, calculator logic, and the T16 quote embed are all **frozen** (T19). The token-firewall architecture already exists (`.theme-storefront` scope + `--font-heading-family` resolver) and is reused, not rebuilt. Every storefront color already flows through a token utility, so the color-role remap is a scoped token-block edit, not a per-component color sweep.

The higher-than-typical file count is offset because most per-component edits are near-mechanical class swaps against tokens, not new logic. Standard tier (no hacker stage) is the correct routing.

## Feature Type

**ui-only** — styling/presentation changes only. No hooks, state, data-fetching, or business-logic changes. Security & Arch (if run) go lightweight; the **admin font/theme firewall** is the one security-relevant surface and is called out explicitly. **UI Design (Stage 3) and UX (Stage 8) run at full depth** — translating the Factorial grammar into our palette is a visual-craft task; load `impeccable` + `emil-design-eng` + `apple-design` and use `animation-vocabulary` terms in the design spec.

## User Story

As the **store owner**, I want the storefront homepage restyled in the clean, confident Factorial design language (one geometric sans, pure-white page, pill buttons, floating cards on tinted canvases, oversized naked stat numerals, hairline FAQ rows) while keeping my brand greens, orange CTAs, logo, and all existing content, so that I can **review a single homepage** locally and approve the direction before authorizing the full-store Phase B rollout.

## Background

**What exists today (T19, shipped 2026-08-26 — content frozen):**

- Homepage `src/app/[locale]/page.tsx` is a thin server-component shell composing sections from `src/components/home/*`, each fed pre-resolved i18n strings. Sections alternate `bg="background"` / `bg="muted"` bands at `py-14 md:py-20` inside a `max-w-(--breakpoint-xl)` container.
- Headings use the `font-heading` utility → **Libre Caslon Text** (serif, T15 "Casa de Azulejo"), resolved only under `.theme-storefront`. Body/UI uses `font-sans` → **Inter**, which is **SHARED with `/admin`**.
- Surfaces alternate a faint green-tinted "milk-glaze" `--muted` against a slightly-green `--background`. Owner wants a **pure-white page** with tinted *objects* (gray/pastel cards) instead of section tints.
- Buttons are `rounded-md` (shadcn `Button`, `cva` variants incl. a `cta` orange variant and an `xl` ≥44px size). Factorial wants **pills** (`rounded-full`, 2px self-colored border).
- Cards are hand-rolled per component (**no `src/components/ui/card.tsx` primitive exists**) using `rounded-md border-border bg-card p-*`. Factorial wants radius-16 + a layered triple soft-shadow for floating cards, and flat gray/no-shadow stat cards.
- Stats render inline (`hero-stats.tsx`, `values-impact.tsx`, `process-steps.tsx`) with `tabular-nums`; Factorial wants **~56px naked numerals in flat gray cards**.
- FAQ is `faq-accordion.tsx` — a CSS-only native `<details>/<summary>` accordion with a rotating chevron; Factorial wants **bare hairline rows**, no card.
- Icons throughout the homepage + shell are **`@hugeicons/react` (core-free-icons)** — the CLAUDE.md-mandated set. (Do not swap icon sets.)
- Motion: entrance animations exist — `.enter-fade` (hero/banners), `.stagger` (grids/lists), `.card-lift`, `.fab-pop`, `.drawer-*` — defined in `motion-shell.css` / `motion-catalog.css`, all reduced-motion-safe.
- Shell: `site-topbar.tsx` (deep-green utility row) + `site-header.tsx` (sticky, `border-b border-border bg-background`) + `site-footer.tsx` (currently a **deep-green** footer) + `whatsapp-button.tsx` (FAB) + `mobile-nav.tsx` (client drawer, focus-trap + scroll-lock) + `language-toggle.tsx`.

**What's changing (presentation only):** per `tasks/reference/factorial-style-analysis.md` — DM Sans everywhere at 700/−0.04em headings; pure-white page; pill grammar; Factorial card/shadow specs; the ~112px/40px section-rhythm family; oversized stat numerals; hairline FAQ; Factorial nav/footer patterns. Color roles remap: Factorial red→our orange `#f95326`; its ink→our deep green `#094220`; its teal links→our green `#0f7f3c`; its pastel tints→8–12% tints of our greens/orange; its twice-used peach→aqua gradient→a soft green→warm-tint gradient.

**The firewall constraint (critical):** `--font-sans` (Inter) is imported by BOTH `src/app/[locale]/layout.tsx` (storefront) AND `src/app/admin/layout.tsx` (admin). Swapping the body face on `--font-sans` would leak DM Sans into `/admin`. DM Sans must be wired through a **storefront-scoped variable** (via the existing `.theme-storefront` seam, mirroring how `--font-heading-serif` is scoped today), never `--font-sans`.

**Why it matters:** the owner explicitly wants to see and approve the new look on one page before committing to Phase B — this is the approval gate.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

**Typography**

- [ ] AC-1: DM Sans (via `next/font/google`, weights 400/500/600/700, subsets `latin`+`latin-ext`) is loaded and is the family rendered for **all** homepage + shell text — headings, body, UI, buttons, numbers — verified in browser computed styles on `/es-MX` and `/en`.
- [ ] AC-2: Homepage headings render weight 700, `-0.04em` tracking (≈ `tracking-[-0.04em]`), tight (~1.1) leading; body renders weight 400, `1.5` leading, `0` tracking, in the secondary-ink color (not heading ink); small/utility text uses `-0.02em`.
- [ ] AC-3: No uppercase eyebrows / no `uppercase` transforms remain on homepage headings, eyebrow labels, footer column titles, or stat labels (Factorial is sentence case, headline-first). The current `uppercase` usages (cert-tag, values-impact, process-steps, b2b, trust-faq, footer, mobile-nav headers) are removed or converted to sentence case.
- [ ] AC-4: Libre Caslon Text no longer renders anywhere on the homepage or shared shell.

**Firewall (admin isolation)**

- [ ] AC-5: `/admin` and `/admin/login` render **Inter unchanged** — DM Sans does NOT appear in admin computed styles (verified in a browser on an admin route, not just by code read).
- [ ] AC-6: `/admin` colors, radius, and layout are unchanged: no diff under `src/app/admin/**`, and the neutral `:root`/`.dark` token blocks are not edited in any way that reaches admin.

**Surfaces & color**

- [ ] AC-7: The homepage page background is **pure white**; sections do NOT alternate full-bleed backgrounds. Separation comes from vertical rhythm + tinted *objects* (gray/pastel cards) and, at most, the two Factorial gradient moments (form band + radius-32 CTA banner).
- [ ] AC-8: Brand palette preserved: deep green `#094220`, brand green `#0f7f3c`, CTA orange `#f95326` with its dark warm-brown AA foreground (`--cta-foreground`, 5.30:1). Logo files (`public/brand/logo.svg`, `icon.svg`) unchanged.
- [ ] AC-9: The loud saturated color (orange) appears ONLY on primary CTAs (≈ ≤5 per screen); the calm secondary (green `#0f7f3c`) carries links/checks; everything else is ink + white + whisper-tints.

**Components**

- [ ] AC-10: All homepage buttons and the header CTA are pills (`rounded-full`); primary CTA = solid orange + 2px self-colored border + dark-brown text; secondary = 2px ink-outline transparent; hover swaps to a lighter tint via a ~`.1s ease` color transition (no scale/lift on hover). The `cta` and `xl` Button variants render as pills on the storefront without changing admin button radius.
- [ ] AC-11: Floating content cards use radius 16 (12 for small info cards) + the layered triple soft shadow (`0 -8px 16px / 0 16px 24px / 0 4px 8px`, green-tinted via `--shadow-color`), no border; flat stat/canvas cards use gray/whisper-green, no shadow, no border.
- [ ] AC-12: Stat numerals render oversized (~56/64, weight 700, −0.04em) as naked numbers in flat gray cards (hero stats, values-impact figures, process-step numbers per the analysis).
- [ ] AC-13: FAQ renders as bare hairline-separated rows (1px bottom border, no card), question 18/600 ink, chevron rotates on open, answer 16/400 gray. The native `<details>/<summary>` behavior, deep-link slug IDs, and keyboard/focus a11y are preserved.
- [ ] AC-14: Section vertical rhythm follows the Factorial scale (~112px desktop / ~40px mobile band family), applied consistently via the page `Section` helper.

**Shell**

- [ ] AC-15: Header is a white sticky bar with a 1px bottom hairline (no drop shadow), sentence-case 500-weight nav links, and a solid orange pill CTA on the right. Footer follows the Factorial pattern (**white**, hairline-separated, column titles 600 / links 500, hover underline) with **content unchanged** — note this changes the footer from deep-green to white (design-stage decision to confirm, but the analysis mandates a white footer). Topbar utility row retains its content. WhatsApp float retained.
- [ ] AC-16: Mobile nav still opens/closes, traps focus, scroll-locks, auto-closes at `lg`, and is keyboard-operable exactly as before; only its visual styling is updated. `language-toggle` behavior unchanged.

**Content & wiring frozen**

- [ ] AC-17: All T19 copy (both locales), i18n keys, real-product wiring, grade badges, the T16 quote-form embed (in `b2b-section`), the savings-calculator logic/results (test pins `43%`/`50%`/`aria-live`), placeholder figures + disclaimers, and SEO/JSON-LD (`generateMetadata`, Organization + WebSite LD, canonical/alternates) are unchanged and still render/function.
- [ ] AC-18: The shared catalog `product-card.tsx` / `product-grid.tsx` (used by the homepage "Featured products" section AND by `/sillas` + `/marcas/[slug]`) is **not** restyled — the catalog pages' appearance is unchanged. Any homepage featured-section treatment is achieved via the section wrapper/header only, leaving the card as-is.
- [ ] AC-19: Deep-link anchor IDs are preserved: `#catalogo`, `#calculadora` (page), and the section IDs used by nav/footer/anchors (`#proceso`, `#impacto`, `#garantia`, `#empresas`, `#cotizacion`) still resolve with correct `scroll-mt` offset under the restyled sticky header.

**Quality bars**

- [ ] AC-20: AA contrast holds for every text/background and every pill (orange pills keep the dark-brown foreground; no white-on-orange). New pastel tints (8–12%) keep overlaid text AA.
- [ ] AC-21: `prefers-reduced-motion` respected. Per the analysis Factorial has NO scroll-triggered reveals — the design stage decides whether to keep the existing `.enter-fade`/`.stagger` entrances (acceptable, they are subtle + reduced-motion-safe) or reduce them; either way NO new scroll-reveal motion is added, hover transitions stay ≤ ~.15s `ease-out` and interruptible.
- [ ] AC-22: Layout intact and usable at **320px** and up, in both `es-MX` and `en` (longer Spanish strings + accented glyphs do not clip, overflow, or force horizontal scroll).
- [ ] AC-23: `npm run test` passes (existing suites green). `src/app/css-line-count.test.ts` passes — no `.css` file exceeds 600 (guidance) / 1000 (hard cap). Strict TS: no `any`, no non-null `!`. `npm run lint` clean. No file exceeds the ~400-line target introduced by this task; the 1000-line hard cap is not breached (`b2b-section` 150, `mobile-nav` 323, `site-footer` 252 are the largest touched — keep them under the caps).
- [ ] AC-24: No layout-shift regression from the font swap (`display:"swap"`, sensible fallback stack).
- [ ] AC-25: Homepage `npm run build` succeeds and runs locally for owner review — ending Phase A at the approval gate.

## Edge Cases

At least 5 that MUST be handled:

1. **Font leak into admin.** Wiring DM Sans on `--font-sans` (the shared variable) silently restyles `/admin`. Expected: DM Sans wired via a storefront-scoped variable only; admin computed styles still show Inter (verify in browser on `/admin`).
2. **Featured-products card is shared with catalog.** `home/featured-products.tsx` → `catalog/product-grid.tsx` → `catalog/product-card.tsx`, also used by `/sillas` and `/marcas/[slug]`. Expected: do NOT edit `product-card.tsx` presentation; style at the section/header level only, so the catalog page (Phase B) is visibly unchanged.
3. **Other shared components leak to non-home pages.** `section-header.tsx` (also used by `featured-brands`), `featured-brands.tsx` (→ `/marcas` index via `IndexTile`), and the `b2b-section` QuoteForm (shared with `/empresas`), plus `home/hero.tsx` + `home/featured-brands.tsx` (imported by `/empresas`). Expected: do not page-level restyle these for non-home effect; changes limited to what the homepage needs, and any inherited shell/token change to other pages is acceptable but NOT a page-level restyle (Phase B).
4. **Featured-products section omitted when zero products.** The page returns `null` for that section when the catalog read fails (`readFeaturedProducts` → `[]`). Expected: restyled rhythm/spacing looks correct with the section absent.
5. **`es-MX` longer strings + accented glyphs.** Spanish headings are longer and use `á é í ó ú ñ ¿ ¡`. Expected: DM Sans `latin`+`latin-ext` subsets prevent mid-word fallback; tight `-0.04em` headings do not clip/overflow at 320px in either locale; the mobile type scale steps down (h1 44→36 per analysis).
6. **CSS line-count cap.** globals.css is ~290 lines today; adding DM Sans binding + pill/shadow/spacing/pastel/gradient tokens must stay under the 600 guidance ceiling (hard cap 1000, enforced by `css-line-count.test.ts`). Expected: if additions approach the ceiling, extract a small imported CSS file (mirroring the `motion-*.css` split) rather than breaching.
7. **Reduced-motion + no new scroll reveals.** Expected: no entrance-on-scroll motion added; existing entrances stay reduced-motion-safe; pill/hover transitions ≤ ~.15s `ease-out`, interruptible, disabled under `prefers-reduced-motion`.
8. **Footer color change ripples to every page.** The footer currently is deep-green on all pages; switching it to a white Factorial footer changes every storefront page's footer immediately (it is the shared shell, in scope). Expected: this is acceptable/expected shell inheritance — confirm the white footer reads correctly against every existing page body, not just the homepage, at design/UX review.

## Error States Table

Presentation-layer task — "errors" are build/style/regression failures, not new runtime user errors (data wiring frozen).

| Trigger | User Sees | System Does |
| --- | --- | --- |
| Featured-products catalog read fails | Homepage renders without the "Featured products" section; rhythm still correct | `readFeaturedProducts` catches, logs a warn, returns `[]`, section returns `null` (unchanged from T19) |
| DM Sans font file fails to load | Fallback stack (`DM Sans, Helvetica, Arial, sans-serif`) renders; no invisible text, minimal CLS | `display:"swap"` shows fallback then swaps |
| `es-MX` heading overflows at 320px | Text wraps cleanly within container, no horizontal scroll | Responsive type scale + container padding; tracking kept, size steps down on mobile (h1 44→36) |
| Contrast regression on a new pastel tint | (must not ship) AA failure | Caught at UX/verify contrast check; tints defined at 8–12% keep overlaid text AA |
| CSS file exceeds 600 lines | (must not ship) test red | `css-line-count.test.ts` fails the build; split the CSS |
| Reduced-motion user | Pills/accordion snap without transition; no entrances | `@media (prefers-reduced-motion: reduce)` zeroes transitions (existing pattern) |
| Font leaks into admin | (must not ship) admin renders DM Sans | Storefront-scoped font variable; caught at firewall AC-5 browser check |

## UX Requirements

For every state the homepage/shell UI can be in:

- **Loading:** Homepage is a server component (SSR/ISR) — no page-level spinner. Only interactive islands are the savings-calculator, mobile-nav, and language-toggle; their existing interaction states are preserved. Fonts use `display:swap` so first paint is never blank.
- **Empty:** If featured products are empty, that section is omitted (no empty grid). All other sections have static content. No new empty states.
- **Error:** No new error UI (data frozen). Font-load failure degrades to the fallback stack; catalog read failure omits the section (existing).
- **Success (default view):** Pure-white page; DM Sans everywhere; oversized tight headings; orange pill CTAs; floating cards with the layered shadow on tinted canvases; naked stat numerals in gray cards; hairline FAQ; white sticky hairline header with orange pill CTA; white hairline footer. User's next actions are the same CTAs (catalog / business / WhatsApp).
- **Mobile (375px, down to 320px):** Left-aligned per Factorial mobile; hero CTAs stack full-width as pills; section padding drops to the ~40px band; header collapses to hamburger + logo + pill CTA (existing mobile-nav, restyled); stat cards stack; FAQ rows full-width. No horizontal scroll at 320px in either locale.
- **Tablet (768px):** Intermediate type scale (analysis md sizes, h1 ~36–40); card grids collapse per breakpoint; container padding `md:px-6`. Sticky header keeps current breakpoint behavior (restyle only).

## Technical Approach

### Files to Create

- **(conditional) a small storefront CSS file** (e.g. `src/app/theme-storefront.css`), imported at the top of `globals.css`, IF the new pill/shadow/spacing/pastel/gradient tokens push `globals.css` toward the 600-line ceiling. Prefer editing `globals.css` in place if it stays comfortably under 600.
- **(optional) `src/components/ui/card.tsx` or `src/components/home/factorial-card.tsx`** — a single reusable Factorial-card wrapper (radius + layered shadow) to avoid copy-pasting the triple-shadow spec across ~6 sections (DRY). Design stage decides; keep < 400 lines.

### Files to Modify

- **`src/app/fonts.ts`** — add `DM_Sans` from `next/font/google` (weights 400/500/600/700, subsets `latin`+`latin-ext`, `display:"swap"`) bound to a NEW variable (e.g. `--font-dm-sans`). Do NOT rebind `--font-sans`.
- **`src/app/globals.css`** — in `.theme-storefront` (scoped) rebind the storefront body + heading families to DM Sans (via `--font-heading-family` and a storefront body-font override); set the storefront `--background` to pure white `oklch(1 0 0)` (removing the green-tinted glaze) while keeping card/muted objects tinted; add pastel-tint tokens (8–12% of our greens/orange), the twice-used gradient token, and a composite Factorial shadow token (or apply the triple shadow in a card utility); confirm/extend `--shadow-color`. Leave neutral `:root`/`.dark` (admin) untouched.
- **`src/app/[locale]/layout.tsx`** — add the DM Sans `variable` to `<html className>`; keep `theme-storefront` on `<body>`. Do NOT touch `src/app/admin/layout.tsx`.
- **`src/components/ui/button.tsx`** — give storefront buttons the pill grammar (add a pill treatment to `cta`/`xl` or apply `rounded-full` at storefront call sites), 2px self-colored border on primary, `.1s`-family color-swap hover, no scale/lift. Preserve AA `cta`/`cta-foreground`. Scope pill radius to storefront usage so admin buttons keep `rounded-md`.
- **`src/app/[locale]/page.tsx`** — update the local `Section` helper: drop `bg="muted"` alternation (pure white), apply Factorial rhythm; keep `id` anchors + `scroll-mt`. Props/content unchanged.
- **Home sections (restyle, props/content frozen):** `home-hero.tsx`, `hero-stats.tsx`, `cert-tag.tsx`, `brand-bar.tsx`, `values-impact.tsx`, `process-steps.tsx`, `b2b-section.tsx`, `social-proof.tsx`, `savings-calculator.tsx` (form/pill styling only; math frozen), `trust-faq.tsx` + `faq-accordion.tsx` (hairline rows), `cta-banner.tsx` (Factorial radius-32 gradient banner), `section-header.tsx` (restyle carefully — shared with `featured-brands`; keep its behavior). Apply DM Sans scale, pill CTAs, Factorial cards/shadows/pastel canvases, oversized numerals, sentence case, section rhythm.
- **`featured-products.tsx`** — restyle the section wrapper/header ONLY; do NOT touch the shared `product-card.tsx`/`product-grid.tsx`.
- **Shell:** `site-header.tsx` (white hairline sticky, pill CTA, 500-weight sentence-case links), `site-topbar.tsx` (utility-row styling), `site-footer.tsx` (Factorial white column/hairline pattern, content unchanged), `mobile-nav.tsx` (restyle only; behavior/a11y frozen), `whatsapp-button.tsx` (keep FAB; align to round grammar). `nav-items.ts` and `direction-contract.tsx` unchanged (data/logic).

### Data Model Changes

- **None.** No schema, no migration.

### API Endpoints

- **None.** No route handlers touched; SEO generators unchanged.

### Dependencies

- **`next/font/google` → `DM_Sans`** — available via the installed `next` package; no new npm install. Weights 400/500/600/700, subsets `latin`+`latin-ext`. No other new dependencies. Icons stay `@hugeicons/react` (do not add/swap icon sets).

## Out of Scope

- **Any page-level restyle of non-home storefront pages** — catalog listing, PDP, cart, checkout, `/empresas`, `/marcas`, static pages, 404/global-error. They inherit the new shell/tokens/fonts (expected + acceptable), but their page bodies are Phase B.
- **`src/components/catalog/product-card.tsx` / `product-grid.tsx` presentation** — shared with catalog; do not restyle (would leak to Phase B pages).
- **`src/components/home/hero.tsx` and `featured-brands.tsx` for /empresas or /marcas effect** — used by non-home pages; not restyled for those pages in Phase A.
- **`/admin` (entire `src/app/admin/**`)** — untouched; firewall must hold.
- **Content / copy / i18n / data wiring / SEO / JSON-LD / calculator logic / T16 quote embed** — frozen from T19; presentation only.
- **New icon set (lucide etc.), new scroll-reveal animations, dark mode on storefront** — none (storefront is light-only by identity).
- **Phase B rollout** — separate task, only after explicit owner approval of this Phase A homepage.
