/**
 * WhatsApp deep-link helpers (T2 AC-8, edge case 7).
 *
 * Pure logic, no React — the floating button component imports these so the URL
 * construction and the render guard are independently testable. The phone
 * number and prefill message come from `src/lib/config.ts` (non-secret config),
 * never from user input, so there is no injection vector; the message is still
 * URL-encoded defensively.
 */

/** `wa.me` click-to-chat base. */
const WA_ME_BASE = "https://wa.me" as const;

/** Non-digit characters stripped from a configured phone value. */
const NON_DIGITS = /\D/g;

/**
 * Normalize a configured phone value to bare E.164 digits (no `+`, spaces, or
 * dashes) as `wa.me` expects. Returns an empty string when nothing is left.
 */
export function normalizeWhatsAppPhone(phone: string): string {
  return phone.replace(NON_DIGITS, "");
}

/**
 * Whether a WhatsApp button should render for the given configured phone.
 * Empty / whitespace / punctuation-only values disable the button so we never
 * emit a numberless `wa.me/` link (edge case 7).
 */
export function isWhatsAppConfigured(phone: string): boolean {
  return normalizeWhatsAppPhone(phone).length > 0;
}

/**
 * Build a `https://wa.me/<digits>?text=<url-encoded message>` link.
 *
 * @returns the deep link, or `null` when the phone is not configured
 */
export function buildWhatsAppUrl(
  phone: string,
  message: string,
): string | null {
  const digits = normalizeWhatsAppPhone(phone);
  if (digits.length === 0) {
    return null;
  }
  const query = message
    ? `?text=${encodeURIComponent(message)}`
    : "";
  return `${WA_ME_BASE}/${digits}${query}`;
}
