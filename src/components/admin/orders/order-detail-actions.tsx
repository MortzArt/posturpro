"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, MoneyBag02Icon, Cancel01Icon, PrinterIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/admin/products/dropdown";
import { RefundModal } from "@/components/admin/orders/refund-modal";
import { CancelOrderDialog } from "@/components/admin/orders/cancel-order-dialog";
import { ORDER_STATUS_META, ALLOWED_NEXT_STATUSES, ORDER_STATUS_RANK } from "@/lib/admin/orders/order-status-meta";
import { advanceStatus, markPaidOffline } from "@/app/admin/(app)/orders/actions";
import { ADMIN_ORDERS_PATH } from "@/lib/admin/constants";
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

/**
 * OrderDetailActions (T12 Surface 2, AC-8/9/10/16/13) — the write-action cluster.
 * Offers ONLY valid next-status transitions (from the allowed-transition map);
 * an invalid/regressive one is never shown and, if forced by a stale tab, the
 * RPC's `regression_blocked` surfaces inline. Refund is enabled while
 * `payment_status==='paid'` AND balance > 0 (even on a cancelled order — edge 6).
 * Cancel is enabled unless already cancelled. Emits an inline success banner
 * (role=status) after each write and refreshes.
 */
interface OrderDetailActionsProps {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  totalCents: number;
  refundedCents: number;
  onBanner: (banner: { message: string; emailSent: boolean } | null) => void;
}

export function OrderDetailActions({
  orderId,
  orderNumber,
  orderStatus,
  paymentStatus,
  totalCents,
  refundedCents,
  onBanner,
}: OrderDetailActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const nextStatuses = ALLOWED_NEXT_STATUSES[orderStatus];
  const remainingCents = Math.max(0, totalCents - refundedCents);
  const canRefund = paymentStatus === "paid" && remainingCents > 0;
  const canCancel = orderStatus !== "cancelled";
  const alreadyShipped = ORDER_STATUS_RANK[orderStatus] >= ORDER_STATUS_RANK.shipped && orderStatus !== "cancelled";

  const onAdvance = (target: OrderStatus): void => {
    setTransitionError(null);
    startTransition(async () => {
      const result = await advanceStatus(orderId, target);
      if (result.ok) {
        onBanner({ message: "Estado actualizado", emailSent: result.emailSent });
        router.refresh();
        return;
      }
      setTransitionError(
        result.reason === "regression" || result.reason === "not-allowed"
          ? "Esa transición no está permitida."
          : "No se pudo actualizar el estado.",
      );
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="order-detail-actions">
      <div className="flex flex-wrap items-center gap-2">
        {nextStatuses.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Avanzar estado"
              data-testid="advance-status-trigger"
              disabled={pending}
              className="inline-flex h-8 w-auto shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-transparent bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)_22%)] focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 sm:size-auto sm:h-8"
            >
              <HugeiconsIcon icon={ArrowRight02Icon} size={14} strokeWidth={2} aria-hidden />
              {pending ? "Avanzando…" : "Avanzar estado"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {nextStatuses.map((status) => (
                <DropdownMenuItem
                  key={status}
                  data-testid={`advance-to-${status}`}
                  onSelect={() => onAdvance(status)}
                >
                  {ORDER_STATUS_META[status].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <Button
          size="sm"
          variant="secondary"
          onClick={() => setRefundOpen(true)}
          disabled={!canRefund}
          data-testid="refund-open"
          className="shrink-0 whitespace-nowrap"
          {...(!canRefund ? { title: "El pago no es reembolsable.", "aria-describedby": "refund-reason" } : {})}
        >
          <HugeiconsIcon icon={MoneyBag02Icon} size={14} strokeWidth={2} aria-hidden />
          Reembolsar
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setCancelOpen(true)}
          disabled={!canCancel}
          data-testid="cancel-open"
          className="shrink-0 whitespace-nowrap"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} aria-hidden />
          Cancelar
        </Button>

        <Button
          size="sm"
          variant="ghost"
          asChild
          data-testid="packing-slip-open"
          className="shrink-0 whitespace-nowrap"
        >
          <a href={`${ADMIN_ORDERS_PATH}/${orderId}/packing-slip`} target="_blank" rel="noopener noreferrer">
            <HugeiconsIcon icon={PrinterIcon} size={14} strokeWidth={2} aria-hidden />
            Guía de empaque
          </a>
        </Button>
      </div>

      {!canRefund ? (
        <span id="refund-reason" className="sr-only">
          El pago no es reembolsable o no hay saldo por reembolsar.
        </span>
      ) : null}

      {transitionError ? (
        <p role="alert" className="enter-fade text-xs text-destructive" data-testid="transition-error">
          {transitionError}
        </p>
      ) : null}

      <RefundModal
        open={refundOpen}
        onOpenChange={setRefundOpen}
        orderId={orderId}
        orderNumber={orderNumber}
        totalCents={totalCents}
        refundedCents={refundedCents}
        onRefunded={(emailSent) => {
          onBanner({ message: "Reembolso emitido", emailSent });
          router.refresh();
        }}
      />

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orderId={orderId}
        orderNumber={orderNumber}
        alreadyShipped={alreadyShipped}
        onCancelled={(emailSent) => {
          onBanner({ message: "Pedido cancelado", emailSent });
          router.refresh();
        }}
      />
    </div>
  );
}
