# Task: T16 — B2B landing page (offices, quote form)

## Priority

**High** — B2B is a confirmed audience (PRODUCT.md, 2026-08-02) and the only remaining
Phase-1 storefront surface before T14 launch-hardening (T14 is `blocked by T16` so its
metadata/sitemap/perf pass must cover this page). It is fully unblocked (T15 shipped) and
reuses two proven, shipped stacks (T13 contact-relay + T15 Casa de Azulejo world), so it is
high-value at low incremental risk.

## Complexity

**medium** — New page + a new server-action/email-relay flow, ~14–18 files changed, follows
existing patterns end-to-end (T13 contact stack for the quote form, T15 home components for
the page body). It adds a new form schema (6 fields incl. an enum), a new pure guard, a new
rate-limiter instance, a new pure email template, and a new dispatch seam — all mirroring
existing code with no new data model, no migration, no new dependency, no architectural
change. It is above `low` (more than a pattern-copy: a genuinely new field set + enum +
template) and below `high` (no new subsystem, no integration, no schema change).

## Feature Type

**full-feature** — a new visible marketing surface (UI: hero, value sections, quote form,
nav/footer links) AND new logic (server action, validation guard, rate limiter, email
template + dispatch). All stages run at full depth; UI Design (Stage 3) runs because this is
new-work page composition inside the committed DESIGN.md world.

## User Story

As an **office manager furnishing a workspace for my team**, I want to **read why PosturPro
is the right ergonomics partner for offices and request a volume quote in one form**, so that
**I can get pricing for outfitting my team without a self-serve checkout or a phone call**.

## Background

PRODUCT.md now names a confirmed B2B audience: *"offices furnishing workspaces — evaluate
chairs for teams, request volume quotes through a quote form (no self-serve volume pricing)."*
The three positioning pillars (ergonomics authority, multi-brand breadth, value for money)
are the persuasion spine; there is **no volume price list and no B2B checkout** — the CTA is a
quote-request form that relays to the owner.

Everything this page needs already exists and shipped:

- **T13 contact-relay stack** — a public, unauthenticated write path with layered abuse
  controls (honeypot → validate → rate-limit → relay), a `useActionState` client form with a
  full state matrix, a dedicated per-IP sliding-window limiter, and a pure es-MX email
  template dispatched to the owner via `sendContactRelay`. The quote form is this exact
  pattern with a different field set.
- **T15 "Casa de Azulejo" world (DESIGN.md)** — cobalt line-and-wash on milk-white glaze,
  grout-seam borders, roman-caps Libre Caslon Text captions in cartouche frames, the
  `Hero`/`EditorialBand`/`HomeSectionHeader` components, the config-driven image-slot system
  (`imagery.ts`, `string | null` → `next/image` cartouche or blank-tile glyph), and the
  `.enter-fade`/`.stagger`/`.link-arrow` motion layer. The landing page **lives inside this
  world**; it composes these blocks, it does not invent a new look.

What is missing: the page itself (`/empresas`, both locales), a quote-specific form + action +
guard + rate-limiter + email template + dispatch seam, its i18n copy, and the nav/footer link.

**Truth constraint (PRODUCT.md hard rule, binding):** no fabricated proof. No invented client
logos, testimonials, customer names, review counts, sales figures, "trusted by N offices",
"X chairs delivered", or press. Breadth is shown via the **real seeded brands** (or an honest
"multi-marca" claim), value/ergonomics via honest positioning copy only. Every image slot
defaults to the existing licensed-stock or a null blank-tile — never proof imagery.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

- [ ] **AC-1:** A B2B landing page renders at `/empresas` (es-MX, no prefix) and `/en/empresas`
      (English), each returning HTTP 200, inside the storefront shell (header + footer), in the
      Casa de Azulejo world (`.theme-storefront` scope, cobalt palette, roman-caps headings).
- [ ] **AC-2:** The page presents the Persuade-mode content structure grounded ONLY in
      PRODUCT.md truth: (a) a hero pitch (ergonomics-authority headline + volume/fleet framing +
      a "Request a quote" primary CTA that scroll-anchors to the form), (b) a "why PosturPro for
      offices" value section covering the three pillars (ergonomics authority, multi-brand
      breadth, value/volume), (c) a "how it works / quote process" section, (d) the quote form.
