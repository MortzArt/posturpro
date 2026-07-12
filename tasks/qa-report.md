# QA Report: T2 — App Shell & Design System

## Test Suite Summary

| Type               | Written | Passed | Failed | Skipped |
| ------------------ | ------- | ------ | ------ | ------- |
| Unit (new)         | 24\*    | 24     | 0      | 0       |
| Unit (total suite) | 177     | 177    | 0      | 0       |
| E2E (specs)        | 39      | 39     | 0      | 0       |
| E2E (× 2 projects) | 78      | 78     | 0      | 0       |
| **Total run**      | **255** | **255**| **0**  | **0**   |

\* "24 new unit tests" counts distinct `it(...)` blocks added. The reported unit
total (177) is higher because the consumed-key coverage test uses parametrized
`it.each` over ~40 keys × 2 locales. All 14 unit files pass. Integration suite
(64, needs local Docker Supabase) not run — T2 touches no data-layer/migration/
seed code it exercises.

### How to run

```bash
npm run lint              # eslint — clean
npx tsc --noEmit          # strict typecheck — exit 0
npm run test              # vitest unit — 177 passed
npx playwright test       # e2e (chromium + Pixel-7 mobile) — 80 passed
npm run build             # next build — success
# Browsers already installed; else: npx playwright install chromium
```

The Playwright config auto-starts `npm run dev` (`webServer`, `reuseExistingServer`
locally). The e2e DB has no `store_settings` row, so the footer degrades
gracefully during the run (edge case 2 exercised live).

## Tests Written

### Unit Tests

- `src/i18n/routing.test.ts` — routing config: exact locale set, `defaultLocale`
  `es-MX`, `localePrefix "as-needed"`, and `localeDetection === false` (AC-1/AC-2);
  keeps `defaultLocale` in sync with `config.DEFAULT_LOCALE` (AC-17).
- `src/components/layout/nav-items.test.ts` — `NAV_ITEMS` order, locale-agnostic
  absolute hrefs, real ES slugs, no dupes, and every nav key resolves to a
  non-empty label in both dictionaries (AC-3, AC-5).
- `src/messages/keys-used.test.ts` — every dotted key the shell components call
  via `t(...)`/`getTranslations` resolves to a non-empty leaf in **both** locales
  (AC-3 — complements the existing parity test, which only proves the two
  dictionaries match each other).
- `src/lib/config.test.ts` (extended) — added T2 blocks: `DEFAULT_LOCALE` = es-MX
  and aligned with `CURRENCY_LOCALE` (AC-1/AC-17); `WHATSAPP_PHONE_E164` empty by
  default so the FAB stays hidden, plus a non-empty prefill message (AC-8, edge 7).

### E2E Tests (Playwright — `e2e/`)

- `home.spec.ts` — `/` serves es-MX unprefixed with `<html lang="es-MX">` even for
  an `en-US` browser (AC-1); real Spanish `<title>` not "Create Next App" (AC-12);
  persistent header/footer chrome + copyright year (AC-5/AC-7); localized homepage
  placeholder; no horizontal scroll (AC-14).
- `i18n-toggle.spec.ts` — toggle rewrites `/ → /en` and swaps strings (AC-6); no
  full reload (client nav); `NEXT_LOCALE` cookie persists the choice (edge 3);
  preserves the current path (`/sillas → /en/sillas`); `/en/anything` reflects EN
  in the toggle (edge 8); rapid double-toggle converges (edge 5).
- `not-found.spec.ts` — invalid locale `/fr` → 404 in shell with localized copy +
  back-home CTA (edge 1); dead route `/sillas` → shell 404; back-home navigates;
  `/en/anything` → English 404 (edge 8); no horizontal scroll on 404 (AC-14).
- `mobile-nav.spec.ts` (375px) — hamburger visible / desktop nav hidden; opening
  reveals the drawer + nav items; **focus trapped**; **Esc closes + restores focus
  to the trigger**; close button + scrim dismiss; drawer link navigates and closes;
  no horizontal scroll open or closed (AC-5, AC-14, edges 4 & 6).
