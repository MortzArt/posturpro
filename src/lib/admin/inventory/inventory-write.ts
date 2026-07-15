/**
 * Inventory-adjustment write (T11 Slice 6, AC-25/26). Calls the atomic
 * `record_inventory_adjustment` RPC (stock update + ledger insert in one
 * transaction) via the admin client, then busts `catalog` + `product:<slug>`.
 * Maps a negative-result / not-found RPC error to a friendly enum — never echoes
 * the raw PG error. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bustCatalogTags } from "@/lib/admin/products/cache-tags";
import type { AdjustmentParsed } from "@/lib/admin/inventory/inventory-input";

/** Outcome of an adjustment write. */
export type AdjustmentWriteResult =
  | { ok: true; resultingStock: number }
  | { ok: false; reason: "negative" | "not-found" | "write-failed" };

/** Apply an adjustment to a product/variant and record the ledger row. */
export async function recordAdjustment(
  productId: string,
  productSlug: string,
  variantId: string | null,
  parsed: AdjustmentParsed,
): Promise<AdjustmentWriteResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("record_inventory_adjustment", {
    p_product_id: productId,
    p_variant_id: variantId,
    p_delta: parsed.delta,
    p_absolute: parsed.absolute,
    p_reason: parsed.reason,
  });

  if (error) {
    // The RPC raises `check_violation` for a negative result and `no_data_found`
    // for a missing target; map them, log everything else.
    if (error.code === "23514" || /negative/.test(error.message)) {
      return { ok: false, reason: "negative" };
    }
    if (error.code === "P0002" || /not found/.test(error.message)) {
      return { ok: false, reason: "not-found" };
    }
    console.error(`[inventory-write] adjustment failed: ${error.message}`);
    return { ok: false, reason: "write-failed" };
  }

  bustCatalogTags({ productSlugs: [productSlug] });
  const resultingStock =
    data && typeof data === "object" && "resulting_stock" in data
      ? Number((data as { resulting_stock: number }).resulting_stock)
      : parsed.resultingStock;
  return { ok: true, resultingStock };
}

/** A ledger row for the history view. */
export interface LedgerEntry {
  id: string;
  variantId: string | null;
  delta: number;
  resultingStock: number;
  reason: string;
  createdAt: string;
}

/** Read the adjustment history for a product (most-recent-first). */
export async function listAdjustments(
  productId: string,
  limit = 20,
): Promise<LedgerEntry[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("inventory_adjustments")
    .select("id, variant_id, delta, resulting_stock, reason, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[inventory-write] ledger read failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    variantId: row.variant_id,
    delta: row.delta,
    resultingStock: row.resulting_stock,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
