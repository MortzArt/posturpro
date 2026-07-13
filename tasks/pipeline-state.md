# Pipeline State
Task: T5 — Search, filters & sorting
Tier: full-cycle (high — all 12 stages ran, incl. Stage 11 Hacker + a targeted Stage 7b)
Stage: COMPLETE
Agent: — (Stage 12 Verify PASSED → SHIP)
Last Updated: 2026-07-13
Notes: T5 SHIPPED. Verdict SHIP, confidence HIGH, quality 9/10. Verifier re-ran ALL gates fresh (own prod build :3000, seeded local Supabase, no destructive db): lint/tsc clean, build green — /sillas ƒ dynamic, T3 index pages still SSG, T4 PDP still SSG 60 paths (no regressions). 570/570 unit, 110/110 integration, 263/263 e2e + 5 intentional skips = 943/943. 18/18 ACs + 12/12 edges. Live-confirmed: RPC SECURITY INVOKER + grant discipline + cost_price_cents unreachable, accent search parity both locales, stock parity 0 mismatches across 30 products, 6 deterministic sorts, SEO noindex/canonical, QA-BUG-1 regression (0 hidden S: holders — real no-JS browser sees the page), NUL-byte q -> 200, XSS escaped. Every finding across review/QA/UX/security/hacker stages FIXED-and-verified or documented-accepted. See tasks/ship-decision.md.

Pipeline history: 1+2 PlanResearch (high, full-feature) -> 3 UI Design -> 4 Dev (0007_search.sql RPC + read-primitives refactor, 40 files) -> 5 Review (REQUEST CHANGES 7.5/10: 2 crit JS-off + 7 major) -> 6 Fix (16/16 findings; hidden-input mirroring, noscript panel, pesos contract) -> 7 QA (+156 tests -> 938; found QA-BUG-1 perpetual no-JS skeleton) -> 7b targeted fix (deleted loading.tsx + inlined SearchResults — both Suspense layers streamed into JS-only $RC holders) -> 8 UX 9/10 (frozen sheet counts, rapid-toggle clobber) -> 9 Security SECURE-WITH-NOTES ∥ 10 Arch SOUND 8.5/10 (2 dead-by-construction indexes found) -> 11 Hacker (CRITICAL NUL-byte 500 + sort-burst clobber + 320px overflows, all fixed) -> 12 SHIP.

Accepted/known items: 2 LOW security notes (material-array RPC-side guard recommended; postcss transitive moderates); dead GIN/color_hex indexes at seed scale (T5-2/T5-3); double-RPC on page 2+ (T5-4); inline-await TTFB trade-off deliberate for no-JS (T5-6, escape hatch = PPR/cacheComponents); malla/mesh search-scope gap (T5-8: add material_* to RPC keyword WHERE + functional index); skipped review minors m-1/m-2; T4-era accepted deviations.

Backlog: tasks/clean-code-backlog.md T5 section (T5-1..T5-8). Key forward notes: T11 admin saves must revalidateTag("catalog") (filter caches bust via shared tag — verified NOT a gap); T13 homepage reuses listPopularProducts for "popular" only; T6 cart has no coupling from URL-state; T8 must not reuse in-memory patterns for webhook idempotency (T4 note stands); hacker product suggestions logged in tasks/hacker-report.md.

ENV NOTE: .env.local points at a dead remote Supabase — all builds/e2e run against seeded local Docker Supabase (:54321). Dev server restored on :3206 (schema-cache incident resolved via NOTIFY pgrst reload after 0007 migration; if it recurs after future migrations, reload PostgREST). env-gated distDir toggle available in next.config.ts.

Next task when pipeline resumes: T6 — Cart (blocked by T4 ✓, next in top-to-bottom order). T10 — Admin foundation may run in parallel per BUILD_PLAN rule 1. T13 also unblocked (blocked by T2 ✓).
