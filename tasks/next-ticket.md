# Task: T19 — Homepage rebuild from client content page + product condition grades

## Priority

**High** — Owner-requested (2026-08-27), scheduled after T14 launch hardening. This is the client-facing front door: it replaces the T13 homepage with the client-approved section structure/copy, introduces a site-wide brand palette + CTA color from the official logos, and adds a net-new condition-grade system that touches DB, admin, and storefront. It gates the client's go-live sign-off on the homepage.

## Complexity

**high** — Justified against the criteria:
- **New subsystem + new data model**: nullable `condition_grade` enum on `products` requires a DB migration (0016), a `products_public` view regeneration, admin form/validation wiring, and storefront read-path plumbing (`CatalogProductCard` type + query projection).
- **15+ files changed**: DB migration + view, `product-input.ts`, `products-form-state.ts`, admin `actions.ts` + product form UI, catalog `types.ts` + `queries.ts` (2 read paths), `product-card.tsx`, PDP page, a new grade-badge component, both message files, site-wide token changes in `globals.css`, new shell components (topbar, restyled header/footer), 8+ new homepage section components, homepage `page.tsx`, calculator island, B2B section reusing the T16 quote flow.
- **Architectural / site-wide change**: brand palette + CTA-orange token changes cascade to every storefront surface; the shell (topbar/header/footer/FAB) is restyled globally.

## Feature Type

**full-stack** — DB migration + admin write path + storefront read path (backend) AND a full homepage rebuild + shell restyle + interactive calculator (frontend). All pipeline stages run at full depth.

## User Story

As a **prospective PosturPro customer (individual or business) in Mexico**, I want a **homepage that clearly communicates what PosturPro sells, why refurbished premium chairs are trustworthy, and what condition grade each chair is in**, so that **I can confidently browse the catalog or request a business quote** — while the **owner** can **assign a condition grade to any product from the admin panel** so the storefront shows it.

## Background

The current homepage (T13, refreshed in T15 "Casa de Azulejo" cobalt identity) renders four sections: Hero → FeaturedProducts → EditorialBand → FeaturedBrands (`src/app/[locale]/page.tsx`). The client sent two layout mockups (`tasks/reference/client-homepage-en.html` / `-es.html`) with a richer 13-section structure and finalized copy. The owner has **rejected the mockup's visual design** (Big Shoulders Display font, ink/brass/teal palette) and mandated: keep our existing design language (shadcn/ui, Libre Caslon Text headings, Inter body, token-driven storefront theme), but adopt the **structure + copy** from the mockups, apply a **new brand palette from the official logos** (deep green `#094220`, brand green `#0f7f3c`, mint `#e7f7ed`) site-wide, and make **every primary CTA orange `#f95326`**.

Net-new scope: a **condition-grade system** (A+/A/B, optional per product). The mockup shows grade "cert-tags" on the hero and product cards; the client marks this as a proposal to adopt. This requires DB, admin, and storefront work.

The T16 `/empresas` page already implements a complete, hardened B2B quote flow (honeypot → validation → per-IP rate-limit → email relay). The homepage B2B section MUST reuse it — no parallel pipeline.

Illustrative figures (hero stats, impact strip, offices count, testimonials, calculator reference prices) are placeholders that ship in the translation files so the owner can swap them; a checklist of every placeholder value is a deliverable.

The full binding spec is `tasks/reference/T19-brief.md`.

## Acceptance Criteria

Each criterion is binary — PASS or FAIL.

### A. Condition-grade data model (backend)
- [ ] AC-1: Migration `supabase/migrations/0016_product_condition_grade.sql` creates enum `product_condition_grade` with exactly the values `'A+'`, `'A'`, `'B'` and adds a **nullable** `condition_grade product_condition_grade` column to `products` (no default, no NOT NULL).
- [ ] AC-2: The migration regenerates the `products_public` view (currently defined in `0005_rls_policies.sql`, `security_invoker`, omits `cost_price_cents`) to include `condition_grade`, preserving the existing column omissions and the `grant select ... to anon, authenticated` posture.
- [ ] AC-3: The migration follows the 0015 hosted-safe grant posture: it introduces no new stray `anon`/`authenticated` privileges beyond the intentional `grant select on products_public`; any object it (re)creates does not re-grant to `anon`/`authenticated` via default ACLs. Running it on a fresh local stack and re-running it (idempotency check) both succeed.
- [ ] AC-4: Existing products (all current rows) have `condition_grade = NULL` after migration; no data loss on any other column.

