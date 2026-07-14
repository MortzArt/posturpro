import { describe, expect, it } from "vitest";
import { isKnownMpStatus, mapMpStatus } from "./payments-status";

describe("mapMpStatus", () => {
  it("maps approved → paid/paid", () => {
    const m = mapMpStatus("approved", "accredited");
    expect(m).toMatchObject({ kind: "advance", orderStatus: "paid", paymentStatus: "paid" });
  });

  it("maps pending → pending_payment/pending (stays)", () => {
    const m = mapMpStatus("pending", "pending_waiting_payment");
    expect(m).toMatchObject({ kind: "advance", orderStatus: "pending_payment", paymentStatus: "pending" });
  });

  it("maps in_process → pending_payment/pending", () => {
    expect(mapMpStatus("in_process")).toMatchObject({
      kind: "advance",
      orderStatus: "pending_payment",
      paymentStatus: "pending",
    });
  });

  it("maps authorized → pending_payment/authorized", () => {
    expect(mapMpStatus("authorized")).toMatchObject({
      kind: "advance",
      orderStatus: "pending_payment",
      paymentStatus: "authorized",
    });
  });

  it("maps rejected → pending_payment/failed (allow retry)", () => {
    expect(mapMpStatus("rejected", "cc_rejected_bad_filled_security_code")).toMatchObject({
      kind: "advance",
      orderStatus: "pending_payment",
      paymentStatus: "failed",
    });
  });

  it("maps cancelled/expired → pending_payment/failed", () => {
    expect(mapMpStatus("cancelled", "expired")).toMatchObject({
      kind: "advance",
      orderStatus: "pending_payment",
      paymentStatus: "failed",
    });
  });

  it("maps refunded → payment-only (orderStatus null, C-2)", () => {
    expect(mapMpStatus("refunded")).toMatchObject({
      kind: "advance",
      orderStatus: null,
      paymentStatus: "refunded",
    });
  });

  it("FLAGS charged_back (never auto-advances)", () => {
    const m = mapMpStatus("charged_back");
    expect(m.kind).toBe("flag");
  });

  it("FLAGS in_mediation", () => {
    expect(mapMpStatus("in_mediation").kind).toBe("flag");
  });

  it("FLAGS an unknown status", () => {
    const m = mapMpStatus("weird_new_status");
    expect(m.kind).toBe("flag");
  });

  it("FLAGS an empty/absent status", () => {
    expect(mapMpStatus(null).kind).toBe("flag");
    expect(mapMpStatus("").kind).toBe("flag");
    expect(mapMpStatus(undefined).kind).toBe("flag");
  });

  it("is case-insensitive and trims", () => {
    expect(mapMpStatus("  APPROVED  ").kind).toBe("advance");
  });

  it("folds status_detail into the note", () => {
    const m = mapMpStatus("approved", "accredited");
    if (m.kind === "advance") {
      expect(m.note).toContain("accredited");
    }
  });
});

describe("isKnownMpStatus", () => {
  it("recognizes documented statuses", () => {
    expect(isKnownMpStatus("approved")).toBe(true);
    expect(isKnownMpStatus("charged_back")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isKnownMpStatus("nope")).toBe(false);
  });
});
