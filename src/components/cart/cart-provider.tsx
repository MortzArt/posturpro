"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { CART_STORAGE_KEY } from "@/lib/config";
import { readCart, writeCart } from "@/lib/cart/cart-storage";
import {
  addLine,
  cartLineKey,
  removeLine,
  setLineQuantity,
  subtotalCents,
  totalItemCount,
  type CartLine,
  type CartLineInput,
} from "@/lib/cart/cart-line";

/**
 * CartProvider (T6) — the single client-side cart store shared by the header
 * badge, the PDP add-to-cart button, and the `/carrito` page. State is a
 * `useReducer` over an in-memory `CartLine[]`; every mutation goes through a
 * FUNCTIONAL reducer action so rapid add/`+` clicks coalesce correctly and never
 * lose or double-apply an update (edge 9).
 *
 * Hydration mirrors `RecentlyViewed`: state starts EMPTY (so SSR and the first
 * client render agree — no hydration mismatch, edge 8), then a mount effect
 * reads localStorage into state and flips `hydrated`. A change effect persists
 * on every subsequent state change (skipping the hydration read itself). A
 * `storage` listener re-reads localStorage into state on cross-tab writes so a
 * second tab stays in sync, last-write-wins (edge 5).
 */

/** The reducer's cart actions (all pure, all return a new array). */
type CartAction =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "add"; input: CartLineInput }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "remove"; key: string };

function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "hydrate":
      return action.lines;
    case "add":
      return addLine(state, action.input);
    case "setQuantity":
      return setLineQuantity(state, action.key, action.quantity);
    case "remove":
      return removeLine(state, action.key);
  }
}

/** The public cart API exposed via {@link useCart}. */
export interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  /** `false` until the mount effect has read localStorage (edge 8). */
  hydrated: boolean;
  addItem: (input: CartLineInput) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  /** Build the identity key for a product+variant (AC-2). */
  keyFor: (productId: string, variantId: string | null) => string;
}

const CartContext = createContext<CartContextValue | null>(null);

interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const [lines, dispatch] = useReducer(cartReducer, []);
  const hydratedRef = useRef(false);
  // The last cart payload this tab has reconciled with localStorage — either
  // what it wrote or what it read from a cross-tab `storage` event. Used to skip
  // no-op writes so a cross-tab sync cannot ping-pong into an infinite
  // write→storage-event→re-read→write loop between two tabs (edge 5).
  const lastPersistedRef = useRef<string | null>(null);
  // Re-render gate for `hydrated`: a ref alone would not re-render consumers, so
  // we mirror it into a reducer-driven counter via a one-shot effect below.
  const [hydrated, markHydrated] = useReducer(() => true, false);

  // Hydrate from storage once on mount (SSR has no storage). This is a genuine
  // external-system read that can only happen client-side (mirrors
  // RecentlyViewed's documented effect).
  useEffect(() => {
    const initial = readCart();
    lastPersistedRef.current = JSON.stringify(initial);
    dispatch({ type: "hydrate", lines: initial });
    hydratedRef.current = true;
    markHydrated();
  }, []);

  // Persist on every change AFTER hydration. Skipping the pre-hydration state
  // (an empty array) prevents clobbering stored lines with `[]` before the read
  // effect runs on mount. Content-identical states are NOT re-written: a
  // cross-tab `storage` re-read produces a new array reference with the same
  // payload, and re-writing it would fire a `storage` event in the peer tab and
  // loop forever — so we compare the serialized payload and bail on a match.
  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    const serialized = JSON.stringify(lines);
    if (serialized === lastPersistedRef.current) {
      return;
    }
    lastPersistedRef.current = serialized;
    writeCart(lines);
  }, [lines]);

  // Cross-tab sync: another tab's write fires a `storage` event here (never in
  // the writing tab). Re-read into state; last write wins, no crash (edge 5).
  // The persist effect above bails on a content-identical re-read, so this never
  // starts a cross-tab write loop.
  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== null && event.key !== CART_STORAGE_KEY) {
        return;
      }
      const next = readCart();
      // Record the incoming payload as already-reconciled so the persist effect
      // does not echo it back to storage (loop guard).
      lastPersistedRef.current = JSON.stringify(next);
      dispatch({ type: "hydrate", lines: next });
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addItem = useCallback((input: CartLineInput) => {
    dispatch({ type: "add", input });
  }, []);
  const setQuantity = useCallback((key: string, quantity: number) => {
    dispatch({ type: "setQuantity", key, quantity });
  }, []);
  const removeItem = useCallback((key: string) => {
    dispatch({ type: "remove", key });
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount: totalItemCount(lines),
      subtotalCents: subtotalCents(lines),
      hydrated,
      addItem,
      setQuantity,
      removeItem,
      keyFor: cartLineKey,
    }),
    [lines, hydrated, addItem, setQuantity, removeItem],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * Read the shared cart. Throws if used outside a {@link CartProvider} — a
 * developer error surfaced loudly (the provider is mounted in the shell layout,
 * so every route is a descendant).
 */
export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (context === null) {
    throw new Error("useCart must be used within a <CartProvider>");
  }
  return context;
}
