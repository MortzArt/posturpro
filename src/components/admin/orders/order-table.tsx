import Link from "next/link";
import { formatMXN } from "@/lib/money";
import { formatRelativeDate } from "@/lib/admin/format";
import { displayRangeFor } from "@/lib/catalog/pagination";
import { ADMIN_PRODUCTS_PER_PAGE } from "@/lib/config";
import { ADMIN_ORDERS_PATH } from "@/lib/admin/constants";
import { buildOrderListQueryString, type OrderListFilters } from "@/lib/admin/orders/order-list-filters";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { PaymentStatusBadge } from "@/components/admin/orders/payment-status-badge";
import { paymentBadgeIsRedundant } from "@/lib/admin/orders/order-status-meta";
import { OrderRowActions } from "@/components/admin/orders/order-row-actions";
import { ListPagination } from "@/components/admin/orders/list-pagination";
import type { AdminOrderRow } from "@/lib/admin/orders/order-list-query";

/**
 * OrderTable (T12 AC-1) — desktop table + mobile card list of the current page,
 * ordered by created_at DESC. Server component (data present at render). Each
 * row/card links to the detail page; a `⋮` menu (client) carries the non-
 * destructive row actions. Status + payment use the glyph+text badge pair (never
 * color alone). Mirrors `ProductTable`.
 */
interface OrderTableProps {
  rows: AdminOrderRow[];
  totalCount: number;
  page: number;
  lastPage: number;
  filters: OrderListFilters;
}

export function OrderTable({ rows, totalCount, page, lastPage, filters }: OrderTableProps) {
  const { start, end } = displayRangeFor(page, ADMIN_PRODUCTS_PER_PAGE, totalCount);
  const hrefFor = (target: number): string =>
    `${ADMIN_ORDERS_PATH}${buildOrderListQueryString(filters, { page: target })}`;

  return (
    <div className="flex flex-col gap-4" data-testid="admin-orders-table">
      <DesktopTable rows={rows} />
      <MobileCards rows={rows} />
      <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <p className="tabular-nums" data-testid="admin-orders-count">
          {totalCount === 0 ? "Sin resultados" : `Mostrando ${start}–${end} de ${totalCount}`}
        </p>
        <ListPagination page={page} lastPage={lastPage} hrefFor={hrefFor} testid="admin-orders-pagination" />
      </div>
    </div>
  );
}

/** Desktop / tablet table (≥ 640px), horizontally scrollable if needed. */
function DesktopTable({ rows }: { rows: AdminOrderRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Lista de pedidos</caption>
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Nº pedido</th>
            <th scope="col" className="px-3 py-2 font-medium">Cliente</th>
            <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Fecha</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
            <th scope="col" className="px-3 py-2 font-medium">Estado</th>
            <th scope="col" className="px-3 py-2 font-medium">Pago</th>
            <th scope="col" className="w-12 px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="nav-hover border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2">
                <Link
                  href={`${ADMIN_ORDERS_PATH}/${row.id}`}
                  className="font-mono text-xs font-medium text-foreground outline-none hover:underline focus-visible:underline"
                  data-testid={`admin-order-row-${row.id}`}
                >
                  {row.orderNumber}
                </Link>
              </td>
              <td className="max-w-48 truncate px-3 py-2">{row.customerName}</td>
              <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
                {formatRelativeDate(row.createdAt)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMXN(row.totalCents)}</td>
              <td className="px-3 py-2"><OrderStatusBadge status={row.orderStatus} /></td>
              <td className="px-3 py-2">
                {paymentBadgeIsRedundant(row.orderStatus, row.paymentStatus) ? null : (
                  <PaymentStatusBadge status={row.paymentStatus} />
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <OrderRowActions orderId={row.id} orderNumber={row.orderNumber} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile card list (< 640px) — number + total + status prominent. */
function MobileCards({ rows }: { rows: AdminOrderRow[] }) {
  return (
    <ul className="flex flex-col gap-2 sm:hidden">
      {rows.map((row) => (
        <li key={row.id} className="flex gap-3 rounded-lg border border-border p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`${ADMIN_ORDERS_PATH}/${row.id}`}
                className="font-mono text-xs font-medium text-foreground"
              >
                {row.orderNumber}
              </Link>
              <span className="tabular-nums font-medium">{formatMXN(row.totalCents)}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.customerName} · {formatRelativeDate(row.createdAt)}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={row.orderStatus} />
              {paymentBadgeIsRedundant(row.orderStatus, row.paymentStatus) ? null : (
                <PaymentStatusBadge status={row.paymentStatus} />
              )}
            </div>
          </div>
          <OrderRowActions orderId={row.id} orderNumber={row.orderNumber} />
        </li>
      ))}
    </ul>
  );
}
