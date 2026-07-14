"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/**
 * Shared checkout field primitives (T7). The `fieldClasses` string mirrors the
 * Q&A form, bumped to `min-h-11` so tap targets are ≥44px on mobile. Raw
 * `<label>`/`<input>` for visual parity with the nearest form sibling (the
 * design decision recorded in ui-design.md), not the denser shadcn `Input`.
 */

export const fieldClasses =
  "w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 disabled:opacity-60";

export interface TextFieldProps {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "email" | "numeric" | "tel";
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
  autoCapitalize?: "off" | "characters";
  disabled?: boolean;
  error?: string | null;
  errorId?: string;
  testId?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

/** A labeled text input with wired `aria-invalid`/`aria-describedby` + error. */
export function TextField({
  id,
  name,
  label,
  defaultValue,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  required,
  autoCapitalize,
  disabled,
  error,
  errorId,
  testId,
  inputRef,
}: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required={required}
        autoCapitalize={autoCapitalize}
        disabled={disabled}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && errorId ? errorId : undefined}
        data-testid={testId}
        className={fieldClasses}
      />
      {error && errorId ? <FieldError id={errorId} message={error} /> : null}
    </div>
  );
}

/** A field-scoped, localized error with the Q&A alert-icon treatment. */
export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="enter-fade text-xs text-destructive"
      data-testid={`${id}-error`}
    >
      <HugeiconsIcon
        icon={Alert02Icon}
        size={13}
        strokeWidth={2}
        aria-hidden
        className={cn("mr-1 inline align-[-2px]")}
      />
      {message}
    </p>
  );
}

/** A titled card section wrapper (house convention — no `Card` primitive). */
export function CheckoutCard({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-5">
      <h2 className="text-sm font-medium text-foreground">{heading}</h2>
      {children}
    </section>
  );
}
