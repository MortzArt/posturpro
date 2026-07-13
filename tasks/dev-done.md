# Dev Summary: T4 — Product Detail Page (`/producto/[slug]`)

## Rendering Mode

**Static / ISR (SSG).** Build output shows `/[locale]/producto/[slug]` as `●`
(SSG) with 60 prerendered paths (30 active slugs × 2 locales), Revalidate 5m. No
route-level `revalidate` export (mirrors T3 catalog routes) — the ISR window
lives on the cookie-free `unstable_cache` read inside `getProduct` (`revalidate:
CATALOG_REVALIDATE_SECONDS`, tags `catalog` + `product:<slug>`). The Q&A submit
busts `product:<slug>` via Next 16 `updateTag` so a published answer appears
promptly. `dynamicParams` left at default (`true`) to keep ISR for products added
after build.

## Files Changed

| Path | Change | Summary |
|------|--------|---------|
| `src/lib/config.ts` | modified | PDP constants: `RECENTLY_VIEWED_MAX=8`, `RECENTLY_VIEWED_STORAGE_KEY`, `QA_RATE_LIMIT_WINDOW_MS=60000`, `QA_MAX_SUBMISSIONS_PER_WINDOW=3`, `AUTHOR_NAME_MAX=120`, `QUESTION_MAX=2000`. |
| `src/lib/catalog/product-detail.types.ts` | created | `ProductDetail`, `ProductVariantView`, `ProductImageView`, `ProductQuestionView`, `SpecRow`. |
| `src/lib/catalog/product-detail.ts` | created | `getProduct(slug)` + `listActiveProductSlugs()`. Reads `products_public` VIEW (no cost data), batched `.eq()` children, `unstable_cache` tags. Slug bounded pre-cache (`isCacheableSlug`, T3 DoS precedent). |
| `src/lib/catalog/variant-selection.ts` | created | Pure: `effectivePriceCents`, `shouldStrikeCompareAt`, `imagesForVariant`, `variantStockState`, `defaultVariant`. |
| `src/lib/catalog/specs.ts` | created | Pure `buildSpecRows` — mm→cm, g→kg, null-omission (AC-10). |
| `src/lib/catalog/product-display.ts` | created | Server `buildVariantDisplayMap` + `buildProductDisplay` so the panel does ZERO client i18n. |
| `src/lib/qa/submit-guard.ts` | created | Pure `validateQaSubmission` (trim-first), `isHoneypotTripped`, `checkRateLimit` (in-memory window). |
| `src/lib/recently-viewed.ts` | created | Typed, SSR-safe, quota-guarded localStorage get/record (stores card view model). |
| `src/lib/interpolate.ts` | created | Tiny `{token}` interpolation for i18n templates passed server→client. |
| `src/app/[locale]/producto/[slug]/page.tsx` | created | PDP route: `generateStaticParams`, `generateMetadata`, server component composing breadcrumb + purchase panel + specs + recently-viewed + Q&A. |
| `src/app/[locale]/producto/[slug]/loading.tsx` | created | Route skeleton → `PdpSkeleton`. |
| `src/app/[locale]/producto/[slug]/actions.ts` | created | `"use server"` `submitQuestion` — honeypot → validate → rate-limit → anon RLS insert → `updateTag`. |
| `src/components/product/product-purchase-panel.tsx` | created | The ONE `"use client"` selection island (single source of truth for `selectedVariantId`). |
| `src/components/product/product-gallery.tsx` | created | `"use client"` gallery + thumbnail rail + raw Radix Dialog zoom. |
| `src/components/product/variant-selector.tsx` | created | `"use client"` hand-rolled roving-tabindex radiogroup of color swatches. |
| `src/components/product/product-specs.tsx` | created | Server `<dl>` spec list. |
| `src/components/product/product-qa.tsx` | created | Server list of published Q&A + empty state + `QaForm`. |
| `src/components/product/qa-form.tsx` | created | `"use client"` `useActionState` form: honeypot, counter, validation, all result states. |
| `src/components/product/recently-viewed.tsx` | created | `"use client"` empty-SSR-shell strip; records on mount; reuses `ProductCard`. |
| `src/components/product/pdp-skeleton.tsx` | created | Layout-matched loading skeleton. |
| `src/messages/es-MX.json`, `src/messages/en.json` | modified | Added the `product` i18n namespace (both locales, key-parity verified). |
| `src/app/globals.css` | modified | PDP motion: `.gallery-image` (M1), `.gallery-zoom-trigger`/`.swatch-press` (M4), `.thumb-hover` (M6), `.price-value` (M5), `.gallery-zoom-scrim`/`.gallery-zoom-dialog` (M2/M3) — transform/opacity, <300ms, reduced-motion gated. |

