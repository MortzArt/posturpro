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
  // Middle crumbs (not first, not last) collapse to a single `…` on mobile.
  const hasCollapsibleMiddle = items.length > 2;
  // The first middle crumb is where the single mobile `…` placeholder renders.
  const firstMiddleIndex = hasCollapsibleMiddle ? 1 : -1;

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
          const middleCollapses = isMiddle && hasCollapsibleMiddle;

          // A separator precedes every crumb after the first. The separator
          // before the FIRST collapsed middle stays visible on mobile — it is
          // the `Inicio ›` chevron leading into the `…`. Separators before any
          // SUBSEQUENT collapsed middle hide on mobile, otherwise each hidden
          // middle strands a chevron and they double up (m-2). The last crumb's
          // separator (`… › Ejecutivas`) always shows. Net mobile trail:
          // `Inicio › … › Ejecutivas`.
          const separatorHiddenOnMobile =
            middleCollapses && index !== firstMiddleIndex;
          const separator =
            index > 0 ? (
              <Separator hiddenOnMobile={separatorHiddenOnMobile} />
            ) : null;
          // Render the mobile-only `…` exactly ONCE, before the first middle.
          const ellipsis =
            index === firstMiddleIndex ? (
              <EllipsisPlaceholder moreLabel={moreLabel} />
            ) : null;

          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {separator}
              {ellipsis}
              <li
                className={cn(
                  "inline-flex min-w-0 items-center",
                  middleCollapses && "hidden sm:inline-flex",
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

function Separator({ hiddenOnMobile = false }: { hiddenOnMobile?: boolean }) {
  return (
    <li
      aria-hidden
      className={cn(
        "items-center text-muted-foreground",
        hiddenOnMobile ? "hidden sm:inline-flex" : "inline-flex",
      )}
      data-testid="breadcrumb-separator"
    >
      <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
    </li>
  );
}

/** The single `…` shown in place of the collapsed middle crumbs on mobile. */
function EllipsisPlaceholder({ moreLabel }: { moreLabel: string }) {
  return (
    <li
      className="inline-flex items-center sm:hidden"
      data-testid="breadcrumb-ellipsis"
    >
      <span aria-hidden className="text-muted-foreground">
        …
      </span>
      <span className="sr-only">{moreLabel}</span>
    </li>
  );
}
