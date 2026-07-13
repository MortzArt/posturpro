# Pipeline State
Task: T4 — Product detail page
Tier: full-cycle (medium)
Stage: 4
Agent: ultradev
Last Updated: 2026-07-13
Notes: Stage 3 (UI Design) COMPLETE — tasks/ui-design.md written. Stage 1+2 artifacts: tasks/next-ticket.md + tasks/research-report.md.

Stage 3 design decisions (dev must honor): new components in src/components/product/ — ProductPurchasePanel (the ONE client selection island), ProductGallery + raw Radix Dialog zoom, VariantSelector (hand-rolled roving-tabindex radiogroup), ProductSpecs (server dl), ProductQa (server) + QaForm (client, useActionState), RecentlyViewed (client, empty SSR shell), PdpSkeleton. Reuse verbatim: StockBadge, Breadcrumbs, ProductCard, card placeholder, .card-lift/.stagger/.enter-fade primitives. Only shadcn button.tsx installed — use vendored radix-ui Dialog, hand-roll radiogroup/inputs (zero new deps). Motion M1-M9: crossfade 200/150ms for image/price, scale-in modal 0.95->1, press-feedback-only swatches, all transform/opacity <300ms, reduced-motion gated. Design recommendations accepted: recently-viewed stores card view model (no re-fetch); server-built variantDisplay map (zero client i18n in panel); add .order() id tiebreaker in getProduct; Q&A answer timestamps hidden in Phase 1.

Classification: Complexity=medium (reclassified from standard recommendation), Feature Type=full-feature (full-stack). Medium → SKIP Stage 11 (Hacker); run 3(UI Design)→4(Dev)→5(Review)→6(Fix)→7(QA)→8(UX)→9(Security)∥10(Arch)→12(Verify). Security runs FULL depth (first public write path).

Key T4 decisions locked in the ticket (dev MUST honor):
- PDP route src/app/[locale]/producto/[slug]/page.tsx cloned from marcas/[slug] structure; getProduct(slug) in new src/lib/catalog/product-detail.ts mirroring getBrand + stitchCards, reading products_public view (cost_price_cents unreachable by construction; test must assert absence).
- Variant selection owned by ONE client island (ProductPurchasePanel) — price, stock badge, gallery sync from single source of truth. Per-variant images via product_images.variant_id (null = shared fallback).
- Q&A write uses ANON client + RLS (product_questions_anon_insert WITH CHECK: is_published=false, length caps, is_active_product) — NOT admin/secret client. Server action layers: honeypot + in-memory per-IP+product rate limit + trimmed validation. Durable limiter = documented follow-up, not this ticket.
- Recently-viewed: client-only localStorage, effect-driven with empty SSR shell (no hydration mismatch).
- Zoom via Radix Dialog (already installed). Zero new npm deps.
- Do NOT reintroduce T3 cache-key cardinality issue: Q&A input flows only into insert, never a cache key.

Scope guards: NO cart (T6), NO search/filters (T5), NO admin Q&A answering (T11), NO customer accounts (Phase 2).

Open risks for later stages: Q&A form = first public write vector (Stage 9 full focus); in-memory rate limiter is per-instance/best-effort; localStorage/hydration + stale-price-on-rapid-variant-switch edge cases specified in ticket.

ENVIRONMENT: user may be browsing dev server on port 3206 (background) with local Docker Supabase seeded — do NOT kill either; agents use port 3000 for their own servers.
