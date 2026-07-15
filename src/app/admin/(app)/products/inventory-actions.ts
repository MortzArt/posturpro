"use server";

/**
 * Inventory-adjustment server action (T11 Slice 6). Re-verifies the session,
 * parses via the pure `parseAdjustment`, then calls the atomic RPC. Returns a
 * serializable result the dialog renders (never throws to the client).
 */
import { requireSession } from "@/lib/admin/require-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAdjustment, type AdjustmentFieldError } from "@/lib/admin/inventory/inventory-input";
import { recordAdjustment } from "@/lib/admin/inventory/inventory-write";

/** The serializable adjustment outcome for the dialog. */
export type AdjustActionResult =
  | { ok: true; resultingStock: number }
  | { ok: false; field: "amount" | "reason"; error: AdjustmentFieldError }
  | { ok: false; field: null; error: "write-failed" };

/**
 * Adjust a product/variant's stock. `variantId` null = product-level. The
 * current stock is re-read server-side (never trust the client value) so the
 * negative-result guard uses the authoritative number.
 */
export async function adjustInventory(
  productId: string,
  variantId: string | null,
  mode: string,
  amount: string,
  reason: string,
): Promise<AdjustActionResult> {
  await requireSession();
  const db = createAdminClient();

  const currentStock = await readCurrentStock(db, productId, variantId);
  if (currentStock === null) {
    return { ok: false, field: null, error: "write-failed" };
  }

  const parsed = parseAdjustment({ mode, amount, reason }, currentStock);
  if (!parsed.ok) {
    const field = parsed.fieldErrors.amount ? "amount" : "reason";
    const error = parsed.fieldErrors[field];
    if (error) return { ok: false, field, error };
    return { ok: false, field: null, error: "write-failed" };
  }

  const slug = await readProductSlug(db, productId);
  const result = await recordAdjustment(productId, slug, variantId, parsed.values);
  if (!result.ok) {
    if (result.reason === "negative") {
      return { ok: false, field: "amount", error: "result-negative" };
    }
    return { ok: false, field: null, error: "write-failed" };
  }
  return { ok: true, resultingStock: result.resultingStock };
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** Read the authoritative current stock of the product or variant. */
async function readCurrentStock(
  db: AdminClient,
  productId: string,
  variantId: string | null,
): Promise<number | null> {
  if (variantId) {
    const { data } = await db
      .from("product_variants")
      .select("stock")
      .eq("id", variantId)
      .eq("product_id", productId)
      .maybeSingle();
    return data?.stock ?? null;
  }
  const { data } = await db
    .from("products")
    .select("stock")
    .eq("id", productId)
    .maybeSingle();
  return data?.stock ?? null;
}

/** Read a product's slug (for the cache bust). */
async function readProductSlug(db: AdminClient, productId: string): Promise<string> {
  const { data } = await db.from("products").select("slug").eq("id", productId).maybeSingle();
  return data?.slug ?? "";
}
