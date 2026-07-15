/**
 * Taxonomy write layer (T11 Slice 5, AC-21..24). CRUD for brands/styles/tags/
 * categories via the admin client. Maps `23505` → slug-duplicate, the category
 * `check_violation` (cycle/self-parent trigger) → a friendly `cycle` error, and
 * the `on delete restrict` FK error on a child-bearing category → a restrict
 * result. Busts `catalog` + the touched entity slug tags. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bustCatalogTags,
  brandCacheTag,
  styleCacheTag,
  categoryCacheTag,
} from "@/lib/admin/products/cache-tags";
import type {
  BrandParsed,
  StyleParsed,
  TagParsed,
  CategoryParsed,
  TaxonomyFieldError,
} from "@/lib/admin/taxonomy/taxonomy-input";

type AdminClient = ReturnType<typeof createAdminClient>;

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FK_VIOLATION = "23503";
/** The RAISE errcode the categories_no_cycle trigger uses. */
const RAISE_CHECK = "P0001";

/** Which taxonomy table a write targets. */
export type TaxonomyTable = "brands" | "styles" | "tags" | "categories";

/** Outcome of a taxonomy write (never leaks a raw PG error). */
export type TaxonomyWriteResult =
  | { ok: true }
  | { ok: false; reason: "field"; error: TaxonomyFieldError }
  | { ok: false; reason: "restrict" }
  | { ok: false; reason: "write-failed" };

/** Bust the tag for a single entity + the broad catalog tag. */
function bustEntity(table: TaxonomyTable, slug: string): void {
  const map: Record<TaxonomyTable, string[]> = {
    brands: [brandCacheTag(slug)],
    styles: [styleCacheTag(slug)],
    categories: [categoryCacheTag(slug)],
    tags: [],
  };
  bustCatalogTags({
    brandSlugs: table === "brands" ? [slug] : [],
    styleSlugs: table === "styles" ? [slug] : [],
    categorySlugs: table === "categories" ? [slug] : [],
  });
  void map;
}

/** Map a PG error onto the taxonomy write enum. */
function mapError(error: { code?: string; message: string }): TaxonomyWriteResult {
  if (error.code === UNIQUE_VIOLATION) {
    return { ok: false, reason: "field", error: "slug-duplicate" };
  }
  if (error.code === CHECK_VIOLATION || error.code === RAISE_CHECK || /ancestro|cycle/i.test(error.message)) {
    return { ok: false, reason: "field", error: "cycle" };
  }
  if (error.code === FK_VIOLATION) {
    return { ok: false, reason: "restrict" };
  }
  console.error(`[taxonomy-write] failed: ${error.message}`);
  return { ok: false, reason: "write-failed" };
}

/** Create or update a brand. */
export async function saveBrand(
  id: string | null,
  values: BrandParsed,
): Promise<TaxonomyWriteResult> {
  const db = createAdminClient();
  const { error } = id
    ? await db.from("brands").update(values).eq("id", id)
    : await db.from("brands").insert(values);
  if (error) return mapError(error);
  bustEntity("brands", values.slug);
  return { ok: true };
}

/** Create or update a style. */
export async function saveStyle(
  id: string | null,
  values: StyleParsed,
): Promise<TaxonomyWriteResult> {
  const db = createAdminClient();
  const { error } = id
    ? await db.from("styles").update(values).eq("id", id)
    : await db.from("styles").insert(values);
  if (error) return mapError(error);
  bustEntity("styles", values.slug);
  return { ok: true };
}

/** Create or update a tag. */
export async function saveTag(id: string | null, values: TagParsed): Promise<TaxonomyWriteResult> {
  const db = createAdminClient();
  const { error } = id
    ? await db.from("tags").update(values).eq("id", id)
    : await db.from("tags").insert(values);
  if (error) return mapError(error);
  bustCatalogTags();
  return { ok: true };
}

/** Create or update a category (parent + cycle handling). */
export async function saveCategory(
  id: string | null,
  values: CategoryParsed,
): Promise<TaxonomyWriteResult> {
  const db = createAdminClient();
  // Self-parent guard (also enforced by the DB CHECK) — clearer error here.
  if (id && values.parent_id === id) {
    return { ok: false, reason: "field", error: "cycle" };
  }
  const { error } = id
    ? await db.from("categories").update(values).eq("id", id)
    : await db.from("categories").insert(values);
  if (error) return mapError(error);
  bustEntity("categories", values.slug);
  return { ok: true };
}

/** Toggle is_active on a brand/style/category and bust its tag. */
export async function setTaxonomyActive(
  table: "brands" | "styles" | "categories",
  id: string,
  isActive: boolean,
): Promise<TaxonomyWriteResult> {
  const db = createAdminClient();
  const { data, error } = await db
    .from(table)
    .update({ is_active: isActive })
    .eq("id", id)
    .select("slug")
    .single();
  if (error) return mapError(error);
  bustEntity(table, data.slug);
  return { ok: true };
}

/** Delete a taxonomy row; a child-bearing category FK error → restrict. */
export async function deleteTaxonomy(
  table: TaxonomyTable,
  id: string,
): Promise<TaxonomyWriteResult> {
  const db = createAdminClient();
  const { data, error } = await db.from(table).delete().eq("id", id).select("slug").maybeSingle();
  if (error) return mapError(error);
  if (data) bustEntity(table, data.slug);
  else bustCatalogTags();
  return { ok: true };
}

/** Count a category's children (client-side pre-check before delete). */
export async function countCategoryChildren(db: AdminClient, categoryId: string): Promise<number> {
  const { count } = await db
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", categoryId);
  return count ?? 0;
}
