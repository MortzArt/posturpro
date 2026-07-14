# Architecture Review: T8 — Mercado Pago Integration

> ⚠️ **HUMAN-REVIEW GATE (BUILD_PLAN rule 3) — OPEN.** This is payment /
> trust-boundary code. This architecture review is ADVISORY. An APPROVE here does
> NOT authorize merge. A human must still review signature verification, amount
> reconciliation, refund execution, order-state advancement, and secret handling
> before T8 is checked off. Live-sandbox verification remains BLOCKED-ON-USER (no
> real MP creds; all tests mock MP).

## Summary

This is a genuinely well-architected payment subsystem — arguably the strongest
piece of the codebase. The money boundary is a single audited module, the state
machine has exactly one write path (the RPC), the webhook trust boundary is
fail-closed with claim-then-finalize durability, and the layering (route →
verifier → process-payment → RPCs) has clean, testable choke points. The two
prior-review CRITICALs and eight MAJORs are all genuinely resolved at the
architecture level, not papered over. The remaining concerns are **operational
surfacing** (flagged/mismatched payments log to console with no durable review
queue) and **T9/T12 seams** that are close-but-not-quite ready.

**Overall grade: 9/10 (A).** Payment-code discipline is exemplary. Points held
back for the missing durable "needs-review" surface and a T9-seam gap that is
cheaper to fix now than after T9 is built.

---

## R-Compliance Verdicts (T7 Arch inputs)

| Input | Verdict | Evidence |
|-------|---------|----------|
| **R-1** — `advance_order_status` is the ONLY transition path; no ad-hoc `.update({status})` | ✅ **FULLY HONORED** | Grep of `src/lib/payments`, `src/app/api`, `src/app/[locale]/checkout` finds exactly ONE status-mutating write path — `advance-order.ts` → `advance_order_status` RPC. The only other `.update()` in payment code (`preference.ts:198`) writes `mp_preference_id`/`mp_external_reference` only (non-status mutable columns, correctly documented as NOT a lifecycle transition). RPC writes `order_status_history` atomically, is `SECURITY DEFINER` + empty `search_path` + `service_role`-only execute, regression-guarded via `order_status_rank`. Textbook. |
| **R-3** — payment idempotency is a SEPARATE spine from `orders.idempotency_key` | ✅ **FULLY HONORED (and improved)** | `mp_payment_events` is a distinct table. The Stage-6 re-key from `unique(mp_payment_id)` → `unique(mp_payment_id, mp_status)` was the right call: the original spine would have silently dropped every status progression (OXXO/SPEI pending→approved, refunds, chargebacks). Claim-then-finalize (`processed_at`) adds crash durability the ticket didn't even ask for. |
| **R-4** — index `mp_payment_id` / `mp_external_reference` | ✅ **FULLY HONORED** | `0009` creates both as partial indexes (`where … is not null`) — a smart refinement (only rows with MP ids are indexed; skips the pending-only-created population). Also indexed `mp_payment_events(order_id)`, `(mp_payment_id)`, and `payment_refunds(order_id)`. |

**Follow-through grade on the binding T7 inputs: A+.** All three honored, two
exceeded. The follow-through on the Stage-5 review findings (C-1/C-2/M-1..M-8) is
equally strong — each was spot-checked and is structurally fixed, not suppressed.

---

## Pattern Compliance

