# Ship Decision: T2 — App Shell & Design System

## Verdict: SHIP

## Confidence: HIGH

## Quality Score: 9/10

## Test Results

| Suite | Total | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit / Component (Vitest) | 177 | 177 | 0 | 0 |
| E2E (Playwright — chromium + mobile) | 78 | 78 | 0 | 0 |
| **Total** | **255** | **255** | **0** | **0** |

Gate re-run fresh by the verifier (not trusting reported numbers):

- `npm run lint` → clean (exit 0)
- `npx tsc --noEmit` → clean (exit 0, strict)
- `npm run test` → 14 files, 177 tests, all pass (2.75s)
- `npx playwright test` → 78 passed (chromium + Pixel-7 mobile)
- `npm run build` → success; the `store_settings` "Dynamic server usage" notice is the documented graceful-degrade path (footer degrades to config fallbacks), not a failure.

**T1 integration suite (64, Docker Supabase): not run — justified.** T2 added only `getStoreSettings` (read-only select on the existing `store_settings` row); it touches no migration, seed, or data-layer code the integration suite exercises. The wrapper's four paths are unit-tested, and the live E2E run exercised the graceful-degrade path against a DB with no `store_settings` row. Low risk; independently covered.

## Acceptance Criteria Final Check

| # | Criterion | Code | Test | Verdict |
|---|-----------|------|------|---------|
| AC-1 | `/` es-MX unprefixed, no Accept-Language negotiation | `i18n/routing.ts:27` (`localeDetection:false`) | `home.spec` (en-US → es-MX), `routing.test` | ✅ |
| AC-2 | next-intl ^4.13.x, `withNextIntl`, routing config exact | `package.json` (4.13.2), `next.config.ts:8,40`, `routing.ts:23-28` | `routing.test`, build | ✅ |
| AC-3 | All UI strings from dictionaries, zero hardcoded | grep clean; only `global-error.tsx` (justified) | `keys-used.test`, `nav-items.test` | ✅ |
| AC-4 | Identical key sets + parity test | `es-MX.json`/`en.json` — 38 keys match, no empty leaves | `messages.test` | ✅ |
| AC-5 | Header on every page: wordmark/nav/toggle/hamburger drawer | `site-header.tsx`, `mobile-nav.tsx` (FocusScope trapped/loop) | `mobile-nav.spec` (trap/Esc/restore) | ✅ |
| AC-6 | Toggle rewrites segment, preserves path, cookie, no reload | `language-toggle.tsx:61` (`router.replace`) | `i18n-toggle.spec` | ✅ |
| AC-7 | Footer: name, static slugs, free-ship via formatMXN, © year | `site-footer.tsx:27-53,92` | `home.spec`, `whatsapp-and-footer.spec` | ✅ |
| AC-8 | WhatsApp FAB fixed bottom-right, new tab, noopener, aria-label | `whatsapp-button.tsx:46-49`, `whatsapp.ts` | `whatsapp.test`, `whatsapp-and-footer.spec` | ✅ |
| AC-9 | Brand values as CSS vars, documented, no hardcoded color/font | `globals.css:11` (font-mono system stack), `:146` BRAND TOKENS, `:159` names `fonts.ts` | code read | ✅ |
| AC-10 | `not-found.tsx` inside shell, localized, back-home | `[locale]/not-found.tsx`, catch-all `[...rest]/page.tsx` → `notFound()` | `not-found.spec` | ✅ |
| AC-11 | `error.tsx` localized, `reset()`, no stack/PII leak | `error.tsx:29,46-58` (dictionary-only, digest opaque) | code read | ✅ |
| AC-12 | `<html lang>` active locale, real metadata, single font, splash gone | `[locale]/layout.tsx:70`, `generateMetadata:44`, `fonts.ts` | `home.spec` (lang+title) | ✅ |
| AC-13 | Motion: ease-out, transform/opacity, reduced-motion, hover-gated | `globals.css` (5× reduced-motion branches, 3× hover gating) | `responsive-motion.spec` | ✅ |
| AC-14 | Mobile-first 375/768/≥1024, no h-scroll, no FAB/footer overlap | truncate/shrink-0/safe-area; CTAs + drawer toggle ≥44px | `responsive-motion.spec`, `mobile-nav.spec` | ✅ |
| AC-15 | Typed server wrapper returning Row, used by footer, degrades gracefully | `store-settings.ts` (`server-only`, `cache()`, null degrade) | `store-settings.test` (4 paths) | ✅ |
| AC-16 | lint, tsc strict, test pass; no any/!; no file > 400 lines | all gates clean; grep: no `any`/`!`/TODO; largest shell file 197 lines | all suites | ✅ |
| AC-17 | Active locale via single source (NEXT_LOCALE), documented | `useLocale()`/`getLocale()` + `NEXT_LOCALE`; no second source | `routing.test`, `config.test` | ✅ |

