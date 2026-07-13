"use client";

import { CATALOG_PATH, SEARCH_PARAM_KEYS, SORT_KEYS, AVAILABILITY_ALL } from "@/lib/config";
import { Button } from "@/components/ui/button";
import {
  FacetGroup,
  FacetCheckboxGroup,
  AvailabilityToggle,
  PriceRange,
  ClearFiltersButton,
} from "@/components/catalog/filter-controls";
import { ColorSwatchGroup } from "@/components/catalog/color-swatch";
import type { CatalogFilters, FacetOptions, SortKey } from "@/lib/catalog/search.types";

/**
 * FilterPanel (T5 AC-13). ONE component rendered twice — desktop sidebar body
 * and mobile Sheet body (the `context` prop only tweaks spacing/scroll). Facet
 * options come from real DB values (passed in), never hard-coded; a facet with
 * zero options is omitted entirely (never an empty heading).
 *
 * SSR-FIRST: the whole panel is a `<form method="get" action="/sillas">` with
 * native checkbox/number/select fields whose names match the URL params, plus a
 * submit button — so it applies with JS DISABLED (edge 11). With JS, each
 * control also pushes the URL live through the shared filter navigation
 * (page → 1); the submit button is then largely redundant but harmless. Sort
 * rides this form as a native `<select name="orden">` (the JS-off sort path;
 * the toolbar `SortSelect` is the JS-on enhancement — Open Question 1).
 */

export interface FilterPanelLabels {
  title: string;
  availability: string;
  includeOutOfStock: string;
  category: string;
  brand: string;
  style: string;
  color: string;
  colorGroup: string;
  material: string;
  price: string;
  priceMin: string;
  priceMax: string;
  priceIgnored: string;
  showMore: string;
  showLess: string;
  clear: string;
  apply: string;
  sortLabel: string;
  sortOptions: Record<SortKey, string>;
}

interface FilterPanelProps {
  facets: FacetOptions;
  selected: CatalogFilters;
  labels: FilterPanelLabels;
  /** True when ≥1 user filter is active (shows Clear). */
  hasActiveFilters: boolean;
  context: "sidebar" | "sheet";
  /**
   * Locale-aware `/sillas` target for the native (JS-off) form GET and the
   * JS-off "Clear all" link, so submitting on `/en` stays on `/en/sillas` and
   * never silently switches the shopper's locale (M-3). Defaults to the
   * locale-agnostic path so tests / non-localized callers still work.
   */
  action?: string;
}

export function FilterPanel({
  facets,
  selected,
  labels,
  hasActiveFilters,
  context,
  action = CATALOG_PATH,
}: FilterPanelProps) {
  const keys = SEARCH_PARAM_KEYS;

  return (
    <form
      method="get"
      action={action}
      aria-label={labels.title}
      data-testid="filter-panel"
      data-context={context}
      className="flex flex-col gap-6"
    >
      {/* Preserve the active free-text query across a native filter submit. */}
      {selected.query !== null ? (
        <input type="hidden" name={keys.q} value={selected.query} />
      ) : null}

      <FacetGroup title={labels.availability} testId="facet-availability">
        <AvailabilityToggle
          paramName={keys.disponibilidad}
          allValue={AVAILABILITY_ALL}
          inStockOnly={selected.inStockOnly}
          label={labels.includeOutOfStock}
        />
      </FacetGroup>

      {facets.categories.length > 0 ? (
        <FacetGroup title={labels.category} testId="facet-category">
          <FacetCheckboxGroup
            facet="categoryIds"
            paramName={keys.categoria}
            options={facets.categories}
            selected={selected.categoryIds}
            showMoreLabel={labels.showMore}
            showLessLabel={labels.showLess}
          />
        </FacetGroup>
      ) : null}

      {facets.brands.length > 0 ? (
        <FacetGroup title={labels.brand} testId="facet-brand">
          <FacetCheckboxGroup
            facet="brandIds"
            paramName={keys.marca}
            options={facets.brands}
            selected={selected.brandIds}
            showMoreLabel={labels.showMore}
            showLessLabel={labels.showLess}
          />
        </FacetGroup>
      ) : null}

      {facets.styles.length > 0 ? (
        <FacetGroup title={labels.style} testId="facet-style">
          <FacetCheckboxGroup
            facet="styleIds"
            paramName={keys.estilo}
            options={facets.styles}
            selected={selected.styleIds}
            showMoreLabel={labels.showMore}
            showLessLabel={labels.showLess}
          />
        </FacetGroup>
      ) : null}

      {facets.colors.length > 0 ? (
        <FacetGroup title={labels.color} testId="facet-color">
          <ColorSwatchGroup
            colors={facets.colors}
            selected={selected.colors}
            groupLabel={labels.colorGroup}
          />
          {/* JS-off: submit selected colors via hidden inputs. */}
          {selected.colors.map((color) => (
            <input key={color} type="hidden" name={keys.color} value={color} />
          ))}
        </FacetGroup>
      ) : null}

      {facets.materials.length > 0 ? (
        <FacetGroup title={labels.material} testId="facet-material">
          <FacetCheckboxGroup
            facet="materials"
            paramName={keys.material}
            options={facets.materials}
            selected={selected.materials}
            showMoreLabel={labels.showMore}
            showLessLabel={labels.showLess}
          />
        </FacetGroup>
      ) : null}

      <FacetGroup title={labels.price} testId="facet-price">
        <PriceRange
          minParam={keys.precioMin}
          maxParam={keys.precioMax}
          priceMin={selected.priceMin}
          priceMax={selected.priceMax}
          floorCents={facets.priceFloorCents}
          ceilCents={facets.priceCeilCents}
          minLabel={labels.priceMin}
          maxLabel={labels.priceMax}
          ignoredNote={labels.priceIgnored}
          showIgnored={selected.priceRangeIgnored}
        />
      </FacetGroup>

      {/* JS-off sort control: a native <select> inside the filter form. The
          client toolbar SortSelect is the JS-on enhancement (Open Question 1). */}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold tracking-tight">{labels.sortLabel}</span>
        <select
          name={keys.orden}
          defaultValue={selected.sort}
          data-testid="filter-sort-native"
          className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {labels.sortOptions[key]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        {/* Submit is the JS-off apply path; harmless when JS enhances live. */}
        <Button type="submit" size="lg" className="min-h-11" data-testid="filter-apply">
          {labels.apply}
        </Button>
        {hasActiveFilters ? (
          <ClearFiltersButton label={labels.clear} href={action} />
        ) : null}
      </div>
    </form>
  );
}
