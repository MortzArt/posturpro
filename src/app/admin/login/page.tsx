import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { hasValidAdminSession } from "@/lib/admin/session-guard";
import { getStoreSettings } from "@/lib/store-settings";
import { ADMIN_ROOT_PATH } from "@/lib/admin/constants";
import { SEED_STORE_NAME } from "@/lib/config";

/**
 * Login screen (`/admin/login`, T10 AC-7) — server component. Lives OUTSIDE the
 * `(app)` guard group, so it renders without the shell and is reachable while
 * unauthenticated. If ALREADY authenticated it redirects to `/admin` (no reason
 * to re-login). Passes only the store name to the client `LoginForm` — NO secret
 * ever crosses to the client (AC-12).
 */
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await hasValidAdminSession()) {
    redirect(ADMIN_ROOT_PATH);
  }
  const settings = await getStoreSettings();
  const storeName = settings?.store_name ?? SEED_STORE_NAME;
  return <LoginForm storeName={storeName} />;
}
