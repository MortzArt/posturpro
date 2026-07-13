import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ActiveFilters (T5 AC-14). Removable chips for every active filter + "Clear
 * all". Server component — each chip's ✕ is a REAL `<a href={removeHref}>`
 * (works JS-off; JS enhances to router.push via the same navigation), so
 * removal degrades gracefully. Renders nothing when there are no chips.
 *
 * The `aria-live` RESULT COUNT lives in `SearchResults` (inside the Suspense
 * boundary) because it reflects the FILTERED total, which is only known after
 * the RPC runs; keeping it there makes it the loading→done cue too. The visible
 * ✕ is `aria-hidden`; the link carries the descriptive label. On mobile the
 * chip row scrolls horizontally so it never pushes the grid off-screen (edge 12).
 */

export interface ActiveFilterChip {
  key: string;
  label: string;
  removeHref: string;
  removeLabel: string;
}

interface ActiveFiltersProps {
  chips: ActiveFilterChip[];
  clearAllHref: string;
  clearAllLabel: string;
}

export function ActiveFilters({
  chips,
  clearAllHref,
  clearAllLabel,
}: ActiveFiltersProps) {
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="mb-6 flex flex-col gap-3" data-testid="active-filters">
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.removeHref}
            aria-label={chip.removeLabel}
            data-testid={`chip-${chip.key}`}
            scroll={false}
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
          >
            <Badge
              variant="secondary"
              className="gap-1 py-1 pl-3 pr-2 text-sm font-normal"
            >
              {chip.label}
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} aria-hidden />
            </Badge>
          </Link>
        ))}

        <Link
          href={clearAllHref}
          data-testid="clear-all"
          scroll={false}
          className={cn(
            buttonVariants({ variant: "ghost", size: "lg" }),
            "min-h-11 text-sm",
          )}
        >
          {clearAllLabel}
        </Link>
      </div>
    </div>
  );
}
