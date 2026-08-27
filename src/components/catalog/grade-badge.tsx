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
}

export function GradeBadge({ grade, label, className }: GradeBadgeProps) {
  if (!isConditionGrade(grade)) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-[45%] items-center gap-1 truncate rounded-full border border-primary/20 bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground",
        className,
      )}
      data-testid="grade-badge"
      data-grade={grade}
    >
      <HugeiconsIcon
        icon={Award01Icon}
        size={12}
        strokeWidth={2}
        aria-hidden
        className="size-3 shrink-0 text-primary"
      />
      {label}
    </span>
  );
}