| Pattern | Status | Notes |
|---------|--------|-------|
| Separation of concerns | ✅ | `route.ts` (HTTP/DoS/dispatch) → `webhook.ts` (pure crypto) → `process-payment.ts` (orchestration) → `advance-order.ts` (typed RPC wrapper) → RPC (transaction). Each layer independently testable; `webhook.ts`, `payments-status.ts`, `money-boundary.ts` are pure. |
| Boundary validation | ✅ | Signature verified before ANY side effect; body size-capped before read; `data.id` sourcing is query-only for the manifest (C-1); `UUID_PATTERN` guards on token/order-id inputs; authoritative `Payment.get` never trusts the notification body. |
| Typed contracts | ✅ | Every module returns a discriminated union (`ProcessResult`, `RefundResult`, `PreferenceResult`, `PayActionResult`, `StatusMapping`, `AdvanceOutcome`). No raw MP error ever crosses a caller boundary. |
| Service layer (views → services → models) | ✅ | Confirmation page (view) → `order-payment-read.ts` / `pay-actions.ts` (service) → RPC/SDK (model). No business logic in components; UI presentational (`panel-state.ts` derives state purely). |
| Type safety (no `any`, no `!`) | ✅ | Strict throughout. The documented Supabase footgun (Args as `type` alias not `interface`) is correctly applied + commented so nobody "cleans it up." Loose reads (`readVerificationCode`, `point_of_interaction`) narrowed with explicit `typeof` guards, not `any`. |
| Money boundary is ONE module | ✅ | `money-boundary.ts` is genuinely the sole cents↔decimal crossing. Integer/string math, throws on non-integer, round-trip tested. The single most important discipline in the subsystem, done right. |
| Config/constants (rule 4) | ✅ | `config.ts` centralizes every non-secret tunable with a "how to swap" header. Named constants with units (`WEBHOOK_REPLAY_TOLERANCE_MS`, `MAX_WEBHOOK_BODY_BYTES`, `MP_API_TIMEOUT_MS`, `ONE_HOUR_MS`). `AMOUNT_RECONCILIATION_TOLERANCE_CENTS=0` documented as an invariant, not a knob. |

---

## Data Model Review

**Strong.** Three new tables/spines, all correctly scoped:

- `mp_payment_events` — the idempotency spine. `unique(mp_payment_id, mp_status)`
  is the correct grain. `processed_at` (nullable) implements claim-then-finalize.
  FK `order_id … on delete cascade`. RLS enabled, no policies + explicit
  `grant … to service_role` (the 0005 blanket-grant gap for later-created tables
  is correctly understood and re-granted). NULL `mp_status` coalesced to `''` so
  UNIQUE doesn't treat NULLs as distinct — a subtle, correct detail.
- `payment_refunds` — durable append-only ledger, `unique(mp_refund_id)`,
  `amount_cents > 0` check, `is_full` flag. The cumulative over-refund guard
  (`record_refund`) locks the order row and re-checks under the lock — race-safe,
  not just app-level. The correct place to enforce the invariant.
- Indexes — all filter/sort columns covered; partial indexes where appropriate.

**RPC design is the highlight.** `advance_order_status` has three modes
(advance / noop-same-status / payment-only via NULL `p_order_status`), a
regression guard, and atomic history writes — all in one `for update`-locked
transaction. The payment-only mode (C-2 fix) is the correct model for "refund
changes payment state without asserting an order lifecycle position," and it
composes cleanly onto shipped/delivered orders. Reusable by T12 by design.

**One data-model gap (see Tech Debt TD-1):** there is **no durable
"needs-review" state**. `charged_back`, `in_mediation`, unknown statuses, and
amount mismatches are handled by `console.error` + a 200. There is no column,
table, or flag an operator can query to find "payments that need a human." At
Phase-1 volume a log scrape is survivable, but this is a data-model decision that
gets more expensive to retrofit once T12's admin exists. Flagging NOW.

---

## API Review

- **`POST /api/webhooks/mercadopago`** — the repo's first route handler, and a
  good template. Correct HTTP semantics: 401 (no side effect) on bad/missing/
  stale signature; 200 for processed/duplicate/unknown/mismatch/flag (so MP
  stops retrying — correct MP retry-semantics understanding); 500 ONLY for a
  genuine internal/MP-down error (so MP retries and claim-then-finalize
  converges). 413 on oversized body (both declared Content-Length AND
  streamed-bytes cap). `runtime="nodejs"` correctly forced for `crypto`.
  Idempotent by construction.
- **Server actions/functions** (`createPaymentPreference`, `refundOrderPayment`)
  — correctly NOT public REST; `refundOrderPayment` is `server-only` and will be
  called from T12's privileged admin path. Both return discriminated unions and
  never echo raw MP errors.
- **Versioning** — no `v1/` prefix, but this is an inbound MP-defined webhook
  path and internal server actions, not a public API we version. N/A; correct
  not to over-engineer.

---

## Event-Processing Architecture (the crux)

