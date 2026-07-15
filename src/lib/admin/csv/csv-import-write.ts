/**
 * CSV import writer (T11 Slice 7, AC-31). Applies the confirmed, already-parsed
 * import values resiliently: one bad row never aborts the batch (its error is
 * reported, good rows still commit). Products match by SKU; taxonomy is
 * referenced by slug (resolved to ids here — unknown slugs were already rejected
 * in the dry-run). Caches are busted ONCE at the end. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bustCatalogTags } from "@/lib/admin/products/cache-tags";
import { slugify } from "@/lib/admin/products/slug";
import type { ImportProductValues } from "@/lib/admin/csv/csv-product-map";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Per-row write result reported back to the summary. */
export interface ImportWriteResult {
  created: number;
  updated: number;
  failed: { sku: string; message: string }[];
}

/** Slug → id maps for taxonomy resolution. Exported for within-row atomicity tests (M-3). */
export interface TaxonomyMaps {
  brandBySlug: Map<string, string>;
  styleBySlug: Map<string, string>;
  categoryBySlug: Map<string, string>;
}

/**
 * Apply the confirmed import rows. Returns per-outcome counts; a failing row is
 * captured, not thrown. Busts the catalog cache once at the end.
 */
export async function applyImport(rows: ImportProductValues[]): Promise<ImportWriteResult> {
  const db = createAdminClient();
  const maps = await loadTaxonomyMaps(db);
  const result: ImportWriteResult = { created: 0, updated: 0, failed: [] };

  for (const row of rows) {
    try {
      const wasCreated = await upsertProduct(db, row, maps);
      if (wasCreated) result.created += 1;
      else result.updated += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      result.failed.push({ sku: row.sku, message });
      console.error(`[csv-import] row ${row.sku} failed: ${message}`);
    }
  }

  bustCatalogTags();
  return result;
}

/** A product row's prior M2M link state, snapshotted before an update. */
interface LinkSnapshot {
  categoryIds: string[];
  tagIds: string[];
}

/**
 * Upsert one product by SKU + reconcile its M2M links WITH within-row atomicity
 * (M-3). The row is not counted created/updated until BOTH the product write and
 * the link sync succeed. If the link sync throws:
 *   - a newly-inserted row is deleted (full rollback), and
 *   - an updated row's prior links are restored,
 * so a failing row never persists a half-written product while being reported as
 * failed. Per-row isolation (AC-31) is unchanged: the throw propagates to
 * `applyImport`, which records the failure and continues with the next row.
 * Returns true if the product was created. Exported for the M-3 within-row
 * atomicity regression test (drives a forced link-sync failure with a poisoned
 * taxonomy map); production callers go through {@link applyImport}.
 */
export async function upsertProduct(
  db: AdminClient,
  row: ImportProductValues,
  maps: TaxonomyMaps,
): Promise<boolean> {
  const columns = {
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    description: row.description,
    brand_id: row.brandSlug ? maps.brandBySlug.get(row.brandSlug) ?? null : null,
    style_id: row.styleSlug ? maps.styleBySlug.get(row.styleSlug) ?? null : null,
    price_cents: row.price_cents,
    compare_at_price_cents: row.compare_at_price_cents,
    cost_price_cents: row.cost_price_cents,
    stock: row.stock,
    status: row.status,
    width_mm: row.width_mm,
    depth_mm: row.depth_mm,
    height_mm: row.height_mm,
    seat_height_mm: row.seat_height_mm,
    weight_g: row.weight_g,
    material_frame: row.material_frame,
    material_upholstery: row.material_upholstery,
    material_finish: row.material_finish,
  };

  const { data: existing } = await db.from("products").select("id").eq("sku", row.sku).maybeSingle();
  if (existing) {
    const before = await snapshotLinks(db, existing.id);
    const { error } = await db.from("products").update(columns).eq("id", existing.id);
    if (error) throw new Error(error.message);
    try {
      await syncCategories(db, existing.id, row.categorySlugs, maps.categoryBySlug);
      await syncTags(db, existing.id, row.tagNames);
    } catch (cause) {
      await restoreLinks(db, existing.id, before);
      throw cause;
    }
    return false;
  }

  const { data, error } = await db.from("products").insert(columns).select("id").single();
  if (error) throw new Error(error.message);
  const productId = data.id;
  try {
    await syncCategories(db, productId, row.categorySlugs, maps.categoryBySlug);
    await syncTags(db, productId, row.tagNames);
  } catch (cause) {
    // New row: delete it so no half-written product persists (cascades its links).
    await db.from("products").delete().eq("id", productId);
    throw cause;
  }
  return true;
}

