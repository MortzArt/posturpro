# Pipeline State
Task: T6 — Cart
Tier: standard
Stage: 2 COMPLETE → next: Dev (Stage 3)
Agent: ultradev
Last Updated: 2026-07-14
Notes: S2 (UI Design) COMPLETE. tasks/ui-design.md written for T6 — Cart (overwrote T5 version). 8 components speced: CartCountBadge, AddToCartButton, QuantityStepper, CartLineRow, FreeShippingProgress, OrderSummary, CartEmptyState, CartPageClient — each with props/states/responsive/motion + full i18n cart-namespace table (ES+EN). Next stage is Dev (ultradev). Prior T5 pipeline COMPLETE (SHIPPED).

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
