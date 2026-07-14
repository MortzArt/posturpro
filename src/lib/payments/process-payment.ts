/**
 * The webhook's authoritative payment-processing core (T8 AC-9..AC-15,
 * edges 1/2/3/6/7). Server-only. Separated from the route so it is integration-
 * testable with a MOCKED `Payment.get` and a live local DB.
 *
 * Sequence (called only AFTER the route has verified the signature, AC-8):
 *   1. Fetch the AUTHORITATIVE payment via the MP API (the notification body
 *      carries no status — never trust it, AC-9).
 *   2. Idempotency spine: record the payment id in `mp_payment_events` with an
 *      ON-CONFLICT guard. If it already exists → duplicate → no-op (AC-10, edge 1).
 *   3. Match the order by `external_reference` (= confirmation_token) or the
 *      stored `mp_preference_id`. Unknown → log + accept (no mutation, AC-11, edge 3).
 *   4. Reconcile the amount vs the order total EXACTLY (tolerance 0). Mismatch →
 *      flag, do NOT mark paid (AC-12, edge 7).
 *   5. Map the MP status (AC-14). `flag` statuses (chargeback/mediation/unknown)
 *      → record + log, no advance. `advance` → call `advance_order_status` RPC
 *      (idempotent + regression-guarded, AC-13/AC-15, edge 2).
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
    // A 404 from MP means the payment id isn't real (spoofed data.id after a
    // — impossible — valid signature, or a test ping). Treat as unknown, 200.
    if (isNotFound(caught)) {
      console.warn(`[payments] webhook: payment ${trimmed} not found at MP`);
      return { kind: "unknown-order", httpOk: true };
    }
    console.error(`[payments] webhook: Payment.get failed for ${trimmed}: ${message}`);
    return { kind: "mp-unavailable", httpOk: false };
  }

  const mpPaymentId = String(payment.id ?? trimmed);
  const externalReference = payment.external_reference ?? null;

  // 3. Match the order first (needed for the event's order_id FK). Unknown → 200.
  const order = await matchOrder(externalReference);

  // 2. Idempotency spine: claim the payment id. If it already exists → duplicate.
  const claim = await claimPaymentEvent({
    mpPaymentId,
    orderId: order?.id ?? null,
    mpStatus: payment.status ?? null,
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
    return { kind: "unknown-order", httpOk: true };
  }

  const mapping = mapMpStatus(payment.status, payment.status_detail);

  // A flagged status (chargeback / mediation / unknown) never auto-advances.
  if (mapping.kind === "flag") {
    console.warn(`[payments] webhook: ${mapping.reason} (payment ${mpPaymentId}, order ${order.id})`);
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
      return { kind: "amount-mismatch", httpOk: true };
    }
  }

  // 5. Advance through the RPC (idempotent + regression-guarded, AC-13/AC-15).
  const method = resolvePaymentMethod(payment.payment_type_id, payment.payment_method_id);
  const advance = await advanceOrderStatus({
    p_order_id: order.id,
    p_order_status: mapping.orderStatus,
    p_payment_status: mapping.paymentStatus,
    p_payment_method: method,
    p_mp_payment_id: mpPaymentId,
    p_note: mapping.note,
  });
  if (!advance.ok) {
    console.error(`[payments] webhook: advance failed for order ${order.id}: ${advance.error}`);
    return { kind: "error", httpOk: false };
  }
  return { kind: "processed", httpOk: true };
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
    // Fallback: some orders may have external_reference stored as the raw
    // confirmation_token even if mp_external_reference wasn't persisted yet
    // (persist-preference lost the race). Match by confirmation_token too.
    if (data) {
      return { id: data.id, totalCents: data.total_cents };
    }
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

/** Insert-or-detect the payment event. `new` = first time; `duplicate` = seen. */
async function claimPaymentEvent(event: {
  mpPaymentId: string;
  orderId: string | null;
  mpStatus: string | null;
  mpStatusDetail: string | null;
  action: string | null;
  amountCents: number | null;
}): Promise<"new" | "duplicate" | "error"> {
  try {
    const db = createAdminClient();
    // Guarded insert. A unique-violation (23505) on mp_payment_id means we have
    // already processed this payment id → duplicate → no-op (AC-10, edge 1).
    const { error } = await db.from("mp_payment_events").insert({
      mp_payment_id: event.mpPaymentId,
      order_id: event.orderId,
      mp_status: event.mpStatus,
      mp_status_detail: event.mpStatusDetail,
      action: event.action,
      amount_cents: event.amountCents,
    });
    if (!error) {
      return "new";
    }
    if (error.code === "23505") {
      return "duplicate";
    }
    console.error(`[payments] webhook: event insert failed: ${error.message}`);
    return "error";
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] webhook: event insert threw: ${message}`);
    return "error";
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
