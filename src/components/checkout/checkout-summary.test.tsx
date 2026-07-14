/**
 * CheckoutSummary render tests (T7 AC-1, AC-6, AC-13). The component takes labels
 * as PROPS (no intl), and is the display boundary where `formatMXN` runs — the
 * last line of defence for the "no $NaN" invariant. Covers: line rendering, the
 * three shipping states, the discount row appearing only when > 0, per-line issue
 * treatment, and the submit disabled state.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CheckoutSummary, type CheckoutSummaryLabels, type CheckoutSummaryLine } from "./checkout-summary";
import type { ShippingResult } from "@/lib/cart/shipping";

// next/image → plain img under jsdom.
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...(props as Record<string, unknown>)} />
  ),
}));

const labels: CheckoutSummaryLabels = {
  heading: "Resumen del pedido",
  subtotal: "Subtotal",
  discount: "Descuento",
  shipping: "Envío",
  shippingFree: "Gratis",
  shippingUnavailable: "Se calcula al pagar",
  total: "Total",
  itemQuantity: "×{count}",
  noPaymentYet: "Sin pago todavía.",
  lineOutOfStock: "Agotado",
  lineUnavailable: "No disponible",
  linePriceChanged: "Precio actualizado: {amount}",
  imagePlaceholder: "Imagen no disponible",
  submit: "Realizar pedido",
  submitting: "Procesando…",
  discountLabels: {
    label: "Código de descuento",
    placeholder: "Código",
    appliedLabel: "Código {code} aplicado",
    savings: "Ahorras {amount}",
    remove: "Quitar",
    invalid: {
      unknown: "Código no válido.",
      expired: "Expiró.",
      inactive: "No disponible.",
      "below-min": "Compra mínima no alcanzada.",
      exhausted: "Agotado.",
    },
    degraded: "No pudimos verificar.",
  },
};

const line: CheckoutSummaryLine = {
  key: "p1",
  name: "Silla Ergo",
  variantLabel: "Negro",
  quantity: 2,
  unitPriceCents: 150_000,
  lineTotalCents: 300_000,
  coverImageUrl: null,
};

function renderSummary(overrides: Partial<React.ComponentProps<typeof CheckoutSummary>> = {}) {
  const shipping: ShippingResult = { kind: "free" };
  return render(
    <form>
      <CheckoutSummary
        lines={[line]}
        subtotalCents={300_000}
        shipping={shipping}
        discountCents={0}
        totalCents={300_000}
        submitDisabled={false}
        pending={false}
        discount={{ kind: "none" }}
        discountCodeValue=""
        onDiscountCodeChange={() => {}}
        labels={labels}
        showSubmit
        {...overrides}
      />
    </form>,
  );
}

describe("CheckoutSummary", () => {
  afterEach(cleanup);

  it("renders each line with its total and never $NaN", () => {
    renderSummary();
    expect(screen.getByText("Silla Ergo")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-subtotal").textContent).toContain("$3,000.00");
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("hides the discount row when discountCents is 0", () => {
    renderSummary({ discountCents: 0 });
    expect(screen.queryByTestId("checkout-discount")).toBeNull();
  });

  it("shows the discount row when discountCents > 0", () => {
    renderSummary({ discountCents: 30_000, totalCents: 270_000 });
    expect(screen.getByTestId("checkout-discount").textContent).toContain("$300.00");
  });

  it("renders free shipping", () => {
    renderSummary({ shipping: { kind: "free" } });
    expect(screen.getAllByText("Gratis").length).toBeGreaterThan(0);
  });

  it("renders flat shipping", () => {
    renderSummary({ shipping: { kind: "flat", cents: 50_000 }, totalCents: 350_000 });
    expect(screen.getByTestId("checkout-shipping").textContent).toContain("$500.00");
  });

  it("renders unavailable shipping without $NaN", () => {
    renderSummary({ shipping: { kind: "unavailable" } });
    expect(screen.getByTestId("checkout-shipping").textContent).toContain("Se calcula al pagar");
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("highlights an out-of-stock line with its note", () => {
    renderSummary({ lineIssues: { p1: "out-of-stock" } });
    expect(screen.getByText("Agotado")).toBeInTheDocument();
  });

  it("shows the live price on a price-changed line", () => {
    renderSummary({ lineIssues: { p1: "price-changed" }, liveUnitPrices: { p1: 160_000 } });
    expect(screen.getByText("Precio actualizado: $1,600.00")).toBeInTheDocument();
  });

  it("disables the submit when submitDisabled", () => {
    renderSummary({ submitDisabled: true });
    expect(screen.getByTestId("checkout-submit")).toBeDisabled();
  });
});