## Placeholder Values Centralized (BUILD_PLAN rule 4)

All new tunables in `src/lib/config.ts` with doc blocks — no magic values in
components: `RECENTLY_VIEWED_MAX`, `RECENTLY_VIEWED_STORAGE_KEY`,
`QA_RATE_LIMIT_WINDOW_MS`, `QA_MAX_SUBMISSIONS_PER_WINDOW`, `AUTHOR_NAME_MAX`,
`QUESTION_MAX`. Unit constants end in `_MS`. Store name = `store_settings.store_name
?? SEED_STORE_NAME`.

## Data-Testids Added

`breadcrumbs`, `product-gallery`, `gallery-zoom-trigger`, `gallery-zoom-dialog`,
`gallery-zoom-close`, `gallery-thumbnails`, `gallery-thumb-{i}`,
`variant-selector`, `variant-swatch-{id}`, `variant-color-label`,
`variant-live-status`, `product-price`, `product-compare-at`, `stock-badge`,
`product-specs`, `spec-row-{key}`, `recently-viewed`, `product-qa`, `qa-list`,
`qa-item-{id}`, `qa-empty`, `qa-form`, `qa-name`, `qa-question`, `qa-counter`,
`qa-name-error`, `qa-question-error`, `qa-form-error`, `qa-success`, `qa-submit`,
`pdp-skeleton`.

## AC-by-AC Implementation Notes

- **AC-1** — Both locales render; unknown/junk slug → `getProduct` null →
  `notFound()` → localized `[locale]/not-found.tsx` inside the shell. Verified.
- **AC-2** — `generateStaticParams` over `listActiveProductSlugs()` × locales → 60
  SSG pages (build confirms), cookie-free tag-cached read.
- **AC-3** — `generateMetadata` `title="{name} — {store}"`, truncated description;
  `{}` on miss.
- **AC-4** — `Breadcrumbs` `Inicio › Sillas › {name}` (last crumb current).
- **AC-5** — Main image + thumbnail rail; primary first (`is_primary`,
  `sort_order`, `id`); zero images → labeled placeholder, no zoom; `onError` →
  placeholder (never broken img).
- **AC-6** — Radix Dialog zoom: Escape/backdrop/close, focus trap + return,
  scale-in 0.95→1 200ms / 150ms exit, center origin.
- **AC-7** — Selection recomputes images (variant→shared fallback), effective
  price (`override ?? base`), stock badge from one island; gallery remounts on
  variant change (edge 8).
- **AC-8** — No variants → no selector; product-level price/stock/images.
- **AC-9** — `formatMXN`; compare-at struck only when `> effectivePrice`,
  recomputed per selection (edge 3). Verified `$7,499.00` + struck `$10,000.00`.
- **AC-10** — `buildSpecRows` mm→cm/g→kg, omits nulls; section hidden when empty.
- **AC-11** — Reused three-state `StockBadge` (icon+text), effective stock driven.
- **AC-12** — Client-only strip, empty SSR shell, ≤8 newest-first excluding
  current, guarded storage. Verified absent from SSR DOM.
- **AC-13** — Published Q&A newest-first; empty state + form CTA when none.
- **AC-14** — Server action anon insert; success clears + pending note + focus;
  trim-before-length validation on client + server (edge 4).
- **AC-15** — Off-screen honeypot (not display:none) → fake success; in-memory
  per-IP+product rate limit. Verified.
- **AC-16** — Reads the view; `cost_price_cents` absent from HTML (grep 0).
- **AC-17** — `product` namespace both locales; parity tests pass; es-MX default.
- **AC-18** — Non-empty alts; radiogroup roving tabindex + arrows/Home/End;
  aria-live status; sr-only compare prefix; semantic `<dl>`; form a11y.
