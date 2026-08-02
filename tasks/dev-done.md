# Dev Summary: T15 — Premium visual identity & image-rich refresh ("Casa de Azulejo")

Standard-tier S3 (Dev). The committed cobalt-on-milk-white Mexican azulejo world
(`DESIGN.md`) is implemented across all 11 storefront routes + persistent chrome,
scoped so `/admin` is pixel-untouched. Owner chose **filled** editorial slots →
every designed image slot carries licensed Unsplash photography that still
degrades to a blank cobalt tile if the asset is removed.

## Files Changed

### Created
| Path | Change | Summary |
|------|--------|---------|
| `src/components/layout/direction-contract.tsx` | created | Emits the 5-block direction contract as a REAL HTML comment (`d43cafe8`) via `dangerouslySetInnerHTML` on a hidden wrapper — JSX comments are stripped before render (AC-2). |
| `src/components/home/editorial-band.tsx` | created | Homepage ergonomics band: wide cartouche (16/9→21/9) + cobalt caption bar (doubles as the 8.37:1 AA scrim). Curation claim only — zero fabricated proof (AC-8/9). |
| `src/lib/config/imagery.ts` | created | New `string \| null` slots `EDITORIAL_BAND_IMAGE` / `CATALOG_BANNER_IMAGE`, wired to real `/public` assets; degrade to blank tile when null (AC-8). |
| `public/images/{hero,editorial,catalog}/…` | created | 3 optimized Unsplash photos (≤300 KB, correct aspect). |
| `public/images/SOURCES.md` | created | License traceability — photo id + photographer + profile per file (Unsplash License). |
| `public/images/README.md` | created | Slot system + asset-swap instructions. |

