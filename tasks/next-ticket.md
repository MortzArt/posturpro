# Task: T2 — App Shell & Design System

## Priority

**High** — T2 is the foundational UI layer that every subsequent storefront task (T3 catalog, T4 PDP, T5 search, T6 cart, T13 homepage/static pages) builds on. It is the first user-visible surface and establishes the design-token, i18n, and layout contracts the rest of Phase 1 inherits. Blocking dependency for T3 and T13. Shipping it wrong (e.g. hardcoded brand values, an i18n approach that fights the existing `translations` table) forces expensive rework across the whole storefront.

## Complexity

**medium** — New feature surface (header, footer, layout, i18n, error pages, WhatsApp button, design tokens) touching ~15–20 files, and it introduces one new dependency (`next-intl`) plus a routing convention (`[locale]` segment + middleware). But it follows established patterns: shadcn/ui + Tailwind v4 tokens already scaffolded in `globals.css`, typed data wrappers in `src/lib/`, config centralization in `src/lib/config.ts`. No new data model, no DB migration, no backend logic beyond a single typed read of the existing `store_settings` row. It sits at the top of the medium band (a homegrown i18n or extra brand-token indirection could push it toward high), not low, because of the routing/middleware surface and the number of new files. **Recommended tier: standard.**

## Feature Type

**full-stack** (frontend-heavy). Predominantly frontend (layout, components, tokens, i18n, motion), with a thin backend read: the footer/header consume the store name and shipping-threshold copy derived from the existing `store_settings` row via a typed server wrapper. No new endpoints, no mutations, no migration. UI Design (Stage 3) and UX (Stage 8) run at full depth; Security/Arch run lightweight (no new attack surface beyond one public read that RLS already governs).

## User Story

As a **Spanish-speaking shopper in Mexico on a phone**, I want **a fast, coherent store shell — clear navigation, a footer with policies, a language toggle, and an easy way to reach the store on WhatsApp — that loads in Spanish by default**, so that **I can orient myself, move between sections, and get help without friction, in my own language.**

## Background

T1 shipped the full data foundation: Supabase clients (`src/lib/supabase/{client,server,admin}.ts`), typed schema (`src/lib/supabase/database.types.ts`), centralized non-secret config (`src/lib/config.ts`), money via `formatMXN` (`src/lib/money.ts`), a `store_settings` single-row table (store name, contact email, shipping flat rate, free-shipping threshold), a polymorphic `translations` table for **DB content** localization, and `static_pages` seeded in Spanish (`sobre-nosotros`, `envios-y-devoluciones`, `preguntas-frecuentes`, `contacto`). 69 unit + 64 integration tests pass.

What exists today is a create-next-app starter: `src/app/layout.tsx` has placeholder metadata ("Create Next App"), `lang="en"`, a font tangle (Geist + Geist_Mono + Inter all wired at once), and `src/app/page.tsx` is the Next.js template splash. `globals.css` already has a complete **neutral** shadcn token set in OKLCH (`--primary`, `--background`, `--border`, radius scale, dark variant) — this is the brand-swap seam and must be treated as the single source of design truth.

What's missing (this task): a real app shell (header + nav + footer), centralized **neutral** design tokens documented for a later brand swap, ES/EN i18n with **Spanish default** and a language toggle, mobile-first responsive foundation, friendly 404 + error pages, and a site-wide WhatsApp floating button.

**Scope guardrails.** Scope authority is PRODUCT_SPEC.md Phase 1. This task builds the *shell only*. It must NOT build T3 (catalog browsing, product grids, category/brand/style pages), T5 (search/filters), or T13 (homepage hero/featured content, static-page bodies). The homepage may contain only a minimal placeholder within T2's scope (a heading + short intro + nav affordances) — no featured chairs, no brand carousel, no hero imagery pipeline. Nav links may point to routes that don't exist yet; those routes are delivered by their owning tasks. The `translations` **runtime** (reading DB content per locale) is T3+; T2 only wires the locale mechanism and static UI strings.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

