"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useTransition,
} from "react";
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
 *
 * INTERRUPTIBILITY (rapid multi-select): a `router.push` inside `useTransition`
 * takes a moment to land the new URL. If the shopper toggles a second facet
 * value before that, a naive toggle would read the STALE `filters` prop and
 * clobber the first change. So toggles compose against a synchronously-updated
 * ref of the latest applied state; the ref is re-based to the authoritative URL
 * (`filters` prop) on every navigation, so URL-as-state stays the source of
 * truth and a burst of clicks accumulates instead of racing (Apple §3).
 */

interface FilterNavigationValue {
  filters: CatalogFilters;
  isPending: boolean;
  /** Push the given fully-resolved filter state (page → 1). */
  apply: (next: CatalogFilters) => void;
  /**
   * Merge a partial change into the LATEST applied state (the pending ref, not
   * the stale render prop) and push. Scalar controls (sort, availability, price)
   * must use this so a change fired mid-transition composes with a preceding
   * facet-toggle burst instead of clobbering it — same interruptibility contract
   * as `toggleValue` (Apple §3).
   */
  patch: (partial: Partial<CatalogFilters>) => void;
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

  // Latest applied filters, updated synchronously (in `apply`) so a burst of
  // toggles fired before the URL settles composes against the pending state,
  // not the stale prop. It is re-based to the authoritative URL state whenever
  // a real navigation delivers a new `filters` prop (effect below) — NOT on
  // incidental re-renders (e.g. `isPending` flipping), which would otherwise
  // clobber accumulated toggles.
  const pendingRef = useRef<CatalogFilters>(filters);
  useEffect(() => {
    pendingRef.current = filters;
  }, [filters]);

  const value = useMemo<FilterNavigationValue>(() => {
    const apply = (next: CatalogFilters): void => {
      pendingRef.current = next;
      const query = serializeFilters(next);
      const href = query ? `${CATALOG_PATH}?${query}` : CATALOG_PATH;
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    };

    // Compose against the pending ref (latest applied), never the stale prop, so
    // a scalar change (sort/availability/price) fired mid-transition keeps any
    // facet toggles that have not yet landed in the URL.
    const patch = (partial: Partial<CatalogFilters>): void => {
      apply({ ...pendingRef.current, ...partial });
    };

    const toggleValue = (facet: MultiFacet, value: string, on: boolean): void => {
      const base = pendingRef.current;
      const current = base[facet];
      const nextValues = on
        ? [...new Set([...current, value])]
        : current.filter((existing) => existing !== value);
      apply({ ...base, [facet]: nextValues });
    };

    return { filters, isPending, apply, patch, toggleValue };
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
