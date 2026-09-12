import { HugeiconsIcon } from "@hugeicons/react";
import { Award01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { isConditionGrade, type ProductConditionGrade } from "@/lib/catalog/grade";

/**
 * GradeBadge (T19 AC-10/11) — shows a product's condition grade (A+/A/B) when set.
 *
 * Pure presentational server component, following the StockBadge grammar: a
 * pre-resolved localized label + a glyph, token colors, `data-*` hooks. All three
 * grades share ONE visual treatment (mint chip, deep-green text). The grade
 * LETTER lives in the text, so color need not vary by grade — this is
 * colorblind-safe and deliberately avoids a green/amber/red scale that would
 * wrongly imply "B is bad" (all three are functionally verified).
 *
 * Self-guarding: `grade == null` OR an unrecognized value → renders NOTHING (no
 * badge, no reserved empty space — AC-10, edges 1/2). Parents also conditionally
 * render so no gap is left.
 */

interface GradeBadgeProps {
  /** null / unrecognized → renders nothing (AC-10, edge 2). */
  grade: ProductConditionGrade | null | undefined;
  /** Pre-resolved localized label, e.g. "Grado A+" / "Grade A+". */
  label: string;
  /** Placement classes (absolute on a card, inline on a PDP). */
  className?: string;
  /**
   * `sm` (default) is the compact chip overlaid on catalog card images (never
   * truncated — the card's overlay row wraps instead). `lg` is the PDP
   * purchase-card treatment: a roomier chip with a larger glyph.
   */
  size?: "sm" | "lg";
}

const SIZE_STYLES = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  lg: "gap-1.5 px-3 py-1 text-sm",
} as const;

const ICON_SIZE_PX = { sm: 12, lg: 16 } as const;
const ICON_STYLES = { sm: "size-3", lg: "size-4" } as const;

export function GradeBadge({ grade, label, className, size = "sm" }: GradeBadgeProps) {
  if (!isConditionGrade(grade)) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-secondary font-medium whitespace-nowrap text-secondary-foreground",
        SIZE_STYLES[size],
        className,
      )}
      data-testid="grade-badge"
      data-grade={grade}
      data-size={size}
    >
      <HugeiconsIcon
        icon={Award01Icon}
        size={ICON_SIZE_PX[size]}
        strokeWidth={2}
        aria-hidden
        className={cn("shrink-0 text-primary", ICON_STYLES[size])}
      />
      {label}
    </span>
  );
}
