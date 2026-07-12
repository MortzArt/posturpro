# Research Report: T2 — App Shell & Design System

## Codebase Analysis

### Existing Patterns

- **Centralized non-secret config**: `src/lib/config.ts` — every tunable/placeholder (shipping cents, storage bucket, seed store name/email, seed image base URL) lives here with a documented "HOW TO SWAP REAL VALUES" header. Reuse: add `WHATSAPP_PHONE_E164`, `WHATSAPP_PREFILL_MESSAGE_ES`, `DEFAULT_LOCALE` here — do NOT scatter them into components.
- **Secret/env boundary**: `src/lib/env.ts` — `getPublicEnv()`/`getServerEnv()`, `requireEnv` throws `MissingEnvVarError`. No secret is `NEXT_PUBLIC_`. T2 needs no new env vars (WhatsApp number is non-secret config).
- **Typed data wrappers**: `src/lib/supabase/{client,server,admin}.ts`. `server.ts::createClient()` is the RSC/route-handler read client (publishable key, RLS enforced) — this is exactly what `getStoreSettings()` should use. `admin.ts` is `server-only`-guarded (RLS-bypassing) — NOT for T2.
- **Money formatting**: `src/lib/money.ts::formatMXN(cents)` — the ONLY place cents → display string. The footer free-shipping line MUST use it, never format inline.
- **Design tokens already scaffolded**: `src/app/globals.css` — full neutral shadcn token set in OKLCH (`--primary`, `--background`, `--muted`, `--border`, `--ring`, chart/sidebar tokens), a radius scale derived from `--radius`, `.dark` variant, and `@theme inline` mapping tokens → Tailwind color utilities. `baseColor: "neutral"` in `components.json`. This IS the brand-swap seam — T2 documents it and adds easing vars; it must not replace the palette.
- **shadcn/ui conventions**: `src/components/ui/button.tsx` uses `cva` + `radix-ui` `Slot`, `cn()` from `src/lib/utils.ts`, `data-slot`/`data-variant` attributes. (Note: the Button primitive uses `transition-all` — acceptable for the existing primitive, but NEW motion code must name properties per the motion rules.) `components.json`: style `radix-mira`, rsc true, iconLibrary `hugeicons`, aliases `@/components`, `@/lib`, `@/components/ui`, `@/hooks`.
- **Testing pattern**: colocated `*.test.ts` next to source (e.g. `config.test.ts`, `money.test.ts`), Vitest. The dictionary key-parity test follows this convention.

### Relevant Files

| File | Purpose | Relevance | Action |
| ------ | -------------- | ---------------- | --------------------------- |
| `src/app/layout.tsx` | Root layout; template metadata, `lang="en"`, Geist+Inter tangle | Must become thin root; shell + `<html lang={locale}>` move to `[locale]/layout.tsx` | Modify |
| `src/app/page.tsx` | Next.js template splash | Superseded by `[locale]/page.tsx` | Delete |
| `src/app/globals.css` | Neutral OKLCH design tokens + `@theme` map | Brand-swap seam; add easing vars + "Brand Tokens" doc block | Modify |
| `src/lib/config.ts` | Centralized placeholders | Add WhatsApp + DEFAULT_LOCALE config | Modify |
| `next.config.ts` | `next/image` remote hosts | Wrap export with `withNextIntl` | Modify |
| `src/lib/supabase/server.ts` | RSC read client (`createClient()`) | Used by `getStoreSettings()` | Reference |
| `src/lib/money.ts` | `formatMXN` | Footer free-shipping line | Reference |
| `src/lib/supabase/database.types.ts` | `store_settings` Row type (L681), `static_pages`, `translations` | Types for the store-settings wrapper | Reference |
| `src/components/ui/button.tsx` | shadcn Button primitive | Reuse for CTAs / toggle / error actions | Reference |
| `src/lib/utils.ts` | `cn()` | All new components | Reference |
| `scripts/seed-data/content.ts` | Static page slugs (`sobre-nosotros`, `envios-y-devoluciones`, `preguntas-frecuentes`, `contacto`) | Footer link targets must match these real slugs | Reference |
| `src/i18n/*`, `src/middleware.ts`, `src/messages/*` | i18n runtime | — | Create |
| `src/components/layout/*` | header, footer, mobile-nav, language-toggle, whatsapp-button | — | Create |
| `src/lib/store-settings.ts` | typed `getStoreSettings()` wrapper | — | Create |

### Data Flow