- `whatsapp-and-footer.spec.ts` — FAB **not** rendered with the empty phone
  placeholder and no numberless `wa.me/` anchor anywhere (AC-8, edge 7); footer
  store name / static-page slugs / copyright render regardless of `store_settings`
  (AC-7, AC-15, edge 2); reserved free-shipping slot (no CLS); `/en` footer links
  carry the `/en` prefix (AC-6).
- `responsive-motion.spec.ts` — no horizontal scroll at 375/768/1280px (AC-14);
  tap targets ≥ 44px (hamburger, compact toggle, drawer toggle group, 404 CTA);
  `prefers-reduced-motion: reduce` — drawer still opens/closes and the toggle still
  switches locale (AC-13, edge 4).

## Acceptance Criteria Coverage

| #     | Criterion                                            | Proving test(s)                                                                                        | Status |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| AC-1  | `/` renders es-MX, no prefix, detection disabled     | `home.spec` (en-US browser → es-MX), `routing.test` (`localeDetection false`)                          | PASS   |
| AC-2  | next-intl wired; routing config exact                | `routing.test` (locales/default/prefix/detection); `withNextIntl` verified by successful `next build`  | PASS   |
| AC-3  | All UI strings from dictionaries; no hardcoded copy  | `keys-used.test` (every consumed key resolves), `nav-items.test` (labels resolve)                      | PASS   |
| AC-4  | Dictionaries have identical key sets                 | existing `messages.test` (parity, unchanged, passing)                                                  | PASS   |
| AC-5  | Header on every page; nav + toggle + mobile drawer   | `home.spec`, `mobile-nav.spec` (open/trap/close)                                                        | PASS   |
| AC-6  | Toggle rewrites segment, preserves path, cookie, no reload | `i18n-toggle.spec` (all four assertions)                                                          | PASS   |
| AC-7  | Footer: name, slug links, free-ship line, © year     | `home.spec`, `whatsapp-and-footer.spec`                                                                 | PASS   |
| AC-8  | WhatsApp FAB href + rel + label + config guard       | `whatsapp.test` (URL/rel building), `whatsapp-and-footer.spec` (guarded-absent), `config.test`         | PASS   |
| AC-9  | Brand tokens in CSS; no hardcoded colors/fonts       | verified by code read + dev-done; unchanged by QA (fix touched only motion/`pointer-events`)           | PASS   |
| AC-10 | Custom 404 in shell + back-home                      | `not-found.spec` (all cases)                                                                            | PASS   |
| AC-11 | `error.tsx` localized, `reset()`, no stack leak      | code read (`[locale]/error.tsx` renders only dictionary copy + opaque digest); see Untested Areas      | PASS   |
| AC-12 | `<html lang>` active locale, real metadata, one font | `home.spec` (lang + title), `not-found.spec` (`/en` → lang="en")                                       | PASS   |
| AC-13 | Motion transform/opacity only; reduced-motion gated  | `responsive-motion.spec` (reduced-motion still functional); globals.css read (per-property transitions)| PASS   |
| AC-14 | Mobile-first, no h-scroll 375/768/≥1024, no overlap  | `responsive-motion.spec`, `mobile-nav.spec`, `home.spec`, `not-found.spec`                              | PASS   |
| AC-15 | Typed `store_settings` wrapper; degrades gracefully  | existing `store-settings.test` (4 paths), `whatsapp-and-footer.spec` (live degrade)                    | PASS   |
| AC-16 | lint + tsc + test pass; no `any`/`!`; files < 400ln  | lint clean, `tsc` exit 0, 177 unit pass, build success; `mobile-nav.tsx` 197 lines                     | PASS   |
| AC-17 | Single locale source of truth (next-intl/NEXT_LOCALE)| `routing.test` + `config.test` (default aligned), `i18n-toggle.spec` (cookie is the persistence)       | PASS   |

