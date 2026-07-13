/**
 * Build the active-filter chip view models for `/sillas` (T5 AC-14).
 *
 * Pure: given the parsed filters, the facet label lookups, and pre-resolved
 * chip-label templates, it produces `ActiveFilterChip[]` — each with a
 * canonical `removeHref` (this facet value dropped, others + page-1 preserved).
 * The default in-stock filter is NOT a chip (it's the baseline); only the opt-in
 * "include out of stock" shows one. No React, no i18n runtime — the caller
 * passes resolved strings so this stays unit-testable.
 */
import { CATALOG_PATH } from "@/lib/config";
import { formatMXN } from "@/lib/money";
import { serializeWithout } from "@/lib/catalog/search-params";
import type { ActiveFilterChip } from "@/components/catalog/active-filters";
import type { CatalogFilters } from "@/lib/catalog/search.types";

/** A value→label lookup for a facet (id/term → display name). */
export type LabelLookup = (value: string) => string;

/** Pre-resolved chip label templates + lookups the builder needs. */
export interface ChipLabelContext {
  /** `(label) => "Categoría: {label}"` style prefixers. */
  categoryLabel: LabelLookup;
  brandLabel: LabelLookup;
  styleLabel: LabelLookup;
  colorLabel: LabelLookup;
  materialLabel: LabelLookup;
  /** `(text) => "Categoría: <text>"` etc. */
  chip: {
    query: (value: string) => string;
    category: (value: string) => string;
    brand: (value: string) => string;
    style: (value: string) => string;
    color: (value: string) => string;
    material: (value: string) => string;
    price: (min: string, max: string) => string;
    outOfStock: string;
  };
  /** `(label) => "Quitar filtro {label}"`. */
  removeLabel: (label: string) => string;
  /** Open-ended price wording, e.g. "desde {min}" / "hasta {max}". */
  priceFrom: (min: string) => string;
  priceTo: (max: string) => string;
}

/** Build the `?...` href for the state with one facet value removed (page → 1). */
function hrefWithout(
  filters: CatalogFilters,
  facet: Parameters<typeof serializeWithout>[1],
  value?: string,
): string {
  const query = serializeWithout(filters, facet, value);
  return query ? `${CATALOG_PATH}?${query}` : CATALOG_PATH;
}

/** Push a chip for each value in a multi-select facet. */
function pushMulti(
  chips: ActiveFilterChip[],
  filters: CatalogFilters,
  values: string[],
  facet: "categoria" | "marca" | "estilo" | "color" | "material",
  keyPrefix: string,
  label: LabelLookup,
  text: (value: string) => string,
  removeLabel: (label: string) => string,
): void {
  for (const value of values) {
    const chipText = text(label(value));
    chips.push({
      key: `${keyPrefix}:${value}`,
      label: chipText,
      removeHref: hrefWithout(filters, facet, value),
      removeLabel: removeLabel(chipText),
    });
  }
}

/** Human-readable price chip text (handles open-ended bounds — Open Question 6). */
function priceChipText(
  filters: CatalogFilters,
  ctx: ChipLabelContext,
): string {
  const min = filters.priceMin;
  const max = filters.priceMax;
  if (min !== null && max !== null) return ctx.chip.price(formatMXN(min), formatMXN(max));
  if (min !== null) return ctx.priceFrom(formatMXN(min));
  return ctx.priceTo(formatMXN(max as number));
}

/** Build every active-filter chip for the current filter state (AC-14). */
export function buildActiveFilterChips(
  filters: CatalogFilters,
  ctx: ChipLabelContext,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (filters.query !== null) {
    const text = ctx.chip.query(filters.query);
    chips.push({
      key: "q",
      label: text,
      removeHref: hrefWithout(filters, "query"),
      removeLabel: ctx.removeLabel(text),
    });
  }

  pushMulti(chips, filters, filters.categoryIds, "categoria", "cat", ctx.categoryLabel, ctx.chip.category, ctx.removeLabel);
  pushMulti(chips, filters, filters.brandIds, "marca", "br", ctx.brandLabel, ctx.chip.brand, ctx.removeLabel);
  pushMulti(chips, filters, filters.styleIds, "estilo", "st", ctx.styleLabel, ctx.chip.style, ctx.removeLabel);
  pushMulti(chips, filters, filters.colors, "color", "co", ctx.colorLabel, ctx.chip.color, ctx.removeLabel);
  pushMulti(chips, filters, filters.materials, "material", "ma", ctx.materialLabel, ctx.chip.material, ctx.removeLabel);

  if (filters.priceMin !== null || filters.priceMax !== null) {
    const text = priceChipText(filters, ctx);
    chips.push({
      key: "precio",
      label: text,
      removeHref: hrefWithout(filters, "precio"),
      removeLabel: ctx.removeLabel(text),
    });
  }

  // The default in-stock filter is baseline (no chip); only the opt-in shows one.
  if (!filters.inStockOnly) {
    chips.push({
      key: "disponibilidad",
      label: ctx.chip.outOfStock,
      removeHref: hrefWithout(filters, "disponibilidad"),
      removeLabel: ctx.removeLabel(ctx.chip.outOfStock),
    });
  }

  return chips;
}
