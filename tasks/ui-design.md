# UI Design: T5 — Search, Filters & Sorting

Scope authority: `tasks/next-ticket.md` (AC-1…AC-18, edge cases 1–12). This spec covers
**only** the UI surfaces the ticket names: the header search box, the in-page `/sillas`
toolbar (search echo + sort + count), the filter panel (desktop sidebar / mobile-tablet
Sheet), active-filter chips, the no-results state with a popular strip, the filtered
grid loading/transition states, and the pagination-preserves-filters change. It does not
design autocomplete, `/buscar`, per-option facet counts, or a tag facet (all Out of Scope).

All visual values flow through existing tokens (monochrome grayscale oklch) and the three
motion easing tokens already in `globals.css` (`--ease-out`, `--ease-in-out`,
`--ease-drawer`). No new color, radius, or easing token is invented.

---

## Design Principles for This Feature

- **The catalog is the hero; filters are chrome.** The grid never moves or resizes when the
  filter UI opens (desktop sidebar reserves its column; mobile filters float in a Sheet over
  the grid). Emil: "reserve exact space; never pop content in."
- **SSR-first, JS-enhances.** Every control is a real `<form method="get">` / `<a>` that
  works with JS off (AC-12, AC-9, edge 11). JS upgrades submit-on-change and removes full
  page reloads — it is never required for correctness.
- **Motion earns its place by frequency.** The mobile Sheet (occasional) gets the drawer
  curve. Checkbox/swatch presses (high-frequency) get instant press feedback only — no
  enter animation. Chips removed constantly → no exit choreography, just the grid's existing
  stagger on the new results. Matches Emil's frequency table.
- **Color is never the only signal.** Swatches carry a text label + checkmark; the low-stock
  badge keeps its icon+amber+text; active filters read as text chips, not color dots alone.
- **Match T3/T4 exactly.** Reuse `ProductGrid`, `ProductCard`, `Pagination`, `Breadcrumbs`,
  `ProductGridSkeleton`, the `.card-lift`/`.stagger`/`.swatch-press` classes, `min-h-11` tap
  targets, `tabular-nums` on numbers, translucent `backdrop-blur` chrome, and the
  `buttonVariants` cva. New components look like they shipped in T3.
- **Bounded, defensive, single-sourced.** Param names + `SEARCH_QUERY_MAX` come from
  `config.ts`; the parse lib drops unknown/hostile values so a bad param never empties the
  catalog (edges 3–4).

---

## Design Tokens Used

- **Colors:** `background`, `foreground`, `muted`, `muted-foreground`, `card`, `border`,
  `accent`, `accent-foreground`, `primary`, `primary-foreground`, `input`, `ring`,
  `secondary`. Amber for low-stock is inherited from `StockBadge` (unchanged). No new colors.
- **Typography:** existing scale — `text-2xl sm:text-3xl font-semibold tracking-tight` (h1),
  `text-sm`/`text-xs`, `text-muted-foreground`, `tabular-nums` for counts/prices.
- **Spacing:** page shell `mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8`
  (identical to current `/sillas`); grid gaps `gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10`.
- **Radius:** `rounded-md` (controls), `rounded-lg` (cards, sheet body), `rounded-full`
  (swatches, chips).
- **Shadows:** `--shadow-sm` on card hover (inherited); Sheet uses a heavier shadow (see M-1).
- **Easing:** `--ease-out` (all enters/exits, press, select), `--ease-drawer` (mobile Sheet
  slide), `--ease-in-out` (none needed here). Durations per the Emil table (all < 300ms).

---

## shadcn/ui Components to Install

Only `button.tsx` exists today. Install via `npx shadcn add` (do NOT hand-roll — CLAUDE.md).
`radix-ui` is already installed and backs all of these. After generation, each gets its motion
CSS aligned to the tokens (see "Motion Spec" — the generated `tw-animate-css` keyframe classes
are replaced/augmented with the transition-based, `[data-state]`-driven pattern this repo uses
for the mobile nav drawer).

| shadcn component | Used by | Notes |
| --- | --- | --- |
| `input` | `search-box`, price range inputs | native `<input>`; keep `type="search"` semantics |
| `checkbox` | `filter-panel` (brand/style/material/category multi-select) | Radix Checkbox; instant press |
| `select` | `sort-select` | Radix Select; trigger-anchored origin, <250ms (AC-18) |
| `sheet` | `filter-sheet` | Radix Dialog as drawer; **retrofit** the repo drawer-motion pattern (see M-1) |
| `slider` | price range (dual-thumb) | Radix Slider; paired with numeric inputs |
| `badge` | `active-filters` chip base, result count pill | cva base for chips |
| `label` | every facet group + control | associates labels to inputs (a11y) |

**Motion retrofit rule (applies to `sheet` + `select`):** the default shadcn install ships
`tw-animate-css` keyframe classes (`data-[state=open]:animate-in …`). Keyframes restart from
zero and are not interruptible. Replace them with the repo's `[data-state]`-driven **CSS
transition** pattern already proven in `globals.css` (`.drawer-panel`, `.gallery-zoom-*`) so a
mid-open dismiss retargets smoothly (Emil: "transitions over keyframes for interruptible UI";
Apple §3). New rules live in `globals.css` under new banners.

---

## Component Inventory

### 1. SearchBox (`src/components/catalog/search-box.tsx`)

**Purpose:** Keyword search entry. Submits to `/sillas?q=…` (AC-12). Two placements: (a) the
site header (collapsing icon→input below `md`), (b) the `/sillas` in-page toolbar as the
primary, always-expanded search field echoing the active query.

**Location:** `site-header.tsx` (all pages) + `/sillas` toolbar.

**shadcn base:** `Input` (`type="search"`), wrapped in a native `<form method="get" action="/sillas">`.

**Layout — header, ≥ md (expanded):**
```
┌───────────────────────────────────────────────────────────────┐
│ [≡]  PosturPro   Sillas Categorías Marcas Estilos              │
│                  ┌──────────────────────────┐  [ES|EN]         │
│                  │ 🔍  Buscar sillas…      ✕│                  │
│                  └──────────────────────────┘                  │
└───────────────────────────────────────────────────────────────┘
```

