/**
 * Product deep-copy (T11 Slice 6, AC-27). Creates a new draft product with a
 * unique slug (`-copia`) + SKU, copied variants (new unique SKUs), copied image
 * rows referencing the SAME storage URLs (no file copy in Phase 1 — documented),
 * copied M2M category/tag links. Split from `product-write.ts` (SRP + line cap).
 * `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bustCatalogTags } from "@/lib/admin/products/cache-tags";
import { duplicateSlug, duplicateSku } from "@/lib/admin/products/slug";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

/** Result of a duplicate: the new product id, or a friendly failure reason. */
export type DuplicateResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-found" | "write-failed" };

/**
 * Deep-copy a product. Returns the new product id so the caller redirects to its
 * edit page. On any child-copy failure the just-inserted product is rolled back
 * so no orphaned half-state remains.
 */
export async function duplicateProduct(sourceId: string): Promise<DuplicateResult> {
  const db = createAdminClient();
  const source = await readSourceForCopy(db, sourceId);
  if (!source) return { ok: false, reason: "not-found" };

  const [takenSlugs, takenSkus] = await Promise.all([readSlugs(db), readAllSkus(db)]);

  const insert: ProductInsert = {
    ...source.product,
    slug: duplicateSlug(source.product.slug, takenSlugs),
    sku: duplicateSku(source.product.sku, takenSkus),
    status: "draft",
    sales_count: 0,
  };
  const { data: created, error } = await db
    .from("products")
    .insert(insert)
    .select("id")
    .single();
  if (error) {
    console.error(`[product-duplicate] insert failed: ${error.message}`);
    return { ok: false, reason: "write-failed" };
  }

  const copyError = await copyChildren(db, source, created.id, takenSkus);
  if (copyError) {
    await db.from("products").delete().eq("id", created.id);
    console.error(`[product-duplicate] children failed, rolled back: ${copyError}`);
    return { ok: false, reason: "write-failed" };
  }
  bustCatalogTags({ productSlugs: [insert.slug] });
  return { ok: true, id: created.id };
}

interface SourceForCopy {
  product: ProductInsert & { slug: string; sku: string };
  variants: {
    sku: string;
    color_name: string;
    color_hex: string;
    price_override_cents: number | null;
    stock: number;
    sort_order: number;
  }[];
  images: { url: string; alt_text: string | null; sort_order: number; is_primary: boolean }[];
  categoryIds: string[];
  tagIds: string[];
}

/** Read the source product + children needed to build a deep copy. */
async function readSourceForCopy(
  db: AdminClient,
  sourceId: string,
): Promise<SourceForCopy | null> {
  const { data: product, error } = await db
    .from("products")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !product) return null;

  const [variants, images, categories, tags] = await Promise.all([
    db
      .from("product_variants")
      .select("sku, color_name, color_hex, price_override_cents, stock, sort_order")
      .eq("product_id", sourceId),
    db
      .from("product_images")
      .select("url, alt_text, sort_order, is_primary")
      .eq("product_id", sourceId),
    db.from("product_categories").select("category_id").eq("product_id", sourceId),
    db.from("product_tags").select("tag_id").eq("product_id", sourceId),
  ]);

  const { id: _id, created_at: _created, updated_at: _updated, ...productInsert } = product;
  void _id;
  void _created;
  void _updated;
  return {
    product: productInsert as SourceForCopy["product"],
    variants: variants.data ?? [],
    images: images.data ?? [],
    categoryIds: (categories.data ?? []).map((row) => row.category_id),
    tagIds: (tags.data ?? []).map((row) => row.tag_id),
  };
}

/** Copy variants (new SKUs), images (shared URLs), and M2M links onto the copy. */
async function copyChildren(
  db: AdminClient,
  source: SourceForCopy,
  newId: string,
  takenSkus: Set<string>,
): Promise<string | null> {
  const variantError = await copyVariants(db, source.variants, newId, takenSkus);
  if (variantError) return variantError;
  if (source.images.length > 0) {
    const rows = source.images.map((image) => ({ ...image, product_id: newId }));
    const { error } = await db.from("product_images").insert(rows);
    if (error) return error.message;
  }
  return copyLinks(db, source, newId);
}

/** Insert copied variant rows with freshly de-duped SKUs. */
async function copyVariants(
  db: AdminClient,
  variants: SourceForCopy["variants"],
  newId: string,
  takenSkus: Set<string>,
): Promise<string | null> {
  if (variants.length === 0) return null;
  const rows = variants.map((variant) => {
    const sku = duplicateSku(variant.sku, takenSkus);
    takenSkus.add(sku);
    return { ...variant, sku, product_id: newId };
  });
  const { error } = await db.from("product_variants").insert(rows);
  return error ? error.message : null;
}

/** Copy the M2M category + tag links. */
async function copyLinks(
  db: AdminClient,
  source: SourceForCopy,
  newId: string,
): Promise<string | null> {
  if (source.categoryIds.length > 0) {
    const rows = source.categoryIds.map((categoryId) => ({
      product_id: newId,
      category_id: categoryId,
    }));
    const { error } = await db.from("product_categories").insert(rows);
    if (error) return error.message;
  }
  if (source.tagIds.length > 0) {
    const rows = source.tagIds.map((tagId) => ({ product_id: newId, tag_id: tagId }));
    const { error } = await db.from("product_tags").insert(rows);
    if (error) return error.message;
  }
  return null;
}

/** Read all existing product slugs (for de-duping the copy slug). */
async function readSlugs(db: AdminClient): Promise<Set<string>> {
  const { data, error } = await db.from("products").select("slug");
  if (error) {
    console.error(`[product-duplicate] slug read failed: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.slug));
}

/** Read all product + variant SKUs (SKUs are unique across both). */
async function readAllSkus(db: AdminClient): Promise<Set<string>> {
  const [products, variants] = await Promise.all([
    db.from("products").select("sku"),
    db.from("product_variants").select("sku"),
  ]);
  const skus = new Set<string>();
  for (const row of products.data ?? []) skus.add(row.sku);
  for (const row of variants.data ?? []) skus.add(row.sku);
  return skus;
}
