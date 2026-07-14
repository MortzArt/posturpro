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
 *    `amountCents` → PARTIAL refund. A partial (or a further partial) that would
 *    push the CUMULATIVE refunded total over the order total is refused (edge 9):
 *    an early local pre-check plus the race-safe `record_refund` SQL guard (the
 *    authority); MP is the third backstop.
 *  - Per-request `X-Idempotency-Key` so a retry of the SAME refund is safe (AC-19).
 *  - EVERY successful refund (full AND partial) is recorded durably in the
 *    `payment_refunds` ledger keyed by the MP refund id (M-3) — the audit trail
 *    and the cumulative-guard source of truth.
 *  - Full refund → payment_status `refunded` via the RPC (payment-only, writes a
 *    history row, C-2). Partial refund → payment_status STAYS `paid` (AC-19), but
 *    the ledger row is the durable record.
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
  | { status: "not-refundable"; reason: "not-paid" | "no-payment-id" | "not-found" | "amount-invalid" | "over-refund" }
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
  // A single refund that exceeds the order total is refused locally (edge 9).
  if (amountCents !== null && amountCents > order.totalCents) {
    return { status: "not-refundable", reason: "amount-invalid" };
  }

  // Cumulative over-refund pre-check (edge 9, M-2): sum of prior refunds plus this
  // one must not exceed the order total. This is a friendly EARLY reject; the
  // race-safe authority is the `record_refund` SQL guard (which locks the order
  // and re-checks under the lock). A full refund's amount is the remaining balance.
  const priorRefunded = await readRefundedTotal(order.id);
  if (priorRefunded === null) {
    return { status: "error" };
  }
  const remainingCents = order.totalCents - priorRefunded;
  if (remainingCents <= 0) {
    return { status: "not-refundable", reason: "over-refund" };
  }
  const refundCents = amountCents ?? remainingCents;
  if (refundCents > remainingCents) {
    return { status: "not-refundable", reason: "over-refund" };
  }

  const isFull = amountCents === null || refundCents === remainingCents;
  return executeRefund(order, refundCents, isFull);
}

/** Read the cumulative refunded cents for an order; null on a DB error. */
async function readRefundedTotal(orderId: string): Promise<number | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("refunded_total", { p_order_id: orderId });
    if (error) {
      console.error(`[payments] refund: refunded_total failed: ${error.message}`);
      return null;
    }
    return typeof data === "number" ? data : 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] refund: refunded_total threw: ${message}`);
    return null;
  }
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

/**
 * Call the MP refund API and, on success, RECORD it durably (M-3), enforce the
 * race-safe cumulative guard (M-2), then advance state per the full/partial rule.
 */
async function executeRefund(
  order: RefundableOrder,
  refundCents: number,
  isFull: boolean,
): Promise<RefundResult> {
  const paymentId = order.mpPaymentId as string; // guarded by the caller

  let mpRefundId: string;
  try {
    const client = refundClient();
    // A per-refund idempotency key makes retrying the SAME refund safe (AC-19).
    // Keyed by order + amount so a distinct partial isn't collapsed into a prior.
    const idempotencyKey = `refund:${order.id}:${isFull ? "full" : refundCents}`;
    const refund = await client.create({
      payment_id: paymentId,
      body: isFull ? undefined : { amount: centsToMpAmount(refundCents) },
      requestOptions: { idempotencyKey },
    });
    mpRefundId = extractRefundId(refund, idempotencyKey);
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

  // Record the refund durably + enforce the race-safe cumulative guard (M-2/M-3).
  // Keyed by the MP refund id, so a retry of the SAME refund is a no-op. If the
  // guard rejects (a concurrent refund raced past the pre-check), the money DID
  // move at MP — log loudly for hand reconciliation, never silently swallow.
  const ledger = await recordRefund({
    orderId: order.id,
    mpPaymentId: paymentId,
    mpRefundId,
    amountCents: refundCents,
    isFull,
  });
  if (ledger === "error") {
    console.error(
      `[payments] refund: MP refund ${mpRefundId} SUCCEEDED but ledger write failed for ${order.id} — reconcile by hand`,
    );
    return { status: "error" };
  }
  if (ledger === "over-refund") {
    console.error(
      `[payments] refund: MP refund ${mpRefundId} SUCCEEDED but exceeds the order total for ${order.id} — reconcile by hand`,
    );
    return { status: "error" };
  }

  // Full refund → payment_status 'refunded' via the RPC's PAYMENT-ONLY mode
  // (p_order_status null): it writes an audit history row without touching the
  // order lifecycle, and works even on an advanced (shipped) order (C-2, m-1).
  if (isFull) {
    const advance = await advanceOrderStatus({
      p_order_id: order.id,
      p_order_status: null, // payment-only: mark refunded, keep order lifecycle
      p_payment_status: "refunded",
      p_note: "Full refund issued (T8 refund API)",
    });
    if (!advance.ok) {
      // The MONEY moved + the ledger recorded it, but the state write failed. Log
      // loudly — reconcile-by-hand, not a silent swallow. The advance is
      // idempotent, so a re-run (or the refunded webhook) converges.
      console.error(`[payments] refund: MP refund SUCCEEDED but state advance failed for ${order.id}: ${advance.error}`);
      return { status: "error" };
    }
    return { status: "refunded", kind: "full" };
  }

  // Partial refund (documented rule, AC-19): payment_status STAYS `paid`, the
  // order is NOT marked refunded. The durable audit trail is the `payment_refunds`
  // ledger row written above (M-3) — no longer dependent on the refunded webhook.
  console.info(`[payments] refund: partial refund of ${refundCents}¢ recorded for order ${order.id} (refund ${mpRefundId})`);
  return { status: "refunded", kind: "partial" };
}

/**
 * Record a refund in the durable ledger via the `record_refund` RPC (M-2/M-3).
 * `recorded`/`duplicate` → ok; `over_refund`/`order_not_found` → over-refund;
 * a DB error → error.
 */
async function recordRefund(refund: {
  orderId: string;
  mpPaymentId: string;
  mpRefundId: string;
  amountCents: number;
  isFull: boolean;
}): Promise<"ok" | "over-refund" | "error"> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("record_refund", {
      p_order_id: refund.orderId,
      p_mp_payment_id: refund.mpPaymentId,
      p_mp_refund_id: refund.mpRefundId,
      p_amount_cents: refund.amountCents,
      p_is_full: refund.isFull,
    });
    if (error) {
      console.error(`[payments] refund: record_refund failed: ${error.message}`);
      return "error";
    }
    if (!data || !data.ok) {
      return "over-refund";
    }
    return "ok";
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] refund: record_refund threw: ${message}`);
    return "error";
  }
}

/**
 * Extract the MP refund id from the `PaymentRefund.create` response. MP returns a
 * numeric `id`; fall back to the idempotency key (a stable per-refund identifier)
 * if the shape is unexpected, so the ledger always has a unique, retry-stable key.
 */
function extractRefundId(refund: unknown, fallback: string): string {
  if (typeof refund === "object" && refund !== null) {
    const id = (refund as { id?: string | number }).id;
    if (typeof id === "string" && id.trim() !== "") {
      return id.trim();
    }
    if (typeof id === "number" && Number.isFinite(id)) {
      return String(id);
    }
  }
  return fallback;
}
