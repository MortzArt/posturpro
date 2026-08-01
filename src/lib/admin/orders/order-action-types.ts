/**
 * Serializable result contracts for the T12 order server actions (T10 rule: a
 * `"use server"` module may export ONLY async functions, so these types live
 * OUTSIDE `actions.ts` — and, per the T12 binding note, in `lib/admin/orders/`,
 * NOT the app dir, avoiding T11's lib→app type inversion). Consumed by the client
 * action-caller components (`OrderDetailActions`, `RefundModal`, etc.).
 */

/** Outcome of `advanceStatus`. `emailSent` drives the "correo no enviado" note. */
export type AdvanceStatusActionResult =
  | { ok: true; emailSent: boolean }
  | { ok: false; reason: "regression" | "not-allowed" | "invalid" | "not-found" | "error" };

/** Outcome of `setTracking`. */
export type SetTrackingActionResult =
  | { ok: true }
  | { ok: false; reason: "too-long" | "url-invalid" | "not-found" | "error" };

/** Outcome of `cancelOrder`. */
export type CancelOrderActionResult =
  | { ok: true; emailSent: boolean }
  | { ok: false; reason: "not-found" | "error" };

/** Outcome of `refundOrder` (friendly, never a raw MP error). */
export type RefundOrderActionResult =
  | { ok: true; kind: "full" | "partial"; emailSent: boolean }
  | { ok: false; reason: "over-refund" | "mp-error" | "not-refundable" | "error" | "invalid" };

/** Outcome of `addInternalNote`. */
export type AddNoteActionResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "too-long" | "not-found" | "error" };
