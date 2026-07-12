import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { BRANDS_PATH, brandPath } from "@/lib/config";
import { getBrand, listBrands, listProductsByBrand } from "@/lib/catalog/queries";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { ProductGridSkeleton } from "@/components/catalog/catalog-skeleton";
import { PaginatedProductListing } from "@/components/catalog/paginated-product-listing";
import { BrandLogo } from "@/components/catalog/brand-logo";

/**
 * /marcas/[slug] — brand page (T3 AC-4, AC-14, AC-16, edge case 5). 404 on
 * unknown/inactive slug; header shows the logo (monogram fallback) + name +
 * description (omitted when null); grid of the brand's active products.
 */

interface BrandPageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

/** Prerender the known brand slugs per locale at build time (AC-11). */
export async function generateStaticParams() {
  const brands = await listBrands();
  return routing.locales.flatMap((locale) =>
    brands.map((brand) => ({ locale, slug: brand.slug })),
  );
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const activeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const brand = await getBrand(slug);
  if (!brand) return {};
  const t = await getTranslations({ locale: activeLocale, namespace: "catalog" });
  return {
    title: `${brand.name} — ${t("metadata.brandsTitle")}`,
    description: brand.description ?? undefined,
  };
}

export default async function BrandPage({
  params,
  searchParams,
}: BrandPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");

  const brand = await getBrand(slug);
  if (!brand) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={t("breadcrumb.brands")}
        moreLabel={t("pagination.morePages")}
        items={[
          { label: t("breadcrumb.home"), href: "/" },
          { label: t("breadcrumb.brands"), href: BRANDS_PATH },
          { label: brand.name },
        ]}
      />
      <header className="mb-6 mt-2 flex flex-col gap-3 border-b border-border pb-6 md:mb-8">
        <div className="flex items-center gap-4">
          <BrandLogo
            name={brand.name}
            logoUrl={brand.logoUrl}
            logoAlt={t("brand.logoAlt", { brand: brand.name })}
            size="lg"
          />
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {brand.name}
          </h1>
        </div>
        {brand.description ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
            {brand.description}
          </p>
        ) : null}
      </header>

      <Suspense fallback={<ProductGridSkeleton />}>
        <PaginatedProductListing
          searchParams={searchParams}
          basePath={brandPath(brand.slug)}
          emptyMessageKey="empty.brand"
          read={(rawPage) =>
            listProductsByBrand(brand.id, brand.slug, { rawPage })
          }
        />
      </Suspense>
    </section>
  );
}
