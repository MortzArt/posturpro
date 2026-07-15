import { describe, expect, it } from "vitest";
import { parseBrand, parseStyle, parseTag, parseCategory, type TaxonomyRawInput } from "./taxonomy-input";

function raw(overrides: Partial<TaxonomyRawInput> = {}): TaxonomyRawInput {
  return {
    name: "Marca X",
    slug: "marca-x",
    description: "",
    logoUrl: "",
    isActive: true,
    parentId: "",
    sortOrder: "0",
    ...overrides,
  };
}

describe("parseBrand", () => {
  it("accepts a valid brand", () => {
    const result = parseBrand(raw({ description: "Buena", logoUrl: "https://x.com/logo.png" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.slug).toBe("marca-x");
    expect(result.values.logo_url).toBe("https://x.com/logo.png");
  });
  it("requires name + slug and rejects bad slug/url", () => {
    const missing = parseBrand(raw({ name: "", slug: "" }));
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors.name).toBe("name-required");
    expect(missing.errors.slug).toBe("slug-required");

    const badSlug = parseBrand(raw({ slug: "Bad Slug" }));
    expect(badSlug.ok).toBe(false);
    if (badSlug.ok) return;
    expect(badSlug.errors.slug).toBe("slug-format");

    const badUrl = parseBrand(raw({ logoUrl: "not a url" }));
    expect(badUrl.ok).toBe(false);
    if (badUrl.ok) return;
    expect(badUrl.errors.logo_url).toBe("logo-url-invalid");
  });
});

describe("parseStyle / parseTag", () => {
  it("style parses name+slug+description+active", () => {
    const result = parseStyle(raw({ isActive: false }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.is_active).toBe(false);
  });
  it("tag parses only name+slug", () => {
    const result = parseTag(raw());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toEqual({ slug: "marca-x", name: "Marca X" });
  });
});

describe("parseCategory", () => {
  it("parses parent + sort order", () => {
    const result = parseCategory(raw({ parentId: "abc", sortOrder: "5" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.parent_id).toBe("abc");
    expect(result.values.sort_order).toBe(5);
  });
  it("empty parent → null root, junk sort → 0", () => {
    const result = parseCategory(raw({ parentId: "", sortOrder: "abc" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.parent_id).toBeNull();
    expect(result.values.sort_order).toBe(0);
  });
});
