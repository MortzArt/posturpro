/**
 * CSV export generation (T11 Slice 7, AC-29). Reads ALL products from the base
 * table via the admin client (incl. draft/archived) with their brand/style/
 * category/tag slugs + variants folded in, and renders an RFC-4180 CSV matching
 * the documented `CSV_COLUMNS` contract (the same shape import accepts). Money
 * is exported in pesos, dimensions in cm, weight in kg. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCsv } from "@/lib/admin/csv/csv-parse";
import { centsToPesos } from "@/lib/money";
import { formatMmToCm, formatGToKg } from "@/lib/admin/units";
import { CSV_COLUMNS, CSV_EXPORT_MAX_ROWS } from "@/lib/config";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Render optional cents → a peso string ("" for null). */
function pesos(cents: number | null): string {
  return cents === null ? "" : centsToPesos(cents).toFixed(2);
}

/** Build the full export CSV text (header + one row per product). */
export async function generateProductsCsv(): Promise<string> {
  const db = createAdminClient();
  const products = await readProducts(db);
  const [brandById, styleById] = await Promise.all([readBrandMap(db), readStyleMap(db)]);
  const categorySlugs = await readCategorySlugsByProduct(db);
  const tagNames = await readTagNamesByProduct(db);

  const header = [...CSV_COLUMNS];
  const rows: string[][] = [header];
  for (const product of products) {
    rows.push([
      product.slug,
      product.sku,
      product.name,
      product.description ?? "",
      product.brand_id ? brandById.get(product.brand_id) ?? "" : "",
      product.style_id ? styleById.get(product.style_id) ?? "" : "",
      (categorySlugs.get(product.id) ?? []).join(";"),
      (tagNames.get(product.id) ?? []).join(";"),
      pesos(product.price_cents),
      pesos(product.compare_at_price_cents),
      pesos(product.cost_price_cents),
      String(product.stock),
      product.status,
      formatMmToCm(product.width_mm),
      formatMmToCm(product.depth_mm),
      formatMmToCm(product.height_mm),
      formatMmToCm(product.seat_height_mm),
      formatGToKg(product.weight_g),
      product.material_frame ?? "",
      product.material_upholstery ?? "",
      product.material_finish ?? "",
    ]);
  }
  return generateCsv(rows);
}

interface ExportProduct {
  id: string;
  slug: string;
  sku: string;
  name: string;
  description: string | null;
  brand_id: string | null;
  style_id: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  cost_price_cents: number | null;
  stock: number;
  status: "draft" | "active" | "archived";
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  seat_height_mm: number | null;
  weight_g: number | null;
  material_frame: string | null;
  material_upholstery: string | null;
  material_finish: string | null;
}

async function readProducts(db: AdminClient): Promise<ExportProduct[]> {
  const { data, error } = await db
    .from("products")
    .select(
      "id, slug, sku, name, description, brand_id, style_id, price_cents, compare_at_price_cents, cost_price_cents, stock, status, width_mm, depth_mm, height_mm, seat_height_mm, weight_g, material_frame, material_upholstery, material_finish",
    )
    .order("name", { ascending: true })
    // Bound the full-table read so the export can't exhaust memory (m-6).
    .limit(CSV_EXPORT_MAX_ROWS);
  if (error) throw new Error(`[csv-generate] products failed: ${error.message}`);
  return (data ?? []) as ExportProduct[];
}

async function readBrandMap(db: AdminClient): Promise<Map<string, string>> {
  const { data } = await db.from("brands").select("id, slug");
  return new Map((data ?? []).map((row) => [row.id, row.slug]));
}

async function readStyleMap(db: AdminClient): Promise<Map<string, string>> {
  const { data } = await db.from("styles").select("id, slug");
  return new Map((data ?? []).map((row) => [row.id, row.slug]));
}

async function readCategorySlugsByProduct(db: AdminClient): Promise<Map<string, string[]>> {
  const { data } = await db.from("product_categories").select("product_id, categories(slug)");
  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    if (!category) continue;
    map.set(row.product_id, [...(map.get(row.product_id) ?? []), category.slug]);
  }
  return map;
}

async function readTagNamesByProduct(db: AdminClient): Promise<Map<string, string[]>> {
  const { data } = await db.from("product_tags").select("product_id, tags(slug)");
  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
    if (!tag) continue;
    map.set(row.product_id, [...(map.get(row.product_id) ?? []), tag.slug]);
  }
  return map;
}
