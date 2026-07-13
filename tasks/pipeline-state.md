# Pipeline State
Task: T6 — Cart
Tier: standard
Stage: 4 COMPLETE → next: QA (Stage 5)
Agent: ultraqa
Last Updated: 2026-07-14
Notes: S4 (ReviewFix) COMPLETE. Verdict APPROVE (9/10). Found+fixed 1 CRITICAL (C-1: cross-tab storage sync infinite write loop in cart-provider — added lastPersistedRef loop guard; persist effect bails on content-identical payload; storage listener records incoming payload before dispatch), 1 MAJOR (M-1: unbounded tampered unitPriceCents in isCartLine — now rejects > PRICE_BOUND_MAX_CENTS), 1 MINOR (m-1: subtotal DRY → use subtotalCents helper); 2 MINOR skipped (justified). All 18 ACs verified against actual code, all 10 edge cases handled. Dev self-flags 1-5 all confirmed correct/acceptable (ICU-plural boundary clean, no t.raw(plural)→interpolate; no-layout-shift+44px+reduced-motion confirmed). Gate: lint clean, tsc clean, 634/634 unit, 110/110 integration — all green post-fix. QA (Stage 5) should focus on: cross-tab sync (two-tab add/edit/remove, verify no write loop + last-write-wins), corrupt/tampered/oversized localStorage payloads, persistence across reload, out-of-stock add guard, store-settings-null path (no $NaN, progress hidden), 320px no-h-scroll, keyboard + aria-live announcements. QA owns writing cart unit + e2e tests (none written yet).

S3 (Dev) COMPLETE. Full T6 cart implemented — 14 files created (cart lib x3, cart components x8, /carrito route, ...) + 8 modified (config, layout, header, mobile-nav, purchase panel, PDP page, both message files, keys-used test). See tasks/dev-done.md for the AC-by-AC (all 18 PASS), file table, decisions, deviations. Verification: lint clean, tsc clean, build green (carrito SSG both locales; index SSG, PDP SSG, /sillas Dynamic — T3/T4/T5 modes intact), 634/634 unit + 110/110 integration pass. No new tests (QA owns Stage 7). Build ran against local Docker Supabase via well-known keys + NEXT_QA_DIST_DIR; tsconfig auto-edit reverted, build dir cleaned.

S3 Dev decisions / watch-outs for ReviewFix:
- CartProvider: useReducer + functional actions (coalesce rapid clicks). Hydrates empty→storage on mount; persist effect is REF-GATED so it never writes [] over stored data pre-hydration. storage listener re-reads for cross-tab sync. Scrutinize this ordering.
- ICU plural (badgeLabel/announce.added removed its plural to stay count-free for the no-i18n PDP button) resolves via t(), NEVER interpolate. Simple {count}/{amount} use interpolate. Verify no t.raw(pluralKey)→interpolate anywhere.
- announce.added is count-free by design (panel/button take labels as props, no useTranslations). Header aria-label carries the running count via t("badgeLabel",{count}).
- Deviation: no remove-row collapse animation (opacity-only fallback the design allows; row just unmounts). Flag to UX if a collapse is wanted.
- 44px targets on stepper/remove/add/checkout/badge/empty CTA via h-11/size-11 overrides. Badge count is an absolutely-positioned overlay pill (no layout shift). Progress fill is transform:scaleX (never width), reduced-motion gated. FreeShippingProgress returns null when settings null.

