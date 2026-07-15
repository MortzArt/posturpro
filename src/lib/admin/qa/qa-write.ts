/**
 * Q&A write layer (T11 Slice 6, AC-28, edge 9). Answer/publish, unpublish, and
 * delete customer questions via the admin client. Answering sets `answer`,
 * `answered_at=now()`, `is_published=true` in one write. Busts `product:<slug>`
 * so the storefront PDP reflects it. `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bustCatalogTags } from "@/lib/admin/products/cache-tags";
import { QA_ANSWER_MAX_LENGTH } from "@/lib/config";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Outcome of a Q&A write. */
export type QaWriteResult =
  | { ok: true }
  | { ok: false; reason: "too-long" | "empty" | "not-found" | "write-failed" };

/** Read a question's product slug for the cache bust. */
async function slugForQuestion(db: AdminClient, questionId: string): Promise<string | null> {
  const { data } = await db
    .from("product_questions")
    .select("products(slug)")
    .eq("id", questionId)
    .maybeSingle();
  if (!data) return null;
  const product = Array.isArray(data.products) ? data.products[0] : data.products;
  return product?.slug ?? null;
}

/**
 * Answer + publish a question in one write. Validates the answer length bound
 * (matches the DB CHECK 1..5000). Busts the product PDP tag.
 */
export async function answerQuestion(
  questionId: string,
  answer: string,
): Promise<QaWriteResult> {
  const trimmed = answer.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > QA_ANSWER_MAX_LENGTH) return { ok: false, reason: "too-long" };

  const db = createAdminClient();
  const slug = await slugForQuestion(db, questionId);
  const { error } = await db
    .from("product_questions")
    .update({ answer: trimmed, is_published: true, answered_at: new Date().toISOString() })
    .eq("id", questionId);
  if (error) {
    console.error(`[qa-write] answer failed: ${error.message}`);
    return { ok: false, reason: "write-failed" };
  }
  if (slug) bustCatalogTags({ productSlugs: [slug] });
  return { ok: true };
}

/** Set a question's published flag (unpublish hides it from the PDP, edge 9). */
export async function setQuestionPublished(
  questionId: string,
  isPublished: boolean,
): Promise<QaWriteResult> {
  const db = createAdminClient();
  const slug = await slugForQuestion(db, questionId);
  const { error } = await db
    .from("product_questions")
    .update({ is_published: isPublished })
    .eq("id", questionId);
  if (error) {
    console.error(`[qa-write] publish toggle failed: ${error.message}`);
    return { ok: false, reason: "write-failed" };
  }
  if (slug) bustCatalogTags({ productSlugs: [slug] });
  return { ok: true };
}

/** Delete a spam question. Busts the product PDP tag. */
export async function deleteQuestion(questionId: string): Promise<QaWriteResult> {
  const db = createAdminClient();
  const slug = await slugForQuestion(db, questionId);
  const { error } = await db.from("product_questions").delete().eq("id", questionId);
  if (error) {
    console.error(`[qa-write] delete failed: ${error.message}`);
    return { ok: false, reason: "write-failed" };
  }
  if (slug) bustCatalogTags({ productSlugs: [slug] });
  return { ok: true };
}
