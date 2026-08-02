/**
 * Contact-form non-secret config (T13). Input length caps + the dedicated
 * sliding-window rate-limit tunables, single-sourced (AC-13, AC-14). The
 * Contact form is a PUBLIC write path that relays email to the store owner, so
 * it mirrors the Q&A/checkout abuse controls: trim + length-cap every field,
 * then a per-IP sliding window with a hard key ceiling.
 */

/** Max length of the visitor's name after trimming (AC-13). */
export const CONTACT_NAME_MAX = 120;

/**
 * Max length of the visitor's email after trimming (AC-13). Generous vs. the
 * RFC 5321 254-char local limit — it only guards against absurd payloads; the
 * `EMAIL_PATTERN` shape check is the real validator.
 */
export const CONTACT_EMAIL_MAX = 254;

/** Max length of the OPTIONAL subject after trimming (AC-13). */
export const CONTACT_SUBJECT_MAX = 160;

/**
 * Max length of the message after trimming (AC-13). Matches the Q&A
 * `QUESTION_MAX` (2000) — well under the `static_pages` 100k body ceiling, and
 * a sane email-relay body cap (edge 7: a 100k hostile message is capped here
 * before it ever reaches the template, which additionally HTML-escapes it).
 */
export const CONTACT_MESSAGE_MAX = 2000;

/** Sliding-window length for the contact rate limiter, in ms (AC-14). */
export const CONTACT_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Max contact submissions allowed per IP within
 * {@link CONTACT_RATE_LIMIT_WINDOW_MS} (AC-14). A genuine visitor sends one
 * message and waits for a reply; 3/minute leaves headroom for a corrected
 * resend while still throttling a bot flood.
 */
export const CONTACT_MAX_SUBMISSIONS_PER_WINDOW = 3;

/**
 * Hard ceiling on distinct rate-limit keys (cardinality-DoS bound, AC-14 edge
 * 5), mirroring the Q&A/checkout limiters. Bounds worst-case memory against an
 * IP-rotation attack; the sliding-window limiter evicts idle/oldest keys once
 * breached.
 */
export const CONTACT_RATE_LIMIT_MAX_KEYS = 10_000;

/**
 * Auto-hide delay for the contact success banner, in ms (matches the shipped
 * form-success cadence). Named so there is no magic number in the client.
 */
export const CONTACT_SUCCESS_FEEDBACK_MS = 6000;
