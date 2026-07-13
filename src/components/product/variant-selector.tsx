"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { ProductVariantView } from "@/lib/catalog/product-detail.types";

/**
 * VariantSelector (T4 AC-7, AC-18) — one color swatch per variant, rendered as a
 * hand-rolled roving-tabindex `radiogroup` (Radix RadioGroup isn't installed and
 * swatches need custom color rendering). Raises the selected id to the purchase
 * panel; not rendered when a product has 0 variants (the panel gates that).
 *
 * A11y contract: container `role="radiogroup"`; each swatch `role="radio"` with
 * `aria-checked` and a pre-resolved accessible name (incl. "(agotado)" when out
 * of stock — color is never the only signal). Arrow keys move selection+focus
 * (wrapping); Home/End jump; Space/Enter select. Only the selected swatch is in
 * the tab order (roving tabindex).
 */

interface VariantSelectorProps {
  variants: ProductVariantView[];
  selectedVariantId: string;
  onSelect: (variantId: string) => void;
  /** radiogroup accessible name ("Elige un color"). */
  groupLabel: string;
  /** id → accessible name incl. "(agotado)" suffix when out of stock. */
  swatchNames: Record<string, string>;
  /** id → whether the variant is out of stock (dim + colorless slash). */
  outOfStock: Record<string, boolean>;
}

export function VariantSelector({
  variants,
  selectedVariantId,
  onSelect,
  groupLabel,
  swatchNames,
  outOfStock,
}: VariantSelectorProps) {
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const selectedIndex = variants.findIndex(
    (variant) => variant.id === selectedVariantId,
  );

  const focusAndSelect = (index: number): void => {
    const target = variants[index];
    if (!target) {
      return;
    }
    onSelect(target.id);
    buttonRefs.current.get(target.id)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    const count = variants.length;
    if (count === 0) {
      return;
    }
    const current = selectedIndex < 0 ? 0 : selectedIndex;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAndSelect((current + 1) % count);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAndSelect((current - 1 + count) % count);
        break;
      case "Home":
        event.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        event.preventDefault();
        focusAndSelect(count - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      className="flex flex-wrap gap-1"
      onKeyDown={handleKeyDown}
      data-testid="variant-selector"
    >
      {variants.map((variant) => {
        const isSelected = variant.id === selectedVariantId;
        const isOut = outOfStock[variant.id] ?? false;
        return (
          <button
            key={variant.id}
            ref={(node) => {
              if (node) {
                buttonRefs.current.set(variant.id, node);
              } else {
                buttonRefs.current.delete(variant.id);
              }
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={swatchNames[variant.id] ?? variant.colorName}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(variant.id)}
            data-testid={`variant-swatch-${variant.id}`}
            data-selected={isSelected}
            className="group/swatch inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-1 outline-none"
          >
            <span
              className={cn(
                "swatch-press relative flex size-9 items-center justify-center overflow-hidden rounded-full border border-border",
                "outline-none ring-offset-background group-focus-visible/swatch:ring-2 group-focus-visible/swatch:ring-ring group-focus-visible/swatch:ring-offset-2",
                isSelected &&
                  "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                isOut && "opacity-60",
              )}
              style={{
                backgroundColor: variant.colorHex ?? "var(--muted)",
              }}
            >
              {isOut ? (
                <span
                  aria-hidden
                  className="absolute h-px w-[140%] rotate-45 bg-foreground/70"
                />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
