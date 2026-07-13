# Pipeline State
Task: T5 — Search, filters & sorting
Tier: full-cycle
Stage: 3
Agent: ultradesign
Complexity: high (all 12 stages run; hacker stage included)
Feature Type: full-feature
Last Updated: 2026-07-13
Notes: Stage 1+2 (PlanResearch) COMPLETE — tasks/next-ticket.md + tasks/research-report.md. Complexity=high (reclassified UP from standard): new DB-side query subsystem + migration, anon-reachable RPC, 15+ files, cross-cutting cache/SEO/search concerns. ALL 12 stages run incl. Stage 11 Hacker.

Key T5 decisions locked in the ticket (dev MUST honor):
- DB strategy: SECURITY INVOKER SQL function search_products(...) via supabase.rpc(), reading ONLY products_public + product_variants + product_categories. EXECUTE granted to anon/authenticated only after REVOKE FROM public. Verified live as anon: RPC returns rows while base products SELECT still 42501; cost_price_cents unreachable. Returns page rows + total_count via COUNT(*) OVER () in one round trip. Variant-color filter via EXISTS; availability via COALESCE(SUM(variant.stock), product.stock) > 0 matching effectiveStock().
- Search: unaccent + pg_trgm extensions (confirmed installable); unaccent(lower(...)) matches ergonomica -> Ergonómica. 80-char query cap + GIN trgm index + LIMIT 12.
- Caching: free-text search NEVER cached (T3 cardinality discipline). Filter/sort-only MAY use bounded canonicalized unstable_cache key (unknown values dropped, price bucketed, canonicalPageKey); default to NOT caching if bounding gets hard. RPC fully parameterized.
- Search UX lives on /sillas (no /buscar route). Faceted pages: noindex,follow + canonical -> clean /sillas.
- Best-selling = sales_count DESC + deterministic tiebreak (stable pre-T7); no-results popular strip uses same order. Availability filter defaults to in-stock.
- PRE-STEP: extract shared read primitives (fail/firstOrSelf/cache wrapper) into read-primitives.ts as behavior-preserving refactor — 660-test suite must stay green.

Open risks: RPC <-> effectiveStock parity (parity test required), 660-suite regression from refactor, PostgREST schema-cache staleness after migration, filter preservation across crawlable pagination hrefs.

Original scope: keyword search; filters: category, brand, style, price range, color, material, availability (default in-stock); sorting: price asc/desc, newest, best-selling, name; no-results page with popular chairs. BUILD_PLAN scope: keyword search; filters: category, brand, style, price range, color, material, availability (default in-stock); sorting: price asc/desc, newest, best-selling, name; no-results page with popular chairs. blocked by: T3 (COMPLETE/SHIPPED). T4 also SHIPPED 2026-07-13.

Carry-over context (from T3/T4 arch reviews — MUST inform the ticket):
- T3 arch review REQUIRED: T5 must build a DB-side filtered query — the T3 view+stitch approach (products_public + batched .in() children) cannot filter by variant color pre-pagination. Indexes needed for filter columns.
- T4 arch review: extract shared read primitives (fail/firstOrSelf/unstable_cache tag boilerplate, duplicated across src/lib/catalog/queries.ts and product-detail.ts) BEFORE T5 mints a third copy. See tasks/clean-code-backlog.md T4 section.
- Cache-key discipline (T3 HIGH finding, T4 upheld): user-controlled input (search text, filter params, sort, page) must be bounded/canonicalized before entering any unstable_cache key — search text especially is unbounded-cardinality; the ticket must decide whether search results are cached at all.
- Existing patterns: products_public view (anon never reads base products; cost_price_cents unreachable), src/lib/supabase/public.ts cookie-free client, canonicalPageKey + MAX_PAGE pagination clamping, PRODUCTS_PER_PAGE=12, crawlable ?page=N links, stock rules (effective stock = sum(variant stock) else product.stock, LOW_STOCK_THRESHOLD=5), catalog + product i18n namespaces in src/messages/.
- "Best-selling" sort: orders/order_items tables exist (T1 schema) but no orders flow yet (T7) — planner must decide the semantics with zero sales data (tie-break/fallback).
- Availability filter default = in-stock per BUILD_PLAN.

Scope guards: NO cart (T6), NO checkout (T7), NO admin (T10/T11), NO Phase 2 (accounts, discount UI).

ENV NOTE: .env.local points at a dead remote Supabase (404s on catalog tables) — all builds/e2e must run against seeded local Docker Supabase (:54321). QA env-gated distDir toggle available in next.config.ts. User may be browsing dev server on port 3206 — never kill it or the Docker containers; agents use port 3000.
