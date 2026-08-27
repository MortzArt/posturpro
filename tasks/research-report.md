# Research Report: T19 — Homepage rebuild + product condition grades

Single-pass codebase analysis backing `tasks/next-ticket.md`. Paths are relative to the repo root (`/Users/MortzArt/Documents/projects/posturpro`).

## Codebase Analysis

### Existing Patterns

- **Server-component homepage with graceful degradation** — `src/app/[locale]/page.tsx` (169 lines) is an async RSC. It reads featured products/brands inside try/catch helpers that return `[]` on failure, so a Supabase outage hides a section instead of 500-ing. **Reuse strategy**: keep this `readFeaturedProducts`/`readFeaturedBrands` shape for the new catalog section; wrap every new data-dependent section the same way.
- **Metadata + JSON-LD builders** — `page.tsx` composes `generateMetadata()` with `buildAlternates()`, `buildOpenGraph()`, `buildOrganizationLd()`, `buildWebSiteLd()`. **Reuse strategy**: do not touch these when recomposing sections; the rebuild must keep emitting the same `<head>`/structured data (AC-24).
- **Token-scoped storefront theme (firewalled from admin)** — `src/app/globals.css`: admin tokens on `:root`/`.dark`; storefront tokens inside a `.theme-storefront` block (~lines 172–216) applied by `src/app/[locale]/layout.tsx`. `--font-heading` binds Libre Caslon Text ONLY under `.theme-storefront`. **Reuse strategy**: inject brand greens/mint + the new `--cta` orange ONLY inside `.theme-storefront`; never edit admin tokens. This is the T15 "single seam" for rebrands (DESIGN.md).
- **Nullable-image slot with glyph fallback** — `HeroMedia` inside `src/components/home/hero.tsx` renders `next/image` when a URL is configured, else a token-tinted glyph tile. Image slots are nullable config in `src/lib/config/imagery.ts` / `static-pages.ts`. **Reuse strategy**: satisfies AC-21 — every mockup image slot maps to a nullable slot + fallback; no media-note boxes.
- **Presentational components take pre-resolved labels (no i18n inside)** — e.g. `StockBadge` receives `label: string`; the caller resolves via `useTranslations`/`getTranslations`. **Reuse strategy**: `GradeBadge` follows the same contract (`grade` + `label`); homepage sections resolve copy in the RSC/parent and pass strings down.
- **`useActionState` server-action forms** — the B2B quote form (`src/app/[locale]/empresas/quote-form.tsx`) and the admin product form use `useActionState` with a `{ status, fieldErrors?, values?, submissionId }` shape, preserving values on failure. **Reuse strategy**: the homepage B2B section embeds the existing quote form unchanged; the admin grade field slots into the existing product form state.
- **Cached anon reads via `products_public` view** — public reads never touch the raw `products` table; they go through the `products_public` security-invoker view (omits `cost_price_cents`), cached with tags revalidated on admin save. **Reuse strategy**: the grade must be added to the VIEW, not just the table, or the storefront cannot read it.

### Relevant Files