### B. Admin grade assignment
- [ ] AC-5: The admin product add/edit form (under `src/app/admin/(app)/products/`) shows a "Condición / Condition" `<select>` with options: (none/no grade) + A+ + A + B, defaulting to no grade for new products and pre-populated with the saved value on edit.
- [ ] AC-6: `parseProductInput()` (`src/lib/admin/products/product-input.ts`) validates `condition_grade`: empty string → `null`; `A+`/`A`/`B` → that value; any other value → a `condition_grade` field error. `ProductParsed` gains `condition_grade: ProductConditionGrade | null`.
- [ ] AC-7: `createProduct` and `updateProduct` (`actions.ts`) persist `condition_grade` and call `revalidateTag(CATALOG_CACHE_TAG)` on success. Saving with no grade selected persists `NULL`; the value round-trips (save A+, reopen edit, A+ is selected).
- [ ] AC-8: Grade is optional — a product can be created and saved with no grade and no validation error is raised for that field.

### C. Storefront grade badge
- [ ] AC-9: `CatalogProductCard` (`src/lib/catalog/types.ts`) gains `conditionGrade: ProductConditionGrade | null`, and both `listProducts` and the search/PDP read paths (`src/lib/catalog/queries.ts`) project it from `products_public`.
- [ ] AC-10: A shared `<GradeBadge grade label />` component renders a badge reading "Grado A+/A/B" (es-MX) / "Grade A+/A/B" (en) on the product card, PDP, and homepage catalog cards when `conditionGrade` is set. When `conditionGrade` is `null`, **no badge and no empty space** is rendered.
- [ ] AC-11: The grade badge uses design tokens (no hardcoded hex) and is visually distinct from the existing stock badge; both can appear on the same card without overlap or clipping at 320px width.

### D. Brand palette + CTA color (site-wide)
- [ ] AC-12: The `.theme-storefront` token block in `src/app/globals.css` is updated so the storefront primary/brand color derives from the logo greens (`#094220` deep, `#0f7f3c` brand) and a mint (`#e7f7ed`) surface tint, replacing the cobalt palette. No storefront component hardcodes a hex value.
- [ ] AC-13: A dedicated CTA token (e.g. `--cta` / `--cta-foreground`) resolves to orange `#f95326` with an accessible foreground; **every primary CTA button across the storefront** (homepage, catalog, PDP, cart/checkout shells, B2B) uses it. Contrast of CTA text on orange meets WCAG AA (≥ 4.5:1 for body text).
- [ ] AC-14: The real logo (`public/brand/logo.svg`) renders in the header and footer where a text/placeholder logo was shown; `public/brand/icon.svg` is used as the favicon.

### E. Shell restyle
- [ ] AC-15: A new **topbar** renders above the header with static/rotating messages (nationwide shipping, interest-free installments, tax invoicing) + a WhatsApp contact link, all i18n, collapsing gracefully on mobile (horizontal scroll or stacked, no layout break at 320px).
- [ ] AC-16: The header nav matches the mockup's items (Catalog / Process / Business / Trust) with a primary orange "Business quote" CTA; the footer matches the mockup's 4-column structure (brand blurb + social, Catalog, Business, Company, Contact) with copy from the mockup.
- [ ] AC-17: The existing WhatsApp FAB (`src/components/layout/whatsapp-button.tsx`) is reused (not duplicated); it still respects `isWhatsAppConfigured()` and does not render when the phone is unconfigured.

