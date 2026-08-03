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

/**
 * The `orders.payment_method` sentinel that marks an order as manually / phone
 * created (T17). `create_order` does NOT accept `payment_method` in its payload
 * (it hardcodes the checkout defaults), so a manual order is stamped with this
 * value in a post-create step: the paid-choice `advance_order_status` call
 * carries it as `p_payment_method`, and the pending-choice path stamps it via a
 * direct UPDATE. The order detail badges from it via `isManualOrder`.
 */
export const MANUAL_ORDER_PAYMENT_METHOD = "manual" as const;
