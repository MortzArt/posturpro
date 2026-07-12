import { Fragment } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Breadcrumbs (T3 AC-7) — accessible trail derived from the route + fetched
 * entity (never hardcoded). Semantic `<nav aria-label> > <ol>`; separators are
 * `aria-hidden`; the last crumb is the current page (`aria-current="page"`,
 * NOT a link). On mobile the middle crumbs collapse to a non-interactive `…`
 * with no horizontal scroll; the full trail is still in the DOM for a11y.
 *
 * The ordered `items` array is the single source a future `BreadcrumbList`
 * JSON-LD emitter (T14) can consume — do not build the JSON-LD here.
 */

export interface Crumb {
  label: string;
  /** Omitted on the last (current) crumb. */
  href?: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
  /** Accessible name for the nav landmark (localized, e.g. "Ruta de navegación"). */
  ariaLabel: string;
  /** Localized SR text for the collapsed-middle indicator. */
  moreLabel: string;
  className?: string;
}

export function Breadcrumbs({
  items,
  ariaLabel,
  moreLabel,
  className,
}: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  const lastIndex = items.length - 1;
  // Middle crumbs (not first, not last) collapse to `…` on small screens.
  const hasCollapsibleMiddle = items.length > 2;

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("py-3", className)}
      data-testid="breadcrumbs"
    >
      <ol className="flex items-center gap-2 text-sm">
        {items.map((crumb, index) => {
          const isFirst = index === 0;
          const isLast = index === lastIndex;
          const isMiddle = !isFirst && !isLast;

          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? <Separator /> : null}
              {isMiddle && hasCollapsibleMiddle ? (
                <EllipsisPlaceholder moreLabel={moreLabel} />
              ) : null}
              <li
                className={cn(
                  "inline-flex min-w-0 items-center",
                  isMiddle && hasCollapsibleMiddle && "hidden sm:inline-flex",
                )}
              >
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="nav-hover truncate rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cn(
                      "truncate",
                      isLast
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

function Separator() {
  return (
    <li aria-hidden className="inline-flex items-center text-muted-foreground">
      <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
    </li>
  );
}

/** The `…` shown in place of collapsed middle crumbs on small screens only. */
function EllipsisPlaceholder({ moreLabel }: { moreLabel: string }) {
  return (
    <li className="inline-flex items-center sm:hidden">
      <span aria-hidden className="text-muted-foreground">
        …
      </span>
      <span className="sr-only">{moreLabel}</span>
      <span aria-hidden className="ml-2 inline-flex items-center text-muted-foreground">
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
      </span>
    </li>
  );
}
