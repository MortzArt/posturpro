# Task: T13 — Static Pages & Homepage

## Priority

**High** — This is a launch-blocker. T13 makes live the footer/nav links that have shipped as intentional dead links since T2 (`/sobre-nosotros`, `/envios-y-devoluciones`, `/preguntas-frecuentes`, `/contacto`), delivers the Contact form that wires the tested-but-dark T9 `contact_relay` email seam, and builds the real homepage (currently a T2 placeholder that explicitly defers hero/featured content to T13). T14 (SEO/launch hardening) is `blocked by: T13`, so the whole store cannot ship until this lands.

## Complexity

**medium** — Justification against the criteria:

- Spans 5–15+ files but follows existing patterns almost entirely: storefront pages copy the proven `marcas`/`categorias` server-component grammar; the Contact form copies the Q&A `useActionState` + form-state + custom-validation pattern; the rate limiter reuses `createSlidingWindowLimiter`; the email send reuses `sendContactRelay` verbatim.
- Adds new UI surfaces (9 static pages, homepage hero + featured sections, contact form) and **one** new backend seam (contact server action + rate limiter wiring), but **no new data model** — `static_pages` and `store_settings` tables already exist with RLS read policies.
- The one genuinely new-logic slice (contact form → rate-limit → sanitize → `sendContactRelay` → serializable form state) is a well-scoped copy of two existing patterns, not a new subsystem.

It is NOT `high`: no new migrations for tables/RPCs (only a **data-only seed expansion** of `static_pages` + an optional additive-column decision for showroom — see Data Model note), no new integration, no architectural change. It is NOT `low`: 9 new routes + homepage rebuild + a new server action with abuse controls is well beyond a pattern-copy bug fix.

## Feature Type

**full-stack** (`full-feature`).
Frontend: 9 static pages, homepage hero + featured chairs + featured brands, Contact form UI, footer/nav link reconciliation. Backend: new `getStaticPageBySlug` read wrapper, new `submitContactForm` server action wiring `sendContactRelay` with rate limiting + input hygiene, seed-data expansion. Both storefront locales (es-MX default + en) apply. All pipeline stages run at full depth; UI Design (Stage 3) and UX (Stage 8) are load-bearing (hero + featured layout, form states, showroom map).

## User Story

As a **prospective chair buyer in Mexico**, I want **a homepage that showcases featured chairs and brands, plus clear informational pages (about, shipping, returns, warranty, FAQ, privacy, terms, showroom) and a working way to contact the store**, so that **I can trust the store, understand its policies, find the showroom, and reach the owner before or after buying**.

And as the **non-technical store owner**, I want **the contact form to email me the visitor's message reliably (and safely, without spam abuse)**, so that **I never miss a customer inquiry and my inbox is not flooded by bots**.

## Background

What exists today:

- **Homepage** (`src/app/[locale]/page.tsx`) is a deliberate T2 placeholder: a localized `<h1>` + intro + two CTAs (`/sillas`, `/marcas`). Its own comment says "NO featured chairs, brands, or hero imagery — that is T13."
- **Footer** (`src/components/layout/site-footer.tsx`) already links to `/sobre-nosotros`, `/envios-y-devoluciones`, `/preguntas-frecuentes`, `/contacto` — all currently **dead links** that render the localized in-shell 404 via the `[locale]/[...rest]` catch-all (T2 AC-10). **Nav** (`nav-items.ts`) links to `/contacto` (also dead).
- **`static_pages` table exists** (migration `0004`): `id, slug (unique), title, body, is_published (default true), created_at, updated_at`. RLS: `anon` may `select` where `is_published = true` (migration `0005`). **Body is plain text (max 100k chars, CHECK in `0006`), NOT rich text / HTML.**
- **Seed** (`scripts/seed-data/content.ts` via `scripts/seed.ts`) currently seeds **only 4** of the 9 required pages: `sobre-nosotros`, `envios-y-devoluciones`, `preguntas-frecuentes`, `contacto`. Missing: standalone Returns, Warranty, Aviso de Privacidad, Terms, Showroom — and the combined `envios-y-devoluciones` must be reconciled if shipping/returns are split.
- **`store_settings` table exists** (`0003`): `store_name, contact_email, shipping_flat_rate_cents, free_shipping_threshold_cents, currency`. It has **NO showroom/address/hours/map/phone columns** — showroom data has no home today.
- **i18n**: `static_pages` localizes via the generic `translations` table (`locale, entity_type='static_page', entity_id, field, value`) — but **no translation rows are seeded**, so English static-page content does not exist yet. UI chrome localizes via `src/messages/{es-MX,en}.json` namespaces (`footer`, `nav`, `home`, `catalog`, ...); there is **no `staticPages` namespace yet**.
- **Contact email seam**: `sendContactRelay(input: ContactRelayInput): Promise<DispatchResult>` exists and is unit-tested (`src/lib/email/dispatch.ts`), but is **called nowhere**. It sends to `EMAIL_OWNER_ADDRESS`, HTML-escapes the message, and does NOT touch the `email_sends` order ledger (caller owns rate limiting). With no `EMAIL_API_KEY` (or `EMAIL_DEV_PREVIEW=1`) it logs a console preview and returns `{ ok: true, sent: false }`-style success; if `EMAIL_OWNER_ADDRESS` is absent it returns `{ ok: false, reason: "owner address unavailable" }`. **EMAIL_\* vars are blocked-on-user; the dev path is `EMAIL_DEV_PREVIEW=1`.**
- **Rate-limiter template**: `createSlidingWindowLimiter({ windowMs, maxPerWindow, maxKeys })` (`src/lib/rate-limit/sliding-window.ts`), wrapped for checkout as `checkCheckoutRateLimit(ip)` keyed by client IP (`src/lib/request/client-ip.ts`), disabled in tests via a `*_RATE_LIMIT_DISABLED=1` env var. Q&A uses the same limiter keyed `ip|productId` with a honeypot field.