**Durability under crash: SOUND.** Claim-then-finalize is the right pattern.
`record_payment_event` inserts with `processed_at = NULL`; `finalize_payment_event`
sets it only after a successful advance. A crash between claim and advance leaves
the row unfinalized → a re-delivery reclaims it (returns `new`) → reprocesses →
the advance is itself idempotent, so convergence is safe. A transient advance
failure returns 500 with the claim unfinalized → MP retries → converges. I could
not find a stuck-order path.

**One subtle finalize concern (LATER, low):** `finalizePaymentEvent` is
best-effort — if the advance SUCCEEDS but the finalize call fails, the claim
stays unfinalized and MP's next retry reprocesses the same (id,status). The
advance is idempotent so this is safe (correctly reasoned in the code comment),
but it means processing is at-least-once with idempotent effects, not
exactly-once. That is the RIGHT tradeoff for payments; just naming it (TD-9).

**Event log sufficiency for replay/reconstruction: ADEQUATE, not complete.**
`mp_payment_events` records `(mp_payment_id, mp_status, mp_status_detail, action,
amount_cents, processed_at, created_at)` — enough to see WHICH statuses were seen
and when. Combined with `order_status_history` and `payment_refunds`, the money
history is reconstructable. **But:** dropping the `raw` jsonb column (N-5) means
you cannot replay a webhook from stored data — if a mapping bug is found later
you must re-fetch from MP (`Payment.get` is authoritative + idempotent), which is
acceptable, but it's a deliberate "re-fetch, don't replay" stance worth recording.

**Out-of-order / new-MP-status handling: FAILS SAFE.** Unknown statuses → `flag`,
never `paid` (default case in `mapMpStatus`). A stale lower-rank status →
`regression_blocked` (order never regresses). A new MP status PosturPro doesn't
know → flagged + logged + 200, no state change. Exactly the fail-safe posture you
want as MP evolves — a new status can never silently mis-advance an order. The
only cost is a genuinely-new status needs a code change to be actioned, which is
correct (never guess on money).

---

## T9 Readiness (emails) — seam assessment

**Where emails must hook in:** every transition happens inside
`advance_order_status`. T9 needs "on transition X → enqueue email Y" WITHOUT
giving the webhook route email responsibilities.

**Current state: a usable seam exists, but it's not clean enough — fix NOW.**
- The natural seam is `order_status_history`: every transition (and every
  material payment_status change, including payment-only refunds) writes a row.
- **The gap:** `order_status_history` has no structured event/transition-type
  column. It has `from_status`, `to_status`, and a **free-text `note`**
  (`"MP payment approved (accredited)"`, `"Full refund issued (T8 refund API)"`).
  For T9 to decide "payment-received vs refund-issued vs voucher-instructions"
  email, it must either (a) string-match the free-text note (fragile — exactly
  the TD-3 anti-pattern T7 flagged), or (b) infer from status deltas — ambiguous
  for payment-only rows where `from_status == to_status` (a refund and a
  no-op-with-payment-change are structurally identical; only `note` distinguishes).

**NOW recommendation (cheap, high-leverage):** add a structured, enum-like
`transition_kind` / `event_type` written by `advance_order_status` (and/or
returned in the RPC result so the CALLER can enqueue). Values like
`payment_approved | payment_failed | payment_pending | refunded | shipped | …`.
One-column migration + one RPC arg now; after T9 hardcodes note-string matching
it becomes a breaking change across two subsystems. **Do this before T9.**

**Also for T9:** keep the webhook route email-free (it is today). Trigger emails
off the transition record, not inline in `process-payment.ts` — a slow email send
inline would block the webhook 200 and trigger MP retries. Keep the enqueue
asynchronous/decoupled. Design note for T9, not a T8 defect.

---

## T12 Readiness (admin order management) — seam assessment

**Refund execution: READY.** `refundOrderPayment(orderId, amountCents|null)` is
`server-only`, typed, guards non-paid, enforces cumulative over-refund race-safely,
never echoes raw MP errors. T12's admin action can call it directly. It does NOT
carry its own auth context (it trusts its caller) — **correct**, but flag for
T12: it uses `createAdminClient()` / service_role (bypasses RLS), so **T12 MUST
enforce admin authorization before invoking it.**

