/**
 * Thin, typed wrapper over the `advance_order_status` RPC (T8 AC-13, R-1).
 * The ONE code path that transitions an order's status / payment fields. Both
 * the webhook and the refund fn call THIS — never a raw `.update({status})`.
 * Server-only (uses the admin/service-role client).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdvanceOrderStatusArgs,
  AdvanceOrderStatusResult,
} from "@/lib/supabase/database.types";

/** The outcome of an advance attempt (typed; never throws to the caller). */
export type AdvanceOutcome =
  | { ok: true; result: AdvanceOrderStatusResult }
  | { ok: false; error: string };

/**
 * Call `advance_order_status`. Returns a typed outcome; a DB error is captured
 * (never thrown) so the webhook can decide its HTTP response deliberately.
 */
export async function advanceOrderStatus(
  args: AdvanceOrderStatusArgs,
): Promise<AdvanceOutcome> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("advance_order_status", args);
    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data) {
      return { ok: false, error: "advance_order_status returned no data" };
    }
    return { ok: true, result: data };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    return { ok: false, error: message };
  }
}
