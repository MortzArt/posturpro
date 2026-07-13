# UI Design: T4 — Product Detail Page (`/producto/[slug]`)

> Scope authority: `tasks/next-ticket.md` (AC-1…AC-20, 10 edge cases, error/UX
> tables). This spec designs every PDP surface that ticket names — nothing more.
> Locked constraints honored: variant state lives in ONE client island
> (`ProductPurchasePanel`); recently-viewed is client-only localStorage with an
> empty SSR shell; zoom uses Radix `Dialog`; Hugeicons only; Tailwind only; zero
> new npm deps.

---

## Design Principles for This Feature

- **Native to the store, not a new visual language.** The PDP reuses the exact
  tokens, radii, and motion primitives already shipped in T2/T3
  (`--ease-out: cubic-bezier(0.23,1,0.32,1)`, `.card-lift`, `.stagger`,
  `.enter-fade`, `aspect-[4/5]`, `rounded-lg`, `border-border`, `bg-card`,
  `tabular-nums`, `motion-safe:animate-pulse`). A shopper coming from a grid card
  should feel zero seam.
- **The design system is monochrome (grayscale oklch).** There is no brand hue.
  The ONLY chromatic accents in the whole app are `amber` (low-stock urgency) and
  `destructive` (errors). Color-variant swatches are the sole place real product
  color appears — treat them as the visual focal point, everything else stays
  neutral. Do NOT introduce a new accent color.
- **Conversion clarity over decoration.** Price, stock, and the variant a shopper
  is looking at must be unambiguous at a glance. Motion serves comprehension
  (which image/price/stock belongs to the selected color), never spectacle.
- **Frequency governs motion.** Swatch selection happens tens of times/session →
  minimal, instant-feeling (crossfade < 200ms, no slide). Zoom is occasional →
  standard modal motion. Page entrance is rare → a justified `.enter-fade`.
- **Dense, compact chrome.** The button scale is small (`h-7` default, `lg` = `h-8`).
  Match it: the Q&A submit is `size="lg"` at most; do not oversize controls (but
  bump to `min-h-11` on mobile for tap targets, like `EmptyState` does).
- **No dead affordances.** Cart is T6 — render NO "add to cart" button, disabled
  or otherwise (ticket + research anti-pattern). The purchase panel ends at the
  stock badge.

---

## Design Tokens Used