Why this matters: this is the last content/UX task before launch hardening (T14). It converts a functionally-complete store into a presentable, contactable, policy-complete storefront.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

### Static pages (data-backed)

- [ ] **AC-1**: All **9** static pages resolve at their Spanish slug in es-MX and under `/en/<slug>` in English, returning HTTP 200 with the page title as an `<h1>`: About (`/sobre-nosotros`), Contact (`/contacto`), Shipping policy (`/envios`), Returns policy (`/devoluciones`), Warranty (`/garantia`), FAQ (`/preguntas-frecuentes`), Aviso de Privacidad (`/aviso-de-privacidad`), Terms (`/terminos`), Showroom (`/showroom`). The final slug set is single-sourced in a constants module; the shipping/returns split vs. the current combined `/envios-y-devoluciones` footer slug MUST be reconciled (see AC-10).
- [ ] **AC-2**: Each static page's `title` + `body` renders from the `static_pages` row read through a new typed wrapper `getStaticPageBySlug(slug, locale)` using the RLS-enforced public client — NOT hardcoded in the component.
- [ ] **AC-3**: `scripts/seed-data/content.ts` seeds **all 9** pages with placeholder es-MX copy (`is_published = true`); Aviso de Privacidad and Terms are structured as real legal-document placeholders (headed sections), not a single sentence. Re-running the seed is idempotent (upsert on `slug`).
- [ ] **AC-4**: English content for each static page renders from a seeded `translations` row (`locale='en', entity_type='static_page', field IN ('title','body')`); when an `en` translation row is absent for a page, the page falls back to the es-MX base `title`/`body` rather than 404ing or showing an empty page.
- [ ] **AC-5**: A static page whose row is missing or has `is_published = false` returns the localized in-shell 404 (via `notFound()`), never a 500 and never a blank shell.
- [ ] **AC-6**: Every static page exports `generateMetadata` producing a locale-correct `<title>` (validating the locale via `hasLocale`, falling back to `routing.defaultLocale`), consistent with the `marcas` page pattern.

### Homepage

- [ ] **AC-7**: The homepage renders a **hero** section (localized headline + subcopy + primary CTA to `/sillas`), a **Featured chairs** section showing up to N product cards (reusing `ProductCard`/`ProductGrid`), and a **Featured brands** section showing up to M brand tiles (reusing `IndexTile` + `BrandLogo`). N and M are named constants.
- [ ] **AC-8**: Featured chairs are fetched via the catalog query layer (`listProducts({ pageSize: N })` or a dedicated `listFeaturedProducts(limit)`); featured brands via `listBrands()` sliced to M (or `listFeaturedBrands(limit)`). No new "featured" DB flag/migration is introduced — selection is a bounded slice of existing active-content queries.
- [ ] **AC-9**: When there are zero active products or zero brands, the corresponding homepage section is **omitted** (not rendered as an empty grid) and the rest of the homepage still renders. Hero always renders.

### Footer / nav reconciliation

- [ ] **AC-10**: Every footer and nav link that previously 404'd now resolves to a real page. If the shipping/returns split is adopted, `site-footer.tsx`'s `/envios-y-devoluciones` link + `footer.links.shipping` label are updated so no footer/nav link points at a nonexistent slug. There are **zero** dead internal links in the footer, header nav, and homepage after this task.

