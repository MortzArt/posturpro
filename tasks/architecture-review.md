# Architecture Review: T2 — App Shell & Design System

_Stage 10 (lightweight, review-only). Evaluated as the foundation the entire
Phase 1 storefront (T3 catalog, T4 PDP, T6 cart, T7 checkout, T13 homepage/static
pages) and the admin surface (T10) will inherit._

## Summary

A disciplined, well-reasoned shell. The i18n architecture, token seam, and
server/client split are the right shapes and will carry the storefront without
rework. The one architectural decision that must be revisited before it hardens
is the **shell being fully dynamic because `store_settings` is read in the
`[locale]` layout** — it silently opts every catalog/PDP page out of static
optimization. That is a routed, absorbable risk (T3/T4), not a blocker for T2.

**Verdict: SOUND (ship, with 2 risks routed to future tasks).**

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns | ✅ | Components render (`site-header`, `site-footer`), config in `nav-items.ts`/`config.ts`, data read isolated in `lib/store-settings.ts`, pure logic in `lib/whatsapp.ts`. No business logic in components. |
| Boundary validation | ✅ | `hasLocale()` guards the locale segment in both `layout.tsx` and `request.ts`; invalid → `notFound()`. `store-settings` uses `.maybeSingle()` + typed Row, never trusts presence. |
| Typed contracts | ✅ | `NavItem` union-typed keys, `StoreSettings` derived from generated `Database` types, `Locale` derived from `routing.locales`. Public signatures fully typed. |
| Service/data layer | ✅ | `getStoreSettings` is the single typed read wrapper (views → lib → supabase), RLS client not admin, `server-only`, `cache()`-memoized. Matches T1's `src/lib/` wrapper convention. |
| Type safety | ✅ | No `any`, no non-null `!` in shell code. `tsc --noEmit` clean. |
| shadcn / token discipline | ✅ | No hardcoded color/radius/font in any shell component; all via `bg-*`/`text-*`/`rounded-*`/`font-sans`. Drawer built on Radix Dialog primitive (dead `sheet.tsx` correctly removed in Stage 6). `global-error.tsx` inline colors are the documented, justified Next.js exception (stylesheet may be unavailable when the root layout fails). |
| DRY | ✅ | `NAV_ITEMS` shared by header + drawer; `FOOTER_LINK_CLASS` extracted; `FooterLinkGroup` factored. |
| File size / function size | ✅ | Largest shell file is `mobile-nav.tsx` at 197 lines; all functions small. |

## i18n Architecture Review (the load-bearing decision for T3–T14)

**Shape is correct and scales.** `defineRouting` is the single source of truth;
`navigation.ts`, `request.ts`, and `middleware.ts` all derive from it. `Locale`
is a derived type, `DEFAULT_LOCALE` in config is kept in lockstep with
`routing.defaultLocale` (and asserted by a test). This is exactly the
composition future tasks need.

- **Catalog (T3) / PDP (T4):** `<Link href="/sillas">` with locale-agnostic
  hrefs + `localePrefix:"as-needed"` means new pages just add routes under
  `[locale]/` and get correct ES/EN URLs for free. No shell change needed.
- **Static UI strings vs. DB `translations` table (T1):** the seam is clean and
  the boundary is documented. Static chrome strings live in
  `src/messages/<locale>.json` (build-time, `getTranslations`); DB content
  (product names, category copy) will be read at runtime in T3 keyed by the
  **same** `es-MX`/`en` tag that `useLocale()`/`getLocale()` resolves. There is
  exactly one locale source of truth (`NEXT_LOCALE` + next-intl), which is the
  single most important thing to get right here, and it is right (AC-17). T3
  should read the active tag via `getLocale()` — **not** re-derive locale from
  the URL or a second cookie.
- **Message-file scaling:** `es-MX.json`/`en.json` are flat namespaced objects
  (`nav`, `footer`, `home`, …). As T3–T13 add sections this file grows. next-intl
  supports splitting messages per-namespace / lazy loading; **flag for T13** when
  the dictionaries get large — not now (62 lines each).
- **Admin (T10) locale routing:** PRODUCT_SPEC says admin is *"fully separate
  from shopper sessions"* and the operator is a single non-technical owner.
  Admin almost certainly should **not** live under `[locale]` (no ES/EN toggle,
  no `hreflang`, no `as-needed` prefixing). The current middleware matcher
  `/((?!api|_next|_vercel|.*\\..*).*)` **will match `/admin`** and try to
  locale-route it. This is the composability risk below — routed to T10.

## Layout Composition Review

The shell is cleanly extensible. `[locale]/layout.tsx` owns `<html lang>`, the
font, metadata, and the `header / main(flex-1) / footer + FAB` frame; children
slot into `main`. Catalog grids, PDP, and static pages drop into `[locale]/…`
with zero shell edits. Cart drawer (T6) and checkout flow (T7) compose the same
way the mobile-nav drawer already demonstrates — the Radix Dialog + `forceMount`
+ CSS-transition + mounted-`FocusScope` pattern is a **reusable template T6
should copy, not hand-roll** (it already solved the closed-overlay pointer trap
and self-dismiss bugs that QA caught).

