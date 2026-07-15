/**
 * PURE product-field parsing + validation (T11 Slice 2, AC-9/10/13). No I/O, no
 * Next imports — exhaustively unit-testable (mirrors `settings-input.ts`).
 * Collects ALL field errors in one pass. Money parses via `parseMoneyToCents`
 * (strict, reused); dimensions/weight via `parseCmToMm`/`parseKgToG`; slug/SKU
 * format + presence are enforced here (uniqueness is a DB concern, mapped from
 * `23505` in the write layer). Returns DB-ready values (integer cents / mm / g).
 */
import { parseMoneyToCents } from "@/lib/admin/settings-input";
import { parseCmToMm, parseKgToG, type UnitFieldError } from "@/lib/admin/units";
import { isValidSlug } from "@/lib/admin/products/slug";
import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  MATERIAL_MAX_LENGTH,
  INT4_MAX,
} from "@/lib/config";
import type { ProductFormValues } from "@/app/admin/(app)/products/products-form-state";

/** Every product-form field that can carry an error. */
export type ProductField =
  | "name"
  | "slug"
  | "description"
  | "sku"
  | "price"
  | "compare_at_price"
  | "cost_price"
  | "stock"
  | "status"
  | "width_cm"
  | "depth_cm"
  | "height_cm"
  | "seat_height_cm"
  | "weight_kg"
  | "material_frame"
  | "material_upholstery"
  | "material_finish";

/** Field-error keys (localized in the form). */
export type ProductFieldErrorKey =
  | "required"
  | "too-long"
  | "slug-format"
  | "slug-duplicate"
  | "sku-duplicate"
  | "money-required"
  | "money-invalid"
  | "money-negative"
  | "money-too-many-decimals"
  | "money-overflow"
  | "int-invalid"
  | "int-negative"
  | "unit-invalid"
  | "unit-negative"
  | "unit-too-many-decimals"
  | "unit-overflow"
  | "status-invalid";

/** A single field error (used by the map type in the form state). */
export interface ProductFieldError {
  field: ProductField;
  error: ProductFieldErrorKey;
}

/** The validated, DB-ready product columns (integer cents / mm / g). */
export interface ProductParsed {
  name: string;
  slug: string;
  description: string | null;
  brand_id: string | null;
  style_id: string | null;
  sku: string;
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
  is_featured: boolean;
  is_best_seller: boolean;
}

/** Parse result: DB-ready values (+ M2M ids/names), or per-field errors. */
export type ProductParseResult =
  | {
      ok: true;
      values: ProductParsed;
      categoryIds: string[];
      tagNames: string[];
    }
  | { ok: false; fieldErrors: Partial<Record<ProductField, ProductFieldErrorKey>> };

/** Map a money-parser error key onto the product field-error vocabulary. */
function mapMoneyError(error: string): ProductFieldErrorKey {
  switch (error) {
    case "money-required":
      return "money-required";
    case "money-negative":
      return "money-negative";
    case "money-too-many-decimals":
      return "money-too-many-decimals";
    case "money-overflow":
      return "money-overflow";
    default:
      return "money-invalid";
  }
}

/** Map a unit-parser error key onto the product field-error vocabulary. */
function mapUnitError(error: UnitFieldError): ProductFieldErrorKey {
  return error;
}

/** Parse a required non-blank string field with a max length. */
function parseRequiredText(
  raw: string,
  max: number,
): { ok: true; value: string } | { ok: false; error: ProductFieldErrorKey } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: "required" };
  if (trimmed.length > max) return { ok: false, error: "too-long" };
  return { ok: true, value: trimmed };
}

/** Parse an optional text field → trimmed string or null; bounded length. */
function parseOptionalText(
  raw: string,
  max: number,
): { ok: true; value: string | null } | { ok: false; error: ProductFieldErrorKey } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, error: "too-long" };
  return { ok: true, value: trimmed };
}

/** Parse a non-negative integer field (stock). */
function parseNonNegativeInt(
  raw: string,
): { ok: true; value: number } | { ok: false; error: ProductFieldErrorKey } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: 0 };
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: trimmed.startsWith("-") ? "int-negative" : "int-invalid" };
  }
  const value = Number(trimmed);
  // Reject JS-unsafe integers AND anything the int4 `stock` column can't hold
  // (a value in (INT4_MAX, MAX_SAFE_INTEGER] would overflow the column).
  if (!Number.isSafeInteger(value) || value > INT4_MAX) {
    return { ok: false, error: "int-invalid" };
  }
  return { ok: true, value };
}

/** Parse an OPTIONAL money field (blank → null). */
function parseOptionalMoney(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: ProductFieldErrorKey } {
  if (raw.trim() === "") return { ok: true, value: null };
  const result = parseMoneyToCents(raw);
  return result.ok
    ? { ok: true, value: result.cents }
    : { ok: false, error: mapMoneyError(result.error) };
}

