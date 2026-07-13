/**
 * Pure unit tests for the active-filter chip builder (T5 AC-14, edge 4, 12).
 *
 * `buildActiveFilterChips` is pure: given parsed filters + resolved label/chip
 * templates it produces the removable-chip view models with canonical
 * `removeHref`s (this value dropped, others + page-1 preserved). No React, no
 * i18n runtime — the caller passes resolved strings, so we assert the exact
 * chip set, keys, labels, and remove-hrefs the page will render.
 */
import { describe, expect, it } from "vitest";
import { buildActiveFilterChips, type ChipLabelContext } from "./active-filter-chips";
import { parseCatalogFilters, type KnownFacetValues } from "./search-params";
import { formatMXN } from "@/lib/money";

const known: KnownFacetValues = {
  categoryIds: new Set(["cat-oficina", "cat-gamer"]),
  brandIds: new Set(["brand-ergovita", "brand-nordika"]),
  styleIds: new Set(["style-ergonomica"]),
  colors: new Set(["#111111", "#6b7280"]),
  materials: new Set(["malla transpirable", "piel sintetica"]),
};

/** A deterministic, human-readable label context (mimics the i18n calls). */
const ctx: ChipLabelContext = {
  categoryLabel: (v) => ({ "cat-oficina": "Oficina", "cat-gamer": "Gamer" })[v] ?? v,
  brandLabel: (v) =>
    ({ "brand-ergovita": "ErgoVita", "brand-nordika": "Nórdika" })[v] ?? v,
  styleLabel: (v) => ({ "style-ergonomica": "Ergonómica" })[v] ?? v,
  colorLabel: (v) => ({ "#111111": "Negro", "#6b7280": "Gris" })[v] ?? v,
  materialLabel: (v) =>
    ({ "malla transpirable": "Malla transpirable" })[v] ?? v,
  chip: {
    query: (v) => `Búsqueda: ${v}`,
    category: (v) => `Categoría: ${v}`,
    brand: (v) => `Marca: ${v}`,
    style: (v) => `Estilo: ${v}`,
    color: (v) => `Color: ${v}`,
    material: (v) => `Material: ${v}`,
    price: (min, max) => `Precio: ${min} – ${max}`,
    outOfStock: "Incluye agotados",
  },
  removeLabel: (label) => `Quitar filtro ${label}`,
  priceFrom: (min) => `Precio: desde ${min}`,
  priceTo: (max) => `Precio: hasta ${max}`,
};

describe("buildActiveFilterChips (AC-14)", () => {
  it("produces no chips for the default (unfiltered) state", () => {
    const chips = buildActiveFilterChips(parseCatalogFilters({}, known), ctx);
    expect(chips).toEqual([]);
  });

  it("does NOT chip the default in-stock filter (it is the baseline)", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters({ marca: "brand-ergovita" }, known),
      ctx,
    );
    // Only the brand chip — no availability chip for the in-stock default.
    expect(chips.map((c) => c.key)).toEqual(["br:brand-ergovita"]);
  });

  it("chips the opt-in include-out-of-stock as its own removable chip (AC-5)", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters({ disponibilidad: "todos" }, known),
      ctx,
    );
    const oos = chips.find((c) => c.key === "disponibilidad");
    expect(oos?.label).toBe("Incluye agotados");
    // Removing it returns to the clean catalog (in-stock default, no params).
    expect(oos?.removeHref).toBe("/sillas");
  });

  it("labels a query chip and its remove href drops q, keeps other facets", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters({ q: "malla", marca: "brand-nordika" }, known),
      ctx,
    );
    const q = chips.find((c) => c.key === "q");
    expect(q?.label).toBe("Búsqueda: malla");
    expect(q?.removeLabel).toBe("Quitar filtro Búsqueda: malla");
    // Removing the query keeps the brand facet in the href.
    expect(q?.removeHref).toBe("/sillas?marca=brand-nordika");
  });

  it("emits one chip per value in a multi-select facet, each removing only itself", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters({ marca: "brand-ergovita,brand-nordika" }, known),
      ctx,
    );
    const brands = chips.filter((c) => c.key.startsWith("br:"));
    expect(brands.map((c) => c.label)).toEqual(["Marca: ErgoVita", "Marca: Nórdika"]);
    // Removing ErgoVita leaves only Nórdika in the href.
    const ergo = brands.find((c) => c.key === "br:brand-ergovita");
    expect(ergo?.removeHref).toBe("/sillas?marca=brand-nordika");
  });

  it("resolves color chip labels via the lookup (hex → color name)", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters({ color: "#111111" }, known),
      ctx,
    );
    const color = chips.find((c) => c.key.startsWith("co:"));
    expect(color?.label).toBe("Color: Negro");
  });

  it("renders a full-range price chip (both bounds) with formatted pesos", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters({ precioMin: "4000", precioMax: "9000" }, known),
      ctx,
    );
    const price = chips.find((c) => c.key === "precio");
    // 4000/9000 pesos → 400000/900000 cents → formatMXN.
    expect(price?.label).toBe(`Precio: ${formatMXN(400000)} – ${formatMXN(900000)}`);
    // Removing the price chip clears both bounds.
    expect(price?.removeHref).toBe("/sillas");
  });

  it("renders an open-ended 'desde' price chip when only min is set", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters({ precioMin: "4000" }, known),
      ctx,
    );
    const price = chips.find((c) => c.key === "precio");
    expect(price?.label).toBe(`Precio: desde ${formatMXN(400000)}`);
  });

  it("renders an open-ended 'hasta' price chip when only max is set", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters({ precioMax: "9000" }, known),
      ctx,
    );
    const price = chips.find((c) => c.key === "precio");
    expect(price?.label).toBe(`Precio: hasta ${formatMXN(900000)}`);
  });

  it("produces stable keys in a fixed facet order (query → cat → brand → style → color → material → price → oos)", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters(
        {
          q: "silla",
          categoria: "cat-oficina",
          marca: "brand-ergovita",
          estilo: "style-ergonomica",
          color: "#111111",
          material: "malla transpirable",
          precioMin: "1000",
          disponibilidad: "todos",
        },
        known,
      ),
      ctx,
    );
    expect(chips.map((c) => c.key)).toEqual([
      "q",
      "cat:cat-oficina",
      "br:brand-ergovita",
      "st:style-ergonomica",
      "co:#111111",
      "ma:malla transpirable",
      "precio",
      "disponibilidad",
    ]);
  });

  it("every chip's removeLabel wraps its own label (accessible name — AC-14)", () => {
    const chips = buildActiveFilterChips(
      parseCatalogFilters({ marca: "brand-ergovita", color: "#111111" }, known),
      ctx,
    );
    for (const chip of chips) {
      expect(chip.removeLabel).toBe(`Quitar filtro ${chip.label}`);
    }
  });
});
