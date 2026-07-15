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
  /** Unanswered Q&A count → the "Preguntas" badge (T11); 0 renders no badge. */
  unansweredCount?: number;
}

export function AdminNav({ activeSection, unansweredCount = 0 }: AdminNavProps) {
  return (
    <nav aria-label="Administración" className="flex flex-1 flex-col gap-0.5 p-2">
      {ADMIN_NAV_ITEMS.map((item, index) => {
        const previousGroup = index > 0 ? ADMIN_NAV_ITEMS[index - 1].group : undefined;
        const showGroup = item.group !== undefined && item.group !== previousGroup;
        return (
          <div key={item.id}>
            {showGroup ? (
              <p className="px-3 pb-1 pt-3 text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground/70">
                {item.group}
              </p>
            ) : null}
            <AdminNavRow
              item={item}
              active={item.id === activeSection}
              badgeCount={item.id === "qa" ? unansweredCount : 0}
            />
          </div>
        );
      })}
      <div className="mt-auto border-t border-border p-2">
        <LogoutButton />
      </div>
    </nav>
  );
}

/** A single nav row — live+active, live+inactive, or soon (disabled). */
function AdminNavRow({
  item,
  active,
  badgeCount,
}: {
  item: AdminNavItem;
  active: boolean;
  badgeCount: number;
}) {
  if (item.status === "soon") {
    return <SoonRow item={item} />;
  }
  return <LiveRow item={item} active={active} badgeCount={badgeCount} />;
}

/** Base row layout shared by all three states. */
const rowClasses =
  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none";

function LiveRow({
  item,
  active,
  badgeCount,
}: {
  item: AdminNavItem;
  active: boolean;
  badgeCount: number;
}) {
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
      {badgeCount > 0 ? (
        <Badge
          variant="secondary"
          data-testid={`admin-nav-${item.id}-badge`}
          className="ml-auto tabular-nums"
        >
          {badgeCount}
        </Badge>
      ) : null}
    </Link>
  );
}

function SoonRow({ item }: { item: AdminNavItem }) {
  // Disabled placeholders are WCAG-exempt, but the label must still be readable
  // so the operator can understand the roadmap. Keep the label at full
  // `text-muted-foreground` (≈4.7:1) and let the dimmer icon + "próximamente"
  // badge + `cursor-not-allowed` carry the "not yet available" signal instead of
  // fading the text to near-invisibility.
  return (
    <span
      aria-disabled="true"
      data-testid={`admin-nav-${item.id}`}
      className={cn(rowClasses, "cursor-not-allowed text-muted-foreground")}
    >
      <HugeiconsIcon
        icon={item.icon}
        size={16}
        strokeWidth={2}
        aria-hidden
        className="text-muted-foreground/60"
      />
      <span>{item.label}</span>
      <Badge variant="secondary" className="ml-auto text-[0.625rem] font-medium">
        próximamente
      </Badge>
    </span>
  );
}
