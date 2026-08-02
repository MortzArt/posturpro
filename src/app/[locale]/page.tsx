import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import {
  CATALOG_PATH,
  BRANDS_PATH,
  HOME_FEATURED_PRODUCTS,
  HOME_FEATURED_BRANDS,
  HERO_IMAGE,
} from "@/lib/config";
import { listProducts, listBrands } from "@/lib/catalog/queries";
import type { CatalogBrand, CatalogProductCard } from "@/lib/catalog/types";
import { Hero } from "@/components/home/hero";
import { FeaturedProducts } from "@/components/home/featured-products";
import { FeaturedBrands } from "@/components/home/featured-brands";

/**
 * Homepage (T13 AC-7, AC-8, AC-9) — the launch-grade front door. Replaces the T2
 * placeholder with a hero (ALWAYS rendered) + Featured chairs (bounded slice of
 * `listProducts`) + Featured brands (`listBrands` sliced to M). Each featured
 * section is OMITTED when its list is empty (edge 8); featured selection is a
 * bounded slice of existing active-content queries — no "featured" DB flag.
 *
 * Featured reads degrade to empty on failure so the hero always survives (edge
 * 9); a hard content miss must never blank the front door.
 */

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: activeLocale, namespace: "metadata" });
  return { title: t("title"), description: t("description") };
}

/** Read the featured chairs, degrading to `[]` on any read failure (edge 9). */
async function readFeaturedProducts(): Promise<CatalogProductCard[]> {
  try {
    const page = await listProducts({ pageSize: HOME_FEATURED_PRODUCTS });
    return page.items;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(`[home] featured products read failed: ${message}. Omitting section.`);
    return [];
  }
}

/** Read the featured brands (sliced to M), degrading to `[]` on failure (edge 9). */
async function readFeaturedBrands(): Promise<CatalogBrand[]> {
  try {
    const brands = await listBrands();
    return brands.slice(0, HOME_FEATURED_BRANDS);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(`[home] featured brands read failed: ${message}. Omitting section.`);
    return [];
  }
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, products, brands] = await Promise.all([
    getTranslations("home"),
    readFeaturedProducts(),
    readFeaturedBrands(),
  ]);

  return (
    <>
      <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <Hero
          headline={t("hero.title")}
          subcopy={t("hero.subtitle")}
          ctaLabel={t("hero.ctaCatalog")}
          ctaHref={CATALOG_PATH}
          secondaryLabel={t("hero.ctaBrands")}
          secondaryHref={BRANDS_PATH}
          imageUrl={HERO_IMAGE}
          imageAlt={t("hero.imageAlt")}
        />
      </section>

      {products.length > 0 ? (
        <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
          <FeaturedProducts
            products={products}
            heading={t("featured.productsHeading")}
            viewAllLabel={t("featured.viewAllProducts")}
            viewAllHref={CATALOG_PATH}
          />
        </section>
      ) : null}

      {brands.length > 0 ? (
        <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
          <FeaturedBrands
            brands={brands}
            heading={t("featured.brandsHeading")}
            viewAllLabel={t("featured.viewAllBrands")}
            viewAllHref={BRANDS_PATH}
          />
        </section>
      ) : null}
    </>
  );
}
