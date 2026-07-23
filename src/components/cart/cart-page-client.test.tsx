/**
 * CartPageClient live stock-check tests (stale-cart badge). The cart renders
 * from the localStorage snapshot, so a line whose variant sold out AFTER it was
 * added would keep looking buyable — `useLiveStockCheck` re-checks the lines
 * via the `checkCartStock` server action (debounced) and badges the rows that
 * are no longer purchasable. We stub next-intl, the i18n navigation, and the
 * action (mirrors the checkout-flow-client harness) and assert:
 *   - only the server-flagged line shows the out-of-stock badge;
 *   - the action receives the minimal `{productId, variantId, quantity}` payload;
 *   - an `error` result keeps the cart un-badged (progressive enhancement);
 *   - a clean result renders no badge at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { CART_STORAGE_KEY } from "@/lib/config";
import type { CartLine } from "@/lib/cart/cart-line";

// next/image → plain img under jsdom.
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...(props as Record<string, unknown>)} />
  ),
}));

// next-intl: return the key so copy is deterministic.
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.raw = (key: string) => key;
    return t;
  },
}));

// i18n navigation: a plain <a> Link.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));

// The stock-check server action, controllable per test.
const checkCartStockMock = vi.fn();
vi.mock("@/app/[locale]/carrito/actions", () => ({
  checkCartStock: (...args: unknown[]) => checkCartStockMock(...args) as unknown,
}));

import { CartPageClient } from "./cart-page-client";
import { CartProvider } from "@/components/cart/cart-provider";

const PRODUCT = "11111111-1111-1111-1111-111111111111";
const VARIANT_A = "22222222-2222-2222-2222-222222222222";
const VARIANT_B = "33333333-3333-3333-3333-333333333333";

function storedLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: PRODUCT,
    slug: "silla-ejemplo",
    name: "Silla Ejemplo",
    variantId: VARIANT_A,
    variantLabel: "Rojo",
    unitPriceCents: 309_900,
    coverImageUrl: null,
    sku: null,
    quantity: 1,
    ...overrides,
  };
}

function seedCart(lines: CartLine[]): void {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
}

function renderCartPage() {
  return render(
    <CartProvider>
      <CartPageClient flatRateCents={50_000} freeThresholdCents={1_000_000} />
    </CartProvider>,
  );
}

/** The row element for a product+variant (CartLineRow's data-line-key). */
function row(productId: string, variantId: string): HTMLElement {
  const el = document.querySelector(`[data-line-key="${productId}::${variantId}"]`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`row ${productId}::${variantId} not rendered`);
  }
  return el;
}

beforeEach(() => {
  window.localStorage.clear();
  checkCartStockMock.mockReset();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("CartPageClient — live stock check", () => {
  it("badges only the line the server flags as no longer purchasable", async () => {
    seedCart([
      storedLine({ variantId: VARIANT_A, variantLabel: "Rojo" }),
      storedLine({ variantId: VARIANT_B, variantLabel: "Gris" }),
    ]);
    checkCartStockMock.mockResolvedValue({
      status: "ok",
      issues: [{ productId: PRODUCT, variantId: VARIANT_A }],
    });
    renderCartPage();

    // The badge appears after the debounce + round-trip; mocked t → key text.
    await waitFor(
      () => expect(row(PRODUCT, VARIANT_A).textContent).toContain("outOfStock"),
      { timeout: 3_000 },
    );
    expect(row(PRODUCT, VARIANT_B).textContent).not.toContain("outOfStock");
  });

  it("sends the minimal {productId, variantId, quantity} payload", async () => {
    seedCart([storedLine({ quantity: 3 })]);
    checkCartStockMock.mockResolvedValue({ status: "ok", issues: [] });
    renderCartPage();

    await waitFor(() => expect(checkCartStockMock).toHaveBeenCalled(), {
      timeout: 3_000,
    });
    expect(checkCartStockMock).toHaveBeenLastCalledWith([
      { productId: PRODUCT, variantId: VARIANT_A, quantity: 3 },
    ]);
  });

  it("keeps the cart un-badged when the check errors (progressive enhancement)", async () => {
    seedCart([storedLine()]);
    checkCartStockMock.mockResolvedValue({ status: "error" });
    renderCartPage();

    await waitFor(() => expect(checkCartStockMock).toHaveBeenCalled(), {
      timeout: 3_000,
    });
    expect(row(PRODUCT, VARIANT_A).textContent).not.toContain("outOfStock");
  });

  it("renders no badge when every line is purchasable", async () => {
    seedCart([storedLine()]);
    checkCartStockMock.mockResolvedValue({ status: "ok", issues: [] });
    renderCartPage();

    await waitFor(() => expect(checkCartStockMock).toHaveBeenCalled(), {
      timeout: 3_000,
    });
    expect(screen.queryByText("outOfStock")).toBeNull();
  });
});
