# UX Audit: T3 — Catalog Browsing

Stage 8 (UX) of the full-cycle pipeline. Audited the full T3 catalog surface
across BOTH locales (es-MX default, /en) at 375 / 768 / 1024+ against a
production build (`next build` + `next start` on :3000) wired to the running
local seeded Supabase (read-only; user's :3206 dev server left untouched).
Visual verification via Playwright screenshots at 375px and 1280px; DOM/a11y
verification via rendered-HTML inspection and the e2e ARIA assertions.

## Summary

- **Components audited:** 10 (ProductCard, StockBadge, ProductGrid, Breadcrumbs,
  Pagination, BrandLogo, EmptyState, CategoryTree, IndexTile, catalog Skeletons)
  across 8 route trees (`/sillas`, `/categorias` + `[slug]`, `/marcas` +
  `[slug]`, `/estilos` + `[slug]`) in 2 locales.
- **Issues found:** 8 (🔴 1, 🟡 1, 🟢 6)
- **Issues fixed:** 2 (the 🔴 and the 🟡 — both real correctness defects)
- **Polish items:** 6 reviewed; all judged deliberate/acceptable and left as-is
  with rationale (no churn — the surface was already built to the design spec).
- **States missing:** 0 — loading / empty / error / success / out-of-stock /
  no-image / disabled all present before this stage.

The T3 surface arrived in excellent shape: the dev + review + QA stages had
already landed correct states, motion tokens, reduced-motion guards, crawlable
pagination, and no-CLS image handling. The UX stage found **two genuine
accessibility defects that all prior stages missed** (both in the semantics
layer, invisible to sighted testing) and fixed them.

---

## Findings

### 🔴 Critical UX Issues

1. **`src/app/[locale]/**/page.tsx` (all 7 pages) — Breadcrumb `<nav>` landmark
   mislabeled with the wrong string.** Every breadcrumb navigation landmark was
   given the section/entity name as its accessible name, not "Breadcrumb":
   `/sillas` → `aria-label="Inicio"`, `/categorias` → `"Categorías"`,
   `/marcas/[slug]` → `"Marcas"`, etc. A screen-reader user cycling landmarks
   heard *"Inicio, navigation"* / *"Marcas, navigation"* — meaningless as a
   breadcrumb, and on the brand page it **collided** with the "Marcas" crumb
   link *inside* it and the "Marcas" header nav item (three things named
   "Marcas"). This defeats the whole point of AC-7's `<nav aria-label>` (a
   labelled landmark exists to be *found* and *understood* in the landmark
   rotor). **Fixed:** added a dedicated `catalog.breadcrumb.ariaLabel` key
   ("Ruta de navegación" / "Breadcrumb") to both dictionaries and pointed all
   seven pages' `<Breadcrumbs ariaLabel>` at it. Verified live: `/marcas/ergovita`
   now renders `<nav aria-label="Ruta de navegación">`, `/en/sillas` renders
   `<nav aria-label="Breadcrumb">`. The section-name keys (`breadcrumb.brands`
   etc.) are still used as the actual crumb *labels* inside the trail — nothing
   orphaned.

### 🟡 Major UX Issues

1. **`src/components/catalog/product-card.tsx:102` — heading-level skip
   (H1 → H3).** The page renders `<h1>` (page/entity title) and the product
   card names were `<h3>`, with no `<h2>` in between — a skipped level on every
   catalog, category, brand, and style page. WCAG 1.3.1 / heading-navigation
   best practice: don't skip levels; a screen-reader user jumping by heading
   level lands on nothing at H2 and the outline reads as malformed. **Fixed:**
   the card name is now `<h2>` — cards are the first content sections beneath
   the page H1 on every page they appear on, so H2 is the semantically correct
   level. Verified live (`<h2 class="line-clamp-2 …">Silla de Oficina Nova`).
   No e2e asserts on `h3` (only `heading, level:1`), so nothing broke.

### 🟢 Polish Items (reviewed — deliberate, left as-is with rationale)

1. **`/categorias` index is single-column at every breakpoint** — the design
   spec floated "2-col at sm, 3-col at lg for top-level categories, children
   nested inside." The impl uses full-width `flex flex-col` rows. **Not
   changed:** single-column is the *stronger* choice for a nested tree — a
   `pl-6` child indented under its parent inside a multi-column grid cell reads
   as visual noise, and the nesting semantics (real nested `<ul>`/`<li>`) and
   the left-border marker already answer "where am I." Multi-column would trade
   clarity for density on a 6-item list. Deliberate.

