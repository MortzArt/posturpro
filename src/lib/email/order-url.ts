/**
 * Build the ABSOLUTE confirmation-page URL for an email (T9). Relative links do
 * not resolve in an inbox, so the link is `siteOrigin() + [/en] + confirmationPath`.
 * The `/en` prefix is added for the English locale only (es-MX is served
 * prefix-free per the routing config). Pure.
 */
import { confirmationPath, siteOrigin } from "@/lib/config";

/** The URL segment prefix for the non-default (English) locale. */
const EN_LOCALE_PREFIX = "/en" as const;

/**
 * Build the absolute confirmation URL for an order's token in a given locale.
 * `en` gets the `/en` prefix; `es-MX` (default) is prefix-free.
 */
export function buildOrderUrl(confirmationToken: string, locale: string): string {
  const prefix = locale === "en" ? EN_LOCALE_PREFIX : "";
  return `${siteOrigin()}${prefix}${confirmationPath(confirmationToken)}`;
}
