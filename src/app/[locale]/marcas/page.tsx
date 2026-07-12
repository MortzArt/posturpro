import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { CATALOG_PATH, brandPath } from "@/lib/config";
import { listBrands } from "@/lib/catalog/queries";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { IndexTile } from "@/components/catalog/index-tile";
import { BrandLogo } from "@/components/catalog/brand-logo";
import { EmptyState } from "@/components/catalog/empty-state";

/**
 * /marcas — brand index (T3 AC-5). Static/ISR. Each tile shows the brand logo
 * (monogram fallback), name, and description (omitted when null).
 */

interface BrandsIndexProps {
  params: Promise<{ locale: string }>;
}

const STAGGER_STEP_MS = 40;
const STAGGER_MAX_STEPS = 5;

export async function generateMetadata({
  params,
}: BrandsIndexProps): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: activeLocale, namespace: "catalog" });
  return { title: t("metadata.brandsTitle") };
}

export default async function BrandsIndexPage({ params }: BrandsIndexProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  const brands = await listBrands();

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={t("breadcrumb.brands")}
        moreLabel={t("pagination.morePages")}
        items={[
          { label: t("breadcrumb.home"), href: "/" },
          { label: t("breadcrumb.brands") },
        ]}
      />
      <header className="mb-6 mt-2 flex flex-col gap-2 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("brands.title")}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("brands.subtitle")}
        </p>
      </header>

      {brands.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand, index) => (
            <IndexTile
              key={brand.id}
              href={brandPath(brand.slug)}
              name={brand.name}
              description={brand.description}
              testId="brand-tile"
              staggerDelayMs={
                Math.min(index, STAGGER_MAX_STEPS) * STAGGER_STEP_MS
              }
              leading={
                <BrandLogo
                  name={brand.name}
                  logoUrl={brand.logoUrl}
                  logoAlt={t("brand.logoAlt", { brand: brand.name })}
                  size="sm"
                />
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          message={t("empty.brand")}
          ctaLabel={t("empty.cta")}
          ctaHref={CATALOG_PATH}
        />
      )}
    </section>
  );
}
