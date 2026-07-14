/**
 * Absolute-URL builders for the Mercado Pago preference (T8 AC-4).
 *
 * MP needs ABSOLUTE `back_urls` (where to send the browser after checkout) and
 * an ABSOLUTE `notification_url` (where to POST the webhook). Both key off the
 * order's `confirmation_token` (the same unguessable id the confirmation page is
 * addressed by — never the enumerable order number, IDOR fix inherited from T7).
 *
 * The origin is derived from the incoming REQUEST at the call site (forwarded
 * proto + host) so it is correct on localhost, preview, and prod without a
 * hardcoded base URL — with an optional `NEXT_PUBLIC_SITE_URL` override for
 * environments behind opaque proxies. All builders are pure (origin passed in).
 */
import {
  CHECKOUT_PATH,
  CHECKOUT_CONFIRMATION_SEGMENT,
  DEFAULT_LOCALE,
} from "@/lib/config";
import { MP_RETURN_STATUS_PARAM, MP_WEBHOOK_PATH } from "@/lib/payments/config";

/** The three MP back_urls, each an absolute, locale-correct confirmation URL. */
export interface BackUrls {
  success: string;
  pending: string;
  failure: string;
}

/**
 * Build the locale-aware confirmation URL for a token, appending the MP status
 * DISPLAY HINT (`?mp_status=...`). The default locale (`es-MX`) has NO prefix;
 * any other locale gets its `/<locale>` prefix (next-intl `as-needed` strategy).
 *
 * @param origin absolute origin, e.g. `https://posturpro.mx` (no trailing slash)
 * @param locale route locale (`es-MX` | `en`)
 * @param token order confirmation token
 * @param hint MP status hint appended as a query param (display only)
 */
export function confirmationUrl(
  origin: string,
  locale: string,
  token: string,
  hint: "success" | "pending" | "failure",
): string {
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const path = `${prefix}${CHECKOUT_PATH}/${CHECKOUT_CONFIRMATION_SEGMENT}/${encodeURIComponent(token)}`;
  const query = `?${MP_RETURN_STATUS_PARAM}=${hint}`;
  return `${trimTrailingSlash(origin)}${path}${query}`;
}

/** Build all three back_urls for a token in one locale. */
export function buildBackUrls(
  origin: string,
  locale: string,
  token: string,
): BackUrls {
  return {
    success: confirmationUrl(origin, locale, token, "success"),
    pending: confirmationUrl(origin, locale, token, "pending"),
    failure: confirmationUrl(origin, locale, token, "failure"),
  };
}

/** The absolute webhook URL MP POSTs notifications to (locale-agnostic). */
export function webhookUrl(origin: string): string {
  return `${trimTrailingSlash(origin)}${MP_WEBHOOK_PATH}`;
}

/** Drop a single trailing slash so path concatenation never doubles it. */
function trimTrailingSlash(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}
