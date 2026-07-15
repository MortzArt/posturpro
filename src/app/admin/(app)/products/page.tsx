import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { AdminPage } from "@/components/admin/admin-page";
import { ProductFilters } from "@/components/admin/products/product-filters";
import { ProductTable } from "@/components/admin/products/product-table";
import { ProductEmptyState } from "@/components/admin/products/product-empty-state";
import { CsvToolbar } from "@/components/admin/products/csv-toolbar";
import { listAdminProducts } from "@/lib/admin/products/list-query";
import {
  parseListFilters,
  hasActiveFilters,
  type RawSearchParams,
} from "@/lib/admin/products/list-filters";
import {
  listBrandOptions,
  listCategoryOptions,
} from "@/lib/admin/taxonomy/taxonomy-read";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin/constants";

/**
 * Admin product list (T11 Slice 1). Server component: parses the URL filters,
 * reads a live page via the admin client (base table, no cache), and renders the
 * table or an empty state. Filter selects are seeded from a taxonomy read.
 */
export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseListFilters(await searchParams);
  const [result, brands, categories] = await Promise.all([
    listAdminProducts(filters),
    listBrandOptions(),
    listCategoryOptions(),
  ]);
  const filtered = hasActiveFilters(filters);
  const description =
    result.totalCount === 1
      ? "1 producto en el catálogo"
      : `${result.totalCount} productos en el catálogo`;

  return (
    <AdminPage
      title="Productos"
      description={description}
      actions={
        <>
          <CsvToolbar />
          <Button asChild size="sm" data-testid="admin-products-new">
            <Link href={`${ADMIN_PRODUCTS_PATH}/new`}>
              <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} aria-hidden />
              Nuevo producto
            </Link>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ProductFilters filters={filters} brands={brands} categories={categories} />
        {result.rows.length === 0 ? (
          <ProductEmptyState filtered={filtered} />
        ) : (
          <ProductTable
            rows={result.rows}
            totalCount={result.totalCount}
            page={result.page}
            lastPage={result.lastPage}
            filters={filters}
          />
        )}
      </div>
    </AdminPage>
  );
}
