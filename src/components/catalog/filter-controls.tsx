"use client";

import { useId, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { FilterSwitch } from "@/components/catalog/filter-switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FILTER_FACET_COLLAPSE_AFTER } from "@/lib/config";
import {
  useDeferredFilters,
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
          "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium select-none",
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
          size={13}
          strokeWidth={2.5}
          aria-hidden
          className="-ml-0.5 shrink-0"
        />
        <span className="truncate">{label}</span>
      </span>
    </label>
  );
}

/**
 * A labelled facet group. A `<div role="group" aria-labelledby>` rather than
 * `<fieldset>/<legend>`: a legend is rendered OUTSIDE its parent's flex flow, so
 * `gap` never applied between the title and the first control and the rhythm
 * drifted group to group. As a plain flex item the title spacing is exact.
 */
export function FacetGroup({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  const headingId = useId();
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="flex flex-col gap-2.5"
      data-testid={testId}
    >
      <p
        id={headingId}
        className="font-heading text-sm font-semibold leading-none tracking-[-0.02em] text-foreground"
      >
        {title}
      </p>
      {children}
    </div>
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
    <div className="flex flex-col gap-2.5">
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
 * the URL live. Rendered as a `FilterSwitch` (on/off toggle, owner request
 * 2026-09-12) — the one boolean facet, distinct from the multi-select chips.
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
    <FilterSwitch
      id="availability-include-oos"
      name={paramName}
      value={allValue}
      label={label}
      checked={includeOutOfStock}
      testId="filter-in-stock"
      onCheckedChange={(next) => patch({ inStockOnly: !next })}
    />
  );
}

export function ClearFiltersButton({
  label,
  href,
  className,
}: {
  label: string;
  href: string;
  className?: string;
}) {
  // Inside the mobile sheet (deferred mode) clearing edits the draft — the
  // shopper still taps Apply to navigate. Elsewhere it is a plain link so it
  // also works JS-off.
  const deferred = useDeferredFilters();
  if (deferred) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="lg"
        className={cn("min-h-11", className)}
        data-testid="clear-filters"
        onClick={deferred.reset}
      >
        {label}
      </Button>
    );
  }
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