| Category | Tokens | Notes |
| --- | --- | --- |
| Color | `bg-background` `text-foreground` `bg-card` `bg-muted` `text-muted-foreground` `border-border` `bg-primary`/`text-primary-foreground` (Q&A submit) `ring-ring` `text-destructive`/`bg-destructive/10` (errors) `text-amber-600 dark:text-amber-400` (low stock, via StockBadge) | No new tokens. No new accent hue. |
| Radius | `rounded-lg` (cards, gallery frame), `rounded-md` (buttons, inputs, focus targets), `rounded-full` (badge, swatches), `rounded-sm` (small focus rings) | From `--radius: 0.625rem` scale. |
| Typography | `text-2xl md:text-3xl font-semibold tracking-tight` (product name / h1), `text-sm font-medium tracking-tight` (section headings h2), `text-xs text-muted-foreground` (meta/labels), `text-xl md:text-2xl font-semibold tabular-nums` (price), `line-through tabular-nums text-muted-foreground` (compare-at), `text-sm/relaxed` (body/answers) | `tabular-nums` on ALL money + counters. `tracking-tight` on headings (site convention). |
| Spacing | container `mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8` (matches `CatalogPageSkeleton` exactly); section gap `mt-10 md:mt-12`; two-column `grid lg:grid-cols-2 lg:gap-10` | Reuse the catalog container so the PDP aligns with grid pages. |
| Motion easing | `--ease-out` for all enter/interaction; reduced-motion & hover gates copied from `globals.css` conventions | New PDP transitions live in `globals.css` following the same block style. |
| Elevation | `card-lift` hover `box-shadow: var(--shadow-sm)`; zoom scrim `bg-background/80 backdrop-blur-sm` | No new shadow tokens. |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring` (+ `ring-offset-2 ring-offset-background` on cards/swatches) | Matches shell + button convention. |

---

## Component Inventory

### shadcn / Radix primitive audit (shadcn-first)

Only **`button.tsx`** exists in `src/components/ui/`. shadcn `Dialog`, `Input`,
`Textarea`, `Label`, `RadioGroup` are **NOT installed**. The `radix-ui` package IS
a dependency (used by `button.tsx`: `import { Slot } from "radix-ui"`). Decisions:

| Need | Use | Rationale |
| --- | --- | --- |
| Zoom lightbox | `Dialog` from the installed `radix-ui` package (`import { Dialog } from "radix-ui"`, same import style as `Slot`) | Free focus trap, Escape, backdrop dismiss, `aria-modal`, scroll lock (AC-6, AC-18). No new dep. Do NOT `npx shadcn add dialog` — the raw Radix primitive is enough. |
| Q&A submit button | existing `Button` (`@/components/ui/button`, `variant="default" size="lg"`) | Reuse. |
| Variant selector | native `<button role="radio">` inside a `role="radiogroup"` container — hand-rolled roving-tabindex | AC-7/AC-18 want a radiogroup of color swatches; Radix RadioGroup isn't installed and swatches need custom color rendering. Small, avoids a dep. |
| Text inputs | native `<input>` / `<textarea>` styled with Tailwind to match the token system | No `Input`/`Textarea` primitive; only 2 fields. Keep it a local pattern, not a new `ui/` primitive. |

### T3 components reused verbatim (no changes)

| Component | Reuse for | Notes |
| --- | --- | --- |
| `StockBadge` (`catalog/stock-badge.tsx`) | AC-11 stock indicator; per-swatch state | Documents "inline on a PDP" placement. Pass pre-resolved `catalog.stock.*` label + `state`. On PDP use **inline** (no `absolute`). |
| `Breadcrumbs` + `Crumb` (`catalog/breadcrumbs.tsx`) | AC-4 trail `Inicio › Sillas › {name}` | `items=[{label:home,href:'/'},{label:catalog,href:CATALOG_PATH},{label:product.name}]` (last crumb no `href` = current). `ariaLabel`/`moreLabel` from copy below. |
| `ProductCard` (`catalog/product-card.tsx`) | Recently-viewed strip tiles | Its `CatalogProductCard` shape is the target for stored entries; render tiles identically to the grid (no re-fetch). |
| `EmptyState` (`catalog/empty-state.tsx`) | Reference for Q&A empty visual grammar | Q&A empty state is bespoke (icon + copy + form as CTA below), modeled on this component's centered-icon + `.enter-fade` pattern, not this component itself. |
| Card placeholder pattern (in `product-card.tsx`) | AC-5 gallery no-image tile | `<span role="img" aria-label> + Hugeicons Image01Icon size=40 strokeWidth=1.5 text-muted-foreground` on `bg-muted aspect-[4/5]`. |

### New components (all under `src/components/product/`)

---

### `ProductPurchasePanel`  *(new, `"use client"` — the ONE selection island)*

**Purpose**: Single source of truth for `selectedVariantId`. Owns selection state
and derives (via pure helpers in `lib/catalog/variant-selection.ts`) the images /
effective price / stock state, then feeds them to gallery, price, and stock badge
so all three stay in sync (AC-7). Locked architecture — do not scatter state.

**Location**: Right column on `lg+`, below the gallery on mobile.

**shadcn base**: none (composition container).

**Layout**:
```
┌──────────────────────────────────────────┐
│  {brandName}                    (text-xs) │   ← optional
│  Silla Ergonómica Aria           (h1)     │
│                                            │
│  $8,499.00   $9,999.00        (price row) │   ← struck compare-at only if >
│                                            │
│  [✓ En stock]                (StockBadge) │   ← inline
│                                            │
│  Color: Negro                  (label)    │
│  (●) (○) (○) (○)          (VariantSelector radiogroup)
│                                            │
│  ‹aria-live status: "Negro — $8,499 — En stock"›
└──────────────────────────────────────────┘
```

**Props**:
```typescript
interface ProductPurchasePanelProps {
  productName: string;
  brandName: string | null;
  basePriceCents: number;
  compareAtPriceCents: number | null;
  productStock: number;               // product-level stock (no-variant case)
  variants: ProductVariantView[];     // [] when the product has none
  sharedImages: ProductImageView[];   // variant_id === null images (fallback set)
  imagesByVariant: Record<string, ProductImageView[]>; // pre-grouped by variant_id
  /** Pre-resolved, per-variant display strings so the panel does NO i18n (SRP).
   *  See Open Question #2 — recommended: build this map on the server. */
  variantDisplay: Record<string, {
    colorLabel: string;               // "Color: Negro"
    swatchName: string;               // accessible radio name, incl. "(agotado)" when out
    stockState: StockState;
    stockLabel: string;               // resolved "En stock"/"Solo quedan 3"/"Agotado"
    effectivePriceLabel: string;      // formatMXN(effectivePrice)
    liveStatus: string;               // "Negro — $8,499.00 — En stock"
  }>;
  /** No-variant display (product-level). */
  productDisplay: {
    stockState: StockState;
    stockLabel: string;
    effectivePriceLabel: string;
  };
  labels: {
    variantGroupLabel: string;        // radiogroup aria-label ("Elige un color")
    galleryRegion: string; galleryZoom: string; galleryClose: string;
    thumbnailAlt: string;             // "Ver imagen {number}" template
    imagePlaceholder: string;
    priceCompareLabel: string;        // sr-only "Precio anterior:"
  };
}
```

**Responsive**:
| Breakpoint | Layout |
| --- | --- |
| < 1024px | Full-width, stacked below gallery. Price row `text-xl`. |
| ≥ 1024px | Right grid column, top-aligned with gallery. Price row `text-2xl`. |

**Animations**: price + badge crossfade on variant change (see M5). No own mount
animation (page-level `.enter-fade` covers it).

---

### `ProductGallery`  *(new, `"use client"`)*

**Purpose**: Main image + thumbnail rail + zoom trigger. Receives the image set
for the currently-selected variant. AC-5, AC-6, AC-18, edges 1 & 8.

**Location**: Left column `lg+`, top on mobile.

**shadcn base**: raw Radix `Dialog` (zoom lightbox only).

**Layout (desktop)**:
```
┌───────────────────────────────┐
│                          [⤢]  │   aspect-[4/5], rounded-lg, bg-muted,
│         MAIN IMAGE            │   overflow-hidden, cursor-zoom-in;
│      (activate → zoom)        │   [⤢] zoom icon top-right, shows on hover/focus
└───────────────────────────────┘
[▢][▢][▢][▢]                      thumb rail; selected = ring-2 ring-foreground
```

**Layout (mobile)**: main full-width `aspect-[4/5]`; thumbnails horizontally
scrollable (`flex gap-2 overflow-x-auto`, each `shrink-0 size-16` = 64px ≥44px).

**Props**:
```typescript
interface ProductGalleryProps {
  images: ProductImageView[];   // for the selected variant (resolved by panel)
  productName: string;          // alt fallback
  labels: {
    imagePlaceholder: string;   // AC-5 no-image tile
    zoom: string;               // "Ampliar imagen"
    close: string;              // "Cerrar"
    thumbnailAlt: string;       // "Ver imagen {number}"
    regionLabel: string;        // "Galería del producto"
  };
}
// ProductImageView: { id; url; altText: string | null; isPrimary: boolean; sortOrder: number; variantId: string | null }
```

**Internal state**: `activeIndex`, `zoomOpen`. On `images` prop change, reset
`activeIndex → 0` and clamp if the new set is shorter (edge 8 — idempotent, no
stuck image).

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Has images | Main `next/image fill sizes` + thumb rail | Click thumb → swap main (crossfade). Click main / ⤢ → open Dialog. |
| Single image | Main image, no thumb rail | Zoom still available. |
| Zero images (edge 1) | Placeholder tile `bg-muted aspect-[4/5] rounded-lg` + centered `Image01Icon`, `role="img" aria-label="{name} — {imagePlaceholder}"` | **No zoom affordance** (AC-5). No thumb rail. |
| Image load error | `next/image onError` → placeholder tile for that slot; alt retained | Never a broken `<img>` (error table). |
| Zoom open | `Dialog.Overlay` (`bg-background/80 backdrop-blur-sm`) + centered `Dialog.Content` full-res image (`max-h-[90vh] max-w-[90vw] object-contain`) + visible `Dialog.Close` (`Cancel01Icon` icon button, top-right, ≥44px) | Escape / backdrop / close dismiss; focus trapped; returns to trigger (Radix). |

**Z-index**: Dialog portals at `z-50` (must exceed sticky header `z-40`).

**Responsive**:
| Breakpoint | Change |
| --- | --- |
| < 640px | Thumb rail scrollable `size-16`; main full-width. |
| 640–1024px | Thumbs wrap under image. |
| ≥ 1024px | Gallery is left grid column; thumbs `flex-wrap gap-2`. |

**Animations**:
- **M1 Main-image swap** (thumb OR variant switch): **Crossfade** (`opacity` only,
  never slide/scale-from-0), `200ms var(--ease-out)`; optional `filter: blur(2px)`
  on the outgoing frame to mask the swap. Key `<Image>` on active image `id` + a
  `.gallery-image` `@starting-style` opacity 0→1. Interruptible (keyed CSS
  transition) → no stuck frame on rapid retarget (edge 8). Reduced motion: instant
  opacity swap, no blur.
- **M4 Zoom trigger press**: `:active { transform: scale(0.97) }` `120ms`.
- **M2 Zoom Dialog enter**: MODAL → `transform-origin: center` (NOT trigger-origin,
  per Emil modals-are-exempt rule). `opacity 0→1` + `scale(0.95→1)`,
  `200ms var(--ease-out)` off Radix `[data-state]`; exit `150ms`. CSS transition
  (interruptible). Reduced motion: opacity only, `transform: none`.
- **M3 Scrim**: `opacity 0→1` `200ms` / `150ms` exit.
- **M6 Thumbnail hover**: gated `@media (hover:hover) and (pointer:fine)` — opacity
  lift on non-selected thumbs, color/opacity only, no transform.

---

### `VariantSelector`  *(new, `"use client"`)*

**Purpose**: One color swatch per variant; a `radiogroup` raising the selected id
to the panel (AC-7, AC-18). Not rendered when 0 variants (AC-8).

**Location**: Inside `ProductPurchasePanel`, below the stock badge.

**shadcn base**: none — hand-rolled roving-tabindex radiogroup.

**Layout**:
```
Color: Negro                    ← live label, updates on selection
(●)  (○)  (○)  (○)
 sel                             ← selected: ring-2 ring-foreground ring-offset-2
