# UI Design: T15 — Premium visual identity & image-rich refresh (Casa de Azulejo)

> Implementation spec for **S3 (Dev)**. The committed visual world, rationale, palette, and art direction live in **`DESIGN.md`** (repo root). This file is the exact build order: token diffs, font plan, per-surface changes, the image-slot system, placeholder plan, states, and the visual-regression checklist. **No prose here overrides DESIGN.md; where they touch, DESIGN.md wins on look and this file wins on mechanics.**
>
> Seed key `d43cafe8` · direction roll (persuade) · assigned index 6 · fused challenger `architecture-places-azulejo-station-hall`. Image generation was unavailable this stage (`OPENAI_API_KEY` unset, no harness image tool), so the comp-render/finish-review is deferred to S3's build per new-work §7; the QUALITY BAR reference boards were viewed to set the craft bar.

## Design Principles for This Feature

- **Frame, don't fill.** Cobalt tilework is the *chrome* (borders, captions, buttons, dividers, empty tiles); full-color product photos live *inside* cartouche frames. Blue never fights the product.
- **Whole tiles, honest grout.** Grid to whole units, grout-seam borders on every edge, the seam runs straight through — premium via precision, not gloss.
- **Premium = considered, not intimidating.** Bright, daylight, warm-Mexican. Never the black-serif luxury boutique; never the discount-bin white grid.
- **The phone is the store.** Mobile-first; desktop is the enhancement.
- **Truth over polish.** Every image slot degrades to an intentional blank tile; zero fabricated proof.

---

## 1. Token diffs (exact)

### 1a. Scope mechanism — the firewall (AC-11/12, edge 1/2)

Admin is a **parallel root layout** (`src/app/admin/layout.tsx`), and both storefront and admin bodies use the identical `bg-background font-sans text-foreground`. Therefore the brand world MUST NOT be swapped on the shared `:root` or the shared `sans` export. Mechanism:

1. **Keep the neutral `:root` (+ `.dark`) block exactly as-is** — it is now *admin's* token world.
2. **Add a storefront scope class `.theme-storefront`** in `globals.css` holding all cobalt token values.
3. **Apply `.theme-storefront` on the storefront `<body>`** in `src/app/[locale]/layout.tsx` (and nowhere else). Admin never gets the class → admin resolves the untouched neutral `:root`.

### 1b. `src/app/globals.css` — add the storefront token block

Insert **after** the existing `:root {…}` block (leave `:root` and `.dark` untouched). Update the "Brand Tokens" doc block above to describe the scoped world.

```css
/* ======================================================================== *
 * BRAND TOKENS — Casa de Azulejo (T15). Storefront-scoped so the /admin
 * dashboard keeps the neutral :root world (firewall, AC-11/12). Editing only
 * these values + the --font-heading binding re-skins the whole storefront with
 * zero component color edits (AC-4). Palette is cobalt-on-glaze tin-glazed
 * azulejo; all pairings WCAG AA verified (see DESIGN.md → Contrast). Motion
 * layer below is Emil's authority and is NOT brand — untouched.
 * ======================================================================== */
.theme-storefront {
  --background: oklch(0.985 0.006 250);
  --foreground: oklch(0.28 0.09 258);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.28 0.09 258);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.28 0.09 258);
  --primary: oklch(0.42 0.16 262);
  --primary-foreground: oklch(0.985 0.006 250);
  --secondary: oklch(0.93 0.03 250);
  --secondary-foreground: oklch(0.35 0.12 260);
  --muted: oklch(0.95 0.015 250);
  --muted-foreground: oklch(0.47 0.07 258);
  --accent: oklch(0.90 0.04 250);
  --accent-foreground: oklch(0.35 0.12 260);
  --destructive: oklch(0.55 0.20 27);
  --border: oklch(0.86 0.03 250);
  --input: oklch(0.86 0.03 250);
  --ring: oklch(0.42 0.16 262);
  --radius: 0.375rem;

  /* Reserved accent + semantic status (promoted from hardcoded amber/emerald) */
  --gold: oklch(0.72 0.14 85);
  --gold-foreground: oklch(0.28 0.09 258);
  --success: oklch(0.52 0.13 155);
  --success-foreground: oklch(0.985 0.006 250);
  --warning: oklch(0.55 0.13 70);
  --warning-foreground: oklch(0.985 0.006 250);

  /* WhatsApp affordance (brand green, FAB only — AC-7) */
  --whatsapp: oklch(0.63 0.16 155);
  --whatsapp-foreground: oklch(1 0 0);

  /* Cobalt-tinted glaze shadow */
  --shadow-color: oklch(0.42 0.16 262 / 0.12);

  /* Storefront display face (real binding, no longer aliasing --font-sans) */
  --font-heading: var(--font-heading-serif), Georgia, "Times New Roman", serif;
}
```

