# Pipeline State
Task: T8 — Mercado Pago integration (sandbox)
Tier: full-cycle
Stage: 2 COMPLETE (Plan+Research done) → next Stage 3 (UI Design, ultradesign)
Agent: ultradesign
Last Updated: 2026-07-14
Notes: Stage 1+2 (PlanResearch) COMPLETE. Complexity=HIGH → full-cycle runs ALL 12 stages (incl. Hacker); Security+Arch at full depth. Feature Type=full-feature. Chosen MP surface: Checkout Pro (redirect/preference) — only product confirmed to cover card+OXXO+SPEI+wallet in Mexico, SAQ-A, composes with token-addressed confirmation page. Ticket+research written (tasks/next-ticket.md, tasks/research-report.md). BINDING DESIGN INPUTS honored: R-1 advance_order_status RPC (writes order_status_history), R-3 mp_payment_events unique(mp_payment_id) idempotency spine separate from orders.idempotency_key, R-4 indexes on mp_payment_id/mp_external_reference. KEY FACTS: orders table ALREADY has mp_preference_id/mp_payment_id/mp_external_reference/payment_method cols (nullable, left mutable by immutability trigger); payment_status enum pending|authorized|paid|failed|refunded + order_status already cover T8 (NO new enum values). .env.local has PLACEHOLDER MERCADOPAGO_* vars (correct names). GATES: (1) HUMAN-REVIEW mandatory before merge regardless of verdict — payment code; (2) LIVE-SANDBOX verification BLOCKED-ON-USER — all tests mock MP; OXXO/SPEI approval cannot be simulated in test (use signed synthetic webhooks). CAVEAT for dev: voucher field paths ambiguous — use transaction_details.* (not point_of_interaction), verify vs real sandbox. T7 record: verdict SHIP; human-review gate still OPEN.

=== STANDING GATES ===
- HUMAN-REVIEW GATE (BUILD_PLAN rule 3): payment code (T8) ALWAYS flagged for human review before merge regardless of any SHIP verdict. Same gate is still OPEN for T7 (verdict SHIP, but T7 remains UNCHECKED in BUILD_PLAN.md until the user approves; do not check it off).
- T7 human-review focus list (from ship-decision.md): 0008_checkout.sql create_order SECURITY DEFINER fn; checkout server-action trust boundary (actions.ts); rate-limit.ts best-effort caveat + CHECKOUT_RATE_LIMIT_DISABLED unset in real deploys; money math (order.ts, discount.ts, cart/shipping.ts).

=== ENV CONSTRAINT (checked 2026-07-14) ===
- NO Mercado Pago credentials in .env.local (only Supabase vars). T8 must: wire ALL MP config via env vars (never hardcode; no secret ever NEXT_PUBLIC_), mock the MP API in unit/integration tests, and mark live-sandbox verification BLOCKED-ON-USER (document exact env var names + where to get sandbox creds in dev-done.md). Do not fabricate credentials.

=== T8 DESIGN INPUTS (binding, from T7 Arch review, tasks/architecture-review.md) ===
- R-1: order status transitions MUST go through a new advance_order_status Postgres RPC that also writes order_status_history — never ad-hoc .update({status}). Immutability trigger on orders leaves status/payment_status/mp_* mutable by design.
- R-3: payment idempotency is a SEPARATE spine from orders.idempotency_key (which only covers creation retry). Duplicate MP webhooks / webhook-during-retry need a unique mp_payment_id guard.
- R-4: index mp_payment_id / mp_external_reference in T8's migration (webhook filters by them; currently unindexed).
- TD-1 (cheap, optional): test asserting TS ORDER_NUMBER_PREFIX == RPC 'PP-' literal. TD-2: distributed rate limiter is a pre-launch follow-up. TD-3: RPC errors are classified by string-match (improve if touched).

=== T7 FACTS T8 BUILDS ON ===
- Orders land status=pending_payment, payment_status=pending via create_order RPC (0008_checkout.sql), invoked from the checkout "use server" action with createAdminClient() (RLS denies anon writes to commerce tables; RPC granted to service_role only).
- Confirmation page addressed by unguessable orders.confirmation_token (uuid) at /[locale]/checkout/confirmacion/[token]; order_number (PP-000001…) is display-only and 404s as a URL. confirmationPath(token) in config.
- Integer cents everywhere; DB CHECKs (0003_commerce.sql): total=subtotal+shipping+tax-discount, discount<=subtotal, line_total=unit_price*qty, currency='MXN'. Immutability trigger freezes the financial snapshot after insert (status/payment_status/mp_* stay mutable).
- Per-IP rate limiter on placeOrder (5/min, src/lib/checkout/rate-limit.ts), CHECKOUT_RATE_LIMIT_DISABLED=1 server-only bypass wired into playwright.config.ts.
- BUILD_PLAN T8 scope: card, OXXO, SPEI, MP wallet via sandbox creds from env; pending-payment state for OXXO/SPEI with instructions; webhook endpoint with signature verification + idempotent handling to confirm payments and advance orders; card-decline retry flow; refund execution API used by admin (T12). CRITICAL: payment code requires human review before merge.

=== E2E/ENV INFRA (binding) ===
- LOCAL Docker Supabase only; remote empty/unlinked — apply new migrations locally, never remote push.
- Authoritative e2e: PRODUCTION build (next build + next start), separate NEXT_QA_DIST_DIR, CHECKOUT_RATE_LIMIT_DISABLED=1. E2e that places orders depletes seed stock — reseed before/after; leave DB pristine. After any prod build with NEXT_QA_DIST_DIR: `git checkout -- tsconfig.json` (next build auto-injects dist-dir type globs — leaked once in T7, cleaned by Verify).
- Pre-existing T3/T4 "resolved to 2 elements" PDP flake under full-suite parallel load is documented and NOT a new-task failure.
- Test baseline after T7: unit 924/924, integration 137/137, checkout e2e 24/24, cart e2e 46/46.
