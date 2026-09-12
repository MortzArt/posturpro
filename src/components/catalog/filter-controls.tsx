"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
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
 * FACET OPTIONS ARE CHOICE CHIPS (owner request 2026-09-12): each option is a
 * `FilterChip` — a NATIVE `<input type="checkbox">` stretched (invisibly) over a
 * styled pill, so the control keeps real checkbox semantics (label, keyboard,
 * `:checked`, form participation) while reading as a tappable chip. Selected =
 * filled brand green with a tick glyph; unselected = hairline outline.
 *
 * JS-OFF CONTRACT (C-1, M-1). Multi-facet chips are `name`-less; the source of
 * truth for a native (JS-off) submit is the set of always-present
 * `<input type="hidden">` fields mirroring the *selected* state (even options
 * collapsed under "Ver más") — the same pattern the color facet uses — so a chip
 * never double-posts. The availability chip IS named (single opt-in value) and
 * posts natively. Prices submit in pesos under the canonical param.
 */

/**
 * A choice chip backed by a native checkbox. The input is the full hit target
 * (absolute, `opacity-0`, covers the pill) so pointer + keyboard + Playwright all
 * address the real control; the sibling `<span>` paints the state via `peer-*`.
 */
export function FilterChip({
  id,
  label,
  checked,
  onCheckedChange,
  name,
  value,
  testId,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  name?: string;
  value?: string;
  testId?: string;
}) {
  return (
    <label htmlFor={id} className="relative inline-flex max-w-full">
      <input
        type="checkbox"
        id={id}
        name={name}
        value={value}
        checked={checked}
        data-testid={testId}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-full opacity-0"
      />
      <span
        className={cn(
          "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-4 text-sm font-medium select-none",
          "border-border bg-card text-foreground",
          "transition-[background-color,border-color,color,transform] duration-150 ease-out motion-reduce:transition-none",
          "peer-hover:border-foreground/30 peer-hover:bg-muted",
          "peer-active:scale-[0.97] motion-reduce:peer-active:transform-none",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:hover:bg-primary",
          "[&>svg]:hidden peer-checked:[&>svg]:block",
        )}
      >
        <HugeiconsIcon
          icon={Tick02Icon}
          size={14}
          strokeWidth={2.5}
          aria-hidden
          className="shrink-0"
        />
        <span className="truncate">{label}</span>
      </span>
    </label>
  );
}

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
      <legend className="font-heading text-sm font-semibold tracking-[-0.02em]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** Multi-select choice-chip group for a facet, with "Ver más" collapse past N. */
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
    collapses && !expanded
      ? options.slice(0, FILTER_FACET_COLLAPSE_AFTER)
      : options;

  return (
    <div className="flex flex-col gap-2">
      {/* JS-off: mirror EVERY selected value (even ones collapsed under "Ver más")
          as a hidden input so a native submit posts the full facet selection.
          The chips below are `name`-less, so they contribute nothing to a native
          submit and never double-post with these (C-1). */}
      {selected.map((value) => (
        <input key={value} type="hidden" name={paramName} value={value} />
      ))}
      <div className="flex flex-wrap gap-2">
        {visible.map((option) => (
          <FilterChip
            key={option.value}
            id={`${facet}-${option.value}`}
            label={option.label}
            checked={selectedSet.has(option.value)}
            testId={`filter-${facet}-${option.value}`}
            onCheckedChange={(next) => toggleValue(facet, option.value, next)}
          />
        ))}
      </div>
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
 * the URL live. Rendered as a `FilterChip` like every other facet option.
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
  const { patch } = useFilterNavigation();
  const includeOutOfStock = !inStockOnly;
  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip
        id="availability-include-oos"
        name={paramName}
        value={allValue}
        label={label}
        checked={includeOutOfStock}
        testId="filter-in-stock"
        onCheckedChange={(next) => patch({ inStockOnly: !next })}
      />
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
  const { patch } = useFilterNavigation();
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
    patch({
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
    <Button
      asChild
      variant="ghost"
      size="lg"
      className={cn("min-h-11", className)}
    >
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
