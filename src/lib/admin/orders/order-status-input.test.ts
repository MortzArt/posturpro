/**
 * `order-status-input` unit tests (T12 AC-8). Pure fast-gate that validates a
 * requested manual transition against the DB enum AND the offered forward-only
 * map before any DB touch — the DB `advance_order_status` regression guard remains
 * the race-safe authority.
 */
import { describe, expect, it } from "vitest";
import { parseStatusTransition, isOrderStatus } from "./order-status-input";

describe("isOrderStatus", () => {
  it("accepts every valid enum member", () => {
    for (const s of ["pending_payment", "paid", "preparing", "shipped", "delivered", "cancelled"]) {
      expect(isOrderStatus(s)).toBe(true);
    }
  });

  it("rejects a non-enum string", () => {
    expect(isOrderStatus("refunded")).toBe(false); // that's a payment status, not order
    expect(isOrderStatus("")).toBe(false);
    expect(isOrderStatus("PAID")).toBe(false);
  });
});

describe("parseStatusTransition — allowed forward steps", () => {
  it("accepts the single legal forward step", () => {
    expect(parseStatusTransition("pending_payment", "paid")).toEqual({ ok: true, target: "paid" });
    expect(parseStatusTransition("paid", "preparing")).toEqual({ ok: true, target: "preparing" });
    expect(parseStatusTransition("preparing", "shipped")).toEqual({ ok: true, target: "shipped" });
    expect(parseStatusTransition("shipped", "delivered")).toEqual({ ok: true, target: "delivered" });
  });
});

describe("parseStatusTransition — rejections", () => {
  it("rejects a non-enum target as invalid-status", () => {
    expect(parseStatusTransition("paid", "bogus")).toEqual({ ok: false, reason: "invalid-status" });
  });

  it("rejects a regressive target as not-allowed", () => {
    expect(parseStatusTransition("shipped", "paid")).toEqual({ ok: false, reason: "not-allowed" });
    expect(parseStatusTransition("delivered", "shipped")).toEqual({ ok: false, reason: "not-allowed" });
  });

  it("rejects a skip-a-step forward jump as not-allowed (only one step offered)", () => {
    expect(parseStatusTransition("paid", "shipped")).toEqual({ ok: false, reason: "not-allowed" });
    expect(parseStatusTransition("pending_payment", "delivered")).toEqual({ ok: false, reason: "not-allowed" });
  });

  it("never allows `cancelled` as a manual transition (it is the Cancel action)", () => {
    expect(parseStatusTransition("paid", "cancelled")).toEqual({ ok: false, reason: "not-allowed" });
  });

  it("offers nothing from terminal states", () => {
    expect(parseStatusTransition("delivered", "cancelled")).toEqual({ ok: false, reason: "not-allowed" });
    expect(parseStatusTransition("cancelled", "delivered")).toEqual({ ok: false, reason: "not-allowed" });
  });
});
