import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

/**
 * Logout control (T10 AC-6) — a real `<form action={logout}>` POST so it works
 * without JS and re-verifies nothing client-side (the action clears the cookie
 * and redirects). Two presentations share one implementation: the full-width
 * sidebar/drawer row, and a `compact` icon+label used in the mobile top bar.
 */
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logout}>
      <Button
        type="submit"
        variant="ghost"
        data-testid="admin-logout"
        aria-label="Cerrar sesión"
        className={cn(
          "gap-2 text-muted-foreground hover:text-foreground",
          compact
            ? "h-9 px-2 text-sm"
            : "h-auto w-full justify-start gap-2.5 px-3 py-2 text-sm",
        )}
      >
        <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={2} aria-hidden />
        <span>Cerrar sesión</span>
      </Button>
    </form>
  );
}