- [ ] **AC-1**: Visiting `/` with no locale cookie and any `Accept-Language` renders the store **in Spanish (es-MX)** with **no locale prefix** in the URL. English is deterministically opt-in only (see AC-6). Automatic `Accept-Language` negotiation is disabled.
- [ ] **AC-2**: `next-intl` is installed at `^4.13.x`, wired via `withNextIntl` in `next.config.ts`, with `src/i18n/routing.ts` declaring `locales: ["es-MX","en"]`, `defaultLocale: "es-MX"`, `localePrefix: "as-needed"`, and locale detection disabled.
- [ ] **AC-3**: All static UI strings (nav labels, footer, buttons, 404/error copy, WhatsApp label, toggle labels) are read from message dictionaries `src/messages/es-MX.json` and `src/messages/en.json` via `getTranslations`/`useTranslations`. There is **zero** hardcoded user-facing UI string in any component (grep for literal Spanish/English UI text in `src/components` and `src/app` returns none).
- [ ] **AC-4**: Both dictionaries have **identical key sets** (no missing/extra keys in either locale). A unit test asserts key-set parity.
- [ ] **AC-5**: The header renders on every page: store name/logo slot (links home), primary nav (catalog/brands/styles/contact as label placeholders, links may be dead), the language toggle, and a mobile hamburger that opens a nav drawer/sheet below the `md` breakpoint.
- [ ] **AC-6**: The language toggle switches locale by rewriting the current URL segment (`/productos` ↔ `/en/products`) via next-intl navigation, preserves the current path, and persists the choice in the `NEXT_LOCALE` cookie so the next visit honors it. Toggling does not full-page reload.
- [ ] **AC-7**: The footer renders on every page: store name, links to the seeded static pages by their real Spanish slugs (`/sobre-nosotros`, `/contacto`, etc. — links may be dead until T13), a free-shipping line derived from `store_settings.free_shipping_threshold_cents` via `formatMXN`, and a copyright line with the current year.
- [ ] **AC-8**: A WhatsApp floating button is fixed bottom-right on every page, above other content, links to `https://wa.me/<number>?text=<prefilled es message>` (number + message read from centralized config), opens in a new tab with `rel="noopener noreferrer"`, and has an accessible label from the dictionary.
- [ ] **AC-9**: All brand-swappable design values (colors, radius, fonts) live as CSS custom properties in `globals.css` (already scaffolded) and are documented in a `## Brand Tokens` block in `tasks/dev-done.md` describing exactly what to edit for a brand swap. No component hardcodes a hex/oklch color or a raw font family; all use token utilities (`bg-primary`, `text-foreground`, `font-sans`, etc.).
- [ ] **AC-10**: A custom `not-found.tsx` (404) renders inside the shell (header+footer), shows a localized friendly message and a "back to home" action.
- [ ] **AC-11**: A custom `error.tsx` (client error boundary) renders a localized friendly message with a "try again" (`reset()`) action and does not leak stack traces or error messages to the user in production.
- [ ] **AC-12**: `src/app/[locale]/layout.tsx` sets `<html lang>` to the active locale (not hardcoded `en`), real `<title>`/`description` metadata (Spanish default, from dictionary/config — not "Create Next App"), and a single, intentional font wiring (no Geist+Inter tangle). The `next.svg`/`vercel.svg` template splash is removed.
- [ ] **AC-13**: Enter animations use `ease-out`; the mobile drawer, WhatsApp button, and toggle animate `transform`/`opacity` only (never layout properties, never `transition: all`); all motion is gated by `@media (prefers-reduced-motion: reduce)` to opacity-only/none; hover-transform effects are wrapped in `@media (hover: hover) and (pointer: fine)`. Exact specs in UX Requirements → Motion.
- [ ] **AC-14**: Layout is mobile-first and correct at 375px, 768px, and ≥1024px with no horizontal scroll and no overlap between the WhatsApp button and footer/nav at any width.
- [ ] **AC-15**: The `store_settings` read is a typed server wrapper in `src/lib/` (e.g. `src/lib/store-settings.ts`) returning the typed `store_settings` Row, used by the footer; it degrades gracefully if the row is absent (see Error States).
- [ ] **AC-16**: `npm run lint`, `tsc` (strict), and `npm run test` all pass; no `any`, no non-null `!` to silence the compiler, no new file over ~400 lines.
- [ ] **AC-17**: The active locale is exposed such that a future T3 content layer can read the same `es-MX`/`en` string next-intl resolved (documented in dev-done); no second locale source of truth is introduced besides `NEXT_LOCALE`.

## Edge Cases

At least 5 specific edge cases that MUST be handled:

1. **Unknown/invalid locale in URL** (e.g. `/fr/...` or a bare `/es/...` without region) → next-intl `notFound()` renders the localized 404 inside the shell; the app never crashes or renders a blank page.
2. **`store_settings` row missing/unreadable** (fresh DB, RLS denial, network error) → footer omits the free-shipping line and store name falls back to `SEED_STORE_NAME` from config; the shell still renders. Error is logged with context (no empty catch).
3. **Browser set to English, first visit, no cookie** → user still lands on Spanish `/` (detection disabled by design, AC-1). They opt into English via the toggle; the cookie then persists English for return visits.
4. **`prefers-reduced-motion: reduce`** → drawer opens with an opacity fade only (no slide), WhatsApp button and toggle have no scale/transform motion; nothing is fully static-broken (states still change, just without transform).
5. **Toggle pressed rapidly / mid-navigation** → navigation is interruptible; no desync between URL segment and rendered strings; last press wins. No stuck loading state.
6. **Very long store name or nav label in either locale** → header/footer truncate or wrap gracefully at 375px with no horizontal scroll and no overlap with the toggle/hamburger.
7. **WhatsApp number not configured** (empty config value) → button is not rendered (never produces a broken `wa.me/` link with no number). Absence logged in dev.
8. **Deep link to a prefixed English URL** (`/en/anything`) shared/bookmarked → renders in English with the toggle reflecting EN; cookie updated accordingly.

