/**
 * Quote-form (B2B `/empresas`) non-secret config (T16). Input length caps, the
 * constrained team-size enum, the dedicated sliding-window rate-limit tunables,
 * and the success-banner cadence — all single-sourced (AC-4, AC-7). The quote
 * form is a PUBLIC write path that relays email to the store owner, so it mirrors
 * the contact/Q&A/checkout abuse controls: trim + length-cap every field, an enum
 * membership check for team size, then a per-IP sliding window with a hard key
 * ceiling. This limiter is a SEPARATE instance from the contact one (edge 4).
 */

/** Max length of the company name after trimming (AC-4). */
export const QUOTE_COMPANY_MAX = 160;

/** Max length of the contact name after trimming (AC-4). */
export const QUOTE_NAME_MAX = 120;

/**
 * Max length of the contact email after trimming (AC-4). Generous vs. the RFC
 * 5321 254-char limit — it only guards against absurd payloads; the shared
 * `EMAIL_PATTERN` shape check is the real validator.
 */
export const QUOTE_EMAIL_MAX = 254;

/** Max length of the OPTIONAL phone after trimming (AC-4). */
export const QUOTE_PHONE_MAX = 40;

/**
 * Max length of the needs/message body after trimming (AC-4). Matches the
 * contact `CONTACT_MESSAGE_MAX` (2000) — a sane email-relay body cap (edge 5: a
 * hostile oversized message is capped here before it reaches the template, which
 * additionally HTML-escapes it).
 */
export const QUOTE_MESSAGE_MAX = 2000;

/**
 * The allowed team-size ranges (AC-4, edge 1). SINGLE SOURCE OF TRUTH: the
 * `<select>` options map over this tuple AND the server guard checks membership
 * against it, so a tampered/crafted `teamSize` value is rejected as `invalid`
 * (never free-text garbage, never trusted from the client). Labels are resolved
 * from `empresas.form.teamSize.options.{value}` in both locales — do NOT
 * duplicate this list in JSX.
 */
export const QUOTE_TEAM_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;

/** A validated team-size value (one of {@link QUOTE_TEAM_SIZES}). */
export type QuoteTeamSize = (typeof QUOTE_TEAM_SIZES)[number];

/** Whether `value` is an allowed team-size range (server-side enum guard). */
export function isQuoteTeamSize(value: string): value is QuoteTeamSize {
  return (QUOTE_TEAM_SIZES as readonly string[]).includes(value);
}

/** Sliding-window length for the quote rate limiter, in ms (AC-7). */
export const QUOTE_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Max quote submissions allowed per IP within
 * {@link QUOTE_RATE_LIMIT_WINDOW_MS} (AC-7). A genuine office manager sends one
 * request and waits for a reply; 3/minute leaves headroom for a corrected resend
 * while still throttling a bot flood.
 */
export const QUOTE_MAX_SUBMISSIONS_PER_WINDOW = 3;

/**
 * Hard ceiling on distinct quote rate-limit keys (cardinality-DoS bound, AC-7),
 * mirroring the contact/Q&A/checkout limiters. Bounds worst-case memory against
 * an IP-rotation attack; the sliding-window limiter evicts idle/oldest keys once
 * breached.
 */
export const QUOTE_RATE_LIMIT_MAX_KEYS = 10_000;

/**
 * Auto-hide delay for the quote success banner, in ms (matches the shipped
 * contact form-success cadence). Named so there is no magic number in the client.
 */
export const QUOTE_SUCCESS_FEEDBACK_MS = 6000;
