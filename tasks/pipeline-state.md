# Pipeline State
Task: T3 — Catalog browsing
Tier: full-cycle (auto-classified: complexity=medium → run all stages EXCEPT Stage 11 Hacker)
Stage: 6
Agent: ultrafix (Stage 6 — Fix). Review REQUEST CHANGES (8/10): C-1 invalid-slug 404 returns HTTP 200 (soft-404, SEO defect — e2e deliberately avoids asserting status; needs real 404), M-1 pagination number links 32px (<44px bar), M-2 double DB read in readClampedProductPage (count-only query fixes), M-3 unbounded .in(memberIds), M-4 missing duplicate-membership total test, 4 minors. AC-14 partial fail, AC-17 partial. Prior context: Dev stage (Stage 5 note below) Dev done (~45 files): src/lib/catalog/ (queries via products_public + batched .in() children, stock, pagination, types, page-helpers), src/lib/supabase/public.ts (cookie-free client), 7 catalog routes with loading/metadata/notFound/generateStaticParams, 11 components in src/components/catalog/, catalog i18n namespace. Gates: 279 unit, 23+1skip catalog e2e, lint/tsc/build clean. AC-11: shell + index pages now SSG/ISR (were dynamic); /sillas + [slug] pages remain dynamic due to searchParams only (documented deviation). Deviation 2: invalid-slug 404 renders correct UI but HTTP 200 (Next streaming notFound limitation). Both T3 backlog items resolved+checked off.
Last Updated: 2026-07-12
Notes: Stage 1+2 (PlanResearch) COMPLETE. Artifacts written: tasks/next-ticket.md + tasks/research-report.md.

Classification: Complexity=medium (leaning high), Feature Type=full-feature. Because full-feature, all UI/UX stages run at full depth. Medium complexity → SKIP Stage 11 (Hacker); run 3(UI Design)→4(Dev)→5(Review)→6(Fix)→7(QA)→8(UX)→9(Security)→10(Arch)→12(Verify).

Key T3 decisions locked in the ticket (dev MUST honor):
- Routes (locale-agnostic paths, es-MX unprefixed / en under /en, no next-intl pathnames): /sillas (catalog grid), /categorias + /categorias/[slug], /marcas + /marcas/[slug], /estilos + /estilos/[slug]. Card PDP link -> /producto/[slug] (owned by T4, may 404 until then; do NOT stub).
- Catalog-read strategy (backlog item 1 RESOLVED): read via products_public view (base products NOT granted to anon; view + children ARE — 0005_rls_policies.sql). Embed brands/styles THROUGH the view (FKs forwarded). Fetch product_images, product_variants, product_categories in SEPARATE batched .in(product_id, ids) queries (their FKs target base products, not the view — not embeddable through it). No cost_price_cents ever exposed.
- Static-render fix (backlog item 2 RESOLVED): new src/lib/supabase/public.ts createPublicClient() (plain supabase-js, publishable key, cookie-free, RLS still applies) + getStoreSettingsStatic(); catalog reads wrapped in unstable_cache with per-entity tags (catalog, brand:<slug>, category:<slug>, style:<slug>) + time-based revalidate. layout.tsx swaps getStoreSettings -> cookie-free read. T10 busts via revalidateTag. AC-11 requires next build shows these pages static/ISR, not dynamic.
- Stock: effective stock = sum(variant stock) when variants exist, else product.stock. LOW_STOCK_THRESHOLD=5. Copy: "En stock"/"In stock" (>5), "Solo quedan {n}"/"Only {n} left" (1..5), "Agotado"/"Out of stock" (0).
- Pagination: crawlable numbered ?page=N (real <a>/Link, works JS-off), page 1 canonical without ?page=1, PRODUCTS_PER_PAGE=12. Clamp out-of-range page deterministically.
- Card shows "N colores"/"N colors" count (NOT swatches — swatches are T4).
- No migration / no data-model change (T1 schema is sufficient; effective stock computed in lib, not a DB view).
- i18n: new `catalog` namespace in es-MX.json + en.json; product content stays seeded Spanish (no translation lookup in T3).

Scope guards for dev: NO search box / filter sidebar / sort dropdown (T5). NO PDP (T4). NO homepage hero/featured (T13). NO cart (T6).

ENVIRONMENT: user actively browsing dev server on port 3206 (background) with local Docker Supabase seeded — do NOT kill either; agents use port 3000 for their own servers. Note: playwright.config.ts currently targets port 3000 (flagged by planner, not changed).
