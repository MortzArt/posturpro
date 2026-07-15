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
import { isSessionValid } from "@/lib/admin/session";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin/constants";

/**
 * Whether the current request carries a valid admin session. A missing session
 * secret (env failure) is treated as NOT authenticated — never as "valid" — and
 * logged (edge 4 / R5): a broken config must never grant access.
 */
export async function hasValidAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  try {
    return isSessionValid(value);
  } catch (caught) {
    if (caught instanceof MissingEnvVarError) {
      console.error("[admin] session verification unavailable (missing env)");
      return false;
    }
    throw caught;
  }
}
