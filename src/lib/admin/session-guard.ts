/**
 * Server-side admin session guard (T10 AC-1) — the authoritative `node:crypto`
 * check used by server components (the authenticated layout + login page). Reads
 * the session cookie and verifies it via the trusted `isSessionValid`. Separate
 * from `session.ts` so the pure crypto stays free of Next `cookies()` (keeping it
 * unit-testable), while this thin wrapper owns the Next integration.
 */
import "server-only";
import { cookies } from "next/headers";
import { MissingEnvVarError } from "@/lib/env";
import { verifiedSessionPayload } from "@/lib/admin/session";
import { getAdminSessionVersion } from "@/lib/admin/session-version";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin/constants";

/**
 * Whether the current request carries a valid admin session. This is the
 * AUTHORITATIVE gate used by the admin layout, `requireSession()` (every action),
 * and every self-guarded `/api/admin` route handler. Two checks, in order:
 *
 *  1. Signature + expiry (crypto, `verifiedSessionPayload`). A missing session
 *     secret (env failure) is treated as NOT authenticated — never "valid" — and
 *     logged (edge 4 / R5): a broken config must never grant access.
 *  2. SERVER-SIDE REVOCATION (T12 AC-27/28): the verified payload's `v` must equal
 *     the persisted `admin_session_version`. A `bump_admin_session_version()`
 *     invalidates every outstanding cookie, bounding the stolen-cookie window
 *     below the 8h max-age. A hard version-read error fails CLOSED (not authed) so
 *     a broken DB can never grant a refund-capable session.
 */
export async function hasValidAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  let payload;
  try {
    payload = verifiedSessionPayload(value);
  } catch (caught) {
    if (caught instanceof MissingEnvVarError) {
      console.error("[admin] session verification unavailable (missing env)");
      return false;
    }
    throw caught;
  }
  if (!payload) {
    return false;
  }

  // Server-side revocation: compare the signed `v` against the persisted version.
  const currentVersion = await getAdminSessionVersion();
  if (currentVersion === null) {
    // Fail closed on a version-read error — never grant access on a broken DB.
    return false;
  }
  return payload.v === currentVersion;
}