### F. Homepage sections (structure + copy from mockup)
- [ ] AC-18: The homepage renders, in order: Hero (eyebrow, headline "Eleva tu mobiliario. / No tus costos.", subcopy, 2 CTAs [catalog=orange primary, business=secondary], 3 placeholder stats, cert-tag visual element restyled to our language) → Brand bar → Values (4 cards) + Impact strip (3 placeholder figures) → Catalog (real featured products) → Process (4 steps) → B2B (value list + segments + reused quote form) → Social proof (2 placeholder testimonials) → Savings calculator → Trust + FAQ (4 guarantees + 4 accordion items) → CTA banner → Footer (shell) → WhatsApp FAB (shell).
- [ ] AC-19: The homepage catalog section renders **real** products via `listProducts({ pageSize: HOME_FEATURED_PRODUCTS })` — no hard-coded chairs — including grade badges where set, and links each card to `/producto/[slug]`. It degrades to hidden/empty-safe when the read fails, matching the existing graceful-degradation pattern.
- [ ] AC-20: Every user-visible string is served through next-intl from `src/messages/es-MX.json` (default) and `src/messages/en.json`, with copy taken from the ES and EN mockup files respectively. No hardcoded UI copy in components. MXN prices display in both locales via `formatMXN`.
- [ ] AC-21: The mockup's dashed "media-note" (suggested photo/video) boxes are **NOT rendered**. Image slots use existing nullable image config (`HERO_IMAGE`, `imagery.ts`) with tasteful non-photo fallbacks.
- [ ] AC-22: Placeholder-figure asterisk disclaimers ("*Estimated example figures…") are rendered subtly (small, muted) beneath the relevant sections.

### G. Savings calculator
- [ ] AC-23: A client-side interactive calculator lets the user pick a model from a select (the 6 models from the mockup) and shows new-price vs PosturPro-price bars, savings % and savings amount, computed from reference prices stored in config/messages. Changing the select updates all values without a full page reload. Reference prices carry the "*Reference prices…" note. No inline `<script>` (CSP-safe client component).

### H. SEO / metadata preservation
- [ ] AC-24: The homepage retains its `generateMetadata()`, Organization + WebSite JSON-LD, canonical/alternates behavior from T13/T14 (no regression in emitted `<head>` structured data or `hreflang` alternates).

### I. Quality gates
- [ ] AC-25: `npm run lint`, `npm run test`, and `next build` all pass. No file exceeds the 400-line soft cap without justification, and none exceeds the 1000-line hard cap. No `any`, no non-null `!` to silence TS, no empty `catch {}`.

## Edge Cases

1. **Product with no grade** → card/PDP/homepage render with no grade badge and no reserved empty gap; admin edit shows the "none" option selected.
2. **Legacy/invalid grade value at read layer** → enum constraint prevents bad writes; if an unrecognized value reaches the badge component, it renders nothing rather than throwing.
3. **Admin submits a tampered grade value** (client `<select>` bypassed, POST carries `grade=X`) → `parseProductInput` rejects with a `condition_grade` field error; nothing is written.
4. **Homepage catalog read fails** (Supabase down / RLS error) → catalog section degrades to hidden/empty exactly like the current `readFeaturedProducts` fallback; the rest of the homepage still renders.
5. **WhatsApp phone unconfigured** → topbar WhatsApp link and FAB both hide (or topbar shows the message without a broken link); never `wa.me//` with empty digits.
6. **Reduced motion** (`prefers-reduced-motion: reduce`) → hero load-in, scroll-reveal, and calculator bar transitions are instant; no motion.
7. **320px viewport** → topbar messages, 4-up value/process grids, catalog grid, calculator bar rows, footer columns, and hero stats reflow to stacked columns without horizontal page scroll or clipped text.
8. **English locale** (`/en`) → every section shows EN copy from the EN mockup; MXN prices still shown as MXN (not converted); calculator labels localized.
9. **Calculator model where PosturPro price ≥ new price** (bad config) → bar width clamps to a minimum and savings % floors at 0 (never negative) — mirrors the mockup's `Math.max(8, …)` clamp.
10. **B2B quote form submitted twice rapidly** → reused per-IP rate limiter returns `rate-limited`; localized message shown, no second email.
11. **Honeypot tripped on homepage quote form** → fake success, no email sent (reused behavior).
12. **Grade badge + long product name + low-stock badge on one 320px card** → no overlap, no clipped badge; name clamps to 2 lines as today.
13. **Migration re-run on hosted** (already applied) → idempotent; no error re-creating the enum/view or re-granting.
14. **Sitemap/JSON-LD after rebuild** → Organization/WebSite nodes still emit exactly once; no duplicates or omissions.

