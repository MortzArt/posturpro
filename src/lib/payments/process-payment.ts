/**
 * The webhook's authoritative payment-processing core (T8 AC-9..AC-15,
 * edges 1/2/3/6/7). Server-only. Separated from the route so it is integration-
 * testable with a MOCKED `Payment.get` and a live local DB.
 *
 * Sequence (called only AFTER the route has verified the signature, AC-8):
 *   1. Fetch the AUTHORITATIVE payment via the MP API (the notification body
 *      carries no status — never trust it, AC-9).
 *   2. Match the order by `external_reference` (= confirmation_token). Unknown →
 *      log + accept (no mutation, AC-11, edge 3).
 *   3. Idempotency spine, keyed per (payment id, mp_status) with claim-then-
 *      finalize (M-1/M-6): CLAIM the (id, status) pair. A finalized prior claim
 *      for the SAME (id, status) → duplicate → no-op (AC-10, edge 1). A status
 *      PROGRESSION (OXXO/SPEI pending → approved; approved → refunded) is a
 *      different status → its own claim → processed (AC-18). An unfinalized claim
 *      (crash between claim and advance) is reclaimable → retried (M-6).
 *   4. Reconcile the amount vs the order total EXACTLY (tolerance 0). Mismatch →
 *      flag, do NOT mark paid (AC-12, edge 7).
 *   5. Map the MP status (AC-14). `flag` statuses (chargeback/mediation/unknown)
 *      → log, no advance (the claim is finalized so we don't reprocess). `advance`
 *      → call `advance_order_status` RPC (idempotent + regression-guarded), then
 *      FINALIZE the claim only on success — so a transient advance failure leaves
 *      the claim unfinalized and MP's retry reprocesses (M-6).
 *
 * Every terminal outcome is a `ProcessResult` the route maps to an HTTP status.
 * The route returns 200 for everything except a genuine internal error (so MP
 * stops retrying on duplicates / unknowns / flags — MP retry semantics, AC-11).
 */
import "server-only";
import type { PaymentResponse } from "mercadopago/dist/clients/payment/commonTypes";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentClient } from "@/lib/payments/mp-client";
import { advanceOrderStatus } from "@/lib/payments/advance-order";
import { mapMpStatus } from "@/lib/payments/payments-status";
import { mpAmountToCents } from "@/lib/payments/money-boundary";
import { resolvePaymentMethod } from "@/lib/payments/config";
import { AMOUNT_RECONCILIATION_TOLERANCE_CENTS } from "@/lib/payments/config";
import { MissingEnvVarError } from "@/lib/env";
import { sendPaymentReceived, sendVoucherInstructions } from "@/lib/email/dispatch";
import { extractVoucher } from "@/lib/payments/order-payment-read";
import { toVoucherData } from "@/lib/email/voucher-data";
import type { PaymentMethodKey } from "@/lib/payments/config";
import type { TransitionKind } from "@/lib/supabase/database.types";

/**
 * The terminal outcome of processing ONE payment notification. `httpOk` tells
 * the route whether to 200 (MP stops retrying) or 500 (MP retries later).
 */
export type ProcessResult =
  | { kind: "processed"; httpOk: true } // advanced or intentionally no-advance
  | { kind: "duplicate"; httpOk: true } // already-seen payment id (AC-10)
  | { kind: "unknown-order"; httpOk: true } // no matching order (AC-11)
  | { kind: "amount-mismatch"; httpOk: true } // discrepancy flagged (AC-12)
  | { kind: "flagged"; httpOk: true } // chargeback/mediation/unknown status
  | { kind: "ignored"; httpOk: true } // non-payment type / missing id
  | { kind: "mp-unavailable"; httpOk: false } // MP env missing / MP down → retry
  | { kind: "advance-blocked"; httpOk: false } // RPC regression/not-found → retry (M-7)
  | { kind: "error"; httpOk: false }; // internal error → MP retries

/** The matched order's fields the core needs to reconcile + advance. */
interface MatchedOrder {
  id: string;
  totalCents: number;
}

