"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMXN } from "@/lib/money";
import { FILTER_FACET_COLLAPSE_AFTER } from "@/lib/config";
import {
  useFilterNavigation,
  type MultiFacet,
} from "@/components/catalog/filter-navigation";
import type { FacetOption } from "@/lib/catalog/search.types";

/**
 * The individual T5 filter controls (AC-4, AC-5). Each is a small, focused
 * client control that mutates the URL through the shared filter navigation
 * (page → 1). They ALSO render real form fields (checkbox names match the URL
 * params) so the enclosing `<form method="get">` submits natively with JS off.
 */

/** A group heading (fieldset legend) used by every facet group. */
export function FacetGroup({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-3" data-testid={testId}>
      <legend className="text-sm font-semibold tracking-tight">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Multi-select checkbox list for a facet, with "Ver más" collapse past N. */
export function FacetCheckboxGroup({
  facet,
  paramName,
  options,
  selected,
  showMoreLabel,
  showLessLabel,
}: {
  facet: MultiFacet;
  paramName: string;
  options: FacetOption[];
  selected: string[];
  showMoreLabel: string;
  showLessLabel: string;
}) {
  const { toggleValue } = useFilterNavigation();
  const [expanded, setExpanded] = useState(false);
  const selectedSet = new Set(selected);

  const collapses = options.length > FILTER_FACET_COLLAPSE_AFTER;
  const visible =
    collapses && !expanded ? options.slice(0, FILTER_FACET_COLLAPSE_AFTER) : options;

  return (
    <div className="flex flex-col gap-2">
      {visible.map((option) => {
        const checked = selectedSet.has(option.value);
        return (
          <div key={option.value} className="flex items-center gap-2">
            <Checkbox
              id={`${facet}-${option.value}`}
              name={paramName}
              value={option.value}
              checked={checked}
              data-testid={`filter-${facet}-${option.value}`}
              onCheckedChange={(next) =>
                toggleValue(facet, option.value, next === true)
              }
            />
            <Label
              htmlFor={`${facet}-${option.value}`}
              className="min-h-6 cursor-pointer text-sm font-normal"
            >
              {option.label}
            </Label>
          </div>
        );
      })}
      {collapses ? (
        <button
          type="button"
          data-testid={`filter-${facet}-toggle`}
          onClick={() => setExpanded((prev) => !prev)}
          className="self-start text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? showLessLabel : showMoreLabel}
        </button>
      ) : null}
    </div>
  );
}

/** The availability toggle: "Solo en stock" checked by default (AC-5). */
export function AvailabilityToggle({
  paramName,
  allValue,
  inStockOnly,
  label,
}: {
  paramName: string;
  allValue: string;
  inStockOnly: boolean;
  label: string;
}) {
  const { filters, apply } = useFilterNavigation();
  return (
    <div className="flex items-center gap-2">
      {/* JS-off: an UNCHECKED "solo en stock" box must post disponibilidad=todos.
          We model it as a checkbox that, when UNCHECKED, includes OOS. To keep
          the native form correct, a hidden input posts `todos` only when the
          box is unchecked is not expressible in pure HTML; instead the box's
          own name posts nothing when unchecked, so JS-off default (box present,
          checked) yields in-stock, and the shopper unchecks + submits to see
          OOS via the explicit control below. The client path is authoritative. */}
      <Checkbox
        id="availability-in-stock"
        checked={inStockOnly}
        data-testid="filter-in-stock"
        onCheckedChange={(next) =>
          apply({ ...filters, inStockOnly: next === true })
        }
      />
      {/* When the box is unchecked (include OOS), post disponibilidad=todos for JS-off. */}
      {!inStockOnly ? (
        <input type="hidden" name={paramName} value={allValue} />
      ) : null}
      <Label
        htmlFor="availability-in-stock"
        className="min-h-6 cursor-pointer text-sm font-normal"
      >
        {label}
      </Label>
    </div>
  );
}

/** Two numeric price inputs (cents in URL, pesos in the field). */
export function PriceRange({
  minParam,
  maxParam,
  priceMin,
  priceMax,
  floorCents,
  ceilCents,
  minLabel,
  maxLabel,
  ignoredNote,
  showIgnored,
}: {
  minParam: string;
  maxParam: string;
  priceMin: number | null;
  priceMax: number | null;
  floorCents: number;
  ceilCents: number;
  minLabel: string;
  maxLabel: string;
  ignoredNote: string;
  showIgnored: boolean;
}) {
  const { filters, apply } = useFilterNavigation();
  const [minPesos, setMinPesos] = useState(centsToField(priceMin));
  const [maxPesos, setMaxPesos] = useState(centsToField(priceMax));

  const commit = (): void => {
    apply({
      ...filters,
      priceMin: fieldToCents(minPesos),
      priceMax: fieldToCents(maxPesos),
      priceRangeIgnored: false,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {formatMXN(floorCents)} – {formatMXN(ceilCents)}
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          name={minParam}
          data-testid="filter-price-min"
          aria-label={minLabel}
          placeholder={minLabel}
          min={0}
          value={minPesos}
          onChange={(event) => setMinPesos(event.target.value)}
          onBlur={commit}
          className="h-11"
        />
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        <Input
          type="number"
          inputMode="numeric"
          name={maxParam}
          data-testid="filter-price-max"
          aria-label={maxLabel}
          placeholder={maxLabel}
          min={0}
          value={maxPesos}
          onChange={(event) => setMaxPesos(event.target.value)}
          onBlur={commit}
          className="h-11"
        />
      </div>
      {showIgnored ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="price-ignored-note"
          role="note"
        >
          {ignoredNote}
        </p>
      ) : null}
    </div>
  );
}

/** Ghost "Clear all" button that navigates to the clean catalog. */
export function ClearFiltersButton({
  label,
  href,
  className,
}: {
  label: string;
  href: string;
  className?: string;
}) {
  return (
    <Button asChild variant="ghost" size="lg" className={cn("min-h-11", className)}>
      <a href={href} data-testid="clear-filters">
        {label}
      </a>
    </Button>
  );
}

/** Cents → the pesos string shown in a price field (empty when null). */
function centsToField(cents: number | null): string {
  return cents === null ? "" : String(Math.round(cents / 100));
}

/** A pesos field string → integer cents, or null when empty/invalid. */
function fieldToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const pesos = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(pesos) || pesos < 0) return null;
  return pesos * 100;
}
