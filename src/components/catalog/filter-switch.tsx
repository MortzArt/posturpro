"use client";

import { cn } from "@/lib/utils";

/**
 * FilterSwitch — an on/off toggle backed by a NATIVE `<input type="checkbox">`
 * (with `role="switch"`), used for the single boolean facet (availability). Like
 * `FilterChip`, the input is the full hit target (absolute, `opacity-0`) so
 * pointer, keyboard, form participation and test hooks all address the real
 * control; the track + thumb paint state via `peer-*`. Motion: the thumb slides
 * on `transform` only (compositor-friendly), ease-out, ~150ms, and stands still
 * under reduced motion. Colour is never the only signal — the thumb position is.
 */

interface FilterSwitchProps {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  name?: string;
  value?: string;
  testId?: string;
}

export function FilterSwitch({
  id,
  label,
  checked,
  onCheckedChange,
  name,
  value,
  testId,
}: FilterSwitchProps) {
  return (
    <label
      htmlFor={id}
      className="relative flex min-h-9 cursor-pointer items-center justify-between gap-3 select-none"
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type="checkbox"
        role="switch"
        id={id}
        name={name}
        value={value}
        checked={checked}
        data-testid={testId}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-md opacity-0"
      />
      {/* Track */}
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent bg-input p-0.5",
          "transition-colors duration-150 ease-out motion-reduce:transition-none",
          "peer-hover:bg-foreground/20 peer-checked:bg-primary peer-checked:peer-hover:bg-primary",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          // Thumb (child) — slides 20px on checked; transform only.
          "[&>span]:size-5 [&>span]:rounded-full [&>span]:bg-card [&>span]:shadow-sm",
          "[&>span]:transition-transform [&>span]:duration-150 [&>span]:ease-out motion-reduce:[&>span]:transition-none",
          "peer-checked:[&>span]:translate-x-5",
        )}
      >
        <span />
      </span>
    </label>
  );
}