> **`--radius` scoping note:** `--radius` is redeclared inside `.theme-storefront`, which correctly overrides it for storefront descendants. The `@theme inline` `--radius-sm..4xl` derivations reference `var(--radius)` and re-derive under the scope automatically — **no `@theme` edit needed**. Verify at build that admin still resolves `--radius: 0.625rem` (its `:root` value is untouched).

### 1c. Register new color tokens in `@theme inline`

So Tailwind emits `bg-success`, `text-warning`, `bg-gold`, `bg-whatsapp` utilities, add to the `@theme inline` block (these are additive; they map to CSS vars that only resolve under `.theme-storefront`, so admin never sees them applied):

```css
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-gold: var(--gold);
  --color-gold-foreground: var(--gold-foreground);
  --color-whatsapp: var(--whatsapp);
  --color-whatsapp-foreground: var(--whatsapp-foreground);
```

### 1d. Token application rule (AC-3/4)

No storefront component may hardcode a raw hex/oklch/rgb brand color or raw radius after this task. All brand color flows through utilities (`bg-primary`, `text-foreground`, `border-border`, `rounded-md`, `bg-success`, `text-warning`, `bg-gold`, `bg-whatsapp`). The **only** intentional token-free exception is `src/app/global-error.tsx` (edge 8) — leave it.

---

## 2. Font-loading plan (AC-5, edge 4)

### 2a. `src/app/fonts.ts` — add the heading face; keep `sans` unchanged

```ts
import { Inter, Libre_Caslon_Text } from "next/font/google";

/** Body/UI face — SHARED with admin + not-found.tsx. UNCHANGED (firewall). */
export const sans = Inter({
  subsets: ["latin", "latin-ext"], // widen to latin-ext for es-MX accents (safe for admin too)
  variable: "--font-sans",
  display: "swap",
});

/**
 * Storefront display/heading face — Casa de Azulejo (T15). Painted-roman caps
 * of tile captions. Bound to --font-heading-serif and applied ONLY under the
 * storefront layout (.theme-storefront on <body>), so admin dialogs keep the
 * sans heading (firewall, AC-5/AC-12). latin-ext covers es-MX glyphs (edge 4).
 */
export const headingSerif = Libre_Caslon_Text({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-heading-serif",
  display: "swap",
});
```

> **Font-choice note for S3:** `Libre_Caslon_Text` is the committed heading face (broad painted-roman, full Latin-Extended-A). If at build its Latin-Extended-A coverage of the inverted marks/`ñ` shows any gap on a Spanish-heavy heading, the fallback is `Libre_Caslon_Display` or `Playfair Display` (both cover latin-ext) — but verify the primary first (edge 4). Do not silently drop to a face lacking `¿ ¡ ñ` coverage.

### 2b. `src/app/[locale]/layout.tsx` — wire scope + heading var + direction contract

Two edits (current body is at line 72–95):

**(i)** attach `.theme-storefront` and the heading font variable to the storefront `<body>`, and the heading variable on `<html>` (so the CSS var exists):

```tsx
import { sans, headingSerif } from "@/app/fonts";
// ...
<html lang={locale} className={cn("h-full", sans.variable, headingSerif.variable)}>
  <body className="theme-storefront min-h-full bg-background font-sans text-foreground antialiased">
```

