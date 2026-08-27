# UI Design: T20 — Storefront restyle in the Factorial design language (Phase A: homepage + shared shell)

> **Scope**: homepage (`/[locale]`, 13 sections) + shared shell (topbar, header, footer, mobile-nav, WhatsApp FAB). Presentation-only. All T19 copy/i18n/data/SEO/JSON-LD/calculator logic/quote embed are **byte-identical** — this spec never changes a prop, string, testid, or behavior, only classes, tokens, and the font wiring. Non-home page bodies, `product-card.tsx`/`product-grid.tsx`, `home/hero.tsx`, `home/featured-brands.tsx`, and all of `/admin` are **out of scope** (Phase B / firewall).
>
> **Authority order for this task**: the measured Factorial grammar (`tasks/reference/factorial-style-analysis.md`) owns the *look*; Emil Kowalski owns *motion restraint*; impeccable owns *identity discipline*. Where the reference and Emil conflict on motion, Emil wins (fewer, quieter transitions). Every decision here is resolved to an exact class string so dev needs zero design judgment.
>
> This artifact **supersedes the T19 UI-design spec** and the "Casa de Azulejo" visual world for the homepage + shell. The T19 palette hex/oklch values and the CTA-token contract are **preserved verbatim**; only the presentation grammar (font, ground, radius, cards, buttons, footer) changes. The DESIGN.md amendment text is in PART J.

---

## Design Principles for This Feature

1. **White page, tinted objects.** The page is pure white. Separation comes from vertical rhythm (~112px desktop band family) and tinted *objects* — flat gray/whisper-green cards and exactly two 50%-opacity gradient moments (calculator band + closing CTA banner). Never alternate full-bleed section backgrounds. (AC-7)
2. **One font, tight and heavy.** DM Sans everywhere. Headings 700 at `-0.04em`, ~1.1 leading; body 400 at 1.5 leading in a softer ink; small text `-0.02em`. Hierarchy comes from **weight + tightness + ink-step**, never a second family, italics, or uppercase. Sentence case everywhere. (AC-1/2/3/4)
3. **Everything is a pill.** CTAs (solid orange + 2px self-border), secondaries (2px ink outline), nav CTA, form submit, chips. `rounded-full`. Hover = lighter tint over ~100ms, no scale/lift on hover. (AC-10)
4. **Loud color is rationed.** Orange appears only on primary CTAs (≤5 per screen). Green `#0f7f3c` carries link accents + check icons. Everything else is ink + white + whisper-tints. If a surface asks "should this be orange?", the answer is almost always no. (AC-9)
5. **Oversized naked numbers, quiet chrome.** Stat numerals are ~56/64px, 700, `-0.04em`, bare in flat gray cards. FAQ is hairline rows, no card. Nav and footer are hairline-bordered, no drop shadow. (AC-11/12/13)
6. **Motion is barely there.** No scroll-reveal spam (Factorial has none). Keep the existing subtle `.enter-fade`/`.stagger` entrances (reduced-motion-safe). New motion is limited to 100ms hover color swaps and the existing press feedback. transform/opacity only. (AC-21)

---

## PART A — Tokens, fonts, and the firewall

The entire re-skin is driven from **one seam**: the `.theme-storefront` token block + the DM Sans font wiring. No home/shell component hardcodes a hex/oklch/rgb value or a raw radius — every value flows through a token utility. This is the T15/T19 precedent, reused not rebuilt.

### A.1 — CSS file strategy (avoid the 600-line guard breach)

`globals.css` is **290 lines**; motion files sit at 314/230/232. AC-23 / `css-line-count.test.ts` warns at 600, hard-caps at 1000. To keep `globals.css` comfortably under 600 **and** give the pill/shadow/gradient recipes a clean home:

- **Edit the `.theme-storefront` block in `globals.css` in place** for token *values* (color role remap, pure-white ground, shadow color, font-family binding) and the new pill/pastel/gradient/shadow **custom properties**. Adds ~35–45 lines → `globals.css` lands ~330–335. Safe.
- **Create `src/app/theme-storefront.css`** (new file, imported at the top of `globals.css` alongside the motion imports) for storefront **utility classes / component recipes** too long for inline arbitrary values and reused across sections: the body-font override, `.factorial-card`, `.stat-card`, `.pill-outline`, `.gradient-band`, `.gradient-banner`. Budget ≤ 180 lines. Mirrors the `motion-*.css` split; keeps every CSS file well under the ceiling.
- **Do NOT** add storefront tokens to `:root`/`.dark` (admin worlds) — AC-6.

> Dev note: `@import` must precede all rules in `globals.css`. Add `@import "./theme-storefront.css";` in the existing import block (after the motion imports).

### A.2 — Font wiring (`src/app/fonts.ts`)

Add DM Sans as a **new** export bound to a **new** variable. Do NOT touch `sans` (Inter, shared with admin) or rebind `--font-sans`.

```ts
import { DM_Sans } from "next/font/google";

/**
 * Storefront body + display face (T20 — Factorial grammar). One geometric sans
 * for everything: headings, body, UI, buttons, numbers. Wired to a NEW variable
 * `--font-dm-sans` and applied ONLY under `.theme-storefront` (globals.css), so
 * /admin + not-found keep Inter (firewall, AC-5/AC-6). `latin-ext` covers the
 * es-MX glyphs (á é í ó ú ñ ¿ ¡) so tight -0.04em headings never fall back
 * mid-word (edge 5). Four pinned weights keep the bundle bounded.
 */
export const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});
```

`headingSerif` (Libre Caslon) **stays in the file** — admin/not-found don't use it, and the shared `Hero`/`/empresas` (Phase B) still reference `--font-heading-serif`. It is simply no longer *applied* on the homepage/shell because `.theme-storefront` rebinds `--font-heading-family` to DM Sans (A.4). Do not remove it in Phase A (would touch `/empresas`). AC-24: `display:"swap"` + a metrics-reasonable fallback stack bounds CLS.

### A.3 — Font application (`src/app/[locale]/layout.tsx`)

Add the DM Sans variable to `<html className>`. Keep `theme-storefront` on `<body>`. Do NOT touch `admin/layout.tsx`.

```tsx
import { sans, headingSerif, dmSans } from "@/app/fonts";
// <html>:
className={cn("h-full", sans.variable, headingSerif.variable, dmSans.variable)}
```

The `<body>` keeps its `font-sans` class (resolves `--font-sans` = Inter at the base layer). The storefront body-font override in `theme-storefront.css` (A.4) wins for everything under `.theme-storefront`. Net: admin body = Inter; storefront body = DM Sans; no per-component font class needed.

### A.4 — Token diff (`.theme-storefront` in `globals.css`)

Exact custom-property changes. hex is sRGB reference; **oklch is authoritative**. Every pairing is AA-verified in A.6.

**Fonts — rebind the resolver (in `globals.css`) + a scoped body override (in `theme-storefront.css`):**

```css
/* globals.css → .theme-storefront */
--font-heading-family: var(--font-dm-sans), "Helvetica Neue", Helvetica, Arial,
  sans-serif;
```

