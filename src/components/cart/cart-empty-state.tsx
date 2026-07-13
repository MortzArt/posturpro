"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ShoppingCart01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CartEmptyState (T6 AC-10) — a centered friendly message + a primary CTA to the
 * catalog. Rendered ONLY after hydration confirms an empty cart (never flashed
 * during load — the page shows a skeleton until hydrated). No summary, progress,
 * or checkout. Enters with `.enter-fade` (opacity + slight rise, reduced-motion
 * gated). The icon is `aria-hidden`; the CTA is a labeled locale-aware `Link`.
 */

interface CartEmptyStateLabels {
  title: string;
  subtitle: string;
  cta: string;
}

interface CartEmptyStateProps {
  browseHref: string;
  labels: CartEmptyStateLabels;
}

export function CartEmptyState({ browseHref, labels }: CartEmptyStateProps) {
  return (
    <div
      className="enter-fade mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center"
      data-testid="cart-empty-state"
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
        data-testid="cart-empty-cta"
        className={cn(
          buttonVariants({ variant: "default" }),
          "cart-press h-11 w-full max-w-xs px-6 text-sm sm:w-auto",
        )}
      >
        {labels.cta}
      </Link>
    </div>
  );
}
