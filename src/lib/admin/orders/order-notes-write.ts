/**
 * Internal-notes write layer (T12 AC-21). Inserts an admin-only note into
 * `order_internal_notes` (0012) via the RLS-bypass admin client. Notes are NEVER
 * in `order_status_history.note` and NEVER emailed. Bounded 1..2000 (matches the
 * DB CHECK). `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import { INTERNAL_NOTE_MAX_LENGTH } from "@/lib/admin/orders/order-constants";

/** Outcome of a note write (never leaks a raw PG error). */
export type NoteWriteResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "too-long" | "not-found" | "write-failed" };

/** Insert an internal note onto an order (newest-first is a read concern). */
export async function addOrderNote(orderId: string, body: string): Promise<NoteWriteResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, reason: "not-found" };
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.length > INTERNAL_NOTE_MAX_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  try {
    const db = createAdminClient();
    const { error } = await db
      .from("order_internal_notes")
      .insert({ order_id: orderId, body: trimmed });
    if (error) {
      console.error(`[admin-orders] note insert failed for ${orderId}: ${error.message}`);
      return { ok: false, reason: "write-failed" };
    }
    return { ok: true };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-orders] note insert threw for ${orderId}: ${message}`);
    return { ok: false, reason: "write-failed" };
  }
}
