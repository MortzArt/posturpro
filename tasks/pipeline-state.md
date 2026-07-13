# Pipeline State
Task: T6 — Cart
Tier: standard
Stage: 1
Agent: ultraplanner-research
Last Updated: 2026-07-14
Notes: Starting standard pipeline for T6 — Cart (persistent guest cart, cart page with quantity edit/remove/line totals, free-shipping progress toward threshold). Blocked-by T4 satisfied. Prior T5 pipeline COMPLETE (SHIPPED).

Carry-over notes from T5 (relevant to T6):
- T6 cart has no coupling from URL-state (verified during T5).
- ENV NOTE: .env.local points at a dead remote Supabase — all builds/e2e run against seeded local Docker Supabase (:54321). Dev server on :3206. If schema cache goes stale after a migration, NOTIFY pgrst reload. env-gated distDir toggle available in next.config.ts.
- Free-shipping threshold lives in store settings (seeded: flat rate MX$500, free threshold MX$10,000) — T6 progress bar must read from store settings, not hardcode.
