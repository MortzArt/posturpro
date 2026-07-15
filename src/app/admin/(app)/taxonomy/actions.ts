"use server";

/**
 * Taxonomy server actions (T11 Slice 5). Re-verify the session, parse via the
 * pure taxonomy parsers, then write. Return serializable results (field error /
 * restrict / write-failed) the client dialogs render. Only async exports (state
 * types live in `taxonomy-form-state.ts`).
 */
import { requireSession } from "@/lib/admin/require-session";
import {
  parseBrand,
  parseStyle,
  parseTag,
  parseCategory,
  type TaxonomyRawInput,
} from "@/lib/admin/taxonomy/taxonomy-input";
import {
  saveBrand,
  saveStyle,
  saveTag,
  saveCategory,
  setTaxonomyActive,
  deleteTaxonomy,
  type TaxonomyTable,
  type TaxonomyWriteResult,
} from "@/lib/admin/taxonomy/taxonomy-write";

/** Read the shared taxonomy fields from FormData. */
function readRaw(formData: FormData): TaxonomyRawInput {
  const str = (key: string): string => String(formData.get(key) ?? "");
  return {
    name: str("name"),
    slug: str("slug"),
    description: str("description"),
    logoUrl: str("logo_url"),
    isActive: formData.get("is_active") === "true",
    parentId: str("parent_id"),
    sortOrder: str("sort_order"),
  };
}

/** Save (create/update) a brand. `id` empty → create. */
export async function saveBrandAction(id: string, formData: FormData): Promise<TaxonomyWriteResult> {
  await requireSession();
  const parsed = parseBrand(readRaw(formData));
  if (!parsed.ok) return { ok: false, reason: "field", error: firstError(parsed.errors) };
  return saveBrand(id || null, parsed.values);
}

/** Save (create/update) a style. */
export async function saveStyleAction(id: string, formData: FormData): Promise<TaxonomyWriteResult> {
  await requireSession();
  const parsed = parseStyle(readRaw(formData));
  if (!parsed.ok) return { ok: false, reason: "field", error: firstError(parsed.errors) };
  return saveStyle(id || null, parsed.values);
}

/** Save (create/update) a tag. */
export async function saveTagAction(id: string, formData: FormData): Promise<TaxonomyWriteResult> {
  await requireSession();
  const parsed = parseTag(readRaw(formData));
  if (!parsed.ok) return { ok: false, reason: "field", error: firstError(parsed.errors) };
  return saveTag(id || null, parsed.values);
}

/** Save (create/update) a category. */
export async function saveCategoryAction(id: string, formData: FormData): Promise<TaxonomyWriteResult> {
  await requireSession();
  const parsed = parseCategory(readRaw(formData));
  if (!parsed.ok) return { ok: false, reason: "field", error: firstError(parsed.errors) };
  return saveCategory(id || null, parsed.values);
}

/** Toggle is_active on a brand/style/category. */
export async function toggleActiveAction(
  table: "brands" | "styles" | "categories",
  id: string,
  isActive: boolean,
): Promise<TaxonomyWriteResult> {
  await requireSession();
  return setTaxonomyActive(table, id, isActive);
}

/** Delete a taxonomy row. */
export async function deleteTaxonomyAction(
  table: TaxonomyTable,
  id: string,
): Promise<TaxonomyWriteResult> {
  await requireSession();
  return deleteTaxonomy(table, id);
}

/** Pull the first error from a field-error map (for a single-error return). */
function firstError(errors: Record<string, string | undefined>) {
  const key = Object.values(errors).find((value) => value !== undefined);
  return (key ?? "slug-format") as import("@/lib/admin/taxonomy/taxonomy-input").TaxonomyFieldError;
}