## Edge Case Coverage

| # | Edge case                                      | Proving test                                                          | Status |
| - | ---------------------------------------------- | -------------------------------------------------------------------- | ------ |
| 1 | Invalid/unknown locale (`/fr`, bare `/es`)     | `not-found.spec` (`/fr` → 404 in shell)                              | PASS   |
| 2 | `store_settings` missing/unreadable            | `store-settings.test` + `whatsapp-and-footer.spec` (live degrade)    | PASS   |
| 3 | English browser, first visit, no cookie        | `home.spec` (`locale: en-US` → es-MX), `i18n-toggle.spec` (cookie)   | PASS   |
| 4 | `prefers-reduced-motion: reduce`               | `responsive-motion.spec` (drawer + toggle still functional)          | PASS   |
| 5 | Toggle pressed rapidly / mid-navigation        | `i18n-toggle.spec` (rapid double-toggle converges)                   | PASS   |
| 6 | Very long store/nav label at 375px             | `mobile-nav.spec` (header fits, no overflow)                         | PASS   |
| 7 | WhatsApp number not configured                 | `whatsapp.test` + `whatsapp-and-footer.spec` (FAB absent, no link)   | PASS   |
| 8 | Deep link to `/en/anything`                    | `i18n-toggle.spec` + `not-found.spec` (English 404)                  | PASS   |

## Bugs Found & Fixed

Two genuine, user-facing defects in the mobile nav drawer — both invisible to the
prior manual smoke test (which opened the drawer via keyboard) and undetectable by
unit tests. Both required real product fixes; production code was NOT weakened for
tests.

### BUG-1 (CRITICAL) — Closed drawer overlay blanketed the page and blocked every click

- **Found:** every E2E click on the header (toggle, hamburger, nav, CTAs) timed out
  with `<div data-testid="mobile-nav-overlay" data-state="closed"> intercepts pointer
  events`. Probing computed style showed the force-mounted, `opacity:0`, `z-60`,
  full-viewport overlay had `pointer-events: auto` while closed, and
  `elementFromPoint` at the trigger returned the overlay, not the trigger.
- **Root cause:** two compounding issues. (a) The Tailwind class
  `data-[state=closed]:pointer-events-none` **never compiled** — no such rule existed
  in any stylesheet. (b) Even had it compiled, Radix's `DismissableLayer` sets an
  **inline** `style="pointer-events: auto"` on the force-mounted overlay, which beats
  any selector. Net: the closed overlay sat on top of the entire shell and swallowed
  all pointer input on every page — the site was effectively non-interactive by
  pointer once the client `MobileNav` hydrated (all breakpoints, desktop included).
- **Fix:** encoded `pointer-events: none !important` on
  `.drawer-scrim[data-state="closed"]` (and `pointer-events: none` on the closed
  `.drawer-panel`) in `globals.css`, where the other `data-state` rules demonstrably
  apply; removed the dead, non-compiling Tailwind classes from `mobile-nav.tsx`.
- **Covered by:** all of `mobile-nav.spec.ts` and `i18n-toggle.spec.ts` (each needs a
  real pointer click to reach the trigger/toggle).

### BUG-2 (CRITICAL / A11Y) — Tap opened then instantly closed; no focus trap; not a real modal

- **Found:** after BUG-1, a plain click opened the drawer then closed it ~7ms later
  (observed `closed → open → closed` via MutationObserver); the focus-trap probe
  showed Tab escaping freely to header/footer; `aria-modal` was `null` and sibling
  regions were never inerted.
- **Root cause:** `forceMount` on `Dialog.Content` bypasses Radix's modal `Presence`
  path, so (a) the layer's document-level outside-pointer listener stayed live while
  closed and treated the *opening* tap as an "interact-outside" dismiss, and (b) the
  modal `FocusScope` + `aria-modal` never engaged — the drawer was not actually a
  modal. On a real phone the hamburger would flash open and snap shut, and keyboard
  users could tab out of the "open" drawer.