```css
/* theme-storefront.css — body face for the storefront only (firewall) */
.theme-storefront,
.theme-storefront .font-sans {
  font-family: var(--font-dm-sans), "Helvetica Neue", Helvetica, Arial, sans-serif;
}
```

> Rationale: the `<body>` carries both `theme-storefront` and `font-sans`; a scoped `font-family` on `.theme-storefront` overrides the utility for all descendants. Admin `<body>` has neither `.theme-storefront` nor `--font-dm-sans`, so it renders Inter. This is the AC-5 firewall — the `font-heading` utility (headings) also resolves to DM Sans via the resolver rebind, so Libre Caslon renders nowhere on home/shell (AC-4).

**Ground → pure white (was green-tinted glaze):**

| Token | T19 value | T20 value | Note |
|---|---|---|---|
| `--background` | `oklch(0.985 0.008 158)` | `oklch(1 0 0)` | pure white page (AC-7) |
| `--foreground` | `oklch(0.28 0.055 158)` | **keep** | deep-green ink — headings/identity |
| `--card` | `oklch(1 0 0)` | **keep** | white floating cards |
| `--muted` | `oklch(0.955 0.012 158)` | `oklch(0.968 0.004 158)` | flatter near-neutral gray for stat/canvas cards (Factorial `#F4F4F5` family) |
| `--muted-foreground` | `oklch(0.47 0.045 158)` | `oklch(0.44 0.030 158)` | body/secondary ink, less green (Factorial `#515164` energy); AA on white — **dev verifies ≥4.5** |
| `--secondary` | `oklch(0.9615 0.0214 158.6)` | `oklch(0.955 0.018 158)` | whisper-green tint object bg |
| `--border` | `oklch(0.88 0.02 158)` | `oklch(0.90 0.010 158)` | hairlines — lighter, neutral (Factorial `#E5E7EB`/`#D3D3D8`) |
| `--input` | `oklch(0.88 0.02 158)` | `oklch(0.90 0.010 158)` | match hairline |
| `--radius` | `0.375rem` | `1rem` (16px) | Factorial card radius base; drives the radius map (A.5) |
| `--shadow-color` | `oklch(0.3346 0.0816 151.8 / 0.12)` | `oklch(0.28 0.055 158 / 0.06)` | softer neutral-green for the layered card shadow (Factorial `rgba(40,40,61,.05)`) |

**Keep unchanged** (identity + CTA, already correct): `--primary`, `--primary-foreground`, `--ring` (brand green), `--accent`/`--accent-foreground`, `--destructive`, all `--cta*`, `--gold*`, `--success*`, `--warning*`, `--whatsapp*`. `--secondary-foreground` stays `--primary`.

**New custom properties (add to `.theme-storefront` in `globals.css`):**

```css
/* T20 Factorial primitives ------------------------------------------------ */
/* Layered triple soft-shadow for floating white cards (measured; re-tinted to
 * our neutral-green shadow-color). Applied via .factorial-card. */
--shadow-factorial:
  0 -8px 16px var(--shadow-color),
  0 16px 24px var(--shadow-color),
  0 4px 8px var(--shadow-color);

/* Pastel tints (~8–12% of brand hues on white) for card canvases / icon tiles.
 * AA-safe as BACKGROUNDS ONLY (text over them is ink/green — see A.6). */
--tint-green: oklch(0.965 0.028 155);   /* ~ #0f7f3c @ ~9% on white — mint canvas */
--tint-orange: oklch(0.965 0.030 45);   /* ~ #f95326 @ ~8% on white — warm canvas */

/* The two-and-only-two gradient moments (Factorial peach→aqua @50%, remapped
 * to soft-green → warm-tint), left→right. Used by .gradient-band (calculator)
 * + .gradient-banner (closing CTA). */
--gradient-factorial: linear-gradient(
  100deg,
  oklch(0.95 0.035 150 / 0.55),
  oklch(0.955 0.035 55 / 0.5)
);
```

### A.5 — Radius map

Raising `--radius` to `1rem` recomputes the `@theme inline` scale (already defined as multipliers in `globals.css` — **no edit there**):

| Utility | Multiplier | @ `--radius:1rem` | Use |
|---|---|---|---|
| `rounded-sm` | ×0.6 | ~9.6px | chips, focus targets |
| `rounded-md` | ×0.8 | ~12.8px | **small info cards** (Factorial radius-12) |
| `rounded-lg` | ×1.0 | 16px | **floating cards + stat/canvas cards** (Factorial radius-16) |
| `rounded-3xl` | ×2.2 | ~35px | near the banner size |
| `rounded-[2rem]` | — | 32px | **closing CTA banner** (exact Factorial radius-32) |
| `rounded-full` | — | pill | all buttons, chips |

Storefront-scoped `--radius` bump only; admin (`:root --radius:0.625rem`) is untouched. Search confirms storefront uses radius only on cards + buttons; buttons move to `rounded-full` explicitly (B.1), so the bump is safe.

### A.6 — Contrast verification (AA, AC-20)

≥ 4.5:1 normal, ≥ 3:1 large (≥24px/700). Verify with exact tokens at dev time; targets:

| Foreground | Background | Min | Status |
|---|---|---|---|
| `--foreground` ink | white | 4.5 | PASS (~11:1) |
| `--muted-foreground` body | white | 4.5 | must hold ≥4.5 — the lightening is set at this floor; **dev verifies** |
| `--muted-foreground` | `--muted` gray card | 4.5 | verify (very light gray; passes) |
| `--foreground` | `--tint-green`/`--tint-orange` | 4.5 | PASS (tints ≥0.96 L) |
| `--foreground` large stat 56/700 | `--muted` gray card | 3.0 | PASS |
| `--cta-foreground` warm-brown | `--cta` orange pill | 4.5 | PASS (5.30:1, unchanged) |
| `--primary` deep green | white | 4.5 | PASS |
| `--foreground` ink | lightest of `--gradient-factorial` | 4.5 | PASS (~10:1) |
| brand green `#0f7f3c` (`--ring`) as **text** | white | 4.5 | **verify**; if <4.5, use `--primary` (deep green) for link text and reserve `--ring`/`#0f7f3c` for check ICONS (icon+text, color not sole signal) |

> **Preserved rule**: color is never the only signal. Check icons keep glyphs; the FAQ chevron rotates; disabled states keep opacity + cursor.

---

## PART B — Component specs

### B.1 — Button (pill grammar) — `src/components/ui/button.tsx`

**Purpose**: the pill CTA system. **shadcn base**: existing `cva` Button — extend, don't replace. **Firewall**: admin buttons keep `rounded-md`; pill radius applies to storefront-used variants/sizes only (`cta`, `xl`) + a storefront call-site class (`.pill-outline`). Admin never uses `cta`/`xl`.

**Variant/size changes:**

