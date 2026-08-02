# Research Report: T16 — B2B landing page (offices, quote form)

> One-pass codebase inventory for the standard pipeline. The page reuses two shipped stacks:
> the **T13 contact-relay** flow (form → action → guard → rate-limit → email template →
> dispatch) and the **T15 Casa de Azulejo** world (home components, image slots, motion). This
> report maps exactly what is reused verbatim vs. extended, and the seams where new code plugs
> in. All paths absolute; line numbers exact at time of scan.

## Codebase Analysis

### Existing Patterns

- **Public unauthenticated write path with layered abuse controls** — the canonical example is
  `submitContactForm` (`/Users/MortzArt/Documents/projects/posturpro/src/app/[locale]/contacto/actions.ts:38`).
  Order: honeypot (`:50`) → validation (`:57`) → rate-limit (`:82`) → relay (`:88`), never
  throws to client (`relayContactMessage` `:96` catches `{ok:false}` and exceptions, logs the
  raw reason server-side, surfaces only a generic `{status:"error"}`). **Reuse strategy:** copy
  this file to `empresas/actions.ts` as `submitQuoteForm`, swap the guard/limiter/relay calls.
- **PURE, I/O-free validation guard** — `validateContactSubmission`
  (`src/lib/contact/submit-guard.ts:70`) trims, strips control chars (`stripControlChars` `:42`,
  a header-injection defense for fields flowing into the email subject), length-caps, and
  shape-checks email via `EMAIL_PATTERN`. Returns `{ok, values, fieldErrors}` with typed
  field-key/error-key unions (`:21`, `:32`). **Reuse strategy:** clone to
  `src/lib/quote/submit-guard.ts`; ADD a `teamSize` membership check against `QUOTE_TEAM_SIZES`
  (the one genuinely new validation — an enum, not a length/shape check).
- **Dedicated per-form sliding-window rate limiter** — `contact/rate-limit.ts:20` builds its
  OWN `createSlidingWindowLimiter` instance (own map, own key-space) so contact traffic never
  shares a bucket with checkout/Q&A; a `CONTACT_RATE_LIMIT_DISABLED=1` server-only env hatch
  (`:40`) lets tests submit repeatedly. **Reuse strategy:** clone to `src/lib/quote/rate-limit.ts`
  with a fresh instance + `QUOTE_RATE_LIMIT_DISABLED=1` — a separate instance is REQUIRED so the
  quote form and contact form throttle independently (edge 4).
- **Serializable form-state contract outside the `"use server"` module** —
  `contacto/contact-form-state.ts` holds `ContactFormState`/`ContactFormValues`/
  `initialContactFormState`. A `"use server"` file may export ONLY async functions, so the type
  + initial object must live in a sibling module. **Reuse strategy:** clone to
  `empresas/quote-form-state.ts`.
- **`useActionState` client form with a full state matrix** — `contacto/contact-form.tsx` is the
  gold template: off-screen honeypot (`:151`, `absolute left-[-9999px]` + `aria-hidden` +
  `tabIndex=-1` + `autoComplete="off"`), first-invalid focus effect (`:122`), success
  clear+focus+auto-hide effect (`:102` using `CONTACT_SUCCESS_FEEDBACK_MS`), `FormBanner`
  (rate-limited = `bg-warning/10`, error = `text-destructive`, both `role="alert"`),
  `SuccessBanner` (`role="status"`), live `CharacterCounter`, reusable `fieldClasses`
  string (`:67`, `min-h-11 rounded-md border border-border … aria-invalid:border-destructive`),
  `Field` subcomponent. **Reuse strategy:** clone to `empresas/quote-form.tsx`; the ONLY new UI
  primitive is a labeled native `<select>` for team size (the `Field` component handles
  text/email inputs; add a small `SelectField` or inline the `<select>` with the same
  `fieldClasses`).
- **Copy-driven marketing page (NOT DB-backed)** — the homepage
  (`src/app/[locale]/page.tsx`) reads all copy from the `home` i18n namespace via
  `getTranslations("home")`, composes `Hero`/`EditorialBand`/`FeaturedProducts`/`FeaturedBrands`
  in `<section>` wrappers (`max-w-(--breakpoint-xl) px-4 py-16 md:px-6 md:py-24 lg:px-8`), and
  sets `generateMetadata` from the `metadata` namespace. **Reuse strategy:** the B2B page mirrors
  this exactly — copy from a new `empresas` namespace, no DB read, no `static_pages` row. This
  is why the page renders even with empty content tables (edge 6).
