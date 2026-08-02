# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** Mexican consumers shopping for a quality chair (office, ergonomic, gamer, dining) — mobile-heavy, es-MX default with an EN toggle, paying in MXN via Mercado Pago (card, OXXO cash, SPEI, MP wallet). Guest checkout; no accounts in Phase 1.
- **B2B (confirmed 2026-08-02):** offices furnishing workspaces — evaluate chairs for teams, request volume quotes through a quote form (no self-serve volume pricing).
- **Operator:** the non-technical business owner running the whole store alone through the admin dashboard (es-MX only). Admin UX must be simple and forgiving.

## Product Purpose

E-commerce storefront + admin dashboard for a Mexican multi-brand chair retailer. Success: a shopper finds the right chair and pays online without help; the owner manages catalog, orders, refunds, and shipping without a developer.

## Positioning

Three confirmed pillars (owner, 2026-08-02):

1. **Ergonomics expertise** — posture-first authority; chairs curated for how they treat your body (the name PosturPro carries this).
2. **Multi-brand selection** — the widest curated range of chair brands in Mexico under one roof.
3. **Value for money** — premium quality at better prices than competitors.

The voice this implies: knowledgeable and reassuring about ergonomics, confident about breadth and price — never discount-bin, never luxury-for-luxury's-sake.

## Operating Context

- Mobile-heavy Mexican audience; Spanish default, English secondary (storefront i18n is symmetric; admin is es-MX only).
- Payments through Mercado Pago incl. cash (OXXO) and bank transfer (SPEI) — pending-payment states are a normal part of the purchase ritual, not an error.
- Owner ships from own stock; flat-rate shipping (admin-editable, seeded MX$500, free over MX$10,000).
- Physical showroom exists as a page concept (location/map/hours) — details are placeholder until the owner provides them.
- WhatsApp floating button site-wide — chat is a first-class contact channel in this market.

## Capabilities and Constraints

- Full catalog model: brands, nestable categories, styles, tags, color variants (own images/SKU/stock/price), compare-at pricing, dimensions/materials/weight specs.
- Cart → guest checkout → Mercado Pago; stock reservation against overselling; discount codes; order emails; admin order pipeline with refunds (full/partial), cancel with stock restore, tracking, packing slips.
- Tech: Next.js App Router, TypeScript strict, Tailwind + shadcn/ui, @hugeicons only, local Supabase (Postgres) — integer MXN cents everywhere.
- **Undecided product facts:** real catalog (CSV import ready, ~30 seeded placeholder chairs today), shipping rates (placeholders), showroom address/hours, CFDI invoicing (Phase 3), customer accounts (Phase 2).
- B2B quote flow (confirmed): offices submit a quote request form; no volume price list, no B2B checkout.

## Brand Commitments

- **PosturPro is the final brand name** (confirmed 2026-08-02). No logo, palette, or typography exists yet — **creating the premium visual identity is part of the upcoming design work**, not a waiting-on-client gap. All brand tokens stay centralized (globals.css/design tokens) so the identity is swappable-by-token.
- Binding direction volunteered by the owner: the site should feel **premium** and **image-rich** (recorded as a constraint; the visual world itself is decided in design work, not here).

## Evidence on Hand

- **No real imagery or proof exists yet** (confirmed 2026-08-02): no product photos (catalog images are picsum placeholders), no lifestyle/office photography, no testimonials, customers, or reviews that may be cited. Design with high-quality licensed-stock or generated placeholders, structured so every image slot swaps to real assets without layout rework. **Never fabricate testimonials, customer names, review counts, sales figures, or press.**
- Real seed-data structure exists (~30 chairs, 5 brands, 6 categories, 6 styles) and mirrors the real catalog's shape.

## Product Principles

1. **Posture authority earns the sale** — content and design should teach and reassure about ergonomics, not just display products.
2. **The phone is the store** — every surface is designed mobile-first; desktop is the enhancement.
3. **Cash is not an edge case** — OXXO/SPEI pending states get first-class, calm treatment.
4. **The owner works alone** — every admin flow must be self-explanatory and hard to get wrong.
5. **Truth over polish** — placeholder content is clearly structural; no invented claims, ever.

## Accessibility & Inclusion

WCAG AA as the working floor (already practiced: glyph+text status, focus management, aria-live, `prefers-reduced-motion`). Bilingual parity is mandatory on every storefront surface.
