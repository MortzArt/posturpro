"use client";

import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { cn } from "@/lib/utils";

/**
 * MobileNav drawer (T2 AC-5, AC-13, edge case 4).
 *
 * Below `md` the hamburger opens a left slide-in drawer with the primary nav
 * and the language toggle. Built on the Radix Dialog primitive for free focus
 * trap, Esc-to-close, scroll-lock, and `role="dialog" aria-modal`. The panel
 * and scrim are `forceMount`ed so their open/close is driven by CSS TRANSITIONS
 * (`.drawer-panel` / `.drawer-scrim` in globals.css) keyed off Radix's
 * `data-state` — this makes a mid-open dismiss interruptible (AC-13) and gives
 * an opacity-only fallback under reduced motion (edge case 4).
 *
 * The trigger is hidden at `md+` (inline nav takes over); if the viewport
 * crosses to `md` while open, the drawer closes so it never lingers.
 */

/** Tailwind `md` breakpoint in px — the drawer is mobile-only below this. */
const MD_BREAKPOINT_PX = 768;

export function MobileNav() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const mediaQuery = window.matchMedia(
      `(min-width: ${MD_BREAKPOINT_PX}px)`,
    );
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
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-testid="mobile-nav-trigger"
          aria-label={t("openMenu")}
          className={cn(
            "nav-hover inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground outline-none md:hidden",
            "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <HugeiconsIcon
            icon={Menu01Icon}
            size={22}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal forceMount>
        <Dialog.Overlay
          forceMount
          data-testid="mobile-nav-overlay"
          className="drawer-scrim fixed inset-0 z-[60] bg-black/50 data-[state=closed]:pointer-events-none"
        />
        <Dialog.Content
          forceMount
          data-testid="mobile-nav-panel"
          aria-describedby={undefined}
          className={cn(
            "drawer-panel fixed inset-y-0 left-0 z-[60] flex h-full w-[85vw] max-w-xs flex-col",
            "border-r border-border bg-background shadow-xl outline-none",
            "data-[state=closed]:pointer-events-none",
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <Dialog.Title className="truncate text-base font-semibold tracking-tight">
              {t("menuTitle")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                data-testid="mobile-nav-close"
                aria-label={t("closeMenu")}
                className={cn(
                  "nav-hover inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground outline-none",
                  "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={20}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            </Dialog.Close>
          </div>

          <nav
            aria-label={t("menuTitle")}
            className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                data-testid={`mobile-nav-item-${item.key}`}
                onClick={() => setOpen(false)}
                className={cn(
                  "nav-hover flex items-center rounded-md px-3 py-3 text-base font-medium text-foreground outline-none",
                  "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {t(`items.${item.key}`)}
              </Link>
            ))}
          </nav>

          <div className="shrink-0 border-t border-border p-4">
            <LanguageToggle variant="segmented" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