/** Empty-string → null id (a select's "none" option submits ""). */
function optionalId(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Parse + validate the whole product form. Collects every field error in one
 * pass. Uniqueness (slug/SKU) is NOT checked here — the DB unique constraint is
 * the authority; the write layer maps a `23505` to `slug-duplicate`/`sku-
 * duplicate`. Category ids + tag names pass through (validated as ids/labels).
 */
export function parseProductInput(raw: ProductFormValues): ProductParseResult {
  const errors: Partial<Record<ProductField, ProductFieldErrorKey>> = {};

  const name = parseRequiredText(raw.name, PRODUCT_NAME_MAX_LENGTH);
  if (!name.ok) errors.name = name.error;

  const slug = parseSlug(raw.slug);
  if (!slug.ok) errors.slug = slug.error;

  const description = parseOptionalText(raw.description, PRODUCT_DESCRIPTION_MAX_LENGTH);
  if (!description.ok) errors.description = description.error;

  const sku = parseRequiredText(raw.sku, 200);
  if (!sku.ok) errors.sku = sku.error;

  const price = parseMoneyToCents(raw.price);
  if (!price.ok) errors.price = mapMoneyError(price.error);

  const compare = parseOptionalMoney(raw.compare_at_price);
  if (!compare.ok) errors.compare_at_price = compare.error;

  const cost = parseOptionalMoney(raw.cost_price);
  if (!cost.ok) errors.cost_price = cost.error;

  const stock = parseNonNegativeInt(raw.stock);
  if (!stock.ok) errors.stock = stock.error;

  const status = parseStatus(raw.status);
  if (!status.ok) errors.status = status.error;

  const dims = parseDimensions(raw, errors);
  const materials = parseMaterials(raw, errors);

  if (
    !name.ok ||
    !slug.ok ||
    !description.ok ||
    !sku.ok ||
    !price.ok ||
    !compare.ok ||
    !cost.ok ||
    !stock.ok ||
    !status.ok ||
    !dims.ok ||
    !materials.ok
  ) {
    return { ok: false, fieldErrors: errors };
  }

  return {
    ok: true,
    values: {
      name: name.value,
      slug: slug.value,
      description: description.value,
      brand_id: optionalId(raw.brand_id),
      style_id: optionalId(raw.style_id),
      sku: sku.value,
      price_cents: price.cents,
      compare_at_price_cents: compare.value,
      cost_price_cents: cost.value,
      stock: stock.value,
      status: status.value,
      width_mm: dims.value.width,
      depth_mm: dims.value.depth,
      height_mm: dims.value.height,
      seat_height_mm: dims.value.seat,
      weight_g: dims.value.weight,
      material_frame: materials.value.frame,
      material_upholstery: materials.value.upholstery,
      material_finish: materials.value.finish,
      is_featured: raw.is_featured,
      is_best_seller: raw.is_best_seller,
    },
    categoryIds: raw.category_ids.filter((id) => id.trim() !== ""),
    tagNames: normalizeTagNames(raw.tag_names),
  };
}

/** Parse the slug: required + DB slug-format. */
function parseSlug(
  raw: string,
): { ok: true; value: string } | { ok: false; error: ProductFieldErrorKey } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: "required" };
  if (!isValidSlug(trimmed)) return { ok: false, error: "slug-format" };
  return { ok: true, value: trimmed };
}

/** Parse the status enum. */
function parseStatus(
  raw: string,
):
  | { ok: true; value: "draft" | "active" | "archived" }
  | { ok: false; error: ProductFieldErrorKey } {
  if (raw === "draft" || raw === "active" || raw === "archived") {
    return { ok: true, value: raw };
  }
  return { ok: false, error: "status-invalid" };
}

interface Dimensions {
  width: number | null;
  depth: number | null;
  height: number | null;
  seat: number | null;
  weight: number | null;
}

/** Parse the four dimension fields (cm→mm) + weight (kg→g), recording errors. */
function parseDimensions(
  raw: ProductFormValues,
  errors: Partial<Record<ProductField, ProductFieldErrorKey>>,
): { ok: true; value: Dimensions } | { ok: false } {
  const width = parseCmToMm(raw.width_cm);
  const depth = parseCmToMm(raw.depth_cm);
  const height = parseCmToMm(raw.height_cm);
  const seat = parseCmToMm(raw.seat_height_cm);
  const weight = parseKgToG(raw.weight_kg);
  if (!width.ok) errors.width_cm = mapUnitError(width.error);
  if (!depth.ok) errors.depth_cm = mapUnitError(depth.error);
  if (!height.ok) errors.height_cm = mapUnitError(height.error);
  if (!seat.ok) errors.seat_height_cm = mapUnitError(seat.error);
  if (!weight.ok) errors.weight_kg = mapUnitError(weight.error);
  if (!width.ok || !depth.ok || !height.ok || !seat.ok || !weight.ok) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      width: width.value,
      depth: depth.value,
      height: height.value,
      seat: seat.value,
      weight: weight.value,
    },
  };
}

interface Materials {
  frame: string | null;
  upholstery: string | null;
  finish: string | null;
}

/** Parse the three optional material text fields. */
function parseMaterials(
  raw: ProductFormValues,
  errors: Partial<Record<ProductField, ProductFieldErrorKey>>,
): { ok: true; value: Materials } | { ok: false } {
  const frame = parseOptionalText(raw.material_frame, MATERIAL_MAX_LENGTH);
  const upholstery = parseOptionalText(raw.material_upholstery, MATERIAL_MAX_LENGTH);
  const finish = parseOptionalText(raw.material_finish, MATERIAL_MAX_LENGTH);
  if (!frame.ok) errors.material_frame = frame.error;
  if (!upholstery.ok) errors.material_upholstery = upholstery.error;
  if (!finish.ok) errors.material_finish = finish.error;
  if (!frame.ok || !upholstery.ok || !finish.ok) return { ok: false };
  return {
    ok: true,
    value: { frame: frame.value, upholstery: upholstery.value, finish: finish.value },
  };
}

/** De-dupe + trim + drop blank tag labels (slugified at write time). */
function normalizeTagNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === "") continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
