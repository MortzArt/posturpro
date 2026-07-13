"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Tick01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useFilterNavigation } from "@/components/catalog/filter-navigation";
import type { ColorFacetOption } from "@/lib/catalog/search.types";

/**
 * ColorSwatchGroup (T5 AC-4 color OR-within-facet). A MULTI-SELECT group of
 * checkbox-semantics swatch buttons — each `role="checkbox" aria-checked` with
 * an `aria-label` of the color NAME (never color alone), each independently
 * tabbable (WAI-ARIA multi-select), `Space`/`Enter` toggles. Selection shows a
 * ring AND a centered ✓ so it never relies on color alone. Reuses `.swatch-press`
 * (scale(0.97) on :active, RM-safe) — no enter animation (high-frequency, M-5).
 *
 * Light swatches keep a border so they're visible on the white panel; the ✓
 * renders dark on light swatches / light on dark (precomputed `checkOnLight`).
 */

interface ColorSwatchGroupProps {
  colors: ColorFacetOption[];
  selected: string[];
  groupLabel: string;
}

export function ColorSwatchGroup({
  colors,
  selected,
  groupLabel,
}: ColorSwatchGroupProps) {
  const { toggleValue } = useFilterNavigation();
  const selectedSet = new Set(selected);

  return (
    <div
      role="group"
      aria-label={groupLabel}
      className="flex flex-wrap gap-3"
      data-testid="color-swatches"
    >
      {colors.map((color) => {
        const isSelected = selectedSet.has(color.value);
        return (
          <button
            key={color.value}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={color.label}
            data-testid={`color-swatch-${color.value}`}
            onClick={() => toggleValue("colors", color.value, !isSelected)}
            className={cn(
              "swatch-press relative inline-flex size-9 items-center justify-center rounded-full border border-border outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isSelected && "ring-2 ring-foreground ring-offset-2",
            )}
            style={{ backgroundColor: color.hex }}
          >
            {isSelected ? (
              <HugeiconsIcon
                icon={Tick01Icon}
                size={16}
                strokeWidth={2.5}
                aria-hidden
                className={color.checkOnLight ? "text-foreground" : "text-background"}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
