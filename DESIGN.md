<!-- impeccable:design-schema 1 -->
<!-- seed key: d43cafe8 · direction roll (mode: persuade) · assigned index 6 · fused challenger: architecture-places-azulejo-station-hall -->

# DESIGN — PosturPro

> The committed visual world for the **PosturPro storefront**. This document is written from the design decision that S3 (Dev) builds; the finish reviewer and documenter re-confirm it against the built world at ship. The `/admin` dashboard is explicitly **out of this world** — it keeps the neutral token/font system (see [The Admin Firewall](#the-admin-firewall)).

---

## Identity concept: **Casa de Azulejo** (The Tiled House)

PosturPro's storefront is composed like a **Mexican tiled hall** — the tin-glazed *azulejo/Talavera* tradition that clads Puebla's façades and colonial station halls. Cobalt-blue line-and-wash painting on milk-white glaze, narrative panels framed by scrolled tile borders, and a grout grid whose seams run straight and honest through every scene.

**Why this world, grounded in the three positioning pillars:**

1. **Ergonomics authority** — Talavera is a *measured, artisan* tradition: every panel is drawn deliberately, captioned in roman caps inside a cartouche, gridded to whole tiles. That precision is the visual argument for "these chairs are curated for how they treat your body." The world reads as *considered*, not clearance-bin.
2. **Multi-brand breadth** — a tiled hall is literally a **sequence of framed panels**. Brand bays, category scenes, and product grids map onto the tile grid with no strain: the composition *is* a curated floor of distinct, bordered rooms.
3. **Value for money** — the grout seam that "runs straight through every scene like a truth the painting admits" is the honesty of the world. No gloss, no luxury-boutique intimidation. It is premium the way good tilework is premium: durable, warm, and unmistakably **Mexican** — the shopper reads it as *ours*, not as an imported minimalist template.

**The category rut this refuses:** the e-commerce default (a white grid of product cards under a stock lifestyle hero with a "Comprar ahora" button) and its predictable opposite (the black-and-serif luxury-furniture boutique). PosturPro is neither: it is a **painted hall** where the chrome is tilework and the product photography is the *scene each tile frames*.

**The load-bearing rule that keeps this from clashing with real photography:** the tile world is the **frame**, never the fill. Chrome (nav, borders, buttons, captions, section dividers, empty-state panels) is cobalt-on-white tilework. Product and lifestyle **imagery lives inside cartouche frames** — a thin cobalt border with clipped corners around a full-color photo. Blue never fights the product; it *presents* it. When real photography swaps in for today's placeholders, it drops into the same framed slot and the world holds.

---

## Color

### Strategy

**Committed** — one saturated color (cobalt) carries 30–60% of the surface through borders, captions, buttons, tints, and section dividers. This is a **Persuade** storefront; the brief pins *premium + image-rich*, and the azulejo world is defined by its cobalt commitment. The ground is a milk-white glaze (a faint cool tint, not pure paper-white), which reads warmer and more crafted than `#fff`.

**Light only.** Physical scene: a mobile-heavy Mexican shopper, often on a phone at night, comparing chairs across browser tabs. A tiled hall is a *lit, glazed, daylight* space — cobalt-on-white is the world's native register. A dark azulejo does not exist; forcing one would abandon the identity. **The `.dark` block is decommissioned for the storefront** (see [Dark mode](#dark-mode-decommissioned)).

### Palette (repo oklch convention)

All values verified for WCAG AA against every pairing they are used in (see [Contrast](#contrast-guarantees)). Hex is an sRGB approximation for reference only; **oklch is authoritative**.

| Token | oklch | ~hex | Role |
| --- | --- | --- | --- |
| `--background` | `oklch(0.985 0.006 250)` | `#f7fafe` | Milk-white glaze ground (faint cool tint, not pure white) |
| `--foreground` | `oklch(0.28 0.09 258)` | `#072754` | Cobalt-ink — the "near-black-blue" body/brush ink |
| `--card` | `oklch(1 0 0)` | `#ffffff` | Glaze white — the painted tile face; cards sit *above* the ground |
| `--card-foreground` | `oklch(0.28 0.09 258)` | `#072754` | Cobalt ink on tile |
| `--popover` | `oklch(1 0 0)` | `#ffffff` | Same as card |
| `--popover-foreground` | `oklch(0.28 0.09 258)` | `#072754` | Cobalt ink |
| `--primary` | `oklch(0.42 0.16 262)` | `#1545a2` | **Cobalt deep** — the brand color; buttons, active panel, links |
| `--primary-foreground` | `oklch(0.985 0.006 250)` | `#f7fafe` | Glaze white on cobalt |
| `--secondary` | `oklch(0.93 0.03 250)` | `#d9eafc` | Cobalt-mist tint — secondary buttons, quiet fills |
| `--secondary-foreground` | `oklch(0.35 0.12 260)` | `#0f3778` | Deep cobalt on mist |
| `--muted` | `oklch(0.95 0.015 250)` | `#e7f0f8` | Pale glaze — image-slot backing, skeleton base, quiet zones |
| `--muted-foreground` | `oklch(0.47 0.07 258)` | `#425c82` | Muted cobalt-gray — captions, meta, compare-at price |
| `--accent` | `oklch(0.90 0.04 250)` | `#cbe1f8` | Hover fill, active nav tint |
| `--accent-foreground` | `oklch(0.35 0.12 260)` | `#0f3778` | Deep cobalt on accent |
| `--border` | `oklch(0.86 0.03 250)` | `#c3d3e4` | **Grout seam** — every border, divider, tile edge |
| `--input` | `oklch(0.86 0.03 250)` | `#c3d3e4` | Field borders (grout) |
| `--ring` | `oklch(0.42 0.16 262)` | `#1545a2` | Focus ring — cobalt, visible on the white glaze |
| `--destructive` | `oklch(0.55 0.20 27)` | `#cc2827` | Error / remove — Talavera brick-red |

### Reserved-accent + semantic-status tokens

Mustard is the azulejo world's **only sanctioned second color**, and only *inside border frames* — never as a field. It maps to the "value / highlight" role (a featured badge, a "mejor precio" cartouche seal), used sparingly.

| Token | oklch | ~hex | Role |
| --- | --- | --- | --- |
| `--gold` | `oklch(0.72 0.14 85)` | `#cd9c1f` | **Mustard accent** — featured/value seals *inside frames only*; decorative border ornament. Text on it uses `--gold-foreground`. |
| `--gold-foreground` | `oklch(0.28 0.09 258)` | `#072754` | Cobalt ink on mustard (5.87:1) |
| `--success` | `oklch(0.52 0.13 155)` | `#007e46` | Success semantics — discount applied, free-shipping achieved, order confirmed. **Promoted from the old hardcoded `emerald-*`.** |
| `--warning` | `oklch(0.55 0.13 70)` | `#a16100` | Warning / pending semantics — OXXO/SPEI pending, low-stock. **Promoted from the old hardcoded `amber-*`.** Darkened to clear AA-normal (4.77:1). |

**Semantic-color decision (edge 9):** the ~10 storefront files that hardcoded `text-amber-*` / `text-emerald-*` are **promoted to `--warning` / `--success` tokens**, applied consistently. Status remains **glyph + text** (color is never the only signal — colorblind-safe), and every status pairing meets AA. This retires the neutral world's raw amber/emerald so no old-world color clashes with cobalt. (Admin files that use amber/emerald are **out of scope** — firewall.)

### The WhatsApp FAB (AC-7)

The brand primary is now cobalt, not WhatsApp-green. To keep the FAB a **recognizable WhatsApp affordance**, it gets a dedicated token:

| Token | oklch | ~hex | Role |
| --- | --- | --- | --- |
| `--whatsapp` | `oklch(0.63 0.16 155)` | `#1fa855` | WhatsApp brand green — the FAB fill only |
| `--whatsapp-foreground` | `oklch(1 0 0)` | `#ffffff` | White glyph on green |

The FAB stops using `bg-primary` and uses `bg-[--whatsapp]` (a storefront-scoped token). It stays inside the world by wearing the same round tile-seal border and `.fab-pop` motion — a green tile in a blue hall, which is exactly how a real azulejo panel reserves one color for one figure.

### Contrast guarantees

All AA-verified (4.5:1 normal text, 3:1 large/UI). Representative pairings:

| Pairing | Ratio | Floor |
| --- | --- | --- |
| foreground / background | 14.10:1 | 4.5 ✔ |
| muted-foreground / background | 6.55:1 | 4.5 ✔ |
| muted-foreground / muted | 5.91:1 | 4.5 ✔ |
| primary-foreground / primary (button) | 8.37:1 | 4.5 ✔ |
| primary / background (link) | 8.37:1 | 4.5 ✔ |
| secondary-foreground / secondary | 9.38:1 | 4.5 ✔ |
| gold-foreground / gold | 5.87:1 | 4.5 ✔ |
| destructive / background | 5.15:1 | 4.5 ✔ |
| success / background | 4.95:1 | 4.5 ✔ |
| warning / background | 4.77:1 | 4.5 ✔ |

**Text over imagery (edge 5):** any text sitting over a photo (hero copy, lifestyle-band headline) sits on a **cobalt scrim** — a `bg-primary/85` → `bg-primary/40` gradient panel or a solid cobalt cartouche caption bar — with `--primary-foreground` (glaze white) text. That pairing is 8.37:1 regardless of the underlying photo's luminance, so AA holds even when an unknown real photo swaps into the slot. **No hero/band ever places raw dark-on-photo or light-on-photo without the scrim.**

---

## Typography

Faces chosen as **objects from the azulejo world**, in the Persuade register. The world's grammar: "captions brushed in **roman caps** inside cartouche frames." That is a broad, high-legibility roman with real weight — the lettering a tile-painter brushes, not a fashionable display serif.

### Pairing

| Role | Face | Loader | Why |
| --- | --- | --- | --- |
| **Display / heading** (`--font-heading`) | **Libre Caslon Text** | `next/font/google` | A warm, broad transitional roman with the brushed-caps character of painted tile captions and full Latin-Extended coverage. Set headings in **caps or small-caps with generous tracking** for section titles (the cartouche caption), sentence-case for sub-heads. Not on the impeccable "spent defaults" list; chosen for its *painted-roman* fit, a reason no workhorse sans satisfies. |
| **Body / UI** (`--font-sans`) | **Inter** (kept) | `next/font/google` | The incumbent body face stays — it is a neutral, highly legible UI workhorse that lets the cobalt world and the heading face carry the identity. Keeping it means zero admin-font risk and a bounded type bundle. Body register: normal case, comfortable leading. |
| **Numeric** | Inter `tabular-nums` | — | Prices/specs keep `tabular-nums` (AC-17) so cobalt price columns align like a ledger. |

**Division of labor:** identity lives in the **cobalt world + the roman-caps heading in cartouche frames**, not in a novelty body face. This keeps reading effortless on a phone at night (the real scene) while every section title announces itself as a painted panel caption.

### es-MX glyph coverage (edge 4, AC-5)

Both faces load with **`subsets: ["latin", "latin-ext"]`** — Latin Extended-A covers the ~160 accented occurrences in es-MX (`á é í ó ú ñ ¿ ¡ Á É Í Ó Ú Ñ`). `display: "swap"`. Verify on a Spanish-heavy heading (e.g. a category title containing "ñ"/"í" and a "¿…?" question) that no glyph falls back mid-word. Libre Caslon Text ships full Latin-Extended-A — confirmed coverage of the inverted marks and tilde-n.

### `--font-heading` binding (AC-5)

`--font-heading` stops aliasing `--font-sans`. It binds to the Libre Caslon Text variable **only under the storefront scope** (see firewall). Because `dialog.tsx` / `alert-dialog.tsx` consume `font-heading` and are shared with admin, the storefront-scoped binding means admin dialogs keep the sans heading; storefront dialogs get the roman. This is the firewall doing its job at the font seam.

### Type scale (mobile-first, fluid)

| Level | Face | Mobile | Desktop | Treatment |
| --- | --- | --- | --- | --- |
| Display (hero) | Heading | `text-4xl` | `text-6xl` | Roman caps or title-case, tight tracking, `text-balance` |
| H1 / page title | Heading | `text-3xl` | `text-4xl` | Cartouche caption style |
| H2 / section | Heading | `text-2xl` | `text-3xl` | Small-caps + `tracking-wide`, cobalt |
| H3 / card title | Heading | `text-lg` | `text-xl` | Sentence case |
| Body | Sans | `text-base` | `text-base` | `leading-relaxed`, `max-w-prose` on read surfaces |
| Meta / caption | Sans | `text-sm` | `text-sm` | `muted-foreground`, often `uppercase tracking-wide` for tile labels |
| Price | Sans | `text-lg`/`text-base` | — | `tabular-nums`, cobalt `foreground` |

---

## Spacing, radius, elevation

### Radius — the tile geometry

Talavera panels compose "by whole tiles, never fractional ones." The world's radius is **modest and consistent** — tiles have *slightly softened* corners, not pills.

| Token | Value | Note |
| --- | --- | --- |
| `--radius` | `0.375rem` (6px) | Down from `0.625rem`. Tile-crisp, not the create-next-app soft default. The derived `--radius-sm..4xl` scale (globals.css `@theme`) is preserved and re-derives automatically. |

Cartouche image frames use `--radius-md`; buttons and inputs `--radius` (`rounded-md`); large panels `--radius-lg`. **No fully-round chrome except the WhatsApp FAB and the cart-count dot** (round is a deliberate exception, a seal in a square-tile world).

### Spacing rhythm

Mobile-first. One spacing scale (Tailwind default), applied as a **tile rhythm**: section vertical padding `py-12` mobile → `py-16 lg:py-20`; **more space above a heading than below it** (`mt-16 mb-6` on section headers). Grid gaps map to grout: catalog grids use `gap-4` mobile → `gap-6` desktop (the visible grout between tiles). Container: `max-w-7xl px-4 sm:px-6 lg:px-8`.

### Elevation

The azulejo world is **flat glaze** — depth comes from the **grout-seam border + a faint cobalt-tinted shadow**, not from heavy Material shadows.

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | `border border-border` (grout) | Default tiles, cards at rest |
| Raised | `border border-border shadow-sm` (cobalt-tinted) | Cards on hover (`.card-lift`), sticky header |
| Floating | `shadow-lg` cobalt-tinted | WhatsApp FAB, mobile drawer, dialogs |

Shadow tint: use a cobalt-tinted shadow color (`--shadow-color` ≈ `oklch(0.42 0.16 262 / 0.12)`) so shadows read as glaze depth, not gray. Where Tailwind's default gray shadow is used, it is acceptable but the tinted variant is preferred on the signature surfaces (hero cartouche, FAB, cards).

---

## Imagery art direction

The direction for **every image slot** — so today's placeholders and tomorrow's real photography follow one look.

### The cartouche frame (the universal image container)

Every photo — product, lifestyle, brand, showroom — sits inside a **cartouche**: a full-color image with a **thin cobalt (`border`/`primary`) border, `--radius-md` corners, and a `bg-muted` backing** that reserves the aspect box before load. Optional: a small cobalt caption bar along the bottom edge (`bg-primary text-primary-foreground`, roman-caps label) for lifestyle bands — this is the "painted cartouche naming the scene" and also the AA scrim for any overlaid text.

### Composition & lighting (what premium chair-retail imagery looks like here)

- **Subject:** one chair, or one furnished workspace, decisively composed — "one decisive photo beats five mediocre ones." The chair is the hero of its frame, three-quarter view, showing the ergonomic silhouette (lumbar curve, armrest, base).
- **Lighting:** bright, even, **daylight** — matching the glazed, lit hall. Soft shadows, no moody low-key. Premium here = *clear and considered*, not dramatic.
- **Tone / grade:** neutral-to-cool white balance so product photos sit harmoniously beside the cobalt chrome. Backgrounds are clean (studio white, or a real Mexican interior with cool daylight). Avoid warm orange casts that fight the blue world.
- **Framing consistency:** products at `4/5` portrait (catalog), heroes/lifestyle at `4/3` or `16/9`, brand marks at `3/2`. Consistent framing so a grid of tiles reads as one painted wall.
- **What to avoid:** stock-photo clichés (thumbs-up office workers), fabricated proof (no invented testimonials/logos), heavy filters, and any photo whose luminance would break the overlay scrim without the cobalt caption bar.

### Placeholder posture (AC-9, PRODUCT.md hard rule)

**No real imagery exists.** Every slot defaults to `null` and degrades to a **token-styled tile placeholder**: a `bg-muted` panel with a centered cobalt line-glyph (`@hugeicons` Chair / Building / Image) at `text-muted-foreground/40`, inside the same cartouche frame and aspect box. These placeholders look **intentional and premium even with all assets null** — a hall of blank white tiles "awaiting their painter" is *native to the azulejo world*, not a broken state. When placeholders are generated (via `generate-image.mjs` when available) or licensed stock is used, any image a visitor could mistake for real proof is structured/labeled as placeholder. **Zero fabricated testimonials, customer names, review counts, sales figures, or press — ever.**

---

## Per-surface application rules

The world applies **storefront-wide**; these are the surface-specific rules. (Exact class/token diffs and the slot list live in `tasks/ui-design.md`.)

- **Homepage** — the hall's entrance. Hero is a **cobalt cartouche**: roman-caps display headline over a `bg-primary` scrim panel beside/over the hero image slot, primary CTA button, `.link-arrow` secondary. Below: a **featured-products tile wall**, a **new editorial "ergonomics" band** (a wide cartouche lifestyle slot + a short posture-authority claim, no fabricated proof), and a **featured-brands panel** (brand marks as framed tiles). Scroll pacing: dense grid → quiet editorial band → dense brand grid, one grammar.
- **Catalog / PLP** (`/sillas`, `/marcas`, `/categorias`, `/estilos` + `[slug]`) — the tile wall. Product cards are cartouche tiles on the glaze ground, grout-gap grid. Toolbar/filters are a cobalt-chrome panel. **Grid `gridTemplateColumns` structure preserved** (e2e-asserted). Index tiles (brand/category/style) are framed painted panels with a cobalt-caption label.
- **PDP** (`/producto/[slug]`) — the featured panel. Gallery = a large cartouche with thumbnail tiles; purchase panel = a cobalt-bordered "spec cartouche" with price (`tabular-nums`, cobalt), stock badge (glyph+text), CTA. Specs table reads like a measured ledger. **Compare-at `line-through` preserved** (e2e-asserted). Q&A and recently-viewed as quiet tile rows.
- **Cart** (`/carrito`) — a ledger tile. Line items in grout-ruled rows; **free-shipping progress** uses `--success` (promoted from emerald), glyph+text.
- **Checkout** (`/checkout` + `/checkout/confirmacion/[token]`) — calm and honest (PRODUCT.md: "cash is not an edge case"). OXXO/SPEI **pending** states use `--warning` (promoted from amber) with glyph+text — a *calm painted panel*, never an error red. Order summary uses `--success` for affirmatives. Confirmation is a celebratory-but-restrained cobalt cartouche.
- **9 static pages** (incl. contact, showroom) — Read register. `StaticPageBody` in a `max-w-prose` column, roman-caps H2 section headers as tile captions, cobalt links. Showroom map slot degrades to a cobalt pin-glyph tile when null. Contact form fields on grout borders; honeypot **off-screen `left` preserved** (e2e-asserted).
- **Persistent chrome** — header: cobalt wordmark (roman-caps small), grout bottom-border, `.nav-hover` items with cobalt-accent active tint. Footer: grout top-border, tile-column link groups, cobalt links. Mobile drawer: cobalt-chrome sheet, `.drawer-*` motion. WhatsApp FAB: `--whatsapp` green seal.
- **404 / error** — a "blank tile / lost panel" empty state in the cobalt world, testids preserved. `global-error.tsx` stays the **intentional token-free exception** (hardcoded system-ui, edge 8) — not restyled.

---

## The admin firewall

**Binding (AC-11/12).** The `/admin` subtree must render **exactly as before** — neutral tokens, Inter, unchanged. The mechanism, given that admin is a **parallel root layout** (`src/app/admin/layout.tsx`, not nested under `[locale]`):

1. **Tokens are storefront-scoped, not global.** The neutral `:root` (+ `.dark`) block stays as admin's world. The azulejo palette is defined on a **storefront scope class** — `.theme-storefront` — applied to the storefront `<body>` (in `src/app/[locale]/layout.tsx`). All cobalt token values live under `.theme-storefront { … }` in `globals.css`. Admin never gets the class, so admin resolves the untouched neutral `:root`.
2. **The display font is storefront-scoped.** `--font-heading` binds to Libre Caslon Text only under `.theme-storefront`. The shared `sans` export is unchanged (admin + `not-found.tsx` still get Inter). The new heading variable is attached at the storefront body, not the shared `<html>` seam.
3. **Shared `ui/*` primitives are never restyled.** `button`, `badge`, `alert-dialog`, `dialog`, `tabs` keep flowing through tokens. They *inherit* the cobalt world under `.theme-storefront` automatically and stay neutral under admin — no primitive file is edited for brand looks. Any storefront-only treatment is applied at the call-site, not baked in.

**Verification:** screenshot `/admin/login` and one authed admin page before and after; palette and font must be pixel-identical. No file under `src/app/admin/` or `src/components/admin/` is edited.

---

## Dark mode (decommissioned)

The azulejo world is **light-only** by identity (a tiled hall is a lit, glazed space). The storefront **decommissions `.dark`**: no storefront surface triggers `.dark`, and `.theme-storefront` defines only the light cobalt world. The existing neutral `.dark` block is **left intact for admin's `:root` world** (admin is unchanged and does not opt into a storefront dark theme either) — it is simply never activated on the storefront. This avoids shipping half-migrated neutral dark values on any cobalt surface. Documented so a reviewer does not flag the retained `.dark` block as stale (it belongs to the untouched admin/`:root` world).

---

## Motion (unchanged — Emil authority)

**Impeccable owns look; Emil owns motion.** The entire shipped motion layer (`.enter-fade`, `.stagger`, `.card-lift`, `.link-arrow`, `.gallery-image`, `.cart-*`, `.drawer-*`, `.dialog-content-motion`, `.fab-pop`, `.nav-hover`, easing tokens `--ease-out`/`--ease-in-out`/`--ease-drawer`) is **preserved verbatim**. It is already `transform`/`opacity`-only, `ease-out` on enter, `prefers-reduced-motion`-gated, and hover-capability-gated. The reskin recolors and reframes; it does not touch motion. Any new motion the world implies (e.g. a cobalt-wash fill on a section divider) must obey the same rules: `transform`/`opacity` only, `ease-out` enter, RM-gated — and is optional polish for S3, not required by this world.

---

## Design tokens summary (what the "Brand Tokens" block in globals.css documents)

- **New/changed values:** all `--background/foreground/card/primary/secondary/muted/accent/border/input/ring/destructive` swapped to the cobalt palette; `--radius` → `0.375rem`; `--font-heading` → Libre Caslon Text (storefront-scoped).
- **New tokens:** `--gold`/`--gold-foreground`, `--success`, `--warning`, `--whatsapp`/`--whatsapp-foreground`, `--shadow-color` (cobalt-tinted).
- **Scope:** all storefront brand tokens under `.theme-storefront`; neutral `:root` retained as admin's world.
- **Swap seam preserved (AC-4):** editing only the `.theme-storefront` values (+ the font binding) re-skins the entire storefront with zero component color edits.