| Target | Before | After | Why |
|---|---|---|---|
| `cta` variant | `cta-press bg-cta text-cta-foreground shadow-sm hover:bg-cta-hover active:bg-cta-active` | `cta-press rounded-full border-2 border-cta bg-cta text-cta-foreground hover:bg-cta-hover hover:border-cta-hover active:bg-cta-active` | pill + 2px self-colored border (Factorial primary); border animates with fill; **drop `shadow-sm`** (Factorial CTAs have no shadow) |
| `xl` size | `h-11 min-w-11 gap-1.5 px-6 text-sm font-semibold ...` | `h-12 min-w-12 gap-1.5 rounded-full px-8 text-base font-semibold ...` | Factorial large pill: ≥44 target (48px), 16/600 label, generous px; `rounded-full` so even non-`cta` `xl` buttons are pills |
| base | `transition-all` | `transition-colors` | Factorial hover is a **color swap only** (`all .1s ease`); avoids animating layout/transform on hover (Emil: name exact properties). Press stays via `.cta-press`/`active:translate-y-px`. |

Keep `active:not-aria-[haspopup]:translate-y-px` (existing press nudge — transform-based feedback, Factorial-compatible).

**Secondary CTA (outline pill)** — applied at storefront call sites via a class (keeps admin `outline` unchanged). Add to `theme-storefront.css`:

```css
/* Storefront secondary CTA: 2px ink-outline pill. Applied on
 * <Button variant="outline"> at homepage/shell call sites. */
.pill-outline {
  border-radius: 9999px;
  border-width: 2px;
  border-color: var(--primary);
  background: transparent;
  color: var(--primary);
}
@media (hover: hover) and (pointer: fine) {
  .pill-outline:hover { background: var(--secondary); color: var(--primary); }
}
```

Call-site pattern for secondaries: `variant="outline" size="xl" className="pill-outline w-full sm:w-auto"`.

**States table (primary `cta` pill):**

| State | Visual | Behavior |
|---|---|---|
| Default | solid orange fill, 2px orange border, warm-brown 16/600 label | — |
| Hover (hover-capable) | fill + border *crossfade* to `--cta-hover` (lighter) over 100ms `ease` | no scale/lift/shadow |
| Active/press | `translate-y-px` nudge, `--cta-active` fill | instant feedback |
| Focus-visible | `border-ring` + `ring-2 ring-ring/30` | keyboard ring |
| Disabled | `opacity-50`, `pointer-events-none` | not used on home CTAs |
| Reduced motion | color still swaps; no transform | `.cta-press` dropped by existing RM rule |

### B.2 — Factorial card primitive — NEW `src/components/home/factorial-card.tsx` + `.factorial-card`/`.stat-card`

**Purpose**: DRY the two card finishes (CLAUDE.md). **shadcn base**: none — do NOT create `ui/card.tsx` (would add an admin-reachable surface). Keep a tiny home-scoped wrapper. Recipes in `theme-storefront.css`:

```css
/* (a) Floating white card — content/product/testimonial cards. */
.factorial-card {
  border-radius: var(--radius);          /* 16px */
  background: var(--card);               /* white */
  box-shadow: var(--shadow-factorial);   /* layered triple soft shadow */
  border: 0;
}
/* (b) Flat gray/canvas card — stats + tinted canvases. No shadow, no border. */
.stat-card {
  border-radius: var(--radius);          /* 16px */
  background: var(--muted);              /* flat gray */
  border: 0;
}
```

```tsx
// factorial-card.tsx
interface FactorialCardProps extends React.ComponentProps<"div"> {
  finish?: "float" | "flat";
}
export function FactorialCard({ finish = "float", className, ...props }: FactorialCardProps) {
  return (
    <div
      className={cn(finish === "float" ? "factorial-card" : "stat-card", className)}
      {...props}
    />
  );
}
```

**States**: static — Factorial cards don't lift on hover. Small info cards pass `className="rounded-md"` (12px). A plain `<div className="factorial-card p-6">` is acceptable where the wrapper isn't reused.

### B.3 — Stat card (oversized naked numeral)

Signature 56px numeral in a flat gray card (values-impact figures) or naked (hero).

```
┌─────────────────────────┐   .stat-card, radius 16, p-6/p-8
│  43 %                    │   numeral: text-4xl→md:text-[3.5rem] (48→56)
│                          │            font-bold, tracking-[-0.04em], tabular-nums, ink
│  Ahorro promedio         │   label: text-sm/base font-medium muted, tracking-[-0.02em]
└─────────────────────────┘
```

**Numeral class (reused)**: `font-heading text-4xl font-bold tabular-nums tracking-[-0.04em] text-foreground sm:text-5xl md:text-[3.5rem] md:leading-[1.05]`. (`font-heading` = DM Sans now, so DM Sans 700.)

**Responsive**: 3-up desktop → stacked/2-up mobile; numeral steps 56→48 at `<md`. Short figures (`43%`, `50%`, `4.9`) fit 3-up at 320px; long labels wrap under the numeral.

### B.4 — FAQ hairline rows — `faq-accordion.tsx` (motion class exists)

**Mechanism frozen**: native `<details>/<summary>`, chevron rotate (`.faq-chevron`), slug IDs, keyboard/focus a11y (AC-13). Only classes:

| Element | Before | After |
|---|---|---|
| list wrapper | (none) | wrap items in `<div className="border-t border-border">` so the **first** row has a top hairline too (Factorial) |
| `<details>` | `faq-item group scroll-mt-28 border-b border-border` | keep (bottom hairline per row) |
| `<summary>` | `... py-4 font-heading text-base font-medium text-foreground ...` | `... py-4 font-heading text-lg font-semibold tracking-[-0.02em] text-foreground ...` (18/600) |
| chevron | `Add01Icon` + `.faq-chevron` (45° rotate) | **keep** (plus→x reads fine; preserves the motion-class semantics) |
| answer `<p>` | `pb-4 text-sm leading-relaxed text-muted-foreground` | `pb-5 text-base leading-relaxed text-muted-foreground` (16/400) |

