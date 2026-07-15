import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { hasValidAdminSession } from "@/lib/admin/session-guard";
import { getStoreSettings } from "@/lib/store-settings";
import { ADMIN_LOGIN_PATH } from "@/lib/admin/constants";
import { SEED_STORE_NAME } from "@/lib/config";

/**
 * Authenticated admin sub-layout (T10 AC-1, AC-11) — guards EVERY page in the
 * `(app)` group (defense-in-depth: the middleware already redirected, but a
 * matcher edge case that bypassed it is still caught here, authoritatively via
 * `node:crypto`). Unauthenticated → redirect to `/admin/login` (no admin markup
 * rendered). Then wraps children in the `AdminShell` (nav + logout), seeded with
 * the live store name (fallback `SEED_STORE_NAME`). The active section is
 * resolved per-page below the shell.
 */
export default async function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasValidAdminSession())) {
    redirect(ADMIN_LOGIN_PATH);
  }

  const settings = await getStoreSettings();
  const storeName = settings?.store_name ?? SEED_STORE_NAME;

  // The shell resolves the active nav section from the current pathname, so
  // T11/T12 add sections without threading a prop through every page.
  return <AdminShell storeName={storeName}>{children}</AdminShell>;
}
