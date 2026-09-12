"use client";

import {
  FilterPanel,
  type FilterPanelLabels,
} from "@/components/catalog/filter-panel";
import type {
  FacetOptions,
  SortKey,
} from "@/lib/catalog/search.types";

/**
 * Catalog control labels (sort + filter sheet + filter panel), assembled once
 * by `sillas/page.tsx` and shared by the sidebar, the results-line controls and
 * the JS-off fallback below. Search labels are NOT here: the catalog has no
 * in-page search any more — the site-header search is the single search entry
 * (owner request 2026-09-12).
 */
export interface CatalogLabels {
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

interface CatalogNoScriptFiltersProps {
  facets: FacetOptions;
  labels: CatalogLabels;
  /** Locale-aware `/sillas` target for native (JS-off) form GETs (M-3). */
  catalogAction: string;
}

/**
 * JS-OFF MOBILE FALLBACK (C-2). Below `lg` the filters live inside a Sheet whose
 * trigger needs JS, and the desktop sidebar is `hidden lg:block` — so with JS
 * DISABLED there would be NO filter UI below `lg`. This `<noscript>` renders the
 * SAME FilterPanel always-expanded (only `< lg`, only when JS is off; inert
 * once JS runs), with its native sort + submit rendered INLINE (the panel's own
 * `<noscript>` wrapper would nest — invalid HTML that desyncs hydration).
 * Renders nothing visible for a JS-on shopper.
 */
export function CatalogNoScriptFilters({
  facets,
  labels,
  catalogAction,
}: CatalogNoScriptFiltersProps) {
  return (
    <noscript>
      <div className="mb-6 lg:hidden">
        <FilterPanel
          context="sheet"
          nativeControls="inline"
          facets={facets}
          labels={labels.filterPanel}
          action={catalogAction}
        />
      </div>
    </noscript>
  );
}
