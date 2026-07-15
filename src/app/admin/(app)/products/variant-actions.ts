"use server";

/**
 * Variant server action (T11 Slice 4). Re-verifies the session, parses the whole
 * variant set (detecting in-file duplicate SKUs), then reconciles the DB set.
 * Returns per-row errors keyed by index so the editor surfaces them inline.
 */
import { requireSession } from "@/lib/admin/require-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseVariantSet, type VariantRawInput, type VariantRowErrors } from "@/lib/admin/products/variant-input";
import { saveVariants } from "@/lib/admin/products/variant-write";

/** Serializable outcome of a variant save. */
export type SaveVariantsResult =
  | { ok: true }
  | { ok: false; rowErrors: Record<number, VariantRowErrors> }
  | { ok: false; writeError: true };

/** Save a product's variants. `rows` is the full desired set from the editor. */
export async function saveVariantsAction(
  productId: string,
  rows: VariantRawInput[],
): Promise<SaveVariantsResult> {
  await requireSession();

  const parsed = parseVariantSet(rows);
  if (!parsed.ok) {
    return { ok: false, rowErrors: parsed.rowErrors };
  }

  const db = createAdminClient();
  const { data } = await db.from("products").select("slug").eq("id", productId).maybeSingle();
  const slug = data?.slug ?? "";

  const result = await saveVariants(productId, slug, parsed.values);
  if (result.ok) return { ok: true };
  if (result.reason === "duplicate-sku") {
    // Map the offending SKU back to its row index for an inline error.
    const index = rows.findIndex((row) => row.sku.trim().toLowerCase() === result.sku.toLowerCase());
    const rowErrors: Record<number, VariantRowErrors> = {};
    if (index !== -1) rowErrors[index] = { sku: "sku-duplicate" };
    return { ok: false, rowErrors };
  }
  return { ok: false, writeError: true };
}
