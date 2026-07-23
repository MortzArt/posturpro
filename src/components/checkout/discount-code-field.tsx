"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { formatMXN } from "@/lib/money";
import { interpolate } from "@/lib/interpolate";
import type { DiscountResult } from "@/app/[locale]/checkout/checkout-form-state";
import type { DiscountInvalidReason } from "@/lib/checkout/discount";
import { cn } from "@/lib/utils";

/**
 * DiscountCodeField (T7 AC-6, AC-7) — a controlled code input carried into the
 * single `placeOrder` submit, plus an "Apply" button that pre-checks the code
 * via the read-only `checkDiscountCode` action so the shopper learns whether it
 * works BEFORE placing the order. The rendered outcome (applied / invalid /
 * degraded) always comes from a server result — pre-check or submit — never
 * claimed by the client. A bad code NEVER blocks submit (AC-7) — the input just
 * shows an inline note and the order proceeds at full price. Enter inside the
 * input triggers the pre-check, not the whole-form submit (a shopper pressing
 * Enter on a code expects validation, not an order).
 */

const fieldClasses =
  "w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export interface DiscountFieldLabels {
  label: string;
  placeholder: string;
  apply: string;
  checking: string;
  appliedLabel: string;
  savings: string;
  remove: string;
  invalid: Record<DiscountInvalidReason, string>;
  degraded: string;
}

interface DiscountCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Pre-check the current code (the Apply button / Enter in the input). */
  onApply: () => void;
  /** `true` while a pre-check round-trip is in flight. */
  checking: boolean;
  result: DiscountResult;
  disabled: boolean;
  labels: DiscountFieldLabels;
}

export function DiscountCodeField({
  value,
  onChange,
  onApply,
  checking,
  result,
  disabled,
  labels,
}: DiscountCodeFieldProps) {
  const note = resolveNote(result, labels);
  const applied = result.kind === "applied";
  const applyDisabled = disabled || checking || value.trim().length === 0;

  return (
    <div className="flex flex-col gap-1.5" data-testid="checkout-discount-field">
      <label htmlFor="checkout-discount-code" className="text-sm font-medium text-foreground">
        {labels.label}
      </label>
      {/* The code is always a plain input carried into the single submit; when a
          valid code applied we surface the applied pill ABOVE it as feedback. */}
      {applied ? (
        <AppliedPill
          code={result.code}
          discountCents={result.discountCents}
          onRemove={() => onChange("")}
          disabled={disabled}
          labels={labels}
        />
      ) : null}
      <div className="flex gap-2">
        <input
          id="checkout-discount-code"
          name="discountCode"
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter validates the code instead of submitting the whole form.
            if (event.key === "Enter") {
              event.preventDefault();
              if (!applyDisabled) {
                onApply();
              }
            }
          }}
          placeholder={labels.placeholder}
          aria-invalid={note?.tone === "error" ? true : undefined}
          data-testid="checkout-discount-input"
          className={cn(fieldClasses, "min-w-0 flex-1 uppercase disabled:opacity-60")}
        />
        <button
          type="button"
          onClick={onApply}
          disabled={applyDisabled}
          data-testid="checkout-discount-apply"
          className="cart-step-press inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-60"
        >
          {checking ? labels.checking : labels.apply}
        </button>
      </div>
      {note ? (
        <p
          role="alert"
          data-testid="checkout-discount-note"
          className={cn(
            "enter-fade text-xs",
            note.tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          <HugeiconsIcon
            icon={Alert02Icon}
            size={13}
            strokeWidth={2}
            aria-hidden
            className="mr-1 inline align-[-2px]"
          />
          {note.message}
        </p>
      ) : null}
    </div>
  );
}

function AppliedPill({
  code,
  discountCents,
  onRemove,
  disabled,
  labels,
}: {
  code: string;
  discountCents: number;
  onRemove: () => void;
  disabled: boolean;
  labels: DiscountFieldLabels;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
      data-testid="checkout-discount-applied"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} strokeWidth={2} aria-hidden />
        <span className="truncate font-medium">{interpolate(labels.appliedLabel, { code })}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums" data-testid="checkout-discount-savings">
          {interpolate(labels.savings, { amount: formatMXN(discountCents) })}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={labels.remove}
          data-testid="checkout-discount-remove"
          className="cart-step-press rounded px-1 text-xs underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
        >
          {labels.remove}
        </button>
      </span>
    </div>
  );
}

/** Resolve the inline note (message + tone) from a discount result. */
function resolveNote(
  result: DiscountResult,
  labels: DiscountFieldLabels,
): { message: string; tone: "error" | "muted" } | null {
  switch (result.kind) {
    case "invalid":
      return { message: labels.invalid[result.reason], tone: "error" };
    case "degraded":
      return { message: labels.degraded, tone: "muted" };
    default:
      return null;
  }
}
