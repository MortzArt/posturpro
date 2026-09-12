"use client";

import { cn } from "@/lib/utils";
import type { ChairReference } from "@/lib/config/calculator";

/**
 * ModelChips — the savings calculator's model picker as a single-select chip
 * row (owner request 2026-09-12; replaces the dropdown so every option is one
 * tap away and visible at once). Semantics: `radiogroup` of `radio` buttons
 * with `aria-checked`; the visual language matches the catalog filter chips
 * (hairline outline → filled brand green when selected). Transform-only press
 * feedback, colour transitions ~150ms ease-out, reduced motion drops them.
 */

interface ModelChipsProps {
  models: readonly ChairReference[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Group label id (the visible "Chair model" label). */
  labelledBy: string;
  formatLabel: (chair: ChairReference) => string;
}

export function ModelChips({
  models,
  selectedId,
  onSelect,
  labelledBy,
  formatLabel,
}: ModelChipsProps) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex flex-wrap gap-2"
      data-testid="calc-model-chips"
    >
      {models.map((chair) => {
        const selected = chair.id === selectedId;
        return (
          <button
            key={chair.id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`calc-model-${chair.id}`}
            onClick={() => onSelect(chair.id)}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium select-none outline-none",
              "transition-[background-color,border-color,color,transform] duration-150 ease-out motion-reduce:transition-none",
              "active:scale-[0.97] motion-reduce:active:transform-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-foreground/30 hover:bg-muted",
            )}
          >
            {formatLabel(chair)}
          </button>
        );
      })}
    </div>
  );
}
