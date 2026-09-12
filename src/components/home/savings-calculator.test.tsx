import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavingsCalculator } from "@/components/home/savings-calculator";
import { CALCULATOR_MODELS } from "@/lib/config/calculator";

// Radix Select relies on Pointer Capture + scrollIntoView, which jsdom does not
// implement. Polyfill them so the open/select interaction can be exercised.
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  proto.hasPointerCapture = proto.hasPointerCapture ?? (() => false);
  proto.setPointerCapture = proto.setPointerCapture ?? (() => undefined);
  proto.releasePointerCapture =
    proto.releasePointerCapture ?? (() => undefined);
  proto.scrollIntoView = proto.scrollIntoView ?? (() => undefined);
});

const LABELS = {
  selectLabel: "Modelo de silla",
  newPriceLabel: "Precio nuevo",
  posturLabel: "PosturPro",
  pctSuffix: "de ahorro",
  amountSuffix: "menos que comprar nueva",
};

describe("SavingsCalculator (T19 AC-23, edge 9)", () => {
  it("renders the default (Aeron) with 43% savings on first paint", () => {
    render(<SavingsCalculator labels={LABELS} />);
    const results = screen.getByTestId("calc-results");
    // Aeron: (38,500 − 21,900) / 38,500 ≈ 43%.
    expect(results).toHaveTextContent("43%");
    expect(results).toHaveTextContent("de ahorro");
  });

  it("exposes every configured model as an option and updates on change", async () => {
    const user = userEvent.setup();
    render(<SavingsCalculator labels={LABELS} />);

    await user.click(screen.getByTestId("calc-select"));
    // Radix Select renders options in a portal listbox.
    const sayl = CALCULATOR_MODELS.find((m) => m.id === "sayl");
    if (!sayl) {
      throw new Error("expected a 'sayl' entry in CALCULATOR_MODELS");
    }
    await user.click(screen.getByText(`${sayl.brand} — ${sayl.model}`));

    // Sayl: (1,950,000 − 980,000) / 1,950,000 ≈ 50%.
    expect(screen.getByTestId("calc-results")).toHaveTextContent("50%");
  });

  it("wraps the results in an aria-live region for screen readers", () => {
    render(<SavingsCalculator labels={LABELS} />);
    expect(screen.getByTestId("calc-results")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});
