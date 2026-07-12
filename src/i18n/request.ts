import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";

/**
 * Per-request next-intl configuration (T2 AC-3). Loads the message dictionary
 * for the active locale from `src/messages/<locale>.json` for React Server
 * Components. Wired via `withNextIntl("./src/i18n/request.ts")` in
 * `next.config.ts`.
 *
 * `requestLocale` is a promise resolved from the `[locale]` route segment. If
 * it is missing or not one of our supported locales (e.g. a stale param), we
 * fall back to `routing.defaultLocale` so the app never renders without
 * messages — invalid URL segments are caught separately by `notFound()` in the
 * `[locale]` layout (T2 edge case 1).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
