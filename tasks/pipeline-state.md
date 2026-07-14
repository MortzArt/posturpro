# Pipeline State
Task: T9 — Transactional emails
Tier: standard
Stage: 3 (Dev) — S2 UI Design SKIPPED (logic-only)
Agent: ultradev
Last Updated: 2026-07-14
Notes: S1 (ultraplanner-research) COMPLETE — tasks/next-ticket.md + tasks/research-report.md written. Complexity: MEDIUM (~12-15 files, one small migration, new src/lib/email/ subsystem on established seams). Feature Type: LOGIC-ONLY — emails have an inbox surface but no in-app UI; S2 UI Design SKIPPED per Feature Type rules; email visual constraints carried into S3 Dev as hard requirements (600px table layout, inline styles only, neutral tokens in one brand.ts, plain-text alt part, MXN via money.ts). PROVIDER: Resend (thin SDK, vi.mock like MP tests, single server-only EMAIL_API_KEY, Node-runtime fit); Postmark documented fallback; provider.ts boundary makes swap one-file. TD-2 DESIGN: transition_kind (fixed text enum) derived INSIDE advance_order_status from (from_status, to_status, payment_status, p_order_status IS NULL) — returned in RPC jsonb AND written to new order_status_history.transition_kind column; emails branch on it, never on free-text note. IDEMPOTENCY: durable email_sends ledger unique(order_id, email_kind, dedupe_key) + claim_email_send RPC (insert-on-conflict-do-nothing → 'new'/'duplicate'), mirroring record_payment_event spine; dedupe_key = mp_payment_id for payment-linked emails, '' for one-per-order; dispatch failure-isolated (send error caught/logged, never changes ProcessResult/CheckoutFormState; triggers fire from process-payment.ts after successful advance, webhook route stays email-free). MIGRATION 0010 also REQUIRED to add orders.locale persisted at checkout (orders has NO locale column, verified vs 0003; webhook is server-to-server — reads locale via getTranslations({locale})). VOUCHER BOUNDARY: T8 does not persist OXXO/SPEI voucher fields (re-fetches from MP on confirmation page) — T9 sends voucher email only where data is present at trigger, documents the gap, does NOT add voucher-persistence schema. STATE CORRECTION: .env.local DOES contain the three MERCADOPAGO_* keys (placeholders) — earlier "no MP creds" note was wrong; no EMAIL_* vars exist, which is what matters for T9.

=== STANDING GATES (carry forward — do not drop) ===
- HUMAN-REVIEW GATE (BUILD_PLAN rule 3): T7 and T8 both have advisory SHIP verdicts but remain UNCHECKED in BUILD_PLAN.md until the user manually reviews. Do not check them off.
- T7 human-review focus: 0008_checkout.sql create_order SECURITY DEFINER fn; checkout server-action trust boundary (actions.ts); rate-limit.ts best-effort caveat + CHECKOUT_RATE_LIMIT_DISABLED unset in real deploys; money math (order.ts, discount.ts, cart/shipping.ts).
- T8 human-review focus (from ship-decision.md): webhook signature verification, amount reconciliation, refund execution, RPC transition/idempotency, secret handling.
- T8 LIVE-SANDBOX verification BLOCKED-ON-USER (no MP creds in .env.local; all tests mock MP).

=== ENV CONSTRAINT ===
- NO email-provider credentials expected in .env.local (only Supabase vars as of 2026-07-14). T9 must wire ALL email config via env vars (never hardcode; no secret ever NEXT_PUBLIC_), mock the provider in unit/integration tests, and mark live-send verification BLOCKED-ON-USER (document exact env var names + where to get creds in dev-done.md). Do not fabricate credentials.

=== T8 FACTS T9 BUILDS ON ===
- advance_order_status RPC (0009) is the ONLY status-transition path; writes order_status_history; payment-only mode (p_order_status=null) sets payment_status=refunded with order_status untouched (from==to in history — hence TD-2).
- Webhook processing: record_payment_event claim-then-finalize spine keyed (mp_payment_id, mp_status); callers branch on result.reason (advanced/payment_updated/noop_same_status = success).
- payment_refunds ledger + record_refund RPC exist; refund.ts is server-only, called nowhere until T12.
- Confirmation page addressed by orders.confirmation_token at /[locale]/checkout/confirmacion/[token]; confirmationPath(token) in config.
- Integer cents everywhere; currency MXN; i18n es-MX + en both locales symmetric.

=== E2E/ENV INFRA (binding) ===
- LOCAL Docker Supabase only; remote empty/unlinked — apply new migrations locally, never remote push.
- Authoritative e2e: PRODUCTION build (next build + next start), separate NEXT_QA_DIST_DIR, CHECKOUT_RATE_LIMIT_DISABLED=1. Reseed between order-placing suites; leave DB pristine. After any prod build with NEXT_QA_DIST_DIR: `git checkout -- tsconfig.json`.
- Test baseline after T8: unit 1206/1206 (60 files), integration 158/158, e2e payment 8/8 + checkout 24/24 + cart 46/46.
