# Pipeline State
Task: T7 — Checkout & order creation
Tier: full-cycle
Stage: 1 (PlanResearch COMPLETE)
Agent: ultradesign (Stage 3 — UI Design) next
Complexity: high (classified this stage)
Feature Type: full-stack
Last Updated: 2026-07-14
Notes:
- Stage 1+2 (PlanResearch) done: tasks/next-ticket.md + tasks/research-report.md written.
- Complexity = HIGH → full-cycle runs ALL 12 stages (do not skip hacker).
- Feature Type = full-stack → every stage at full depth (UI Design + UX both run).
- HUMAN-REVIEW GATE (BUILD_PLAN rule 3): checkout ALWAYS flagged for human review before merge regardless of any SHIP verdict. Verify stage must surface this and NOT auto-merge. Do NOT check [x] T7 in BUILD_PLAN until the user approves.

=== CRITICAL FORWARD FACTS FOR DOWNSTREAM STAGES ===
- WRITE PATH: orders/order_items/customers/discount_codes are FULLY denied to anon in RLS (0005 lines 252-258). Checkout MUST use createAdminClient() (server-only, secret key). No app/api route handlers exist — use a "use server" action (Q&A precedent: producto/[slug]/actions.ts + qa-form-state.ts).
- ATOMICITY: orders+order_items+order_status_history insert AND per-line stock decrement AND sales_count bump MUST be ONE Postgres function (new migration 0008_checkout.sql), invoked via admin.rpc(). Guarded decrement: UPDATE ... SET stock=stock-qty WHERE id=$id AND stock>=qty RETURNING id; zero rows → raise exception → rollback. Handles last-unit race (edge 2).
- DB CHECKS checkout must satisfy exactly (0003_commerce.sql): total=subtotal+shipping+tax-discount; discount<=subtotal; line_total=unit_price*qty; currency='MXN'; order_number NOT NULL UNIQUE; all *_cents>=0. Immutability trigger freezes the snapshot after insert.
- SNAPSHOT NOT AUTHORITATIVE: re-read live product/variant by id (new src/lib/checkout/checkout-read.ts — no getProductById exists yet, only slug-based getProduct). Recompute unit price = variant.price_override_cents ?? product.price_cents. IGNORE cart snapshot price/qty (edge 4).
- effectiveStock() in catalog/stock.ts SUMS variant stock — it is DISPLAY-ONLY. Reservation decrements the SPECIFIC variant (or product row for no-variant lines). Do NOT reserve against the summed value.
- REUSE shipping math (src/lib/cart/shipping.ts: computeShipping/totalCents), formatMXN (money.ts), getStoreSettingsStatic() (page fetch, carrito/page.tsx pattern), useCart() + hydrated gate (cart-provider.tsx).
- store_settings unavailable → computeShipping returns "unavailable" → BLOCK submit (edge 5), never sell with shipping=0.
- Discount FIELD in scope, management UI is Phase 2 (out of scope). Bad code degrades to full price, never blocks (AC-7).
- Tax=0 Phase 1, written to tax_cents/tax_base_cents columns (CFDI Phase 3 needs no rework). RFC optional captured/stored.
- Order lands pending_payment / payment_status pending. NO payment capture (T8).
- SEED additions needed: one zero-stock variant (live oversell e2e) + discount codes (active pct, active fixed, expired, below-min, exhausted) in scripts/seed-data/products.ts + scripts/seed.ts.
- CONFIG additions (0-tunable rule 4): ORDER_NUMBER_PREFIX+format, MEXICAN_CP_PATTERN, MEXICAN_STATES (32), CHECKOUT_CONFIRMATION_PATH/confirmationPath(n), TAX_RATE=0. CHECKOUT_PATH already exists.
- i18n: add "checkout" namespace to BOTH es-MX.json and en.json (Spanish default). No new npm deps (hand-rolled validation, Q&A precedent).
- ENV: LOCAL Docker Supabase only; remote empty/unlinked — apply 0008 locally, never remote push. Run authoritative e2e against production build (next build+start), separate NEXT_QA_DIST_DIR (T6 QA infra note).
