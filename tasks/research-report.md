# Research Report: T13 — Static Pages & Homepage

## Codebase Analysis

### Existing Patterns

- **Storefront page grammar** — `src/app/[locale]/marcas/page.tsx:24-92` (also `categorias`, `estilos`): async server component, `params: Promise<{ locale }>`, `setRequestLocale(locale)` first, `getTranslations(namespace)`, `generateMetadata` that validates locale via `hasLocale(routing.locales, locale)` and falls back to `routing.defaultLocale`, `<section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">`, `Breadcrumbs` → `header` (h1 + subtitle) → grid/`EmptyState`. **Reuse strategy**: copy verbatim for every static page and the homepage sections; content body uses `max-w-prose`.
- **Server-action form (Q&A)** — `src/app/[locale]/producto/[slug]/actions.ts` + `qa-form-state.ts` + `src/components/product/qa-form.tsx`: React 19 `useActionState`, `(slug, prevState, formData) => Promise<FormState>`, serializable state `{ status, fieldErrors?, values?, submissionId }`, honeypot → fake success, trim + custom validation, rate-limit, RLS-anon insert. **Reuse strategy**: this is the exact skeleton for the Contact form/action/state; swap the DB insert for `sendContactRelay`.
- **Graceful settings read** — `src/lib/store-settings.ts:40-137`: `getStoreSettings` (React `cache`) and `getStoreSettingsStatic` (`unstable_cache` tag `store-settings`, cookie-free, revalidate `CATALOG_REVALIDATE_SECONDS`) both return `null` on absent-row / RLS / network error, never throw; logged with context. **Reuse strategy**: `getStaticPageBySlug` copies this degrade-to-null + `unstable_cache` shape (new tag `static-pages`).
- **Rate limiter** — `src/lib/rate-limit/sliding-window.ts` `createSlidingWindowLimiter({ windowMs, maxPerWindow, maxKeys }) → { check(key, now?), reset(), keyCount() }`; wrapped `src/lib/checkout/rate-limit.ts` `checkCheckoutRateLimit(ip)` + `CHECKOUT_RATE_LIMIT_DISABLED=1` env bypass; keyed by `clientIp()` (`src/lib/request/client-ip.ts`). In-memory, per-instance, oldest-key eviction at ceiling. **Reuse strategy**: new `src/lib/contact/rate-limit.ts` with its own instance + `CONTACT_RATE_LIMIT_*` constants + `CONTACT_RATE_LIMIT_DISABLED`.
- **Input hygiene** — trim-then-validate everywhere; `EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` (`src/lib/config/checkout.ts:132`); `escapeHtml` (`src/lib/email/render.ts:33-40`); honeypot + `isValidProductId` (`src/lib/qa/submit-guard.ts`). **Reuse strategy**: `validateContactSubmission` mirrors `validateQaSubmission`.
- **Locale-agnostic paths + `Link`** — `src/i18n/routing.ts` (`locales: ["es-MX","en"]`, `defaultLocale: "es-MX"`, `localePrefix: "as-needed"`, `localeDetection: false`); `src/i18n/navigation.ts` exports the locale-aware `Link`. Paths are Spanish-only slugs; `/en` prefix is added by `Link`. **No localized pathnames** (no `/en/about`). **Reuse strategy**: static-page slugs are single Spanish slugs; English is content-only via `translations`, not a separate URL.
- **In-shell 404 catch-all** — `src/app/[locale]/[...rest]/page.tsx` calls `notFound()` → localized `not-found.tsx` inside header+footer. Real routes at a path take precedence as they are added. **Reuse strategy**: the new static-page route supersedes the catch-all for its slugs; missing/unpublished rows still `notFound()`.

### Relevant Files

