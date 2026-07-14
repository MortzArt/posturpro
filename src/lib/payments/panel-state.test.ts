import { describe, expect, it } from "vitest";
import { derivePanelState, toReturnHint, type PanelStateInput } from "./panel-state";

function input(overrides: Partial<PanelStateInput>): PanelStateInput {
  return {
    orderStatus: "pending_payment",
    paymentStatus: "pending",
    paymentMethod: null,
    voucher: null,
    returnHint: null,
    ...overrides,
  };
}

describe("derivePanelState", () => {
  it("unpaid: fresh pending order, no method, no hint", () => {
    expect(derivePanelState(input({})).kind).toBe("unpaid");
  });

  it("paid: payment_status paid", () => {
    const s = derivePanelState(input({ orderStatus: "paid", paymentStatus: "paid", paymentMethod: "card" }));
    expect(s).toMatchObject({ kind: "paid", method: "card", refunded: false });
  });

  it("paid variant: refunded", () => {
    const s = derivePanelState(input({ paymentStatus: "refunded", paymentMethod: "card" }));
    expect(s).toMatchObject({ kind: "paid", refunded: true });
  });

  it("failed: payment failed → retry", () => {
    expect(derivePanelState(input({ paymentStatus: "failed" })).kind).toBe("failed");
  });

  it("pending-voucher: pending oxxo", () => {
    const s = derivePanelState(input({ paymentStatus: "pending", paymentMethod: "oxxo" }));
    expect(s).toMatchObject({ kind: "pending-voucher", method: "oxxo" });
  });

  it("pending-voucher: pending spei", () => {
    const s = derivePanelState(input({ paymentStatus: "pending", paymentMethod: "spei" }));
    expect(s).toMatchObject({ kind: "pending-voucher", method: "spei" });
  });

  it("processing: card authorized-but-not-captured", () => {
    expect(derivePanelState(input({ paymentStatus: "authorized" })).kind).toBe("processing");
  });

  it("processing: browser returned success but webhook not landed (hint only)", () => {
    expect(derivePanelState(input({ paymentStatus: "pending", returnHint: "success" })).kind).toBe(
      "processing",
    );
  });

  it("NEVER flips to paid on a success hint alone (truth is DB, EC-6)", () => {
    // A success hint with a still-pending DB state is processing, NOT paid.
    const s = derivePanelState(input({ paymentStatus: "pending", returnHint: "success" }));
    expect(s.kind).not.toBe("paid");
  });

  it("failure hint does not override a pending state to failed", () => {
    // Only DB payment_status='failed' yields failed; a failure hint on a pending
    // order stays unpaid (the shopper can still pay).
    const s = derivePanelState(input({ paymentStatus: "pending", returnHint: "failure" }));
    expect(s.kind).toBe("unpaid");
  });
});

describe("toReturnHint", () => {
  it("passes valid hints", () => {
    expect(toReturnHint("success")).toBe("success");
    expect(toReturnHint("pending")).toBe("pending");
    expect(toReturnHint("failure")).toBe("failure");
  });
  it("nulls anything else", () => {
    expect(toReturnHint("evil")).toBeNull();
    expect(toReturnHint(null)).toBeNull();
    expect(toReturnHint(undefined)).toBeNull();
  });
});
