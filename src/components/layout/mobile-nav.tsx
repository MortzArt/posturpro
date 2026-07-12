"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { FocusScope } from "@radix-ui/react-focus-scope";
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
 *
 * FORCE-MOUNT DISMISS GUARD: because the Content layer is `forceMount`ed, its
 * DismissableLayer keeps a document-level pointer listener alive while closed.
 * The very tap that opens the drawer would otherwise be seen as an
 * "interact-outside" and close it in the same tick (open→close within ~7ms —
 * the drawer never appears on a pointer/tap, only via keyboard). We suppress
 * that by ignoring any outside-interaction whose target is the trigger itself.
 */

/** Tailwind `md` breakpoint in px — the drawer is mobile-only below this. */
const MD_BREAKPOINT_PX = 768;

/**
 * How long the closed panel stays mounted so its slide-out CSS transition can
 * finish before Radix's Content (and its `hideOthers` guard) unmounts. Matches
 * the 200ms `.drawer-panel[data-state="closed"]` exit in globals.css, with a
 * small buffer.
 */
const DRAWER_EXIT_MS = 260;

export function MobileNav() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  // Whether the closed panel is still playing its slide-out transition. Combined
  // with `open` this gates whether the Dialog.Content (portal) is in the DOM:
  //   mounted = open || closing
  // Crucially, once fully closed AND the transition has finished, the Content
  // UNMOUNTS — which is what clears Radix's modal `hideOthers` guard. If the
  // Content were `forceMount`ed permanently, that guard would keep
  // `aria-hidden="true"` on the entire shell (header, main, footer, every
  // heading) forever, hiding it from assistive tech on every page even with the
  // drawer closed (AC-17 defect). Mounting only when needed preserves the CSS
  // exit transition AND the modal focus trap / correct while-open hiding.
  const [closing, setClosing] = useState(false);
  const mounted = open || closing;
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Tracks whether the drawer was open on the previous render, so the exit
  // transition (and its brief mount) only runs after a real open→close — never
  // on initial mount (which would needlessly re-apply `hideOthers` for 260ms).
  const wasOpenRef = useRef(false);

  useEffect(() => {
    // Keep the panel mounted for the exit transition after a real open→close,
    // then unmount it (clearing `hideOthers`). Opening cancels any pending
    // unmount. `open` itself already keeps the panel mounted while true, so no
    // setState is needed on the open branch (avoids set-state-in-effect).
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) {
      // Never opened yet → nothing to transition out; stay unmounted.
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
          ref={triggerRef}
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

      {/* The portal (overlay + panel) is mounted only while open or during the
          brief close transition (see `mounted`). Once fully closed it unmounts,
          which clears Radix's modal `hideOthers` guard so the shell is exposed
          to assistive tech again (AC-17). While mounted, `forceMount` on the
          layers keeps their open/close driven by CSS transitions off Radix's
          `data-state`. */}
      {mounted ? (
        <Dialog.Portal forceMount>
          <Dialog.Overlay
            forceMount
            data-testid="mobile-nav-overlay"
            className="drawer-scrim fixed inset-0 z-[60] bg-black/50"
          />
          <Dialog.Content
            forceMount
            data-testid="mobile-nav-panel"
          onInteractOutside={(event) => {
            // Ignore the trigger's own tap — otherwise the opening pointer is
            // treated as an outside-interaction and dismisses the drawer in the
            // same tick (forceMount keeps this layer's listeners alive).
            const target = event.target as Node | null;
            if (target && triggerRef.current?.contains(target)) {
              event.preventDefault();
            }
          }}
          aria-modal={open ? true : undefined}
          className={cn(
            "drawer-panel fixed inset-y-0 left-0 z-[60] flex h-full w-[85vw] max-w-xs flex-col",
            "border-r border-border bg-background shadow-xl outline-none",
          )}
        >
          {/* The panel is force-mounted (so its slide-out is an interruptible
              CSS transition), which bypasses Radix's modal focus trap. Mount a
              trapped FocusScope ONLY while open: it moves focus into the panel,
              keeps Tab/Shift-Tab cycling inside it, and restores focus to the
              trigger on close — the a11y contract a real modal drawer needs
              (T2 AC-5). It unmounts on close (restoring focus) while the panel
              keeps transitioning out underneath. */}
          {open ? (
            <FocusScope asChild loop trapped>
              <div className="flex h-full flex-col">
                <MobileNavBody
                  t={t}
                  onNavigate={() => setOpen(false)}
                />
              </div>
            </FocusScope>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}

interface MobileNavBodyProps {
  t: ReturnType<typeof useTranslations>;
  onNavigate: () => void;
}

/**
 * The drawer's inner content (header row, nav list, language toggle). Extracted
 * so it can be wrapped in a {@link FocusScope} that mounts only while open —
 * keeping the render tree small and the focus-trap boundary explicit.
 */
function MobileNavBody({ t, onNavigate }: MobileNavBodyProps) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <Dialog.Title className="truncate text-base font-semibold tracking-tight">
              {t("menuTitle")}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {t("menuDescription")}
            </Dialog.Description>
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
                onClick={onNavigate}
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
        {/* Raise the group to a ≥44px touch target inside the drawer (AC-14);
            options fill the height via `h-full`. Header keeps compact `h-9`. */}
        <LanguageToggle variant="segmented" className="h-11" />
      </div>
    </>
  );
}
