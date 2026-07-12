/**
 * Effective-stock + stock-badge logic (T3 AC-8, edge case 10).
 *
 * Per-variant stock is authoritative; the product-level `stock` column is only
 * the fallback for the no-variant case (documented in `0002_catalog.sql`). When
 * a product has variants, we SUM their stock and ignore a possibly-stale
 * product-level value — so a product whose variants are all 0 never shows "En
 * stock" (edge case 10). Pure functions, unit-tested; no DB access here.
 */
import { LOW_STOCK_THRESHOLD } from "@/lib/config";
import type { StockState } from "@/lib/catalog/types";

/** Minimal variant shape needed for the stock computation. */
export interface StockVariant {
  stock: number;
}

/**
 * Compute effective stock for a product.
 *
 * @param productStock the product-level `stock` (fallback when no variants)
 * @param variants the product's variants (authoritative when non-empty)
 * @returns a non-negative integer effective stock count
 */
export function effectiveStock(
  productStock: number | null | undefined,
  variants: readonly StockVariant[],
): number {
  if (variants.length > 0) {
    const sum = variants.reduce(
      (total, variant) => total + normalizeCount(variant.stock),
      0,
    );
    return sum;
  }
  return normalizeCount(productStock);
}

/**
 * Map an effective-stock count to its badge state.
 *
 * @param effective effective stock (as produced by {@link effectiveStock})
 * @returns `"out"` at 0, `"low"` in `[1, LOW_STOCK_THRESHOLD]`, else `"in"`
 */
export function stockState(effective: number): StockState {
  const count = normalizeCount(effective);
  if (count <= 0) {
    return "out";
  }
  if (count <= LOW_STOCK_THRESHOLD) {
    return "low";
  }
  return "in";
}

/**
 * Coerce a possibly-null/negative/float stock value to a non-negative integer.
 * Stock can never be negative or fractional in a badge; defend the boundary.
 */
function normalizeCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
