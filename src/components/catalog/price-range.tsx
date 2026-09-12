"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useFilterNavigation } from "@/components/catalog/filter-navigation";
import { priceStepsPesos } from "@/lib/catalog/price-steps";
import { formatMXN } from "@/lib/money";

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

  // Phones get dropdowns (owner request 2026-09-13). They drive the SAME field
  // state as the text inputs, so the (hidden) named inputs still carry the
  // value for a native submit, and a change applies immediately (in the sheet
  // that means: into the deferred draft).
  const steps = priceStepsPesos(floorCents, ceilCents);
  const selectBound = (field: "min" | "max", value: string): void => {
    const nextMin = field === "min" ? value : minPesos;
    const nextMax = field === "max" ? value : maxPesos;
    setMinPesos(nextMin);
    setMaxPesos(nextMax);
    patch({
      priceMin: fieldToCents(nextMin),
      priceMax: fieldToCents(nextMax),
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
      <div className="flex items-center gap-2 sm:hidden">
        <PriceSelect
          value={minPesos}
          steps={steps}
          emptyLabel={minLabel}
          ariaLabel={minLabel}
          testId="filter-price-min-select"
          onChange={(value) => selectBound("min", value)}
        />
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        <PriceSelect
          value={maxPesos}
          steps={steps}
          emptyLabel={maxLabel}
          ariaLabel={maxLabel}
          testId="filter-price-max-select"
          onChange={(value) => selectBound("max", value)}
        />
      </div>
      <div className="hidden items-center gap-2 sm:flex">
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

/** Large native select for one price bound; "" = no bound. A bound typed on
 * desktop that is not a ladder step is kept as an extra option so the select
 * never shows a value it does not contain. */
function PriceSelect({
  value,
  steps,
  emptyLabel,
  ariaLabel,
  testId,
  onChange,
}: {
  value: string;
  steps: readonly number[];
  emptyLabel: string;
  ariaLabel: string;
  testId: string;
  onChange: (value: string) => void;
}) {
  const current = value.trim() === "" ? null : Number.parseInt(value, 10);
  const options =
    current !== null && Number.isFinite(current) && !steps.includes(current)
      ? [...steps, current].sort((left, right) => left - right)
      : steps;
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      data-testid={testId}
      className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="">{emptyLabel}</option>
      {options.map((pesos) => (
        <option key={pesos} value={String(pesos)}>
          {formatMXN(pesos * 100)}
        </option>
      ))}
    </select>
  );
}

function centsToField(cents: number | null): string {
  return cents === null ? "" : String(Math.round(cents / 100));
}

function fieldToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const pesos = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(pesos) || pesos < 0) return null;
  return pesos * 100;
}