| File | Purpose | Relevance | Action |
| ---- | ------- | --------- | ------ |
| `src/app/[locale]/page.tsx` | Homepage RSC + metadata + JSON-LD | Recompose to 13 sections; keep SEO | Modify |
| `src/components/home/hero.tsx` | Current hero + `HeroMedia` fallback | Extend/variant: eyebrow+dual CTA+stats+cert-tag | Modify/Create |
| `src/components/home/featured-products.tsx` | Featured grid wrapper (null if empty) | Model for new catalog section | Reference |
| `src/components/home/featured-brands.tsx` | Brand index tiles | Model for brand bar | Reference |
| `src/components/home/editorial-band.tsx` | Lifestyle band | May be dropped/repurposed in new order | Reference |
| `src/components/home/section-header.tsx` | Heading + "Ver todas →" link | Reuse in new sections | Reference |
| `src/app/[locale]/layout.tsx` | Shell: header/footer/FAB, `.theme-storefront` | Insert topbar; theme class unchanged | Modify |
| `src/components/layout/site-header.tsx` | Header nav + logo + cart | Restyle nav + real logo + orange CTA | Modify |
| `src/components/layout/site-footer.tsx` | Footer link groups | Restructure to 4-col + contact | Modify |
| `src/components/layout/whatsapp-button.tsx` | WhatsApp FAB (62 lines) | Reuse as-is (AC-17); topbar reuses its URL helper | Reference |
| `src/lib/config/shared.ts` | `WHATSAPP_PHONE_E164`, prefill msg, currency | Source for topbar/FAB WA link | Reference |
| `src/lib/catalog/types.ts` | `CatalogProductCard` interface | Add `conditionGrade` | Modify |
| `src/lib/catalog/queries.ts` (367 lines) | `listProducts`, `listBrands`, PDP/search reads | Project `condition_grade` | Modify |
| `src/components/catalog/product-card.tsx` (122 lines) | Card: image/brand/name/price/stock badge | Slot `GradeBadge` | Modify |
| `src/components/catalog/stock-badge.tsx` | Stock chip (in/low/out) | Visual sibling to grade badge | Reference |
| `src/app/[locale]/producto/[slug]/page.tsx` | PDP | Render grade | Modify |
| `src/lib/admin/products/product-input.ts` | `ProductField`, `parseProductInput`, `ProductParsed` | Add `condition_grade` validation | Modify |
| `src/app/admin/(app)/products/products-form-state.ts` (78 lines) | `ProductFormValues`, empty defaults | Add `condition_grade: string` | Modify |
| `src/app/admin/(app)/products/actions.ts` | `createProduct`/`updateProduct` + revalidate | Persist grade | Modify |
| `supabase/migrations/0002_catalog.sql` | `products` table def | Column posture reference | Reference |
| `supabase/migrations/0005_rls_policies.sql` | `products_public` view (lines 105–146) | Regenerate view w/ grade | Reference |
| `supabase/migrations/0015_...sql` | Hosted-safe grant posture | Template for 0016 grants | Reference |
| `src/messages/es-MX.json` / `en.json` | i18n copy | Add `home.*` + `product.grade.*` | Modify |
| `src/lib/money.ts` | `formatMXN(cents)` | Prices in cards + calculator | Reference |
| `src/i18n/routing.ts` | locales `["es-MX","en"]`, default es-MX | Confirms locale keys | Reference |
| `src/app/[locale]/empresas/{quote-form,actions,quote-form-state}.tsx/ts` | T16 B2B quote flow | Embed on homepage | Reference/Reuse |
| `src/lib/quote/submit-guard.ts` / `rate-limit.ts` | Quote validation + per-IP limit | Reused via server action | Reference |
| `src/lib/email/dispatch.ts` (`sendQuoteRelay`) | Quote email relay | Reused via server action | Reference |
| `public/brand/logo.svg` / `icon.svg` | Official logos | Header/footer logo + favicon | Reference |
| `tasks/reference/client-homepage-en.html` / `-es.html` | Structure + copy source | All copy + calculator ref prices | Reference |

### Data Flow

**Grade write (admin → DB):**
Admin product form `<select condition_grade>` → `FormData` → `createProduct`/`updateProduct` (`actions.ts`) → `parseProductInput()` (empty → `null`; `A+`/`A`/`B` → value; else field error) → Supabase write to `products.condition_grade` → `revalidateTag(CATALOG_CACHE_TAG)`.

**Grade read (DB → storefront):**
`products.condition_grade` → `products_public` view (must include the column) → `listProducts`/PDP query in `queries.ts` maps `condition_grade` → `CatalogProductCard.conditionGrade` → `ProductCard`/PDP resolves label via next-intl → `<GradeBadge grade label />` renders (or nothing if null).

**Homepage catalog section:**
`page.tsx` → `readFeaturedProducts()` → `listProducts({ pageSize: HOME_FEATURED_PRODUCTS })` (=8) → grade-aware cards → `/producto/[slug]` links. Read failure → `[]` → section hidden.

**Homepage B2B quote:**
Homepage `b2b-section.tsx` embeds `QuoteForm` → `submitQuoteForm` server action → honeypot → `validateQuoteSubmission` → `checkQuoteRateLimit(await clientIp())` → `sendQuoteRelay(...)`. Identical to `/empresas`.

**Savings calculator:**
Client island: `onChange` of model `<select>` → look up reference prices (config/messages map) → recompute savings amount/pct → update bar widths (`Math.max(minimum, …)`) + text. No server, no inline script.

### Similar Features (Reference Implementations)

