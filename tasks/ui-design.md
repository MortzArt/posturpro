# UI Design: T13 — Static Pages & Homepage

> Stage 3 (UI Design). Storefront surfaces (es-MX default + en). Matches the shipped T2–T6 storefront grammar verbatim. Skills applied: `emil-design-eng` (motion decision framework, `.enter-fade`/`.stagger`/`.card-lift` reuse, `ease-out` enter, transform/opacity only), `apple-design` (typography tracking, spatial consistency, restraint, reduced-motion). Motion vocabulary is exact per `animation-vocabulary`.

---

## Design Principles for This Feature

1. **Storefront grammar is law.** Every page reuses the canonical `marcas`-page shell verbatim: `<section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">` → `Breadcrumbs` → `<header>` (h1 + subtitle) → body. No new page skeleton is invented. A user must not be able to tell a T13 page from a T3 page.
2. **Content over chrome for static pages.** Policy/legal/FAQ pages are typography-driven: `max-w-prose` body, generous leading, headed sections. The reading experience is the product; decoration is subtracted, not added (Apple: Simplicity, not minimalism).
3. **The homepage is the front door — launch-grade, not placeholder-grade.** The hero is the single highest-craft surface. Placeholder imagery is acceptable but the *layout, type hierarchy, and motion* must be shippable. Everything below the hero reuses proven catalog components (`ProductGrid`, `IndexTile`) so the homepage inherits their polish for free.
4. **Omit, never fake.** An empty featured section is removed from the DOM (AC-9), never rendered as an empty grid or a "no products yet" placeholder. The hero always renders. Degrade to the next real section.
5. **No new motion invented.** Reuse `.enter-fade` (low-frequency page entrances), `.stagger` + capped `transitionDelay` (grids), `.card-lift`/`.card-image` (tiles), `.link-arrow`/`.group/brands` (directional link hint). All are already `prefers-reduced-motion`-gated and off-main-thread.
6. **Every visible string is a message key.** Both `es-MX.json` and `en.json` in lockstep, matching key structure (enforced by `src/messages/keys-used.test.ts` + `messages.test.ts`). Zero hardcoded copy.
7. **Server-rendered by default; the contact form is the only client island.** Static pages + homepage resolve data server-side (no client spinner). Only `contact-form.tsx` is `"use client"`.

---

## Design Tokens Used

- **Colors (semantic only, never raw):** `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `bg-accent`, `bg-primary`/`text-primary-foreground`, `text-destructive`, `bg-muted`, `ring-ring`. All defined in `globals.css` `:root`/`.dark` — dark mode works for free.
- **Typography scale (matches shipped pages):**
  - Page h1: `text-2xl font-semibold tracking-tight sm:text-3xl`
  - Hero h1 (one step up — the front door): `text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl` with `text-balance` and `tracking-tight` (Apple §15: large display text wants tighter tracking).
  - Section heading (featured / showroom blocks): `text-xl font-semibold tracking-tight sm:text-2xl`
  - Body/subtitle: `text-sm leading-relaxed text-muted-foreground sm:text-base`
  - Prose body paragraph: `text-sm leading-relaxed text-foreground sm:text-base` inside `max-w-prose`
  - Prose section heading (h2 in a static-page body): `text-lg font-semibold tracking-tight text-foreground sm:text-xl mt-8 first:mt-0`
  - Label: `text-sm font-medium`; field hint/error: `text-xs`
- **Spacing:** section rhythm `py-8 md:py-10`; hero `py-16 md:py-24`; header `mb-6 mt-2 md:mb-8`; prose paragraph gap `space-y-4`; between static-page sections `space-y-8`; shell padding `px-4 md:px-6 lg:px-8`.
- **Radius:** `rounded-lg` (cards/tiles/hero image), `rounded-md` (inputs/buttons), `rounded-sm` (inline focus targets). All derive from `--radius: 0.625rem`.
- **Shadows:** only `.card-lift` hover `box-shadow: var(--shadow-sm)`. Hero and static pages are flat (border-defined, not shadow-defined) — matches the store's flat, border-first elevation language.
- **Easing:** `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for every enter/press; never `ease-in`.

---

## Slug & Footer/Nav Reconciliation (DECISION — committed)

### The 9-slug set (single-sourced in `src/lib/config/static-pages.ts`)

| # | Page | Slug (es-MX + `/en/<slug>`) | Route | Body pattern |
|---|------|------|-------|--------------|
| 1 | About | `sobre-nosotros` | generic `[pageSlug]` | prose |
| 2 | Shipping policy | `envios` | generic `[pageSlug]` | headed sections |
| 3 | Returns policy | `devoluciones` | generic `[pageSlug]` | headed sections |
| 4 | Warranty | `garantia` | generic `[pageSlug]` | headed sections |
| 5 | FAQ | `preguntas-frecuentes` | generic `[pageSlug]` | headed list (deep-linkable) |
| 6 | Aviso de Privacidad | `aviso-de-privacidad` | generic `[pageSlug]` | headed legal sections |
| 7 | Terms | `terminos` | generic `[pageSlug]` | headed legal sections |
| 8 | Contact | `contacto` | **explicit `contacto/`** | bespoke form |
| 9 | Showroom | `showroom` | **explicit `showroom/`** | bespoke location block |

### DECISION: split `envios-y-devoluciones` → `envios` + `devoluciones`

**Rationale.** AC-1 explicitly enumerates Shipping (`/envios`) and Returns (`/devoluciones`) as **two separate pages** with two separate `static_pages` rows. The current footer slug `/envios-y-devoluciones` is a T2 combined placeholder that would leave AC-1 unsatisfiable if kept. Splitting is the ticket-mandated path, and reads better in a policy footer (shipping and returns are distinct customer concerns).

**Consequence for `site-footer.tsx`.** It currently has 2 groups — `STORE_LINKS` = [about, shipping] and `HELP_LINKS` = [faq, contact] — in a 3-col grid where col 1 is store info. With 9 destinations we regroup into **3 real link columns** (store info gets its own leading block; grid becomes 4 tracks on `lg`):

