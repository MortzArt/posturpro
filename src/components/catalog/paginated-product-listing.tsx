import { getTranslations } from "next-intl/server";
import { CATALOG_PATH } from "@/lib/config";
import {
  makeHrefForPage,
  readClampedProductPage,
} from "@/lib/catalog/page-helpers";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Pagination } from "@/components/catalog/pagination";
import { EmptyState } from "@/components/catalog/empty-state";
import type { CatalogPage, CatalogProductCard } from "@/lib/catalog/types";

/**
 * PaginatedProductListing (T3 AC-9, AC-11, AC-16) — the `?page`-dependent slice
 * of every listing page, isolated so its `searchParams` read stays inside a
 * `<Suspense>` boundary and the page shell can be static/ISR. It clamps the
 * page (edge case 7), renders the grid + crawlable pagination, or the empty
 * state when a valid entity has zero products.
 *
 * `read` is a page-provided reader (all/brand/style/category) whose data is
 * tag-cached; `basePath` single-sources the page-1-canonical href rule.
 */

/** The `catalog.empty.*` key to use when the listing is empty. */
type EmptyMessageKey = "empty.category" | "empty.brand" | "empty.style";

interface PaginatedProductListingProps {
  searchParams: Promise<{ page?: string | string[] }>;
  basePath: string;
  emptyMessageKey: EmptyMessageKey;
  read: (page: number) => Promise<CatalogPage<CatalogProductCard>>;
}

export async function PaginatedProductListing({
  searchParams,
  basePath,
  emptyMessageKey,
  read,
}: PaginatedProductListingProps) {
  const { page: rawPage } = await searchParams;
  const t = await getTranslations("catalog");

  const { page, result } = await readClampedProductPage(rawPage, read);

  if (result.items.length === 0) {
    return (
      <EmptyState
        message={t(emptyMessageKey)}
        ctaLabel={t("empty.cta")}
        ctaHref={CATALOG_PATH}
      />
    );
  }

  const hrefForPage = makeHrefForPage(basePath);

  return (
    <>
      <ProductGrid products={result.items} />
      <Pagination
        currentPage={page}
        lastPage={result.lastPage}
        hrefForPage={hrefForPage}
        labels={{
          label: t("pagination.label"),
          previous: t("pagination.previous"),
          next: t("pagination.next"),
          pageOf: t("pagination.pageOf", { page, total: result.lastPage }),
          goToPage: (n) => t("pagination.goToPage", { page: n }),
          morePages: t("pagination.morePages"),
        }}
      />
    </>
  );
}
