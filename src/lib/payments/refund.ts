/**
 * Server-side refund EXECUTION API (T8 AC-19, AC-20, edges 8/9/10). Called by
 * T12's admin action (NOT exposed as a public endpoint here). Server-only.
 *
 * ⚠️ HUMAN-REVIEW GATE (BUILD_PLAN rule 3): money-movement code. Review before ship.
 *
 * Rules:
 *  - Refuse to refund a payment that is not `paid` (MP refunds ONLY approved
 *    payments; pending/failed are *cancelled* instead) → `not-refundable` (edge 8).
 *  - `amountCents === null` → FULL refund (empty MP body). A positive
 *    `amountCents` → PARTIAL refund. A partial that would exceed the order total
 *    is refused locally before the MP call (edge 9); MP is the second backstop.
 *  - Per-request `X-Idempotency-Key` so a retry of the SAME refund is safe (AC-19).
 *  - Full refund → advance order/payment to `refunded` via the RPC. Partial refund
 *    → payment_status STAYS `paid` (documented rule, AC-19); recorded in history.
 *  - Typed result — NEVER echoes a raw MP error to a caller-facing surface (AC-20).
 *  - On MP failure the order/payment state is UNCHANGED (edge 10).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import { MissingEnvVarError } from "@/lib/env";
import { refundClient } from "@/lib/payments/mp-client";
import { centsToMpAmount } from "@/lib/payments/money-boundary";
import { advanceOrderStatus } from "@/lib/payments/advance-order";

/** The typed outcome of a refund attempt (AC-19, AC-20). */
export type RefundResult =
  | { status: "refunded"; kind: "full" | "partial" }
  | { status: "not-refundable"; reason: "not-paid" | "no-payment-id" | "not-found" | "amount-invalid" }
  | { status: "mp-error" }
  | { status: "error" };

/** The order fields the refund fn needs. */
interface RefundableOrder {
  id: string;
  totalCents: number;
  paymentStatus: string;
  mpPaymentId: string | null;
}

/**
 * Refund an order's payment. `amountCents === null` = full refund; a positive
 * integer = partial. Returns a typed result; never throws to the caller.
 *
 * @param orderId the order's uuid (validated)
 * @param amountCents integer cents to refund, or null for the full amount
 */
export async function refundOrderPayment(
  orderId: string,
  amountCents: number | null,
): Promise<RefundResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { status: "not-refundable", reason: "not-found" };
  }
  if (amountCents !== null && (!Number.isInteger(amountCents) || amountCents <= 0)) {
    return { status: "not-refundable", reason: "amount-invalid" };
  }

  const order = await readRefundableOrder(orderId);
  if (!order) {
    return { status: "not-refundable", reason: "not-found" };
  }
  if (order.paymentStatus !== "paid") {
    // MP can only refund approved payments (edge 8).
    return { status: "not-refundable", reason: "not-paid" };
  }
  if (!order.mpPaymentId) {
    return { status: "not-refundable", reason: "no-payment-id" };
  }
  // A partial that exceeds the order total is refused locally (edge 9).
  if (amountCents !== null && amountCents > order.totalCents) {
    return { status: "not-refundable", reason: "amount-invalid" };
  }

  const isFull = amountCents === null || amountCents === order.totalCents;
  return executeRefund(order, amountCents, isFull);
}

/** Read the order fields required to refund, or null if absent. */
async function readRefundableOrder(orderId: string): Promise<RefundableOrder | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("orders")
      .select("id, total_cents, payment_status, mp_payment_id")
      .eq("id", orderId)
      .maybeSingle();
    if (error) {
      console.error(`[payments] refund: order read failed: ${error.message}`);
      return null;
    }
    if (!data) {
      return null;
    }
    return {
      id: data.id,
      totalCents: data.total_cents,
      paymentStatus: data.payment_status,
      mpPaymentId: data.mp_payment_id,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] refund: order read threw: ${message}`);
    return null;
  }
}

/** Call the MP refund API and, on success, advance state per the full/partial rule. */
async function executeRefund(
  order: RefundableOrder,
  amountCents: number | null,
  isFull: boolean,
): Promise<RefundResult> {
  const paymentId = order.mpPaymentId as string; // guarded by the caller
  try {
    const client = refundClient();
    // A per-refund idempotency key makes retrying the SAME refund safe (AC-19).
    // Keyed by order + amount so a distinct partial isn't collapsed into a prior.
    const idempotencyKey = `refund:${order.id}:${amountCents ?? "full"}`;
    await client.create({
      payment_id: paymentId,
      body: amountCents === null ? undefined : { amount: centsToMpAmount(amountCents) },
      requestOptions: { idempotencyKey },
    });
  } catch (caught) {
    if (caught instanceof MissingEnvVarError) {
      console.error(`[payments] refund: MP not configured: ${caught.variableName}`);
      return { status: "mp-error" };
    }
    // MP down / insufficient balance / over-refund rejected by MP (edge 10, 9).
    // Order/payment state is UNCHANGED. Raw error logged, never echoed (AC-20).
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] refund: MP refund failed for ${paymentId}: ${message}`);
    return { status: "mp-error" };
  }

  // Full refund → payment_status 'refunded' (documented rule, AC-19). A partial
  // refund keeps payment 'paid'; we only record a history note (order unchanged).
  if (isFull) {
    const advance = await advanceOrderStatus({
      p_order_id: order.id,
      p_order_status: "paid", // order lifecycle stays 'paid'; payment marks refunded
      p_payment_status: "refunded",
      p_note: "Full refund issued (T8 refund API)",
    });
    if (!advance.ok) {
      // The MONEY moved but the local state write failed. Log loudly — this is a
      // reconcile-by-hand situation, not a silent swallow. State advancement is
      // idempotent, so a re-run (or the refund webhook) will converge.
      console.error(`[payments] refund: MP refund SUCCEEDED but state advance failed for ${order.id}: ${advance.error}`);
      return { status: "error" };
    }
    return { status: "refunded", kind: "full" };
  }

  // Partial refund (documented rule, AC-19): payment_status STAYS `paid`, the
  // order is NOT marked refunded, and no lifecycle transition occurs — so there
  // is no `advance_order_status` call (its no-op branch deliberately writes no
  // history row). The partial refund's authoritative audit trail is (a) the MP
  // refund record itself and (b) the `mp_payment_events` row written when MP
  // fires the `refunded` webhook for the partial. This is logged here for
  // observability; the admin-facing partial-refund ledger is T12's concern.
  console.info(`[payments] refund: partial refund of ${amountCents}¢ issued for order ${order.id}`);
  return { status: "refunded", kind: "partial" };
}
