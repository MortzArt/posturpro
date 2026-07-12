import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  Alert02Icon,
  MinusSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { StockState } from "@/lib/catalog/types";

/**
 * StockBadge (T3 AC-8, AC-17) — one of exactly three stock states.
 *
 * Pure presentational server component. The label is PRE-RESOLVED by the caller
 * (grid resolves the `catalog.stock.*` string once per page), so the badge does
 * no i18n itself. Each state pairs a distinct ICON with distinct TEXT so the
 * state is legible to colorblind users and screen readers — color is never the
 * only signal. Sits on a translucent chip so the image reads through faintly.
 */

interface StockBadgeProps {
  state: StockState;
  /** Pre-resolved localized label ("En stock" / "Solo quedan 3" / "Agotado"). */
  label: string;
  /** Placement classes (absolute on a card, inline on a PDP). */
  className?: string;
}

const STATE_ICON = {
  in: CheckmarkCircle02Icon,
  low: Alert02Icon,
  out: MinusSignCircleIcon,
} as const;

const STATE_STYLES = {
  in: "bg-background/90 text-foreground backdrop-blur-sm",
  low: "bg-background/90 text-foreground backdrop-blur-sm",
  out: "bg-muted text-muted-foreground",
} as const;

const ICON_STYLES = {
  in: "text-foreground",
  // Amber tone conveys urgency; text + icon still carry the state without hue.
  low: "text-amber-600 dark:text-amber-400",
  out: "text-muted-foreground",
} as const;

export function StockBadge({ state, label, className }: StockBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        STATE_STYLES[state],
        className,
      )}
      data-testid="stock-badge"
      data-state={state}
    >
      <HugeiconsIcon
        icon={STATE_ICON[state]}
        size={12}
        strokeWidth={2}
        aria-hidden
        className={cn("size-3", ICON_STYLES[state])}
      />
      {label}
    </span>
  );
}
