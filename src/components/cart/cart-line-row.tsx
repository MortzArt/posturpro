"use client";

import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Image01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { StockBadge } from "@/components/catalog/stock-badge";
import { QuantityStepper } from "@/components/cart/quantity-stepper";
import { formatMXN } from "@/lib/money";
import { interpolate } from "@/lib/interpolate";
import { productPath } from "@/lib/config";
import { lineTotalCents, type CartLine } from "@/lib/cart/cart-line";
import { cn } from "@/lib/utils";

/**
 * CartLineRow (T6 AC-5, AC-6, AC-7, AC-16) — one cart line: cover thumbnail,
 * product name (links to the PDP), variant/color label, unit price, a quantity
 * stepper, a remove control, and a per-line total. All money goes through
 * `formatMXN`; numbers are `tabular-nums`. Out-of-stock (from the snapshot flag,
 * best-effort; T7 re-validates) shows a `StockBadge state="out"` and dims the
 * image, mirroring `ProductCard`.
 *
 * Layout: single column on mobile (thumb left, details right, controls below);
 * a wider inline layout at `sm+`. The line total crossfades via `.price-value`
 * (keyed on the total) on a quantity change. Remove is an optimistic call to the
 * parent — no confirm dialog (a guest cart line is trivially re-addable, Apple
 * §16 Agency).
 */

interface CartLineRowLabels {
  remove: string;
  increase: string;
  decrease: string;
  quantityLabel: string;
  /** "c/u" / "each" */
  unitEach: string;
  /** "Total" (sr-only pairing for the line total) */
  lineTotalLabel: string;
  /** Template "Color: {name}" */
  colorLabel: string;
  /** Template "Eliminar {name}" */
  removeItemLabel: string;
  /** "Agotado" */
  outOfStock: string;
  /** Accessible label for the image placeholder tile. */
  imagePlaceholder: string;
}

interface CartLineRowProps {
  line: CartLine;
  outOfStock?: boolean;
  onQuantityChange: (next: number) => void;
  onRemove: () => void;
  maxQuantity: number;
  labels: CartLineRowLabels;
  /** Per-row stagger delay in ms (set by the list, capped). */
  staggerDelayMs?: number;
}

export function CartLineRow({
  line,
  outOfStock = false,
  onQuantityChange,
  onRemove,
  maxQuantity,
  labels,
  staggerDelayMs = 0,
}: CartLineRowProps) {
  const total = lineTotalCents(line);

  return (
    <li
      className="stagger flex gap-3 border-b border-border py-4 last:border-b-0 sm:gap-4"
      style={{ transitionDelay: `${staggerDelayMs}ms` }}
      data-testid="cart-line-row"
      data-line-key={line.variantId ? `${line.productId}::${line.variantId}` : line.productId}
    >
      <Link
        href={productPath(line.slug)}
        className="card-lift group/thumb relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-24"
        data-testid="cart-line-image-link"
        tabIndex={-1}
        aria-hidden
      >
        {line.coverImageUrl ? (
          <Image
            src={line.coverImageUrl}
            alt=""
            fill
            sizes="96px"
            className={cn("card-image size-full object-cover", outOfStock && "opacity-60")}
          />
        ) : (
          <span
            className={cn(
              "flex size-full items-center justify-center text-muted-foreground",
              outOfStock && "opacity-60",
            )}
            role="img"
            aria-label={labels.imagePlaceholder}
          >
            <HugeiconsIcon icon={Image01Icon} size={28} strokeWidth={1.5} aria-hidden />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={productPath(line.slug)}
              className="line-clamp-2 rounded-sm text-sm font-medium tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="cart-line-name"
            >
              {line.name}
            </Link>
            {line.variantLabel ? (
              <p className="mt-0.5 text-xs text-muted-foreground" data-testid="cart-line-variant">
                {interpolate(labels.colorLabel, { name: line.variantLabel })}
              </p>
            ) : null}
            {outOfStock ? (
              <StockBadge state="out" label={labels.outOfStock} className="mt-1.5 self-start" />
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {formatMXN(line.unitPriceCents)} {labels.unitEach}
            </p>
          </div>

          <p className="shrink-0 text-right text-sm font-semibold text-foreground tabular-nums">
            <span className="sr-only">{labels.lineTotalLabel} </span>
            <span key={total} className="price-value" data-testid="cart-line-total">
              {formatMXN(total)}
            </span>
          </p>
        </div>

        <div className="mt-1 flex items-center justify-between gap-3">
          <QuantityStepper
            value={line.quantity}
            max={maxQuantity}
            onChange={onQuantityChange}
            labels={{
              increase: labels.increase,
              decrease: labels.decrease,
              quantityLabel: labels.quantityLabel,
            }}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            data-testid="cart-line-remove"
            aria-label={interpolate(labels.removeItemLabel, { name: line.name })}
            className="h-11 gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">{labels.remove}</span>
          </Button>
        </div>
      </div>
    </li>
  );
}