| File | Purpose | Relevance | Action |
| --- | --- | --- | --- |
| `src/app/[locale]/page.tsx` | Homepage (T2 placeholder) | Rebuild into hero + featured chairs + featured brands | **Modify** |
| `src/app/[locale]/marcas/page.tsx` | Brand index page | Canonical storefront-page template | Reference |
| `src/app/[locale]/producto/[slug]/actions.ts` + `qa-form-state.ts` | Q&A server action + state | Contact form/action/state template | Reference |
| `src/components/product/qa-form.tsx` | Q&A client form | Contact form UI template (a11y, honeypot, useActionState) | Reference |
| `src/lib/store-settings.ts` | Settings read/write + graceful null | `getStaticPageBySlug` degrade pattern | Reference |
| `src/lib/email/dispatch.ts` (`sendContactRelay`) | Contact relay send (untested-wired) | The seam this task wires | Reference (call it) |
| `src/lib/email/templates/contact-relay.ts` | Contact relay template (escapes body) | Confirms escaping is template-side | Reference |
| `src/lib/rate-limit/sliding-window.ts` | Generic limiter | Contact rate limiter core | Reference |
| `src/lib/checkout/rate-limit.ts` | Checkout limiter wrapper | Contact wrapper template | Reference |
| `src/lib/request/client-ip.ts` | Client IP extraction | Rate-limit key | Reference |
| `src/lib/catalog/queries.ts` | `listProducts`, `listBrands`, ... | Featured content source | Reference |
| `src/components/catalog/{product-card,product-grid,index-tile,brand-logo,breadcrumbs,empty-state}.tsx` | Reusable cards/tiles/chrome | Homepage + page composition | Reference |
| `src/components/layout/site-footer.tsx` | Footer w/ dead links | Reconcile link slugs | **Modify** |
| `src/components/layout/nav-items.ts` | Nav (has `/contacto`) | Verify link now live | Modify (verify) |
| `scripts/seed-data/content.ts` | `STATIC_PAGES` (4 pages) | Expand to 9 + English fixtures | **Modify** |
| `scripts/seed.ts:254-275` | Seeds `static_pages` + `store_settings` | Add `translations` seeding | **Modify** |
| `src/messages/{es-MX,en}.json` | i18n chrome | Add `staticPages`/`contact`/`home.featured`/`showroom` namespaces | **Modify** |
| `supabase/migrations/0004_content_qa.sql` | `static_pages` + `translations` DDL | Schema reference (no DDL change) | Reference |
| `supabase/migrations/0005_rls_policies.sql:208-227` | Anon read policies | Confirms public read gating | Reference |
| `src/lib/config/{catalog,shared}.ts` | Paths, `SEED_STORE_*`, `WHATSAPP_*` | Slug/path + config fallbacks | Reference/extend |
| `src/lib/content/static-pages.ts` | *(new)* static-page read wrapper | Create | **Create** |
| `src/lib/config/static-pages.ts` | *(new)* slug set + reserved guard | Create | **Create** |
| `src/app/[locale]/[pageSlug]/page.tsx` | *(new)* generic static-page route | Create | **Create** |
| `src/app/[locale]/contacto/` + `showroom/` | *(new)* bespoke pages | Create | **Create** |
| `src/lib/contact/{submit-guard,rate-limit}.ts` | *(new)* validation + limiter | Create | **Create** |
| `src/components/home/{hero,featured-products,featured-brands}.tsx` | *(new)* homepage sections | Create | **Create** |

### Data Flow

**Static page render**: request `/en/terminos` → App Router matches `[locale]/[pageSlug]` (or explicit `contacto`/`showroom` folder) → `setRequestLocale('en')` → `getStaticPageBySlug('terminos','en')` → `createPublicClient()` selects `static_pages` where `slug='terminos' and is_published=true` (RLS-enforced) + overlays `translations` (`locale='en', entity_type='static_page', entity_id, field in title/body`) → returns `{ title, body }` (es-MX base if no `en` row) or `null` → `null` → `notFound()`; else render breadcrumb + `<h1>{title}</h1>` + `max-w-prose` body. `unstable_cache` (tag `static-pages`, revalidate `CATALOG_REVALIDATE_SECONDS`).

**Homepage**: `/` → `setRequestLocale` → parallel `listProducts({ pageSize: N })` + `listBrands()` (cached catalog queries, RLS public client) → render hero (always) + featured-chairs section (omit if 0) + featured-brands section (omit if 0), reusing `ProductGrid`/`IndexTile`.

**Contact submit**: user submits form → client `useActionState` → `submitContactForm(prevState, formData)` server action → read fields → honeypot check (tripped → fake success) → `validateContactSubmission` (trim, length caps, `EMAIL_PATTERN`) → invalid → `{ status:'invalid', fieldErrors, values, submissionId }` → `clientIp()` + `checkContactRateLimit(ip)` → denied → `{ status:'rate-limited', values }` → `sendContactRelay({ fromName, fromEmail, subject, message })` (template HTML-escapes body; sends to `EMAIL_OWNER_ADDRESS`; dev-preview logs + returns ok) → `ok:true` → `{ status:'success', submissionId }` (values cleared) → `ok:false` → log `reason`, `{ status:'error', values }`. Client renders state via `role="status"`/`role="alert"`.

### Similar Features (Reference Implementations)

- **Q&A submission** (`producto/[slug]/actions.ts`, `qa-form.tsx`, `lib/qa/submit-guard.ts`) — closest analog to the Contact form: honeypot, trim/validate, sliding-window rate limit keyed by IP(+id), serializable `useActionState` result, a11y error/status announcing. Contact reuses this end-to-end, replacing the anon insert with `sendContactRelay`.
- **Brand/Category/Style index pages** (`marcas`, `categorias`, `estilos`) — reference for the static-page and homepage-section layout (server component, metadata, breadcrumb, grid, empty state, stagger animation constants `STAGGER_STEP_MS`/`STAGGER_MAX_STEPS`).
- **`SiteFooter`** (`site-footer.tsx`) — reference for reading `getStoreSettingsStatic` and degrading to config fallbacks; also the file whose dead slugs this task makes live.

