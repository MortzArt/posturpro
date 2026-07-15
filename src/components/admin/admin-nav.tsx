import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "@/components/admin/logout-button";
import {
  ADMIN_NAV_ITEMS,
  type AdminNavItem,
  type AdminSectionId,
} from "@/lib/admin/constants";
import { cn } from "@/lib/utils";

/**
 * AdminNav (T10 AC-11) — the single source of the admin nav definition, rendered
 * by both the desktop sidebar and the mobile drawer so they never diverge. Data-
 * driven from `ADMIN_NAV_ITEMS`: T11/T12 flip a `soon` item to `live` (+ href)
 * with zero JSX changes. Live items are `next/link`s; `soon` items are
 * non-interactive spans with a "próximamente" badge; logout is a real `<form>`
 * POST (works without JS). Server component — no client state needed.
 */
interface AdminNavProps {
  /** Which section is active (drives `aria-current` + emphasis). */
  activeSection: AdminSectionId;
}

export function AdminNav({ activeSection }: AdminNavProps) {
  return (
    <nav aria-label="Administración" className="flex flex-1 flex-col gap-0.5 p-2">
      {ADMIN_NAV_ITEMS.map((item) => (
        <AdminNavRow key={item.id} item={item} active={item.id === activeSection} />
      ))}
      <div className="mt-auto border-t border-border p-2">
        <LogoutButton />
      </div>
    </nav>
  );
}

/** A single nav row — live+active, live+inactive, or soon (disabled). */
function AdminNavRow({ item, active }: { item: AdminNavItem; active: boolean }) {
  if (item.status === "soon") {
    return <SoonRow item={item} />;
  }
  return <LiveRow item={item} active={active} />;
}

/** Base row layout shared by all three states. */
const rowClasses =
  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none";

function LiveRow({ item, active }: { item: AdminNavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-testid={`admin-nav-${item.id}`}
      className={cn(
        rowClasses,
        "nav-hover focus-visible:ring-2 focus-visible:ring-ring/30",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <HugeiconsIcon icon={item.icon} size={16} strokeWidth={2} aria-hidden />
      <span>{item.label}</span>
    </Link>
  );
}

function SoonRow({ item }: { item: AdminNavItem }) {
  return (
    <span
      aria-disabled="true"
      data-testid={`admin-nav-${item.id}`}
      className={cn(
        rowClasses,
        "cursor-not-allowed text-muted-foreground/60",
      )}
    >
      <HugeiconsIcon icon={item.icon} size={16} strokeWidth={2} aria-hidden />
      <span>{item.label}</span>
      <Badge variant="secondary" className="ml-auto text-[0.625rem] font-medium">
        próximamente
      </Badge>
    </span>
  );
}
