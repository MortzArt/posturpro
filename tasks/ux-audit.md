# UX Audit: T2 — App Shell & Design System

Auditor: ultraux (Stage 8). Surfaces reviewed live in both locales (es-MX default,
en opt-in) at 375 / 768 / 1280px via Playwright, plus the 404 shell and the mobile
drawer. Taste authorities applied: `emil-design-eng`, `apple-design`, and the
`improve-animations` 8-category motion method.

## Summary

- Components audited: 8 (SiteHeader, LanguageToggle, MobileNav drawer, SiteFooter,
  WhatsAppButton, NotFound, ErrorBoundary, HomePlaceholder) + globals.css motion layer
- Issues found: 5 (🔴 0, 🟡 3, 🟢 2)
- Issues fixed: 5 / 5
- States missing: 0 (all states from the design spec were present in code)
- Copy: reviewed in both locales — **no changes needed** (ES is natural + tú-consistent,
  EN parity complete). This also protects every E2E text assertion.

The T2 shell entered this stage in strong shape — QA had already fixed two critical
drawer defects (dead closed-overlay, self-dismiss/focus-trap). The findings here are
polish and motion-fidelity: none block, none embarrassing.

## Findings

### 🔴 Critical UX Issues

None.

### 🟡 Major UX Issues

1. **`language-toggle.tsx` / `globals.css` (`.toggle-label`)** — the AC-13 motion table
   specifies a 150ms opacity(+scale 0.97) **crossfade** on the toggle label when the
   locale resolves, but the `.toggle-label` transition was inert: nothing ever changed
   its `opacity`, so no transition fired. The label snapped. **Fixed:** added an
   `@starting-style { opacity:0; transform:scale(0.97) }` to `.toggle-label`. The compact
   button keys its label to the target locale, so switching remounts the span and the
   starting style makes it genuinely crossfade in — now matching the motion table.
   Reduced-motion variant crossfades opacity only (no scale). Verified functional under
   `prefers-reduced-motion` by the existing `responsive-motion.spec` toggle test.

2. **`[locale]/page.tsx` — secondary "Marcas / Brands" link hover inverted emphasis.**
   The link was `text-foreground` and hovered to `text-muted-foreground` — hover made it
   *dimmer*, the opposite of the expected affordance (hover should draw the eye, not push
   it away). **Fixed:** baseline is now `text-muted-foreground` and hover promotes to
   `text-foreground` (standard secondary-link behavior), so it reads as clearly secondary
   at rest and lights up on hover.

3. **`error.tsx` — dynamically-mounted error screen was not announced to screen readers.**
   The boundary appears after a render failure but had no live region, so a SR user got no
   notification the page changed to an error state. **Fixed:** the error `<section>` now
   carries `role="alert" aria-live="assertive"`, so the localized "Algo salió mal" /
   "Something went wrong" heading + body are announced on mount. Copy is still
   dictionary-only (no stack/PII leak — AC-11 preserved).

### 🟢 Polish Items

1. **Segmented language toggle — active state was too faint.** Active option used
   `bg-accent` (OKLCH 0.97, near-white) on a white page inside a white-bordered box; the
   selected locale was barely distinguishable from the unselected one. **Fixed:** adopted
   the standard segmented-control pattern — the group track is now `bg-muted` and the
   active option is a raised thumb (`bg-background` + `shadow-sm` + `text-foreground`
   `font-medium`). Immediately legible, still 100% token-based (AC-9 safe: no hex/oklch
   literal added), and `aria-pressed` still carries the state non-visually.

