import { displayRangeFor } from "@/lib/catalog/pagination";
import { ADMIN_PRODUCTS_PER_PAGE } from "@/lib/config";
import { ADMIN_CUSTOMERS_PATH } from "@/lib/admin/constants";
import { buildCustomerListQueryString, type CustomerListFilters } from "@/lib/admin/orders/customer-list-filters";
import { ListPagination } from "@/components/admin/orders/list-pagination";
import type { AdminCustomerRow } from "@/lib/admin/orders/customer-list-query";

/**
 * CustomerTable (T12 AC-24) — desktop table + mobile card list of customers with
 * their order count. Rows do NOT link (customer accounts are out of scope); the
 * email is selectable text. Mirrors `OrderTable`. Server component.
 */
interface CustomerTableProps {
  rows: AdminCustomerRow[];
  totalCount: number;
  page: number;
  lastPage: number;
  filters: CustomerListFilters;
}

export function CustomerTable({ rows, totalCount, page, lastPage, filters }: CustomerTableProps) {
  const { start, end } = displayRangeFor(page, ADMIN_PRODUCTS_PER_PAGE, totalCount);
  const hrefFor = (target: number): string =>
    `${ADMIN_CUSTOMERS_PATH}${buildCustomerListQueryString(filters, { page: target })}`;

  return (
    <div className="flex flex-col gap-4" data-testid="admin-customers-table">
      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Lista de clientes</caption>
          <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Cliente</th>
              <th scope="col" className="px-3 py-2 font-medium">Correo</th>
              <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Tel.</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Pedidos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 align-top">
                <td className="max-w-48 break-words px-3 py-2 font-medium">{row.fullName}</td>
                <td className="max-w-64 break-words px-3 py-2 text-muted-foreground select-text">{row.email}</td>
                <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">{row.phone ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.orderCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{row.fullName}</p>
              <p className="truncate text-xs text-muted-foreground select-text">{row.email}</p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {row.orderCount} pedidos
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <p className="tabular-nums" data-testid="admin-customers-count">
          {totalCount === 0 ? "Sin resultados" : `Mostrando ${start}–${end} de ${totalCount}`}
        </p>
        <ListPagination page={page} lastPage={lastPage} hrefFor={hrefFor} testid="admin-customers-pagination" />
      </div>
    </div>
  );
}
