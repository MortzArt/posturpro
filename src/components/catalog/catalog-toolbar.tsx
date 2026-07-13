"use client";

import { CATALOG_PATH } from "@/lib/config";
import { SearchBox } from "@/components/catalog/search-box";
import { SortSelect } from "@/components/catalog/sort-select";
import { FilterSheet } from "@/components/catalog/filter-sheet";
import { FilterPanel, type FilterPanelLabels } from "@/components/catalog/filter-panel";
import type {
  CatalogFilters,
  FacetOptions,
  SortKey,
} from "@/lib/catalog/search.types";

/**
 * CatalogToolbar (T5) — the row(s) above the grid: the search echo field, the
 * mobile/tablet "Filtros" Sheet trigger (which hosts the FilterPanel), and the
 * SortSelect. Client composer so all three share the FilterNavigationProvider
 * (its enclosing parent supplies the context). Keeps `sillas/page.tsx` thin.
 */

export interface ToolbarLabels {
  searchPlaceholder: string;
  searchAriaLabel: string;
  searchClear: string;
  searchSubmit: string;
  searchOpen: string;
  sortAriaLabel: string;
  sortPrefix: string;
  sortOptions: Record<SortKey, string>;
  filterSheet: {
    trigger: string;
    triggerCount: string;
    title: string;
    close: string;
    apply: string;
  };
  filterPanel: FilterPanelLabels;
}

interface CatalogToolbarProps {
  filters: CatalogFilters;
  facets: FacetOptions;
  labels: ToolbarLabels;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  /** Params to preserve when submitting a NEW query from the toolbar search. */
  searchPreservedParams: Record<string, string>;
}

export function CatalogToolbar({
  filters,
  facets,
  labels,
  activeFilterCount,
  hasActiveFilters,
  searchPreservedParams,
}: CatalogToolbarProps) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      <SearchBox
        variant="toolbar"
        action={CATALOG_PATH}
        placeholder={labels.searchPlaceholder}
        ariaLabel={labels.searchAriaLabel}
        clearLabel={labels.searchClear}
        submitLabel={labels.searchSubmit}
        openLabel={labels.searchOpen}
        defaultValue={filters.query ?? ""}
        preservedParams={searchPreservedParams}
      />

      <div className="flex items-center justify-between gap-3">
        <FilterSheet activeCount={activeFilterCount} labels={labels.filterSheet}>
          <FilterPanel
            context="sheet"
            facets={facets}
            selected={filters}
            labels={labels.filterPanel}
            clearHref={CATALOG_PATH}
            hasActiveFilters={hasActiveFilters}
          />
        </FilterSheet>

        <SortSelect
          value={filters.sort}
          labels={labels.sortOptions}
          ariaLabel={labels.sortAriaLabel}
          prefix={labels.sortPrefix}
        />
      </div>
    </div>
  );
}
