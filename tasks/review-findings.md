# Code Review: T2 — App Shell & Design System

## Summary

A strong, disciplined implementation: i18n wiring is textbook next-intl v4, the motion layer genuinely clears the craft bar (CSS transitions for interruptibility, `@starting-style` entrances, correct reduced-motion + hover gating), and the server/client split is right. All gates pass (`tsc` strict clean, `eslint` clean, 86 unit tests pass). But there are real defects: a broken font-token reference, a documentation lie in the brand-swap block that AC-9 explicitly grades, dead code shipped (`sheet.tsx`), and two accessibility/spec violations (sub-44px tap targets on the primary CTAs and the mobile toggle) that contradict the ticket's own AC-14/UX table.

## Critical Issues (MUST FIX)

### C-1: `--font-mono` points at a deleted font variable
- **ID**: C-1
- **Severity**: CRITICAL
- **File**: `src/app/globals.css:11`
- **Problem**: `--font-mono: var(--font-geist-mono);`. The Geist tangle was removed in this task (AC-12) — `--font-geist-mono` is no longer defined anywhere (grep confirms zero definitions). Any element resolving `font-mono` now gets an unresolved custom property.
- **Impact**: The `--font-mono` token is silently dead and is a lingering Geist ghost, contradicting AC-12 "single, intentional font wiring (no Geist … tangle)". It will bite the first time any component uses `font-mono` (code blocks in T3+). The token system is meant to be the single source of design truth (AC-9); a token pointing at a non-existent variable is a broken seam.
- **Suggested Fix**: Either bind a real mono font in `fonts.ts`, or (preferred for T2, mono unused) set a system stack `--font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;`, or remove the `--font-mono` line and its `@theme` `--color`/mono mapping entirely.
- **Status**: OPEN

### C-2: Brand-swap documentation points to the wrong file for the font
- **ID**: C-2
- **Severity**: CRITICAL (AC-9 explicitly grades the brand-token doc)
- **File**: `src/app/globals.css:159-160` (disagrees with `tasks/dev-done.md` Brand Tokens §3)
- **Problem**: The `BRAND TOKENS` block in `globals.css` says: "Font: the `--font-sans` binding in `src/app/layout.tsx` (swap the one next/font family)". The font is NOT in `layout.tsx` — that file was thinned to a pass-through (`return children;`). The font lives in `src/app/fonts.ts` (`Inter(...)`). `dev-done.md` correctly says `src/app/fonts.ts`, so the two brand-swap docs disagree, and the authoritative in-code one (the AC-9 seam) is wrong.
- **Impact**: AC-9 requires the brand-token block to "describe exactly what to edit for a brand swap." It sends the next engineer to a file that no longer contains the font — the exact "shipping it wrong forces expensive rework" risk the ticket's Priority section calls out.
- **Suggested Fix**: In `globals.css:159-160`, change "`src/app/layout.tsx`" → "`src/app/fonts.ts`".
- **Status**: OPEN

## Major Issues (SHOULD FIX)

### M-1: `sheet.tsx` shipped as dead code (and it violates the AC-13 motion baseline)
- **ID**: M-1
- **Severity**: MAJOR
- **File**: `src/components/ui/sheet.tsx` (147 lines, 0 importers)
- **Problem**: The dev correctly built the drawer on raw Radix Dialog for interruptibility, then also added the shadcn `Sheet` "as an available primitive." Nothing imports it (grep for importers = empty). CLAUDE.md Clean Code: "No dead code … delete unused code (git remembers)." The design spec (§MobileNav) said Sheet **if** addable **otherwise** Radix — an either/or, not both.
- **Impact**: 147 lines of unmaintained, untested UI. `sheet.tsx` uses `transition-all` and tw-animate-css `animate-in slide-in-from-*` keyframes — both direct AC-13 baseline violations (`transition: all`; non-interruptible keyframes on a drawer). If a future dev reaches for it, they inherit a drawer that fails this task's own motion bar.
- **Suggested Fix**: Delete `src/components/ui/sheet.tsx`. Re-add via the registry when a real consumer exists.
- **Status**: OPEN

### M-2: Primary CTAs are 32px tall — fail the ≥44px tap-target requirement
- **ID**: M-2
- **Severity**: MAJOR
- **File**: `src/app/[locale]/not-found.tsx:26`, `src/app/[locale]/error.tsx:46`, `src/app/[locale]/page.tsx:33` (all `<Button size="lg">`)
- **Problem**: This repo's `Button` primitive defines `size: "lg"` as **`h-8`** (32px) — an unusually compact scale (`button.tsx:28`; default is `h-7`/28px). The UX Requirements → Tablet explicitly require "Comfortable tap targets (≥44px)". These are the primary actions on the error/404/home states and are 32px tall on mobile.
- **Impact**: WCAG 2.5.5 and the ticket's own ≥44px rule violated on the most important actions of the error and empty states, on a mobile-first Mexican audience. `size="lg"` is misleadingly named here.
- **Suggested Fix**: Don't trust the primitive's `lg`. Add `min-h-11` (44px) to these CTAs. The compact toggle and hamburger already use `h-11`/`size-11` — mirror that.
- **Status**: OPEN

