# Human Review Dossier — T7 (Checkout) + T8 (Mercado Pago)

**Why this exists.** BUILD_PLAN.md rule 3 (line 55): *"Payment (T8) and checkout (T7) changes always get flagged for human review, regardless of pipeline verdicts."* Both tasks completed the full 12-stage pipeline with **advisory SHIP verdicts**:

- **T7** — Stage 12 (`da55ed8`): **SHIP, HIGH confidence, 9/10**. 924 unit + 137 integration + 24 e2e green; 16/16 ACs; the verdict explicitly opened the human-review gate.
- **T8** — Stage 12 (`c77b2d3`): **SHIP (advisory), HIGH confidence, 9/10** — *within the pipeline's mocked-MP scope*. 1442 tests green; 23/23 ACs; two standing gates left open: (1) this human review, (2) live-sandbox validation with real MP credentials.

**What your decision closes.** When you finish Areas 1–6 and are satisfied, you check `[x]` T7 (BUILD_PLAN.md line 27) and `[x]` T8 (line 30) and tell the orchestrator the standing gates are cleared. Until then, both stay `[ ]` regardless of any pipeline output.

## How to use this

Work Areas 1→6 in order (~1–2 h total; Areas 1, 2, 4 are the trust-critical ones). Every claim below carries a file:line reference into the **current working tree** or a git command you can run verbatim. Useful commands:

```bash
git show <sha> --stat                 # what a commit touched
git show <sha> -- <path>              # the diff of one file in that commit
git show <sha>:tasks/<artifact>.md    # read a pipeline artifact as it was at that commit
```

T7 stage commits: `d6cb836` (dev) → `497c432` (review) → `9ed3b05` (fix) → `61b7159` (qa) → `48813c0` (ux) → `1a434a5` (security+arch) → `0708911` (hacker) → `da55ed8` (verify).
T8 stage commits: `1713f6c` (dev) → `c448928` (review) → `5b5f18b` (fix) → `cd8a71c` (qa) → `8b358da` (ux) → `40dd282` (security+arch) → `4474f8b` (hacker) → `c77b2d3` (verify).

---

## Area 1 — Order creation (`create_order`, SECURITY DEFINER)

**Files & entry points**
- `supabase/migrations/0008_checkout.sql` — 281 lines. `create_order(payload jsonb) → jsonb` (lines 96–275): the single-transaction reserve-and-create RPC (idempotency short-circuit → guarded stock decrement → discount redemption → customer/order/items/history inserts).
- Note: `0010_email_transitions.sql` (T9) later `create or replace`d this function to persist `payload->>'locale'` — the **live** definition is 0010's; the checkout core is unchanged from 0008. Diff: `git show bdd37bc -- supabase/migrations/0010_email_transitions.sql`.

**Satisfy yourself of**
- [ ] Idempotency short-circuit (0008:128–139) runs **before** any stock is touched: a repeat `idempotency_key` returns the original order (`reused: true`) — no second decrement, no second insert. Backed by the partial unique index (0008:38–40).
- [ ] Stock decrement is race-safe: `UPDATE … SET stock = stock - qty WHERE id = … AND stock >= qty RETURNING id` (0008:152–162); zero rows → `raise OUT_OF_STOCK` → whole transaction rolls back (0008:164–168). The `stock >= 0` CHECK is the hard floor.
- [ ] Discount redemption is re-asserted inside the transaction (active, window, cap) before incrementing `times_redeemed` (0008:187–199). Known accepted gap: `min_subtotal_cents` is deliberately NOT re-checked here (0008:182–186) — read that comment and confirm you accept it.
- [ ] The confirmation page is addressed by `confirmation_token` (`gen_random_uuid()`, unique, 0008:52–55), never by the enumerable `PP-000123` order number (the T7 review M-6 IDOR fix).
- [ ] Privileges: `SECURITY DEFINER` + `set search_path = ''` (0008:103–104); `revoke all … from public; grant execute … to service_role` (0008:280–281). anon cannot call this.
- [ ] Totals in the payload are trusted by the RPC (0008:233–238, 258–260) — so the real check is that **the action assembles them from live DB prices only** (Area 2/3), with the DB identity CHECKs (`orders_total_identity`, `order_items_line_total_identity`, `orders_discount_within_subtotal` in 0003/0006) as backstop.