```
STORE_LINKS  = [ about ]                              → footer.sections.store  "Tienda"
HELP_LINKS   = [ faq, shipping, returns, contact ]    → footer.sections.help   "Ayuda"
LEGAL_LINKS  = [ warranty, privacy, terms ]           → footer.sections.legal  "Legal"
```

Showroom hangs off the **store-info block** as a contextual link ("Visita nuestro showroom →") since it is location content, not a policy. Removed nothing; **changed key:** `footer.links.shipping` label "Envíos y devoluciones" → "Envíos". **New keys:** `footer.links.returns`, `footer.links.warranty`, `footer.links.privacy`, `footer.links.terms`, `footer.links.showroom`, `footer.sections.legal`. **Zero footer/nav href points at a nonexistent slug after this task (AC-10).**

**Nav (`nav-items.ts`):** unchanged — `/contacto` was always in the set and now resolves. No slug edit. Verify-only.

### Reserved-slug guard

`config/static-pages.ts` exports `RESERVED_SLUGS` — `sillas`, `marcas`, `categorias`, `estilos`, `carrito`, `checkout`, `producto`, `contacto`, `showroom`. `STATIC_PAGE_SLUGS` (the 7 generic ones) is asserted disjoint from `RESERVED_SLUGS` at module load and drives `generateStaticParams`, so an unknown slug `notFound()`s rather than pre-rendering (edge 10). `contacto`/`showroom` are their own folders (App Router prefers static segments) and are excluded from `[pageSlug]` params.

---

## Component Inventory

| Component | Status | shadcn / reuse base | File |
|---|---|---|---|
| `Hero` | **NEW** | `Button` (existing) | `src/components/home/hero.tsx` |
| `FeaturedProducts` | **NEW** | wraps `ProductGrid` | `src/components/home/featured-products.tsx` |
| `FeaturedBrands` | **NEW** | wraps `IndexTile` + `BrandLogo` | `src/components/home/featured-brands.tsx` |
| `HomeSectionHeader` | **NEW** (tiny) | — | `src/components/home/section-header.tsx` |
| `StaticPageBody` | **NEW** | — | `src/components/content/static-page-body.tsx` |
| `ContactForm` | **NEW** (client) | mirrors `qa-form.tsx` | `src/app/[locale]/contacto/contact-form.tsx` |
| `ShowroomLocation` | **NEW** | — | inline in `showroom/page.tsx` (typed) |
| `Breadcrumbs` | reuse | — | `src/components/catalog/breadcrumbs.tsx` |
| `ProductGrid` / `ProductCard` | reuse | — | `src/components/catalog/*` |
| `IndexTile` / `BrandLogo` | reuse | — | `src/components/catalog/*` |
| `Button` | reuse | shadcn | `src/components/ui/button.tsx` |
| `SiteFooter` | **MODIFY** | — | `src/components/layout/site-footer.tsx` |

**Counts:** **7 new components** (Hero, FeaturedProducts, FeaturedBrands, HomeSectionHeader, StaticPageBody, ContactForm, ShowroomLocation) + **3 new routes** (`[pageSlug]`, `contacto`, `showroom`) + homepage rebuild; **1 modified** component (SiteFooter); **6 reused** (Breadcrumbs, ProductGrid, ProductCard, IndexTile, BrandLogo, Button).

---

### Hero (homepage front door)

**Purpose:** Localized headline + subcopy + primary CTA to `/sillas`; the store's first impression.
**Location:** Top of `src/app/[locale]/page.tsx`. Always renders (AC-9).
**shadcn base:** existing `Button` (`asChild` → locale-aware `Link`), matching the current homepage CTA exactly.

**Layout (desktop ≥1024):**
```
┌──────────────────────────────────────────────────────────────────┐
│  mx-auto max-w-(--breakpoint-xl) px-4..lg:px-8  py-16 md:py-24     │
│  ┌───────────────────────────────┐  ┌──────────────────────────┐  │
│  │ (copy column, max-w-xl)       │  │ (media column)           │  │
│  │  Sillas ergonómicas para      │  │  ┌────────────────────┐  │  │
│  │  cuidar tu espalda            │  │  │   hero image       │  │  │
│  │  (h1, text-4xl/5xl, balance)  │  │  │   aspect-[4/3]     │  │  │
│  │  Encuentra la silla perfecta… │  │  │   rounded-lg cover │  │  │
│  │  (subcopy, muted, max-w-prose)│  │  │                    │  │  │
│  │  [ Ver sillas ]  Marcas →     │  │  └────────────────────┘  │  │
│  └───────────────────────────────┘  └──────────────────────────┘  │
│         grid lg:grid-cols-2 gap-8 lg:gap-12 items-center           │
└──────────────────────────────────────────────────────────────────┘
```

**Mobile (375) — stacked, copy first:**
```
┌────────────────────────────┐
│  Sillas ergonómicas para   │  (h1)
│  cuidar tu espalda         │
│  Encuentra la silla… (sub) │
│  [   Ver sillas   ] (full) │
│  Marcas →                  │
│  ┌──────────────────────┐  │
│  │  hero image 4/3      │  │  ← image AFTER cta on mobile
│  └──────────────────────┘  │
└────────────────────────────┘
```

**Placeholder-imagery strategy (launch-grade without a real photo):** the media column renders `next/image` from a config `HERO_IMAGE` path (a shipped placeholder in `/public`, `alt` from a message key). **If the asset is absent/unset**, the column degrades to a **token-tinted panel**: `bg-muted rounded-lg aspect-[4/3]` with a centered `@hugeicons` chair glyph in `text-muted-foreground/40`, `aria-hidden` — never a broken `<img>`, never layout collapse. The copy column is unaffected.

