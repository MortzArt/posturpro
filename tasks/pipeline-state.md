# Pipeline State
Task: T4 — Product detail page
Tier: full-cycle (medium)
Stage: 3
Agent: ultradesign
Last Updated: 2026-07-13
Notes: Stage 1+2 (PlanResearch) COMPLETE. Artifacts: tasks/next-ticket.md + tasks/research-report.md.

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