> Do **not** add `headingSerif.variable` to `admin/layout.tsx`. `--font-heading` only binds to the serif under `.theme-storefront`; admin's `dialog`/`alert-dialog` keep resolving `--font-heading` to its `@theme` fallback (sans). Confirm admin dialog titles are unchanged.

**(ii)** the **direction contract** as the first child of `<body>` (AC-2) — before `NextIntlClientProvider`, an HTML comment that survives the production build:

```tsx
<body className="theme-storefront ...">
  {/* impeccable:direction-contract seed=d43cafe8
   THESIS: PosturPro is a Mexican tiled hall — a curated sequence of cobalt-framed
     panels — refusing the white-grid e-commerce default and the black-serif luxury boutique.
   OWN-WORLD: Tin-glazed azulejo. Cobalt (#1545a2) line-and-wash on milk-white glaze
     (#f7fafe); grout-seam borders; roman-caps captions in cartouche frames; mustard
     reserved inside frames; product photos framed, never tinted.
   STORY: The shopper reads breadth (a hall of framed brand/category tiles), authority
     (measured, painted precision), and fair value (honest grout, no gloss) — and buys.
   FIRST VIEWPORT: Cobalt cartouche hero — roman-caps display headline on a cobalt scrim
     beside the framed hero image slot; primary CTA button lower-left; a tile wall of
     featured chairs begins just below the fold.
   FORM: Azulejo station hall (grounded #6). seed key d43cafe8.
   FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
     review, the verdict, and DESIGN.md. */}
  <NextIntlClientProvider>
```

> Placement is load-bearing: it must be a direct child of the **root layout body**, not inside a slotted child component. `next-intl`/React comment nodes survive the build as HTML comments.

**Build check (AC-2):** after `next build`, grep the built output for `d43cafe8` — the contract must be greppable in the emitted HTML.

---

## 3. Per-surface changes

> All changes are className/token/asset edits. **Preserve every `data-testid` and every e2e structural signal** (§8). No behavior, data, or copy changes except new visible copy in lockstep i18n (§6).

### 3a. Persistent chrome (every page — do first)

| File | Change |
| --- | --- |
| `layout/site-header.tsx` | Wordmark → roman-caps small (`font-heading uppercase tracking-wide text-primary`), keep `header-wordmark` testid. Grout bottom-border (`border-border`). `.nav-hover` items get cobalt active tint (`aria-current` → `text-primary`/`bg-accent`). Sticky header gains cobalt-tinted `shadow-sm` on scroll (optional; keep if trivial). Preserve `header-nav-{key}` testids, both search boxes, z-40. |
| `layout/site-footer.tsx` | Grout top-border; column headings in `font-heading` small-caps `text-foreground`; links `text-muted-foreground hover:text-foreground` (unchanged tokens now resolve cobalt). Preserve all `footer-*` testids (`footer-store-name`, `footer-free-shipping`, `footer-link-*`, `footer-copyright`) and `min-h-[1lh]` free-shipping reservation. |
| `layout/mobile-nav.tsx` | Drawer sheet → `bg-card` with grout border; `.drawer-*` motion untouched. Active item cobalt tint. |
| `layout/language-toggle.tsx` | Segmented control on cobalt: active segment `bg-primary text-primary-foreground`, inactive `text-muted-foreground`. Compact mobile variant unchanged in structure. |
| `layout/whatsapp-button.tsx` | **~line 54:** `bg-primary text-primary-foreground` → `bg-whatsapp text-whatsapp-foreground` (AC-7). Keep round seal, `shadow-lg`, `.fab-pop`, `whatsapp-button` testid, safe-area insets, z-50. |

### 3b. Homepage (`src/app/[locale]/page.tsx` + `home/*`)

