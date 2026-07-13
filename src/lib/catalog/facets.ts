/**
 * Facet-option sourcing for the T5 filter panel (AC-13).
 *
 * Facet options come from REAL DB values, never hard-coded. Categories, brands,
 * and styles reuse the existing cached taxonomy reads (`listCategories`,
 * `listBrands`, `listStyles`). Colors, materials, and the price domain are read
 * here from the anon-safe surfaces (`product_variants` for colors,
 * `products_public` for materials + price). All reads are cached under the
 * `catalog` tag so they stay static/ISR and bust with the taxonomy.
 *
 * The material facet is a set of distinct material search TERMS: the three
 * `material_*` free-text columns are lowercased + unaccented and de-duplicated
 * into stable filter values that the RPC matches with a substring predicate.
 */
import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { fail } from "@/lib/catalog/read-primitives";
import { cachedRead } from "@/lib/catalog/read-primitives";
import {
  CATALOG_CACHE_TAG,
  listBrands,
  listCategories,
  listStyles,
} from "@/lib/catalog/queries";
import { normalizeColor } from "@/lib/catalog/search-params";
import type { KnownFacetValues } from "@/lib/catalog/search-params";
import type {
  CatalogCategory,
} from "@/lib/catalog/types";
import type {
  ColorFacetOption,
  FacetOption,
  FacetOptions,
} from "@/lib/catalog/search.types";

/** Fallback price domain (cents) when the catalog is empty, so the slider is sane. */
const DEFAULT_PRICE_FLOOR_CENTS = 0;
const DEFAULT_PRICE_CEIL_CENTS = 1_000_000;

/**
 * Relative luminance threshold above which a swatch is "light" (so its
 * checkmark must render dark to stay legible). sRGB luminance in `[0, 1]`.
 */
const LIGHT_SWATCH_LUMINANCE = 0.6;

