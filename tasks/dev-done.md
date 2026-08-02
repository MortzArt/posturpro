# Dev Summary: T13 — Static Pages & Homepage

Standard tier, Stage 4 (Dev). Full-stack. 22 files created + 8 modified. Zero TODOs, zero placeholders in code. No new migration (0013 latest, next 0014). No new npm deps.

**Verification:** `npx tsc --noEmit` clean · eslint clean (all touched files + full `src/app`) · unit **1698/1698** (102 files; +105 from T12's 1593, incl. 22 new tests) · local DB reseeded idempotently (**9** static_pages + **18** translations) · live spot-check on the running :3000 dev server — **all 20 surfaces render 200 with correct `<h1>`** (10 es-MX + 10 en).

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `src/lib/config/static-pages.ts` | created | Single source of the 9 slugs (`STATIC_PAGE_SLUGS` 7 generic + `CONTACT_SLUG`/`SHOWROOM_SLUG`), `RESERVED_SLUGS` guard with a **load-time throw** on collision (edge 10), `staticPagePath`/`isStaticPageSlug`, `HOME_FEATURED_PRODUCTS=8`/`HOME_FEATURED_BRANDS=6`, `HERO_IMAGE`, `SHOWROOM_MAP_URL`/`SHOWROOM_MAP_IMAGE` (all null Phase 1). |
| `src/lib/config/contact.ts` | created | Contact length caps (`CONTACT_NAME_MAX`…`CONTACT_MESSAGE_MAX`) + rate-limit tunables (`CONTACT_RATE_LIMIT_WINDOW_MS`/`_MAX_SUBMISSIONS_PER_WINDOW`/`_MAX_KEYS`) + `CONTACT_SUCCESS_FEEDBACK_MS=6000`. |
| `src/lib/config.ts` | modified | Barrel re-exports the two new config modules. |
| `src/lib/content/static-pages.ts` | created | `getStaticPageBySlug(slug, locale)` — RLS public-client base row + per-locale `translations` overlay with es-MX fallback (AC-4); degrade-to-null (edges 1–3, never throws); `unstable_cache` per `(slug, locale)`, tag `static-pages`. `export type StaticPage`. |
| `src/lib/content/parse-body.ts` | created | **Pure** body parser: `## ` → heading with slugified/de-duped id (FAQ deep-links), blank-line paragraph grouping, intra-paragraph soft breaks. No React, no I/O. |
| `src/components/content/static-page-body.tsx` | created | Renders `parseStaticBody` output as **escaped React children** — never `dangerouslySetInnerHTML` (AC-17). `max-w-prose`, `## `→`<h2 id scroll-mt-24>`, no mount animation (deliberate). |
| `src/app/[locale]/[pageSlug]/page.tsx` | created | Generic route for the 7 text pages: `generateStaticParams` over `STATIC_PAGE_SLUGS`, `isStaticPageSlug` guard + `notFound()` (edge 10), `generateMetadata` (locale-validated), `null`→`notFound()` (AC-5). |
| `src/lib/contact/submit-guard.ts` | created | **Pure** `validateContactSubmission` (trim → caps → `EMAIL_PATTERN`) + `isContactHoneypotTripped`. Mirrors `lib/qa/submit-guard`. |
| `src/lib/contact/rate-limit.ts` | created | `checkContactRateLimit(ip)` — dedicated `createSlidingWindowLimiter` instance + `CONTACT_RATE_LIMIT_DISABLED=1` hatch. Mirrors `lib/checkout/rate-limit`. |
| `src/app/[locale]/contacto/contact-form-state.ts` | created | Serializable `ContactFormState` + `initialContactFormState` (outside `"use server"`). |
| `src/app/[locale]/contacto/actions.ts` | created | `submitContactForm` server action: honeypot→fake success, validate→invalid, rate-limit→rate-limited, `sendContactRelay`→success/error. Never throws; raw reason never surfaced (AC-16). |
| `src/app/[locale]/contacto/contact-form.tsx` | created | Client island copying `qa-form.tsx`: honeypot, `useActionState`, full state matrix, live char counter, retry, auto-hide success, a11y (labels/`aria-describedby`/`role=status`/`alert`). |
| `src/app/[locale]/contacto/page.tsx` | created | Server shell: breadcrumb + h1 + prose intro/hours (from `contacto` body via `StaticPageBody`) + `<ContactForm>`; `null`→`notFound()`. |
| `src/app/[locale]/showroom/page.tsx` | created | Showroom: address/hours body (always renders) + map column (config image→token pin panel; config link→"Ver en mapas" or omitted) — AC-18. |
| `src/components/home/hero.tsx` | created | Editorial split hero; `HERO_IMAGE` null → token chair-glyph panel (no broken img); `.enter-fade` mount, `.link-arrow` secondary link. |
| `src/components/home/section-header.tsx` | created | Shared `HomeSectionHeader` ("{heading} … Ver todas →"). |
| `src/components/home/featured-products.tsx` | created | Wraps `ProductGrid`; returns `null` when empty (AC-9). |
| `src/components/home/featured-brands.tsx` | created | Wraps `IndexTile`+`BrandLogo` (async, resolves `logoAlt`); returns `null` when empty (AC-9). |
| `src/app/[locale]/page.tsx` | modified | Homepage rebuild: hero (always) + featured chairs + featured brands; featured reads degrade to `[]` (edge 9); sections omitted on empty (edge 8). `generateMetadata` from `metadata` namespace. |
| `src/components/layout/site-footer.tsx` | modified | 3 real link columns + Legal (`lg:grid-cols-4`); split shipping/returns; showroom contextual link on store-info block. Zero dead links (AC-10). |
| `scripts/seed-data/content.ts` | modified | `STATIC_PAGES` 4→**9** with structured `##` es-MX bodies + `en` overlay per page; `EN_LOCALE`/`STATIC_PAGE_ENTITY_TYPE` exports. |
| `scripts/seed.ts` | modified | Seeds `translations` (18 rows) via a new `staticPageIdBySlug` map, upsert on `(locale,entity_type,entity_id,field)`; summary now prints `translations`. |
| `src/messages/es-MX.json` + `en.json` | modified | Replaced flat `home.*` with `home.hero.*`/`home.featured.*`; added `contact.*` + `showroom.*`; extended `footer.*` (Legal + 6 links). 434 keys each, parity verified. |
| `src/messages/keys-used.test.ts` | modified | `CONSUMED_KEYS` updated for the new home/footer/contact/showroom keys. |
| `src/lib/seed-invariants-extra.test.ts` | modified | Asserts 9 pages + es-MX/en non-empty, config-set parity (AC-1), reserved-slug disjointness (edge 10), headed legal/FAQ bodies (AC-3). |
| `src/lib/content/parse-body.test.ts` | created | 9 tests: headings, dedupe, paragraphs, soft breaks, hostile input, CRLF. |
| `src/lib/contact/submit-guard.test.ts` | created | Validation + caps + email shape + 100k-message cap (edge 7) + honeypot. |
| `src/lib/contact/rate-limit.test.ts` | created | Per-window max, per-IP isolation, disable hatch. |
| `src/app/globals.css` | modified | `.static-heading:target` accent bar (color/border only, reduced-motion-safe). |

## Data-Testids Added
- `hero-cta-catalog`, `hero-link-brands`, `hero-image-fallback` — hero (`components/home/hero.tsx`)
- `featured-products`, `featured-products-view-all`, `featured-brands`, `featured-brands-view-all`, `featured-brand-tile` — homepage sections
- `static-page-body` — prose renderer (`components/content/static-page-body.tsx`)
- `contact-form`, `contact-name`, `contact-email`, `contact-subject`, `contact-message`, `contact-counter`, `contact-submit`, `contact-success`, `contact-rate-limited`, `contact-form-error`, `contact-*-error` — contact form
- `showroom-map`, `showroom-map-link` — showroom map column
- `footer-link-showroom` (+ existing `footer-link-{about,shipping,returns,warranty,faq,contact,privacy,terms}`) — footer

## Key Decisions
- **Route shape:** one generic `[pageSlug]` for the 7 text pages + explicit `contacto/`/`showroom/` folders (DRY, static-segment precedence). Verified live: existing routes still 200, unknown/reserved slugs 404.
- **Showroom data home:** **Option A** — copy in the `showroom` page body + map link/image in config. No migration, honors placeholder scope; Option B (additive `store_settings` columns) deferred to Phase 2.
- **FAQ:** headed list with native `:target` deep-links — zero client JS, all answers Ctrl-F/SEO-visible.
- **Featured selection:** bounded slices of `listProducts({pageSize:8})` / `listBrands().slice(0,6)` — no "featured" DB flag.
- **Per-`(slug,locale)` cache readers:** memoized `unstable_cache` closures so each locale caches independently under the shared `static-pages` tag (the wrapped body never touches cookies — ISR-safe).
- **Old flat `home.*` keys deleted** (no other consumer) rather than left orphaned.

## Deviations from Ticket / Design Spec
- **None.** Every ui-design.md decision (slug split, 3-column footer + Legal, split-hero token fallback, headed-FAQ `:target`, verbatim contact grammar, no-animation prose, Option-A showroom, full message-key inventory) implemented as specified.

## Edge Cases Handled
1. **Missing seed row** → `getStaticPageBySlug` returns `null` → `notFound()` (verified: unknown slug 404).
2. **Unpublished page** → anon RLS filters it → `null` → in-shell 404.
3. **Missing `en` translation** → per-field fallback to es-MX base in `readStaticPage` (the `??` overlay).
4. **Contact send failure** (`{ok:false}` / owner-address-unavailable, the current default with no EMAIL_* env) → `status:"error"` + retry, values preserved, raw reason logged only.
5. **Contact abuse** → dedicated per-IP sliding window + `maxKeys` ceiling → `status:"rate-limited"` (unit-tested).
6. **Honeypot tripped** → `status:"success"` fake, no send.
7. **Oversized/hostile message** → capped at `CONTACT_MESSAGE_MAX` before send (unit-tested); template HTML-escapes; body rendered as escaped text.
8. **Empty catalog** → featured sections omitted, hero renders (page-level + component-level guard).
9. **Featured read failure / absent settings** → try/catch → `[]`, hero survives; footer degrades to config fallbacks (existing).
10. **Slug collision / reserved path** → `RESERVED_SLUGS` + load-time throw + `generateStaticParams` restricted to the 7 generic slugs; verified `/sillas`,`/marcas`,`/producto` unaffected.

## How to Test
1. `npm run db:seed` (idempotent) → summary shows `static_pages: 9`, `translations: 18`.
2. Visit `/`, all 9 slugs, `/contacto`, `/showroom` and their `/en/*` counterparts → 200, localized `<h1>`, English body via overlay.
3. Deep-link `/preguntas-frecuentes#puedo-devolver-mi-silla` → scrolls to the framed question (no JS).
4. Contact form: submit empty → inline field errors, values kept, focus first invalid; submit valid with **no** EMAIL_* env → error banner + retry (raw reason never shown).
5. **Success path (QA):** set `EMAIL_OWNER_ADDRESS=<dummy>` **and** `EMAIL_DEV_PREVIEW=1` (owner-address check precedes the preview short-circuit in `dispatch.ts` — both required) + `CONTACT_RATE_LIMIT_DISABLED=1` → submit → success banner, cleared inputs, console preview.
6. Footer: every link resolves 200 (verified live — zero dead links).

## AC Coverage Map
| AC | Status | Where |
|----|--------|-------|
| AC-1 (9 pages, es-MX + `/en/`, `<h1>`, single-sourced slugs, split reconciled) | ✅ verified live (20/20 render 200) | `config/static-pages.ts`, routes, `content.ts` |
| AC-2 (title+body via `getStaticPageBySlug`, not hardcoded) | ✅ | `content/static-pages.ts` |
| AC-3 (seed 9 es-MX, legal headed, idempotent upsert) | ✅ verified reseed | `content.ts`, `seed.ts`, invariant test |
| AC-4 (en from `translations`, es-MX fallback) | ✅ verified live (en titles) | overlay in wrapper + seed |
| AC-5 (missing/unpublished → `notFound`, no 500/blank) | ✅ verified live (404) | route `notFound()` |
| AC-6 (`generateMetadata` locale-correct, `hasLocale` fallback) | ✅ | all 3 route files |
| AC-7 (hero + featured chairs + featured brands, named consts) | ✅ verified live | `page.tsx` + `components/home/*` |
| AC-8 (featured via catalog layer, no new flag) | ✅ | slices of `listProducts`/`listBrands` |
| AC-9 (omit empty section, hero always) | ✅ | page + component guards |
| AC-10 (zero dead footer/nav links) | ✅ verified live (9/9 200) | `site-footer.tsx`, `nav-items.ts` |
| AC-11 (fields + honeypot → action → `sendContactRelay`) | ✅ | contact form + action |
| AC-12 (success clears + `submissionId`) | ✅ | form + action |
| AC-13 (trim/cap/validate, invalid preserves values, no send) | ✅ unit | `submit-guard.ts` |
| AC-14 (IP rate limit, disable env, over-limit no send) | ✅ unit | `rate-limit.ts` |
| AC-15 (honeypot → fake success) | ✅ | action + guard |
| AC-16 (`{ok:false}` → error+retry, raw reason never shown) | ✅ verified default (no EMAIL_*) | action mapping |
| AC-17 (message passed raw; no unescaped injection) | ✅ | action passes verbatim; body escaped |
| AC-18 (showroom address/hours + map or link, degrades) | ✅ verified live (token panel) | `showroom/page.tsx` |
| AC-19 (all chrome from namespaces, both locales) | ✅ parity verified | messages + `keys-used` |
| AC-20 (keyboard/SR sane, labels, `aria-describedby`, roles) | ✅ | contact form |

## Known Limitations
- **Contact success is not exercisable without `EMAIL_OWNER_ADDRESS`** (blocked-on-user, like T8 Phase 5). Dev/QA path: `EMAIL_OWNER_ADDRESS=<dummy>` + `EMAIL_DEV_PREVIEW=1`; `sendContactRelay` branches already unit-tested in `dispatch.test.ts`.
- **In-memory rate limiter** is per-instance (documented backlog caveat shared with checkout/Q&A).
- **Legal copy** (Aviso/Terms) is structured **placeholder** with a "reference text" disclaimer — real text pending client input (Out of Scope).
- `HERO_IMAGE`/`SHOWROOM_MAP_*` are `null` Phase 1 → token panels render; set config values when real assets/address land.

## Dependencies Added
- **None.** Reuses `next-intl`, `sendContactRelay`, `createSlidingWindowLimiter`, `createPublicClient`, catalog queries, and shipped card/tile/grid/breadcrumb/button components + shipped motion classes.

## Review + Fix Pass (ReviewFix Stage — S4, ultrareviewfix)

### Issues Found & Fixed

| ID  | Severity | Title | Status | File | Fix Applied |
| --- | -------- | ----- | ------ | ---- | ----------- |
| m-1 | MINOR    | Interior CR/LF control chars in `name`/`subject` reach the relay email subject line | FIXED | `src/lib/contact/submit-guard.ts:34-47,77-82` | Added pure `stripControlChars()` (collapses any C0/DEL/C1 run to a single space, then trims); applied to `name` + `subject` after trim, before length/required checks. Control-only name → `""` → `nameRequired`. Not exploitable via Resend's JSON HTTP API (no SMTP header injection), but hardens subject-line hygiene. +2 characterization tests in `submit-guard.test.ts`. |

### Summary

- Critical: 0/0 fixed
- Major: 0/0 fixed
- Minor: 1/1 fixed, 0 skipped

### Verification (independent, not trusted)

- `npx tsc --noEmit`: clean
- `npx eslint` (all touched T13 files): clean
- Unit suite: **1700/1700** (was 1698; +2 new contact-guard hardening cases)
- Message parity: es-MX / en both 434 keys, zero asymmetry (flatten-diff)
- RLS `translations_anon_select` (`0005:216`) confirmed grants anon SELECT on `static_page` translation rows → the `en` overlay genuinely resolves (AC-4 is real, not a silent Spanish fallback)
- Verdict: **APPROVE**, quality **9.5/10**. All 20 ACs met in code, all 10 edge cases handled. Full findings in `tasks/review-findings.md`.