| File | Change |
| --- | --- |
| `home/hero.tsx` | Copy panel on a **cobalt scrim cartouche**: headline `font-heading text-4xl lg:text-6xl text-balance`. On mobile the copy sits in a `bg-primary text-primary-foreground` caption panel below/over the media; on `lg` the 2-col grid keeps copy-left/media-right, copy on glaze with cobalt headline. `HeroMedia` gains the cartouche frame (`rounded-md border border-primary/30`), keeps `aspect-[4/3]`, `fill`, `priority`, `sizes`, `hero-image-fallback` testid, null-degrade glyph. Keep `hero-cta-catalog`, `hero-link-brands` testids and `.enter-fade`/`.link-arrow`. |
| **NEW** `home/editorial-band.tsx` | New storefront-scoped **ergonomics editorial band** (AC-8): a wide cartouche lifestyle image slot (`aspect-[16/9]` mobile → `21/9` lg) with a cobalt caption bar carrying a short posture-authority headline + subcopy (i18n keys, §6). **No fabricated proof** — copy is a curation/ergonomics claim, not a testimonial/stat. Slot config-driven (`EDITORIAL_BAND_IMAGE`), null → blank cobalt tile with Chair/posture glyph. Reuse `section-header` grammar. `.enter-fade` on mount. |
| `home/featured-products.tsx` | Tile-wall grid; cards per 3c. Section header `font-heading` small-caps. |
| `home/featured-brands.tsx` | Brand marks as framed tiles (`border border-border rounded-md bg-card`), cobalt caption label. |
| `[locale]/page.tsx` | Section order: Hero → Featured Products → **Editorial Band** → Featured Brands. Resolve editorial-band strings in the RSC and pass as props (pre-resolved-labels discipline). Guarded reads unchanged. |

### 3c. Catalog / PLP (`catalog/*`, `/sillas`, `/marcas`, `/categorias`, `/estilos` + `[slug]`)

| File | Change |
| --- | --- |
| `catalog/product-card.tsx` | Card is a cartouche tile: `border-border bg-card rounded-md`; image slot `aspect-[4/5]` gains cartouche framing (keep `bg-muted`, `fill`, `sizes`, first-row `priority`, fallback glyph). **Preserve** `product-card`/`product-card-link` testids, `.stagger`/`.card-lift`/`.card-image`, and compare-at `text-muted-foreground line-through` (e2e). Price cobalt `text-foreground tabular-nums`. Out-of-stock `opacity-60` preserved. |
| `catalog/product-grid.tsx` | **Preserve `gridTemplateColumns` structure** (e2e asserts grid columns). Gap → `gap-4 lg:gap-6` (grout). |
| `catalog/index-tile.tsx` / `catalog/brand-logo.tsx` | Framed painted panels with cobalt caption label. |
| `catalog/filter-*`, `catalog/toolbar.tsx`, `catalog/breadcrumbs.tsx` | Cobalt-chrome panel (`bg-card border-border`), active filters `bg-accent text-accent-foreground`. |
| `catalog/stock-badge.tsx` | Low-stock → `text-warning` (was `text-amber-*`, 2 usages); affirmative in-stock → `text-success` where used. Keep glyph+text + testids. |
| `catalog/no-results.tsx`, `catalog/empty-state.tsx`, `catalog/pagination.tsx` | Restyle to cobalt; blank-tile empty illustration (glyph in `bg-muted` cartouche). |
| `catalog/catalog-skeleton.tsx` | Skeleton base `bg-muted` (pale glaze, not neutral gray); preserve layout reservation (no CLS). |

### 3d. PDP (`product/*`, `/producto/[slug]`)

| File | Change |
| --- | --- |
| `product/product-gallery.tsx` | Main image = large cartouche; thumbnails = small framed tiles with cobalt active ring (`ring-2 ring-primary`). `.gallery-image` motion untouched. Preserve testids. |
| `product/product-purchase-panel.tsx` | Cobalt-bordered "spec cartouche" (`border-border bg-card`); price cobalt `tabular-nums`; CTA `bg-primary`; stock badge glyph+text. |
| `product/product-specs.tsx` | Measured-ledger table: grout row rules (`divide-border`), roman-caps column labels. |
| `product/product-qa.tsx`, `product/qa-form.tsx` | `qa-form.tsx` amber → `text-warning` (2, validation/pending). Cobalt links. |
| `product/recently-viewed.tsx` | Quiet tile row of cards. |
| `product/pdp-skeleton.tsx` | Skeleton restyle as 3c. |

### 3e. Cart (`cart/*`, `/carrito`)