- **Pure email template + dispatch seam** — templates are `(input, chrome) => RenderedEmail`,
  pure, unit-testable (`src/lib/email/templates/types.ts:9`). `renderContactRelay`
  (`src/lib/email/templates/contact-relay.ts:38`) is es-MX-only (a relay TO the owner), quotes
  the message verbatim via `quotedMessageHtml` (`:29`, `escapeHtml` + `\n`→`<br/>`), and builds
  a `Mensaje de contacto de {name}` subject. Dispatch seam `sendContactRelay`
  (`src/lib/email/dispatch.ts:290`): resolve owner address or `{ok:false,"owner address
  unavailable"}`, render, `sendWithTimeout`, `replyTo = input.fromEmail`, NO ledger (not
  order-scoped). **Reuse strategy:** NEW `quote-relay.ts` template (fields differ — see
  "Key Decisions") + NEW `sendQuoteRelay` seam beside `sendContactRelay`.

### Relevant Files

| File | Purpose | Relevance | Action |
| --- | --- | --- | --- |
| `src/app/[locale]/contacto/actions.ts` | Contact server action, branch matrix | Direct template for `submitQuoteForm` | Reference |
| `src/app/[locale]/contacto/contact-form.tsx` | Client form, full state matrix | Direct template for `quote-form.tsx` | Reference |
| `src/app/[locale]/contacto/contact-form-state.ts` | Serializable state contract | Template for `quote-form-state.ts` | Reference |
| `src/app/[locale]/contacto/page.tsx` | Bespoke page RSC + `generateMetadata` + label bag | Template for the page shell | Reference |
| `src/lib/contact/submit-guard.ts` | Pure validation + honeypot | Template for `quote/submit-guard.ts` | Reference |
| `src/lib/contact/rate-limit.ts` | Dedicated limiter instance + hatch | Template for `quote/rate-limit.ts` | Reference |
| `src/lib/config/contact.ts` | Field caps + rate tunables | Template for `config/quote.ts` | Reference |
| `src/lib/email/templates/contact-relay.ts` | Pure es-MX owner relay template | Template for `quote-relay.ts` | Reference |
| `src/lib/email/dispatch.ts` | Dispatch seams (`sendContactRelay` `:290`) | ADD `sendQuoteRelay` beside it | **Modify** |
| `src/lib/rate-limit/sliding-window.ts` | Shared audited limiter core | `createSlidingWindowLimiter` reused as-is | Reference |
| `src/lib/config.ts` | Barrel (`export * from "./config/*"`) | Add quote re-export | **Modify** |
| `src/components/home/hero.tsx` | Hero (headline/CTA/media, null-degrade) | Compose or model B2B hero | Reference |
| `src/components/home/editorial-band.tsx` | Cartouche band + cobalt caption/scrim | Compose for a value/process band | Reference |
| `src/components/home/section-header.tsx` | Roman-caps section title + `.link-arrow` | Compose section headers | Reference |
| `src/lib/config/imagery.ts` | `string\|null` image slots | Optional `B2B_HERO_IMAGE` slot | Modify (opt) |
| `src/app/globals.css` | Motion layer (`.enter-fade` 414, `.link-arrow` 468, `.card-lift` 492, `.stagger` 530) | Reuse classes verbatim | Reference |
| `src/components/layout/nav-items.ts` | `NAV_ITEMS` + closed `key` union | Add `offices` item | **Modify** |
| `src/components/layout/site-header.tsx` | Desktop nav (iterates `NAV_ITEMS` `:53`) | Auto-picks up new item | Reference |
| `src/components/layout/mobile-nav.tsx` | Mobile drawer (iterates `NAV_ITEMS` `:245`) | Auto-picks up new item | Reference |
| `src/components/layout/site-footer.tsx` | Footer link groups (`STORE/HELP/LEGAL_LINKS` :36-49) | Add `offices` link | **Modify** |
| `src/messages/es-MX.json`, `en.json` | i18n dictionaries (15 namespaces) | Add `empresas` namespace + nav/footer keys | **Modify** |
| `src/messages/keys-used.test.ts` | `CONSUMED_KEYS` allowlist (`:33`) | Register new keys | **Modify** |
| `src/i18n/routing.ts` | Locales `["es-MX","en"]`, `as-needed` prefix | Confirms `/empresas` + `/en/empresas` | Reference |
| `src/lib/config/static-pages.ts` | `RESERVED_SLUGS` (`:46`), `[pageSlug]` guard | Confirms no collision | Reference |
| `src/app/[locale]/[...rest]/page.tsx` | 404 catch-all | Static `empresas/` segment out-precedences it | Reference |
| `playwright.config.ts` | e2e webServer (`npm run dev`, env hatch `:20`) | Template for the quote e2e env | Reference |

