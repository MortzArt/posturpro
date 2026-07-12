# UI Design: T3 — Catalog Browsing

> Scope: the first shopper-facing product surface — the product card, the
> responsive product grid, the four index pages (`/categorias`, `/marcas`,
> `/estilos` + the all-products `/sillas`), the four detail listing pages
> (`/categorias/[slug]`, `/marcas/[slug]`, `/estilos/[slug]`), breadcrumbs,
> crawlable numbered pagination, the stock indicator, and every state (loading /
> empty / error / success) in both locales. **Out of scope** (do NOT design):
> search / filters / sort (T5), the PDP itself (T4 — we only *link* to it),
> homepage content (T13), cart / add-to-cart (T6).
>
> Design language continuity: this spec inherits every token, easing, and motion
> convention established in T2 (see `globals.css` `--ease-out` /
> `--ease-in-out` / `--ease-drawer`, the `.enter-fade` / `.fab-pop` /
> `.nav-hover` patterns). T3 adds exactly **two** new CSS motion helpers
> (`.card-lift` hover treatment, `.stagger-*` grid entrance) and reuses
> `.enter-fade` for empty/error copy. No new palette values, no new fonts.

---

## Design Principles for This Feature

1. **The product is the hero; the chrome disappears.** Unlike the T2 shell
   (quiet by design), catalog pages exist to make chairs desirable. The card is
   ~80% image, minimal text, one price, one stock signal. Everything that isn't
   the product recedes to `text-muted-foreground` and `border-border`.
2. **The card is the atom — get it perfect, reuse it everywhere.** `ProductCard`
   renders on `/sillas`, every category/brand/style page, and (later) related
   strips. It has ONE visual contract across all of them. No page-specific card
   variants. Invisible correctness here compounds across the whole store (Emil).
3. **Crawlable and JS-off functional by default.** Grid, cards, breadcrumbs, and
   pagination are server-rendered anchors. Nothing requires JavaScript to
   navigate — pagination is real `<a href="?page=N">`, cards are real `<Link>`.
   Motion is pure enhancement layered on top (Apple #16 Familiarity + SEO for
   T14). This also protects the static/ISR rendering win (AC-11).
