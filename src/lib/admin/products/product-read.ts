/**
 * Read one product with everything the edit form needs (T11 Slice 2). LIVE
 * admin-client read of the base table + variants + images + M2M category/tag
 * links. Returns form-ready values (cents→peso strings, mm→cm strings) so the
 * SSR form is populated with no client transform. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { centsToPesos } from "@/lib/money";
import { formatMmToCm, formatGToKg } from "@/lib/admin/units";
import type { ProductFormValues } from "@/app/admin/(app)/products/products-form-state";

/** A variant row for the edit form. */
export interface EditVariant {
  id: string;
  sku: string;
  colorName: string;
  colorHex: string;
  priceOverride: string;
  stock: number;
  sortOrder: number;
}

/** An image row for the edit form. */
export interface EditImage {
  id: string;
  url: string;
  variantId: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

/** Everything the edit page renders for a product. */
export interface ProductForEdit {
  id: string;
  slug: string;
  name: string;
  values: ProductFormValues;
  variants: EditVariant[];
  images: EditImage[];
}

/** Format optional cents → a peso string ("" for null). */
function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return centsToPesos(cents).toFixed(2);
}

/**
 * Read a product for the edit form, or null when it doesn't exist. Loads
 * variants, images, and the M2M category ids + tag names in parallel.
 */
export async function readProductForEdit(productId: string): Promise<ProductForEdit | null> {
  const db = createAdminClient();
  const { data: product, error } = await db
    .from("products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(`[product-read] read failed: ${error.message}`);
  if (!product) return null;

  const [variants, images, categoryIds, tagNames] = await Promise.all([
    readVariants(db, productId),
    readImages(db, productId),
    readCategoryIds(db, productId),
    readTagNames(db, productId),
  ]);

  const values: ProductFormValues = {
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    brand_id: product.brand_id ?? "",
    style_id: product.style_id ?? "",
    sku: product.sku,
    price: centsToPesos(product.price_cents).toFixed(2),
    compare_at_price: centsToInput(product.compare_at_price_cents),
    cost_price: centsToInput(product.cost_price_cents),
    stock: String(product.stock),
    status: product.status,
    width_cm: formatMmToCm(product.width_mm),
    depth_cm: formatMmToCm(product.depth_mm),
    height_cm: formatMmToCm(product.height_mm),
    seat_height_cm: formatMmToCm(product.seat_height_mm),
    weight_kg: formatGToKg(product.weight_g),
    material_frame: product.material_frame ?? "",
    material_upholstery: product.material_upholstery ?? "",
    material_finish: product.material_finish ?? "",
    is_featured: product.is_featured,
    is_best_seller: product.is_best_seller,
    category_ids: categoryIds,
    tag_names: tagNames,
  };

  return { id: product.id, slug: product.slug, name: product.name, values, variants, images };
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function readVariants(db: AdminClient, productId: string): Promise<EditVariant[]> {
  const { data, error } = await db
    .from("product_variants")
    .select("id, sku, color_name, color_hex, price_override_cents, stock, sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`[product-read] variants failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    sku: row.sku,
    colorName: row.color_name,
    colorHex: row.color_hex,
    priceOverride: centsToInput(row.price_override_cents),
    stock: row.stock,
    sortOrder: row.sort_order,
  }));
}

async function readImages(db: AdminClient, productId: string): Promise<EditImage[]> {
  const { data, error } = await db
    .from("product_images")
    .select("id, url, variant_id, sort_order, is_primary")
    .eq("product_id", productId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`[product-read] images failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    url: row.url,
    variantId: row.variant_id,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
  }));
}

async function readCategoryIds(db: AdminClient, productId: string): Promise<string[]> {
  const { data, error } = await db
    .from("product_categories")
    .select("category_id")
    .eq("product_id", productId);
  if (error) throw new Error(`[product-read] categories failed: ${error.message}`);
  return (data ?? []).map((row) => row.category_id);
}

async function readTagNames(db: AdminClient, productId: string): Promise<string[]> {
  const { data, error } = await db
    .from("product_tags")
    .select("tags(name)")
    .eq("product_id", productId);
  if (error) throw new Error(`[product-read] tags failed: ${error.message}`);
  return (data ?? [])
    .map((row) => {
      const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
      return tag?.name ?? "";
    })
    .filter((name) => name !== "");
}
