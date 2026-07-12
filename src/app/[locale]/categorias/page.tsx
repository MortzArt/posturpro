import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { CATALOG_PATH } from "@/lib/config";
import { listCategories } from "@/lib/catalog/queries";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { CategoryTree } from "@/components/catalog/category-tree";
import { EmptyState } from "@/components/catalog/empty-state";

/**
 * /categorias — category index with nesting (T3 AC-3). Static/ISR. The tree is
 * built by `listCategories()`; children render inside their parent's `<li>`.
 */

interface CategoriesIndexProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: CategoriesIndexProps): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: activeLocale, namespace: "catalog" });
  return { title: t("metadata.categoriesTitle") };
}

export default async function CategoriesIndexPage({
  params,
}: CategoriesIndexProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  const categories = await listCategories();

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={t("breadcrumb.categories")}
        moreLabel={t("pagination.morePages")}
        items={[
          { label: t("breadcrumb.home"), href: "/" },
          { label: t("breadcrumb.categories") },
        ]}
      />
      <header className="mb-6 mt-2 flex flex-col gap-2 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("categories.title")}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("categories.subtitle")}
        </p>
      </header>

      {categories.length > 0 ? (
        <CategoryTree categories={categories} />
      ) : (
        <EmptyState
          message={t("empty.category")}
          ctaLabel={t("empty.cta")}
          ctaHref={CATALOG_PATH}
        />
      )}
    </section>
  );
}