```
Each swatch: `size-9` (36px) round button + a padding wrapper so the hit target is
≥44px; `background: color_hex` inline; `rounded-full border border-border` (keeps
white/near-white swatches visible). Selected → `ring-2 ring-foreground ring-offset-2
ring-offset-background`. Out-of-stock swatch → `opacity-60` + a colorless
diagonal-slash overlay (legible without color, edge 2); still selectable.

**Props**:
```typescript
interface VariantSelectorProps {
  variants: ProductVariantView[];       // length ≥ 1 (parent gates 0)
  selectedVariantId: string;
  onSelect: (variantId: string) => void;
  groupLabel: string;                    // radiogroup aria-label
  swatchNames: Record<string, string>;   // id → accessible name incl. "(agotado)"
  outOfStock: Record<string, boolean>;   // id → dim + slash
}
// ProductVariantView: { id; colorName; colorHex: string | null; priceOverrideCents: number | null; stock; sortOrder }
```

**A11y (AC-18)**:
- Container `role="radiogroup" aria-label={groupLabel}`.
- Each swatch `role="radio" aria-checked` + `aria-label={swatchNames[id]}`.
- **Roving tabindex**: selected `tabIndex=0`, others `-1`. Arrow keys move
  selection+focus (wrapping); Space/Enter select; Home/End jump. Standard contract.
- `colorHex === null` → neutral `bg-muted` swatch; accessible name still carries
  `colorName`, so color is never the only signal.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Default | `flex flex-wrap gap-2` swatches | Wraps on narrow screens. |
| Selected | `ring-2 ring-foreground ring-offset-2` | One at a time. |
| Out-of-stock variant | `opacity-60` + colorless slash | Still selectable → badge "Agotado". |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring` | Selection ring = `ring-foreground`; focus ring = `ring-ring` (distinct). |

**Animations**:
- **M4 Press feedback**: `:active { transform: scale(0.97) }` `120ms var(--ease-out)`
  (`.swatch-press`). High-frequency control → NO enter, NO hover scale. Selection
  ring appears instantly (≤100ms opacity max). Reduced motion: drop press scale.

---

### Price display  *(inline within `ProductPurchasePanel`, not a component)*

**AC-9, edge 3.** Effective price = `variant.priceOverrideCents ?? basePriceCents`.
Compare-at struck ONLY when `compareAtPriceCents > effectivePrice`.
```
$8,499.00   $9,999.00
 current     struck (sr-only "Precio anterior:" prefix)
```
- Current: `text-xl md:text-2xl font-semibold tabular-nums text-foreground`.
- Struck: `text-sm tabular-nums text-muted-foreground line-through`, preceded by
  `sr-only` "Precio anterior:" so SR announces the was-price.
