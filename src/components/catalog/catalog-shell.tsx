"use client";

import { CATALOG_PATH } from "@/lib/config";
import { FilterNavigationProvider } from "@/components/catalog/filter-navigation";
import {
  CatalogToolbar,
  type ToolbarLabels,
} from "@/components/catalog/catalog-toolbar";
import { CatalogGridRegion } from "@/components/catalog/catalog-grid-region";
import {
  ActiveFilters,
  type ActiveFilterChip,
} from "@/components/catalog/active-filters";
import { FilterPanel } from "@/components/catalog/filter-panel";
import { ResultAnnouncerProvider } from "@/components/catalog/result-announcer";
import type { CatalogFilters, FacetOptions } from "@/lib/catalog/search.types";

/**
 * CatalogShell (T5) — the client interactive region of `/sillas`: toolbar →
 * page heading (+ index banner) → active-filter chips + the desktop filter sidebar (`≥ lg`) + the grid region
 * (server-rendered, passed as `children`, dimmed while a client change is
 * pending — M-7). Wraps everything in the `FilterNavigationProvider` so the
 * toolbar/sidebar controls share ONE `useTransition` and one serialize path.
 *
 * The `children` (grid or NoResults) is a SERVER component rendered by the page
 * and passed through — it stays a server component (RSC-through-client-child),
 * so the RPC read runs on the server inside the page's `<Suspense>`.
 */

interface CatalogShellProps {
  filters: CatalogFilters;
  facets: FacetOptions;
  toolbarLabels: ToolbarLabels;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  searchPreservedParams: Record<string, string>;
  chips: ActiveFilterChip[];
  clearAllLabel: string;
  /** Locale-aware `/sillas` target for native (JS-off) form GETs (M-3). */
  catalogAction: string;
  /**
   * The page heading (h1 + subtitle) and optional index banner. They render
   * BELOW the toolbar (owner request 2026-09-12: search + sort lead the page)
   * but must live inside the shell so the toolbar keeps the shared filter
   * context. Server nodes passed through (RSC-through-client-child).
   */
  heading: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
}

export function CatalogShell({
  filters,
  facets,
  toolbarLabels,
  activeFilterCount,
  hasActiveFilters,
  searchPreservedParams,
  chips,
  clearAllLabel,
  catalogAction,
  heading,
  banner,
  children,
}: CatalogShellProps) {
  return (
    <FilterNavigationProvider filters={filters}>
      <ResultAnnouncerProvider>
        <CatalogToolbar
          filters={filters}
          facets={facets}
          labels={toolbarLabels}
          activeFilterCount={activeFilterCount}
          hasActiveFilters={hasActiveFilters}
          searchPreservedParams={searchPreservedParams}
          catalogAction={catalogAction}
        />

        {heading}
        {banner}

        <ActiveFilters
          chips={chips}
          clearAllHref={CATALOG_PATH}
          clearAllLabel={clearAllLabel}
        />

        <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] self-start overflow-y-auto pr-2">
              <FilterPanel
                context="sidebar"
                facets={facets}
                selected={filters}
                labels={toolbarLabels.filterPanel}
                hasActiveFilters={hasActiveFilters}
                action={catalogAction}
              />
            </div>
          </aside>

          <CatalogGridRegion>{children}</CatalogGridRegion>
        </div>
      </ResultAnnouncerProvider>
    </FilterNavigationProvider>
  );
}
