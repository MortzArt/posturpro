"use server";

/**
 * Q&A submission server action (T4 AC-14, AC-15, edges 4 & 5).
 *
 * THE FIRST PUBLIC WRITE PATH. Layered controls, in order:
 *   1. honeypot  — a filled hidden field → fake success, NO insert (AC-15).
 *   2. validation — trim BEFORE length checks, mirror the DB CHECKs (edge 4).
 *   3. rate limit — best-effort in-memory per-IP+product window (AC-15).
 *   4. insert     — via the ANON client so RLS `product_questions_anon_insert`
 *                   is the security boundary: it forces `is_published=false`,
 *                   `answer=null`, `answered_at=null`, the length bounds, and
 *                   `is_active_product(product_id)`. We send ONLY
 *                   `{product_id, author_name, question}` and let RLS/defaults
 *                   set the rest. NEVER the admin/secret client.
 *
 * Errors are mapped to friendly enums (never echoing `error.message`): an RLS /
 * `is_active_product` denial → "unavailable" (edge 5); anything else → a
 * retryable "error". On success we `updateTag(product:<slug>)` so the question
 * surfaces once an admin publishes it (T11), and the input's Q&A text NEVER
 * touches a cache key.
 */
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { createPublicClient } from "@/lib/supabase/public";
import { productCacheTag } from "@/lib/catalog/product-detail";
import {
  checkRateLimit,
  isHoneypotTripped,
  isValidProductId,
  validateQaSubmission,
  type QaFieldErrorKey,
} from "@/lib/qa/submit-guard";

/** The serializable state `useActionState` renders from. */
export interface QaFormState {
  status: "idle" | "success" | "invalid" | "rate-limited" | "unavailable" | "error";
  /** Field → error key (localized in the form); present only when invalid. */
  fieldErrors?: Partial<Record<"authorName" | "question", QaFieldErrorKey>>;
  /**
   * Preserved input so the form stays filled on every failure. Absent on
   * success (the form clears).
   */
  values?: { authorName: string; question: string };
  /** Increments on every action call so the client can react to repeat results. */
  submissionId: number;
}

/** The initial state passed to `useActionState`. */
export const initialQaFormState: QaFormState = {
  status: "idle",
  submissionId: 0,
};

/** PostgREST code for an RLS `WITH CHECK` / privilege denial. */
const RLS_DENIAL_CODE = "42501";

/**
 * Best-effort client IP for the per-IP rate limiter (M-3).
 *
 * TRUST MODEL — this app deploys behind Vercel's edge (README: Vercel/Geist).
 * The `x-forwarded-for` header a caller sends is fully attacker-controlled in
 * its LEFTMOST hops, so trusting `split(",")[0]` lets any client mint a fresh IP
 * per request and never trip the limit. We therefore prefer, in order:
 *
 *   1. `x-vercel-forwarded-for` — a SINGLE value injected by Vercel's trusted
 *      edge and stripped from any client-supplied copy; not spoofable behind
 *      Vercel. This is the correct source in the deployment target.
 *   2. the RIGHTMOST hop of `x-forwarded-for` — the address appended by the
 *      closest trusted proxy. Leftmost hops are client-forgeable; the rightmost
 *      is the last one our own edge wrote, so it is the most defensible when the
 *      platform header is absent (e.g. a self-hosted reverse proxy).
 *   3. `x-real-ip` — some proxies set this to the single origin IP.
 *   4. `"unknown"` — collapses all no-IP callers into ONE shared bucket (a
 *      conservative default: worst case they share a limit, never bypass it).
 *
 * RESIDUAL RISK: on a deployment WITHOUT a trusted edge that overwrites/append
 * XFF, the rightmost hop is still whatever the client sent — the limiter is then
 * only best-effort (as the ticket accepts) and the honeypot + M-2's hard map cap
 * are the backstops that prevent spoofing from amplifying into memory growth.
 */
async function clientIp(): Promise<string> {
  const headerList = await headers();

  const vercelForwarded = headerList.get("x-vercel-forwarded-for")?.trim();
  if (vercelForwarded) {
    return vercelForwarded;
  }

  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    const rightmost = hops.at(-1);
    if (rightmost) {
      return rightmost;
    }
  }

  return headerList.get("x-real-ip")?.trim() ?? "unknown";
}

/**
 * Submit a question. `slug` is bound per-render (so the success revalidation
 * targets the right tag); `formData` carries `productId`, `authorName`,
 * `question`, and the `website` honeypot.
 */
export async function submitQuestion(
  slug: string,
  prevState: QaFormState,
  formData: FormData,
): Promise<QaFormState> {
  const submissionId = prevState.submissionId + 1;
  const productId = String(formData.get("productId") ?? "");
  const rawAuthorName = String(formData.get("authorName") ?? "");
  const rawQuestion = String(formData.get("question") ?? "");
  const honeypot = String(formData.get("website") ?? "");

  // 1. Honeypot — fake success, no insert (indistinguishable UI).
  if (isHoneypotTripped(honeypot)) {
    console.warn("[qa] honeypot tripped; suppressing insert (bot-suspected).");
    return { status: "success", submissionId };
  }

  // 2. Validation on the trimmed values. The `productId` must be a real UUID
  //    (M-2): validating its FORMAT before it keys the rate-limiter or reaches
  //    the DB stops an attacker from minting unbounded rate-limit keys with
  //    arbitrary strings. A non-UUID id can only be tampering (the form always
  //    posts the server-rendered product id), so it is treated as invalid.
  const validation = validateQaSubmission(rawAuthorName, rawQuestion);
  if (!validation.ok || !isValidProductId(productId)) {
    return {
      status: "invalid",
      fieldErrors: validation.fieldErrors,
      values: { authorName: rawAuthorName, question: rawQuestion },
      submissionId,
    };
  }

  // 3. Rate limit (best-effort, in-memory; productId now guaranteed a UUID).
  const ip = await clientIp();
  if (!checkRateLimit(ip, productId)) {
    return {
      status: "rate-limited",
      values: validation.values,
      submissionId,
    };
  }

  // 4. Insert via the anon client — RLS is the boundary.
  return insertQuestion(slug, productId, validation.values, submissionId);
}

/** Perform the RLS-bounded insert and map its result to a friendly state. */
async function insertQuestion(
  slug: string,
  productId: string,
  values: { authorName: string; question: string },
  submissionId: number,
): Promise<QaFormState> {
  try {
    const db = createPublicClient();
    const { error } = await db.from("product_questions").insert({
      product_id: productId,
      author_name: values.authorName,
      question: values.question,
    });

    if (error) {
      // An RLS / is_active_product denial means the product is gone (edge 5).
      if (error.code === RLS_DENIAL_CODE) {
        return { status: "unavailable", values, submissionId };
      }
      console.error(`[qa] insert failed for product ${productId}: ${error.message}`);
      return { status: "error", values, submissionId };
    }

    // Bust the per-product cache so the question appears once published (T11).
    // `updateTag` (Next 16) is the server-action-scoped purge with
    // read-your-own-writes semantics — the right primitive for a public write.
    updateTag(productCacheTag(slug));
    return { status: "success", submissionId };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[qa] insert threw for product ${productId}: ${message}`);
    return { status: "error", values, submissionId };
  }
}
