/**
 * Unit tests for the minimal ICU-token interpolation helper (T4).
 *
 * Used to fill pre-resolved, already-localized templates across the
 * server→client boundary. Must be safe: leave unknown tokens literal, handle
 * numbers, and never be susceptible to ReDoS (linear regex).
 */
import { describe, expect, it } from "vitest";
import { interpolate } from "./interpolate";

describe("interpolate", () => {
  it("replaces a single token", () => {
    expect(interpolate("Ver imagen {number}", { number: 3 })).toBe(
      "Ver imagen 3",
    );
  });

  it("replaces multiple tokens", () => {
    expect(interpolate("{count}/{max}", { count: 2, max: 5 })).toBe("2/5");
  });

  it("coerces numeric values to strings", () => {
    expect(interpolate("{count} colores", { count: 4 })).toBe("4 colores");
  });

  it("accepts string values", () => {
    expect(interpolate("Color: {name}", { name: "Negro" })).toBe(
      "Color: Negro",
    );
  });

  it("leaves an unknown token literal (never renders 'undefined')", () => {
    expect(interpolate("Hola {missing}", { other: "x" })).toBe("Hola {missing}");
  });

  it("returns the template unchanged when it has no tokens", () => {
    expect(interpolate("Sin tokens", { count: 1 })).toBe("Sin tokens");
  });

  it("replaces every occurrence of a repeated token", () => {
    expect(interpolate("{n} y {n}", { n: 7 })).toBe("7 y 7");
  });

  it("handles a value of 0 (falsy but defined)", () => {
    expect(interpolate("{count} restantes", { count: 0 })).toBe("0 restantes");
  });

  it("ignores braces that are not valid tokens", () => {
    // Non-word content inside braces is not a {token} match.
    expect(interpolate("a { b } c", { b: "x" })).toBe("a { b } c");
  });
});
