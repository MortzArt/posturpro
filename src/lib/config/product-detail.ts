/**
 * Product-detail page (PDP) + recently-viewed + Q&A non-secret tunables (T4).
 *
 * A2 split (see `src/lib/config.ts` header): content moved VERBATIM from the
 * former monolithic `config.ts`. The Q&A rate-limit constants, the `<meta>`
 * truncation limit, and the {@link truncateForMeta} utility all belong to the
 * PDP domain (T4), so the utility lives WITH its domain constants here.
 */

/**
 * Maximum products shown in the recently-viewed strip (T4 AC-12). The strip is
 * client-only/localStorage (no accounts in Phase 1). Newest-first, current
 * product excluded. Change here and both the storage cap and the render cap
 * follow (both read this constant).
 */
export const RECENTLY_VIEWED_MAX = 8;

/**
 * localStorage key under which the recently-viewed card view models are stored
 * (T4 AC-12). Namespaced so it never collides with other persisted state. If
 * the stored shape ever changes incompatibly, bump the version suffix so stale
 * payloads are ignored rather than mis-rendered.
 */
export const RECENTLY_VIEWED_STORAGE_KEY = "posturpro:recently-viewed:v1" as const;

/**
 * Q&A submission rate-limit window, in milliseconds (T4 AC-15). Within this
 * window a single IP+product may submit at most {@link QA_MAX_SUBMISSIONS_PER_WINDOW}
 * questions. Best-effort, in-memory, per-server-instance (resets on
 * redeploy/scale-out) — a durable/global limiter is a documented follow-up, not
 * this ticket. 60 seconds.
 */
export const QA_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Max Q&A submissions allowed per IP+product within {@link QA_RATE_LIMIT_WINDOW_MS}
 * (T4 AC-15). Above this the action rejects before any DB insert with a friendly
 * "please wait" message.
 */
export const QA_MAX_SUBMISSIONS_PER_WINDOW = 3;

/**
 * Max author-name length for a Q&A submission (T4 AC-14). MIRRORS the DB CHECK
 * `char_length(author_name) between 1 and 120` in `0004_content_qa.sql`. Client
 * caps input and server re-validates the TRIMMED value against this — the DB
 * CHECK is the floor, never the first line of defense.
 */
export const AUTHOR_NAME_MAX = 120;

/**
 * Max question length for a Q&A submission (T4 AC-14). MIRRORS the DB CHECK
 * `char_length(question) between 1 and 2000` in `0004_content_qa.sql`.
 */
export const QUESTION_MAX = 2000;

/**
 * Hard ceiling on the number of distinct keys the in-memory Q&A rate-limiter
 * map may hold at once (T4 M-2 — cache-key-cardinality DoS bound, mirroring
 * {@link MAX_PAGE} for the T3 read path). Each key is `ip|productId`; a bounded
 * `productId` (validated UUID) and a bounded IP source cap the theoretical
 * cardinality, but an attacker rotating either still grows the map. When the
 * map exceeds this size the limiter evicts idle/expired keys, then (if still
 * over) the oldest keys — so memory is bounded regardless of input. Sized well
 * above any legitimate concurrent-asker volume at seed scale.
 */
export const QA_RATE_LIMIT_MAX_KEYS = 10_000;

/**
 * Matches a canonical lowercase UUID (v1–v5), the shape Postgres emits for
 * `product_questions.product_id` (T4 M-2). The Q&A action validates the
 * client-supplied `productId` against this BEFORE it keys the rate-limiter or
 * reaches the DB, so arbitrary attacker strings can never mint rate-limit keys
 * or hit the insert. Anchored + fixed-length → no ReDoS, no partial matches.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Max characters of a product description surfaced in the `<meta name=
 * "description">` tag (T4 AC-3, m-1). AC-3 specifies a TRUNCATED description;
 * ~160 chars is the length Google renders before it clips, so longer copy is
 * sliced (on a word boundary, with an ellipsis) by {@link truncateForMeta}.
 */
export const MAX_META_DESCRIPTION = 160;

/**
 * Truncate a description for the `<meta name="description">` tag (T4 AC-3, m-1).
 * Trims first; returns it unchanged when within {@link MAX_META_DESCRIPTION};
 * otherwise slices to the last word boundary at or before the limit and appends
 * an ellipsis. Never splits a word or emits a trailing space before the "…".
 */
export function truncateForMeta(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_META_DESCRIPTION) {
    return trimmed;
  }
  const slice = trimmed.slice(0, MAX_META_DESCRIPTION);
  const lastSpace = slice.lastIndexOf(" ");
  const head = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${head.trimEnd()}…`;
}
