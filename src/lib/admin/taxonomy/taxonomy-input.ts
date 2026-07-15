/**
 * PURE taxonomy parsing + validation (T11 Slice 5, AC-21/22). No I/O, no Next
 * imports — unit-testable. Brands/styles/categories/tags share the slug + name
 * discipline; categories add an optional parent + sort order. Uniqueness + cycle
 * are DB concerns (mapped from `23505`/`check_violation` in the write layer).
 */
import { isValidSlug } from "@/lib/admin/products/slug";
import {
  TAXONOMY_NAME_MAX_LENGTH,
  TAXONOMY_DESCRIPTION_MAX_LENGTH,
} from "@/lib/config";

/** The taxonomy entity kinds this module parses. */
export type TaxonomyKind = "brand" | "style" | "tag" | "category";

/** Field-error keys shared across taxonomy forms. */
export type TaxonomyFieldError =
  | "name-required"
  | "name-too-long"
  | "slug-required"
  | "slug-format"
  | "slug-duplicate"
  | "description-too-long"
  | "cycle"
  | "logo-url-invalid";

/** Per-field error map. */
export type TaxonomyFieldErrors = Partial<
  Record<"name" | "slug" | "description" | "logo_url" | "parent_id", TaxonomyFieldError>
>;

/** Raw brand/style/category/tag input (all strings). */
export interface TaxonomyRawInput {
  name: string;
  slug: string;
  description: string;
  logoUrl: string;
  isActive: boolean;
  parentId: string;
  sortOrder: string;
}

/** Parsed brand columns. */
export interface BrandParsed {
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
}

/** Parsed style columns. */
export interface StyleParsed {
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

/** Parsed tag columns. */
export interface TagParsed {
  slug: string;
  name: string;
}

/** Parsed category columns. */
export interface CategoryParsed {
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
}

/** Validate the shared name field. */
function parseName(raw: string, errors: TaxonomyFieldErrors): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    errors.name = "name-required";
    return null;
  }
  if (trimmed.length > TAXONOMY_NAME_MAX_LENGTH) {
    errors.name = "name-too-long";
    return null;
  }
  return trimmed;
}

/** Validate the shared slug field. */
function parseSlug(raw: string, errors: TaxonomyFieldErrors): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    errors.slug = "slug-required";
    return null;
  }
  if (!isValidSlug(trimmed)) {
    errors.slug = "slug-format";
    return null;
  }
  return trimmed;
}

/** Validate an optional description. */
function parseDescription(raw: string, errors: TaxonomyFieldErrors): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > TAXONOMY_DESCRIPTION_MAX_LENGTH) {
    errors.description = "description-too-long";
    return null;
  }
  return trimmed;
}

/** Validate an optional URL (logo). */
function parseLogoUrl(raw: string, errors: TaxonomyFieldErrors): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad protocol");
    return trimmed;
  } catch {
    errors.logo_url = "logo-url-invalid";
    return null;
  }
}

/** Parse a brand. */
export function parseBrand(
  raw: TaxonomyRawInput,
): { ok: true; values: BrandParsed } | { ok: false; errors: TaxonomyFieldErrors } {
  const errors: TaxonomyFieldErrors = {};
  const name = parseName(raw.name, errors);
  const slug = parseSlug(raw.slug, errors);
  const description = parseDescription(raw.description, errors);
  const logoUrl = parseLogoUrl(raw.logoUrl, errors);
  if (Object.keys(errors).length > 0 || name === null || slug === null) {
    return { ok: false, errors };
  }
  return { ok: true, values: { slug, name, description, logo_url: logoUrl, is_active: raw.isActive } };
}

/** Parse a style. */
export function parseStyle(
  raw: TaxonomyRawInput,
): { ok: true; values: StyleParsed } | { ok: false; errors: TaxonomyFieldErrors } {
  const errors: TaxonomyFieldErrors = {};
  const name = parseName(raw.name, errors);
  const slug = parseSlug(raw.slug, errors);
  const description = parseDescription(raw.description, errors);
  if (Object.keys(errors).length > 0 || name === null || slug === null) {
    return { ok: false, errors };
  }
  return { ok: true, values: { slug, name, description, is_active: raw.isActive } };
}

/** Parse a tag (name + slug only). */
export function parseTag(
  raw: TaxonomyRawInput,
): { ok: true; values: TagParsed } | { ok: false; errors: TaxonomyFieldErrors } {
  const errors: TaxonomyFieldErrors = {};
  const name = parseName(raw.name, errors);
  const slug = parseSlug(raw.slug, errors);
  if (name === null || slug === null) return { ok: false, errors };
  return { ok: true, values: { slug, name } };
}

/** Parse a category (adds parent + sort order). */
export function parseCategory(
  raw: TaxonomyRawInput,
): { ok: true; values: CategoryParsed } | { ok: false; errors: TaxonomyFieldErrors } {
  const errors: TaxonomyFieldErrors = {};
  const name = parseName(raw.name, errors);
  const slug = parseSlug(raw.slug, errors);
  const description = parseDescription(raw.description, errors);
  if (Object.keys(errors).length > 0 || name === null || slug === null) {
    return { ok: false, errors };
  }
  const sortOrder = Number.parseInt(raw.sortOrder.trim(), 10);
  return {
    ok: true,
    values: {
      slug,
      name,
      description,
      parent_id: raw.parentId.trim() === "" ? null : raw.parentId.trim(),
      is_active: raw.isActive,
      sort_order: Number.isInteger(sortOrder) ? sortOrder : 0,
    },
  };
}