### Modified — tokens / fonts / scope (the seam)
| Path | Change | Summary |
|------|--------|---------|
| `src/app/globals.css` | modified | Neutral `:root`/`.dark` UNTOUCHED (admin's world). NEW `.theme-storefront` block = all cobalt tokens + `--radius .375rem` + semantic/gold/whatsapp/shadow tokens. `@theme inline` registers `success/warning/gold/whatsapp` colors + rebinds `font-heading` → `var(--font-heading-family)` (defaults to sans in `:root`, serif under scope). Motion layer verbatim. Brand-Tokens doc block rewritten to describe the two-world firewall. |
| `src/app/fonts.ts` | modified | Adds `headingSerif = Libre_Caslon_Text` (latin+latin-ext, 400/700, normal+italic). `sans = Inter` kept, subset widened to latin-ext (safe for admin). |
| `src/app/[locale]/layout.tsx` | modified | `.theme-storefront` + `headingSerif.variable` on the storefront `<body>`/`<html>`; `<DirectionContract />` as first body child. |
| `src/lib/config/static-pages.ts` | modified | `HERO_IMAGE` → real `/images/hero/ergonomic-chair.jpg`; showroom map stays `null` (no real address). |
| `src/lib/config.ts` | modified | Re-exports `./config/imagery`. |

### Modified — surface application (~48 files)
Chrome: `layout/{site-header,site-footer,mobile-nav,language-toggle,whatsapp-button}.tsx`.
Homepage: `[locale]/page.tsx`, `home/{hero,section-header}.tsx`.
Catalog (13): `catalog/{product-card,product-grid,catalog-skeleton,index-tile,brand-logo,category-tree,stock-badge,no-results,empty-state,active-filters,filter-panel,filter-controls,filter-sheet}.tsx`.
PDP (8): `product/{product-gallery,product-purchase-panel,product-specs,product-qa,qa-form,recently-viewed,pdp-skeleton,variant-selector}.tsx`.
Cart+Checkout (13): `cart/{free-shipping-progress,order-summary,cart-page-client,cart-empty-state}.tsx`, `checkout/{payment-panel,checkout-summary,oxxo-spei-instructions,discount-code-field,checkout-field,checkout-flow-client,checkout-empty-state}.tsx`, `[locale]/checkout/confirmacion/[token]/page.tsx`.
Static/404/error (5): `content/static-page-body.tsx`, `[locale]/{contacto/contact-form,showroom/page,not-found,error}.tsx`.
i18n: `messages/{es-MX,en}.json` (+`home.editorial.*` in lockstep).
Test (1): `checkout/oxxo-spei-instructions.test.tsx` (asserts new `warning` class).

## Data-Testids Added
- `editorial-band-fallback` — blank-tile fallback glyph in `home/editorial-band.tsx` (only rendered when the slot is `null`).

No existing `data-testid` was renamed or removed.

## Admin firewall — before/after proof (AC-11/12)

| Surface | Result |
|---------|--------|
| `/admin/login` screenshot | **BYTE-IDENTICAL** (sha256 match before vs after). |
| `/admin/settings` screenshot | **Visually identical** — only pixel diff is a live "Preguntas: 2" data-count badge (content, not styling); neutral sidebar, Inter, black button, `0.625rem` inputs unchanged. |
| Token probe (computed) | Admin: `--radius=.625rem`, `--primary=neutral(near-black)`, H1 font=`Inter`. Storefront: `--radius=.375rem`, `--primary=cobalt`, H1 font=`Libre Caslon Text`. |
| File audit | No file under `src/app/admin/`, `src/components/admin/`, or `src/components/ui/*` edited. |

Mechanism: tokens + display font are storefront-scoped under `.theme-storefront`
(applied only on the storefront body); admin resolves the untouched neutral
`:root`. Documented in `globals.css` + `DESIGN.md`.

## Image manifest (AC-9/10)

| File | Slot | Aspect / size | Photographer (Unsplash) |
|------|------|---------------|-------------------------|
| `hero/ergonomic-chair.jpg` | Homepage hero | 4/3 · 154 KB | EFFYDESK |
| `editorial/workspace.jpg` | Homepage editorial band | 16/9 · 295 KB | EFFYDESK |
| `catalog/workspace-banner.jpg` | Catalog index banner | 21/9 · 294 KB | EFFYDESK |

Bright cool-neutral daylight, single chair / workspace, no faces, no text, **no
fabricated proof**. Local `/public` → no `next.config.ts` host added. Every slot
still degrades to a blank cobalt tile if its config constant is set to `null`.

## Acceptance-criteria map

| AC | Status | Where |
|----|--------|-------|
| AC-1 DESIGN.md from built world | PASS | `DESIGN.md` (re-confirmed against build) |
| AC-2 direction contract greppable | PASS | `direction-contract.tsx` → `d43cafe8` in emitted HTML (both locales) |
| AC-3/4 tokens centralized + swap seam | PASS | `.theme-storefront` block; no component hardcodes brand color/radius |
| AC-5 type system + es-MX glyphs | PASS | Libre Caslon Text via next/font, latin-ext; accented headings render in serif |
| AC-6 all surfaces restyled | PASS | ~48 surface files, both locales |
| AC-7 chrome + WhatsApp affordance | PASS | wordmark roman-caps cobalt; FAB `bg-whatsapp` green token |
| AC-8 image-slot system | PASS | `imagery.ts` + editorial band + degrade-to-tile |
| AC-9 licensed imagery, no fake proof | PASS | Unsplash, `SOURCES.md`; editorial copy is an ergonomics claim |
| AC-10 host allow-list | PASS | local `/public`, no host change |
| AC-11/12 admin firewall | PASS | before/after proof above |
| AC-13 WCAG AA + focus rings | PASS | DESIGN.md verified pairings implemented; text-over-image on cobalt scrim |
| AC-14 reduced-motion / Emil motion | PASS | motion layer verbatim; new band uses `.enter-fade` (RM-gated) |
| AC-15 perf: sizes/priority/no CLS | PASS | hero `priority`; band `sizes=100vw` no priority; aspect boxes reserved |
| AC-16 bilingual lockstep | PASS | `home.editorial.*` symmetric (verified) |
| AC-17 money display | PASS | `formatMXN`/`tabular-nums`/compare-at `line-through` untouched |
| AC-18 responsive 320–1280 | PASS | no horizontal overflow at 375/768 (checked) |
| AC-19 test suite green | PASS | tsc/eslint clean; unit 1729/1729; at-risk e2e exit 0 |

## Key Decisions
- **Firewall via `.theme-storefront` scope** over global `:root` swap — the only mechanism that guarantees admin untouched without editing an admin file (AC-11/12).
- **`font-heading` resolves `--font-heading-family`** (a distinct resolver var) rather than self-referencing `--font-heading` in `@theme` — avoids the CSS-var cycle that initially left storefront headings on Inter.
- **Direction contract as a real HTML comment** (via `dangerouslySetInnerHTML` on a hidden `<div>`) because JSX `{/* */}` comments never reach the DOM (AC-2).
- **Filled editorial slots with Unsplash** (owner decision) over blank tiles, while keeping the null-degrade path intact so the swap seam and graceful degradation both hold.
- **Semantic colors promoted to `--warning`/`--success`** (edge 9) over keeping raw amber/emerald — one consistent world, no old-world colors clashing with cobalt.

## Edge cases handled
- **1/2 shared-seam bleed** → storefront-scoped tokens/font; admin proven untouched.
- **3 null image slot** → every slot degrades to a blank cobalt tile, aspect box reserved (no CLS).
- **4 es-MX glyphs in display face** → Libre Caslon Text (latin-ext); verified serif on "ergonómicas"/"cómo".
- **5 text-over-image contrast** → hero/band copy on a cobalt scrim/caption bar (8.37:1 regardless of photo luminance).
- **6 e2e structural signals** → grid columns, compare-at line-through, honeypot `left:-9999px` all verified in live DOM.
- **7 dark mode** → decommissioned for storefront; `.dark` retained only as admin's untouched world.
- **8 global-error.tsx** → left as the intentional token-free system-ui exception (not edited).
- **9 semantic colors** → all 10 storefront amber/emerald files promoted; OXXO/SPEI pending is a calm warning panel, never red.

## How to Test
1. `/` — cobalt roman-caps hero over the framed chair photo; editorial band with cobalt caption; roman-caps section headers.
2. `/sillas`, `/producto/[slug]`, `/carrito`, `/checkout`, `/contacto`, static pages — cobalt world, cartouche image frames, ledger tables, calm warning/success status.
3. `/admin/login` + authed admin — must be neutral/Inter/black, identical to before.
4. Set any `imagery.ts` slot to `null` → its slot shows a blank cobalt tile with a chair glyph (no broken image, no shift).
5. Toggle `es-MX`/`en` — headings render in the serif with correct accents.

## Deviations from Ticket
None. One test file (`oxxo-spei-instructions.test.tsx`) was updated in lockstep
with the documented amber→`warning` promotion — it asserts the new class; no
product behavior changed.

## Known Limitations
- Showroom map slot stays `null` (no real address exists — Out of Scope); it degrades to a cobalt pin-glyph tile, ready for a real map when provided.
- WhatsApp FAB is hidden until `WHATSAPP_PHONE_E164` is configured (pre-existing guard); the `bg-whatsapp` green token is verified in CSS and applies when it renders.
- 2 catalog e2e navigation-click tests are flaky (pass on retry) due to dev-server cold-compile timing — pre-existing, not caused by the reskin.

## Dependencies Added
None. No new npm package (second `next/font/google` family only), no migration, no `next.config.ts` change.
