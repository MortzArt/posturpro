/**
 * CartProvider integration tests (T6 AC-2, AC-3, AC-4, edge 5, 8, 9) — the
 * freshly-fixed CRITICAL cross-tab sync path (review C-1) plus hydration
 * ordering and rapid-click coalescing.
 *
 * These render a real provider in jsdom (which has `window.localStorage` and
 * `StorageEvent`) and drive it through `useCart()`. The focus is the parts the
 * pure helpers cannot cover:
 *   - hydration: state starts empty (SSR-safe), then the mount effect reads
 *     storage; the pre-hydration `[]` must NEVER clobber stored lines (edge 8).
 *   - persistence: a mutation writes through to localStorage (AC-3).
 *   - cross-tab: a `storage` event re-reads into state, last-write-wins, and the
 *     loop guard (`lastPersistedRef`) prevents a content-identical re-read from
 *     echoing back a write (the C-1 infinite-loop fix, edge 5).
 *   - rapid adds coalesce via functional updates and never exceed the cap (edge 9).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { CartProvider, useCart } from "./cart-provider";
import { readCart } from "@/lib/cart/cart-storage";
import { CART_STORAGE_KEY, MAX_CART_ITEM_QUANTITY } from "@/lib/config";
import { type CartLine, type CartLineInput } from "@/lib/cart/cart-line";

function makeInput(overrides: Partial<CartLineInput> = {}): CartLineInput {
  return {
    productId: "p-1",
    slug: "silla-ejemplo",
    name: "Silla Ejemplo",
    variantId: "v-negro",
    variantLabel: "Negro",
    unitPriceCents: 499_900,
    coverImageUrl: "https://example.test/cover.jpg",
    sku: "SKU-1",
    ...overrides,
  };
}

function makeStoredLine(overrides: Partial<CartLine> = {}): CartLine {
  return { ...makeInput(overrides as Partial<CartLineInput>), quantity: 1, ...overrides };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("CartProvider — hydration (AC-3, edge 8)", () => {
  it("hydrates existing stored lines into state on mount", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([makeStoredLine({ quantity: 4 })]),
    );
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.itemCount).toBe(4);
  });

  it("never clobbers stored lines with the pre-hydration empty array (edge 8)", async () => {
    const stored = [makeStoredLine({ quantity: 2 })];
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stored));
    renderHook(() => useCart(), { wrapper });
    // After a full render + effect cycle, storage still holds the original cart —
    // the persist effect must have skipped the empty pre-hydration state.
    await waitFor(() => {
      expect(readCart()).toHaveLength(1);
      expect(readCart()[0]?.quantity).toBe(2);
    });
  });

  it("exposes an empty cart with hydrated=true when storage is empty", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.lines).toEqual([]);
    expect(result.current.itemCount).toBe(0);
    expect(result.current.subtotalCents).toBe(0);
  });
});

describe("CartProvider — mutations persist (AC-3, AC-4)", () => {
  it("addItem updates state and writes through to localStorage", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.addItem(makeInput()));
    expect(result.current.itemCount).toBe(1);
    await waitFor(() => expect(readCart()).toHaveLength(1));
  });

  it("re-adding the same product+variant increments (dedupe, AC-2)", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.addItem(makeInput()));
    act(() => result.current.addItem(makeInput()));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.itemCount).toBe(2);
  });

  it("setQuantity + removeItem recompute count/subtotal and persist", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.addItem(makeInput({ unitPriceCents: 100_000 })));
    const key = result.current.keyFor("p-1", "v-negro");
    act(() => result.current.setQuantity(key, 3));
    expect(result.current.itemCount).toBe(3);
    expect(result.current.subtotalCents).toBe(300_000);

    act(() => result.current.removeItem(key));
    expect(result.current.lines).toEqual([]);
    await waitFor(() => expect(readCart()).toEqual([]));
  });
});

describe("CartProvider — rapid adds coalesce (edge 9)", () => {
  it("N synchronous addItem calls sum to N (functional updates, no lost writes)", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      for (let i = 0; i < 12; i += 1) {
        result.current.addItem(makeInput());
      }
    });
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.itemCount).toBe(12);
  });

  it("rapid adds never exceed the per-line cap", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      for (let i = 0; i < MAX_CART_ITEM_QUANTITY + 20; i += 1) {
        result.current.addItem(makeInput());
      }
    });
    expect(result.current.itemCount).toBe(MAX_CART_ITEM_QUANTITY);
  });
});

describe("CartProvider — cross-tab sync (edge 5, review C-1)", () => {
  /** Simulate another tab writing to localStorage then firing the storage event. */
  function simulatePeerWrite(lines: CartLine[]): void {
    const newValue = JSON.stringify(lines);
    window.localStorage.setItem(CART_STORAGE_KEY, newValue);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: CART_STORAGE_KEY, newValue }),
      );
    });
  }

  it("re-reads a peer tab's write into state (last write wins)", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    simulatePeerWrite([makeStoredLine({ quantity: 5 })]);
    await waitFor(() => expect(result.current.itemCount).toBe(5));
  });

  it("a peer removing the last item transitions this tab to empty (edge 10 cross-tab)", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([makeStoredLine({ quantity: 2 })]),
    );
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.itemCount).toBe(2));

    simulatePeerWrite([]);
    await waitFor(() => expect(result.current.lines).toEqual([]));
  });

  it("does NOT echo a content-identical cross-tab read back to storage (C-1 loop guard)", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");
    // Peer writes lines; our tab re-reads them via the storage event.
    simulatePeerWrite([makeStoredLine({ quantity: 3 })]);
    await waitFor(() => expect(result.current.itemCount).toBe(3));

    // The persist effect must recognise the re-read payload as already-reconciled
    // and NOT write it back (which would fire a storage event in the peer and
    // loop forever). Only the peer's own setItem (simulated) should have run;
    // our provider must not add a write of the identical payload.
    const providerEchoWrites = setItem.mock.calls.filter(
      ([key, value]) =>
        key === CART_STORAGE_KEY &&
        value === JSON.stringify([makeStoredLine({ quantity: 3 })]),
    );
    // The only such write is the one simulatePeerWrite performed itself.
    expect(providerEchoWrites.length).toBeLessThanOrEqual(1);
  });

  it("ignores a storage event for an unrelated key", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.addItem(makeInput()));
    expect(result.current.itemCount).toBe(1);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some-other-key",
          newValue: "irrelevant",
        }),
      );
    });
    // Our cart is untouched by an unrelated key's event.
    expect(result.current.itemCount).toBe(1);
  });

  it("a local mutation after a cross-tab sync still persists (guard does not stick)", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    simulatePeerWrite([makeStoredLine({ variantId: "v-a", quantity: 1 })]);
    await waitFor(() => expect(result.current.itemCount).toBe(1));

    // Now add locally — this is a genuinely new payload and MUST persist.
    act(() => result.current.addItem(makeInput({ variantId: "v-b" })));
    expect(result.current.itemCount).toBe(2);
    await waitFor(() => expect(readCart()).toHaveLength(2));
  });
});

describe("useCart — outside a provider", () => {
  it("throws a clear developer error", () => {
    // Silence the expected React error boundary console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ThrowsWithoutProvider />)).toThrow(
      /useCart must be used within a <CartProvider>/,
    );
    spy.mockRestore();
  });
});

function ThrowsWithoutProvider() {
  useCart();
  return null;
}