| File | Change |
| --- | --- |
| cart line/summary components | Ledger tile; grout-ruled rows. |
| `cart/free-shipping-progress.tsx` | `bg-emerald-*` → `bg-success` (2 bg); glyph+text. Track `bg-muted`, fill `bg-success`. |
| `cart/order-summary.tsx` | `text-emerald-*` → `text-success` (2). |
| `cart/cart-skeleton` | Skeleton restyle. |

### 3f. Checkout (`checkout/*`, `/checkout`, `/checkout/confirmacion/[token]`)

| File | Change |
| --- | --- |
| `checkout/payment-panel.tsx` | amber (6) → `text-warning`, emerald (2) → `text-success`. Pending = calm cobalt/warning panel, never error-red. |
| `checkout/checkout-summary.tsx` | amber (2) → `text-warning`, emerald (4) → `text-success`. |
| `checkout/oxxo-spei-instructions.tsx` | amber (2) → `text-warning`. **Calm painted panel** (`bg-warning/10 border-warning/30 text-warning`), glyph+text — pending is normal (PRODUCT.md). |
| `checkout/discount-code-field.tsx` | emerald (2 text, 1 bg) → `--success`. |
| `checkout/checkout-skeleton.tsx` | Skeleton restyle. |
| `[locale]/checkout/confirmacion/[token]/page.tsx` | emerald (4) → `text-success`. Restrained cobalt cartouche celebration; money display preserved. |

### 3g. Static pages (9) + contact + showroom (`content/*`, `[pageSlug]`, `contacto`, `showroom`)

| File | Change |
| --- | --- |
| `content/static-page-body.tsx` | `max-w-prose` read column; H2 → `font-heading` small-caps tile-caption; cobalt links; no `dangerouslySetInnerHTML` introduced (renders escaped children, unchanged). |
| `[locale]/contacto/contact-form.tsx` | amber (4 text, 1 bg) → `--warning` for validation; **preserve honeypot off-screen `left`** (e2e). Fields on grout borders, cobalt focus ring. |
| `showroom` route / `ShowroomLocation` | Map slot degrades to cobalt pin-glyph cartouche when `SHOWROOM_MAP_IMAGE`/`SHOWROOM_MAP_URL` null (unchanged degrade, restyled). |

### 3h. 404 / error

| File | Change |
| --- | --- |
| `[locale]/not-found.tsx` | "Lost panel / blank tile" empty state in cobalt world; preserve testids + bilingual copy. It uses shared `sans` (fine). If it renders outside `.theme-storefront`, wrap its root element in `theme-storefront` so it gets the cobalt world. |
| `[locale]/error.tsx` | Restyle to cobalt; testids preserved. |
| `app/global-error.tsx` | **UNTOUCHED** — intentional token-free system-ui exception (edge 8). Confirm bilingual fallback reads acceptably; note the exception for reviewers so it is not flagged as a token violation. |

---

## 4. Image-slot system

### 4a. Config shape (extends the `HERO_IMAGE` pattern)

Add to `src/lib/config/static-pages.ts` (or a new `src/lib/config/imagery.ts` re-exported there). Every slot is `string | null`, defaulting `null` (Phase-1). A slot is either a `/public` path or an allow-listed remote URL.

```ts
/**
 * Editorial/lifestyle image slots (T15, AC-8/9). string | null — null degrades
 * to a token-styled blank-tile placeholder (never a broken <img>, never CLS).
 * Swap to a real asset by setting a /public path or an allow-listed URL — no
 * layout rework. NEVER a slot that implies fabricated proof.
 */
export const HERO_IMAGE: string | null = null;              // existing (homepage hero)
export const EDITORIAL_BAND_IMAGE: string | null = null;    // NEW — homepage ergonomics band
export const CATALOG_BANNER_IMAGE: string | null = null;    // NEW — /sillas index banner (optional art slot)
export const SHOWROOM_MAP_IMAGE: string | null = null;      // existing
export const SHOWROOM_MAP_URL: string | null = null;        // existing
```

### 4b. Degrade behavior (edge 3)

Every consumer follows the `HeroMedia` pattern verbatim:

