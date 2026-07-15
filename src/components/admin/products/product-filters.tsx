"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_SEARCH_DEBOUNCE_MS } from "@/lib/config";
import type { TaxonomyOption, CategoryOption } from "@/lib/admin/taxonomy/taxonomy-read";
import type { ProductListFilters } from "@/lib/admin/products/list-filters";

/**
 * ProductFilters (T11 Slice 1, AC-6) — debounced search + brand/category/status/
 * stock selects, all reflected in the URL (`router.replace`, scroll:false) so
 * the view is shareable/back-safe. "Limpiar" appears only when a filter is
 * active. Changing any filter resets `?page` (a new filter set starts at page 1).
 */
interface ProductFiltersProps {
  filters: ProductListFilters;
  brands: TaxonomyOption[];
  categories: CategoryOption[];
}

const STATUS_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  { value: "draft", label: "Borrador" },
  { value: "active", label: "Activo" },
  { value: "archived", label: "Archivado" },
] as const;

const STOCK_OPTIONS = [
  { value: "all", label: "Todo el stock" },
  { value: "in-stock", label: "En existencia" },
  { value: "out-of-stock", label: "Agotado" },
] as const;

const selectClasses =
  "min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export function ProductFilters({ filters, brands, categories }: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [lastUrlSearch, setLastUrlSearch] = useState(filters.search);
  const debounceRef = useRef<number | null>(null);

  // Clear a pending search debounce on unmount so navigating away mid-debounce
  // can't fire router.replace after the component is gone (M-8).
  useEffect(
    () => () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  // Sync the draft with the URL when it changes externally (back button /
  // "Limpiar") — the React "adjust state during render" pattern (no effect,
  // no cascading render): compare the URL value to the last one we synced.
  if (filters.search !== lastUrlSearch) {
    setLastUrlSearch(filters.search);
    setSearchDraft(filters.search);
  }

  const setParam = (key: string, value: string): void => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const onSearchChange = (value: string): void => {
    setSearchDraft(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setParam("search", value.trim());
    }, ADMIN_SEARCH_DEBOUNCE_MS);
  };

  const active =
    filters.search !== "" ||
    filters.brandId !== null ||
    filters.categoryId !== null ||
    filters.status !== "all" ||
    filters.stock !== "all";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-56">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2} aria-hidden />
        </span>
        <label htmlFor="admin-product-search" className="sr-only">
          Buscar por nombre o SKU
        </label>
        <input
          id="admin-product-search"
          type="search"
          value={searchDraft}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por nombre o SKU…"
          data-testid="admin-products-search"
          className={cn(selectClasses, "w-full pl-9")}
        />
      </div>

      <FilterSelect
        label="Marca"
        testid="admin-products-filter-brand"
        value={filters.brandId ?? "all"}
        onChange={(value) => setParam("brand", value)}
        options={[{ value: "all", label: "Todas las marcas" }, ...brands]}
      />
      <FilterSelect
        label="Categoría"
        testid="admin-products-filter-category"
        value={filters.categoryId ?? "all"}
        onChange={(value) => setParam("category", value)}
        options={[
          { value: "all", label: "Todas las categorías" },
          ...categories.map((category) => ({
            value: category.value,
            // Convey nesting depth with a visible glyph prefix, matching the dialog
            // and avoiding reliance on non-breaking-space rendering (nit-5).
            label: `${"— ".repeat(category.depth)}${category.label}`,
          })),
        ]}
      />
      <FilterSelect
        label="Estado"
        testid="admin-products-filter-status"
        value={filters.status}
        onChange={(value) => setParam("status", value)}
        options={STATUS_OPTIONS}
      />
      <FilterSelect
        label="Stock"
        testid="admin-products-filter-stock"
        value={filters.stock}
        onChange={(value) => setParam("stock", value)}
        options={STOCK_OPTIONS}
      />

      {active ? (
        <Button
          variant="ghost"
          size="sm"
          data-testid="admin-products-clear"
          onClick={() => router.replace(pathname, { scroll: false })}
        >
          Limpiar
        </Button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  testid,
  value,
  onChange,
  options,
}: {
  label: string;
  testid: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <>
      <label htmlFor={testid} className="sr-only">
        {label}
      </label>
      <select
        id={testid}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testid}
        className={selectClasses}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