**Status pipeline UI driving `advance_order_status`: READY.** The RPC is general
(not webhook-specific) and regression-guarded, so T12's "mark preparing / shipped
/ delivered" can call it. `order_status_rank`
(`pending_payment < paid < preparing < shipped < delivered < cancelled`) encodes
the forward pipeline. **One flag:** `cancelled` is rank 5 (highest), so the guard
lets ANY state → cancelled (good) but BLOCKS `cancelled → anything` (a mis-cancel
is unrecoverable via the RPC). T12 should treat cancel as terminal; an "un-cancel"
needs a deliberate override path.

**Packing data: AVAILABLE.** `order_items` (line snapshots), the frozen
shipping/contact snapshot on `orders`, and `order_status_history` all exist. No
admin read-layer yet (correct — T12's job), but the data model supports it.

**Cancel-with-stock-restore (T12) — DOES IT COMPOSE? Mostly, with ONE gap to
flag NOW.**
- The transition side composes: `advance_order_status(…, 'cancelled', …)` works
  from any state.
- **The gap:** T8's RPC does NOT touch stock, and T7's guarded decrement has no
  symmetric guarded-INCREMENT / restore RPC. T12 will need a NEW
  `restore_stock` / `cancel_order_with_restock` RPC that restores inventory AND
  calls the cancel transition **in one transaction** — otherwise a crash between
  restock and cancel double-restores or leaks stock. **Flag NOW:** the
  composition is not free; T12 should build it as a single RPC mirroring the
  `advance_order_status` transactional posture, NOT two sequential app-level
  calls. Also: expired-voucher (edge 5) deliberately does NOT restore stock in T8
  (documented), so abandoned OXXO/SPEI orders leak stock until T12's cancel flow
  or a sweeper reclaims it — worth a T12 line item (scheduled sweep of expired
  pending orders).

---

## Scalability Assessment

| Concern | Severity | Recommendation |
|---------|----------|----------------|
| RPC round-trips per webhook event (claim → [match] → advance → finalize = 3–4 DB calls, each a fresh `createAdminClient()`) | **Low** | Fine at Phase-1 volume. If webhook volume ever spikes, reuse one client per request and/or fold claim+advance+finalize into ONE RPC. Not now. |
| Fresh MP SDK client per call (`new MercadoPagoConfig` in every resource getter) | **Low** | No config reuse; negligible now (SDK is stateless HTTP). Ledger only. |
| `mp_payment_events` / `payment_refunds` / `order_status_history` growth — no retention | **Low→Med (later)** | Append-only ledgers grow unbounded but stay indexed. Fine for years at Phase-1; put retention/archival on the ledger for scale. |
| Preference-creation latency (user-blocking, 8s timeout) | **Low** | Correctly bounded + behind a spinner with friendly-fail. Acceptable. |
| Voucher re-fetch on every pending confirmation-page load (`maybeFetchVoucher`) | **Low** | Extra synchronous MP round-trip per pending-voucher page view; degrades gracefully. Cache voucher on first fetch if page loads get hot (TD-6). |
| Retry storms (MP retries 500s) | **Low** | Well-defended: 200 on all terminal non-error outcomes; claim-then-finalize makes retries idempotent. No amplification. |

**No HIGH scalability concerns.** Nothing blocks ship or breaks at 2x team /
Phase-1 volume.

---

## MP SDK Coupling (swap/upgrade cost)

**Contained, with two thin leaks.** The SDK is instantiated in exactly one module
(`mp-client.ts`). MP-specific SHAPES leak into: `process-payment.ts` and
`order-payment-read.ts` importing `PaymentResponse` from
`mercadopago/dist/clients/payment/commonTypes` (a deep path into package
internals — brittle across majors); the hand-rolled `point_of_interaction` loose
type (SDK type is incomplete); and defensive shape-probing in `extractRefundId`/
voucher extraction. Acceptable for a single-provider Phase-1 store, and the
defensive reads are correct given MP's inconsistent shapes. **Ledger (TD-4):**
re-export the consumed MP types through a local `mp-types.ts` so an SDK major bump
touches one file. Low priority.

---

## Migration Hygiene

`0009_payments.sql` is idempotent (`create … if not exists`, `drop index if
exists`, `add column if not exists`, coalesce-then-not-null re-key) and was
**amended-in-place while LOCAL-only** — fine per project memory (remote is
empty/unlinked). **Flag when this stops being safe (TD-5):** the moment `0009` is
applied to ANY environment you cannot `db reset` (a real remote / shared staging
/ prod), amend-in-place is no longer safe and every further change MUST be a new
numbered migration (`0010_…`). Add this as a standing note in BUILD_PLAN or the
migration header so the first remote push doesn't break the idempotent-re-key
assumption.

**Seed strategy:** T8 did NOT change the seed (`scripts/seed.ts` has no MP data)
— correct; payment events/refunds are runtime artifacts, not seed data. The
dev-done "seed changes" note overstates slightly; no concern.

---

## Tech Debt Ledger (report-only)

| Item | Type | Impact | Effort | Notes |
|------|------|--------|--------|-------|
| **TD-1: No durable "needs-review" surface.** chargeback/mediation/unknown-status/amount-mismatch are `console.error` + 200 only. | Introduced | **Med** | **M** | Add a `payment_review_queue` table or `orders.needs_review` flag written by the flag/mismatch paths. Cheaper before T12's admin exists. Highest-value debt item. |
| **TD-2: `order_status_history` has no structured transition-type.** T9 must string-match free-text `note` or infer from ambiguous status deltas (payment-only rows have `from==to`). | Introduced | **Med** | **S** | Add a typed `transition_kind`/`event_type` column (or RPC return field). **Fix before T9.** |
| **TD-3: No atomic restock+cancel primitive.** T12 cancel-with-restore has no single-transaction RPC; naive two-call composition risks partial-failure stock corruption. | Existing/forward | **Med** | **M** | T12 build item — flagged now so it's designed as one RPC. Also: expired-voucher orders leak stock until cancel/sweep exists. |
| **TD-4: Deep MP SDK type import** (`mercadopago/dist/clients/...`) in 2 modules. | Introduced | **Low** | **S** | Re-export via a local `mp-types.ts`. |
| **TD-5: Amend-in-place migration stops being safe** on first non-resettable environment. | Latent time-bomb | **Med** | **S (process)** | Standing note: after first remote/staging apply, all further changes = new numbered migration. |
| **TD-6: Voucher re-fetched from MP on every pending confirmation-page load.** | Introduced | **Low** | **M** | Cache voucher fields on the order on first fetch if page loads get hot. |
| **TD-7 (carried T7): SDK error 404 sniffed via `message.includes("404")`** in `isNotFound`. | Existing | **Low** | **S** | Acceptable given SDK opacity; improve if the SDK exposes typed status. |
| **TD-8 (carried T7-TD-2): no rate limit on the public webhook.** Body cap mitigates DoS but each bad-signature request still costs an HMAC. | Existing | **Low** | **M** | Pre-launch follow-up. |
| **TD-9: `finalizePaymentEvent` best-effort** → at-least-once (not exactly-once) processing. | Introduced (by design) | **Low** | — | Correct tradeoff (idempotent effects). Documented, not a fix. |

---

## Refactors Applied

**NONE.** This stage is REPORT-ONLY and runs in parallel with Stage 9 (Security),
which may edit code. No source files, `tasks/pipeline-state.md`, or commits were
touched. The only write is this file.

---

## Architecture Score: 9/10

Will this make sense in 6 months with 2x the team? **Yes.** The subsystem reads
like it was designed by someone who has shipped payments before: one money
boundary, one write path, a fail-closed trust boundary, claim-then-finalize
durability, typed unions at every seam, and constants with a swap guide. A new
engineer can trace a payment end-to-end through clearly-named, single-purpose
modules. Points held back for the **missing durable review surface (TD-1)** and
the **T9 transition-type seam (TD-2)** — both cheaper to fix now than after the
consuming features exist, and both structural (data-model / contract), not cosmetic.

## Recommendation: **APPROVE** (with two "fix before next task" items)

APPROVE the architecture. Two items are strongly recommended BEFORE their
consumers are built (not T8 blockers):

1. **Before T9:** add a structured `transition_kind`/`event_type` to the
   transition record (TD-2) so emails don't string-match free-text notes.
2. **Before T12:** add a durable "needs-review" surface (TD-1) and design
   cancel-with-restock as a single atomic RPC (TD-3).

Everything else is ledger material. **The HUMAN-REVIEW GATE remains OPEN** — this
advisory APPROVE does not authorize merge of payment code.