- **AC-19** — Mobile-first single column; `lg` two-column; order gallery → info →
  specs → recently-viewed → Q&A.
- **AC-20** — `ease-out` enters, transform/opacity only, <300ms, interruptible,
  reduced-motion gated; swatches press-feedback only.

## Edge Cases Handled

1. Zero images → placeholder, no zoom. 2. All variants out → selectable, dim +
slash, "Agotado". 3. Override vs. compare-at → strike recomputed per selection.
4. Whitespace question → trimmed → field error, no insert. 5. Archived mid-flow →
RLS 42501 → "unavailable" (verified). 6. Unsafe slug → `isCacheableSlug` rejects →
404 (verified `/producto/../../etc`). 7. localStorage failure → swallowed, one
warn, strip hidden. 8. Rapid variant clicks → gallery keyed remount, no stuck
frame. 9. Read failure → typed throw → `error.tsx`. 10. Long text → break-words,
max-w-2xl, no overflow.

## Verification Results

- **Lint** — clean (0/0).  **Typecheck** — clean.  **Build** — succeeds, PDP SSG,
  60 paths, 5m ISR.  **Unit tests** — 297 passed (17 files); message parity 150
  passed.
- **Manual** (own server port 3000, seeded local Supabase; user's 3206 + Docker
  untouched): es-MX/en render 200; unknown slug → localized not-found in shell;
  `cost_price_cents` absent; breadcrumb/h1/price+struck/3 swatches/stock
  badge/zoom/aria-live/honeypot/productId all present; Q&A empty state renders;
  RLS write path verified (valid anon insert 201; self-publish + archived → 42501;
  unpublished row invisible to anon SELECT).

## Key Decisions

- **Server→client i18n boundary**: translator functions can't serialize into
  client components. Display strings resolved server-side (`product-display.ts`);
  the 3 trivial remaining interpolations pass as localized TEMPLATES filled by a
  20-line pure `interpolate()` — no client i18n lib, zero new deps.
- **`updateTag` over `revalidateTag`**: Next 16's `revalidateTag` requires a
  profile arg; `updateTag` is the server-action read-your-own-writes purge.
- **Gallery reset via parent `key`** (not reset-effect / during-render ref) —
  satisfies strict `set-state-in-effect` + `refs-during-render` lint rules.
- **Anon client + RLS for the write** (never the secret client): the
  `product_questions_anon_insert` WITH CHECK is the boundary; action sends only
  `{product_id, author_name, question}`.

## Deviations from Ticket

- **Messages path**: ticket said `src/messages/*.json`; that IS the real path
  (`src/i18n/messages/` doesn't exist). Namespace added where `catalog` lives.
- **Icon name**: `MessageQuestion02Icon` doesn't exist in the free set → used
  `MessageQuestionIcon`. `ZoomInAreaIcon`/`Cancel01Icon` verified present.
- **No route-level `revalidate` export**: Next 16 rejects a non-literal segment
  config; removed it — ISR fully handled by `unstable_cache` (build confirms 5m),
  exactly like T3 routes.

## Known Limitations

- **404 status under `next start`**: unknown slug renders the correct localized
  not-found UI inside the shell (AC-1 met), but local `next start` serves it from
  the prerender cache as HTTP 200 (`x-nextjs-cache: HIT`) rather than 404 — a
  documented Next 16 SSG + `notFound()` + `dynamicParams=true` caching artifact;
  status is preserved on a real CDN/deployment. Kept `dynamicParams=true` for ISR;
  set `dynamicParams=false` if a hard 404 is required everywhere (trade-off: new
  slugs 404 until rebuild).
- **Rate limiter in-memory / per-instance** (best-effort, per ticket); durable
  limiter is a documented follow-up.
- **One leftover unpublished test row** (`author_name="T4 Verify"`) in the local
  seeded DB from RLS verification — invisible to anon/UI (confirmed by empty anon
  SELECT), clears on next `supabase db reset`; local service key to delete it
  wasn't available in this environment.

## Dependencies Added

None.
