import type { StockState } from "@/lib/catalog/types";

/**
 * Typed schema.org JSON-LD builders (T14 AC-A12). Pure — no DB, no secrets. Each
 * builder returns a plain object the `<JsonLd>` server component serializes into
 * a `<script type="application/ld+json">`. Rich-results targets:
 *
 *  - `Product` (PDP): name, image, brand, offers{priceCurrency, price,
 *    availability}. Invalid offers (null/zero price) are OMITTED, and
 *    `availability` maps from the store's `StockState` — never malformed JSON.
 *  - `Organization` + `WebSite` (home): store identity + site URL.
 *  - `BreadcrumbList` (PDP + taxonomy): the crumb trail as ListItems.
 *
 * All monetary values are MXN majors as a plain decimal string (integer cents
 * `/100`, 2dp) per Google's requirement that `price` be a number-like string.
 */

/** JSON-LD is a tree of JSON-serializable values with a `@type` discriminator. */
export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdObject
  | JsonLdValue[];
export interface JsonLdObject {
  [key: string]: JsonLdValue;
}

/** The MXN ISO-4217 currency code — the store's single settlement currency. */
const CURRENCY_MXN = "MXN" as const;

/** schema.org availability enum URLs. */
const AVAILABILITY = {
  inStock: "https://schema.org/InStock",
  outOfStock: "https://schema.org/OutOfStock",
  limited: "https://schema.org/LimitedAvailability",
} as const;

/** Cents count treated as "no valid price" (offer omitted). */
const MIN_VALID_PRICE_CENTS = 1;

/** Convert integer MXN cents to a major-unit decimal string ("129900" → "1299.00"). */
export function centsToMajorString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Map the store's stock state to a schema.org availability URL. */
export function availabilityFromStockState(state: StockState): string {
  switch (state) {
    case "in":
      return AVAILABILITY.inStock;
    case "low":
      return AVAILABILITY.limited;
    case "out":
      return AVAILABILITY.outOfStock;
  }
}

/** Inputs for the PDP `Product` node. */
export interface ProductLdInput {
  name: string;
  description: string | null;
  brandName: string | null;
  priceCents: number;
  stockState: StockState;
  /** Absolute cover image URL, or `null` if the product has no image. */
  imageUrl: string | null;
  /** Absolute canonical URL of the PDP. */
  url: string;
}

/**
 * Build a `Product` JSON-LD node. A missing/zero price omits the entire `offers`
 * field (Google rejects a Product offer with no price) rather than emit `0`;
 * `availability` still reflects `stockState` when an offer is present.
 */
export function buildProductLd(input: ProductLdInput): JsonLdObject {
  const node: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    url: input.url,
  };
  if (input.description?.trim()) node.description = input.description.trim();
  if (input.imageUrl) node.image = input.imageUrl;
  if (input.brandName?.trim()) {
    node.brand = { "@type": "Brand", name: input.brandName.trim() };
  }
  if (input.priceCents >= MIN_VALID_PRICE_CENTS) {
    node.offers = {
      "@type": "Offer",
      priceCurrency: CURRENCY_MXN,
      price: centsToMajorString(input.priceCents),
      availability: availabilityFromStockState(input.stockState),
      url: input.url,
    };
  }
  return node;
}

/** Inputs for the site-wide `Organization` node. */
export interface OrganizationLdInput {
  name: string;
  /** Absolute site origin URL. */
  url: string;
  /** Absolute logo URL, if one is configured. */
  logoUrl?: string | null;
}

/** Build an `Organization` JSON-LD node for the homepage. */
export function buildOrganizationLd(input: OrganizationLdInput): JsonLdObject {
  const node: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.name,
    url: input.url,
  };
  if (input.logoUrl?.trim()) node.logo = input.logoUrl.trim();
  return node;
}

/** Build a `WebSite` JSON-LD node for the homepage. */
export function buildWebSiteLd(input: {
  name: string;
  url: string;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: input.name,
    url: input.url,
  };
}

/** One breadcrumb: a label and, for all but the last crumb, an absolute URL. */
export interface BreadcrumbLdItem {
  name: string;
  /** Absolute URL for the crumb; the final (current) crumb may omit it. */
  url?: string;
}

/**
 * Build a `BreadcrumbList` JSON-LD node from an ordered crumb list. `position`
 * is 1-based; a crumb without a URL (the current page) still gets a `name`.
 */
export function buildBreadcrumbLd(items: BreadcrumbLdItem[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
      const listItem: JsonLdObject = {
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
      };
      if (item.url) listItem.item = item.url;
      return listItem;
    }),
  };
}
