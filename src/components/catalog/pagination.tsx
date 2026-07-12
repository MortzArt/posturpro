import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  PAGINATION_ELLIPSIS,
  paginationWindow,
} from "@/lib/catalog/pagination";

/**
 * Pagination (T3 AC-9, AC-14) — crawlable numbered pagination via REAL
 * `<a href="?page=N">` links (works JS-off, SEO-crawlable). Page 1 links to the
 * bare path (no `?page=1`); the current page is a non-navigating
 * `aria-current="page"` element; single-page renders nothing.
 *
 * Desktop: windowed numbers (first, current±1, last, ellipsis) + Prev/Next.
 * Mobile: Prev / "Página X de Y" / Next only. `hrefForPage` is supplied by the
 * page so this component is route-agnostic and the page-1-canonical rule lives
 * in one place.
 */

interface PaginationProps {
  /** Already clamped to `[1, lastPage]` by the page. */
  currentPage: number;
  lastPage: number;
  /** Builds the href for a page number; page 1 → base path (no `?page`). */
  hrefForPage: (page: number) => string;
  labels: {
    label: string; // nav aria-label
    previous: string;
    next: string;
    pageOf: string; // pre-interpolated "Página {page} de {total}"
    goToPage: (page: number) => string; // "Página 3"
    morePages: string; // SR text for the ellipsis gap
  };
}

const controlBase =
  "min-w-9 min-h-11 sm:min-h-9 px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function Pagination({
  currentPage,
  lastPage,
  hrefForPage,
  labels,
}: PaginationProps) {
  if (lastPage <= 1) {
    return null;
  }

  const window = paginationWindow(currentPage, lastPage);
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < lastPage;

  return (
    <nav
      aria-label={labels.label}
      className="mt-8 flex items-center justify-between gap-2 md:mt-10 md:justify-center"
      data-testid="pagination"
    >
      <PrevNext
        direction="previous"
        page={currentPage - 1}
        enabled={hasPrevious}
        hrefForPage={hrefForPage}
        label={labels.previous}
      />

      {/* Mobile: compact "Page X of Y". */}
      <span
        className="text-sm tabular-nums text-muted-foreground sm:hidden"
        data-testid="pagination-count"
      >
        {labels.pageOf}
      </span>

      {/* Desktop+: windowed numbered links. */}
      <ol className="hidden items-center gap-1 sm:flex">
        {window.map((item, index) => {
          if (item === PAGINATION_ELLIPSIS) {
            return (
              <li key={`ellipsis-${index}`} aria-hidden className="px-2 text-muted-foreground">
                …
                <span className="sr-only">{labels.morePages}</span>
              </li>
            );
          }
          const isCurrent = item === currentPage;
          return (
            <li key={item}>
              {isCurrent ? (
                <span
                  aria-current="page"
                  className={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "min-w-9 tabular-nums",
                  )}
                  data-testid="pagination-current"
                >
                  {item}
                </span>
              ) : (
                <Link
                  href={hrefForPage(item)}
                  aria-label={labels.goToPage(item)}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "min-w-9 tabular-nums",
                  )}
                  data-testid="pagination-page"
                >
                  {item}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      <PrevNext
        direction="next"
        page={currentPage + 1}
        enabled={hasNext}
        hrefForPage={hrefForPage}
        label={labels.next}
      />
    </nav>
  );
}

interface PrevNextProps {
  direction: "previous" | "next";
  page: number;
  enabled: boolean;
  hrefForPage: (page: number) => string;
  label: string;
}

function PrevNext({ direction, page, enabled, hrefForPage, label }: PrevNextProps) {
  const icon = direction === "previous" ? ArrowLeft01Icon : ArrowRight01Icon;
  const testId = `pagination-${direction}`;
  const content = (
    <>
      {direction === "previous" ? (
        <HugeiconsIcon icon={icon} size={16} strokeWidth={2} aria-hidden />
      ) : null}
      {label}
      {direction === "next" ? (
        <HugeiconsIcon icon={icon} size={16} strokeWidth={2} aria-hidden />
      ) : null}
    </>
  );

  if (!enabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          controlBase,
          "pointer-events-none opacity-50",
        )}
        data-testid={testId}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={hrefForPage(page)}
      className={cn(buttonVariants({ variant: "outline", size: "lg" }), controlBase)}
      data-testid={testId}
    >
      {content}
    </Link>
  );
}
