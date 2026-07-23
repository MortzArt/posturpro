# Pipeline State
Task: T11 — Admin: product management
Tier: full-cycle (high)
Stage: COMPLETE — T11 checked off in BUILD_PLAN.md (SHIP 9/10, 2026-07-15)
Agent: none (pipeline done)
Last Updated: 2026-07-23
Notes: T10 and T11 SHIPPED 2026-07-15. 2026-07-23: owner human review passed Phases 1–4 → T7 CHECKED OFF; T8 held only by the live MP sandbox test (Phase 5, needs owner's MERCADOPAGO_* test keys). Next unchecked buildable task: T13 (static pages, unblocked, independent). T12 (blocked by T8) stays blocked until T8's Phase 5 runs or the owner defers it per Phase 7. Also shipped 2026-07-23 (outside pipeline, ad-hoc fixes): cart locale-switch wipe fix, post-order catalog cache bust, cart sold-out badges, discount Apply pre-check (commits 4867a0e..a61d9f5).

=== T11 COMPLETE — SHIP (Stage 12, quality 9/10, confidence HIGH, 2026-07-15) ===
- Pipeline: full-cycle HIGH, all 12 stages. S5 review 8/10 → S6 all 9 majors fixed+locked; S7 QA PASS HIGH (AC 35/35); S8 UX 9/10 (critical keyboard-tree fix); S9 SECURE (0 crit/high); S10 arch APPROVE 9/10; S11 hacker found+fixed int4-overflow (CRITICAL-class), variant double-submit, CSV blank-row bug — chaos score 2/10.
- Final verified (Stage 12, independent): tsc 0, eslint clean, build exit 0, unit 1469/1469 (87 files), integration 219/219 (19 files), e2e prod storefront chromium 39/39 + admin guard 20/20, e2e dev serial admin-products 46/46 + chaos 4/4 + admin core 30/30. GRAND TOTAL 427/427. Storage stop/start/reset cycle verified; migrations 0001..0011 clean; prod bundle 0 admin symbols.
- WHAT EXISTS NOW: full admin product management under /admin (products list w/ URL-synced filters+pagination, full product form, image manager [Supabase storage, magic-byte validation, pointer+keyboard reorder, cover], inline variant editor, taxonomy manager [nestable category tree, full ARIA APG keyboard pattern], inventory ledger + atomic record_inventory_adjustment RPC (0011), Q&A inbox, CSV import [RFC-4180 hand-rolled, dry-run stepper, per-row atomicity] + guarded export route). [storage] enabled in local config (analytics/edge stay OFF). Types hand-authored in types/ (repo convention). INT4_MAX guard at shared parser boundary. next.config protocol derived from NEXT_PUBLIC_SUPABASE_URL (http local only).
- T12 TEMPLATES (arch-verified): order list should adopt lib/admin/products/{list-query,list-filters}.ts + pagination.ts VERBATIM; writes = paired *-input.ts/*-write.ts; every action requireSession() first; cache namespaces catalog vs orders disjoint by construction; vitest.integration.config.ts has server-only→no-op alias for testing real write modules.

=== T12 GATES (binding — from T10+T11 security/arch; land BEFORE/DURING T12) ===
- SEC-M-1/ADR-2 REVOCATION: stateless admin sessions have NO server-side revocation (≤8h stolen-cookie window). MUST add session-version check (payload v field reserved) or shorten max-age BEFORE refund-capable T12 sessions.
- /api/admin/* is NOT middleware-guarded (matcher excludes /api) — T12 route handlers must self-call session check at entry (T11 export route is the template; currently NO /api/admin/* handlers exist).
- T12 cancel_order stock-restore = transactional SQL RPC per create_order (0008) precedent — NOT the T11 compensation pattern.
- T12 order-form contract goes in lib/admin/orders/ (avoid T11's type-only lib→app inversion).
- Wire T9 email seams: shipped/cancelled/refund_issued templates + send functions exist tested NOT live-wired; refund.ts (T8) server-only, called nowhere until T12 auth-gates it. Emails branch on order_status_history.transition_kind — never string-match note text.
- advance_order_status RPC (0009) is the ONLY status-transition path; payment-only mode (p_order_status=null) for refunds. record_refund RPC + payment_refunds ledger exist.

=== BACKLOG (non-blocking, tracked) ===
- SEC-T11-M-1: extend UUID_PATTERN guard uniformly to all client-supplied entity ids (currently parameterized .eq only — safe, single-owner).
- Mobile gotoPDP e2e harness strict-mode flaw (tasks/clean-code-backlog.md) — ~8 pre-existing Pixel-7 failures, not a product bug.
- ADR-1 compensation→create_product_with_links RPC at multi-admin trigger (Phase 2); closes CSV/product-write ~120-line DRY seam.
- CI should gate client-bundle secret scan on prod build (SEC low).
- 5 product-improvement suggestions in tasks/hacker-report.md (feed future tickets).

=== STANDING GATES (carry forward — do not drop) ===
- HUMAN-REVIEW GATE UPDATE (2026-07-23): owner completed action-plan Phases 1–4 (setup, happy-path purchase, cheat spot-checks: oversell, discount abuse, discount math, token tampering, double-submit) — ALL PASSED. T7 gate CLOSED → T7 checked off in BUILD_PLAN. T8 stays UNCHECKED: sole remaining gate is the live MP sandbox test (action-plan Phase 5), blocked-on-user (placeholder MERCADOPAGO_* keys in .env.local). Owner may alternatively declare Phase 5 "consciously scheduled before go-live" (Phase 7 wording) to close T8 early — their call, do not assume.
- T8 remaining focus when keys arrive: 4 live flows (approved card, OXXO/SPEI pending→paid, declined card, refund [defer to T12 button]) + replayed-webhook rejection.
- T9 checkout/payment diffs (bdd37bc, 6c19265) + clean-code A4 commit were included in the reviewed scope.
- T9 LIVE-SEND blocked-on-user: no EMAIL_* vars in .env.local (EMAIL_API_KEY/Resend, EMAIL_FROM_ADDRESS, EMAIL_OWNER_ADDRESS, NEXT_PUBLIC_SITE_ORIGIN; dev EMAIL_DEV_PREVIEW=1).
- ADVISORY: user may want to eyeball the admin auth core (src/lib/admin/{session,session-edge,auth}.ts + middleware /admin branch) — 0 crit/high across two dedicated security stages, but it IS the trust boundary.
- T13 seam (from T9): contact_relay template + send function exist, NOT live-wired — wire from contact form.

=== ADMIN FACTS (stable) ===
- Auth: HMAC-SHA256 HttpOnly cookie Path=/admin, es-MX only, locale-free /admin tree, defense-in-depth (Edge middleware verify → (app) layout node:crypto verify → per-action requireSession). Dev creds: admin@posturpro.mx / posturpro-dev-2026. ADMIN_PASSWORD_HASH in .env*: every $ MUST be backslash-escaped (dotenv-expansion P1; dev-only format guard fails fast; hash-gen snippet in T10 dev-done emits pre-escaped).
- New admin sections = flag-flip in src/lib/admin/constants.ts + route dirs under src/app/admin/(app)/.
- Integer cents/MXN; storefront i18n es-MX+en symmetric; admin es-MX only.

=== E2E/ENV INFRA (binding) ===
- LOCAL Docker Supabase only; remote empty/unlinked — never remote push. Migrations 0001..0011; next is 0012. [storage] ON, [analytics]/[edge_runtime] OFF.
- Authoritative storefront e2e: PROD build, seed BEFORE build (reseed → rebuild; stale dist cache serves dead variant UUIDs → order e2e stuck at /checkout with 0 orders — NOT a Server-Action bug), NEXT_QA_DIST_DIR, CHECKOUT_RATE_LIMIT_DISABLED=1, `git checkout -- tsconfig.json` after.
- Authed admin e2e: DEV server (next start forces Secure cookie, rejected over plain HTTP — correct behavior), FRESH server + FRESH seed, serial --workers=1, ADMIN_LOGIN_RATE_LIMIT_DISABLED=1. Unauth-guard tests run on prod build.
- KNOWN FLAKES (pre-existing): mobile gotoPDP strict-mode (backlog); cross-project stock-depletion race (run per-project, reseed between); payment-panel unit flake (passes isolated); 2 moderate postcss advisories (transitive via next); admin first-run stale-cache on REUSED dev servers (fresh-server rule avoids).
- Test baseline after T11: unit 1469/1469 (87 files), integration 219/219 (19 files), e2e storefront chromium 39/39 prod + admin guard 20/20 prod + admin 30/30 + admin-products 46/46 + chaos 4/4 (dev serial). DB pristine = 30 seed products, 0 orders/ledger/storage-objects/questions.
- caffeinate still running from interactive session; port 3000 clear; no dev server running.
