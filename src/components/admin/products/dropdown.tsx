"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Minimal accessible dropdown menu (T11) — the ticket marks a `dropdown-menu`
 * primitive optional, so this is a small hand-rolled one for the product/order-
 * row `⋮` actions: click/keyboard toggle, outside-click + Esc close, `role="menu"`
 * / `menuitem`, focus returns to the trigger on close. No new runtime dep.
 *
 * The menu is PORTALED to `document.body` and positioned `fixed` from the
 * trigger's bounding rect, so it is never clipped by an ancestor's
 * `overflow` (the orders/products tables scroll horizontally — an `absolute`
 * menu was cut off at the table edge). Position is recomputed on open and on
 * scroll/resize while open.
 */
interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerId: string;
  menuId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdown(): DropdownContextValue {
  const context = useContext(DropdownContext);
  if (!context) throw new Error("Dropdown parts must be used within <DropdownMenu>");
  return context;
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <DropdownContext.Provider value={{ open, setOpen, triggerId, menuId, triggerRef }}>
      <div className="relative inline-block text-left">{children}</div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({
  children,
  className,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen, triggerId, menuId, triggerRef } = useDropdown();
  return (
    <button
      ref={triggerRef}
      type="button"
      id={triggerId}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(!open);
      }}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 sm:size-8",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Gap in px between the trigger and the menu (matches the old `mt-1`). */
const MENU_OFFSET_PX = 4;
/** Assumed menu width for `end`-aligned positioning before it is measured (`min-w-44` = 11rem). */
const MENU_MIN_WIDTH_PX = 176;

interface MenuPosition {
  top: number;
  left: number;
}

export function DropdownMenuContent({
  children,
  align = "end",
}: {
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  const { open, setOpen, menuId, triggerId, triggerRef } = useDropdown();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Position the menu from the trigger rect (viewport coords → `position: fixed`).
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = (): void => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = menuRef.current?.offsetWidth ?? MENU_MIN_WIDTH_PX;
      const rawLeft = align === "end" ? rect.right - width : rect.left;
      // Clamp within the viewport so the menu is never pushed off-screen.
      const maxLeft = window.innerWidth - width - MENU_OFFSET_PX;
      const left = Math.max(MENU_OFFSET_PX, Math.min(rawLeft, maxLeft));
      setPosition({ top: rect.bottom + MENU_OFFSET_PX, left });
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, align, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, triggerRef]);

  if (!open || !mounted) return null;
  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-labelledby={triggerId}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
      className="dialog-content-motion fixed z-50 min-w-44 rounded-md border border-border bg-card p-1 shadow-lg outline-none"
    >
      {children}
    </div>,
    document.body,
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  className,
  ...rest
}: {
  children: React.ReactNode;
  onSelect: () => void;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">) {
  const { setOpen } = useDropdown();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
