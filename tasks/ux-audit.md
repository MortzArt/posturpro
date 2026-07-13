# UX Audit: T4 — Product Detail Page (`/producto/[slug]`)

Stage 8 (ultraux). Comprehensive UX audit of the new PDP against `ui-design.md`
(layout, M1–M9 motion, states, copy) and `next-ticket.md` (AC-1…AC-20, 10 edge
cases). Live checks run with Playwright against a dev server on port 3000 wired
to the seeded local Docker Supabase; the developer's port-3206 dev server and
Docker Supabase were left running throughout.

## Summary

- **Components audited**: 8 PDP components + 3 reused T3 components (StockBadge,
  Breadcrumbs, ProductCard) + PDP motion CSS + `product` i18n namespace (both
  locales) + route/page composition.
- **Issues found**: 7 (🔴 0, 🟡 2, 🟢 5)
- **Issues fixed**: 2 (both 🟡)
- **States missing**: 0 — every state in the design's state matrix is implemented.
- **Tests after fixes**: 415 unit PASS · 45/45 PDP e2e PASS (1 intentional
  viewport skip) · tsc clean · eslint clean.

The implementation is genuinely strong: it tracks the design spec closely, the
copy is natural Mexican-Spanish with full English parity, motion is correct and
reduced-motion-gated, and accessibility is thorough (focus trap + return, roving
radiogroup, aria-live selection, labeled fields, 44px targets, zero 320px
overflow). Findings are polish-level; no critical or embarrassing issue was found.

## Findings

### 🔴 Critical UX Issues

None.

### 🟡 Major UX Issues

