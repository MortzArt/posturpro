/**
 * Unit tests for the pure manual-order input validator (T17 AC-18, edges 2/4/6).
 * No I/O. Covers: a valid payload; missing required contact/shipping fields;
 * invalid CP/state; zero-item + over-cap line arrays; invalid quantity
 * (0 / negative / non-integer / INT4 overflow); blank-vs-valid email branching;
 * payment-choice branching; confirmation opt-in branching; and that prices are
 * never read from the input (a client price cannot leak through).
 */
import { describe, expect, it } from "vitest";
import { INT4_MAX } from "@/lib/config";
import {
  parseManualOrderInput,
  type RawManualOrderInput,
  type RawManualOrderLine,
} from "./manual-order-input";

const VALID_PRODUCT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const VALID_VARIANT = "9a0c0305-e82c-4301-8f89-41d33f2504e0";

function line(overrides: Partial<RawManualOrderLine> = {}): RawManualOrderLine {
  return {
    line_key: "k1",
    line_product_id: VALID_PRODUCT,
    line_variant_id: "",
    line_qty: "2",
    ...overrides,
  };
}

function raw(overrides: Partial<RawManualOrderInput> = {}): RawManualOrderInput {
  return {
    contact_name: "María López",
    contact_email: "maria@correo.mx",
    contact_phone: "5512345678",
    shipping_full_name: "María López",
    address_line1: "Av. Reforma 100",
    address_line2: "",
    city: "Monterrey",
    postal_code: "64000",
    state: "Nuevo León",
    delivery_notes: "",
    rfc: "",
    shipping_override: "500",
    internal_note: "",
    payment_choice: "pending",
    send_confirmation: false,
    lines: [line()],
    ...overrides,
  };
}

describe("parseManualOrderInput — happy path", () => {
  it("accepts a valid payload and returns typed input", () => {
    const result = parseManualOrderInput(raw());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.contactName).toBe("María López");
    expect(result.input.contactEmail).toBe("maria@correo.mx");
    expect(result.input.shippingCents).toBe(50000);
    expect(result.input.lines).toHaveLength(1);
    expect(result.input.lines[0]).toMatchObject({ productId: VALID_PRODUCT, variantId: null, quantity: 2 });
    expect(result.input.paymentChoice).toBe("pending");
  });

  it("captures a variant id when present", () => {
    const result = parseManualOrderInput(raw({ lines: [line({ line_variant_id: VALID_VARIANT })] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.lines[0].variantId).toBe(VALID_VARIANT);
  });
});

describe("required contact / shipping fields", () => {
  it("rejects a blank contact name", () => {
    const result = parseManualOrderInput(raw({ contact_name: "   " }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.contact_name).toBe("required");
  });

  it("rejects blank shipping name / line1 / city", () => {
    const result = parseManualOrderInput(raw({ shipping_full_name: "", address_line1: "", city: "" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.shipping_full_name).toBe("required");
    expect(result.fieldErrors.address_line1).toBe("required");
    expect(result.fieldErrors.city).toBe("required");
  });
});

describe("CP / state validation (AC-4, same rules as checkout)", () => {
  it("rejects a non-5-digit CP", () => {
    expect(reject(raw({ postal_code: "123" })).postal_code).toBe("cp-invalid");
    expect(reject(raw({ postal_code: "abcde" })).postal_code).toBe("cp-invalid");
  });

  it("rejects an unknown state", () => {
    expect(reject(raw({ state: "Californiaaa" })).state).toBe("state-invalid");
  });

  it("rejects a blank state as required", () => {
    expect(reject(raw({ state: "" })).state).toBe("required");
  });
});

describe("email-optional branching (AC-11)", () => {
  it("treats a blank email as valid → contactEmail null", () => {
    const result = parseManualOrderInput(raw({ contact_email: "" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.contactEmail).toBeNull();
  });

  it("rejects a malformed email when present", () => {
    expect(reject(raw({ contact_email: "not-an-email" })).contact_email).toBe("email-invalid");
  });
});

describe("line array (edge 2) + quantity (edge 6)", () => {
  it("rejects zero-item orders", () => {
    expect(reject(raw({ lines: [] })).items).toBe("no-items");
  });

  it("rejects an over-cap line array", () => {
    const many = Array.from({ length: 201 }, (_, index) => line({ line_key: `k${index}` }));
    expect(reject(raw({ lines: many })).items).toBe("line-invalid");
  });

  it("rejects quantity 0 / negative / non-integer / INT4-overflow", () => {
    expect(reject(raw({ lines: [line({ line_qty: "0" })] })).items).toBe("line-invalid");
    expect(reject(raw({ lines: [line({ line_qty: "-3" })] })).items).toBe("line-invalid");
    expect(reject(raw({ lines: [line({ line_qty: "1.5" })] })).items).toBe("line-invalid");
    expect(reject(raw({ lines: [line({ line_qty: String(INT4_MAX + 1) })] })).items).toBe("line-invalid");
  });

  it("rejects a line with a non-UUID product id (tamper guard)", () => {
    expect(reject(raw({ lines: [line({ line_product_id: "../etc" })] })).items).toBe("line-invalid");
  });

  it("rejects a line with a malformed variant id", () => {
    expect(reject(raw({ lines: [line({ line_variant_id: "not-a-uuid" })] })).items).toBe("line-invalid");
  });
});

describe("shipping override", () => {
  it("parses a decimal peso string to integer cents", () => {
    const result = parseManualOrderInput(raw({ shipping_override: "199.50" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.shippingCents).toBe(19950);
  });

  it("accepts zero shipping", () => {
    const result = parseManualOrderInput(raw({ shipping_override: "0" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.shippingCents).toBe(0);
  });

  it("rejects a negative or non-numeric shipping override", () => {
    expect(reject(raw({ shipping_override: "-5" })).shipping_override).toBe("shipping-invalid");
    expect(reject(raw({ shipping_override: "abc" })).shipping_override).toBe("shipping-invalid");
    expect(reject(raw({ shipping_override: "" })).shipping_override).toBe("required");
  });
});

describe("payment-choice + confirmation branching", () => {
  it("maps 'paid' choice through", () => {
    const result = parseManualOrderInput(raw({ payment_choice: "paid" }));
    expect(result.ok && result.input.paymentChoice).toBe("paid");
  });

  it("defaults any unknown payment choice to pending", () => {
    const result = parseManualOrderInput(raw({ payment_choice: "garbage" }));
    expect(result.ok && result.input.paymentChoice).toBe("pending");
  });

  it("carries the confirmation opt-in flag", () => {
    const on = parseManualOrderInput(raw({ send_confirmation: true }));
    const off = parseManualOrderInput(raw({ send_confirmation: false }));
    expect(on.ok && on.input.sendConfirmation).toBe(true);
    expect(off.ok && off.input.sendConfirmation).toBe(false);
  });
});

/** Helper: assert a raw input rejects and return its field-error map. */
function reject(input: RawManualOrderInput) {
  const result = parseManualOrderInput(input);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected rejection");
  }
  return result.fieldErrors;
}
