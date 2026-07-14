"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart/cart-provider";

/**
 * OrderConfirmation (T7 AC-13) — a tiny client child that clears the cart ONCE
 * on mount after a successful order. `useCart()` exposes no `clear()`, so it
 * removes each line by its key (guarded to run once so a re-render never loops).
 * After this runs, the header cart badge shows 0. Renders nothing.
 */
export function OrderConfirmation() {
  const { lines, hydrated, removeItem, keyFor } = useCart();
  const cleared = useRef(false);

  useEffect(() => {
    if (!hydrated || cleared.current) {
      return;
    }
    cleared.current = true;
    for (const line of lines) {
      removeItem(keyFor(line.productId, line.variantId));
    }
  }, [hydrated, lines, removeItem, keyFor]);

  return null;
}
