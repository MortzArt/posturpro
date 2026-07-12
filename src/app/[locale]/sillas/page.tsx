import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { CATALOG_PATH } from "@/lib/config";
import { listProducts } from "@/lib/catalog/queries";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { ProductGridSkeleton } from "@/components/catalog/catalog-skeleton";
import { PaginatedProductListing } from "@/components/catalog/paginated-product-listing";

/**
 * /sillas — all active products grid (T3 AC-1, AC-9, AC-11). The page shell
 * (breadcrumb + header) is STATIC/ISR (cookie-free); the `?page`-dependent grid
 * is isolated in a `<Suspense>` child so reading `searchParams` does not force
 * the whole route on-demand. Data is tag-cached (`catalog`). Whole page is
 * server-rendered anchors — works JS-off; `?page` clamps deterministically.
 */

interface CatalogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

/** Prerender both locales' page-1 shell at build time (AC-11). */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: activeLocale, namespace: "catalog" });
  return { title: t("metadata.catalogTitle") };
}

export default async function CatalogListPage({
  params,
  searchParams,
}: CatalogPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={t("breadcrumb.home")}
        moreLabel={t("pagination.morePages")}
        items={[
          { label: t("breadcrumb.home"), href: "/" },
          { label: t("breadcrumb.catalog") },
        ]}
      />
      <header className="mb-6 mt-2 flex flex-col gap-2 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("subtitle")}
        </p>
      </header>

      <Suspense fallback={<ProductGridSkeleton />}>
        <PaginatedProductListing
          searchParams={searchParams}
          basePath={CATALOG_PATH}
          emptyMessageKey="empty.category"
          read={(page) => listProducts({ page })}
        />
      </Suspense>
    </section>
  );
}
