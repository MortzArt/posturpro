"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/admin/logout-button";
import { ADMIN_NAV_ITEMS, type AdminSectionId } from "@/lib/admin/constants";
import { cn } from "@/lib/utils";

/**
 * AdminShell (T10 AC-11) — the persistent admin frame. Desktop (≥ md): a
 * persistent left sidebar (store identity, nav, logout pinned bottom). Mobile
 * (< md): a sticky top bar with a hamburger that opens a left slide-in drawer
 * reusing the storefront `.drawer-panel`/`.drawer-scrim` CSS (spatial
 * consistency, interruptible, reduced-motion handled — no new motion invented).
 * The nav list is shared by both surfaces via `AdminNav` so they never diverge.
 */
interface AdminShellProps {
  storeName: string;
  children: React.ReactNode;
}

/** Tailwind `md` breakpoint in px — drawer is mobile-only below this. */
const MD_BREAKPOINT_PX = 768;
/** Closed-panel mount buffer so the slide-out CSS transition finishes (matches globals.css). */
const DRAWER_EXIT_MS = 260;

/** Resolve the active section from the current pathname (data-driven from nav). */
function useActiveSection(): AdminSectionId {
  const pathname = usePathname();
  const match = ADMIN_NAV_ITEMS.find(
    (item) => item.status === "live" && pathname.startsWith(item.href),
  );
  return match?.id ?? "settings";
}

export function AdminShell({ storeName, children }: AdminShellProps) {
  const activeSection = useActiveSection();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#admin-content"
        className="sr-only rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground outline-none focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:ring-2 focus:ring-ring"
      >
        Saltar al contenido
      </a>

      <DesktopSidebar storeName={storeName} activeSection={activeSection} />
      <MobileTopBar storeName={storeName} activeSection={activeSection} />

      <main id="admin-content" className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Persistent left sidebar (≥ md). */
function DesktopSidebar({
  storeName,
  activeSection,
}: {
  storeName: string;
  activeSection: AdminSectionId;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-card md:flex lg:w-60">
      <div className="border-b border-border px-4 py-4">
        <p className="truncate text-sm font-semibold tracking-tight text-foreground">
          {storeName}
        </p>
        <p className="text-xs text-muted-foreground">Administración</p>
      </div>
      <AdminNav activeSection={activeSection} />
    </aside>
  );
}

/** Sticky mobile top bar with hamburger + slide-in drawer (< md). */
function MobileTopBar({
  storeName,
  activeSection,
}: {
  storeName: string;
  activeSection: AdminSectionId;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const mounted = open || closing;

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = false;
    setClosing(true);
    const timer = window.setTimeout(() => setClosing(false), DRAWER_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const mediaQuery = window.matchMedia(`(min-width: ${MD_BREAKPOINT_PX}px)`);
    const closeIfDesktop = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) {
        setOpen(false);
      }
    };
    closeIfDesktop(mediaQuery);
    mediaQuery.addEventListener("change", closeIfDesktop);
    return () => mediaQuery.removeEventListener("change", closeIfDesktop);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <Dialog.Trigger asChild>
            <button
              ref={triggerRef}
              type="button"
              data-testid="admin-nav-trigger"
              aria-label="Abrir menú"
              aria-expanded={open}
              className="nav-hover inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={2} aria-hidden />
            </button>
          </Dialog.Trigger>
          <span className="truncate text-sm font-semibold tracking-tight">
            {storeName}
          </span>
        </div>
        <LogoutButton compact />
      </header>

      {mounted ? (
        <Dialog.Portal forceMount>
          <Dialog.Overlay
            forceMount
            data-testid="admin-nav-overlay"
            className="drawer-scrim fixed inset-0 z-[60] bg-black/50 md:hidden"
          />
          <Dialog.Content
            forceMount
            data-testid="admin-nav-panel"
            onInteractOutside={(event) => {
              const target = event.target as Node | null;
              if (target && triggerRef.current?.contains(target)) {
                event.preventDefault();
              }
            }}
            aria-modal={open ? true : undefined}
            className={cn(
              "drawer-panel fixed inset-y-0 left-0 z-[60] flex h-full w-[85vw] max-w-xs flex-col md:hidden",
              "border-r border-border bg-card shadow-xl outline-none",
            )}
          >
            {open ? (
              <FocusScope asChild loop trapped>
                <div className="flex h-full flex-col">
                  <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                    <Dialog.Title className="truncate text-sm font-semibold tracking-tight">
                      {storeName}
                    </Dialog.Title>
                    <Dialog.Description className="sr-only">
                      Navegación de administración
                    </Dialog.Description>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        data-testid="admin-nav-close"
                        aria-label="Cerrar menú"
                        className="nav-hover inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={2} aria-hidden />
                      </button>
                    </Dialog.Close>
                  </div>
                  <AdminNav activeSection={activeSection} />
                </div>
              </FocusScope>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