**Props:**
```typescript
interface HeroProps {
  headline: string;        // home.hero.title
  subcopy: string;         // home.hero.subtitle
  ctaLabel: string;        // home.hero.ctaCatalog
  ctaHref: string;         // CATALOG_PATH ("/sillas")
  secondaryLabel: string;  // home.hero.ctaBrands
  secondaryHref: string;   // "/marcas"
  imageUrl: string | null; // HERO_IMAGE config; null → token panel
  imageAlt: string;        // home.hero.imageAlt
}
```

**States:**
| State | Visual | Behavior |
|---|---|---|
| Default (image present) | Two-column copy + photo | CTA → `/sillas` |
| Image missing/unset | Copy + token-tinted chair-glyph panel | Identical CTA; no broken image |
| Loading | N/A (server-rendered, ships complete) | — |
| Reduced motion | Enter fade without translate | `.enter-fade` gate |

**Responsive:**
| Breakpoint | Layout |
|---|---|
| < 640 (375) | Single column: copy → CTA (`w-full sm:w-auto`) → image. No horizontal overflow. |
| 640–1024 | Single column, CTA intrinsic width, image full-width below copy. |
| ≥ 1024 | `lg:grid-cols-2`, copy left / image right, `items-center`. |

**Animations:**
- **Mount:** *Fade-and-rise* — `.enter-fade` on the copy block (opacity 0→1, `translateY(8px→0)`, 200ms `ease-out`). Purpose: prevent jarring first paint; first-view only. Reduced-motion: opacity-only.
- **Primary CTA press:** *Scale-down press* — `Button` ships `:active { scale(0.97) }` @160ms `ease-out`. No change.
- **Secondary "Marcas →" hover:** *Directional nudge* — reuse `.link-arrow` inside `.group/brands`; arrow `translateX(2px)` @150ms `ease-out`, gated `@media (hover: hover) and (pointer: fine)`, dropped under reduced motion (this exact pattern already ships on the placeholder homepage).
- **No hero image parallax / ken-burns** — high-cost, purpose-free (Emil Q1: no motion without purpose).

---

### FeaturedProducts

**Purpose:** Up to `N` product cards from the catalog via `ProductGrid`. Section OMITTED when zero products (AC-9).
**Location:** Homepage, below hero.
**shadcn base:** none; composes `ProductGrid` (owns stagger + card-lift).

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Sillas destacadas                         Ver todas  →       │  ← HomeSectionHeader
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐  (ProductGrid verbatim)          │
│  │card│ │card│ │card│ │card│   grid-cols-2 md:3 lg:4           │
│  └────┘ └────┘ └────┘ └────┘                                  │
└──────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface FeaturedProductsProps {
  products: CatalogProductCard[]; // already sliced to N by the page; guard-returns null if empty
  heading: string;                // home.featured.productsHeading
  viewAllLabel: string;           // home.featured.viewAllProducts
  viewAllHref: string;            // CATALOG_PATH
}
```
`N = HOME_FEATURED_PRODUCTS = 8` (named constant; 8 = two full rows at `lg:grid-cols-4`, divides by 2/4 so the last row is never ragged at any breakpoint). Component returns `null` when `products.length === 0`; the page also omits it — belt and suspenders (AC-9).

**States:**
| State | Visual | Behavior |
|---|---|---|
| Has products | Section header + `ProductGrid` | cards link to PDP; staggered entrance |
| Zero products | **Not in DOM** | homepage flows hero → next section |
| Reduced motion | Grid appears without per-card delay | `.stagger` drops delay |

**Responsive:** inherits `ProductGrid`: `grid-cols-2` (375 — dense, matches catalog; **NOT** 1-col: consistency with the shipped catalog outweighs the ticket's 1-col suggestion), `md:grid-cols-3`, `lg:grid-cols-4`. `HomeSectionHeader` stacks the "Ver todas →" link under the heading on mobile (`flex-col sm:flex-row sm:items-baseline sm:justify-between`).

**Animations:**
- **Grid mount:** *Staggered fade-and-rise* — `.stagger` per card, `transitionDelay = min(index, 5) * 40ms`, capped so the grid settles ≤ ~200ms. Reused verbatim from `ProductGrid`. Reduced-motion: opacity-only, no delay.
- **Card hover/press:** *Card lift + image zoom* — `.card-lift` + `.card-image` (`scale(1.02)`), `:active scale(0.99)`. Hover gated behind fine pointers. Verbatim reuse.
- **"Ver todas →" hover:** *Directional nudge* — `.link-arrow`/`.group/brands`.

---

### FeaturedBrands

**Purpose:** Up to `M` brand tiles via `IndexTile` + `BrandLogo`. OMITTED when zero brands (AC-9).
**Location:** Homepage, below FeaturedProducts.

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Marcas                                    Ver todas  →        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│  │ [logo] X │ │ [logo] Y │ │ [logo] Z │  ul grid              │
│  │ desc…    │ │ desc…    │ │ desc…    │  cols-1 sm:2 lg:3     │
│  └──────────┘ └──────────┘ └──────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface FeaturedBrandsProps {
  brands: CatalogBrand[];  // sliced to M; guard-returns null if empty
  heading: string;         // home.featured.brandsHeading
  viewAllLabel: string;    // home.featured.viewAllBrands
  viewAllHref: string;     // "/marcas"
  logoAltTemplate: string; // reuse existing catalog.brand.logoAlt "Logo de {brand}"
}
```
`M = HOME_FEATURED_BRANDS = 6` (named constant; 6 divides by 1/2/3 → last row never ragged). Each tile: `IndexTile` with `href={brandPath(brand.slug)}`, `name={brand.name}`, `description={brand.description}`, `leading={<BrandLogo name size="sm" logoUrl logoAlt/>}`, `staggerDelayMs={min(index,5)*40}`.

**States:**
| State | Visual | Behavior |
|---|---|---|
| Has brands | Header + `IndexTile` grid (matches `marcas` exactly) | tiles link to brand page; `.card-lift` |
| Zero brands | **Not in DOM** | homepage flows past it |
| Brand w/o logo | `BrandLogo` monogram fallback (first 2 letters) | `aria-hidden` fallback tile |
| Brand w/o description | Tile omits description line (no empty block) | `IndexTile` handles null already |

