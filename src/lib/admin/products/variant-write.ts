/**
 * Variant write layer (T11 Slice 4, AC-18/20). Reconciles a product's variant
 * set (upsert existing + insert new + delete removed) via the admin client,
 * maps a duplicate-SKU `23505` to a row error, and busts the product tags.
 * `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bustCatalogTags } from "@/lib/admin/products/cache-tags";
import type { VariantParsed } from "@/lib/admin/products/variant-input";

type AdminClient = ReturnType<typeof createAdminClient>;

const UNIQUE_VIOLATION = "23505";

/** Outcome of a variant-set write. */
export type VariantWriteResult =
  | { ok: true }
  | { ok: false; reason: "duplicate-sku"; sku: string }
  | { ok: false; reason: "write-failed" };

/**
 * Save the desired variant set for a product: delete rows no longer present,
 * update existing rows, insert new ones. A duplicate SKU (`23505`) maps to a
 * friendly row error naming the SKU. Busts `catalog` + `product:<slug>`.
 */
export async function saveVariants(
  productId: string,
  productSlug: string,
  variants: VariantParsed[],
): Promise<VariantWriteResult> {
  const db = createAdminClient();

  const deleteError = await deleteRemovedVariants(db, productId, variants);
  if (deleteError) return { ok: false, reason: "write-failed" };

  for (const variant of variants) {
    const result = variant.id
      ? await updateVariant(db, productId, variant)
      : await insertVariant(db, productId, variant);
    if (!result.ok) return result;
  }

  bustCatalogTags({ productSlugs: [productSlug] });
  return { ok: true };
}

/** Delete variants that are no longer in the desired set. */
async function deleteRemovedVariants(
  db: AdminClient,
  productId: string,
  variants: VariantParsed[],
): Promise<string | null> {
  const keepIds = variants.map((variant) => variant.id).filter((id): id is string => id !== null);
  const query = db.from("product_variants").delete().eq("product_id", productId);
  const { error } = keepIds.length > 0 ? await query.not("id", "in", `(${keepIds.join(",")})`) : await query;
  return error ? error.message : null;
}

/** Update an existing variant row. */
async function updateVariant(
  db: AdminClient,
  productId: string,
  variant: VariantParsed,
): Promise<VariantWriteResult> {
  const { id, ...columns } = variant;
  const { error } = await db
    .from("product_variants")
    .update(columns)
    .eq("id", id as string)
    .eq("product_id", productId);
  return mapVariantError(error, variant.sku);
}

/** Insert a new variant row. */
async function insertVariant(
  db: AdminClient,
  productId: string,
  variant: VariantParsed,
): Promise<VariantWriteResult> {
  const { id: _id, ...columns } = variant;
  void _id;
  const { error } = await db.from("product_variants").insert({ ...columns, product_id: productId });
  return mapVariantError(error, variant.sku);
}

/** Map a PG error onto the friendly variant-write enum. */
function mapVariantError(
  error: { code?: string; message: string } | null,
  sku: string,
): VariantWriteResult {
  if (!error) return { ok: true };
  if (error.code === UNIQUE_VIOLATION) {
    return { ok: false, reason: "duplicate-sku", sku };
  }
  console.error(`[variant-write] failed: ${error.message}`);
  return { ok: false, reason: "write-failed" };
}

/** Read a product's variant targets for the inventory dialog on the edit page. */
export async function readVariantTargets(
  productId: string,
): Promise<{ variantId: string; label: string; stock: number }[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("product_variants")
    .select("id, color_name, stock")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`[variant-write] targets failed: ${error.message}`);
  return (data ?? []).map((row) => ({ variantId: row.id, label: row.color_name, stock: row.stock }));
}
