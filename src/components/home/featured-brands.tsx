import { getTranslations } from "next-intl/server";
import { brandPath } from "@/lib/config";
import { IndexTile } from "@/components/catalog/index-tile";
import { BrandLogo } from "@/components/catalog/brand-logo";
import { HomeSectionHeader } from "@/components/home/section-header";
import type { CatalogBrand } from "@/lib/catalog/types";

/**
 * FeaturedBrands (T13 AC-7, AC-9) — up to M brand tiles via the shipped
 * `IndexTile` + `BrandLogo`, identical to the `marcas` index grid (a brand
 * without a logo shows the monogram fallback; without a description omits that
 * line — `IndexTile`/`BrandLogo` already handle both). Returns `null` when there
 * are zero brands, so the homepage section is OMITTED (not an empty grid).
 */

interface FeaturedBrandsProps {
  /** Already sliced to M by the page. */
  brands: CatalogBrand[];
  heading: string;
  viewAllLabel: string;
  viewAllHref: string;
}

/** Stagger step between tiles; capped so the grid settles ≤ ~200ms (reused). */
const STAGGER_STEP_MS = 40;
const STAGGER_MAX_STEPS = 5;

export async function FeaturedBrands({
  brands,
  heading,
  viewAllLabel,
  viewAllHref,
}: FeaturedBrandsProps) {
  if (brands.length === 0) {
    return null;
  }
  const t = await getTranslations("catalog");

  return (
    <div data-testid="featured-brands">
      <HomeSectionHeader
        heading={heading}
        linkLabel={viewAllLabel}
        linkHref={viewAllHref}
        testId="featured-brands-view-all"
      />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((brand, index) => (
          <IndexTile
            key={brand.id}
            href={brandPath(brand.slug)}
            name={brand.name}
            description={brand.description}
            testId="featured-brand-tile"
            staggerDelayMs={Math.min(index, STAGGER_MAX_STEPS) * STAGGER_STEP_MS}
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
    </div>
  );
}
