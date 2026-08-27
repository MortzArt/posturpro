# UI Design: T19 — Homepage rebuild + product condition grades

> Stage 3 (UI Design) artifact. This spec is the design authority for the T19 dev
> stage — it resolves every visual/interaction decision so dev needs zero design
> judgment. It takes **structure + copy** from the client mockups and expresses
> them entirely in the site's existing design language (Casa de Azulejo shell,
> shadcn/ui, Libre Caslon Text headings + Inter body, token-driven `.theme-storefront`).
> The mockup's fonts/palette/tag aesthetic are **rejected** (owner) and appear nowhere here.
>
> Authorities: `impeccable` owns look/identity; `emil-design-eng` owns motion
> restraint; motion is named in `animation-vocabulary` terms. All copy is verbatim
> from `tasks/reference/client-homepage-{es,en}.html`.

---

## Design Principles for This Feature

1. **The frame is the brand; the product is the fill.** Chrome (topbar, nav, borders, buttons, section dividers, badges, empty tiles) carries the new green identity and orange CTAs. Real product photography (when it arrives) drops into neutral framed slots and the world holds. Never tint a product image.
2. **Green is identity, orange is action.** Deep/brand green is the site's color 30–60% of the surface (headings, borders, tints, primary buttons). Orange `#f95326` is reserved *exclusively* for primary CTAs — it must never appear as decoration, or it stops meaning "click me."
3. **Truth over polish.** Every illustrative figure ships with a subtle asterisk disclaimer. No fabricated testimonials rendered as real; the mockup's dashed media-note boxes are never rendered.
4. **The phone is the store.** Every section is designed at 320px first; desktop is the enhancement. Spanish copy (longer) is the layout stress-test, not English.
5. **Motion serves comprehension, never decoration.** Reuse the shipped motion layer (`.stagger`, `.card-lift`, `.enter-fade`, `.select-content-motion`); add no new named motion except the three the calculator/FAQ/CTA genuinely need. Enter = `ease-out`, `transform`/`opacity` only, interruptible, reduced-motion-safe.
6. **One component per section, thin page.** `page.tsx` stays a composition shell (SEO + reads + section order); each section is its own ≤400-line component. The hero splits into hero/stats/cert-tag if it approaches the cap.

---

## PART A — DESIGN TOKENS (the site-wide seam)

All storefront color flows through `.theme-storefront` in `src/app/globals.css`. **No component may hardcode a hex/oklch/rgb value** (AC-12/13). Admin `:root`/`.dark` are firewalled — do not touch. Hex is sRGB reference; **oklch is authoritative** (repo convention).

### A.1 Brand palette (replaces cobalt)

| Token | New oklch | ~hex | Role | Replaces (cobalt) |
| --- | --- | --- | --- | --- |
| `--background` | `oklch(0.985 0.008 158)` | `#f6fbf7` | Milk-glaze ground, faint **green** tint (not pure white) | `oklch(0.985 0.006 250)` |
| `--foreground` | `oklch(0.28 0.055 158)` | `#0d2b1a` | Green-ink body text | `oklch(0.28 0.09 258)` |
| `--card` | `oklch(1 0 0)` | `#ffffff` | Tile face; cards sit above ground | unchanged |
| `--card-foreground` | `oklch(0.28 0.055 158)` | `#0d2b1a` | Green ink on tile | — |
| `--popover` / `--popover-foreground` | same as card | — | — | — |
| `--primary` | `oklch(0.3346 0.0816 151.8)` | `#094220` | **Deep green** — brand color: primary buttons, headings-on-tint, active nav, links | `oklch(0.42 0.16 262)` |
| `--primary-foreground` | `oklch(0.985 0.008 158)` | `#f6fbf7` | Glaze white on deep green (**11.59:1**) | — |
| `--secondary` | `oklch(0.9615 0.0214 158.6)` | `#e7f7ed` | **Mint** — secondary buttons, quiet fills, section tint bands | `oklch(0.93 0.03 250)` |
| `--secondary-foreground` | `oklch(0.3346 0.0816 151.8)` | `#094220` | Deep green on mint (**10.45:1**) | — |
| `--muted` | `oklch(0.955 0.012 158)` | `#eaf4ee` | Pale glaze — image-slot backing, skeleton base, spec lines | — |
| `--muted-foreground` | `oklch(0.47 0.045 158)` | `#4a6656` | Muted green-gray — captions, meta, compare-at price (**5.6:1 on bg**) | — |
| `--accent` | `oklch(0.92 0.03 158)` | `#dcefe3` | Hover fill, active nav tint | — |
| `--accent-foreground` | `oklch(0.3346 0.0816 151.8)` | `#094220` | Deep green on accent | — |
| `--border` | `oklch(0.88 0.02 158)` | `#cfe2d6` | Grout seam — every border/divider/tile edge | — |
| `--input` | `oklch(0.88 0.02 158)` | `#cfe2d6` | Field borders | — |
| `--ring` | `oklch(0.5234 0.1380 150.3)` | `#0f7f3c` | **Brand green** focus ring, visible on glaze (**5.10:1**) | — |
| `--destructive` | `oklch(0.55 0.20 27)` | `#cc2827` | Error / remove — keep existing | unchanged |

`--radius` stays `0.375rem`. `--shadow-color` → `oklch(0.3346 0.0816 151.8 / 0.12)` (green-tinted glaze shadow).

### A.2 CTA tokens (NEW — dedicated, not a repurposed `--primary`)

Orange is exclusively CTAs, so brand green stays the identity color (AC-13, research "Key Decisions"). **Critical AA finding:** white text on `#f95326` is only **3.34:1 — FAILS** the AC-13 ≥4.5:1 body-text floor. The CTA foreground is therefore a **dark warm-brown**, not white.

| Token | oklch | ~hex | Role | Contrast |
| --- | --- | --- | --- | --- |
| `--cta` | `oklch(0.6654 0.2096 35.3)` | `#f95326` | CTA fill — owner-mandated orange, exact | — |
| `--cta-foreground` | `oklch(0.2151 0.0452 46.7)` | `#2a1206` | Dark warm-brown text/icon on orange | **5.30:1 ✔ AA** |
| `--cta-hover` | `oklch(0.6254 0.2034 35.0)` | `#e8481d` | CTA fill on `:hover` (subtle darken) | fg still **4.53:1 ✔** |
| `--cta-active` | `oklch(0.5948 0.1937 35.7)` | `#d94316` | CTA fill on `:active` (press) | fg **4.01:1**, large/UI ✔ |
| `--cta-text` | `oklch(0.5456 0.1796 36.2)` | `#c23a0c` | Darkened orange for **orange-as-TEXT** (rare — e.g. an inline "Save 43%" on white) | **5.38:1 on white ✔** |

Register in the `@theme inline` block alongside the existing storefront colors:
```
--color-cta: var(--cta);
--color-cta-foreground: var(--cta-foreground);
--color-cta-hover: var(--cta-hover);
--color-cta-active: var(--cta-active);
--color-cta-text: var(--cta-text);
```
Then `bg-cta text-cta-foreground hover:bg-cta-hover active:bg-cta-active` become valid utilities. Define the `--cta-*` vars inside `.theme-storefront` (storefront-scoped; admin never sees orange).

### A.3 Semantic + reserved tokens