**Pipeline verified** (T7 artifacts): arch review graded the RPC pattern **A- (9/10)** — "idempotency short-circuit placed correctly", "guarded UPDATE serializes concurrent decrements" (`git show 1a434a5:tasks/architecture-review.md`). Hacker stage live-proved: last-unit race (qty 99 vs stock 8) → OUT_OF_STOCK, stock unchanged, 0 orders; exhausted code → full rollback; repeat key → `reused:true`, no double-decrement (`git show 0708911:tasks/hacker-report.md`).

**Residual/accepted**: min_subtotal not re-checked at commit (AR-2, accepted, no security consequence); `ORDER_NUMBER_PREFIX` "PP" duplicated in TS + SQL literal (TD-1, non-blocking); tampered duplicate cart lines create two identical `order_items` rows — arithmetically correct, LOW, deferred (hacker bug #2).

## Area 2 — Checkout trust boundary

**Files & entry points**
- `src/app/[locale]/checkout/actions.ts` — 288 lines. `placeOrder` (67–92): the unauthenticated server action; `runCheckout` (95–189): revalidate → rate-limit → shipping → discount → assemble → RPC; `createOrderViaRpc` (235–288): builds the RPC payload from **server-derived values only**.
- `src/lib/checkout/form-parsing.ts` — 221 lines (pure, extracted by clean-code A4). `parseSubmittedLines` (66–94): UUID-gates every product id; `detectPriceDrift` (118–133); `readIdempotencyKey` (174–183): only accepts a UUID, else mints one; `mapThrownError` (186–209): maps raw PG errors to friendly enums.
- `src/lib/checkout/rate-limit.ts` — 55 lines. `checkCheckoutRateLimit` (34–45).

**Satisfy yourself of**
- [ ] The client snapshot is display-only: submitted lines carry only `{productId, variantId, quantity}` (form-parsing:82–91); prices come from `revalidateLines` (live DB re-read, actions:104) and `revalidation.lines` feed the subtotal (136–139) and order lines (153–161). `snapshotPrices` is used **only** to detect drift for the UX banner (112–121), never for math.
- [ ] A non-UUID productId is dropped (form-parsing:86–90) and an emptied cart aborts (actions:82–84) — no zero-line orders.
- [ ] Rate limit runs after validation, before any write (actions:123–132), 5 orders/60s/IP (`src/lib/config/checkout.ts:194,203`). The `CHECKOUT_RATE_LIMIT_DISABLED=1` escape hatch (rate-limit.ts:41–43) is server-only and **must be unset in real deploys** — it exists for the e2e harness.
- [ ] Raw PG errors are never echoed: RPC error re-thrown (actions:277–279) and mapped to `out-of-stock` / `error` enums by `mapThrownError`; only `OUT_OF_STOCK:` / `DISCOUNT_EXHAUSTED` sentinels are parsed (form-parsing:194–208).
- [ ] Shipping-settings unavailable **blocks** submission (actions:144–146) — the action never writes shipping=0 as a fallback.
- [ ] T9's email trigger (actions:177–179, 197–207) is failure-isolated: `Promise.allSettled` + outer catch — a send failure can never flip a placed order to an error state.

**Pipeline verified**: review `497c432` → fix `9ed3b05`: 0 critical in the write path, 6 majors (all a11y/IDOR, all fixed — see `git show 9ed3b05:tasks/review-findings.md`). Security `1a434a5`: **SEC-H-1** (no rate limit on unauthenticated placeOrder → stock griefing / discount burn) found and fixed in that same stage; XSS/injection/ReDoS checklist all pass. Hacker `0708911` found **one real logic bug**: discount lookup used `.ilike()` so `AHORRA_0` (LIKE wildcard) matched the real `AHORRA10` code — fixed to exact `.eq()` on the upper-cased code + 2 regression tests.

**Residual/accepted**: rate limiter is best-effort in-memory, per-instance, IP-keyed (AR-3) — DB atomicity + stock floor are the hard backstops; revisit before horizontal scaling. IP trust model is `x-vercel-forwarded-for` → rightmost XFF → `x-real-ip` → shared "unknown" bucket (`src/lib/request/client-ip.ts`).

## Area 3 — Money math

**Files & entry points** (note: paths are under `src/lib/checkout/` and `src/lib/cart/`, not `src/lib/` directly)
- `src/lib/checkout/order.ts` — 106 lines. `assembleOrder` (61–92): lines→totals satisfying every DB CHECK; `formatOrderNumber` (103–106).
- `src/lib/checkout/discount.ts` — 109 lines. `applyDiscount` (75–109): eligibility chain + clamp; `normalizeDiscountCode` (49–51): trim+uppercase.
- `src/lib/cart/shipping.ts` — 101 lines. `computeShipping` (54–66): flat/free/unavailable from live `store_settings`; `freeShippingProgress` (87–101).

**Satisfy yourself of**
- [ ] Everything is integer cents end-to-end; no floats until the MP boundary (Area 4's `money-boundary.ts`).
- [ ] Discount is clamped twice: `min(raw, subtotal)` in `applyDiscount` (discount.ts:104) and defensively re-clamped `Math.max(0, Math.min(discount, subtotal))` in `assembleOrder` (order.ts:76) — total can never go negative.
- [ ] `totalCents = subtotal + shipping + tax − discount` (order.ts:80–81) matches the `orders_total_identity` DB CHECK exactly; `lineTotalCents = unitPrice × qty` (order.ts:66–69) matches `order_items_line_total_identity`. Tax is 0 in Phase 1, written to both tax columns (order.ts:78–79).
- [ ] Free shipping is inclusive: `subtotal >= threshold` (shipping.ts:62), and unusable settings (`null`/non-integer/negative) → `unavailable` (shipping.ts:59–61), which Area 2 turns into a submit block.
- [ ] Percentage rounding is `Math.round((subtotal * value) / 100)` (discount.ts:56) — confirm you're happy with round-half-up on the discount.

**Pipeline verified**: QA `61b7159` — all 8 edge cases tested (discount > subtotal clamped, threshold boundary, double-submit idempotent, DB CHECK rejection rollback); 153 new tests. Hacker `0708911` live-verified: MX$999,999.99 fixed discount on a MX$500 cart → clamped to MX$500, total ≥ 0; exactly-at-threshold → free; shipping computed on the PRE-discount subtotal (standard e-commerce, deliberate).

**Residual/accepted**: none specific to this area beyond TD-1 (prefix duplication, Area 1).

## Area 4 — Payment core (T8)

**Files & entry points**
- `src/app/api/webhooks/mercadopago/route.ts` — 208 lines. `POST` (46–123): body cap → signature verify → type gate → process. The only public unauthenticated write endpoint.
- `src/lib/payments/webhook.ts` — 199 lines (pure). `verifyWebhookSignature` (127–165), `buildManifest` (105–119), `parseTsMs` (173–179).
- `src/lib/payments/process-payment.ts` — 380 lines. `processPaymentNotification` (70–204): authoritative fetch → match → claim → reconcile → advance → finalize.
- `src/lib/payments/refund.ts` — 304 lines. `refundOrderPayment` (68–118), `executeRefund` (170–250).
- `src/lib/payments/preference.ts` (210) `createPreferenceForOrder` (65); `config.ts` (184) `AMOUNT_RECONCILIATION_TOLERANCE_CENTS = 0` (line 75), `resolvePaymentMethod` (149); `money-boundary.ts` (83) `mpAmountToCents` (66), `centsToMpAmount` (34); `advance-order.ts` (40); `mp-client.ts` (47).
- `supabase/migrations/0009_payments.sql` — 508 lines. `advance_order_status` (200–318), `record_payment_event` (338–386), `finalize_payment_event` (389–403), `record_refund` (421–473), `refunded_total` (481–491). Note: 0010 (T9) later rewrote `advance_order_status` to add a structured `transition_kind` — the live definition is 0010's.

**Satisfy yourself of — signature & trust boundary**
- [ ] Signature is verified **before any DB read or state change** (route:82–97); missing/blank `MERCADOPAGO_WEBHOOK_SECRET` → 401, never process-blind (route:84–87; webhook.ts:130–133).
- [ ] The manifest uses the **query-string** `data.id` only (route:74–78, 91; webhook.ts:48–51) — this was critical bug C-1 (body-id fallback produced false 401s → paid orders stuck). The body id is fetch-fallback only (route:78).
- [ ] Comparison is `crypto.timingSafeEqual` over decoded hex (webhook.ts:188–199), and a verified-but-stale `ts` (>5 min skew, `WEBHOOK_REPLAY_TOLERANCE_MS`, webhook.ts:34) is rejected **after** the HMAC check (webhook.ts:155–163) — replay fix M-4.
- [ ] Body is capped at 64 KB via Content-Length gate + streamed byte counting (route:37, 50–66, 140–166) — DoS fix M-5.

**Satisfy yourself of — reconciliation & idempotency**
- [ ] The notification body's status is never trusted: the payment is re-fetched authoritatively via `paymentClient().get({id})` (process-payment:79–99).
- [ ] Amount reconciliation is **exact** (tolerance 0) and gates only the `paid` transition (process-payment:147–157): mismatch → logged loudly, claim finalized, order NOT marked paid, 200 returned.
- [ ] Idempotency spine: unique on `(mp_payment_id, mp_status)` (0009:81–82) so OXXO/SPEI `pending → approved` progressions each process once while true replays no-op (fix M-1); claim-then-finalize (`record_payment_event` 0009:338–386, `finalizePaymentEvent` called only after a successful advance, process-payment:188) so a crash between claim and advance is retried, not stuck (fix M-6).
- [ ] `advance_order_status` locks the order row (0009:222–225), refuses lifecycle regression via `order_status_rank` (0009:143–157, 267–274) so an out-of-order `pending` webhook never un-pays an order, and has a payment-only mode (`p_order_status = null`, 0009:241–259) so `refunded` works on shipped orders (fix C-2). `regression_blocked`/`order_not_found` are surfaced as 500 → MP retries (process-payment:180–185, fix M-7).

**Satisfy yourself of — refunds & secrets**
- [ ] `refundOrderPayment` refuses non-`paid` (refund.ts:84–87), pre-checks cumulative over-refund (100–111), and the race-safe authority is `record_refund`'s guard under a row lock (0009:460–463). Every refund lands in the `payment_refunds` ledger keyed by MP refund id (0009:107–119).
- [ ] MP `X-Idempotency-Key` is per-attempt (fresh UUID when the caller passes none, refund.ts:113–117) so two distinct same-amount partials never collapse (fix H-1). A ledger/advance failure **after** MP moved money logs "reconcile by hand" and returns error, never silently swallows (refund.ts:212–223, 235–241).
- [ ] The refund module is server-only (`import "server-only"`, refund.ts:25) and **trusts its caller for authorization** — T12's admin action must gate it (arch TD note). No public route reaches it today.
- [ ] Secrets: `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET` are read only via `getMercadoPagoEnv()` (`src/lib/env.ts:130–131`), server-only; nothing MP-related is `NEXT_PUBLIC_` (env.ts:99–104 documents why the public key is deliberately not read).
- [ ] All five 0009 RPCs are SECURITY DEFINER + `set search_path=''` + service_role-only execute (0009:497–508); `mp_payment_events`/`payment_refunds` have RLS enabled with zero anon policies (0009:92–99, 123–124).
- [ ] Preference creation is rate-limited 10/60s/IP (`src/lib/payments/preference-rate-limit.ts`; constants `src/lib/config/checkout.ts:226,235`) — the T8 SEC-H-1 fix.

**Pipeline verified**: review `c448928` was harsh — **REQUEST CHANGES 6.5/10, 2 critical (C-1, C-2), 8 major (M-1..M-8)**; all fixed at `5b5f18b` and each fix regression-locked by QA `cd8a71c` (1409 tests, 23/23 AC, 12/12 edges, 0 new defects found). Security `40dd282`: SECURE, SEC-H-1 fixed, 0 secrets in git, blast-radius analysis of a leaked webhook secret bounded by the authoritative re-fetch + reconciliation + dedupe + replay window. Arch `40dd282`: **A (9/10)** — "arguably the strongest piece of the codebase". Hacker `4474f8b`: chaos 2/10, 4 UI/logic fixes. Verify `c77b2d3`: SHIP advisory, 1442 tests, line-by-line spot-check of every high-risk AC. (One doc gap the verifier itself flagged: `tasks/hacker-report.md` on disk at `4474f8b` still contained T7 content; the actual T8 hacker fixes are in that commit's code + tests.)

**Residual/accepted**: everything in "Live sandbox verification" below is untested against real MP (mocked in the pipeline); no durable "needs-review" surface — chargebacks/mediation/amount-mismatch are console-log-only until T12 (arch TD-1); finalize is at-least-once by design (a lost finalize means one safe idempotent reprocess, TD-9); SEC-L-1: attacker-influenced payment id logged plaintext post-HMAC (accepted, low); MP SDK error 404 detection is message-sniffed (TD-7). Webhook email semantics (T9): the `email_sends` ledger + isolated dispatch give **at-most-once** customer emails — a crashed send is skipped, not retried.

## Area 5 — Later diffs on the flagged files

The T7/T8 surfaces were touched twice after their SHIP verdicts. Review these diffs so your sign-off covers the code as it exists **today**:

- [ ] **`bdd37bc` (T9 dev — transactional emails).** Touched `src/app/[locale]/checkout/actions.ts` (+69: email triggers in step 9, `getLocale()` persisted into the RPC payload) and `src/lib/payments/process-payment.ts` (+70: `triggerTransitionEmail`, lines 195–248 today), plus `supabase/migrations/0010_email_transitions.sql` (rewrites `advance_order_status` with `transition_kind`, `create_order` with `locale`, adds `email_sends`). Verify the email paths are genuinely non-blocking/failure-isolated and that 0010's RPC rewrites preserve the 0008/0009 security posture (DEFINER, empty search_path, service_role-only).
  `git show bdd37bc -- 'src/app/[locale]/checkout/actions.ts' src/lib/payments/process-payment.ts supabase/migrations/0010_email_transitions.sql`
- [ ] **`6c19265` (T9 review+fix).** Correction to the task briefing: this commit did **not** touch the checkout action or process-payment — it only fixed href attribute escaping in `src/lib/email/layout.ts` (finding M-1) + tests, and updated task artifacts. Skim it to confirm.
  `git show 6c19265 -- src/lib/email/layout.ts`
- [ ] **`89d5afe` (clean-code A4).** Refactor of the checkout trust boundary: `actions.ts` 512→288 lines, 11 pure helpers + 2 constants moved verbatim into `src/lib/checkout/form-parsing.ts`; both local `clientIp` copies deleted in favor of the canonical `src/lib/request/client-ip.ts` (closes SEC-M-1 from the T8 audit). Commit message states behavior-identical verification (tsc 0, unit 1281/1281, integration 180/180, checkout e2e 24/24 on prod build). Spot-check the diff is a pure move (no logic edits) and that the shared clientIp keeps the same header precedence.
  `git show 89d5afe -- 'src/app/[locale]/checkout/actions.ts' src/lib/checkout/form-parsing.ts`

## Area 6 — Advisory: admin auth core

Not part of T7/T8, but T12 will drive **refunds** through this auth layer (and `refundOrderPayment` explicitly trusts its caller), so a light pass now is cheap. Built in T10 (verdict `c486235`: SHIP 9/10; security `25f5429`: 0 crit/high).

**Files & entry points**
- `src/lib/admin/session.ts` — 98 lines. `isSessionValid` (80–98): the authoritative HMAC-SHA256 + expiry verify (node:crypto); `createSessionCookieValue` (56–63).
- `src/lib/admin/session-edge.ts` — 116 lines. `isSessionValidEdge` (84–116): Web-Crypto preliminary check for middleware only.
- `src/lib/admin/auth.ts` — 191 lines. `verifyCredentials` (121–138): scrypt verify with timing-parity dummy hash (43, 134); `assertAdminPasswordHashFormat` (162–180): dev fail-fast for dotenv `$`-mangled hashes.
- `src/middleware.ts` — 82 lines. `handleAdmin` (54–73): `/admin/*` branch runs before next-intl; matcher (80–82).

**Satisfy yourself of**
- [ ] The middleware/edge check is explicitly **not** the trust boundary — the authoritative `isSessionValid` re-runs in the admin layout and every server action (session-edge.ts:10–14); a matcher bypass is therefore still protected. Note the matcher excludes `api/` — fine, since the MP webhook must stay public.
- [ ] Both verifiers fail closed on a missing/blank `ADMIN_SESSION_SECRET` — edge returns false (session-edge:88–91), node **throws** `MissingEnvVarError` (deliberate asymmetry documented at session.ts:71–78) which every caller maps to unauthenticated.
- [ ] Signature comparisons are constant-time (session.ts:39–49; session-edge:66–75); expiry checked after signature.
- [ ] Unknown email still burns a full scrypt derivation against a dummy hash (auth.ts:114–117, 130–137) — no user-enumeration timing signal; an unparseable stored hash can never verify (falls back to dummy, 133–134).

**Residual/accepted** (from T10 audit `25f5429`): 3 documented medium residuals incl. best-effort in-memory login rate limit (`src/lib/admin/login-rate-limit.ts`) — same per-instance caveat as checkout.

## Live sandbox verification (blocked-on-user)

The pipeline mocked every MP call. Before real launch, run this against a Mercado Pago **sandbox/test** account (this is the second standing gate from `c77b2d3`):

1. **Set env vars** in `.env.local` (currently placeholders; `.env*` is gitignored):
   - `MERCADOPAGO_ACCESS_TOKEN` — test access token (server-only secret; env.ts:130)
   - `MERCADOPAGO_WEBHOOK_SECRET` — the webhook signing secret from the MP dashboard (env.ts:131)
   - `NEXT_PUBLIC_SITE_URL` — optional base-URL override for back_urls/notification URL (`src/lib/payments/urls.ts`); needed when tunneling (e.g. ngrok) so MP can reach `/api/webhooks/mercadopago`
   - Leave `CHECKOUT_RATE_LIMIT_DISABLED` **unset**.
2. **Run the 4 flows** (place an order at `/checkout`, then pay from the confirmation page):
   - **Card approved** — MP test card; expect redirect back + webhook → order `paid`.
   - **OXXO / SPEI pending → approved** — pick a voucher method; expect `pending_payment` + voucher instructions, then simulate approval and expect the second webhook to advance to `paid`. This also confirms the voucher field paths (`transaction_details.*` vs `point_of_interaction.*`) and real `payment_type_id` values — both explicitly unverifiable without live MP.
   - **Decline → retry** — a declined test card; expect order stays `pending_payment`, retry on the same order succeeds, no regression.
   - **Refund** — full + a partial via `refundOrderPayment` (script or wait for T12 UI); expect full → `payment_status='refunded'`, partial → stays `paid` with a ledger row; a second over-limit partial refused.
3. **Observe in the DB** (local Docker Supabase — exact table names from 0008/0009/0010):
   - `orders` — `status`, `payment_status`, `payment_method`, `mp_payment_id`, `mp_external_reference`
   - `mp_payment_events` — one row per (payment id, status), `processed_at` set after each successful advance
   - `payment_refunds` — one row per refund, cumulative sum ≤ `total_cents`
   - `order_status_history` — one audit row per transition, with `transition_kind`
   - Also confirm: a replayed webhook (resend from MP dashboard) returns 200 `duplicate` with no state change, and a request with a garbage `x-signature` gets 401 with no DB rows.
4. **Optional — T9 email live send**: set `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_OWNER_ADDRESS` (Resend; env.ts:176–178). Without a key, or with `EMAIL_DEV_PREVIEW=1`, sends are logged previews only (provider.ts:12–15). Check the `email_sends` ledger (0010) for exactly-once rows per (order, kind).

## Sign-off

**If satisfied**: edit `BUILD_PLAN.md` — check `[x]` T7 (line 27) and `[x]` T8 (line 30) — and tell the orchestrator the rule-3 human-review gates for T7/T8 are cleared (live-sandbox items can be cleared separately once run). The pipeline may then treat both as complete.

**If something bothers you**: don't check the boxes. Note the finding (file:line + what's wrong or unclear) in this file or directly to the orchestrator, and it will run a targeted fix cycle (`/quick` for a point fix, `/from review` for a broader re-review) with your note as the ticket. Your review, not the pipeline's verdict, is the release authority for these two tasks.
