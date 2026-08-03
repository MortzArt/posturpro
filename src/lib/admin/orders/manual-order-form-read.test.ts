/**
 * Unit tests for the manual-order FormData reader (T17). Pure — uses a real
 * FormData. Asserts the flat fields, the boolean switch, and the parallel
 * index-aligned per-line arrays (key/product/variant/qty + echoed display fields)
 * are read faithfully, and that a variant-less line yields variantId null.
 */
import { describe, expect, it } from "vitest";
import { readManualOrderForm, readRawManualOrder } from "./manual-order-form-read";

const PRODUCT_A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const PRODUCT_B = "9a0c0305-e82c-4301-8f89-41d33f2504e0";
const VARIANT_B = "11112222-3333-4444-8555-666677778888";

function buildForm(): FormData {
  const form = new FormData();
  form.set("contact_name", "María");
  form.set("contact_email", "maria@correo.mx");
  form.set("contact_phone", "5512345678");
  form.set("shipping_full_name", "María López");
  form.set("address_line1", "Reforma 100");
  form.set("address_line2", "Int 4");
  form.set("city", "Monterrey");
  form.set("postal_code", "64000");
  form.set("state", "Nuevo León");
  form.set("delivery_notes", "Tocar timbre");
  form.set("rfc", "XAXX010101000");
  form.set("shipping_override", "500");
  form.set("internal_note", "Cliente frecuente");
  form.set("payment_choice", "paid");
  form.set("send_confirmation", "true");
  // Two parallel lines.
  for (const value of ["kA", "kB"]) form.append("line_key", value);
  for (const value of [PRODUCT_A, PRODUCT_B]) form.append("line_product_id", value);
  for (const value of ["", VARIANT_B]) form.append("line_variant_id", value);
  for (const value of ["1", "3"]) form.append("line_qty", value);
  for (const value of ["Silla A", "Silla B"]) form.append("line_product_name", value);
  for (const value of ["A-01", "B-02"]) form.append("line_product_sku", value);
  for (const value of ["", "Azul"]) form.append("line_variant_label", value);
  for (const value of ["499900", "550000"]) form.append("line_unit_price_cents", value);
  for (const value of ["", "https://img/b.jpg"]) form.append("line_cover_url", value);
  return form;
}

describe("readRawManualOrder", () => {
  it("reads the flat fields, the switch boolean, and the parallel line arrays", () => {
    const raw = readRawManualOrder(buildForm());
    expect(raw.contact_name).toBe("María");
    expect(raw.payment_choice).toBe("paid");
    expect(raw.send_confirmation).toBe(true);
    expect(raw.lines).toHaveLength(2);
    expect(raw.lines[0]).toEqual({ line_key: "kA", line_product_id: PRODUCT_A, line_variant_id: "", line_qty: "1" });
    expect(raw.lines[1]).toEqual({ line_key: "kB", line_product_id: PRODUCT_B, line_variant_id: VARIANT_B, line_qty: "3" });
  });

  it("treats a missing switch as false", () => {
    const form = buildForm();
    form.delete("send_confirmation");
    expect(readRawManualOrder(form).send_confirmation).toBe(false);
  });

  it("returns no lines when the arrays are empty", () => {
    const form = new FormData();
    form.set("contact_name", "X");
    expect(readRawManualOrder(form).lines).toHaveLength(0);
  });
});

describe("readManualOrderForm (values echo)", () => {
  it("echoes display line values, with variantId null for a variant-less line", () => {
    const { values } = readManualOrderForm(buildForm());
    expect(values.payment_choice).toBe("paid");
    expect(values.send_confirmation).toBe(true);
    expect(values.lines).toHaveLength(2);
    expect(values.lines[0]).toMatchObject({
      lineKey: "kA",
      variantId: null,
      quantity: 1,
      productName: "Silla A",
      unitPriceCents: 499900,
      coverUrl: null,
    });
    expect(values.lines[1]).toMatchObject({
      variantId: VARIANT_B,
      variantLabel: "Azul",
      quantity: 3,
      coverUrl: "https://img/b.jpg",
    });
  });
});