## Error States Table

| Trigger | User Sees | System Does |
| ------- | ------------- | ---------------- |
| `store_settings` read fails/absent | Footer without the free-shipping line; store name = config fallback; rest of shell intact | Server wrapper returns `null`, footer branches on it, logs a warning with context; no throw |
| Unknown locale segment in URL | Localized friendly 404 inside header+footer with "back home" CTA | next-intl middleware / `notFound()`; no crash |
| Uncaught render error in a route segment | Localized friendly error screen with "try again" (`reset()`) | `error.tsx` boundary catches; in prod, generic message only (no stack/PII) |
| WhatsApp number unconfigured | No WhatsApp button | Config guard prevents a numberless `wa.me` link; warning logged in dev |
| JS disabled / slow hydration | Header, footer, links, WhatsApp anchor all work (server-rendered anchors/links); drawer requires JS | Progressive enhancement: shell is server-rendered; only drawer open/close and toggle-without-reload need JS |
| Navigation interrupted by rapid toggle | Final chosen locale renders; URL and strings consistent | next-intl `router.replace(pathname, { locale })`; last write wins |

## UX Requirements

For EVERY state the UI can be in:

- **Loading**: Shell (header/footer) is server-rendered and appears immediately. The `store_settings`-derived footer line renders on the server with data already resolved (no client spinner). Any client transition must not cause layout shift (reserve space for the free-shipping line).
- **Empty**: No "empty" content state in T2 itself; the minimal homepage placeholder shows a heading + short localized intro. Dead nav links are acceptable (owned by later tasks) but must not appear broken — clicking navigates to a route that 404s gracefully (AC-10) until built.
- **Error**: `error.tsx` — localized "algo salió mal" message, "Reintentar" button calling `reset()`. `not-found.tsx` — localized "página no encontrada" with "Volver al inicio".
- **Success**: Normal shell — header persistent (sticky optional), footer at bottom (min-h-full flex column already in `layout.tsx`), WhatsApp button floating.
- **Mobile (375px)**: Single-column. Header collapses primary nav into a hamburger that opens a drawer/sheet; store name + hamburger + toggle fit one row without wrapping/overflow. Footer stacks vertically. WhatsApp button bottom-right with safe inset, not overlapping footer content on scroll-to-bottom. No horizontal scroll.
- **Tablet (768px)**: Header may show partial or full nav depending on fit; drawer still available if nav doesn't fit. Footer in 2–3 columns. Comfortable tap targets (≥44px) for toggle and WhatsApp.

### Motion (cite: `.claude/skills/emil-design-eng` — the taste authority)

Baseline (always): animate `transform`/`opacity` only; never `transition: all` (name the property); nothing appears from `scale(0)` — enter from `scale(0.95–0.97)` + `opacity:0`; enter/exit use `ease-out`, never `ease-in`; keep UI motion < 300ms; exits faster than enters; respect `prefers-reduced-motion` (keep short opacity fades ~0.2s, drop all transform/position motion); hover transforms only under `@media (hover: hover) and (pointer: fine)`.

Custom easings to define as CSS vars: `--ease-out: cubic-bezier(0.23,1,0.32,1)`; `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`.

- **Mobile nav drawer/sheet**: enter via `transform: translateX(-100%) → translateX(0)` (or bottom-sheet `translateY(100%) → 0`) + overlay `opacity` fade; ~300ms enter with `--ease-drawer`; exit ~200ms (faster). Use CSS transitions (not keyframes) so a mid-open dismiss is interruptible. Reduced motion: opacity fade only.
- **WhatsApp floating button**: entrance `scale(0.95) + opacity:0 → scale(1) + opacity:1`, ~150–200ms `ease-out` (pop-in, never `scale(0)`); `:active` press `scale(0.97)`, 100–160ms; hover lift only on hover-capable pointers. Reduced motion: no transform.
- **Language toggle**: label crossfade `opacity` (+ optional `scale(0.97)`), 125–200ms `ease-out`; `:active` `scale(0.97)` 100–160ms. Reduced motion: opacity only.
- **Sticky header** (if sticky): elevation/shadow change on scroll via `transform`/`box-shadow`, ~180ms `ease-out`, subtle. Reduced motion: no motion.

## Technical Approach

### Files to Create

