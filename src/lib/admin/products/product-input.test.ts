import { describe, expect, it } from "vitest";
import { parseProductInput } from "./product-input";
import { emptyProductFormValues } from "@/app/admin/(app)/products/products-form-state";

function values(overrides: Partial<typeof emptyProductFormValues> = {}) {
  return { ...emptyProductFormValues, ...overrides };
}

const valid = values({
  name: "Silla Ergo Pro",
  slug: "silla-ergo-pro",
  sku: "SKU-1",
  price: "4999.00",
  status: "active",
});

describe("parseProductInput", () => {
  it("accepts a full valid product and returns DB-ready cents/mm/g", () => {
    const result = parseProductInput(
      values({
        ...valid,
        compare_at_price: "5999",
        cost_price: "3000",
        stock: "12",
        width_cm: "50",
        weight_kg: "8.5",
        is_featured: true,
        tag_names: ["Nuevo", "nuevo", " "],
        category_ids: ["c1", ""],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.price_cents).toBe(499900);
    expect(result.values.compare_at_price_cents).toBe(599900);
    expect(result.values.cost_price_cents).toBe(300000);
    expect(result.values.width_mm).toBe(500);
    expect(result.values.weight_g).toBe(8500);
    expect(result.values.is_featured).toBe(true);
    expect(result.tagNames).toEqual(["Nuevo"]); // de-duped, blanks dropped
    expect(result.categoryIds).toEqual(["c1"]); // blank dropped
  });

  it("requires name, slug, sku, price", () => {
    const result = parseProductInput(values({ status: "active" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.name).toBe("required");
    expect(result.fieldErrors.slug).toBe("required");
    expect(result.fieldErrors.sku).toBe("required");
    expect(result.fieldErrors.price).toBe("money-required");
  });

  it("rejects a bad slug format", () => {
    const result = parseProductInput(values({ ...valid, slug: "Not A Slug" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.slug).toBe("slug-format");
  });

  it("rejects thousand separators in money (strict)", () => {
    const result = parseProductInput(values({ ...valid, price: "1,500.00" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.price).toBe("money-invalid");
  });

  it("rejects a negative dimension and a bad status", () => {
    const result = parseProductInput(values({ ...valid, width_cm: "-5", status: "bogus" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.width_cm).toBe("unit-negative");
    expect(result.fieldErrors.status).toBe("status-invalid");
  });

  it("treats blank optional money/dimensions as null", () => {
    const result = parseProductInput(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.compare_at_price_cents).toBeNull();
    expect(result.values.cost_price_cents).toBeNull();
    expect(result.values.width_mm).toBeNull();
    expect(result.values.weight_g).toBeNull();
  });
});
