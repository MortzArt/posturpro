/**
 * Product detail (PDP) view models (T4).
 *
 * These are the STITCHED shapes `getProduct` (`product-detail.ts`) returns after
 * reading `products_public` + the separately-batched image / variant / question
 * children. The PDP page and its components consume ONLY these types, never the
 * raw Supabase rows — so the read strategy stays an implementation detail and no
 * `cost_price_cents`-bearing shape can ever escape (AC-16, read from the view
 * which structurally omits it).
 */
import type { StockState } from "@/lib/catalog/types";

/**
 * One product image, resolved for the gallery. `variantId === null` marks a
 * SHARED image used as the fallback set when a selected variant has none
 * (AC-7). Order is deterministic: `is_primary desc, sort_order asc, id`.
 */
export interface ProductImageView {
  id: string;
  url: string;
  /** `alt_text` from the DB, or `null` → the gallery falls back to the name. */
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  /** The variant this image belongs to, or `null` for a shared product image. */
  variantId: string | null;
}

/**
 * One color variant. Effective price = `priceOverrideCents ?? product.priceCents`
 * (computed by the pure helper in `variant-selection.ts`). Order is deterministic:
 * `sort_order asc, id`.
 */
export interface ProductVariantView {
  id: string;
  colorName: string;
  /** Hex swatch color, or `null` → the swatch renders a neutral `bg-muted`. */
  colorHex: string | null;
  priceOverrideCents: number | null;
  stock: number;
  sortOrder: number;
}

/**
 * One PUBLISHED question + its answer (AC-13). Only `is_published = true` rows
 * reach this shape. Timestamps are carried but NOT displayed in Phase 1
 * (design Open Question #4 — hidden to avoid a locale date-format dependency).
 */
export interface ProductQuestionView {
  id: string;
  authorName: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
}

/**
 * A single spec row for the definition list (AC-10). `value` is already
 * formatted for display ("60 cm" / "15 kg" / "Malla"); null specs are OMITTED
 * upstream, so every row here is renderable.
 */
export interface SpecRow {
  /** Stable key for React (`width`, `weight`, `frameMaterial`, …). */
  key: string;
  label: string;
  value: string;
}

/**
 * The full PDP view model — everything the page needs from one `getProduct`
 * call. Contains no raw DB row and no cost data.
 */
export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brandName: string | null;
  priceCents: number;
  /** Struck original — only render when present AND `> effectivePrice`. */
  compareAtPriceCents: number | null;
  /** Product-level stock (the no-variant fallback). */
  stock: number;
  /** Effective stock state at the product level (variants summed when present). */
  stockState: StockState;
  variants: ProductVariantView[];
  images: ProductImageView[];
  questions: ProductQuestionView[];
  /** Raw spec fields (mm / g / text) — the page formats them via `buildSpecRows`. */
  specs: {
    widthMm: number | null;
    depthMm: number | null;
    heightMm: number | null;
    seatHeightMm: number | null;
    weightG: number | null;
    materialFrame: string | null;
    materialUpholstery: string | null;
    materialFinish: string | null;
  };
}
