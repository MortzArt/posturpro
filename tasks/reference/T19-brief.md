# T19 Brief — Homepage rebuild from client content page (+ product condition grades)

Owner decisions recorded 2026-08-27. This brief is the source of truth for the T19 pipeline run.

## What the client sent

- `tasks/reference/client-homepage-en.html` — English layout mockup (copy + structure)
- `tasks/reference/client-homepage-es.html` — Spanish (es-MX) counterpart (same structure, Spanish copy)
- `public/brand/logo.svg` + `public/brand/icon.svg` — official PosturPro logos

## THE #1 RULE — structure & data only, NOT the mockup's design

The client mockup's visual design (Big Shoulders Display font, ink/brass/teal palette,
industrial-tag aesthetic) is **explicitly rejected by the owner** ("general claude design").
**Keep the site's existing design language**: current typography, spacing, shadcn/ui
components, existing component patterns from T13/T15.

Take from the mockup ONLY:
1. **Page structure** — the section list, their order, and what each contains
2. **Copy/data** — headlines, body copy, FAQ answers, form fields, footer links
   (EN from the EN file, es-MX from the ES file → next-intl message files)

## Color rules (owner-mandated)

- Brand palette from the logo SVGs: deep green `#094220`, brand green `#0f7f3c`,
  mint `#e7f7ed`. Work these into the site palette/tokens (site-wide).
- **ALL CTAs use `#f95326`** (orange) — every primary call-to-action button, site-wide.
- Use the real logos (`public/brand/logo.svg`, `public/brand/icon.svg`) in header/footer/favicon
  where the site currently renders a text logo or placeholder.

## Scope decisions (owner answers, 2026-08-27)

1. **Illustrative data → include as placeholders.** Hero stats (+3,200 chairs, 100%
   verified, 60% savings), impact strip (9,400 kg, etc.), "+150 offices / 24h",
   and the 2 testimonials ship with the mockup's example values, stored in the
   translation files so they're trivial to swap. Deliverable: a checklist of every
   placeholder value for the owner to send the client (append to
   `tasks/client-content-questionnaire.md` if it fits, else a new file).
2. **Grade system (A+/A/B) → include FULLY + admin support.** New scope:
   - DB migration: nullable condition-grade field on products (enum/check: A+, A, B),
     following the established migration posture (see 0013/0014/0015 patterns, RLS/grants).
   - Admin panel: assign/edit the grade per product in the existing product management UI.
   - Storefront: grade badge on product cards (homepage + catalog) and PDP when set;
     hero cert-tag design element per mockup structure (restyled to our design language).
   - Products without a grade render with no badge (grade is optional).
3. **Homepage catalog section → real products from Supabase** via existing
   `listProducts` (restyle existing FeaturedProducts toward the mockup's card content:
   brand, name, spec line, price, grade badge, link to PDP). No hard-coded chairs.
4. **Shell → full restyle in OUR design language**: topbar (shipping/installments/invoicing
   messages + WhatsApp contact), header nav + orange CTA, footer (4-column structure +
   contact block from mockup), WhatsApp float (a FAB already exists — verify/wire, don't
   duplicate). New palette applies site-wide; other pages inherit shell + tokens.

## Homepage section list (from mockup, in order)

1. Topbar — rotating/static messages + WhatsApp contact link
2. Header — logo, nav (Catalog / Process / Business / Trust), business-quote CTA
3. Hero — eyebrow, headline ("Elevate your furniture. Not your costs."), subcopy,
   2 CTAs (catalog → primary orange; business → secondary), 3 placeholder stats,
   visual with cert-tag element
4. Brand bar — Herman Miller · Steelcase · Haworth · Knoll · Humanscale
5. Values — 4 cards (save up to 60% / 100% verified function / good condition / 100% original)
   + impact strip (3 placeholder figures)
6. Catalog — real featured products, grade badges, link to full catalog
7. Process — 4 numbered steps (sourcing → inspection → cleaning → final check & grading)
8. Business/B2B — value list, org segments, quote form (an /empresas B2B page + quote
   flow already exists from T16 — REUSE its form/backend, link or embed; do not build
   a parallel quote pipeline)
9. Social proof — 2 placeholder testimonials
10. Savings calculator — model select, new-vs-PosturPro price bars, savings % and amount
    (reference prices; note copy included). Client-side interactive.
11. Trust + FAQ — 4 guarantee bullets + 4 FAQ accordion items (copy from mockup;
    note: NO warranty/return terms exist yet — mockup copy deliberately avoids them, keep it that way)
12. CTA banner — closing banner, 2 CTAs
13. Footer — brand blurb, Catalog/Business/Company link columns, contact block
14. WhatsApp float

## Constraints

- i18n: every string through next-intl messages (es-MX default + en), using the two
  mockup files as copy source. Keep MXN prices in both locales.
- The mockup's media-note boxes (dashed "suggested photo/video" placeholders) are
  instructions to the CLIENT, not UI — do NOT render them. Where they mark image slots,
  use existing image config (HERO_IMAGE etc.) or tasteful non-photo treatments.
- Placeholder-figure asterisk disclaimers from the mockup: keep them (honesty) but render subtly.
- Respect all CLAUDE.md rules: Emil/impeccable skills for UI stages, clean code rules,
  strict TS, no `any`, file-size caps, existing patterns (T13 homepage, T15 visual identity,
  T16 B2B page).
- Existing homepage components (`src/components/home/*`) are the starting point — extend/
  replace them; the page must keep its SEO/JSON-LD/metadata behavior from T13/T14.
- The quote form and any new writes must follow existing validation/rate-limit/RLS posture.
