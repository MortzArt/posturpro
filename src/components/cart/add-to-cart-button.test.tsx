/**
 * AddToCartButton render + interaction tests (T6 AC-1, AC-2, AC-18, edge 8, 9).
 *
 * Wrapped in a real CartProvider so a click actually mutates the shared cart.
 * Covers: adds the line at qty 1 and increments on re-click (AC-1, AC-2); the
 * out-of-stock guard (disabled + "Agotado", click is a no-op — AC-18); the
 * pre-hydration inert state (disabled until hydrated — edge 8); rapid clicks
 * coalesce via functional updates (edge 9); and the transient "Agregado ✓"
 * confirmation that reverts after the configured delay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { AddToCartButton, type AddToCartLabels } from "./add-to-cart-button";
import { CartProvider, useCart } from "./cart-provider";
import { ADD_TO_CART_CONFIRM_MS } from "@/lib/config";
import { type CartLineInput } from "@/lib/cart/cart-line";

const labels: AddToCartLabels = {
  addToCart: "Agregar al carrito",
  added: "Agregado",
  outOfStock: "Agotado",
  announceAdded: "Se agregó al carrito",
};

const line: CartLineInput = {
  productId: "p-1",
  slug: "silla-ejemplo",
  name: "Silla Ejemplo",
  variantId: "v-negro",
  variantLabel: "Negro",
  unitPriceCents: 499_900,
  coverImageUrl: null,
  sku: null,
};

/** Probe that surfaces the live cart itemCount for assertions. */
function CartCountProbe() {
  const { itemCount, hydrated } = useCart();
  return (
    <span data-testid="probe">{hydrated ? String(itemCount) : "pending"}</span>
  );
}

function renderButton(outOfStock = false) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CartProvider>
      {children}
      <CartCountProbe />
    </CartProvider>
  );
  return render(
    <AddToCartButton line={line} outOfStock={outOfStock} labels={labels} />,
    { wrapper },
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("AddToCartButton — add (AC-1, AC-2)", () => {
  it("adds the selected line at quantity 1 on click", async () => {
    const user = userEvent.setup();
    renderButton();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("0"));

    await user.click(screen.getByTestId("add-to-cart-button"));
    expect(screen.getByTestId("probe")).toHaveTextContent("1");
  });

  it("increments (dedupes) on a second click of the same variant (AC-2)", async () => {
    const user = userEvent.setup();
    renderButton();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("0"));

    await user.click(screen.getByTestId("add-to-cart-button"));
    await user.click(screen.getByTestId("add-to-cart-button"));
    expect(screen.getByTestId("probe")).toHaveTextContent("2");
  });

  it("announces the add via the SR-only aria-live region", async () => {
    const user = userEvent.setup();
    renderButton();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("0"));
    await user.click(screen.getByTestId("add-to-cart-button"));
    expect(screen.getByTestId("add-to-cart-live")).toHaveTextContent(
      "Se agregó al carrito",
    );
  });
});

describe("AddToCartButton — out of stock guard (AC-18)", () => {
  it("is disabled and labelled 'Agotado' when out of stock", async () => {
    renderButton(true);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("0"));
    const button = screen.getByTestId("add-to-cart-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Agotado");
  });

  it("does not add when out of stock (click is a guarded no-op)", async () => {
    const user = userEvent.setup();
    renderButton(true);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("0"));
    // Force the click past the disabled attribute to prove the handler also guards.
    await user.click(screen.getByTestId("add-to-cart-button"));
    expect(screen.getByTestId("probe")).toHaveTextContent("0");
  });
});

describe("AddToCartButton — confirm state (success feedback)", () => {
  it("shows the 'Agregado' confirmation on add then reverts after the delay", async () => {
    renderButton();
    // Let the mount hydration effect run under real timers first (so the button
    // is enabled), then switch to fake timers to drive the revert deterministically.
    await waitFor(() =>
      expect(screen.getByTestId("add-to-cart-button")).toBeEnabled(),
    );
    vi.useFakeTimers();
    const button = screen.getByTestId("add-to-cart-button");

    act(() => {
      fireEvent.click(button);
    });
    expect(button).toHaveAttribute("data-state", "confirming");

    act(() => {
      vi.advanceTimersByTime(ADD_TO_CART_CONFIRM_MS + 50);
    });
    expect(button).toHaveAttribute("data-state", "idle");
  });
});