Keep `--success`, `--warning`, `--gold`, `--whatsapp`, `--whatsapp-foreground`, re-hued to the green world so nothing reads cobalt-adjacent:
- `--success` `oklch(0.52 0.13 155)` (#007e46) — unchanged (already green, AA 4.95:1).
- `--warning` `oklch(0.55 0.13 70)` (#a16100) — unchanged.
- `--gold` — do **not** use for the homepage grade badge or decoration (the mockup's brass tag is rejected). Keep the token for the existing featured/value seal on catalog surfaces only.
- `--whatsapp` `oklch(0.63 0.16 155)` (#1fa855) — unchanged; the FAB keeps its recognizable WhatsApp green.

### A.4 Contrast guarantee table (all AA-verified this stage)

| Pairing | Ratio | Floor |
| --- | --- | --- |
| foreground / background | 12.8:1 | 4.5 ✔ |
| primary-fg / primary (green button) | 11.59:1 | 4.5 ✔ |
| secondary-fg / secondary (green-on-mint button) | 10.45:1 | 4.5 ✔ |
| **cta-fg / cta (orange button)** | **5.30:1** | 4.5 ✔ |
| cta-fg / cta-hover | 4.53:1 | 4.5 ✔ |
| primary / background (green link) | 12.8:1 | 4.5 ✔ |
| ring (brand green) / background | 5.10:1 | 3.0 ✔ (UI) |
| grade badge: secondary text / mint chip | 10.45:1 | 4.5 ✔ |
| white / deep-green (topbar & footer) | 11.59:1 | 4.5 ✔ |
| muted-foreground / background | 5.6:1 | 4.5 ✔ |

### A.5 Typography (unchanged — do NOT introduce fonts)

- Headings: `font-heading` → Libre Caslon Text (already bound under `.theme-storefront`).
- Body/UI: `font-sans` → Inter.
- No Big Shoulders Display, no IBM Plex, no mono display face. The mockup's "mono spec line" becomes Inter with `tracking-wide uppercase text-xs text-muted-foreground` — no monospace font.
- Scale used: eyebrow `text-xs font-semibold uppercase tracking-wide text-primary`; section H2 `font-heading text-2xl sm:text-3xl font-bold`; hero H1 `font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-primary`; body `text-sm sm:text-base text-muted-foreground leading-relaxed`.

---

## PART B — SHARED COMPONENTS

### B.1 Button — extend with a `cta` variant + `xl` size

**shadcn base:** existing `src/components/ui/button.tsx` (cva). Add to the `variant` map and `size` map — do not fork.

```
variant: {
  …existing…,
  cta: "bg-cta text-cta-foreground shadow-sm hover:bg-cta-hover active:bg-cta-active cta-press",
}
size: {
  …existing…,
  xl: "h-11 min-w-11 px-6 text-sm font-semibold",   // hero/banner CTAs, ≥44px touch target
}
```

**States**
| State | Visual | Behavior |
| --- | --- | --- |
| Default | Orange fill, dark-brown label | — |
| Hover (hover-capable only) | Fill → `--cta-hover`; no lift | — |
| Active/press | Fill → `--cta-active` + `.cta-press` scale(0.97) | instant feedback |
| Focus-visible | `ring-2 ring-ring ring-offset-2` (brand-green ring) | keyboard only |
| Disabled | `opacity-60 pointer-events-none` | (CTAs on this page never disabled) |

**Motion** — add `.cta-press` to globals.css (mirrors existing `.cart-press`): trigger `:active`; property `transform: scale(0.97)`; `120ms`, `var(--ease-out)`; reduced-motion `transform:none`. This is **Press/Tap feedback** (animation-vocabulary).

`asChild` is used for every CTA that navigates (`<Button asChild variant="cta" size="xl"><Link href=…>`).

**Secondary CTA** (hero "Business solutions", banner 2nd CTA): `variant="secondary"` (mint fill, green text) — NOT orange. Only the *primary* action per section is orange (one orange CTA per viewport max — clarity of hierarchy).

### B.2 GradeBadge — NEW shared component

**Purpose:** show a product's condition grade (A+/A/B) when set.
**Location:** product card (catalog + homepage catalog section), PDP.
**File:** `src/components/catalog/grade-badge.tsx`. Pure presentational server component. Follows `StockBadge` grammar exactly (pre-resolved label, glyph+text, token colors, `data-*` hooks).
**shadcn base:** none (chip primitive, same as StockBadge).

**Props**
```typescript
import type { ProductConditionGrade } from "@/lib/catalog/grade";

interface GradeBadgeProps {
  /** null / unrecognized → renders nothing (AC-10, edge 2). */
  grade: ProductConditionGrade | null | undefined;
  /** Pre-resolved localized label, e.g. "Grado A+" / "Grade A+". */
  label: string;
  /** Placement classes (absolute on a card, inline on a PDP). */
  className?: string;
}
```

**Behavior**
- `grade == null` OR not in `PRODUCT_CONDITION_GRADES` → `return null` (no badge, **no reserved empty space** — AC-10/11, edge 1/2). The component self-guards; the parent also conditionally renders so no gap is left.
- All three grades share ONE visual treatment (a mint chip with deep-green text + a certificate glyph) — the grade *letter is in the text*, so color need not vary by grade (colorblind-safe; consistent with StockBadge's "text carries the state"). This deliberately avoids a green/amber/red grade scale that would wrongly imply B is "bad" — all three are functionally verified (per FAQ copy). Do not color-code grade quality.

**Layout (ASCII)** — inline chip:
```
┌───────────────────┐
│ ⬡  Grado A+        │   ⬡ = certificate glyph, 12px, text-primary
└───────────────────┘
   mint fill, deep-green text, rounded-full, px-2 py-0.5, text-xs font-medium
```

**Classes**
```
inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5
text-xs font-medium text-secondary-foreground border border-primary/20
```
Glyph: `@hugeicons/core-free-icons` → `Award01Icon` (size 12, `strokeWidth 2`, `aria-hidden`, `text-primary`). Never mix icon sets.

**States**
| State | Visual | Behavior |
| --- | --- | --- |
| grade set | Mint chip, deep-green text + glyph | static |
| grade null/unknown | (nothing) | `return null` |
| on card | absolute top-left of image tile (opposite the top-right StockBadge) | see B.3 |
| on PDP | inline in the title/price meta row | see D.11 |

**Placement rule (AC-11, edge 12):** on a product card the StockBadge is `absolute right-2 top-2`; the GradeBadge is `absolute left-2 top-2`. At 320px the image tile is ≥140px wide — two chips on opposite corners never collide. Both chips carry `max-w-[45%] truncate` as a safety net; "Grado A+" is short enough it never truncates. Verify at 320px: name still clamps to 2 lines below the image; badges sit over the image, not the text.

### B.3 ProductCard — add GradeBadge slot

**Modify** `src/components/catalog/product-card.tsx`. Inside the image `<div class="relative …">`, add the GradeBadge sibling to the existing StockBadge:
```
{product.conditionGrade ? (
  <GradeBadge grade={product.conditionGrade} label={labels.grade ?? ""}
              className="absolute left-2 top-2" />
) : null}
<StockBadge … className="absolute right-2 top-2" />
```
`CatalogProductCard` gains `conditionGrade: ProductConditionGrade | null` (AC-9). The `labels` prop gains `grade: string | null` (grid resolves `product.grade.badge` with the grade value interpolated, e.g. `t("product.grade.badge", { grade })`, only when a grade exists).

**Layout (ASCII) — product card at ≥640px:**
```
┌─────────────────────────────┐
│ ┌─────────────────────────┐ │
│ │[Grado A+]        [En…]  │ │ ← grade top-left, stock top-right
│ │      product image      │ │   aspect-[4/5], rounded, border-primary/30
│ │       (or glyph)        │ │
│ └─────────────────────────┘ │
│ Herman Miller               │   brand — text-xs muted
│ Aeron Ergonómica…           │   name — font-heading, line-clamp-2
│ $21,900   $38,500           │   price + struck compare-at (tabular-nums)
│ 3 colores                   │   optional
└─────────────────────────────┘
```
No spec-line ("Talla B · Grafito") is added — that data isn't on `CatalogProductCard`; the mockup's spec line maps to our existing brand + name + colorCount. Do not invent a spec field.

### B.4 Accordion — NEW, native `<details>`/`<summary>` (no new dependency)

**Decision:** `@radix-ui/react-accordion` is **not installed** and AC forbids new deps. Build a CSS-only accordion on native `<details>`/`<summary>` — CSP-safe (no inline script), keyboard-accessible for free, works without JS. Used only in Trust+FAQ.

**File:** `src/components/home/faq-accordion.tsx` (server component; static content).
**shadcn base:** none.

**Props**
```typescript
interface FaqItem { id: string; question: string; answer: string; }
interface FaqAccordionProps { items: FaqItem[]; }
```

**Layout (ASCII):**
```
┌───────────────────────────────────────────┐
│ ¿Las sillas son 100% originales?      [+]  │ ← <summary>, chevron rotates on open
├───────────────────────────────────────────┤
│ Sí. Nunca vendemos réplicas…               │ ← answer, revealed
└───────────────────────────────────────────┘
```

Markup per item:
```
<details id={item.id} className="faq-item group border-b border-border scroll-mt-28">
  <summary className="faq-summary flex cursor-pointer list-none items-center justify-between gap-4 py-4
                      font-heading text-base font-medium text-foreground
                      outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm
                      [&::-webkit-details-marker]:hidden">
    {question}
    <HugeiconsIcon icon={Add01Icon} size={18} className="faq-chevron shrink-0 text-primary" aria-hidden />
  </summary>
  <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{answer}</p>
</details>
```

**States**
| State | Visual | Behavior |
| --- | --- | --- |
| Collapsed | question + `＋` glyph | click/Enter/Space toggles (native) |
| Expanded | `＋` rotates 45° → `✕`; answer visible | native `open` attribute |
| Focus | ring-2 ring-ring on the summary | keyboard |
| Hover | question text → `text-primary` | color only, gated `@media (hover:hover)` |

**Motion** — **Accordion/Collapse** (animation-vocabulary). Native `<details>` cannot animate height cross-browser without JS; keep it honest and cheap: only the chevron animates.
- `.faq-chevron` in globals.css: `transition: transform 200ms var(--ease-out)`; `details[open] .faq-chevron { transform: rotate(45deg); }`. Panel appears instantly (acceptable — FAQ is low-frequency; instant reveal is snappier than a janky height tween).
- Reduced motion: drop the chevron transition (instant swap) via the media-query guard.

### B.5 Placeholder disclaimer — shared inline note

Every illustrative figure block gets a subtle footnote (AC-22). Reuse a one-liner pattern, not a component:
```
<p className="mt-3 text-xs text-muted-foreground/80">{disclaimerText}</p>
```
Small + muted, left-aligned under the relevant section (impact strip, B2B panel, social proof, calculator, hero cert-tag). Copy verbatim from PART L.

---

## PART C — SHELL RESTYLE

### C.1 SiteTopbar — NEW

**Purpose:** thin promo bar above the header (shipping / installments / invoicing) + a WhatsApp contact link (AC-15).
**Location:** top of every storefront page, above `SiteHeader`, inserted in `src/app/[locale]/layout.tsx` (before `SiteHeader`, inside the flex column).
**File:** `src/components/layout/site-topbar.tsx`. Async server component. Reuses `buildWhatsAppUrl(WHATSAPP_PHONE_E164, …)` and gates on its null return (mirror `WhatsAppButton`, edge 5).
**shadcn base:** none.

**Layout (ASCII) — desktop (≥768px):**
```
┌──────────────────────────────────────────────────────────────────────┐
│ Envíos a toda la República · Meses sin intereses · Factura para tu…   Escríbenos: +52 55…│
└──────────────────────────────────────────────────────────────────────┘
  deep-green bar (bg-primary), glaze-white text, h-9, text-xs
```
**Layout — mobile (320px):** the three messages become a single horizontally-scrollable row (no wrap, no layout break); the WhatsApp link is **hidden below `sm`** to guarantee no break at 320px (WA is still reachable via header/footer/FAB).
```
┌────────────────────────────────┐
│ Envíos a toda la República · …→ │  ← overflow-x-auto, scrollbar hidden
└────────────────────────────────┘
```

**Structure**
```
<div className="bg-primary text-primary-foreground">
  <div className="mx-auto flex h-9 max-w-(--breakpoint-xl) items-center gap-4 px-4 md:px-6 lg:px-8">
    <ul className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap text-xs
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <li>{msg1}</li><li aria-hidden>·</li><li>{msg2}</li><li aria-hidden>·</li><li>{msg3}</li>
    </ul>
    {waUrl ? (
      <a href={waUrl} target="_blank" rel="noopener noreferrer"
         aria-label={t("topbar.contactAria")}
         className="hidden shrink-0 items-center gap-1 text-xs font-medium underline-offset-2
                    hover:underline focus-visible:ring-2 focus-visible:ring-primary-foreground/60 rounded-sm sm:inline-flex">
        {t("topbar.contactPrefix")} {WHATSAPP_DISPLAY}
      </a>
    ) : null}
  </div>
</div>
```
Messages are **static** (not rotating) — a rotating carousel is motion-without-purpose (Emil) + JS/CSP cost; all three fit desktop and scroll on mobile. AC-15 permits "static/rotating"; static is chosen. `WHATSAPP_DISPLAY` is a formatted, non-secret constant ("+52 55 1234 5678").

**States**
| State | Visual | Behavior |
| --- | --- | --- |
| WA configured | messages + right-aligned WA link (≥sm) | link opens WhatsApp new tab |
| WA unconfigured | messages only; **no broken link** (edge 5) | `waUrl === null → link omitted` |
| Mobile 320px | messages scroll-x; WA link hidden | no page horizontal scroll |

**Focus ring** on the WA link is `ring-primary-foreground/60` (white-ish) — a green ring is invisible on the green bar.
**Motion:** none (persistent chrome, every page — Emil "100+/day → no animation").

### C.2 SiteHeader — restyle

**Modify** `src/components/layout/site-header.tsx`. Keep sticky/z-40/composition; change nav items, logo, add the orange CTA.

**Layout (ASCII) — desktop (≥768px):**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [≡] [LOGO]  Catálogo Proceso Empresas Confianza  [🔍] [ES|EN] [🛒] [Cotización empresarial] │
└──────────────────────────────────────────────────────────────────────────────┘
  sticky top-0 z-40, bg-background, border-b border-border, h-16
```
**Layout — mobile (<768px):**
```
┌────────────────────────────────┐
│ [≡]   [LOGO]        [🔍][ES][🛒]│   ← nav + CTA collapse into MobileNav drawer
└────────────────────────────────┘
```

**Logo (AC-14):** replace the text wordmark with the real SVG.
- `<Image src="/brand/logo.svg" width={132} height={26} priority alt={storeName} className="h-6 w-auto md:h-7" />` inside the home `Link`. Ratio 5.09:1; height ~24–28px.
- **Contrast:** the header is `bg-background` (light glaze), so the logo's deep-green + brand-green glyphs read fine. Keep the header light (do NOT put the multi-color logo on a green header).
- Alt = store name (site identity, not decorative → non-empty alt).

**Nav items (AC-16):** change `NAV_ITEMS` to the mockup's four:
- `catalog` → `CATALOG_PATH` (`/sillas`)
- `process` → `/#proceso` (homepage anchor; locale-aware)
- `business` → `EMPRESAS_PATH` (`/empresas`, new constant — C.5)
- `trust` → `/#garantia` (homepage anchor)
Nav link styling unchanged (`.nav-hover`, muted → foreground/accent on hover). Nav `aria-label` from copy.

**Header CTA:** add to the right cluster (desktop ≥md):
```
<Button asChild variant="cta" size="sm" className="hidden md:inline-flex">
  <Link href={EMPRESAS_PATH}>{t("header.cta")}</Link>
</Button>
```
On mobile the CTA moves into the MobileNav drawer (C.3).

**States**
| State | Visual | Behavior |
| --- | --- | --- |
| Default | light bar, colored logo, muted nav, orange CTA | — |
| Nav hover | link bg-accent, text-accent-foreground | `.nav-hover`, hover-gated |
| Mobile | hamburger + logo + search/lang/cart; nav+CTA in drawer | existing MobileNav |

**Motion:** unchanged (nav is high-frequency chrome — no entrance). Existing `.nav-hover` + `.drawer-*` reused verbatim.

### C.3 MobileNav — add CTA

The existing drawer maps the same nav items. Append the orange CTA full-width at the bottom of the drawer's nav list:
```
<Button asChild variant="cta" size="lg" className="mt-4 w-full">
  <Link href={EMPRESAS_PATH}>{t("header.cta")}</Link>
</Button>
```
No new motion — reuse `.drawer-panel`/`.drawer-scrim`.

### C.4 SiteFooter — restructure to green 4-column + contact

**Modify** `src/components/layout/site-footer.tsx`. Keep async-server + `FooterLinkGroup`; change columns + make it a **deep-green block** (identity payoff; closes the page).

**Layout (ASCII) — desktop (≥1024px):**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ POSTURPRO                 CATÁLOGO      EMPRESAS       COMPAÑÍA   CONTACTO │
│ Eleva tu mobiliario,      Todas las…    Cotización…    Proceso…   WhatsApp:│
│ no tus costos. Sillas…    Herman Miller Programa recom Confianza  hola@…   │
│                           Steelcase     Financiamiento Sustentab. Showrooms│
│ [IG] [in] [f]             Haworth                                 Lun–vie… │
├──────────────────────────────────────────────────────────────────────────┤
│ © 2026 PosturPro…   Pagos con tarjeta…      Aviso de privacidad · Términos │
└──────────────────────────────────────────────────────────────────────────┘
  bg-primary (deep green), text-primary-foreground
```

**Footer logo on green:** the multi-color SVG's dark-green parts vanish on a green field. **Spec:** render the **store-name wordmark as TEXT** in the footer — `font-heading text-lg font-bold uppercase tracking-wide text-primary-foreground` (the header carries the real SVG logo; the footer uses a white text wordmark). Guarantees legibility on green with zero asset work. (Dev note: if a white/knockout logo variant is added later, swap it in.)

**Green-surface treatments:**
- Links: `text-primary-foreground/80 hover:text-primary-foreground` (extend `FOOTER_LINK_CLASS`).
- Column headings: `font-heading text-xs font-semibold uppercase tracking-wide text-primary-foreground`.
- Brand blurb: `text-sm text-primary-foreground/90`.
- Dividers: `border-primary-foreground/15`.
- Focus rings: `ring-primary-foreground/60`.

**Grid:** `grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5` — a wider brand/blurb column + 4 link/contact columns. At `sm` 2-up, mobile 1-up.

**Columns**
1. **Brand:** text wordmark + blurb + 3 social links (Instagram / LinkedIn / Facebook, each an `<a href="#" aria-label=…>` — placeholder hrefs, in the checklist).
2. **CATÁLOGO:** `Todas las sillas` → `CATALOG_PATH`; `Herman Miller` / `Steelcase` / `Haworth` → `BRANDS_PATH` (brand-filter link if a slug map exists, else `BRANDS_PATH`).
3. **EMPRESAS:** `Cotización empresarial` → `EMPRESAS_PATH`; `Programa de recompra` / `Financiamiento` → `/#empresas`.
4. **COMPAÑÍA:** `Proceso de certificación` → `/#proceso`; `Confianza` → `/#garantia`; `Sustentabilidad` → `/#impacto`.
5. **CONTACTO:** WhatsApp line (link if configured, plain text if not — edge 5), email `mailto:hola@posturpro.mx`, showrooms text, hours text.

**Bottom bar:** copyright + payments line + legal links (`Aviso de privacidad`, `Términos y condiciones` → `#` placeholders). `flex-col gap-2 sm:flex-row sm:justify-between`, `text-xs text-primary-foreground/70`, `border-t border-primary-foreground/15`.

**States**
| State | Visual | Behavior |
| --- | --- | --- |
| Default | deep-green footer, white text/links | — |
| Link hover | white text (80% → 100%) | color only |
| Focus | white-ish ring | keyboard |
| WA unconfigured | WhatsApp line as plain text (no link) | edge 5 |
| Mobile | columns stack 1-up | no horizontal scroll |

**Motion:** none.

### C.5 WhatsApp FAB + `EMPRESAS_PATH` constant

- **FAB:** reuse `src/components/layout/whatsapp-button.tsx` **verbatim** (AC-17). Keep `bg-whatsapp` green (recognizable), `z-50`, config-gated, single instance. No change. **No duplication.**
- **Add** `export const EMPRESAS_PATH = "/empresas" as const;` in `src/lib/config/catalog.ts`, re-export via the `@/lib/config` barrel, and replace the two bare string literals (nav-items, footer). The header CTA, mobile CTA, footer, and homepage B2B links all consume it. (Recon found no existing constant.)

---

## PART D — HOMEPAGE SECTIONS

Page order (AC-18). Each is a `<section>` composed in `page.tsx` with the shared container `mx-auto max-w-(--breakpoint-xl) px-4 md:px-6 lg:px-8` and vertical rhythm `py-14 md:py-20` (brand bar `py-10`). Alternate section backgrounds for rhythm: hero `bg-background`, brand bar `bg-muted`, values `bg-background`, catalog `bg-muted`, process `bg-background`, B2B `bg-muted`, social `bg-background`, calculator `bg-muted`, trust `bg-background`, CTA banner = deep-green band. Subtle mint/glaze banding, never loud.

Each section is a server component receiving pre-resolved strings (repo contract; no `getTranslations` in presentational children). Anchor IDs are **shared Spanish slugs** in both locales: `#catalogo #proceso #empresas #cotizacion #garantia #impacto #calculadora`. Add `scroll-mt-28` to anchored sections/headings (clears sticky topbar h-9 + header h-16).

### D.1 Hero — extend `hero.tsx` (+ split `hero-stats.tsx`, `cert-tag.tsx`)

**Purpose:** front door — eyebrow, 2-line headline, subcopy, 2 CTAs, 3 stats, restyled cert-tag.
**shadcn base:** Button (cta + secondary).

**Layout (ASCII) — desktop (≥1024px, editorial split):**
```
┌────────────────────────────────────────────────────────────────┐
│  Mobiliario ergonómico certificado          ┌──────────────────┐│
│  Eleva tu mobiliario.                        │   media slot     ││
│  No tus costos.                              │   (image or      ││
│  Sillas pre-owned Herman Miller,             │   glyph tile)    ││
│  Steelcase y Haworth, verificadas…           │  ┌────────────┐  ││
│                                              │  │ Grado A+   │  ││ ← cert-tag overlay
│  [Explorar catálogo →] [Soluciones…]         │  │ CERT PP-…  │  ││   bottom-left
│                                              │  │ INSPEC…    │  ││
│  +3,200        100%          60%             └──┴────────────┴──┘│
│  Sillas ent.   Func. verif.  Ahorro prom.                       │
└────────────────────────────────────────────────────────────────┘
```
**Layout — mobile (320px):** stacked: eyebrow → H1 → subcopy → CTAs (primary full-width, secondary below) → media tile (cert-tag overlaid bottom-left) → stats `grid grid-cols-3 gap-3` (three short stats fit at 320px).

**Structure**
- Eyebrow: `text-xs font-semibold uppercase tracking-wide text-primary`.
- H1: two lines — `t("hero.headlineL1")` + `<br/>` + `t("hero.headlineL2")`. **Both lines `text-primary`; NO orange in the headline** (orange = CTA only). Emphasis comes from the line break, not color/italic (the mockup's brass italic is rejected).
- Subcopy: `max-w-prose text-sm sm:text-base text-muted-foreground leading-relaxed`.
- CTAs: primary `<Button asChild variant="cta" size="xl">` → `CATALOG_PATH`. Secondary `<Button asChild variant="secondary" size="xl">` → `EMPRESAS_PATH`. Mobile: primary full-width, secondary below (both `w-full sm:w-auto`).
- Media: existing `HeroMedia` fallback (nullable `HERO_IMAGE` → glyph tile). Cert-tag overlays it.

**Cert-tag (`cert-tag.tsx`)** — the mockup's rotated brass tag reinterpreted in our language: a small tokenized card, **not rotated**, bottom-left over the media (or below it on mobile):
```
┌──────────────────┐
│ ⬡ Grado A+        │  ← Award glyph + grade, font-heading
│ CERT. Nº PP-04821 │  ← text-xs muted, tabular-nums
│ INSPECCIONADA ·   │  ← text-[10px] uppercase tracking-wide muted
│ 100% FUNCIONAL    │
└──────────────────┘
```
Class: `absolute bottom-3 left-3 max-w-[190px] rounded-md border border-primary/25 bg-card/95 p-3 shadow-sm backdrop-blur-sm`. It is a **static illustrative element** (grade/cert are a proposal) — tied to nothing real; carries the hero disclaimer footnote.

**Hero stats (`hero-stats.tsx`):** `grid grid-cols-3 gap-4 sm:gap-6`. Each: figure `font-heading text-2xl sm:text-3xl font-bold text-primary tabular-nums`, label `text-xs text-muted-foreground`. Carries the hero disclaimer footnote (shared with cert-tag).

**States**
| State | Visual | Behavior |
| --- | --- | --- |
| Image configured | `next/image` in framed slot + cert-tag overlay | priority load |
| Image null | token-tinted glyph tile + cert-tag | no broken img (AC-21) |
| Reduced motion | no entrance rise; content static | see motion |

**Motion** — reuse `.enter-fade` on the copy column (opacity + rise, 200ms `ease-out`, RM→opacity-only) as today. Stats: `.stagger`, 60ms steps (3 items → ≤180ms). Cert-tag: `.enter-fade` +120ms delay. Secondary link keeps `.link-arrow`. **No new motion.**

### D.2 BrandBar

**Purpose:** trust strip — "We work exclusively with…" + 5 brand names.
**File:** `src/components/home/brand-bar.tsx`.
**Data:** real brands via `readFeaturedBrands()` if available; else the static fallback (Herman Miller · Steelcase · Haworth · Knoll · Humanscale) per UX Requirements. Brands rarely have logos yet → render brand **names as text** (wordmark-style), not logos.

**Layout (ASCII):**
```
┌──────────────────────────────────────────────────────────────┐
│  Trabajamos únicamente con las marcas que definen la ergonomía │  ← centered label, muted
│  Herman Miller   Steelcase   Haworth   Knoll   Humanscale      │  ← row, font-heading, muted
└──────────────────────────────────────────────────────────────┘
  bg-muted band, py-10, text center
```
**Mobile:** label wraps; brand names `flex flex-wrap justify-center gap-x-6 gap-y-2` — wrap to 2–3 lines at 320px, never horizontal scroll.

**States:** brands from DB (linked to brand pages) OR static text (unlinked). No empty state — fallback guarantees content.
**Motion:** none (quiet band).

### D.3 ValuesImpact

**Purpose:** 4 value cards + 3-figure impact strip.
**File:** `src/components/home/values-impact.tsx` (+ `value-card.tsx` if near cap). `id="impacto"` on the strip.
**shadcn base:** none.

**Layout (ASCII) — desktop:**
```
  Por qué PosturPro
  Curamos, no acumulamos
  Nada de catálogos de mil productos…

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ ⬡        │ │ ✓        │ │ ★        │ │ ⛨        │   ← hugeicon, text-primary in mint tile
│ Ahorra   │ │ 100%     │ │ Buenas   │ │ 100%     │
│ hasta 60%│ │ funcion… │ │ condic…  │ │ origin…  │
│ El mismo…│ │ Probamos…│ │ Selecc…  │ │ Jamás…   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

┌────────────────────────────────────────────────────┐   id=impacto
│  +3,200            9,400 kg            60%           │  ← mint band, deep-green figures
│  Sillas con…       De mobiliario…      Menos huella… │
└────────────────────────────────────────────────────┘
  *Cifras estimadas de ejemplo — sustituir con datos reales.
```
Cards grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`. Card `rounded-md border border-border bg-card p-5`; icon in `size-10 rounded-md bg-secondary text-primary` tile; title `font-heading text-base font-semibold`; body `text-sm text-muted-foreground`.
Impact strip `mt-8 rounded-md bg-secondary p-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center`. Figures `font-heading text-2xl font-bold text-primary tabular-nums`; labels `text-sm text-secondary-foreground`.
Icons (`@hugeicons/core-free-icons`): card1 `Tag01Icon`, card2 `CheckmarkBadge01Icon`, card3 `Award01Icon`, card4 `License01Icon` (one set only). Dev may substitute equivalents from the same set.

**States:** static + disclaimer. **Motion:** cards `.stagger` (60ms steps, cap ≤200ms); impact strip `.enter-fade`.

### D.4 Catalog section — REAL products

**Purpose:** featured real products with grade badges (AC-19).
**Reuse:** `FeaturedProducts` wrapper + `ProductGrid` + restyled `ProductCard` (now with GradeBadge). **Do not use the mockup's hard-coded chairs/prices.** AC-19 mandates `listProducts({ pageSize: HOME_FEATURED_PRODUCTS })` (=8, multiple of 4). `id="catalogo"`, `bg-muted`.

**Layout (ASCII) — desktop:**
```
  Catálogo                                    Ver todo el catálogo →
  Piezas verificadas, listas para trabajar

┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ card   │ │ card   │ │ card   │ │ card   │   ← 4-up (lg), grade+stock badges
└────────┘ └────────┘ └────────┘ └────────┘
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
└────────┘ └────────┘ └────────┘ └────────┘   ← 8 total
```
Grid responsive (from `ProductGrid`): 2-up mobile → 2-up tablet → 4-up desktop. "View all" via `HomeSectionHeader`, `viewAllHref={CATALOG_PATH}`, label = added copy "Ver todo el catálogo →" / "View the full catalog →" (agent flag 5 — mockup had none; needed for the real catalog).

**States** (AC-19, edge 4)
| State | Visual | Behavior |
| --- | --- | --- |
| Products present | grid of real cards | link to `/producto/[slug]` |
| Empty / read fails | **section hidden entirely** (return null) | `readFeaturedProducts → []` → `products.length > 0` guard, exactly as today |
| Product has grade | GradeBadge top-left | — |
| Product no grade | no badge, no gap | — |

**Motion:** existing `ProductGrid` `.stagger` + `.card-lift` — reused, nothing new.

### D.5 ProcessSteps

**Purpose:** 4 numbered certification steps.
**File:** `src/components/home/process-steps.tsx`. `id="proceso"` (scroll-mt).

**Layout (ASCII) — desktop (4-up):**
```
  Cómo trabajamos
  El proceso de certificación PosturPro
  Cada silla pasa por un proceso claro…

┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│ 01        │ │ 02        │ │ 03        │ │ 04        │  ← big number, text-primary/25
│ Adquisic… │ │ Inspecc…  │ │ Limpieza… │ │ Verific…  │
│ Compramos…│ │ Probamos… │ │ Cada sil… │ │ Revisión… │
└───────────┘ └───────────┘ └───────────┘ └───────────┘
```
Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6`. Step: number `font-heading text-4xl font-bold text-primary/25 tabular-nums`; title `font-heading text-base font-semibold text-foreground mt-2`; body `text-sm text-muted-foreground`.

**States:** static. **Motion:** `.stagger` fade-up, 60ms steps.

### D.6 B2BSection — embed reused QuoteForm

**Purpose:** value list + segments + placeholder stats + the T16 quote form (edge 10/11 inherited).
**File:** `src/components/home/b2b-section.tsx`. `id="empresas"` (section), `id="cotizacion"` (form panel).
**Reuse:** import `QuoteForm` from `src/app/[locale]/empresas/quote-form.tsx` **as-is**. It needs `labels: QuoteFormLabels` + `maxLengths` (resolved server-side via the existing `empresas.*` messages — do NOT duplicate quote copy) and owns its full lifecycle (success/error/rate-limit/honeypot/focus). It renders no heading, so this section supplies surrounding chrome.

**Layout (ASCII) — desktop (2-col: pitch | form):**
```
┌───────────────────────────────┬──────────────────────────────┐
│ Soluciones para empresas       │  ┌────────────────────────┐  │ id=cotizacion
│ Equipa tu oficina completa…    │  │ Nombre    [_________]  │  │
│ Trabajamos con equipos de RRHH…│  │ Empresa   [_________]  │  │
│ ✓ Precios preferenciales…      │  │ Correo    [_________]  │  │
│ ✓ Asesor de cuenta dedicado…   │  │ Teléfono  [_________]  │  │
│ ✓ Instalación, logística…      │  │ Estaciones [▾ 1–10   ] │  │
│ ✓ Programa de recompra…        │  │ Proyecto  [_________]  │  │
│ ✓ Facturación fiscal…          │  │          [Solicitar…]  │  │ ← orange submit
│ Tipo de organizaciones…        │  └────────────────────────┘  │
│ Startups · Despachos · Corp…   │  +150 Oficinas  24h Respuesta │
│                                │  *Cifra ilustrativa…          │
└───────────────────────────────┴──────────────────────────────┘
  bg-muted band, lg:grid-cols-2
```
**Mobile:** single column — pitch (heading, value list, segments, stats) then form. `lg:grid-cols-2` (B2B single-column until lg, per UX Requirements).
Value list `<ul>` with `CheckmarkCircle02Icon` (text-primary) bullets, `text-sm`. Segments: `text-sm text-muted-foreground` `·`-separated line. Stats: two figure blocks (`+150`, `24h`) with placeholder disclaimer footnote.

**QuoteForm submit → CTA orange (AC-13):** update `QuoteForm`'s submit button to `variant="cta"`. This is shared with `/empresas`, and applying it there is *intended* — AC-13 is site-wide ("every primary CTA uses `--cta`").

**States** (inherited from T16; do not re-design)
| State | Visual | Behavior |
| --- | --- | --- |
| Idle | fields + orange submit | — |
| Submitting | submit pending (useActionState) | busy label |
| Success | green `role="status"` banner, form cleared, focus to banner | auto-hides after `QUOTE_SUCCESS_FEEDBACK_MS` |
| Invalid | inline field errors, values preserved | `submitQuoteForm → invalid` |
| Rate-limited (edge 10) | localized "please wait" banner | no 2nd email |
| Honeypot (edge 11) | fake success | no email |
| Error (relay fail) | friendly error banner + retry | reason not surfaced |

**Motion:** form-internal is T16's; the section uses `.enter-fade` on the pitch column. No new motion.

### D.7 SocialProof

**Purpose:** 2 placeholder testimonials + disclaimer (clearly illustrative; never fabricated-as-real).
**File:** `src/components/home/social-proof.tsx`.

**Layout (ASCII):**
```
  Lo que dicen nuestros clientes         (added heading — agent flag 4)

┌─────────────────────────────┐ ┌─────────────────────────────┐
│ ❝                            │ │ ❝                            │  ← quote glyph
│ "Quería una Aeron real…"    │ │ "Reequipamos 45 estaciones…"│
│ ○ Regina P. — Compra ind…   │ │ ○ Gerente de Admin… — …     │  ← ○ neutral avatar glyph
└─────────────────────────────┘ └─────────────────────────────┘
  *Testimonios ilustrativos para este layout — sustituir con reseñas reales.
```
Two cards `grid-cols-1 md:grid-cols-2 gap-4`. Card `rounded-md border border-border bg-card p-6`; `QuoteUpIcon` top (text-primary/40); quote `text-base text-foreground`; attribution row `flex items-center gap-2 text-sm text-muted-foreground mt-3` with a `size-8 rounded-full bg-muted` glyph (`UserCircleIcon`, aria-hidden) — the mockup's "dashed circle for photo" becomes a neutral avatar glyph (NOT a dashed media-note box — AC-21). Disclaimer footnote below.

**States:** static placeholder; disclaimer makes illustrative status explicit. **Motion:** `.stagger` (2 items, 60ms).

### D.8 SavingsCalculator — interactive island

**Purpose:** pick a model → compare new vs PosturPro price with bars + savings %/amount (AC-23, edge 9).
**File:** `src/components/home/savings-calculator.tsx` — `"use client"` island. `id="calculadora"`.
**shadcn base:** shadcn `Select` (already styled with `.select-content-motion`; controllable for the island; consistent with catalog SortSelect).
**Data:** reference prices in a **config module** (not messages) — `src/lib/config/calculator.ts`:
```typescript
export interface ChairReference {
  id: string; brand: string; model: string;
  newPriceCents: number; posturPriceCents: number;
}
export const CALCULATOR_MODELS: readonly ChairReference[] = [
  { id: "aeron",   brand: "Herman Miller", model: "Aeron",   newPriceCents: 3_850_000, posturPriceCents: 2_190_000 },
  { id: "leap",    brand: "Steelcase",     model: "Leap V2", newPriceCents: 3_200_000, posturPriceCents: 1_590_000 },
  { id: "zody",    brand: "Haworth",       model: "Zody",    newPriceCents: 2_400_000, posturPriceCents: 1_150_000 },
  { id: "embody",  brand: "Herman Miller", model: "Embody",  newPriceCents: 4_250_000, posturPriceCents: 2_650_000 },
  { id: "gesture", brand: "Steelcase",     model: "Gesture", newPriceCents: 2_950_000, posturPriceCents: 1_490_000 },
  { id: "sayl",    brand: "Herman Miller", model: "Sayl",    newPriceCents: 1_950_000, posturPriceCents:   980_000 },
] as const;
```
(MXN integer cents per repo convention; `formatMXN` renders — MXN in both locales, no conversion, edge 8.) Model option labels ("Herman Miller — Aeron") are derived from brand+model (identical in both locales); only *labels* (title/subcopy/bar labels/suffixes/note) come from messages.

**Layout (ASCII) — desktop:**
```
  Herramienta
  ¿Cuánto puedes ahorrar?
  Elige un modelo y compara…

┌──────────────────────────────────────────────────────────┐
│ Modelo de silla                                            │
│ [ Herman Miller — Aeron                              ▾ ]   │  ← shadcn Select
│                                                            │
│ Precio nuevo   ████████████████████████████  $38,500 MXN  │  ← bar, muted fill
│ PosturPro      ███████████████               $21,900 MXN  │  ← bar, primary fill
│                                                            │
│  43%  de ahorro     ·     $16,600 MXN menos que comprar…   │  ← results (aria-live)
│ *Precios de referencia. El precio final depende…          │
└──────────────────────────────────────────────────────────┘
  rounded-md border border-border bg-card p-6
```
**Mobile (320px):** select full-width; the two bars stack (label above track above value); results stack. No horizontal scroll.

**Bars:** two tracks `h-3 rounded-full bg-muted`; each fill `h-full rounded-full`, width proportional to `price / maxNewPrice`. New-price fill `bg-muted-foreground/30`; PosturPro fill `bg-primary`. The shorter PosturPro bar makes the saving visible.
**Savings math:** `savings = new − postur`; `pct = round(savings / new * 100)`. **Clamp (edge 9):** if `postur >= new`, `pct = max(0, pct)` and the PosturPro fill width clamps to a **minimum 8%** (mirrors mockup `Math.max(8, …)`) — never invisible, never inverted, never negative %.
**Number formatting:** `formatMXN` (locale-aware); figures `tabular-nums`.

**Props / state**
```typescript
interface SavingsCalculatorProps {
  labels: {
    selectLabel: string; newPriceLabel: string; posturLabel: string;
    savingsPctSuffix: string;     // "de ahorro" / "in savings"
    savingsAmountSuffix: string;  // "menos que comprar nueva" / "less than buying new"
    note: string;                 // reference-price disclaimer
    modelLabel: (c: ChairReference) => string; // "Herman Miller — Aeron"
  };
}
// internal: const [selectedId, setSelectedId] = useState(CALCULATOR_MODELS[0].id);
```
Copy passed as props from the page RSC (repo contract). `useState` for selection; recompute is synchronous on change — no effect, no fetch, no inline script (CSP-safe).

**States**
| State | Visual | Behavior |
| --- | --- | --- |
| Default | Aeron; bars + 43% + $16,600 | initial matches mockup default |
| Change model | bars resize, %/amount update instantly | `onValueChange` → setState → recompute, **no reload** (AC-23) |
| Bad config (postur ≥ new) | PosturPro bar ≥8% width; % floored 0 | edge 9 |
| Reduced motion | bars snap; numbers swap instantly | see motion |

**Motion** — two purposeful animations:
1. **Bar resize** = **Continuity transition** via `transform: scaleX` (compositor-friendly, NOT `width`). Fill is width:100%, `transform-origin:left`, `transform: scaleX(fraction)` set inline; add `.calc-bar-fill` to globals.css: `transition: transform 400ms var(--ease-out); will-change: transform;` (mirror `.cart-progress-fill`). Reduced-motion: `transition:none` (snap).
2. **Number crossfade** on %/amount = reuse `.price-value` (keyed span, opacity 150ms). Reduced-motion: instant.
Select open/close reuses `.select-content-motion` (origin-aware scale-in, shipped).
**a11y:** wrap the results block in `aria-live="polite"` so SR users hear the new savings on change.

### D.9 TrustFaq

**Purpose:** 4 guarantee bullets + 4 FAQ accordion items.
**File:** `src/components/home/trust-faq.tsx` (+ `faq-accordion.tsx` from B.4). `id="garantia"` (scroll-mt).

**Layout (ASCII) — desktop (2-col: guarantees | FAQ):**
```
  Confianza
  Compra con la certeza de una marca establecida

┌──────────────────────────────┬──────────────────────────────┐
│ ✓ Funciona al 100%, garant…  │  Preguntas frecuentes         │
│   Cada silla se limpia…       │  ┌──────────────────────────┐ │
│ ✓ Autenticidad 100%.          │  │ ¿Las sillas son 100%… [+]│ │
│   Nunca vendemos réplicas…    │  ├──────────────────────────┤ │
│ ✓ Buenas condiciones…         │  │ ¿Qué significa cada…  [+]│ │
│   Seleccionamos solo…         │  ├──────────────────────────┤ │
│ ✓ Pagos y facturación…        │  │ ¿Qué pasa si mi silla?[+]│ │
│   Tarjeta, transferencia…     │  ├──────────────────────────┤ │
│                               │  │ ¿Hacen envíos a todo? [+]│ │
└──────────────────────────────┴──────────────────────────────┘
```
**Mobile:** stack — guarantees, then FAQ accordion. `lg:grid-cols-2`.
Guarantees `<ul>`, each `CheckmarkBadge01Icon` (text-primary) + bold lead (`font-medium text-foreground`) + body (`text-sm text-muted-foreground`). FAQ = `FaqAccordion` (B.4) with 4 items; each item gets a stable `id` slug (`faq-originales`, `faq-grados`, `faq-problema`, `faq-envios`) for deep-linking, reusing the existing `.static-heading:target` accent + `scroll-mt` pattern.

**States:** static; accordion states per B.4. **Motion:** guarantees `.stagger`; accordion chevron rotate per B.4.

### D.10 CtaBanner

**Purpose:** closing conversion banner, 2 CTAs.
**File:** `src/components/home/cta-banner.tsx`.

**Layout (ASCII):**
```
┌──────────────────────────────────────────────────────────┐
│            ¿Listo para elevar tu oficina?                  │  ← font-heading, on deep green
│     [Explorar catálogo →]   [Cotización empresarial →]     │  ← orange primary + mint secondary
└──────────────────────────────────────────────────────────┘
  bg-primary (deep green) text-primary-foreground, rounded-lg, py-14, centered
```
Deep-green band (identity payoff before the footer). Heading `font-heading text-3xl sm:text-4xl font-bold text-primary-foreground`. CTAs centered: primary `variant="cta" size="xl"` → `CATALOG_PATH`; secondary `variant="secondary" size="xl"` (mint on green, 10.45:1) → `EMPRESAS_PATH`. Both `w-full sm:w-auto` (full-width stacked on mobile). Focus rings on this band use `ring-primary-foreground/60`.

**States:** static. **Motion:** `.enter-fade` on banner content (mount-based; fine for a below-fold band). Reduced-motion safe.

### D.11 PDP grade badge

**Modify** `src/app/[locale]/producto/[slug]/page.tsx`. Render `<GradeBadge grade={product.conditionGrade} label={t("product.grade.badge",{grade})} className="…" />` **inline** in the title/price meta area (not absolute) — e.g. next to the brand or the stock line. When `conditionGrade` is null → nothing renders (no gap). PDP product type + query projection gain `conditionGrade` (AC-9).

---

## PART E — ADMIN GRADE CONTROL (firewalled, neutral theme)

### E.1 Grade `<select>` in the product form

**Modify** `src/components/admin/products/product-form.tsx` — add a `SelectField` (from `src/components/admin/form/fields.tsx`) for condition grade. **Admin stays neutral `:root`** — no storefront tokens, no green/orange (firewall). Uses the existing admin field grammar (label + control + `FieldError`).

**Placement:** in the product-attributes area (near status/featured toggles). Options:
```
options = [
  { value: "",   label: t("admin.products.grade.none") },   // "Sin grado"
  { value: "A+", label: "A+" },
  { value: "A",  label: "A" },
  { value: "B",  label: "B" },
]
```
Label `t("admin.products.fields.conditionGrade")` = "Condición". `defaultValue = initialValues.condition_grade` (empty for new; saved value on edit — AC-5). `name="condition_grade"`, `testid="product-field-condition_grade"`, helper "Grado de condición mostrado en la tienda (opcional)."

**Layout (ASCII):**
```
Condición
[ Sin grado                      ▾ ]
Grado de condición mostrado en la tienda (opcional).   ← helper text-xs muted
```

**States**
| State | Visual | Behavior |
| --- | --- | --- |
| New product | "Sin grado" selected | defaults to `""` → NULL (AC-5/8) |
| Edit w/ grade | saved grade selected | round-trips (AC-7) |
| Edit no grade | "Sin grado" selected | — |
| Invalid (tampered POST, edge 3) | red `FieldError`: "Selecciona una condición válida." | `parseProductInput` → `condition_grade` error; no write |
| Disabled (submitting) | `opacity-60`, not editable | existing pending behavior |

`ProductFormValues` gains `condition_grade: string` (empty default). `ProductField`/`ProductParsed` gain `condition_grade`. Validation: `"" → null`; `A+`/`A`/`B` → value; else `condition_grade` field error (AC-6, edge 3). Add `condition_grade` to `PRODUCT_FIELD_ERROR_MESSAGES` (es-MX admin).

**Motion:** none (operator tool).

---

## PART F — PAGE LAYOUT (composition)

`src/app/[locale]/page.tsx` — keep `generateMetadata`, `buildHomeJsonLd` (Organization + WebSite), `readFeaturedProducts` (degrade to `[]`) and `readFeaturedBrands`. Recompose the body (AC-24 SEO untouched):

```
<>
  <JsonLd data={homeJsonLd} />
  <Hero … />                                   {/* bg-background */}
  <BrandBar … />                               {/* bg-muted */}
  <ValuesImpact … />                           {/* bg-background, strip id=impacto */}
  {products.length > 0 ? <FeaturedProducts … id="catalogo" bg-muted/> : null}
  <ProcessSteps … id="proceso" />              {/* bg-background */}
  <B2BSection … id="empresas" />               {/* bg-muted, form id=cotizacion */}
  <SocialProof … />                            {/* bg-background */}
  <SavingsCalculator … id="calculadora" />     {/* bg-muted */}
  <TrustFaq … id="garantia" />                 {/* bg-background */}
  <CtaBanner … />                              {/* deep-green band */}
</>
```
Shell (topbar/header/footer/FAB) is in `layout.tsx`, not the page. The page resolves copy via `getTranslations("home")` (+ sub-namespaces) and passes strings down. Page stays thin (composition + reads only).

**Full-page responsive ladder:**
| Breakpoint | Behavior |
| --- | --- |
| 320–639 (mobile) | Everything 1-up stacked. Topbar messages scroll-x. Hero: copy→CTAs(primary full-w)→media+cert→stats(3-up). Values 1-up. Catalog 2-up. Process 1-up. B2B 1-up (pitch then form). Calculator bars stack. FAQ stacked. Footer 1-up. No horizontal page scroll anywhere. |
| 640–1023 (tablet) | Values 2-up, catalog 2-up, process 2-up, impact 3-up, footer 2-up, B2B 1-up until lg, testimonials 2-up. |
| ≥1024 (desktop) | Hero 2-col, values 4-up, catalog 4-up, process 4-up, B2B 2-col (pitch|form), trust 2-col (guarantees|FAQ), footer 5-col. |

---

## PART G — INTERACTION FLOWS

### G.1 Request a business quote (from homepage)
1. User clicks header "Cotización empresarial" (orange) / hero "Soluciones para empresas" (secondary) / scrolls to the B2B section.
2. **Header/hero business CTAs → full `/empresas` page** (richer). **In-page CTA banner + footer "Cotización" links → `#cotizacion` anchor** → smooth-scroll to the embedded form (respect `scroll-mt-28`; reduced-motion → instant jump). Both entry points submit through the same T16 `submitQuoteForm`.
3. Fill fields → per-field validation on submit (values preserved on error).
4. Submit → pending → success: green `role="status"` banner, form cleared, focus to banner (T16 verbatim).
5. Rate-limited/honeypot/relay-error → T16 states (edge 10/11), no re-design.

### G.2 Use the savings calculator
1. Renders with Aeron default (New $38,500 · PosturPro $21,900 · 43% · $16,600).
2. Open Select (origin-aware scale-in) → pick a model.
3. `onValueChange` → setState → recompute → bar `scaleX` transition (400ms) + %/amount crossfade (150ms). No reload.
4. Bad config (postur ≥ new): bar clamps 8%, % floors 0.
5. Reduced motion: bars snap, numbers swap instantly.

### G.3 Admin assigns a grade → badge appears
1. Owner opens product edit → "Condición" select (current value or "Sin grado").
2. Selects "A+" → save → `parseProductInput → "A+"` → `updateProduct` writes → `revalidateTag(CATALOG_CACHE_TAG)`.
3. Storefront card/PDP/homepage render `Grado A+` (mint chip).
4. "Sin grado" → NULL → badge disappears, no gap.

---

## PART H — MOTION SPEC SUMMARY (animation-vocabulary terms)

All enter = `ease-out`; `transform`/`opacity` only; interruptible (CSS transitions); reduced-motion gated. **Reused verbatim** from `globals.css`: `.enter-fade`, `.stagger`, `.card-lift`, `.link-arrow`, `.select-content-motion`, `.price-value`, `.drawer-*`, `.nav-hover`, `.static-heading:target`, `.fab-pop`.

| # | Where | Effect (vocab) | Trigger | Property | Easing | Duration | Reduced-motion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | CTA buttons (`.cta-press`) **NEW** | Press/Tap feedback | `:active` | `transform: scale(0.97)` | `--ease-out` | 120ms | none |
| M2 | Hero copy | Fade-in + rise (`.enter-fade`) | mount | opacity+translateY | `--ease-out` | 200ms | opacity only |
| M3 | Hero stats / value cards / process / testimonials | Stagger of fade-up (`.stagger`) | mount | opacity+translateY | `--ease-out` | 200ms, 60ms steps (cap ~200ms) | opacity only, no delay |
| M4 | Cert-tag | Fade-in (`.enter-fade` +120ms delay) | mount | opacity+translateY | `--ease-out` | 200ms | opacity only |
| M5 | Product cards | Card lift + press (`.card-lift`) | hover(gated)/`:active` | box-shadow + image scale / scale | `--ease-out` | 200/160ms | none |
| M6 | Calculator bars (`.calc-bar-fill`) **NEW** | Continuity transition | model change | `transform: scaleX` (origin-left) | `--ease-out` | 400ms | snap (none) |
| M7 | Calculator %/amount (`.price-value`) | Crossfade | value change | opacity (keyed span) | `--ease-out` | 150ms | instant |
| M8 | Calculator/admin Select (`.select-content-motion`) | Origin-aware scale-in (Pop-in, no bounce) | open | opacity+scale | `--ease-out` | 200/150ms | opacity only |
| M9 | FAQ chevron (`.faq-chevron`) **NEW** | Rotate | `details[open]` | `transform: rotate(45deg)` | `--ease-out` | 200ms | instant |
| M10 | "View all" / secondary links (`.link-arrow`) | Directional nudge | hover(gated) | `transform: translateX(2px)` | `--ease-out` | 150ms | none |
| M11 | WhatsApp FAB (`.fab-pop`) | Pop-in + press | mount/`:active` | opacity+scale | `--ease-out` | 180/120ms | opacity only |
| M12 | CtaBanner content | Fade-in + rise (`.enter-fade`) | mount | opacity+translateY | `--ease-out` | 200ms | opacity only |

**NEW globals.css additions (3):** `.cta-press` (M1), `.calc-bar-fill` (M6), `.faq-chevron` (M9). Each with a `@media (prefers-reduced-motion: reduce)` guard. No `@keyframes` (all transitions → interruptible). No `transition: all`. No `scale(0)` origins.

---

## PART I — ACCESSIBILITY CHECKLIST

- [ ] All CTAs are `<Button asChild><Link>` — real links, keyboard-activatable, focus-visible ring (`ring-ring` on light, `ring-primary-foreground/60` on green surfaces).
- [ ] CTA orange text is dark-brown `--cta-foreground` (5.30:1) — never white (would fail AA). Verified in A.4.
- [ ] Every icon-only control has `aria-label` (WA links topbar/footer/FAB; social links; mobile menu).
- [ ] Color is never the only signal: GradeBadge has the grade letter in text + glyph; StockBadge unchanged; status banners keep glyph+text.
- [ ] GradeBadge renders nothing when absent (no announced empty region, no gap).
- [ ] FAQ uses native `<details>/<summary>` — keyboard + SR accessible for free; chevron `aria-hidden`.
- [ ] Calculator Select has an associated label; results block wrapped in `aria-live="polite"`.
- [ ] Single `<h1>` (hero); every section H2 is `<h2>`; FAQ questions live in `<summary>` (not competing headings). Logical order preserved.
- [ ] Tab order: topbar → header (menu, logo, nav, search, lang, cart, CTA) → main sections top→bottom → footer. No positive tabindex.
- [ ] Anchor targets (`#proceso` etc.) have `scroll-mt-28` clearing sticky topbar (h-9) + header (h-16).
- [ ] `prefers-reduced-motion`: M1–M12 all guarded; hero/stagger/calculator/accordion degrade to instant.
- [ ] Skip-link (existing) still lands on `#main-content`.
- [ ] Touch targets ≥44px: CTA `size="xl"`(h-11)/`size="lg"`; nav items `py-2`; FAB size-14.
- [ ] Footer/topbar on deep green: all text ≥ AA (white on `#094220` = 11.59:1); links ≥ 80% opacity white.

---

## PART J — DESIGN TOKENS USED (index)

- **Colors:** `--primary` (deep green), `--primary-foreground`, `--secondary`/`--secondary-foreground` (mint), `--muted`/`--muted-foreground`, `--accent`, `--border`, `--card`, `--ring` (brand green), `--cta`/`--cta-foreground`/`--cta-hover`/`--cta-active`/`--cta-text` (NEW orange), `--success`, `--whatsapp`. No hardcoded hex in any component.
- **Typography:** `font-heading` (Libre Caslon Text) for H1/H2/figures/card titles; `font-sans` (Inter) for body/UI/eyebrows/spec lines. No new fonts.
- **Spacing:** container `px-4 md:px-6 lg:px-8`, section `py-14 md:py-20` (band `py-10`), card `p-5`/`p-6`, gap `gap-4`/`gap-6`.
- **Radius:** `rounded-md` (0.375rem) default; `rounded-full` badges/bars/FAB; `rounded-lg` CTA banner.
- **Shadows:** `shadow-sm` cards/cert-tag/CTA; `shadow-lg`→`shadow-xl` FAB. `--shadow-color` green-tinted.
- **Motion tokens:** `--ease-out` (all enters/presses), `--ease-drawer` (mobile nav, existing).

---

## PART K — FILES (design → dev handoff)

**Tokens/shell:** `globals.css` (`.theme-storefront` greens+mint+CTA tokens, `@theme inline` `--color-cta*`, 3 new motion classes), `layout.tsx` (insert `SiteTopbar`), `site-topbar.tsx` (NEW), `site-header.tsx` (nav+logo+CTA), mobile-nav (drawer CTA), `site-footer.tsx` (5-col green), `button.tsx` (cta variant + xl size), `config/catalog.ts` (`EMPRESAS_PATH`), `config/calculator.ts` (NEW ref prices).

**Shared:** `grade.ts` (NEW type + guard), `grade-badge.tsx` (NEW), `product-card.tsx` (badge slot), `catalog/types.ts` (`conditionGrade`), `catalog/queries.ts` (project column), PDP page (badge).

**Home sections:** `hero.tsx`(+`hero-stats.tsx`,`cert-tag.tsx`), `brand-bar.tsx`, `values-impact.tsx`, `process-steps.tsx`, `b2b-section.tsx`, `social-proof.tsx`, `savings-calculator.tsx`, `trust-faq.tsx`(+`faq-accordion.tsx`), `cta-banner.tsx`, `page.tsx` (recompose).

**Admin:** `product-form.tsx` (grade SelectField), `products-form-state.ts`, `product-input.ts`, `actions.ts`.

**i18n:** `es-MX.json` + `en.json` — `home.*`, `topbar.*`, `header.cta`, footer additions, `product.grade.*`, `admin.products.grade.*`/`fields.conditionGrade`, calculator labels. Copy verbatim (PART L). Quote copy REUSES existing `empresas.*`.

**Checklist:** append placeholder figures to `tasks/client-content-questionnaire.md` (PART M).

---

## PART L — VERBATIM COPY (both locales, for message files)

> Source of truth for `home.*`. ES from `client-homepage-es.html`, EN from `-en.html`. Anchor slugs shared (Spanish) in both locales.

**Topbar** — msg1 ES `Envíos a toda la República` / EN `Nationwide shipping across Mexico`; msg2 ES `Meses sin intereses` / EN `Interest-free installments`; msg3 ES `Factura para tu empresa` / EN `Tax invoices for your business`; contactPrefix ES `Escríbenos:` / EN `Message us:`; WA display `+52 55 1234 5678`; contactAria ES `Escríbenos por WhatsApp`/EN `Message us on WhatsApp`.

**Header** — nav: catalog ES `Catálogo`/EN `Catalog`; process ES `Proceso`/EN `Process`; business ES `Empresas`/EN `Business`; trust ES `Confianza`/EN `Trust`. CTA ES `Cotización empresarial`/EN `Get a business quote`. navAria ES `Navegación principal`/EN `Main navigation`. menuAria ES `Abrir menú`/EN `Open menu`.

**Hero** — eyebrow ES `Mobiliario ergonómico certificado`/EN `Certified ergonomic furniture`; headlineL1 ES `Eleva tu mobiliario.`/EN `Elevate your furniture.`; headlineL2 ES `No tus costos.`/EN `Not your costs.`; subtitle ES `Sillas pre-owned Herman Miller, Steelcase y Haworth, verificadas al 100% funcionales y en buenas condiciones. Mismo diseño, misma ergonomía — hasta 60% menos que comprarlas nuevas.`/EN `Pre-owned Herman Miller, Steelcase and Haworth chairs, verified 100% functional and in good condition. Same design, same ergonomics — up to 60% less than buying new.`; ctaCatalog ES `Explorar catálogo →`/EN `Browse the catalog →`; ctaBusiness ES `Soluciones para empresas`/EN `Business solutions`. Stats: s1 `+3,200` ES `Sillas entregadas`/EN `Chairs delivered`; s2 `100%` ES `Funcionalidad verificada`/EN `Function verified`; s3 `60%` ES `Ahorro promedio`/EN `Average savings`. Cert-tag: grade ES `Grado A+`/EN `Grade A+`; code ES `CERT. Nº PP-04821`/EN `CERT. NO. PP-04821`; meta ES `INSPECCIONADA · 100% FUNCIONAL`/EN `INSPECTED · 100% FUNCTIONAL`. Hero disclaimer ES `*Elemento y cifras ilustrativos — sustituir con datos reales.`/EN `*Illustrative element and figures — replace with real data.`

**BrandBar** — label ES `Trabajamos únicamente con las marcas que definen la ergonomía moderna`/EN `We work exclusively with the brands that define modern ergonomics`; brands (both) `Herman Miller · Steelcase · Haworth · Knoll · Humanscale`.

**Values** — eyebrow ES `Por qué PosturPro`/EN `Why PosturPro`; heading ES `Curamos, no acumulamos`/EN `Curated, not crammed`; subcopy ES `Nada de catálogos de mil productos mezclando lo genérico con lo premium. Solo mobiliario de las marcas que definen la ergonomía, seleccionado y verificado pieza por pieza.`/EN `No thousand-item catalogs mixing generic with premium. Just furniture from the brands that define ergonomics — selected and verified piece by piece.` Cards (title / body):
- 1 ES `Ahorra hasta 60%` / `El mismo diseño, la misma ergonomía premiada — a una fracción del precio de lista.` · EN `Save up to 60%` / `The same design, the same award-winning ergonomics — for a fraction of list price.`
- 2 ES `100% funcionalidad verificada` / `Probamos cada mecanismo antes de vender la silla. Si algo no funciona al 100%, no sale de nuestro almacén.` · EN `100% verified function` / `We test every mechanism before selling the chair. If it isn't 100% functional, it doesn't leave our warehouse.`
- 3 ES `Buenas condiciones, siempre` / `Seleccionamos solo mobiliario en buen estado real — evaluado antes de llegar a tu inventario.` · EN `Good condition, always` / `We only select furniture in genuinely good condition — evaluated before it reaches your inventory.`
- 4 ES `100% originales` / `Jamás vendemos réplicas. Cada pieza es auténtica y con procedencia documentada.` · EN `100% original` / `We never sell replicas. Every piece is authentic, with documented provenance.`

**Impact** — f1 `+3,200` ES `Sillas con una segunda vida`/EN `Chairs given a second life`; f2 `9,400 kg` ES `De mobiliario rescatado`/EN `Of furniture rescued`; f3 `60%` ES `Menos huella vs. fabricar una silla nueva`/EN `Less footprint vs. manufacturing new`. Disclaimer ES `*Cifras estimadas de ejemplo — sustituir con datos reales de la operación.`/EN `*Estimated example figures — replace with real operational data.`

**Catalog** — eyebrow ES `Catálogo`/EN `Catalog`; heading ES `Piezas verificadas, listas para trabajar`/EN `Verified pieces, ready to work`; viewAll ES `Ver todo el catálogo →`/EN `View the full catalog →`. (Cards = real products; mockup chair data NOT used.)

**Process** — eyebrow ES `Cómo trabajamos`/EN `How we work`; heading ES `El proceso de certificación PosturPro`/EN `The PosturPro certification process`; subcopy ES `Cada silla pasa por un proceso claro antes de llegar a tu puerta — así garantizamos que funcione al 100%.`/EN `Every chair goes through a clear process before it reaches your door — that's how we make sure it works 100%.` Steps (title / body):
- 01 ES `Adquisición y evaluación` / `Compramos mobiliario proveniente de liquidaciones corporativas y oficinas certificadas. Solo aceptamos piezas que ya están en buen estado real — no cualquier cosa que llega al almacén.` · EN `Sourcing and evaluation` / `We buy furniture from corporate liquidations and certified offices. We only accept pieces that are already in genuinely good condition — not just anything that shows up at the warehouse.`
- 02 ES `Inspección funcional` / `Probamos cada mecanismo antes de aceptar la pieza: reclinado, ajuste de altura, tensión, apoyabrazos y ruedas.` · EN `Functional inspection` / `We test every mechanism before accepting the piece: recline, height adjustment, tension, armrests and casters.`
- 03 ES `Limpieza y ajuste` / `Cada silla se limpia a fondo y se ajusta — altura, tensión, mecanismos — antes de salir de nuestro almacén.` · EN `Cleaning and adjustment` / `Every chair is thoroughly cleaned and adjusted — height, tension, mechanisms — before it leaves our warehouse.`
- 04 ES `Verificación final y grado` / `Revisión de condición cosmética y funcional antes de asignar el grado y el número de certificado.` · EN `Final check and grading` / `A cosmetic and functional review before we assign the condition grade and certificate number.`

**B2B** — eyebrow ES `Soluciones para empresas`/EN `Business solutions`; heading ES `Equipa tu oficina completa sin vaciar el presupuesto`/EN `Furnish your whole office without draining the budget`; subcopy ES `Trabajamos con equipos de RRHH, Administración y Facilities en proyectos de 10 a 500+ estaciones de trabajo.`/EN `We work with HR, Administration and Facilities teams on projects from 10 to 500+ workstations.` Value list (ES / EN):
1 `Precios preferenciales por volumen` / `Preferential volume pricing`
2 `Asesor de cuenta dedicado durante todo el proyecto` / `A dedicated account advisor throughout the project`
3 `Instalación, logística y entrega en sitio incluidas` / `On-site installation, logistics and delivery included`
4 `Programa de recompra: tomamos tu mobiliario actual como parte de pago` / `Buyback program: we'll take your current furniture as part of the payment`
5 `Facturación fiscal para tu empresa` / `Tax invoicing for your business`
Segments heading ES `Tipo de organizaciones que atendemos`/EN `Types of organizations we work with`; list ES `Startups tecnológicas · Despachos profesionales · Corporativos financieros · Instituciones educativas`/EN `Tech startups · Professional firms · Financial corporates · Educational institutions`. Stats: `+150` ES `Oficinas equipadas*`/EN `Offices furnished*`; `24h` ES `Respuesta a cotizaciones`/EN `Quote response time`. Disclaimer ES `*Cifra ilustrativa de ejemplo para este layout — sustituir con datos reales de la empresa.`/EN `*Illustrative example figure for this layout — replace with real company data.` (Quote form field labels REUSE T16 `empresas.*` — do NOT duplicate.)

**SocialProof** — heading (added) ES `Lo que dicen nuestros clientes`/EN `What our customers say`. T1 quote ES `"Quería una Aeron real, no una copia, para mi home office. Llegó impecable y funcionando perfecto desde el primer día."`/EN `"I wanted a real Aeron, not a knockoff, for my home office. It arrived flawless and working perfectly from day one."`; attribution ES `Regina P. — Compra individual, CDMX`/EN `Regina P. — Individual buyer, Mexico City`. T2 quote ES `"Reequipamos 45 estaciones para nuestra oficina en Monterrey. Ahorramos más de la mitad del presupuesto."`/EN `"We refurnished 45 workstations for our office in Monterrey. We saved more than half our budget."`; attribution ES `Gerente de Administración — Empresa de manufactura`/EN `Administration Manager — Manufacturing company`. Disclaimer ES `*Testimonios ilustrativos para este layout — sustituir con reseñas reales.`/EN `*Illustrative testimonials for this layout — replace with real reviews.` (Drop the mockup's "dashed circle" sentence — we render a neutral avatar glyph, not a media-note.)

**Calculator** — eyebrow ES `Herramienta`/EN `Tool`; heading ES `¿Cuánto puedes ahorrar?`/EN `How much can you save?`; subcopy ES `Elige un modelo y compara el precio de lista contra el precio PosturPro.`/EN `Pick a model and compare list price against the PosturPro price.`; selectLabel ES `Modelo de silla`/EN `Chair model`; newPriceLabel ES `Precio nuevo`/EN `New price`; posturLabel `PosturPro` (both); pctSuffix ES `de ahorro`/EN `in savings`; amountSuffix ES `menos que comprar nueva`/EN `less than buying new`; note ES `*Precios de referencia. El precio final depende del modelo, configuración y grado de condición disponible en inventario.`/EN `*Reference prices. Final price depends on model, configuration and the condition grade available in inventory.` (Model labels derived from config brand+model.)

**Trust** — eyebrow ES `Confianza`/EN `Trust`; heading ES `Compra con la certeza de una marca establecida`/EN `Buy with the confidence of an established brand`. Guarantees (lead / body — ES // EN):
1 `Funciona al 100%, garantizado.` / `Cada silla se limpia, se ajusta y se verifica antes de salir de nuestro almacén, lista para trabajar desde el primer día.` · `Works 100%, guaranteed.` / `Every chair is cleaned, adjusted and verified before it leaves our warehouse — ready to work from day one.`
2 `Autenticidad 100%.` / `Nunca vendemos réplicas ni piezas no originales — cada pieza es genuina.` · `100% authentic.` / `We never sell replicas or non-original parts — every piece is genuine.`
3 `Buenas condiciones, siempre.` / `Seleccionamos solo mobiliario en buen estado real, evaluado antes de llegar a tu inventario.` · `Good condition, always.` / `We only select furniture in genuinely good condition, evaluated before it reaches your inventory.`
4 `Pagos y facturación sin complicaciones.` / `Tarjeta, transferencia, PayPal y factura para personas físicas y morales.` · `Hassle-free payments and invoicing.` / `Card, bank transfer, PayPal, and tax invoices for individuals and businesses.`
FAQ eyebrow ES `Preguntas frecuentes`/EN `Frequently asked questions`. Q / A (ES // EN), slugs in brackets:
1 [faq-originales] `¿Las sillas son 100% originales?` / `Sí. Nunca vendemos réplicas. Cada silla proviene de mobiliario corporativo auténtico y su procedencia queda documentada en el certificado que acompaña tu compra.` · `Are the chairs 100% original?` / `Yes. We never sell replicas. Every chair comes from authentic corporate furniture, and its provenance is documented in the certificate that comes with your purchase.`
2 [faq-grados] `¿Qué significa cada Grado de condición?` / `Grado A+ es prácticamente como nueva, sin señales visibles de uso. Grado A tiene marcas cosméticas mínimas. Grado B presenta desgaste visible pero funciona igual de bien. Los tres grados pasan la misma verificación funcional antes de salir de nuestro almacén.` · `What does each condition grade mean?` / `Grade A+ is practically like new, with no visible signs of use. Grade A has minimal cosmetic marks. Grade B shows visible wear but works just as well. All three grades pass the same functional check before leaving our warehouse.`
3 [faq-problema] `¿Qué pasa si mi silla llega con un problema?` / `Antes de enviarla, limpiamos, ajustamos y verificamos que cada silla funcione al 100%, así que la probabilidad de que llegue con un problema es mínima. Si algo no cuadra, escríbenos directamente y lo resolvemos caso por caso.` · `What happens if my chair arrives with a problem?` / `Before shipping, we clean, adjust and verify that every chair works 100%, so the odds of a problem on arrival are minimal. If something's off, message us directly and we'll sort it out case by case.`
4 [faq-envios] `¿Hacen envíos a todo México?` / `Sí, enviamos a toda la República vía paquetería asegurada. En zona metropolitana de CDMX, Guadalajara y Monterrey ofrecemos entrega e instalación en sitio.` · `Do you ship across all of Mexico?` / `Yes, we ship nationwide via insured courier. In the greater Mexico City, Guadalajara and Monterrey metro areas, we offer on-site delivery and installation.`

**CtaBanner** — heading ES `¿Listo para elevar tu oficina?`/EN `Ready to elevate your office?`; cta1 ES `Explorar catálogo →`/EN `Browse the catalog →`; cta2 ES `Cotización empresarial →`/EN `Get a business quote →`.

**Footer** — blurb ES `Eleva tu mobiliario, no tus costos. Sillas ergonómicas premium preowned, verificadas y en buenas condiciones, para personas y empresas en todo México.`/EN `Elevate your furniture, not your costs. Premium pre-owned ergonomic chairs, verified and in good condition, for individuals and businesses across Mexico.` Social: `Instagram`·`LinkedIn`·`Facebook`. Col Catálogo: heading ES `Catálogo`/EN `Catalog`; `Todas las sillas`/`All chairs`, `Herman Miller`, `Steelcase`, `Haworth`. Col Empresas: heading ES `Empresas`/EN `Business`; `Cotización empresarial`/`Business quote`, `Programa de recompra`/`Buyback program`, `Financiamiento`/`Financing`. Col Compañía: heading ES `Compañía`/EN `Company`; `Proceso de certificación`/`Certification process`, `Confianza`/`Trust`, `Sustentabilidad`/`Sustainability`. Col Contacto: heading ES `Contacto`/EN `Contact`; `WhatsApp: +52 55 1234 5678`; email `hola@posturpro.mx`; showrooms ES `Showrooms con cita: CDMX · Guadalajara · Monterrey`/EN `Showrooms by appointment: Mexico City · Guadalajara · Monterrey`; hours ES `Lunes a viernes, 9:00–18:00`/EN `Monday to Friday, 9:00 AM–6:00 PM`. Bottom: copyright ES `© 2026 PosturPro. Todos los derechos reservados.`/EN `© 2026 PosturPro. All rights reserved.`; payments ES `Pagos con tarjeta, transferencia, PayPal y MSI. Facturación disponible.`/EN `Card, bank transfer, PayPal and interest-free installments accepted. Invoicing available.`; legal ES `Aviso de privacidad`·`Términos y condiciones`/EN `Privacy notice`·`Terms and conditions`. FAB aria-label ES `Escríbenos por WhatsApp`/EN `Message us on WhatsApp` (existing).

**product.grade.*** — badge label pattern ES `Grado {grade}`/EN `Grade {grade}` (interpolate `A+`/`A`/`B`).
**admin.products.*** — `fields.conditionGrade` `Condición`; `grade.none` `Sin grado`; `grade.helper` `Grado de condición mostrado en la tienda (opcional).`; `grade.error` `Selecciona una condición válida.` (es-MX admin only).

**Copy decisions (agent flags resolved):**
1. Filter-pill crossed translation — moot: homepage catalog uses REAL products, not the mockup filter pills (not rendered).
2. Price MXN suffix — use `formatMXN` everywhere (locale-aware) rather than the mockup's inconsistent `$X` vs `$X MXN`.
3. Anchor slugs Spanish in both locales — kept.
4. Social-proof heading — added.
5. View-all catalog link — added.
6. Grade/cert proposal — cert-tag clearly illustrative w/ disclaimer; grade ships fully (owner decision 2).
7. Calculator values — computed client-side from config; only reference prices stored.

---

## PART M — PLACEHOLDER CHECKLIST (append to `tasks/client-content-questionnaire.md`)

All illustrative/example values requiring owner→client confirmation before launch:
- **Hero stats:** +3,200 chairs delivered · 100% function verified · 60% average savings.
- **Cert-tag (illustrative):** grade A+, cert no. PP-04821.
- **Impact strip:** +3,200 second-life chairs · 9,400 kg rescued · 60% less footprint.
- **B2B panel stats:** +150 offices furnished · 24h quote response.
- **Testimonials (illustrative, placeholder names):** Regina P. (individual, CDMX); Administration Manager (manufacturing).
- **Calculator reference prices (6, MXN new→PosturPro):** Aeron 38,500→21,900 · Leap V2 32,000→15,900 · Zody 24,000→11,500 · Embody 42,500→26,500 · Gesture 29,500→14,900 · Sayl 19,500→9,800.
- **Contact:** WhatsApp/phone +52 55 1234 5678 (wa.me/525512345678) · email hola@posturpro.mx · showroom cities CDMX/Guadalajara/Monterrey · hours Mon–Fri 9:00–18:00.
- **Social links:** Instagram / LinkedIn / Facebook hrefs (currently `#`).
- **Legal links:** Aviso de privacidad / Términos hrefs (currently `#`).
- **Copyright year:** 2026.
- **Brand palette source:** logo greens confirmed from `public/brand/logo.svg` (#094220 / #0f7f3c / #e7f7ed).
