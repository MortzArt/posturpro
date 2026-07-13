/**
 * Pure parse/serialize tests for the filter URL state (T5 AC-9, edges 3, 4, 7).
 * No React, no DB — exercises the defensive canonicalization directly.
 */
import { describe, expect, it } from "vitest";
import {
  hasNoFilters,
  isCacheableFilters,
  normalizeColor,
  parseCatalogFilters,
  removeFacet,
  serializeFilters,
  serializeWithout,
  type KnownFacetValues,
} from "./search-params";
import { SEARCH_QUERY_MAX } from "@/lib/config";

const known: KnownFacetValues = {
  categoryIds: new Set(["cat-oficina", "cat-gamer"]),
  brandIds: new Set(["brand-ergovita", "brand-nordika"]),
  styleIds: new Set(["style-ergonomica"]),
  colors: new Set(["#111111", "#6b7280"]),
  materials: new Set(["malla transpirable", "piel sintetica"]),
};

describe("parseCatalogFilters", () => {
  it("returns the default state for empty params", () => {
    const f = parseCatalogFilters({}, known);
    expect(f.query).toBeNull();
    expect(f.brandIds).toEqual([]);
    expect(f.inStockOnly).toBe(true);
    expect(f.sort).toBe("mas-vendidas");
    expect(hasNoFilters(f)).toBe(true);
  });

  it("trims + truncates q to SEARCH_QUERY_MAX; whitespace-only → null (AC-3)", () => {
    expect(parseCatalogFilters({ q: "  malla  " }, known).query).toBe("malla");
    expect(parseCatalogFilters({ q: "   " }, known).query).toBeNull();
    const long = "a".repeat(SEARCH_QUERY_MAX + 50);
    expect(parseCatalogFilters({ q: long }, known).query?.length).toBe(
      SEARCH_QUERY_MAX,
    );
  });

  it("drops unknown facet values, keeps known (edge 3)", () => {
    const f = parseCatalogFilters(
      { marca: "brand-ergovita,brand-nonexistent", categoria: "cat-gamer" },
      known,
    );
    expect(f.brandIds).toEqual(["brand-ergovita"]);
    expect(f.categoryIds).toEqual(["cat-gamer"]);
  });

  it("normalizes + validates colors against the catalog", () => {
    const f = parseCatalogFilters({ color: "111111,#6B7280,abcabc" }, known);
    expect(f.colors).toEqual(["#111111", "#6b7280"]);
  });

  it("de-duplicates repeated + comma-listed values", () => {
    const f = parseCatalogFilters(
      { marca: ["brand-ergovita", "brand-ergovita,brand-nordika"] },
      known,
    );
    expect(f.brandIds).toEqual(["brand-ergovita", "brand-nordika"]);
  });

  it("drops non-numeric / negative price bounds (edge 3)", () => {
    expect(parseCatalogFilters({ precioMax: "abc" }, known).priceMax).toBeNull();
    expect(parseCatalogFilters({ precioMin: "-5" }, known).priceMin).toBeNull();
    // URL price is PESOS; parser stores internal CENTS (× 100) — M-1.
    expect(parseCatalogFilters({ precioMin: "4000" }, known).priceMin).toBe(
      400000,
    );
  });

  it("price URL contract is PESOS ↔ internal CENTS, round-trips identically (M-1)", () => {
    // A native JS-off submit sends pesos in the field; the parser reads pesos and
    // stores cents, so the same bound reaches the RPC whether typed via the form
    // (JS-off) or pushed as the serialized URL (JS-on).
    const f = parseCatalogFilters(
      { precioMin: "4000", precioMax: "9000" },
      known,
    );
    expect(f.priceMin).toBe(400000); // MX$4,000 → 400000 centavos
    expect(f.priceMax).toBe(900000); // MX$9,000 → 900000 centavos
    // Serialize emits pesos again (byte-identical to what the field submits).
    expect(serializeFilters(f)).toBe("precioMin=4000&precioMax=9000");
    // And re-parsing that string yields the identical internal cents.
    const reparsed = parseCatalogFilters(
      Object.fromEntries(new URLSearchParams(serializeFilters(f))),
      known,
    );
    expect(reparsed.priceMin).toBe(f.priceMin);
    expect(reparsed.priceMax).toBe(f.priceMax);
  });

  it("drops BOTH bounds when min > max and flags priceRangeIgnored (edge 4)", () => {
    const f = parseCatalogFilters(
      { precioMin: "500000", precioMax: "100000" },
      known,
    );
    expect(f.priceMin).toBeNull();
    expect(f.priceMax).toBeNull();
    expect(f.priceRangeIgnored).toBe(true);
  });

  it("falls back to default sort on an unknown/hostile orden (edge 3)", () => {
    expect(parseCatalogFilters({ orden: "DROP TABLE" }, known).sort).toBe(
      "mas-vendidas",
    );
    expect(parseCatalogFilters({ orden: "precio-asc" }, known).sort).toBe(
      "precio-asc",
    );
  });

  it("includes out-of-stock only when disponibilidad=todos (AC-5)", () => {
    expect(parseCatalogFilters({}, known).inStockOnly).toBe(true);
    expect(
      parseCatalogFilters({ disponibilidad: "todos" }, known).inStockOnly,
    ).toBe(false);
  });
});

