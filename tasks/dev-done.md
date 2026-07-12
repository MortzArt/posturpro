# Dev Summary: T2 — App Shell & Design System

Feature type: **full-stack (frontend-heavy)**. Built the storefront shell:
next-intl i18n (Spanish default, English opt-in), header + nav + language
toggle + mobile drawer, async footer reading `store_settings`, WhatsApp FAB,
localized 404/error pages, minimal homepage placeholder, motion tokens +
documented brand-swap seam. All 17 ACs and 8 edge cases addressed.

Verification: `npm run lint` ✓, `npx tsc --noEmit` ✓, `npm run test` ✓ (86
passed), `npm run build` ✓. Dev server smoke-tested: `/` (es-MX, 200), `/en`
(en, 200), `/fr` (invalid locale → localized 404 in shell), `/sillas` (dead nav
link → localized 404 in shell), `/en/anything` (English 404 in shell).

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `src/i18n/routing.ts` | created | `defineRouting` — locales `["es-MX","en"]`, default `es-MX`, `localePrefix:"as-needed"`, `localeDetection:false`. Exports `Locale` type. |
| `src/i18n/navigation.ts` | created | `createNavigation(routing)` → locale-aware `Link`/`redirect`/`usePathname`/`useRouter`/`getPathname`. |
| `src/i18n/request.ts` | created | `getRequestConfig` loading `src/messages/<locale>.json`; falls back to default locale for messages if the segment is invalid. |
| `src/middleware.ts` | created | `createMiddleware(routing)`, matcher `['/((?!api|_next|_vercel|.*\\..*).*)']`. |
| `src/messages/es-MX.json` | created | Spanish UI strings (source of truth): nav, toggle, footer, whatsapp, home, notFound, error, metadata. |
| `src/messages/en.json` | created | English strings — identical key set. |
| `src/messages/messages.test.ts` | created | AC-4 key-set parity + no-empty-leaf + routing-locale-set tests. |
| `src/lib/store-settings.ts` | created | `getStoreSettings(): Promise<StoreSettings\|null>` — RLS server client, `server-only`, explicit column select, graceful `null`+warn on absence/error. |
| `src/lib/store-settings.test.ts` | created | Success / absent-row / Supabase-error / client-throws paths (edge case 2). Mocks `server-only` + supabase server client. |
| `src/lib/whatsapp.ts` | created | Pure `normalizeWhatsAppPhone` / `isWhatsAppConfigured` / `buildWhatsAppUrl` (URL-encoded, config-guarded). |
| `src/lib/whatsapp.test.ts` | created | URL builder + guard tests (AC-8, edge case 7). |
| `src/lib/config.ts` | modified | Added `DEFAULT_LOCALE`, `WHATSAPP_PHONE_E164` (empty placeholder ⇒ disabled), `WHATSAPP_PREFILL_MESSAGE_ES` with swap docs. |
| `src/app/fonts.ts` | created | The single font (`Inter` → `--font-sans`). Replaces the Geist+Inter tangle. |
| `src/app/layout.tsx` | modified | Thinned to `import "./globals.css"` + pass-through `children`. `<html>`/metadata/font moved to `[locale]/layout.tsx`. |
| `src/app/[locale]/layout.tsx` | created | `<html lang={locale}>`, `generateStaticParams`, `setRequestLocale`, `generateMetadata` (localized), `NextIntlClientProvider`, shell (skip-link + header + main + footer + WhatsApp), `notFound()` on invalid locale. |
| `src/app/[locale]/page.tsx` | created | Minimal localized homepage placeholder (H1 + intro + CTAs). |
| `src/app/[locale]/not-found.tsx` | created | Localized 404 inside shell + "back home" CTA (AC-10). |
| `src/app/[locale]/error.tsx` | created | `"use client"` localized error boundary, `reset()`, no stack/message leak, safe `digest` reference (AC-11). |
| `src/app/[locale]/[...rest]/page.tsx` | created | Catch-all → `notFound()` so dead in-locale links render the shell 404 (AC-10). |
| `src/app/not-found.tsx` | created | Root fallback 404 for paths that never enter `[locale]` — default-locale copy, minimal own `<html>`. |
| `src/app/global-error.tsx` | created | Root-layout error boundary (own `<html>`, inline styles, bilingual, no leak). |
| `src/components/layout/nav-items.ts` | created | Shared `NAV_ITEMS` (key + locale-agnostic href) — DRY across header/drawer. |
| `src/components/layout/site-header.tsx` | created | Server header: wordmark (home link), inline nav (≥md), toggle, mobile drawer trigger. Sticky, `border-b`. |
| `src/components/layout/site-footer.tsx` | created | Async server footer: store name, static-page links (real ES slugs), free-shipping line via `formatMXN`, © year. Graceful degrade + no-CLS reserved slot. |
| `src/components/layout/mobile-nav.tsx` | created | `"use client"` Radix Dialog drawer, `forceMount` + CSS-transition motion, auto-close ≥md. |
| `src/components/layout/language-toggle.tsx` | created | `"use client"` compact (mobile) / segmented (≥md) toggle; `useTransition`, never disabled, `aria-pressed`. |
| `src/components/layout/whatsapp-button.tsx` | created | Server FAB, config-guarded, `target=_blank rel=noopener noreferrer`, `aria-label`, pop-in motion. |
| `src/app/globals.css` | modified | Added `--ease-out/--ease-in-out/--ease-drawer`; drawer/FAB/toggle/enter-fade/nav-hover motion classes; `## BRAND TOKENS` doc block. Palette untouched. |
| `next.config.ts` | modified | Wrapped export with `withNextIntl('./src/i18n/request.ts')`. |
| `src/app/page.tsx` | deleted | Template splash removed (superseded by `[locale]/page.tsx`). |
| `public/{next,vercel,file,globe,window}.svg` | deleted | Unused template assets removed. |
| `package.json` / `package-lock.json` | modified | `next-intl@^4.13.2` (installed 4.13.2). |

