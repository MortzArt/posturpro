"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterHorizontalIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  DeferredFilterNavigationProvider,
  useDeferredFilters,
} from "@/components/catalog/filter-navigation";
import { cn } from "@/lib/utils";

/**
 * FilterSheet (T5 AC-13, AC-18). Mobile/tablet (`< lg`) container for the
 * FilterPanel. Built on the Radix Dialog primitive and the repo's proven,
 * interruptible `.drawer-panel`/`.drawer-scrim` CSS-transition motion (M-1) —
 * spatial consistency with the MobileNav drawer (both slide from the left) and
 * NOT shadcn's keyframe Sheet (keyframes restart from zero, not interruptible).
 *
 * The force-mount + brief-close-mount + FocusScope-only-while-open pattern is
 * lifted from MobileNav so the exit transition plays without leaving a
 * permanent `hideOthers` aria-hidden guard on the shell (the T2 QA fix).
 */

/** Tailwind `lg` breakpoint in px — the sheet is only for `< lg`. */
const LG_BREAKPOINT_PX = 1024;

/** Match the 200ms `.drawer-panel[data-state="closed"]` exit + a small buffer. */
const DRAWER_EXIT_MS = 260;

interface FilterSheetProps {
  activeCount: number;
  labels: {
    trigger: string;
    title: string;
    close: string;
  };
  children: React.ReactNode;
}

export function FilterSheet({
  activeCount,
  labels,
  children,
}: FilterSheetProps) {
  const t = useTranslations("catalog.filters");
  const [open, setOpen] = useState(false);
  // The trigger badge reflects the real active-filter count (known client-side).
  const triggerLabel =
    activeCount > 0
      ? t("triggerCount", { count: activeCount })
      : labels.trigger;
  // Filters inside the sheet are DEFERRED (owner request 2026-09-13): taps edit
  // a draft and nothing navigates until Apply, so the button carries the static
  // label — the result count is unknown until the batch is committed.
  const applyLabel = t("applyButton");
  const [closing, setClosing] = useState(false);
  const mounted = open || closing;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    setClosing(true);
    const timer = window.setTimeout(() => setClosing(false), DRAWER_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Lock background scroll while the sheet is open (M-6). The forceMount +
  // manual-FocusScope pattern bypasses Radix's automatic modal scroll-lock, so
  // the catalog behind the full-height drawer would otherwise scroll on mobile.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const mediaQuery = window.matchMedia(`(min-width: ${LG_BREAKPOINT_PX}px)`);
    const closeIfDesktop = (
      event: MediaQueryListEvent | MediaQueryList,
    ): void => {
      if (event.matches) setOpen(false);
    };
    closeIfDesktop(mediaQuery);
    mediaQuery.addEventListener("change", closeIfDesktop);
    return () => mediaQuery.removeEventListener("change", closeIfDesktop);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11 lg:hidden"
          data-testid="filter-sheet-trigger"
        >
          <HugeiconsIcon
            icon={FilterHorizontalIcon}
            size={18}
            strokeWidth={2}
            aria-hidden
          />
          {triggerLabel}
        </Button>
      </Dialog.Trigger>

      {mounted ? (
        <Dialog.Portal forceMount>
          <Dialog.Overlay
            forceMount
            data-testid="filter-sheet-overlay"
            className="drawer-scrim fixed inset-0 z-[60] bg-black/50 lg:hidden"
          />
          <Dialog.Content
            forceMount
            data-testid="filter-sheet-panel"
            onInteractOutside={(event) => {
              const target = event.target as Node | null;
              if (target && triggerRef.current?.contains(target)) {
                event.preventDefault();
              }
            }}
            aria-modal={open ? true : undefined}
            className={cn(
              "drawer-panel fixed inset-y-0 left-0 z-[60] flex h-full w-[90vw] max-w-sm flex-col lg:hidden",
              "border-r border-border bg-card shadow-xl outline-none",
            )}
          >
            {open ? (
              <FocusScope asChild loop trapped>
                <div className="flex h-full flex-col">
                  <DeferredFilterNavigationProvider>
                    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                      <Dialog.Title className="font-heading text-base font-semibold tracking-[-0.02em]">
                        {labels.title}
                      </Dialog.Title>
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          data-testid="filter-sheet-close"
                          aria-label={labels.close}
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

                    <div className="scrollbar-quiet flex-1 overflow-y-auto p-4">
                      {children}
                    </div>

                    <div className="shrink-0 border-t border-border bg-card/80 p-4 backdrop-blur">
                      <ApplyDraftButton
                        label={applyLabel}
                        onApplied={() => setOpen(false)}
                      />
                    </div>
                  </DeferredFilterNavigationProvider>
                </div>
              </FocusScope>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}

/** Commits the sheet's draft filters (one navigation) and closes the sheet. */
function ApplyDraftButton({
  label,
  onApplied,
}: {
  label: string;
  onApplied: () => void;
}) {
  const deferred = useDeferredFilters();
  return (
    <Button
      type="button"
      variant="cta"
      size="xl"
      className="min-h-11 w-full"
      data-testid="filter-sheet-apply"
      onClick={() => {
        deferred?.commit();
        onApplied();
      }}
    >
      {label}
    </Button>
  );
}
