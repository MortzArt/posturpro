import { describe, expect, it } from "vitest";
import { parseVariant, parseVariantSet, type VariantRawInput } from "./variant-input";

function raw(overrides: Partial<VariantRawInput> = {}): VariantRawInput {
  return {
    id: "",
    colorName: "Negro",
    colorHex: "#111111",
    sku: "SKU-N",
    priceOverride: "",
    stock: "10",
    sortOrder: 0,
    ...overrides,
  };
}

describe("parseVariant", () => {
  it("accepts a valid variant (blank price = inherit → null)", () => {
    const result = parseVariant(raw());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.price_override_cents).toBeNull();
    expect(result.values.stock).toBe(10);
  });
  it("parses a price override to cents", () => {
    const result = parseVariant(raw({ priceOverride: "1999.00" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.price_override_cents).toBe(199900);
  });
  it("rejects a bad hex", () => {
    const result = parseVariant(raw({ colorHex: "111111" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.colorHex).toBe("hex-invalid");
  });
  it("requires color + sku", () => {
    const result = parseVariant(raw({ colorName: "", sku: "" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.colorName).toBe("color-required");
    expect(result.errors.sku).toBe("sku-required");
  });
});

describe("parseVariantSet", () => {
  it("detects an in-file duplicate SKU", () => {
    const result = parseVariantSet([
      raw({ sku: "DUP", colorName: "A" }),
      raw({ sku: "dup", colorName: "B" }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors[1]?.sku).toBe("sku-duplicate");
  });
  it("passes a clean set through", () => {
    const result = parseVariantSet([raw({ sku: "A" }), raw({ sku: "B", colorName: "Gris" })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toHaveLength(2);
  });
});