## Error States Table

| Trigger | User Sees | System Does |
| ------- | --------- | ----------- |
| Homepage featured-products read throws | Catalog section hidden (no error UI); rest of page intact | Caught in `readFeaturedProducts`, returns `[]`, logs context server-side |
| Admin saves product with tampered grade | Inline field error under the grade select ("Selecciona una condición válida") | `parseProductInput` returns `condition_grade` error; no DB write; values preserved |
| Admin save hits DB (RLS / unique) error | Form-level error banner with retry | `actions.ts` catches, maps to `error` state, preserves values |
| B2B quote validation fails | Inline field errors, values preserved | `submitQuoteForm` returns `invalid` + fieldErrors |
| B2B quote rate-limited | Localized "please wait" status message | `checkQuoteRateLimit` blocks; no relay send |
| B2B quote email relay fails | Friendly error state + Retry button | `sendQuoteRelay` failure mapped to `error`; raw reason not surfaced |
| WhatsApp not configured | No FAB, no topbar WA link | `isWhatsAppConfigured()` false → components return null |
| Calculator select changed | Bars/percent/amount update instantly | Client-side recompute from reference price map |
| Image slot unconfigured (HERO_IMAGE null) | Token-tinted glyph panel (no broken img) | Component renders fallback tile (existing `HeroMedia` pattern) |

## UX Requirements

- **Loading**: Homepage is a server component — sections render with content already resolved; no first-paint spinner. The B2B quote submit button shows a pending state via `useActionState`.
- **Empty**: No featured products → catalog section hidden (matches current `FeaturedProducts` null return). No featured brands → brand bar falls back to the static mockup list (Herman Miller · Steelcase · Haworth · Knoll · Humanscale). No grade → no badge.
- **Error**: Read failures degrade sections silently. Quote-form errors show inline/banner recovery with Retry. Admin grade errors show inline field messages.
- **Success**: Quote submitted → localized success banner, form cleared, focus moved to banner (reused T16 behavior). Admin product saved with a grade → badge appears on storefront after `revalidateTag`.
- **Mobile (375px)**: Single-column stacks for values/process/catalog/footer; topbar messages scroll/wrap; hero stats wrap; calculator rows stack; CTAs full-width where appropriate; nav collapses to existing mobile menu.
- **Tablet (768px)**: 2-up value cards and 2-up catalog grid; impact strip 3-up; footer 2-column; process steps 2-up; B2B single-column until lg.

## Technical Approach

### Files to Create

- `supabase/migrations/0016_product_condition_grade.sql` — enum + nullable column + `products_public` view regeneration; hosted-safe grants (mirror 0005 view grant + 0015 posture).
- `src/lib/catalog/grade.ts` — `ProductConditionGrade = "A+" | "A" | "B"`, `PRODUCT_CONDITION_GRADES` const, `isConditionGrade(v): v is ProductConditionGrade` guard — single source of truth shared by admin + storefront.
- `src/components/catalog/grade-badge.tsx` — presentational `<GradeBadge grade label className? />`; renders nothing when grade absent/unrecognized; token-driven.
- `src/components/layout/site-topbar.tsx` — i18n topbar (messages + WhatsApp link) reusing `buildWhatsAppUrl`/`isWhatsAppConfigured`.
- `src/components/home/hero.tsx` (extend or add home variant) — eyebrow, dual CTAs, stat row, restyled cert-tag element. Split `hero-stats.tsx`/`cert-tag.tsx` if over cap.
- `src/components/home/brand-bar.tsx` — brand strip (real brands or static fallback).
- `src/components/home/values-impact.tsx` — 4 value cards + 3-figure impact strip + disclaimer.
- `src/components/home/process-steps.tsx` — 4 numbered steps.
- `src/components/home/b2b-section.tsx` — value list + segments + embedded reused quote form + placeholder stats.
- `src/components/home/social-proof.tsx` — 2 placeholder testimonials + disclaimer.
- `src/components/home/savings-calculator.tsx` — `"use client"` island: model select, price bars, savings %/amount; reduced-motion aware.
- `src/components/home/trust-faq.tsx` — 4 guarantees + 4 shadcn Accordion items.
- `src/components/home/cta-banner.tsx` — closing banner, 2 CTAs.
- Co-located `*.test.tsx` for grade badge, calculator, and any logic-bearing component.

