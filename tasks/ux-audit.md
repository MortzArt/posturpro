# UX Audit: T5 — Search, Filters & Sorting

Stage 8 (ultraux). Live audit against a fresh prod build on `:3000` (seeded local
Supabase `:54321`), both locales, 320 → 1440px. Skills applied: `emil-design-eng`,
`apple-design`, `improve-animations` methodology for the motion pass. Audited against
`tasks/ui-design.md` (M-1…M-8, states, copy) and the AC set in `tasks/next-ticket.md`.

## Summary

- Components audited: 16 (search-box, sort-select, filter-panel, filter-controls,
  filter-navigation, filter-sheet, color-swatch, active-filters, catalog-toolbar,
  catalog-shell, catalog-grid-region, search-results, result-announcer, no-results,
  catalog-skeleton + the ui/ primitives select/slider/checkbox/badge/input).
- Issues found: 6 (🔴 2, 🟡 2, 🟢 2)
- Issues fixed: 5 (🔴 2, 🟡 1, 🟢 2). Deferred: 1 (🟡, needs an RPC/arch change out of scope).
- States missing: 0 net new (loading/empty/error/success all present; touch-target state hardened).
- Test-suite status after fixes: **569 unit / 92 T5 e2e / 62 catalog+motion e2e all pass**;
  lint + `tsc --noEmit` clean; `next build` clean. No test assertion changes required
  (all e2e target `data-testid`, not the copy/labels I changed).

## Overall verdict

The feature was already in strong shape from Dev/Review/Fix/QA — SSR-first render, JS-off
contract, motion tokens, accent search, deterministic sorts, and anon grant discipline are
all solid and match the spec. The audit surfaced one **real correctness-of-copy bug** (the
mobile filter counts) and one **real interruptibility bug** (rapid multi-select clobbering),
both now fixed, plus a mobile touch-target hardening. The remaining item ("malla" keyword
returning 0) is a legitimate discovery gap but requires expanding the RPC search scope, which
is explicitly out of scope for this stage.

## Findings

### 🔴 Critical UX Issues

