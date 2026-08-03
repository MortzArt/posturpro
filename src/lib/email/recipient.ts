/**
 * Customer-email recipient safety (T17, AC-13).
 *
 * A manual/phone order may have NO customer email. To satisfy the NOT NULL
 * `orders.contact_email` / `customers.email` columns WITHOUT a migration, the
 * manual-order write substitutes a single, well-defined, non-delivering
 * placeholder (`NO_EMAIL_PLACEHOLDER`). This module is the ONE place that
 * decides whether an order's stored `contactEmail` is a real, mailable address.
 *
 * Every customer-facing send in `dispatch.ts` routes its recipient through
 * `resolveCustomerRecipient` so that:
 *   - a blank / malformed address → benign skip (no provider call), and
 *   - the placeholder sentinel     → benign skip (never emailed),
 * so a later T12 status change (shipped / cancelled / refund) on an email-less
 * manual order never errors and never spams the provider.
 *
 * Pure + dependency-light on purpose: it is imported by the server-only
 * `dispatch.ts` AND by the manual-order write, and is unit-tested directly.
 */
import { EMAIL_PATTERN } from "@/lib/config/checkout";

/**
 * The non-delivering sentinel stored in `contact_email` when a manual order has
 * no customer email. It is a syntactically-INVALID address on purpose (a bare
 * `@` local part with no user, RFC-unroutable `.invalid` TLD) so that:
 *   - it fails `EMAIL_PATTERN` → the recipient guard treats it as "no recipient"
 *     and no send is ever attempted, and
 *   - it can never collide with a real customer's address.
 * Single-sourced here; referenced by the manual-order write and this guard.
 */
export const NO_EMAIL_PLACEHOLDER = "sin-correo@pedido-manual.invalid" as const;

/** True when `value` is a non-blank string matching the shared EMAIL_PATTERN. */
export function isMailableAddress(value: string | null | undefined): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === NO_EMAIL_PLACEHOLDER) {
    return false;
  }
  return EMAIL_PATTERN.test(trimmed);
}

/**
 * Resolve a customer-facing recipient from an order's stored contact email.
 * Returns the trimmed address when it is a real, mailable email, or `null` when
 * it is blank, malformed, or the no-email sentinel — the signal to skip the send.
 */
export function resolveCustomerRecipient(
  contactEmail: string | null | undefined,
): string | null {
  return isMailableAddress(contactEmail) ? contactEmail.trim() : null;
}
