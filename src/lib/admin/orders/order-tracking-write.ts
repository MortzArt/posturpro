/**
 * Tracking write layer (T12 AC-11/12). Persists the validated tracking columns to
 * the order via the RLS-bypass admin client. Tracking columns are NOT in the 0003
 * immutability trigger's frozen set, so this `.update` succeeds. Never echoes a
 * raw PG error. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import type { TrackingParsed } from "@/lib/admin/orders/order-tracking-input";

/** Outcome of a tracking write (never leaks a raw PG error). */
export type TrackingWriteResult = { ok: true } | { ok: false; reason: "write-failed" | "not-found" };

/** Persist the tracking fields onto the order. */
export async function saveOrderTracking(
  orderId: string,
  values: TrackingParsed,
): Promise<TrackingWriteResult> {
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, reason: "not-found" };
  }
  try {
    const db = createAdminClient();
    const { error } = await db
      .from("orders")
      .update({
        tracking_number: values.trackingNumber,
        tracking_carrier: values.carrier,
        tracking_url: values.trackingUrl,
      })
      .eq("id", orderId);
    if (error) {
      console.error(`[admin-orders] tracking write failed for ${orderId}: ${error.message}`);
      return { ok: false, reason: "write-failed" };
    }
    return { ok: true };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-orders] tracking write threw for ${orderId}: ${message}`);
    return { ok: false, reason: "write-failed" };
  }
}
