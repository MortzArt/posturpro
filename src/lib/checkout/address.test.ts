import { describe, expect, it } from "vitest";
import { validateAddress, type RawAddressInput } from "@/lib/checkout/address";
import {
  ADDRESS_FIELD_MAX,
  CONTACT_PHONE_MAX,
  DELIVERY_NOTES_MAX,
  MEXICAN_STATES,
  RFC_MAX,
} from "@/lib/config";

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

  // ---- AC-4: the full 32-state closed list is accepted (single-sourced). ----
  it("has exactly 32 Mexican states in the closed list", () => {
    expect(MEXICAN_STATES).toHaveLength(32);
    expect(new Set(MEXICAN_STATES).size).toBe(32); // no duplicates
  });

  it.each(MEXICAN_STATES)("accepts the valid Mexican state %s", (state) => {
    expect(validateAddress(validInput({ state })).fieldErrors.state).toBeUndefined();
  });

  it("rejects a state with wrong casing (exact-match closed list)", () => {
    expect(validateAddress(validInput({ state: "jalisco" })).fieldErrors.state).toBe("stateRequired");
  });

  it("trims the state before membership check", () => {
    expect(validateAddress(validInput({ state: "  Jalisco  " })).fieldErrors.state).toBeUndefined();
  });

  // ---- AC-4: CP is EXACTLY 5 digits — boundary cases. ----
  it("accepts the canonical 5-digit CP and rejects 6 digits / leading letter", () => {
    expect(validateAddress(validInput({ postal_code: "12345" })).fieldErrors.postal_code).toBeUndefined();
    expect(validateAddress(validInput({ postal_code: "123456" })).fieldErrors.postal_code).toBe("postalCodeInvalid");
    expect(validateAddress(validInput({ postal_code: "a1234" })).fieldErrors.postal_code).toBe("postalCodeInvalid");
  });

  it("trims a CP with surrounding whitespace before validating", () => {
    expect(validateAddress(validInput({ postal_code: "  06700  " })).fieldErrors.postal_code).toBeUndefined();
  });

  // ---- AC-5: required-field mirror of the DB NOT NULL + nonblank CHECK. ----
  it("accepts a required field exactly at the max length and rejects one over", () => {
    const atMax = "a".repeat(ADDRESS_FIELD_MAX);
    expect(validateAddress(validInput({ shipping_full_name: atMax })).fieldErrors.shipping_full_name).toBeUndefined();
    expect(
      validateAddress(validInput({ shipping_full_name: atMax + "a" })).fieldErrors.shipping_full_name,
    ).toBe("fullNameTooLong");
  });

  it("bounds delivery notes, address line 2 and rfc to their own caps", () => {
    expect(
      validateAddress(validInput({ delivery_notes: "x".repeat(DELIVERY_NOTES_MAX + 1) })).fieldErrors.delivery_notes,
    ).toBe("deliveryNotesTooLong");
    expect(
      validateAddress(validInput({ address_line2: "x".repeat(ADDRESS_FIELD_MAX + 1) })).fieldErrors.address_line2,
    ).toBe("addressLine2TooLong");
    expect(validateAddress(validInput({ rfc: "X".repeat(RFC_MAX + 1) })).fieldErrors.rfc).toBe("rfcTooLong");
  });

  it("keeps the phone cap at CONTACT_PHONE_MAX (boundary)", () => {
    expect(validateAddress(validInput({ contact_phone: "9".repeat(CONTACT_PHONE_MAX) })).fieldErrors.contact_phone).toBeUndefined();
    expect(validateAddress(validInput({ contact_phone: "9".repeat(CONTACT_PHONE_MAX + 1) })).fieldErrors.contact_phone).toBe("phoneTooLong");
  });

  it("reports EVERY invalid field at once (not just the first)", () => {
    const result = validateAddress(
      validInput({ email: "bad", shipping_full_name: "", postal_code: "1", state: "Nowhere" }),
    );
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.email).toBe("emailInvalid");
    expect(result.fieldErrors.shipping_full_name).toBe("fullNameRequired");
    expect(result.fieldErrors.postal_code).toBe("postalCodeInvalid");
    expect(result.fieldErrors.state).toBe("stateRequired");
  });
});
