import { HugeiconsIcon } from "@hugeicons/react";
import { Chair01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * EmptyState (T3 AC-16, edge case 1) — a VALID taxonomy entity with zero active
 * products. Not a 404, not a blank grid, not an error. A localized message +
 * a CTA back to the full catalog. Reuses `.enter-fade` (low-frequency page, so
 * the entrance animation is justified). Server component.
 */

interface EmptyStateProps {
  /** Pre-resolved context-specific message ("No hay sillas..."). */
  message: string;
  /** Pre-resolved CTA label ("Ver todo el catálogo"). */
  ctaLabel: string;
  /** CTA destination (locale-agnostic, e.g. "/sillas"). */
  ctaHref: string;
}

export function EmptyState({ message, ctaLabel, ctaHref }: EmptyStateProps) {
  return (
    <div
      className="enter-fade flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center"
      data-testid="empty-state"
    >
      <HugeiconsIcon
        icon={Chair01Icon}
        size={48}
        strokeWidth={1.5}
        aria-hidden
        className="text-muted-foreground"
      />
      <p className="text-lg font-semibold tracking-tight">{message}</p>
      <Button asChild size="lg" className="min-h-11 px-4">
        <Link href={ctaHref} data-testid="empty-state-cta">
          {ctaLabel}
        </Link>
      </Button>
    </div>
  );
}