- Keyed on the price value → **M5 Crossfade** (opacity 150ms) on variant change.
  Recomputed per selection, never stale (edge 3).
- **aria-live**: a single `aria-live="polite" aria-atomic="true"` status line under
  the swatches announces the coherent selection ("Negro — $8,499.00 — En stock"),
  so SR users hear one update, not three (AC-18).

---

### `ProductSpecs`  *(new, server component)*

**Purpose**: AC-10 specs. Pure render; `buildSpecRows` (in `lib/catalog/specs.ts`,
pure/unit-testable) does mm→cm, g→kg, and null-omission. Section hidden if all null.

**Location**: Below the two-column block, full width.

**Layout**:
```
Especificaciones                       (h2, text-sm font-medium tracking-tight)
Ancho            60 cm    │  Material del marco  Aluminio
Profundidad      55 cm    │  Tapicería           Malla
Altura           110 cm   │  Acabado             Negro
Altura asiento   45 cm    │  Peso                15 kg
   two-column dl; mobile stacks to one pair per row
```

**Props**:
```typescript
interface ProductSpecsProps {
  rows: SpecRow[];   // pre-built, nulls omitted, values formatted "60 cm"/"15 kg"/"Malla"
  heading: string;   // "Especificaciones"
}
// SpecRow: { label: string; value: string }
```
> If `rows.length === 0`, the PAGE does not render `<ProductSpecs>` at all (AC-10).

**Markup**: `<dl>` in `grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2`; each row a
`<div class="flex justify-between gap-4 border-b border-border/60 py-2">` with
`<dt class="text-sm text-muted-foreground">` + `<dd class="text-sm font-medium tabular-nums text-foreground text-right">`.

**States**: has-rows only (parent gates). No loading (route skeleton covers it).

**Animations**: none (static). Inherits page `.enter-fade`.

---

### `ProductQa`  *(new, server)* + `QaForm`  *(new, `"use client"`)*

**Purpose**: AC-13/14/15. Server lists PUBLISHED questions (newest-first) + renders
the client form.

**Location**: Bottom section, full width, form/list in a `max-w-2xl` column.

**Layout (has questions)**:
```
Preguntas y respuestas                 (h2)
Q  ¿La malla es transpirable?
   — María G.                          (text-xs muted)
A  Sí, la malla permite ventilación…   (muted block, bg-muted/50 rounded-md p-3)
──────────────────────────────────────
Haz una pregunta                        (form heading, h2)
Nombre     [__________________]
Pregunta   [__________________]
           [__________________]  1980/2000
(honeypot: off-screen)
                        [ Enviar pregunta ]
```

**Layout (no published questions — AC-13)**:
```
Preguntas y respuestas
   💬 (MessageQuestion02Icon, size 40, text-muted-foreground)
   Sé el primero en preguntar
   ¿Tienes dudas sobre esta silla? Pregúntanos abajo.
   [ form directly below as the CTA ]
```

**`ProductQa` props**:
```typescript
interface ProductQaProps {
  productId: string;
  questions: ProductQuestionView[];   // published, newest-first
  labels: { heading; emptyTitle; emptyBody; answerPrefix; };
  formLabels: QaFormProps["labels"];  // forwarded
  maxName: number; maxQuestion: number;
}
// ProductQuestionView: { authorName; question; answer; answeredAt: string | null; createdAt: string }
```

**`QaForm` props**:
```typescript
interface QaFormProps {
  productId: string;
  maxName: number;      // AUTHOR_NAME_MAX (120)
  maxQuestion: number;  // QUESTION_MAX (2000)
  labels: {
    formHeading; nameLabel; namePlaceholder; questionLabel; questionPlaceholder;
    submit; submitting; counter /* "{count}/{max}" */; honeypotLabel;
    nameRequired; nameTooLong; questionRequired; questionTooLong;
    successTitle; successBody; rateLimited; unavailable; errorRetry;
  };
}
```

**Rendering safety (AC-13, security)**: author/question/answer are **text nodes
only** — never `dangerouslySetInnerHTML`. Each item `<article class="border-b
border-border py-4">`; question `<p class="text-sm font-medium break-words">`;
author `<p class="text-xs text-muted-foreground">`; answer in
`<div class="mt-2 rounded-md bg-muted/50 p-3 text-sm/relaxed break-words">`. Long
text (to 2000 chars) wraps; NO clamp on answers; `max-w-2xl` holds (edge 10).

**Field styling** (match token system):
```
w-full rounded-md border border-border bg-background px-3 py-2 text-sm
text-foreground outline-none placeholder:text-muted-foreground
focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30
aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20
```
Textarea: `min-h-24 resize-y`.

**Honeypot (AC-15)**: real `<input name="website">` in an off-screen wrapper
`<div class="absolute left-[-9999px]" aria-hidden="true">`, `tabIndex={-1}`,
`autoComplete="off"`, sr-only label. NOT `display:none`/`hidden` (bots skip those).
Filled → server returns success WITHOUT insert (indistinguishable UI).

**States** (`useActionState`-driven):
| State | Visual | Behavior |
| --- | --- | --- |
| Idle | empty/valid form | — |
| Typing near limit | counter `muted → amber-600` within 10% of max, `destructive` at/over | input capped at max client-side; server re-validates trimmed |
| Field invalid | field `aria-invalid` + red ring; inline `<p role="alert" class="text-xs text-destructive">`; focus → first invalid field | blocks submit; input preserved |
| Submitting | button disabled, label → "Enviando…"; fast-spin spinner optional | `useActionState` pending |
| Success | form clears; `role="status"` note (`bg-muted/50 rounded-md p-3`) with title+body; **focus moves to note** | not shown in list (is_published=false) |
| Rate-limited | inline `role="alert"` friendly message; input preserved | no insert |
| Unavailable (edge 5) | inline `role="alert"` "ya no está disponible"; input preserved | RLS denial mapped by action |
| Transient error | inline `role="alert"` "inténtalo de nuevo" + submit acts as retry; input preserved | retryable |

