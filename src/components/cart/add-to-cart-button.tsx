"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ADD_TO_CART_CONFIRM_MS } from "@/lib/config";
import { useCart } from "@/components/cart/cart-provider";
import type { CartLineInput } from "@/lib/cart/cart-line";
import { cn } from "@/lib/utils";

/**
 * AddToCartButton (T6 AC-1, AC-2, AC-18, edge 8, 9) — the PDP purchase-panel
 * island. Adds the currently-selected variant (or the variant-less product) to
 * the shared cart at quantity 1 via a FUNCTIONAL provider update (rapid clicks
 * coalesce, never exceed the cap — edge 9), then shows a transient "Agregado ✓"
 * confirmation for `ADD_TO_CART_CONFIRM_MS` before reverting.
 *
 * The panel keeps its "no client i18n" invariant, so the three labels arrive as
 * PROPS (resolved server-side). The button is a FIXED `h-11 w-full` box; only
 * the inner label crossfades between states (blur-masked, `.cart-add-label`) so
 * there is no layout shift on confirm. It is `disabled` when out of stock
 * ("Agotado") or before hydration (no SSR add / count flash — edge 8). Confirm
 * is interruptible: a re-click during the window re-adds and resets the timer.
 */

export interface AddToCartLabels {
  /** "Agregar al carrito" */
  addToCart: string;
  /** "Agregado" (the ✓ icon is appended visually) */
  added: string;
  /** "Agotado" */
  outOfStock: string;
  /** SR-only announcement on a successful add ("Se agregó al carrito"). */
  announceAdded: string;
}

interface AddToCartButtonProps {
  /** Snapshot fields threaded from ProductPurchasePanel selection state. */
  line: CartLineInput;
  /** True when the selected variant/product stock is 0 (AC-18). */
  outOfStock: boolean;
  labels: AddToCartLabels;
  className?: string;
}

export function AddToCartButton({
  line,
  outOfStock,
  labels,
  className,
}: AddToCartButtonProps) {
  const { addItem, hydrated } = useCart();
  const [confirming, setConfirming] = useState(false);
  // Increments on each successful add so the aria-live region re-announces even
  // when the same item is added repeatedly (identical text otherwise stays silent).
  const [addCount, setAddCount] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Clear any pending confirm timer on unmount (no setState after unmount).
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    if (outOfStock || !hydrated) {
      return;
    }
    addItem(line);
    setConfirming(true);
    setAddCount((count) => count + 1);
    // Interruptible: a re-click resets the revert timer so the confirmation
    // re-shows from the start rather than reverting mid-window.
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setConfirming(false);
      timerRef.current = null;
    }, ADD_TO_CART_CONFIRM_MS);
  }, [addItem, line, outOfStock, hydrated]);

  const disabled = outOfStock || !hydrated;

  return (
    <>
      <Button
        type="button"
        variant="default"
        data-testid="add-to-cart-button"
        data-state={confirming ? "confirming" : "idle"}
        onClick={handleClick}
        disabled={disabled}
        aria-disabled={disabled}
        className={cn(
          "cart-press relative h-11 w-full overflow-hidden text-sm",
          className,
        )}
      >
        {/* Two absolutely-stacked labels inside the fixed box; the inactive one
            is blurred+transparent so the box never resizes on confirm. */}
        <span
          className="cart-add-label inline-flex items-center justify-center gap-1.5"
          data-hidden={confirming}
          aria-hidden={confirming}
        >
          {outOfStock ? labels.outOfStock : labels.addToCart}
        </span>
        <span
          className="cart-add-label absolute inset-0 inline-flex items-center justify-center gap-1.5"
          data-hidden={!confirming}
          aria-hidden={!confirming}
        >
          <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2.5} aria-hidden />
          {labels.added}
        </span>
      </Button>
      {/* SR-only add announcement (no page-level region exists on the PDP). The
          `key` re-mounts the region on every add so repeat adds re-announce. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only" data-testid="add-to-cart-live">
        {addCount > 0 ? <span key={addCount}>{labels.announceAdded}</span> : null}
      </p>
    </>
  );
}
