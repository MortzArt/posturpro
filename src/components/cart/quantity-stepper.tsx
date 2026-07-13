"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/**
 * QuantityStepper (T6 AC-6, AC-7, AC-13, AC-16) — an accessible +/- stepper that
 * changes a cart line's quantity within `[min, max]`. High-frequency action →
 * NO enter/hover animation (emil frequency rule); only a `.cart-step-press`
 * scale on press. The center field is `readOnly` (the value is driven entirely
 * by the buttons), `tabular-nums`, and 44px tall for touch.
 *
 * Bounds: `-` disables at `min` (below-min is impossible via the stepper —
 * removal is the separate Remove control, AC-7); `+` disables at `max` (AC-13).
 * The parent clamps + persists, so `onChange` receives the already-bounded next
 * value. Quantity changes are announced by the page-level `aria-live` region,
 * not per-keystroke here (AC-16, one region per page).
 */

interface QuantityStepperLabels {
  increase: string;
  decrease: string;
  quantityLabel: string;
}

interface QuantityStepperProps {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  labels: QuantityStepperLabels;
  disabled?: boolean;
  className?: string;
}

export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  labels,
  disabled = false,
  className,
}: QuantityStepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div
      className={cn(
        "inline-flex items-center overflow-hidden rounded-md border border-border",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      data-testid="quantity-stepper"
    >
      <StepButton
        icon={MinusSignIcon}
        label={labels.decrease}
        disabled={disabled || atMin}
        onClick={() => onChange(value - 1)}
        testid="quantity-decrease"
      />
      <input
        type="text"
        inputMode="numeric"
        readOnly
        value={value}
        aria-label={labels.quantityLabel}
        data-testid="quantity-value"
        className="h-11 w-11 border-x border-border bg-transparent text-center text-sm tabular-nums text-foreground outline-none"
        tabIndex={-1}
      />
      <StepButton
        icon={PlusSignIcon}
        label={labels.increase}
        disabled={disabled || atMax}
        onClick={() => onChange(value + 1)}
        testid="quantity-increase"
      />
    </div>
  );
}

interface StepButtonProps {
  icon: typeof MinusSignIcon;
  label: string;
  disabled: boolean;
  onClick: () => void;
  testid: string;
}

function StepButton({ icon, label, disabled, onClick, testid }: StepButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
      data-testid={testid}
      className={cn(
        "cart-step-press inline-flex size-11 items-center justify-center text-foreground outline-none",
        "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={2} aria-hidden />
    </button>
  );
}