**Responsive:** `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` — identical to the `marcas` index grid.

**Animations:** same `.stagger` + `.card-lift` reuse (from `IndexTile`). `viewAll` link uses `.link-arrow`.

---

### HomeSectionHeader (tiny shared)

**Purpose:** the "{heading} … Ver todas →" row above each featured grid — DRY between FeaturedProducts and FeaturedBrands.
**Props:**
```typescript
interface HomeSectionHeaderProps {
  heading: string;
  linkLabel: string;
  linkHref: string;   // locale-aware Link
}
```
Markup: `<div className="mb-6 flex flex-col gap-1 sm:mb-8 sm:flex-row sm:items-baseline sm:justify-between">` → `<h2 className="text-xl font-semibold tracking-tight sm:text-2xl">` + a `.link-arrow`/`.group/brands` "Ver todas →" link (`text-sm font-medium text-muted-foreground hover:text-foreground`, focus ring, arrow `aria-hidden`).

---

### StaticPageBody (generic prose renderer — the 7 text pages)

**Purpose:** Render `static_pages.body` (plain text, max 100k) as **escaped, structured paragraphs and headed sections** — never `dangerouslySetInnerHTML` (research anti-pattern; XSS guard, AC-17).
**Location:** `src/app/[locale]/[pageSlug]/page.tsx` (and the showroom text portion).

**Body → structure convention (plain-text protocol):** seed bodies use a line beginning `## ` as a section heading; blank lines separate paragraphs. `StaticPageBody` splits on `\n`, treats `## `-prefixed lines as `<h2>` (with a slugified `id` for deep-linking — used by FAQ), and groups consecutive non-blank lines into `<p>`. All text renders as React text children (auto-escaped) — no HTML parsing, no raw injection. A 100k body renders as many `<p>`; `max-w-prose` keeps line length readable regardless (edge 7).

**Layout (prose page — About / Shipping / Returns / Warranty / Privacy / Terms):**
```
┌──────────────────────────────────────────────────────────────┐
│  section mx-auto max-w-(--breakpoint-xl) px-4..lg:px-8 py-8   │
│  Inicio / Sobre nosotros            (Breadcrumbs)             │
│  Sobre nosotros                     (h1, page scale)         │
│  ── header mb-6 mt-2 ──                                       │
│  ┌── max-w-prose space-y-4 ──┐                               │
│  │ Intro paragraph…          │                               │
│  │ ## Sección (h2, mt-8)     │                               │
│  │ Paragraph…                │                               │
│  └──────────────────────────┘                               │
└──────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface StaticPageBodyProps {
  body: string; // plain text; parsed into headings + paragraphs, escaped
}
```
Renders `<div className="max-w-prose space-y-4">`; h2 = `text-lg font-semibold tracking-tight text-foreground sm:text-xl mt-8 first:mt-0`; p = `text-sm leading-relaxed text-foreground sm:text-base`.

**States:**
| State | Visual | Behavior |
|---|---|---|
| Row present, published | Breadcrumb + h1(title) + prose body | server-rendered |
| Row missing / `is_published=false` | Localized in-shell 404 (`not-found.tsx`) | wrapper → null → `notFound()` (AC-5, edges 1–2) |
| `en` translation missing | es-MX base title/body renders (no error) | wrapper fallback (AC-4, edge 3) |
| Single-line body | one `<p>`, no headings | parser handles gracefully |

**Responsive:** `max-w-prose` caps line length at all sizes; shell padding scales. Long unbroken strings `break-words`.

**Animations:** **none.** Content the user reads should not stage in — the entrance would delay comprehension (Emil Q1; Apple restraint). Breadcrumb + body paint together, server-rendered. Deliberate.

---

### FAQ (headed list — pattern decision)

**DECISION: headed list, NOT an accordion.** Justification:

| Criterion | Accordion | Headed list (chosen) |
|---|---|---|
| Client JS | Requires `"use client"` + state | **Zero JS — pure server component** |
| Deep-linkable | Needs JS to open the targeted panel on `#hash` load | **Native `id` anchors + `:target` — works on first paint, no JS** |
| Content source | Plain-text body doesn't map to Q/A pairs without a parser | **Maps 1:1 to the `## question` / paragraph-answer convention** |
| Frequency (Emil Q1) | Toggling is a repeated interaction → animation cost | **No toggle → no animation cost** |
| Scannability / SEO | Collapsed answers hidden from Ctrl-F & crawlers | **All answers visible, indexable, Ctrl-F-able** |

FAQ is the same `[pageSlug]` route + `StaticPageBody`: each `## ` line is a question → `<h2 id="slugified-question">`, the following paragraph(s) are the answer. A `#slugified-question` URL scrolls to and frames the question via `:target { scroll-margin-top }`. Optional light `:target` affordance: a 2px left accent bar on the targeted `<h2>` (color-only, no motion). **Satisfies "deep-linkable" with less code and better a11y than an accordion** — the Emil default when frequency is high and content should stay visible.

```
┌──────────────────────────────────────────────────────────────┐
│  Inicio / Preguntas frecuentes                               │
│  Preguntas frecuentes (h1)                                   │
│  max-w-prose:                                                │
│   ¿Cuánto tarda el envío?           (h2 id="cuanto-tarda…")  │
│   Los envíos tardan 3–7 días…       (p)                      │
│   ¿Puedo devolver mi silla?         (h2 id="puedo-devolver") │
│   Sí, dentro de 30 días…            (p)                      │
└──────────────────────────────────────────────────────────────┘
```

---

### ContactForm (wires the T9 `sendContactRelay` seam)

**Purpose:** name / email / optional subject / message + honeypot; calls `submitContactForm` server action → `sendContactRelay`. Full state matrix.
**Location:** `src/app/[locale]/contacto/page.tsx` (server) renders the shell (breadcrumb + h1 + intro + `<ContactForm/>`). `contact-form.tsx` is the sole `"use client"` island. **Copies `qa-form.tsx` grammar verbatim.**
**shadcn base:** `Button` (existing) for submit; native inputs styled with the shipped `fieldClasses` string (identical to Q&A — no new field component).

