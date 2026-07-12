import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { categoryPath } from "@/lib/config";
import {
  getCategory,
  listCategories,
  listProductsByCategory,
} from "@/lib/catalog/queries";
import { Breadcrumbs, type Crumb } from "@/components/catalog/breadcrumbs";
import { ProductGridSkeleton } from "@/components/catalog/catalog-skeleton";
import { PaginatedProductListing } from "@/components/catalog/paginated-product-listing";
import type { CatalogCategory } from "@/lib/catalog/types";

/**
 * /categorias/[slug] — category detail listing (T3 AC-2, AC-7, AC-14, AC-16,
 * edge case 4). 404 on unknown/inactive slug; nested breadcrumb from the
 * ancestor chain; empty state when the category has zero active products.
 */

interface CategoryPageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

/** Flatten the category tree to every slug (roots + nested children). */
function flattenSlugs(nodes: CatalogCategory[]): string[] {
  return nodes.flatMap((node) => [
    node.slug,
    ...flattenSlugs(node.children ?? []),
  ]);
}

/** Prerender the known category slugs per locale at build time (AC-11). */
export async function generateStaticParams() {
  const tree = await listCategories();
  const slugs = flattenSlugs(tree);
  return routing.locales.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug })),
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
  const found = await getCategory(slug);
  if (!found) return {};
  const t = await getTranslations({ locale: activeLocale, namespace: "catalog" });
  return {
    title: `${found.category.name} — ${t("metadata.categoriesTitle")}`,
    description: found.category.description ?? undefined,
  };
}

/** Build the nested breadcrumb items for a category + its ancestors (AC-7). */
function buildCategoryCrumbs(
  category: CatalogCategory,
  ancestors: CatalogCategory[],
  labels: { home: string; categories: string },
): Crumb[] {
  const crumbs: Crumb[] = [
    { label: labels.home, href: "/" },
    { label: labels.categories, href: `/categorias` },
  ];
  for (const ancestor of ancestors) {
    crumbs.push({ label: ancestor.name, href: categoryPath(ancestor.slug) });
  }
  crumbs.push({ label: category.name });
  return crumbs;
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");

  const found = await getCategory(slug);
  if (!found) {
    notFound();
  }
  const { category, ancestors } = found;

  const crumbs = buildCategoryCrumbs(category, ancestors, {
    home: t("breadcrumb.home"),
    categories: t("breadcrumb.categories"),
  });

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={t("breadcrumb.categories")}
        moreLabel={t("pagination.morePages")}
        items={crumbs}
      />
      <header className="mb-6 mt-2 flex flex-col gap-2 md:mb-8">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {category.name}
        </h1>
        {category.description ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
            {category.description}
          </p>
        ) : null}
      </header>

      <Suspense fallback={<ProductGridSkeleton />}>
        <PaginatedProductListing
          searchParams={searchParams}
          basePath={categoryPath(category.slug)}
          emptyMessageKey="empty.category"
          read={(rawPage) =>
            listProductsByCategory(category.id, category.slug, { rawPage })
          }
        />
      </Suspense>
    </section>
  );
}
