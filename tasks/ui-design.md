# UI Design: T2 — App Shell & Design System

> Scope: the storefront *shell only* — header, footer, language toggle, mobile
> drawer, WhatsApp button, 404/error pages, minimal homepage placeholder, and
> the documented neutral token/motion foundation. No catalog, search, or
> homepage content (owned by T3/T5/T13). Nav links may be dead; they must 404
> gracefully, never look broken.

---

## Design Principles for This Feature

1. **The shell is chrome, not content.** It must be quiet, fast, and never
   compete with the (future) product content. Restraint over decoration —
   neutral tokens, one accent (`--primary`), generous whitespace, no gradients,
   no shadows heavier than the elevation scale below.
2. **Server-rendered by default; JS only where it earns its place.** Header,
   footer, WhatsApp anchor, and their links all work with JS disabled. Only the
   mobile drawer (open/close + focus trap) and the language toggle
   (reload-free navigation) are client components. This protects TTI on the
   mobile-heavy Mexican audience.
3. **Mobile-first, thumb-first.** Design the 375px layout first, expand up. Tap
   targets ≥ 44px for toggle, hamburger, and WhatsApp. Nothing overlaps, nothing
   scrolls horizontally at any width.
4. **The tokens are the brand-swap seam.** No component may hardcode a color,
   radius, or font family. Everything routes through the OKLCH custom properties
   already in `globals.css` and the Tailwind token utilities. Re-skinning the
   store for a different brand = editing `:root` in one file.
5. **Motion is invisible correctness.** Every animation has a purpose (feedback,
   spatial consistency, preventing jarring change), animates `transform`/`opacity`
   only, uses `ease-out` to enter, stays < 300ms, and degrades to opacity-only
   under reduced motion. If it can't justify itself, it doesn't animate.
