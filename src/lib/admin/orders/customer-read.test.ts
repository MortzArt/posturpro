/**
 * `customer-read` unit tests (T18). Covers the PURE piece — `dedupeAddresses`,
 * the shipping-address de-dup that AC-6 / edge 4 hinge on:
 *   - identical addresses across orders collapse to one entry;
 *   - distinct addresses each appear once, most-recent-first (input is
 *     newest-first, dedup keeps the first occurrence);
 *   - a single-field difference (line2 present vs. null, different city, etc.)
 *     is a DISTINCT address, not a collapse;
 *   - the empty-input case yields an empty list (the zero-order guard).
 *
 * `server-only` is stubbed so the module (which does `import "server-only"`) can
 * be loaded in the node test env; the DB-touching `getAdminCustomer` is exercised
 * by the live integration test, not here.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { dedupeAddresses } from "@/lib/admin/orders/customer-read";

/** A full address-source row with sensible defaults; override per test. */
function addressRow(overrides: Partial<AddressRow> = {}): AddressRow {
  return {
    shipping_full_name: "María González",
    shipping_address_line1: "Av. Reforma 123",
    shipping_address_line2: "Int 4",
    shipping_city: "Juárez",
    shipping_state: "CDMX",
    shipping_postal_code: "06600",
    shipping_country: "MX",
    ...overrides,
  };
}

interface AddressRow {
  shipping_full_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
}

describe("dedupeAddresses", () => {
  it("returns [] for no orders (the zero-order guard)", () => {
    expect(dedupeAddresses([])).toEqual([]);
  });

  it("collapses identical addresses across multiple orders to ONE entry", () => {
    const result = dedupeAddresses([addressRow(), addressRow(), addressRow()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      shippingFullName: "María González",
      line1: "Av. Reforma 123",
      line2: "Int 4",
      city: "Juárez",
      state: "CDMX",
      postalCode: "06600",
      country: "MX",
    });
  });

  it("keeps each DISTINCT address once, most-recent-first (input newest-first)", () => {
    const newest = addressRow({ shipping_address_line1: "Calle Pino 8", shipping_address_line2: null });
    const oldest = addressRow();
    const result = dedupeAddresses([newest, oldest]);
    expect(result).toHaveLength(2);
    expect(result[0].line1).toBe("Calle Pino 8");
    expect(result[1].line1).toBe("Av. Reforma 123");
  });

  it("treats a null vs. present line2 as DISTINCT (single-field difference)", () => {
    const withLine2 = addressRow({ shipping_address_line2: "Int 4" });
    const withoutLine2 = addressRow({ shipping_address_line2: null });
    expect(dedupeAddresses([withLine2, withoutLine2])).toHaveLength(2);
  });

  it("treats a different city as DISTINCT (does not collapse near-matches)", () => {
    const a = addressRow({ shipping_city: "Juárez" });
    const b = addressRow({ shipping_city: "Del Valle" });
    expect(dedupeAddresses([a, b])).toHaveLength(2);
  });

  it("does not collapse across a delimiter boundary (key is field-safe)", () => {
    // "a b" + "c" must not equal "a" + "b c" — the join delimiter prevents it.
    const first = addressRow({ shipping_full_name: "a b", shipping_address_line1: "c" });
    const second = addressRow({ shipping_full_name: "a", shipping_address_line1: "b c" });
    expect(dedupeAddresses([first, second])).toHaveLength(2);
  });

  it("preserves the nullable line2 in the projected output", () => {
    const [address] = dedupeAddresses([addressRow({ shipping_address_line2: null })]);
    expect(address.line2).toBeNull();
  });
});