1. **`filter-sheet.tsx` (trigger + apply button), all mobile/tablet viewports, both locales —
   the mobile filter counts were frozen at zero.** The `"Filtros (N)"` trigger badge always
   rendered `Filtros (0)` even with 2+ active filters, and the primary apply CTA always read
   `Ver 0 sillas` regardless of the real filtered total. Root cause: `buildToolbarLabels()` in
   `sillas/page.tsx` pre-interpolated the ICU strings with a literal `count: 0`
   (`t("filters.triggerCount", { count: 0 })`, `t("filters.apply", { count: 0 })`) and passed
   the frozen strings down; `FilterSheet` received the real `activeCount` but never used it to
   build the label. A shopper who has narrowed the catalog to 5 chairs sees a button promising
   "Ver 0 sillas" — the interface lies about its own state (Apple §7 Craft; feedback that
   contradicts reality erodes trust).
   **Fixed:** `FilterSheet` now interpolates client-side with `useTranslations("catalog.filters")`
   — the trigger uses the live `activeCount` prop (`Filtros (2)` / `Filters (1)`), and the apply
   button uses the **live filtered total** via a new `useResultCount()` selector on the
   `ResultAnnouncer` context (`Ver 5 sillas` / `View 6 chairs`). The `ResultAnnouncerProvider`
   now publishes the numeric total alongside its live-region text (the count is only knowable
   post-RPC, so it can't be a server prop on the client toolbar); the apply button falls back to
   the honest static `"Aplicar filtros"` label until the first results subtree reports, instead
   of showing a wrong `0`. Verified live in both locales.

2. **`filter-navigation.tsx`, JS-on, all viewports — rapid multi-select clobbered earlier
   selections (interruptibility).** Toggling two/three facet values faster than a `router.push`
   settled dropped the earlier ones: each `toggleValue` read the stale `filters` prop from its
   render closure and computed `{...filters, [facet]: [onlyThisOne]}`, so the last click won.
   Measured: 3 brand checkboxes clicked ~70–80ms apart landed only **1–2** brands in the URL.
   This is exactly the "thought and gesture happen in parallel" failure Apple §3 warns about —
   the UI lost input mid-transition.
   **Fixed:** the provider now composes toggles against a synchronously-updated `pendingRef` of
   the latest applied filters, re-based to the authoritative URL state via a `useEffect` keyed on
   the `filters` prop (a real navigation) — never on incidental re-renders like `isPending`
   flipping. URL stays the single source of truth (no architecture change); a burst of clicks now
   **accumulates** (3/3 brands land). Verified live.

### 🟡 Major UX Issues

3. **`filter-controls.tsx`, mobile — facet checkbox/availability labels were below the 44px
   touch target.** Labels used `min-h-6` (24px); the Radix checkbox has an expanded `after:`
   hit-area (~32px) but the label text row itself was a small tap target on mobile, where the
   filter panel lives in the Sheet. Design spec + a11y checklist mandate ≥44px (`min-h-11`).
   **Fixed:** facet-option labels and the availability label are now
   `flex min-h-11 flex-1 items-center` — the full row (checkbox + label) is a comfortable 44px
   tap target. Confirmed visually in the mobile Sheet (rows now sit on a 44px rhythm). The
   desktop sidebar reads slightly taller but it already scrolls (`overflow-y-auto`), so no layout
   regression.

4. **`search.ts` RPC scope — keyword search does not match on material, so "malla" returns 0
   results. (DEFERRED — out of scope.)** A shopper searching "malla" (mesh — a real, common
   upholstery in the seed: 6+ chairs have `material_upholstery = "Malla transpirable"`) hits the
   no-results page, even though "Malla" exists as a *filter facet* and there is a "Malla"
   material to filter by. AC-3 scopes search to **name + brand + description** only (materials
   are a facet, not a search field), so this is spec-conformant — but it's a genuine discovery
   gap for a keyword a shopper will plausibly type. **Not fixed here:** widening the search scope
   means editing the `search_products` RPC's `WHERE` clause (a migration/arch change), which this
   stage may not touch. The no-results page (echo + "Limpiar filtros" + popular strip) is the
   working safety net today. **Recommendation:** a follow-up ticket to add `material_*` columns to
   the RPC's `unaccent/ILIKE` search predicate (the `pg_trgm` indexes and parameterization are
   already in place, so it's a small, safe change).

### 🟢 Polish Items

5. **`result-announcer.tsx` — extended to publish the live numeric count.** Added
   `useResultCount()` so persistent client chrome (the FilterSheet apply button) can label itself
   with the post-RPC filtered total without threading it as an impossible server prop. Fixed as
   part of issue 1. Keeps the existing `aria-live` announcement behavior byte-for-byte (the M-7
   announcer e2e test still passes).

6. **Sort `Select` origin + motion — verified, no change needed.** Confirmed live: the sort
   dropdown opens as the styled Radix `Select` (not a native picker) with a trigger-anchored
   `transform-origin` (measured non-center) and the `.select-content-motion` CSS-transition
   retrofit (opacity + `scale(0.96→1)`, 200ms open / 150ms close, `ease-out`, `@starting-style`,
   reduced-motion → opacity-only). Meets M-3 and Emil's popover-origin rule. No fix applied.

## States Audit

| Component | Loading | Empty | Error | Success | Mobile | A11y |
|-----------|---------|-------|-------|---------|--------|------|
| Search box (header + toolbar) | n/a (submit) | ✅ placeholder | n/a | ✅ echoes `q` | ✅ collapse≤md | ✅ role=search, sr-only label, clear/submit aria |
| Sort select | n/a | n/a | n/a | ✅ current option | ✅ compact trigger | ✅ aria-label, listbox, checked |
| Filter panel / controls | n/a | ✅ empty facet omitted | ✅ page boundary | ✅ live toggle | ✅ 44px targets (fixed) | ✅ fieldset/legend, Checkbox+Label |
| Color swatches | n/a | ✅ omitted if none | n/a | ✅ ring+✓ | ✅ tabbable | ✅ role=group, role=checkbox, name label, ✓ not color-only |
| Filter sheet (mobile) | n/a | n/a | n/a | ✅ live count (fixed) | ✅ focus trap/scroll-lock/Esc | ✅ Dialog.Title, close aria, focus return |
| Active-filter chips | n/a | ✅ renders nothing | n/a | ✅ per-chip remove + clear-all | ✅ wrap/scroll-x | ✅ link + descriptive aria, ✕ aria-hidden |
| Result count | ✅ pending dim (M-7) | ✅ "0 sillas" → NoResults | ✅ error.tsx | ✅ "N sillas" tabular-nums | ✅ | ✅ persistent aria-live polite |
| Product grid | ✅ skeleton (JS-on transition) / dim | ✅ NoResults | ✅ error.tsx | ✅ 2/3/4-col + pagination | ✅ 2-col @375 | ✅ inherited from T3 |
| No-results | n/a | ✅ (this IS the empty state) | ✅ popular degrades on fail | n/a | ✅ full-width centered | ✅ h2 under h1, popular section labeled |

## Accessibility Audit

| Check | Status | Details |
|-------|--------|---------|
| Focus rings | ✅ | `focus-visible:ring-2 ring-ring` on every control (search, swatches, chips, sort, checkboxes, sheet close); swatches add `ring-offset-2`. |
| Aria labels | ✅ | Search sr-only label + submit/clear aria; swatches `aria-label`=color name; chips `aria-label`="Quitar filtro …"; sort trigger `aria-label`; sheet close aria; all icons `aria-hidden`. |
| Color contrast | ✅ | Monochrome oklch tokens (foreground/muted-foreground on background/card) inherited from T3 (≥4.5:1). Chips `secondary`, low-stock keeps amber+icon+text. Selection never color-only (✓ glyph + ring). |
| Keyboard nav | ✅ | Tab order breadcrumb→search→filters/sort→chips→grid→pagination; swatches each tabbable (multi-select WAI-ARIA), Space/Enter toggles; sheet focus-trap + Esc + return-to-trigger (verified e2e). |
| Touch targets | ✅ (fixed) | Search/inputs/buttons/sort `h-11`; facet rows now `min-h-11` (were 24px); chip remove links `min-h-11` via buttonVariants; sheet trigger `min-h-11`. |
| Heading structure | ✅ | Page `h1` "Sillas"; NoResults `h2` message + `h2` "Sillas populares" (siblings, no level skip — matches the T3 UX-audit fix). |
| aria-live quality | ✅ | One persistent polite region announces "N sillas" per change (not spammy — de-duped via zero-width-space toggle); both locales. |
| JS-off | ✅ | Native `<form method=get>` search + filter form; chips degrade to `<a>`; `<noscript>` always-expanded panel below lg; verified by the JS-off e2e spec (unchanged, still green). |
| Reduced motion | ✅ | Sheet `transform:none` (measured), grid-dim/sort/clear-fade opacity-only; RM e2e passes. |

## Copy Review

No copy was rewritten — the Mexican-Spanish strings are natural and the EN parity is clean
("Más vendidas" / "Best selling", "Solo en stock" / "In stock only", "No encontramos sillas
que coincidan" / "No chairs matched your search", "Incluye agotados" / "Include out of stock").
The only copy defect was the **dynamic count** rendering "0" — a data-binding bug, not wording —
now corrected so the ICU plural resolves against the real number.

| Location | Before | After | Reason |
|----------|--------|-------|--------|
| `filter-sheet.tsx` trigger badge | `Filtros (0)` (always) | `Filtros (2)` / `Filters (1)` (live active count) | The badge must reflect the real number of active filters, not a frozen 0. |
| `filter-sheet.tsx` apply button | `Ver 0 sillas` (always) | `Ver 5 sillas` / `View 6 chairs` (live total), `Aplicar filtros` before first RPC | The primary mobile CTA must promise the real result count, never lie with 0. |

## Motion Pass (improve-animations 8-category)

| Category | Assessment |
|----------|------------|
| Purpose & frequency | ✅ Sheet (occasional) gets the drawer curve; swatch/checkbox press is instant (high-freq, M-5); chip removal has no exit choreography; sort-commit isn't animated. Matches Emil's frequency table. |
| Easing & duration | ✅ `--ease-out` enters, `--ease-drawer` sheet, all <300ms; no `ease-in`, no `transition:all` in the T5 surface. |
| Physicality | ✅ Sort scales from `0.96`, sheet slides via `translateX` %, no `scale(0)` entrances. |
| Interruptibility | ✅ (was 🔴) Sheet uses interruptible `[data-state]` CSS transitions (not keyframes); **rapid facet toggles now compose instead of clobbering** (issue 2 fix). |
| Performance | ✅ Only `transform`/`opacity` animate; grid-dim is opacity-only. |
| Accessibility | ✅ Every rule has a `prefers-reduced-motion` fallback (verified `transform:none` on the sheet under RM). |
| Cohesion | ✅ Reuses the repo's `.drawer-panel`/`.drawer-scrim`/`.stagger`/`.swatch-press`/`.enter-fade` — the T5 surface is indistinguishable in motion from T3/T4. |
| Missed opportunities | None worth the cost — the surface is deliberately restrained (catalog is the hero, filters are chrome), which is the correct call. |

## Consistency with T3/T4

Spacing shell (`mx-auto max-w-(--breakpoint-xl) px-4 py-8 …`), grid gaps, breadcrumbs, `h1`
type scale, `StockBadge`, `ProductCard`, `Pagination`, and `tabular-nums` on counts/prices all
match the catalog pages exactly. New components read as if they shipped in T3.

## Accepted Deviations (not defects)

- **Price control is dual numeric inputs, not a dual-thumb Slider.** The design spec pictured a
  slider paired with inputs; the implementation ships only the numeric inputs (the `ui/slider.tsx`
  primitive is installed but unused here). This is the *more* accessible and JS-off-honest choice
  (the numeric field IS the native pesos submitter — a slider can't submit without JS and would
  duplicate the source of truth), and it matches the "no architecture changes to the JS-off
  contract" constraint. Kept as-is; documented rather than forced.
- **No-results keeps the desktop sidebar visible** (message + popular strip render in the results
  column, not full-bleed). This aids recovery (the shopper can immediately loosen a filter) and is
  a defensible agency-first call; not the spec's full-width mock but better UX.
- **Cold-nav feel:** per QA-BUG-1's Stage-7b fix, `/sillas` awaits the RPC inline (no route
  skeleton) to keep results SSR-visible with no JS. The single indexed RPC round trip makes cold
  nav acceptable; JS-on filter/sort/search changes still get the `useTransition` dim (M-7). No
  `loading.tsx`/Suspense reintroduced (would break the no-JS AC).

## Files Changed

- `src/components/catalog/filter-sheet.tsx` — live trigger/apply counts via `useTranslations` + `useResultCount` (🔴 issue 1).
- `src/components/catalog/result-announcer.tsx` — publish numeric count + `useResultCount()` selector (🔴 issue 1 / 🟢 issue 5).
- `src/components/catalog/search-results.tsx` — pass `count` to `ResultCountAnnouncer` (🔴 issue 1).
- `src/components/catalog/catalog-toolbar.tsx` — drop frozen `triggerCount`/`apply` from the labels type (🔴 issue 1).
- `src/app/[locale]/sillas/page.tsx` — stop pre-interpolating the sheet count labels with `0` (🔴 issue 1).
- `src/components/catalog/filter-navigation.tsx` — compose rapid toggles against a `pendingRef` re-based on navigation (🔴 issue 2).
- `src/components/catalog/filter-controls.tsx` — 44px touch targets on facet + availability labels (🟡 issue 3).

## UX Score: 9/10

Two real bugs (both fixed) in an otherwise excellent, spec-faithful, accessible, motion-cohesive
feature. Held back from 10 only by the deferred "malla"/material search-scope gap, which is a
legitimate discovery shortfall that needs an out-of-scope RPC change to close.