**Edge cases (8/8 handled):** invalid locale → shell 404 (`/fr` verified live); `store_settings` absent → degrade + fallback (verified live, no `store_settings` table in e2e DB); English browser → lands on Spanish; reduced-motion → opacity-only; rapid toggle → interruptible last-wins; long labels → truncate/shrink; WhatsApp unconfigured → FAB not rendered (verified, 0 buttons); deep link `/en/anything` → English 404 in shell.

## Report Summary

| Report | Score | Key Finding |
|--------|-------|-------------|
| Code Review | 7.5/10 → RESOLVED | 2 critical (dead `--font-mono` Geist ghost, wrong brand-swap doc path) + 4 major (dead `sheet.tsx`, sub-44px tap targets ×2, double `store_settings` read) all FIXED in Stage 6; verified in code. |
| QA | HIGH | 177 unit + 78 e2e, all pass. Caught + fixed 2 CRITICAL drawer defects (closed overlay swallowed all clicks; self-dismiss + missing focus trap) — real product fixes, not weakened tests. |
| UX | 9/10 | Complete state coverage, focus trap + restore, live-region errors, AA contrast, cohesive reduced-motion-safe motion. Fixed inert toggle crossfade + inverted secondary-link hover. |
| Security | SECURE | 0 critical/high/medium. Secret key server-only (never in bundle), no committed secrets, WhatsApp URL config-only + encoded, `rel="noopener noreferrer"`. 1 low (CSP headers) deferred to T14 by design. |
| Architecture | 8.5/10 | SOUND. i18n seam, token seam, server/client split all correct and scalable. Two risks routed forward (not blockers). |
| Hacker | n/a | Stage 11 skipped — medium-complexity classification per `/full-cycle` auto-classify (chaos testing folded into QA's live E2E defect hunt). |

## Remaining Concerns

- **Fully-dynamic shell** (`getStoreSettings()` uses `cookies()` in `[locale]/layout.tsx`): LOW/routed. Accepted T2 trade-off (data-reading storefront, single indexed row, `cache()`-deduped). Must be reopened in T3/T4 so catalog/PDP can be statically optimized — tracked in `clean-code-backlog.md`.
- **Middleware not composed for admin** (`/admin` would be locale-routed): LATENT/routed to T10. Tracked in backlog.
- **Security response headers absent** (CSP/X-Frame-Options/HSTS): LOW/deferred to T14 launch hardening (CSP needs the full asset inventory that doesn't exist yet). Tracked in backlog.
- **`middleware.ts` vs Next 16 `proxy` deprecation notice**: cosmetic; functions correctly. Trivial rename for a later cleanup ticket.
- **AC-11 real render path + FAB-with-real-number**: unexercised end-to-end (no throwing route / no configured number in T2). LOW — boundary is standard Next.js with dictionary-only copy; FAB anchor is static over already-tested URL logic.

None of these are ship-blockers: no failing tests, no critical/high security vulnerability, no unmet AC, no cross-user data leak (T2 has no auth surface and one RLS-enforced public read), quality ≥ 8.

## What Was Built

The PosturPro storefront shell and neutral design-system seam: next-intl i18n with Spanish (`es-MX`) as the unprefixed default and English as explicit opt-in under `/en`, a persistent header (wordmark, nav, language toggle, accessible mobile drawer), an async footer reading `store_settings` with graceful degradation, a config-guarded floating WhatsApp button, localized 404 + error boundaries, a documented brand-token swap seam, and a reduced-motion-safe motion layer. No catalog, search, cart, homepage content, or admin surface — those are owned by later tasks; the homepage is a minimal localized placeholder only.

## Summary

A disciplined, well-documented foundation: all 17 ACs verified in code, all 8 edge cases handled, every gate green (255/255 tests, lint, strict tsc, build), zero critical/high security findings, and the two critical drawer defects QA caught are fixed and re-verified. SHIP.