### M-3: Segmented language-toggle options are 32px tall (< 44px) in the drawer
- **ID**: M-3
- **Severity**: MAJOR
- **File**: `src/components/layout/language-toggle.tsx:98` (group `h-9`=36px), `:113` (options `h-8`=32px); used at `mobile-nav.tsx:134`
- **Problem**: The mobile drawer renders `variant="segmented"` (`mobile-nav.tsx:134`), a touch surface. The design spec LanguageToggle §Layout says "Both are ≥ 44px tall." The segmented option buttons are `h-8` (32px) inside a `h-9` group.
- **Impact**: Sub-44px tap target for the language switch on mobile, inside the drawer where it's thumb-operated. Contradicts the design spec and accessibility bar.
- **Suggested Fix**: Give the drawer's toggle a 44px min height (taller segmented variant), or render the `compact` variant inside the drawer.
- **Status**: OPEN

### M-4: `store_settings` read blocks the whole shell and is fetched twice per request
- **ID**: M-4
- **Severity**: MAJOR (perf/architecture)
- **File**: `src/app/[locale]/layout.tsx:66` + `src/components/layout/site-footer.tsx:44`
- **Problem**: `getStoreSettings()` → `createClient()` → `await cookies()` opts the entire `[locale]` layout (and every page under it) into dynamic rendering. Worse, it's awaited **twice** per request: once in the layout (`:66`, only to derive the header wordmark name) and again in `SiteFooter` (`:44`). Two DB round-trips for the same single row, with no `cache()` dedupe.
- **Impact**: (1) `generateStaticParams`/`setRequestLocale` are inert for the shell — AC-2's static-render intent isn't realized (dev acknowledges but understates). (2) Duplicate query per page load, avoidable latency for the mobile audience.
- **Suggested Fix**: Wrap `getStoreSettings` in React `cache()` so layout+footer collapse to one query. Consider using `SEED_STORE_NAME` for the header wordmark to keep the shell static and let only the footer be dynamic.
- **Status**: OPEN

## Minor Issues (NICE TO FIX)

### m-1: Dead dictionary keys `nav.home` and `nav.menuDescription`
- **File**: `src/messages/es-MX.json:8,12` + `src/messages/en.json:8,12`
- **Suggestion**: Both keys exist in both dictionaries but are referenced nowhere (`aria-describedby={undefined}` at `mobile-nav.tsx:82` deliberately drops the description). Either wire `menuDescription` via an `sr-only` `<Dialog.Description>` and use `nav.home` as the wordmark `aria-label`, or delete both. The parity test passes orphans silently.

### m-2: `localeLabelKey` is an identity function — needless indirection
- **File**: `src/components/layout/language-toggle.tsx:46-49`
- **Suggestion**: `function localeLabelKey(locale: Locale): Locale { return locale; }` returns its argument unchanged. Inline `t(locale)` at `:85` and `:119`; removes ~5 lines and a misleading abstraction.

### m-3: `enter-fade` `@starting-style` doesn't replay after `reset()`
- **File**: `src/app/[locale]/error.tsx:34`, `src/app/globals.css:291`
- **Suggestion**: `@starting-style` runs once on true DOM entry; after `reset()` re-renders the same boundary the fade won't replay. Acceptable (spec calls the mount fade optional) — noted so it isn't mistaken for a bug.

### m-4: `will-change: transform` left permanently on the closed drawer panel
- **File**: `src/app/globals.css:192`
- **Suggestion**: `forceMount` keeps the panel mounted, so this holds a compositor layer alive for the whole page lifetime even when closed. Scope it to `[data-state="open"]` or drop it (the transition is already GPU-friendly).

## Animation & Motion Review (AC-13 — Emil Kowalski bar)

### Findings table

| Before | After | Why |
| --- | --- | --- |
| `sheet.tsx`: `transition-all` + `animate-in slide-in-from-*` keyframes | delete the file | Dead code that violates AC-13 (`transition: all`, non-interruptible keyframes on a drawer); fails this task's own motion bar if reused (M-1) |
| `will-change: transform` static on `.drawer-panel` (globals.css:192) | scope to `[data-state="open"]` or remove | `will-change` should be transient; a permanent layer on a closed off-screen panel is wasteful (m-4) |

