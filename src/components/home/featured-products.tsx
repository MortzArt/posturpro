import { ProductGrid } from "@/components/catalog/product-grid";
import { HomeSectionHeader } from "@/components/home/section-header";
import type { CatalogProductCard } from "@/lib/catalog/types";

/**
 * FeaturedProducts (T13 AC-7, AC-9) — up to N product cards via the shipped
 * `ProductGrid` (which owns the stagger + card-lift). Returns `null` when there
 * are zero products, so the homepage section is OMITTED from the DOM rather than
 * rendered as an empty grid (belt-and-suspenders with the page's own guard).
 */

interface FeaturedProductsProps {
  /** Already sliced to N by the page. */
  products: CatalogProductCard[];
  heading: string;
  viewAllLabel: string;
  viewAllHref: string;
}

export function FeaturedProducts({
  products,
  heading,
  viewAllLabel,
  viewAllHref,
}: FeaturedProductsProps) {
  if (products.length === 0) {
    return null;
  }
  return (
    <div data-testid="featured-products">
      <HomeSectionHeader
        heading={heading}
        linkLabel={viewAllLabel}
        linkHref={viewAllHref}
        testId="featured-products-view-all"
      />
      <ProductGrid products={products} />
    </div>
  );
}