**Layout (mobile-first single column — the canonical form shape):**
```
┌────────────────────────────────────────────┐
│  Inicio / Contacto        (Breadcrumbs)     │
│  Contacto                 (h1)              │
│  Escríbenos y te responderemos…  (intro)   │
│  ┌──────────── max-w-xl ─────────────────┐  │
│  │  Nombre *                             │  │
│  │  [___________________________]        │  │
│  │  Correo *                             │  │
│  │  [___________________________]        │  │
│  │  Asunto (opcional)                    │  │
│  │  [___________________________]        │  │
│  │  Mensaje *                            │  │
│  │  [                              ]      │  │
│  │  [                         ] 0/2000    │  │  ← live char counter (aria-describedby)
│  │  (honeypot: absolute left-[-9999px])  │  │
│  │  [ Enviar mensaje ]                   │  │
│  │  ┌ role=status / role=alert banner ┐  │  │
│  └───────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

**Honeypot (invisible to real users AND assistive tech) — verbatim from Q&A:**
```
<div className="absolute left-[-9999px]" aria-hidden>
  <label htmlFor={`${id}-website`}>{honeypotLabel}</label>
  <input id={`${id}-website`} type="text" name="website"
         tabIndex={-1} autoComplete="off" defaultValue="" />
</div>
```
Off-screen (`left-[-9999px]`, NOT `display:none` — some bots skip hidden fields) + `aria-hidden` wrapper (screen readers skip) + `tabIndex={-1}` (keyboard skips) + `autoComplete="off"`. **Real users never see it; assistive tech never announces it (AC-15, edge 6, AC-20).**

**Props (client component):**
```typescript
interface ContactFormProps {
  labels: {
    name: string; namePlaceholder: string;
    email: string; emailPlaceholder: string;
    subject: string; subjectPlaceholder: string; subjectOptional: string;
    message: string; messagePlaceholder: string;
    submit: string; submitting: string;
    honeypot: string;            // sr-invisible label
    charCount: string;           // "{count}/{max}" template
    success: string;             // AC-12
    errorGeneric: string;        // AC-16
    rateLimited: string;         // AC-14
    retry: string;               // retry affordance
    fieldErrors: {               // AC-13, mirrors qa field-error keys
      nameRequired: string; nameTooLong: string;
      emailRequired: string; emailInvalid: string; emailTooLong: string;
      subjectTooLong: string;
      messageRequired: string; messageTooLong: string;
    };
  };
  maxLengths: { name: number; email: number; subject: number; message: number };
}
```

**Form state (serializable — mirrors `QaFormState`; `src/app/[locale]/contacto/contact-form-state.ts`):**
```typescript
type ContactFieldKey = "name" | "email" | "subject" | "message";
type ContactFieldErrorKey =
  | "nameRequired" | "nameTooLong"
  | "emailRequired" | "emailInvalid" | "emailTooLong"
  | "subjectTooLong"
  | "messageRequired" | "messageTooLong";

interface ContactFormState {
  status: "idle" | "success" | "invalid" | "rate-limited" | "error";
  fieldErrors?: Partial<Record<ContactFieldKey, ContactFieldErrorKey>>;
  values?: { name: string; email: string; subject: string; message: string };
  submissionId: number;
}