2. **"En stock" badge uses `text-foreground` (near-black) on every card** —
   prominent for the common/positive case. **Not changed:** this is exactly the
   design-spec mapping (AC-8 locks the tone/icon/text per state), it is
   tested, and the translucent `bg-background/90 + backdrop-blur-sm` chip keeps
   the image reading through. The badge does NOT animate (correct — a 12-card
   grid of pulsing badges would violate Emil's "frequency of use").

3. **`priority={index < 4}` on all grids incl. 2-col mobile** — the first 4
   cards get `next/image` priority even though mobile shows 2 columns (so cards
   3–4 are below the fold). **Not changed:** the ticket/design explicitly bound
   this ("harmless extra priority on mobile is bounded to the first 4"); at
   375px it preloads one extra row, a negligible, intentional trade.

4. **Out-of-stock / low-stock badge states are unverifiable on live data** —
   all 30 seeded products have effective stock > 5, so only "En stock" renders
   live. **Not a UX defect:** the "low"/"out" visual contracts (amber
   `Alert02Icon` + "Solo quedan {n}"; muted `MinusSignCircleIcon` + "Agotado" +
   `opacity-60` image) are correct in code and unit-tested via the stitch.
   Flagged for a live badge screenshot once T6 seeds a low/OOS product.

5. **Brand-page monogram (64–80px) is visually larger than the H1 name
   (20–24px)** at desktop. **Not changed:** this is the spec's `size="lg"` +
   `text-xl sm:text-2xl` pairing; the monogram is `aria-hidden` decorative
   identity and the name carries the heading — reads as a logo-lockup, which is
   the intent.

6. **Pagination renders both the mobile "Página X de Y" and the desktop
   numbered set in the DOM** (CSS `sm:hidden` / `hidden sm:flex`). **Not a
   defect:** this is the correct crawlable-and-responsive pattern (both are real
   markup so JS-off + all viewports work); only one is visible per breakpoint.

---

## States Audit

| Component | Loading | Empty | Error | Success | Out-of-stock | No-image | Mobile | A11y |
|-----------|---------|-------|-------|---------|--------------|----------|--------|------|
| ProductCard | via grid skeleton | n/a | n/a | ✅ | ✅ opacity-60 + "Agotado" | ✅ placeholder tile | ✅ 2-col | ✅ (H2 fixed) |
| StockBadge | rides card | n/a | n/a | ✅ 3 states | ✅ | n/a | ✅ | ✅ icon+text, not hue |
| ProductGrid | ✅ skeleton match | page-level | page-level | ✅ | ✅ | ✅ | ✅ 2/3/4 | ✅ `<ul>/<li>` |
| Breadcrumbs | skeleton row | n/a | n/a | ✅ | n/a | n/a | ✅ collapse to … | ✅ (label fixed) |
| Pagination | n/a | renders nothing (1 pg) | n/a | ✅ | n/a | n/a | ✅ prev/count/next | ✅ aria-current |
| BrandLogo | n/a | monogram fallback | n/a | ✅ | n/a | ✅ monogram | ✅ | ✅ aria-hidden tile + text |
| EmptyState | n/a | ✅ msg+CTA | n/a | n/a | n/a | n/a | ✅ centered | ✅ CTA ≥44px |
| CategoryTree | n/a | falls to EmptyState | n/a | ✅ nested | n/a | n/a | ✅ stacked | ✅ nested `<ul>` |
| IndexTile | n/a | n/a | n/a | ✅ desc-optional | n/a | n/a | ✅ 1/2/3-col | ✅ full-tile link |
| Skeletons | ✅ pulse (motion-safe) | n/a | n/a | n/a | n/a | n/a | ✅ same grid | ✅ aria-hidden |

Error state for all listing pages falls through to the shared `[locale]/error.tsx`
boundary (localized, `role="alert"`, opaque digest) — verified as the design
intent; not re-invented here.

---

## Accessibility Audit

| Check | Status | Details |
|-------|--------|---------|
| Breadcrumb landmark name | ✅ FIXED | Was the section name ("Inicio"/"Marcas"); now "Ruta de navegación"/"Breadcrumb" on all 7 pages, both locales. |
| Heading order | ✅ FIXED | Was H1→H3 (skip); card names now H2 — no skipped levels on any catalog page. |
| Focus rings | ✅ | `focus-visible:ring-2 ring-ring ring-offset-2` on every card, crumb link, pagination control, index tile, CTA. |
| Aria labels (icon-only) | ✅ | Pagination prev/next carry text labels; number links `aria-label="Página N"`; ellipsis `aria-hidden` + sr-only "Más páginas"; all decorative icons `aria-hidden`. |
| aria-current | ✅ | Last breadcrumb crumb `aria-current="page"` (non-link); current pagination page `aria-current="page"` (non-link `<span>`). |
| Color never sole signal | ✅ | StockBadge pairs distinct icon + distinct text per state; out-of-stock also has the "Agotado" word, not just opacity. |
| Image alt text | ✅ | `coverAlt = alt_text ?? product name` (never empty); no-image placeholder carries `role="img"` + "{name} — Imagen no disponible". |
| Nested-list semantics | ✅ | CategoryTree uses real nested `<ul>` inside the parent `<li>`, not indent alone. |
| Keyboard / tab order | ✅ | breadcrumb → grid cards (one stop per card) → pagination; verified logical. |
| No horizontal scroll | ✅ | e2e asserts no overflow at 375/768/1280; breadcrumb collapses to `…` on mobile without sideways scroll. |
| Tap targets ≥ 44px | ✅ | Cards full-tile; pagination controls wrapped in `min-h-11`; EmptyState CTA `min-h-11`. |
| Reduced motion | ✅ | `.stagger`/`.card-lift` drop transforms; skeleton pulse gated `motion-safe:animate-pulse`; e2e verifies reduced-motion still functional. |
| Contrast (text) | ✅ | `muted-foreground` on `card`/`background` and stock-badge text (`foreground` on `background/90`) ≥ 4.5:1; the amber "low" hue lives only on an `aria-hidden` icon, so it carries no text-contrast obligation (text + word carry the state). |
| Tabular numbers | ✅ | Prices and page numbers use `tabular-nums` (no digit reflow). |

---

## Copy Review (both locales)

| Location | Before | After | Reason |
|----------|--------|-------|--------|
| Breadcrumb `<nav>` name (es-MX), all pages | `aria-label` = "Inicio" / "Categorías" / "Marcas" / "Estilos" (the section/crumb string) | `aria-label="Ruta de navegación"` | A breadcrumb landmark must be named for what it *is*, not for one of its crumbs; the old value collided with crumb + header-nav labels of the same text. |
| Breadcrumb `<nav>` name (en), all pages | `aria-label` = "Home" / "Categories" / "Brands" / "Styles" | `aria-label="Breadcrumb"` | Same defect in English; "Breadcrumb" is the WCAG-conventional landmark name. |

**Other copy — reviewed, no change needed (natural es-MX first, EN parallel):**

| Surface | es-MX | en | Verdict |
|---------|-------|----|---------|
| Stock | "En stock" / "Solo quedan {n}" / "Agotado" | "In stock" / "Only {n} left" / "Out of stock" | Natural, idiomatic, matches AC-8 exactly. |
| Pagination | "Anterior" / "Siguiente" / "Página {page} de {total}" | "Previous" / "Next" / "Page {page} of {total}" | Correct, verb-clear, interpolation intact. |
| Empty state | "No hay sillas en esta categoría todavía." (+ marca/estilo variants) / CTA "Ver todo el catálogo" | "No chairs in this category yet." / "View the full catalog" | Context-specific, actionable exit — textbook empty state. |
| Colors line | "{count} colores" | "{count} colors" | Omitted for <2 (no "1 colores" noise). Correct. |
| Index subtitles | "Explora nuestras sillas por categoría." etc. | parallel | Warm, on-brand es-MX. |

Dictionary parity holds (`messages.test.ts` + `keys-used.test.ts` green after
adding the one new key to both files).

---

## Motion Audit (improve-animations 8-category method)

| Category | Verdict | Notes |
|----------|---------|-------|
| Purpose & frequency | ✅ | Stagger/lift only on the low-frequency grid mount + hover; breadcrumb & pagination (seen every page) are motion-light (color/press only) — correct per "frequency of use." No decoration-only motion on repeated actions. |
| Easing & duration | ✅ | All entrances `--ease-out` (cubic-bezier(0.23,1,0.32,1)); durations 160–200ms, all < 300ms. No `ease-in` on UI. |
| Physicality | ✅ | Cards enter `translateY(8px)→0` + opacity (never `scale(0)`); press `scale(0.99)`; hover image `scale(1.02)` — subtle, real. |
| Interruptibility | ✅ | CSS transitions + `@starting-style` (not keyframes), so entrances retarget rather than restart. |
| Performance | ✅ | transform/opacity only; per-card delay set inline (no CSS-var-on-parent recalc storm). |
| Accessibility | ✅ | Every helper has a `prefers-reduced-motion` branch (drops transforms/delay); skeleton pulse gated `motion-safe:`. Matches the authoritative motion table in ui-design.md row-for-row. |
| Cohesion | ✅ | Same `--ease-out` + `.stagger`/`.card-lift` reused across cards, index tiles, category rows; `.enter-fade` reused for empty state — consistent with the T2 shell vocabulary. |
| Missed opportunities | — | None worth adding. Restraint is correct here (Linear/Vercel, not Dribbble). The stagger cap (`min(index,5)×40ms`) keeps a 12-card page finishing ≤200ms — no slow cascade. |

Implemented motion matches the design table exactly: stagger cap ✅, card-lift
hover gated behind `@media (hover:hover) and (pointer:fine)` ✅, skeleton pulse
`motion-safe` ✅, reduced-motion fallbacks ✅.

---

## Responsiveness

- **375px:** 2-col grid (e2e-verified exact `grid-template-columns`), breadcrumb
  collapses to `Inicio › … › Ejecutivas` (single ellipsis, no doubled chevron),
  pagination = Prev / "Página X de Y" / Next, no horizontal scroll. ✅
- **768px:** 3-col grid, full breadcrumb trail, windowed numbered pagination. ✅
- **1024px+:** 4-col grid, most generous card. ✅
- No horizontal overflow at any breakpoint (e2e-asserted 375/768/1280). ✅

---

## Gate Status (all green — verified this stage)

- `npm run lint` — clean
- `npx tsc --noEmit` — clean (exit 0)
- `npm run test` — **290 passed / 290** (was 288; +2 from the new key in both dicts)
- `npx playwright test` — **122 passed / 4 skipped / 0 failed** (catalog spec 42/42;
  the QA-hardened i18n-toggle tests pass under `next start`)
- `npm run build` — success; route table unchanged (shell + 3 index pages `●`
  SSG/ISR, `/sillas` + `[slug]` `ƒ` searchParams-only) — AC-11 intact, no static
  regression from the DOM edits.

---

## Files Changed (this stage)

| Path | Change |
|------|--------|
| `src/messages/es-MX.json` | Added `catalog.breadcrumb.ariaLabel` = "Ruta de navegación". |
| `src/messages/en.json` | Added `catalog.breadcrumb.ariaLabel` = "Breadcrumb". |
| `src/messages/keys-used.test.ts` | Registered the new `catalog.breadcrumb.ariaLabel` key. |
| `src/app/[locale]/sillas/page.tsx` | Breadcrumb `ariaLabel` → `breadcrumb.ariaLabel`. |
| `src/app/[locale]/categorias/page.tsx` | Same. |
| `src/app/[locale]/categorias/[slug]/page.tsx` | Same. |
| `src/app/[locale]/marcas/page.tsx` | Same. |
| `src/app/[locale]/marcas/[slug]/page.tsx` | Same. |
| `src/app/[locale]/estilos/page.tsx` | Same. |
| `src/app/[locale]/estilos/[slug]/page.tsx` | Same. |
| `src/components/catalog/product-card.tsx` | Card name `<h3>` → `<h2>` (heading-order fix). |

---

## UX Score: 9/10

The T3 catalog is production-grade: every state handled, motion disciplined and
reduced-motion-safe, copy natural in both locales, no CLS, fully crawlable and
JS-off functional, responsive with no horizontal scroll. It lost a point only
because two real accessibility semantics defects (a mislabeled breadcrumb
landmark on every page, and a skipped heading level on every card) shipped
through dev/review/QA undetected — both are the kind of invisible-to-sighted
correctness that compounds, and both are now fixed. With those closed, the
surface is at Stripe/Linear polish; the remaining half-point of headroom is the
live low/out-of-stock badge verification deferred to T6 seeding.