describe("serializeFilters", () => {
  it("omits defaults and produces a deterministic string (AC-9)", () => {
    const f = parseCatalogFilters(
      { q: "malla", marca: "brand-nordika,brand-ergovita", orden: "precio-asc" },
      known,
    );
    // brands sorted → ergovita before nordika; params in canonical order
    expect(serializeFilters(f)).toBe(
      "q=malla&marca=brand-ergovita%2Cbrand-nordika&orden=precio-asc",
    );
  });

  it("round-trips through parse (serialize canonicalizes value order)", () => {
    // Input color order is not canonical; serialize sorts it. Re-serializing the
    // reparsed result must be a fixed point (stable canonical form).
    const original = parseCatalogFilters(
      { color: "#6b7280,#111111", precioMin: "200000", disponibilidad: "todos" },
      known,
    );
    const serialized = serializeFilters(original);
    const params = Object.fromEntries(new URLSearchParams(serialized));
    const reparsed = parseCatalogFilters(params, known);
    expect(serializeFilters(reparsed)).toBe(serialized);
    expect(reparsed.colors.sort()).toEqual(original.colors.sort());
    expect(reparsed.priceMin).toBe(original.priceMin);
    expect(reparsed.inStockOnly).toBe(original.inStockOnly);
  });

  it("emits nothing for the default state", () => {
    expect(serializeFilters(parseCatalogFilters({}, known))).toBe("");
  });
});

describe("removeFacet / serializeWithout", () => {
  it("removes one brand value, preserving others", () => {
    const f = parseCatalogFilters(
      { marca: "brand-ergovita,brand-nordika" },
      known,
    );
    const next = removeFacet(f, "marca", "brand-ergovita");
    expect(next.brandIds).toEqual(["brand-nordika"]);
  });

  it("clears the whole price facet and query", () => {
    const f = parseCatalogFilters({ q: "x", precioMin: "100000" }, known);
    expect(removeFacet(f, "precio").priceMin).toBeNull();
    expect(removeFacet(f, "query").query).toBeNull();
  });

  it("serializeWithout drops the removed facet from the string", () => {
    const f = parseCatalogFilters({ q: "malla", marca: "brand-nordika" }, known);
    expect(serializeWithout(f, "query")).toBe("marca=brand-nordika");
  });
});

describe("isCacheableFilters (Constraint 3)", () => {
  it("is false when q present, true otherwise", () => {
    expect(isCacheableFilters(parseCatalogFilters({ q: "x" }, known))).toBe(false);
    expect(
      isCacheableFilters(parseCatalogFilters({ marca: "brand-nordika" }, known)),
    ).toBe(true);
  });
});

describe("normalizeColor", () => {
  it("lowercases and ensures a single leading #", () => {
    expect(normalizeColor("111111")).toBe("#111111");
    expect(normalizeColor("#6B7280")).toBe("#6b7280");
  });
});

