import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, ShoppingCart01Icon } from "@hugeicons/core-free-icons";
import { formatMXN } from "@/lib/money";
import { formatRelativeDate } from "@/lib/admin/format";
import { isMailableAddress } from "@/lib/email/recipient";
import { getAdminCustomer } from "@/lib/admin/orders/customer-read";
import { ADMIN_CUSTOMERS_PATH, ADMIN_ORDERS_PATH } from "@/lib/admin/constants";
import { AdminPage } from "@/components/admin/admin-page";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { PaymentStatusBadge } from "@/components/admin/orders/payment-status-badge";
import { paymentBadgeIsRedundant } from "@/lib/admin/orders/order-status-meta";
import type {
  AdminCustomerAddress,
  AdminCustomerDetail,
  AdminCustomerOrder,
} from "@/lib/admin/orders/customer-read";

/**
 * Customer detail (T18). Server component: reads one customer by `customers.id`
 * (or `notFound()` on a non-UUID / missing id, AC-10). Single-column composition
 * of the T12 admin primitives — identity → lifetime totals → order history
 * (linked rows) → contact & addresses. Section-isolated: the order-history read
 * failing renders a scoped banner while the rest still renders. Never 500s.
 */
export const dynamic = "force-dynamic";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let customer: AdminCustomerDetail | null;
  try {
    customer = await getAdminCustomer(id);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin-customer-detail] page read failed for ${id}: ${message}`);
    return <CustomerReadError id={id} />;
  }
  if (!customer) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={ADMIN_CUSTOMERS_PATH}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="customer-back-link"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} aria-hidden />
          Clientes
        </Link>
        <h1 className="break-words text-lg font-semibold tracking-tight">{customer.fullName}</h1>
        {isMailableAddress(customer.email) ? (
          <p className="break-words text-sm text-muted-foreground">{customer.email}</p>
        ) : (
          <p className="break-words text-sm italic text-muted-foreground">Sin correo</p>
        )}
        {customer.phone ? (
          <p className="break-words text-sm text-muted-foreground">{customer.phone}</p>
        ) : null}
      </div>

      <TotalsPanel totals={customer.totals} />
      <OrderHistoryPanel customer={customer} />
      <ContactPanel customer={customer} />
    </div>
  );
}

/** Top-level read-failure branch (mirrors the Customers-list error branch). */
function CustomerReadError({ id }: { id: string }) {
  return (
    <AdminPage title="Cliente">
      <div
        role="alert"
        className="enter-fade rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        data-testid="admin-customer-detail-error"
      >
        No se pudieron cargar los datos del cliente.{" "}
        <Link href={`${ADMIN_CUSTOMERS_PATH}/${id}`} className="underline underline-offset-2">
          Reintentar
        </Link>
      </div>
    </AdminPage>
  );
}

/** A bordered card panel with a small section header (verbatim order-detail Panel). */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

/** Label ↔ value flex row inside a `<dl>` (verbatim order-detail TotalRow). */
function TotalRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={emphasis ? "font-semibold tabular-nums text-foreground" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

function TotalsPanel({ totals }: { totals: AdminCustomerDetail["totals"] }) {
  return (
    <Panel title="Totales del cliente">
      <dl className="flex flex-col gap-1 text-sm">
        <TotalRow label="Pedidos" value={String(totals.orderCount)} />
        <TotalRow label="Total gastado" value={formatMXN(totals.totalCents)} emphasis />
        <TotalRow
          label="Primer pedido"
          value={totals.firstOrderAt ? formatRelativeDate(totals.firstOrderAt) : "—"}
        />
        <TotalRow
          label="Último pedido"
          value={totals.lastOrderAt ? formatRelativeDate(totals.lastOrderAt) : "—"}
        />
      </dl>
    </Panel>
  );
}

function OrderHistoryPanel({ customer }: { customer: AdminCustomerDetail }) {
  const { orders, historyFailed, ordersTruncated, totals } = customer;
  return (
    <Panel title={`Historial de pedidos (${totals.orderCount})`}>
      {historyFailed ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          data-testid="customer-history-error"
        >
          No se pudo cargar el historial de pedidos.
        </div>
      ) : orders.length === 0 ? (
        <OrderHistoryEmpty />
      ) : (
        <>
          <OrderHistoryTable orders={orders} />
          <OrderHistoryCards orders={orders} />
          {ordersTruncated ? (
            <p className="mt-3 text-xs text-muted-foreground" data-testid="customer-history-truncated">
              Mostrando los {orders.length} más recientes de {totals.orderCount}.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/** Zero-orders empty state (dashed panel + glyph), mirroring the list empty state. */
function OrderHistoryEmpty() {
  return (
    <div
      data-testid="customer-history-empty"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-center"
    >
      <HugeiconsIcon icon={ShoppingCart01Icon} size={40} strokeWidth={2} aria-hidden className="text-muted-foreground/50" />
      <p className="text-sm font-medium">Este cliente no tiene pedidos.</p>
    </div>
  );
}

/** Desktop / tablet order-history table (≥ 640px). Links only the order number. */
function OrderHistoryTable({ orders }: { orders: AdminCustomerOrder[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Historial de pedidos</caption>
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Nº pedido</th>
            <th scope="col" className="px-3 py-2 font-medium">Fecha</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
            <th scope="col" className="px-3 py-2 font-medium">Estado</th>
            <th scope="col" className="px-3 py-2 font-medium">Pago</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="nav-hover border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2">
                <Link
                  href={`${ADMIN_ORDERS_PATH}/${order.id}`}
                  className="font-mono text-xs font-medium text-foreground outline-none hover:underline focus-visible:underline"
                  data-testid={`customer-order-row-${order.id}`}
                >
                  {order.orderNumber}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{formatRelativeDate(order.createdAt)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMXN(order.totalCents)}</td>
              <td className="px-3 py-2"><OrderStatusBadge status={order.orderStatus} /></td>
              <td className="px-3 py-2">
                {paymentBadgeIsRedundant(order.orderStatus, order.paymentStatus) ? null : (
                  <PaymentStatusBadge status={order.paymentStatus} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile order-history card list (< 640px). Links only the order number. */
function OrderHistoryCards({ orders }: { orders: AdminCustomerOrder[] }) {
  return (
    <ul className="flex flex-col gap-2 sm:hidden">
      {orders.map((order) => (
        <li key={order.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={`${ADMIN_ORDERS_PATH}/${order.id}`}
              className="font-mono text-xs font-medium text-foreground outline-none hover:underline focus-visible:underline"
              data-testid={`customer-order-card-${order.id}`}
            >
              {order.orderNumber}
            </Link>
            <span className="shrink-0 tabular-nums font-medium">{formatMXN(order.totalCents)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{formatRelativeDate(order.createdAt)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.orderStatus} />
            {paymentBadgeIsRedundant(order.orderStatus, order.paymentStatus) ? null : (
              <PaymentStatusBadge status={order.paymentStatus} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ContactPanel({ customer }: { customer: AdminCustomerDetail }) {
  const { email, phone, addresses } = customer;
  return (
    <Panel title="Datos de contacto y envío">
      <dl className="flex flex-col gap-4 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Contacto</dt>
          {isMailableAddress(email) ? (
            <dd className="break-words">{email}</dd>
          ) : (
            <dd className="break-words italic text-muted-foreground">Sin correo</dd>
          )}
          {phone ? <dd className="break-words text-muted-foreground">{phone}</dd> : null}
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Direcciones de envío ({addresses.length})</dt>
          {addresses.length === 0 ? (
            <dd className="text-muted-foreground">Sin direcciones registradas.</dd>
          ) : (
            <div className="mt-1 flex flex-col gap-3">
              {addresses.map((address, index) => (
                <AddressBlock key={addressKey(address, index)} address={address} />
              ))}
            </div>
          )}
        </div>
      </dl>
    </Panel>
  );
}

/** One distinct shipping address (verbatim order-detail address grammar). */
function AddressBlock({ address }: { address: AdminCustomerAddress }) {
  return (
    <div className="min-w-0 border-t border-border pt-3 first:border-0 first:pt-0">
      <dd className="break-words font-medium">{address.shippingFullName}</dd>
      <dd className="break-words text-muted-foreground">
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ""}
      </dd>
      <dd className="break-words text-muted-foreground">
        Col. {address.city} · CP {address.postalCode} · {address.state}
      </dd>
    </div>
  );
}

/** Stable key for a de-duped address (already distinct; index disambiguates). */
function addressKey(address: AdminCustomerAddress, index: number): string {
  return `${address.line1}-${address.postalCode}-${index}`;
}
