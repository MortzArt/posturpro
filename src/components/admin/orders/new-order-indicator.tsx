import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { ADMIN_ORDERS_PATH } from "@/lib/admin/constants";

/**
 * NewOrderIndicator (T12 Surface 9, AC-25/26) — the dashboard card showing the
 * count of orders awaiting fulfilment (pending_payment/paid), linking to the
 * filtered list. Count > 0 → a subtle STATIC amber tint (no pulsing — a
 * persistent alert must not become noise). Server component (presentational).
 * `sendNewOrderOwnerAlert` stays wired at checkout (T9); this does NOT duplicate it.
 */
export function NewOrderIndicator({ count }: { count: number }) {
  const hasNew = count > 0;
  return (
    <Link
      href={`${ADMIN_ORDERS_PATH}?status=paid`}
      data-testid="dashboard-new-orders"
      className={cn(
        "group/card flex flex-col gap-2 rounded-lg border p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
        hasNew
          ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20"
          : "border-border hover:bg-muted/40",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">Nuevos pedidos</span>
      <span className="flex items-baseline gap-2">
        {hasNew ? (
          <span aria-hidden className="text-sm text-amber-700 dark:text-amber-400">
            ●
          </span>
        ) : null}
        <span className="text-2xl font-semibold tabular-nums">{count}</span>
      </span>
      <span className="text-xs text-muted-foreground">
        {hasNew ? "por atender" : "Sin pedidos nuevos."}
      </span>
      <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground">
        Ver pedidos
        <HugeiconsIcon
          icon={ArrowRight02Icon}
          size={13}
          strokeWidth={2}
          aria-hidden
          className="transition-transform group-hover/card:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
