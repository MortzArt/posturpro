import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRODUCT_STATUS_GLYPHS, PRODUCT_STATUS_LABELS } from "@/lib/admin/format";

type ProductStatus = "draft" | "active" | "archived";

/**
 * ProductStatusBadge (T11 §1.3) — status conveyed by SHAPE glyph + TEXT, never
 * color alone (the palette is grayscale). Server-safe (presentational).
 */
export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <Badge
      variant={status === "draft" ? "outline" : "secondary"}
      data-testid={`admin-product-status-${status}`}
      className={cn(
        "gap-1 font-normal",
        status === "archived" && "text-muted-foreground",
      )}
    >
      <span aria-hidden className="text-[0.7em] leading-none">
        {PRODUCT_STATUS_GLYPHS[status]}
      </span>
      {PRODUCT_STATUS_LABELS[status]}
    </Badge>
  );
}
