import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { formatMXN } from "@/lib/money";
import { formatRelativeDate } from "@/lib/admin/format";
import { getAdminOrder } from "@/lib/admin/orders/order-read";
import { ADMIN_ORDERS_PATH } from "@/lib/admin/constants";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { PaymentStatusBadge } from "@/components/admin/orders/payment-status-badge";
import { OrderStatusStepper } from "@/components/admin/orders/order-status-stepper";
import { OrderHistoryLog } from "@/components/admin/orders/order-history-log";
import { OrderActionsPanel } from "@/components/admin/orders/order-actions-panel";
import { TrackingForm } from "@/components/admin/orders/tracking-form";
import { InternalNotes } from "@/components/admin/orders/internal-notes";
import { deriveCancelledAt } from "@/lib/admin/orders/order-status-meta";
import type { AdminOrderDetail } from "@/lib/admin/orders/order-read";

/**
 * Order detail (T12 Surface 2). Server component: reads the full order (or
 * `notFound()` on a non-UUID / missing id, AC-7). Section-composed so the core
 * order always renders even if history/notes fail. Two-column on desktop.
 */
export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getAdminOrder(id);
  if (!order) {
    notFound();
  }

  const remainingCents = Math.max(0, order.totalCents - order.refundedCents);
  // The real cancellation time is the newest `cancelled` history entry, NOT the
  // order's creation time — derived by the pure, unit-tested `deriveCancelledAt`
  // (M-2). Falls back to `null` (band renders without a timestamp) when history
  // failed to load — never a factually wrong time.
  const cancelledAt = deriveCancelledAt(order.orderStatus, order.history);

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div>
        <Link
          href={ADMIN_ORDERS_PATH}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="order-back-link"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} aria-hidden />
          Pedidos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Pedido {order.orderNumber}</h1>
          <OrderStatusBadge status={order.orderStatus} />
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Creado {formatRelativeDate(order.createdAt)} · {order.contactEmail}
        </p>
      </div>

      <OrderStatusStepper status={order.orderStatus} cancelledAt={cancelledAt} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ContactPanel order={order} />
          <ItemsPanel order={order} />
          <Panel title="Guía de envío">
            <TrackingForm
              orderId={order.id}
              trackingNumber={order.trackingNumber}
              carrier={order.trackingCarrier}
              trackingUrl={order.trackingUrl}
            />
          </Panel>
          <Panel title="Notas internas">
            <InternalNotes orderId={order.id} notes={order.notes} />
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Acciones">
            <OrderActionsPanel
              orderId={order.id}
              orderNumber={order.orderNumber}
              orderStatus={order.orderStatus}
              paymentStatus={order.paymentStatus}
              totalCents={order.totalCents}
              refundedCents={order.refundedCents}
            />
          </Panel>
          <PaymentPanel order={order} remainingCents={remainingCents} />
          <Panel title="Historial">
            <OrderHistoryLog history={order.history} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** A bordered card panel with a small section header. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function ContactPanel({ order }: { order: AdminOrderDetail }) {
  return (
    <Panel title="Datos de contacto y envío">
      <dl className="flex flex-col gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Contacto</dt>
          <dd>{order.contactEmail}</dd>
          {order.contactPhone ? <dd className="text-muted-foreground">{order.contactPhone}</dd> : null}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Envío a</dt>
          <dd className="font-medium">{order.shippingFullName}</dd>
          <dd className="text-muted-foreground">
            {order.addressLine1}
            {order.addressLine2 ? `, ${order.addressLine2}` : ""}
          </dd>
          <dd className="text-muted-foreground">
            Col. {order.city} · CP {order.postalCode} · {order.state}
          </dd>
        </div>
        {order.deliveryNotes ? (
          <div>
            <dt className="text-xs text-muted-foreground">Notas de entrega</dt>
            <dd className="text-muted-foreground">{order.deliveryNotes}</dd>
          </div>
        ) : null}
      </dl>
    </Panel>
  );
}

function ItemsPanel({ order }: { order: AdminOrderDetail }) {
  return (
    <Panel title={`Artículos (${order.items.length})`}>
      <ul className="flex flex-col gap-3">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="text-foreground">
                {item.productName} <span className="text-muted-foreground">×{item.quantity}</span>
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                SKU {item.productSku}
                {item.variantLabel ? ` · ${item.variantLabel}` : ""}
              </p>
            </div>
            <span className="shrink-0 tabular-nums">{formatMXN(item.lineTotalCents)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-sm">
        <TotalRow label="Subtotal" value={formatMXN(order.subtotalCents)} />
        {order.discountCents > 0 ? (
          <TotalRow label="Descuento" value={`− ${formatMXN(order.discountCents)}`} />
        ) : null}
        <TotalRow label="Envío" value={formatMXN(order.shippingCents)} />
        <TotalRow label="Total" value={formatMXN(order.totalCents)} emphasis />
      </dl>
    </Panel>
  );
}

function PaymentPanel({ order, remainingCents }: { order: AdminOrderDetail; remainingCents: number }) {
  const isPartial = order.refundedCents > 0 && order.refundedCents < order.totalCents;
  return (
    <Panel title="Pago">
      <dl className="flex flex-col gap-1 text-sm">
        <TotalRow label="Total" value={formatMXN(order.totalCents)} />
        <TotalRow label="Reembolsado" value={formatMXN(order.refundedCents)} />
        <TotalRow label="Reembolsable" value={formatMXN(remainingCents)} emphasis />
      </dl>
      {order.orderStatus === "cancelled" && order.paymentStatus === "paid" ? (
        <p className="mt-2 text-xs text-muted-foreground">Pedido cancelado, pago aún reembolsable.</p>
      ) : null}
      {isPartial ? (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="partial-refund-note">
          Reembolso parcial emitido.
        </p>
      ) : null}
    </Panel>
  );
}

function TotalRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={emphasis ? "font-semibold tabular-nums text-foreground" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