**Responsive**: single column, `max-w-2xl`; submit `w-full sm:w-auto sm:self-end`,
`min-h-11` on mobile.

**Animations**:
- **M8 Field error + success note**: `.enter-fade`-style opacity + 8px rise
  (`150–200ms ease-out`). Reduced motion: opacity only.
- **No shake/wiggle** on blocked submit — inline error + focus move + red ring
  already communicate (Emil: motion only with purpose; the form is retried often).
- Submit button inherits `Button` `:active`.

---

### `RecentlyViewed`  *(new, `"use client"`, empty SSR shell)*

**Purpose**: AC-12, edge 7. Records the current product on mount; renders up to
`RECENTLY_VIEWED_MAX` (8) prior products, newest-first, excluding current.
localStorage only, guarded. Empty SSR shell (renders `null` until hydrated).

**Location**: Between specs and Q&A (AC-19 order).

**shadcn base**: none; tiles reuse `ProductCard`.

**Layout**:
```
Vistos recientemente                    (h2)
[card][card][card][card]                grid on desktop / scroll rail on mobile
```

**Props**:
```typescript
interface RecentlyViewedProps {
  current: RecentlyViewedEntry;   // recorded on mount
  heading: string;                // "Vistos recientemente"
  cardLabels: {                   // ProductCard needs pre-resolved labels
    stockByState: Record<StockState, string>;
    imagePlaceholder: string;
    colorsCount: string;          // "{count} colores" template
  };
}
// RecentlyViewedEntry mirrors the storable CatalogProductCard fields:
// { id; slug; name; brandName: string | null; priceCents; compareAtPriceCents: number | null;
//   coverImageUrl: string | null; coverAlt; colorCount; stockState: StockState; lowStockN: number | null }
```
> **Storage shape** (Open Q #1): store the *card view model* so tiles render
> identically to the grid without a re-fetch, keeping the strip client-only and
> instant. Price/stock may be slightly stale — acceptable for a convenience strip;
> the tile links to the live PDP. `lib/recently-viewed.ts` owns get/add (dedupe by
> slug, cap 8, newest-first, quota + SSR guarded).

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| SSR / pre-hydration | `null` (empty shell) | No hydration mismatch. |
| No history / only current (AC-12) | `null` — section not rendered | No empty shell UI. |
| localStorage unavailable (edge 7) | `null` + one guarded `console.warn` | Page unaffected. |
| Has history | `ProductCard` tiles, `.stagger` entrance | Each links to its PDP. |

**Responsive**:
| Breakpoint | Layout |
| --- | --- |
| < 640px | Scrollable rail `flex gap-4 overflow-x-auto snap-x`, tile `w-40 shrink-0 snap-start`. |
| ≥ 640px | `grid grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8`, cap visible at 4. |

**Animations**:
- **M7 Tiles**: existing `.stagger` (opacity + 8px rise, 200ms ease-out, capped
  per-item delay), plays once on mount. Reduced motion: opacity only.
- No auto-scroll / marquee (motion without purpose).

---

### `PdpSkeleton`  *(new, in `product/pdp-skeleton.tsx` or export from `catalog-skeleton.tsx`)*

**Purpose**: route `loading.tsx` content, mirroring the PDP layout pixel-for-pixel
(no layout shift). `motion-safe:animate-pulse`, `bg-muted`, `rounded`.

**Layout**:
```
[breadcrumb bars]
┌ gallery box ┐  ┌ brand bar          ┐
│ aspect-[4/5]│  │ title bar (h-8)     │
│ bg-muted    │  │ price bar (h-6)     │
└─────────────┘  │ badge chip          │
[thumb dots]     │ swatch dots ●●●●    │
[specs: 4 label/value bar rows]
[Q&A: heading bar + 2 question-block bars + form field bars]
```
- **Props**: `{ className?: string }` (mirror `CatalogPageSkeleton`).
- Reuse container `mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8`.
- Gallery box `aspect-[4/5] w-full rounded-lg bg-muted motion-safe:animate-pulse`
  (matches the real frame exactly).
- **Do NOT skeleton the recently-viewed strip** (client-only, empty SSR shell — a
  skeleton there would be a phantom). Q&A form skeleton = simple field bars.

---

## Page Layout

### `/producto/[slug]` — desktop (≥ 1024px)
```
Header (sticky, h-16, z-40)
Inicio › Sillas › Silla Ergonómica Aria        (breadcrumbs)
┌ GALLERY ─────────┐   ┌ PURCHASE PANEL ──────────┐
│ aspect-[4/5] [⤢] │   │ Marca                     │
│                  │   │ Silla … Aria (h1)         │
│ [▢][▢][▢] thumbs │   │ $8,499  $9,999            │
└──────────────────┘   │ [✓ En stock]              │
                       │ Color: Negro / (●)(○)(○)  │
                       └───────────────────────────┘
Especificaciones          [ dl two-column ]
Vistos recientemente      [card][card][card][card]
Preguntas y respuestas    [ Q&A list ] [ ask form ]
Footer
```
Split: `grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10` (gallery left, panel
right). Sections below full-width, separated by `mt-10 md:mt-12`.

### Tablet (768px)
Gallery + panel stay single column (ticket allows discretion below `lg`) for a
larger gallery; the 2-col grid begins at `lg` only.

### Mobile (375px) — single column, order gallery → info → specs → recently-viewed → Q&A (AC-19)
```
Header (h-14)
Inicio › … › Aria           (breadcrumb collapses middle to …)
[ GALLERY full-width aspect-[4/5], ⤢ ]
[▢][▢][▢]→                  scrollable thumb rail
Marca / Silla … Aria
$8,499 $9,999 / [✓ En stock]
Color: Negro / (●)(○)(○)(○) swatches wrap
Especificaciones            2-col dl → stacks
Vistos recientemente        scrollable card rail
Preguntas y respuestas      stacked Q&A + form
Footer
```
No horizontal scroll at 320px: swatches wrap, breadcrumb collapses, only the
thumb/card rails use intentional `overflow-x-auto` (they don't overflow the body).
Container `px-4` at 320.

---

## Interaction Flows

### Flow 1 — Select a color variant (AC-7, edges 3 & 8)
1. Shopper clicks/taps a swatch (or arrow-keys + Space).
2. `VariantSelector` → `onSelect(id)` → panel sets `selectedVariantId` (synchronous
   React state, no network).
3. Pure helpers recompute images (variant → shared fallback → placeholder),
   effective price (`override ?? base`), stock state.
4. Gallery main image **crossfades** to the variant's primary (index reset to 0);
   price number crossfades; compare-at strike recomputes; StockBadge swaps.
5. `aria-live` announces "{color} — {price} — {stock}".
6. Rapid clicks: idempotent; gallery retargets to the latest selection, no stuck
   frame (edge 8).

### Flow 2 — Zoom an image (AC-6)
1. Activate main image (click/Enter/Space) or the ⤢ icon.
2. Radix `Dialog` opens: scrim fades in (200ms); content **scale(0.95→1) + opacity**
   (200ms ease-out, center origin). Focus trapped; close button focused.
3. Dismiss via Escape / backdrop / ✕ → content exits (150ms) → focus **returns to
   trigger** (Radix).
4. Reduced motion: opacity-only enter/exit.

### Flow 3 — Ask a question (AC-14/15, edges 4 & 5)
1. Fill Nombre + Pregunta; counter live; input capped at max.
2. Submit → client validates **trimmed** values (name 1–120, question 1–2000).
   Invalid → inline errors, focus to first invalid, no network.
3. Valid → `useActionState` calls the server action; button "Enviando…", disabled.
4. Server: honeypot → trim → length → rate-limit → anon insert (RLS).
5. Result: success (clears, note, focus moves) / honeypot (identical success, no
   insert) / rate-limited / unavailable (edge 5) / transient (retry). Input
   preserved on every failure.

### Flow 4 — Recently-viewed (AC-12, edge 7)
1. Component mounts (client) → reads localStorage (guarded), prepends current
   (dedupe by slug, cap 8), writes back.
2. Renders tiles for entries ≠ current slug, `.stagger` in.
3. No other entries or storage throws → `null` (no section, one guarded warn).

---

## All UI States (consolidated)

| Surface | Loading | Empty | Error | Success / Special |
| --- | --- | --- | --- | --- |
| Page | `loading.tsx` → `PdpSkeleton` | — (missing product = 404, not empty) | `error.tsx` localized panel + retry (edge 9) | `.enter-fade` on mount |
| Gallery | part of page skeleton | zero images → placeholder tile, no zoom (edge 1) | image load error → placeholder tile | crossfade on switch |
| Variant selector | — | N/A (no variants → not rendered, AC-8) | — | all-out-of-stock → each swatch dim+slash, still selectable (edge 2) |
| Price/badge | — | — | — | recomputes per variant (edge 3); aria-live announced |
| Specs | part of page skeleton | all-null → section hidden (AC-10) | — | — |
| Recently-viewed | renders nothing | no history → not rendered (AC-12) | storage throws → not rendered + 1 warn (edge 7) | tiles `.stagger` in |
| Q&A list | field-bar skeleton (optional) | no published Q → empty state + form as CTA (AC-13) | — | — |
| Q&A form | renders after hydration | idle | field/rate-limit/unavailable/transient inline (error table) | clears + success note + focus move (AC-14) |

---

## Copy — both locales (new `product` namespace)

Add to `src/messages/es-MX.json` (default) + `src/messages/en.json`. Tone matches
`catalog`: concise, warm, informal "tú" imperative in Spanish. Reuse existing
`catalog.stock.*` for badge labels — do NOT duplicate them into `product`.

### es-MX (`product`)
```jsonc
"product": {
  "metadata": { "titlePattern": "{name} — {store}", "descriptionFallback": "Silla ergonómica en PosturPro." },
  "breadcrumb": { "ariaLabel": "Ruta de navegación", "home": "Inicio", "catalog": "Sillas" },
  "gallery": {
    "regionLabel": "Galería del producto", "zoom": "Ampliar imagen", "close": "Cerrar",
    "thumbnailAlt": "Ver imagen {number}", "imagePlaceholder": "Imagen no disponible"
  },
  "variant": {
    "groupLabel": "Elige un color", "colorLabel": "Color: {name}",
    "outOfStockName": "{name} (agotado)", "selection": "{color} — {price} — {stock}"
  },
  "price": { "comparePrevious": "Precio anterior:" },
  "specs": {
    "heading": "Especificaciones", "width": "Ancho", "depth": "Profundidad", "height": "Altura",
    "seatHeight": "Altura del asiento", "weight": "Peso", "frameMaterial": "Material del marco",
    "upholstery": "Tapicería", "finish": "Acabado", "unitCm": "{value} cm", "unitKg": "{value} kg"
  },
  "recentlyViewed": { "heading": "Vistos recientemente" },
  "qa": {
    "heading": "Preguntas y respuestas",
    "emptyTitle": "Sé el primero en preguntar",
    "emptyBody": "¿Tienes dudas sobre esta silla? Pregúntanos abajo.",
    "answerPrefix": "Respuesta",
    "form": {
      "heading": "Haz una pregunta", "nameLabel": "Nombre", "namePlaceholder": "Tu nombre",
      "questionLabel": "Pregunta", "questionPlaceholder": "¿Qué te gustaría saber?",
      "counter": "{count}/{max}", "submit": "Enviar pregunta", "submitting": "Enviando…",
      "honeypotLabel": "No llenar este campo"
    },
    "validation": {
      "nameRequired": "Ingresa tu nombre.",
      "nameTooLong": "El nombre no puede pasar de {max} caracteres.",
      "questionRequired": "Escribe tu pregunta.",
      "questionTooLong": "La pregunta no puede pasar de {max} caracteres."
    },
    "result": {
      "successTitle": "Recibimos tu pregunta",
      "successBody": "Aparecerá aquí en cuanto la respondamos.",
      "rateLimited": "Ya enviaste una pregunta hace poco. Espera un momento antes de enviar otra.",
      "unavailable": "Esta silla ya no está disponible.",
      "errorRetry": "No pudimos enviar tu pregunta. Inténtalo de nuevo."
    }
  }
}
```

### en (`product`)
```jsonc
"product": {
  "metadata": { "titlePattern": "{name} — {store}", "descriptionFallback": "Ergonomic chair at PosturPro." },
  "breadcrumb": { "ariaLabel": "Breadcrumb", "home": "Home", "catalog": "Chairs" },
  "gallery": {
    "regionLabel": "Product gallery", "zoom": "Zoom image", "close": "Close",
    "thumbnailAlt": "View image {number}", "imagePlaceholder": "Image unavailable"
  },
  "variant": {
    "groupLabel": "Choose a color", "colorLabel": "Color: {name}",
    "outOfStockName": "{name} (out of stock)", "selection": "{color} — {price} — {stock}"
  },
  "price": { "comparePrevious": "Was:" },
  "specs": {
    "heading": "Specifications", "width": "Width", "depth": "Depth", "height": "Height",
    "seatHeight": "Seat height", "weight": "Weight", "frameMaterial": "Frame material",
    "upholstery": "Upholstery", "finish": "Finish", "unitCm": "{value} cm", "unitKg": "{value} kg"
  },
  "recentlyViewed": { "heading": "Recently viewed" },
  "qa": {
    "heading": "Questions & answers",
    "emptyTitle": "Be the first to ask",
    "emptyBody": "Have questions about this chair? Ask us below.",
    "answerPrefix": "Answer",
    "form": {
      "heading": "Ask a question", "nameLabel": "Name", "namePlaceholder": "Your name",
      "questionLabel": "Question", "questionPlaceholder": "What would you like to know?",
      "counter": "{count}/{max}", "submit": "Send question", "submitting": "Sending…",
      "honeypotLabel": "Do not fill this field"
    },
    "validation": {
      "nameRequired": "Enter your name.",
      "nameTooLong": "Name can't be longer than {max} characters.",
      "questionRequired": "Write your question.",
      "questionTooLong": "Question can't be longer than {max} characters."
    },
    "result": {
      "successTitle": "We got your question",
      "successBody": "It will appear here once we answer it.",
      "rateLimited": "You just sent a question. Please wait a moment before sending another.",
      "unavailable": "This chair is no longer available.",
      "errorRetry": "We couldn't send your question. Please try again."
    }
  }
}
```

---

## Motion Spec (animation-vocabulary terms — unambiguous for dev)

New CSS lives in `globals.css` in the established block style (comment header,
`--ease-out`, `[data-state]` off Radix, `@media (prefers-reduced-motion)` gate,
`@media (hover:hover) and (pointer:fine)` for hover).

| # | Element | Effect (vocabulary term) | Trigger | Property | Easing | Duration | Reduced-motion fallback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Gallery main image | **Crossfade** + optional 2px **Blur** mask | thumb click OR variant switch | `opacity` (+ `filter: blur`) | `var(--ease-out)` | 200ms | instant opacity swap, no blur |
| M2 | Zoom Dialog content | **Scale in** (0.95→1) + **Fade in**, `transform-origin: center` (MODAL) | dialog open | `transform`, `opacity` | `var(--ease-out)` | 200ms enter / 150ms exit | opacity only, `transform: none` |
| M3 | Zoom scrim | **Fade in** | dialog open | `opacity` | ease | 200ms / 150ms exit | unchanged (opacity allowed) |
| M4 | Zoom trigger + swatches + submit | **Press / Tap feedback** (scale 0.97) | `:active` | `transform` | `var(--ease-out)` | 120ms | `transform: none` |
| M5 | Price number + stock line | **Crossfade** (keyed span) | variant switch (value change) | `opacity` | `var(--ease-out)` | 150ms | instant swap |
| M6 | Thumbnails (non-selected) | **Hover effect** (opacity lift) | hover, gated pointer | `opacity` | ease | 120ms | none (hover gate excludes touch) |
| M7 | Recently-viewed tiles | **Stagger** entrance (reuse `.stagger`) | client mount | `opacity`, `transform` | `var(--ease-out)` | 200ms, ≤80ms/item cap | opacity only, no delay |
| M8 | Q&A field error + success note | **Fade in** + 8px rise (reuse `.enter-fade`) | validation fail / submit success | `opacity`, `transform` | `var(--ease-out)` | 150–200ms | opacity only |
| M9 | Whole page main | **Fade in** (reuse `.enter-fade`) | route mount | `opacity`, `transform` | `var(--ease-out)` | 200ms | opacity only |

Baseline compliance (AC-20): enter animations `ease-out` only; only
`transform`/`opacity` animated (blur is a compositor filter, capped 2px, used
sparingly); zoom/variant transitions < 300ms; all interruptible (CSS transitions +
keyed elements, no gesture-blocking); `prefers-reduced-motion` honored everywhere.
**No animation on any keyboard-repeated action.** Swatch selection (high frequency)
gets press feedback only.

New utility classes to add to `globals.css` (dev): `.gallery-image` (M1),
`.gallery-zoom-dialog` + `.gallery-zoom-scrim` (M2/M3), `.gallery-zoom-trigger` +
`.swatch-press` (M4), `.price-value` (M5), `.thumb-hover` (M6). Reuse existing
`.stagger`, `.enter-fade`, `.card-lift`.

---

## Accessibility Checklist

- [ ] Gallery is a labeled region (`aria-label` = `gallery.regionLabel`).
- [ ] Every image has non-empty `alt` (`altText ?? productName`) (AC-18).
- [ ] Zoom Dialog: focus trapped, Escape/backdrop/close dismiss, focus returns to
      trigger (Radix, AC-6); close button `aria-label` = `gallery.close`.
- [ ] Thumbnail buttons named (`thumbnailAlt` + index), active thumb
      `aria-current`/`aria-pressed`.
- [ ] Variant selector `role="radiogroup"` + roving tabindex; each swatch
      `role="radio" aria-checked` + accessible name incl. "(agotado)"; color never
      the only signal (AC-11, AC-18).
- [ ] Arrow keys move swatches; Space/Enter select; Home/End jump.
- [ ] `aria-live="polite"` status line announces selected color+price+stock (AC-18).
- [ ] Struck compare-at preceded by `sr-only` "Precio anterior:".
- [ ] Specs use semantic `<dl>/<dt>/<dd>`.
- [ ] Q&A form: every field has `<label htmlFor>`; errors `role="alert"` +
      `aria-describedby`; success note `role="status"` and receives focus; honeypot
      sr-only labeled, off-screen (not `display:none`), `tabIndex=-1`, `aria-hidden`.
- [ ] Counter tied to textarea via `aria-describedby`; announce via `aria-live`
      only near the limit (avoid per-keystroke chatter).
- [ ] All interactive elements have visible `focus-visible:ring-2 ring-ring`.
- [ ] Tab order: breadcrumb → gallery (main → thumbs → zoom) → swatches → Q&A
      questions → form fields → submit → recently-viewed links.
- [ ] Tap targets ≥ 44px on mobile (swatch padding wrapper, thumb `size-16`, submit
      `min-h-11`).
- [ ] One `<h1>` (product name); section headings are `<h2>`; Q&A questions don't
      introduce competing headings (styled `<p>`). (Mirrors T3 heading-hierarchy fix.)
- [ ] No horizontal body scroll at 320px.

---

## Open Questions for Dev

1. **Recently-viewed storage shape** — specced storing the *card view model*
   (minimal `CatalogProductCard` fields) so tiles render without re-fetch, staying
   client-only/instant, accepting slightly-stale price/stock. Alternative: store
   only slugs + re-fetch — needs a client-callable read (not currently exposed) and
   breaks the empty-SSR-shell simplicity. **Recommendation: store the view model.**
2. **Per-variant display strings** — the panel needs `Color: {name}` and low-stock
   `Solo quedan {n}` (both interpolated). Specced passing a pre-resolved
   `variantDisplay` map built on the server, so the panel does ZERO client i18n
   (purest, matches T3 grid "resolve labels once on the server" discipline).
   Confirm you want the server-built map (recommended) vs. one client
   `useTranslations("product")` call for just these two strings.
3. **`sort_order` collisions** — order images by `is_primary desc, sort_order asc,
   id` and variants by `sort_order, id` in `getProduct`, adding `id` as a
   tiebreaker so gallery/swatch order is deterministic (prevents a flickering thumb
   order across renders). Determinism note, not a design change.
4. **Answer timestamp display** — `ProductQuestionView` carries `answeredAt`/
   `createdAt`. I did NOT spec a visible date (avoids a locale date-format
   dependency, keeps it clean). Recommendation: hidden in Phase 1. Confirm.
5. **Zoom of a single low-res seed image** — spec keeps zoom available whenever ≥1
   real image exists; only the zero-image case hides it. Fine as-is; flagging that
   zoom just shows the same image larger (expected).

---

## Summary of Decisions

- **Layout**: mobile-first single column (gallery → info → specs → recently-viewed
  → Q&A); 2-column split (`grid lg:grid-cols-2 lg:gap-10`) only at `lg`; reuses the
  catalog container so PDP aligns with grid pages; zoom Dialog portals above the
  sticky header at `z-50`.
- **Reuse**: `StockBadge`, `Breadcrumbs`, `ProductCard`, the card placeholder
  pattern, `.card-lift`/`.stagger`/`.enter-fade`, all tokens — verbatim, no drift.
- **New components**: `ProductPurchasePanel` (the one island), `ProductGallery`
  (+ raw Radix Dialog zoom), `VariantSelector` (hand-rolled radiogroup),
  `ProductSpecs` (server `dl`), `ProductQa` (server) + `QaForm` (client),
  `RecentlyViewed` (client, empty SSR shell), `PdpSkeleton`.
- **shadcn/Radix**: only `button` installed; use raw `radix-ui` `Dialog` for zoom
  (no new dep); hand-roll radiogroup + inputs to avoid new primitives.
- **Motion highlights**: image + price **crossfade** (200/150ms, blur-masked,
  reduced-motion → instant); zoom **scale-in** modal (center origin, 200ms); swatch
  **press feedback** only (high-frequency → no enter/hover motion); Q&A
  errors/success **fade-in**; recently-viewed **stagger**. All `transform`/`opacity`,
  `< 300ms`, reduced-motion + hover gated.
- **No dead cart CTA.** Color is never the only signal (badge icon+text, swatch
  out-of-stock slash, sr labels).
