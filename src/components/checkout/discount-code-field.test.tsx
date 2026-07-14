/**
 * DiscountCodeField render tests (T7 AC-6, AC-7). The field NEVER blocks submit —
 * every bad-code state is display-only inline feedback and the input stays a live
 * `discountCode` input carried into the single submit. Covers: applied pill +
 * savings, every invalid reason message, degraded (couldn't verify), the remove
 * control, and the aria-invalid signalling on an error tone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DiscountCodeField, type DiscountFieldLabels } from "./discount-code-field";
import type { DiscountResult } from "@/app/[locale]/checkout/checkout-form-state";

const labels: DiscountFieldLabels = {
  label: "Código de descuento",
  placeholder: "Código",
  appliedLabel: "Código {code} aplicado",
  savings: "Ahorras {amount}",
  remove: "Quitar",
  invalid: {
    unknown: "Código no válido.",
    expired: "El código expiró.",
    inactive: "El código no está disponible.",
    "below-min": "No alcanzas la compra mínima.",
    exhausted: "El código se agotó.",
  },
  degraded: "No pudimos verificar el código.",
};

function renderField(
  overrides: Partial<React.ComponentProps<typeof DiscountCodeField>> = {},
) {
  const onChange = vi.fn();
  render(
    <DiscountCodeField
      value=""
      onChange={onChange}
      result={{ kind: "none" }}
      disabled={false}
      labels={labels}
      {...overrides}
    />,
  );
  return { onChange };
}

describe("DiscountCodeField", () => {
  afterEach(cleanup);

  it("renders a labeled input with no note in the idle state", () => {
    renderField();
    expect(screen.getByTestId("checkout-discount-input")).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-discount-note")).toBeNull();
    expect(screen.queryByTestId("checkout-discount-applied")).toBeNull();
  });

  it("propagates typed input via onChange (the code is a live submit field)", () => {
    const { onChange } = renderField();
    fireEvent.change(screen.getByTestId("checkout-discount-input"), { target: { value: "ahorra10" } });
    expect(onChange).toHaveBeenCalledWith("ahorra10");
  });

  it("shows the applied pill with code + savings when a code applied (AC-6)", () => {
    renderField({ result: { kind: "applied", code: "AHORRA10", discountCents: 67_990 } });
    const pill = screen.getByTestId("checkout-discount-applied");
    expect(pill).toHaveTextContent("Código AHORRA10 aplicado");
    expect(pill).toHaveTextContent("$679.90");
    // Applied is NOT an error → no aria-invalid.
    expect(screen.getByTestId("checkout-discount-input")).not.toHaveAttribute("aria-invalid");
  });

  it("clears the code when Remove is clicked", () => {
    const { onChange } = renderField({
      value: "AHORRA10",
      result: { kind: "applied", code: "AHORRA10", discountCents: 10_000 },
    });
    fireEvent.click(screen.getByTestId("checkout-discount-remove"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it.each([
    ["unknown", "Código no válido."],
    ["expired", "El código expiró."],
    ["inactive", "El código no está disponible."],
    ["below-min", "No alcanzas la compra mínima."],
    ["exhausted", "El código se agotó."],
  ] as const)("shows the '%s' invalid message and flags aria-invalid (AC-7)", (reason, message) => {
    renderField({ result: { kind: "invalid", reason } });
    const note = screen.getByTestId("checkout-discount-note");
    expect(note).toHaveTextContent(message);
    expect(screen.getByTestId("checkout-discount-input")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a MUTED (non-error) degraded note without aria-invalid", () => {
    renderField({ result: { kind: "degraded" } });
    expect(screen.getByTestId("checkout-discount-note")).toHaveTextContent("No pudimos verificar el código.");
    // Degraded is a soft note, not an error tone → the input is not aria-invalid.
    expect(screen.getByTestId("checkout-discount-input")).not.toHaveAttribute("aria-invalid");
  });

  it("disables the input and the remove button when disabled (pending submit)", () => {
    renderField({
      value: "AHORRA10",
      disabled: true,
      result: { kind: "applied", code: "AHORRA10", discountCents: 10_000 },
    });
    expect(screen.getByTestId("checkout-discount-input")).toBeDisabled();
    expect(screen.getByTestId("checkout-discount-remove")).toBeDisabled();
  });

  it("never renders a submit-blocking control (only inline feedback)", () => {
    renderField({ result: { kind: "invalid", reason: "unknown" } });
    // The field contains no button of type submit — a bad code never blocks (AC-7).
    const buttons = screen.queryAllByRole("button");
    for (const button of buttons) {
      expect(button).not.toHaveAttribute("type", "submit");
    }
  });
});

// A no-discount result must render nothing extra so the summary stays clean.
describe("DiscountCodeField none/idle result", () => {
  afterEach(cleanup);
  it("renders neither a note nor a pill for kind:none", () => {
    render(
      <DiscountCodeField
        value=""
        onChange={() => {}}
        result={{ kind: "none" } satisfies DiscountResult}
        disabled={false}
        labels={labels}
      />,
    );
    expect(screen.queryByTestId("checkout-discount-note")).toBeNull();
    expect(screen.queryByTestId("checkout-discount-applied")).toBeNull();
  });
});