- **Present:** `next/image` with `fill`, correct `sizes`, `object-cover`, inside the reserved aspect box + cartouche frame.
- **Null:** a `bg-muted` panel of the **same aspect box** with a centered `@hugeicons` line-glyph at `text-muted-foreground/40`, `aria-hidden`, plus a `data-testid` fallback. **Zero CLS whether asset present or absent.**

### 4c. `public/` layout (create — does not exist yet)

```
public/
  images/
    editorial/        # homepage ergonomics band lifestyle asset(s)
    catalog/          # optional catalog/category banner art
    showroom/         # static showroom map / storefront photo
  README.md           # notes: all slots null by default; drop assets + set config path; art direction in DESIGN.md
```

### 4d. Exact slot list (per page, with aspect ratios)

| Slot | Surface | Config | Aspect | `sizes` | `priority` |
| --- | --- | --- | --- | --- | --- |
| Hero media | Homepage | `HERO_IMAGE` | `4/3` | `(min-width:1024px) 50vw, 100vw` | **yes** (LCP) |
| Editorial band | Homepage | `EDITORIAL_BAND_IMAGE` | `16/9` → `21/9` lg | `100vw` | no |
| Catalog banner (optional) | `/sillas` index | `CATALOG_BANNER_IMAGE` | `21/9` | `100vw` | no |
| Product cover | Catalog cards | DB (picsum) | `4/5` | `(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw` | first-row only |
| Product gallery | PDP | DB (picsum) | `1/1` or `4/5` | `(min-width:1024px) 50vw, 100vw` | main image only |
| Brand mark | Featured/brands | DB / `brand-logo` | `3/2` | `(max-width:768px) 50vw, 33vw` | no |
| Showroom map | `/showroom` | `SHOWROOM_MAP_IMAGE`/`_URL` | `16/9` | `100vw` | no |

**Only the hero (and the PDP main image / catalog first row) is `priority`** (AC-15) — never lazy-load the LCP, never `priority` the below-fold band.

---

## 5. Placeholder sourcing plan (AC-9/10)

**Default state ships with all editorial slots `null`** → intentional blank cobalt tiles. That is a complete, premium Phase-1 state (native to the azulejo world). No fabricated proof, so this is the safe default.

**If the owner wants real placeholder imagery before real photography arrives**, two supported paths (S3/owner choice — do not fabricate):

- **Path A (preferred — local, no allow-list, no CSP risk):** generate art-directed placeholders via `generate-image.mjs` (requires `OPENAI_API_KEY` at S3; unavailable this stage) and store under `public/images/…`. Prompts per slot (per DESIGN.md art direction: bright daylight, cool-neutral grade, chair/workspace subject, cobalt-harmonious):
  - **Hero:** *"A single premium ergonomic office chair, three-quarter view, on a clean cool-white studio background, bright even daylight, soft shadow, neutral-to-cool white balance, no text, no logos, product-catalog composition."*
  - **Editorial band:** *"A calm modern Mexican home-office corner with one ergonomic chair at a desk, cool daylight through a window, uncluttered, cool-neutral color grade, no visible faces, no text, wide cinematic framing."*
  - **Catalog banner:** *"A tidy row of three distinct office chairs on a light seamless studio floor, even daylight, cool-neutral grade, no text."*
  Mark generated assets as synthetic placeholders in `public/images/README.md`.
- **Path B (licensed stock):** high-quality licensed stock with **verified-resolving URLs**, matching the same art direction. If remote-hosted, add the host to `next.config.ts` `images.remotePatterns` mirroring the existing picsum/supabase entries (lines ~43–60). Prefer downloading into `/public` to avoid a new host + CSP exposure.

**Hard rule (AC-9):** no image a visitor could mistake for real proof (no fake testimonials, crowds implying sales volume, invented awards). Editorial copy states curation/ergonomics claims only, never customer counts or reviews.

**`next.config.ts` (AC-10):** no new host is needed for the null-default ship or for Path A (local `/public`). Only Path B with a remote host requires a `remotePatterns` addition; otherwise leave `next.config.ts` unchanged.

---