## Data-Testids Added

- `header-wordmark` — home-linking store wordmark (site-header)
- `header-nav-{catalog,brands,styles,contact}` — inline nav links (site-header)
- `language-toggle` — segmented toggle group (language-toggle)
- `language-toggle-option-{es-MX,en}` — segmented options (language-toggle)
- `language-toggle-compact` — mobile compact toggle button (language-toggle)
- `mobile-nav-trigger` — hamburger (mobile-nav)
- `mobile-nav-overlay` — scrim (mobile-nav)
- `mobile-nav-panel` — drawer panel (mobile-nav)
- `mobile-nav-close` — drawer close button (mobile-nav)
- `mobile-nav-item-{catalog,brands,styles,contact}` — drawer nav links (mobile-nav)
- `footer-store-name`, `footer-free-shipping`, `footer-copyright` — footer text (site-footer)
- `footer-link-{about,shipping,faq,contact}` — footer links (site-footer)
- `whatsapp-button` — floating FAB anchor (whatsapp-button)
- `home-cta-catalog`, `home-link-brands` — homepage CTAs ([locale]/page)
- `not-found-home` — 404 back-home CTA ([locale]/not-found)
- `error-retry`, `error-digest` — error boundary retry + digest ([locale]/error)
- `global-error-retry` — global error retry (global-error)

## Brand Tokens (AC-9)

All brand-swappable design values are CSS custom properties in
`src/app/globals.css` `:root` (+ `.dark`). No component hardcodes a color,
radius, or font family — every visual value flows through a token utility
(`bg-primary`, `text-foreground`, `border-border`, `rounded-md`, `font-sans`).
To re-skin PosturPro for a different chair brand, edit ONLY:

1. **Colors** — `:root` + `.dark`: `--primary`, `--primary-foreground`,
   `--background`, `--foreground`, `--border`, `--muted*`, `--accent*`,
   `--ring`, `--destructive`.
