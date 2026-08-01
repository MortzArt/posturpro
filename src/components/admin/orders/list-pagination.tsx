import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { paginationWindow, PAGINATION_ELLIPSIS } from "@/lib/catalog/pagination";
import { cn } from "@/lib/utils";

/**
 * ListPagination (T12) — windowed page links preserving the active filters,
 * parameterized by a `hrefFor(page)` builder so it serves both the order list and
 * the customer list (each supplies its own base path + query-string builder).
 * Mirrors `AdminPagination`. Server component (plain links, back-safe).
 */
interface ListPaginationProps {
  page: number;
  lastPage: number;
  hrefFor: (page: number) => string;
  testid?: string;
}

export function ListPagination({ page, lastPage, hrefFor, testid }: ListPaginationProps) {
  if (lastPage <= 1) return null;
  const items = paginationWindow(page, lastPage);

  return (
    <nav
      aria-label="Paginación"
      className="flex items-center gap-1"
      data-testid={testid ?? "admin-list-pagination"}
    >
      <PageArrow direction="prev" disabled={page <= 1} href={hrefFor(page - 1)} label="Página anterior" />
      {items.map((item, index) =>
        item === PAGINATION_ELLIPSIS ? (
          <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            aria-current={item === page ? "page" : undefined}
            data-testid={`admin-list-page-${item}`}
            className={cn(
              "inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-2.5 py-1 text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:min-h-8 sm:min-w-8",
              item === page
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {item}
          </Link>
        ),
      )}
      <PageArrow direction="next" disabled={page >= lastPage} href={hrefFor(page + 1)} label="Página siguiente" />
    </nav>
  );
}

function PageArrow({
  direction,
  disabled,
  href,
  label,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  href: string;
  label: string;
}) {
  const icon = direction === "prev" ? ArrowLeft01Icon : ArrowRight01Icon;
  const classes =
    "inline-flex size-9 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:size-8";
  if (disabled) {
    return (
      <span aria-disabled className={cn(classes, "text-muted-foreground/40")}>
        <HugeiconsIcon icon={icon} size={16} strokeWidth={2} aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={cn(classes, "text-muted-foreground hover:bg-muted/60")}>
      <HugeiconsIcon icon={icon} size={16} strokeWidth={2} aria-hidden />
    </Link>
  );
}