1. **`variant-selector.tsx:130` — Out-of-stock swatch "slash" was effectively
   invisible.** The colorless out-of-stock indicator (edge 2: "legible without
   color") was a 1px line at 70% opacity (`h-px … bg-foreground/70`). On a 36px
   swatch that is barely perceptible, and it would vanish entirely against a dark
   swatch color. This is the ONLY non-color signal of an out-of-stock variant on
   the swatch itself, so it must actually read.
   **Fixed**: thickened to 2px (`h-0.5`), full-opacity `bg-foreground`, plus a
   1px `outline outline-background` so the strike stays visible against BOTH
   light and dark swatch fills. (No seed product currently has an out-of-stock
   variant, so this is verified via CSS + the unit-tested selection logic, not a
   live screenshot.)

2. **`product-gallery.tsx:82` — Main gallery image content was unreachable for
   SR/keyboard users who don't open the lightbox.** The zoom trigger `<button>`
   had `aria-label="Ampliar imagen"`, which (per ARIA name computation)
   suppresses the inner `<img alt>` in the accessibility tree. A screen-reader
   user tabbing the gallery heard only "Ampliar imagen, botón" — never what the
   image shows — unless they opened the zoom dialog.
   **Fixed**: the trigger's accessible name now combines the action with the
   image description: `"{zoom} — {activeAlt}"`, e.g. *"Ampliar imagen — Silla
   Ergonómica Aire — Negro"* (verified live). No new i18n key; e2e selects the
   trigger by `data-testid`, so no test change needed.

### 🟢 Polish Items

1. **Recently-viewed tiles emit `<h2>` for each product name** (via the reused
   `ProductCard`), so under the "Vistos recientemente" `<h2>` the strip adds 6
   sibling `<h2>`s that a heading-navigation SR user hears as peers of
   "Especificaciones" / "Preguntas y respuestas". *Not fixed*: `ProductCard` is a
   T3 component reused **verbatim** per the locked design decision, and it renders
   `<h2>` by design in the T3 grid (where it is primary content); changing it here
   would either fork the component or regress T3's shipped grid. This exactly
   mirrors the accepted T3 convention — documented as a known tradeoff, deferred
   to a future shared-card heading-level prop if the pattern is revisited.

2. **`qa-form.tsx:331` — `CharacterCounter` toggles `aria-live` between `"off"`
   and `"polite"` at runtime.** Dynamically flipping `aria-live` is slightly less
   reliable across screen readers than a stable live region. *Not fixed*: the
   counter is already tied to the textarea via `aria-describedby`, which is the
   primary (reliable) announcement channel on focus; the near-limit color change
   (muted → amber → destructive) is a robust parallel visual signal. The
   anti-per-keystroke-chatter intent is correct; the marginal robustness gain
   isn't worth the added complexity/regression surface.

3. **Gallery is keyed on `selectedVariant.id` in the panel** (`product-purchase-panel.tsx:121`),
   remounting the *entire* gallery (thumb rail + Dialog) on variant switch, where
   the spec's M1 targets only the main-image crossfade. *Not fixed*: this is the
   deliberate mechanism that guarantees `activeIndex` resets to 0 with no
   during-render ref write (edge 8), it is interruptible, and QA's rapid-click
   idempotency test passes. Heavier than strictly needed but correct and jank-free.

4. **Sticky column is the gallery, not the purchase info** (`lg:sticky lg:top-20`
   on the gallery column). Most PDPs stick the buy panel. *Not fixed*: here the
   info column is short and there is no cart CTA (T6), so sticking the taller
   gallery is a reasonable, harmless choice and matches the design's two-column
   intent. Cosmetic preference only.

5. **`gallery.zoom` copy "Ampliar imagen" / "Zoom image".** The English "Zoom
   image" is slightly terse next to the warmer Spanish. *Not fixed*: acceptable,
   consistent with the concise catalog tone, and now embedded in the richer
   combined trigger label from fix #2.

## States Audit

| Component | Loading | Empty | Error | Success | Mobile | A11y |
|-----------|---------|-------|-------|---------|--------|------|
| Page / route | ✅ `loading.tsx`→`PdpSkeleton`, layout-matched (no CLS) | ✅ 404 via `notFound()` (not "empty") | ✅ `error.tsx` boundary (typed throw) | ✅ `.enter-fade` mount | ✅ single-col, 0 overflow @320/375 | ✅ 1×h1, landmark breadcrumb |
| Gallery | ✅ part of skeleton | ✅ zero-image placeholder, no zoom (edge 1) | ✅ `onError`→placeholder tile | ✅ crossfade (M1) | ✅ full-width + scroll thumb rail | ✅ region label, focus trap+return, 588px target |
| Variant selector | — | ✅ N/A (0 variants → not rendered, AC-8) | — | ✅ ring on select, aria-live | ✅ swatches wrap, 44×44 target | ✅ radiogroup + roving tabindex + arrows |
| Price / badge | — | — | — | ✅ recompute + M5 crossfade per variant | ✅ wraps | ✅ sr-only "Precio anterior:", aria-live |
| Specs | ✅ skeleton rows | ✅ all-null → section hidden (AC-10) | — | — | ✅ 2-col dl stacks | ✅ semantic dl/dt/dd |
| Recently-viewed | ✅ (correctly NOT skeletoned) | ✅ no history → not rendered (AC-12) | ✅ storage throw → silent (edge 7) | ✅ `.stagger` in | ✅ scroll rail, 0 overflow | ⚠️ card-name h2 (polish #1) |
| Q&A list | ✅ field bars | ✅ empty state + form CTA (AC-13) | — | — | ✅ stacks | ✅ text-only nodes, sr-only answer prefix |
| Q&A form | ✅ post-hydration | ✅ idle | ✅ field / rate-limit / unavailable / transient inline | ✅ clears + `role=status` note + focus move | ✅ full-width submit, 125×44 | ✅ labels[for], aria-describedby, honeypot off-screen |

## Accessibility Audit

| Check | Status | Details |
|-------|--------|---------|
| Focus rings | ✅ | `focus-visible:ring-2 ring-ring` on gallery trigger, thumbs, swatches (via group), fields, submit; distinct from `ring-foreground` selection ring. |
| Aria labels | ✅ | Gallery region labeled; **zoom trigger now names the image (fix #2)**; swatches carry color name + "(agotado)"; icon buttons labeled; every `<img>` non-empty alt (0 missing, live-verified). |
| Color contrast | ✅ | Monochrome tokens; low-stock amber paired with icon+text; **out-of-stock swatch strike now 2px + outline (fix #1)** so state is legible without color. |
| Keyboard nav | ✅ | Zoom: Enter/Space opens, focus trapped inside dialog, Escape returns focus to trigger (live-verified true/true). Swatches: roving tabindex, Arrow/Home/End, Space/Enter. Form fully operable. |
| Heading hierarchy | ✅¹ | Exactly 1 `<h1>` (product name); sections `<h2>`; Q&A questions styled `<p>`. ¹Recently-viewed card names are `<h2>` (polish #1, inherited T3 pattern). |
| Landmarks | ✅ | Breadcrumb `<nav aria-label>`; gallery `<section aria-label>`; last crumb `aria-current="page"`, not a link. |
| Live regions | ✅ | `aria-live="polite" aria-atomic` selection status ("{color} — {price} — {stock}"); Q&A success `role=status` (focused), errors `role=alert`. |
| Touch targets | ✅ | Swatch hit box 44×44 (live-measured); thumbs 64px; submit min-h-11 (44px live-measured). |
| SR-only text (both locales) | ✅ | "Precio anterior:" / "Was:", answer prefix, honeypot label, breadcrumb more-label all present and natural in es-MX + en. |

## Copy Review

No copy changed. Reviewed the full `product` namespace in both locales against the
catalog tone (concise, warm, informal "tú"). Verdict: **natural Mexican Spanish,
not neutral-LatAm-machine; full English parity.** Representative samples:

| Location | es-MX | en | Verdict |
|----------|-------|----|---------|
| `qa.emptyTitle` | "Sé el primero en preguntar" | "Be the first to ask" | ✅ warm, idiomatic |
| `qa.result.rateLimited` | "Ya enviaste una pregunta hace poco. Espera un momento antes de enviar otra." | "You just sent a question. Please wait a moment before sending another." | ✅ friendly, actionable |
| `qa.result.unavailable` | "Esta silla ya no está disponible." | "This chair is no longer available." | ✅ plain, no raw error |
| `qa.validation.nameTooLong` | "El nombre no puede pasar de {max} caracteres." | "Name can't be longer than {max} characters." | ✅ tells user the limit |
| `variant.outOfStockName` | "{name} (agotado)" | "{name} (out of stock)" | ✅ color never sole signal |

The only nit: en `gallery.zoom` "Zoom image" is terser than the Spanish (polish #5).

## Motion Audit (M1–M9 vs spec, improve-animations method)

| # | Element | Spec | Implemented | Verdict |
|---|---------|------|-------------|---------|
| M1 | Gallery main image | crossfade 200ms + 2px blur mask, interruptible | `.gallery-image` keyed, `@starting-style` opacity+blur, reduced→instant no-blur | ✅ |
| M2 | Zoom dialog | scale 0.95→1 + fade, center origin (modal), 200/150ms | off Radix `[data-state]`, `transform-origin:center`, reduced→opacity-only | ✅ |
| M3 | Zoom scrim | fade 200/150ms | `.gallery-zoom-scrim` | ✅ |
| M4 | Press feedback | scale(0.97) 120ms, high-freq → no enter/hover | `.gallery-zoom-trigger`/`.swatch-press`, reduced→none | ✅ |
| M5 | Price/stock line | crossfade 150ms keyed | `.price-value` keyed on value | ✅ |
| M6 | Thumb hover | opacity lift, hover-gated | `.thumb-hover` under `@media (hover:hover) and (pointer:fine)` | ✅ |
| M7 | Recently-viewed | `.stagger`, ≤80ms/item cap | `.stagger` + `min(index*60, 300)` delay | ✅ |
| M8 | Field error/success | fade+rise 150–200ms | `.enter-fade` | ✅ |
| M9 | Page mount | fade | `.enter-fade` on section | ✅ |

- Purpose & frequency: ✅ high-frequency swatch selection gets press-feedback only,
  no enter/hover motion (Emil's frequency rule honored).
- Easing & duration: ✅ all enter uses `--ease-out` custom curve; all ≤200ms.
- Physicality: ✅ blur-masked crossfade (Emil), scale-from-0.95 not 0.
- Interruptibility: ✅ CSS transitions + keyed remounts; rapid-variant idempotency
  passes e2e (edge 8).
- Performance: ✅ only `transform`/`opacity`/`filter(blur ≤2px)` animated.
- Accessibility: ✅ every block has a `prefers-reduced-motion` fallback; live
  reduced-motion render verified (content present, no motion crash).
- Cohesion: ✅ reuses the T2/T3 primitives (`--ease-out`, `.enter-fade`, `.stagger`,
  `.card-lift`) — zero visual seam with catalog.

## Consistency with T3 Catalog

✅ Same container (`max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8`),
spacing rhythm (`mt-10 md:mt-12` sections), `aspect-[4/5]` frames, `rounded-lg`,
`tabular-nums` on all money, `StockBadge` inline (icon+text, colorblind-safe),
`Breadcrumbs` verbatim, `ProductCard` verbatim in the recently-viewed strip. A
shopper arriving from a grid card feels no seam.

## Live Verification (Playwright, port 3000 → local Docker Supabase)

- 1×`<h1>`, clean `<h2>` set; 0 images missing/empty `alt`.
- Zoom: focus trapped inside dialog = true; focus returned to trigger on Escape = true.
- Swatch hit box = 44×44px; submit = 125×44px.
- Horizontal body overflow = **0px at 320px AND 375px** (incl. with the
  recently-viewed rail populated).
- Reduced-motion: PDP renders, price visible, no crash.
- `/en` PDP: fully translated ("Specifications", "Questions & answers", "Ask a question").
- Zoom trigger accessible name (post-fix): "Ampliar imagen — Silla Ergonómica Aire — Negro".
- Desktop + mobile + zoom-open screenshots reviewed: clean two-column split,
  correct mobile stacking, lightbox scrim + visible close control.

## Environment Note (not a product defect)

The repo's `.env.local` points at a **remote** hosted Supabase project that
currently 404s on the catalog tables/views (empty or undeployed schema there);
its transient availability is why an isolated `next build`/`next start` for the
audit failed collecting page data. The audit was therefore run against the
**seeded local Docker Supabase** (port 54321, all 8 tables healthy) via a
dev server on port 3000 using an isolated `distDir` (`NEXT_QA_DIST_DIR`, the same
env-gated mechanism QA used) — the developer's port-3206 dev server and Docker
Supabase were never touched, and all temporary build dirs + an auto-generated
`tsconfig.json` reformat were reverted/removed afterward. Flagging that the remote
project's schema drift is worth a look but is outside T4's scope.

## Fixes Applied (files changed)

| File | Change | Severity |
|------|--------|----------|
| `src/components/product/variant-selector.tsx` | Out-of-stock slash → 2px + full-opacity + background outline (legible without color, edge 2) | 🟡 |
| `src/components/product/product-gallery.tsx` | Zoom-trigger accessible name now combines zoom action + image description (SR reaches image content without zooming) | 🟡 |

No tests changed (both fixes are `data-testid`-safe and assert-neutral; the slash
markup is not asserted anywhere).

## UX Score: 9/10

Production-quality PDP. Spec-faithful layout, complete state coverage, correct and
cohesive motion with full reduced-motion support, thorough keyboard/SR
accessibility, natural bilingual copy, and zero responsive breakage down to 320px.
The two fixed 🟡 items were the only issues that affected a real user (an invisible
out-of-stock indicator and an image description hidden from SR users). The one
point withheld is for the reused-card heading-level nesting in the recently-viewed
strip (polish #1) — a legitimate SR-navigation wrinkle that can't be resolved
without touching the locked-verbatim T3 `ProductCard`, so it is documented and
deferred rather than force-fixed.
