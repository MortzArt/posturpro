"use client";

import { useMemo, useState } from "react";
import { StockBadge } from "@/components/catalog/stock-badge";
import { ProductGallery } from "@/components/product/product-gallery";
import { VariantSelector } from "@/components/product/variant-selector";
import {
  defaultVariant,
  imagesForVariant,
} from "@/lib/catalog/variant-selection";
import type { StockState } from "@/lib/catalog/types";
import type {
  ProductImageView,
  ProductVariantView,
} from "@/lib/catalog/product-detail.types";

/**
 * ProductPurchasePanel (T4 AC-7, AC-8, AC-9) — THE ONE selection island and the
 * single source of truth for `selectedVariantId`. It owns selection state and,
 * via pre-resolved server-built display strings (`variantDisplay`) plus the pure
 * `imagesForVariant` helper, keeps the gallery, price, and stock badge in sync
 * on every selection. The panel does ZERO client-side i18n — every string is
 * resolved on the server and passed in (SRP, mirrors the T3 grid discipline).
 *
 * The gallery renders both here (mobile: stacked below) and as the left column
 * on `lg`; this component composes the gallery + info so a variant change
 * retargets the gallery images from one place. Layout ordering is handled by the
 * page's grid — this island renders gallery then info in source order, and the
 * page places it to span the two-column split.
 */

/** Per-variant display strings, pre-resolved on the server. */
export interface VariantDisplay {
  colorLabel: string;
  swatchName: string;
  stockState: StockState;
  stockLabel: string;
  effectivePriceLabel: string;
  compareAtLabel: string | null;
  liveStatus: string;
}

/** No-variant (product-level) display strings. */
export interface ProductDisplay {
  stockState: StockState;
  stockLabel: string;
  effectivePriceLabel: string;
  compareAtLabel: string | null;
}

export interface PurchasePanelLabels {
  variantGroupLabel: string;
  galleryRegion: string;
  galleryZoom: string;
  galleryClose: string;
  galleryPlaceholder: string;
  /** Template "Ver imagen {number}", interpolated per-thumb client-side. */
  thumbnailAltTemplate: string;
  priceCompareLabel: string;
}

interface ProductPurchasePanelProps {
  productName: string;
  brandName: string | null;
  variants: ProductVariantView[];
  allImages: ProductImageView[];
  variantDisplay: Record<string, VariantDisplay>;
  productDisplay: ProductDisplay;
  labels: PurchasePanelLabels;
}

export function ProductPurchasePanel({
  productName,
  brandName,
  variants,
  allImages,
  variantDisplay,
  productDisplay,
  labels,
}: ProductPurchasePanelProps) {
  const hasVariants = variants.length > 0;
  const [selectedVariantId, setSelectedVariantId] = useState(
    () => defaultVariant(variants)?.id ?? "",
  );

  // Single source of truth for "the default variant is index 0": both the
  // initial seed above and this fallback route through `defaultVariant` (M-4).
  const selectedVariant = hasVariants
    ? (variants.find((variant) => variant.id === selectedVariantId) ??
      defaultVariant(variants))
    : null;

  const images = useMemo(
    () => imagesForVariant(allImages, selectedVariant?.id ?? null),
    [allImages, selectedVariant],
  );

  const display: VariantDisplay | ProductDisplay =
    selectedVariant && variantDisplay[selectedVariant.id]
      ? variantDisplay[selectedVariant.id]
      : productDisplay;

  const swatchNames = useMemo(
    () => mapVariant(variantDisplay, (entry) => entry.swatchName),
    [variantDisplay],
  );
  const outOfStock = useMemo(
    () => mapVariant(variantDisplay, (entry) => entry.stockState === "out"),
    [variantDisplay],
  );

  const liveStatus =
    selectedVariant && variantDisplay[selectedVariant.id]
      ? variantDisplay[selectedVariant.id].liveStatus
      : "";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
      <div className="lg:sticky lg:top-20 lg:self-start">
        <ProductGallery
          key={selectedVariant?.id ?? "product"}
          images={images}
          productName={productName}
          labels={{
            imagePlaceholder: labels.galleryPlaceholder,
            zoom: labels.galleryZoom,
            close: labels.galleryClose,
            thumbnailAltTemplate: labels.thumbnailAltTemplate,
            regionLabel: labels.galleryRegion,
          }}
        />
      </div>

      <div className="flex flex-col gap-4">
        {brandName ? (
          <p className="text-xs text-muted-foreground">{brandName}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {productName}
        </h1>

        <PriceRow
          effectivePriceLabel={display.effectivePriceLabel}
          compareAtLabel={display.compareAtLabel}
          compareLabel={labels.priceCompareLabel}
        />

        <StockBadge
          state={display.stockState}
          label={display.stockLabel}
          className="self-start"
        />

        {hasVariants && selectedVariant ? (
          <div className="flex flex-col gap-2">
            <p
              key={selectedVariant.id}
              className="price-value text-sm font-medium text-foreground"
              data-testid="variant-color-label"
            >
              {variantDisplay[selectedVariant.id]?.colorLabel ??
                selectedVariant.colorName}
            </p>
            <VariantSelector
              variants={variants}
              selectedVariantId={selectedVariant.id}
              onSelect={setSelectedVariantId}
              groupLabel={labels.variantGroupLabel}
              swatchNames={swatchNames}
              outOfStock={outOfStock}
            />
          </div>
        ) : null}

        <p
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="variant-live-status"
        >
          {liveStatus}
        </p>
      </div>
    </div>
  );
}

/** Price + optional struck compare-at, crossfading on the value change (M5). */
function PriceRow({
  effectivePriceLabel,
  compareAtLabel,
  compareLabel,
}: {
  effectivePriceLabel: string;
  compareAtLabel: string | null;
  compareLabel: string;
}) {
  return (
    <p
      className="flex flex-wrap items-baseline gap-2"
      data-testid="product-price"
    >
      <span
        key={effectivePriceLabel}
        className="price-value text-xl font-semibold tabular-nums text-foreground md:text-2xl"
      >
        {effectivePriceLabel}
      </span>
      {compareAtLabel ? (
        <span
          key={compareAtLabel}
          className="price-value text-sm tabular-nums text-muted-foreground line-through"
          data-testid="product-compare-at"
        >
          <span className="sr-only">{compareLabel} </span>
          {compareAtLabel}
        </span>
      ) : null}
    </p>
  );
}

/** Project a variant-display map to an id→value record. */
function mapVariant<T>(
  variantDisplay: Record<string, VariantDisplay>,
  select: (entry: VariantDisplay) => T,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [id, entry] of Object.entries(variantDisplay)) {
    result[id] = select(entry);
  }
  return result;
}