### Data Flow

Quote submission (mirrors the contact flow exactly, with new field set):

1. **User** fills the quote form on `/empresas` (or `/en/empresas`) and submits.
2. **Client** — `<form action={formAction}>` in `quote-form.tsx`; `useActionState` invokes the
   server action with `FormData` (`company`, `name`, `email`, `phone`, `teamSize`, `needs`,
   `company_url` honeypot).
3. **Server action** `submitQuoteForm` (`empresas/actions.ts`):
   a. `isQuoteHoneypotTripped(company_url)` → if filled: `console.warn` + fake
      `{status:"success"}`, **return** (no send).
   b. `validateQuoteSubmission(...)` → trims, strips control chars, checks required/length/email
      shape + **teamSize ∈ QUOTE_TEAM_SIZES**; if `!ok`: `{status:"invalid", fieldErrors,
      values}`, **return** (no send).
   c. `clientIp()` (`@/lib/request/client-ip`) → `checkQuoteRateLimit(ip)`; if false:
      `{status:"rate-limited", values}`, **return** (no send).
   d. `sendQuoteRelay({company, fromName, fromEmail, phone, teamSize, needs})`.
4. **Dispatch** `sendQuoteRelay` (`dispatch.ts`): `ownerAddressOrNull()` → if null:
   `{ok:false,"owner address unavailable"}`. Else `renderQuoteRelay(input, chrome)` →
   `sendWithTimeout({to: owner, subject, html, text, replyTo: fromEmail})`.
5. **Provider** `sendEmail` (`@/lib/email/provider`) → Resend JSON API (or dev-preview
   short-circuit when `EMAIL_DEV_PREVIEW=1`).
6. **Back up the stack:** `{ok:true}` → action returns `{status:"success"}` (form clears);
   `{ok:false}`/throw → logged server-side, `{status:"error"}` (values preserved). No DB write
   at any point — the request exists only as an email to the owner.

### Similar Features (Reference Implementations)

- **T13 Contact page** (`src/app/[locale]/contacto/*` + `src/lib/contact/*` +
  `src/lib/email/templates/contact-relay.ts`) — near-identical shape. Key patterns to follow:
  the 4-step action ordering, the PURE guard with typed unions, the dedicated limiter instance
  + disable hatch, the state-contract-outside-`use server` split, the full client state matrix,
  the es-MX owner-relay template with verbatim-escaped body + `replyTo`. This is the primary
  reference — the quote flow is a field-set variation of it.
- **T13 Homepage** (`src/app/[locale]/page.tsx` + `src/components/home/*`) — the copy-driven,
  i18n-namespace, section-composition, per-page `generateMetadata` pattern for the page body.
- **T15 EditorialBand** (`src/components/home/editorial-band.tsx`) — the cobalt cartouche +
  caption-bar-as-AA-scrim pattern for any B2B value/process band with overlaid copy.
- **Q&A form** (`src/components/product/qa-form.tsx`) — the ORIGINAL source the contact form
  copied; a second reference if a subtlety in the contact form is unclear.

## Dependency Analysis

### Existing Dependencies to Leverage

- `next-intl` — `getTranslations`/`setRequestLocale`/`hasLocale`, `Link` from
  `@/i18n/navigation`. Version: repo-pinned.
- `@hugeicons/react` + `@hugeicons/core-free-icons` — icons (Building/Chair/Alert02/
  CheckmarkCircle02/ArrowRight01). NEVER mix icon sets (CLAUDE.md rule).
- `next/image` — cartouche image slots (fill + sizes + aspect box).
- `src/lib/rate-limit/sliding-window.ts::createSlidingWindowLimiter` — the shared audited
  limiter core (no copy).
- T9 email layer — `wrapEmail`/`renderHeading`/`renderParagraph`/`renderCallout`
  (`@/lib/email/layout`), `escapeHtml` (`@/lib/email/render`), `EMAIL_COLORS`/`EMAIL_TYPOGRAPHY`
  (`@/lib/email/brand`), `sendWithTimeout`/`ownerAddressOrNull` (private to `dispatch.ts`).
- `@/lib/request/client-ip::clientIp` — best-effort IP for the limiter.
- `EMAIL_PATTERN` (`src/lib/config/checkout.ts:132`) — shared email shape check.

### New Dependencies Needed

- **None.** No npm install, no new external service.

### Internal Dependencies

