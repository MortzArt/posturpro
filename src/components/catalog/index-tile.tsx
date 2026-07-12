import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * IndexTile (T3 AC-5, AC-6) — a link card used by the brand and style indexes.
 * Optional leading visual (BrandLogo for brands; none for styles), a name, and
 * an OPTIONAL description (omitted entirely when null, edge case 5 — no empty
 * block). Server component; motion via `.card-lift` + `.stagger`.
 */

interface IndexTileProps {
  href: string;
  name: string;
  description: string | null;
  /** Optional leading visual (e.g. BrandLogo). */
  leading?: ReactNode;
  /** Per-tile stagger delay in ms (capped by the caller). */
  staggerDelayMs?: number;
  testId?: string;
}

export function IndexTile({
  href,
  name,
  description,
  leading,
  staggerDelayMs = 0,
  testId = "index-tile",
}: IndexTileProps) {
  return (
    <li
      className="stagger"
      style={{ transitionDelay: `${staggerDelayMs}ms` }}
    >
      <Link
        href={href}
        data-testid={testId}
        className={cn(
          "card-lift flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <span className="flex items-center gap-3">
          {leading}
          <span className="text-sm font-medium tracking-tight text-foreground">
            {name}
          </span>
        </span>
        {description ? (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
