import { redirect } from "next/navigation";
import { ADMIN_SETTINGS_PATH } from "@/lib/admin/constants";

/**
 * Admin landing (`/admin`) — redirects to Store Settings (T10, decision).
 * Phase 1 has exactly one working section, so a separate dashboard would be dead
 * UI. T11/T12 SEAM: replace this redirect with an `AdminPage` overview (product
 * count, pending-order count, quick links) — the nav already lists all sections,
 * so it is a one-file change, no shell/nav rewrite.
 */
export default function AdminIndexPage() {
  redirect(ADMIN_SETTINGS_PATH);
}
