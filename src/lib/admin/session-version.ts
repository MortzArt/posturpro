/**
 * Server-side admin session-version source (T12 AC-27/28, SEC-M-1 / ADR-2).
 *
 * The admin session was previously STATELESS: a signed cookie was valid until its
 * 8h max-age, with no way to revoke it — a stolen cookie could issue refunds for
 * up to 8 hours. This module reads the persisted `admin_session_version` counter
 * (migration 0012) so the authoritative verifier (`session-guard.ts`) can compare
 * it against the cookie payload's `v`; a `bump_admin_session_version()` increments
 * the counter and thereby revokes EVERY outstanding cookie at once.
 *
 * The read is a trivial indexed single-row select, memoized per-request via React
 * `cache()` so it adds at most one round-trip per admin request (every admin page
 * + every action verifies once). `server-only`.
 */
import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_SESSION_VERSION } from "@/lib/admin/constants";

/**
 * The persisted admin session version, memoized per request. Returns the seeded
 * baseline ({@link ADMIN_SESSION_VERSION}) when the row is absent (fresh DB) so a
 * freshly-minted cookie still validates; returns `null` ONLY on a hard read error
 * so the caller can fail CLOSED (treat the session as unauthenticated rather than
 * silently granting access on a broken DB).
 */
export const getAdminSessionVersion = cache(
  async (): Promise<number | null> => {
    try {
      const db = createAdminClient();
      const { data, error } = await db
        .from("admin_session_version")
        .select("version")
        .eq("id", 1)
        .maybeSingle();
      if (error) {
        console.error(`[admin] session version read failed: ${error.message}`);
        return null;
      }
      if (!data) {
        // Fresh/unseeded DB: fall back to the baseline so mint + verify agree.
        return ADMIN_SESSION_VERSION;
      }
      return data.version;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown";
      console.error(`[admin] session version read threw: ${message}`);
      return null;
    }
  },
);

/**
 * Bump the persisted session version via the `bump_admin_session_version` RPC —
 * revoking every outstanding admin cookie (log-out-everywhere / rotate on
 * compromise). Returns the new version, or `null` on failure (logged). The admin
 * client (service_role) is the only grantee.
 */
export async function bumpAdminSessionVersion(): Promise<number | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("bump_admin_session_version", {});
    if (error) {
      console.error(`[admin] session version bump failed: ${error.message}`);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[admin] session version bump threw: ${message}`);
    return null;
  }
}
