import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo/site-url";
import {
  CATALOG_PATH,
  CONTACT_SLUG,
  brandPath,
  categoryPath,
  productPath,
  staticPagePath,
  stylePath,
} from "@/lib/config";
import {
  listBrands,
  listCategories,
  listStyles,
} from "@/lib/catalog/queries";
import { listActiveProductSlugs } from "@/lib/catalog/product-detail";
import { listPublishedStaticPageSlugs } from "@/lib/content/static-pages";
import type { CatalogCategory } from "@/lib/catalog/types";
import type { LocaleAgnosticHref } from "@/lib/seo/metadata";

/**
 * Dynamic root sitemap (T14 AC-A9). App Router honors ONE `sitemap` per app, so
 * this single file enumerates BOTH locales itself for every indexable surface:
 * home, `/sillas`, `/empresas`, `/contacto`, every active product / brand /
 * category / style, and every published static page. Each entry carries absolute
 * `<loc>` URLs from `metadataBase` plus per-URL `alternates.languages` hreflang
 * (es-MX unprefixed default, en under `/en`, `x-default` → the es-MX URL).
 *
 * FACETED URLs ARE EXCLUDED (edge 6): only the clean `/sillas` (+ its `?page=N`
 * pagination, which crawlers discover via rel-next links) is indexable; the
 * `?marca=…` variants are `noindex,follow` and never appear here.
 *
 * BUILD DETERMINISM (AC-A14): every catalog read is wrapped so a DB outage at
 * build/request time degrades to a REDUCED sitemap (static routes only) instead
 * of throwing a 500 / breaking the Vercel build.
 */

/** BCP-47 hreflang tag for the search-engine default variant. */
const X_DEFAULT = "x-default" as const;

/** Locale-agnostic hrefs that always exist regardless of catalog content. */
const STATIC_HREFS: LocaleAgnosticHref[] = [
  "/",
  CATALOG_PATH,
  "/empresas",
  staticPagePath(CONTACT_SLUG),
];

/** Flatten the category tree to every slug (roots + nested children). */
function flattenCategorySlugs(nodes: CatalogCategory[]): string[] {
  return nodes.flatMap((node) => [
    node.slug,
    ...flattenCategorySlugs(node.children ?? []),
  ]);
}

/** Build the per-URL hreflang alternates map for a locale-agnostic href. */
function buildLanguages(href: LocaleAgnosticHref): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = absoluteUrl(getPathname({ href, locale }));
  }
  languages[X_DEFAULT] = absoluteUrl(
    getPathname({ href, locale: routing.defaultLocale }),
  );
  return languages;
}

/**
 * One sitemap entry per supported locale for a locale-agnostic href, each with
 * the full hreflang alternates map. `<loc>` is the locale-correct absolute URL.
 */
function entriesForHref(href: LocaleAgnosticHref): MetadataRoute.Sitemap {
  const languages = buildLanguages(href);
  return routing.locales.map((locale: Locale) => ({
    url: absoluteUrl(getPathname({ href, locale })),
    alternates: { languages },
  }));
}

/** Read all dynamic hrefs from the catalog, degrading to `[]` per source. */
async function readDynamicHrefs(): Promise<LocaleAgnosticHref[]> {
  const [products, brands, styles, categories, staticSlugs] = await Promise.all([
    safeRead(listActiveProductSlugs, "product slugs"),
    safeRead(listBrands, "brands"),
    safeRead(listStyles, "styles"),
    safeRead(listCategories, "categories"),
    safeRead(listPublishedStaticPageSlugs, "static pages"),
  ]);

  return [
    ...products.map((slug) => productPath(slug)),
    ...brands.map((brand) => brandPath(brand.slug)),
    ...styles.map((style) => stylePath(style.slug)),
    ...flattenCategorySlugs(categories).map((slug) => categoryPath(slug)),
    ...staticSlugs.map((slug) => staticPagePath(slug)),
  ];
}

/** Run one catalog read, logging + degrading to `[]` on failure (AC-A14). */
async function safeRead<T>(read: () => Promise<T[]>, label: string): Promise<T[]> {
  try {
    return await read();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(
      `[sitemap] Failed to read ${label}: ${message}. ` +
        "Omitting those URLs from the sitemap.",
    );
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dynamicHrefs = await readDynamicHrefs();
  const allHrefs = [...STATIC_HREFS, ...dynamicHrefs];
  return allHrefs.flatMap((href) => entriesForHref(href));
}
