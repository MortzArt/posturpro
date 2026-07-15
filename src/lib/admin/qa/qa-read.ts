/**
 * Admin Q&A reads (T11, Slice 6). Live (uncached) reads via the admin client
 * (RLS-bypass) against the base `product_questions` table — the storefront only
 * reads `is_published=true`, but the operator must see EVERY question (incl.
 * unanswered/unpublished). `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** A question row joined with its product name/slug for the inbox. */
export interface AdminQuestion {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  authorName: string;
  question: string;
  answer: string | null;
  isPublished: boolean;
  answeredAt: string | null;
  createdAt: string;
}

/** Which questions the inbox shows (segmented control). */
export type QaFilter = "unanswered" | "answered";

/**
 * Count unanswered questions (answer IS NULL) for the nav badge. Degrades to 0
 * on any read error so the shell never crashes over a badge.
 */
export async function countUnansweredQuestions(): Promise<number> {
  try {
    const db = createAdminClient();
    const { count, error } = await db
      .from("product_questions")
      .select("id", { count: "exact", head: true })
      .is("answer", null);
    if (error) {
      console.error(`[admin-qa] unanswered count failed: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[admin-qa] unanswered count error: ${message}`);
    return 0;
  }
}

/**
 * List questions for the inbox, filtered by answered/unanswered, joined to the
 * product name/slug, unanswered-first then most-recent-first.
 */
export async function listAdminQuestions(
  filter: QaFilter,
): Promise<AdminQuestion[]> {
  const db = createAdminClient();
  const query = db
    .from("product_questions")
    .select(
      "id, product_id, author_name, question, answer, is_published, answered_at, created_at, products!inner(name, slug)",
    )
    .order("created_at", { ascending: false });

  const scoped =
    filter === "unanswered" ? query.is("answer", null) : query.not("answer", "is", null);

  const { data, error } = await scoped;
  if (error) {
    throw new Error(`[admin-qa] list failed: ${error.message}`);
  }
  return (data ?? []).map(mapQuestion);
}

/** Row shape returned by the joined select (products embed collapses to one). */
interface QuestionJoinRow {
  id: string;
  product_id: string;
  author_name: string;
  question: string;
  answer: string | null;
  is_published: boolean;
  answered_at: string | null;
  created_at: string;
  products: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

/** Normalize a joined row (the `products` embed may surface as an array). */
function mapQuestion(row: QuestionJoinRow): AdminQuestion {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  return {
    id: row.id,
    productId: row.product_id,
    productName: product?.name ?? "—",
    productSlug: product?.slug ?? "",
    authorName: row.author_name,
    question: row.question,
    answer: row.answer,
    isPublished: row.is_published,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
  };
}