4. **Reserve space, never pop content in from nothing.** Cards have a fixed
   image aspect ratio; the skeleton matches it 1:1; text bars reserve their
   lines. Zero layout shift on data swap or image load (Emil "reserve exact
   space"; Apple #7 Craft — jitter reads as carelessness). Images never animate
   from `scale(0)`.
5. **Mobile-first, thumb-first, information-dense-but-calm.** Design 375px first
   (2-column grid — density over one giant card per screen, matching how a
   Mexican shopper scans on a phone). Tap targets ≥ 44px on cards, crumbs, and
   pagination. No horizontal scroll at any width.
6. **Motion is invisible correctness (T2 rule, carried forward).** Every
   animation animates `transform`/`opacity` only, enters with `--ease-out`,
   stays < 300ms, is hover-gated behind `@media (hover:hover) and
   (pointer:fine)`, and collapses to opacity-only (or nothing) under
   `prefers-reduced-motion`. Never `transition: all`. Never animate a
   frequently-navigated action's chrome.
7. **Wayfinding on every page (Apple #16).** Breadcrumbs answer "where am I";
   the grid answers "what's here"; pagination answers "where can I go";
   category/brand/style headers answer "what am I looking at". An empty state
   always offers an exit ("ver todo el catálogo").

---

## Design Tokens Used

All values already exist in `src/app/globals.css` — **T3 changes no palette
value**. Consuming utilities only.

### Colors (semantic tokens — the brand-swap seam)

| Token utility | Used for in T3 |
| --- | --- |
| `bg-background` / `text-foreground` | Page surface, product name, price |
| `bg-card` / `text-card-foreground` | Card surface (subtle elevation off the page), brand-page header panel |
| `bg-muted` / `text-muted-foreground` | Skeleton bars, image placeholder tile, brand name on card, "N colores", breadcrumb non-current crumbs, category/style descriptions, index-page secondary text, pagination idle numbers |
| `bg-primary` / `text-primary-foreground` | Empty-state CTA button, current pagination page background, "back to catalog" primary CTA |
| `bg-accent` / `text-accent-foreground` | Card hover surface tint (subtle), pagination hover, index-tile hover |
| `border-border` | Card border, grid dividers (none — use gap), header rules, pagination borders, image-tile border |
| `ring-ring` | `focus-visible` ring on every card, crumb link, pagination link, CTA |
| `bg-destructive` / `text-destructive` | Reused only by the shared `error.tsx` boundary (not re-invented here) |

Stock-badge colors deliberately reuse **existing** semantic tokens — no new
palette entries (see StockBadge for the exact mapping and the "color is never
the only signal" rule).

### Typography (single `--font-sans`, Tailwind scale — no custom sizes)

| Role | Classes | Apple #15 note |
| --- | --- | --- |
| Page title (index + `/sillas` H1) | `text-2xl sm:text-3xl font-semibold tracking-tight` | negative tracking as size rises |
| Detail-page entity name (category/brand/style H1) | `text-xl sm:text-2xl font-semibold tracking-tight` | |
| Entity description | `text-sm sm:text-base text-muted-foreground leading-relaxed max-w-prose` | looser leading on body |
| Card product name | `text-sm font-medium tracking-tight text-foreground` line-clamp-2 | weight for hierarchy, not size |
| Card brand name | `text-xs text-muted-foreground` | |
| Card price | `text-sm font-semibold text-foreground tabular-nums` | tabular so prices align in a row |
| Card compare-at (struck) | `text-xs text-muted-foreground line-through tabular-nums` | |
| Stock badge | `text-xs font-medium` | |
| "N colores" | `text-xs text-muted-foreground` | |
| Breadcrumb | `text-sm` (current `font-medium text-foreground`, ancestors `text-muted-foreground`) | |
| Pagination number | `text-sm tabular-nums` | tabular so digits don't jump |
| Empty-state title | `text-lg font-semibold tracking-tight` | |
| Empty-state body | `text-sm text-muted-foreground` | |

`tabular-nums` on every money and page-number surface (Apple #15 / vocab
"Tabular numbers") so digits never reflow between cards or pages.

### Spacing

- Page container: `mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8` — identical container to the footer for shell continuity.
- Grid gap: `gap-x-4 gap-y-8` mobile, `gap-x-6 gap-y-10` at `md`+ (vertical > horizontal so rows breathe and stock badges don't crowd the next card's image).
- Card internal padding: image is flush (no padding); text block `p-3 md:p-4`, `gap-1.5`.
- Breadcrumb: `py-3` row, `gap-2` between crumbs (chevron + label ≥ 44px tap on links).
- Pagination: control height `h-9` (36px visual) inside a `min-h-11` (44px) tap row; `gap-1`.
- Section rhythm between header and grid: `mt-6 md:mt-8`.

### Radius (from `--radius` scale)

- Card + card image container: `rounded-lg` (image inner `rounded-t-lg`, or card `overflow-hidden rounded-lg` so the image clips to the corner).
- Stock badge: `rounded-full` (pill).
- Pagination buttons / index tiles / brand-logo fallback: `rounded-md`.
- Image placeholder tile: inherits the card image radius.

### Elevation / shadow

- Card at rest: `border border-border bg-card` — **no shadow at rest** (restraint; a 30-card grid of drop-shadows is noisy).
- Card hover (hover-capable only): `shadow-sm` fades in + image scales `1.02` (see Motion). This is the *only* elevation change in the grid.
- Index tiles (category/brand/style links): same rest/hover treatment as cards, lighter (`shadow-none` → `bg-accent` tint on hover).
- No scrims (that was the T2 drawer); catalog pages have no overlay layer.

### Motion tokens (REUSED from T2 — no new easing variables)

`--ease-out: cubic-bezier(0.23,1,0.32,1)` for all card/grid/empty entrances and
hover. `--ease-in-out` unused in T3. `--ease-drawer` unused in T3.

Named durations (Clean Code "no magic values"): card hover/press `160ms`; image
hover scale `200ms`; stagger step `40ms` between cards, cap total added delay at
`~240ms` (≤ 6 steps then reset — see Motion); skeleton pulse `1600ms` loop;
empty/error `.enter-fade` `200ms` (inherited).

**Two new CSS helpers added to `globals.css` by T3** (`.card-lift`,
`.stagger`), specified in full in the Motion section. Both transform/opacity
only, hover-gated, reduced-motion-guarded — same discipline as the existing
helpers.

---

## Component Inventory

### 1. ProductCard  ⟵ the single most-reused component

**Purpose**: One product in a grid — cover image, name, brand, price (with
compare-at rules), stock signal, and a "N colores" count. Links to the PDP.
**Location**: Every product grid: `/sillas`, `/categorias/[slug]`,
`/marcas/[slug]`, `/estilos/[slug]` (and later related strips). One contract
everywhere.
**shadcn base**: none — a semantic `<article>` wrapped in a locale-aware `Link`.
**Server component** (no interactivity beyond the link + CSS hover). File:
`src/components/catalog/product-card.tsx`. Strings via the `catalog` namespace
passed down or read with `getTranslations` at the grid level and threaded as
already-resolved strings (card stays a pure presentational server component —
SRP).

**Layout** (ASCII wireframe — the whole card is one link target):
```
┌───────────────────────────┐
│                           │
│                           │  cover image, aspect-[4/5],
│        [ IMAGE ]          │  object-cover, rounded-t-lg,
│                           │  next/image fill + sizes
│                    ┌─────┐│
│                    │Stock││  StockBadge, absolute top/right
│                    └─────┘│  inset-2 (over image, legible scrim-free
├───────────────────────────┤  via badge's own bg token)
│ Marca                     │  brand name  text-xs muted
│ Silla Ejecutiva Milano    │  name text-sm font-medium, line-clamp-2
│ $8,999.00   $10,499.00    │  price + struck compare-at (tabular-nums)
│ 2 colores                 │  color count text-xs muted
└───────────────────────────┘
```

**Compare-at price display rules** (locked):
- Render the struck `compare_at_price_cents` **only when** it is present AND
  strictly greater than `price_cents` (a real discount). Order: current price
  first (emphasis, `font-semibold`), then the struck original after it.
- When absent or `<= price_cents`: render price alone, no struck text, and **do
  not** reserve the struck slot's width asymmetrically — the price sits left.
- Both via `formatMXN` — never format money inline (money.ts is the only
  boundary).
- No "% off" badge in T3 (that's a merchandising decision for T13); just the
  struck original as the discount signal.

**"N colores" count**: from the variants batch (distinct `color_hex` count).
Copy from `catalog.colorsCount` (`{count} colores` / `{count} colors`). If a
product has 0 or 1 distinct color, **omit the line entirely** (a "1 colores"
line is noise). Not interactive — the swatch selector is T4.

**Props**:
```typescript
interface ProductCardProps {
  /** Stitched view model from queries.ts (types.ts). */
  product: CatalogProductCard;
  /** Resolved localized strings so the card stays a pure server component. */
  labels: {
    /** e.g. "En stock" / "Solo quedan {n}" / "Agotado" — pre-resolved per state. */
    stock: string;
    /** "{n} colores" pre-resolved, or null when count < 2. */
    colors: string | null;
  };
  /** True only for above-the-fold first-row cards → next/image priority. */
  priority?: boolean;
}

// from src/lib/catalog/types.ts (authored by dev; shape fixed here):
interface CatalogProductCard {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  priceCents: number;
  compareAtPriceCents: number | null; // struck only if > priceCents
  coverImageUrl: string | null;       // null → placeholder tile
  coverAlt: string;                    // alt_text ?? product name (never empty)
  colorCount: number;                  // distinct variant colors
  stockState: "in" | "low" | "out";
  lowStockN: number | null;            // the {n} for "Solo quedan {n}"; null unless low
}
```

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Success (in stock) | Image + name + brand + price + green-toned "En stock" pill + colores | Whole card is a `Link` to `/producto/[slug]` |
| Low stock | Same, amber-toned "Solo quedan {n}" pill | Clickable; badge draws the eye without alarming |
| Out of stock | Image rendered at `opacity-60` (not hidden) + muted "Agotado" pill; name/price full-opacity | **Still clickable** to PDP (browsing OK; purchase-block is T6, edge case 2) |
| On sale | Current price `font-semibold` + struck compare-at after it | — |
| No cover image | Neutral placeholder tile (`bg-muted`, centered chair glyph `@hugeicons`) with product name as accessible label | No broken `<img>`, no CLS (edge case 3, AC-15) |
| Hover (hover-capable) | `shadow-sm` in, image `scale(1.02)` | Pointer cursor; see Motion |
| Press (`:active`) | Whole card `scale(0.99)` | Instant press feedback (Emil) |
| Focus-visible | `ring-2 ring-ring ring-offset-2` around the card | Keyboard reachable; one tab stop per card |

**Accessible name**: the `<Link>` wraps the whole card; its accessible name is
the product name (`<h3>` inside). Image `alt` = `coverAlt`. Stock and price are
part of the card's text, read after the name. Do not make the badge a separate
focus stop.

**Responsive**:
| Breakpoint | Layout change |
| --- | --- |
| < 640px (375px) | Card fills its grid column (2-col grid). Image `aspect-[4/5]`. Text `p-3`, name `line-clamp-2`. Badge `top-2 right-2`. |
| 640–1024px | 3-col grid; card slightly larger; text `p-4`. Same aspect ratio. |
| ≥ 1024px | 4-col grid; card at its most generous. Same contract. |

`next/image`: `fill` inside an `aspect-[4/5]` wrapper, `object-cover`,
`sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"` (matches the
2/3/4 column breakpoints so phones never download the desktop image, AC-15).
`priority` only on first-row cards (`index < columnsAtCurrentBreakpoint` — dev
passes `priority={index < 4}` since the widest grid is 4-col; harmless extra
priority on mobile is bounded to the first 4).

**Animations**:
- Mount: participates in the grid **Stagger** (owned by ProductGrid, below) — the card itself declares the `.enter-fade`-style start via `@starting-style`; the delay comes from the grid.
- Hover: **Hover effect** — image `transform: scale(1.02)` + card `box-shadow` fade-in, `200ms` `--ease-out`, gated `@media (hover:hover) and (pointer:fine)`. Never `transition: all`.
- Press: **Press/Tap feedback** — card `transform: scale(0.99)`, `160ms` `--ease-out`, on `:active`.
- Reduced motion: no image scale, no card scale; hover collapses to `box-shadow` only (or nothing); mount is opacity-only (no translate). Out-of-stock `opacity-60` is a static style, not motion — unaffected.

---

### 2. StockBadge

**Purpose**: One of exactly three stock states from effective stock, with exact
localized copy. **Location**: absolute over the card image (top-right); also
reusable inline on the future PDP.
**shadcn base**: none — a `<span>` pill. Server component. File:
`src/components/catalog/stock-badge.tsx`.

**Copy + visual mapping** (AC-8 — exact strings from `catalog` namespace):
| State | Condition (effective stock) | ES | EN | Visual (existing tokens + icon) |
| --- | --- | --- | --- | --- |
| `in` | `> LOW_STOCK_THRESHOLD` (5) | "En stock" | "In stock" | `bg-background/90` pill, `text-foreground`, small filled-dot `@hugeicons` `CheckmarkCircle02Icon` — quiet, positive |
| `low` | `1 ≤ n ≤ 5` | "Solo quedan {n}" | "Only {n} left" | `bg-background/90` pill, `text-foreground` with an **amber-toned dot icon** (`Alert02Icon`) — urgency without alarm |
| `out` | `= 0` | "Agotado" | "Out of stock" | `bg-muted` pill, `text-muted-foreground`, `MinusSignCircleIcon` — visibly de-emphasized |

**Color-is-never-the-only-signal (AC-17)**: each state pairs its tone with a
**distinct icon AND distinct text**, so the state is legible to colorblind users
and screen readers. The badge sits on `bg-background/90` (a translucent chip so
the image reads through faintly — Apple #12 material feel) with `backdrop-blur-sm`
for legibility over any image; `out` uses solid `bg-muted`. No new palette
color: the amber "low" tone uses a small inline dot at a warm hue token if one
exists, else the icon alone carries urgency and the text does the rest — **the
badge never depends on hue alone**.

**Props**:
```typescript
interface StockBadgeProps {
  state: "in" | "low" | "out";
  /** Pre-resolved localized label (grid resolves it; badge stays pure). */
  label: string;
  className?: string; // for placement (absolute on card, inline on PDP)
}
```

**States**: the three above are the only states. No loading state (stock is part
of the card payload; the whole card skeletons together).

**Responsive**: identical at all widths; `text-xs`, `px-2 py-0.5`. On 375px it
stays comfortably inside the card image inset.

**Animations**: none on its own. It rides the card's entrance/hover. Deliberate:
a badge that pulses/animates on a 30-card grid violates "frequency of use".

---

### 3. ProductGrid

**Purpose**: Responsive grid wrapper that lays out N `ProductCard`s and owns the
**staggered entrance**. **Location**: every product listing page.
**shadcn base**: none. Server component. File:
`src/components/catalog/product-grid.tsx`.

**Layout** (ASCII — desktop 4-col):
```
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ Card │ │ Card │ │ Card │ │ Card │   row 1  (priority images)
└──────┘ └──────┘ └──────┘ └──────┘
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ Card │ │ Card │ │ Card │ │ Card │   row 2
└──────┘ └──────┘ └──────┘ └──────┘
   ...   (up to PRODUCTS_PER_PAGE = 12 → 3 rows of 4)
```

Grid: `grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10
lg:grid-cols-4`. Columns chosen so `PRODUCTS_PER_PAGE = 12` divides evenly by
2/3/4 → never a ragged last row.

**Props**:
```typescript
interface ProductGridProps {
  products: CatalogProductCard[];
  /** Pre-resolved per-card labels, index-aligned with products. */
  cardLabels: Array<{ stock: string; colors: string | null }>;
  /** Number of columns at the widest breakpoint → priority cutoff (default 4). */
  priorityCount?: number;
}
```
The grid resolves each card's stock/colors label from the `catalog` namespace
(one `getTranslations` call per page, not per card) and passes them down — cards
stay pure server components (SRP: grid owns i18n resolution + layout; card
owns render).

**States**: the grid itself has no empty/loading/error state — those are page-
level (`EmptyState`, `loading.tsx` skeleton, `error.tsx`). The grid only renders
when `products.length > 0`.

**Responsive**: 2 → 3 → 4 columns as above. No horizontal scroll at any width
(cards flex to column width). Verified at 375 / 768 / ≥1024 (AC-17).

**Animations**:
- Mount: **Stagger** of `.enter-fade`-style entrances. Each card `opacity 0 → 1` + `transform: translateY(8px) → 0`, `200ms` `--ease-out`, with an incremental `animation-delay`/`transition-delay` of `40ms × min(index, 5)` (cap at index 5 so the last card in a 12-grid starts ≤ 200ms in — long staggers feel slow, Emil "30–80ms, keep short"). Delay resets each page (no cumulative growth on pagination).
- Trigger: page mount (initial render + after pagination navigation the new page mounts fresh → re-staggers, bridged by the `loading.tsx` skeleton).
- Property: `transform` + `opacity` only.
- Reduced motion: **no stagger, no translate** — cards appear at full opacity immediately (or a single simultaneous `200ms` opacity fade). This is the required fallback.
- Implementation note for dev: use `@starting-style` + `transition-delay` via an inline `style={{ transitionDelay }}` on each card wrapper, NOT keyframes — keeps it interruptible and off the main thread, matching the T2 `.enter-fade` pattern. (`.stagger` helper defined in Motion section.)

---

### 4. Breadcrumbs  (source of truth per ticket, AC-7)

**Purpose**: Accessible trail derived from the route + fetched entity (NEVER
hardcoded), reflecting category nesting. **Location**: top of every detail
listing page (and `/sillas`, index pages). **shadcn base**: none — semantic
`<nav aria-label> > <ol>`. Server component. File:
`src/components/catalog/breadcrumbs.tsx`.

**Layout** (desktop — full trail):
```
Inicio  ›  Categorías  ›  Oficina  ›  Ejecutivas
 link      link           link        current (aria-current, not a link)
```
**Layout** (375px — collapsed to root + current, no horizontal scroll):
```
Inicio  ›  …  ›  Ejecutivas
```
On mobile the middle crumbs collapse to a non-interactive `…` (the full trail is
still in the DOM via the desktop markup pattern: render all crumbs, hide the
middle ones with `hidden sm:inline-flex`, show a `…` placeholder `sm:hidden`).
`overflow-x` is suppressed (`flex-wrap` off, middle collapsed) so a deep trail
never scrolls the page sideways (AC-17, UX mobile requirement).

**Crumb sources** (never hardcoded):
- Root: `catalog.breadcrumb.home` → "Inicio" / "Home", href `/`.
- Section root: `catalog.breadcrumb.categories|brands|styles` → "Categorías" / "Marcas" / "Estilos", href `/categorias|/marcas|/estilos`.
- Entity crumbs: from the fetched entity name(s). For a nested category, the ancestor chain from `getCategory(slug) → { category, ancestors }` produces `Oficina › Ejecutivas`.
- Last crumb = current page: rendered as a `<span aria-current="page">`, `font-medium text-foreground`, NOT a link.

Example trails:
- `/sillas` → `Inicio › Sillas` (the "Sillas" crumb uses `nav.items.catalog`).
- `/marcas/ergovita` → `Inicio › Marcas › Ergovita`.
- `/estilos/ejecutiva` → `Inicio › Estilos › Ejecutiva`.
- `/categorias/ejecutivas` → `Inicio › Categorías › Oficina › Ejecutivas` (nesting, AC-7 / edge case 4).

**Props**:
```typescript
interface Crumb {
  label: string;
  href?: string; // omitted on the last (current) crumb
}
interface BreadcrumbsProps {
  items: Crumb[]; // built by the page from route + fetched entity
  className?: string;
}
```

**Structured-data readiness (noted for T14, not built in T3)**: the ordered
`items` array is the single source a future `BreadcrumbList` JSON-LD emitter can
consume without re-deriving the trail. Keep `Breadcrumbs` accepting exactly this
array so T14 can add `<script type="application/ld+json">` beside it. Do not
build the JSON-LD now.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Default | Trail with chevron `›` separators (`@hugeicons ArrowRight01Icon` rotated, `aria-hidden`) | Ancestor crumbs are links; last is current |
| Ancestor hover (hover-capable) | `text-foreground` from muted, `nav-hover` color transition | color-only |
| Focus | `ring-2 ring-ring rounded-sm` per link | keyboard order: crumbs before the grid |
| Mobile-collapsed | Root · … · current | middle crumbs `hidden sm:inline-flex` |

**Responsive**: full trail ≥ 640px; root + `…` + current below. Separators
`aria-hidden`. `<ol>` uses `flex items-center gap-2`.

**Animations**: none. Breadcrumbs are navigation chrome seen on every page —
"frequency of use" says don't animate. Hover is color-only via `.nav-hover`.

---

### 5. Pagination  (crawlable, JS-off functional, AC-9 / AC-14)

**Purpose**: Numbered pagination via real `<a href="?page=N">`, works with JS
disabled, SEO-crawlable, with clamping and canonical rules. **Location**: below
every product grid that has more than one page. **shadcn base**: `Button
asChild` (`variant="outline"` / `variant="default"` for current) wrapping a
locale-aware `Link`. Server component. File:
`src/components/catalog/pagination.tsx`.

**Layout** (tablet+ — windowed numbers + prev/next):
```
   ‹ Anterior   1  2  [3]  4  5  …  10   Siguiente ›
    prev link    numbered links, current=3 (aria-current, filled)
                 windowed: first, neighbors, ellipsis, last
```
**Layout** (375px — prev/next + count, NOT every number, per UX mobile req):
```
   ‹ Anterior      Página 3 de 10      Siguiente ›
```

**Rules (all binary-testable)**:
- **Real links**: every control is an `<a href>` via `Link` with the `?page=N`
  query preserved on the current path. No `onClick`-only handlers. Works JS-off.
- **Page 1 canonical**: the link to page 1 points at the bare path **without**
  `?page=1` (e.g. `/sillas`, not `/sillas?page=1`). The `<link rel="canonical">`
  for page 1 is the bare URL; pages 2+ self-canonicalize with `?page=N`. (Meta
  tags are emitted by the page's `generateMetadata` — noted for dev; the
  component only constructs hrefs correctly.)
- **Clamp / no dead links**: `lastPage = max(1, ceil(total / PRODUCTS_PER_PAGE))`.
  Never render a number `> lastPage` or `< 1`. Prev hidden/disabled on page 1;
  Next hidden/disabled on the last page. A `?page` out of range is clamped by
  the page before this component receives `currentPage` (edge case 7) — the
  component always gets a valid `[1, lastPage]` value and renders accordingly.
- **Windowing** (≥ 640px): always show first + last; show current ±1; insert a
  non-interactive `…` (`aria-hidden`, with an SR-only gap note) where pages are
  skipped. e.g. `1 … 4 [5] 6 … 20`. If `lastPage ≤ 7`, show all numbers, no
  ellipsis.
- **`aria-current="page"`** on the current page's control; it renders as
  `variant="default"` (filled) and is a non-navigating `<span>` (current page
  doesn't link to itself).
- Single page (`lastPage === 1`): the component renders **nothing** (no empty
  control row).

**Props**:
```typescript
interface PaginationProps {
  currentPage: number;   // already clamped to [1, lastPage] by the page
  lastPage: number;      // computed from count
  /** Builds the href for a page number; page 1 → base path w/o ?page. */
  hrefForPage: (page: number) => string;
  labels: {              // pre-resolved catalog-namespace strings
    previous: string;    // "Anterior" / "Previous"
    next: string;        // "Siguiente" / "Next"
    pageOf: string;      // "Página {page} de {total}" already interpolated (mobile)
    /** aria label template already interpolated per number, e.g. "Página 3". */
    pageLabel: (n: number) => string;
  };
}
```
`hrefForPage` is passed by the page so the component is route-agnostic
(`/sillas`, `/marcas/ergovita`, etc. all reuse it) and the page-1-canonical rule
lives in one place.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Middle page | Prev + windowed numbers + Next, all links | navigates to `?page=N` |
| First page | Prev hidden (or `aria-disabled` non-link); page-1 control is current | Next active |
| Last page | Next hidden; last number is current | Prev active |
| Single page | Component renders nothing | — |
| Number hover (hover-capable) | `bg-accent` tint | color-only |
| Focus | `ring-2 ring-ring` per control | logical order after the grid |
| Current | Filled (`variant="default"`), `aria-current="page"`, non-link | not focusable as a link |

**Responsive**: mobile = Prev / "Página X de Y" / Next (three items, `justify-between`, each control ≥ 44px). Tablet+ = full windowed numbers. `flex-wrap` allowed on the numbered set at odd widths but the page never scrolls horizontally.

**Animations**:
- Press: **Press/Tap feedback** — the underlying `Button` primitive already gives `active:translate-y-px`; acceptable. No custom motion added.
- Page change itself is a navigation → the destination's `loading.tsx` skeleton bridges the transition (Page transition handled by the route, not this component). No client-side animated number transition (would fight JS-off + adds motion to a repeated action).
- Reduced motion: nothing to disable (color/press only).

---

### 6. BrandLogo

**Purpose**: Render a brand's `logo_url` image, or a **typographic fallback**
when null (all 5 seeded brands have `logo_url = null` — the fallback is the
common path, AC-4 / edge case 5). **Location**: brand index tiles + brand-page
header. **shadcn base**: none. Server component. File:
`src/components/catalog/brand-logo.tsx`.

**Layout**:
```
With logo_url:            Fallback (null logo):
┌──────────┐             ┌──────────┐
│  [logo]  │             │    E     │   brand initial(s), font-semibold,
│  image   │             │          │   bg-muted, text-foreground, rounded-md,
└──────────┘             └──────────┘   centered, aspect-square or fixed box
```
Fallback = the brand's first initial (or 2-letter monogram) on a `bg-muted`
tile, `text-foreground font-semibold`, sized to the context (larger on the brand
page header, smaller on the index tile). No decorative color — neutral token so
it never clashes with a future real logo.

**Props**:
```typescript
interface BrandLogoProps {
  name: string;                 // for the fallback monogram + alt
  logoUrl: string | null;
  size?: "sm" | "lg";           // index tile vs page header
}
```
When `logoUrl` present: `next/image` with fixed dimensions + `alt={name} logo`
equivalent (from `catalog` namespace, e.g. `logoAlt` with `{brand}`). When null:
the monogram tile, `aria-hidden` on the letters + the brand name rendered as
real text beside it (so the name is never *only* in a decorative tile).

**States**: with-logo / fallback (the two only states). No loading state (part
of the page payload).

**Responsive**: `sm` = `size-10` on index tiles; `lg` = `size-16 md:size-20` on the brand header.

**Animations**: none (identity chrome).

---

### 7. EmptyState  (AC-16 / edge case 1)

**Purpose**: A valid taxonomy entity with **zero active products** → a localized
empty message + a CTA back to the full catalog. NOT a 404, NOT a blank grid, NOT
an error. **Location**: category/brand/style detail pages when `products.length
=== 0`. **shadcn base**: `Button asChild` → `Link` (same as the T2 404/home
CTA). Server component. File: `src/components/catalog/empty-state.tsx`.

**Layout**:
```
        ┌──────────────────────────────────┐
        │                                  │
        │            ( 🪑 icon )            │  neutral @hugeicons glyph, muted
        │                                  │
        │  No hay sillas en esta           │  text-lg font-semibold
        │  categoría todavía.              │
        │                                  │
        │  [ Ver todo el catálogo ]        │  Button → /sillas
        │                                  │
        └──────────────────────────────────┘
```
Centered column, `min-h-[40vh] flex flex-col items-center justify-center
text-center gap-4 px-4`, `.enter-fade` entrance (reused from T2).

**Copy** (context-specific, from `catalog` namespace):
- Category: `catalog.empty.category` → "No hay sillas en esta categoría todavía." / "No chairs in this category yet."
- Brand: `catalog.empty.brand` → "No hay sillas de esta marca todavía." / "No chairs from this brand yet."
- Style: `catalog.empty.style` → "No hay sillas con este estilo todavía." / "No chairs in this style yet."
- CTA: `catalog.empty.cta` → "Ver todo el catálogo" / "View the full catalog", links to `/sillas`.

**Props**:
```typescript
interface EmptyStateProps {
  message: string;   // pre-resolved, context-specific
  ctaLabel: string;  // pre-resolved
  ctaHref: string;   // "/sillas"
}
```

**States**: single state (the empty state itself).

**Responsive**: centered at all widths; copy wraps; CTA ≥ 44px.

**Animations**:
- Mount: **Fade in** via `.enter-fade` (opacity + `translateY(8px)`, `200ms` `--ease-out`) — low-frequency page, animation justified.
- CTA press: `Button` primitive's built-in press.
- Reduced motion: `.enter-fade` already collapses to opacity-only (inherited).

---

### 8. CategoryTree  (category index nesting, AC-3 / edge case 4)

**Purpose**: The `/categorias` index — all active categories with **nesting
reflected** (children indented under their parent `oficina`). **Location**:
`/categorias` page only. **shadcn base**: none. Server component (list of
locale-aware `Link` tiles/rows). Composed inline in the page or a small
`category-tree.tsx` helper.

**Layout** (index — nested):
```
Categorías

┌────────────────────────────────────┐
│  Ergonómicas            (link tile) │
├────────────────────────────────────┤
│  Gaming                             │
├────────────────────────────────────┤
│  Oficina                            │   parent
│     └─ Ejecutivas                   │   child, indented (pl-6) + subtle
│                                     │   corner/tick marker
├────────────────────────────────────┤
│  Descanso                           │
└────────────────────────────────────┘
```
Each category is a full-width link **row** (mobile) or a tile in a 2–3 col grid
(desktop) showing the category **name + short description**. A child renders
indented (`pl-6`) beneath its parent with a small `└─`/corner marker
(`aria-hidden`) and, for screen readers, the nesting is conveyed by a nested
`<ul>` inside the parent's `<li>` (real list semantics, not just visual indent).

**Nesting semantics**: `listCategories()` returns a tree; the index renders
parents as `<li>` each optionally containing a nested `<ul>` of children — so the
DOM structure itself expresses the hierarchy (AC-3, AC-17). Each row links to
`/categorias/[slug]`.

**States**: success (list) / — . (The index is never empty in practice: 6 seeded
categories. If somehow empty, fall through to the same `EmptyState` pattern
pointing at `/sillas`.)

**Responsive**: single-column stacked rows on mobile; 2-col at `sm`, 3-col at
`lg` for top-level categories, with children nested inside their parent's cell.

**Animations**: optional light **Stagger** of the top-level rows on mount (same
`.stagger` helper, capped), reduced-motion → opacity only. Row hover = `bg-accent`
tint, color-only, hover-gated.

---

### 9. BrandIndexTile / StyleIndexTile  (AC-5 / AC-6)

**Purpose**: `/marcas` and `/estilos` index entries. **Location**: brand index,
style index. **shadcn base**: none — locale-aware `Link` cards.

**Layout — /marcas tile**:
```
┌───────────────────────────┐
│  ┌────┐                    │
│  │ E  │  Ergovita          │  BrandLogo (fallback monogram) + name
│  └────┘                    │
│  Diseño ergonómico...      │  description, line-clamp-2, muted
└───────────────────────────┘
```
**Layout — /estilos tile**: name + description only (styles have no logo):
```
┌───────────────────────────┐
│  Ejecutiva                 │  name, font-medium
│  Elegante y formal.        │  description, muted
└───────────────────────────┘
```

Both are `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` tiles, each a
`Link` (to `/marcas/[slug]` or `/estilos/[slug]`), `border border-border
rounded-lg p-4 bg-card`, hover `bg-accent` tint + `shadow-sm` (hover-gated),
`:active` `scale(0.99)`. If a brand/style `description` is null, the description
line is **omitted** (no empty block, edge case 5) — the slot is not reserved
awkwardly.

**Props**: driven by the page from `listBrands()` / `listStyles()`; tiles are
small inline components or a shared `IndexTile`.

**States**: success list. Description-present vs description-null (omit line).

**Responsive**: 1 → 2 → 3 columns. Tap targets full tile ≥ 44px.

**Animations**: same subtle grid **Stagger** + hover-lift as ProductGrid/cards
(reuse `.card-lift`, `.stagger`), reduced-motion safe.

---

### 10. Skeleton grid  (loading.tsx — the loading state)

**Purpose**: Route-level `loading.tsx` shows card-shaped placeholders matching
the real grid columns and aspect ratio, so the swap causes **no layout shift**.
**Location**: `loading.tsx` beside each listing route (`/sillas`,
`/categorias/[slug]`, `/marcas/[slug]`, `/estilos/[slug]`). **shadcn base**:
none. Server component (pure markup).

**Layout** (matches ProductGrid exactly):
```
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│▓▓▓▓▓▓│ │▓▓▓▓▓▓│ │▓▓▓▓▓▓│ │▓▓▓▓▓▓│   image box, aspect-[4/5], bg-muted
│▓▓▓▓▓▓│ │▓▓▓▓▓▓│ │▓▓▓▓▓▓│ │▓▓▓▓▓▓│
└──────┘ └──────┘ └──────┘ └──────┘
 ▁▁▁▁     ▁▁▁▁     ▁▁▁▁     ▁▁▁▁       two text bars (bg-muted, w-2/3 + w-1/3)
 ▁▁       ▁▁       ▁▁       ▁▁
```
Renders `PRODUCTS_PER_PAGE` (12) skeleton cards in the **same grid classes** as
`ProductGrid` and the **same `aspect-[4/5]` image box** and text-bar heights as
the real card — pixel-for-pixel space reservation (Emil: "reserve exact space;
never pop content in from scale(0)"). Also renders a skeleton breadcrumb row and
a skeleton page header so the whole above-the-fold reserves space.

**States**: single (loading). Replaced by the real page on data resolve.

**Responsive**: identical grid breakpoints to `ProductGrid`.

**Animations**:
- **Skeleton / Shimmer** → here a **Pulse**, not a shimmer sweep: `bg-muted`
  boxes gently pulse opacity `1 → 0.6 → 1`, `1600ms` `ease-in-out` `infinite`
  (subtle `--muted` pulse per the UX spec, NOT a spinner). Implemented with the
  existing `tw-animate-css` `animate-pulse` utility (already imported in
  `globals.css`) — no new keyframes.
- Reduced motion: **no pulse** — static `bg-muted` boxes (a looping opacity
  animation is exactly the kind of ambient motion reduced-motion users want
  gone). Guard the `animate-pulse` behind a `motion-safe:` variant
  (`motion-safe:animate-pulse`).

---

## Page Layouts

### /sillas — all products (AC-1)
```
DESKTOP (≥1024)                                   MOBILE (375)
┌────────────────────────────────────────────┐   ┌───────────────────────┐
│ [shell header]                              │   │ [shell header]        │
├────────────────────────────────────────────┤   ├───────────────────────┤
│ Inicio › Sillas                             │   │ Inicio › Sillas       │
│                                             │   │                       │
│ Sillas                          (H1)        │   │ Sillas          (H1)  │
│ Toda nuestra colección…    (optional sub)   │   │                       │
│                                             │   │ ┌─────┐ ┌─────┐       │
│ ┌────┐┌────┐┌────┐┌────┐   (4-col grid)     │   │ │Card ││Card │  2-col │
│ ┌────┐┌────┐┌────┐┌────┐                    │   │ └─────┘ └─────┘       │
│ ┌────┐┌────┐┌────┐┌────┐                    │   │ ┌─────┐ ┌─────┐       │
│                                             │   │ └─────┘ └─────┘       │
│   ‹ Ant  1 2 [3] 4 5 … 10  Sig ›            │   │  ‹ Ant  3 de 10 Sig › │
├────────────────────────────────────────────┤   ├───────────────────────┤
│ [shell footer]                              │   │ [shell footer]        │
└────────────────────────────────────────────┘   └───────────────────────┘
                        [💬 FAB, from shell]
```

### /categorias, /marcas, /estilos — index pages
```
┌────────────────────────────────────────────┐
│ Inicio › Categorías            (breadcrumb) │
│ Categorías                     (H1)         │
│                                             │
│  /categorias → CategoryTree (nested)        │
│  /marcas     → BrandIndexTile grid          │
│  /estilos    → StyleIndexTile grid          │
└────────────────────────────────────────────┘
```

### /categorias/[slug], /estilos/[slug] — detail listing
```
┌────────────────────────────────────────────┐
│ Inicio › Categorías › Oficina › Ejecutivas  │  (nesting for category)
│ Ejecutivas                     (entity H1)  │
│ Sillas ejecutivas elegantes…   (description)│
│                                             │
│ ┌────┐┌────┐┌────┐┌────┐   ProductGrid      │
│   ‹ Ant  1 2 [3] …  Sig ›   Pagination      │
│                                             │
│  (or, if 0 products → EmptyState + CTA)     │
└────────────────────────────────────────────┘
```

### /marcas/[slug] — brand page (header w/ logo + description, AC-4)
```
┌────────────────────────────────────────────┐
│ Inicio › Marcas › Ergovita     (breadcrumb) │
│ ┌────┐                                      │
│ │ E  │  Ergovita               (H1)         │  BrandLogo lg + name
│ └────┘                                      │
│ Diseño ergonómico premium…     (description)│  (omit block if null)
│ ─────────────────────────────────────────  │  subtle border-b separator
│                                             │
│ ┌────┐┌────┐┌────┐┌────┐   ProductGrid      │
│   ‹ Ant  1 2 [3] …  Sig ›   Pagination      │
└────────────────────────────────────────────┘
```

---

## Interaction Flows

### Flow A — Browse catalog and paginate (AC-1, AC-9, edge case 7)
1. User navigates to `/sillas` (ES) → server renders shell (static) + page.
2. `loading.tsx` skeleton grid shows instantly if data is still resolving (space reserved, subtle `motion-safe:animate-pulse`).
3. Real page swaps in with **no layout shift**; cards **stagger** in (opacity + rise, 40ms steps, capped). First-row images loaded with `priority`.
4. User taps a page-3 pagination link → real navigation to `/sillas?page=3` → next `loading.tsx` skeleton bridges → new page's 12 cards stagger in fresh.
5. User edits URL to `?page=999` → the page clamps to `lastPage` (or 1), renders that valid page; pagination reflects the clamped current page; never crashes.
6. User with JS disabled: every card and page link is a real anchor; browsing + pagination work identically (no stagger/hover, but fully functional).

### Flow B — Drill into a category with nesting (AC-2, AC-3, edge case 4)
1. From `/categorias` the user sees the nested tree; taps **Oficina**.
2. `/categorias/oficina` shows breadcrumb `Inicio › Categorías › Oficina`, the category name + description, and a grid of Oficina products (including Ejecutivas children, seeded into both).
3. User taps **Ejecutivas** (from the tree or a future in-page child link).
4. `/categorias/ejecutivas` breadcrumb = `Inicio › Categorías › Oficina › Ejecutivas` (ancestor chain reflected); grid shows the Ejecutivas subset. No duplicate cards on either page (edge case 8).

### Flow C — Open a product (PDP link, AC-12, edge case — T4 not shipped)
1. User taps any `ProductCard` → navigates to `/producto/[slug]` (locale-aware).
2. Until T4 ships, that route is unmatched → the existing `[locale]/[...rest]` catch-all → localized in-shell 404 ("Página no encontrada"). No fake PDP stub. App never blanks.

### Flow D — Empty taxonomy entity (AC-16, edge case 1)
1. User reaches a valid category/brand/style with 0 active products.
2. Page renders the **EmptyState** (context-specific message + "Ver todo el catálogo" CTA), NOT a 404, NOT a blank grid.
3. CTA → `/sillas`. Breadcrumb + header still present so the user keeps orientation.

### Flow E — Invalid slug / DB failure (AC-14, edge case 6, 9)
1. `/categorias/no-existe` → `getCategory` returns nothing → page calls `notFound()` → localized in-shell 404. No Supabase error surfaced.
2. If the anon read hard-fails (RLS/network/env) → the query throws → the existing `[locale]/error.tsx` boundary renders (localized, `role="alert"`, Retry, opaque digest only). No stack trace, no raw error object, no white screen.

---

## Accessibility Checklist

- [ ] Every `ProductCard` is a single focusable `Link` with an accessible name = product name (`<h3>`); image `alt` from `alt_text ?? product name` (never empty, AC-17); stock/price read as card text after the name.
- [ ] Out-of-stock cards remain focusable and clickable; "Agotado" is conveyed by **text + icon**, not `opacity` alone (color is never the only signal, AC-8/AC-17).
- [ ] StockBadge state is legible without color: distinct icon + distinct text per state.
- [ ] Breadcrumb is a real `<nav aria-label="…"> <ol>`; separators `aria-hidden`; last crumb `aria-current="page"` and not a link (AC-7).
- [ ] Pagination is a `<nav aria-label>`; current page `aria-current="page"`; each numbered link has an accessible label ("Página 3"); prev/next labelled; ellipsis `aria-hidden` (AC-9).
- [ ] Category index nesting expressed via nested `<ul>`/`<li>`, not visual indent alone (AC-3).
- [ ] Tab order is logical: breadcrumb → (header) → grid cards in reading order → pagination. One tab stop per card.
- [ ] Image placeholder tile (no cover) carries the product name as accessible label; never a broken `<img>`.
- [ ] Every interactive element has a visible `focus-visible:ring-2 ring-ring` ring.
- [ ] Grid reflows cleanly at 375 / 768 / ≥1024 with **no horizontal scroll**; breadcrumb collapses on mobile without sideways scroll.
- [ ] All chrome strings from the `catalog` namespace in both `es-MX` and `en` (no hardcoded UI text, AC-10); both dictionaries key-parallel.
- [ ] `motion-safe:` gates the skeleton pulse and card stagger; `prefers-reduced-motion` collapses card hover/press/stagger to opacity-only or none.
- [ ] Tabular numbers on prices and page numbers so digits don't reflow.
- [ ] Contrast: `muted-foreground` on `card`/`background` ≥ 4.5:1 for brand name / description / "N colores"; stock-badge text over its chip ≥ 4.5:1.

---

## Motion Specs (authoritative table — AC-17 / UX Requirements)

| Element | Trigger | Property (transform/opacity only) | Easing (enter=ease-out) | Duration | Reduced-motion fallback |
| --- | --- | --- | --- | --- | --- |
| Product card entrance (grid **Stagger**) | page mount | `opacity 0→1` + `translateY(8px)→0`, per-card `transition-delay = 40ms × min(index,5)` | `--ease-out` | 200ms + capped delay (≤ ~200ms) | no stagger, no translate; single opacity fade or instant |
| Card hover (**Hover effect**) | pointer hover (hover-capable only) | image `transform: scale(1.02)` + card `box-shadow` fade-in | `--ease-out` | 200ms | no scale; `box-shadow` only or none |
| Card press (**Press/Tap feedback**) | `:active` | card `transform: scale(0.99)` | `--ease-out` | 160ms | none |
| Out-of-stock image | static state | `opacity: 0.6` (not motion) | — | — | unchanged (static, not motion) |
| Skeleton card (**Pulse**) | loading | `opacity 1→0.6→1` loop (`animate-pulse`) | `ease-in-out` | 1600ms loop | **no pulse** — static `bg-muted` (gate `motion-safe:animate-pulse`) |
| Index tile / category row hover | pointer hover (hover-capable only) | `bg-accent` tint (color) + optional `box-shadow` | `ease` / `--ease-out` | 120–200ms | color/shadow only, no transform |
| Index tile press | `:active` | `transform: scale(0.99)` | `--ease-out` | 160ms | none |
| Empty-state entrance (**Fade in**) | mount | `opacity 0→1` + `translateY(8px)→0` (reuse `.enter-fade`) | `--ease-out` | 200ms | opacity only, no translate (inherited) |
| Breadcrumb crumb hover | pointer hover (hover-capable only) | `color` (`.nav-hover`) | `ease` | 120ms | unchanged (color only) |
| Pagination control press | `:active` | `translate-y-px` (Button primitive) | — | — | none |
| Page transition (pagination nav) | route change | destination `loading.tsx` skeleton bridges | — | — | skeleton static under reduced motion |

**New CSS helpers T3 adds to `globals.css`** (mirroring the T2 helper style —
transform/opacity only, `@starting-style` entrances, hover + reduced-motion
gated):

```css
/* Product card hover lift — image scale + shadow, hover-capable only. */
.card-lift { transition: box-shadow 200ms var(--ease-out); }
.card-lift:active { transform: scale(0.99); transition: transform 160ms var(--ease-out); }
.card-lift .card-image { transition: transform 200ms var(--ease-out); }
@media (hover: hover) and (pointer: fine) {
  .card-lift:hover { box-shadow: var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 0.06)); }
  .card-lift:hover .card-image { transform: scale(1.02); }
}
@media (prefers-reduced-motion: reduce) {
  .card-lift, .card-lift:active { transform: none; }
  .card-lift .card-image, .card-lift:hover .card-image { transform: none; }
}

/* Grid stagger entrance — opacity + rise; delay set inline per card index. */
.stagger {
  opacity: 1; transform: translateY(0);
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
  @starting-style { opacity: 0; transform: translateY(8px); }
}
@media (prefers-reduced-motion: reduce) {
  .stagger {
    transition: opacity 200ms ease; transition-delay: 0ms !important;
    @starting-style { opacity: 0; transform: none; }
  }
}
```

Baseline rules (carried from T2, enforced everywhere in T3): never `transition:
all`; never `ease-in` for UI; never `scale(0)`; all UI motion < 300ms; transforms
hover-gated behind `@media (hover:hover) and (pointer:fine)`; every motion gated
by `prefers-reduced-motion`; CSS **transitions** (not keyframes) so entrances are
interruptible; never animate a repeated-navigation control's chrome (breadcrumb,
pagination numbers stay motion-light).

---

## shadcn / Reuse Decisions

- **Button primitive** (`src/components/ui/button.tsx`) — reuse `asChild` for the
  EmptyState CTA, "back to catalog" CTA, and pagination controls (`variant="outline"`
  for numbers/prev/next, `variant="default"` for the current page). Its
  `transition-all` is an accepted existing-primitive exception; new catalog CSS
  names its properties.
- **No shadcn Breadcrumb / Pagination packages** — hand-roll with semantic
  markup + `Button`/`Link` (research recommendation: the accessible markup is
  small and the repo convention is token-styled bespoke components; avoids a new
  dependency). Do NOT `npx shadcn add breadcrumb/pagination`.
- **`next/image`** — cover images, `fill` + `sizes` + `aspect-[4/5]` wrapper;
  `priority` first row; hosts already allow-listed (picsum + Supabase), no
  `next.config.ts` change.
- **Icons** — `@hugeicons/react` + `@hugeicons/core-free-icons` ONLY (stock-badge
  dots, breadcrumb chevron, pagination arrows, empty-state + placeholder chair
  glyph). Never mix icon sets.
- **`Link`** from `@/i18n/navigation` (locale-aware) for every catalog link —
  never `next/link` — so the `/en` prefix is automatic.
- **`formatMXN`** (`src/lib/money.ts`) for every price. **`cn()`** for conditional
  classes. **No new CSS files** — the two helpers go in `globals.css`; everything
  else is Tailwind utilities.
- **`.enter-fade`** reused for EmptyState (no new helper needed there).

---

## Design Tokens Summary (for dev-done.md)

- **Colors**: `background/foreground` (page, name, price), `card/card-foreground`
  (card + brand header surface), `muted/muted-foreground` (skeleton, placeholder,
  brand name, descriptions, colores, idle pagination, non-current crumbs),
  `primary/primary-foreground` (CTAs, current page), `accent/accent-foreground`
  (hover tints), `border` (all rules/borders), `ring` (focus). No new palette.
- **Typography**: `--font-sans` only; Tailwind scale (`text-2xl/3xl` titles,
  `text-sm/xs` card + chrome); `font-semibold`/`font-medium` for hierarchy;
  `tracking-tight` on headings; `tabular-nums` on prices + page numbers;
  `line-clamp-2` on names/descriptions; `leading-relaxed` on descriptions.
- **Spacing**: `max-w-(--breakpoint-xl)` container matching the footer; grid
  `gap-x-4 gap-y-8` → `md:gap-x-6 gap-y-10`; card text `p-3` → `md:p-4`;
  breadcrumb/pagination `min-h-11` tap rows.
- **Radius**: `rounded-lg` cards/images, `rounded-full` stock pill,
  `rounded-md` pagination/tiles/logo-fallback.
- **Shadow/elevation**: none at rest; `shadow-sm` on card/tile hover only.
- **Motion**: reused `--ease-out`; two new helpers `.card-lift`, `.stagger`;
  reused `.enter-fade`, `.nav-hover`, `motion-safe:animate-pulse`.
```
