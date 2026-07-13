"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { formatMXN } from "@/lib/money";
import type { ShippingResult } from "@/lib/cart/shipping";
import { cn } from "@/lib/utils";

/**
 * OrderSummary (T6 AC-8, AC-12, AC-15) — subtotal, shipping, total, and the
 * checkout CTA. All money goes through `formatMXN`; numbers are `tabular-nums`.
 *
 * Shipping degrades gracefully (edge 6): `flat` shows the amount, `free` shows
 * "Gratis", `unavailable` (store settings null) shows a neutral "Se calcula al
 * pagar" label with NO amount and the total equals the subtotal — never `$NaN`.
 * The subtotal/total crossfade via `.price-value` on a quantity/remove change.
 *
 * The checkout CTA is a plain locale-aware `Link` styled as a button (NOT a form
 * or submit) to `CHECKOUT_PATH`; it may 404 until T7 ships — T6 has no checkout
 * logic (AC-15). 44px tall (`h-11`) and full-width.
 */

interface OrderSummaryLabels {
  heading: string;
  subtotal: string;
  shipping: string;
  shippingFree: string;
  shippingUnavailable: string;
  total: string;
  checkout: string;
}

interface OrderSummaryProps {
  subtotalCents: number;
  shipping: ShippingResult;
  totalCents: number;
  checkoutHref: string;
  labels: OrderSummaryLabels;
}

export function OrderSummary({
  subtotalCents,
  shipping,
  totalCents,
  checkoutHref,
  labels,
}: OrderSummaryProps) {
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-5"
      data-testid="order-summary"
      aria-label={labels.heading}
    >
      <h2 className="text-sm font-medium text-foreground">{labels.heading}</h2>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{labels.subtotal}</dt>
          <dd className="tabular-nums text-foreground">
            <span key={subtotalCents} className="price-value" data-testid="summary-subtotal">
              {formatMXN(subtotalCents)}
            </span>
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{labels.shipping}</dt>
          <dd className="tabular-nums text-foreground" data-testid="summary-shipping">
            <ShippingValue shipping={shipping} labels={labels} />
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold text-foreground">{labels.total}</span>
        <span className="text-base font-semibold tabular-nums text-foreground">
          <span key={totalCents} className="price-value" data-testid="summary-total">
            {formatMXN(totalCents)}
          </span>
        </span>
      </div>

      <Link
        href={checkoutHref}
        data-testid="checkout-cta"
        className={cn(
          buttonVariants({ variant: "default" }),
          "cart-press h-11 w-full gap-1.5 text-sm",
        )}
      >
        {labels.checkout}
        <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
      </Link>
    </section>
  );
}

function ShippingValue({
  shipping,
  labels,
}: {
  shipping: ShippingResult;
  labels: OrderSummaryLabels;
}) {
  switch (shipping.kind) {
    case "free":
      return <span className="font-medium text-emerald-600 dark:text-emerald-500">{labels.shippingFree}</span>;
    case "flat":
      return <span>{formatMXN(shipping.cents)}</span>;
    case "unavailable":
      return <span className="text-muted-foreground">{labels.shippingUnavailable}</span>;
  }
}
