/**
 * Order cancel write layer (T12 AC-13/14/15, edges 3/6/11). Calls the NEW
 * transactional `cancel_order` RPC (0012) — a SINGLE SQL transaction that
 * restores stock (skipping since-deleted null FKs), advances to `cancelled`, and
 * writes the history row — NOT the T11 app-level compensation pattern. On a
 * successful cancel (`applied: true`) it fires `sendCancelled` exactly once with
 * the admin-supplied reason (dispatch dedupes on the order + kind). An
 * already-cancelled order is an idempotent no-op that fires NO second email
 * (edge 4-style). Email failure does not roll back the cancel (AC-10, T9
 * isolation). `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import { sendCancelled } from "@/lib/email/dispatch";

/** Outcome of a cancel attempt (never throws to the caller). */
export type CancelWriteResult =
  | { ok: true; emailSent: boolean }
  | { ok: false; reason: "not-found" | "write-failed" };

/**
 * Cancel an order: restore stock + mark cancelled (one transaction) then email.
 * `reason` is the admin-supplied cancellation reason (nullable) — it becomes the
 * history note AND the cancelled email's reason line.
 */
export async function cancelOrder(
  orderId: string,
  reason: string | null,
): Promise<CancelWriteResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, reason: "not-found" };
  }
  const trimmedReason = reason?.trim() ? reason.trim() : null;

  let applied: boolean;
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("cancel_order", {
      p_order_id: orderId,
      p_note: trimmedReason,
    });
    if (error) {
      console.error(`[admin-orders] cancel_order failed for ${orderId}: ${error.message}`);
      return { ok: false, reason: "write-failed" };
    }
    if (!data) {
      return { ok: false, reason: "write-failed" };
    }
    if (data.reason === "order_not_found") {
      return { ok: false, reason: "not-found" };
    }
    applied = data.applied;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-orders] cancel_order threw for ${orderId}: ${message}`);
    return { ok: false, reason: "write-failed" };
  }

  // A no-op (already cancelled) fires no email; a fresh cancel emails once.
  if (!applied) {
    return { ok: true, emailSent: false };
  }
  const email = await sendCancelled(orderId, trimmedReason);
  return { ok: true, emailSent: email.ok && email.sent };
}
