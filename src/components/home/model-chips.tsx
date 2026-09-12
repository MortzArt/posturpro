"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { ChairReference } from "@/lib/config/calculator";

/**
 * ModelChips — the savings calculator's model picker.
 *
 * From `sm` up: a single-select chip row (owner request 2026-09-12; every
 * option one tap away and visible at once). Semantics: `radiogroup` of `radio`
 * buttons with `aria-checked`; the visual language matches the catalog filter
 * chips (hairline outline → filled brand green when selected). Transform-only
 * press feedback, colour transitions ~150ms ease-out, reduced motion drops them.
 *
 * On phones (< `sm`) the six chips wrapped into five rows and pushed the result
 * below the fold, so the picker is a LARGE native `<select>` instead (owner
 * request 2026-09-13) — the OS picker is the better one-thumb control there.
 * Both controls share the visible label via `labelledBy`.
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
    <>
      <div className="relative sm:hidden">
        <select
          aria-labelledby={labelledBy}
          value={selectedId}
          onChange={(event) => onSelect(event.target.value)}
          data-testid="calc-model-select"
          className={cn(
            "h-12 w-full appearance-none rounded-md border border-border bg-card pr-11 pl-4 text-base font-medium text-foreground outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          {models.map((chair) => (
            <option key={chair.id} value={chair.id}>
              {formatLabel(chair)}
            </option>
          ))}
        </select>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={20}
          strokeWidth={2}
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        className="hidden flex-wrap gap-2 sm:flex"
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
    </>
  );
}