const initialContactFormState: ContactFormState = { status: "idle", submissionId: 0 };
```
Honeypot-tripped returns `status: "success"` (fake success, AC-15) — indistinguishable on the client from a real send, so no status leaks the anti-spam behavior.

**State matrix (the full required set):**
| State | Trigger | Visual | Behavior |
|---|---|---|---|
| **Idle** | initial / after reset | Empty fields, enabled submit | ready |
| **Validating** | client, on submit attempt | Offending field gets `aria-invalid` red border + `FieldError` (`text-xs text-destructive`, `role="alert"`, `.enter-fade`) below it | focus → first invalid field; no send |
| **Submitting** | action `pending` (`useActionState`) | Submit `disabled`, label → "Enviando…"; values kept | no double-submit (button disabled) |
| **Success** | `status==="success"` (incl. dev-preview & honeypot) | Success banner `role="status"` `.enter-fade` "¡Mensaje enviado!…" + **inputs cleared** (re-key on `submissionId`) | banner focus (`tabIndex={-1}` ref) + auto-hide after `SUCCESS_FEEDBACK_MS` (6000, shipped cadence) |
| **Error** | `status==="error"` (`{ok:false}` / exception) | Destructive banner `role="alert"` `.enter-fade` "No pudimos enviar tu mensaje…" + **Retry**; **values preserved** | raw `reason` NEVER shown (logged server-side, AC-16); Retry re-submits current values |
| **Rate-limited** | `status==="rate-limited"` | Banner `role="alert"` `.enter-fade` "Espera un momento…" (amber/muted, distinct from hard error); **values preserved** | no send; user waits (AC-14, edge 5) |
| **Disabled submit** | during submitting only | `Button disabled` (opacity + `cursor-not-allowed` via Button) | — |

**Field ↔ error association (AC-20, mirrors Q&A):** each input `id={`${id}-name`}`; label `htmlFor` matches; on error `aria-invalid={true}` + `aria-describedby={nameErrorId}`; `FieldError` carries that id + `role="alert"`. Message textarea `aria-describedby={cn(messageErrorId, counterId)}` so both error and the live counter are announced. Async banners: success `role="status"`, error/rate-limit `role="alert"`.

**Owner-email dependency (dev preview):** the action calls `sendContactRelay`, which returns `{ ok: true, sent: true }` under `EMAIL_DEV_PREVIEW=1` (logs a console preview, no real send) — **the success state IS exercisable in dev/QA without live `EMAIL_*` keys.** When `EMAIL_OWNER_ADDRESS` is unset and preview is off, `sendContactRelay` returns `{ ok: false, reason: "owner address unavailable" }` → the form shows the **Error** state (generic copy + retry), never the raw reason (AC-16, edge 4). Dev/QA runs with `EMAIL_DEV_PREVIEW=1` + `CONTACT_RATE_LIMIT_DISABLED=1`.

**Responsive:**
| Breakpoint | Layout |
|---|---|
| 375 | Single stacked column `max-w-xl` (full width), inputs `min-h-11` touch targets, long emails/messages `break-words`, no horizontal overflow |
| 768 | Same single column, `max-w-xl` left-aligned; taller textarea |
| 1024 | Same; form does not widen past `max-w-xl` for readable field length |

**Animations:**
- **Field error appear:** *Fade-and-rise* — `FieldError` `.enter-fade` (200ms `ease-out`). Purpose: prevent an error snapping into layout. Reduced-motion: opacity-only.
- **Banner appear:** *Fade-and-rise* — `.enter-fade` on the banner. Purpose: async state change needs a gentle entrance so the user notices it. Reduced-motion: opacity-only.
- **Submit press:** *Scale-down press* — `Button :active scale(0.97)`, shipped.
- **No morphing / celebration** — functional, occasional submit; a celebration would over-feedback (Apple §13 Utility). Calm banner + cleared inputs is the right restraint.

---

### ShowroomLocation (Option A — content in body + config map link)

**Purpose:** Address, hours, and a "Ver en mapas" deep-link (no map SDK). Degrades to text if map link/image unavailable (AC-18).
**Location:** `src/app/[locale]/showroom/page.tsx` (explicit folder). Reads the `showroom` `static_pages` body (address + hours copy, via `StaticPageBody`) + a map deep-link from config (`SHOWROOM_MAP_URL`, `SHOWROOM_MAP_IMAGE` in `src/lib/config/static-pages.ts`).

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Inicio / Showroom          (Breadcrumbs)                    │
│  Showroom                   (h1)                             │
│  grid gap-8 lg:grid-cols-[1fr_minmax(0,340px)] :             │
│  ┌───────────────────────────┐  ┌────────────────────────┐   │
│  │ Address + Hours (body,    │  │  ┌──────────────────┐  │   │
│  │ StaticPageBody, prose)    │  │  │ static map image  │  │   │
│  │ ## Dirección              │  │  │ OR token panel    │  │   │
│  │ Av. … CDMX                │  │  │ (aspect-[4/3])    │  │   │
│  │ ## Horario                │  │  └──────────────────┘  │   │
│  │ Lun–Vie 9:00–18:00        │  │  [ Ver en mapas → ]    │   │
│  └───────────────────────────┘  └────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Props (typed, inline in the page):**
```typescript
interface ShowroomMapProps {
  mapImageUrl: string | null;  // static map <img>; null → token panel
  mapLinkUrl: string | null;   // maps deep-link; null → link omitted
  mapImageAlt: string;         // showroom.mapAlt
  viewOnMapsLabel: string;     // showroom.viewOnMaps
}
```

**States:**
| State | Visual | Behavior |
|---|---|---|
| Body + link + image | Address/hours left, static map + "Ver en mapas →" right | link opens native maps new tab (`rel="noopener noreferrer"`) |
| Map image unavailable | Token-tinted `bg-muted` panel + pin glyph (`aria-hidden`), link still shown | no broken `<img>` |
| Map link unavailable | Address + hours text only, map slot omitted | text block ALWAYS renders (AC-18) |
| Row missing/unpublished | In-shell 404 | `getStaticPageBySlug('showroom')` → null → `notFound()` |

**Responsive:** mobile stacks (address/hours → map below); `lg:` two-column with a bounded map track (`minmax(0,340px)`). Map `max-w-full`.

**Animations:** none for text; "Ver en mapas →" uses `.link-arrow` directional-nudge on hover. Consistent restraint.

---

## Page Layouts (composed)

### Homepage (`src/app/[locale]/page.tsx`)
```
DESKTOP ≥1024                          MOBILE 375
┌───────────────────────────┐          ┌───────────────┐
│ HERO (2-col copy | image) │          │ HERO (stacked)│
├───────────────────────────┤          ├───────────────┤
│ Sillas destacadas  Ver →  │          │ Destacadas    │
│ [card][card][card][card]  │          │ [card][card]  │  ← 2-col
│ [card][card][card][card]  │          │ [card][card]  │
├───────────────────────────┤          ├───────────────┤
│ Marcas             Ver →  │          │ Marcas        │
│ [tile][tile][tile]        │          │ [tile]        │  ← 1-col
│ [tile][tile][tile]        │          │ [tile] …      │
└───────────────────────────┘          └───────────────┘
  (each section OMITTED if empty; hero always present)
