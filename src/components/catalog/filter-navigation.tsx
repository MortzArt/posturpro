"use client";

import { createContext, useContext, useMemo, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { CATALOG_PATH } from "@/lib/config";
import {
  removeFacet,
  serializeFilters,
  type RemovableFacet,
} from "@/lib/catalog/search-params";
import type { CatalogFilters } from "@/lib/catalog/search.types";

/**
 * Client navigation context for the T5 filter controls.
 *
 * Owns the SINGLE source of client-side URL mutation so `SortSelect`,
 * `FilterPanel`, and `ColorSwatchGroup` all push through one `useTransition`
 * (shared pending state → one grid dim, M-7) and one serialize path (canonical,
 * shareable URLs — AC-9). Every mutation RESETS to page 1 (AC-8) because
 * `serializeFilters` never emits `page`, and we push the bare filtered URL.
 *
 * SSR-first: the components ALSO render as a native `<form method="get">`, so
 * this context only ENHANCES — filters work with JS disabled without it.
 */

interface FilterNavigationValue {
  filters: CatalogFilters;
  isPending: boolean;
  /** Push the given fully-resolved filter state (page → 1). */
  apply: (next: CatalogFilters) => void;
  /** Convenience: apply with one facet value toggled on/off. */
  toggleValue: (facet: MultiFacet, value: string, on: boolean) => void;
}

/** Multi-select facet dimensions a control can toggle a single value in. */
export type MultiFacet = "categoryIds" | "brandIds" | "styleIds" | "colors" | "materials";

const FilterNavigationContext = createContext<FilterNavigationValue | null>(null);

export function FilterNavigationProvider({
  filters,
  children,
}: {
  filters: CatalogFilters;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const value = useMemo<FilterNavigationValue>(() => {
    const apply = (next: CatalogFilters): void => {
      const query = serializeFilters(next);
      const href = query ? `${CATALOG_PATH}?${query}` : CATALOG_PATH;
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    };

    const toggleValue = (facet: MultiFacet, value: string, on: boolean): void => {
      const current = filters[facet];
      const nextValues = on
        ? [...new Set([...current, value])]
        : current.filter((existing) => existing !== value);
      apply({ ...filters, [facet]: nextValues });
    };

    return { filters, isPending, apply, toggleValue };
  }, [filters, isPending, router]);

  return (
    <FilterNavigationContext.Provider value={value}>
      {children}
    </FilterNavigationContext.Provider>
  );
}

/** Access the filter navigation context (must be inside the provider). */
export function useFilterNavigation(): FilterNavigationValue {
  const ctx = useContext(FilterNavigationContext);
  if (ctx === null) {
    throw new Error("useFilterNavigation must be used within FilterNavigationProvider");
  }
  return ctx;
}

/** Re-export for convenience so controls can build removeFacet-based URLs. */
export { removeFacet };
export type { RemovableFacet };