**Motion**: chevron rotate (existing); panel reveals instantly (existing rationale — native details can't animate height cross-browser without JS; instant is snappier for low-frequency FAQ). No change.

### B.5 — Cert-tag chip — `cert-tag.tsx`

Restyle the hero-media overlay to Factorial's borderless white label-pill grammar. Testids/behavior frozen (AC-17).

| Element | Before | After |
|---|---|---|
| container | `... rounded-md border border-primary/25 bg-card/95 p-3 shadow-sm backdrop-blur-sm` | `... rounded-2xl bg-card/95 p-3 shadow-[var(--shadow-factorial)] backdrop-blur-sm` (drop border; soft layered shadow) |
| grade line | `font-heading text-sm font-semibold text-primary` | keep (DM Sans now) |
| meta line | `text-[10px] uppercase tracking-wide text-muted-foreground` | `text-[11px] tracking-[-0.02em] text-muted-foreground` — **remove `uppercase`** (AC-3) |

> Catalog grade badges (`product-card.tsx`) are **out of scope** — do not touch.

---

## PART C — Homepage page shell + per-section redesign

### C.0 — `Section` helper (pure white + Factorial rhythm) — `page.tsx`

Collapse `bg="muted"` alternation to pure white; apply the ~112px band family. Props/anchors unchanged.

```tsx
interface SectionProps {
  children: React.ReactNode;
  id?: string;
  padding?: "default" | "band";               // "band" = quiet brand strip (~40px)
  surface?: "white" | "gradient-band";         // gradient used on the calculator only
}

function Section({ children, id, padding = "default", surface = "white" }: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        surface === "gradient-band" ? "gradient-band" : "bg-background",
        id ? "scroll-mt-28" : undefined,
        padding === "band" ? "py-8 sm:py-10" : "py-10 sm:py-16 lg:py-28", // 40/64/112
      )}
    >
      <div className={CONTAINER}>{children}</div>
    </section>
  );
}
```

- **Remove the `bg` prop** at all 13 call sites (drop `bg="muted"`/`bg="background"`) — pure-white mandate (AC-7). Keep `id`, `padding`; add `surface="gradient-band"` on the **calculator** section only.
- `py-10 sm:py-16 lg:py-28` = 40/64/112 (Factorial rhythm, AC-14). `scroll-mt-28` (112px) clears the sticky header + topbar — keep.
- **Container unchanged**: `mx-auto max-w-(--breakpoint-xl) px-4 md:px-6 lg:px-8` (~approximates Factorial 1184/32; changing it risks reflow across the shared shell).
- **The two gradient moments** (AC-7): calculator band (below) + closing CTA banner (#10). Recipes:

```css
/* theme-storefront.css */
.gradient-band { background: var(--gradient-factorial); }
.gradient-banner { background: var(--gradient-factorial); }
```

Container width, anchors (`#catalogo #calculadora #proceso #impacto #garantia #empresas #cotizacion`), scroll-mt, props, and copy are **frozen** in every section below (AC-17/19). Only classes change. **Universal section-h2 recipe** (apply to every section heading): `font-heading text-2xl font-bold tracking-[-0.04em] leading-[1.15] text-foreground sm:text-[2rem]`.

### 1 — HomeHero — `home-hero.tsx`

No eyebrow (AC-3), big tight headline, soft-ink subcopy, orange pill + outline pill, stat row; media = white floating card on a whisper-tint canvas.

```
DESKTOP (lg, 2-col)
┌───────────────────────────────┬───────────────────────────────┐
│  Sillas que cuidan            │  ┌─────────────────────────┐   │  ← tint canvas
│  tu postura                   │  │   [hero image / glyph]  │   │     (--tint-green),
│  (h1 56/700 -0.04em, ink)     │  │   floating white card   │   │     radius-16, p-4/6
│  Subcopy 16/400 soft-ink      │  │   (.factorial-card)     │   │
│  ( Ver catálogo ) ( Empresas )│  │   [cert-tag chip]       │   │
│   orange pill     outline     │  └─────────────────────────┘   │
│  43%     50%     4.9          │  disclaimer 12/400 muted        │
└───────────────────────────────┴────────────────────────────────┘
```

| Element | Before | After |
|---|---|---|
| eyebrow `<p>` | `text-xs font-semibold uppercase tracking-wide text-primary` | **do not render** (Factorial has no eyebrow; keep the `eyebrow` prop in the interface + call so `page.tsx` is untouched; simply omit the element). No home test pins it visually. |
| h1 | `text-balance font-heading text-4xl font-bold tracking-tight text-primary sm:text-5xl lg:text-6xl` | `text-balance font-heading text-4xl font-bold tracking-[-0.04em] leading-[1.08] text-foreground sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]` (36→44→56, `-0.04em`, ink) |
| subtitle | `max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base` | `max-w-prose text-base leading-relaxed text-muted-foreground` |
| primary CTA | `variant="cta" size="xl"` | keep (pill via B.1) |
| secondary CTA | `variant="secondary" size="xl"` | `variant="outline" size="xl" className="pill-outline w-full sm:w-auto"` |
| media box | `aspect-[4/3] ... rounded-md border border-primary/30 bg-muted shadow-sm` | canvas wrapper `<div className="rounded-lg bg-[var(--tint-green)] p-4 sm:p-6">` around media `aspect-[4/3] w-full overflow-hidden rounded-md factorial-card` (white floating card, no border). **Keep `aspect-[4/3]`** on the inner media. Image `object-cover` + fallback glyph unchanged. |
| stats | `HeroStats` (see 1b) | restyle per B.3 |

**Responsive**: mobile single-col, copy then media, CTAs stack full-width pills (`w-full sm:w-auto` exists), stats 3-up. Left-aligned throughout. At 320px verify h1 36/`-0.04em` + `latin-ext` wraps cleanly (edge 5). Copy keeps `.enter-fade`. `priority` image unchanged.

### 1b — HeroStats — `hero-stats.tsx`

Naked numerals (no gray cards in the hero — the hero is airy and sits beside a tint canvas). Keep 3-tuple, `dl/dt/dd`, sr-only labels, index keys.

| Element | Before | After |
|---|---|---|
| `<dd>` numeral | `font-heading text-2xl font-bold tabular-nums text-primary sm:text-3xl` | `font-heading text-4xl font-bold tabular-nums tracking-[-0.04em] text-foreground sm:text-5xl` |
| label `<p>` | `text-xs text-muted-foreground` | `text-sm text-muted-foreground tracking-[-0.02em]` |
| wrapper | `grid grid-cols-3 gap-4 sm:gap-6` | keep |

### 2 — BrandBar — `brand-bar.tsx` (Factorial logo-bar)

24/700 claim line above muted wordmarks (no logos yet → wordmark names, data frozen). Static, no marquee (a marquee is new motion+JS, "no motion without purpose"; static wrap is reduced-motion-safe).

| Element | Before | After |
|---|---|---|
| label `<p>` | `max-w-2xl text-sm text-muted-foreground` | `max-w-2xl text-xl font-bold tracking-[-0.02em] text-foreground sm:text-2xl` (Factorial 24/700 claim line) |
| names `<li>` | `font-heading text-base font-semibold tracking-wide text-muted-foreground` | `font-heading text-base font-medium tracking-[-0.02em] text-muted-foreground` (16/500, drop wide tracking) |

`padding="band"` stays; centered.

### 3 — ValuesImpact — `values-impact.tsx` (feature cards + gray stat row)

| Element | Before | After |
|---|---|---|
| eyebrow `<p>` | `... uppercase ...` | **remove uppercase** → sentence-case label `text-sm font-medium text-muted-foreground tracking-[-0.02em]` (keep prop rendered) |
| h2 | `... text-2xl ... tracking-wide ...` | section-h2 recipe |
| subcopy | `text-sm ... sm:text-base` | `text-base leading-relaxed text-muted-foreground` |
| card `<li>` | `stagger flex flex-col gap-3 rounded-md border border-border bg-card p-5` | `stagger factorial-card flex flex-col gap-3 p-6` (keep `.stagger` + inline delay) |
| icon tile | `flex size-10 items-center justify-center rounded-md bg-secondary text-primary` | `flex size-11 items-center justify-center rounded-md bg-[var(--tint-green)] text-primary` |
| card title `<h3>` | `font-heading text-base font-semibold text-foreground` | `font-heading text-lg font-semibold tracking-[-0.02em] text-foreground` (18/600) |
| card body | `text-sm text-muted-foreground` | `text-base text-muted-foreground` |
| impact `<dl>` | `enter-fade grid ... gap-6 rounded-md bg-secondary p-6 text-center sm:grid-cols-3` | `enter-fade grid grid-cols-1 gap-4 sm:grid-cols-3` (remove shared bg) |
| impact figure cell | `flex flex-col gap-1` | `stat-card flex flex-col gap-2 p-6 text-center` |
| impact `<dt>` numeral | `font-heading text-2xl font-bold tabular-nums text-primary` | `font-heading text-4xl font-bold tabular-nums tracking-[-0.04em] text-foreground sm:text-5xl` (B.3) |
| impact `<dd>` label | `text-sm text-secondary-foreground` | `text-sm text-muted-foreground tracking-[-0.02em]` |

> Keep the frozen `dt`/`dd` tag inversion; only classes change. Keep `id="impacto"`, disclaimer, `.stagger`/`.enter-fade`.

### 4 — FeaturedProducts — `featured-products.tsx` (wrapper only)

**Do NOT touch `product-card.tsx`/`product-grid.tsx`** (AC-18). Restyle only the section header (via `HomeSectionHeader`, #11) + spacing. `ProductGrid` renders as-is. Keep `id="catalogo"`. When `products.length === 0` the section is omitted (edge 4) and the rhythm still reads correctly (each `Section` owns its padding).

### 5 — ProcessSteps — `process-steps.tsx`

| Element | Before | After |
|---|---|---|
| eyebrow | `... uppercase ...` | remove uppercase → sentence-case label |
| h2 | `... text-2xl ... tracking-wide ...` | section-h2 recipe |
| subcopy | `text-sm ...` | `text-base ... text-muted-foreground` |
| step number `<span>` | `font-heading text-4xl font-bold tabular-nums text-primary/25` | `font-heading text-5xl font-bold tabular-nums tracking-[-0.04em] text-primary/25 sm:text-6xl` (bigger, tighter, **stays quiet** — numbers carry sequence, NOT loud; do NOT make them orange, AC-9) |
| step title `<h3>` | `mt-2 font-heading text-base font-semibold text-foreground` | `mt-2 font-heading text-lg font-semibold tracking-[-0.02em] text-foreground` (18/600) |
| step body | `text-sm text-muted-foreground` | `text-base text-muted-foreground` |

Keep `id="proceso"`, `.stagger`, delays.

### 6 — B2BSection — `b2b-section.tsx`

Restyle chrome + the form's **container card** only. `quote-form.tsx` internals are shared with `/empresas` — do not edit (edge 10); its inputs inherit new tokens (acceptable shell inheritance).

| Element | Before | After |
|---|---|---|
| eyebrow | `... uppercase ...` | remove uppercase → sentence-case label |
| h2 | `... text-2xl ... tracking-wide ...` | section-h2 recipe |
| subcopy | `text-sm ...` | `text-base` |
| value `<li>` | `text-sm text-foreground` + check `text-primary` | `text-base text-foreground`; check icon → `text-[var(--ring)]` (brand-green check; icon+text) |
| segments text | `text-sm` | `text-base` |
| b2b stat `<dt>` | `font-heading text-2xl font-bold tabular-nums text-primary` | `font-heading text-3xl font-bold tabular-nums tracking-[-0.04em] text-foreground` (inline pitch stats, not the hero moment) |
| form container | `rounded-md border border-border bg-card p-5 sm:p-6` | `factorial-card p-6 sm:p-8` (white floating card, no border) |

Keep `id="empresas"`, `id="cotizacion"`, testids.

### 7 — SocialProof — `social-proof.tsx` (testimonial cards)

Factorial: white radius-16 shadow cards; quote 24/400 light (voice); name/role gray.

| Element | Before | After |
|---|---|---|
| h2 | `... text-2xl ... tracking-wide ...` | section-h2 recipe |
| card `<li>` | `stagger ... rounded-md border border-border bg-card p-6` | `stagger factorial-card ... p-6 sm:p-8` |
| quote `<p>` | `text-base text-foreground` | `text-xl font-normal leading-snug tracking-[-0.02em] text-foreground sm:text-2xl` (24/400 light) |
| quote icon | `QuoteUpIcon ... text-primary/40` | keep (quiet) |
| attribution + avatar | `text-sm text-muted-foreground`, `rounded-full bg-muted` | keep |

Keep `.stagger`, index keys, disclaimer.

### 8 — SavingsCalculator — `page.tsx` inline header + `savings-calculator.tsx`

The **only** gradient band besides the CTA banner. Set `surface="gradient-band"` on this Section; the calculator card floats white on it.

Inline header (`page.tsx`, calculator section):

| Element | Before | After |
|---|---|---|
| eyebrow `<p>` | `text-xs font-semibold uppercase tracking-wide text-primary` | **remove uppercase** → `text-sm font-medium text-muted-foreground tracking-[-0.02em]` |
| h2 | `font-heading text-2xl font-bold tracking-wide text-foreground sm:text-3xl` | section-h2 recipe |
| subcopy | `text-sm leading-relaxed text-muted-foreground sm:text-base` | `text-base leading-relaxed text-muted-foreground` |

`savings-calculator.tsx` (math + aria-live + testids frozen — AC-17):

| Element | Before | After |
|---|---|---|
| card container | `rounded-md border border-border bg-card p-6` | `factorial-card p-6 sm:p-8` (floats on gradient) |
| result `%` span | `price-value font-heading text-2xl font-bold tabular-nums text-primary` | `price-value font-heading text-4xl font-bold tabular-nums tracking-[-0.04em] text-foreground` (keep `.price-value` crossfade + `key`) |
| bar track / fill / labels | (already pill / green / sm) | keep |

**Do not touch**: `computeSavings`, `formatMXN`, keyed crossfade, `transform:scaleX` fill, `aria-live`, all `data-testid`s (tests pin `43%`/`50%`/aria-live).

### 9 — TrustFaq — `trust-faq.tsx` + FaqAccordion (B.4)

| Element | Before | After |
|---|---|---|
| eyebrow | `... uppercase ...` | remove uppercase → sentence-case label |
| h2 | `... text-2xl ... tracking-wide ...` | section-h2 recipe |
| guarantee check | `text-primary` | `text-[var(--ring)]` (brand-green check) |
| guarantee text | `text-sm text-muted-foreground`, lead `font-medium text-foreground` | `text-base text-muted-foreground`, lead `font-semibold text-foreground` |
| FAQ eyebrow `<p>` | `mb-2 font-heading text-base font-semibold text-foreground` | `mb-2 font-heading text-lg font-semibold tracking-[-0.02em] text-foreground` |
| FAQ rows | (card-less) | B.4 hairline recipe |

Keep `id="garantia"`, `.stagger`, slug IDs, native details a11y.

### 10 — CtaBanner — `cta-banner.tsx` (radius-32 gradient banner)

Biggest visible change: deep-green band → Factorial radius-32 gradient banner card, ink text, inset on white.

```
   ┌──────────────────────────────────────────────────┐  ← .gradient-banner, rounded-[2rem] (32px),
   │        Encuentra la silla que tu                 │     py-14 sm:py-20, centered
   │        cuerpo estaba esperando                   │  ← h2 32→40 /700 -0.04em, INK
   │        ( Ver catálogo )  ( Solicitar cotización )│  ← orange pill + outline pill
   └──────────────────────────────────────────────────┘
```

| Element | Before | After |
|---|---|---|
| container | `enter-fade rounded-lg bg-primary px-6 py-14 text-center text-primary-foreground` | `enter-fade gradient-banner rounded-[2rem] px-6 py-14 text-center text-foreground sm:py-20` |
| h2 | `... text-3xl font-bold tracking-wide text-primary-foreground sm:text-4xl` | `mx-auto max-w-2xl text-balance font-heading text-2xl font-bold tracking-[-0.04em] leading-[1.15] text-foreground sm:text-[2.5rem]` |
| primary CTA | `variant="cta" size="xl" ... focus-visible:ring-primary-foreground/60` | `variant="cta" size="xl" className="w-full sm:w-auto"` — **remove the light focus-ring override** (default green ring is now visible on the pastel band) |
| secondary CTA | `variant="secondary" size="xl" ... focus-visible:ring-primary-foreground/60` | `variant="outline" size="xl" className="pill-outline w-full sm:w-auto"` |

Sits inside `Section surface="white"` so the gradient shows as an inset rounded card on white (Factorial radius-32 CTA banner, AC-11). AA: ink over the lightest gradient stop ≈10:1 (PASS). Keep `.enter-fade`, testids.

### 11 — SectionHeader (shared) — `section-header.tsx`

Shared with `featured-brands` (`/marcas`). Restyle **only** type + link (no structural change) so `/marcas` inherits a font/size update but no page-level restyle (edge 3, acceptable).

| Element | Before | After |
|---|---|---|
| h2 | `font-heading text-2xl font-bold tracking-wide text-foreground sm:text-3xl` | section-h2 recipe |
| "Ver todas" link | `... text-sm font-medium text-muted-foreground ... hover:text-foreground` | keep behavior + `.link-arrow`; color `text-primary` (deep green, safely AA) with `hover:text-foreground`, 16/500 |

---

## PART D — Shell

### D.1 — SiteHeader — `site-header.tsx`

White sticky, 1px bottom hairline, no drop shadow, 500-weight sentence-case ink links, orange pill CTA.

| Element | Before | After |
|---|---|---|
| `<header>` | `sticky top-0 z-40 border-b border-border bg-background` | **keep** — already white sticky hairline, no shadow; new lighter `--border` reads as a true hairline ✔ |
| nav link | `nav-hover rounded-md px-3 py-2 text-sm font-medium text-muted-foreground ... hover:bg-accent hover:text-accent-foreground` | `nav-hover rounded-full px-3 py-2 text-base font-medium text-foreground tracking-[-0.01em] ... hover:bg-muted hover:text-foreground` (16/500 ink, pill hover) |
| header CTA | `variant="cta" size="sm" className="ml-1 hidden lg:inline-flex"` | keep — `cta` renders a pill (B.1); `size="sm"` keeps the compact nav-CTA height ✔ |
| wordmark / search / cart / toggle | inherit tokens | keep behavior; visuals inherit new radius |

**Sticky behavior**: keep as-is. Do NOT add Factorial's negative-top "utility scrolls away, main pins" trick (scroll-listener cost, marginal gain; Emil: animate only with purpose).

### D.2 — SiteTopbar — `site-topbar.tsx`

**Decision: keep deep-green** (`bg-primary`). It is a brand-identity promo band (shipping/installments/invoicing) that anchors above the white header; flipping to white would blur into the header hairline. Defensible deviation (reference topbar carries different content). Light restyle:

| Element | Before | After |
|---|---|---|
| container | `bg-primary text-primary-foreground` | keep |
| messages | `text-xs` | `text-xs tracking-[-0.02em]` |
| WA link | `text-xs font-medium` | keep |

> **Approval-gate fallback** (spec both; ship deep-green): if the owner wants the pure Factorial look, switch container to `border-b border-border bg-muted text-muted-foreground` and the WA link focus ring to `focus-visible:ring-ring`. Note this at review.

### D.3 — SiteFooter — `site-footer.tsx` (deep-green → WHITE Factorial footer)

Largest shell change. Flip to white, hairline-separated, 4-column Factorial footer. **Content frozen** (AC-15). Ripples to every page (edge 8, intended).

```
──────────────────────────────────────────────────────────  ← top hairline
  [Wordmark ink]   Blurb 14/400 muted   IG · LinkedIn · Facebook (ink, hover underline)
  Catálogo        Empresas        Compañía        Contacto   ← col titles 16/600 INK
  · link 16/500   · link          · link          · link     ← ink links, hover underline
──────────────────────────────────────────────────────────  ← hairline
  © 2026 …          Pagos: …          Privacidad · Términos   ← 12/400 muted
```

| Element | Before | After |
|---|---|---|
| `<footer>` | `mt-auto bg-primary text-primary-foreground` | `mt-auto border-t border-border bg-background text-foreground` |
| `LINK_CLASS` | `... text-primary-foreground/80 ... hover:text-primary-foreground focus-visible:ring-primary-foreground/60` | `nav-hover inline-flex rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring` |
| `HEADING_CLASS` | `font-heading text-xs font-semibold uppercase tracking-wide text-primary-foreground` | `font-heading text-base font-semibold tracking-[-0.02em] text-foreground` — **remove `uppercase`**, 16/600 ink |
| brand wordmark | `font-heading text-lg font-bold uppercase tracking-wide text-primary-foreground` (white-text wordmark; green field hid the SVG) | now on white → `font-heading text-lg font-bold tracking-[-0.02em] text-foreground` (**remove `uppercase`**; keep `data-testid="footer-wordmark"`). Optional upgrade: render `/brand/logo.svg` like the header (dev's choice; both AA). |
| blurb | `text-sm text-primary-foreground/90` | `text-sm text-muted-foreground` |
| bottom-bar border | `border-t border-primary-foreground/15` | `border-t border-border` |
| bottom text | `text-primary-foreground/70` | `text-muted-foreground` |

Keep every testid, href, `ExternalFooterLink` placeholder-guard, column structure, and the WhatsApp config-gate. AA: ink + muted on white pass (A.6).

> **Approval-gate flag**: this makes every storefront page's footer white immediately (analysis + AC-15 mandate). Call it out to the owner.

### D.4 — MobileNav — `mobile-nav.tsx` (restyle only; behavior/a11y frozen)

All logic frozen (Radix Dialog, FocusScope, scroll-lock, matchMedia `lg` close, forceMount transitions). Only classes:

| Element | Before | After |
|---|---|---|
| panel | `drawer-panel ... border-r border-border bg-card shadow-xl` | keep (white panel, hairline, slide) ✔ |
| `Dialog.Title` | `... font-heading text-base font-semibold uppercase tracking-wide text-foreground` | **remove `uppercase`** → `font-heading text-lg font-semibold tracking-[-0.02em] text-foreground` |
| nav item | `... rounded-md px-3 py-3 text-base font-medium text-foreground hover:bg-accent` | `... rounded-full px-3 py-3 text-lg font-medium text-foreground hover:bg-muted` (18px rows; pill hover) |
| CTA | `variant="cta" size="lg"` | pill (B.1) ✔ |
| cart link | `... rounded-md ... text-base` | `... rounded-full ... text-lg` |

Keep all testids, `onNavigate`, focus trap, `aria-modal`, `.drawer-*` motion.

### D.5 — WhatsAppButton — `whatsapp-button.tsx`

Already a `rounded-full` brand-green FAB with `.fab-pop` — Factorial-compatible and reads on white. **No change** (spec confirms it as-is).

### D.6 — LanguageToggle — `language-toggle.tsx` (light restyle; behavior frozen)

Behavior + `.toggle-*` motion frozen; inherits new radius/tokens. Optional: make the active segmented option `rounded-full` to echo the pill grammar (class-only, no behavior change). Keep `aria-pressed`, `useTransition`, never-disabled.

---

## PART E — Responsive behavior

| Breakpoint | Behavior |
|---|---|
| **320–639px (mobile)** | Single-column. Padding `py-10` (40px). h1 36 `-0.04em`; h2 32. Hero CTAs stack full-width pills. Hero stats 3-up; impact stat cards stack. FAQ rows full-width. Footer columns stack. Header = hamburger + logo (capped `max-w-[88px]` ≤320) + compact controls. **No h-scroll at 320 in es-MX** — verify hero h1, brand-bar names wrap, footer links wrap, no glyph clip. |
| **640–1023px (tablet)** | `sm`: padding `py-16` (64px); h1 44. Values 2-up; impact 3-up; footer 2-up. Header keeps the **compact/hamburger** pattern through the whole tablet range (T19 BUG-1, frozen) — drawer carries nav + CTA. |
| **1024px+ (desktop)** | `lg`: padding `py-28` (112px); h1 56. Values 4-up; process 4-up; b2b/trust 2-col; footer 5-col (brand col spans 2). Full inline header chrome (nav + search + segmented toggle + orange pill CTA). |

Container `max-w-(--breakpoint-xl)` + `px-4 md:px-6 lg:px-8` — unchanged.

---

## PART F — Motion specs (animation-vocabulary terms)

Factorial has **no scroll reveals**. Keep existing subtle entrances (reduced-motion-safe); add only the 100ms pill hover color swap. transform/opacity only, all CSS transitions (interruptible), enter uses `ease-out`.

| Element | Effect | Trigger | Property | Easing | Duration | Reduced-motion |
|---|---|---|---|---|---|---|
| Primary pill (CTA) | *Crossfade* (color) | hover | `background-color`, `border-color` | `ease` | 100ms | color kept, no transform |
| Any pressable button | *Press feedback* | `:active` | `transform: translateY(1px)` (`.cta-press`) | `ease-out` | ~120ms | dropped (existing RM rule) |
| Outline pill | *Crossfade* (bg tint) | hover | `background-color` | `ease` | 100ms | color kept |
| Nav link | *Hover effect* | hover | `background-color`, `color` (`.nav-hover`, `hover:hover` gated) | `ease` | 120ms | color only |
| Hero/banner copy | *Fade in* + rise (`.enter-fade`) | mount `@starting-style` | `opacity`, `translateY(8→0)` | `--ease-out` | 200ms | opacity only |
| Cards/grids | *Stagger* of *Fade in* + rise (`.stagger`) | mount | `opacity`, `transform` | `--ease-out` | 200ms, 50–60ms step | opacity only, delay 0 |
| FAQ chevron | *Rotate* (`.faq-chevron`) | `<details>` open | `transform: rotate(45deg)` | `ease` | ~200ms | acceptable (comprehension) / native |
| Calculator bars | *Reveal* via scaleX (`.calc-bar-fill`) | value change | `transform: scaleX()` | `--ease-out` | existing | snaps |
| Calculator numeral | *Crossfade* (keyed span, `.price-value`) | value change | `opacity` | existing | existing | snaps |
| Drawer | *Slide in* (`.drawer-panel`) | open/close | `transform: translateX()` | `--ease-drawer` | 300/200ms | opacity fade |
| FAB | *Pop in* (`.fab-pop`) | mount | `scale(0.95→1)`, opacity | `--ease-out` | 180ms | opacity only |

**No new keyframes, no scroll listeners, no marquee.** Hover effects that set `transform`/`bg` stay gated behind `@media (hover: hover) and (pointer: fine)`.

---

## PART G — Interaction flows

### G.1 — Primary CTA press
1. Hover → fill + border *crossfade* to lighter orange over 100ms (hover-capable only).
2. Pointer-down → `translateY(1px)` press nudge.
3. Release → navigates via `next-intl` `<Link>` (unchanged).
4. Keyboard: Tab focuses → `ring-2 ring-ring/30`; Enter/Space activates.

### G.2 — FAQ expand
1. Click/tap (or Enter/Space) a summary row → native `<details>` toggles; chevron *rotates* 45°; answer appears instantly below the hairline.
2. Deep-link `/#faq-envios` scrolls the row under the sticky header (`scroll-mt-28`). Frozen behavior.

### G.3 — Calculator (frozen)
1. Pick a model → bars *reveal* (scaleX), `%`/amount numerals *crossfade* (keyed), `aria-live` announces new savings. No reload/fetch.

### G.4 — Mobile nav (behavior frozen, restyled)
1. Tap hamburger → drawer *slides in* from left, scrim fades, focus trapped, scroll locked.
2. Tap a pill row → navigates + closes. Esc / outside-tap / cross to `lg` → closes.

---

## PART H — Accessibility checklist

- [ ] Focus rings visible on white ground (green ring on white; on the gradient banner the default green ring now works — remove the old white-ring overrides in cta-banner).
- [ ] Icon-only controls keep `aria-label` (hamburger, close, WhatsApp, search) — frozen.
- [ ] **Color never the only indicator**: check icons keep glyphs; FAQ chevron rotates; disabled footer links keep `aria-disabled` + opacity + cursor; cert chip keeps its label text.
- [ ] Tab order unchanged (class-only edits, no DOM reorder).
- [ ] `aria-live` on calculator results preserved.
- [ ] AA holds for every pair in A.6 (incl. both gradient surfaces — ink text only; no white-on-pastel, no white-on-orange).
- [ ] `prefers-reduced-motion`: no transforms on hover/entrance; existing RM rules cover drawer/FAB/stagger/enter-fade; new pill hover is color-only under RM.
- [ ] Sentence case everywhere (no `uppercase`).
- [ ] es-MX + en parity: `latin-ext` loaded; no clipped/overflowing glyphs at 320px.
- [ ] Keyboard: FAQ (native details), drawer (Radix), toggle (buttons), CTAs (links/buttons) operable — frozen.

---

## PART I — Design tokens used

- **Colors**: `--background` (white), `--foreground` (deep-green ink), `--muted`/`--muted-foreground` (gray card + body ink), `--card` (white), `--border` (hairline), `--primary`/`--primary-foreground` (deep green identity), `--ring` (brand-green checks/accents), `--secondary` (whisper-green tint), `--cta`/`--cta-foreground`/`--cta-hover`/`--cta-active` (orange pill), `--whatsapp`, and new `--tint-green`, `--tint-orange`, `--gradient-factorial`, `--shadow-factorial`.
- **Typography**: DM Sans 400/500/600/700 via `--font-dm-sans`. Scale: h1 56/44/36 · h2 32 · sub/quote 24 · h3/FAQ 18/600 · body 16/400 · nav/footer 16/500 · buttons 16/600 · small 14 · stat numerals 56/64. Tracking: headings `-0.04em`, small `-0.02em`, body `0`.
- **Spacing**: Factorial `4/8/16/24/32/40/64/80/112` → section rhythm `py-10 sm:py-16 lg:py-28` (40/64/112), card padding `p-6`/`p-8` (24/32).
- **Radius**: `--radius: 1rem` → cards `rounded-lg` (16), small info `rounded-md` (12), banner `rounded-[2rem]` (32), interactive `rounded-full`.
- **Shadows**: `--shadow-factorial` (layered triple) on floating cards only; flat cards/nav/footer have none.

---

## PART J — DESIGN.md amendment text (dev updates both artifacts)

Prepend this amendment to `DESIGN.md`, **above** the existing T19 amendment header:

```md
> **T20 AMENDMENT (2026-08-27) — Factorial design grammar supersedes the visual
> world (Phase A: homepage + shared shell).**
> The owner approved translating the Factorial (factorialhr.com/factorial-it)
> design grammar onto the storefront in OUR brand palette. This replaces the
> "Casa de Azulejo" world and the T19 serif/tinted-glaze presentation for the
> homepage + shell (Phase B extends it store-wide after approval). What holds:
>
> • TYPE: one geometric sans — DM Sans 400/500/600/700 (next/font, latin+latin-ext),
>   wired via a storefront-scoped `--font-dm-sans` (NOT `--font-sans`; admin keeps
>   Inter — firewall). Headings 700 / -0.04em / ~1.1 leading; body 400 / 1.5 /
>   soft-ink; small -0.02em. Sentence case everywhere — NO uppercase eyebrows,
>   NO serif. Libre Caslon Text no longer renders on the homepage/shell.
> • GROUND: pure white page (`--background: oklch(1 0 0)`). NO alternating section
>   backgrounds. Separation = 112/64/40px rhythm + tinted OBJECTS (flat gray
>   `--muted` cards, whisper-green/orange 8–12% tint canvases) + exactly TWO
>   50%-opacity gradient moments (calculator band + radius-32 CTA banner).
> • COMPONENTS: everything interactive is a PILL (`rounded-full`). Primary CTA =
>   solid orange #f95326 + 2px self-border + warm-brown fg (AA 5.30:1), hover =
>   lighter tint over 100ms, no scale/lift. Secondary = 2px ink-outline pill.
>   Floating cards = radius-16, borderless, layered triple soft shadow
>   (`--shadow-factorial`); flat stat/canvas cards = gray/tint, no shadow, no
>   border. Stat numerals = ~56/700/-0.04em, naked, in flat gray cards. FAQ =
>   bare hairline rows (no card). Nav + footer = white, 1px hairline, no drop
>   shadow; footer flips deep-green → WHITE (Factorial pattern).
> • COLOR DISCIPLINE: orange ONLY on primary CTAs (≤5/screen); brand green
>   #0f7f3c (`--ring`) on link accents + check icons; deep green #094220
>   (`--foreground`/`--primary`) is identity ink + chrome; everything else is
>   ink + white + whisper-tints. Brand palette + logo unchanged.
> • MOTION: restrained (Emil). NO scroll-reveal animations. 100ms hover color
>   swaps; existing `.enter-fade`/`.stagger`/`.fab-pop`/`.drawer-*` retained
>   (reduced-motion-safe); transform/opacity only.
> • FIREWALL: all of the above is scoped to `.theme-storefront` + `--font-dm-sans`
>   on `<html>`. `/admin` is untouched — Inter, neutral tokens, `rounded-md`.
> Canonical spec: `tasks/ui-design.md` (T20). The T19 amendment below remains the
> authority for the palette hex/oklch values and the CTA-token contract, which
> T20 preserves verbatim; read every T19 "tinted glaze / serif heading" reference
> as superseded by this Factorial grammar for the homepage + shell.
```

> The **direction-contract** (`src/components/layout/direction-contract.tsx`) is comment-only, no visual footprint — leave it unchanged. If dev finds a narrative string naming the old world, update the comment to point at this T20 amendment; otherwise no change.

---

## PART K — Test-impact list

| Test / check | Impact | Action |
|---|---|---|
| `src/app/css-line-count.test.ts` | globals.css → ~330; new `theme-storefront.css` (~180) | both < 600 ✔ — keep `theme-storefront.css` ≤ 180 |
| `brand-bar.test.ts` | asserts `BRAND_SEPARATOR` + both locales | class-only; **no impact** |
| calculator tests (`43%`/`50%`/aria-live) | numeral classes change; values/aria frozen | **no impact** — verify `calc-results`/`calc-select` intact |
| `hero.test.tsx` (`aspect-[4/3]`) | pins the **/empresas** shared `Hero`, not home-hero | out of scope; home-hero keeps `aspect-[4/3]` — **no impact** |
| tests pinning `uppercase` | AC-3 removes uppercase (cert-tag meta, values/process/b2b/trust eyebrows, footer headings + wordmark, mobile-nav title, calculator eyebrow) | **grep tests for `uppercase` first**; none expected — confirm before removing |
| `/admin` computed styles | must stay Inter, `rounded-md`, neutral tokens | **manual browser check** `/admin` + `/admin/login` (AC-5/6) — no DM Sans, no orange |
| `npm run test` / `lint` / `build` | strict TS, no `any`/`!`, ESLint max-lines | keep touched files < 400 target; largest touched (`mobile-nav` 323, `site-footer` 252, `b2b-section` 150) stay under caps — class edits don't grow line counts materially |
| Anchor resolution | `#catalogo #calculadora #proceso #impacto #garantia #empresas #cotizacion` | preserved on same elements + `scroll-mt-28`; **manual deep-link check** under the sticky header |
| 320px both locales | tight `-0.04em` + long es-MX | **manual responsive check** — no clip/overflow/h-scroll |
| Reduced-motion | pills snap color-only, no transforms | **manual check** with `prefers-reduced-motion: reduce` |
| Contrast (A.6) | new `--muted-foreground`, tints, gradient banner ink, green links | **AA check** on A.6 pairs before ship (esp. `--muted-foreground` on white + green-as-text) |

---

## Files touched (spec → dev)

**Create**: `src/app/theme-storefront.css`, `src/components/home/factorial-card.tsx`.
**Modify**: `src/app/fonts.ts`, `src/app/globals.css` (`.theme-storefront` + `@import`), `src/app/[locale]/layout.tsx`, `src/components/ui/button.tsx`, `src/app/[locale]/page.tsx`, home sections (`home-hero`, `hero-stats`, `cert-tag`, `brand-bar`, `values-impact`, `process-steps`, `b2b-section`, `social-proof`, `savings-calculator`, `trust-faq`, `faq-accordion`, `cta-banner`, `section-header`, `featured-products` wrapper), shell (`site-header`, `site-topbar`, `site-footer`, `mobile-nav`, `language-toggle`; `whatsapp-button` unchanged), `DESIGN.md` (amendment).
**Do NOT touch**: `admin/**`, `product-card.tsx`, `product-grid.tsx`, `home/hero.tsx`, `home/featured-brands.tsx`, `quote-form.tsx` internals, `:root`/`.dark` token blocks, `motion-*.css`, `nav-items.ts`, `direction-contract.tsx` logic.