### Verdict

**No feel-breaking regressions in the shipped shell motion.** The hand-authored motion layer is above the bar:

- **Easing/direction**: enters use `--ease-out`/`--ease-drawer` (strong custom curves, `globals.css:85-87`); no `ease-in` on any UI. ✓
- **Properties**: `transform`/`opacity`/`box-shadow` only in shell components — no layout-property animation, no `transition: all` (only in the unused `sheet.tsx` and the pre-existing `button.tsx` primitive, an accepted spec exception). ✓
- **Duration**: drawer enter 300ms / exit 200ms (asymmetric ✓); FAB 180ms; toggle 150ms; press 120ms — all ≤ 300ms. ✓
- **Physicality**: FAB pops from `scale(0.95)`, never `scale(0)` (`globals.css:233`). ✓
- **Interruptibility**: drawer uses CSS transitions off Radix `data-state` with `forceMount`, not keyframes — mid-open dismiss retargets. The deliberate reason the dev rejected the shadcn Sheet. ✓
- **Reduced motion**: every motion class has a `prefers-reduced-motion: reduce` fallback (opacity-only). ✓
- **Hover gating**: FAB hover-lift and `.nav-hover` behind `@media (hover: hover) and (pointer: fine)`. ✓

**Decision: APPROVE the motion**, contingent on deleting `sheet.tsx` so the sub-standard drawer can't be reused.

## i18n Correctness Review

