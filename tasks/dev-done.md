# Dev Summary: T20 — Factorial design grammar (Phase A: homepage + shared shell)

Feature type: **full-feature** (UI-heavy; token/font-layer logic + presentation).
Translates the Factorial (factorialhr.com / factorial-it) design grammar onto the
storefront in PosturPro's brand palette — for the homepage and the shared shell
(header / topbar / footer / mobile-nav). Brand hex/oklch + logo are preserved
verbatim (T19 palette contract). The `/admin` firewall is intact.

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `src/app/fonts.ts` | modified | Added `DM_Sans` (next/font, weights 400/500/600/700, latin+latin-ext) exported as `dmSans` bound to a NEW CSS var `--font-dm-sans` (NOT `--font-sans` — admin firewall). `headingSerif` (Libre Caslon Text) kept for the shared Hero on /empresas (Phase B). |
| `src/app/[locale]/layout.tsx` | modified | Inject `dmSans.variable` onto the storefront `<html>` alongside `sans`/`headingSerif`, so `--font-dm-sans` resolves only under the storefront tree. |
| `src/app/globals.css` | modified | `.theme-storefront` re-grounded to the Factorial grammar: `--background` → pure white; softer neutral `--border`/`--muted`/`--muted-foreground`; `--radius` 0.375→1rem; `--shadow-color` → neutral-green low-alpha; `--font-heading-family` rebind serif → DM Sans (storefront scope only). New primitives: `--shadow-factorial` (layered triple soft shadow), `--tint-green`/`--tint-orange` (8–12% pastel canvases), `--gradient-factorial` (the single reusable 50%-opacity gradient). Imports `theme-storefront.css`. |
| `src/app/theme-storefront.css` | created | Storefront-scoped presentation recipes: DM Sans body-face override (firewall), `.factorial-card` (radius-16 white floating card), `.stat-card` (flat gray/tint), `.pill-outline` (2px ink-outline secondary, 100ms color-swap hover, reduced-motion-safe), `.gradient-band` / `.gradient-banner`. |
| `src/components/ui/button.tsx` | modified | Base hover `transition-all`→`transition-colors` (name exact props; no layout/transform on hover). `cta` variant → orange pill: `rounded-full` + 2px self-color border, no shadow. `xl` size → Factorial large pill (h-12, `rounded-full`, px-8, text-base/600). |
| `src/app/[locale]/page.tsx` | modified | `Section` helper: dropped `bg` prop (no alternating backgrounds — AC-7); pure-white default + `surface="gradient-band"` for the calculator only; Factorial vertical rhythm (py-10/16/28, band py-8/10). All 13 call sites updated. Calculator header restyled (sentence-case eyebrow, tight ink h2). |
| `src/components/layout/site-header.tsx` | modified | Nav links → pill hover (`rounded-full`, `hover:bg-muted`), 16/500 ink. |
| `src/components/layout/site-topbar.tsx` | modified | Message list tightened tracking (`-0.02em`); deep-green bar retained. |
| `src/components/layout/site-footer.tsx` | modified | Deep-green footer → WHITE Factorial footer: hairline top border, no shadow; ink wordmark; 16/600 column titles; 500-weight muted links w/ hover underline; muted bottom bar. All `primary-foreground` on-green classes removed; doc comments updated. |
| `src/components/layout/mobile-nav.tsx` | modified | Drawer title sentence-case 18/600; nav items + cart link → 18px pill hover. |
| `src/components/home/home-hero.tsx` | modified | Eyebrow no longer rendered (headline-first); big tight ink headline; 16 soft-ink subcopy; secondary CTA → `pill-outline`; media = white floating card on a whisper-green tint canvas. |
| `src/components/home/hero-stats.tsx` | modified | Naked oversized numerals (text-4xl/5xl, 700, -0.04em, ink). |
| `src/components/home/cert-tag.tsx` | modified | Borderless white label-pill (`rounded-2xl`, `--shadow-factorial`), sentence-case meta. |
| `src/components/home/brand-bar.tsx` | modified | 24/700 tight claim line; 16/500 brand names. |
| `src/components/home/values-impact.tsx` | modified | Sentence-case eyebrow; section-h2 recipe; `.factorial-card` cards w/ tint-green icon tile; impact figures → `.stat-card` naked numerals. |
| `src/components/home/process-steps.tsx` | modified | Section-h2; larger ghost step numbers; 18/600 titles; 16 body. |
| `src/components/home/b2b-section.tsx` | modified | Sentence-case eyebrow; section-h2; 16 body; brand-green (`--ring`) check icons; 3xl stats; `.factorial-card` form container. |
| `src/components/home/social-proof.tsx` | modified | Section-h2; `.factorial-card` testimonials; big light 20/24 quote. |
| `src/components/home/savings-calculator.tsx` | modified | `.factorial-card` container; larger result numeral (ink). |
| `src/components/home/trust-faq.tsx` | modified | Sentence-case eyebrow; section-h2; brand-green guarantee checks; 16 guarantee body; 18/600 FAQ eyebrow. |
| `src/components/home/faq-accordion.tsx` | modified | Bare hairline rows (top border on wrapper so first row is bounded); 18/600 summary; 16 answer. |
| `src/components/home/cta-banner.tsx` | modified | Deep-green band → radius-32 gradient banner (2nd gradient moment); ink text; `pill-outline` secondary; removed white focus-ring overrides (green ring reads on pastel). |
| `src/components/home/section-header.tsx` | modified | Section-h2 recipe; "see all" link → brand-green, 16. |
| `DESIGN.md` | modified | Prepended T20 amendment (Factorial grammar supersedes the visual world for homepage+shell; palette/logo unchanged). Seed comment + T19 amendment preserved. |

