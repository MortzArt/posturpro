import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { STYLES_PATH, stylePath } from "@/lib/config";
import { getStyle, listStyles, listProductsByStyle } from "@/lib/catalog/queries";
import { Breadcrumbs, type Crumb } from "@/components/catalog/breadcrumbs";
import { ProductGridSkeleton } from "@/components/catalog/catalog-skeleton";
import { PaginatedProductListing } from "@/components/catalog/paginated-product-listing";
import { JsonLd } from "@/components/seo/json-ld";
import { buildAlternates } from "@/lib/seo/metadata";
import { crumbsToBreadcrumbLd } from "@/lib/seo/breadcrumb";
import type { Locale } from "@/i18n/routing";

/**
 * /estilos/[slug] — style detail listing (T3 AC-6, AC-14, AC-16). 404 on
 * unknown/inactive slug; header shows name + description; grid of the style's
 * active products.
 */

interface StylePageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

/**
 * Render on demand (T14 AC-A2). The page passes `searchParams` DOWN into
 * `PaginatedProductListing` inside `<Suspense>` and never reads it synchronously
 * at the top level, so Next 16 keeps the route `● (SSG)` and the deep
 * `await searchParams` throws `DYNAMIC_SERVER_USAGE` (HTTP 500) on a prod
 * build/start. Forcing dynamic demotes it to `ƒ (Dynamic)` — matching `/sillas`,
 * which awaits `searchParams` at its top level — so the deep read is legal and
 * the page returns 200. The read is one bounded, `catalog`-tagged/cached query,
 * so per-request cost is unchanged from the intended ISR posture.
 */
export const dynamic = "force-dynamic";

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
    alternates: buildAlternates(stylePath(style.slug), activeLocale as Locale),
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

  const crumbs: Crumb[] = [
    { label: t("breadcrumb.home"), href: "/" },
    { label: t("breadcrumb.styles"), href: STYLES_PATH },
    { label: style.name },
  ];

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <JsonLd data={crumbsToBreadcrumbLd(crumbs, locale as Locale)} />
      <Breadcrumbs
        ariaLabel={t("breadcrumb.ariaLabel")}
        moreLabel={t("pagination.morePages")}
        items={crumbs}
      />
      <header className="mb-6 mt-2 flex flex-col gap-2 md:mb-8">
        <h1 className="font-heading text-xl font-semibold tracking-[-0.04em] sm:text-2xl sm:font-bold">
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
