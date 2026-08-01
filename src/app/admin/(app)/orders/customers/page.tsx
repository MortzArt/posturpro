import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { AdminPage } from "@/components/admin/admin-page";
import { CustomerFilters } from "@/components/admin/orders/customer-filters";
import { CustomerTable } from "@/components/admin/orders/customer-table";
import { listAdminCustomers } from "@/lib/admin/orders/customer-list-query";
import {
  parseCustomerListFilters,
  hasActiveCustomerFilters,
  type RawSearchParams,
} from "@/lib/admin/orders/customer-list-filters";
import { ADMIN_CUSTOMERS_PATH } from "@/lib/admin/constants";

/**
 * Admin customer list (T12 Surface 8, AC-24). Server component: parses the search
 * filter, reads a live page of customers + order counts, renders the table /
 * empty state / error banner.
 */
export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseCustomerListFilters(await searchParams);
  const filtered = hasActiveCustomerFilters(filters);

  let result;
  try {
    result = await listAdminCustomers(filters);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-customers] list read failed: ${message}`);
    return (
      <AdminPage title="Clientes">
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          data-testid="admin-customers-error"
        >
          No se pudieron cargar los clientes.{" "}
          <Link href={ADMIN_CUSTOMERS_PATH} className="underline underline-offset-2">
            Reintentar
          </Link>
        </div>
      </AdminPage>
    );
  }

  const description = result.totalCount === 1 ? "1 cliente" : `${result.totalCount} clientes`;

  return (
    <AdminPage title="Clientes" description={description}>
      <div className="flex flex-col gap-4">
        <CustomerFilters filters={filters} />
        {result.rows.length === 0 ? (
          <CustomerEmptyState filtered={filtered} />
        ) : (
          <CustomerTable
            rows={result.rows}
            totalCount={result.totalCount}
            page={result.page}
            lastPage={result.lastPage}
            filters={filters}
          />
        )}
      </div>
    </AdminPage>
  );
}

/** Empty state for the customer list (no customers vs. filtered). */
function CustomerEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div
      data-testid="admin-customers-empty"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center"
    >
      <HugeiconsIcon icon={UserGroupIcon} size={40} strokeWidth={2} aria-hidden className="text-muted-foreground/50" />
      {filtered ? (
        <>
          <p className="text-sm font-medium">Ningún cliente coincide con la búsqueda.</p>
          <Link href={ADMIN_CUSTOMERS_PATH} className="text-xs text-muted-foreground underline underline-offset-2">
            Limpiar búsqueda
          </Link>
        </>
      ) : (
        <p className="text-sm font-medium">Aún no hay clientes.</p>
      )}
    </div>
  );
}