- [ ] **AC-3:** The page contains **zero fabricated proof** — no invented testimonials, client
      names/logos, review counts, sales/office-count figures, or press. Any breadth claim uses
      real seeded brands or an honest "multi-marca" statement; any image slot is licensed-stock
      or a null blank-tile placeholder (never proof imagery). (Grep-auditable: no hardcoded
      numbers presented as social proof.)
- [ ] **AC-4:** The quote form collects: **company** (required), **contact name** (required),
      **email** (required, shape-validated), **phone** (optional), **team size** (required —
      a constrained native `<select>` over a small enum of ranges, e.g. 1–10 / 11–50 / 51–200 /
      200+, so it is never free-text garbage), and **needs / message** (required). All
      labels/placeholders/options come from the i18n dictionary in both locales.
- [ ] **AC-5:** Submitting a valid quote form relays an email to the store owner via a new
      `sendQuoteRelay` dispatch seam using a **new pure `renderQuoteRelay` template** (es-MX to
      the owner) that includes every submitted field (company, contact, email, phone, team
      size, needs); the visitor's email is set as `replyTo`. On the configured dev/CI path
      (`EMAIL_OWNER_ADDRESS` set + `EMAIL_DEV_PREVIEW=1`) the relay resolves `{ ok: true }` and
      the form shows the success state.
- [ ] **AC-6:** The quote form implements the FULL serializable state matrix (mirroring the
      contact form): `idle` → `submitting` (button disabled + "Enviando…") → one of
      `success` (form clears, focus moves to a `role="status"` banner, auto-hides after
      `QUOTE_SUCCESS_FEEDBACK_MS`) / `invalid` (field errors + first-invalid focus + values
      preserved) / `rate-limited` (`role="alert"`, values preserved) / `error` (`role="alert"`,
      generic copy, raw provider reason NEVER surfaced, Retry re-submits preserved values).
- [ ] **AC-7:** Abuse controls are present and correct, in order: **honeypot** (off-screen
      `left-[-9999px]` + `aria-hidden` wrapper + `tabIndex=-1` field) → filled → FAKE success,
      no send; **validation** (trim-then-check every field, control-char strip on company/name,
      email shape via `EMAIL_PATTERN`, team-size must be an allowed enum value) → invalid → no
      send; **rate limit** (a DEDICATED per-IP sliding-window limiter INSTANCE with its own
      key-space, built from `createSlidingWindowLimiter`, with a `QUOTE_RATE_LIMIT_DISABLED=1`
      server-only test hatch) → over-limit → no send.
- [ ] **AC-8:** A nav link to `/empresas` is added to the primary navigation (it flows into
      BOTH the desktop header and the mobile drawer via `NAV_ITEMS`) and a footer link is added;
      both use i18n labels and resolve to the live page in both locales — ZERO dead links.
      Existing nav/footer links are unchanged.
- [ ] **AC-9:** The page ships with sane per-page SEO metadata via `generateMetadata`
      (locale-resolved `title` + `description`) in BOTH locales, following the existing per-page
      pattern (no shared helper). (T14 hardens sitemap/OG/canonical later.)
- [ ] **AC-10:** The page follows DESIGN.md: sections use cobalt cartouche frames / grout-seam
      borders / roman-caps `font-heading` section titles; any image slot is a `string | null`
      config slot rendered in a cartouche or degraded to the blank-tile chair/building glyph
      (never a broken `<img>`, zero CLS); mount motion reuses `.enter-fade`
      (transform/opacity, `ease-out` enter, `prefers-reduced-motion`-gated). Admin is untouched
      (firewall holds — no file under `src/app/admin/`, `src/components/admin/`, or
      `src/components/ui/*` edited).
- [ ] **AC-11:** Every storefront-visible pairing meets WCAG AA; any text over imagery sits on
      the cobalt scrim/caption bar (8.37:1); form fields are labeled with associated error text
      (`aria-describedby`), the team-size control is a native labeled `<select>` (keyboard +
      SR-usable), and status is glyph + text (never color alone).
- [ ] **AC-12:** No horizontal overflow at 375px and 768px; the page is usable and legible on
      mobile (mobile-first per PRODUCT.md "the phone is the store").
- [ ] **AC-13:** Bilingual parity is exact — every new key exists in BOTH `es-MX.json` and
      `en.json`; `keys-used.test.ts` `CONSUMED_KEYS` is updated; the message-parity test passes
      with zero asymmetry.