**Footer free-shipping line (only backend read in T2):**
`[locale]/layout.tsx` (RSC) renders `<SiteFooter/>` → `SiteFooter` (async RSC) calls `getStoreSettings()` in `src/lib/store-settings.ts` → `createClient()` (`src/lib/supabase/server.ts`, publishable key, RLS) → `.from("store_settings").select(...).maybeSingle()` → returns typed `store_settings` Row or `null` (on absence/error, logged) → footer branches: if row present, render `formatMXN(row.free_shipping_threshold_cents)` line; else omit line, fall back store name to `SEED_STORE_NAME`. Fully server-rendered; no client fetch, no spinner.

**Locale resolution / toggle:**
Request → `src/middleware.ts` (`createMiddleware(routing)`) resolves locale from URL prefix or `NEXT_LOCALE` cookie (Accept-Language negotiation disabled) → default `es-MX` served without prefix, `en` served under `/en` → `[locale]/layout.tsx` calls `setRequestLocale(locale)` and wraps in `NextIntlClientProvider` → components call `getTranslations`/`useTranslations` against `src/messages/<locale>.json` (loaded in `src/i18n/request.ts`). User clicks `<LanguageToggle/>` (client) → `router.replace(pathname, { locale })` via `src/i18n/navigation` → URL segment rewritten, path preserved, `NEXT_LOCALE` cookie set by next-intl → RSC re-render in the new locale (no full reload).

**Clean separation from the `translations` table**: next-intl handles static UI chrome (JSON, build-time, no DB). The Supabase `translations` table (polymorphic `locale`+`entity_type`+`entity_id`+`field`, migration `0004`) handles DB content and is read only in T3+. They share ONLY the locale string (`es-MX`/`en`) — no shared runtime. Consistent tags (`es-MX`, not `es`) are required so T3's content lookup matches the UI locale.

### Similar Features (Reference Implementations)

- **No prior UI feature exists** — T2 is the first. The reference is the *conventions*, not a sibling feature: `config.ts` for centralization, `env.ts` for the throw-on-missing pattern, `money.ts` for the single-boundary rule, `button.tsx` for the cva/Slot/`cn` component style, and colocated `*.test.ts` for the parity test.
- **Static-page slugs** (`scripts/seed-data/content.ts`) are the only concrete existing artifact the footer must align to — link to real Spanish slugs, not invented English ones.

## Dependency Analysis

### Existing Dependencies to Leverage

- `radix-ui@^1.6.0` (unified package) — Dialog primitive for the mobile nav drawer/sheet if shadcn `Sheet` is not yet in the registry; `Slot` already used by Button.
- `@hugeicons/react@^1.1.9` + `@hugeicons/core-free-icons@^4.2.2` — hamburger, close (X), WhatsApp/chat, chevron icons. **Never mix icon sets** (CLAUDE.md).
- `class-variance-authority`, `clsx`, `tailwind-merge` (via `cn()`), `tw-animate-css`, `tailwindcss@4` — styling + motion utilities already present.
- `@supabase/ssr` + `@supabase/supabase-js` — via `createClient()` for the store-settings read.

### New Dependencies Needed

- **`next-intl@^4.13.2`** — App Router i18n. Peer deps `next: ^16.0.0` (ok), `react: ^19.0.0` (ok) — no conflict with Next 16.2.9 / React 19.2.4; `.npmrc` `legacy-peer-deps=true` covers any edge resolution. ~2KB, RSC-native. **Alternatives**: (Y) homegrown dictionaries + cookie/URL + `t()` helper — viable and dependency-free, but you reimplement middleware detection, `hreflang` alternates, and RSC message loading (the SEO-sensitive 20%); (Z) `next-i18next` / `i18next` — heavier, Pages-Router-oriented, more client JS, not recommended for RSC-first App Router. **Recommendation: next-intl.**

### Internal Dependencies

- `store-settings.ts` → `supabase/server.ts` → `env.ts` (`getPublicEnv`). Implication: the footer read requires `NEXT_PUBLIC_SUPABASE_*` present; on a misconfigured env the wrapper should still degrade to `null` + log, not crash the shell.
- All layout components → `src/i18n/*` + `NextIntlClientProvider` in `[locale]/layout.tsx`. Implication: any component using `useTranslations` must render inside the provider; server components use `getTranslations` (no provider needed) — keep the drawer/toggle client-side minimal.
- `middleware.ts` matcher must exclude `/api`, `/_next`, `/_vercel`, and file paths (`.*\\..*`) or unprefixed default-locale routes shadow static assets.

