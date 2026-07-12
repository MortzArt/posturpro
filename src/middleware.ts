import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * next-intl locale middleware (T2 AC-1, AC-2). Resolves the active locale from
 * the URL prefix or the `NEXT_LOCALE` cookie (Accept-Language negotiation is
 * disabled via `localeDetection: false` in the routing config), serves the
 * default locale unprefixed and `en` under `/en`, and persists the choice.
 */
export default createMiddleware(routing);

/**
 * Matcher excludes API routes, Next internals, Vercel internals, and any path
 * containing a dot (static files like `/favicon.ico`, `/*.svg`). Without the
 * `.*\\..*` exclusion, unprefixed default-locale routing would shadow static
 * assets (research report → Internal Dependencies).
 */
export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
