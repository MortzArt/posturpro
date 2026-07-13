import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getPathname } from "@/i18n/navigation";
import { CATALOG_PATH, SEARCH_PARAM_KEYS, SORT_KEYS } from "@/lib/config";
import {
  hasNoFilters,
  parseCatalogFilters,
  serializeFilters,
  type RawSearchParams,
} from "@/lib/catalog/search-params";
import { loadFacetOptions } from "@/lib/catalog/facets";
import { buildActiveFilterChips } from "@/lib/catalog/active-filter-chips";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { ProductGridSkeleton } from "@/components/catalog/catalog-skeleton";
import { CatalogShell } from "@/components/catalog/catalog-shell";
import { SearchResults } from "@/components/catalog/search-results";
import type { CatalogFilters, SortKey } from "@/lib/catalog/search.types";

/**
 * /sillas — search / filters / sorting host (T5).
 *
 * RENDERING MODE (AC-10): the page reads `searchParams`, so ANY request with
 * filter/sort/search params renders DYNAMICALLY. The UNFILTERED `/sillas` (no
 * params) reads through cached (`catalog`-tagged) facet + listing reads, so the
 * default catalog stays fast. The filtered grid read is isolated in a
 * `<Suspense>` so the shell/toolbar/chips render immediately and only the grid
 * region shows the 12-card skeleton while the RPC runs.
 *
 * SEO (AC-11): a filtered/searched/paged request is `noindex, follow` with its
 * canonical pointing at the clean `/sillas` (or the page-N canonical for pure
 * pagination). The unfiltered `/sillas` + its `?page=N` pages stay indexable
 * exactly as T3 shipped.
 */

interface CatalogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Resolve the active locale, falling back to the default. */
async function resolveLocale(params: Promise<{ locale: string }>): Promise<string> {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export async function generateMetadata({
  params,
  searchParams,
}: CatalogPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const raw = await searchParams;
  const t = await getTranslations({ locale, namespace: "catalog" });

  // Faceted/searched pages: noindex,follow + canonical to clean /sillas. Pure
  // pagination keeps its page-N canonical + stays indexable (AC-11).
  const hasFacetParams = hasAnyFacetParam(raw);
  const pageParam = firstParam(raw[SEARCH_PARAM_KEYS.page]);
  const canonical =
    !hasFacetParams && pageParam && pageParam !== "1"
      ? `${CATALOG_PATH}?page=${pageParam}`
      : CATALOG_PATH;

  return {
    title: t("metadata.catalogTitle"),
    alternates: { canonical },
    robots: hasFacetParams ? { index: false, follow: true } : undefined,
  };
}

export default async function CatalogListPage({
  params,
  searchParams,
}: CatalogPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const t = await getTranslations("catalog");

  const { options, known, labelFor } = await loadFacetOptions();
  const filters = parseCatalogFilters(raw, known);
  const rawPage = raw[SEARCH_PARAM_KEYS.page];

  const chips = buildActiveFilterChips(filters, {
    categoryLabel: (value) => labelFor.category.get(value) ?? value,
    brandLabel: (value) => labelFor.brand.get(value) ?? value,
    styleLabel: (value) => labelFor.style.get(value) ?? value,
    colorLabel: (value) => labelFor.color.get(value) ?? value,
    materialLabel: (value) => labelFor.material.get(value) ?? value,
    chip: {
      query: (value) => t("filters.chipQuery", { value }),
      category: (value) => t("filters.chipCategory", { value }),
      brand: (value) => t("filters.chipBrand", { value }),
      style: (value) => t("filters.chipStyle", { value }),
      color: (value) => t("filters.chipColor", { value }),
      material: (value) => t("filters.chipMaterial", { value }),
      price: (min, max) => t("filters.chipPrice", { min, max }),
      outOfStock: t("filters.chipOutOfStock"),
    },
    removeLabel: (label) => t("filters.removeChip", { label }),
    priceFrom: (min) => t("filters.chipPriceFrom", { min }),
    priceTo: (max) => t("filters.chipPriceTo", { max }),
  });

  const activeFilterCount = countActiveFilters(filters);
  const active = !hasNoFilters(filters);
  const suspenseKey = `${serializeFilters(filters)}::${firstParam(rawPage) ?? "1"}`;

  // Locale-aware form target so a NATIVE (JS-off) GET submit stays on the
  // current locale (`/en/sillas` under `/en`), not the unprefixed default (M-3).
  const catalogAction = getPathname({ href: CATALOG_PATH, locale });

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={t("breadcrumb.ariaLabel")}
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

      <CatalogShell
        filters={filters}
        facets={options}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={active}
        searchPreservedParams={searchPreservedParams(filters)}
        chips={chips}
        clearAllLabel={t("filters.clearAll")}
        toolbarLabels={buildToolbarLabels(t)}
        catalogAction={catalogAction}
      >
        <Suspense key={suspenseKey} fallback={<ProductGridSkeleton />}>
          <SearchResults filters={filters} rawPage={rawPage} />
        </Suspense>
      </CatalogShell>
    </section>
  );
}