### Contact form (wires the T9 seam)

- [ ] **AC-11**: The Contact page renders a form with fields: name, email, optional subject, message — plus a hidden honeypot field (mirroring Q&A). Submitting valid input calls a new `submitContactForm` server action which calls `sendContactRelay({ fromName, fromEmail, subject, message })`.
- [ ] **AC-12**: On a successful send (`DispatchResult.ok === true`, including dev-preview mode), the form shows a localized success state and clears the input values; `submissionId` increments per submit (idempotency-safe `useActionState` contract).
- [ ] **AC-13**: Inputs are trimmed and length-capped before send (name, email, subject, message each have a named max constant); email is validated against the existing `EMAIL_PATTERN`; invalid input returns `status: "invalid"` with `fieldErrors` and preserved `values` — no email is sent.
- [ ] **AC-14**: The action is rate-limited by client IP using the sliding-window limiter (dedicated `contact` limiter instance with its own window/max/maxKeys constants), disabled in tests via a `CONTACT_RATE_LIMIT_DISABLED=1`-style env flag. Over-limit returns `status: "rate-limited"` with preserved values and sends no email.
- [ ] **AC-15**: A tripped honeypot returns a **fake success** (no email sent, no error surfaced), mirroring the Q&A anti-spam pattern.
- [ ] **AC-16**: When `sendContactRelay` returns `{ ok: false }` (e.g. owner address unavailable, provider error), the form shows a localized error state with a retry affordance; the raw provider reason is **never** rendered to the user, only logged server-side.
- [ ] **AC-17**: The message body reaching `sendContactRelay` is passed as-is (the template HTML-escapes it); the action must not itself inject unescaped user input into any HTML.

### Showroom

- [ ] **AC-18**: The Showroom page renders a location block (address, hours, and either an embedded static map image OR a "Ver en mapas" link to Google/Apple Maps — no external map SDK). Showroom data (address, hours, map link/coords) is sourced from a single documented location (see Data Model Changes) with a config fallback, and degrades gracefully (renders address + hours text even if the map is unavailable).

### i18n & accessibility (both locales)

- [ ] **AC-19**: All static-page UI chrome (breadcrumb labels, contact form labels/placeholders/errors/success/rate-limit/error copy, homepage section headings, showroom labels) comes from a new `staticPages` (and/or `home`, `contact`) message namespace present in **both** `es-MX.json` and `en.json` with matching key structure — no hardcoded visible strings.
- [ ] **AC-20**: Every page is keyboard-navigable and screen-reader sane: the contact form associates labels with inputs, exposes validation errors via `aria-describedby`/`role="alert"`, and announces async success/rate-limit/error via `role="status"`/`role="alert"`, mirroring the Q&A form.

## Edge Cases

At least 5 that MUST be handled:

1. **Missing seed row for a page** — `getStaticPageBySlug('garantia')` returns `null` (row never seeded / DB reset without seed) → page calls `notFound()` → localized in-shell 404, not a 500 or blank body. (AC-5)
2. **Unpublished page** — a page row exists but `is_published = false` → anon RLS filters it out → wrapper returns `null` → in-shell 404. (AC-5)
3. **Missing English translation row** — `/en/terminos` requested but no `translations` row for `en/static_page/terminos` → page renders the es-MX base `title`/`body` (documented fallback), never an empty page. (AC-4)
4. **Contact email send failure** — `sendContactRelay` returns `{ ok: false, reason: "owner address unavailable" }` (EMAIL_OWNER_ADDRESS unset) or a provider timeout → form shows localized error + retry; user input preserved; raw reason logged not shown. (AC-16)
5. **Contact-form abuse (bot flood)** — same IP submits >max within the window → `status: "rate-limited"`, no email, values preserved, localized "please wait" copy; the `maxKeys` ceiling bounds memory against a key-cardinality attack. (AC-14)
6. **Honeypot tripped** — a bot fills the hidden field → fake success, no send, no error leaked. (AC-15)
7. **Oversized / hostile message** — a 100k-char message or one containing `<script>`/HTML/`javascript:` → trimmed + length-capped before send; the template HTML-escapes the body; nothing is rendered raw. (AC-13, AC-17)
8. **Empty catalog on homepage** — DB reset to 0 active products/brands → featured sections omitted, hero still renders, no empty grids or layout collapse. (AC-9)
9. **`store_settings` row absent** — homepage/footer store-name/free-shipping/showroom degrade to config fallbacks (existing `getStoreSettingsStatic` returns `null` gracefully) — no crash.
10. **Slug collision / reserved path** — a static-page slug must not shadow an existing route (`sillas`, `marcas`, `categorias`, `estilos`, `carrito`, `checkout`, `producto`); the dynamic static-page route must not intercept those. App-Router segment precedence handles this only if the static route is a distinct non-catch-all segment; slugs MUST be validated against the reserved set at seed time and at `generateStaticParams`.