## Data-Testids Added
None added or removed. All existing testids preserved (`site-footer`,
`footer-wordmark`, `footer-whatsapp-text`, `hero-cta-catalog`,
`hero-cta-business`, `hero-image-fallback`, `hero-cert-tag`, `savings-calculator`,
`faq-accordion`, `faq-item-*`, `cta-banner`, `cta-banner-catalog`,
`cta-banner-business`, section-header link testids). No test churn.

## Key Decisions
- **New `--font-dm-sans` var, not reusing `--font-sans`**: keeps admin on Inter.
  The storefront body-face override is scoped under `.theme-storefront`; admin
  `<html>` never receives `dmSans.variable`, so `var(--font-dm-sans)` is
  undefined there and `.font-sans` falls back to the `:root` Inter default.
- **`transition-colors` (not `transition-all`) on Button base**: Emil — name the
  exact animated properties; never animate layout/transform on hover. Press
  feedback stays via `active:translate-y-px` / `.cta-press`.
- **Separation via rhythm + tinted objects, never section backgrounds** (AC-7):
  page is uniformly white; the only non-white surfaces are the two gradient
  moments (calculator band + CTA banner).
- **Class-direct `.factorial-card`/`.stat-card` instead of a wrapper component**:
  each section applies the recipe class directly (spec explicitly allows this
  where the wrapper isn't reused). See Deviations.
- **Brand green `--ring` for check/link accents**: the palette's identity green
  (#0f7f3c) is the accent; orange stays reserved for primary CTAs only.

## Deviations from Ticket
- **`factorial-card.tsx` component not created.** The spec listed it as a DRY
  primitive but also stated a raw `<div className="factorial-card p-6">` is
  acceptable where the wrapper isn't reused. Sections apply the class directly
  (matching the per-section spec rows, which specify class strings). Adding an
  unused export would violate the repo's no-dead-code rule. Impact: none — the
  `.factorial-card` / `.stat-card` recipes live in `theme-storefront.css` as the
  single source of truth, so DRY is preserved at the CSS layer.
- **`eyebrow` prop retained on `HomeHero` but not rendered.** Factorial is
  headline-first (AC-3). Keeping the prop avoids touching `page.tsx`'s call site
  and the i18n key; it is intentionally unused in the body (documented in-code).

## Edge Cases Handled
- **DB unreachable at build/runtime (edge 4)**: homepage still builds and renders;
  featured-products section self-omits (existing `readFeaturedProducts` → `[]`).
  Confirmed in the offline production build (133/133 pages, exit 0) — the
  `TypeError: fetch failed` catalog logs are the designed degradation, not a
  regression.
- **WhatsApp unconfigured (edge 5)**: footer contact line stays plain text
  (`footer-whatsapp-text`), never a broken `wa.me//` — logic untouched by the
  white-footer restyle.
- **Reduced motion**: `.pill-outline` hover transition is disabled under
  `prefers-reduced-motion: reduce`; existing `.enter-fade`/`.stagger`/`.fab-pop`/
  `.drawer-*` reduced-motion handling retained. No new keyframes, no scroll
  listeners.
- **AA contrast**: ink on white, muted on white, and ink over the lightest
  gradient stop all clear AA (per ui-design.md A.6). CTA keeps warm-brown fg
  (5.30:1); white-on-orange (fails) is never used.
- **First FAQ row bounding**: top hairline on the accordion wrapper so the first
  row has a top border, not just a bottom one.

## How to Test
1. `npm run build && PORT=3100 npm run start`, open `http://localhost:3100/`.
2. Confirm a pure-white page with no alternating section bands; separation reads
   from spacing + tinted cards. Only the calculator + closing CTA show a gradient.
3. Confirm the headline is a big tight DM Sans sans-serif (no serif, no eyebrow);
   stats are large naked numerals.
4. Confirm every button/nav item is a pill; the orange CTA is orange-only,
   secondary CTAs are 2px ink-outline pills that tint on hover (100ms).
5. Confirm the footer is WHITE with hairline separation.
6. Resize to 375px: single-column, full-width pills, no horizontal overflow.
7. Firewall: open `http://localhost:3100/admin/login` — it stays Inter,
   `rounded-md`, neutral tokens (verified: admin `<html>` has no `dm_sans`
   variable and admin `<body>` has no `theme-storefront`).

## Verification Gates
- **tsc --noEmit**: PASS (exit 0).
- **eslint** (all touched files): PASS (0 warnings/errors).
- **vitest run**: PASS — 132 files / 2175 tests (incl. css-line-count and
  direction-contract suites).
- **npm run build**: PASS — exit 0, 133/133 static pages, no prerender failures.
  (Offline `fetch failed` catalog logs = designed DB-unreachable degradation.)
- **File-size caps**: globals.css 321 lines, theme-storefront.css 75 lines — both
  well under limits.
- **Admin firewall evidence** (served HTML, `localhost:3100`):
  - Homepage `<html>` classes: `inter…variable libre_caslon…variable dm_sans…variable`; `<body>`: `theme-storefront …`. Computed body+h1 `font-family` = `"DM Sans", …` (serif gone).
  - Admin `<html>` classes: `inter…variable` ONLY; `<body>`: no `theme-storefront`. So `--font-dm-sans` is undefined in admin → `.font-sans` resolves Inter.
- **Screenshots** (`scratchpad/t20-preview/`): `home-desktop-1440.png`,
  `home-mobile-375.png`, `home-en-desktop-1440.png` — all render the Factorial
  grammar correctly.

## Known Limitations
- **Admin route not screenshot via Playwright**: `/admin/login` hangs Playwright
  navigation in the offline headless context (client/server auth path awaits the
  unreachable DB); curl returns 200 with the correct classes. Firewall verified
  by served-HTML class inspection + computed-font check instead of an admin PNG.
- **Phase B (store-wide rollout of the Factorial grammar to catalog/product/
  empresas pages) is out of scope** and gated on approval, per the ticket. The
  shared `Hero` and Libre Caslon Text remain wired for /empresas.

## Dependencies Added
- None. `DM_Sans` ships with the already-installed `next/font/google`.