/**
 * Process a `type=payment` notification for `dataId` (the MP payment id). Fetches
 * the authoritative payment, dedupes, matches, reconciles, and advances.
 */
export async function processPaymentNotification(
  dataId: string,
  action: string | null,
): Promise<ProcessResult> {
  const trimmed = dataId.trim();
  if (trimmed === "") {
    return { kind: "ignored", httpOk: true };
  }

  // 1. Authoritative fetch — never trust the notification body (AC-9).
  let payment: PaymentResponse;
  try {
    payment = await paymentClient().get({ id: trimmed });
  } catch (caught) {
    if (caught instanceof MissingEnvVarError) {
      console.error(`[payments] webhook: MP not configured: ${caught.variableName}`);
      return { kind: "mp-unavailable", httpOk: false };
    }
    const message = caught instanceof Error ? caught.message : "unknown";
    // A 404 from MP means the payment id isn't real: a test ping, or a query
    // `data.id` that was signed by MP but points at no payment. The signature only
    // authenticates the manifest, not that the id resolves — so a 404 here is
    // expected and NOT an error. Treat as unknown, 200 (MP stops retrying).
    if (isNotFound(caught)) {
      console.warn(`[payments] webhook: payment ${trimmed} not found at MP`);
      return { kind: "unknown-order", httpOk: true };
    }
    console.error(`[payments] webhook: Payment.get failed for ${trimmed}: ${message}`);
    return { kind: "mp-unavailable", httpOk: false };
  }

  const mpPaymentId = String(payment.id ?? trimmed);
  const externalReference = payment.external_reference ?? null;
  const mpStatus = (payment.status ?? "").trim().toLowerCase();

  // 2. Match the order first (needed for the event's order_id FK). Unknown → 200.
  const order = await matchOrder(externalReference);

  // 3. Idempotency spine, per (payment id, mp_status) with claim-then-finalize
  //    (M-1/M-6). A finalized prior claim for THIS (id, status) → duplicate. A
  //    status progression is a distinct status → its own claim → processed.
  const claim = await claimPaymentEvent({
    mpPaymentId,
    mpStatus,
    orderId: order?.id ?? null,
    mpStatusDetail: payment.status_detail ?? null,
    action,
    amountCents: safeAmountCents(payment.transaction_amount),
  });
  if (claim === "duplicate") {
    return { kind: "duplicate", httpOk: true };
  }
  if (claim === "error") {
    return { kind: "error", httpOk: false };
  }

  if (!order) {
    console.warn(
      `[payments] webhook: no order for payment ${mpPaymentId} (ext_ref=${externalReference ?? "none"})`,
    );
    // Finalize the claim: there is nothing to reprocess for an unknown order.
    await finalizePaymentEvent(mpPaymentId, mpStatus);
    return { kind: "unknown-order", httpOk: true };
  }

  const mapping = mapMpStatus(payment.status, payment.status_detail);

  // A flagged status (chargeback / mediation / unknown) never auto-advances.
  if (mapping.kind === "flag") {
    console.warn(`[payments] webhook: ${mapping.reason} (payment ${mpPaymentId}, order ${order.id})`);
    // Finalize: a flag is a terminal decision for this (id, status); no reprocess.
    await finalizePaymentEvent(mpPaymentId, mpStatus);
    return { kind: "flagged", httpOk: true };
  }

  // 4. Amount reconciliation ONLY gates marking an order PAID (AC-12, edge 7).
  //    A pending/failed transition carries no money movement to reconcile.
  if (mapping.paymentStatus === "paid") {
    const paidCents = safeAmountCents(payment.transaction_amount);
    if (paidCents === null || !amountsMatch(paidCents, order.totalCents)) {
      console.error(
        `[payments] webhook: AMOUNT MISMATCH payment ${mpPaymentId} paid=${paidCents ?? "null"}¢ order=${order.totalCents}¢ — NOT marking paid`,
      );
      // Finalize: the discrepancy is flagged; reprocessing won't change the amount.
      await finalizePaymentEvent(mpPaymentId, mpStatus);
      return { kind: "amount-mismatch", httpOk: true };
    }
  }

  // 5. Advance through the RPC (idempotent + regression-guarded, AC-13/AC-15).
  const method = resolvePaymentMethod(payment.payment_type_id, payment.payment_method_id);
  const advance = await advanceOrderStatus({
    p_order_id: order.id,
    p_order_status: mapping.orderStatus, // null for a payment-only change (C-2)
    p_payment_status: mapping.paymentStatus,
    p_payment_method: method,
    p_mp_payment_id: mpPaymentId,
    p_note: mapping.note,
  });
  // A DB/transport error: leave the claim UNFINALIZED so MP's retry reprocesses
  // (M-6). Return 500 → MP retries.
  if (!advance.ok) {
    console.error(`[payments] webhook: advance failed for order ${order.id}: ${advance.error}`);
    return { kind: "error", httpOk: false };
  }
  // Inspect result.reason (M-7): a regression_blocked / order_not_found is NOT a
  // success — it means our state diverged from MP. Leave the claim unfinalized so
  // a retry can converge, and log loudly. `noop_same_status` and `payment_updated`
  // are legitimate idempotent outcomes.
  const reason = advance.result.reason;
  if (reason === "regression_blocked" || reason === "order_not_found") {
    console.error(
      `[payments] webhook: advance no-op '${reason}' for order ${order.id} (payment ${mpPaymentId}, status ${mpStatus}) — state divergence`,
    );
    return { kind: "advance-blocked", httpOk: false };
  }

  // Success → finalize the claim so a true replay of this (id, status) no-ops.
  await finalizePaymentEvent(mpPaymentId, mpStatus);

  // T9: trigger the transactional email for this transition (AC-15/AC-16/AC-18).
  // FULLY ISOLATED — a send failure/throw is caught here and NEVER changes the
  // ProcessResult or the webhook's HTTP status. The route stays email-free
  // (AC-18): the trigger lives HERE, after a successful advance + finalize, so a
  // slow send never blocks the 200 (dispatch bounds the send with a timeout).
  await triggerTransitionEmail({
    orderId: order.id,
    transitionKind: advance.result.transition_kind,
    mpPaymentId,
    method,
    payment,
  });

  return { kind: "processed", httpOk: true };
}

