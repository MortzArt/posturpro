import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SOURCE_BADGE_META } from "@/lib/admin/orders/order-status-meta";

/**
 * Provenance badge for a manually / phone-created order (T17). Mirrors
 * `OrderStatusBadge` grammar exactly: glyph + text (never color alone), the
 * glyph `aria-hidden` with the text label carrying meaning. Render only when
 * `isManualOrder(order.paymentMethod)` is true.
 */
export function SourceBadge() {
  const meta = SOURCE_BADGE_META.manual;
  return (
    <Badge
      variant={meta.variant}
      data-testid="order-source-manual"
      className={cn("gap-1 font-normal", meta.tint)}
    >
      <span aria-hidden className="text-[0.7em] leading-none">
        {meta.glyph}
      </span>
      {meta.label}
    </Badge>
  );
}