## Dependency Analysis

### Existing Dependencies to Leverage

- `next-intl` — `getTranslations`/`setRequestLocale`/`useTranslations`, `routing`/`Link`. Already the i18n backbone.
- `sendContactRelay` / email module — tested; call it, don't rebuild. Handles preview mode + owner-address failure internally.
- `createSlidingWindowLimiter` + `clientIp()` — rate-limit infra, proven in checkout + Q&A.
- `createPublicClient` (`src/lib/supabase/public.ts`) — cookie-free RLS-enforced reads for static content (enables ISR).
- Catalog queries + card/tile/grid components — featured content with zero new query logic (slice existing lists).
- `@hugeicons/react` + `@hugeicons/core-free-icons` — icons (never mix sets).

### New Dependencies Needed

- **None.** No new npm package. Static map is a plain `<img>` / maps deep-link (no map SDK), consistent with the store's CSP/no-external-dependency posture and the "no external map SDK" scope line.

### Internal Dependencies

- `getStaticPageBySlug` depends on `createPublicClient` + `translations` overlay — implication: RLS translation policy (`0005:215-227`) already gates `en` static-page translations behind `is_published=true`, so the wrapper's join is safe for anon.
- Homepage featured sections depend on `listProducts`/`listBrands` cache tags (`CATALOG_CACHE_TAG`) — implication: admin product/brand edits already bust these, so featured content stays fresh with no new invalidation wiring.
- Contact action depends on `EMAIL_OWNER_ADDRESS` + `EMAIL_*` — implication: blocked-on-user for live send; `EMAIL_DEV_PREVIEW=1` is the working dev path and must be the test/QA path (success is exercisable without real keys).
- Footer slug reconciliation depends on the final slug decision — implication: pick slugs before dev so `footer.links` labels and hrefs are edited once.

## External Research

### API Documentation

- **None required.** No external API is integrated in this task. Mercado Pago, Supabase, and the email provider are all pre-wired; T13 consumes existing internal wrappers only.

### Library Documentation

- **next-intl (`as-needed` prefix)** — Spanish served at `/`, English at `/en`. Static-page slugs are single Spanish slugs; do NOT add localized pathnames (the repo deliberately avoids them). English is content-layer only via `translations`. `generateMetadata` must re-validate the locale (`hasLocale`) because the segment is user-controlled.
- **Next.js App Router segment precedence** — an explicit folder (`contacto/`, `showroom/`) and a single dynamic segment (`[pageSlug]`) both take precedence over the `[...rest]` catch-all. Risk: `[pageSlug]` is a dynamic segment at the same level as `sillas`, `marcas`, etc.; App Router resolves **static segments before dynamic**, so existing routes win — but confirm no static-page slug duplicates an existing static segment, and use `generateStaticParams` restricted to the known slug set so unknown slugs `notFound()` rather than being pre-rendered.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| `[pageSlug]` dynamic segment shadows/collides with existing routes (`sillas`, `producto`, etc.) | Med | High | `generateStaticParams` limited to the 9-slug set; reserved-slug guard in `config/static-pages.ts`; App Router prefers static segments; QA asserts existing routes still resolve |
| Shipping/returns slug reconciliation missed → footer link 404s persist | Med | Med | Single-source slug set; grep footer/nav for every href; AC-10 asserts zero dead links; e2e clicks all footer links |
| English static content absent (no seeded `translations`) → `/en/*` shows Spanish unexpectedly | High (until seeded) | Low | Documented es-MX fallback (AC-4); seed `en` translation fixtures; QA covers fallback path |
| Contact form spammable if rate-limit/honeypot misconfigured | Med | High | Reuse proven limiter + honeypot; dedicated instance with `maxKeys` ceiling; unit + integration coverage of over-limit and honeypot paths |
| Live email send blocked-on-user (no `EMAIL_*` keys) masks a real send bug | Med | Med | Exercise success via `EMAIL_DEV_PREVIEW=1` (returns ok); unit-test the action's `DispatchResult` branch mapping; flag live send as owner-gated like T8 Phase 5 |
| Showroom data has no schema home | Low | Low | Store showroom copy in the `showroom` static page body + config fallback for map link (Option A); no migration |
| `store_settings`/content rows absent after a DB reset → homepage/footer break | Low | Med | Existing graceful-null readers; featured sections omit on empty; hero always renders |
| `body` is plain text but placeholder "sections" tempt raw HTML injection into markup | Low | High | Render `body` as escaped text/paragraphs (split on newlines), never `dangerouslySetInnerHTML`; Aviso/Terms structure via seeded plain-text headings |

