/**
 * Pure Q&A submission guards (T4 AC-14, AC-15, edge 4).
 *
 * Everything here is I/O-free and unit-testable: input validation against the
 * TRIMMED value (mirrors the DB CHECKs), honeypot detection, and an in-memory
 * per-IP+product rate-limit window. The server action (`actions.ts`) composes
 * these before ever touching the database — the DB CHECKs + RLS `WITH CHECK`
 * remain the floor, never the first line of defense (edge 4: trim BEFORE the
 * length check so an all-whitespace question fails validation, never inserts).
 */
import { AUTHOR_NAME_MAX, QUESTION_MAX } from "@/lib/config";

/** A field-scoped validation error key (maps to a localized message). */
export type QaFieldErrorKey =
  | "nameRequired"
  | "nameTooLong"
  | "questionRequired"
  | "questionTooLong";

/** The result of validating a submission's trimmed values. */
export interface QaValidationResult {
  ok: boolean;
  /** Trimmed values, safe to insert when `ok` is true. */
  values: { authorName: string; question: string };
  /** Field → error key; empty when `ok`. */
  fieldErrors: Partial<Record<"authorName" | "question", QaFieldErrorKey>>;
}

/**
 * Validate a Q&A submission against the TRIMMED values (edge 4). Length bounds
 * mirror the DB CHECKs (`AUTHOR_NAME_MAX` / `QUESTION_MAX`). Returns the trimmed
 * values so the action inserts exactly what was validated.
 */
export function validateQaSubmission(
  rawAuthorName: string,
  rawQuestion: string,
): QaValidationResult {
  const authorName = rawAuthorName.trim();
  const question = rawQuestion.trim();
  const fieldErrors: QaValidationResult["fieldErrors"] = {};

  if (authorName.length < 1) {
    fieldErrors.authorName = "nameRequired";
  } else if (authorName.length > AUTHOR_NAME_MAX) {
    fieldErrors.authorName = "nameTooLong";
  }

  if (question.length < 1) {
    fieldErrors.question = "questionRequired";
  } else if (question.length > QUESTION_MAX) {
    fieldErrors.question = "questionTooLong";
  }

  return {
    ok: Object.keys(fieldErrors).length === 0,
    values: { authorName, question },
    fieldErrors,
  };
}

/**
 * Whether the honeypot field was filled (AC-15). Bots fill hidden fields; humans
 * cannot see it. A filled honeypot means the action short-circuits to a fake
 * success WITHOUT any DB write.
 */
export function isHoneypotTripped(honeypotValue: string): boolean {
  return honeypotValue.trim().length > 0;
}

/* ------------------------------------------------------------------------- *
 * In-memory per-IP+product rate limiter (AC-15).
 *
 * Best-effort, per-server-instance (resets on redeploy/scale-out) — a durable
 * limiter is a documented follow-up, not this ticket. A sliding window keyed by
 * `ip|productId` holds recent submission timestamps; expired timestamps are
 * pruned on each check so the map does not grow unbounded.
 * ------------------------------------------------------------------------- */

import {
  QA_MAX_SUBMISSIONS_PER_WINDOW,
  QA_RATE_LIMIT_WINDOW_MS,
} from "@/lib/config";

/** timestamps (ms epoch) of recent submissions, keyed by `ip|productId`. */
const submissionLog = new Map<string, number[]>();

/** Build the composite rate-limit key. */
function rateLimitKey(ip: string, productId: string): string {
  return `${ip}|${productId}`;
}

/**
 * Record a submission attempt and report whether it is within the allowed rate
 * (AC-15). Prunes timestamps older than the window before counting. Returns
 * `true` when the caller MAY proceed, `false` when the limit is tripped.
 *
 * @param ip best-effort client IP (from `x-forwarded-for`); falls back to a
 *           shared bucket when unknown, which is acceptable for best-effort.
 * @param productId the product being asked about
 * @param now injectable clock for tests (defaults to `Date.now()`)
 */
export function checkRateLimit(
  ip: string,
  productId: string,
  now: number = Date.now(),
): boolean {
  const key = rateLimitKey(ip, productId);
  const windowStart = now - QA_RATE_LIMIT_WINDOW_MS;
  const recent = (submissionLog.get(key) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  if (recent.length >= QA_MAX_SUBMISSIONS_PER_WINDOW) {
    // Persist the pruned list so the map does not leak stale keys unboundedly.
    submissionLog.set(key, recent);
    return false;
  }

  recent.push(now);
  submissionLog.set(key, recent);
  return true;
}

/** Test-only: clear the in-memory rate-limit state between cases. */
export function resetRateLimitState(): void {
  submissionLog.clear();
}
