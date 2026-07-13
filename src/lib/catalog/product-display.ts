/**
 * Server-side display-string builders for the PDP (T4).
 *
 * The purchase-panel island does ZERO client i18n (SRP, mirrors the T3 grid
 * discipline): every per-variant / product-level string is resolved HERE on the
 * server and passed in as plain props. This module turns a `ProductDetail` into
 * the `variantDisplay` map + product-level display the panel consumes, using the
 * pure price/stock helpers so display and behavior can never drift.
 */
import "server-only";
import { formatMXN } from "@/lib/money";
import type { StockState } from "@/lib/catalog/types";
import type {
  ProductDetail,
  ProductVariantView,
} from "@/lib/catalog/product-detail.types";
import {
  effectivePriceCents,
  shouldStrikeCompareAt,
  variantStockState,
} from "@/lib/catalog/variant-selection";
import type {
  ProductDisplay,
  VariantDisplay,
} from "@/components/product/product-purchase-panel";

/** Localized string resolvers the caller wires from `getTranslations`. */
export interface DisplayResolvers {
  /** Resolve a stock label for a state + low count ("Solo quedan {n}"). */
  stockLabel: (state: StockState, lowCount: number) => string;
  /** Resolve "Color: {name}". */
  colorLabel: (colorName: string) => string;
  /** Resolve the accessible swatch name, appending "(agotado)" when out. */
  swatchName: (colorName: string, isOut: boolean) => string;
  /** Resolve the aria-live line "{color} — {price} — {stock}". */
  liveStatus: (colorName: string, priceLabel: string, stockLabel: string) => string;
}

/** Build the compare-at display label (or null when it should not strike). */
function compareAtLabel(
  compareAtCents: number | null,
  effectiveCents: number,
): string | null {
  return shouldStrikeCompareAt(compareAtCents, effectiveCents)
    ? formatMXN(compareAtCents as number)
    : null;
}

/** Build one variant's full display bundle. */
function buildVariantDisplay(
  product: ProductDetail,
  variant: ProductVariantView,
  resolvers: DisplayResolvers,
): VariantDisplay {
  const effective = effectivePriceCents(variant, product.priceCents);
  const state = variantStockState(variant);
  const priceLabel = formatMXN(effective);
  const stockLabel = resolvers.stockLabel(state, variant.stock);
  const isOut = state === "out";

  return {
    colorLabel: resolvers.colorLabel(variant.colorName),
    swatchName: resolvers.swatchName(variant.colorName, isOut),
    stockState: state,
    stockLabel,
    effectivePriceLabel: priceLabel,
    compareAtLabel: compareAtLabel(product.compareAtPriceCents, effective),
    liveStatus: resolvers.liveStatus(variant.colorName, priceLabel, stockLabel),
  };
}

/** Build the id→display map for every variant. */
export function buildVariantDisplayMap(
  product: ProductDetail,
  resolvers: DisplayResolvers,
): Record<string, VariantDisplay> {
  const map: Record<string, VariantDisplay> = {};
  for (const variant of product.variants) {
    map[variant.id] = buildVariantDisplay(product, variant, resolvers);
  }
  return map;
}

/** Build the product-level (no-variant) display bundle. */
export function buildProductDisplay(
  product: ProductDetail,
  resolvers: DisplayResolvers,
): ProductDisplay {
  const effective = product.priceCents;
  return {
    stockState: product.stockState,
    stockLabel: resolvers.stockLabel(product.stockState, product.stock),
    effectivePriceLabel: formatMXN(effective),
    compareAtLabel: compareAtLabel(product.compareAtPriceCents, effective),
  };
}
