/**
 * Admin taxonomy reads (T11). LIVE (uncached) admin-client reads of brands,
 * categories, styles, tags — used to populate the product-form selects, the
 * list filters, and the taxonomy manager. Sees inactive rows too (the operator
 * manages them). `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** A minimal option for a select (id + label). */
export interface TaxonomyOption {
  value: string;
  label: string;
}

/** A category option carrying depth so the select can indent by nesting. */
export interface CategoryOption extends TaxonomyOption {
  parentId: string | null;
  depth: number;
}

/** Full brand row for the taxonomy manager table. */
export interface BrandRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  isActive: boolean;
}

/** Full style row for the taxonomy manager table. */
export interface StyleRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

/** Full tag row for the taxonomy manager table. */
export interface TagRow {
  id: string;
  slug: string;
  name: string;
}

/** Full category row (for the tree) with parent + sort + active. */
export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** List brands ordered by name (all, incl. inactive). */
export async function listBrands(db = createAdminClient()): Promise<BrandRow[]> {
  const { data, error } = await db
    .from("brands")
    .select("id, slug, name, description, logo_url, is_active")
    .order("name", { ascending: true });
  if (error) throw new Error(`[admin-taxonomy] brands failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    logoUrl: row.logo_url,
    isActive: row.is_active,
  }));
}

/** List styles ordered by name. */
export async function listStyles(db = createAdminClient()): Promise<StyleRow[]> {
  const { data, error } = await db
    .from("styles")
    .select("id, slug, name, description, is_active")
    .order("name", { ascending: true });
  if (error) throw new Error(`[admin-taxonomy] styles failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
  }));
}

/** List tags ordered by name. */
export async function listTags(db = createAdminClient()): Promise<TagRow[]> {
  const { data, error } = await db
    .from("tags")
    .select("id, slug, name")
    .order("name", { ascending: true });
  if (error) throw new Error(`[admin-taxonomy] tags failed: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, slug: row.slug, name: row.name }));
}

/** List categories (raw rows) ordered by sort_order then name. */
export async function listCategories(db = createAdminClient()): Promise<CategoryRow[]> {
  const { data, error } = await db
    .from("categories")
    .select("id, slug, name, description, parent_id, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`[admin-taxonomy] categories failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentId: row.parent_id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }));
}

/** Brand options for a select. */
export async function listBrandOptions(db?: AdminClient): Promise<TaxonomyOption[]> {
  const brands = await listBrands(db);
  return brands.map((brand) => ({ value: brand.id, label: brand.name }));
}

/** Style options for a select. */
export async function listStyleOptions(db?: AdminClient): Promise<TaxonomyOption[]> {
  const styles = await listStyles(db);
  return styles.map((style) => ({ value: style.id, label: style.name }));
}

/**
 * Category options flattened depth-first with a computed depth, so a select can
 * indent by nesting. Cycles cannot exist (DB trigger), so a simple recursive
 * walk terminates.
 */
export async function listCategoryOptions(db?: AdminClient): Promise<CategoryOption[]> {
  const categories = await listCategories(db);
  return flattenCategoryTree(categories);
}

/** Depth-first flatten of category rows into indented options. */
export function flattenCategoryTree(categories: CategoryRow[]): CategoryOption[] {
  const byParent = new Map<string | null, CategoryRow[]>();
  for (const category of categories) {
    const bucket = byParent.get(category.parentId) ?? [];
    bucket.push(category);
    byParent.set(category.parentId, bucket);
  }
  const options: CategoryOption[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const category of byParent.get(parentId) ?? []) {
      options.push({
        value: category.id,
        label: category.name,
        parentId: category.parentId,
        depth,
      });
      walk(category.id, depth + 1);
    }
  };
  walk(null, 0);
  return options;
}
