import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { STYLES_PATH, stylePath } from "@/lib/config";
import { getStyle, listStyles, listProductsByStyle } from "@/lib/catalog/queries";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { ProductGridSkeleton } from "@/components/catalog/catalog-skeleton";
import { PaginatedProductListing } from "@/components/catalog/paginated-product-listing";

/**
 * /estilos/[slug] — style detail listing (T3 AC-6, AC-14, AC-16). 404 on
 * unknown/inactive slug; header shows name + description; grid of the style's
 * active products.
 */

interface StylePageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

/** Prerender the known style slugs per locale at build time (AC-11). */
export async function generateStaticParams() {
  const styles = await listStyles();
  return routing.locales.flatMap((locale) =>
    styles.map((style) => ({ locale, slug: style.slug })),
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
  const style = await getStyle(slug);
  if (!style) return {};
  const t = await getTranslations({ locale: activeLocale, namespace: "catalog" });
  return {
    title: `${style.name} — ${t("metadata.stylesTitle")}`,
    description: style.description ?? undefined,
  };
}

export default async function StylePage({
  params,
  searchParams,
}: StylePageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");

  const style = await getStyle(slug);
  if (!style) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={t("breadcrumb.styles")}
        moreLabel={t("pagination.morePages")}
        items={[
          { label: t("breadcrumb.home"), href: "/" },
          { label: t("breadcrumb.styles"), href: STYLES_PATH },
          { label: style.name },
        ]}
      />
      <header className="mb-6 mt-2 flex flex-col gap-2 md:mb-8">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {style.name}
        </h1>
        {style.description ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
            {style.description}
          </p>
        ) : null}
      </header>

      <Suspense fallback={<ProductGridSkeleton />}>
        <PaginatedProductListing
          searchParams={searchParams}
          basePath={stylePath(style.slug)}
          emptyMessageKey="empty.style"
          read={(rawPage) =>
            listProductsByStyle(style.id, style.slug, { rawPage })
          }
        />
      </Suspense>
    </section>
  );
}
