"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ShoppingCart01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CheckoutEmptyState (T7 AC-2) — cart empty (or became empty) → block ordering,
 * offer a catalog CTA. Mirrors `CartEmptyState` (icon + title + subtitle + CTA,
 * `.enter-fade`, `cart-press`) with checkout copy. No form / summary / submit.
 */

interface CheckoutEmptyStateLabels {
  title: string;
  subtitle: string;
  cta: string;
}

interface CheckoutEmptyStateProps {
  browseHref: string;
  labels: CheckoutEmptyStateLabels;
}

export function CheckoutEmptyState({ browseHref, labels }: CheckoutEmptyStateProps) {
  return (
    <div
      className="enter-fade mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center"
      data-testid="checkout-empty-state"
    >
      <span className="text-muted-foreground" aria-hidden>
        <HugeiconsIcon icon={ShoppingCart01Icon} size={40} strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium text-foreground">{labels.title}</p>
        <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>
      <Link
        href={browseHref}
        data-testid="checkout-empty-cta"
        className={cn(buttonVariants({ variant: "default" }), "cart-press h-11 w-full max-w-xs px-6 text-sm sm:w-auto")}
      >
        {labels.cta}
      </Link>
    </div>
  );
}
