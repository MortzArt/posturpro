import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { paginationWindow, PAGINATION_ELLIPSIS } from "@/lib/catalog/pagination";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin/constants";
import { buildListQueryString } from "@/lib/admin/products/list-filters";
import type { ProductListFilters } from "@/lib/admin/products/list-filters";
import { cn } from "@/lib/utils";

/**
 * AdminPagination (T11 Slice 1, AC-7) — windowed page links preserving the
 * active filters (reuses the pure `paginationWindow`). Prev/next disabled at the
 * ends. Server component (plain links, back-safe).
 */
interface AdminPaginationProps {
  page: number;
  lastPage: number;
  filters: ProductListFilters;
}

export function AdminPagination({ page, lastPage, filters }: AdminPaginationProps) {
  if (lastPage <= 1) return null;
  const items = paginationWindow(page, lastPage);
  const hrefFor = (target: number): string =>
    `${ADMIN_PRODUCTS_PATH}${buildListQueryString(filters, { page: target })}`;

  return (
    <nav aria-label="Paginación" className="flex items-center gap-1" data-testid="admin-products-pagination">
      <PageArrow
        direction="prev"
        disabled={page <= 1}
        href={hrefFor(page - 1)}
        label="Página anterior"
      />
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
            data-testid={`admin-page-${item}`}
            className={cn(
              "min-h-8 min-w-8 rounded-md px-2.5 py-1 text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              item === page ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {item}
          </Link>
        ),
      )}
      <PageArrow
        direction="next"
        disabled={page >= lastPage}
        href={hrefFor(page + 1)}
        label="Página siguiente"
      />
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
    "inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
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
