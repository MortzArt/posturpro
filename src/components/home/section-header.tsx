import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";

/**
 * HomeSectionHeader (T13) — the "{heading} … Ver todas →" row above each
 * featured grid. DRY between FeaturedProducts and FeaturedBrands. The "Ver
 * todas" link reuses the shipped `.link-arrow` directional-nudge (`.group/brands`).
 */

interface HomeSectionHeaderProps {
  heading: string;
  linkLabel: string;
  linkHref: string;
  testId?: string;
}

export function HomeSectionHeader({
  heading,
  linkLabel,
  linkHref,
  testId,
}: HomeSectionHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-1 sm:mb-8 sm:flex-row sm:items-baseline sm:justify-between">
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {heading}
      </h2>
      <Link
        href={linkHref}
        data-testid={testId}
        className="nav-hover group/brands inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {linkLabel}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={16}
          strokeWidth={2}
          aria-hidden
          className="link-arrow"
        />
      </Link>
    </div>
  );
}
