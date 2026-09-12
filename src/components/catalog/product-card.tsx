import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { formatMXN } from "@/lib/money";
import { productPath } from "@/lib/config";
import { cn } from "@/lib/utils";
import { StockBadge } from "@/components/catalog/stock-badge";
import { GradeBadge } from "@/components/catalog/grade-badge";
import { ColorDots } from "@/components/catalog/color-dots";
import type { CatalogProductCard } from "@/lib/catalog/types";

/**
 * ProductCard (T3 — the single most-reused component). One product in a grid:
 * cover image, name, brand, price (+ struck compare-at when a real discount),
 * stock badge, and the colour swatch dots. Cards in a row are EQUAL HEIGHT
 * (`h-full` flex column) and the title box always reserves two lines so price
 * rows align across the row (owner request 2026-09-12). The WHOLE card is one
 * locale-aware `Link` to the PDP (`/producto/[slug]`, owned by T4 — may 404
 * until then; we do NOT stub it).
 *
 * Pure presentational server component: labels arrive pre-resolved from the
 * grid so the card does no i18n (SRP). Motion is CSS-only (`.card-lift` +
 * `.stagger`) and reduced-motion/hover gated in `globals.css`.
 */

interface ProductCardProps {
  product: CatalogProductCard;
  /** Pre-resolved localized labels. */
  labels: {
    stock: string;
    /** Group label for the colour dots ("Colores"); dots render only if colours exist. */
    colors: string;
    /** Accessible label for the image placeholder tile (no cover). */
    imagePlaceholder: string;
    /** Pre-resolved "Grado {grade}" label; null when the product has no grade. */
    grade: string | null;
  };
  /** First-row cards → `next/image` priority (above the fold). */
  priority?: boolean;
  /** Per-card stagger delay in ms (set by the grid, capped). */
  staggerDelayMs?: number;
}

const IMAGE_SIZES =
  "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" as const;

export function ProductCard({
  product,
  labels,
  priority = false,
  staggerDelayMs = 0,
}: ProductCardProps) {
  const isOutOfStock = product.stockState === "out";
  const showCompareAt = product.compareAtPriceCents !== null;

  return (
    <article
      className="stagger h-full"
      style={{ transitionDelay: `${staggerDelayMs}ms` }}
      data-testid="product-card"
    >
      <Link
        href={productPath(product.slug)}
        data-testid="product-card-link"
        className="card-lift factorial-card group/card flex h-full flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative m-2 aspect-[4/5] overflow-hidden rounded-md bg-muted">
          {product.coverImageUrl ? (
            <Image
              src={product.coverImageUrl}
              alt={product.coverAlt}
              fill
              sizes={IMAGE_SIZES}
              priority={priority}
              className={cn(
                "card-image size-full object-cover",
                isOutOfStock && "opacity-60",
              )}
            />
          ) : (
            <span
              role="img"
              aria-label={`${product.name} — ${labels.imagePlaceholder}`}
              className={cn(
                "flex size-full items-center justify-center text-muted-foreground",
                isOutOfStock && "opacity-60",
              )}
            >
              <HugeiconsIcon
                icon={Image01Icon}
                size={40}
                strokeWidth={1.5}
                aria-hidden
              />
            </span>
          )}
          {product.conditionGrade && labels.grade ? (
            <GradeBadge
              grade={product.conditionGrade}
              label={labels.grade}
              className="absolute left-2 top-2"
            />
          ) : null}
          <StockBadge
            state={product.stockState}
            label={labels.stock}
            className="absolute right-2 top-2"
          />
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3 md:p-4">
          {product.brandName ? (
            <p className="text-xs text-muted-foreground">{product.brandName}</p>
          ) : null}
          <h2 className="line-clamp-2 min-h-[2.5rem] font-heading text-sm font-medium leading-5 tracking-[-0.02em] text-foreground">
            {product.name}
          </h2>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatMXN(product.priceCents)}
            </span>
            {showCompareAt && product.compareAtPriceCents !== null ? (
              <span className="text-xs tabular-nums text-muted-foreground line-through">
                {formatMXN(product.compareAtPriceCents)}
              </span>
            ) : null}
          </p>
          <div className="mt-auto pt-1">
            <ColorDots colors={product.colors} label={labels.colors} />
          </div>
        </div>
      </Link>
    </article>
  );
}