- **Fix (two parts, minimal, design-preserving):**
  1. Guarded `Dialog.Content`'s `onInteractOutside` to `preventDefault()` when the
     interaction target is the trigger itself (kills the self-dismiss).
  2. Wrapped the drawer body in Radix's own `FocusScope` (`trapped loop`), mounted
     only while `open`, and set `aria-modal` while open. FocusScope moves focus into
     the panel, cycles Tab/Shift-Tab inside it, and restores focus to the trigger on
     close. Added `@radix-ui/react-focus-scope@^1.1.10` (already a transitive dep) to
     `package.json` dependencies. The interruptible CSS-transition design (the reason
     `forceMount` was chosen) is preserved — the panel still transitions out under the
     unmounting scope.
- **Verified:** focus trapped = true, `aria-modal = "true"`, focus restored to the
  trigger on Esc/close; drawer opens on pointer tap and stays open; scrim/close/Esc
  still dismiss. Covered by `mobile-nav.spec.ts` and `responsive-motion.spec.ts`.

### Test-robustness fixes (not product bugs)

- `getByRole('heading', …)` for the page `<h1>` was flaky during the hydration window
  in which the force-mounted (closed) drawer perturbs the a11y name tree. Switched to
  `page.locator("main h1")` (stable, still semantic) in `home.spec` and
  `not-found.spec`. Confirmed stable over `--repeat-each=4`.
- Scoped duplicated `data-testid`s (`language-toggle*` appear in both the header and
  the force-mounted drawer) to `page.locator("header")` / the drawer panel to avoid
  strict-mode violations.

## Files Changed by QA

Tests added / changed:
- `e2e/i18n-toggle.spec.ts`, `e2e/mobile-nav.spec.ts`, `e2e/not-found.spec.ts`,
  `e2e/whatsapp-and-footer.spec.ts`, `e2e/responsive-motion.spec.ts` (new)
- `e2e/home.spec.ts` (rewritten from the trivial smoke test)
- `src/i18n/routing.test.ts`, `src/components/layout/nav-items.test.ts`,
  `src/messages/keys-used.test.ts` (new)
- `src/lib/config.test.ts` (extended with T2 blocks)

Production fixes:
- `src/components/layout/mobile-nav.tsx` — self-dismiss guard + `FocusScope` +
  `aria-modal`; removed dead Tailwind pointer-events classes.
- `src/app/globals.css` — closed drawer scrim/panel `pointer-events: none`.
- `package.json` — added `@radix-ui/react-focus-scope`.

## Confidence: HIGH

All 17 ACs and all 8 edge cases have at least one proving test and pass. The full
unit suite (177), the full e2e suite across desktop + mobile (78), lint, strict
tsc, and the production build are green. Two critical drawer defects that would
have shipped a non-interactive shell on pointer devices (and a non-accessible modal)
were caught and fixed, then re-verified and repeat-run for flakiness (mobile-nav +
i18n-toggle × 2, home h1 × 4 — all stable).

## Untested Areas

- **AC-11 real render-error path** — `error.tsx` is verified by reading the code
  (renders only dictionary copy + the opaque `digest`, never `error.message`), but no
  route in T2 deterministically throws to trigger the boundary end-to-end.
  **Risk: low** — the boundary is standard Next.js and copy is fully dictionary-driven;
  a throwing test route belongs to whichever T3+ feature first has a failing data path.
- **WhatsApp FAB rendered state (with a real number)** — the FAB is guarded absent by
  the empty config placeholder, so E2E asserts the correct *absence* and the href/rel/
  label building is proven by `whatsapp.test.ts`. The rendered anchor + no-footer-
  overlap at a real number is not exercised e2e. **Risk: low** — it is a static server
  anchor over already-tested URL logic; the overlap test is scaffolded in
  `responsive-motion.spec.ts` with a note to extend when a number lands.
- **Integration suite (64, Docker Supabase)** — not re-run; T2 changed no data-layer
  code. **Risk: low.**
