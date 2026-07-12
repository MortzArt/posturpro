import { getTranslations } from "next-intl/server";
import { ProductCard } from "@/components/catalog/product-card";
import type { CatalogProductCard } from "@/lib/catalog/types";

/**
 * ProductGrid (T3) — responsive grid (2 → 3 → 4 cols) that resolves each card's
 * localized labels ONCE (one `getTranslations("catalog")` call, not per card)
 * and owns the capped stagger entrance. Cards stay pure presentational server
 * components. Renders only when `products.length > 0` (empty/loading are
 * page-level).
 *
 * `PRODUCTS_PER_PAGE = 12` divides evenly by 2/3/4, so the last row is never
 * ragged at any breakpoint (AC-17).
 */

interface ProductGridProps {
  products: CatalogProductCard[];
  /** Cards before this index get `next/image` priority (widest grid = 4). */
  priorityCount?: number;
}

/** Stagger step between cards; capped so a full grid finishes ≤ ~200ms. */
const STAGGER_STEP_MS = 40;
const STAGGER_MAX_STEPS = 5;

export async function ProductGrid({
  products,
  priorityCount = 4,
}: ProductGridProps) {
  const t = await getTranslations("catalog");

  const stockLabel = (product: CatalogProductCard): string => {
    switch (product.stockState) {
      case "in":
        return t("stock.inStock");
      case "low":
        return t("stock.lowStock", { count: product.lowStockN ?? 0 });
      case "out":
        return t("stock.outOfStock");
    }
  };

  const colorsLabel = (count: number): string | null =>
    count >= 2 ? t("card.colorsCount", { count }) : null;

  const placeholder = t("card.imagePlaceholder");

  return (
    <ul
      className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4"
      data-testid="product-grid"
    >
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            priority={index < priorityCount}
            staggerDelayMs={Math.min(index, STAGGER_MAX_STEPS) * STAGGER_STEP_MS}
            labels={{
              stock: stockLabel(product),
              colors: colorsLabel(product.colorCount),
              imagePlaceholder: placeholder,
            }}
          />
        </li>
      ))}
    </ul>
  );
}