2. **Home "Marcas →" arrow — added a directional hint.** The arrow now nudges
   `translateX(2px)` on hover (Apple #8, hint in the gesture direction). transform-only,
   gated behind `@media (hover: hover) and (pointer: fine)` so it never sticks on touch,
   and dropped entirely under `prefers-reduced-motion`. Fixed: yes.

## Motion Audit (8-category method vs. the AC-13 spec table)

| Category | Verdict | Notes |
|----------|---------|-------|
| 1. Purpose & frequency | ✅ | Persistent chrome (header/footer) has no mount animation — correct for high-frequency surfaces. Drawer/FAB/404 fade only occasional surfaces. No decoration-only motion on frequent actions. |
| 2. Easing & duration | ✅ | Custom curves (`--ease-out`, `--ease-drawer`) defined and used; all UI motion < 300ms; enter uses ease-out; drawer exit (200ms) faster than enter (300ms). No `ease-in`. |
| 3. Physicality | ✅ | FAB pops from `scale(0.95)` (never `scale(0)`); press feedback `scale(0.97)`; drawer slides its own width via `translateX(-100%)`. |
| 4. Interruptibility | ✅ | Drawer uses CSS **transitions** (not keyframes) → mid-open dismiss retargets. Toggle nav runs in `useTransition`, never disabled → last-press-wins. |
| 5. Performance | ✅ | Only `transform`/`opacity`/`box-shadow` animated; no `transition: all` in any shell component; `will-change` scoped to the open drawer only (QA m-4). |
| 6. Accessibility | ✅ | Every motion class has a `prefers-reduced-motion: reduce` branch → opacity-only/none; hover transforms gated behind `hover:hover`. Fixed toggle crossfade keeps its reduced-motion branch. |
| 7. Cohesion | ✅ | Same easing tokens + sub-300ms durations across drawer, FAB, toggle, enter-fade — one motion language. |
| 8. Missed opportunities | ✅ (addressed) | Toggle crossfade was specced-but-inert (🟡 #1, fixed); "Marcas →" arrow had no directional hint (🟢 #2, fixed). |

The `Button` primitive still uses `transition-all` + `active:translate-y-px` — this is
the documented pre-existing shadcn exception (per the UI-design "shadcn / Reuse
Decisions" note); new shell motion names its properties. Left as-is by design.

## States Audit

| Component | Loading | Empty | Error | Success | Mobile | A11y |
|-----------|---------|-------|-------|---------|--------|------|
| SiteHeader | ✅ SSR, instant | n/a | n/a | ✅ | ✅ truncate + shrink-0 | ✅ nav landmark, focus rings |
| LanguageToggle | ✅ pending non-blocking | n/a | n/a | ✅ crossfade (now real) | ✅ compact 44px | ✅ `aria-pressed`, `aria-label`, weight+thumb (not color-only) |
| MobileNav drawer | n/a | n/a | n/a | ✅ | ✅ 85vw / 44px rows | ✅ dialog, focus trap, Esc, restore focus, `aria-modal` |
| SiteFooter | ✅ SSR resolved | ✅ degrades (no free-ship line) | ✅ `null`→fallback name | ✅ | ✅ stacks | ✅ nav landmarks, reserved slot (no CLS) |
| WhatsAppButton | n/a | ✅ config-guard hides | ✅ hidden when unconfigured | ✅ | ✅ safe-area inset, no overlap | ✅ `aria-label`, icon `aria-hidden`, ring-offset |
| NotFound (404) | n/a | n/a | ✅ (is the state) | n/a | ✅ centered | ✅ real `<h1>`, code `aria-hidden`, CTA 44px |
| ErrorBoundary | n/a | n/a | ✅ + `role=alert` (added) | n/a | ✅ centered | ✅ real `<h1>`, retry 44px, no leak, now announced |
| HomePlaceholder | ✅ SSR | n/a | n/a | ✅ | ✅ fluid type | ✅ ring, CTA 44px, corrected secondary-link hover |

## Accessibility Audit

| Check | Status | Details |
|-------|--------|---------|
| Focus rings | ✅ | `focus-visible:ring-2 ring-ring` on every interactive element; skip-link appears on focus. |
| Aria labels | ✅ | Hamburger (`aria-label` + `aria-expanded` via Radix + dialog), FAB (`aria-label`, icon `aria-hidden`), toggle (`aria-label` + `aria-pressed`), footer nav groups labelled. |
| Color contrast | ✅ | `muted-foreground` on `background` ≈ 4.7:1 (AA for normal text); `primary-foreground` on `primary` ≈ 17:1; `foreground` on `background` ≈ 20:1. FAB label meets AA. |
| Keyboard nav | ✅ | Tab order header→main→footer; drawer traps + restores focus (QA-verified); toggle Enter/Space; Esc closes drawer; retry/back-home reachable. |
| Color not sole indicator | ✅ | Active locale = raised thumb + `font-medium` + `aria-pressed`; error = icon + text + `role=alert`. |
| `<html lang>` | ✅ | Active next-intl locale (`es-MX`/`en`), never hardcoded; hreflang alternates emitted by next-intl. |
| Live regions | ✅ (improved) | Error boundary now `role="alert" aria-live="assertive"`; route changes announce naturally. |
| Reduced motion / hover gating | ✅ | All transform motion gated by `prefers-reduced-motion` + `hover:hover` media queries, including the two new motion rules. |

## Copy Review (both locales)

No copy was changed — the dictionaries were audited and found natural, register-consistent
(informal **tú** throughout ES: "tu espalda", "Encuentra", "Inténtalo", "buscas",
"Contáctanos"), actionable, and at full EN parity. Every string is dictionary-driven
(AC-3); no hardcoded UI text. Verified E2E-load-bearing substrings are untouched:
`nav.items.catalog` EN still "Chairs" (asserted `/chairs/i`), home H1 ES still "Sillas
ergonómicas…" (`/sillas ergonómicas/i`), 404 EN still "Page not found" (`/page not
found/i`), title still "PosturPro…".

| Location | Before | After | Reason |
|----------|--------|-------|--------|
| — | — | — | No copy changes were warranted; ES/EN dictionaries pass the register + parity + actionability bar as written. |

## Responsiveness

Verified via full-page screenshots + programmatic overflow check (`scrollWidth >
clientWidth`) at 375 / 768 / 1280px, both locales, home + 404 + open drawer:

- **375px**: single row header (hamburger · wordmark · compact toggle), no wrap/overflow;
  footer stacks; drawer 85vw with 44px rows; **no horizontal scroll** at any surface.
- **768px**: inline nav appears, hamburger hidden; footer 2-col; toggle segmented.
- **1280px**: full nav, `max-w-(--breakpoint-xl)` centered gutter; footer 3-col.
- WhatsApp FAB absent by config (empty phone) — its `z-50` + safe-area inset + no-overlap
  guard remain correct for when a number lands (scaffolded in `responsive-motion.spec`).

Note: the dark "N" disc at bottom-left in dev screenshots is the **Next.js dev-tools
indicator**, not shell code — confirmed absent from the production build output (no such
element in shipped markup).

## Files Changed by UX

- `src/app/globals.css` — real toggle-label crossfade (`@starting-style` on `.toggle-label`
  + reduced-motion branch); new `.link-arrow` directional-hint motion (hover-gated,
  reduced-motion-safe).
- `src/components/layout/language-toggle.tsx` — segmented control: `bg-muted` track +
  `bg-background shadow-sm` active thumb (token-based; clearer active state).
- `src/app/[locale]/page.tsx` — corrected secondary "Marcas" link hover emphasis; arrow
  `className="link-arrow"`.
- `src/app/[locale]/error.tsx` — `role="alert" aria-live="assertive"` on the error section.

No E2E test files needed changes (no copy or testid changed; all assertions still hold).

## Verification (all green)

- `npm run lint` — clean
- `npx tsc --noEmit` — exit 0
- `npm run test` — 177 / 177 unit pass
- `npx playwright test` — 78 / 78 e2e pass (chromium + Pixel-7 mobile)
- `npm run build` — success (pre-existing, documented `store_settings` dynamic-usage
  notice is the graceful-degrade path, not a regression)

## UX Score: 9/10

The shell is quiet, fast, fully server-rendered chrome with complete state coverage,
genuine accessibility (focus trap + restore, live-region errors, no color-only signals,
AA contrast), correct mobile-first responsiveness, and a now-cohesive, fully
reduced-motion-safe motion layer that matches the AC-13 spec table (including the toggle
crossfade that was previously inert). Held from 10/10 only by things deliberately out of
T2 scope: the real brand palette/font are still neutral placeholders, and the FAB's
rendered (configured-number) state is unexercised until a number lands.
