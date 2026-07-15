# UX Audit: T10 — Admin foundation (login · shell · dashboard · Store Settings)

> Stage 8 (ultraux). Overwrites the T8 audit per pipeline convention.

Audited the real rendered surfaces on a dev server (Playwright, 320→1440px,
keyboard-only, reduced-motion) against `ui-design.md` + `next-ticket.md`,
cross-checked copy/testids against `qa-report.md`. Fixes applied directly; DB left
pristine, no stray servers, no commit.

## Summary
- Components audited: 6 (`admin-shell`, `admin-nav`, `login-form`, `store-settings-form`, `logout-button`, `admin-page`) + 4 route files.
- Issues found: 2 (🔴 0, 🟡 2, 🟢 0) — both fixed.
- Issues fixed: 2/2.
- States missing: 0 (every spec'd state renders and is reachable).
- Verdict: genuinely high-craft work. Spec fidelity is near-total; the two findings are small visual-consistency defects, not missing states or a11y holes.

## Findings

### 🔴 Critical UX Issues
None.

### 🟡 Major UX Issues
1. `store-settings-form.tsx:279,296` — **Money fields double-dimmed while pending.** The bordered wrapper `<div>` applied `opacity-60` on `disabled` AND the inner `<input>` re-applied `disabled:opacity-60`, compounding to ~0.36 effective opacity. During a save ("Guardando…") the two money fields looked markedly fainter (0.36) than the text fields (0.60), reading as broken rather than disabled. **Fixed:** removed `disabled:opacity-60` from the inner input; the wrapper (which owns the visible border/box) now dims once to `0.60`, matching the text fields. Verified live during a pending save: money wrapper opacity `0.6` / inner input `1` (= 0.6 effective), text field `0.6` — now identical.

2. `admin-nav.tsx:77` — **Disabled "Productos"/"Pedidos" labels near-illegible.** The whole row used `text-muted-foreground/60`, giving the label text ~1.90:1 contrast on `bg-card` — well below readable. These are `aria-disabled` placeholders (WCAG-exempt from 1.4.3), but the spec's intent (design principle 5, AC-11) is that they *communicate the roadmap* — the operator must be able to read them. **Fixed:** label text now uses full `text-muted-foreground` (≈4.7:1, readable); the "disabled" signal is carried by the dimmed icon (`text-muted-foreground/60`), `cursor-not-allowed`, and the "próximamente" `Badge` — so meaning is never on color/opacity alone and the label is legible.

### 🟢 Polish Items
None outstanding. The Next.js dev-tools "N" indicator overlaps the sidebar/drawer logout row in screenshots — a **dev-only overlay** (absent from production builds), not a product defect; no change made.

## States Audit
| Component | Loading/Pending | Empty/Row-missing | Error | Success | Mobile | A11y |
|-----------|-----------------|-------------------|-------|---------|--------|------|
| LoginForm | ✅ (fields+btn disabled, "Iniciando sesión…") | n/a | ✅ generic banner (bad-creds / rate-limited / unavailable), email preserved, pw cleared | ✅ (redirect is the confirmation) | ✅ | ✅ |
| StoreSettingsForm | ✅ (all fields disabled, "Guardando…") | ✅ info banner + SEED_* seed (edge 8) | ✅ inline field errors + top-level DB banner | ✅ `role=status` banner, focus moves to it, form stays editable | ✅ 1-col, `min-h-11`, `inputmode=decimal` | ✅ aria-invalid + aria-describedby, focus-first-invalid |
| AdminShell/Nav | n/a | n/a | n/a | active `aria-current` + `bg-muted` | ✅ topbar + slide-in drawer (Esc/scrim/nav close; focus trap + return) | ✅ skip-link, `<nav aria-label>`, soon items out of tab order |

Edge states verified reachable: rate-limited + unavailable banners map correctly in `resolveBannerMessage`; row-missing banner + seed via `settings/page.tsx`; unauthenticated re-verify is server-side (redirect, not a rendered state).

## Accessibility Audit
| Check | Status | Details |
|-------|--------|---------|
| Focus rings | ✅ | `focus-visible:ring-2 ring-ring/30` on fields, buttons, nav links; money wrapper uses `focus-within`. Confirmed visible on login email at 1440px. |
| Focus management | ✅ | Login fail → banner focused (NOT a field, preserving AC-3 ambiguity); settings invalid → first invalid field; save success → success banner. Verified live via `document.activeElement`. |
| Drawer focus trap + return | ✅ | Open → focus into drawer (close btn); Esc → closes, focus returns to `admin-nav-trigger`. Interruptible (`forceMount` + closing buffer). |
| Aria labels | ✅ | Icon-only mobile toggle `aria-label="Abrir menú"/"Cerrar menú"`; decorative icons `aria-hidden`; logout `aria-label`. |
| Live regions | ✅ | login error `role=alert aria-live=assertive`; field errors `role=alert`; success `role=status aria-live=polite`. |
| Keyboard nav / tab order | ✅ | Login: email→password→submit. Settings: skip-link→nav→logout→4 fields→submit. Soon items (`<span>`, tabIndex −1) correctly skipped. |
| Color contrast | ✅ (after fix) | fg/bg 19.8:1; muted-fg 4.73:1; destructive text 4.76:1; disabled-nav label raised 1.90:1 → 4.7:1 (finding 2). Badge 16.4:1. |
| Color not sole indicator | ✅ | errors = icon+text; active nav = aria-current+weight+bg; disabled nav = badge+icon+cursor. |
| lang / reduced-motion | ✅ | `<html lang="es-MX">`; reduced-motion renders (enter-fade drops transform, keeps opacity; drawer drops slide). |
| Tap targets ≥44px | ✅ | nav-trigger 44×44, nav-close 44×44 measured; fields/buttons `min-h-11`. |

## Motion Audit (Emil + Apple + review-animations bar)
| Aspect | Status | Notes |
|--------|--------|-------|
| Reused classes only | ✅ | `.enter-fade`, `.nav-hover`, `.drawer-panel`/`.drawer-scrim` — zero new motion CSS. |
| Enter easing | ✅ | `--ease-out` on all enters; drawer `--ease-drawer`; exit (200ms) faster than enter (300ms). |
| transform/opacity only | ✅ | enter-fade = opacity+translateY; drawer = transform+opacity; no layout-property animation. |
| No scale(0) | ✅ | enter-fade starts translateY(8px)+opacity, never scale(0). |
| Frequency restraint | ✅ | occasional surfaces animate; high-frequency nav = color-only, gated `@media (hover:hover)`. |
| Interruptible | ✅ | drawer is Radix Dialog + CSS transition, grabbable/reversible; Esc mid-open works. |
| prefers-reduced-motion | ✅ | handled by the reused classes; verified render. |

## Responsiveness Audit
Swept 320 / 375 / 768 / 1024 / 1440px on login + settings + nav. **No horizontal scroll at any breakpoint** (measured `scrollWidth > innerWidth` = false everywhere). Login: identical centered `max-w-sm` card. Settings: single-column `max-w-md`, full-width button <640, `self-end` ≥640; sidebar `w-56`→`w-60`. Mobile <768: sticky top bar + hamburger + compact logout; drawer `85vw max-w-xs`. Money `inputmode="decimal"` set (decimal keypad on mobile).

## Copy Review (es-MX)
Reviewed all inline Spanish copy; grammar/tone correct, actionable, no enumeration leak. **No copy changed** — so no `qa-report.md` E2E text expectation was touched (admin e2e assert on `data-testid` + role/URL; 30/30 still pass).
| Location | Text | Assessment |
|----------|------|-----------|
| login banner | "Correo o contraseña incorrectos." | ✅ generic, no field blame (AC-3) |
| login banner | "Demasiados intentos. Intenta de nuevo en unos minutos." | ✅ actionable |
| login banner | "El acceso de administrador no está disponible." | ✅ generic, no stack trace |
| settings money | "Usa punto decimal y sin separadores de miles, p. ej. 1500.00." | ✅ tells the user exactly what to do (edge 7) |
| settings money | "Ingresa un monto (usa 0 para gratis)." | ✅ clarifies blank≠0 (edge 6) |
| row-missing | "No se encontró la configuración… guarda para crearla." | ✅ explains + CTA (edge 8) |
| success | "Configuración guardada." | ✅ |

## Fixes Applied vs Deferred
- **Fixed:** (1) money-field double-dim on pending; (2) disabled-nav label legibility. Both className-only, behavior-preserving.
- **Deferred:** none. The dev-tools overlay is not a product concern.

## Verification Results
- `npx tsc --noEmit`: **0 source errors** (only stale `.next/dev/types` artifacts, ignored).
- `npx eslint` (both touched files): **clean**.
- Unit: `npx vitest run` → **1370/1370 (78 files)**, 0 failed — unchanged baseline (edits are class strings, no logic).
- E2E admin: `ADMIN_LOGIN_RATE_LIMIT_DISABLED=1 npx playwright test admin.spec.ts` → **30/30** (chromium + mobile) on the dev server.
- Pending-state opacity fix re-verified live: money wrapper 0.6 / input 1 == text field 0.6.
- DB pristine (flat 50000¢/$500.00, threshold 1000000¢/$10000.00, name PosturPro — seeded values; round-trip e2e self-restores). Dev server killed, port 3000 clear. No commit.

## UX Score: 9.5/10
Near-flawless spec fidelity: every state, focus transition, tap target, and motion rule is correct, and the storefront design language is reused verbatim at the intended higher density. The only two blemishes were a compounded-opacity pending bug and an over-faded disabled label — both now fixed. Half a point withheld only because those shipped at all in an otherwise exacting implementation.
