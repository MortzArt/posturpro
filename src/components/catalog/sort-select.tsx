"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SORT_KEYS } from "@/lib/config";
import { useFilterNavigation } from "@/components/catalog/filter-navigation";
import type { SortKey } from "@/lib/catalog/search.types";

/**
 * SortSelect (T5 AC-7). Six sort options; default best-selling. On change it
 * pushes the new `orden` via the shared filter navigation (page → 1, other
 * params preserved). Trigger-anchored origin + <250ms open motion come from the
 * retrofitted `.select-content-motion` (M-3).
 *
 * JS-off path: sort also rides the filter `<form>` as a native `<select
 * name="orden">` (rendered by `FilterPanel`), so this enhanced control is the
 * JS-on overlay and never the sole path (Open Question 1, resolved: the filter
 * form carries the JS-off `<select>`; this toolbar Select is the enhancement).
 */

interface SortSelectProps {
  value: SortKey;
  labels: Record<SortKey, string>;
  ariaLabel: string;
  prefix: string;
}

export function SortSelect({ value, labels, ariaLabel, prefix }: SortSelectProps) {
  const { filters, apply } = useFilterNavigation();

  const onChange = (next: string): void => {
    if (!(SORT_KEYS as readonly string[]).includes(next)) return;
    apply({ ...filters, sort: next as SortKey });
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:inline">{prefix}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          data-testid="sort-select"
          aria-label={ariaLabel}
          className="h-11 min-w-[10rem]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_KEYS.map((key) => (
            <SelectItem key={key} value={key} data-testid={`sort-option-${key}`}>
              {labels[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
