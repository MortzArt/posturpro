import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_META } from "@/lib/admin/orders/order-status-meta";
import type { OrderStatus } from "@/lib/supabase/database.types";

/**
 * OrderStatusBadge — status conveyed by GLYPH + TEXT, never color alone (the
 * palette is grayscale; the tint is reinforcement only). Mirrors
 * `ProductStatusBadge`. Server-safe (presentational).
 */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <Badge
      variant={meta.variant}
      data-testid={`order-status-${status}`}
      className={cn("gap-1 font-normal", meta.tint)}
    >
      <span aria-hidden className="text-[0.7em] leading-none">
        {meta.glyph}
      </span>
      {meta.label}
    </Badge>
  );
}