S2 design decisions Dev must honor:
- 44px touch targets: shadcn Button lg is only h-8/32px — override to h-11/size-11 on add-to-cart, stepper +/-, remove, checkout CTA, header badge box.
- No layout shift: header badge = icon-only fixed 44x44 box, count is an ABSOLUTELY-POSITIONED overlay pill (never a flex sibling); cart page skeleton sized to real layout so skeleton→content is a pure opacity crossfade.
- FreeShippingProgress fill = transform:scaleX(pct) origin-left, transition transform 400ms --ease-out (NEVER width); reduced-motion swaps to opacity crossfade with transform:none. Component returns null when settings null.
- PDP AddToCartButton takes labels as PROPS (no useTranslations in the panel — keep panel's no-client-i18n invariant); CartPageClient uses useTranslations("cart") directly.
- One page-level aria-live="polite" region for add/qty/remove announcements (not per-control).
- Confirm state ("Agregado ✓") is a CSS-transition crossfade (blur-masked), interruptible, ADD_TO_CART_CONFIRM_MS ~1500. Functional state updates for add/stepper (coalesce rapid clicks, respect cap).
- Reuse StockBadge (state="out") + opacity-60 image for out-of-stock lines; reuse formatMXN + .price-value + .stagger verbatim. Icons: @hugeicons only (ShoppingCart01Icon, Minus/PlusSignIcon, Delete02Icon, Tick02Icon, ArrowRight01Icon, Image01Icon).
- Achieved-shipping tint (emerald-*) is the ONLY proposed non-neutral hue — flag for UX; neutral fallback = text-foreground + 🎉 (aria-hidden).
- ICU plural for badgeLabel/announce.added/titleCount; format cents via formatMXN BEFORE interpolating {amount} into freeShipping.remaining (never pass raw cents to ICU).

S2 design decisions Dev must honor:
- 44px touch targets: shadcn Button lg is only h-8/32px — override to h-11/size-11 on add-to-cart, stepper +/-, remove, checkout CTA, header badge box.
- No layout shift: header badge = icon-only fixed 44x44 box, count is an ABSOLUTELY-POSITIONED overlay pill (never a flex sibling); cart page skeleton sized to real layout so skeleton→content is a pure opacity crossfade.
- FreeShippingProgress fill = transform:scaleX(pct) origin-left, transition transform 400ms --ease-out (NEVER width); reduced-motion swaps to opacity crossfade with transform:none. Component returns null when settings null.
- PDP AddToCartButton takes labels as PROPS (no useTranslations in the panel — keep panel's no-client-i18n invariant); CartPageClient uses useTranslations("cart") directly.
- One page-level aria-live="polite" region for add/qty/remove announcements (not per-control).
- Confirm state ("Agregado ✓") is a CSS-transition crossfade (blur-masked), interruptible, ADD_TO_CART_CONFIRM_MS ~1500. Functional state updates for add/stepper (coalesce rapid clicks, respect cap).
- Reuse StockBadge (state="out") + opacity-60 image for out-of-stock lines; reuse formatMXN + .price-value + .stagger verbatim. Icons: @hugeicons only (ShoppingCart01Icon, Minus/PlusSignIcon, Delete02Icon, Tick02Icon, ArrowRight01Icon, Image01Icon).
- Achieved-shipping tint (emerald-*) is the ONLY proposed non-neutral hue — flag for UX; neutral fallback = text-foreground + 🎉 (aria-hidden).
- ICU plural for badgeLabel/announce.added/titleCount; format cents via formatMXN BEFORE interpolating {amount} into freeShipping.remaining (never pass raw cents to ICU).

S1 findings for downstream stages:
- Cart is CLIENT-ONLY (localStorage), no data model, no server writes — mirror src/lib/recently-viewed.ts (guarded read/write, versioned key, isEntry shape guard, warnOnce, hasStorage SSR guard, null-until-hydrated island).
- Free-shipping flat rate + threshold read from store_settings via getStoreSettingsStatic() (degrades to null) — NEVER hardcode; config.ts holds seed defaults only (SHIPPING_FLAT_RATE_CENTS, FREE_SHIPPING_THRESHOLD_CENTS).
- New config constants to add: CART_STORAGE_KEY="posturpro:cart:v1", MAX_CART_ITEM_QUANTITY, CART_PATH="/carrito", CHECKOUT_PATH="/checkout" (T7 target, may 404), ADD_TO_CART_CONFIRM_MS.
- State: React context CartProvider mounted in [locale]/layout.tsx inside NextIntlClientProvider. No new deps. No Sheet/Dialog (mini-cart is SKIP in spec). Progress bar = Tailwind transform:scaleX (no width animation), reduced-motion gated.
- Integer cents only; formatMXN is the sole display boundary. AC-17: no URL/search-filter coupling.
- Scope guard: NO checkout/order creation/stock reservation/discount code (T7); CTA only links to CHECKOUT_PATH.

Carry-over notes from T5 (relevant to T6):
- T6 cart has no coupling from URL-state (verified during T5).
- ENV NOTE: .env.local points at a dead remote Supabase — all builds/e2e run against seeded local Docker Supabase (:54321). Dev server on :3206. If schema cache goes stale after a migration, NOTIFY pgrst reload. env-gated distDir toggle available in next.config.ts.
- Free-shipping threshold lives in store settings (seeded: flat rate MX$500, free threshold MX$10,000) — T6 progress bar must read from store settings, not hardcode.