**One thing to watch:** the `[locale]/[...rest]/page.tsx` catch-all → `notFound()`
is a correct Next.js precedence trick (specific segments win over catch-all), and
it is well-commented. It is safe as real routes land, but it is subtle. Keep the
comment; a future dev must understand that adding `[locale]/sillas/page.tsx`
silently reclaims that path from the catch-all.

## Design-Token / Brand-Swap Seam Review

**Genuinely a one-file swap** (plus `config.ts` for copy). The OKLCH tokens in
`globals.css :root`/`.dark` are the only color source; the radius scale derives
from a single `--radius`; the font is one `next/font` import bound to
`--font-sans`. The `## BRAND TOKENS` block documents the exact edit surface. The
Stage 6 fixes (C-1 dead `--font-mono` Geist ghost, C-2 wrong doc path) closed the
only two holes. **Motion tokens are correctly separated** from brand tokens
(`--ease-*` are app-feel, explicitly "do not touch on a brand swap") — the right
conceptual line, and documented. Sustainable.

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| Shell layout is **fully dynamic** — `getStoreSettings()` calls `cookies()` via the RLS server client in `[locale]/layout.tsx`, forcing on-demand rendering of every route under the shell. This silently defeats static generation for catalog/PDP pages that would otherwise be prime SSG/ISR candidates. | **Medium** | Route to **T3/T4**. Clean path: read `store_settings` with a **non-cookie client** (it's public, RLS-readable, effectively static config) so the layout is statically renderable; or move the footer's read into a cross-request cache (`unstable_cache` / tag-based revalidation seeded from T10 admin edits). Then catalog pages can be static + ISR. Accepted as a T2 trade-off; must be reopened, not inherited by default. |
| `store_settings` fetched on **every** shell render — memoized per-request via `cache()` (good) but not cached across requests. | Low | Same fix as above absorbs it — cache the single-row config with tag revalidation once T10 can edit it. |
| Message dictionary is one whole file per locale. | Low | Fine for T2; revisit lazy/per-namespace loading in T13 as dictionaries grow. |
| No unbounded fetches, no N+1; single indexed single-row select. | ✅ | Nothing to do. |

## System Boundaries

- **Frontend/backend seam:** one typed read (`getStoreSettings`), RLS-enforced,
  `server-only`, graceful `null` degrade — textbook. No mutations, no new
  endpoints (correct for T2).
- **Middleware composability (T10):** `createMiddleware(routing)` is the *only*
  middleware today. When admin auth arrives, Next.js allows **one**
  `middleware.ts` — the two concerns must be composed in a single chain (locale
  middleware for storefront paths, auth for `/admin`), or the matcher split so
  locale routing explicitly **excludes** `/admin`. Clean composition
  (`pathname.startsWith('/admin')` branch), but a real integration point. Routed
  to T10.
- **No circular deps.** `routing.ts` is the leaf everything imports; components
  import `nav-items` / `i18n/navigation`; `lib` is independent. Clean DAG.

## Tech Debt Ledger

| Item | Type | Impact | Effort | Absorbing task |
|------|------|--------|--------|----------------|
| Shell forced dynamic by cookie-based `store_settings` read (blocks catalog static optimization) | Introduced (accepted) | Med | M | T3 / T4 |
| `store_settings` not cached across requests (no tag revalidation) | Introduced | Low | S | T10 (admin write defines the revalidation trigger) |
| Middleware not composed for admin auth; matcher will locale-route `/admin` | Latent | Med | S | T10 |
| `src/middleware.ts` vs. Next 16 `proxy` deprecation notice | Existing | Low | S | any cleanup ticket |
| Single monolithic message file per locale (will grow) | Latent | Low | S | T13 |
| Removed create-next-app font tangle, template splash, unused SVGs, dead `sheet.tsx` | **Reduced** | — | — | done in T2 |

No time bombs. Dependency health is good: `next-intl@4.13.2` (current, RSC-native,
peer deps satisfied), Radix primitives (maintained). No deprecated/unmaintained deps
introduced.

## Refactors Applied

None. This stage is review-only per the pipeline contract (Stage 9 owns `src/`
fixes). No `tasks/clean-code-backlog.md` entries added — the items above are
architectural and routed to their owning tasks rather than the clean-code backlog.

## Architecture Score: 8.5/10

Will this make sense to a new dev in 6 months at 2x team size? **Yes.** Every
non-obvious decision (locale tag choice, `<html>` placement, `forceMount` +
FocusScope, catch-all precedence, dynamic-render trade-off) is documented at the
point of use with the *why*, not just the *what*. The seams (i18n, tokens, data
wrapper, middleware) are the ones the next ten tasks actually need. The 1.5-point
deduction is entirely the fully-dynamic shell: correct expedient for T2, but it
quietly constrains the performance ceiling of the catalog, and that constraint is
invisible unless you read the dev-done footnote — it must be explicitly reopened
in T3/T4.

## Recommendation: APPROVE

Sound foundation. Two risks routed forward:
1. **T3/T4** — revisit the dynamic-shell / `store_settings` read so catalog and
   PDP pages can be statically optimized (read the public config without
   `cookies()`; add tag-based revalidation).
2. **T10** — compose admin auth into the single middleware chain and exclude
   `/admin` from locale routing (admin lives outside `[locale]`).
