# Pipeline State
Task: T1 — Data foundation
Tier: full-cycle
Stage: 2
Agent: ultradesign (Stage 3 — UI Design) — but note Feature Type = backend-only, so UI Design + UX run lightweight/skip; next substantive stage is ultradev (Stage 4)
Last Updated: 2026-07-12
Notes: PlanResearch complete. Ticket + research report written. Complexity classified HIGH (new subsystem, 18 tables, RLS trust model, 15+ files). Feature Type = backend-only (no UI surface) → Security (9) + Arch (10) run FULL depth; UI Design (3) + UX (8) lightweight/skip. Key decisions: Supabase via @supabase/ssr (App Router); NEW-format keys already in .env.local (sb_publishable_/sb_secret_) — publishable=client, secret=server-only via `import "server-only"`; money stored as integer cents (formatMXN boundary); guest orders are server-only (no anon RLS read, tokenized tracking deferred to Phase 2); migrations via Supabase CLI in supabase/migrations/; generated database.types.ts committed; store_settings seeded MX$500 flat / MX$10,000 free-ship as integer cents; all placeholder values centralized in src/lib/config.ts. Scope guard: discount_codes table-only, no account auth, no page-editing UI, i18n structure only.
