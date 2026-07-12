# BUILD_PLAN.md — Multi-Brand Chair Store

Phase 1 build order. Each task runs through the pipeline (see CLAUDE.md). Tier is a recommendation — the planner may reclassify. Respect `blocked by` dependencies. Check off tasks `[x]` only when their quality gate passes.

Scope authority: PRODUCT_SPEC.md. Anything not in Phase 1 of the spec is out of scope for these tasks — do not build ahead.

## Phase 1 tasks

- [x] **T1 — Data foundation** (tier: full-cycle)
  Supabase integration + full database schema: products, variants, brands, categories (nestable, many-to-many with products), styles, tags, product images, orders, order items, order status history, customers (guest records), discount codes (table only), product questions (Q&A), store settings, static pages (data-backed), i18n content structure. Row-level security. Seed data: ~30 chairs, ~5 brands, ~6 categories, ~6 styles, color variants, realistic MXN prices. Store settings seeded: flat rate MX$500, free-shipping threshold MX$10,000.

- [ ] **T2 — App shell & design system** (tier: standard)
  Layout, header with navigation, footer, neutral design tokens (centralized for later brand swap), ES/EN i18n setup with Spanish default and language toggle, mobile-first responsive foundation, 404/error pages, WhatsApp floating button. `blocked by: T1`

- [ ] **T3 — Catalog browsing** (tier: standard)
  Product listing grid, category pages, brand pages (logo + description), style browsing, breadcrumbs, stock indicators, pagination. `blocked by: T2`

- [ ] **T4 — Product detail page** (tier: standard)
  Image gallery with zoom, color-variant selector (per-variant images/price/stock), specs display (dimensions, weight, materials), compare-at price display, recently-viewed strip, Q&A display + question submission form. `blocked by: T3`

- [ ] **T5 — Search, filters & sorting** (tier: standard)
  Keyword search; filters: category, brand, style, price range, color, material, availability (default in-stock); sorting: price asc/desc, newest, best-selling, name; no-results page with popular chairs. `blocked by: T3`

- [ ] **T6 — Cart** (tier: standard)
  Persistent cart for guests (survives refresh/return), cart page with quantity edit/remove/line totals, free-shipping progress toward threshold. `blocked by: T4`

- [ ] **T7 — Checkout & order creation** (tier: full-cycle)
  Guest checkout flow: contact info, shipping address with Mexican postal-code/state validation, delivery notes, order summary step, discount-code field (validates against codes table), flat-rate/free-threshold shipping calculation from store settings, stock reservation against overselling, order record creation, confirmation page. No payment capture yet (T8). `blocked by: T6`

- [ ] **T8 — Mercado Pago integration (sandbox)** (tier: full-cycle)
  Card, OXXO, SPEI, MP wallet via sandbox credentials from env vars. Pending-payment state for OXXO/SPEI with instructions; webhook endpoint with signature verification and idempotent handling to confirm payments and advance orders; card-decline retry flow; refund execution API used by admin (T12). CRITICAL: payment code requires human review before merge — flag for the user. `blocked by: T7`

- [ ] **T9 — Transactional emails** (tier: standard)
  Neutral-branded templates: order confirmation, payment received, OXXO/SPEI instructions, shipped with tracking, cancelled, refund issued, contact-form relay, new-order alert to owner. Email provider wired via env vars. `blocked by: T8`

- [ ] **T10 — Admin foundation** (tier: standard)
  Admin authentication fully separate from shopper sessions, single Owner account, admin layout/navigation, Store Settings screen (store name, contact email, shipping flat rate, free-shipping threshold — editable). `blocked by: T1`

- [ ] **T11 — Admin: product management** (tier: full-cycle)
  Product list with search/filter (brand, category, status, stock); add/edit form for the full product model; multi-image upload with drag ordering + cover image; variant management; category/brand/style/tag management (categories nestable); manual inventory adjustment with reason; CSV import + export; duplicate product; Q&A answering. `blocked by: T10`

- [ ] **T12 — Admin: order management** (tier: full-cycle)
  Order list with search/filter; order detail with history log; status pipeline (Pending payment → Paid → Preparing → Shipped → Delivered / Cancelled); manual status updates triggering customer emails; tracking number entry + email; cancel with automatic stock restore; full/partial refunds via Mercado Pago; internal notes; printable packing slip; customer list; new-order dashboard indicator + owner email. `blocked by: T8, T9, T10`

- [ ] **T13 — Static pages & homepage** (tier: standard)
  Data-backed static pages with placeholder copy: About, Contact (form emails owner), Shipping policy, Returns policy, Warranty, FAQ, Aviso de Privacidad, Terms, Showroom (location/map/hours). Homepage: hero, featured chairs, featured brands. `blocked by: T2`

- [ ] **T14 — SEO, analytics & launch hardening** (tier: full-cycle)
  Clean URLs, per-page metadata, product structured data, sitemap.xml; analytics; cookie consent banner; image optimization + performance pass; error monitoring; backup verification; final security review of the whole store (secrets, admin auth, webhook, RLS). `blocked by: T12, T13`

## Rules for this plan

1. Work top to bottom unless a task is blocked; T10 may run in parallel with T3–T6 after T1.
2. Do not start Phase 2 items — including customer accounts, rich-text page editing, and discount-code management UI — even where the schema supports them.
3. Payment (T8) and checkout (T7) changes always get flagged for human review, regardless of pipeline verdicts.
4. Placeholder values (shipping amounts, brand tokens, page copy, sandbox keys) must be centralized and documented in the task's dev-done artifact so swapping real values later is trivial.