## 6. New copy & i18n (AC-16)

The only new visible copy is the **editorial band** (headline + subcopy) and any new **image alt text**. Add keys to **both** `src/messages/es-MX.json` and `src/messages/en.json` in lockstep (equal key sets, currently 614 lines each). Suggested namespace `home.editorial`:

| Key | es-MX (draft) | en (draft) |
| --- | --- | --- |
| `home.editorial.title` | "Sillas elegidas por cómo cuidan tu cuerpo" | "Chairs chosen for how they care for your body" |
| `home.editorial.body` | "Cada silla en PosturPro se selecciona por su ergonomía y su valor, no por su etiqueta." | "Every chair at PosturPro is curated for ergonomics and value — not for its label." |
| `home.editorial.imageAlt` | "Espacio de trabajo con una silla ergonómica" | "Workspace with an ergonomic chair" |

> Copy is a **product/ergonomics claim**, not proof — no numbers, customers, or reviews. Final wording is the owner's to approve; keep both files symmetric. Verify one of these accented strings renders in the heading face without glyph fallback (edge 4 check: "cómo", "elegidas").

---

## 7. States (every surface keeps every state, restyled)

| State | Treatment in the cobalt world |
| --- | --- |
| **Loading** | Skeletons (`catalog/pdp/checkout/cart`) use `bg-muted` pale-glaze base (reads premium, not neutral gray); layout reservation preserved (no CLS). Hero LCP `priority`. |
| **Empty** | No-results / empty cart / empty checkout / empty featured → existing components + CTAs, restyled to cobalt; a **blank-tile cartouche** with a centered glyph as the illustration; same wayfinding. |
| **Error** | Localized 404 + `error.tsx` restyled cobalt, testids preserved; `global-error.tsx` stays neutral system-ui exception. |
| **Success** | Order confirmation, add-to-cart, discount-applied, free-shipping-achieved → `--success`, glyph+text, AA preserved. |
| **Disabled** | Buttons `opacity-60 pointer-events-none` (unchanged), still legible on glaze. |
| **Mobile (375)** | Mobile-first; hero/band images stack; nav → drawer; touch targets ≥44px preserved. |
| **Tablet (768)** | Hero copy/image, PDP gallery/purchase, checkout summary reflow at existing breakpoints. |

---

## 8. Visual regression checklist (AC-11/13/15/18/19)

**Admin firewall (before/after screenshots — the headline check):**
- [ ] Screenshot `/admin/login` before and after → palette + font pixel-identical.
- [ ] Screenshot one authed admin page (e.g. orders list) before/after → identical.
- [ ] No file under `src/app/admin/` or `src/components/admin/` edited.
- [ ] Shared `src/components/ui/{button,badge,alert-dialog,dialog,tabs}.tsx` **not restyled** (token-only); admin dialog titles keep sans heading (verify `--font-heading` resolves sans under admin, not the serif).
- [ ] Admin `--radius` still `0.625rem`; storefront `0.375rem`.

**Contrast (AA — every surface, DESIGN.md verified values):**
- [ ] Body / heading / muted / buttons / links / badges / form fields all ≥ AA on glaze.
- [ ] All text-over-image sits on the cobalt scrim / caption bar (8.37:1) — hero + editorial band, verified with a synthetic worst-case (very light + very dark) image swapped into the slot.
- [ ] Status glyph+text preserved everywhere (warning/success/destructive never color-only).
- [ ] Cobalt focus rings visible on the glaze ground on every interactive element.

**Structural / e2e signals (must survive — §3):**
- [ ] `product-grid` `gridTemplateColumns` structure unchanged.
- [ ] PDP compare-at `text-decoration: line-through` preserved.
- [ ] Contact + mobile-filter honeypot off-screen `left` preserved.
- [ ] Every asserted `data-testid` preserved (header/footer/hero/product-card/whatsapp/etc.). No rename unless reconciled in the e2e spec + justified.
- [ ] `formatMXN` money display + `tabular-nums` + compare-at unchanged (AC-17).

