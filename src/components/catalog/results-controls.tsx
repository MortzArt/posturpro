"use client";

import { SortSelect } from "@/components/catalog/sort-select";
import { FilterSheet } from "@/components/catalog/filter-sheet";
import { FilterPanel } from "@/components/catalog/filter-panel";
import type { CatalogLabels } from "@/components/catalog/catalog-toolbar";
import type { CatalogFilters, FacetOptions } from "@/lib/catalog/search.types";

/**
 * CatalogResultsControls — the right-hand end of the results-count line (owner
 * request 2026-09-12): the mobile/tablet "Filtros" Sheet trigger (`< lg`, hosts
 * the FilterPanel) and the SortSelect. Rendered INSIDE `SearchResults` (server)
 * as a passed-through client element, so it sits on the same line as the count
 * and still lives under the shell's `FilterNavigationProvider`.
 */

interface CatalogResultsControlsProps {
  filters: CatalogFilters;
  facets: FacetOptions;
  labels: CatalogLabels;
  activeFilterCount: number;
  /** Locale-aware `/sillas` target for the sheet panel's native form (M-3). */
  catalogAction: string;
}

export function CatalogResultsControls({
  filters,
  facets,
  labels,
  activeFilterCount,
  catalogAction,
}: CatalogResultsControlsProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-2"
      data-testid="results-controls"
    >
      <FilterSheet activeCount={activeFilterCount} labels={labels.filterSheet}>
        <FilterPanel
          context="sheet"
          facets={facets}
          labels={labels.filterPanel}
          action={catalogAction}
        />
      </FilterSheet>
      <SortSelect
        value={filters.sort}
        labels={labels.sortOptions}
        ariaLabel={labels.sortAriaLabel}
        prefix={labels.sortPrefix}
      />
    </div>
  );
}
