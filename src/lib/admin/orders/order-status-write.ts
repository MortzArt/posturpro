/**
 * Order status-advance write layer (T12 AC-8/9/10). The ONLY status path is
 * `advanceOrderStatus` (never a raw `.update({status})`). After a successful
 * advance it branches the customer email on the RPC-RETURNED `transition_kind`
 * (never string-matches the note): `shipped` → `sendShipped` (with the persisted
 * tracking), `cancelled` → `sendCancelled`. A `noop` kind fires no email (edge 4).
 * An email-send failure is caught by dispatch and does NOT roll back or block the
 * transition (AC-10, best-effort T9 isolation) — it is surfaced as `emailSent:
 * false` so the UI can show a subtle "correo no enviado" note. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import { advanceOrderStatus } from "@/lib/payments/advance-order";
import { sendShipped, sendCancelled } from "@/lib/email/dispatch";
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

/** Outcome of a status-advance attempt (never throws to the caller). */
export type StatusWriteResult =
  | { ok: true; emailSent: boolean }
  | { ok: false; reason: "regression" | "not-found" | "write-failed" };

interface CurrentOrder {
  paymentStatus: PaymentStatus;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingUrl: string | null;
}

/**
 * Advance an order to `target` and fire the branched email. `note` is the
 * customer-facing history note (NOT an internal note). Reads the current
 * payment_status (required by the RPC) + tracking (for the shipped email) first.
 */
export async function advanceOrderTo(
  orderId: string,
  target: OrderStatus,
  note: string | null,
): Promise<StatusWriteResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, reason: "not-found" };
  }
  const current = await readCurrentOrder(orderId);
  if (!current) {
    return { ok: false, reason: "not-found" };
  }

  // `p_payment_status` is the DESIRED payment state we pass in, NOT a value the
  // RPC trusts as a live read. The RPC is `FOR UPDATE`-locked and re-derives the
  // transition kind under its own lock, so a concurrent payment webhook flipping
  // payment_status between this read and the call cannot corrupt state — do NOT
  // "optimize" this into a TOCTOU assumption that the snapshot is authoritative (m-5).
  const advance = await advanceOrderStatus({
    p_order_id: orderId,
    p_order_status: target,
    p_payment_status: current.paymentStatus,
    p_note: note,
  });
  if (!advance.ok) {
    console.error(`[admin-orders] advance failed for ${orderId}: ${advance.error}`);
    return { ok: false, reason: "write-failed" };
  }
  if (advance.result.reason === "regression_blocked") {
    return { ok: false, reason: "regression" };
  }
  if (advance.result.reason === "order_not_found") {
    return { ok: false, reason: "not-found" };
  }

  // Branch the email ONLY on the RPC-returned transition_kind (single-sourced).
  const emailSent = await fireTransitionEmail(orderId, advance.result.transition_kind, current);
  return { ok: true, emailSent };
}

/** Read the current payment_status + tracking for the advance + shipped email. */
async function readCurrentOrder(orderId: string): Promise<CurrentOrder | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("orders")
      .select("payment_status, tracking_number, tracking_carrier, tracking_url")
      .eq("id", orderId)
      .maybeSingle();
    if (error) {
      console.error(`[admin-orders] current-order read failed for ${orderId}: ${error.message}`);
      return null;
    }
    if (!data) return null;
    return {
      paymentStatus: data.payment_status,
      trackingNumber: data.tracking_number,
      trackingCarrier: data.tracking_carrier,
      trackingUrl: data.tracking_url,
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-orders] current-order read threw for ${orderId}: ${message}`);
    return null;
  }
}

/**
 * Fire the customer email for a transition kind. Returns whether an email was
 * actually sent (false = no template for this kind, OR a send failure — the
 * caller cannot distinguish, which is fine: both mean "no customer email went
 * out" and neither rolls back the transition, AC-10). `shipped` threads the
 * persisted tracking; `cancelled` is normally reached via the Cancel action but
 * is handled here too for completeness.
 */
async function fireTransitionEmail(
  orderId: string,
  kind: string,
  current: CurrentOrder,
): Promise<boolean> {
  if (kind === "shipped") {
    const result = await sendShipped(orderId, {
      trackingNumber: current.trackingNumber,
      carrier: current.trackingCarrier,
      trackingUrl: current.trackingUrl,
    });
    return result.ok && result.sent;
  }
  if (kind === "cancelled") {
    const result = await sendCancelled(orderId, null);
    return result.ok && result.sent;
  }
  // preparing / delivered / paid / noop → no customer template (by design).
  return false;
}
