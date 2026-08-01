/**
 * `order-list-filters` unit tests (T12 AC-2/3/4 + M-4). Covers the pure parse /
 * normalize contract, and specifically the `?new=1` seam that keeps the dashboard
 * new-order indicator's link in agreement with its count (M-4): `new=1` parses to
 * `isNew: true` ONLY when no explicit single-status filter is set, and round-trips
 * through `buildOrderListQueryString`.
 */
import { describe, expect, it } from "vitest";
import {
  parseOrderListFilters,
  hasActiveOrderFilters,
  buildOrderListQueryString,
  NEW_ORDER_STATUSES,
} from "./order-list-filters";

describe("parseOrderListFilters", () => {
  it("defaults to an empty/all filter set (isNew false)", () => {
    expect(parseOrderListFilters({})).toEqual({
      search: "",
      status: "all",
      payment: "all",
      isNew: false,
      rawPage: "",
    });
  });

  it("parses status + payment enums and drops unknown values to 'all'", () => {
    expect(parseOrderListFilters({ status: "shipped", payment: "refunded" })).toMatchObject({
      status: "shipped",
      payment: "refunded",
    });
    expect(parseOrderListFilters({ status: "bogus", payment: "nope" })).toMatchObject({
      status: "all",
      payment: "all",
    });
  });

  it("parses ?new=1 into isNew when no explicit status is set (M-4)", () => {
    const parsed = parseOrderListFilters({ new: "1" });
    expect(parsed.isNew).toBe(true);
    expect(parsed.status).toBe("all");
  });

  it("ignores ?new when an explicit single-status filter is present (status wins)", () => {
    const parsed = parseOrderListFilters({ new: "1", status: "delivered" });
    expect(parsed.isNew).toBe(false);
    expect(parsed.status).toBe("delivered");
  });

  it("treats a non-'1' ?new value as inactive", () => {
    expect(parseOrderListFilters({ new: "true" }).isNew).toBe(false);
    expect(parseOrderListFilters({ new: "0" }).isNew).toBe(false);
  });
});

describe("hasActiveOrderFilters", () => {
  it("counts the ?new=1 seam as an active filter", () => {
    expect(hasActiveOrderFilters(parseOrderListFilters({ new: "1" }))).toBe(true);
    expect(hasActiveOrderFilters(parseOrderListFilters({}))).toBe(false);
  });
});

describe("buildOrderListQueryString", () => {
  it("round-trips the ?new=1 seam", () => {
    const filters = parseOrderListFilters({ new: "1" });
    expect(buildOrderListQueryString(filters)).toBe("?new=1");
  });

  it("emits status instead of new when a status is set", () => {
    const filters = parseOrderListFilters({ status: "paid" });
    expect(buildOrderListQueryString(filters)).toBe("?status=paid");
  });

  it("preserves the seam across a page override", () => {
    const filters = parseOrderListFilters({ new: "1" });
    expect(buildOrderListQueryString(filters, { page: 3 })).toBe("?new=1&page=3");
  });
});

describe("NEW_ORDER_STATUSES", () => {
  it("is exactly the awaiting-fulfilment pair (single source for count + link)", () => {
    expect([...NEW_ORDER_STATUSES]).toEqual(["pending_payment", "paid"]);
  });
});