**Layout — header, < md (collapsed → expanded):**
```
collapsed:   [≡]  PosturPro …………………………  [🔍] [ES]
tapped 🔍:   [≡]  ┌──────────────────────────────┐ [ES]
                  │ 🔍  Buscar sillas…          ✕│
                  └──────────────────────────────┘   (wordmark hidden while open)
```

**Layout — /sillas toolbar:** always expanded, full width of the toolbar column.

**Props:**
```typescript
interface SearchBoxProps {
  /** Pre-resolved placeholder ("Buscar sillas…"). */
  placeholder: string;
  /** Accessible label for the search input ("Buscar en el catálogo"). */
  ariaLabel: string;
  /** Accessible label for the clear button ("Borrar búsqueda"). */
  clearLabel: string;
  /** Accessible label for the submit button ("Buscar"). */
  submitLabel: string;
  /** Current `q` from the URL, so the field echoes on /sillas. */
  defaultValue?: string;
  /** Locale-agnostic form action target (CATALOG_PATH). */
  action: string;
  /** "header" → collapses to an icon below md; "toolbar" → always expanded. Default "toolbar". */
  variant?: "header" | "toolbar";
  /**
   * Hidden inputs to preserve active filters when submitting a new query from the
   * toolbar (searching must not drop the user's brand/color filters). `page` is
   * intentionally omitted — a new query always resets to page 1 (AC-8).
   */
  preservedParams?: Record<string, string>;
}
```
`"use client"` only for the header collapse toggle; the underlying `<form method="get">` still
submits natively without JS.

