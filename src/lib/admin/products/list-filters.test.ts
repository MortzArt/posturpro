import { describe, expect, it } from "vitest";
import {
  parseListFilters,
  hasActiveFilters,
  buildListQueryString,
  ADMIN_SEARCH_MAX_LENGTH,
} from "./list-filters";

describe("parseListFilters", () => {
  it("defaults to an empty/all filter set", () => {
    expect(parseListFilters({})).toEqual({
      search: "",
      brandId: null,
      categoryId: null,
      status: "all",
      stock: "all",
      rawPage: "",
    });
  });
  it("parses and bounds each field", () => {
    const parsed = parseListFilters({
      search: "  Silla  ",
      brand: "11111111-1111-1111-1111-111111111111",
      status: "draft",
      stock: "in-stock",
      page: "3",
    });
    expect(parsed.search).toBe("Silla");
    expect(parsed.brandId).toBe("11111111-1111-1111-1111-111111111111");
    expect(parsed.status).toBe("draft");
    expect(parsed.stock).toBe("in-stock");
    expect(parsed.rawPage).toBe("3");
  });
  it("rejects junk status/stock/id to safe defaults", () => {
    const parsed = parseListFilters({ status: "hacked", stock: "xyz", brand: "no" });
    expect(parsed.status).toBe("all");
    expect(parsed.stock).toBe("all");
    expect(parsed.brandId).toBeNull();
  });
  it("truncates an over-long search term", () => {
    const long = "a".repeat(ADMIN_SEARCH_MAX_LENGTH + 50);
    expect(parseListFilters({ search: long }).search.length).toBe(ADMIN_SEARCH_MAX_LENGTH);
  });
  it("takes the first value of a repeated param", () => {
    expect(parseListFilters({ status: ["active", "draft"] }).status).toBe("active");
  });
});

describe("hasActiveFilters", () => {
  it("is false for the default set", () => {
    expect(hasActiveFilters(parseListFilters({}))).toBe(false);
  });
  it("is true when any filter is set", () => {
    expect(hasActiveFilters(parseListFilters({ search: "x" }))).toBe(true);
    expect(hasActiveFilters(parseListFilters({ status: "active" }))).toBe(true);
  });
});

describe("buildListQueryString", () => {
  it("omits defaults and page 1", () => {
    expect(buildListQueryString(parseListFilters({}), { page: 1 })).toBe("");
  });
  it("preserves active filters and page > 1", () => {
    const filters = parseListFilters({ search: "silla", status: "active" });
    const query = buildListQueryString(filters, { page: 3 });
    expect(query).toContain("search=silla");
    expect(query).toContain("status=active");
    expect(query).toContain("page=3");
  });
});
