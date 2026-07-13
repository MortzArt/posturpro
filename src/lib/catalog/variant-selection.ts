/**
 * Pure variant-selection helpers (T4 AC-7, AC-9, edges 3 & 8).
 *
 * No I/O, no React — the purchase-panel island calls these synchronously on
 * every swatch selection so price / stock / gallery stay in sync from a single
 * source of truth. Unit-testable in isolation. Selection is idempotent: passing
 * the same id twice yields the same result, so rapid clicks never produce a
 * stale/stuck state.
 */
import { effectiveStock, stockState } from "@/lib/catalog/stock";
import type { StockState } from "@/lib/catalog/types";
import type {
  ProductImageView,
  ProductVariantView,
} from "@/lib/catalog/product-detail.types";

/**
 * Resolve the effective (display) price in cents for a selection.
 *
 * @param variant the selected variant, or `null` when the product has none
 * @param basePriceCents the product-level `price_cents`
 * @returns `variant.priceOverrideCents ?? basePriceCents`
 */
export function effectivePriceCents(
  variant: ProductVariantView | null,
  basePriceCents: number,
): number {
  if (variant && typeof variant.priceOverrideCents === "number") {
    return variant.priceOverrideCents;
  }
  return basePriceCents;
}

/**
 * Whether a struck compare-at price should render for a selection (AC-9, edge 3).
 * True ONLY when the compare-at is strictly greater than the effective price —
 * recomputed per selection so a variant override that lifts the price above the
 * compare-at removes the strike, and never a strike equal-to/below the sale.
 */
export function shouldStrikeCompareAt(
  compareAtPriceCents: number | null,
  effective: number,
): boolean {
  return typeof compareAtPriceCents === "number" && compareAtPriceCents > effective;
}

/**
 * The image set to show for a selection (AC-7, edge 1 & 8).
 *
 * A variant's own images take precedence; if it has none we fall back to the
 * SHARED product images (`variantId === null`). When a product has no variants,
 * `variantId` is `null` and we return the shared set directly. The caller renders
 * the placeholder tile when the returned array is empty.
 */
export function imagesForVariant(
  allImages: readonly ProductImageView[],
  variantId: string | null,
): ProductImageView[] {
  const shared = allImages.filter((image) => image.variantId === null);
  if (variantId === null) {
    return shared;
  }
  const own = allImages.filter((image) => image.variantId === variantId);
  return own.length > 0 ? own : shared;
}

/** The stock state for a single variant (its own stock drives its own badge). */
export function variantStockState(variant: ProductVariantView): StockState {
  return stockState(effectiveStock(null, [variant]));
}

/**
 * The default selected variant: the first in the (already deterministically
 * ordered) list, or `null` when the product has no variants. Chosen over
 * "first in stock" deliberately — the design keeps every swatch selectable so a
 * shopper can inspect an out-of-stock color (edge 2); the badge reflects it.
 */
export function defaultVariant(
  variants: readonly ProductVariantView[],
): ProductVariantView | null {
  return variants[0] ?? null;
}
