"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { formatMXN } from "@/lib/money";

/**
 * StickyCheckoutBar (T7, mobile/tablet `< lg`) — the canonical submit below `lg`
 * (the in-card summary submit is `hidden lg:flex` so there is exactly one submit
 * per form). Translucent chrome per Apple §12; content scrolls under it; safe-area
 * padding respected. The Total crossfades via `.price-value` on change.
 */

interface StickyCheckoutBarProps {
  totalCents: number;
  submitDisabled: boolean;
  pending: boolean;
  submitLabel: string;
  submittingLabel: string;
}

export function StickyCheckoutBar({
  totalCents,
  submitDisabled,
  pending,
  submitLabel,
  submittingLabel,
}: StickyCheckoutBarProps) {
  return (
    <div
      className="sticky inset-x-0 bottom-0 z-30 mt-8 flex items-center justify-between gap-3 border-t border-border bg-background/85 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      data-testid="checkout-sticky-bar"
    >
      <span className="text-base font-semibold tabular-nums text-foreground">
        <span key={totalCents} className="price-value">
          {formatMXN(totalCents)}
        </span>
      </span>
      <Button
        type="submit"
        disabled={submitDisabled}
        data-testid="checkout-submit-sticky"
        className="cart-press h-11 gap-1.5 px-6 text-sm"
      >
        {pending ? submittingLabel : submitLabel}
        {pending ? null : (
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
        )}
      </Button>
    </div>
  );
}
