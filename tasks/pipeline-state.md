# Pipeline State
Task: T4 — Product detail page
Tier: full-cycle (medium)
Stage: 6
Agent: ultrafix
Last Updated: 2026-07-13
Notes: Stage 5 (Review) COMPLETE — tasks/review-findings.md written. Verdict REQUEST CHANGES 8/10: 0 critical, 4 major (M-1 recently-viewed frozen low-stock label applied to every tile; M-2 unbounded rate-limit map keyed ip|productId with unvalidated productId — same cardinality class as T3's MAX_PAGE fix; M-3 clientIp trusts spoofable x-forwarded-for first hop; M-4 dead defaultVariant helper + duplicated default logic), 6 minor, 4 nit. ACs 18 PASS / 2 PARTIAL (AC-3 description truncation, AC-15 rate limit per M-2/M-3) / 0 FAIL; 10/10 edges. Clean: anon+RLS boundary, honeypot, cost_price_cents absent, slug cache-key bounding, no XSS, localStorage crash-safe, i18n parity, M1-M9 motion APPROVED. Stage 4 (Dev) COMPLETE — tasks/dev-done.md written. Prior artifacts: next-ticket.md, research-report.md, ui-design.md.

Stage 4 summary: 22 files (19 new, 3 modified). Read layer src/lib/catalog/product-detail.ts (getProduct/listActiveProductSlugs) + 6 pure helper libs (variant-selection, specs, product-display, qa submit-guard, recently-viewed storage, interpolate). Route src/app/[locale]/producto/[slug]/{page,loading,actions}. 8 components in src/components/product/. Modified: config.ts (6 constants), src/messages/ both locales (product namespace), globals.css (M1-M6 motion). 20/20 ACs + 10 edge cases. Gates: lint 0/0, tsc clean, build green — PDP is SSG/ISR (60 prerendered paths, 5m revalidate via unstable_cache). 297 unit + 150 message parity pass. Live-verified RLS write path: valid anon insert 201; self-publish/archived 42501; unpublished invisible to anon.
Deviations (documented in dev-done.md): messages in src/messages/ (real path, not src/i18n/messages/); MessageQuestionIcon (nearest free icon); no route-level revalidate export (Next 16 rejects non-literal — ISR via unstable_cache like T3).
Known limitation: local next start serves HTTP 200 with correct 404 UI for unknown slugs (Next 16 SSG+notFound prerender-cache artifact; correct on real CDN). dynamicParams=true kept for ISR.

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