describe("hostile / adversarial inputs (edge 3) — never 500, never empty the catalog", () => {
  it("drops a <script> color token (unknown → not sent to the RPC)", () => {
    const f = parseCatalogFilters({ color: "<script>alert(1)</script>" }, known);
    expect(f.colors).toEqual([]);
  });

  it("drops an injection-shaped sort but keeps valid remaining filters", () => {
    const f = parseCatalogFilters(
      { orden: "DROP TABLE products;--", marca: "brand-ergovita" },
      known,
    );
    expect(f.sort).toBe("mas-vendidas"); // unknown → default
    expect(f.brandIds).toEqual(["brand-ergovita"]); // valid filter survives
  });

  it("truncates a 10KB query to SEARCH_QUERY_MAX (DoS length cap, Constraint 3)", () => {
    const huge = "a".repeat(10_000);
    const f = parseCatalogFilters({ q: huge }, known);
    expect(f.query?.length).toBe(SEARCH_QUERY_MAX);
  });

  it("uses only the FIRST value of a repeated scalar param (?orden=a&orden=b)", () => {
    const f = parseCatalogFilters(
      { orden: ["precio-asc", "precio-desc"] },
      known,
    );
    expect(f.sort).toBe("precio-asc");
  });

  it("treats an empty ?marca= as no constraint (not an error)", () => {
    const f = parseCatalogFilters({ marca: "" }, known);
    expect(f.brandIds).toEqual([]);
    expect(hasNoFilters(f)).toBe(true);
  });

  it("drops every unknown facet value, yielding the unfiltered catalog (never empties)", () => {
    const f = parseCatalogFilters(
      {
        marca: "ghost-a,ghost-b",
        categoria: "nope",
        estilo: "nope",
        color: "#ffffff", // not a catalog color
        material: "unobtanium",
      },
      known,
    );
    expect(f.brandIds).toEqual([]);
    expect(f.categoryIds).toEqual([]);
    expect(f.styleIds).toEqual([]);
    expect(f.colors).toEqual([]);
    expect(f.materials).toEqual([]);
    // All bad params dropped → behaves like the default catalog view.
    expect(hasNoFilters(f)).toBe(true);
  });

  it("preserves unicode/accents in the raw query (unaccenting happens in the RPC)", () => {
    const f = parseCatalogFilters({ q: "Ergonómica café ñ" }, known);
    expect(f.query).toBe("Ergonómica café ñ");
  });

  it("drops a non-numeric price bound but keeps a valid opposite bound", () => {
    const f = parseCatalogFilters({ precioMin: "abc", precioMax: "5000" }, known);
    expect(f.priceMin).toBeNull();
    expect(f.priceMax).toBe(500_000); // 5000 pesos → 500000 cents
  });

  it("drops a price bound over PRICE_BOUND_MAX_CENTS (absurd value, edge 3)", () => {
    // PRICE_BOUND_MAX_CENTS = 100_000_000 cents → 1_000_000 pesos. One peso over.
    const f = parseCatalogFilters({ precioMin: "1000001" }, known);
    expect(f.priceMin).toBeNull();
  });

  it("drops a float / decimal price string (only whole-peso integers accepted)", () => {
    expect(parseCatalogFilters({ precioMin: "40.5" }, known).priceMin).toBeNull();
    expect(parseCatalogFilters({ precioMin: "4e3" }, known).priceMin).toBeNull();
  });

  it("does not treat priceMin === priceMax as inverted (exact-match band is valid)", () => {
    const f = parseCatalogFilters(
      { precioMin: "5000", precioMax: "5000" },
      known,
    );
    expect(f.priceMin).toBe(500_000);
    expect(f.priceMax).toBe(500_000);
    expect(f.priceRangeIgnored).toBe(false);
  });

  it("only opts into out-of-stock for the exact 'todos' value (anything else = in-stock)", () => {
    expect(parseCatalogFilters({ disponibilidad: "all" }, known).inStockOnly).toBe(true);
    expect(parseCatalogFilters({ disponibilidad: "TODOS" }, known).inStockOnly).toBe(true);
    expect(parseCatalogFilters({ disponibilidad: "todos" }, known).inStockOnly).toBe(false);
  });

  it("serialize is byte-stable across a parse→serialize→parse→serialize cycle for a hostile mix", () => {
    const first = serializeFilters(
      parseCatalogFilters(
        {
          q: "  malla  ",
          marca: ["brand-nordika", "brand-ergovita", "ghost"],
          color: "#6B7280,#111111,#ffffff",
          orden: "precio-desc",
          precioMin: "1000",
          disponibilidad: "todos",
        },
        known,
      ),
    );
    const second = serializeFilters(
      parseCatalogFilters(
        Object.fromEntries(new URLSearchParams(first)),
        known,
      ),
    );
    expect(second).toBe(first);
  });
});
