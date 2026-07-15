/**
 * PURE CSV ↔ product mapping + dry-run diff builder (T11 Slice 7, AC-30..32).
 * No I/O, no Next imports — exhaustively unit-testable. Given parsed CSV rows +
 * the existing SKUs and taxonomy slug sets, it produces a per-row plan (create /
 * update / error) with an es-MX reason for every bad row — WITHOUT writing
 * anything. Money/dimension parsing reuses the strict parsers; unknown taxonomy
 * slugs are errors (never silent creation). Import matches products by SKU.
 */
import { parseMoneyToCents } from "@/lib/admin/settings-input";
import { parseCmToMm, parseKgToG } from "@/lib/admin/units";
import { isValidSlug } from "@/lib/admin/products/slug";
import { CSV_COLUMNS, CSV_REQUIRED_COLUMNS } from "@/lib/config";

/** The sets of existing keys the diff is computed against. */
export interface ImportContext {
  existingSkus: Set<string>;
  brandSlugs: Set<string>;
  styleSlugs: Set<string>;
  categorySlugs: Set<string>;
}

/** A fully-parsed product row ready to write (create or update). */
export interface ImportProductValues {
  slug: string;
  sku: string;
  name: string;
  description: string | null;
  brandSlug: string | null;
  styleSlug: string | null;
  categorySlugs: string[];
  tagNames: string[];
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

/** One planned row in the dry-run. */
export type ImportRowPlan =
  | { line: number; action: "create" | "update"; sku: string; name: string; values: ImportProductValues }
  | { line: number; action: "error"; sku: string; name: string; message: string };

/** The full dry-run result. */
export interface ImportDiff {
  rows: ImportRowPlan[];
  createCount: number;
  updateCount: number;
  errorCount: number;
}

/** Header validation outcome. */
export type HeaderResult =
  | { ok: true; index: Record<string, number> }
  | { ok: false; message: string };

/** Validate the header row: every required column must be present. */
export function validateHeader(header: string[]): HeaderResult {
  const normalized = header.map((cell) => cell.trim().toLowerCase());
  const index: Record<string, number> = {};
  normalized.forEach((name, position) => {
    if ((CSV_COLUMNS as readonly string[]).includes(name)) index[name] = position;
  });
  for (const required of CSV_REQUIRED_COLUMNS) {
    if (!(required in index)) {
      return { ok: false, message: `Falta la columna '${required}'.` };
    }
  }
  return { ok: true, index };
}

/** Read a cell by column name (empty string when absent). */
function cell(row: string[], index: Record<string, number>, name: string): string {
  const position = index[name];
  return position === undefined ? "" : (row[position] ?? "").trim();
}

/** Parse an optional money cell → cents or null; throws a reason string on error. */
function money(raw: string, column: string): number | null {
  if (raw === "") return null;
  const result = parseMoneyToCents(raw);
  if (!result.ok) throw `${column}: usa punto decimal, sin separadores de miles.`;
  return result.cents;
}

/** Parse a required money cell. */
function requiredMoney(raw: string, column: string): number {
  if (raw === "") throw `Falta ${column}.`;
  const result = parseMoneyToCents(raw);
  if (!result.ok) throw `${column}: usa punto decimal, sin separadores de miles.`;
  return result.cents;
}

/** Parse a dimension cm cell → mm or null. */
function dimension(raw: string, column: string): number | null {
  const result = parseCmToMm(raw);
  if (!result.ok) throw `${column}: número inválido.`;
  return result.value;
}

/** Parse a non-negative integer stock cell. */
function stock(raw: string): number {
  if (raw === "") return 0;
  if (!/^\d+$/.test(raw)) throw "stock: número inválido.";
  return Number(raw);
}

/** Parse the status cell (default draft). */
function status(raw: string): "draft" | "active" | "archived" {
  if (raw === "") return "draft";
  if (raw === "draft" || raw === "active" || raw === "archived") return raw;
  throw "estado inválido (usa draft/active/archived).";
}

/** Split a semicolon/comma-free slug list cell into slugs. */
function slugList(raw: string): string[] {
  return raw
    .split(/[;|]/)
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

/** Build the per-row plan for one data row. Returns a plan (create/update/error). */
function planRow(
  row: string[],
  index: Record<string, number>,
  line: number,
  context: ImportContext,
  seenSkus: Set<string>,
  seenSlugs: Set<string>,
): ImportRowPlan {
  const sku = cell(row, index, "sku");
  const name = cell(row, index, "name");
  try {
    if (sku === "") throw "Falta sku.";
    if (name === "") throw "Falta name.";
    if (seenSkus.has(sku.toLowerCase())) throw `SKU repetido en el archivo (fila ${line}).`;
    seenSkus.add(sku.toLowerCase());

    const values = buildValues(row, index, sku, name, context);
    // Two rows resolving to the same slug both preview as "create" then the
    // second dies at confirm with a 23505 — surface it in the dry-run (m-5).
    const slugKey = values.slug.toLowerCase();
    if (seenSlugs.has(slugKey)) throw `Slug repetido en el archivo: ${values.slug}.`;
    seenSlugs.add(slugKey);

    const action = context.existingSkus.has(sku) ? "update" : "create";
    return { line, action, sku, name, values };
  } catch (reason) {
    return { line, action: "error", sku, name, message: String(reason) };
  }
}

/** Assemble + validate the full product values for a row (throws a reason). */
function buildValues(
  row: string[],
  index: Record<string, number>,
  sku: string,
  name: string,
  context: ImportContext,
): ImportProductValues {
  const slug = resolveSlug(cell(row, index, "slug"), name);
  const brandSlug = resolveTaxonomy(cell(row, index, "brand_slug"), context.brandSlugs, "marca");
  const styleSlug = resolveTaxonomy(cell(row, index, "style_slug"), context.styleSlugs, "estilo");
  const categorySlugs = resolveCategories(cell(row, index, "category_slugs"), context.categorySlugs);

  return {
    slug,
    sku,
    name,
    description: cell(row, index, "description") || null,
    brandSlug,
    styleSlug,
    categorySlugs,
    tagNames: slugList(cell(row, index, "tag_slugs")),
    price_cents: requiredMoney(cell(row, index, "price"), "price"),
    compare_at_price_cents: money(cell(row, index, "compare_at_price"), "compare_at_price"),
    cost_price_cents: money(cell(row, index, "cost_price"), "cost_price"),
    stock: stock(cell(row, index, "stock")),
    status: status(cell(row, index, "status")),
    width_mm: dimension(cell(row, index, "width_cm"), "width_cm"),
    depth_mm: dimension(cell(row, index, "depth_cm"), "depth_cm"),
    height_mm: dimension(cell(row, index, "height_cm"), "height_cm"),
    seat_height_mm: dimension(cell(row, index, "seat_height_cm"), "seat_height_cm"),
    weight_g: parseWeight(cell(row, index, "weight_kg")),
    material_frame: cell(row, index, "material_frame") || null,
    material_upholstery: cell(row, index, "material_upholstery") || null,
    material_finish: cell(row, index, "material_finish") || null,
  };
}

/** Parse the weight kg cell → grams or null. */
function parseWeight(raw: string): number | null {
  const result = parseKgToG(raw);
  if (!result.ok) throw "weight_kg: número inválido.";
  return result.value;
}

/** Resolve the slug: use the cell if valid, else slugify the name; validate. */
function resolveSlug(rawSlug: string, name: string): string {
  const candidate = rawSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!isValidSlug(candidate)) throw "slug inválido (minúsculas, sin espacios).";
  return candidate;
}

/** Resolve an optional taxonomy slug against the known set (unknown → error). */
function resolveTaxonomy(raw: string, known: Set<string>, kind: string): string | null {
  if (raw === "") return null;
  if (!known.has(raw)) throw `${kind} '${raw}' no existe.`;
  return raw;
}

/** Resolve category slugs against the known set (unknown → error). */
function resolveCategories(raw: string, known: Set<string>): string[] {
  const slugs = slugList(raw);
  for (const slug of slugs) {
    if (!known.has(slug)) throw `categoría '${slug}' no existe.`;
  }
  return slugs;
}

/**
 * Build the dry-run diff from parsed CSV rows (header + data). The first row is
 * the header. Returns a plan for every data row + counts. NO writes.
 */
export function buildImportDiff(rows: string[][], context: ImportContext): ImportDiff | { error: string } {
  if (rows.length === 0) return { error: "El archivo está vacío." };
  const header = validateHeader(rows[0]);
  if (!header.ok) return { error: header.message };

  const seenSkus = new Set<string>();
  const seenSlugs = new Set<string>();
  const plans: ImportRowPlan[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    plans.push(planRow(rows[i], header.index, i + 1, context, seenSkus, seenSlugs));
  }

  return {
    rows: plans,
    createCount: plans.filter((plan) => plan.action === "create").length,
    updateCount: plans.filter((plan) => plan.action === "update").length,
    errorCount: plans.filter((plan) => plan.action === "error").length,
  };
}