2. **Radius** — `:root`: `--radius` (the whole `--radius-*` scale derives from it).
3. **Font** — the one `Inter(...)` import in `src/app/fonts.ts` (bound to
   `--font-sans`); `globals.css` consumes it via `font-sans`.
4. **Copy / identity** — `src/lib/config.ts`: `SEED_STORE_NAME`,
   `WHATSAPP_PHONE_E164`, `WHATSAPP_PREFILL_MESSAGE_ES`, `SEED_STORE_CONTACT_EMAIL`.

The motion easings (`--ease-out/--ease-in-out/--ease-drawer`) are app-feel, NOT
brand values — leave them. The neutral OKLCH palette was left unchanged (T2 only
documents the seam and adds easings).

## Placeholder Documentation

- **WhatsApp number** (`src/lib/config.ts::WHATSAPP_PHONE_E164`): empty string
  `""` by design. While empty, the FAB is NOT rendered (`buildWhatsAppUrl`
  returns `null`; dev logs the absence) — no broken `wa.me/` link. To enable:
  set the real E.164 digits (no `+`/spaces/dashes, e.g. `5215512345678`). The
  prefill message is `WHATSAPP_PREFILL_MESSAGE_ES` (Spanish, since the WhatsApp
  audience is Spanish-speaking regardless of UI locale).
- **Store settings**: runtime source of truth is the `store_settings` DB row,
  not config. `SEED_STORE_NAME` is only the fallback used when the row is
  absent/unreadable.

## Key Decisions

- **i18n library — next-intl@4.13.2** over homegrown: RSC-native, solves
  middleware detection, `getTranslations`, and `hreflang` alternates.
- **Routing — `localePrefix:"as-needed"`**: Spanish unprefixed (`/`), English
  under `/en`. Distinct crawlable URLs; clean default URLs for the primary market.
- **`localeDetection:false`** (explicit product decision): `/` always serves
  Spanish regardless of `Accept-Language`; English is explicit opt-in via the
  toggle, persisted in `NEXT_LOCALE`. Mexican users often run English OSes;
  auto-negotiation would wrongly flip them.
- **Canonical locale tag `es-MX`** everywhere (routing, messages filename,
  `DEFAULT_LOCALE`, `CURRENCY_LOCALE`). AC-17: the active locale is exposed via
  next-intl's `useLocale()`/`getLocale()` and the shared `NEXT_LOCALE` cookie —
  the ONLY locale source of truth. A future T3 content layer reads the same tag;
  no second cookie/source is introduced.
- **`<html>` in `[locale]/layout.tsx`** (root stays thin): `lang` reflects the
  active locale (AC-12). Standard next-intl App Router placement.