```
Data flow: the page runs `listProducts({ pageSize: HOME_FEATURED_PRODUCTS })` + `listBrands()` (sliced to `HOME_FEATURED_BRANDS`) in parallel; passes `.items`/sliced arrays to the section components; renders a section only when its array is non-empty. `generateMetadata` reuses the `metadata` namespace (home title). The page is a vertical stack of `<section className="mx-auto max-w-(--breakpoint-xl) …">` wrappers.

### Generic static page (`[pageSlug]/page.tsx`)
Breadcrumb (`Inicio / <Title>`) → h1(title) → `StaticPageBody`. `generateStaticParams` from `STATIC_PAGE_SLUGS`; `generateMetadata` validates locale via `hasLocale` and returns `{ title }` from the fetched page (or localized fallback). `notFound()` on null.

### Contact / Showroom
Own folders, same shell (breadcrumb + h1 + intro) with the bespoke body (form / location block).

---

## Interaction Flows

### Flow: Send a contact message (happy path)
1. User lands on `/contacto` → server-rendered shell + form (idle). No spinner.
2. User fills name/email/(subject)/message → typing into message updates the **live char counter** `{count}/{max}` (announced via `aria-describedby`).
3. Clicks **Enviar mensaje** → button `disabled`, label → "Enviando…" (*submitting*). Button-local pending, no full-page spinner.
4. Server action: honeypot → validate (trim + length caps + `EMAIL_PATTERN`) → `clientIp()` + `checkContactRateLimit` → `sendContactRelay({fromName,fromEmail,subject:subject||null,message})`.
5. `{ok:true}` → `{status:"success", submissionId++}` → client shows **success banner** (`role="status"`, `.enter-fade`), **clears inputs** (re-key on `submissionId`), focuses banner, auto-hides after 6s.

### Flow: Validation failure
1. Submit with empty message / bad email → `{status:"invalid", fieldErrors, values, submissionId}` (no send).
2. Offending fields get `aria-invalid` + `FieldError` (`.enter-fade`), **values preserved**, focus jumps to first invalid field. Correct → resubmit.

### Flow: Send failure / rate-limit
- `{ok:false}` → `{status:"error", values}` → **error banner** (`role="alert"`) + **Retry**; values preserved; raw reason logged only.
- Over-limit → `{status:"rate-limited", values}` → **amber wait banner** (`role="alert"`); no send; user waits.

### Flow: Deep-link to an FAQ answer
1. Visit `/preguntas-frecuentes#puedo-devolver-mi-silla` → the `<h2 id>` exists on first paint.
2. Browser scrolls to the anchor natively (`scroll-margin-top` on `:target`); a subtle `:target` accent bar frames the question. No JS; reduced-motion safe.

---

## Accessibility Checklist
- [x] Every interactive element (CTAs, links, submit, retry, "Ver en mapas") has a visible focus ring (`focus-visible:ring-2 focus-visible:ring-ring`, shipped pattern).
- [x] Contact form: labels `htmlFor`↔`id`; errors via `aria-invalid` + `aria-describedby`; async success `role="status"`, error/rate-limit `role="alert"` (AC-20).
- [x] Honeypot invisible to users AND assistive tech: `aria-hidden` wrapper + `tabIndex={-1}` + off-screen (AC-15).
- [x] Char counter announced via `aria-describedby` (not a bare visual number).
- [x] Color never the only indicator: error banner = destructive color **+** icon **+** text; rate-limit = amber **+** text; success = green **+** ✓ glyph **+** text.
- [x] Hero/section images have meaningful `alt` (message keys); decorative token panels are `aria-hidden`.
- [x] Breadcrumbs use `nav[aria-label]` + `ol` + `aria-current="page"` on the last crumb (reused component).
- [x] FAQ deep-links: `id` anchors keyboard/URL reachable; heading order correct (h1 page title → h2 questions).
- [x] Tab order logical: breadcrumb → h1 region → form fields top-to-bottom → submit → banner.
- [x] Skip-to-content (shipped in nav) lands in `<main>`.
- [x] Touch targets ≥ 44px (`min-h-11`) on all form inputs and CTAs.
- [x] All motion `prefers-reduced-motion`-gated (inherited from `.enter-fade`/`.stagger`/`.card-lift`/`.link-arrow`).

## Motion Summary (every animation, spec'd)
| Surface | Effect (vocabulary) | Trigger | Property | Easing | Duration | Reduced-motion |
|---|---|---|---|---|---|---|
| Hero copy | Fade-and-rise (`.enter-fade`) | mount | opacity + translateY | `--ease-out` | 200ms | opacity-only |
| Hero primary CTA | Scale-down press | `:active` | transform scale | `--ease-out` | 160ms | none (drop) |
| Hero/section "→" links | Directional nudge (`.link-arrow`) | hover (fine pointer) | transform translateX(2px) | `--ease-out` | 150ms | none |
| Featured grids | Staggered fade-and-rise (`.stagger`) | mount | opacity + translateY, `delay=min(i,5)*40ms` | `--ease-out` | 200ms | opacity-only, no delay |
| Product/brand tiles | Card lift + image zoom (`.card-lift`) | hover/`:active` | box-shadow / transform scale | `--ease-out` | 200/160ms | none |
| Static/FAQ/showroom body | **None** (deliberate restraint) | — | — | — | — | — |
| FAQ `:target` | Accent bar (color only) | `:target` | color | — | — | unaffected |
| Contact field error | Fade-and-rise (`.enter-fade`) | validation | opacity + translateY | `--ease-out` | 200ms | opacity-only |
| Contact banners | Fade-and-rise (`.enter-fade`) | async result | opacity + translateY | `--ease-out` | 200ms | opacity-only |
| Contact submit | Scale-down press | `:active` | transform scale | `--ease-out` | 160ms | none |

---

## Message-Key Inventory (both `es-MX.json` + `en.json`, matching keys)

New namespaces/keys. `en` values are English; **static-page BODY content is translated via the `translations` DB table, NOT these files** — these files are UI chrome only.

### `home` (extend existing)
```
home.hero.title              "Sillas ergonómicas para cuidar tu espalda" / "Ergonomic chairs to care for your back"
home.hero.subtitle           "Encuentra la silla perfecta entre nuestras marcas y estilos." / "Find the perfect chair across our brands and styles."
home.hero.ctaCatalog         "Ver sillas" / "Shop chairs"
home.hero.ctaBrands          "Marcas" / "Brands"
home.hero.imageAlt           "Silla ergonómica PosturPro" / "PosturPro ergonomic chair"
home.featured.productsHeading "Sillas destacadas" / "Featured chairs"
home.featured.brandsHeading   "Marcas" / "Brands"
home.featured.viewAllProducts "Ver todas las sillas" / "View all chairs"
home.featured.viewAllBrands   "Ver todas las marcas" / "View all brands"
```
(Existing flat `home.title`/`home.intro`/`home.ctaCatalog`/`home.ctaBrands` become unused once the hero keys land — dev reconciles so `keys-used.test.ts` stays green; recommend replacing the flat keys with `home.hero.*`.)