- [ ] **AC-14:** All new logic is unit-tested (quote guard incl. team-size enum validation,
      quote rate-limiter, `renderQuoteRelay` template, and the `submitQuoteForm` action branch
      matrix: honeypot / invalid / rate-limited / relay-ok / relay-!ok / relay-throw); an e2e
      spec asserts both-locale render, nav/footer link, form labeled + honeypot off-screen +
      validation error + default error-on-submit. `tsc --noEmit`, `eslint`, and the full unit
      suite are green.

## Edge Cases

At least 5 that MUST be handled:

1. **Team-size enum tampering** — a client submits a `teamSize` value not in the allowed set
   (crafted POST, altered `<option>`). The guard rejects it as `invalid` (field error), never
   relays, never trusts client-supplied enum text. Expected: `{ status: "invalid" }` with a
   `teamSizeInvalid` field error. (An EMPTY team size → `teamSizeRequired`.)
2. **Honeypot filled by a bot** — the off-screen `company_url` (honeypot) field is filled.
   Expected: FAKE `{ status: "success" }`, NO email send, a `console.warn` — indistinguishable
   from real success on the client.
3. **Owner email unconfigured** (`EMAIL_OWNER_ADDRESS` unset, the real Phase-1 default) —
   `sendQuoteRelay` returns `{ ok: false, reason: "owner address unavailable" }`. Expected:
   the action maps it to `{ status: "error" }` with the generic message, the raw reason is
   logged server-side only and NEVER surfaced, values preserved, Retry offered.
4. **Rate-limit flood** — a single IP submits more than `QUOTE_MAX_SUBMISSIONS_PER_WINDOW`
   valid quotes inside the window. Expected: over-limit submissions return
   `{ status: "rate-limited" }`, no send, values preserved; the quote limiter uses its OWN
   instance/map so it never shares a bucket with the contact form (a legitimate contact
   message must not be throttled by quote traffic and vice versa).
5. **All-whitespace / oversized / control-char fields** — company/name/needs of only spaces
   trim to empty → required errors; a `needs` body over `QUOTE_MESSAGE_MAX` is capped/rejected
   before it reaches the template (which additionally HTML-escapes); CR/LF/control chars in
   company/name are stripped so the relay subject line stays single-line (header-injection
   defense, mirrors `stripControlChars` in the contact guard).
6. **Missing/absent locale or empty content tables** — the page is copy-driven from the i18n
   dictionary (NOT a DB `static_pages` row), so it renders even if content tables are empty; an
   unknown locale resolves to `defaultLocale` (es-MX) via `hasLocale`, never 500s.
7. **`prefers-reduced-motion`** — `.enter-fade` degrades to opacity-only; no section relies on
   motion to be understood.
8. **JS-disabled / slow network** — the form is a real `<form action={serverAction}>`; server
   re-validates the trimmed values (the real boundary); the page content is server-rendered so
   the pitch is fully readable with no client JS.

## Error States Table

| Trigger | User Sees | System Does |
| --- | --- | --- |
| Required field empty / email malformed / team-size not in enum | Inline field error(s) under the offending field(s); focus jumps to first invalid; typed values preserved | Server action returns `{ status: "invalid", fieldErrors, values }`; NO email send |
| Honeypot field filled (bot) | Success banner (identical to real success) | `console.warn`; returns fake `{ status: "success" }`; NO send |
| Same IP exceeds quote rate limit in window | `role="alert"` `bg-warning/10` banner: "Espera un momento antes de enviar otra solicitud." (values kept) | Dedicated quote limiter returns false → `{ status: "rate-limited" }`; NO send |
| Owner email unconfigured OR provider/timeout failure | `role="alert"` generic error: "No pudimos enviar tu solicitud, inténtalo de nuevo."; button label → "Reintentar"; values kept | `sendQuoteRelay` → `{ ok:false, reason }`; reason logged server-side ONLY; mapped to `{ status: "error" }` |
| Unexpected exception during relay | Same generic error state as above | Exception caught in the action; logged with context; NEVER thrown to client |
| Unknown locale in URL | Page renders in es-MX (default) | `resolveLocale` falls back to `routing.defaultLocale`; never 500 |

## UX Requirements

For EVERY state the UI can be in:

- **Loading (submit in flight):** submit button disabled, label → "Enviando…" / "Sending…";
  form remains visible and filled; no layout shift. (Page itself is server-rendered — no page
  spinner.)
