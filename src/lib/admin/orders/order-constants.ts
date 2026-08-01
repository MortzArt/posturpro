/**
 * Non-secret, Next-import-free, server-free order constants (T12). Safe to import
 * from client components (bound lengths for the notes/tracking inputs) AND the
 * server-only write layers alike — the write modules re-export nothing secret
 * from here. Keeping these OUT of the `server-only` write modules avoids pulling
 * the admin client into a client bundle (the build enforces this).
 */

/** Max characters for an internal note (matches the 0012 DB CHECK 1..2000). */
export const INTERNAL_NOTE_MAX_LENGTH = 2000;

/**
 * Max characters for a status-history note — the manual-advance note AND the
 * cancellation reason (which is also emailed to the customer). Unlike
 * `order_internal_notes`, the `order_status_history.note` column has NO DB
 * length CHECK, so the write path must bound it in application code (mirrors the
 * client textarea `maxLength`). A note over this length is trimmed to the cap
 * rather than rejected — a slightly-too-long reason should never block a
 * legitimate cancel/advance, only be prevented from storing/emailing unbounded
 * text. Shared with the cancel/advance textareas so client and server agree.
 */
export const STATUS_NOTE_MAX_LENGTH = 2000;
