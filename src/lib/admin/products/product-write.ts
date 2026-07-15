/**
 * Product write layer (T11 Slice 2/6, AC-11/12). Create / update / duplicate /
 * delete a product (+ its M2M category/tag links) via the RLS-bypass admin
 * client, following the `updateStoreSettings` template: mutate, map a raw PG
 * error to a friendly enum (never echo it), then bust the touched cache tags via
 * the shared `cache-tags.ts` helper. A unique violation (`23505`) on slug/SKU is
 * mapped to a per-field error, never a 500. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bustCatalogTags } from "@/lib/admin/products/cache-tags";
import { slugify } from "@/lib/admin/products/slug";
import type { ProductParsed } from "@/lib/admin/products/product-input";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/** Which unique field a `23505` hit (drives the field-level error). */
export type DuplicateField = "slug" | "sku" | null;

/** Outcome of a product write (never leaks a raw PG error). */
export type ProductWriteResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; reason: "duplicate"; field: "slug" | "sku" }
  | { ok: false; reason: "write-failed" };

/** Extract which unique column a `23505` error names (slug vs sku). */
function duplicateFieldFrom(message: string): DuplicateField {
  if (message.includes("slug")) return "slug";
  if (message.includes("sku")) return "sku";
  return null;
}

/** Create a product row + its M2M links; bust tags. */
export async function createProduct(
  values: ProductParsed,
  categoryIds: string[],
  tagNames: string[],
): Promise<ProductWriteResult> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("products")
    .insert(values)
    .select("id, slug")
    .single();

  if (error) return mapWriteError(error, "create");
  const productId = data.id;

  const linkError = await syncLinks(db, productId, categoryIds, tagNames);
  if (linkError) {
    // Roll back the just-inserted product so no orphaned half-state remains.
    await db.from("products").delete().eq("id", productId);
    console.error(`[product-write] link sync failed, rolled back: ${linkError}`);
    return { ok: false, reason: "write-failed" };
  }

  await bustForProduct(db, data.slug, values, categoryIds);
  return { ok: true, id: productId, slug: data.slug };
}

/** Update a product in place + re-sync M2M links; bust tags (old + new slug). */
export async function updateProduct(
  productId: string,
  previousSlug: string,
  values: ProductParsed,
  categoryIds: string[],
  tagNames: string[],
): Promise<ProductWriteResult> {
  const db = createAdminClient();
  const { error } = await db.from("products").update(values).eq("id", productId);
  if (error) return mapWriteError(error, "update");

  const linkError = await syncLinks(db, productId, categoryIds, tagNames);
  if (linkError) {
    console.error(`[product-write] link sync failed on update: ${linkError}`);
    return { ok: false, reason: "write-failed" };
  }

  const slugs = previousSlug === values.slug ? [values.slug] : [previousSlug, values.slug];
  await bustForProduct(db, slugs, values, categoryIds);
  return { ok: true, id: productId, slug: values.slug };
}

/** Set a product's status (archive/restore) and bust tags. */
export async function setProductStatus(
  productId: string,
  status: "draft" | "active" | "archived",
): Promise<ProductWriteResult> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("products")
    .update({ status })
    .eq("id", productId)
    .select("slug")
    .single();
  if (error) return mapWriteError(error, "status");
  bustCatalogTags({ productSlugs: [data.slug] });
  return { ok: true, id: productId, slug: data.slug };
}

/** Delete a product (cascades variants/images/M2M) and bust tags. */
export async function deleteProduct(productId: string): Promise<ProductWriteResult> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("products")
    .delete()
    .eq("id", productId)
    .select("slug")
    .single();
  if (error) return mapWriteError(error, "delete");
  bustCatalogTags({ productSlugs: [data.slug] });
  return { ok: true, id: productId, slug: data.slug };
}

/** Map a raw PG error onto the friendly write-result enum (logs the cause). */
function mapWriteError(
  error: { code?: string; message: string },
  op: string,
): ProductWriteResult {
  if (error.code === UNIQUE_VIOLATION) {
    const field = duplicateFieldFrom(error.message);
    if (field) return { ok: false, reason: "duplicate", field };
  }
  console.error(`[product-write] ${op} failed: ${error.message}`);
  return { ok: false, reason: "write-failed" };
}

/** Replace a product's category + tag links to match the desired sets. */
async function syncLinks(
  db: AdminClient,
  productId: string,
  categoryIds: string[],
  tagNames: string[],
): Promise<string | null> {
  const categoryError = await syncCategories(db, productId, categoryIds);
  if (categoryError) return categoryError;
  return syncTags(db, productId, tagNames);
}

/** Replace product_categories rows for a product. */
async function syncCategories(
  db: AdminClient,
  productId: string,
  categoryIds: string[],
): Promise<string | null> {
  const { error: delError } = await db
    .from("product_categories")
    .delete()
    .eq("product_id", productId);
  if (delError) return delError.message;
  if (categoryIds.length === 0) return null;
  const rows = categoryIds.map((categoryId) => ({ product_id: productId, category_id: categoryId }));
  const { error } = await db.from("product_categories").insert(rows);
  return error ? error.message : null;
}

/** Resolve tag names to ids (create missing), then replace product_tags rows. */
async function syncTags(
  db: AdminClient,
  productId: string,
  tagNames: string[],
): Promise<string | null> {
  const { error: delError } = await db
    .from("product_tags")
    .delete()
    .eq("product_id", productId);
  if (delError) return delError.message;
  if (tagNames.length === 0) return null;

  const tagIds = await resolveTagIds(db, tagNames);
  if (tagIds === null) return "tag resolution failed";
  const rows = tagIds.map((tagId) => ({ product_id: productId, tag_id: tagId }));
  const { error } = await db.from("product_tags").insert(rows);
  return error ? error.message : null;
}

/** Upsert tags by slug and return their ids (create-on-first-use). */
async function resolveTagIds(db: AdminClient, tagNames: string[]): Promise<string[] | null> {
  const rows = tagNames
    .map((name) => ({ slug: slugify(name), name: name.trim() }))
    .filter((row) => row.slug !== "");
  if (rows.length === 0) return [];
  const { data, error } = await db
    .from("tags")
    .upsert(rows, { onConflict: "slug", ignoreDuplicates: false })
    .select("id");
  if (error) {
    console.error(`[product-write] tag upsert failed: ${error.message}`);
    return null;
  }
  return (data ?? []).map((row) => row.id);
}

/** Bust catalog + the touched product/brand/style/category slug tags. */
async function bustForProduct(
  db: AdminClient,
  productSlug: string | string[],
  values: ProductParsed,
  categoryIds: string[],
): Promise<void> {
  const [brandSlugs, styleSlugs, categorySlugs] = await Promise.all([
    slugsFor(db, "brands", values.brand_id ? [values.brand_id] : []),
    slugsFor(db, "styles", values.style_id ? [values.style_id] : []),
    slugsFor(db, "categories", categoryIds),
  ]);
  bustCatalogTags({
    productSlugs: Array.isArray(productSlug) ? productSlug : [productSlug],
    brandSlugs,
    styleSlugs,
    categorySlugs,
  });
}

/** Read the slugs for a set of ids from a taxonomy table (for tag busting). */
async function slugsFor(
  db: AdminClient,
  table: "brands" | "styles" | "categories",
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from(table).select("slug").in("id", ids);
  if (error) {
    console.error(`[product-write] slug lookup on ${table} failed: ${error.message}`);
    return [];
  }
  return (data ?? []).map((row) => row.slug);
}

