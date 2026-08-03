/**
 * Catalog search for the manual-order product picker (T17). Server-only. Returns,
 * per matched ACTIVE product, its live stock + the SERVER-recalculated effective
 * unit price (`variant.price_override_cents ?? product.price_cents`) — the exact
 * `revalidateLines` price rule. The client NEVER computes a price; it only
 * displays what this read returns and echoes ids/quantities back for the
 * authoritative `revalidateLines` re-check on submit.
 *
 * Reuses the admin list-query read idiom: one products query (name/SKU ilike,
 * PostgREST meta-char stripped) + batch-stitched variants + covers (no N+1).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MANUAL_ORDER_CATALOG_LIMIT } from "@/lib/config/admin-products";

type AdminClient = ReturnType<typeof createAdminClient>;

/** One selectable variant of a product in the picker. */
export interface CatalogVariantOption {
  variantId: string;
  label: string;
  stock: number;
  unitPriceCents: number;
}

/** One product result: either a no-variant selectable, or a set of variants. */
export interface CatalogProductResult {
  productId: string;
  name: string;
  sku: string;
  coverUrl: string | null;
  /** null → no-variant product (use product-level stock + price below). */
  variants: CatalogVariantOption[] | null;
  /** Product-level stock (used only when `variants` is null). */
  stock: number;
  /** Product-level effective price (used only when `variants` is null). */
  unitPriceCents: number;
}

interface RawProduct {
  id: string;
  name: string;
  sku: string;
  price_cents: number;
  stock: number;
}

interface RawVariant {
  id: string;
  product_id: string;
  sku: string;
  color_name: string;
  price_override_cents: number | null;
  stock: number;
}

/**
 * Search the active catalog by name/SKU for the picker. Empty/short terms return
 * nothing (the picker shows no results until the admin types). Bounded to
 * `MANUAL_ORDER_CATALOG_LIMIT` rows.
 */
export async function searchCatalog(term: string): Promise<CatalogProductResult[]> {
  const cleaned = term.trim();
  if (cleaned.length === 0) {
    return [];
  }
  const db = createAdminClient();
  const products = await readActiveProducts(db, cleaned);
  if (products.length === 0) {
    return [];
  }
  const ids = products.map((product) => product.id);
  const [variants, covers] = await Promise.all([
    readVariants(db, ids),
    readCovers(db, ids),
  ]);
  return products.map((product) => buildResult(product, variants, covers));
}

/** Read active products matching name/SKU (PostgREST meta-chars stripped). */
async function readActiveProducts(db: AdminClient, term: string): Promise<RawProduct[]> {
  const safe = term.replace(/[%,()*.:\\]/g, " ");
  const { data, error } = await db
    .from("products")
    .select("id, name, sku, price_cents, stock")
    .eq("status", "active")
    .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
    .order("name", { ascending: true })
    .limit(MANUAL_ORDER_CATALOG_LIMIT);
  if (error) {
    console.error(`[manual-order] catalog search failed: ${error.message}`);
    return [];
  }
  return (data ?? []) as RawProduct[];
}

/** Batch-read all variants for the matched products, grouped by product id. */
async function readVariants(
  db: AdminClient,
  productIds: string[],
): Promise<Map<string, RawVariant[]>> {
  const { data, error } = await db
    .from("product_variants")
    .select("id, product_id, sku, color_name, price_override_cents, stock")
    .in("product_id", productIds)
    .order("color_name", { ascending: true });
  const grouped = new Map<string, RawVariant[]>();
  if (error) {
    console.error(`[manual-order] catalog variants failed: ${error.message}`);
    return grouped;
  }
  for (const row of (data ?? []) as RawVariant[]) {
    const list = grouped.get(row.product_id) ?? [];
    list.push(row);
    grouped.set(row.product_id, list);
  }
  return grouped;
}

/** Map product id → cover (primary) image URL, else the first image. */
async function readCovers(db: AdminClient, productIds: string[]): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("product_images")
    .select("product_id, url, is_primary, sort_order")
    .in("product_id", productIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  const covers = new Map<string, string>();
  if (error) {
    console.error(`[manual-order] catalog covers failed: ${error.message}`);
    return covers;
  }
  for (const row of data ?? []) {
    if (!covers.has(row.product_id)) {
      covers.set(row.product_id, row.url);
    }
  }
  return covers;
}

/** Assemble one product result, resolving the effective price per target. */
function buildResult(
  product: RawProduct,
  variants: Map<string, RawVariant[]>,
  covers: Map<string, string>,
): CatalogProductResult {
  const rawVariants = variants.get(product.id) ?? [];
  const coverUrl = covers.get(product.id) ?? null;
  if (rawVariants.length === 0) {
    return {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      coverUrl,
      variants: null,
      stock: product.stock,
      unitPriceCents: product.price_cents,
    };
  }
  return {
    productId: product.id,
    name: product.name,
    sku: product.sku,
    coverUrl,
    variants: rawVariants.map((variant) => ({
      variantId: variant.id,
      label: variant.color_name,
      stock: variant.stock,
      // The live effective price rule (revalidateLines): override ?? product.
      unitPriceCents: variant.price_override_cents ?? product.price_cents,
    })),
    stock: product.stock,
    unitPriceCents: product.price_cents,
  };
}
