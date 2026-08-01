import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PAYMENT_STATUS_META } from "@/lib/admin/orders/order-status-meta";
import type { PaymentStatus } from "@/lib/supabase/database.types";

/**
 * PaymentStatusBadge — payment state conveyed by GLYPH + TEXT, never color alone.
 * A `refunded` badge means a FULL refund happened; a partial refund leaves the
 * badge `paid` (conveyed by the refundable-balance line instead). Server-safe.
 */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const meta = PAYMENT_STATUS_META[status];
  return (
    <Badge
      variant={meta.variant}
      data-testid={`payment-status-${status}`}
      className={cn("gap-1 font-normal", meta.tint)}
    >
      <span aria-hidden className="text-[0.7em] leading-none">
        {meta.glyph}
      </span>
      {meta.label}
    </Badge>
  );
}
