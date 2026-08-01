import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { AdminPage } from "@/components/admin/admin-page";
import { OrderFilters } from "@/components/admin/orders/order-filters";
import { OrderTable } from "@/components/admin/orders/order-table";
import { OrderEmptyState } from "@/components/admin/orders/order-empty-state";
import { listAdminOrders } from "@/lib/admin/orders/order-list-query";
import {
  parseOrderListFilters,
  hasActiveOrderFilters,
  type RawSearchParams,
} from "@/lib/admin/orders/order-list-filters";
import { ADMIN_CUSTOMERS_PATH } from "@/lib/admin/constants";

/**
 * Admin order list (T12 Surface 1). Server component: parses the URL filters,
 * reads a live page via the admin client (base table, no cache), and renders the
 * table / empty state / error banner. A read failure degrades to an inline banner
 * (never a 500).
 */
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseOrderListFilters(await searchParams);
  const filtered = hasActiveOrderFilters(filters);

  let result;
  try {
    result = await listAdminOrders(filters);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-orders] list read failed: ${message}`);
    return (
      <AdminPage title="Pedidos">
        <ListErrorBanner />
      </AdminPage>
    );
  }

  const description =
    result.totalCount === 1 ? "1 pedido" : `${result.totalCount} pedidos`;

  return (
    <AdminPage
      title="Pedidos"
      description={description}
      actions={
        <Button asChild variant="secondary" size="sm" data-testid="admin-orders-customers-link">
          <Link href={ADMIN_CUSTOMERS_PATH}>
            <HugeiconsIcon icon={UserGroupIcon} size={16} strokeWidth={2} aria-hidden />
            Clientes
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <OrderFilters filters={filters} />
        {result.rows.length === 0 ? (
          <OrderEmptyState filtered={filtered} />
        ) : (
          <OrderTable
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

/** Inline read-error banner with a retry link (re-navigates the current URL). */
function ListErrorBanner() {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
      data-testid="admin-orders-error"
    >
      No se pudieron cargar los pedidos.{" "}
      <Link href="/admin/orders" className="underline underline-offset-2">
        Reintentar
      </Link>
    </div>
  );
}