### Files to Modify

- `src/app/globals.css` — `.theme-storefront` tokens: brand greens + mint; add `--cta`/`--cta-foreground` (orange). Keep `--whatsapp` green unless rebranding FAB.
- `src/app/[locale]/layout.tsx` — insert `SiteTopbar` above `SiteHeader`.
- `src/components/layout/site-header.tsx` — nav = mockup items, real logo, orange business-quote CTA.
- `src/components/layout/site-footer.tsx` — 4-column + contact layout, real logo, social links, mockup copy.
- `src/app/[locale]/page.tsx` — recompose to the 13-section order; keep `generateMetadata` + JSON-LD; pass grade-aware featured products.
- `src/lib/catalog/types.ts` — add `conditionGrade` to `CatalogProductCard` (+ PDP product type).
- `src/lib/catalog/queries.ts` — project `condition_grade` in `listProducts`, search, and PDP reads; map to `conditionGrade`.
- `src/components/catalog/product-card.tsx` — render `<GradeBadge>` when present, coexisting with stock badge.
- `src/app/[locale]/producto/[slug]/page.tsx` — render grade on PDP.
- `src/lib/admin/products/product-input.ts` — add `condition_grade` to `ProductField`, validation, `ProductParsed`.
- `src/app/admin/(app)/products/products-form-state.ts` — add `condition_grade: string` to `ProductFormValues` + empty default.
- `src/app/admin/(app)/products/actions.ts` — pass `condition_grade` through create/update; hydrate on edit-load.
- Admin product form UI component — add grade `<select>` (neutral admin theme).
- `src/messages/es-MX.json` + `src/messages/en.json` — new `home.*` namespaces + footer additions + `product.grade.*`; copy from respective mockups.
- `src/lib/config/imagery.ts` / `static-pages.ts` — any new nullable image slots or the calculator reference-price map (if config-stored).
- `tasks/client-content-questionnaire.md` (or new `tasks/T19-placeholder-checklist.md`) — append owner checklist of every placeholder figure.

### Data Model Changes

- `products` — new nullable column `condition_grade product_condition_grade` (enum `'A+' | 'A' | 'B'`). No default, no backfill (existing rows → NULL).
- `products_public` view — add `condition_grade` to its SELECT, preserving `cost_price_cents` omission + `security_invoker` + `grant select to anon, authenticated`.

### API Endpoints

- No new HTTP endpoints. Grade writes flow through existing admin server actions `createProduct` / `updateProduct`. The B2B quote reuses `submitQuoteForm` (`src/app/[locale]/empresas/actions.ts`). Storefront reads use cached `listProducts` / PDP query.

### Dependencies

- **None new.** Uses existing shadcn/ui (Accordion/Select/Button), `@hugeicons/react` + `@hugeicons/core-free-icons`, next-intl, `next/image`, money/config utilities. Do NOT add fonts (no Big Shoulders / IBM Plex) or a UI library.

## Out of Scope

- Warranty/return terms or coverage copy — the mockup deliberately omits specifics; keep it that way.
- Real photography/video — media-note boxes are client instructions, not UI; use existing image slots/fallbacks.
- Per-variant grades — grade is product-level only.
- A grade filter/sort in the catalog list (T5) — badge display only; filtering is a future task.
- Changing the B2B quote backend, email templates, or rate-limit policy — reuse T16 as-is.
- Currency conversion for EN — prices stay MXN in both locales.
- Admin theme restyle — admin stays neutral; only the grade select is added.
- CSP policy changes — remain owner-gated (T14 Group B); the calculator must be CSP-safe without new inline scripts.
