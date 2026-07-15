/**
 * The single source of truth for T11 catalog cache invalidation (research R:
 * "one shared helper importing the exported tag constants, never string
 * literals"). Every admin catalog write (product, image, variant, taxonomy,
 * inventory, CSV, Q&A) busts the broad `catalog` tag PLUS the specific slug
 * tags it touched, through this module — so a tag rename can never silently
 * break invalidation.
 *
 * `server-only`: `updateTag` is valid only inside a server action / route
 * handler. The tag STRINGS are imported from the storefront read layer
 * (`CATALOG_CACHE_TAG`, `productCacheTag`) so both sides share one definition.
 */
import "server-only";
import { updateTag } from "next/cache";
import { CATALOG_CACHE_TAG } from "@/lib/catalog/queries";
import { productCacheTag } from "@/lib/catalog/product-detail";

/** Build the storefront brand-facet tag (mirrors the inline `brand:${slug}` in queries.ts). */
export function brandCacheTag(slug: string): string {
  return `brand:${slug}`;
}

/** Build the storefront style-facet tag (mirrors `style:${slug}`). */
export function styleCacheTag(slug: string): string {
  return `style:${slug}`;
}

/** Build the storefront category-facet tag (mirrors `category:${slug}`). */
export function categoryCacheTag(slug: string): string {
  return `category:${slug}`;
}

/** The set of slug tags an individual write may have touched. */
export interface TouchedCatalogTags {
  /** Product slug(s) whose PDP cache must be busted (edit, image, variant, Q&A). */
  productSlugs?: readonly string[];
  brandSlugs?: readonly string[];
  styleSlugs?: readonly string[];
  categorySlugs?: readonly string[];
}

/**
 * Bust the broad `catalog` tag (all listings/facets/search/index reads) plus
 * every touched slug tag, de-duplicated. Always busts `catalog`; a bare call
 * (no touched tags) is the correct choice for a broad change (e.g. CSV import).
 */
export function bustCatalogTags(touched: TouchedCatalogTags = {}): void {
  const tags = new Set<string>([CATALOG_CACHE_TAG]);
  for (const slug of touched.productSlugs ?? []) tags.add(productCacheTag(slug));
  for (const slug of touched.brandSlugs ?? []) tags.add(brandCacheTag(slug));
  for (const slug of touched.styleSlugs ?? []) tags.add(styleCacheTag(slug));
  for (const slug of touched.categorySlugs ?? []) tags.add(categoryCacheTag(slug));
  for (const tag of tags) {
    updateTag(tag);
  }
}