## Error States Table

| Trigger | User Sees | System Does |
| --- | --- | --- |
| Static page slug not seeded / unpublished | Localized in-shell 404 (header + footer intact) | `getStaticPageBySlug` returns `null` → `notFound()`; warning logged |
| `en` translation row missing | Page in Spanish base copy (no error) | Wrapper falls back to base `title`/`body`; debug log only |
| Contact: invalid email/empty required field | Inline field error(s) under the field, focus preserved, values kept | Action returns `{ status: "invalid", fieldErrors, values, submissionId }`; no send |
| Contact: rate-limited | "Espera un momento antes de enviar otro mensaje" banner (`role="alert"`) | Limiter denies; action returns `{ status: "rate-limited", values }`; no send |
| Contact: honeypot filled | Success state (as if sent) | No send; logged as suspected bot; returns fake success |
| Contact: `sendContactRelay` `{ ok:false }` | "No pudimos enviar tu mensaje, inténtalo de nuevo" + retry, values preserved (`role="alert"`) | Raw `reason` logged with context; action returns `{ status: "error", values }` |
| Contact: unexpected exception in action | Same generic error state as above | Exception caught, logged; returns `{ status: "error" }` — never throws to the client |
| Homepage: zero products/brands | Featured section omitted; hero + other sections render | Section conditionally rendered on non-empty list |
| Showroom: map asset/link unavailable | Address + hours text only (no broken embed) | Map slot omitted; text block always renders |

## UX Requirements

For every state the UI can be in:

- **Loading**: Static pages and homepage are server-rendered (no client spinner — data resolves server-side like `marcas`). Contact form submit uses `useActionState` pending state to disable the submit button and show an inline "Enviando…" state on the button (no full-page spinner), mirroring existing forms.
- **Empty**: Homepage with no products/brands omits those sections (never an empty grid). A static page with no row → in-shell 404 with a CTA back to the catalog (reuse the existing `not-found.tsx` shell). FAQ/policy pages always have seeded placeholder copy so they are never blank.
- **Error**: Contact send failure → inline error banner (`role="alert"`) with a retry, input values preserved. Static-page/homepage data errors degrade gracefully (config fallbacks for settings; sections omitted) — never a raw error page for a content miss.
- **Success**: Contact submit success → success banner (`role="status"`, `.enter-fade`, auto-hide consistent with existing form success cadence) + cleared inputs. In dev preview mode (`EMAIL_DEV_PREVIEW=1`) this same success renders (message logged to console).
- **Mobile (375px)**: Hero stacks vertically (headline → subcopy → CTA full-width or intrinsic); featured chairs grid is 1 column; featured brands 1 column; showroom map/image is `max-w-full`; contact form is a single stacked column with `min-h-11` touch targets. No horizontal overflow (long emails/addresses `break-words`).
- **Tablet (768px)**: Featured chairs 2 columns; featured brands 2 columns; hero may go two-column (copy + image) if a hero image is used; content pages stay `max-w-prose` for readable line length.

## Technical Approach

### Files to Create

