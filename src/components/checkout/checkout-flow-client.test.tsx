/**
 * CheckoutFlowClient state-machine tests (T7 AC-1, AC-2, AC-3; edge 3, 5;
 * Stage-6 regression locks M-2, M-3). The flow owns the skeleton / empty / body
 * states and the single-submit-per-breakpoint invariant. We stub next-intl, the
 * i18n navigation, and the server action so we can drive `useActionState` and the
 * cart deterministically:
 *   - pre-hydration → skeleton (never a $NaN or empty flash).
 *   - hydrated + empty cart → empty state with a CATALOG_PATH CTA (AC-2, edge 3).
 *   - hydrated + non-empty cart → the form + summary + sticky bar (AC-1).
 *   - shipping-unavailable settings → submit blocked, never $NaN (AC-3, edge 5).
 *   - M-2: exactly one in-card submit AND one sticky submit exist in the DOM
 *     (their `lg:` visibility classes make exactly one live per breakpoint).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// next-intl: return the key (or a readable stand-in) so copy is deterministic.
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.raw = (key: string) => key;
    return t;
  },
}));

// i18n navigation: a plain <a> Link + a router whose replace we can observe.
const replaceMock = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: replaceMock }),
}));

// The server actions are stubbed so the client module imports cleanly under
// jsdom (no "use server" boundary). `checkDiscountCode` is controllable per
// test (the Apply-button pre-check).
const checkDiscountCodeMock = vi.fn(async () => ({ kind: "none" }) as const);
vi.mock("@/app/[locale]/checkout/actions", () => ({
  placeOrder: vi.fn(async () => ({ status: "idle", submissionId: 1 })),
  checkDiscountCode: (...args: unknown[]) =>
    (checkDiscountCodeMock as (...a: unknown[]) => unknown)(...args),
}));

import { CheckoutFlowClient, GlobalBanner } from "./checkout-flow-client";
import { CartProvider } from "@/components/cart/cart-provider";

const PRODUCT = "11111111-1111-1111-1111-111111111111";
const VARIANT = "22222222-2222-2222-2222-222222222222";

function storedLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: PRODUCT,
    slug: "silla-ergo",
    name: "Silla Ergo",
    variantId: VARIANT,
    variantLabel: "Negro",
    unitPriceCents: 150_000,
    coverImageUrl: null,
    sku: "PP-0001",
    quantity: 2,
    ...overrides,
  };
}

function seedCart(lines: CartLine[]): void {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
}

function renderFlow(props: { flatRateCents: number | null; freeThresholdCents: number | null }) {
  return render(
    <CartProvider>
      <CheckoutFlowClient {...props} />
    </CartProvider>,
  );
}

const SETTINGS = { flatRateCents: 50_000, freeThresholdCents: 1_000_000 };

beforeEach(() => {
  window.localStorage.clear();
  replaceMock.mockClear();
});
afterEach(cleanup);

describe("CheckoutFlowClient — empty cart (AC-2, edge 3)", () => {
  it("shows the empty state with a catalog CTA when the cart hydrates empty", async () => {
    renderFlow(SETTINGS);
    await waitFor(() => expect(screen.getByTestId("checkout-empty-state")).toBeInTheDocument());
    const cta = screen.getByTestId("checkout-empty-cta");
    expect(cta).toHaveAttribute("href", "/sillas");
    // No form / submit when empty — a zero-line order can never be placed.
    expect(screen.queryByTestId("checkout-form")).toBeNull();
    expect(screen.queryByTestId("checkout-submit")).toBeNull();
  });
});

describe("CheckoutFlowClient — discount pre-check (Apply button)", () => {
  beforeEach(() => {
    seedCart([storedLine()]);
    checkDiscountCodeMock.mockReset();
  });

  it("applies a valid code before submit: pill, discount row, adjusted total", async () => {
    checkDiscountCodeMock.mockResolvedValue({
      kind: "applied",
      code: "AHORRA10",
      discountCents: 30_000,
    } as never);
    renderFlow(SETTINGS);
    await waitFor(() => expect(screen.getByTestId("checkout-form")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("checkout-discount-input"), {
      target: { value: "ahorra10" },
    });
    fireEvent.click(screen.getByTestId("checkout-discount-apply"));

    await waitFor(() =>
      expect(screen.getByTestId("checkout-discount-applied")).toBeInTheDocument(),
    );
    // Pre-check receives the typed code + the live subtotal (2 × 150_000).
    expect(checkDiscountCodeMock).toHaveBeenCalledWith("ahorra10", 300_000);
    // The summary previews the discount row and the adjusted total.
    expect(screen.getByTestId("checkout-discount").textContent).toContain("$300.00");
    expect(screen.getByTestId("checkout-total").textContent).toContain("$3,200.00");
  });

  it("shows the invalid note for a rejected code; editing the code clears it", async () => {
    checkDiscountCodeMock.mockResolvedValue({ kind: "invalid", reason: "unknown" } as never);
    renderFlow(SETTINGS);
    await waitFor(() => expect(screen.getByTestId("checkout-form")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("checkout-discount-input"), {
      target: { value: "NOPE" },
    });
    fireEvent.click(screen.getByTestId("checkout-discount-apply"));
    await waitFor(() =>
      expect(screen.getByTestId("checkout-discount-note")).toBeInTheDocument(),
    );

    // A stale verdict must not linger on a different code string.
    fireEvent.change(screen.getByTestId("checkout-discount-input"), {
      target: { value: "NOPE2" },
    });
    expect(screen.queryByTestId("checkout-discount-note")).toBeNull();
  });
});

describe("CheckoutFlowClient — populated cart (AC-1, AC-3)", () => {
  beforeEach(() => seedCart([storedLine()]));

  it("renders the form, fields, summary, and sticky bar once hydrated", async () => {
    renderFlow(SETTINGS);
    await waitFor(() => expect(screen.getByTestId("checkout-form")).toBeInTheDocument());
    expect(screen.getByTestId("checkout-email-input")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-summary")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-sticky-bar")).toBeInTheDocument();
    // Empty state is gone.
    expect(screen.queryByTestId("checkout-empty-state")).toBeNull();
  });

  it("computes the summary via computeShipping/totalCents (flat rate, no $NaN)", async () => {
    renderFlow(SETTINGS); // subtotal 300_000 < 1_000_000 threshold → flat 50_000
    await waitFor(() => expect(screen.getByTestId("checkout-summary")).toBeInTheDocument());
    expect(screen.getByTestId("checkout-subtotal").textContent).toContain("$3,000.00");
    expect(screen.getByTestId("checkout-shipping").textContent).toContain("$500.00");
    expect(screen.getByTestId("checkout-total").textContent).toContain("$3,500.00");
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("renders free shipping at/above the threshold", async () => {
    seedCart([storedLine({ quantity: 8 })]); // 1_200_000 >= 1_000_000
    renderFlow(SETTINGS);
    await waitFor(() => expect(screen.getByTestId("checkout-summary")).toBeInTheDocument());
    // total equals subtotal (no shipping charge).
    expect(screen.getByTestId("checkout-total").textContent).toContain("$12,000.00");
  });

  it("M-2: has exactly one in-card submit and one sticky submit (one live per breakpoint)", async () => {
    renderFlow(SETTINGS);
    await waitFor(() => expect(screen.getByTestId("checkout-form")).toBeInTheDocument());
    // In-card submit is `hidden lg:flex`; sticky submit is `lg:hidden`. Both are
    // present in the DOM (jsdom has no viewport), but exactly one of each testid.
    expect(screen.getAllByTestId("checkout-submit")).toHaveLength(1);
    expect(screen.getAllByTestId("checkout-submit-sticky")).toHaveLength(1);
    // The in-card submit carries the lg-only visibility class (regression lock).
    expect(screen.getByTestId("checkout-submit").className).toContain("lg:flex");
    expect(screen.getByTestId("checkout-submit").className).toContain("hidden");
    // The sticky bar container is lg:hidden.
    expect(screen.getByTestId("checkout-sticky-bar").className).toContain("lg:hidden");
  });

  it("exposes a polite aria-live region for announcements (M-3 host)", async () => {
    renderFlow(SETTINGS);
    await waitFor(() => expect(screen.getByTestId("checkout-live-region")).toBeInTheDocument());
    expect(screen.getByTestId("checkout-live-region")).toHaveAttribute("aria-live", "polite");
  });
});

describe("GlobalBanner — recovery action (UX-Requirements: retry / review your cart)", () => {
  it("renders a retry submit button for a transient error", () => {
    render(
      <form>
        <GlobalBanner
          message="No pudimos realizar tu pedido."
          recovery={{ kind: "retry", label: "Reintentar" }}
          pending={false}
          testId="checkout-banner"
        />
      </form>,
    );
    const action = screen.getByTestId("checkout-banner-action");
    expect(action).toHaveTextContent("Reintentar");
    // A transient failure retries by resubmitting the same form.
    expect(action).toHaveAttribute("type", "submit");
    expect(action).not.toBeDisabled();
    expect(screen.getByTestId("checkout-banner")).toHaveAttribute("role", "alert");
  });

  it("disables the retry action while a submit is pending", () => {
    render(
      <form>
        <GlobalBanner
          message="No pudimos realizar tu pedido."
          recovery={{ kind: "retry", label: "Reintentar" }}
          pending
          testId="checkout-banner"
        />
      </form>,
    );
    expect(screen.getByTestId("checkout-banner-action")).toBeDisabled();
  });

  it("renders a 'back to cart' link (not a submit) when the user must change the order", () => {
    render(
      <GlobalBanner
        message="Un artículo se agotó."
        recovery={{ kind: "review", label: "Volver al carrito", href: "/carrito" }}
        pending={false}
        testId="checkout-banner"
      />,
    );
    const action = screen.getByTestId("checkout-banner-action");
    expect(action).toHaveTextContent("Volver al carrito");
    // Resubmitting the same order would just fail again → send them to the cart.
    expect(action).toHaveAttribute("href", "/carrito");
    expect(action.tagName).toBe("A");
  });
});

describe("CheckoutFlowClient — shipping unavailable (AC-3, edge 5)", () => {
  beforeEach(() => seedCart([storedLine()]));

  it("blocks submit and never renders $NaN when settings are missing", async () => {
    renderFlow({ flatRateCents: null, freeThresholdCents: null });
    await waitFor(() => expect(screen.getByTestId("checkout-summary")).toBeInTheDocument());
    // Both submit controls are disabled while shipping is unavailable.
    expect(screen.getByTestId("checkout-submit")).toBeDisabled();
    expect(screen.getByTestId("checkout-submit-sticky")).toBeDisabled();
    // Shipping shows the unavailable copy, not a broken number.
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