/** First value of a possibly-repeated raw param. */
function firstParam(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Any facet/search/sort param present (→ noindex + dynamic). Excludes `page`. */
function hasAnyFacetParam(raw: RawSearchParams): boolean {
  const keys = SEARCH_PARAM_KEYS;
  return [
    keys.q,
    keys.categoria,
    keys.marca,
    keys.estilo,
    keys.color,
    keys.material,
    keys.precioMin,
    keys.precioMax,
    keys.disponibilidad,
    keys.orden,
  ].some((key) => {
    const value = raw[key];
    return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value);
  });
}

/** Count active user filters (for the "Filtros (N)" badge). In-stock default excluded. */
function countActiveFilters(filters: CatalogFilters): number {
  let count = 0;
  if (filters.query !== null) count += 1;
  count += filters.categoryIds.length;
  count += filters.brandIds.length;
  count += filters.styleIds.length;
  count += filters.colors.length;
  count += filters.materials.length;
  if (filters.priceMin !== null || filters.priceMax !== null) count += 1;
  if (!filters.inStockOnly) count += 1;
  return count;
}

/** The serialized filters (minus page) as hidden inputs for the toolbar search. */
function searchPreservedParams(filters: CatalogFilters): Record<string, string> {
  const withoutQuery = serializeFilters({ ...filters, query: null });
  const params = Object.fromEntries(new URLSearchParams(withoutQuery));
  return params;
}

/** Build the SortKey→label map from translations. */
function sortLabels(
  t: Awaited<ReturnType<typeof getTranslations>>,
): Record<SortKey, string> {
  const byKey: Partial<Record<SortKey, string>> = {};
  const keyToMessage: Record<SortKey, string> = {
    "mas-vendidas": "sort.masVendidas",
    "precio-asc": "sort.precioAsc",
    "precio-desc": "sort.precioDesc",
    novedades: "sort.novedades",
    "nombre-asc": "sort.nombreAsc",
    "nombre-desc": "sort.nombreDesc",
  };
  for (const key of SORT_KEYS) byKey[key] = t(keyToMessage[key]);
  return byKey as Record<SortKey, string>;
}

/** Assemble the full toolbar/filter-panel label bundle from translations. */
function buildToolbarLabels(
  t: Awaited<ReturnType<typeof getTranslations>>,
): Parameters<typeof CatalogShell>[0]["toolbarLabels"] {
  const options = sortLabels(t);
  return {
    searchPlaceholder: t("search.placeholder"),
    searchAriaLabel: t("search.label"),
    searchClear: t("search.clear"),
    searchSubmit: t("search.submit"),
    searchOpen: t("search.open"),
    sortAriaLabel: t("sort.label"),
    sortPrefix: t("sort.prefix"),
    sortOptions: options,
    filterSheet: {
      trigger: t("filters.trigger"),
      triggerCount: t("filters.triggerCount", { count: 0 }),
      title: t("filters.title"),
      close: t("filters.close"),
      apply: t("filters.apply", { count: 0 }),
    },
    filterPanel: {
      title: t("filters.title"),
      availability: t("filters.availability"),
      includeOutOfStock: t("filters.includeOutOfStock"),
      category: t("filters.category"),
      brand: t("filters.brand"),
      style: t("filters.style"),
      color: t("filters.color"),
      colorGroup: t("filters.colorGroup"),
      material: t("filters.material"),
      price: t("filters.price"),
      priceMin: t("filters.priceMin"),
      priceMax: t("filters.priceMax"),
      priceIgnored: t("filters.priceIgnored"),
      showMore: t("filters.showMore"),
      showLess: t("filters.showLess"),
      clear: t("filters.clear"),
      apply: t("filters.applyButton"),
      sortLabel: t("sort.label"),
      sortOptions: options,
    },
  };
}
