/**
 * Non-secret admin product-management tunables (T11). Single-sourced here
 * (Rule 4) so the list pagination, image-upload limits, CSV bounds, storage
 * bucket id, and adjustment-reason bound never drift across the read layer,
 * write layer, actions, and components. No magic values leak into JSX/actions.
 *
 * Next-import-free + non-secret, so it is safe to import from server actions,
 * server components, and client components alike (component-side is limits
 * only — never the secret client). Money is INTEGER cents elsewhere; these are
 * counts / bytes / lengths.
 */

/**
 * Products per page in the admin list (AC-7). Larger than the storefront's 12
 * because the operator scans many rows; still bounded so an uncached filtered
 * read stays fast on the 0011 indexes.
 */
export const ADMIN_PRODUCTS_PER_PAGE = 25;

/** Inventory-adjustment ledger rows per page in the history view. */
export const ADMIN_LEDGER_PER_PAGE = 20;

/** Max debounce for the list search box before pushing to the URL (ms). */
export const ADMIN_SEARCH_DEBOUNCE_MS = 300;

/**
 * Allowed image MIME types for product uploads (AC-14). The server re-validates
 * against this exact set — never trusts the client `accept` attribute.
 */
export const PRODUCT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** File extension per allowed MIME (for the non-guessable storage path). */
export const PRODUCT_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Max image size in bytes (5 MB, AC-14). Client pre-validates; server enforces. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** The public-read Supabase Storage bucket product images live in (0011). */
export const PRODUCT_IMAGES_BUCKET = "product-images" as const;

/** Max rows a single CSV import will accept before rejecting the file (AC-32). */
export const CSV_MAX_ROWS = 5_000;

/** Max bytes a single CSV upload will accept (guards memory; ~5 MB of text). */
export const CSV_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Adjustment-reason length bound (AC-25). Matches the DB CHECK
 * `char_length(btrim(reason)) between 1 and 500` in migration 0011.
 */
export const ADJUSTMENT_REASON_MAX_LENGTH = 500;

/** Q&A answer length bound (AC-28). Matches the DB CHECK `1..5000` (0004). */
export const QA_ANSWER_MAX_LENGTH = 5000;

/** Product/entity free-text field bounds (match the 0002/0006 DB CHECKs). */
export const PRODUCT_NAME_MAX_LENGTH = 300;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 20_000;
export const TAXONOMY_NAME_MAX_LENGTH = 200;
export const TAXONOMY_DESCRIPTION_MAX_LENGTH = 5000;
export const MATERIAL_MAX_LENGTH = 300;
export const VARIANT_COLOR_NAME_MAX_LENGTH = 120;

/** Slug format shared with the DB CHECK `^[a-z0-9]+(-[a-z0-9]+)*$` (0006). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Color-hex format shared with the DB CHECK `^#[0-9A-Fa-f]{6}$` (0002). */
export const COLOR_HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** The CSV column header set (documented import/export contract, AC-29/30). */
export const CSV_COLUMNS = [
  "slug",
  "sku",
  "name",
  "description",
  "brand_slug",
  "style_slug",
  "category_slugs",
  "tag_slugs",
  "price",
  "compare_at_price",
  "cost_price",
  "stock",
  "status",
  "width_cm",
  "depth_cm",
  "height_cm",
  "seat_height_cm",
  "weight_kg",
  "material_frame",
  "material_upholstery",
  "material_finish",
] as const;

/** Columns a valid import file MUST contain (a missing one aborts, AC-32). */
export const CSV_REQUIRED_COLUMNS = ["sku", "name", "price"] as const;