- `submitQuoteForm` (action) → `quote/submit-guard`, `quote/rate-limit`, `email/dispatch`,
  `request/client-ip`, `quote-form-state`. Implication: same clean seam layering as contact;
  each dependency is independently unit-testable.
- `quote-form.tsx` (client) imports `submitQuoteForm` (action) + `quote-form-state` (type/
  initial). Implication: the state contract MUST stay outside the `"use server"` module.
- `config/quote.ts` is imported by the guard, the limiter, AND the client form (field maxes +
  `QUOTE_TEAM_SIZES` for the `<select>`). Implication: `QUOTE_TEAM_SIZES` is the single source
  of truth binding the `<select>` options to the server-side enum check — do not duplicate the
  list in JSX.
- `nav-items.ts::NavItem["key"]` is a CLOSED union consumed by `site-header.tsx` +
  `mobile-nav.tsx` + `nav-items.test.ts`. Implication: adding `offices` requires editing the
  union type (a compile error otherwise) — a deliberate, type-safe seam.

## External Research

### API Documentation

- **None required.** No new external API. The email provider (Resend, via
  `@/lib/email/provider`) is already wired and abstracted; the quote relay reuses it through
  `sendWithTimeout`. Resend's JSON API is not a raw-SMTP header-injection vector, but the guard
  still strips control chars defensively (as the contact guard does).

### Library Documentation

- **next-intl** (already in use): `localePrefix: "as-needed"` means es-MX serves `/empresas`
  prefix-free and English serves `/en/empresas`; next-intl auto-emits `hreflang` alternates.
  `generateMetadata` must resolve the locale via `hasLocale(routing.locales, locale)` with a
  `routing.defaultLocale` fallback (homepage `:39`, contact `:30` pattern) to avoid a 500 on an
  unknown locale.
- **Next.js App Router** (already in use): a static route segment (`empresas/`) is resolved
  before the dynamic `[pageSlug]` and the `[...rest]` catch-all, so no `RESERVED_SLUGS` edit is
  needed. The page is a server component; only `quote-form.tsx` is `"use client"`.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Team-size accepted as free text / tampered enum reaches the relay | Med | Med | `QUOTE_TEAM_SIZES` membership check in the PURE guard (server boundary); native `<select>` on the client is convenience only. Unit-test the tamper case (edge 1). |
| Fabricated proof creeps into persuasive B2B copy (logos/testimonials/"trusted by N") | Med | High | AC-3 is a hard gate; copy uses real seeded brands or honest "multi-marca" claims only; image slots default to licensed-stock or null. Review + hacker stages grep for social-proof numbers. |
| Quote limiter shares state with contact limiter → cross-throttling | Low | Med | Separate `createSlidingWindowLimiter` INSTANCE (own map/key-space), exactly as contact vs checkout/Q&A. Assert independence in tests. |
| Firewall regression (admin restyled) via a stray shared-primitive edit | Low | High | The page composes storefront-scoped components only; no `src/components/ui/*`, `:root`, or shared-`sans` edit. Firewall e2e (`theme-firewall.spec.ts`) already guards this. |
| New i18n keys asymmetric between locales → parity test fails | Med | Low | Add keys to both files in lockstep; update `CONSUMED_KEYS`; run message-parity + keys-used tests (AC-13). |
| Nav `key` union not extended → tsc error / silent label miss | Low | Low | Extend `NavItem["key"]` with `offices` and add `nav.items.offices` in both locales (tsc + keys-used catch it). |
| Success path not exercisable in CI (owner email unset by default) | Med | Low | Set `EMAIL_OWNER_ADDRESS=dummy` + `EMAIL_DEV_PREVIEW=1` + `QUOTE_RATE_LIMIT_DISABLED=1` for the success test; default e2e asserts the correct error-on-submit (edge 3), exactly as T13 QA did. |

### Performance Considerations

