import { describe, expect, it } from "vitest";
import { parseAdjustment, previewResultingStock } from "./inventory-input";

describe("parseAdjustment", () => {
  it("applies a positive delta", () => {
    const result = parseAdjustment({ mode: "delta", amount: "5", reason: "Recuento" }, 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.delta).toBe(5);
    expect(result.values.absolute).toBeNull();
    expect(result.values.resultingStock).toBe(15);
  });
  it("applies a negative delta and blocks going negative", () => {
    const ok = parseAdjustment({ mode: "delta", amount: "-3", reason: "Merma" }, 10);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.values.resultingStock).toBe(7);

    const bad = parseAdjustment({ mode: "delta", amount: "-20", reason: "Merma" }, 10);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.fieldErrors.amount).toBe("result-negative");
  });
  it("sets an absolute total", () => {
    const result = parseAdjustment({ mode: "absolute", amount: "3", reason: "Inventario físico" }, 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.absolute).toBe(3);
    expect(result.values.delta).toBeNull();
    expect(result.values.resultingStock).toBe(3);
  });
  it("requires a reason and a valid amount", () => {
    const noReason = parseAdjustment({ mode: "delta", amount: "5", reason: "  " }, 10);
    expect(noReason.ok).toBe(false);
    if (noReason.ok) return;
    expect(noReason.fieldErrors.reason).toBe("reason-required");

    const badAmount = parseAdjustment({ mode: "delta", amount: "x", reason: "Ok" }, 10);
    expect(badAmount.ok).toBe(false);
    if (badAmount.ok) return;
    expect(badAmount.fieldErrors.amount).toBe("amount-invalid");
  });
  it("rejects an over-long reason", () => {
    const result = parseAdjustment({ mode: "delta", amount: "1", reason: "a".repeat(600) }, 10);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.reason).toBe("reason-too-long");
  });
});

describe("previewResultingStock", () => {
  it("computes delta and absolute previews", () => {
    expect(previewResultingStock("delta", 5, 10)).toBe(15);
    expect(previewResultingStock("delta", -12, 10)).toBe(-2);
    expect(previewResultingStock("absolute", 3, 10)).toBe(3);
  });
});