- `src/lib/content/static-pages.ts` — typed read wrapper: `getStaticPageBySlug(slug, locale)` (RLS public client, overlays `translations` for the requested locale with es-MX-base fallback), returns `{ title, body } | null`; `unstable_cache` with a `static-pages` tag, degrades to `null` like `store-settings.ts`. `export type StaticPage`.
- `src/lib/config/static-pages.ts` (or extend `src/lib/config/`) — single source of the 9 page slugs + a `staticPagePath(slug)` helper + reserved-slug guard set; showroom config fallback (address/hours/map link).
- `src/app/[locale]/[pageSlug]/page.tsx` — **one** dynamic route rendering any text-only static page by slug (server component: `generateStaticParams` over the known slug set, `generateMetadata`, `setRequestLocale`, `getStaticPageBySlug` → `notFound()` on null, breadcrumb + `max-w-prose` body). Prefer a distinct dynamic segment over 9 near-identical folders. Give Contact and Showroom their own explicit route folders (`contacto/`, `showroom/`) since they need bespoke UI beyond title+body; the generic route serves the other 7.
- `src/app/[locale]/contacto/page.tsx` + `contact-form.tsx` (client) + `actions.ts` (`submitContactForm` server action) + `contact-form-state.ts` — copy the Q&A form/action/state grammar (`useActionState`, honeypot, custom validation, serializable state).
- `src/lib/contact/submit-guard.ts` — pure validation (`validateContactSubmission`: trim, length caps, email pattern, honeypot) mirroring `src/lib/qa/submit-guard.ts`.
- `src/lib/contact/rate-limit.ts` — `checkContactRateLimit(ip)` wrapping a dedicated `createSlidingWindowLimiter` instance + `CONTACT_RATE_LIMIT_*` constants + `CONTACT_RATE_LIMIT_DISABLED` env check (mirror `src/lib/checkout/rate-limit.ts`).
- `src/app/[locale]/showroom/page.tsx` — showroom layout (address, hours, static map/link).
- Homepage section components under `src/components/home/` — e.g. `hero.tsx`, `featured-products.tsx`, `featured-brands.tsx` (server components composing existing `ProductGrid`/`IndexTile`).

### Files to Modify

- `scripts/seed-data/content.ts` — expand `STATIC_PAGES` from 4 → 9 pages with structured placeholder copy (es-MX) + English translation fixtures; export slug constants shared with the config module.
- `scripts/seed.ts` — seed `translations` rows for static pages (currently seeds none); update the seed summary count.
- `src/app/[locale]/page.tsx` — replace the T2 placeholder with hero + featured chairs + featured brands composition.
- `src/components/layout/site-footer.tsx` — reconcile `STORE_LINKS`/`HELP_LINKS` hrefs with the final 9-slug set (split shipping/returns if adopted); ensure no dead link.
- `src/components/layout/nav-items.ts` — verify `/contacto` now live (no change if slug unchanged).
- `src/messages/es-MX.json` + `src/messages/en.json` — add `staticPages`/`contact`/`home.featured`/`showroom` namespaces (matching keys in both).
- `src/lib/seed-invariants*.test.ts` — update seed-count invariants for the new page count.

### Data Model Changes

- **No new tables, no new RPCs.** `static_pages` and `store_settings` already exist with public RLS read.
- **Data-only seed change**: expand `static_pages` from 4 → 9 rows (idempotent upsert on `slug`) + seed `en` `translations` rows. No DDL required for the pages themselves.
- **Showroom fields (decision required — flagged in research)**: `store_settings` has no address/hours/map columns. Option **(A)** store showroom content inside the `showroom` static page `body` (zero schema change, honors "placeholder copy" scope) + map link/coords in `src/lib/config`; Option **(B)** add additive nullable columns to `store_settings` via a new migration `0014`. **Recommend (A) for Phase 1** (no admin UI to edit these until Phase 2 content editing). Document the choice in dev-done.

### API Endpoints

- **No new HTTP route handlers.** The contact form uses a **server action** (`submitContactForm`), consistent with Q&A and checkout — not an `/api/*` endpoint. Signature: `submitContactForm(prevState: ContactFormState, formData: FormData): Promise<ContactFormState>`.
- Static pages and homepage are server-component page reads, no API surface.

### Dependencies

- **No new packages.** Reuses in-repo modules only: `next-intl` (i18n), `sendContactRelay` (email), `createSlidingWindowLimiter` (rate limit), `createPublicClient` (RLS reads), existing catalog queries + card/tile/grid components, `@hugeicons/react` for icons. A static map is a plain `<img>`/link (no map SDK) to honor the no-external-dependency + CSP posture.

## Out of Scope

- Rich-text / WYSIWYG editing of static pages (Phase 2). Body stays plain text rendered as structured paragraphs.
- Admin UI to edit static-page content, homepage sections, or showroom fields (Phase 2 homepage section manager + rich-text editor).
- A "featured" DB flag or homepage section-ordering model — featured content is a bounded slice of existing active queries.
- Interactive/embedded map SDK (Google Maps JS, Mapbox) — a static image or maps deep-link only.
- Newsletter signup, social sharing, related products, autocomplete (Phase 2).
- Real legal copy for Aviso de Privacidad / Terms — **placeholder** structured copy only (real text is a pending client input per PRODUCT_SPEC).
- Wiring real `EMAIL_*` / `WHATSAPP_PHONE_E164` values — blocked-on-user; dev path is `EMAIL_DEV_PREVIEW=1`; WhatsApp button stays hidden until configured (existing guard).
- SEO metadata beyond a per-page `<title>` (sitemap, structured data, cookie consent are T14).
