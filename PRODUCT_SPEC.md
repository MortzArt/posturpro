# PRODUCT_SPEC.md — Multi-Brand Chair Store

E-commerce storefront + management dashboard for a Mexican chair retailer selling chairs from multiple brands, categories, and styles. Customers are in Mexico. Approved scope v1 (from the signed-off Build Scope & Phase Plan).

## Business context

- Market: Mexico. Mobile-heavy audience.
- Languages: Spanish + English (toggle). Spanish is the default locale.
- Currency: MXN only.
- Payments: Mercado Pago (cards, OXXO cash, SPEI transfer, MP wallet). No meses sin intereses.
- Fulfillment: the client ships from their own stock.
- Operator: the business owner, non-technical. Admin UX must be simple and forgiving.
- Automation preference: minimal. Build core automatic behavior only (order emails, stock restore); no growth automation until Phase 2/3.

## Assumptions (approved to proceed)

- Shipping: flat rate, seeded at **MX$500**, free shipping over **MX$10,000**. Both are admin-editable values in Store Settings — the numbers are placeholders, not decisions.
- Mercado Pago: build against **sandbox/test credentials** via environment variables (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`). Production keys swapped in before launch. Never hardcode keys; never expose the access token to the client bundle.
- Branding: neutral design system now; client identity (logo, colors, typography) swapped in later. Centralize all brand tokens.
- Catalog: not ready. Ship with realistic seed data (~30 chairs across ~5 brands, ~6 categories, ~6 styles, with color variants). CSV import loads the real catalog when it exists.
- Static page content: placeholder text until the client provides copy. Content stored as editable data (rich-text editor UI arrives in Phase 2).
- CFDI invoicing: NOT in scope now. Store order data completely (RFC field optional at checkout, full amounts/tax breakdown) so CFDI can be added in Phase 3 without schema rework.

## Phase 1 — The sellable store (current phase)

A customer can find a chair, pay with Mercado Pago, and the owner can manage products and orders.

### Storefront
- Homepage: hero, featured chairs, featured brands
- Product listing grid; category pages; brand pages (logo + description); style browsing; breadcrumbs
- Product detail: image gallery with zoom, color-variant selector (per-variant images/price/stock), specs (dimensions, weight, materials), stock indicators ("In stock", "Only N left", "Out of stock"), recently viewed strip
- Q&A on product page: visitors submit questions, admin answers from dashboard
- ES/EN language toggle; all UI strings and product descriptions localizable
- WhatsApp floating button site-wide

### Product model
- Core: name, brand, price (MXN), description, images, categories (many-to-many), stock, SKU
- Compare-at price (strikethrough sale display); internal cost price (never rendered to shoppers)
- Dimensions (width/depth/height/seat height), weight, materials (frame/upholstery/finish)
- Color variants: own images, SKU, stock, optional price override
- Tags (free-form); status: Draft / Active / Archived

### Search & filtering
- Keyword search over names, brands, descriptions
- Filters: category, brand, style, price range, color, material, availability (default in-stock only)
- Sorting: price asc/desc, newest, best-selling, name
- Friendly no-results page with popular chairs

### Cart & checkout
- Persistent cart (guests included; survives refresh/return)
- Guest checkout (no account required in Phase 1 — customer accounts arrive in Phase 2)
- Checkout form: contact info, shipping address with Mexican postal-code/state validation, delivery notes
- Order summary review step; discount-code input field (code management UI is Phase 2; field validates against a codes table)
- Stock reservation during checkout to prevent overselling the last unit
- Order confirmation page + confirmation email

### Payments — Mercado Pago (sandbox first)
- Methods: card, OXXO, SPEI, MP wallet
- OXXO/SPEI: order enters "Pending payment" with voucher/instructions email; webhook confirms payment and advances the order
- Card decline: clear retry flow
- Refunds (full/partial) triggered from the admin, executed via the MP API
- Webhook signature verification; idempotent webhook handling

### Shipping
- Flat rate (admin-editable, seeded MX$500); free-shipping threshold (admin-editable, seeded MX$10,000)
- Tracking number field on orders; emailed to the customer when set

### Admin dashboard
- Secure admin login, fully separate from shopper sessions; single Owner account in Phase 1
- Products: list with search/filter (brand, category, status, stock); add/edit form covering the full product model; multi-image upload with drag ordering and cover selection; variant management; manage categories (nestable), brands, styles, tags; manual inventory adjustment with reason; CSV import + export; duplicate product
- Orders: list with search/filter; detail view with history log; status pipeline Pending payment → Paid → Preparing → Shipped → Delivered / Cancelled; manual status updates (emails customer); tracking entry; cancel with automatic stock restore; refunds; internal staff notes; printable packing slip; customer list (from guest orders)
- New-order notification: email to owner + dashboard indicator
- Store Settings: store name, contact email, shipping flat rate, free-shipping threshold

### Static pages (data-backed, placeholder copy)
About · Contact (form emails the owner) · Shipping policy · Returns policy · Warranty · FAQ · Aviso de Privacidad · Terms · Showroom (location, map, hours)

### Emails (neutral template in Phase 1)
Order confirmation · payment received · OXXO/SPEI instructions · shipped with tracking · cancelled · refund issued · contact-form relay · new-order alert to owner

### Technical foundation
- Mobile-first responsive; optimized images; fast loads
- SEO: clean URLs, per-page metadata, product structured data, sitemap.xml
- Security: HTTPS, secure admin auth, no secrets in client bundle
- Automatic database backups; error monitoring; analytics; cookie consent banner; friendly 404/error pages

## Phase 2 — Accounts, content editing & marketing (after Phase 1 ships)

- Customer accounts: email/password + Google login, password reset, order history, saved addresses, wishlist, profile management, account deletion, tokenized order-tracking page (no login)
- Content editing: rich-text editor for static pages, homepage section manager, scheduled promotional banners, navigation menu editor, media library
- Marketing: discount-code management (percent/fixed, expiry, usage limits), automatic date-range sales, newsletter signup integration, Meta/Google pixels, per-page SEO controls
- Admin: multiple users with roles (Owner/Staff), low-stock alerts, bulk product actions, manual order creation, sales dashboard, best-sellers report, inventory report
- Email: branded templates, pending-payment reminders
- Storefront: related products, search autocomplete

## Phase 3 — Deferred (build on business demand)

CFDI invoicing (PAC provider, with accountant) · carrier integration (Estafeta/DHL/FedEx/Paquetexpress) · rate-by-region shipping · blog/news · abandoned-cart emails · scheduled publishing · admin activity log · multiple shipping options at checkout

## Confirmed out of scope (client marked SKIP — do not build)

Collections/curated sets · product video · back-in-stock notifications · product comparison · customer reviews & ratings · size variants · assembly info · per-product warranty info · care instructions · downloadable spec sheets · mini-cart · min/max order quantities · meses sin intereses · rate by size/weight · local delivery · store pickup · delivery time estimates · partial shipments · social sharing buttons

## Pending client inputs (do not block the build)

- Real flat-rate and free-shipping values (assumptions seeded, admin-editable)
- Mercado Pago production credentials (sandbox used until launch)
- Brand identity (logo, colors, typography)
- Real catalog CSV (brands, categories, products, photos)
- Static page copy + Aviso de Privacidad text from a legal source
