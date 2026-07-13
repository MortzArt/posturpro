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

/**
 * Whether a client-supplied `productId` is a canonical UUID (M-2). The Q&A
 * action calls this BEFORE the id keys the rate-limiter or reaches the DB, so an
 * attacker cannot mint unbounded rate-limit keys (or DB round-trips) by rotating
 * arbitrary strings. Bounding the key-space is the first half of the
 * cardinality discipline; {@link QA_RATE_LIMIT_MAX_KEYS} is the hard backstop.
 */
export function isValidProductId(productId: string): boolean {
  return UUID_PATTERN.test(productId);
}

/* ------------------------------------------------------------------------- *
 * In-memory per-IP+product rate limiter (AC-15, hardened per M-2).
 *
 * Best-effort, per-server-instance (resets on redeploy/scale-out) — a durable
 * limiter is a documented follow-up, not this ticket. A sliding window keyed by
 * `ip|productId` holds recent submission timestamps. Three bounds keep the map
 * from growing without limit (M-2, the cache-key-cardinality class T3 hardened
 * against): (a) `productId` is validated as a UUID upstream before it keys
 * anything; (b) every check prunes the touched key's expired timestamps AND
 * deletes it entirely when it becomes empty (no idle keys linger); (c) a hard
 * ceiling of {@link QA_RATE_LIMIT_MAX_KEYS} evicts idle/expired then oldest keys
 * so the map size is bounded regardless of input.
 * ------------------------------------------------------------------------- */

import {
  QA_MAX_SUBMISSIONS_PER_WINDOW,
  QA_RATE_LIMIT_MAX_KEYS,
  QA_RATE_LIMIT_WINDOW_MS,
  UUID_PATTERN,
} from "@/lib/config";

/** timestamps (ms epoch) of recent submissions, keyed by `ip|productId`. */
const submissionLog = new Map<string, number[]>();

/** Build the composite rate-limit key. */
function rateLimitKey(ip: string, productId: string): string {
  return `${ip}|${productId}`;
}

/**
 * Drop keys whose every timestamp is older than the window, then — if still
 * over the ceiling — the oldest-inserted keys (Map preserves insertion order),
 * until the map is back under {@link QA_RATE_LIMIT_MAX_KEYS}. Called only when
 * the ceiling is breached, so the O(n) sweep is rare (M-2).
 */
function evictToCeiling(windowStart: number): void {
  for (const [key, timestamps] of submissionLog) {
    if (timestamps.every((timestamp) => timestamp <= windowStart)) {
      submissionLog.delete(key);
    }
  }
  // Insertion-order eviction of the oldest keys if pruning idle ones wasn't
  // enough (e.g. a burst of still-active distinct keys).
  while (submissionLog.size >= QA_RATE_LIMIT_MAX_KEYS) {
    const oldest = submissionLog.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    submissionLog.delete(oldest);
  }
}

/**
 * Record a submission attempt and report whether it is within the allowed rate
 * (AC-15). Prunes timestamps older than the window before counting, deletes the
 * key when it goes empty, and enforces a hard map-size ceiling (M-2). Returns
 * `true` when the caller MAY proceed, `false` when the limit is tripped.
 *
 * @param ip best-effort client IP (see `clientIp` trust model); falls back to a
 *           shared bucket when unknown, which is acceptable for best-effort.
 * @param productId the product being asked about — MUST already be a validated
 *           UUID (see {@link isValidProductId}); the action enforces this.
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
  // Enforce the hard ceiling before inserting a NEW key (existing keys just
  // update in place and never grow the map).
  if (!submissionLog.has(key) && submissionLog.size >= QA_RATE_LIMIT_MAX_KEYS) {
    evictToCeiling(windowStart);
  }
  submissionLog.set(key, recent);
  return true;
}

/** Test-only: clear the in-memory rate-limit state between cases. */
export function resetRateLimitState(): void {
  submissionLog.clear();
}

/** Test-only: current distinct-key count (asserts the M-2 ceiling holds). */
export function rateLimitKeyCount(): number {
  return submissionLog.size;
}
