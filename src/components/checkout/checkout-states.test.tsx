/**
 * Render tests for the small checkout state components (T7 AC-2, UX-Requirements
 * loading/empty/sticky states): the empty-cart state, the pre-hydration skeleton,
 * and the mobile sticky submit bar. Presentational — plain-string label props,
 * no intl — so they render directly.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));

import { CheckoutEmptyState } from "./checkout-empty-state";
import { CheckoutSkeleton } from "./checkout-skeleton";
import { StickyCheckoutBar } from "./sticky-checkout-bar";

describe("CheckoutEmptyState (AC-2)", () => {
  afterEach(cleanup);

  it("renders the icon, copy, and a CTA pointing at the catalog", () => {
    render(
      <CheckoutEmptyState
        browseHref="/sillas"
        labels={{ title: "Tu carrito está vacío", subtitle: "Agrega productos", cta: "Ver sillas" }}
      />,
    );
    expect(screen.getByTestId("checkout-empty-state")).toHaveTextContent("Tu carrito está vacío");
    const cta = screen.getByTestId("checkout-empty-cta");
    expect(cta).toHaveAttribute("href", "/sillas");
    expect(cta).toHaveTextContent("Ver sillas");
  });
});

describe("CheckoutSkeleton (loading / pre-hydration)", () => {
  afterEach(cleanup);

  it("renders an aria-hidden skeleton with the page title (no $NaN, no form)", () => {
    render(<CheckoutSkeleton title="Finalizar compra" />);
    const skeleton = screen.getByTestId("checkout-skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden");
    expect(skeleton).toHaveTextContent("Finalizar compra");
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});

describe("StickyCheckoutBar (mobile submit)", () => {
  afterEach(cleanup);

  it("renders the total via formatMXN and an enabled submit when allowed", () => {
    render(
      <form>
        <StickyCheckoutBar
          totalCents={350_000}
          submitDisabled={false}
          pending={false}
          submitLabel="Realizar pedido"
          submittingLabel="Procesando…"
        />
      </form>,
    );
    expect(screen.getByTestId("checkout-sticky-bar")).toHaveTextContent("$3,500.00");
    const submit = screen.getByTestId("checkout-submit-sticky");
    expect(submit).toBeEnabled();
    expect(submit).toHaveTextContent("Realizar pedido");
  });

  it("shows the submitting label + disabled state while pending", () => {
    render(
      <form>
        <StickyCheckoutBar
          totalCents={350_000}
          submitDisabled
          pending
          submitLabel="Realizar pedido"
          submittingLabel="Procesando…"
        />
      </form>,
    );
    const submit = screen.getByTestId("checkout-submit-sticky");
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("Procesando…");
  });

  it("is a lg-hidden bar (one submit per breakpoint, M-2)", () => {
    render(
      <form>
        <StickyCheckoutBar totalCents={0} submitDisabled pending={false} submitLabel="X" submittingLabel="Y" />
      </form>,
    );
    expect(screen.getByTestId("checkout-sticky-bar").className).toContain("lg:hidden");
  });
});
