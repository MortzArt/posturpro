/**
 * OrderSummary + FreeShippingProgress render tests (T6 AC-8, AC-9, AC-12, AC-15,
 * edge 6, 7).
 *
 * These components take labels as PROPS (no intl needed) and are the display
 * boundary where `formatMXN` runs — so they are the last line of defence for the
 * "no `$NaN`" invariant (AC-12). Assertions cover the three shipping states
 * (flat / free / unavailable), the checkout CTA presence + target, and the
 * progress bar's hide-when-null (edge 6), achieved (edge 7), and partial states.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderSummary } from "./order-summary";
import { FreeShippingProgress } from "./free-shipping-progress";
import { CHECKOUT_PATH } from "@/lib/config";
import { type ShippingResult } from "@/lib/cart/shipping";

// The locale-aware Link pulls in next-intl's createNavigation → next/navigation,
// which is not resolvable under jsdom. Stub it with a plain anchor: these tests
// assert copy, amounts, and the href target, not locale-prefix behaviour (that
// is covered by the i18n-toggle e2e).
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const summaryLabels = {
  heading: "Resumen del pedido",
  subtotal: "Subtotal",
  shipping: "Envío",
  shippingFree: "Gratis",
  shippingUnavailable: "Se calcula al pagar",
  total: "Total",
  checkout: "Proceder al pago",
};

function renderSummary(shipping: ShippingResult, subtotal: number, total: number) {
  return render(
    <OrderSummary
      subtotalCents={subtotal}
      shipping={shipping}
      totalCents={total}
      checkoutHref={CHECKOUT_PATH}
      labels={summaryLabels}
    />,
  );
}

describe("OrderSummary — shipping states (AC-8, AC-12, edge 6)", () => {
  it("shows the flat rate amount and a total including shipping", () => {
    renderSummary({ kind: "flat", cents: 50_000 }, 500_000, 550_000);
    expect(screen.getByTestId("summary-subtotal")).toHaveTextContent("5,000.00");
    expect(screen.getByTestId("summary-shipping")).toHaveTextContent("500.00");
    expect(screen.getByTestId("summary-total")).toHaveTextContent("5,500.00");
  });

  it("shows 'Gratis' when shipping is free and total equals subtotal", () => {
    renderSummary({ kind: "free" }, 1_000_000, 1_000_000);
    expect(screen.getByTestId("summary-shipping")).toHaveTextContent("Gratis");
    expect(screen.getByTestId("summary-total")).toHaveTextContent("10,000.00");
  });

  it("shows a neutral label (no amount, no $NaN) when settings unavailable (edge 6)", () => {
    renderSummary({ kind: "unavailable" }, 500_000, 500_000);
    expect(screen.getByTestId("summary-shipping")).toHaveTextContent(
      "Se calcula al pagar",
    );
    expect(screen.getByTestId("summary-shipping")).not.toHaveTextContent("NaN");
    // Total equals the subtotal when shipping is unavailable.
    expect(screen.getByTestId("summary-total")).toHaveTextContent("5,000.00");
  });

  it("never renders '$NaN' in any monetary cell", () => {
    renderSummary({ kind: "flat", cents: 50_000 }, 0, 50_000);
    for (const id of ["summary-subtotal", "summary-shipping", "summary-total"]) {
      expect(screen.getByTestId(id)).not.toHaveTextContent("NaN");
    }
  });
});

describe("OrderSummary — checkout CTA (AC-15)", () => {
  it("renders a checkout link to CHECKOUT_PATH", () => {
    renderSummary({ kind: "flat", cents: 50_000 }, 500_000, 550_000);
    const cta = screen.getByTestId("checkout-cta");
    expect(cta).toHaveTextContent("Proceder al pago");
    expect(cta.getAttribute("href")).toContain(CHECKOUT_PATH);
  });
});

describe("FreeShippingProgress (AC-9, edge 6, 7)", () => {
  const labels = {
    remaining: "Te faltan {amount} para envío gratis",
    achieved: "¡Tienes envío gratis!",
  };

  it("renders nothing when progress is null (settings unavailable, edge 6)", () => {
    const { container } = render(
      <FreeShippingProgress progress={null} labels={labels} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the remaining amount and a partial bar below the threshold", () => {
    render(
      <FreeShippingProgress
        progress={{ remainingCents: 500_000, achieved: false, pct: 0.5 }}
        labels={labels}
      />,
    );
    const el = screen.getByTestId("free-shipping-progress");
    expect(el).toHaveAttribute("data-achieved", "false");
    // The formatted remaining amount is interpolated into the template.
    expect(el).toHaveTextContent("Te faltan $5,000.00 para envío gratis");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("shows the achieved copy and a full bar at/above the threshold (edge 7)", () => {
    render(
      <FreeShippingProgress
        progress={{ remainingCents: 0, achieved: true, pct: 1 }}
        labels={labels}
      />,
    );
    const el = screen.getByTestId("free-shipping-progress");
    expect(el).toHaveAttribute("data-achieved", "true");
    expect(el).toHaveTextContent("¡Tienes envío gratis!");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("never renders '$NaN' in the remaining copy", () => {
    render(
      <FreeShippingProgress
        progress={{ remainingCents: 0, achieved: false, pct: 0 }}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("free-shipping-progress")).not.toHaveTextContent("NaN");
  });
});
