/**
 * Non-secret UI timing constants for the payment components (T8, Clean-Code
 * rule 4 — no magic numbers). Kept out of the server-only config so client
 * components can import them.
 */

/**
 * How long (ms) the voucher "Copiar"→"Copiado" confirmation shows before
 * reverting to the idle label. ~1.5s registers without nagging (mirrors
 * {@link import("@/lib/config").ADD_TO_CART_CONFIRM_MS} timing intent).
 */
export const COPIED_RESET_MS = 1_500;