- **Drawer built on raw `radix-ui` Dialog with `forceMount` + CSS transitions**
  (not the shadcn Sheet's tw-animate-css keyframes) so a mid-open dismiss is
  interruptible (AC-13) and reduced motion is a clean opacity-only fade. Radix
  still provides focus trap, Esc, scroll-lock, `role="dialog" aria-modal`.
  (A shadcn `Sheet` was briefly added to the registry but removed in Stage 6 —
  it was dead code and its `transition-all` + tw-animate-css keyframes violate
  the AC-13 motion baseline; re-add via the registry when a real consumer exists.)
- **Catch-all `[locale]/[...rest]/page.tsx`** to make dead in-locale links
  render the shell 404 (`[locale]/not-found.tsx`) instead of the shell-less root
  `not-found.tsx`. Real routes from T3/T13 take precedence as they're added.
- **`store-settings` explicit column select** (not `*`): documents the
  dependency, avoids over-fetching.

## Deviations from Ticket

- **`global-error.tsx` uses inline literal colors (`#666/#ccc/#111/#fff`)** —
  deliberate exception. When the root layout itself fails, `global-error`
  replaces the whole document and the Tailwind/token stylesheet may be
  unavailable, so it cannot use token utilities. This is the documented Next.js
  pattern. It is NOT a shell component. All actual shell components use tokens
  only (AC-9 grep is clean outside this file + the `:root` definitions).
- **`error.tsx` shows `error.digest`** as a small support reference when present
  — the ticket explicitly permits this (opaque hash, safe; never the message).
- **`middleware` deprecation notice**: Next 16.2.9 prints a notice preferring
  the `proxy` convention. Kept `src/middleware.ts` per the ticket's exact spec;
  it functions correctly. Migrating to `proxy` is a trivial rename for a later
  cleanup ticket.
- **`store_settings` read makes `/[locale]` dynamic** (it uses `cookies()` via
  the RLS server client). `generateStaticParams` + `setRequestLocale` are still
  in place (correct per the Next 16 gotcha and useful for future static leaf
  routes), but the shell route renders on-demand. Expected for a data-reading
  storefront; no perf concern for T2 (single indexed single-row select).
  **Stage 6 (M-4):** `getStoreSettings` is now wrapped in React `cache()`, so
  the layout read (header wordmark fallback) and the footer read collapse to a
  single per-request DB round-trip instead of two. Keeping the shell dynamic is
  the deliberate accepted trade-off above; the duplicate query is eliminated.

## Edge Cases Handled

1. **Invalid/unknown locale** (`/fr`, bare `/es`) → `[locale]/layout.tsx` calls
   `notFound()` → localized 404 inside shell. Verified: `/fr` → HTTP 404, shell + ES copy.
2. **`store_settings` missing/unreadable** → `getStoreSettings()` returns `null`
   + logs with context; footer omits free-shipping line, store name falls back
   to `SEED_STORE_NAME`. Verified live: remote DB lacks the table, footer degraded
   cleanly, shell intact. Covered by `store-settings.test.ts`.
3. **English browser, first visit, no cookie** → lands on Spanish `/`
   (`localeDetection:false`). Opt into EN via toggle; `NEXT_LOCALE` then persists.
4. **`prefers-reduced-motion`** → drawer opacity-fade only (no slide); FAB/toggle
   no transform. All motion classes have a `@media (prefers-reduced-motion: reduce)`
   fallback in `globals.css`.
5. **Rapid toggle / mid-nav** → `useTransition` + `router.replace`; toggle never
   disabled; interruptible; last press wins.
6. **Very long store/nav label** → wordmark `truncate min-w-0 shrink`,
   controls `shrink-0`; no overflow at 375px.
7. **WhatsApp number unconfigured** → FAB not rendered (`buildWhatsAppUrl` →
   `null`); dev-only warning. Verified: `/` renders 0 WhatsApp buttons with the
   empty placeholder. Covered by `whatsapp.test.ts`.
8. **Deep link `/en/anything`** → renders EN, toggle reflects EN. Verified:
   `/en/anything` → English 404 in shell.

## How to Test

1. `npm run dev`, open `http://localhost:3000/` → Spanish shell (wordmark, nav,
   footer, copyright with current year), `<html lang="es-MX">`, no URL prefix.
2. Click the language toggle (compact on mobile, segmented ≥md) → URL becomes
   `/en`, strings switch to English, no full reload; refresh → stays EN (cookie).
3. Resize to 375px → nav collapses to hamburger; open drawer → slides in, focus
   trapped, Esc/scrim/close/nav-click all close it; no horizontal scroll.
4. Visit `/sillas` (dead link) and `/fr` (invalid locale) → localized 404 inside
   header+footer with "Volver al inicio"; HTTP 404.
5. Set `WHATSAPP_PHONE_E164` in `src/lib/config.ts` to real digits → FAB appears
   bottom-right, opens `wa.me` in a new tab; empty again → FAB gone.
6. DevTools → enable "reduce motion" → drawer fades (no slide), FAB/toggle static.
7. Gates: `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build`.

## Known Limitations

- Free-shipping line requires the migrated+seeded `store_settings` row. Against
  a DB without it, the footer degrades (by design); to see the line, run against
  a DB with T1 migrations/seed (`npm run db:reset && npm run db:seed`).
- Nav/footer links point at routes owned by T3 (`/sillas`, `/marcas`, `/estilos`)
  and T13 (`/sobre-nosotros`, `/contacto`, etc.); they 404 gracefully until built.
- Integration suite (needs local Docker Supabase) not re-run here — T2 touches no
  data-layer/migration/seed code it exercises; the unit suite (`npm run test`) is
  green (86 tests). Run `npm run test:integration` with Docker up to confirm.

## Dependencies Added

- `next-intl@^4.13.2` (installed 4.13.2) — App Router RSC-native i18n:
  middleware locale detection, `getTranslations`, `hreflang` alternates. Peer
  deps satisfied by Next 16.2.9 / React 19.2.4; `.npmrc legacy-peer-deps=true`.

## Fixes Applied (Stage 6)

### Issue Tracker
| ID | Severity | Title | Status | File | Notes |
|----|----------|-------|--------|------|-------|
| C-1 | CRITICAL | `--font-mono` points at deleted Geist var | FIXED | `src/app/globals.css:11` | `var(--font-geist-mono)` → `ui-monospace, SFMono-Regular, Menlo, monospace` system stack. No Geist ghost. |
| C-2 | CRITICAL | Brand-swap doc names wrong font file | FIXED | `src/app/globals.css:159` | `src/app/layout.tsx` → `src/app/fonts.ts`; now matches dev-done Brand Tokens §3. |
| M-1 | MAJOR | `sheet.tsx` dead code + motion-bar violation | FIXED | `src/components/ui/sheet.tsx` (deleted) | Verified 0 importers, deleted (git remembers). |
| M-2 | MAJOR | Primary CTAs 32px (< 44px) | FIXED | `not-found.tsx:26`, `error.tsx:49`, `page.tsx:33` | Added `min-h-11 px-4` to all three `size="lg"` CTAs. Desktop density unchanged. |
| M-3 | MAJOR | Segmented toggle options 32px in drawer | FIXED | `language-toggle.tsx:110`, `mobile-nav.tsx:135` | Options size to group (`h-full min-h-8`); drawer passes `h-11` → 44px group. Header keeps `h-9`. |
| M-4 | MAJOR | Double `store_settings` read | FIXED | `src/lib/store-settings.ts:36` | Wrapped `getStoreSettings` in React `cache()` → one query serves layout + footer. |
| m-1 | MINOR | Dead keys `nav.home` / `nav.menuDescription` | FIXED | `mobile-nav.tsx`, `es-MX.json`, `en.json` | Wired `menuDescription` as `sr-only` `<Dialog.Description>`; deleted orphaned `nav.home` (parity preserved). |
| m-2 | MINOR | `localeLabelKey` identity function | FIXED | `language-toggle.tsx` | Deleted the function; inlined `t(locale)` at both call sites. |
| m-3 | MINOR | `enter-fade` doesn't replay after `reset()` | SKIPPED | — | Reviewer-acknowledged non-bug; mount fade is optional per spec. Forcing replay = pointless JS churn. |
| m-4 | MINOR | `will-change` permanent on closed drawer | FIXED | `src/app/globals.css:194` | Moved `will-change: transform` onto `[data-state="open"]` only. |

### Summary
- Critical: 2/2 fixed
- Major: 4/4 fixed, 0 skipped
- Minor: 3/4 fixed, 1 skipped (m-3, justified)
- AC-9 FAIL → PASS; AC-14 PARTIAL → PASS

### Test Results After Fixes
- Unit: Total 86 | Passed 86 | Failed 0 | Skipped 0
- Lint (`npm run lint`): clean
- Typecheck (`npx tsc --noEmit`): clean (exit 0)
- Build (`npm run build`): success (the `store-settings` "Dynamic server usage" notice is pre-existing, expected, and handled by the graceful-degrade path — not a regression)
