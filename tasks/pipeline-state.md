# Pipeline State
Task: T19 — Homepage rebuild from client content page + product condition grades
Tier: full-cycle (high)
Stage: 3
Agent: ultradesign
Last Updated: 2026-08-27
S1+2 COMPLETE: complexity=high, feature-type=full-stack → all 12 stages. Artifacts: tasks/next-ticket.md (25 AC, 14 edges), tasks/research-report.md. Key risks: products_public view drift (migration 0016 must copy 0005 explicit column list + condition_grade only, never select * — cost_price_cents leak), 0015 hosted-grant posture (idempotent, anon select only on view), site-wide token swap cascades beyond homepage (AA contrast on orange CTA), reuse T16 quote flow / no media-notes / keep T13/T14 SEO.
Notes: Starting full cycle. Owner decisions + full spec in tasks/reference/T19-brief.md. Client copy sources: tasks/reference/client-homepage-en.html + client-homepage-es.html. Logos: public/brand/logo.svg + icon.svg. CRITICAL: structure & copy from mockups only — KEEP existing site design language; brand greens #094220/#0f7f3c/#e7f7ed site-wide; ALL primary CTAs #f95326. Grade system (A+/A/B) = new DB migration + admin UI + storefront badges. Prior T14 completion notes preserved in git history (commit 5000d97).