- The page is server-rendered copy + one client island; no client data fetching. `next/image`
  slots reserve their aspect box (zero CLS). The limiter is O(1) amortized in-memory. No N+1,
  no DB read on the page (unlike the homepage's featured queries — the B2B page needs none).

### Security Considerations

- **Public unauthenticated write** → same threat model as contact: honeypot (crude bots),
  per-IP sliding window (flood/DoS, with a `maxKeys` cardinality bound), input trim+cap+
  control-char strip (header-injection / oversized-payload defense), and the template
  HTML-escapes the body. The visitor's email becomes `replyTo`, never a header the visitor
  controls directly.
- **No secret exposure** — the disable hatch is a server-only env var (never `NEXT_PUBLIC_`),
  so production always enforces the limit. Owner address is read server-side only.
- **No PII persistence** — the request is relayed by email and not stored, minimizing data
  footprint (a deliberate Phase-1 posture; a future quotes table would need RLS + retention
  thinking).

## Implementation Recommendations

### Suggested Order of Implementation

1. `src/lib/config/quote.ts` (+ barrel re-export) — first, because the guard, limiter, and form
   all depend on `QUOTE_TEAM_SIZES` and the caps. No dependencies of its own.
2. `src/lib/quote/submit-guard.ts` + test — pure, isolated; the enum check is the only new
   logic. Depends only on config.
3. `src/lib/quote/rate-limit.ts` + test — clone of the contact limiter with a fresh instance.
4. `src/lib/email/templates/quote-relay.ts` + test — pure template; depends on the email layer.
5. `src/lib/email/dispatch.ts` — add `sendQuoteRelay` (depends on the template).
6. `empresas/quote-form-state.ts` → `empresas/actions.ts` (+ test) → `empresas/quote-form.tsx`
   — the state contract, then the action wiring the guards/limiter/relay, then the client form.
7. `empresas/page.tsx` — compose the pitch sections + render the form; add `generateMetadata`.
8. i18n: add the `empresas` namespace + `nav.items.offices` + `footer.links.offices` to both
   files; update `CONSUMED_KEYS`.
9. `nav-items.ts` (+ test) and `site-footer.tsx` — wire the nav/footer links (page must exist
   first so the links aren't dead).
10. `e2e/empresas-quote.spec.ts` — both-locale render, nav/footer link, form + honeypot +
    validation + default error-on-submit. Then run tsc/eslint/unit/parity gates.

### Key Decisions

- **Slug: `/empresas`** (es-MX-primary, both locales via `as-needed` prefix). Recommended over
  `/b2b` or `/oficinas` because it is the natural Spanish term for the audience, reads as a
  first-class marketing destination, and does not collide with `RESERVED_SLUGS` or any existing
  route. English serves the same slug under `/en/empresas` (the label localizes, not the path —
  consistent with every other storefront route).
- **Email template: NEW `renderQuoteRelay`, not a reuse of `renderContactRelay`.** The contact
  template hardcodes a name/email/subject/message body layout (`contact-relay.ts:47`). The
  quote has a DIFFERENT field set (company, contact, email, phone, team size, needs) and a
  different subject (`Solicitud de cotización de {company}`). A new pure template following the
  identical structure is cleaner and safer than overloading the contact template with optional
  fields; it keeps each template a simple, unit-testable pure function (the T9 discipline). NEW
  `QuoteRelayInput` type lives in the new template file; NEW `sendQuoteRelay` seam beside
  `sendContactRelay` in `dispatch.ts`.
- **Rate limit: SEPARATE key-space (own limiter instance).** Not a shared limiter — the quote
  form and contact form must throttle independently (a legitimate contact message must not be
  blocked by quote-form abuse, and vice versa). Same pattern as contact-vs-checkout.
- **Copy-driven, not DB-backed.** The page reads a new `empresas` i18n namespace (like the
  homepage), NOT a `static_pages` row. No migration, no seed change, renders with empty content
  tables.
- **Team size = constrained enum, not free text.** `QUOTE_TEAM_SIZES` (e.g.
  `["1-10","11-50","51-200","200+"]`) single-sources the `<select>` options AND the server
  membership check — the one genuinely new validation vs. the contact guard.

### Anti-Patterns to Avoid

- Don't reuse `renderContactRelay`/`sendContactRelay` with a stuffed message — instead write a
  dedicated `renderQuoteRelay`/`sendQuoteRelay` so each stays a simple pure function.
- Don't share the contact rate-limiter instance — instead create a dedicated quote instance, or
  quote abuse will silently throttle real contact messages.
- Don't trust the client `<select>` value — instead validate `teamSize ∈ QUOTE_TEAM_SIZES` in
  the PURE server guard (edge 1).
- Don't fabricate proof to make the pitch persuasive — instead lean on the three real pillars,
  real seeded brands, and honest volume framing (PRODUCT.md hard rule, AC-3).
- Don't add the nav/footer link before the page exists — instead ship the route first, then the
  links, so there is never a dead link (AC-8).
- Don't put the `QuoteFormState` type inside the `"use server"` action module — it must live in
  a sibling `quote-form-state.ts` (a `"use server"` file exports only async functions).
- Don't edit `src/components/ui/*`, `:root`, or the shared `sans` export — the firewall must
  hold (admin unchanged, AC-10).