### Performance Considerations

- Static pages + homepage are server-rendered and cacheable (ISR via `unstable_cache` + `CATALOG_REVALIDATE_SECONDS`), keyed cookie-free so routes stay statically optimizable (same posture as `getStoreSettingsStatic`). Featured queries are bounded slices (`pageSize: N`), not full scans.
- Contact limiter is in-memory per instance; the `maxKeys` ceiling bounds worst-case memory. Acceptable for single-instance Phase 1; note in backlog that a multi-instance deploy would need shared-store rate limiting (same caveat as checkout/Q&A).

### Security Considerations

- **Injection**: contact message is user-controlled and emailed. Defense is template-side `escapeHtml`; the action must pass raw text and never build HTML itself (AC-17). No user input is rendered raw in any page (`body` rendered as escaped text).
- **Abuse/DoS**: rate limit by IP + honeypot + `maxKeys` cardinality bound. Honeypot returns fake success (no oracle for bots).
- **Data exposure**: reads use the RLS-enforced public/anon client; unpublished pages are invisible to anon (`is_published=true` policy). No secret ever reaches the client bundle; `EMAIL_*` are server-only, never `NEXT_PUBLIC_`.
- **Error hygiene**: `sendContactRelay` `reason` and any caught exception are logged server-side only, never surfaced (AC-16). No empty `catch{}`.

## Implementation Recommendations

### Suggested Order of Implementation

1. **Slug + config module** (`config/static-pages.ts`) — decide the final 9 slugs (resolve shipping/returns split) first; everything else references it. Reconcile `site-footer.tsx` + `nav-items.ts` here so no dead links remain.
2. **Seed expansion** (`content.ts` + `seed.ts`) — 9 pages + `en` translation fixtures + updated seed-invariant tests; `supabase db reset` clean. Depends on step 1 (slugs).
3. **`getStaticPageBySlug` wrapper** (`lib/content/static-pages.ts`) — degrade-to-null + translation overlay. Depends on step 2 (rows to read).
4. **Generic static-page route** (`[pageSlug]/page.tsx`) — renders the 7 text-only pages; `generateStaticParams` from the slug set. Depends on step 3.
5. **Contact page + action + limiter + guard** — copy Q&A grammar; wire `sendContactRelay`; exercise via `EMAIL_DEV_PREVIEW=1`. Independent of steps 3–4 (own folder).
6. **Showroom page** — address/hours from body/config + static map link. Depends on step 1 (config fallback).
7. **Homepage rebuild** (`page.tsx` + `components/home/*`) — hero + featured sections; omit-on-empty. Depends on catalog queries (already present).
8. **i18n namespaces** — fill `es-MX.json` + `en.json` in lockstep as each surface is built (never hardcode strings).

### Key Decisions

- **Static-page route shape**: recommend **one generic `[pageSlug]` route** for the 7 text-only pages + **explicit `contacto/` and `showroom/` folders** for the two interactive/structured pages — avoids 9 near-duplicate files while allowing bespoke UI where needed.
- **Showroom data home**: recommend **Option A** (content in the `showroom` page body + map link in config) — no migration, honors placeholder-copy scope, defers editable showroom fields to Phase 2. Flag Option B (additive `store_settings` columns) as the Phase 2 path.
- **Featured selection**: recommend **slicing existing active queries** (`listProducts({ pageSize: N })`, `listBrands().slice(0,M)`) over adding a `featured` flag — no schema change, matches "no build-ahead" rule; a dedicated `listFeaturedProducts(limit)` wrapper is optional sugar.
- **English content**: recommend **content-layer i18n via `translations`** (not per-locale URLs), with es-MX base fallback — matches the repo's `as-needed` prefix + no-localized-pathnames convention.

### Anti-Patterns to Avoid

- Don't render `static_pages.body` with `dangerouslySetInnerHTML` — body is plain text; split into escaped paragraphs. (XSS surface for later editable content.)
- Don't create 9 hand-copied page folders — a generic dynamic route + a slug constants set is DRY and reserved-slug-safe.
- Don't rebuild rate limiting or email sending — reuse `createSlidingWindowLimiter` and `sendContactRelay`; a bespoke limiter/email path is duplicate, untested surface.
- Don't hardcode any visible string in a component — every label/heading/error goes through the message namespaces in both locales (repo convention; storefront is es-MX+en symmetric).
- Don't surface the raw `sendContactRelay` `reason` or any provider/PG error to the user — log with context, return a friendly enum status.
- Don't add a "featured" DB column or homepage section model — that is Phase 2 build-ahead; use bounded slices of existing queries.
- Don't let the contact action throw — catch, log, return `{ status: "error" }`; the client must always get a serializable state.