/** Read a product's current category + tag link ids. */
async function snapshotLinks(db: AdminClient, productId: string): Promise<LinkSnapshot> {
  const [categories, tags] = await Promise.all([
    db.from("product_categories").select("category_id").eq("product_id", productId),
    db.from("product_tags").select("tag_id").eq("product_id", productId),
  ]);
  return {
    categoryIds: (categories.data ?? []).map((rowData) => rowData.category_id),
    tagIds: (tags.data ?? []).map((rowData) => rowData.tag_id),
  };
}

/** Restore a product's category/tag links to a prior snapshot (M-3 rollback). */
async function restoreLinks(db: AdminClient, productId: string, snapshot: LinkSnapshot): Promise<void> {
  await db.from("product_categories").delete().eq("product_id", productId);
  if (snapshot.categoryIds.length > 0) {
    const rows = snapshot.categoryIds.map((categoryId) => ({ product_id: productId, category_id: categoryId }));
    const { error } = await db.from("product_categories").insert(rows);
    if (error) console.error(`[csv-import] category link restore failed: ${error.message}`);
  }
  await db.from("product_tags").delete().eq("product_id", productId);
  if (snapshot.tagIds.length > 0) {
    const rows = snapshot.tagIds.map((tagId) => ({ product_id: productId, tag_id: tagId }));
    const { error } = await db.from("product_tags").insert(rows);
    if (error) console.error(`[csv-import] tag link restore failed: ${error.message}`);
  }
}

/** Replace a product's category links from slugs. */
async function syncCategories(
  db: AdminClient,
  productId: string,
  slugs: string[],
  categoryBySlug: Map<string, string>,
): Promise<void> {
  await db.from("product_categories").delete().eq("product_id", productId);
  const ids = slugs.map((slug) => categoryBySlug.get(slug)).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;
  const { error } = await db
    .from("product_categories")
    .insert(ids.map((categoryId) => ({ product_id: productId, category_id: categoryId })));
  if (error) throw new Error(error.message);
}

/** Replace a product's tag links (create tags by slug on first use). */
async function syncTags(db: AdminClient, productId: string, tagNames: string[]): Promise<void> {
  await db.from("product_tags").delete().eq("product_id", productId);
  const rows = tagNames
    .map((name) => ({ slug: slugify(name), name: name.trim() }))
    .filter((row) => row.slug !== "");
  if (rows.length === 0) return;
  const { data, error } = await db.from("tags").upsert(rows, { onConflict: "slug" }).select("id");
  if (error) throw new Error(error.message);
  const links = (data ?? []).map((tag) => ({ product_id: productId, tag_id: tag.id }));
  if (links.length > 0) {
    const { error: linkError } = await db.from("product_tags").insert(links);
    if (linkError) throw new Error(linkError.message);
  }
}

/** Load slug→id maps for brands/styles/categories. */
async function loadTaxonomyMaps(db: AdminClient): Promise<TaxonomyMaps> {
  const [brands, styles, categories] = await Promise.all([
    db.from("brands").select("id, slug"),
    db.from("styles").select("id, slug"),
    db.from("categories").select("id, slug"),
  ]);
  return {
    brandBySlug: new Map((brands.data ?? []).map((row) => [row.slug, row.id])),
    styleBySlug: new Map((styles.data ?? []).map((row) => [row.slug, row.id])),
    categoryBySlug: new Map((categories.data ?? []).map((row) => [row.slug, row.id])),
  };
}
