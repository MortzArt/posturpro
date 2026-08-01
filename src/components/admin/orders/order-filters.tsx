"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_SEARCH_DEBOUNCE_MS } from "@/lib/config";
import { hasActiveOrderFilters, type OrderListFilters } from "@/lib/admin/orders/order-list-filters";

/**
 * OrderFilters (T12 AC-2/3) — debounced search + estado/pago selects, reflected
 * in the URL (`router.replace`, scroll:false), resetting `?page` on any change.
 * "Limpiar" appears only when a filter is active. Verbatim shape of
 * `ProductFilters`.
 */
interface OrderFiltersProps {
  filters: OrderListFilters;
}

const STATUS_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  { value: "pending_payment", label: "Pago pendiente" },
  { value: "paid", label: "Pagado" },
  { value: "preparing", label: "Preparando" },
  { value: "shipped", label: "Enviado" },
  { value: "delivered", label: "Entregado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

const PAYMENT_OPTIONS = [
  { value: "all", label: "Todos los pagos" },
  { value: "pending", label: "Pago pendiente" },
  { value: "authorized", label: "Autorizado" },
  { value: "paid", label: "Pagado" },
  { value: "failed", label: "Fallido" },
  { value: "refunded", label: "Reembolsado" },
] as const;

const selectClasses =
  "min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export function OrderFilters({ filters }: OrderFiltersProps) {
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

  // Sync the draft with the URL when it changes externally (back / "Limpiar").
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

  const active = hasActiveOrderFilters(filters);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-56">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2} aria-hidden />
        </span>
        <label htmlFor="admin-order-search" className="sr-only">
          Buscar por número, correo o nombre
        </label>
        <input
          id="admin-order-search"
          type="search"
          value={searchDraft}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar nº, correo o nombre…"
          data-testid="admin-orders-search"
          className={cn(selectClasses, "w-full pl-9")}
        />
      </div>

      <FilterSelect
        label="Estado"
        testid="admin-orders-filter-status"
        value={filters.status}
        onChange={(value) => setParam("status", value)}
        options={STATUS_OPTIONS}
      />
      <FilterSelect
        label="Pago"
        testid="admin-orders-filter-payment"
        value={filters.payment}
        onChange={(value) => setParam("payment", value)}
        options={PAYMENT_OPTIONS}
      />

      {active ? (
        <Button
          variant="ghost"
          size="sm"
          data-testid="admin-orders-clear"
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
