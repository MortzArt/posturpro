import { describe, expect, it } from "vitest";
import { validateAddress, type RawAddressInput } from "@/lib/checkout/address";

/** A fully-valid raw input; individual tests override single fields. */
function validInput(overrides: Partial<RawAddressInput> = {}): RawAddressInput {
  return {
    email: "buyer@example.com",
    contact_phone: "5512345678",
    shipping_full_name: "Juan Pérez",
    address_line1: "Av. Reforma 123",
    address_line2: "Int 4",
    city: "Roma Norte",
    postal_code: "06700",
    state: "Ciudad de México",
    delivery_notes: "Dejar con el portero",
    rfc: "xaxx010101000",
    ...overrides,
  };
}

describe("validateAddress", () => {
  it("accepts a fully valid Mexican address and trims values", () => {
    const result = validateAddress(validInput({ shipping_full_name: "  Juan Pérez  " }));
    expect(result.ok).toBe(true);
    expect(result.fieldErrors).toEqual({});
    expect(result.values.shipping_full_name).toBe("Juan Pérez");
  });

  it("upper-cases the RFC for storage", () => {
    const result = validateAddress(validInput({ rfc: "xaxx010101000" }));
    expect(result.values.rfc).toBe("XAXX010101000");
  });

  it("requires a non-blank email", () => {
    expect(validateAddress(validInput({ email: "   " })).fieldErrors.email).toBe("emailRequired");
  });

  it.each(["plainaddress", "no@dot", "spaces in@email.com", "@nodomain.com"])(
    "rejects malformed email %s",
    (email) => {
      expect(validateAddress(validInput({ email })).fieldErrors.email).toBe("emailInvalid");
    },
  );

  it("requires full name, address, and city after trim", () => {
    const result = validateAddress(
      validInput({ shipping_full_name: "  ", address_line1: "", city: "\t" }),
    );
    expect(result.fieldErrors.shipping_full_name).toBe("fullNameRequired");
    expect(result.fieldErrors.address_line1).toBe("addressRequired");
    expect(result.fieldErrors.city).toBe("cityRequired");
  });

  it.each(["1234", "123456", "12a45", "abcde", ""])(
    "rejects postal code %s",
    (postal_code) => {
      const key = postal_code === "" ? "postalCodeRequired" : "postalCodeInvalid";
      expect(validateAddress(validInput({ postal_code })).fieldErrors.postal_code).toBe(key);
    },
  );

  it("accepts a 5-digit postal code", () => {
    expect(validateAddress(validInput({ postal_code: "00123" })).fieldErrors.postal_code).toBeUndefined();
  });

  it("rejects a non-Mexican state", () => {
    expect(validateAddress(validInput({ state: "California" })).fieldErrors.state).toBe("stateRequired");
    expect(validateAddress(validInput({ state: "" })).fieldErrors.state).toBe("stateRequired");
  });

  it("treats phone, address line 2, notes and rfc as optional", () => {
    const result = validateAddress(
      validInput({ contact_phone: "", address_line2: "", delivery_notes: "", rfc: "" }),
    );
    expect(result.ok).toBe(true);
  });

  it("bounds optional fields to their max length", () => {
    const result = validateAddress(validInput({ contact_phone: "9".repeat(200) }));
    expect(result.fieldErrors.contact_phone).toBe("phoneTooLong");
  });
});
