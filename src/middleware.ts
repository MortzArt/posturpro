import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import {
  ADMIN_LOGIN_PATH,
  ADMIN_PATH_PREFIX,
  ADMIN_SESSION_COOKIE_NAME,
} from "@/lib/admin/constants";
import { isSessionValidEdge } from "@/lib/admin/session-edge";

/**
 * Combined middleware (T2 + T10).
 *
 * STOREFRONT (unchanged, T2 AC-1/AC-2): next-intl resolves the active locale from
 * the URL prefix or the `NEXT_LOCALE` cookie, serves the default locale unprefixed
 * and `en` under `/en`, and persists the choice.
 *
 * ADMIN (T10 AC-1, R2): `/admin/*` is a locale-free sibling tree. The `/admin`
 * branch runs FIRST and returns before next-intl ever sees the request, so admin
 * paths are NEVER locale-rewritten and the storefront locale/cart behavior is
 * byte-for-byte unchanged. Unauthenticated `/admin/*` (except `/admin/login`)
 * redirects to `/admin/login` (no admin markup sent). Session verification here
 * is a FAST Web-Crypto preliminary (Edge runtime, R1) — the AUTHORITATIVE
 * `node:crypto` verify runs again in the admin layout + every server action
 * (defense-in-depth), so a matcher edge case that bypasses this is still protected.
 */
const intlMiddleware = createMiddleware(routing);

/** True for `/admin`, `/admin/`, and any `/admin/...` (case-sensitive; Next paths are). */
function isAdminPath(pathname: string): boolean {
  return (
    pathname === ADMIN_PATH_PREFIX || pathname.startsWith(`${ADMIN_PATH_PREFIX}/`)
  );
}

/** True for the login route (the one admin path reachable while unauthenticated). */
function isLoginPath(pathname: string): boolean {
  return pathname === ADMIN_LOGIN_PATH || pathname === `${ADMIN_LOGIN_PATH}/`;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin branch — handled entirely here; never delegated to next-intl (R2).
  if (isAdminPath(pathname)) {
    return handleAdmin(request);
  }

  // Everything else: unchanged storefront locale middleware.
  return intlMiddleware(request);
}

/** Guard `/admin/*`: allow `/admin/login`; redirect unauthenticated elsewhere. */
async function handleAdmin(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const cookieValue = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const authenticated = await isSessionValidEdge(cookieValue);

  // Already authed and visiting /admin/login → send to the app (AC-7). The
  // authoritative AC-7 redirect also lives in the login page (defense-in-depth).
  if (isLoginPath(pathname)) {
    if (authenticated) {
      return NextResponse.redirect(new URL(ADMIN_PATH_PREFIX, request.url));
    }
    return NextResponse.next();
  }

  // Any other /admin/* path requires a valid session (AC-1).
  if (!authenticated) {
    return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
  }
  return NextResponse.next();
}

/**
 * Matcher excludes API routes, Next internals, Vercel internals, and any path
 * containing a dot (static files). It DOES include `/admin` and `/admin/*` (no
 * dot, not `api`/`_next`) so the admin guard runs for them.
 */
export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
