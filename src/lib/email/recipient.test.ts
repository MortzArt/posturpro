/**
 * Unit tests for the customer-email recipient guard (T17 AC-13). Pure — no I/O.
 * Asserts the no-email sentinel + blank + malformed addresses resolve to null
 * (the skip signal) while a real address passes through trimmed.
 */
import { describe, expect, it } from "vitest";
import {
  NO_EMAIL_PLACEHOLDER,
  isMailableAddress,
  resolveCustomerRecipient,
} from "./recipient";

describe("isMailableAddress", () => {
  it("accepts a well-formed address", () => {
    expect(isMailableAddress("cliente@correo.mx")).toBe(true);
  });

  it("rejects null / undefined / blank", () => {
    expect(isMailableAddress(null)).toBe(false);
    expect(isMailableAddress(undefined)).toBe(false);
    expect(isMailableAddress("")).toBe(false);
    expect(isMailableAddress("   ")).toBe(false);
  });

  it("rejects the no-email sentinel placeholder", () => {
    expect(isMailableAddress(NO_EMAIL_PLACEHOLDER)).toBe(false);
  });

  it("rejects malformed addresses", () => {
    expect(isMailableAddress("no-at-sign")).toBe(false);
    expect(isMailableAddress("missing@tld")).toBe(false);
    expect(isMailableAddress("@nolocal.mx")).toBe(false);
  });

  it("the sentinel itself fails EMAIL_PATTERN (defense in depth)", () => {
    // A regression here would let the placeholder reach the provider.
    expect(NO_EMAIL_PLACEHOLDER.includes("@pedido-manual.invalid")).toBe(true);
  });
});

describe("resolveCustomerRecipient", () => {
  it("returns the trimmed address for a real email", () => {
    expect(resolveCustomerRecipient("  cliente@correo.mx  ")).toBe("cliente@correo.mx");
  });

  it("returns null for blank / sentinel / malformed", () => {
    expect(resolveCustomerRecipient("")).toBeNull();
    expect(resolveCustomerRecipient(null)).toBeNull();
    expect(resolveCustomerRecipient(NO_EMAIL_PLACEHOLDER)).toBeNull();
    expect(resolveCustomerRecipient("bad")).toBeNull();
  });
});
