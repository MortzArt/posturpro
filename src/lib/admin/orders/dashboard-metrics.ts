/**
 * Admin dashboard metrics (T12 AC-25). LIVE counts via the admin client for the
 * overview cards. The new-order count = orders still in `pending_payment` OR
 * `paid` (i.e. awaiting fulfilment — not yet advanced to preparing/shipped/…).
 * This is a live derived count (no persisted "last viewed" marker needed, so
 * AC-26's "persisted, not per-request" constraint is trivially met — there is no
 * marker). `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEW_ORDER_STATUSES } from "@/lib/admin/orders/order-list-filters";

/** The dashboard overview counts. */
export interface DashboardMetrics {
  newOrderCount: number;
  productCount: number;
}

/** Count orders awaiting fulfilment (pending_payment or paid). 0 on error. */
export async function countNewOrders(): Promise<number> {
  try {
    const db = createAdminClient();
    const { count, error } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      // SINGLE-SOURCED with the `?new=1` list filter (order-list-filters.ts) so
      // the dashboard count and the list it links to are one definition (M-4).
      .in("status", NEW_ORDER_STATUSES);
    if (error) {
      console.error(`[admin-dashboard] new-order count failed: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-dashboard] new-order count threw: ${message}`);
    return 0;
  }
}

/** Count all products (for the catalog overview card). 0 on error. */
export async function countProducts(): Promise<number> {
  try {
    const db = createAdminClient();
    const { count, error } = await db.from("products").select("id", { count: "exact", head: true });
    if (error) {
      console.error(`[admin-dashboard] product count failed: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-dashboard] product count threw: ${message}`);
    return 0;
  }
}

/** Read the dashboard metrics (both counts in parallel). */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [newOrderCount, productCount] = await Promise.all([countNewOrders(), countProducts()]);
  return { newOrderCount, productCount };
}