**Motion / a11y (AC-14):**
- [ ] Motion layer untouched; `prefers-reduced-motion` honored on every surface.
- [ ] Any new motion (band `.enter-fade`, optional cobalt-wash) is `transform`/`opacity`, `ease-out` enter, RM-gated.

**Responsive (AC-18):**
- [ ] No horizontal overflow at 320 / 375 / 768 / 1024 / 1280px on every storefront surface.

**Perf / build (AC-2/10/15/19):**
- [ ] `next build` succeeds; grep built output for `d43cafe8` (direction contract survives).
- [ ] Font bundle bounded (2 families, `latin`+`latin-ext` subset, `display: swap`).
- [ ] `next/image` `sizes`/`priority` correct; LCP hero `priority`; no below-fold `priority`; aspect boxes reserved (no CLS).
- [ ] No `next/image` from a non-allow-listed host.
- [ ] `tsc --noEmit` clean; `eslint` clean on touched files; unit + integration + storefront e2e green.
- [ ] es-MX accented heading renders in the serif with no glyph fallback (edge 4).

---

## 9. Build order (recommended for S3)

1. **Firewall first** — screenshot admin baseline; add `.theme-storefront` block + `@theme` color tokens; apply class on storefront `<body>`. Verify storefront re-paints and admin is untouched.
2. **Fonts** — add `headingSerif`, wire `--font-heading` under scope, verify accented heading.
3. **Direction contract comment** in `[locale]/layout.tsx` body; confirm greppable after build.
4. **Chrome** (header/footer/mobile-nav/language-toggle/WhatsApp) — every page.
5. **Homepage** (hero cartouche → editorial band → featured products/brands) + i18n keys.
6. **Catalog/PLP → PDP → cart → checkout → static/contact/showroom → 404/error** — apply world + reconcile the 10 storefront amber/emerald files to `--warning`/`--success` consistently.
7. **Image-slot system** — create `public/`, add config slots, verify null-degrade on every slot.
8. **Sweep** — AA (incl. text-over-image), RM, responsive 320–1280, i18n lockstep, money intact.
9. **Comp render + finish review** (deferred from S2): render the hero/homepage comp, run the impeccable finish reviewer against the direction contract, then the documenter re-confirms DESIGN.md from the built world.
10. **Test green + admin before/after** — full suite; firewall screenshots.

## 10. Binding decisions the owner may veto (flag for the orchestrator)

1. **The cobalt-azulejo world itself** — a distinctly Mexican tile identity, not neutral premium minimalism. This is the committed direction (the roll and the strongest dealt challenger agreed on it). Owner can veto → re-roll or take the standing exit (category-standard premium e-commerce).
2. **Body face stays Inter** (identity carried by cobalt + the roman-caps heading), not a novelty body font — keeps admin-font risk zero and the bundle bounded.
3. **Dark mode decommissioned for storefront** (light-only azulejo). `.dark` retained only as admin's untouched world.
4. **All editorial image slots ship `null`** (blank cobalt tiles) until the owner provides real photography or approves generated/licensed placeholders — no fabricated proof.

### Files at a glance (S3 create/modify)

- **Create:** `DESIGN.md` (done, S2), `src/components/home/editorial-band.tsx`, `public/` + `public/images/README.md`.
- **Modify (tokens/fonts/scope):** `globals.css`, `fonts.ts`, `[locale]/layout.tsx`, `lib/config/static-pages.ts`, (`next.config.ts` only if Path B remote host).
- **Modify (surface application):** ~40 storefront components per §3 (className/token edits), incl. the **10 storefront amber/emerald files**: `catalog/stock-badge.tsx`, `product/qa-form.tsx`, `checkout/{discount-code-field,payment-panel,checkout-summary,oxxo-spei-instructions}.tsx`, `cart/{order-summary,free-shipping-progress}.tsx`, `contacto/contact-form.tsx`, `checkout/confirmacion/[token]/page.tsx`.
- **Modify (i18n):** `messages/es-MX.json` + `messages/en.json` (editorial band keys only).
- **Do NOT touch:** anything under `src/app/admin/` or `src/components/admin/`, shared `src/components/ui/*` (token-only), the motion layer in `globals.css`, `app/global-error.tsx`.
