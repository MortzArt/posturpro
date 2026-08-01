"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_SEARCH_DEBOUNCE_MS } from "@/lib/config";
import { hasActiveCustomerFilters, type CustomerListFilters } from "@/lib/admin/orders/customer-list-filters";

/**
 * CustomerFilters (T12 AC-24) — debounced email/name search, URL-synced,
 * resetting `?page`. "Limpiar" appears only when active. Mirrors OrderFilters,
 * search-only.
 */
export function CustomerFilters({ filters }: { filters: CustomerListFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [lastUrlSearch, setLastUrlSearch] = useState(filters.search);
  const debounceRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  if (filters.search !== lastUrlSearch) {
    setLastUrlSearch(filters.search);
    setSearchDraft(filters.search);
  }

  const setSearch = (value: string): void => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "") params.delete("search");
    else params.set("search", value);
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const onSearchChange = (value: string): void => {
    setSearchDraft(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setSearch(value.trim()), ADMIN_SEARCH_DEBOUNCE_MS);
  };

  const selectClasses =
    "min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:min-w-56">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2} aria-hidden />
        </span>
        <label htmlFor="admin-customer-search" className="sr-only">
          Buscar por correo o nombre
        </label>
        <input
          id="admin-customer-search"
          type="search"
          value={searchDraft}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por correo o nombre…"
          data-testid="admin-customers-search"
          className={cn(selectClasses, "w-full pl-9")}
        />
      </div>
      {hasActiveCustomerFilters(filters) ? (
        <Button
          variant="ghost"
          size="sm"
          data-testid="admin-customers-clear"
          onClick={() => router.replace(pathname, { scroll: false })}
        >
          Limpiar
        </Button>
      ) : null}
    </div>
  );
}