## External Research

### Library Documentation

- **next-intl 4.13.2** (App Router): configure `defineRouting` (`src/i18n/routing.ts`), `createNavigation` (`src/i18n/navigation.ts` → typed `Link`/`useRouter`/`usePathname`), `getRequestConfig` (`src/i18n/request.ts`, loads `src/messages/<locale>.json`), `createMiddleware` (`src/middleware.ts`), and `withNextIntl('./src/i18n/request.ts')` in `next.config.ts`.
  - **Routing decision**: `localePrefix: "as-needed"` → Spanish (default) served with NO prefix (`/`, `/productos`), English under `/en`. This gives distinct crawlable URLs (English gets indexed; a cookie-only single-URL switch is an SEO anti-pattern) AND clean prefix-free URLs for the Mexico-first market. next-intl auto-emits `<link rel="alternate" hreflang>` + `x-default`.
  - **First-visit detection decision**: set `localeDetection: false` so `/` always serves `es-MX` regardless of the browser's `Accept-Language` (Mexican users frequently have English-configured OSes; auto-negotiation would wrongly flip them). English is an explicit opt-in via the toggle; the `NEXT_LOCALE` cookie then persists the choice. **Flag as an explicit product decision, not a silent default.**
  - **Static rendering gotcha (Next 16)**: call `setRequestLocale(locale)` in each `[locale]` layout/page and provide `generateStaticParams` for the locales, or pages silently fall back to dynamic rendering (correctness fine, perf lost).
  - **Cookie**: next-intl uses `NEXT_LOCALE`. Do not introduce a second locale cookie for the future Supabase content layer — reuse `NEXT_LOCALE` / `getLocale()`.

### Motion Vocabulary (source: `.claude/skills/emil-design-eng/SKILL.md` — taste authority)

Cite in the ticket / dev / review:
- Animate **`transform` + `opacity` only**; never `height`/`width`/`margin`/`top`/`left`; never `transition: all` (name the property).
- Enter from `scale(0.95–0.97)` + `opacity:0` (**never `scale(0)`**); enter/exit use **`ease-out`**, on-screen movement uses `ease-in-out`; **never `ease-in`** for UI.
- Keep UI motion **< 300ms**; **exits faster than enters**; stagger lists 30–80ms.
- **Reduced motion is fewer/gentler, not zero**: under `prefers-reduced-motion: reduce`, keep opacity/color fades (~0.2s), remove transform/position motion.
- Hover transforms only under `@media (hover: hover) and (pointer: fine)`.
- Custom easings (built-ins "too weak"): `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`.
- Durations: button press 100–160ms; tooltips/popovers 125–200ms; dropdowns 150–250ms; modals/drawers 200–500ms.
- Prefer CSS transitions over `@keyframes` for the drawer so a mid-open dismiss is **interruptible**.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ------ | ------------ | ------------ | ---------- |
| next-intl `[locale]` migration breaks the single existing route / `page.tsx` | Med | Med | Move all routes under `[locale]/`; delete the template `page.tsx`; verify `/` and `/en` render; keep root `layout.tsx` thin |
| `setRequestLocale` omitted → pages go dynamic, losing static optimization | Med | Low | Add `setRequestLocale` + `generateStaticParams` in `[locale]` layout/page; note in dev-done |
| Middleware matcher misconfig shadows static assets under default (unprefixed) locale | Med | Med | Use matcher `['/((?!api|_next|_vercel|.*\\..*).*)']`; smoke-test favicon/image loading |
| Locale tag drift (`es` vs `es-MX`) between UI and future `translations` reads | Med | High | Fix `es-MX` in routing, messages filename, cookie, config `DEFAULT_LOCALE`; document as the canonical tag |
| Hardcoded UI strings creep into components | High | Med | AC-3 grep gate + review; all copy from dictionaries |
| Brand values hardcoded in components instead of tokens | Med | High | AC-9 + review; `## Brand Tokens` doc block; grep for hex/oklch in `src/components` |
| Motion violates the skill baseline (ease-in, `transition: all`, animating layout) | Med | Med | AC-13 + `review-animations` STANDARDS in Stage 5; exact specs in ticket |
| `store_settings` read failure crashes the footer/shell | Low | High | `getStoreSettings()` returns `null` + logs; footer branches; no throw |

### Performance Considerations

