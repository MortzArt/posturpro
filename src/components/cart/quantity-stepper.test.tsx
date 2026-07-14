/**
 * QuantityStepper render + interaction tests (T6 AC-6, AC-7, AC-13, AC-16).
 *
 * Bounds are the point of this control: `−` disables at min (below-min is
 * impossible via the stepper — removal is a separate action, AC-7) and `+`
 * disables at the cap (AC-13). The center field is `readOnly` and carries an
 * accessible label; the buttons carry `aria-label`s (AC-16). Clicks emit the
 * next value to the parent (which clamps + persists).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuantityStepper } from "./quantity-stepper";
import { MAX_CART_ITEM_QUANTITY } from "@/lib/config";

const labels = {
  increase: "Aumentar cantidad",
  decrease: "Disminuir cantidad",
  quantityLabel: "Cantidad",
};

function renderStepper(value: number, onChange = vi.fn()) {
  render(
    <QuantityStepper
      value={value}
      max={MAX_CART_ITEM_QUANTITY}
      onChange={onChange}
      labels={labels}
    />,
  );
  return onChange;
}

describe("QuantityStepper — display + a11y (AC-16)", () => {
  it("renders the current value in a labelled read-only field", () => {
    renderStepper(3);
    const field = screen.getByTestId("quantity-value");
    expect(field).toHaveValue("3");
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveAccessibleName("Cantidad");
  });

  it("gives both buttons accessible labels", () => {
    renderStepper(3);
    expect(screen.getByTestId("quantity-decrease")).toHaveAccessibleName(
      "Disminuir cantidad",
    );
    expect(screen.getByTestId("quantity-increase")).toHaveAccessibleName(
      "Aumentar cantidad",
    );
  });
});

describe("QuantityStepper — bounds (AC-7, AC-13)", () => {
  it("disables '−' at the minimum (below 1 impossible via stepper, AC-7)", () => {
    renderStepper(1);
    expect(screen.getByTestId("quantity-decrease")).toBeDisabled();
    expect(screen.getByTestId("quantity-increase")).toBeEnabled();
  });

  it("disables '+' at the cap (AC-13)", () => {
    renderStepper(MAX_CART_ITEM_QUANTITY);
    expect(screen.getByTestId("quantity-increase")).toBeDisabled();
    expect(screen.getByTestId("quantity-decrease")).toBeEnabled();
  });

  it("enables both buttons for a mid-range value", () => {
    renderStepper(5);
    expect(screen.getByTestId("quantity-decrease")).toBeEnabled();
    expect(screen.getByTestId("quantity-increase")).toBeEnabled();
  });
});

describe("QuantityStepper — emits next value (AC-6)", () => {
  it("'+' emits value + 1", async () => {
    const user = userEvent.setup();
    const onChange = renderStepper(3);
    await user.click(screen.getByTestId("quantity-increase"));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("'−' emits value - 1", async () => {
    const user = userEvent.setup();
    const onChange = renderStepper(3);
    await user.click(screen.getByTestId("quantity-decrease"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("does not emit when the disabled '−' at min is clicked (AC-7)", async () => {
    const user = userEvent.setup();
    const onChange = renderStepper(1);
    await user.click(screen.getByTestId("quantity-decrease"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is keyboard-operable: Enter on '+' emits (AC-16)", async () => {
    const user = userEvent.setup();
    const onChange = renderStepper(2);
    screen.getByTestId("quantity-increase").focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