/**
 * Dispatch the email for a successful transition, branching on the STRUCTURED
 * `transition_kind` (never the note text, TD-2). `paid` → payment_received;
 * `payment_pending` + an OXXO/SPEI method WITH voucher data present →
 * voucher_instructions (else logged + skipped, no partial email, AC-16). All
 * other kinds send no customer email (edge 5: flagged/mismatch never reach here).
 * Fully isolated — any throw is caught and swallowed (AC-13).
 */
async function triggerTransitionEmail(args: {
  orderId: string;
  transitionKind: TransitionKind;
  mpPaymentId: string;
  method: PaymentMethodKey | null;
  payment: PaymentResponse;
}): Promise<void> {
  try {
    if (args.transitionKind === "paid") {
      const cents = safeAmountCents(args.payment.transaction_amount) ?? 0;
      await sendPaymentReceived(args.orderId, args.mpPaymentId, cents);
      return;
    }
    if (args.transitionKind === "payment_pending" && isVoucherMethod(args.method)) {
      // Voucher data comes from the SAME authoritative payment the webhook already
      // fetched — no new voucher-persistence schema (the T8 boundary; documented
      // gap). Reuse the T8 extractor; build the email's voucher shape from it.
      const view = extractVoucher(args.payment);
      const paidCents = safeAmountCents(args.payment.transaction_amount);
      const voucher = toVoucherData(view, args.method, paidCents);
      if (!voucher) {
        console.warn(
          `[email] voucher email skipped: no voucher data for order ${args.orderId} (payment ${args.mpPaymentId})`,
        );
        return;
      }
      await sendVoucherInstructions(args.orderId, args.mpPaymentId, voucher);
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(
      `[email] transition trigger threw (ignored): order=${args.orderId} kind=${args.transitionKind} reason=${message}`,
    );
  }
}

/** Whether a resolved method is an OXXO/SPEI voucher rail (type guard). */
function isVoucherMethod(
  method: PaymentMethodKey | null,
): method is Extract<PaymentMethodKey, "oxxo" | "spei"> {
  return method === "oxxo" || method === "spei";
}

/** Match an order by external_reference (= confirmation_token) or preference id. */
async function matchOrder(externalReference: string | null): Promise<MatchedOrder | null> {
  if (!externalReference) {
    return null;
  }
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("orders")
      .select("id, total_cents")
      .eq("mp_external_reference", externalReference)
      .maybeSingle();
    if (error) {
      console.error(`[payments] webhook: order match failed: ${error.message}`);
      return null;
    }
    if (data) {
      return { id: data.id, totalCents: data.total_cents };
    }
    // Fallback: persistPreference sets mp_external_reference = confirmation_token,
    // but if that write lost the race the column may still be null while the MP
    // external_reference IS the confirmation_token. Match by confirmation_token too.
    const byToken = await db
      .from("orders")
      .select("id, total_cents")
      .eq("confirmation_token", externalReference)
      .maybeSingle();
    if (byToken.error || !byToken.data) {
      return null;
    }
    return { id: byToken.data.id, totalCents: byToken.data.total_cents };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] webhook: order match threw: ${message}`);
    return null;
  }
}

/**
 * Claim a (payment id, status) pair for processing via the `record_payment_event`
 * RPC (M-1/M-6). `new` = first claim OR a reclaimable unfinalized prior claim →
 * process; `duplicate` = a FINALIZED prior claim for the SAME (id, status) →
 * no-op (AC-10, edge 1). A status progression is a distinct status → `new`.
 */
async function claimPaymentEvent(event: {
  mpPaymentId: string;
  mpStatus: string;
  orderId: string | null;
  mpStatusDetail: string | null;
  action: string | null;
  amountCents: number | null;
}): Promise<"new" | "duplicate" | "error"> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("record_payment_event", {
      p_mp_payment_id: event.mpPaymentId,
      p_mp_status: event.mpStatus,
      p_order_id: event.orderId,
      p_mp_status_detail: event.mpStatusDetail,
      p_action: event.action,
      p_amount_cents: event.amountCents,
    });
    if (error) {
      console.error(`[payments] webhook: event claim failed: ${error.message}`);
      return "error";
    }
    return data === "duplicate" ? "duplicate" : "new";
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] webhook: event claim threw: ${message}`);
    return "error";
  }
}

