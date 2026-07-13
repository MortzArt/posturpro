# Pipeline State
Task: T6 — Cart
Tier: standard
Stage: 1 COMPLETE → next: UI Design (Stage 3) then Dev
Agent: ultradesign
Last Updated: 2026-07-14
Notes: S1 (PlanResearch) COMPLETE. next-ticket.md + research-report.md written for T6 — Cart. Feature Type = full-feature; Complexity = medium (18 ACs). Standard-tier next stage is UI Design (ultradesign) since this is a full-feature UI surface, then Dev. Prior T5 pipeline COMPLETE (SHIPPED).

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
