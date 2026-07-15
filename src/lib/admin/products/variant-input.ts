/**
 * PURE variant parsing + validation (T11 Slice 4, AC-18/20). No I/O, no Next
 * imports — unit-testable. Validates color name, hex (matches the DB CHECK),
 * SKU presence, non-negative stock, optional price override (blank = inherit
 * base price). Uniqueness of SKU is a DB concern (mapped from `23505`).
 */
import { parseMoneyToCents } from "@/lib/admin/settings-input";
import { COLOR_HEX_PATTERN, UUID_PATTERN, VARIANT_COLOR_NAME_MAX_LENGTH } from "@/lib/config";

/** A raw variant row from the editor (all strings; id "" for a new row). */
export interface VariantRawInput {
  /** Stable client-side row identity — errors are keyed by this, never the array
   * index, so a reorder/delete between submit and render can't misattach an
   * error to the wrong row (M-6). New rows get a synthetic key. */
  key: string;
  id: string;
  colorName: string;
  colorHex: string;
  sku: string;
  priceOverride: string;
  stock: string;
  sortOrder: number;
}

/** Field-error keys for a variant row. */
export type VariantFieldErrorKey =
  | "color-required"
  | "color-too-long"
  | "hex-invalid"
  | "sku-required"
  | "sku-duplicate"
  | "price-invalid"
  | "stock-invalid"
  | "id-invalid";

/** A per-row error map keyed by field. */
export type VariantRowErrors = Partial<
  Record<"id" | "colorName" | "colorHex" | "sku" | "priceOverride" | "stock", VariantFieldErrorKey>
>;

/** The validated, DB-ready variant values. */
export interface VariantParsed {
  id: string | null;
  color_name: string;
  color_hex: string;
  sku: string;
  price_override_cents: number | null;
  stock: number;
  sort_order: number;
}

/** Parse result for one row: values or per-field errors. */
export type VariantParseResult =
  | { ok: true; values: VariantParsed }
  | { ok: false; errors: VariantRowErrors };

/** Parse a single variant row. */
export function parseVariant(raw: VariantRawInput): VariantParseResult {
  const errors: VariantRowErrors = {};

  // A non-empty id must be a canonical UUID (the shape Postgres emits). It is
  // string-interpolated into the raw PostgREST `not(id.in.(...))` delete filter
  // downstream, so a crafted id (comma, `)`, nested fragment) could broaden the
  // delete predicate — validate at the trust boundary (M-4, defense-in-depth).
  const id = raw.id.trim();
  if (id !== "" && !UUID_PATTERN.test(id)) errors.id = "id-invalid";

  const colorName = raw.colorName.trim();
  if (colorName === "") errors.colorName = "color-required";
  else if (colorName.length > VARIANT_COLOR_NAME_MAX_LENGTH) errors.colorName = "color-too-long";

  const colorHex = raw.colorHex.trim();
  if (!COLOR_HEX_PATTERN.test(colorHex)) errors.colorHex = "hex-invalid";

  const sku = raw.sku.trim();
  if (sku === "") errors.sku = "sku-required";

  const priceOverride = parsePriceOverride(raw.priceOverride);
  if (!priceOverride.ok) errors.priceOverride = "price-invalid";

  const stock = parseStock(raw.stock);
  if (stock === null) errors.stock = "stock-invalid";

  if (Object.keys(errors).length > 0 || !priceOverride.ok || stock === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    values: {
      id: id === "" ? null : id,
      color_name: colorName,
      color_hex: colorHex,
      sku,
      price_override_cents: priceOverride.value,
      stock,
      sort_order: raw.sortOrder,
    },
  };
}

/** Optional money override (blank → null). */
function parsePriceOverride(
  raw: string,
): { ok: true; value: number | null } | { ok: false } {
  if (raw.trim() === "") return { ok: true, value: null };
  const result = parseMoneyToCents(raw);
  return result.ok ? { ok: true, value: result.cents } : { ok: false };
}

/** Non-negative integer stock. */
function parseStock(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Parse a whole set of variant rows. Detects duplicate SKUs WITHIN the set
 * (before hitting the DB). Returns either the parsed set or per-row errors keyed
 * by the row's STABLE `key` (M-6 — never the array index, which drifts on a
 * reorder/delete between submit and render).
 */
export function parseVariantSet(
  rows: VariantRawInput[],
): { ok: true; values: VariantParsed[] } | { ok: false; rowErrors: Record<string, VariantRowErrors> } {
  const rowErrors: Record<string, VariantRowErrors> = {};
  const parsed: VariantParsed[] = [];
  const skuSeen = new Map<string, string>();

  rows.forEach((row) => {
    const result = parseVariant(row);
    if (!result.ok) {
      rowErrors[row.key] = result.errors;
      return;
    }
    const skuKey = result.values.sku.toLowerCase();
    if (skuSeen.has(skuKey)) {
      rowErrors[row.key] = { sku: "sku-duplicate" };
    } else {
      skuSeen.set(skuKey, row.key);
      parsed.push(result.values);
    }
  });

  if (Object.keys(rowErrors).length > 0) return { ok: false, rowErrors };
  return { ok: true, values: parsed };
}
