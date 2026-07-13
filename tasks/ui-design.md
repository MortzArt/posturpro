# UI Design: T6 — Cart

> Stage 3 (ui-design) artifact for the standard pipeline. Feeds Dev (Stage 4).
> Taste authority: `.claude/skills/emil-design-eng`, `.claude/skills/apple-design`.
> Motion terms use `.claude/skills/animation-vocabulary`.

---

## Design Principles for This Feature

1. **Invisible correctness over flourish.** The cart is a utility surface a shopper
   passes through on the way to buying. It must feel instant, never surprise, and get
   out of the way. Restraint (Apple §16 Simplicity) beats delight here — the only
   place delight is earned is the "added ✓" confirmation and the free-shipping unlock.
2. **No layout shift, ever.** The header badge and the cart page body are
   null-until-hydrated islands (mirror `RecentlyViewed`). The pre-hydration state
   reserves exactly the space the hydrated state will occupy, so hydration is a
   cross-fade of a value, never a reflow.
3. **Neutral system, not a new theme.** Reuse existing tokens (`bg-card`,
   `text-muted-foreground`, `border-border`, `--radius`, `--ease-out`) and the
   existing `StockBadge` / `formatMXN` / `.price-value` patterns verbatim. Invent
   nothing new visually.
4. **Money is sacred.** Every peso goes through `formatMXN(cents)`; all math is integer
   cents. `tabular-nums` on every number so digits never shift (line totals, subtotal,
   the "you're $X away" copy) — Apple §15, animation-vocabulary "Tabular numbers".
5. **Touch-first, 44px minimum.** shadcn `Button` defaults are tiny (`lg` = h-8/32px).
   The cart's interactive controls (stepper buttons, remove, checkout CTA, add-to-cart)
   override to **≥ 44px** hit targets, matching the T5 facet fix and `mobile-nav`'s
   `size-11`.
6. **Motion is purposeful and gated.** Only `transform`/`opacity` animate. Enter uses
   `ease-out`. Everything respects `prefers-reduced-motion` (already wired in
   `globals.css`). No animation on high-frequency actions (stepper +/− is instant).

---

## Reused Assets (do not rebuild)

| Asset | Path | Use in cart |
| --- | --- | --- |
| `StockBadge` | `src/components/catalog/stock-badge.tsx` | Out-of-stock marker on a cart line + reuse its `"out"` styling grammar |
| `formatMXN(cents)` | `src/lib/money.ts` | Sole cents→string boundary for every price |
| `Button` | `src/components/ui/button.tsx` | Add-to-cart, remove (ghost), checkout CTA — **with explicit height override for touch** |
| `Badge` | `src/components/ui/badge.tsx` | Header count pill (`variant="default"`, size override) |
| `Input` | `src/components/ui/input.tsx` | Stepper numeric field (read-mostly; centered) |
| `.price-value` | `globals.css` | Crossfade a line total / subtotal when it changes |
| `.stagger` | `globals.css` | Line-row entrance cascade on the cart page |
| Null-until-hydrated island | `src/components/product/recently-viewed.tsx` | Pattern for badge + cart body (`useState<T|null>(null)`, mount `useEffect`, `null` return until set) |
| Locale-aware `Link` | `@/i18n/navigation` | Badge → `/carrito`, empty CTA → `/sillas`, checkout CTA → `CHECKOUT_PATH` |
| Motion tokens | `--ease-out: cubic-bezier(0.23,1,0.32,1)` | Enter easing for badge count + confirm |
| `interpolate()` | `src/lib/interpolate.ts` | Fill `{amount}`/`{count}` templates client-side |

**Tokens available:** `--background --foreground --card --card-foreground --primary
--primary-foreground --secondary --muted --muted-foreground --accent --border --input
--ring --destructive`; radii `--radius(-sm/-md/-lg/-xl)`; easings `--ease-out
--ease-in-out --ease-drawer`. Existing motion helper classes: `.price-value`
(opacity crossfade), `.stagger` (opacity + translateY entrance), `.card-lift`
(hover/press), all reduced-motion-gated already.

---

## Component Inventory

### 1. CartCountBadge (header island)