- **Empty (initial page load):** the full pitch renders immediately (hero → value → process →
  form); image slots that are `null` show the intentional cobalt blank-tile glyph (a
  Building/Chair line-glyph), which reads as premium-not-broken per DESIGN.md placeholder
  posture. The form is empty with placeholders and a visible primary submit.
- **Error (form-level):** a `role="alert"` `text-destructive` banner with glyph + generic
  copy above the submit; the raw provider reason is never shown; button becomes "Reintentar".
- **Error (field-level):** `text-destructive` message under the field, `aria-invalid` +
  `aria-describedby` wired; first invalid field receives focus.
- **Rate-limited:** a `role="alert"` `bg-warning/10 text-warning` banner (calm, glyph + text),
  values preserved.
- **Success:** form clears, focus moves to a `role="status"` `.enter-fade` banner ("¡Solicitud
  enviada! Te contactaremos pronto." / "Request sent! We'll be in touch."), auto-hides after
  `QUOTE_SUCCESS_FEEDBACK_MS` (6000). Next step implied: "we'll contact you".
- **Mobile (375px):** single column; hero copy stacks above (or without) media; value cards
  stack; form fields full-width, ≥44px touch targets (reuse the contact `fieldClasses`
  `min-h-11`); native mobile picker for the `<select>`; no horizontal overflow.
- **Tablet (768px):** value section may go 2-up; hero may split copy/media; container
  `max-w-(--breakpoint-xl)` with `px-4 md:px-6 lg:px-8`; no overflow.

## Technical Approach

### Files to Create

- `src/app/[locale]/empresas/page.tsx` — the B2B landing RSC. Resolves locale, sets
  `generateMetadata` (namespace `empresas.metadata`, returns `{title, description}`), composes
  the pitch sections, resolves the quote-form labels server-side, renders `<QuoteForm/>`.
  Bespoke static segment (own folder) — takes precedence over `[pageSlug]` and `[...rest]`; no
  `RESERVED_SLUGS` change needed (the generic route only pre-renders `STATIC_PAGE_SLUGS`, and
  `/empresas` is not among them).
- `src/app/[locale]/empresas/quote-form.tsx` — the sole client island. Copies
  `contact-form.tsx` grammar verbatim (`useActionState`, off-screen honeypot, full state
  matrix, first-invalid focus, success clear+focus+auto-hide, Retry), adapted to the quote
  fields; team size is a labeled native `<select>` over `QUOTE_TEAM_SIZES`.
- `src/app/[locale]/empresas/actions.ts` — `"use server"` `submitQuoteForm(prevState, formData)`.
  Honeypot → fake success; `validateQuoteSubmission` → invalid; `checkQuoteRateLimit` →
  rate-limited; `sendQuoteRelay` → success/error mapping. Never throws to client.
- `src/app/[locale]/empresas/quote-form-state.ts` — serializable `QuoteFormState` +
  `QuoteFormValues` + `initialQuoteFormState` (mirrors `contact-form-state.ts`), imported by
  both the action and the client form (lives OUTSIDE the `"use server"` module — that module
  may only export async functions).
- `src/lib/quote/submit-guard.ts` — PURE `validateQuoteSubmission` (trim + control-char strip
  on company/name; email `EMAIL_PATTERN`; **team-size membership check against
  `QUOTE_TEAM_SIZES`**; length caps) + `isQuoteHoneypotTripped`. Field-key + error-key unions.
- `src/lib/quote/rate-limit.ts` — a DEDICATED `createSlidingWindowLimiter` instance +
  `checkQuoteRateLimit(ip, now?)` + `QUOTE_RATE_LIMIT_DISABLED=1` hatch + test helpers
  (`resetQuoteRateLimitState`, `quoteRateLimitKeyCount`). Mirrors `contact/rate-limit.ts`.
- `src/lib/config/quote.ts` — non-secret tunables: `QUOTE_COMPANY_MAX`, `QUOTE_NAME_MAX`,
  `QUOTE_EMAIL_MAX`, `QUOTE_PHONE_MAX`, `QUOTE_MESSAGE_MAX`, `QUOTE_TEAM_SIZES` (the allowed
  enum tuple, single-sourced for the guard + the `<select>`), `QUOTE_RATE_LIMIT_WINDOW_MS`,
  `QUOTE_MAX_SUBMISSIONS_PER_WINDOW`, `QUOTE_RATE_LIMIT_MAX_KEYS`, `QUOTE_SUCCESS_FEEDBACK_MS`.
- `src/lib/email/templates/quote-relay.ts` — PURE `renderQuoteRelay(input, chrome)` →
  `RenderedEmail`, es-MX to the owner, every field rendered (needs quoted verbatim +
  HTML-escaped via existing `escapeHtml`), following `contact-relay.ts` structure
  (`wrapEmail`/`renderHeading`/`renderParagraph`/`renderCallout`). `QuoteRelayInput` type
  exported here.
- `src/lib/quote/submit-guard.test.ts`, `src/lib/quote/rate-limit.test.ts`,
  `src/lib/email/templates/quote-relay.test.ts`, `src/app/[locale]/empresas/actions.test.ts` —
  unit tests mirroring the contact equivalents.
- `e2e/empresas-quote.spec.ts` — both-locale render, nav/footer link, form labeled + honeypot
  off-screen + validation error + default error-on-submit.

### Files to Modify

- `src/lib/config.ts` — add `export * from "./config/quote";` (barrel re-export).
- `src/lib/email/dispatch.ts` — add `sendQuoteRelay(input): Promise<DispatchResult>` seam
  (mirrors `sendContactRelay`: resolve owner address or `{ok:false}`, render, `sendWithTimeout`,
  `replyTo = input.fromEmail`; NO ledger — not order-scoped) + import `renderQuoteRelay`.
- `src/components/layout/nav-items.ts` — add `{ key: "offices", href: "/empresas" }` and extend
  the closed `NavItem["key"]` union with `"offices"`. (Flows into desktop header +
  `mobile-nav.tsx` automatically — both iterate `NAV_ITEMS`.)
- `src/components/layout/site-footer.tsx` — add an `/empresas` link (a new `{ key: "offices",
  href: "/empresas" }` entry in the STORE or HELP group, or its own small group).
- `src/messages/es-MX.json` + `src/messages/en.json` — add the `empresas` namespace (metadata,
  hero, value pillars, process steps, form labels/placeholders/team-size options/errors/
  success/rate-limited/retry/honeypot), `nav.items.offices`, `footer.links.offices` — in
  lockstep.
- `src/messages/keys-used.test.ts` — register all new `empresas.*`, `nav.items.offices`,
  `footer.links.offices` keys in `CONSUMED_KEYS`.
- `src/components/layout/nav-items.test.ts` — extend for the new item if it asserts the set.
- (Optional) `src/lib/config/imagery.ts` — add `B2B_HERO_IMAGE: string | null` if the page
  uses a dedicated hero image; otherwise reuse `EDITORIAL_BAND_IMAGE` or ship `null`.

### Data Model Changes

- **None.** No migration, no `static_pages` row (the page is copy-driven from i18n, matching
  the homepage, not the generic static-page route). Quote submissions are relayed by email
  only (PRODUCT.md: "no self-serve volume pricing"); persistence is out of scope.

### API Endpoints

- **None new (no route handler).** The quote submission is a **Next.js Server Action**
  (`submitQuoteForm`) consumed via `useActionState` — same mechanism as the contact form.
  - Request (FormData): `company`, `name`, `email`, `phone?`, `teamSize` (enum),
    `needs` (message), `company_url` (honeypot).
  - Response (`QuoteFormState`): `{ status: "idle"|"success"|"invalid"|"rate-limited"|"error",
    fieldErrors?, values?, submissionId }`.

### Dependencies

- **None new.** Reuses `next-intl`, `@hugeicons/react` + `@hugeicons/core-free-icons`,
  `next/image`, the shared `createSlidingWindowLimiter`, the T9 email
  layout/render/provider/`escapeHtml`, and the T15 component/token/motion layer.

## Out of Scope

- Persisting quote requests to the database or an admin "quotes" inbox (email relay only, per
  PRODUCT.md "no self-serve volume pricing"; a quotes table is a future task).
- Volume/fleet **pricing** — no price list, no tiered B2B pricing, no B2B checkout (explicit
  PRODUCT.md constraint).
- Real client logos / testimonials / proof imagery (no real evidence exists — forbidden).
- Sitemap.xml, structured data, OG images, canonical/hreflang hardening, cookie consent,
  analytics, full image-perf pass — all owned by **T14** (this page ships with sane
  `title`/`description` only so T14 can harden it).
- CFDI / invoicing, customer accounts (Phase 2/3).
- Any admin, `src/components/ui/*`, or `:root`/shared-`sans` change (firewall).
