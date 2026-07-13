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
 * (page → 1).
 *
 * JS-OFF CONTRACT (C-1, M-1). The interactive controls are Radix primitives
 * (a `<button role="checkbox">`), which submit NOTHING in a native form. So the
 * source of truth for a native (JS-off) submit is a set of always-present
 * `<input type="hidden">` fields that mirror the *selected* state — the same
 * pattern the color facet already uses. The Radix checkbox is left `name`-less
 * (no hydrated Radix `BubbleInput`) so it never double-submits alongside the
 * hidden mirror; it exists purely for the JS-on live toggle. Prices submit in
 * CENTS via a hidden input (the visible field is display-only pesos) so the
 * native URL contract matches the parser (which reads cents).
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
      {/* JS-off: mirror EVERY selected value (even ones collapsed under "Ver más")
          as a hidden input so a native submit posts the full facet selection.
          The Radix Checkbox below is `name`-less, so it contributes nothing to a
          native submit and never double-posts with these (C-1). */}
      {selected.map((value) => (
        <input key={value} type="hidden" name={paramName} value={value} />
      ))}
      {visible.map((option) => {
        const checked = selectedSet.has(option.value);
        return (
          <div key={option.value} className="flex items-center gap-2">
            <Checkbox
              id={`${facet}-${option.value}`}
              checked={checked}
              data-testid={`filter-${facet}-${option.value}`}
              onCheckedChange={(next) =>
                toggleValue(facet, option.value, next === true)
              }
            />
            <Label
              htmlFor={`${facet}-${option.value}`}
              className="flex min-h-11 flex-1 cursor-pointer items-center text-sm font-normal"
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

/**
 * The availability control (AC-5). Modeled as an "include out of stock" opt-in
 * so it is expressible in pure HTML (C-2): a NATIVE checkbox named
 * `disponibilidad` with value `todos`. Default catalog view = unchecked = posts
 * nothing = in-stock only. Checking it posts `disponibilidad=todos` on a native
 * (JS-off) submit, exactly the value the parser reads. With JS it also pushes
 * the URL live. Styled to match the Radix `Checkbox` peers.
 */
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
  const includeOutOfStock = !inStockOnly;
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id="availability-include-oos"
        name={paramName}
        value={allValue}
        checked={includeOutOfStock}
        data-testid="filter-in-stock"
        onChange={(event) =>
          apply({ ...filters, inStockOnly: !event.target.checked })
        }
        className={cn(
          "peer size-4 shrink-0 cursor-pointer rounded-[4px] border border-input accent-primary outline-none",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        )}
      />
      <Label
        htmlFor="availability-include-oos"
        className="flex min-h-11 flex-1 cursor-pointer items-center text-sm font-normal"
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

  // Re-sync the controlled fields when the URL-derived props change out from
  // under us (chip removal / Clear-all re-renders the panel with new props but
  // `useState` initializers do not re-run) — M-4. React's "adjust state during
  // render" pattern (no effect): a single synced-key holds the last props we
  // synced, and we correct both fields in the render where they change.
  const syncKey = `${priceMin ?? ""}:${priceMax ?? ""}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey);
    setMinPesos(centsToField(priceMin));
    setMaxPesos(centsToField(priceMax));
  }

  const commit = (): void => {
    apply({
      ...filters,
      priceMin: fieldToCents(minPesos),
      priceMax: fieldToCents(maxPesos),
      priceRangeIgnored: false,
    });
  };

  // URL contract for price is PESOS (the unit the shopper sees + types), which
  // the parser converts to internal cents. So the visible field IS the native
  // (JS-off) submitter under the canonical param name — a JS-off shopper can
  // type a bound and submit it correctly (no 100x cents/pesos mismatch, M-1).
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