**Behavior:**
- **Submit / URL-state:** submit-based (autocomplete is Out of Scope; AC-12 "submit-based search
  only"). Enter or the submit button commits → `useRouter().push` with the new `q` (JS on) or
  native form GET (JS off). **No debounce** by default (no live-search). A `SEARCH_DEBOUNCE_MS`
  constant is reserved in `config.ts` only if live-search is added later.
- **Clear affordance:** an `✕` button appears inside the input only when it has a value; clicking
  clears the field and, on `/sillas`, navigates to the same URL minus `q` (keeping other
  filters). `type="button"`, `aria-label` = `clearLabel`.
- **Empty-query state:** submitting empty/whitespace `q` lands on `/sillas` with `q` omitted
  entirely (not `?q=`) so the URL stays canonical (parse lib treats whitespace-only as absent —
  AC-3).

**States:**
| State | Visual | Behavior |
| --- | --- | --- |
| Idle (empty) | Placeholder, search icon left, no clear button | Submit lands on clean `/sillas` |
| Typing | Value shown, clear `✕` fades in (M-6) | Enter commits |
| Has committed query (/sillas) | Field pre-filled with `q` | Clear removes `q` only |
| Header collapsed (< md) | Icon button only | Tap expands + autofocuses input |
| Disabled | n/a — never disabled | — |

**Responsive:**
| Breakpoint | Layout |
| --- | --- |
| < 640px | Header: icon → full-width input (wordmark hides while open). Toolbar: full-width, own row |
| 640–1023px | Header: same collapse. Toolbar: full-width; sort+count on the row below |
| ≥ 1024px | Header: inline expanded input between nav & toggle. Toolbar: search left, sort+count right |

**Animations:** Motion Spec **M-2** (header expand), **M-6** (clear-button fade).

---

### 2. SortSelect (`src/components/catalog/sort-select.tsx`)

**Purpose:** Choose result ordering (AC-7). Six options; default best-selling.

**Location:** `/sillas` toolbar (right on desktop; toolbar row on mobile) **and** inside the
mobile filter Sheet (so mobile users can sort without a separate control).

**shadcn base:** `Select`.

**Layout:**
```
┌───────────────────────────┐
│ Ordenar:  Más vendidas  ▾ │   ← trigger (button variant="outline")
└───────────────────────────┘
   opens ↓ (origin = trigger, ease-out < 250ms)
   ┌───────────────────────────┐
   │ • Más vendidas            │
   │   Precio: menor a mayor   │
   │   Precio: mayor a menor   │
   │   Novedades               │
   │   Nombre: A–Z             │
   │   Nombre: Z–A             │
   └───────────────────────────┘
```

**Props:**
```typescript
type SortKey =
  | "mas-vendidas"   // best-selling (default) — sales_count DESC + tiebreak (Constraint 4)
  | "precio-asc"
  | "precio-desc"
  | "novedades"      // created_at DESC
  | "nombre-asc"
  | "nombre-desc";

interface SortSelectProps {
  /** Current sort from the URL (canonicalized; unknown → default). */
  value: SortKey;
  /** Pre-resolved option labels keyed by SortKey. */
  labels: Record<SortKey, string>;
  /** Accessible label for the trigger ("Ordenar resultados"). */
  ariaLabel: string;
  /** URL param name (config: SEARCH_PARAM_KEYS.orden). */
  paramKey: string;
}
```
`"use client"`. On change → `useRouter().push` with the new `orden`, **resetting `page` to 1**
(AC-8) and preserving all other params. `SortKey` values are Spanish, single-sourced in
`config.ts` (`SORT_KEYS`), so they match exactly what the parse lib accepts.

**Behavior (JS off):** sort rides the filter `<form>` as a native `<select name="orden">` that
submits with the form; the client `Select` hydrates the enhanced overlay on top. (If dual-render
is too costly, the toolbar `Select` is client-only and the Sheet's in-form native `<select>` is
the sole JS-off path — see Open Question 1.)

**States:** Idle (shows current label) · Open (listbox, current option checked) · no disabled
state. Changing sort triggers the grid transition (M-7 → M-4).

**Responsive:** Desktop → inline toolbar right. Mobile → compact trigger (label may hide, leaving
value + chevron). Also present inside the Sheet.

**Animations:** Motion Spec **M-3** (open/close, trigger-anchored origin).

---

### 3. FilterPanel (`src/components/catalog/filter-panel.tsx`)

**Purpose:** All facet controls (AC-13). One component rendered **twice**: desktop sidebar body
and mobile Sheet body. Facet options come from real DB values passed in (never hard-coded).

**Location:** desktop left sidebar (`≥ lg`); mobile/tablet inside `FilterSheet`.

**shadcn base:** composes `Checkbox`, `Label`, `Slider`, `Input`, and `ColorSwatchGroup`.

**Layout (sidebar body, desktop):**
```
┌──────────────────────────┐
│ Filtros                  │
│                          │
│ Disponibilidad           │
│  [✓] Solo en stock       │   ← default ON (AC-5); unchecking includes OOS
│                          │
│ Categoría                │
│  [ ] Oficina        (M2M)│
│  [ ] Gerencial           │
│  [ ] Ergonómica          │
│                          │
│ Marca                    │
│  [ ] ErgoVita            │
│  [ ] Herman …            │
│  ▸ Ver más (if > 6)      │   ← collapse long facet lists to 6 + toggle
│                          │
│ Estilo                   │
│  [ ] Malla   [ ] Piel …  │
│                          │
│ Color                    │
│  ⬤ ⬤ ⬤ ⬤ ⬤ ⬤  (swatches)│
│                          │
│ Material                 │
│  [ ] Malla  [ ] Tela …   │
│                          │
│ Precio (MXN)             │
│  ├──────●────────●──────┤ │   ← dual-thumb Slider
│  [ min ]      [ max ]    │   ← two numeric inputs, synced to slider
│  Rango de precio ignorado│   ← subtle note only when min>max dropped (edge 4)
│                          │
│  [ Limpiar filtros ]     │   ← ghost, only when ≥1 filter active
└──────────────────────────┘
```

**Props:**
```typescript
interface FacetOption {
  value: string;   // stable id/slug sent to the URL (a known value)
  label: string;   // pre-resolved display label
}
interface ColorFacetOption {
  value: string;   // color_hex, lowercased, e.g. "111111"
  label: string;   // accessible color name ("Negro")
  hex: string;     // CSS color ("#111111")
}
interface FilterPanelProps {
  facets: {
    categories: FacetOption[];
    brands: FacetOption[];
    styles: FacetOption[];
    materials: FacetOption[];
    colors: ColorFacetOption[];
  };
  priceMin: number;   // bounded price domain, cents
  priceMax: number;
  selected: CatalogFilters;    // current selection (parsed, canonicalized)
  labels: FilterPanelLabels;   // headings, availability toggle, "Ver más", etc.
  paramKeys: SearchParamKeys;  // config.SEARCH_PARAM_KEYS
  /** URL-mutation callback (client) OR undefined when rendered in the JS-off <form>. */
  onChange?: (next: CatalogFilters) => void;
  context: "sidebar" | "sheet";  // affects spacing/scroll only
}
```
Server-renderable as a `<form method="get" action="/sillas">` for JS-off; a thin client wrapper
adds submit-on-change. Long facet lists (> `FILTER_FACET_COLLAPSE_AFTER`) collapse to a
"Ver más / Ver menos" disclosure so the panel never becomes an endless scroll.

**States:**
| State | Visual | Behavior |
| --- | --- | --- |
| Default | "Solo en stock" checked; others unchecked; slider at full domain | JS-off: submit button applies; JS-on: each toggle re-queries |
| Some active | Checked boxes; selected swatches ringed; "Limpiar filtros" visible | Clear → clean `/sillas` |
| Facet list empty (0 DB options) | The whole facet group is omitted (never an empty heading) | — |
| Facet-list load error | Handled at page boundary → error panel; panel never renders half-populated (edge 10) | — |
| Inverted price (min>max) | Both bounds dropped; subtle "Rango de precio ignorado" note under inputs | edge 4 |

**Responsive:** Sidebar and Sheet bodies differ only in outer spacing + scroll container (Sheet
body scrolls; sidebar is `sticky top-20 self-start` and scrolls with the page). Controls identical.

**Animations:** press feedback only (M-5). The "Ver más" disclosure does NOT animate height
(never animate layout properties); newly-shown rows may fade (opacity-only, ≤ 6 items).

---

### 4. ColorSwatchGroup (`src/components/catalog/color-swatch.tsx`)

**Purpose:** Multi-select color filter as accessible swatch **checkboxes** (AC-4 color
OR-within-facet). Distinct from T4's single-select `VariantSelector` (a `radiogroup`); this is a
**multi-select group of checkbox-semantics buttons** that deliberately reuses T4's visual swatch
+ `.swatch-press` + out-of-stock-strike vocabulary so the two read as siblings.

**Location:** inside `FilterPanel` "Color" group.

**shadcn base:** none (custom, like `VariantSelector`); each swatch is a labeled checkbox-semantics control.

**Layout:**
```
Color
 ⬤   ⬤   ⬤   ⬤   ⬤   ⬤
Negro Gris Azul Café Blanco Rojo    ← each swatch has a text label (SR + visible small caption)
(selected swatches show a ✓ + ring-2 ring-foreground ring-offset-2)
```

**Props:**
```typescript
interface ColorSwatchGroupProps {
  colors: ColorFacetOption[];      // value=hex-key, label=name, hex=css
  selected: string[];              // selected color hex-keys
  groupLabel: string;              // "Filtrar por color"
  onToggle: (value: string, next: boolean) => void;
}
```

**A11y:** container `role="group" aria-label={groupLabel}`. Each swatch is a
`<button role="checkbox" aria-checked>` with `aria-label` = the color name (never color alone).
Selection = `ring-2 ring-foreground ring-offset-2` **plus** a centered `✓` glyph so it's legible
without relying on ring color. Every swatch is tabbable (multi-select checkboxes are each in the
tab order per WAI-ARIA — unlike T4's roving radiogroup); `Space`/`Enter` toggles. Light swatches
(e.g. white) keep the `border border-border` outline so they're visible on the white card; the
`✓` renders `text-foreground` on light swatches (oklch L > ~0.7) and `text-background` on dark —
computed from `hex` at build.

**Animations:** `.swatch-press` (reused) — `scale(0.97)` on `:active`, 120ms `--ease-out`,
reduced-motion drops it. Selection ring appears instantly (high-frequency → no transition).

---

### 5. FilterSheet (`src/components/catalog/filter-sheet.tsx`)

**Purpose:** The mobile/tablet (`< lg`) container for `FilterPanel`. A full-height drawer opened
by a "Filtros" button in the toolbar (AC-13, Mobile UX).

**Location:** `/sillas` toolbar, `< lg` only.

**shadcn base:** `Sheet` (Radix Dialog), **`side="left"`** — mirrors the existing MobileNav
drawer (spatial consistency: the site's drawers come from the left) and reuses the exact
`.drawer-panel` motion. A bottom sheet would introduce a competing drawer idiom; if product
later prefers bottom, the motion pattern is identical (swap `translateX` for `translateY(100%)`
— Open Question 3).

**Layout:**
```
Trigger (in toolbar):   [ ⚙ Filtros (3) ]   ← badge shows active-filter count

Open (drawer from left, scrim dims grid):
┌──────────────────────────────┐░░░░░
│ Filtros              [ ✕ ]   │░░░░░  ← header: title + close (focus lands here)
├──────────────────────────────┤░░░░░
│  (FilterPanel body, scrolls)  │░░░░░
│  … Disponibilidad …           │░░░░░
│  … Categoría, Marca …         │░░░░░
│  … Color, Material, Precio …  │░░░░░
├──────────────────────────────┤░░░░░  ← sticky footer (translucent, backdrop-blur)
│ [ Limpiar ]   [ Ver 24 sillas ]│░░░░  ← "apply" = live result count; closes sheet
└──────────────────────────────┘░░░░░
```

**Props:**
```typescript
interface FilterSheetProps {
  activeCount: number;   // for the trigger badge
  resultCount: number;   // for the "Ver N sillas" footer button (live)
  labels: {
    trigger: string;     // "Filtros"
    title: string;       // "Filtros"
    close: string;       // "Cerrar filtros"
    clear: string;       // "Limpiar"
    apply: string;       // ICU: "Ver {count} sillas"
  };
  children: React.ReactNode;  // <FilterPanel context="sheet" />
}
```
`"use client"`.

**Interaction model (AC-18; Apple gesture surface):**
- With JS, filters apply **live** as toggled (desktop parity). The footer "Ver N sillas" button
  then primarily *closes* the sheet, its label reflecting the running live count (Apple §8: hint
  the outcome). Count updates as facets change.
- **Focus trap** while open (Radix); focus moves to the close button on open, returns to the
  "Filtros" trigger on close; `Esc` closes.
- **Dismiss:** scrim-tap + `Esc` + close button. Add bespoke swipe-to-close only if MobileNav
  already implements it (consistency over novelty; do not add a second gesture idiom).
- **Body scroll lock** while open (Radix).

**Animations:** Motion Spec **M-1** — reuse `.drawer-panel` / `.drawer-scrim` verbatim (300ms
`--ease-drawer` enter, 200ms exit, interruptible, reduced-motion → opacity-only). This is the
feature's most-important motion and it already exists, tested, in the repo.

**Responsive:** rendered only `< lg` (`lg:hidden`). At `≥ lg` the sidebar replaces it.

---

### 6. ActiveFilters (`src/components/catalog/active-filters.tsx`)

**Purpose:** Removable chips for every active filter + "Clear all" (AC-14). Above the grid,
below the toolbar. Also owns the `aria-live` result count.

**Location:** `/sillas`, above `ProductGrid`, all breakpoints.

**shadcn base:** `Badge` (chip base) + a close `✕`.

**Layout (desktop):**
```
24 sillas   ● Marca: ErgoVita ✕   ● Color: Negro ✕   ● Precio: $2,000–$4,000 ✕   [ Limpiar todo ]
```
**Layout (mobile 375px — wraps / scrolls-x, edge 12):**
```
24 sillas
┌─ chips scroll-x if needed ───────────────────────────▶
● ErgoVita ✕  ● Negro ✕  ● Malla ✕  ● $2k–$4k ✕  …
[ Limpiar todo ]
```

**Props:**
```typescript
interface ActiveFilterChip {
  key: string;          // stable React key + removal id ("marca:ergovita", "precio")
  label: string;        // pre-resolved chip text ("Marca: ErgoVita", "Precio: $2,000–$4,000")
  removeHref: string;   // URL with THIS filter removed (others preserved, page→1)
  removeLabel: string;  // "Quitar filtro Marca: ErgoVita"
}
interface ActiveFiltersProps {
  resultCountLabel: string;  // pre-resolved ICU count ("24 sillas")
  chips: ActiveFilterChip[];
  clearAllHref: string;      // clean CATALOG_PATH (page-provided)
  clearAllLabel: string;     // "Limpiar todo"
}
```
Server component. Each chip's `✕` is a real `<a href={removeHref}>` (works JS off; JS enhances to
`router.push`). **The default in-stock filter is NOT a removable chip** (it's the baseline, not a
user-added constraint); only the *opt-in to include out-of-stock* shows a chip ("Incluye
agotados ✕"). "Limpiar todo" → clean `/sillas` (default in-stock, no `q`, best-selling, page 1).

**A11y:** the result-count node is `aria-live="polite"` so SRs hear "24 sillas" after each change
(also the loading→done cue). Each chip is a link with a descriptive `aria-label`; the visible `✕`
is `aria-hidden`; keyboard-operable as links (Tab + Enter).

**States:**
| State | Visual |
| --- | --- |
| No filters | Renders **only** the result count ("30 sillas"); no chips, no "Limpiar todo" |
| ≥1 filter | Count + chips + "Limpiar todo" |
| Many filters (mobile) | Chip row `overflow-x-auto` with a subtle right fade mask; never pushes the grid off-screen (edge 12) |

**Animations:** none on remove (high-frequency; removal re-queries → the new grid uses its
existing `.stagger`). Chips do not animate in/out — that would fight the grid transition.

---

### 7. CatalogToolbar (`src/components/catalog/catalog-toolbar.tsx`) — small composer

**Purpose:** The row(s) above the grid holding search echo + filters trigger (mobile) + sort +
count. Keeps `sillas/page.tsx` thin (SRP). May be inlined into the page if the team prefers fewer
files; documented here for layout clarity.

**Layout — desktop (≥ lg):**
```
┌─────────────────────────────────────────────────────────────────┐
│  [ 🔍 Buscar sillas…            ✕ ]        Ordenar: Más vendidas ▾│
└─────────────────────────────────────────────────────────────────┘
(result count + chips render below via ActiveFilters; sidebar is to the left)
```
**Layout — tablet (768):**
```
[ 🔍 Buscar sillas…                                          ✕ ]
[ ⚙ Filtros (2) ]                            Ordenar: Más vendidas ▾
```
**Layout — mobile (375):**
```
[ 🔍 Buscar sillas…                    ✕ ]
[ ⚙ Filtros (2) ]              [ Más vendidas ▾ ]
```

---

### 8. NoResults (`src/components/catalog/no-results.tsx`)

**Purpose:** The zero-match state (AC-16, edges 1, 6, 8). NOT the generic `EmptyState`, NOT a 404.

**Location:** `/sillas`, replaces the grid when `total === 0`.

**shadcn base:** none (composes `Button` + a popular strip via `ProductGrid`).

**Layout:**
```
┌───────────────────────────────────────────────┐
│                    🔍 (search/chair icon)       │
│                                                 │
│   No encontramos sillas que coincidan          │
│   con "malla azul"                             │   ← echoes q and/or active filters
│                                                 │
│            [ Limpiar filtros ]                  │   ← → clean /sillas (primary)
│                                                 │
│   ─────────  Sillas populares  ─────────        │
│   ┌────┐ ┌────┐ ┌────┐ ┌────┐                  │
│   │card│ │card│ │card│ │card│   (up to 8,       │
│   └────┘ └────┘ └────┘ └────┘    best-selling)  │
│   (reuses ProductGrid layout / ProductCard)     │
└───────────────────────────────────────────────┘
```

**Props:**
```typescript
interface NoResultsProps {
  heading: string;            // "No encontramos sillas que coincidan"
  /** Echo of what was searched/filtered ('con "malla azul"'); null when nothing to echo. */
  queryEcho: string | null;
  clearLabel: string;         // "Limpiar filtros"
  clearHref: string;          // clean CATALOG_PATH
  popular: CatalogProductCard[];  // ≤ POPULAR_PRODUCTS_MAX (8), best-selling order
  popularHeading: string;     // "Sillas populares"
}
```
Server component. Reuses `.enter-fade` for the message block (low-frequency page → entrance
justified, same as `EmptyState`). The popular strip renders through the **same `ProductGrid`**
(sliced to ≤ 8) so cards/stagger/badges are pixel-identical to the catalog. If `popular` is empty
(edge 8), the strip + heading are omitted; message + "Limpiar filtros" still render (never a
broken layout).

**States:**
| State | Visual |
| --- | --- |
| Zero results, has popular | Message + echo + Clear + popular strip |
| Zero results, empty catalog | Message + Clear only (no strip) |
| Popular read failed | Same as empty-catalog (strip omitted, logged not fatal — error table) |

**Animations:** `.enter-fade` on the message block; popular strip uses `ProductGrid`'s `.stagger`.
No new motion.

---

### 9. Filtered grid loading state (reuse `ProductGridSkeleton`)

**Purpose:** The transition between a URL change and new server-rendered results (UX "Loading").
No new component — reuse `ProductGridSkeleton` (already pixel-matches the grid: same 2/3/4-col
layout, `aspect-[4/5]` box, `motion-safe:animate-pulse`).

**Rendering semantics (App Router):** `/sillas` reads `searchParams` → any request with params is
**dynamic**. The filtered grid read is isolated in `<Suspense fallback={<ProductGridSkeleton/>}>`
so the shell (breadcrumb, header, toolbar, sidebar, and the URL-derived active-filter chips)
renders **immediately** and only the grid region shows the 12-card skeleton while the RPC runs.
No full-page spinner; the filter panel and toolbar stay interactive during load.

**Pending affordance (client-initiated navigations):** when JS is on and a filter/sort toggle
uses `router.push`, wrap the mutation in `useTransition` and apply a **pending dim** to the
current grid (`opacity-60 transition-opacity 200ms ease` while `isPending`) so fast local reads
don't flash a skeleton — the stale results dim, then swap (Emil: prevent jarring changes). On slow
reads the Suspense skeleton is the fallback. The dim is a comprehension aid → keep it under
reduced-motion (opacity-only is RM-safe). Motion Spec **M-7**.

---

## Page Layout — `/sillas` (rewrite)

### Desktop (≥ 1024px)
```
┌───────────────────────────────────────────────────────────────────────┐
│ HEADER: [≡] PosturPro  Sillas Cat… Marcas Estilos  [🔍 Buscar… ] [ES|EN]│
├───────────────────────────────────────────────────────────────────────┤
│ Inicio › Sillas                                                         │  breadcrumb
│ Sillas                                                                  │  h1
│ Toda nuestra colección…                                                 │  subtitle
│                                                                         │
│ [ 🔍 Buscar sillas…                    ✕ ]      Ordenar: Más vendidas ▾ │  toolbar
│ 24 sillas  ● Marca: ErgoVita ✕  ● Negro ✕            [ Limpiar todo ]   │  ActiveFilters
│ ┌─────────────┐ ┌───────────────────────────────────────────────────┐ │
│ │ FILTROS     │ │  ┌────┐ ┌────┐ ┌────┐ ┌────┐                       │ │
│ │ (sidebar,   │ │  │card│ │card│ │card│ │card│   ProductGrid          │ │
│ │  sticky)    │ │  └────┘ └────┘ └────┘ └────┘                       │ │
│ │ Disponib.   │ │  ┌────┐ ┌────┐ ┌────┐ ┌────┐                       │ │
│ │ Categoría   │ │  └────┘ └────┘ └────┘ └────┘                       │ │
│ │ Marca …     │ │                                                     │ │
│ │ Color …     │ │      ‹ Prev  1 2 [3] 4 … 10  Next ›  (preserves     │ │
│ │ Precio …    │ │                                        filters)     │ │
│ └─────────────┘ └───────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```
Outer layout `lg:grid lg:grid-cols-[16rem_1fr] lg:gap-8`. Sidebar is `sticky top-20 self-start
max-h-[calc(100vh-6rem)] overflow-y-auto`. The `ProductGrid` in the right column keeps its own
2/3/4 responsive layout; because the right column is narrower than the full page, gate the 4th
column to `xl:` if 4 cards feel cramped at exactly 1024px (Open Question 2).

### Tablet (768px)
```
HEADER (search collapses to icon)
Breadcrumb / h1 / subtitle
[ 🔍 Buscar sillas…                                        ✕ ]
[ ⚙ Filtros (2) ]                          Ordenar: Más vendidas ▾
24 sillas  ● chips…                                 [ Limpiar todo ]
ProductGrid (3 col)
Pagination
```
Filters live in the left `Sheet` (no sidebar until `lg`).

### Mobile (375px)
```
HEADER: [≡] PosturPro …  [🔍] [ES]
Breadcrumb / h1 / subtitle
[ 🔍 Buscar sillas…                    ✕ ]
[ ⚙ Filtros (2) ]              [ Más vendidas ▾ ]
30 sillas
● chips scroll-x →
ProductGrid (2 col)
Prev · Página 2 de 5 · Next
```

---

## Interaction Flows

### Flow A — Filter by color (JS on, mobile)
1. Tap **⚙ Filtros** → `FilterSheet` opens: drawer slides in from left (M-1, 300ms
   `--ease-drawer`), scrim dims the grid, focus moves to the close button, body scroll locks.
2. Tap the **Negro** swatch → `.swatch-press` scale(0.97) confirms instantly; swatch gains ring +
   ✓; URL updates (`?color=111111`, `page`→1) via `router.push` inside `useTransition`.
3. Behind the scrim, the grid dims to `opacity-60` (M-7) while the RPC runs; footer updates
   "Ver **12** sillas".
4. New results stream in; grid returns to full opacity with `.stagger`.
5. Tap **Ver 12 sillas** (or scrim / Esc) → drawer slides out (200ms), focus returns to the
   **Filtros** trigger, now showing badge **(1)**.
6. An `● Negro ✕` chip is above the grid; `aria-live` announced "12 sillas".

### Flow B — Search from header (JS off)
1. Type "malla" in the header input, press Enter.
2. Native `<form method="get" action="/sillas">` navigates to `/sillas?q=malla`.
3. Server parses `q` (truncated to `SEARCH_QUERY_MAX`), calls the RPC (uncached — free text),
   renders the filtered grid + `noindex,follow` + canonical → `/sillas`. Chips degrade to plain
   `<a>`. Works with zero JS.

### Flow C — Sort change (JS on, desktop)
1. Open the **Ordenar** Select → listbox scales in from the trigger (M-3, <250ms ease-out).
2. Select "Precio: menor a mayor" → `router.push` with `orden=precio-asc`, `page`→1, other params
   preserved.
3. Current grid dims (M-7) → new price-ascending results stagger in.

### Flow D — Remove one chip / clear all
1. Click `✕` on **● Negro** → `<a>` to `removeHref` (color dropped, others + page-1 preserved) →
   re-query, new grid, `aria-live` count update.
2. **Limpiar todo** → clean `/sillas` (default in-stock, no `q`, best-selling, page 1).

### Flow E — Zero results
1. A filter combination matches nothing (edge 1) → server renders `NoResults` (not 404, not
   error): heading + echo of `q`/filters + **Limpiar filtros** + **Sillas populares** strip
   (best-selling, ≤ 8, independent of active filters). URL stays valid/shareable.

---

## Motion Spec (animation-vocabulary terms; transform/opacity only, <300ms, interruptible)

All new rules live in `globals.css` under labeled banners, following the existing
`[data-state]`-driven CSS-transition pattern (NOT `tw-animate-css` keyframes).

| # | Element | Effect (vocab) | Trigger | Property | Easing | Duration | Reduced-motion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **M-1** | Filter Sheet panel + scrim | **Slide in** (panel) + **Fade in** (scrim); interruptible | Sheet open/close (`data-state`) | `transform: translateX(-100%→0)` / `opacity` | `--ease-drawer` enter, `--ease-out` exit | 300ms enter / 200ms exit | `transform:none`, opacity 200ms — **reuse `.drawer-panel`/`.drawer-scrim`** |
| **M-2** | Header search collapse→expand (`<md`) | **Reveal** / **Scale in** | Tap search icon | `opacity` + `transform: scaleX` (NOT width) | `--ease-out` | 180ms | opacity-only fade |
| **M-3** | SortSelect content | **Origin-aware Scale in** ("Pop in", no bounce) | Select open (`data-state`) | `opacity` + `transform: scale(0.96→1)`; `transform-origin: var(--radix-select-content-transform-origin)` | `--ease-out` | 200ms open / 150ms close | opacity-only, `transform:none` |
| **M-4** | Result grid swap | grid's existing **Stagger** entrance | New results mount | `opacity` + `translateY(8→0)` | `--ease-out` | 200ms, 40ms step, capped | reuse `.stagger` (opacity-only under RM) |
| **M-5** | Checkbox / swatch press | **Press/Tap feedback** | `:active` | `transform: scale(0.97)` | `--ease-out` | 120ms | none (`transform:none`) — reuse `.swatch-press` |
| **M-6** | Search clear `✕` | **Fade in** | field has value | `opacity` | `ease` | 120ms | keep (opacity is RM-safe) |
| **M-7** | Current grid while re-querying (JS) | pending **dim** | `useTransition` `isPending` | `opacity: 1→0.6` | `ease` | 200ms | keep (comprehension aid, opacity-only) |
| **M-8** | "Filtros" trigger active-count badge | none (instant) | count change | — | — | — | — |

**Baseline compliance:** no `transition: all`; no `ease-in`; no `scale(0)` entrances (M-3 starts
at `scale(0.96)`); enters use `ease-out`; the Sheet (gesture surface) reuses the proven
interruptible drawer transition (Apple §3); every rule has a `prefers-reduced-motion` fallback
keeping only opacity. Select origin is trigger-anchored (Emil popover rule); the Sheet is a full
drawer (not origin-anchored). No animation on high-frequency actions (chip removal, the sort
commit itself, checkbox toggle beyond press feedback).

---

## Accessibility Checklist

- [ ] **Filter Sheet focus trap** — Radix Dialog traps focus; focus → close button on open,
      returns to the "Filtros" trigger on close; `Esc` closes.
- [ ] **Checkbox semantics** — brand/style/material/category use real `Checkbox` with associated
      `Label` (clicking the label toggles). Multi-select facets = independent checkboxes.
- [ ] **Color swatches** — `role="group"` + each `role="checkbox" aria-checked` with a text
      `aria-label`; selection shown by ring **and** ✓ (not color alone); each tabbable;
      `Space`/`Enter` toggles.
- [ ] **Sort Select labeling** — trigger `aria-label` "Ordenar resultados"; Radix Select
      (listbox), current option `aria-selected`.
- [ ] **`aria-live` result count** — "N sillas" node is `aria-live="polite"`; announces each
      filter/sort/search change; doubles as the loading→done cue.
- [ ] **Active-filter chips** — each a link with a descriptive `aria-label` ("Quitar filtro
      Marca: ErgoVita"); visible `✕` `aria-hidden`; keyboard-operable (Tab + Enter).
- [ ] **Search box** — `type="search"`, associated label (visually-hidden in the header), clear
      button `aria-label`; Enter and submit both work.
- [ ] **Landmarks / headings** — filter panel is a `<form>` with an accessible name ("Filtros");
      facet groups use `<fieldset>`/`<legend>` (or `role="group"` + heading) so SR users hear the
      grouping. Page h1 ("Sillas") preserved; NoResults heading is `<h2>` under it (no heading-
      level skips — matches the T3 UX audit fix).
- [ ] **Color never the only indicator** — swatch ✓, low-stock icon+text, text chips.
- [ ] **Tab order** — header: search → nav → toggle; page: breadcrumb → search →
      filters trigger/sort → chips → grid → pagination. Logical top-to-bottom, left-to-right.
- [ ] **Touch targets** — all controls ≥ 44px tap height (`min-h-11`), matching T3 pagination.
- [ ] **JS-off** — every control degrades to native form/link submission (AC-12, edge 11).
- [ ] **Keyboard shortcuts** — none added (no command palette in scope); nothing to document.

---

## SEO / rendering surface (UI-relevant only)

- Unfiltered `/sillas` (no params) → indexable, cached/static path exactly as T3 (AC-10, AC-11).
- Any request with `q`/filter/sort params → **dynamic**, `robots: { index: false, follow: true }`,
  canonical `<link>` → clean `/sillas` (or the page-N canonical for pure `?page`). This is
  metadata (not visible UI), but the toolbar/chips keep the current state legible to the user.

---

## Copy — both locales (all new strings; nested under `catalog`, camelCase, ICU placeholders)

Convention matches the existing `catalog` namespace (`catalog.stock`, `catalog.pagination`).
Proposed keys (dev finalizes exact wording; es-MX is natural Mexican Spanish, en is parity):

```
catalog.search.placeholder        es: "Buscar sillas…"                 en: "Search chairs…"
catalog.search.label              es: "Buscar en el catálogo"          en: "Search the catalog"
catalog.search.submit             es: "Buscar"                         en: "Search"
catalog.search.clear              es: "Borrar búsqueda"                en: "Clear search"
catalog.search.open               es: "Abrir búsqueda"                 en: "Open search"

catalog.filters.title             es: "Filtros"                        en: "Filters"
catalog.filters.trigger           es: "Filtros"                        en: "Filters"
catalog.filters.triggerCount      es: "Filtros ({count})"              en: "Filters ({count})"
catalog.filters.close             es: "Cerrar filtros"                 en: "Close filters"
catalog.filters.apply             es: "Ver {count, plural, one {# silla} other {# sillas}}"  en: "View {count, plural, one {# chair} other {# chairs}}"
catalog.filters.clear             es: "Limpiar filtros"                en: "Clear filters"
catalog.filters.clearAll          es: "Limpiar todo"                   en: "Clear all"
catalog.filters.showMore          es: "Ver más"                        en: "Show more"
catalog.filters.showLess          es: "Ver menos"                      en: "Show less"
catalog.filters.availability      es: "Disponibilidad"                 en: "Availability"
catalog.filters.inStockOnly       es: "Solo en stock"                  en: "In stock only"
catalog.filters.includeOutOfStock es: "Incluye agotados"               en: "Include out of stock"
catalog.filters.category          es: "Categoría"                      en: "Category"
catalog.filters.brand             es: "Marca"                          en: "Brand"
catalog.filters.style             es: "Estilo"                         en: "Style"
catalog.filters.color             es: "Color"                          en: "Color"
catalog.filters.colorGroup        es: "Filtrar por color"              en: "Filter by color"
catalog.filters.material          es: "Material"                       en: "Material"
catalog.filters.price             es: "Precio (MXN)"                   en: "Price (MXN)"
catalog.filters.priceMin          es: "Mínimo"                         en: "Minimum"
catalog.filters.priceMax          es: "Máximo"                         en: "Maximum"
catalog.filters.priceIgnored      es: "Rango de precio ignorado"       en: "Price range ignored"
catalog.filters.removeChip        es: "Quitar filtro {label}"          en: "Remove filter {label}"
catalog.filters.chipCategory      es: "Categoría: {value}"             en: "Category: {value}"
catalog.filters.chipBrand         es: "Marca: {value}"                 en: "Brand: {value}"
catalog.filters.chipStyle         es: "Estilo: {value}"                en: "Style: {value}"
catalog.filters.chipColor         es: "Color: {value}"                 en: "Color: {value}"
catalog.filters.chipMaterial      es: "Material: {value}"              en: "Material: {value}"
catalog.filters.chipPrice         es: "Precio: {min}–{max}"            en: "Price: {min}–{max}"
catalog.filters.chipOutOfStock    es: "Incluye agotados"               en: "Includes out of stock"

catalog.sort.label                es: "Ordenar resultados"             en: "Sort results"
catalog.sort.prefix               es: "Ordenar:"                       en: "Sort:"
catalog.sort.masVendidas          es: "Más vendidas"                   en: "Best selling"
catalog.sort.precioAsc            es: "Precio: menor a mayor"          en: "Price: low to high"
catalog.sort.precioDesc           es: "Precio: mayor a menor"          en: "Price: high to low"
catalog.sort.novedades            es: "Novedades"                      en: "Newest"
catalog.sort.nombreAsc            es: "Nombre: A–Z"                    en: "Name: A–Z"
catalog.sort.nombreDesc           es: "Nombre: Z–A"                    en: "Name: Z–A"

catalog.results.count             es: "{count, plural, one {# silla} other {# sillas}}"  en: "{count, plural, one {# chair} other {# chairs}}"

catalog.noResults.heading         es: "No encontramos sillas que coincidan"  en: "No chairs matched your search"
catalog.noResults.echoQuery       es: "con “{query}”"                  en: "for “{query}”"
catalog.noResults.echoFilters     es: "con los filtros seleccionados"  en: "with the selected filters"
catalog.noResults.clear           es: "Limpiar filtros"                en: "Clear filters"
catalog.noResults.popularHeading  es: "Sillas populares"               en: "Popular chairs"
```
Uses ICU `plural` (next-intl supports it) so "1 silla" / "24 sillas" are correct — matches the
existing ICU usage in `catalog.stock.lowStock`. No hard-coded user-facing text (AC-17).

---

## Config additions (single-sourced; components reference these, never literals)

`src/lib/config.ts` (per ticket "Files to Modify"):

```typescript
// Search / filter URL param names — Spanish, single-sourced (AC-9)
export const SEARCH_PARAM_KEYS = {
  q: "q",
  categoria: "categoria",
  marca: "marca",
  estilo: "estilo",
  color: "color",
  material: "material",
  precioMin: "precioMin",
  precioMax: "precioMax",
  disponibilidad: "disponibilidad", // "todos" opts into out-of-stock; default omitted = in-stock
  orden: "orden",
  page: "page",                     // existing
} as const;

export const SORT_KEYS = [
  "mas-vendidas", "precio-asc", "precio-desc",
  "novedades", "nombre-asc", "nombre-desc",
] as const;
export const DEFAULT_SORT = "mas-vendidas" as const;

export const SEARCH_QUERY_MAX = 80;             // hard cap on q (Constraint 3)
export const POPULAR_PRODUCTS_MAX = 8;          // no-results strip (AC-16)
export const FILTER_FACET_COLLAPSE_AFTER = 6;   // "Ver más" disclosure threshold
// SEARCH_DEBOUNCE_MS — reserved; only if live-search is later enabled (submit-based today)
```

---

## Pagination change (AC-15) — carry the filter query string

`makeHrefForPage(basePath)` currently returns `page<=1 ? basePath : ${basePath}?page=N`. Add a
variant that appends the active filter/sort/search query string so page links preserve state:

```typescript
// page-helpers.ts (additive; existing callers pass no query = unchanged behavior)
export function makeHrefForPage(
  basePath: string,
  query?: string,   // pre-serialized "q=malla&marca=ergovita&orden=precio-asc" (no leading ?, no page)
): (page: number) => string {
  return (page: number): string => {
    const params = query ? query : "";
    if (page <= 1) return params ? `${basePath}?${params}` : basePath;
    const sep = params ? `${params}&` : "";
    return `${basePath}?${sep}page=${page}`;
  };
}
```
`Pagination` is unchanged (it already takes `hrefForPage` as a prop). Page 1 still self-
canonicalizes to the clean filtered URL (no `?page=1`). The serialized `query` comes from the
`search-params.ts` serialize fn so param order is deterministic (stable, shareable URLs).

---

## Open Questions for Dev

1. **Sort JS-off fallback:** dual-render (native `<select>` + hydrated shadcn `Select`) vs.
   client-only toolbar `Select` with the Sheet's in-`<form>` native `<select>` as the sole JS-off
   path. Spec recommends the latter (simpler). AC-12 mandates JS-off for *search*; filters/sort
   ride the filter `<form>` — confirm sort is inside that form.
2. **Grid columns at exactly `lg` (1024px) with a 16rem sidebar:** the `1fr` column may only fit 3
   cards. Decide: gate the grid's 4th column to `xl:` inside the sidebar layout, or accept 3 cols
   at `lg`. Pure breakpoint tuning — verify visually.
3. **Filter Sheet side:** spec chose `left` (spatial consistency with MobileNav). If product
   prefers a bottom sheet (more native mobile-filter idiom), the M-1 motion swaps `translateX`→
   `translateY(100%)` with the same curve — flag before build.
4. **Mobile live-apply vs. batch-apply:** spec chose live-apply with a running "Ver N" footer
   (desktop parity, immediate feedback). If the RPC round-trip feels heavy on mobile networks,
   fall back to batch-apply (footer button commits accumulated changes). Live is better if the RPC
   stays fast (research: trivial at seed scale).
5. **Price control domain vs. cache buckets:** the slider shows the real catalog min/max for UX,
   but the parse lib snaps to bounded buckets for the cache key (Constraint 3). Confirm this
   two-layer approach (display domain ≠ cache-key buckets) is acceptable.
6. **Price chip / open-ended wording:** chips use `formatMXN` from `src/lib/money` for both
   bounds. Confirm wording for the open-ended cases ("desde $2,000", "hasta $4,000") vs. a full
   range ("$2,000–$4,000").
```