/**
 * Finalize a claimed event after a successful terminal decision (M-6). Best-effort
 * and idempotent: a failure here only means the (id, status) may be reprocessed
 * once more (advance is idempotent, so that is safe), never a lost payment. Logged
 * but does not change the caller's outcome.
 */
async function finalizePaymentEvent(mpPaymentId: string, mpStatus: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { error } = await db.rpc("finalize_payment_event", {
      p_mp_payment_id: mpPaymentId,
      p_mp_status: mpStatus,
    });
    if (error) {
      console.warn(`[payments] webhook: event finalize failed (harmless): ${error.message}`);
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.warn(`[payments] webhook: event finalize threw (harmless): ${message}`);
  }
}

/** Exact amount reconciliation (tolerance 0; documented constant, AC-12). */
function amountsMatch(paidCents: number, orderCents: number): boolean {
  return Math.abs(paidCents - orderCents) <= AMOUNT_RECONCILIATION_TOLERANCE_CENTS;
}

/** Convert an MP amount to cents, returning null on absent/invalid (never throws). */
function safeAmountCents(amount: number | undefined | null): number | null {
  if (amount === undefined || amount === null) {
    return null;
  }
  try {
    return mpAmountToCents(amount);
  } catch {
    return null;
  }
}

/** Whether a thrown MP SDK error looks like a 404 (payment id not found). */
function isNotFound(caught: unknown): boolean {
  if (typeof caught !== "object" || caught === null) {
    return false;
  }
  const record = caught as { status?: number; statusCode?: number; message?: string };
  if (record.status === 404 || record.statusCode === 404) {
    return true;
  }
  return typeof record.message === "string" && record.message.includes("404");
}