- **Shell should be static/RSC**: header, footer, WhatsApp button are server-rendered; only the drawer and toggle need client JS. Keep client components tiny to protect TTI on the mobile-heavy Mexican audience.
- **No layout shift**: reserve space for the footer free-shipping line and the WhatsApp button so late data / hydration doesn't cause CLS.
- **`store_settings` read** is a single indexed single-row select — negligible; do not over-fetch. Consider light caching (`unstable_cache`/revalidate) only if it shows in profiling — not required for T2.

### Security Considerations

- **No new attack surface**: no mutations, no new endpoints. The one read (`store_settings`) uses the RLS-enforced publishable-key client — confirm an RLS SELECT policy exists for anon on `store_settings` (T1 `0005_rls_policies.sql`); if not, the read returns empty and the footer degrades gracefully (still safe).
- **WhatsApp link**: `target="_blank"` MUST have `rel="noopener noreferrer"`. Prefill message is static config — no user input injected into the `wa.me` URL, so no injection vector; still URL-encode the message.
- **`error.tsx`** must not render `error.message`/stack in production (info leak) — show a generic localized message; log detail server-side only.
- **No secret exposure**: WhatsApp number is non-secret; keep it as plain config (not `NEXT_PUBLIC_`-prefixed env, not a secret).

## Implementation Recommendations

### Suggested Order of Implementation

1. **Install + wire next-intl** (`routing.ts`, `request.ts`, `navigation.ts`, `middleware.ts`, `withNextIntl` in `next.config.ts`) — everything else renders inside it; do first.
2. **Restructure routes** into `src/app/[locale]/` (move layout shell + homepage placeholder; delete template `page.tsx`/splash; thin the root `layout.tsx`) — depends on step 1's routing.
3. **Message dictionaries** (`es-MX.json` source of truth, then `en.json`) + the parity test — needed before components can pull strings.
4. **Design-token pass**: add easing vars + `## Brand Tokens` doc block to `globals.css`; fix fonts + metadata in the locale layout — establishes the visual/motion baseline before components.
5. **`getStoreSettings()` wrapper** — footer depends on it.
6. **Footer**, then **header + language toggle + mobile drawer**, then **WhatsApp button** — compose into the locale layout using tokens, dictionaries, and the motion specs.
7. **404 + error pages** (`not-found.tsx`, `error.tsx`) — localized, inside the shell.
8. **Responsive + motion polish** at 375/768/≥1024; verify reduced-motion and hover-capability gating.
9. **Gates**: `npm run lint`, `tsc`, `npm run test` (incl. parity test); grep for hardcoded strings + hardcoded colors.

### Key Decisions

- **i18n library**: `next-intl@^4.13.2` over homegrown — recommended (RSC-native, solves detection/hreflang, compatible peer deps).
- **Routing**: `localePrefix: "as-needed"` — Spanish unprefixed, English `/en` — recommended (SEO + clean default URLs).
- **Detection**: `localeDetection: false` — always land on Spanish; English is explicit opt-in — recommended (Mexico-first, deterministic). *Flag to the user as a product choice.*
- **Canonical locale tag**: `es-MX` (not `es`) everywhere — recommended (matches `CURRENCY_LOCALE` and future `translations` rows).
- **`<html>` placement**: in `[locale]/layout.tsx` (standard next-intl App Router pattern) so `lang` is the active locale — recommended; keep root `layout.tsx` thin.
- **Drawer primitive**: shadcn `Sheet` if addable to the registry, else `radix-ui` `Dialog` — recommended (accessible focus trap + Esc, matches conventions) over a hand-rolled drawer.

### Anti-Patterns to Avoid

- Don't build a cookie-only single-URL language switch — English never gets indexed (SEO). Use URL-prefix routing (`as-needed`).
- Don't read the `translations` DB table in T2 — that's T3+ content localization; T2 is static UI strings only. Keep the two systems separate (shared only by the `es-MX`/`en` tag).
- Don't hardcode UI copy, colors, or the WhatsApp number in components — dictionaries + tokens + `config.ts`.
- Don't animate layout properties or use `transition: all`/`ease-in`/`scale(0)`; don't skip `prefers-reduced-motion` or hover-capability gating (violates the Emil skill baseline).
- Don't let `error.tsx` leak `error.message`/stack in production.
- Don't grow `layout.tsx` into a god-file — extract header/footer/whatsapp into `src/components/layout/*` (SRP, ≤400 lines).
- Don't hardcode `lang="en"` or invent English static-page slugs — use the active locale and the real seeded Spanish slugs.