6. **Wayfinding (Apple #16).** Every page answers: where am I, where can I go
   (nav), what's here, how do I get out (home link on logo, "back home" on 404).
   Nav labels are specific, not vague umbrellas.

---

## Design Tokens Used

All values already exist in `src/app/globals.css` as OKLCH custom properties
mapped to Tailwind utilities via `@theme inline`. **This task adds only the
easing variables and a documentation block — it does NOT change any palette
value.**

### Colors (semantic tokens — the brand-swap seam)

| Token utility | CSS var | Used for |
| --- | --- | --- |
| `bg-background` / `text-foreground` | `--background` / `--foreground` | Page + base text |
| `bg-card` / `text-card-foreground` | `--card` / `--card-foreground` | Header/footer surface if elevated |
| `bg-primary` / `text-primary-foreground` | `--primary` / `--primary-foreground` | Primary CTA (WhatsApp fallback style, "back home") |
| `bg-muted` / `text-muted-foreground` | `--muted` / `--muted-foreground` | Footer secondary text, copyright, free-shipping line, inactive nav |
| `bg-accent` / `text-accent-foreground` | `--accent` | Nav hover, drawer item hover, toggle hover |
| `border-border` | `--border` | Header bottom rule, footer top rule, drawer edge |
| `ring-ring` | `--ring` | Focus-visible ring on every interactive element |
| `bg-destructive` / `text-destructive` | `--destructive` | `error.tsx` accent only |

> **Brand-swap seam (AC-9):** to reskin, edit `:root` (and `.dark`) in
> `globals.css` — `--primary`, `--background`, `--foreground`, `--border`,
> `--radius`, and the `--font-sans` binding. No component change required.
> The `## Brand Tokens` block in `dev-done.md` documents exactly these edits.

### Typography (single intentional font — AC-12)

- One font family bound to `--font-sans` (Geist/Inter tangle removed; pick **one**,
  wire it once in the root `layout.tsx`, expose as `--font-sans`). `--font-mono`
  stays for code only (unused in the shell). Consuming utility: `font-sans` only —
  never a raw `font-family`.
- Scale (Tailwind defaults, no custom sizes needed):
  - Wordmark / store name: `text-base font-semibold tracking-tight`
    (Apple #15: tighten tracking as weight/size rises).
  - Nav labels: `text-sm font-medium`.
  - Footer links: `text-sm`; footer headings `text-xs font-medium uppercase tracking-wide text-muted-foreground`.
  - Homepage placeholder H1: `text-2xl sm:text-3xl font-semibold tracking-tight`.
  - 404/error headline: `text-xl font-semibold tracking-tight`; body `text-sm text-muted-foreground`.
  - Body leading: comfortable (`leading-relaxed`) for intro copy; tight for dense UI rows.

### Spacing

- Header height: `h-14` (56px) mobile, `h-16` (64px) ≥ md. Horizontal gutter:
  `px-4` mobile, `px-6` md, `px-8` lg, capped by `max-w-screen-xl mx-auto`.
- Footer: `py-10` with `gap-8` between column groups.
- WhatsApp button: `bottom-4 right-4` mobile with safe-area inset
  (`bottom-[calc(1rem+env(safe-area-inset-bottom))]`), `bottom-6 right-6` ≥ md.
- Vertical rhythm inside drawer items: `py-3` (≥ 44px tap target with icon).

### Radius (from `--radius` scale)

- Buttons/toggle: `rounded-md`. WhatsApp FAB: `rounded-full`. Drawer panel: no
  radius (full-height edge sheet) or `rounded-r-xl` if inset — spec below.

### Elevation / shadow

- Header at rest: no shadow, `border-b border-border`. On scroll (sticky
  variant): `shadow-sm` fades in (see Motion → Sticky header).
- Drawer overlay scrim: `bg-black/50` (a scrim, not a token color — acceptable
  per Apple #12 "dim to focus"; not a brand color).
- Drawer panel: `shadow-xl` (a floating material over dimmed content).
- WhatsApp FAB: `shadow-lg` at rest; `shadow-xl` on hover (hover-capable only).

### Motion tokens (ADDED by this task — to `:root` / `@theme` in `globals.css`)

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* strong ease-out, UI enter/exit */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* on-screen movement */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* iOS drawer curve */
}
```

Duration constants (named, per Clean Code "no magic values" — durations end in a
unit): drawer enter `300ms`, drawer exit `200ms`, toggle crossfade `150ms`,
press feedback `120ms`, FAB entrance `180ms`, sticky shadow `180ms`.

---

## Component Inventory

### 1. SiteHeader

**Purpose**: Persistent top chrome — store wordmark (links home), primary nav,
language toggle, and (below `md`) a hamburger that opens the mobile drawer.
**Location**: Top of every page, rendered in `[locale]/layout.tsx` above
`children`.
**shadcn base**: none (composition of `Button` primitive + custom layout).
Server component. Strings via `getTranslations("nav")`.

**Layout — desktop (≥ md)**:
```
┌──────────────────────────────────────────────────────────────────────┐
│  PosturPro      Sillas  Marcas  Estilos  Contacto        [ES|EN] ↕   │  h-16, border-b
└──────────────────────────────────────────────────────────────────────┘
   wordmark→/     ─── primary nav (text-sm) ───           language toggle
```

**Layout — mobile (< md)**:
```
┌───────────────────────────────────────────┐
│  ☰    PosturPro                  [ES|EN]  │  h-14, border-b
└───────────────────────────────────────────┘
  hamburger  wordmark (center/left)   toggle
```
Order on mobile: hamburger (left) · wordmark · toggle (right). Wordmark
`truncate min-w-0` so a long store name never pushes the toggle off-screen
(edge case 6). Toggle and hamburger are `shrink-0`.

**Props**:
```typescript
interface SiteHeaderProps {
  /** Store display name for the wordmark slot; caller passes the resolved
   *  name (store_settings.name ?? SEED_STORE_NAME). */
  storeName: string;
}
```
Nav items are a local `const` array of `{ key: string; href: string }` whose
labels are resolved from the dictionary by `key` — hrefs may be dead routes
owned by later tasks (`/sillas`, `/marcas`, `/estilos`, `/contacto`).

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Default | Wordmark + nav + toggle on `bg-background`, `border-b` | Links navigate (server anchors) |
| Nav hover (≥md, hover-capable) | Item gets `bg-accent text-accent-foreground rounded-md` | Pointer cursor; color-only transition |
| Nav focus | `ring-2 ring-ring` focus-visible ring, rounded | Keyboard reachable in DOM order |
| Sticky-scrolled (optional) | `shadow-sm` fades in, subtle | See Motion → Sticky header |
| No JS | Nav + wordmark links work; hamburger is a `<summary>`/anchor fallback or simply hidden with nav shown | Progressive enhancement |

**Responsive**:
| Breakpoint | Layout change |
| --- | --- |
| < 640px (mobile) | Hamburger + wordmark + toggle, one row, no wrap; primary nav hidden (in drawer) |
| 640–1024px (tablet) | If nav fits, show it inline and hide hamburger; otherwise keep hamburger. Nav shown at `md` (768px) by default |
| ≥ 1024px (desktop) | Full inline nav, generous gutter, `max-w-screen-xl` centered |

**Animations**:
- Mount: none (chrome present on first paint; animating persistent chrome on
  every navigation would violate "frequency of use").
- Nav hover: **Hover effect** — `background-color`/`color` transition, `120ms`,
  `ease`, wrapped in `@media (hover: hover) and (pointer: fine)`. No transform.
- Sticky shadow: see Motion section.
- Reduced motion: no change needed (color-only already compliant).

---

### 2. LanguageToggle

**Purpose**: Switch locale (ES ↔ EN) by rewriting the current URL segment,
preserving the path, persisting to `NEXT_LOCALE`, without a full reload (AC-6).
**Location**: Header (desktop + mobile) and optionally at the top of the mobile
drawer.
**shadcn base**: `Button` primitive (`variant="ghost" size="sm"`), `"use client"`.
Uses `useRouter`/`usePathname` from `src/i18n/navigation`, `useLocale()` for
current, `useTranslations("toggle")` for the accessible label.

**Layout**:
```
Segmented, two-state:      ┌─────┬─────┐
                           │ ES* │ EN  │   * = active (font-medium, text-foreground)
                           └─────┴─────┘     inactive = text-muted-foreground
Compact (mobile):          [ ES ▾ ]  → shows the OTHER locale label, one tap flips
```
Recommended: **compact single-button** on mobile (shows target locale, e.g. "EN"
when in ES), **segmented two-option** on ≥ md. Both are ≥ 44px tall.

**Props**:
```typescript
interface LanguageToggleProps {
  /** Visual density; segmented for wide chrome, compact for the mobile bar. */
  variant?: "segmented" | "compact";
}
```
No locale prop — the component reads the active locale from `useLocale()` so
there is never a second source of truth (AC-17).

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Idle (ES active) | ES emphasized, EN muted (or compact shows "EN") | Click/Enter → `router.replace(pathname, { locale: "en" })` |
| Idle (EN active) | EN emphasized, ES muted (or compact shows "ES") | Click → replace to `es-MX` |
| Pending (navigating) | Target label crossfades in; button stays interactive | `useTransition` isPending; do NOT disable — keep interruptible |
| Rapid toggle / mid-nav | Last press wins; label + URL converge on final locale | `router.replace` is interruptible; no stuck spinner (edge case 5) |
| Focus | `ring-2 ring-ring` | Keyboard operable; `aria-label` from dict; `aria-pressed` per option in segmented |
| No JS | Renders as two `next-intl` `<Link>`s (one per locale) so it still works | Progressive enhancement |

**Responsive**:
| Breakpoint | Layout change |
| --- | --- |
| < 768px | `variant="compact"` single button |
| ≥ 768px | `variant="segmented"` two options |

**Animations**:
- Label change: **Crossfade** — `opacity` (optionally `scale(0.97)`), `150ms`,
  `ease-out` on the active-label swap. Trigger: locale change resolves.
- Press: **Press/Tap feedback** — `transform: scale(0.97)` on `:active`, `120ms`,
  `ease-out`. Trigger: pointer/keyboard press.
- Property: `transform` + `opacity` only. Never `transition: all`.
- Reduced motion: opacity crossfade only, no `scale`; press has no transform.

---

### 3. MobileNav (drawer / sheet)

**Purpose**: Below `md`, the hamburger opens a slide-in drawer containing the
primary nav (and optionally the toggle). Focus-trapped, Esc-closable,
scrim-dismissable.
**Location**: Triggered from `SiteHeader` hamburger; mounts as an overlay.
**shadcn base**: shadcn **`Sheet`** if addable to the registry (built on Radix
Dialog — gives focus trap, Esc, scroll-lock, `aria-modal` for free); otherwise
`radix-ui` `Dialog` primitive directly. `"use client"`. Strings via
`useTranslations("nav")`.

**Layout (open, from left)**:
```
scrim (bg-black/50) ──────────────┐
┌──────────────────────┐          │
│ PosturPro         [✕] │          │  panel: w-[85vw] max-w-xs, h-full,
├──────────────────────┤          │  bg-background, border-r, shadow-xl
│  Sillas               │          │
│  Marcas               │          │  each item: py-3, text-base font-medium,
│  Estilos              │          │  hover/active bg-accent, full-width tap row
│  Contacto             │          │
├──────────────────────┤          │
│  [ ES | EN ]          │          │  toggle repeated inside drawer
└──────────────────────┘          │
                                    │ (tap scrim OR Esc closes)
```

**Props**:
```typescript
interface MobileNavProps {
  storeName: string;
  navItems: ReadonlyArray<{ key: string; href: string }>;
}
```
Open state is internal (`useState`) or Sheet's controlled state; the close
button and scrip both call the same close handler.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Closed | Not in DOM (or `hidden`), scrim absent | Hamburger `aria-expanded={false}` |
| Opening | Panel slides `translateX(-100%)→0`, scrim fades in | Focus moves to panel / close button |
| Open | Panel visible, scrim dims page, body scroll locked | Focus trapped; Tab cycles within; Esc closes; nav item click navigates then closes |
| Closing | Panel slides `0→translateX(-100%)`, scrim fades (faster) | Focus returns to the hamburger trigger |
| Reduced motion | Panel + scrim opacity fade only, no slide | Same behavior, gentler motion (edge case 4) |

**Responsive**:
| Breakpoint | Layout change |
| --- | --- |
| < 768px | Available; hamburger visible |
| ≥ 768px | Not used (inline nav); trigger hidden. If open when viewport crosses ≥md, close it |

**Animations** (CSS transitions, NOT keyframes, so mid-open dismiss is interruptible):
- Enter: **Slide in** + scrim **Fade in**. Panel `transform: translateX(-100%) → translateX(0)`; scrim `opacity 0 → 1`. `300ms`, `var(--ease-drawer)`.
  Trigger: open.
- Exit: reverse. `200ms` (faster than enter), `var(--ease-drawer)`. Trigger: close/Esc/scrim.
- Property: `transform` (panel) + `opacity` (scrim) only. Never layout props, never `transition: all`.
- Reduced motion: panel `transform: none`, both panel and scrim animate `opacity` only, `~200ms ease`.

> Direction note (Apple #7 spatial consistency): the panel enters and exits
> along the **same** edge (left↔left). Consider a bottom-sheet variant
> (`translateY(100%)→0`) for a more thumb-native feel; if chosen, enter and exit
> both along the bottom. Pick one and keep it consistent.

---

### 4. SiteFooter

**Purpose**: Persistent bottom chrome — store name, links to the seeded Spanish
static pages, a free-shipping line derived from `store_settings`, and a
copyright line with the current year (AC-7).
**Location**: Bottom of every page, rendered in `[locale]/layout.tsx` after
`children`. `min-h-full` flex column keeps it at the bottom on short pages.
**shadcn base**: none. **Async server component** — calls `getStoreSettings()`.
Strings via `getTranslations("footer")`; slugs are real Spanish routes.

**Layout — desktop (≥ md, 2–3 columns)**:
```
┌──────────────────────────────────────────────────────────────────────┐
│  PosturPro            TIENDA               AYUDA                       │
│  Envío gratis en      Sobre nosotros       Preguntas frecuentes        │
│  compras > MX$10,000  Envíos y devoluciones  Contacto                  │
│                                                                        │
│  ──────────────────────────────────────────────────────────────────  │
│  © 2026 PosturPro. Todos los derechos reservados.                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Layout — mobile (< md, stacked)**:
```
┌───────────────────────────┐
│  PosturPro                │
│  Envío gratis en compras  │  ← reserve height even when absent (no CLS)
│  mayores a MX$10,000      │
│                           │
│  Sobre nosotros           │
│  Envíos y devoluciones    │
│  Preguntas frecuentes     │
│  Contacto                 │
│  ───────────────────────  │
│  © 2026 PosturPro         │
└───────────────────────────┘
```

**Props**:
```typescript
interface SiteFooterProps {
  /** No props — the footer resolves its own data server-side. */
}
```
Internally: `const settings = await getStoreSettings();`
`const storeName = settings?.name ?? SEED_STORE_NAME;`
free-shipping line renders only when `settings?.free_shipping_threshold_cents`
is present, using `formatMXN(...)`.

Static-page links (real seeded Spanish slugs — links may be dead until T13):
`/sobre-nosotros`, `/envios-y-devoluciones`, `/preguntas-frecuentes`, `/contacto`.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Settings present | Store name + free-shipping line (`formatMXN`) + links + © year | Server-rendered, no spinner |
| Settings absent/error | **No** free-shipping line; store name = `SEED_STORE_NAME`; links + © still render | `getStoreSettings()` returns `null`, logs warning w/ context; footer branches (edge case 2, AC-15) |
| Link hover (hover-capable) | Underline / `text-foreground` from muted | Color transition `120ms ease` |
| Focus | `ring-2 ring-ring` on each link | Logical tab order |

**Responsive**:
| Breakpoint | Layout change |
| --- | --- |
| < 640px | Single column, stacked groups, left-aligned |
| 640–1024px | 2 columns |
| ≥ 1024px | 2–3 columns, `max-w-screen-xl` centered |

**Animations**: none. Footer is static chrome; animating it serves no purpose.
**No-CLS rule**: reserve vertical space for the free-shipping line
(`min-h-[1lh]` on its slot) so its presence/absence never shifts layout.

---

### 5. WhatsAppButton

**Purpose**: Fixed floating action button, bottom-right on every page, links to
`https://wa.me/<number>?text=<url-encoded es prefill>`; opens in a new tab
(AC-8). Config-guarded: not rendered when the number is empty (edge case 7).
**Location**: Fixed, rendered in `[locale]/layout.tsx`, above all content
(`z-50`, below drawer scrim `z-[60]` so an open drawer covers it).
**shadcn base**: none — a semantic `<a>` styled as a FAB. Server component
(no interactivity beyond the anchor). Icon: `@hugeicons` WhatsApp/chat glyph.
Label via `getTranslations("whatsapp")`.

**Layout**:
```
                              ┌────┐
                              │ 💬 │  ← rounded-full, size-14 (56px), bg-primary
                              └────┘     text-primary-foreground, shadow-lg
                    bottom-right, fixed inset with safe-area
```
Icon-only on all sizes (keeps it out of the way); accessible name from the
dictionary via `aria-label`. Optional `md`+ expansion to pill with text is out
of scope — keep it a circle.

**Props**:
```typescript
interface WhatsAppButtonProps {
  /** E.164 digits only, from config. Empty string ⇒ button not rendered. */
  phone: string;
  /** Prefilled Spanish message from config; URL-encoded before insertion. */
  message: string;
}
```
Render guard: `if (!phone) return null;` (and log absence in dev). `href =
`https://wa.me/${phone}?text=${encodeURIComponent(message)}``. Anchor has
`target="_blank" rel="noopener noreferrer"` and `aria-label`.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Rendered | Circular FAB, fixed bottom-right, above content | Opens WhatsApp in new tab |
| Number unconfigured | Not rendered at all | Config guard returns null; dev warning (edge case 7) |
| Hover (hover-capable) | Subtle lift `translateY(-1px)` + `shadow-xl` | Transform gated behind hover media query |
| Active/press | `scale(0.97)` | Press feedback |
| Focus | `ring-2 ring-ring ring-offset-2` | Keyboard reachable, visible ring |
| Reduced motion | No entrance scale, no hover lift; static | Still visible + tappable (edge case 4) |

**Responsive**:
| Breakpoint | Layout change |
| --- | --- |
| < 768px | `bottom-4 right-4` + `env(safe-area-inset-bottom)`; must not overlap footer at scroll-bottom (AC-14) |
| ≥ 768px | `bottom-6 right-6`; size may bump to `size-14` |

**Animations**:
- Entrance: **Pop in** — `scale(0.95) + opacity:0 → scale(1) + opacity:1`,
  `180ms`, `ease-out` (`var(--ease-out)`). Never `scale(0)`. Trigger: mount.
- Hover: **Hover effect** — `transform: translateY(-1px)` + shadow, `120ms ease`,
  under `@media (hover: hover) and (pointer: fine)` only. Trigger: pointer hover.
- Press: **Press/Tap feedback** — `scale(0.97)`, `120ms ease-out`. Trigger: `:active`.
- Property: `transform` + `opacity` only.
- Reduced motion: no transform at all (appears in place, opacity fade only or none).

> Overlap guarantee (AC-14): the footer gets `scroll-margin`/bottom padding, or
> the FAB sits with enough inset, so at scroll-bottom the FAB never covers footer
> links. Verify at 375/768/≥1024.

---

### 6. NotFound (404 page)

**Purpose**: Custom `not-found.tsx` rendering *inside* the shell (header+footer),
localized friendly message + "back to home" (AC-10, edge case 1).
**Location**: `src/app/[locale]/not-found.tsx`. Server component. Strings via
`getTranslations("notFound")`.
**shadcn base**: `Button asChild` wrapping a `Link` for the CTA.

**Layout**:
```
        ┌────────────────────────────────────────┐
        │            (shell header above)          │
        │                                          │
        │              404                         │  text-muted-foreground, large
        │       Página no encontrada               │  text-xl font-semibold
        │  La página que buscas no existe o        │  text-sm text-muted-foreground
        │  fue movida.                             │
        │                                          │
        │        [ Volver al inicio ]              │  Button → next-intl Link "/"
        │                                          │
        │            (shell footer below)          │
        └────────────────────────────────────────┘
```
Centered column, `min-h-[60vh] flex items-center justify-center text-center gap-4 px-4`.

**Props**: none.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Default (only state) | Localized headline + body + primary CTA | CTA navigates to localized home `/` |
| Focus | Ring on CTA | Keyboard reachable |

**Responsive**: single centered column at all widths; copy wraps; no horizontal scroll.

**Animations**:
- Mount: optional **Fade in** of the text block, `opacity 0→1` + `translateY(8px)→0`,
  `200ms ease-out`. Low-frequency page → animation acceptable.
- Reduced motion: opacity only, no translate.

---

### 7. ErrorBoundary (error.tsx)

**Purpose**: Client error boundary — localized "algo salió mal" + "Reintentar"
calling `reset()`; never leaks stack/message in production (AC-11, edge case).
**Location**: `src/app/[locale]/error.tsx`. `"use client"` (required by Next).
Strings via `useTranslations("error")`.
**shadcn base**: `Button` for the retry action.

**Layout**:
```
        ┌────────────────────────────────────────┐
        │           (shell header above)           │
        │                                          │
        │        ⚠  (destructive-tinted icon)      │
        │        Algo salió mal                    │  text-xl font-semibold
        │  Ocurrió un error inesperado.            │  text-sm text-muted-foreground
        │  Inténtalo de nuevo.                     │
        │                                          │
        │        [ Reintentar ]  ( ← reset() )     │  Button variant="default"
        │                                          │
        │           (shell footer below)           │
        └────────────────────────────────────────┘
```

**Props** (Next error boundary contract):
```typescript
interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}
```
Render **only** localized copy — never `error.message` or `error.stack` in the
UI. Log detail server/console-side. `error.digest` may be shown as a small
support reference (safe; it's an opaque hash), not the message.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Caught error | Localized friendly message + Retry | `reset()` re-renders the segment |
| Retrying | Button `:active` scale; optional pending | `reset()` invoked; no leaked detail |
| Focus | Ring on Retry | Keyboard reachable |

**Responsive**: centered column, same as 404.

**Animations**:
- Mount: **Fade in** `opacity 0→1`, `200ms ease-out`. Trigger: boundary catches.
- Retry press: **Press/Tap feedback** `scale(0.97)`, `120ms ease-out`.
- Reduced motion: opacity only.

---

### 8. HomePlaceholder (minimal homepage — shell scope only)

**Purpose**: Replace the create-next-app splash with a minimal localized
heading + short intro + nav affordances. **No** featured chairs, brands, or hero
imagery (that's T13).
**Location**: `src/app/[locale]/page.tsx`. Server component. Strings via
`getTranslations("home")`.

**Layout**:
```
┌──────────────────────────────────────────────┐
│                                                │
│   Sillas ergonómicas para tu espalda           │  H1, text-2xl/3xl font-semibold
│                                                │
│   Encuentra la silla perfecta entre nuestras   │  text-sm/base text-muted-foreground
│   marcas y estilos.                            │
│                                                │
│   [ Ver sillas ]   Marcas →                    │  primary CTA + text link (dead ok)
│                                                │
└──────────────────────────────────────────────┘
```
`max-w-screen-xl mx-auto px-4 py-16 md:py-24`, left-aligned or centered column.

**States**:
| State | Visual | Behavior |
| --- | --- | --- |
| Default (only state) | Heading + intro + CTA | CTA links to `/sillas` (dead → 404s gracefully until T3) |
| Focus | Ring on CTA/link | Keyboard reachable |

**Responsive**: fluid type via the scale; single column mobile → wider desktop; no horizontal scroll.

**Animations**: none required. (Optional one-time `Fade in` of the H1 block,
`200ms ease-out`, reduced-motion → opacity only — but the shell should feel
instant, so prefer none.)

---

## Page Layout

### Global shell (every route) — `[locale]/layout.tsx`

```
DESKTOP (≥1024)                          MOBILE (375)
┌───────────────────────────────────┐   ┌─────────────────────────┐
│ SiteHeader (sticky?, border-b)    │   │ ☰  PosturPro   [EN]     │ h-14 border-b
├───────────────────────────────────┤   ├─────────────────────────┤
│                                   │   │                         │
│           {children}              │   │      {children}         │
│         (flex-1, grows)           │   │      (flex-1)           │
│                                   │   │                         │
│                                   │   │                         │
├───────────────────────────────────┤   ├─────────────────────────┤
│ SiteFooter (2–3 col, border-t)    │   │ SiteFooter (stacked)    │
└───────────────────────────────────┘   └─────────────────────────┘
                          [💬] fixed bottom-right (both), z-50
```
Body is `min-h-full flex flex-col`; `{children}` wrapper is `flex-1` so the
footer pins to the bottom on short pages (404/error). `<html lang={locale}>` is
set in this layout (not the thin root), from the active next-intl locale (AC-12).

---

## Interaction Flows

### Flow A — Switch language (AC-6, edge cases 5 & 8)
1. User taps the **LanguageToggle** (shows "EN" while in ES).
2. Client handler calls `router.replace(pathname, { locale: "en" })` from
   `src/i18n/navigation` — path preserved, segment rewritten (`/productos` →
   `/en/products`). `NEXT_LOCALE` cookie is set by next-intl.
3. Active label **crossfades** (`opacity`, 150ms ease-out) to the new target
   ("ES"). No full-page reload; RSC re-renders strings in the new locale.
4. If the user taps again mid-navigation, the transition is interruptible —
   last press wins; URL and rendered strings converge (no desync, no stuck
   spinner). Toggle is never disabled during pending.
5. Next visit: middleware reads `NEXT_LOCALE` and serves the persisted locale.
   A shared `/en/...` deep link renders EN with the toggle reflecting EN (edge 8).

### Flow B — Open mobile nav (< md)
1. User taps the **hamburger** (`aria-expanded=false → true`).
2. Drawer **slides in** from the left (`translateX(-100%)→0`, 300ms
   `--ease-drawer`) while the scrim **fades in**. Body scroll locks.
3. Focus moves into the panel (to the close button). Tab is trapped; Esc closes.
4. User taps a nav item → navigates → drawer closes; OR taps scrim / ✕ / Esc → closes.
5. Drawer **slides out** (200ms, faster), scrim fades. Focus returns to the
   hamburger trigger. Mid-open dismiss is interruptible (CSS transition retargets).
6. Reduced motion: opacity fade only, no slide.

### Flow C — Footer free-shipping line (AC-7, AC-15, edge case 2)
1. `[locale]/layout.tsx` renders `<SiteFooter/>` (async RSC).
2. Footer awaits `getStoreSettings()`.
3. Row present → render store name + `formatMXN(free_shipping_threshold_cents)` line.
4. Row absent / RLS denial / network error → wrapper returns `null` (logs a
   warning with context); footer omits the free-shipping line, store name falls
   back to `SEED_STORE_NAME`. Space is reserved so there's no layout shift.
5. Fully server-rendered — no client spinner, no CLS.

### Flow D — Hit a dead nav link (AC-10, edge case 1)
1. User clicks a nav item whose route isn't built yet (e.g. `/marcas`).
2. Next resolves no segment → `not-found.tsx` renders **inside the shell**.
3. User sees a localized "Página no encontrada" + "Volver al inicio" CTA →
   returns to localized `/`. App never blanks or crashes. An invalid locale
   (`/fr/...`) triggers `notFound()` the same way.

### Flow E — Reach the store on WhatsApp (AC-8, edge case 7)
1. If configured, the FAB is present bottom-right (popped in on mount).
2. User taps → opens `https://wa.me/<number>?text=<es prefill>` in a new tab
   (`rel="noopener noreferrer"`).
3. If the number is unconfigured, the FAB is absent entirely (no broken link);
   dev logs the absence.

---

## Accessibility Checklist

- [ ] All interactive elements (nav links, toggle, hamburger, drawer items,
      FAB, CTAs) have a visible `focus-visible:ring-2 ring-ring` focus ring.
- [ ] Hamburger has `aria-label` (dict) + `aria-expanded` reflecting drawer state
      + `aria-controls` pointing at the drawer.
- [ ] WhatsApp FAB (icon-only) has an `aria-label` from the dictionary; icon is
      `aria-hidden`.
- [ ] LanguageToggle has an `aria-label`; segmented options expose `aria-pressed`
      (or `aria-current`) for the active locale so color isn't the only indicator.
- [ ] Color is never the only indicator: active nav/locale also uses weight
      (`font-medium`) and/or `aria-current`; error state pairs color with icon + text.
- [ ] Drawer is a proper dialog (`role="dialog" aria-modal="true"`, labelled by
      its heading), traps focus, restores focus to the trigger on close, closes on Esc.
- [ ] Body scroll is locked while the drawer is open; scrim click closes.
- [ ] Tab order is logical: header (wordmark → nav → toggle → hamburger) →
      main → footer → FAB is reachable.
- [ ] `<html lang>` is the active locale (AC-12); `hreflang` alternates emitted
      by next-intl.
- [ ] Screen reader: locale change and navigation announce naturally via the
      route change; no silent state swaps. Error/404 headings are real `<h1>`.
- [ ] Contrast: `muted-foreground` on `background` meets ≥ 4.5:1 for footer body
      copy (verify with the neutral OKLCH values); `primary-foreground` on
      `primary` for the FAB meets ≥ 4.5:1.
- [ ] Keyboard: every flow (toggle, open/close drawer, navigate, retry, back-home)
      is fully operable without a pointer.
- [ ] Reduced-motion and hover-capability media queries gate all transform motion.

---

## Motion Specs Summary (AC-13 — the authoritative table)

| Element | Trigger | Property (transform/opacity only) | Easing (enter=ease-out) | Duration | Reduced-motion fallback |
| --- | --- | --- | --- | --- | --- |
| Mobile drawer panel | open / close | `transform: translateX(-100%)↔0` | `--ease-drawer` | enter 300ms / exit 200ms | `transform:none`; opacity fade ~200ms |
| Drawer scrim | open / close | `opacity 0↔1` | `--ease-drawer` | enter 300ms / exit 200ms | opacity only (unchanged) |
| WhatsApp FAB entrance | mount | `scale(0.95)+opacity:0 → scale(1)+opacity:1` (**Pop in**, never scale(0)) | `--ease-out` | 180ms | no transform; opacity or none |
| WhatsApp FAB hover | pointer hover (hover-capable only) | `transform: translateY(-1px)` + shadow | `ease` | 120ms | none |
| WhatsApp FAB press | `:active` | `transform: scale(0.97)` | `ease-out` | 120ms | none |
| LanguageToggle label | locale resolves | `opacity` (+ optional `scale(0.97)`) crossfade | `ease-out` | 150ms | opacity only, no scale |
| LanguageToggle press | `:active` | `transform: scale(0.97)` | `ease-out` | 120ms | none |
| Nav item hover | pointer hover (hover-capable only) | `background-color`/`color` | `ease` | 120ms | unchanged (color only) |
| Sticky header shadow (if sticky) | scroll past threshold | `box-shadow`/`opacity` of a shadow layer (not layout) | `ease-out` | 180ms | none |
| 404 / error text block | mount | `opacity 0→1` (+ optional `translateY(8px)→0`) | `ease-out` | 200ms | opacity only, no translate |

Baseline rules enforced everywhere: never `transition: all` (name the property);
never `ease-in` for UI; never `scale(0)`; exits faster than enters; all UI motion
< 300ms; transforms hover-gated behind `@media (hover: hover) and (pointer: fine)`;
all motion gated by `@media (prefers-reduced-motion: reduce)` to opacity-only/none;
drawer uses CSS **transitions** (not keyframes) so a mid-open dismiss is
interruptible.

---

## shadcn / Reuse Decisions

- **Button primitive** (`src/components/ui/button.tsx`) — reuse for the toggle,
  404/error CTAs, and WhatsApp anchor styling (`asChild`). Note: the primitive
  currently uses `transition-all`; that's an accepted exception for the existing
  primitive, but **new motion code in layout components must name properties.**
- **Sheet** — add the shadcn `Sheet` for the mobile drawer if it's in the
  registry (it wraps Radix Dialog → focus trap, Esc, scroll-lock, `aria-modal`
  for free). Otherwise use `radix-ui` `Dialog` directly. Do NOT hand-roll a
  drawer (avoids reimplementing focus management).
- **Icons** — `@hugeicons/react` + `@hugeicons/core-free-icons` only (hamburger,
  X/close, WhatsApp/chat, chevron). Never mix icon sets.
- **`cn()`** for all conditional classes. **No** new CSS files (Tailwind only).

---

## Brand-Swap Seam (for `dev-done.md` → `## Brand Tokens`)

To reskin PosturPro for a different chair brand, edit only:
1. `globals.css` `:root` (and `.dark`): `--primary`, `--primary-foreground`,
   `--background`, `--foreground`, `--border`, `--muted*`, `--accent*`, `--ring`,
   `--radius`.
2. `--font-sans` binding in the root `layout.tsx` (swap the one font).
3. `config.ts`: `SEED_STORE_NAME`, WhatsApp phone/message, contact email.

No component references a hex/oklch literal or a raw font family (AC-9 grep
gate). Every visual value flows through a token utility (`bg-primary`,
`text-foreground`, `font-sans`, `rounded-md`) or a config constant.
