"use client";

import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShoppingCart01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { CART_PATH } from "@/lib/config";
import { useCart } from "@/components/cart/cart-provider";
import { cn } from "@/lib/utils";

/**
 * CartCountBadge (T6 AC-4, AC-16) — the header cart island: a locale-aware link
 * to `/carrito` showing a live total-item count. Anti-layout-shift contract: the
 * 44×44 icon box is a fixed flex sibling in the header; the count pill is an
 * ABSOLUTELY-POSITIONED overlay on it (never a flex sibling), so the header
 * never reflows when the count fades in after hydration or changes (edge 8).
 *
 * Pre-hydration it renders the icon only with a plain "Carrito" label (never a
 * false count). Once hydrated the pill scales/fades in (`.cart-badge-pill`,
 * reduced-motion gated) and the label announces the count via `aria-label`.
 * `> 99` shows `99+` (per-line qty is capped at 99 but the summed total can
 * exceed it). Icon + pill are `aria-hidden`; the link's `aria-label` is the sole
 * announcement.
 */

/** Above this total the pill shows `99+` instead of the raw number. */
const PILL_DISPLAY_MAX = 99;

interface CartCountBadgeProps {
  className?: string;
}

export function CartCountBadge({ className }: CartCountBadgeProps) {
  const t = useTranslations("cart");
  const { itemCount, hydrated } = useCart();

  const showPill = hydrated && itemCount > 0;
  const pillText = itemCount > PILL_DISPLAY_MAX ? "99+" : String(itemCount);
  // `badgeLabel` uses ICU plural syntax → resolve via next-intl `t()` (which
  // handles plurals), never `interpolate` (simple {token} only).
  const label = hydrated ? t("badgeLabel", { count: itemCount }) : t("headerLink");

  return (
    <Link
      href={CART_PATH}
      data-testid="cart-count-badge"
      aria-label={label}
      className={cn(
        "nav-hover relative inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground outline-none",
        "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px",
        className,
      )}
    >
      <HugeiconsIcon
        icon={ShoppingCart01Icon}
        size={22}
        strokeWidth={2}
        aria-hidden
      />
      {showPill ? (
        <span
          key={itemCount}
          data-testid="cart-count-pill"
          aria-hidden
          className={cn(
            "cart-badge-pill absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center",
            "rounded-full bg-primary px-1 text-[0.625rem] font-medium tabular-nums text-primary-foreground",
            "ring-2 ring-background",
          )}
        >
          {pillText}
        </span>
      ) : null}
    </Link>
  );
}
