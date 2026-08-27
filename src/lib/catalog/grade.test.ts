import { describe, expect, it } from "vitest";
import {
  PRODUCT_CONDITION_GRADES,
  isConditionGrade,
} from "@/lib/catalog/grade";

/**
 * `isConditionGrade` is the single narrowing guard used at EVERY trust boundary
 * (T19): admin validation (reject tampered POSTs), the read layer (defend against
 * a legacy/unexpected DB value), and the badge (render nothing if not a grade).
 * A regression here would silently let a bad value through one of those doors, so
 * pin the exact accept/reject contract — including the `+`-bearing `"A+"` that
 * must never be slugified.
 */
describe("PRODUCT_CONDITION_GRADES", () => {
  it("is exactly the three DB enum labels, in order, with the literal '+'", () => {
    expect(PRODUCT_CONDITION_GRADES).toEqual(["A+", "A", "B"]);
  });
});

describe("isConditionGrade (trust-boundary guard)", () => {
  it.each(PRODUCT_CONDITION_GRADES)("accepts the valid grade %s", (grade) => {
    expect(isConditionGrade(grade)).toBe(true);
  });

  it.each([
    "C",
    "A-",
    "a+", // case-sensitive: the DB enum is uppercase
    "aplus", // a slugified '+' must NOT resolve
    "A +",
    " A+", // untrimmed
    "",
    "A+B",
    "1",
  ])("rejects the invalid grade string %j", (value) => {
    expect(isConditionGrade(value)).toBe(false);
  });

  it.each([null, undefined, 0, 1, {}, [], true, Symbol("A+")])(
    "rejects the non-string value %j",
    (value) => {
      expect(isConditionGrade(value)).toBe(false);
    },
  );

  it("narrows the type so a guarded value is assignable to ProductConditionGrade", () => {
    const value: unknown = "A+";
    if (isConditionGrade(value)) {
      // If this compiles, the type predicate narrowed `value` correctly.
      const grade: "A+" | "A" | "B" = value;
      expect(grade).toBe("A+");
    } else {
      throw new Error("guard should have accepted 'A+'");
    }
  });
});