- **T16 `/empresas` B2B page** (`src/app/[locale]/empresas/`) — the exact quote flow to reuse: form island + `useActionState`, honeypot `company_url`, per-IP rate limit (dedicated instance), email relay, success focus management. Follow: embed the component; do not fork the backend.
- **`StockBadge`** (`src/components/catalog/stock-badge.tsx`) — badge grammar for `GradeBadge`: inline-flex chip, 12px icon, pre-resolved label, token colors, absolute top-corner on the card. Grade badge sits opposite/stacked to avoid collision.
- **`HeroMedia`** (inside `hero.tsx`) — nullable-image + glyph-fallback for every mockup image slot (AC-21).
- **T13/T14 homepage metadata + JSON-LD** in `page.tsx` — SEO behavior to preserve verbatim.
- **Contact-relay action test** (`src/app/[locale]/contacto/actions.test.ts`, 279 lines) — the server-action test grammar (mock relay, assert state transitions) to mirror for new action tests.

## Dependency Analysis

### Existing Dependencies to Leverage

- **shadcn/ui** — Accordion (Trust+FAQ), Select (calculator + admin grade), Button variants (CTA). Check `src/components/ui/` before building custom.
- **next-intl** (`getTranslations`/`useTranslations`, `t.raw()` for ICU) — all copy; routing `["es-MX","en"]`, default es-MX, `localePrefix: "as-needed"`.
- **`@hugeicons/react` + `@hugeicons/core-free-icons`** — value/process/trust icons; never mix icon sets.
- **`next/image`** — all imagery; existing `sizes` strings for hero/card/band reusable.
- **`src/lib/money.ts` `formatMXN`** — card + calculator prices.
- **Vitest 4.1.10 + @testing-library/react 16 + Playwright** — `npm run test`, `npm run test:e2e`, `npm run test:integration`.

### New Dependencies Needed

- **None.** Explicitly do NOT add Big Shoulders Display / IBM Plex / IBM Plex Mono (owner-rejected) or any component/animation library.

### Internal Dependencies

- `products_public` depends on `products` — **implication**: adding the column to the table is insufficient; the view (0005) must be regenerated in 0016 or the storefront read returns no grade (AC-2/AC-9 coupled).
- `CatalogProductCard` is consumed by `product-card.tsx`, `featured-products.tsx`, catalog/search pages — **implication**: adding `conditionGrade` is a widening change; every mapper in `queries.ts` building a `CatalogProductCard` must set it (TS build enforces this).
- `ProductField` / `ProductParsed` / `ProductFormValues` are three parallel shapes — **implication**: grade must be added to all three plus the parser plus the actions plus the form UI, or edit-load/round-trip breaks (AC-7).
- `.theme-storefront` token change cascades to **every** storefront surface — **implication**: catalog/PDP/cart/checkout must be visually re-checked, not just the homepage (AC-12/13). Admin is firewalled.

## External Research

- **No external APIs.** Data is Supabase (internal) + the T16 email relay (env-wired). No new third-party integration; no rate-limit/quota concerns beyond the existing quote limiter.
- **Library docs**: shadcn Accordion/Select — standard usage; Select must be controllable for the calculator island and post a plain value in the admin form. next-intl — nested namespaces + `t.raw()` for templated strings (mirror existing `home`/`empresas`).
- **Postgres enums** — `create type ... as enum` is not idempotent alone; guard with `do $$ ... exception when duplicate_object ... $$` (or ordered `drop type if exists`) so AC-3 re-run passes. `alter table add column` guarded/`if not exists` where supported.

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Migration re-grants `anon`/`authenticated` via hosted default ACLs (the drift 0015 fixed) | Med | High | Follow 0015 posture; only intentional `grant select on products_public`; grant-audit after apply; test idempotent re-run |
| Grade added to table but not to `products_public` view → badge never shows | Med | High | AC-2 makes view regen explicit; query-level test asserts `conditionGrade` is projected |
| Site-wide token swap breaks contrast on catalog/PDP/cart | Med | High | Change tokens only in `.theme-storefront`; contrast-check CTA orange + brand-green surfaces; visual sweep of all storefront pages in UX stage |
| A home component / `page.tsx` blows the 400-line soft cap during rebuild | High | Med | One component per section; split hero into hero/stats/cert-tag; keep `page.tsx` a thin composition |
| Calculator introduces an inline `<script>` violating the T14 CSP posture | Low | High | `"use client"` component; no `dangerouslySetInnerHTML`, no inline handlers |
| Duplicating the quote pipeline instead of reusing T16 | Med | Med | Embed existing `QuoteForm` + server action; forbid a new relay/limiter |
| Rendering media-note boxes by literal-porting the mockup | Med | Low | AC-21 forbids; reviewer checks no dashed "suggested photo/video" UI ships |
| SEO/JSON-LD regression during recompose | Med | High | Keep `generateMetadata` + Ld builders untouched; snapshot the emitted structured data |
| Enum value `'A+'` (contains `+`) mishandled in TS/JSON/select | Low | Med | Centralize in `grade.ts`; exact string keys in messages (`options["A+"]`); round-trip test |