- **Middleware matcher** (`middleware.ts:19`): `['/((?!api|_next|_vercel|.*\\..*).*)']` correctly excludes API, Next/Vercel internals, and dotted static-asset paths. Matches AC-2 exactly. ✓
- **Invalid-locale validation**: two layers — `request.ts:19` falls back to `defaultLocale` for messages (RSC never message-less); `[locale]/layout.tsx:58` `notFound()` on unknown segment → localized 404. `/fr` and bare `/es` handled (edge 1). ✓
- **`NEXT_LOCALE` cookie**: via next-intl middleware + `router.replace(..., { locale })`; `localeDetection:false` disables Accept-Language (AC-1). ✓
- **`<html lang>`**: active locale in `[locale]/layout.tsx:70` and `not-found.tsx:23`; `global-error.tsx:24` hardcodes `es-MX` (justified — can't resolve locale). ✓
- **hreflang**: next-intl auto-emits alternates (relied on, not hand-rolled). Canonical not explicitly set — acceptable for T2 (SEO/sitemap out of scope, T14).
- **Message parity**: identical key sets asserted by `messages.test.ts` (AC-4). ✓ Two orphaned keys (m-1) but parity holds.
- **`NextIntlClientProvider` without `messages`** (`layout.tsx:72`): correct for next-intl v4 — a provider rendered inside an RSC auto-inherits `locale`/`messages`/`timeZone` from request config; `error.tsx`'s client `useTranslations` resolves via this. Verified against installed 4.13.2. ✓
- **No hardcoded UI strings**: grep of `src/components`/`src/app` finds only dictionary calls, hrefs, identifiers — zero literal UI text except `global-error.tsx` (justified bilingual fallback, provider unavailable). AC-3 satisfied. ✓

## Server/Client Split Review

- `"use client"` only on `error.tsx`, `mobile-nav.tsx`, `language-toggle.tsx` (all need interactivity/hooks). ✓
- Header, footer, WhatsApp, home, 404 are server components with plain anchors — progressive-enhancement contract met. ✓
- Footer is an async server component reading `store_settings` server-side (no client spinner). ✓
- `store-settings.ts` uses `"server-only"` + RLS publishable-key server client (not admin) — correct client, no secret leaks. ✓
- WhatsApp phone is non-secret config, not `NEXT_PUBLIC_`-prefixed. ✓

## React Patterns Review

- **Keys**: all stable IDs (`item.key`, `link.key`, `locale`); no indices. ✓
- **Effect cleanup**: `mobile-nav.tsx:35-50` `matchMedia` listener has a cleanup return; `error.tsx` log effect needs none. ✓
- **Stale closures**: `mobile-nav` effect deps `[open]` re-subscribe correctly; `language-toggle` uses `useTransition` + fresh `pathname`/`router`. ✓
- **Conditional hooks**: none — the `variant === "compact"` early return happens after all hooks are called. ✓
- **Interruptibility**: toggle never disabled during `isPending` (edge 5). ✓

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | `/` es-MX unprefixed, no Accept-Language negotiation | PASS | `routing.ts:27` `localeDetection:false` |
| AC-2 | next-intl ^4.13.x, `withNextIntl`, routing config exact | PASS | 4.13.2; `next.config.ts:8,40`; `routing.ts:23-28` |
| AC-3 | All UI strings from dictionaries, zero hardcoded | PASS | grep clean; only `global-error.tsx` (justified) |
| AC-4 | Identical key sets + parity test | PASS | `messages.test.ts:45-58`; 2 orphaned keys (m-1) |
| AC-5 | Header on every page: wordmark/nav/toggle/hamburger drawer < md | PASS | `site-header.tsx`; `mobile-nav.tsx` |
| AC-6 | Toggle rewrites segment, preserves path, persists cookie, no reload | PASS | `language-toggle.tsx:61-68` |
| AC-7 | Footer: name, static slugs, free-shipping via formatMXN, © year | PASS | `site-footer.tsx:27-35,47-53,92` |
| AC-8 | WhatsApp FAB fixed bottom-right, new tab, noopener, aria-label | PASS | `whatsapp-button.tsx:44-60`; `whatsapp.ts` |
| AC-9 | Brand values as CSS vars, documented, no hardcoded color/font | **FAIL** | Tokens/grep clean BUT brand-token doc names wrong font file (C-2) and `--font-mono` is broken (C-1) |
| AC-10 | `not-found.tsx` inside shell, localized, back-home | PASS | `[locale]/not-found.tsx`; catch-all `[...rest]/page.tsx` |
| AC-11 | `error.tsx` localized, `reset()`, no stack/PII leak | PASS | `error.tsx:24-62` |
| AC-12 | `<html lang>` active locale, real metadata, single font, splash gone | PASS | `layout.tsx:70`; `fonts.ts`; svgs deleted (Geist ghost in mono = C-1) |
| AC-13 | Motion: ease-out, transform/opacity, reduced-motion, hover-gated | PASS | `globals.css:177-321`; see Motion verdict |
| AC-14 | Mobile-first 375/768/≥1024, no h-scroll, no FAB/footer overlap | PARTIAL | Truncation/shrink-0/safe-area correct; but tap targets < 44px (M-2, M-3) violate this AC's own ≥44px UX requirement |
| AC-15 | Typed server wrapper returning Row, used by footer, degrades gracefully | PASS | `store-settings.ts`; tested |
| AC-16 | lint, tsc strict, test pass; no any/!; no file > 400 lines | PASS | tsc ✓, eslint ✓, 86 tests ✓; no `any`/`!`; largest file 191 lines |
| AC-17 | Active locale via single source (NEXT_LOCALE), documented | PASS | `useLocale()`/`getLocale()` + `NEXT_LOCALE` |

## Edge Case Verification

| # | Edge Case | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Invalid/unknown locale → localized 404 in shell | HANDLED | `layout.tsx:58`; `request.ts` message fallback |
| 2 | `store_settings` absent/unreadable → degrade, fallback, logged | HANDLED | `store-settings.ts:38-62`; `site-footer.tsx:46-52`; tested |
| 3 | English browser, first visit → lands on Spanish | HANDLED | `localeDetection:false` |
| 4 | `prefers-reduced-motion` → opacity fade only | HANDLED | `globals.css:202-216,246-259,277-285,303-312` |
| 5 | Rapid toggle / mid-nav → interruptible, last wins | HANDLED | `language-toggle.tsx` `useTransition`, never disabled |
| 6 | Very long store/nav label → truncate/wrap, no h-scroll 375px | HANDLED | `site-header.tsx:40` `min-w-0 shrink truncate` |
| 7 | WhatsApp number unconfigured → button not rendered, dev warning | HANDLED | `whatsapp-button.tsx:32-40`; `whatsapp.ts` |
| 8 | Deep link `/en/anything` → renders EN, toggle reflects EN | HANDLED | `[locale]` routing + `useLocale()` |

## Quality Score: 7.5/10

Excellent architecture, i18n rigor, and a motion layer that genuinely clears the craft bar — rare. Docked for one broken token (`--font-mono`), a factually wrong brand-swap doc that AC-9 explicitly grades, dead code shipped as a "deliverable," and two sub-44px tap targets that violate the ticket's own accessibility rule on the primary CTAs and the mobile toggle.

## Recommendation: REQUEST CHANGES

Not a happy-path blocker — every AC's core behavior works and all gates are green. But C-1 (broken font token), C-2 (wrong brand-swap doc — the exact rework risk the ticket flags), M-1 (dead `sheet.tsx` that violates the motion baseline if reused), and M-2/M-3 (< 44px tap targets contradicting AC-14's own UX requirements) must be fixed before ship. M-4 (double `store_settings` read / `cache()`) should be fixed but is not blocking.
