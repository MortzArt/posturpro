import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { formatRelativeDate } from "@/lib/admin/format";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_META,
  ORDER_STATUS_RANK,
  STEPPER_STATUSES,
} from "@/lib/admin/orders/order-status-meta";
import type { OrderStatus } from "@/lib/supabase/database.types";

/**
 * OrderStatusStepper (T12 Surface 2) — the 5 forward statuses as a horizontal
 * (desktop) / vertical (mobile) stepper; the current step is filled + emphasized,
 * past steps muted, future steps faint. A `cancelled` order does NOT render the
 * stepper — it replaces it with a full-width cancelled band. Server component
 * (presentational); the fill-color transition on refresh is a CSS concern of the
 * consuming page (no layout animation here).
 */
interface OrderStatusStepperProps {
  status: OrderStatus;
  /** ISO timestamp of the cancellation (shown in the band) when cancelled. */
  cancelledAt?: string | null;
}

export function OrderStatusStepper({ status, cancelledAt }: OrderStatusStepperProps) {
  if (status === "cancelled") {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
        data-testid="order-stepper-cancelled"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden className="text-muted-foreground" />
        <span className="font-medium">Pedido cancelado</span>
        {cancelledAt ? (
          <span className="text-xs text-muted-foreground">· {formatRelativeDate(cancelledAt)}</span>
        ) : null}
      </div>
    );
  }

  const currentRank = ORDER_STATUS_RANK[status];

  return (
    <ol
      className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-start sm:gap-0"
      data-testid="order-stepper"
    >
      {STEPPER_STATUSES.map((step, index) => {
        const meta = ORDER_STATUS_META[step];
        const rank = ORDER_STATUS_RANK[step];
        const state = rank < currentRank ? "past" : rank === currentRank ? "current" : "future";
        const isLast = index === STEPPER_STATUSES.length - 1;
        return (
          <li key={step} className="flex items-center gap-2 sm:flex-1 sm:flex-col sm:gap-1.5 sm:text-center">
            <span
              aria-hidden
              className={cn(
                "text-base leading-none transition-[color,opacity] duration-200 ease-out",
                state === "current" && "text-foreground",
                state === "past" && "text-muted-foreground",
                state === "future" && "text-muted-foreground/40",
              )}
              style={{ transitionTimingFunction: "var(--ease-out)" }}
            >
              {meta.glyph}
            </span>
            <span
              className={cn(
                "text-xs",
                state === "current" ? "font-medium text-foreground" : "text-muted-foreground",
                state === "future" && "text-muted-foreground/50",
              )}
            >
              {meta.label}
            </span>
            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  "hidden h-px flex-1 sm:block",
                  rank < currentRank ? "bg-foreground/60" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