### Performance Considerations

- Homepage grows from 4 to ~13 sections but stays a server component; the only added client JS is the calculator island (tiny) + the reused quote form. Keep sections server-rendered; do not make the whole page a client component.
- Featured-products read is bounded (`pageSize: 8`) and cached; grade adds one projected column — negligible.
- Images: reuse existing `sizes` and nullable slots; add no large decorative images. Respect the T14 image-optimization pass.

### Security Considerations

- **Grade is server-validated** — never trust the client `<select>`; `parseProductInput` is authority (edge case 3); DB enum is the backstop.
- **`products_public` must keep omitting `cost_price_cents`** when regenerated — a `select *` would leak cost. Copy the explicit column list from 0005, add only `condition_grade`.
- **Quote reuse inherits T16 defenses** (honeypot, per-IP limit, escaped email template) — do not weaken by embedding differently.
- **No secrets, no `NEXT_PUBLIC_` additions.** WhatsApp phone is already a non-secret constant.
- **RLS**: admin writes via authenticated admin path; anon reads only via the view. The migration must not open raw `products` to anon.

## Implementation Recommendations

### Suggested Order of Implementation

1. **`grade.ts` + migration 0016 + `products_public` regen** — the foundation everything reads. Verify hosted-safe grants + idempotency first.
2. **Read path** — `types.ts` (`conditionGrade`) → `queries.ts` projection → `GradeBadge` → wire into `product-card.tsx` + PDP. TS build catches any unmapped `CatalogProductCard`.
3. **Admin write path** — `product-input.ts` → `products-form-state.ts` → `actions.ts` → form `<select>`. Round-trip test (save A+ → reopen → selected).
4. **Tokens** — `.theme-storefront` brand greens + mint + `--cta` orange; wire CTA into the site-wide button variant. Contrast check.
5. **Shell** — `SiteTopbar` (new) → header restyle + real logo + orange CTA → footer restructure → favicon. Verify FAB stays single-instance + config-gated.
6. **i18n** — add `home.*`, footer, `product.grade.*` to both message files from the mockups (ES from ES, EN from EN), including calculator labels/notes.
7. **Homepage sections** — build each section component, then compose in `page.tsx` keeping metadata/JSON-LD.
8. **Placeholder checklist** — append every illustrative figure to `tasks/client-content-questionnaire.md` (or a new `tasks/T19-placeholder-checklist.md`).
9. **Tests** — grade parser (enum + tamper), grade badge (present/absent/unknown), calculator (savings math + clamp), homepage render/SEO snapshot; run lint/test/build.

### Key Decisions

- **CTA color as a dedicated token, not a repurposed `--primary`** — recommended: add `--cta`/`--cta-foreground` so brand green stays the identity color and orange is exclusively CTAs. Repurposing `--primary` to orange would wrongly tint non-CTA primary surfaces.
- **Reuse the T16 `QuoteForm` component directly** rather than cloning — embed it in `b2b-section.tsx`; keep the same dedicated per-IP quote limiter.
- **Calculator reference prices in config, labels in messages** — recommended: store the numeric price map + model list in a small config module and localize only labels/notes via next-intl, so prices aren't duplicated across locale files and stay MXN in both.
- **Grade type includes `'A+'` verbatim** — centralize in `grade.ts`; use exact JSON keys; do not slugify (`aplus`) to avoid label mismatches.
- **Hero cert-tag** — render as a small tokenized badge in our design language (not the mockup's rotated brass tag); tie to a featured product's grade or a static illustrative "Grade A+" element with an asterisk disclaimer.

### Anti-Patterns to Avoid

- Don't port the mockup's CSS/fonts/palette — owner rejected the visual design; take structure + copy only.
- Don't render the dashed "media-note" boxes — they are client instructions (AC-21).
- Don't `select *` in the regenerated `products_public` view — it leaks `cost_price_cents`; copy the explicit column list.
- Don't add the grade to the table without the view — the storefront read path won't see it.
- Don't build a second quote pipeline — reuse T16's form/action/limiter/relay.
- Don't make the whole homepage a client component to power the calculator — isolate the calculator as an island.
- Don't hardcode hex colors in components — all color via `.theme-storefront` tokens.
- Don't let a new file cross the 400-line soft cap — one section per component; split the hero.
- Don't touch admin tokens or theme — firewalled; only add the neutral grade select.
- Don't invent warranty/return terms — copy intentionally omits them.