**Purpose**: A live count of total items in the cart, linking to `/carrito`. First
proof the provider works end-to-end.
**Location**: Header right-cluster (`site-header.tsx`, the `ml-auto flex shrink-0
items-center gap-1 md:ml-2` div, ~line 85), placed **before** the language toggles so
order is `[Search] [Cart] [Lang]`. Also linked from `mobile-nav`.
**shadcn base**: `Badge` (`variant="default"`) for the count pill; a locale-aware
`Link` wrapping a `@hugeicons` `ShoppingCart01Icon`. No `Button` (it's a link).

**Layout** (ASCII wireframe):
```
 Hydrated, count > 0            Hydrated, count = 0        Pre-hydration (SSR)
┌───────────────┐             ┌───────────────┐          ┌───────────────┐
│   🛒 ⌈3⌉       │             │      🛒        │          │      🛒        │
│   └badge┘     │             │  (no badge)   │          │  (no badge)   │
└───────────────┘             └───────────────┘          └───────────────┘
 44x44 tap area                44x44 tap area             44x44, inert*
```
\* Pre-hydration renders the **icon only** (no number) inside the same 44×44 box, so
the box's width never changes when the count fades in. Anti-layout-shift contract:
the count pill is an **absolutely-positioned overlay** on the icon box, never a flex
sibling, so it never participates in header flex sizing.

```
 Icon box (relative, size-11 = 44x44):
 ┌──────────────┐
 │           ┌──┐│  ← count pill: absolute -top-0.5 -right-0.5,
 │      🛒    │3 ││    min-w-[1.25rem] h-5 rounded-full,
 │           └──┘│    bg-primary text-primary-foreground text-[0.625rem]
 └──────────────┘    tabular-nums px-1, ring-2 ring-background (cutout look)
```

**Props**:
```typescript
interface CartCountBadgeProps {
  /** Recommended: island uses useTranslations("cart") to stay self-contained
   *  (matches mobile-nav). No props required. */
  className?: string;
}
```
Internally reads `const { itemCount, hydrated } = useCart();`.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Pre-hydration | Cart icon only, no pill, 44×44 box | Renders before `hydrated`; `aria-label` = plain "Carrito" (no count claim); inert `Link` to `/carrito` still works |
| Hydrated, empty (0) | Cart icon, no pill | `aria-label` = "Carrito, 0 artículos"; link active |
| Hydrated, count 1–99 | Icon + pill with number | Pill **Scale in** (opacity 0→1 + `scale(0.9→1)`, `ease-out`, 160ms) on first appearance; on subsequent count change the number crossfades via `.price-value` keyed on `itemCount` |
| Total > 99 | Pill shows `99+` | Per-line cap is `MAX_CART_ITEM_QUANTITY`; the summed total can exceed 99 |
| Hover (pointer:fine) | Subtle `bg-muted` rounded on the box | `nav-hover`-style; gated behind `@media (hover:hover) and (pointer:fine)` |
| Focus | `focus-visible:ring-2 ring-ring` on the link | Keyboard reachable in header tab order |
| Active/press | `active:translate-y-px` (button-press feel, from base) | Instant feedback (Apple §1) |

**Responsive**:
| Breakpoint | Layout Change |
| --- | --- |
| < 640px | Same 44×44 icon+pill; sits in header cluster; also mirrored as a labeled link inside `mobile-nav` (icon + "Carrito (3)") |
| 640–1024px | Unchanged |
| > 1024px | Unchanged |

**Animations**:
- Mount (first count appears): **Scale in** — pill `opacity: 0; transform: scale(0.9)`
  → `opacity: 1; transform: scale(1)`, `--ease-out`, **160ms**. Trigger: `itemCount`
  0→>0 after hydration. (Never `scale(0)` — emil.)
- Count change (e.g. 2→3): **Crossfade** the number via `.price-value` (keyed on the
  value), ~150ms opacity, no movement. A full "Number ticker" is intentionally NOT
  used — the header is seen on every page (emil frequency rule → keep subtle).
- Exit (count →0): pill **Fade out** opacity 1→0, 120ms (exit faster than enter). Icon
  stays.
- Reduced motion: no scale, opacity-only fade at 120ms; count changes swap instantly.
- Property discipline: `transform`/`opacity` only.

**A11y**:
- The `Link` has `aria-label={interpolate(badgeLabel, { count })}` →
  "Carrito, 3 artículos". Pre-hydration: plain "Carrito".
- The pill number and the icon are `aria-hidden` (the label already announces count).

---

### 2. AddToCartButton (PDP island)

**Purpose**: Adds the currently-selected variant (or variant-less product) to the cart
at qty 1, with an inline transient confirmation. **No mini-cart drawer** (spec SKIP) —
confirmation is this button's own state + the header badge increment.
**Location**: Inside `ProductPurchasePanel`'s `flex flex-col gap-4` container, as the
**last** child (after `VariantSelector` / `StockBadge`). Full width of the panel column.
**shadcn base**: `Button variant="default"`, **height override to `h-11` (44px)** and
`w-full`, `text-sm`. (Default `lg` is only 32px — too small for the primary buy action.)

**Layout** (ASCII wireframe):
```
 Idle (in stock)                    Confirming (transient)           Out of stock
┌─────────────────────────────┐    ┌─────────────────────────────┐  ┌─────────────────────────────┐
│    Agregar al carrito       │    │        Agregado ✓           │  │          Agotado            │
└─────────────────────────────┘    └─────────────────────────────┘  └─────────────────────────────┘
 bg-primary, h-11, w-full           same size, content crossfades      disabled, muted look
```
The button never changes size between states (fixed `h-11 w-full`) — only its inner
content crossfades, so there is no layout shift on confirm (emil: content swaps, box
stays; blur-mask the crossfade).

**Props**:
```typescript
interface AddToCartButtonProps {
  /** Snapshot fields threaded from ProductPurchasePanel selection state. */
  productId: string;
  slug: string;
  name: string;
  variantId: string | null;        // null when product has no variants
  variantLabel: string | null;     // e.g. "Negro"; null when no variant
  unitPriceCents: number;          // effectivePriceCents(selectedVariant, base)
  coverImageUrl: string | null;
  sku: string | null;
  /** True when the selected variant/product stock is 0. */
  outOfStock: boolean;
  /** Pre-resolved labels (panel keeps its "no client i18n" invariant; pass as props). */
  labels: {
    addToCart: string;   // "Agregar al carrito"
    added: string;       // "Agregado ✓"
    outOfStock: string;  // "Agotado"
  };
  className?: string;
}
```
Internally: `const { addItem, hydrated } = useCart();` + local `confirming` state with a
timeout of `ADD_TO_CART_CONFIRM_MS`.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Pre-hydration | Button rendered but `disabled` + `aria-disabled`, label = addToCart | No `useCart` write until `hydrated`; prevents SSR add + count flash. Same size as idle (no shift) |
| Idle / in stock | `bg-primary text-primary-foreground`, "Agregar al carrito" | Click → `addItem(snapshot)` (functional update, coalesces rapid clicks), enter confirming |
| Confirming | Content crossfades to "Agregado ✓" (`Tick02Icon`/`CheckmarkCircle02Icon`) | Reverts after `ADD_TO_CART_CONFIRM_MS` (~1500ms). Re-click during confirm re-adds (increments) and resets the timer — interruptible |
| Out of stock | `disabled`, muted look, "Agotado" | `disabled` + `aria-disabled="true"`; click is a guarded no-op |
| Press (enabled) | `active:scale-[0.98]` | Instant press feedback |
| Focus | `focus-visible:ring-2 ring-ring` | Enter/Space activate |

**Responsive**:
| Breakpoint | Layout Change |
| --- | --- |
| < 640px | Full width of the single column; `h-11`; below variant selector |
| 640–1024px | Unchanged (panel is right column at `lg`) |
| > 1024px | Full width of the panel's right column |

**Animations**:
- Confirm transition (idle ⇄ confirming): **Crossfade** the label with a light
  **blur mask** (emil "blur to mask imperfect transitions"): outgoing
  `opacity 1→0, filter blur(0→2px)`; incoming `opacity 0→1, blur 2px→0`, both
  `--ease-out`, **180ms**. Two absolutely-stacked spans inside the fixed button box.
- Press: `transform: scale(0.98)` on `:active`, `100ms ease-out` (feedback, applies on
  touch + pointer).
- No entrance animation (always present on the PDP).
- Reduced motion: label swaps with opacity-only crossfade (no blur, no press scale)
  at 150ms.
- Interruptible: re-click during confirm resets the timer and re-runs the crossfade
  from the presentation value (CSS transition, not keyframe).

**A11y**:
- On successful add, announce via the cart's shared page-level `aria-live="polite"`
  region → "Agregado al carrito. {n} artículos." (On the PDP, if no page-level region
  exists, the button owns a visually-hidden `aria-live` sibling.)
- Out-of-stock: `disabled` + "Agotado" text (color is not the only signal).

---

### 3. QuantityStepper

**Purpose**: Increase/decrease a line's quantity within `[1, MAX_CART_ITEM_QUANTITY]`.
**Location**: Inside each `CartLineRow`.
**shadcn base**: two `Button variant="outline"` icon buttons + a center `Input`
(read-mostly numeric). Heights overridden to **44px** on touch.

**Layout** (ASCII wireframe):
```
 Mid-range (2..98)          At min (1)                 At cap (99)
┌────┐┌────┐┌────┐         ┌────┐┌────┐┌────┐          ┌────┐┌────┐┌────┐
│ −  ││  3 ││ +  │         │ −  ││  1 ││ +  │          │ −  ││ 99 ││ +  │
└────┘└────┘└────┘         └────┘└────┘└────┘          └────┘└────┘└────┘
 both enabled               [−] disabled                [+] disabled
 44x44   44w   44x44        (use Remove to delete)      (cap reached)
```
Group has `rounded-md border border-border overflow-hidden`, buttons share edges.
Center is a fixed-width (`w-11`) `tabular-nums text-center text-sm`, `readOnly` by
default. `Minus`/`Plus` icons via `@hugeicons` (`MinusSignIcon`/`PlusSignIcon`).

**Props**:
```typescript
interface QuantityStepperProps {
  value: number;                    // current line quantity (already 1..MAX)
  min?: number;                     // default 1
  max: number;                      // MAX_CART_ITEM_QUANTITY
  onChange: (next: number) => void; // parent clamps + persists
  labels: {
    increase: string;              // "Aumentar cantidad"
    decrease: string;              // "Disminuir cantidad"
    quantityLabel: string;         // "Cantidad"
  };
  disabled?: boolean;              // e.g. before hydration
  className?: string;
}
```

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Default | Both buttons enabled | `+` → `onChange(min(value+1, max))`; `−` → `onChange(max(value-1, min))`; coalesced upstream via functional updates |
| At min (value === min) | `−` `disabled` (`opacity-50`) | Below min impossible via stepper (AC-7); removal is the separate Remove control |
| At cap (value === max) | `+` `disabled` (`opacity-50`) | AC-13; `aria-disabled` set |
| Disabled (pre-hydration) | Whole group `opacity-50 pointer-events-none` | No mutation before hydrated |
| Focus | Each button `focus-visible:ring-2 ring-ring` | Tab reaches `−`, field, `+` in order |
| Press | `active:scale-[0.97]` on each button | Instant feedback |

**Responsive**:
| Breakpoint | Layout Change |
| --- | --- |
| < 640px | 44×44 buttons + 44px center → ~132px; fits at 320px alongside remove below the row details |
| 640–1024px | Same control; may sit inline-right of details |
| > 1024px | Same; inline in the row grid |

**Animations**:
- **None on +/−.** High-frequency tap/keyboard-repeatable action (emil frequency table
  → "no animation"). The value swap is instant; the *line total* it drives crossfades
  via `.price-value` — that is the only motion.
- Press feedback `scale(0.97)` at 90ms `ease-out` is the sole micro-motion.
- Reduced motion: press scale removed; everything instant.

**A11y**:
- Each button is an icon button with a real `aria-label` (`increase`/`decrease`).
- Center field: `<input readOnly inputMode="numeric" aria-label={quantityLabel}
  value={value}>`. Quantity changes announced by the page's `aria-live` region, not
  per-keystroke.
- If the field is made editable (optional): sanitize on `blur`/`Enter` via
  `sanitizeQuantity` (clamp `[1,MAX]`, non-integer reverts), never per keystroke.

---

### 4. CartLineRow

**Purpose**: One cart line — image, name, variant/color, unit price, stepper, remove,
line total.
**Location**: Inside `CartPageClient`'s line list (`<ul>`).
**shadcn base**: none for the shell; uses `QuantityStepper`, a ghost `Button` for
remove, `StockBadge` (`state="out"`) when the snapshot is flagged out of stock.

**Layout — mobile (< 640px)** (ASCII wireframe):
```
┌───────────────────────────────────────────────┐
│ ┌──────┐  Silla Ergonómica Pro                 │  ← name (line-clamp-2), Link to PDP
│ │      │  Color: Negro                          │  ← variant label (muted)
│ │ img  │  $4,999.00 c/u                         │  ← unit price (muted, "c/u"=each)
│ │ 4:5  │                                        │
│ └──────┘  ┌────┐┌──┐┌────┐        [Eliminar]   │  ← stepper + remove (44px)
│           │ −  ││ 3││ + │                       │
│           └────┘└──┘└────┘                      │
│                           Total: $14,997.00     │  ← line total (right, price-value)
└───────────────────────────────────────────────┘
 image w-20 (80px) / w-24 at sm, rounded-lg bg-muted, aspect-[4/5]
```

**Layout — tablet/desktop (≥ 768px)** (ASCII wireframe):
```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌──────┐  Silla Ergonómica Pro                                          │
│ │ img  │  Color: Negro          [− 3 +]      $4,999.00 c/u   $14,997.00  │
│ │ 4:5  │  (out-of-stock badge)                                [Eliminar]│
│ └──────┘                                                                 │
└────────────────────────────────────────────────────────────────────────┘
 grid: [96px image] [1fr details] [stepper] [unit price] [line total]
```

**Props**:
```typescript
interface CartLineRowProps {
  line: CartLine;                 // { productId, slug, name, variantId, variantLabel,
                                  //   unitPriceCents, coverImageUrl, sku, quantity }
  outOfStock?: boolean;           // from snapshot flag if available (best-effort; T7 re-validates)
  onQuantityChange: (next: number) => void;
  onRemove: () => void;
  maxQuantity: number;            // MAX_CART_ITEM_QUANTITY
  labels: {
    remove: string;               // "Eliminar"
    increase: string; decrease: string; quantityLabel: string;
    unitEach: string;             // "c/u" / "each"
    lineTotalLabel: string;       // "Total"
    colorLabel: string;           // template "Color: {name}"
    outOfStock: string;           // "Agotado"
  };
}
```

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Default | Full row | Interactive stepper + remove |
| No variant | Omit the "Color: …" line | `variantLabel === null` → no color row |
| Out of stock (snapshot) | `StockBadge state="out" label="Agotado"` under name; image `opacity-60` (mirror product-card) | Still removable & editable; the "re-checked at checkout" note is NOT shown here (T7 concern) |
| No image | `Image01Icon` fallback in the `aspect-[4/5] bg-muted` thumb (mirror product-card) | — |
| Removing | Row collapses: height→0 + `opacity 1→0`, `--ease-in-out`, 200ms, then unmounts | Optimistic remove (Flow C) |
| Hover (desktop) | Subtle `bg-muted/40` on the row | Gated `@media (hover:hover)`; optional |
| Focus-within | Controls show own focus rings | Tab order: name link → − → qty → + → remove |

**Responsive**:
| Breakpoint | Layout Change |
| --- | --- |
| < 640px | Single column; image `w-20` left, details right; stepper + remove on a row below details; line total bottom-right. No horizontal scroll at 320px |
| 640–768px | Image `w-24`; same stacked control row |
| ≥ 768px | 5-col grid: image / details / stepper / unit price / line total; remove ghost at far right or under line total |

**Animations**:
- Enter (page load): **Stagger** via `.stagger` (opacity + `translateY(8px→0)`, ~200ms
  `ease-out`, 30–60ms between rows, delay capped). Decorative, non-blocking.
- Line total change (qty edit): **Crossfade** the total via `.price-value` (keyed on
  `lineTotalCents(line)`), ~150ms. Only motion on qty change.
- Remove: **Accordion/Collapse** — `height` + `opacity` → 0 over 200ms `--ease-in-out`,
  then unmount. Deliberate one-off exit (not a hot path). If the reviewer objects to
  animating `height`, fall back to opacity-only fade at 150ms. Reduced motion:
  **opacity-only** fade, no height animation.
- Reduced motion: no stagger translate (opacity only), no collapse height (instant +
  short opacity fade), price crossfade kept (comprehension).

**A11y**:
- Row is an `<li>`. Product name is a locale-aware `Link` to `productPath(slug)`.
- Image `alt` from snapshot; fallback icon `aria-hidden`.
- Remove: `Button variant="ghost"` with `Delete02Icon` + visible "Eliminar" text on
  desktop; `aria-label="Eliminar {name}"` always (icon-only on tightest mobile).
- Line total paired with an `sr-only` "Total" label.

---

### 5. FreeShippingProgress

**Purpose**: Progress toward the free-shipping threshold — a filling bar +
remaining/achieved copy. Hidden entirely when store settings are null (AC-9, edge 6).
**Location**: In `CartPageClient`, above the order summary (mobile) / top of the right
rail (desktop).
**shadcn base**: none — a plain Tailwind bar (`transform: scaleX`,
compositor-friendly). Do NOT use the `slider` component.

**Layout** (ASCII wireframe):
```
 Below threshold                              At / above threshold (achieved)
┌───────────────────────────────────┐        ┌───────────────────────────────────┐
│ Te faltan $2,500.00 para           │        │ 🎉 ¡Tienes envío gratis!           │
│ envío gratis                       │        │                                   │
│ ┌───────────────────────────────┐ │        │ ┌───────────────────────────────┐ │
│ │██████████████░░░░░░░░░░░░░░░░░│ │        │ │███████████████████████████████│ │
│ └───────────────────────────────┘ │        │ └───────────────────────────────┘ │
│   ↑ track (bg-muted), fill scaleX  │        │   fill at 100%, achieved tint      │
└───────────────────────────────────┘        └───────────────────────────────────┘
```
- Track: `h-2 w-full rounded-full bg-muted overflow-hidden`.
- Fill: absolutely fills the track; `origin-left transform scaleX(pct)`; `bg-primary`
  (below) / achieved tint (at 100%); `transition: transform 400ms var(--ease-out)` —
  **scaleX only, never width**; `will-change: transform`.
- Copy above the bar: `text-sm text-muted-foreground` (remaining) / `text-sm
  font-medium text-foreground` (achieved), `tabular-nums` on the amount.

**Props**:
```typescript
interface FreeShippingProgressProps {
  /** null when store settings unavailable → component returns null (renders nothing). */
  progress: { remainingCents: number; achieved: boolean; pct: number } | null;
  labels: {
    remaining: string;   // template "Te faltan {amount} para envío gratis"
    achieved: string;    // "¡Tienes envío gratis!"
  };
  className?: string;
}
```
`pct` is clamped `0..1` (fill fraction). `remainingCents` → `formatMXN` → interpolated
into `remaining`.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Settings null | **Nothing** (`return null`) | Never renders; summary shows subtotal + neutral shipping label only (edge 6) |
| Below threshold (pct < 1) | Remaining copy + partial bar | Bar `scaleX(pct)`; copy shows `formatMXN(remainingCents)` |
| Exactly at threshold (`≥`, edge 7) | Achieved copy + full bar | `achieved === true` at subtotal === threshold |
| Above threshold | Achieved copy + full bar | pct clamped to 1 |
| Empty cart | Not rendered | Lives inside the populated branch only (AC-10) |
| pct transition | Bar animates scaleX prev→next | On subtotal change |

**Responsive**:
| Breakpoint | Layout Change |
| --- | --- |
| < 640px | Full-width above summary card |
| 640–768px | Full-width above summary |
| ≥ 768px | Full-width at the top of the right-rail summary column |

**Animations**:
- Fill: **transform scaleX** old→new pct, `400ms --ease-out` (a transform-based
  "Reveal", NOT a width tween → no layout thrashing).
- Achieved transition: fill color crossfades primary→achieved-tint (~250ms `ease`);
  copy crossfades (opacity, keyed on `achieved`). Optional one-shot **Pop** the first
  time it hits achieved (`scale 1→1.02→1`, ≤ 200ms) — a rare/first-time moment where
  delight is allowed (emil). Fire once per session-achieve.
- Reduced motion: fill snaps to new pct with an **opacity** crossfade (`transform:
  none`); no achieved pop; color change kept.

**A11y**:
- Wrapper: `role="progressbar" aria-valuemin={0} aria-valuemax={100}
  aria-valuenow={Math.round(pct*100)}` with `aria-label` = the remaining/achieved copy.
- The remaining/achieved text is real visible text (not color-only); the emoji is
  `aria-hidden`.

---

### 6. OrderSummary

**Purpose**: Subtotal, shipping, total; hosts the checkout CTA.
**Location**: `CartPageClient`, below the line list (mobile), sticky right rail
(desktop).
**shadcn base**: a `bg-card border border-border rounded-lg` panel; checkout is a
`Button`-styled locale-aware `Link` (44px).

**Layout** (ASCII wireframe):
```
┌───────────────────────────────┐
│  Resumen del pedido            │  ← heading, text-sm font-medium
│  ─────────────────────────     │
│  Subtotal          $14,997.00  │  ← tabular-nums
│  Envío                 Gratis  │  ← "Gratis" when free; formatMXN otherwise;
│                                │    neutral label when settings null
│  ─────────────────────────     │
│  Total             $14,997.00  │  ← font-semibold, larger
│                                │
│  ┌───────────────────────────┐ │
│  │   Proceder al pago    →    │ │  ← checkout CTA, h-11, w-full, bg-primary
│  └───────────────────────────┘ │
└───────────────────────────────┘
```

**Props**:
```typescript
interface OrderSummaryProps {
  subtotalCents: number;
  /** null-settings → "unavailable": hide amount, neutral label, no free logic. */
  shipping:
    | { kind: "flat"; cents: number }
    | { kind: "free" }
    | { kind: "unavailable" };
  totalCents: number;            // subtotal + (flat cents | 0); unavailable → = subtotal
  checkoutHref: string;          // CHECKOUT_PATH (may 404 until T7 — just a link)
  labels: {
    heading: string;             // "Resumen del pedido"
    subtotal: string;            // "Subtotal"
    shipping: string;            // "Envío"
    shippingFree: string;        // "Gratis"
    shippingUnavailable?: string;// "Se calcula al pagar" (neutral)
    total: string;               // "Total"
    checkout: string;            // "Proceder al pago"
  };
}
```

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Standard (flat shipping) | Subtotal, shipping = `formatMXN(flat)`, total = subtotal+flat | `tabular-nums` |
| Free shipping | Shipping row "Gratis", total = subtotal | Applies at subtotal ≥ threshold |
| Settings null | Shipping row neutral label ("Se calcula al pagar"), NO amount, total = subtotal | Never `$NaN` (edge 6) |
| Empty cart | Not rendered (AC-10) | Populated branch only |
| Value change | Subtotal/total crossfade via `.price-value` | On qty/remove |

**Responsive**:
| Breakpoint | Layout Change |
| --- | --- |
| < 640px | Full-width card under the line list; checkout CTA full-width |
| 640–768px | Full-width under list OR right column per width |
| ≥ 768px | **Sticky** right rail (`lg:sticky lg:top-20`, mirror PDP gallery `sticky top-20`); progress bar above it |

**Animations**:
- Total/subtotal change: **Crossfade** via `.price-value`, ~150ms.
- Checkout CTA press: `scale(0.98)` 100ms.
- No entrance beyond the page-level fade.
- Reduced motion: number swaps instant; CTA press scale removed.

**A11y**:
- Checkout CTA is a `Link` styled as a button with a trailing `ArrowRight01Icon`
  (`aria-hidden`). NOT a form/submit (T6 has no checkout logic) — navigation only.
- Rows use aligned label/value with `sr-only` context where needed.

---

### 7. CartEmptyState

**Purpose**: Friendly empty message + CTA to the catalog. No summary/progress/checkout.
**Location**: `CartPageClient` when `hydrated && lines.length === 0`.
**shadcn base**: `Button variant="default"` styled `Link` (44px) to `/sillas`.

**Layout** (ASCII wireframe):
```
┌───────────────────────────────────────────┐
│                  🛒                          │  ← ShoppingCart01Icon, ~40, muted
│         Tu carrito está vacío               │  ← text-lg font-medium text-foreground
│    Explora nuestras sillas y encuentra      │  ← optional subtext, muted
│         la ideal para ti.                   │
│        ┌─────────────────────┐              │
│        │     Ver sillas       │              │  ← CTA → /sillas, h-11
│        └─────────────────────┘              │
└───────────────────────────────────────────┘
 centered, max-w-sm mx-auto, py-16
```

**Props**:
```typescript
interface CartEmptyStateProps {
  browseHref: string;              // CATALOG_PATH "/sillas"
  labels: {
    title: string;                 // "Tu carrito está vacío"
    cta: string;                   // "Ver sillas"
    subtitle?: string;             // optional
  };
}
```

**States**: single state. Mounted only after hydration confirms an empty cart — never
flashes during load (loading shows skeletons instead).

**Responsive**:
| Breakpoint | Layout Change |
| --- | --- |
| < 640px | Centered, `py-16`, CTA `w-full max-w-xs` |
| ≥ 640px | Centered, `max-w-sm mx-auto`, CTA auto width |

**Animations**:
- Enter: **Fade in** + `translateY(8px→0)`, `--ease-out`, 250ms (one-time, calm).
- CTA press `scale(0.98)`.
- Reduced motion: opacity-only fade.

**A11y**: Icon `aria-hidden`; heading matches page heading order; CTA is a labeled
`Link`.

---

### 8. CartPageClient (page body island)

**Purpose**: Orchestrates the cart page — reads `useCart()`, computes derived totals,
renders skeleton → (empty | populated), owns the `aria-live` region.
**Location**: `/carrito` route, rendered by the server `page.tsx`.
**shadcn base**: composition of the above.

**Layout — populated, mobile** (ASCII wireframe):
```
┌─────────────────────────────────┐
│  Tu carrito (3)          [h1]    │
├─────────────────────────────────┤
│  ▸ CartLineRow                   │
│  ▸ CartLineRow                   │
│  ▸ CartLineRow                   │
├─────────────────────────────────┤
│  FreeShippingProgress            │
├─────────────────────────────────┤
│  OrderSummary (+ checkout CTA)   │
└─────────────────────────────────┘
```

**Layout — populated, desktop (≥ 1024px)** (ASCII wireframe):
```
┌───────────────────────────────────────────────────────────────┐
│  Tu carrito (3)                                          [h1]   │
├──────────────────────────────────────┬────────────────────────┤
│  ▸ CartLineRow                        │  FreeShippingProgress   │
│  ▸ CartLineRow                        │  ┌───────────────────┐  │
│  ▸ CartLineRow                        │  │ OrderSummary      │  │
│                                       │  │ (sticky top-20)   │  │
│  (2fr line list)                      │  │ + checkout CTA    │  │
│                                       │  └───────────────────┘  │
└──────────────────────────────────────┴────────────────────────┘
 container: mx-auto max-w-(--breakpoint-xl) px-4 md:px-6 lg:px-8 py-8
 grid: grid-cols-1 lg:grid-cols-[2fr_1fr] lg:gap-10
```

**Props**:
```typescript
interface CartPageClientProps {
  /** From getStoreSettingsStatic() on the server; null when unavailable. */
  flatRateCents: number | null;
  freeThresholdCents: number | null;
  // copy via useTranslations("cart") inside the island
}
```
Derives: `subtotalCents(lines)`, `computeShipping({subtotal, flat, threshold})`,
`freeShippingProgress(...)` (null when settings null), `totalItemCount`.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Loading / pre-hydration | **Skeleton**: title placeholder + 2–3 shimmer line rows + a summary placeholder (`bg-muted animate-pulse`, sized to the real layout → no shift) | Shown until `hydrated`. Server may render this shell so no-JS sees a sensible page |
| Hydrated + empty | `<CartEmptyState>` only | No summary/progress/checkout (AC-10) |
| Hydrated + populated | Title w/ count + line list + progress + summary | Full interactivity |
| Settings null (populated) | Same, but `FreeShippingProgress` → null; `OrderSummary` neutral shipping | Graceful degradation |
| Removing last item | Cross-fades populated → empty state | Badge → 0; summary/progress unmount |

**Responsive**: single column < 1024px (list → progress → summary), two-column
`[2fr_1fr]` at `lg`.

**Animations**:
- Skeleton: **Shimmer** via existing `animate-pulse` on `bg-muted` blocks.
- Skeleton→content: **Crossfade** (opacity), 200ms `ease-out`, when `hydrated` flips.
  Identical box sizes → no reflow.
- Line list entrance: `.stagger` (§4).
- Reduced motion: crossfade only; pulse kept (opacity-based).

**A11y**:
- Owns a single visually-hidden `aria-live="polite"` region ("Se agregó…", "Cantidad
  actualizada: 3", "Producto eliminado") that all mutations announce through (AC-16).
- Page `<h1>` = cart title with count; logical heading order; `<ul>`/`<li>` list.

---

## Page Layout

### /carrito (server page → CartPageClient)

Server `page.tsx`: read `getStoreSettingsStatic()`, resolve `<title>` metadata via
i18n, render `<CartPageClient flatRateCents freeThresholdCents />`. Visible chrome
(header w/ badge, footer) comes from `[locale]/layout.tsx`; the cart page adds only the
body.

```
 Mobile (375px)                Tablet (768px)                 Desktop (≥1024px)
┌──────────────┐              ┌────────────────────┐         ┌────────────────────────────┐
│  Header 🛒3  │              │  Header      🛒3   │         │  Header              🛒 3   │
├──────────────┤              ├────────────────────┤         ├────────────────────────────┤
│ Tu carrito(3)│              │ Tu carrito (3)     │         │ Tu carrito (3)             │
│ ─ line ─     │              │ ─ line ──────────  │         │ ┌────────────┐ ┌─────────┐ │
│ ─ line ─     │              │ ─ line ──────────  │         │ │ line       │ │ progress│ │
│ ─ line ─     │              │ ─ line ──────────  │         │ │ line       │ │ summary │ │
│ [progress]   │              │ [progress full-w]  │         │ │ line       │ │ (sticky)│ │
│ [summary]    │              │ [summary]          │         │ └────────────┘ └─────────┘ │
│ [checkout]   │              │ [checkout]         │         │  2fr            1fr        │
└──────────────┘              └────────────────────┘         └────────────────────────────┘
```

---

## Interaction Flows

### Flow A — Add to cart from PDP
1. Shopper selects a color → `ProductPurchasePanel` updates `selectedVariantId`
   (existing behavior; source of truth).
2. Shopper clicks **Agregar al carrito** (44px, `bg-primary`) → `:active`
   `scale(0.98)` (instant feedback, Apple §1).
3. `useCart().addItem(snapshot)` runs a **functional** update (`setLines(prev =>
   addLine(prev, snapshot))`) → dedupes by `cartLineKey(productId, variantId)`,
   increments + clamps → effect persists via `writeCart` → context changes.
4. Button content **crossfades** to "Agregado ✓" (blur-masked, 180ms); header
   **CartCountBadge** pill scales/fades in (or number crossfades) — the two
   confirmations together replace a mini-cart (spec SKIP).
5. `aria-live` announces "Agregado al carrito. {n} artículos."
6. After `ADD_TO_CART_CONFIRM_MS` (~1500ms) the button crossfades back. Re-clicking
   during confirm re-adds and resets the timer (interruptible).
7. Out of stock: step 2 impossible (button `disabled`, "Agotado").

### Flow B — Adjust quantity on /carrito
1. Tap **+** on a line's stepper (44px) → instant value bump (no stepper animation).
2. `onQuantityChange(next)` → `setQuantity(key, clamp(next))` (functional) → persist.
3. That line's **total** crossfades (`.price-value`, 150ms); **subtotal** + **total**
   in `OrderSummary` crossfade; **FreeShippingProgress** bar animates `scaleX` to the
   new pct (400ms); **header badge** number crossfades. All off one context change.
4. At cap, **+** disables; at qty 1, **−** disables (use Remove to delete).
5. `aria-live`: "Cantidad actualizada: {n}."

### Flow C — Remove a line
1. Click **Eliminar** (ghost button, 44px) → optimistic remove.
2. Row **collapses** (height+opacity, 200ms; reduced-motion = opacity fade), unmounts.
3. Totals/progress/badge recompute (Flow B.3).
4. If last line → cross-fade to `CartEmptyState`; summary/progress/checkout unmount;
   badge → 0.
5. `aria-live`: "Producto eliminado."
6. No undo in T6 (Phase-1 scope); no confirm dialog (Apple §16 Agency: reserve
   confirms for destructive+irreversible; a guest cart line is trivially re-addable).

### Flow D — Proceed to checkout
1. Click **Proceder al pago** (44px CTA, populated cart only).
2. It is a plain locale-aware `Link` to `CHECKOUT_PATH` (`/checkout`). May 404 until T7
   (acceptable, same pattern T3 used). NOT a form; NO order creation in T6.

### Flow E — Cross-tab sync
1. Tab A adds/edits → `writeCart` → `storage` event in Tab B.
2. Tab B's `CartProvider` listener re-runs `readCart()` → `setState` → badge + page
   re-render (last-write-wins). Numbers crossfade; no jump, no crash.

### Flow F — Corrupt / disabled storage (invisible degradation)
1. Corrupt payload → `readCart()` returns `[]` + one guarded `console.warn` → page
   renders `CartEmptyState`. No error UI.
2. `writeCart` throws (private mode/quota) → swallowed with one `console.warn`;
   in-memory context still updates so the cart works for the session; nothing scary
   shown.

---

## Accessibility Checklist
- [ ] All interactive elements have visible `focus-visible:ring-2 ring-ring` rings
      (badge link, add-to-cart, stepper +/−, remove, checkout CTA, empty CTA).
- [ ] All icon-only buttons have real `aria-label` (stepper increase/decrease, remove
      on mobile, header cart link).
- [ ] Color is never the only indicator: out-of-stock shows "Agotado" text +
      `StockBadge` icon; free shipping shows "Gratis"/achieved text; disabled states
      also set `aria-disabled`.
- [ ] Tab order is logical: header (search → cart → lang); on /carrito: h1 → per row
      (name link → − → qty → + → remove) → progress → summary → checkout.
- [ ] Dynamic changes announced via a single page-level `aria-live="polite"` region
      (add, qty change, remove). Header badge count is in the link's `aria-label`.
- [ ] Header badge `aria-label` = "Carrito, {count} artículos"; pre-hydration = plain
      "Carrito" (never claims a false count).
- [ ] `role="progressbar"` with `aria-valuenow/min/max` on the free-shipping bar.
- [ ] Keyboard: Enter/Space activate all controls; the stepper is operable without a
      pointer; no keyboard trap.
- [ ] Touch targets ≥ 44px on all cart controls (stepper, remove, CTAs, header badge).
- [ ] No horizontal scroll at 320px (image shrinks to `w-20`, name wraps, stepper +
      remove wrap below details on mobile).

## Design Tokens Used
- **Colors**: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`,
  `bg-primary` / `text-primary-foreground` (CTAs, badge pill), `bg-muted` (skeleton,
  progress track, out-of-stock chip), `border-border`, `ring-ring`. Achieved-shipping
  tint: `emerald-500`/`emerald-600` used sparingly (mirrors how `StockBadge` low-stock
  uses `amber` as a single semantic accent) — OR strictly neutral `text-foreground` +
  🎉 emoji if the team prefers zero new hues (flag for UX).
- **Typography**: `text-2xl md:text-3xl font-semibold tracking-tight` (page h1, mirror
  PDP name); `text-sm font-medium` (summary heading, line name); `text-sm
  text-muted-foreground` (variant/unit/remaining copy); `tabular-nums` on **every**
  numeric; `text-xs` fine print.
- **Spacing**: page `py-8`, `px-4 md:px-6 lg:px-8`, `max-w-(--breakpoint-xl)` (mirror
  header/PDP); intra-panel `gap-4`/`gap-6`; grid `lg:grid-cols-[2fr_1fr] lg:gap-10`
  (mirror PDP `lg:grid-cols-2 lg:gap-10`); line row `gap-3`/`gap-4`.
- **Radius**: `rounded-lg` (cards, summary, image thumb — mirror product-card),
  `rounded-md` (buttons, stepper group, input), `rounded-full` (badge pill, progress
  track/fill).
- **Elevation/shadows**: flat/neutral (border-defined surfaces, `bg-card` +
  `border-border`); no drop shadows except the existing `.card-lift` hover on linked
  thumbnails. Sticky summary uses the header's border grammar, not a shadow.
- **Motion**: `--ease-out` for all enters (badge scale-in, confirm crossfade, empty
  fade, progress fill); `--ease-in-out` for the remove collapse; `.price-value` for
  number crossfades; `.stagger` for row entrance; `animate-pulse` for skeleton.
  Durations: badge 160ms, confirm 180ms, progress 400ms, number crossfade ~150ms,
  collapse 200ms, press 100ms. All `transform`/`opacity` (progress = `scaleX`);
  reduced-motion drops movement, keeps opacity/color.

---

## i18n copy — ES (default) + EN (both required, one edit)

New `cart` namespace in `src/messages/es-MX.json` and `src/messages/en.json`. Match the
existing nested-object + `{token}` template style (footer/product namespaces).

| Key | ES (es-MX) | EN |
| --- | --- | --- |
| `cart.title` | `Tu carrito` | `Your cart` |
| `cart.titleCount` (plural) | `Tu carrito ({count})` | `Your cart ({count})` |
| `cart.metadata.title` | `Carrito` | `Cart` |
| `cart.empty.title` | `Tu carrito está vacío` | `Your cart is empty` |
| `cart.empty.subtitle` (opt.) | `Explora nuestras sillas y encuentra la ideal para ti.` | `Browse our chairs and find the right one for you.` |
| `cart.empty.cta` | `Ver sillas` | `Browse chairs` |
| `cart.item.remove` | `Eliminar` | `Remove` |
| `cart.item.increase` | `Aumentar cantidad` | `Increase quantity` |
| `cart.item.decrease` | `Disminuir cantidad` | `Decrease quantity` |
| `cart.item.quantityLabel` | `Cantidad` | `Quantity` |
| `cart.item.unitEach` | `c/u` | `each` |
| `cart.item.lineTotalLabel` | `Total` | `Total` |
| `cart.item.colorLabel` | `Color: {name}` | `Color: {name}` |
| `cart.summary.heading` | `Resumen del pedido` | `Order summary` |
| `cart.summary.subtotal` | `Subtotal` | `Subtotal` |
| `cart.summary.shipping` | `Envío` | `Shipping` |
| `cart.summary.shippingFree` | `Gratis` | `Free` |
| `cart.summary.shippingUnavailable` | `Se calcula al pagar` | `Calculated at checkout` |
| `cart.summary.total` | `Total` | `Total` |
| `cart.freeShipping.remaining` | `Te faltan {amount} para envío gratis` | `You're {amount} away from free shipping` |
| `cart.freeShipping.achieved` | `¡Tienes envío gratis!` | `You've unlocked free shipping!` |
| `cart.checkout` | `Proceder al pago` | `Proceed to checkout` |
| `cart.addToCart` | `Agregar al carrito` | `Add to cart` |
| `cart.added` | `Agregado` | `Added` |
| `cart.outOfStock` | `Agotado` | `Out of stock` |
| `cart.badgeLabel` (plural) | `Carrito, {count} artículos` | `Cart, {count} items` |
| `cart.headerLink` | `Carrito` | `Cart` |
| `cart.announce.added` | `Se agregó al carrito. {count} artículos.` | `Added to cart. {count} items.` |
| `cart.announce.quantity` | `Cantidad actualizada: {count}` | `Quantity updated: {count}` |
| `cart.announce.removed` | `Producto eliminado del carrito` | `Item removed from cart` |

> **Plurals**: where the count varies ("artículo"/"artículos", "silla"/"sillas"), use
> next-intl ICU plural syntax (`{count, plural, one {# artículo} other {# artículos}}`)
> to match the existing `catalog.filters.apply` pattern. Apply plural to `badgeLabel`,
> `announce.added`, and `titleCount`.
> **Amount interpolation**: `freeShipping.remaining` — format cents via `formatMXN`
> FIRST, then `interpolate` the string into `{amount}` (never pass raw cents to ICU).

---

## Notes for the Dev stage (watch-outs)

1. **shadcn Button is too small for touch.** Its `lg` size is `h-8` (32px). Every cart
   touch target (add-to-cart, stepper +/−, remove, checkout CTA, header badge box)
   must explicitly override to **≥ 44px** (`h-11`/`size-11`) via `className`. Don't
   ship the default sizes.
2. **No layout shift is a hard contract.** Header badge pre-hydration = icon-only in a
   fixed 44×44 box with the count as an *absolutely-positioned overlay pill* (never a
   flex sibling). Cart page skeleton must size to the real layout so the
   skeleton→content swap is a pure opacity crossfade.
3. **Progress bar = `transform: scaleX`, never `width`.** Fill is `origin-left
   scaleX(pct)` with `transition: transform … var(--ease-out)`. Reduced motion swaps to
   an opacity crossfade with `transform: none`. Ticket + review gate.
4. **`FreeShippingProgress` returns `null` when settings are null** — do not render an
   empty bar; `OrderSummary` shows the neutral `shippingUnavailable` label and the
   total equals the subtotal (never `$NaN`).
5. **Every number is `tabular-nums` and goes through `formatMXN`.** For
   `freeShipping.remaining`, format cents first, then `interpolate` into `{amount}`.
6. **PDP panel keeps its "no client i18n" invariant.** Pass the 3 add-to-cart labels
   into `AddToCartButton` as props (`labels`), resolved server-side in the panel/page —
   do NOT call `useTranslations` inside the button. The cart *page* body
   (`CartPageClient`) is the heavy island that uses `useTranslations("cart")`.
7. **Add-to-cart + stepper use functional state updates** (`setLines(prev => …)`) so
   rapid clicks coalesce (edge 9) and never exceed the cap.
8. **Confirm state is interruptible** — re-click during "Agregado ✓" re-adds and resets
   the timer; use a CSS transition (not a keyframe) for the label crossfade so it
   retargets smoothly (emil: transitions over keyframes for rapid UI).
9. **One `aria-live` region** at the page level, not per-control, to avoid duplicate
   announcements.
10. **Remove-row collapse uses `height`** (a deliberate one-off exit). If the reviewer
    objects to animating a layout property, fall back to opacity-only. Reduced motion
    must drop the height animation regardless.
11. **Checkout CTA is a `Link`, not a form.** It only navigates to `CHECKOUT_PATH`; it
    may 404 until T7. No order/stock/payment logic in any cart component.
12. **Reuse `StockBadge` and `formatMXN` verbatim** — do not fork them. Out-of-stock
    cart line = `StockBadge state="out" label={outOfStock}` + `opacity-60` image
    (mirror product-card).
13. **Achieved-shipping tint** (`emerald-*`) is the only proposed non-neutral hue; if
    the team wants strictly neutral, use `text-foreground` + the 🎉 emoji (aria-hidden).
    Flag for the UX stage.
14. **Icons**: `@hugeicons/react` only — `ShoppingCart01Icon` (badge/empty),
    `MinusSignIcon`/`PlusSignIcon` (stepper), `Delete02Icon` (remove),
    `Tick02Icon`/`CheckmarkCircle02Icon` (confirm), `ArrowRight01Icon` (checkout),
    `Image01Icon` (image fallback). Never mix icon sets.
