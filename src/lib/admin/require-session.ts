/**
 * Shared `requireSession()` for T11 admin server actions (extracted per the
 * ticket so every write re-verifies the session at entry without copying the
 * T10 `actions.ts` implementation). Redirects to `/admin/login` when the session
 * is absent/invalid/expired — so a direct POST without a valid cookie never
 * reaches the DB (AC-11 / edge 8). Defense-in-depth beyond the middleware +
 * layout guards. `server-only`.
 */
import "server-only";
import { redirect } from "next/navigation";
import { hasValidAdminSession } from "@/lib/admin/session-guard";
import { ADMIN_LOGIN_PATH } from "@/lib/admin/constants";

/** Redirect to login unless the current request carries a valid admin session. */
export async function requireSession(): Promise<void> {
  if (!(await hasValidAdminSession())) {
    redirect(ADMIN_LOGIN_PATH);
  }
}
