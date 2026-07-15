import { describe, expect, it } from "vitest";
import { parseVariant, parseVariantSet, type VariantRawInput } from "./variant-input";

let keyCounter = 0;
function raw(overrides: Partial<VariantRawInput> = {}): VariantRawInput {
  keyCounter += 1;
  return {
    key: `k${keyCounter}`,
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
  it("rejects an int4-overflowing variant stock (hacker)", () => {
    const result = parseVariant(raw({ stock: "3000000000" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.stock).toBe("stock-invalid");
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

  // M-4: the id is interpolated into a raw PostgREST not(id.in.(...)) filter,
  // so a non-empty non-UUID must be rejected at the parse boundary.
  it("accepts a blank id (new row → null)", () => {
    const result = parseVariant(raw({ id: "" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.id).toBeNull();
  });
  it("accepts a canonical UUID id", () => {
    const result = parseVariant(raw({ id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.id).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  });
  it("rejects a non-UUID id (filter-injection guard, M-4)", () => {
    const result = parseVariant(raw({ id: "abc)" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.id).toBe("id-invalid");
  });
  it("rejects an id crafted to break out of the in(...) list (M-4)", () => {
    const result = parseVariant(raw({ id: "1),(2" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.id).toBe("id-invalid");
  });
});

describe("parseVariantSet", () => {
  it("detects an in-file duplicate SKU (errors keyed by stable row key, M-6)", () => {
    const first = raw({ key: "row-a", sku: "DUP", colorName: "A" });
    const second = raw({ key: "row-b", sku: "dup", colorName: "B" });
    const result = parseVariantSet([first, second]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Keyed by the SECOND row's stable key, never its array index.
    expect(result.rowErrors["row-b"]?.sku).toBe("sku-duplicate");
    expect(result.rowErrors["row-a"]).toBeUndefined();
  });
  it("passes a clean set through", () => {
    const result = parseVariantSet([raw({ sku: "A" }), raw({ sku: "B", colorName: "Gris" })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toHaveLength(2);
  });
});
