/**
 * Refund write layer (T12 AC-16..20, edges 1/2/6/10). The FIRST caller of the T8
 * `refundOrderPayment` (server-only, money-movement). Its ONLY jobs: thread a
 * STABLE per-action idempotency key (AC-19 — retry-safe at MP, distinct partials
 * do NOT collide) and, on a successful refund, fire `sendRefundIssued` exactly
 * once (deduped on the MP refund id). It NEVER re-implements the cumulative /
 * over-refund guard (that is `record_refund`'s race-safe authority) and NEVER
 * echoes a raw MP error (AC-20) — the typed `RefundResult` maps to a friendly
 * reason. `server-only`.
 */
import "server-only";
import { UUID_PATTERN } from "@/lib/config";
import { refundOrderPayment } from "@/lib/payments/refund";
import { sendRefundIssued } from "@/lib/email/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

/** The friendly, non-raw refund outcome the action returns to the modal. */
export type OrderRefundResult =
  | { ok: true; kind: "full" | "partial"; emailSent: boolean }
  | { ok: false; reason: "over-refund" | "mp-error" | "not-refundable" | "error" };

/**
 * Execute a refund. `amountCents === null` → full; a positive integer → partial.
 * `idempotencyKey` is a STABLE per-action key minted once per user open/submit
 * cycle (retry-safe). On success, reads the newest ledger row to get the MP refund
 * id + amount, then fires `sendRefundIssued` (deduped on that id — repeated
 * partials each email once, AC-18).
 */
export async function refundOrder(
  orderId: string,
  amountCents: number | null,
  idempotencyKey: string,
): Promise<OrderRefundResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, reason: "not-refundable" };
  }

  const result = await refundOrderPayment(orderId, amountCents, idempotencyKey);

  if (result.status === "mp-error") {
    return { ok: false, reason: "mp-error" };
  }
  if (result.status === "error") {
    return { ok: false, reason: "error" };
  }
  if (result.status === "not-refundable") {
    // Map the fine-grained reasons to the two friendly buckets the UI shows.
    if (result.reason === "over-refund") {
      return { ok: false, reason: "over-refund" };
    }
    return { ok: false, reason: "not-refundable" };
  }

  // result.status === "refunded": fire the refund-issued email (deduped on the
  // MP refund id). Read the newest ledger row for the id + amount. A read/email
  // failure does NOT undo the refund (the money moved + the ledger recorded it).
  const emailSent = await fireRefundEmail(orderId);
  return { ok: true, kind: result.kind, emailSent };
}

/**
 * Fire `sendRefundIssued` for the most-recent refund ledger row of this order.
 * Returns whether an email actually went out (false on a read/send failure — the
 * refund itself already succeeded and is not rolled back).
 */
async function fireRefundEmail(orderId: string): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("payment_refunds")
      .select("mp_refund_id, amount_cents")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      if (error) {
        console.error(`[admin-orders] refund ledger read failed for ${orderId}: ${error.message}`);
      }
      return false;
    }
    const result = await sendRefundIssued(orderId, data.mp_refund_id, data.amount_cents);
    return result.ok && result.sent;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-orders] refund email threw for ${orderId}: ${message}`);
    return false;
  }
}
