import Link from "next/link";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon } from "@hugeicons/core-free-icons";
import { formatMXN } from "@/lib/money";
import { formatRelativeDate } from "@/lib/admin/format";
import { displayRangeFor } from "@/lib/catalog/pagination";
import { ADMIN_PRODUCTS_PER_PAGE } from "@/lib/config";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin/constants";
import { ProductStatusBadge } from "@/components/admin/products/status-badge";
import { ProductRowActions } from "@/components/admin/products/product-row-actions";
import { AdminPagination } from "@/components/admin/products/admin-pagination";
import type { AdminProductRow } from "@/lib/admin/products/list-query";
import type { ProductListFilters } from "@/lib/admin/products/list-filters";

/**
 * ProductTable (T11 Slice 1, AC-5/7) — desktop table + mobile card list of the
 * current page. Server component (data present at render). Each row/card links
 * to the edit page; a `⋮` menu (client) carries the row actions. Status uses the
 * shape+text badge (never color alone). Stock shows a "(var)" hint when it is a
 * variant-summed value (edge 7).
 */
interface ProductTableProps {
  rows: AdminProductRow[];
  totalCount: number;
  page: number;
  lastPage: number;
  filters: ProductListFilters;
}

export function ProductTable({ rows, totalCount, page, lastPage, filters }: ProductTableProps) {
  // Range is derived from the page SIZE + total, never rows.length (which is
  // smaller on the last page and would corrupt the start index) — M-5.
  const { start, end } = displayRangeFor(page, ADMIN_PRODUCTS_PER_PAGE, totalCount);
  return (
    <div className="flex flex-col gap-4" data-testid="admin-products-table">
      <DesktopTable rows={rows} />
      <MobileCards rows={rows} />
      <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <p className="tabular-nums" data-testid="admin-products-count">
          {totalCount === 0 ? "Sin resultados" : `Mostrando ${start}–${end} de ${totalCount}`}
        </p>
        <AdminPagination page={page} lastPage={lastPage} filters={filters} />
      </div>
    </div>
  );
}

/** Desktop / tablet table (≥ 640px), horizontally scrollable if needed. */
function DesktopTable({ rows }: { rows: AdminProductRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Lista de productos</caption>
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-14 px-3 py-2 font-medium" />
            <th scope="col" className="px-3 py-2 font-medium">Nombre / SKU</th>
            <th scope="col" className="px-3 py-2 font-medium">Marca</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Precio</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Stock</th>
            <th scope="col" className="px-3 py-2 font-medium">Estado</th>
            <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Actualizado</th>
            <th scope="col" className="w-12 px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="nav-hover border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2">
                <Thumbnail url={row.coverUrl} name={row.name} />
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`${ADMIN_PRODUCTS_PATH}/${row.id}/edit`}
                  className="font-medium text-foreground outline-none hover:underline focus-visible:underline"
                  data-testid={`admin-product-row-${row.id}`}
                >
                  {row.name}
                </Link>
                <p className="font-mono text-xs text-muted-foreground">{row.sku}</p>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.brandName ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMXN(row.priceCents)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.stock}
                {row.stockIsVariantSummed ? (
                  <span className="ml-1 text-[0.625rem] text-muted-foreground">(var)</span>
                ) : null}
              </td>
              <td className="px-3 py-2"><ProductStatusBadge status={row.status} /></td>
              <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
                {formatRelativeDate(row.updatedAt)}
              </td>
              <td className="px-3 py-2 text-right">
                <ProductRowActions
                  productId={row.id}
                  productName={row.name}
                  status={row.status}
                  currentStock={row.stock}
                  usesVariantStock={row.stockIsVariantSummed}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile card list (< 640px) — the 8-column table would hide key facts. */
function MobileCards({ rows }: { rows: AdminProductRow[] }) {
  return (
    <ul className="flex flex-col gap-2 sm:hidden">
      {rows.map((row) => (
        <li key={row.id} className="flex gap-3 rounded-lg border border-border p-3">
          <Thumbnail url={row.coverUrl} name={row.name} size={56} />
          <div className="min-w-0 flex-1">
            <Link
              href={`${ADMIN_PRODUCTS_PATH}/${row.id}/edit`}
              className="block truncate font-medium text-foreground"
            >
              {row.name}
            </Link>
            <p className="truncate font-mono text-xs text-muted-foreground">{row.sku}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="tabular-nums">{formatMXN(row.priceCents)}</span>
              <span className="tabular-nums text-muted-foreground">
                Stock: {row.stock}
                {row.stockIsVariantSummed ? " (var)" : ""}
              </span>
              <ProductStatusBadge status={row.status} />
            </div>
          </div>
          <ProductRowActions
            productId={row.id}
            productName={row.name}
            status={row.status}
            currentStock={row.stock}
            usesVariantStock={row.stockIsVariantSummed}
          />
        </li>
      ))}
    </ul>
  );
}

/** Cover thumbnail with an icon placeholder when the product has no image. */
function Thumbnail({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  if (!url) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-md bg-muted text-muted-foreground/50"
      >
        <HugeiconsIcon icon={Image01Icon} size={20} strokeWidth={2} aria-hidden />
      </div>
    );
  }
  return (
    <Image
      src={url}
      alt={name}
      width={size}
      height={size}
      className="rounded-md bg-muted object-cover"
      style={{ width: size, height: size }}
    />
  );
}
