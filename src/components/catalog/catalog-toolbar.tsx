"use client";

import { SearchBox } from "@/components/catalog/search-box";
import { SortSelect } from "@/components/catalog/sort-select";
import { FilterSheet } from "@/components/catalog/filter-sheet";
import {
  FilterPanel,
  type FilterPanelLabels,
} from "@/components/catalog/filter-panel";
import type {
  CatalogFilters,
  FacetOptions,
  SortKey,
} from "@/lib/catalog/search.types";

/**
 * CatalogToolbar (T5) — ONE row at the top of the catalog (above the page
 * heading, owner request 2026-09-12): a compact search field pinned LEFT, the
 * mobile/tablet "Filtros" Sheet trigger (which hosts the FilterPanel), and the
 * SortSelect pinned RIGHT. Wraps to two rows only on narrow screens. Client
 * composer so all three share the FilterNavigationProvider (its enclosing
 * parent supplies the context). Keeps `sillas/page.tsx` thin.
 *
 * JS-OFF MOBILE FALLBACK (C-2): below `lg` the filters live inside a Sheet whose
 * trigger needs JS to open, and the desktop sidebar is `hidden lg:block`. So
 * with JS DISABLED there would be NO filter UI below `lg`. A `<noscript>` block
 * renders the SAME FilterPanel form always-expanded (only `< lg`, only when JS
 * is off — `<noscript>` content is inert/hidden once JS runs), so a no-JS mobile
 * shopper gets a fully working native filter/sort form (edge 11). The JS-on
 * Sheet experience is unchanged.
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
    title: string;
    close: string;
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
  /** Locale-aware `/sillas` target for native (JS-off) form GETs (M-3). */
  catalogAction: string;
}

export function CatalogToolbar({
  filters,
  facets,
  labels,
  activeFilterCount,
  hasActiveFilters,
  searchPreservedParams,
  catalogAction,
}: CatalogToolbarProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:mb-8">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox
          variant="toolbar"
          action={catalogAction}
          placeholder={labels.searchPlaceholder}
          ariaLabel={labels.searchAriaLabel}
          clearLabel={labels.searchClear}
          submitLabel={labels.searchSubmit}
          openLabel={labels.searchOpen}
          defaultValue={filters.query ?? ""}
          preservedParams={searchPreservedParams}
          className="w-full sm:w-auto sm:min-w-[18rem] sm:max-w-sm sm:flex-1"
        />

        <FilterSheet
          activeCount={activeFilterCount}
          labels={labels.filterSheet}
        >
          <FilterPanel
            context="sheet"
            facets={facets}
            selected={filters}
            labels={labels.filterPanel}
            hasActiveFilters={hasActiveFilters}
            action={catalogAction}
          />
        </FilterSheet>

        <div className="ml-auto">
          <SortSelect
            value={filters.sort}
            labels={labels.sortOptions}
            ariaLabel={labels.sortAriaLabel}
            prefix={labels.sortPrefix}
          />
        </div>
      </div>

      {/* JS-off mobile/tablet fallback (C-2): the full native filter form,
          shown only below `lg` AND only when JS is disabled. */}
      <noscript>
        <div className="lg:hidden">
          <FilterPanel
            context="sheet"
            facets={facets}
            selected={filters}
            labels={labels.filterPanel}
            hasActiveFilters={hasActiveFilters}
            action={catalogAction}
          />
        </div>
      </noscript>
    </div>
  );
}