### `staticPages` (new — generic page chrome; minimal)
```
staticPages.breadcrumb.home     reuse catalog.breadcrumb.home ("Inicio"/"Home")   — OR mint staticPages.breadcrumb.home
staticPages.breadcrumb.ariaLabel reuse catalog.breadcrumb.ariaLabel               — recommend reuse to avoid duplication
```
(The generic page's h1/body come from the DB row; only the breadcrumb "Inicio" label + `ariaLabel` are chrome. Recommend reusing the existing `catalog.breadcrumb.*` keys.)

### `contact` (new)
```
contact.metadata.title      "Contacto" / "Contact"
contact.intro               "Escríbenos y te responderemos lo antes posible." / "Write to us and we'll reply as soon as we can."
contact.name.label          "Nombre" / "Name"
contact.name.placeholder    "Tu nombre" / "Your name"
contact.email.label         "Correo electrónico" / "Email"
contact.email.placeholder   "tu@correo.com" / "you@email.com"
contact.subject.label       "Asunto" / "Subject"
contact.subject.optional    "(opcional)" / "(optional)"
contact.subject.placeholder "¿Sobre qué nos escribes?" / "What's this about?"
contact.message.label       "Mensaje" / "Message"
contact.message.placeholder "Cuéntanos cómo podemos ayudarte…" / "Tell us how we can help…"
contact.charCount           "{count}/{max}"
contact.submit              "Enviar mensaje" / "Send message"
contact.submitting          "Enviando…" / "Sending…"
contact.honeypot            "No llenar este campo" / "Do not fill this field"
contact.success             "¡Mensaje enviado! Te responderemos pronto." / "Message sent! We'll get back to you soon."
contact.errorGeneric        "No pudimos enviar tu mensaje, inténtalo de nuevo." / "We couldn't send your message, please try again."
contact.rateLimited         "Espera un momento antes de enviar otro mensaje." / "Please wait a moment before sending another message."
contact.retry               "Reintentar" / "Try again"
contact.errors.nameRequired    "Ingresa tu nombre." / "Please enter your name."
contact.errors.nameTooLong     "El nombre es demasiado largo." / "That name is too long."
contact.errors.emailRequired   "Ingresa tu correo." / "Please enter your email."
contact.errors.emailInvalid    "Ingresa un correo válido." / "Please enter a valid email."
contact.errors.emailTooLong    "El correo es demasiado largo." / "That email is too long."
contact.errors.subjectTooLong  "El asunto es demasiado largo." / "That subject is too long."
contact.errors.messageRequired "Escribe tu mensaje." / "Please write your message."
contact.errors.messageTooLong  "El mensaje es demasiado largo." / "That message is too long."
```

### `showroom` (new)
```
showroom.metadata.title  "Showroom" / "Showroom"
showroom.intro           "Visítanos y prueba nuestras sillas en persona." / "Visit us and try our chairs in person."
showroom.viewOnMaps      "Ver en mapas" / "View on maps"
showroom.mapAlt          "Mapa de la ubicación del showroom" / "Map of the showroom location"
```

### `footer` (extend existing — reconciliation)
```
footer.sections.legal    "Legal" / "Legal"                          (NEW)
footer.links.shipping    "Envíos" / "Shipping"                      (CHANGED from "Envíos y devoluciones")
footer.links.returns     "Devoluciones" / "Returns"                 (NEW)
footer.links.warranty    "Garantía" / "Warranty"                    (NEW)
footer.links.privacy     "Aviso de privacidad" / "Privacy notice"   (NEW)
footer.links.terms       "Términos y condiciones" / "Terms"         (NEW)
footer.links.showroom    "Visita nuestro showroom" / "Visit our showroom" (NEW)
```
(Existing `footer.links.about`, `footer.links.faq`, `footer.links.contact` retained.)

**Parity note:** `keys-used.test.ts` + `messages.test.ts` enforce es-MX↔en key symmetry — every key above must exist in BOTH files with identical structure or the suite fails. Dev adds them in lockstep.

---

## Seed Content Structure (informs the body-parser contract)

`StaticPageBody` expects the plain-text `## heading` / blank-line-paragraph convention. Seed bodies (`scripts/seed-data/content.ts`, es-MX; `en` via `translations`) must follow it. Legal page shape (Aviso / Terms = headed sections per AC-3):
```
Intro sentence about the policy.

## Recopilación de datos
Explanation paragraph…

## Uso de la información
Explanation paragraph…
```
FAQ body: each `## ` line is a question, the following paragraph is the answer. This keeps the renderer dumb (split + escape) and the content editable as plain text (no HTML, XSS-safe — AC-17).

---

## Handoff Notes for Dev (Stage 4)
- **Reuse, don't rebuild:** `ProductGrid`, `IndexTile`, `BrandLogo`, `Breadcrumbs`, `Button`, the `fieldClasses` string, `.enter-fade`/`.stagger`/`.card-lift`/`.link-arrow` classes, the `marcas`-page section shell. No new CSS class invented; no new field component.
- **Named constants:** `HOME_FEATURED_PRODUCTS = 8`, `HOME_FEATURED_BRANDS = 6`, `SUCCESS_FEEDBACK_MS = 6000`, contact `MAX_*` length caps, `CONTACT_RATE_LIMIT_*`. No magic numbers in JSX.
- **Contact action contract:** `sendContactRelay({ fromName, fromEmail, subject: string | null, message })` — subject `string | null` (empty → null). Pass message raw (template escapes). Never echo `reason`.
- **Slug decision is committed:** split shipping/returns; footer re-columned to 3 link groups + Legal; change `footer.links.shipping` label + add 6 new footer keys. Grep every footer/nav href against `STATIC_PAGE_SLUGS ∪ {contacto, showroom}` — zero dead links (AC-10).
- **Hero image:** ship a placeholder asset + `HERO_IMAGE` config; the component MUST degrade to the token panel if the asset is null (no broken `<img>`).
- **No animation on static/FAQ/showroom body** — deliberate; do not add stagger to prose paragraphs.
