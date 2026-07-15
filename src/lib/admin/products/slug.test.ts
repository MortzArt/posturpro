import { describe, expect, it } from "vitest";
import {
  slugify,
  isValidSlug,
  uniqueSlug,
  duplicateSlug,
  duplicateSku,
} from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Silla Ergo Pro")).toBe("silla-ergo-pro");
  });
  it("strips accents and ñ", () => {
    expect(slugify("Sillón Cómodo Niño")).toBe("sillon-comodo-nino");
  });
  it("collapses runs of separators and trims", () => {
    expect(slugify("  --A & B / C--  ")).toBe("a-b-c");
  });
  it("returns empty when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
  });
  it("always yields a DB-valid slug when non-empty", () => {
    for (const input of ["Foo Bar", "café 42", "A---B"]) {
      const out = slugify(input);
      if (out !== "") expect(isValidSlug(out)).toBe(true);
    }
  });
});

describe("isValidSlug", () => {
  it("accepts canonical kebab-case", () => {
    expect(isValidSlug("silla-ergo-pro")).toBe(true);
    expect(isValidSlug("abc123")).toBe(true);
  });
  it("rejects uppercase, spaces, leading/trailing/double hyphens", () => {
    expect(isValidSlug("Silla")).toBe(false);
    expect(isValidSlug("a b")).toBe(false);
    expect(isValidSlug("-a")).toBe(false);
    expect(isValidSlug("a-")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("returns the desired slug when free", () => {
    expect(uniqueSlug("foo", new Set())).toBe("foo");
  });
  it("suffixes with the first free integer", () => {
    expect(uniqueSlug("foo", new Set(["foo"]))).toBe("foo-2");
    expect(uniqueSlug("foo", new Set(["foo", "foo-2", "foo-3"]))).toBe("foo-4");
  });
});

describe("duplicateSlug", () => {
  it("appends -copia and de-dupes", () => {
    expect(duplicateSlug("silla", new Set())).toBe("silla-copia");
    expect(duplicateSlug("silla", new Set(["silla-copia"]))).toBe("silla-copia-2");
  });
  it("stays DB-valid", () => {
    expect(isValidSlug(duplicateSlug("silla-ergo", new Set()))).toBe(true);
  });
});

describe("duplicateSku", () => {
  it("appends -COPIA preserving case and de-dupes", () => {
    expect(duplicateSku("SKU-1", new Set())).toBe("SKU-1-COPIA");
    expect(duplicateSku("SKU-1", new Set(["SKU-1-COPIA"]))).toBe("SKU-1-COPIA-2");
  });
});