- `src/i18n/routing.ts` — `defineRouting({ locales:["es-MX","en"], defaultLocale:"es-MX", localePrefix:"as-needed", localeDetection:false })`.
- `src/i18n/navigation.ts` — `createNavigation(routing)` → typed `Link`, `redirect`, `usePathname`, `useRouter`.
- `src/i18n/request.ts` — `getRequestConfig` loading `src/messages/<locale>.json` for the active request (RSC).
- `src/middleware.ts` — `createMiddleware(routing)` with matcher `['/((?!api|_next|_vercel|.*\\..*).*)']`.
- `src/messages/es-MX.json` — Spanish UI strings (nav, footer, buttons, 404/error, WhatsApp, toggle). Source of truth.
- `src/messages/en.json` — English UI strings, identical key set.
- `src/app/[locale]/layout.tsx` — locale layout: `setRequestLocale`, `NextIntlClientProvider`, `generateStaticParams` for locales, `<html lang={locale}>`, header + footer + WhatsApp button wrap `children`, real metadata.
- `src/app/[locale]/page.tsx` — minimal placeholder homepage (localized heading + intro), replacing the template splash.
- `src/app/[locale]/not-found.tsx` — localized 404 inside shell.
- `src/app/[locale]/error.tsx` — `"use client"` localized error boundary with `reset()`.
- `src/components/layout/site-header.tsx` — header (server) composing nav + toggle + mobile drawer trigger.
- `src/components/layout/site-footer.tsx` — footer (server), reads store settings.
- `src/components/layout/mobile-nav.tsx` — `"use client"` drawer/sheet (shadcn `Sheet` if in registry, else Radix Dialog primitive from `radix-ui`).
- `src/components/layout/language-toggle.tsx` — `"use client"` toggle using `src/i18n/navigation`.
- `src/components/layout/whatsapp-button.tsx` — floating WhatsApp anchor (server; config-guarded).
- `src/lib/store-settings.ts` — typed server wrapper: `getStoreSettings(): Promise<StoreSettings | null>` reading the `store_settings` row via `createClient()`; logs + returns `null` on absence/error.
- (Test) `src/messages/messages.test.ts` — asserts es-MX/en key-set parity (AC-4).

### Files to Modify

- `src/app/layout.tsx` — becomes the thin root (imports globals, defines the single font); the shell + `<html lang>` move to `[locale]/layout.tsx`. Remove Geist/Inter tangle and the "Create Next App" metadata. (Decide root-vs-locale `<html>` placement and document it in dev-done — Next 16 + next-intl typically keep `<html>` in the `[locale]` layout.)
- `src/app/page.tsx` — delete (superseded by `[locale]/page.tsx`); remove the template splash.
- `src/app/globals.css` — add custom easing vars (`--ease-out`, `--ease-drawer`) to `:root`/`@theme`; add a documented "Brand Tokens" comment block marking the swap seam. Do NOT change the neutral palette values.
- `next.config.ts` — wrap export with `withNextIntl('./src/i18n/request.ts')`.
- `src/lib/config.ts` — add centralized WhatsApp config: `WHATSAPP_PHONE_E164` (digits only, `""` placeholder = disabled), `WHATSAPP_PREFILL_MESSAGE_ES`, and `DEFAULT_LOCALE = "es-MX"` (align with existing `CURRENCY_LOCALE`). Document as brand/placeholder values.
- `public/` — remove `next.svg`/`vercel.svg` template assets if unused; use a text wordmark placeholder for the logo slot (no image dependency).

### Data Model Changes

None. No migration. Reads the existing `store_settings` row only.

### API Endpoints

None. No new route handlers or mutations.

### Dependencies

- `next-intl@^4.13.2` — App Router i18n. Peer deps `next: ^16`, `react: ^19` — compatible with Next 16.2.9 / React 19.2.4; `.npmrc` already sets `legacy-peer-deps=true`. ~2KB, RSC-native. Chosen over homegrown because it solves middleware locale detection, RSC `getTranslations`, and `hreflang` alternate links (see research report). No other new deps — use existing shadcn/ui + `radix-ui` for the drawer, `@hugeicons/react` for icons.

## Out of Scope

- T3 catalog: product grid, category/brand/style pages, breadcrumbs, stock indicators, pagination.
- T5 search, filters, sorting.
- T13 homepage content (hero, featured chairs, featured brands) and static-page bodies/copy — the shell only links to them.
- Reading the `translations` DB table at runtime for content localization (T3+). T2 wires only the locale mechanism + static UI strings.
- Cookie-consent banner, analytics, SEO structured data, sitemap (T14).
- Dark-mode user-facing theme switcher (tokens exist; do not build a settings surface).
- Real brand identity (logo image, real palette, real fonts) — tokens stay neutral; T2 documents the swap seam only.
- Any admin surface (T10+).
- The `translations` orphan-cleanup job (backlog item; belongs to the i18n *content* runtime task, not T2's static-string setup).