/** Strip diacritics + lowercase — mirrors the RPC's `unaccent(lower(...))`. */
function unaccentLower(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** sRGB relative luminance of a `#rrggbb` hex (for check contrast on swatches). */
function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return 0;
  const channel = (start: number): number => {
    const value = Number.parseInt(clean.slice(start, start + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Distinct catalog colors as swatch options (value = lowercase `#rrggbb`). */
export function listColorFacets(): Promise<ColorFacetOption[]> {
  return cachedRead(
    ["catalog", "color-facets"],
    [CATALOG_CACHE_TAG],
    async () => {
      const db = createPublicClient();
      const { data, error } = await db
        .from("product_variants")
        .select("color_name,color_hex")
        .order("color_name", { ascending: true });
      if (error) fail("color facets", error.message);

      const byHex = new Map<string, ColorFacetOption>();
      for (const row of data ?? []) {
        const value = normalizeColor(row.color_hex);
        if (byHex.has(value)) continue;
        byHex.set(value, {
          value,
          label: row.color_name,
          hex: value,
          checkOnLight: luminance(value) > LIGHT_SWATCH_LUMINANCE,
        });
      }
      return [...byHex.values()].sort((a, b) => a.label.localeCompare(b.label));
    },
  );
}

/**
 * Distinct material facets across the three `material_*` columns. Each option's
 * `value` is the unaccented lowercase term the RPC matches; the `label` is the
 * first human-readable spelling seen for that term.
 */
export function listMaterialFacets(): Promise<FacetOption[]> {
  return cachedRead(
    ["catalog", "material-facets"],
    [CATALOG_CACHE_TAG],
    async () => {
      const db = createPublicClient();
      const { data, error } = await db
        .from("products_public")
        .select("material_frame,material_upholstery,material_finish");
      if (error) fail("material facets", error.message);

      const byTerm = new Map<string, string>();
      for (const row of data ?? []) {
        for (const raw of [
          row.material_frame,
          row.material_upholstery,
          row.material_finish,
        ]) {
          if (typeof raw !== "string" || raw.trim().length === 0) continue;
          const term = unaccentLower(raw);
          if (!byTerm.has(term)) byTerm.set(term, raw.trim());
        }
      }
      return [...byTerm.entries()]
        .map(([value, label]): FacetOption => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  );
}

/** The catalog price domain (cents) for the slider display. */
export function getPriceDomain(): Promise<{
  floorCents: number;
  ceilCents: number;
}> {
  return cachedRead(
    ["catalog", "price-domain"],
    [CATALOG_CACHE_TAG],
    async () => {
      const db = createPublicClient();
      const [minResult, maxResult] = await Promise.all([
        db
          .from("products_public")
          .select("price_cents")
          .order("price_cents", { ascending: true })
          .limit(1)
          .maybeSingle(),
        db
          .from("products_public")
          .select("price_cents")
          .order("price_cents", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (minResult.error) fail("price domain min", minResult.error.message);
      if (maxResult.error) fail("price domain max", maxResult.error.message);

      const floorCents = minResult.data?.price_cents ?? DEFAULT_PRICE_FLOOR_CENTS;
      const ceilCents = maxResult.data?.price_cents ?? DEFAULT_PRICE_CEIL_CENTS;
      return {
        floorCents,
        ceilCents: ceilCents > floorCents ? ceilCents : floorCents + 1,
      };
    },
  );
}

/** Flatten a category tree (roots + children) into a flat option list. */
function flattenCategories(tree: CatalogCategory[]): FacetOption[] {
  const out: FacetOption[] = [];
  const walk = (nodes: CatalogCategory[]): void => {
    for (const node of nodes) {
      out.push({ value: node.id, label: node.name });
      if (node.children && node.children.length > 0) walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/** All facet options plus the derived KNOWN-value sets and id→label lookups. */
export interface LoadedFacets {
  options: FacetOptions;
  known: KnownFacetValues;
  labelFor: {
    category: Map<string, string>;
    brand: Map<string, string>;
    style: Map<string, string>;
    color: Map<string, string>;
    material: Map<string, string>;
  };
}

/**
 * Load every facet option for the `/sillas` filter panel in parallel and derive
 * the KNOWN-value sets (so the parse lib can drop unknowns — edge 3) and the
 * id→label lookups (so chips read "Marca: ErgoVita" — AC-14). All source reads
 * are cached under the `catalog` tag. A facet-list read that throws propagates
 * to the page boundary (edge 10) — the panel never renders half-populated.
 */
export async function loadFacetOptions(): Promise<LoadedFacets> {
  const [categoryTree, brands, styles, colors, materials, priceDomain] =
    await Promise.all([
      listCategories(),
      listBrands(),
      listStyles(),
      listColorFacets(),
      listMaterialFacets(),
      getPriceDomain(),
    ]);

  const categories = flattenCategories(categoryTree);
  const brandOptions: FacetOption[] = brands.map((b) => ({ value: b.id, label: b.name }));
  const styleOptions: FacetOption[] = styles.map((s) => ({ value: s.id, label: s.name }));

  const options: FacetOptions = {
    categories,
    brands: brandOptions,
    styles: styleOptions,
    materials,
    colors,
    priceFloorCents: priceDomain.floorCents,
    priceCeilCents: priceDomain.ceilCents,
  };

  const labelFor = {
    category: new Map(categories.map((c) => [c.value, c.label])),
    brand: new Map(brandOptions.map((b) => [b.value, b.label])),
    style: new Map(styleOptions.map((s) => [s.value, s.label])),
    color: new Map(colors.map((c) => [c.value, c.label])),
    material: new Map(materials.map((m) => [m.value, m.label])),
  };

  const known: KnownFacetValues = {
    categoryIds: new Set(categories.map((c) => c.value)),
    brandIds: new Set(brandOptions.map((b) => b.value)),
    styleIds: new Set(styleOptions.map((s) => s.value)),
    colors: new Set(colors.map((c) => c.value)),
    materials: new Set(materials.map((m) => m.value)),
  };

  return { options, known, labelFor };
}
