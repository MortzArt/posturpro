"use client";

/**
 * Shared admin form primitives (T11, extracted from `store-settings-form.tsx`
 * per research R5/DRY — before six more forms reuse them). Every T11 form
 * (product, taxonomy, variant, inventory, Q&A) composes these so the field
 * anatomy, focus/aria contract, `$`/unit adornments, and `.enter-fade` error
 * motion never drift. Client component (rendered inside `useActionState` forms).
 *
 * The T10 settings form now imports `TextField`, `MoneyField`, `FieldError`,
 * `Banner` from here — behavior-preserving, verified by the admin e2e suite.
 */
import { useId } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/** The canonical field input classes (audited from the T10 settings form). */
export const fieldClasses =
  "w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 disabled:opacity-60";

/** A destructive, `role="alert"`, `.enter-fade` inline field error line. */
export function FieldError({
  id,
  message,
  testid,
}: {
  id: string;
  message: string;
  testid: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      data-testid={testid}
      className="enter-fade flex items-center gap-1 text-xs text-destructive"
    >
      <HugeiconsIcon icon={Alert02Icon} size={13} strokeWidth={2} aria-hidden />
      {message}
    </p>
  );
}

interface TextFieldProps {
  ref?: React.Ref<HTMLInputElement>;
  name: string;
  label: string;
  type?: "text" | "email" | "url";
  defaultValue?: string;
  error?: string | null;
  disabled?: boolean;
  testid: string;
  maxLength?: number;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  autoComplete?: string;
  /** Extra classes merged into the input (e.g. `font-mono` for SKU). */
  inputClassName?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  value?: string;
}

/** Labeled single-line text input with inline error + optional helper. */
export function TextField({
  ref,
  name,
  label,
  type = "text",
  defaultValue,
  error,
  disabled,
  testid,
  maxLength,
  required,
  placeholder,
  helper,
  autoComplete,
  inputClassName,
  onChange,
  value,
}: TextFieldProps) {
  const id = useId();
  const errorId = useId();
  const helperId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(helper ? helperId : undefined, error ? errorId : undefined)}
        data-testid={testid}
        className={cn(fieldClasses, inputClassName)}
      />
      {helper ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
      {error ? <FieldError id={errorId} message={error} testid={`${testid}-error`} /> : null}
    </div>
  );
}

interface MoneyFieldProps {
  ref?: React.Ref<HTMLInputElement>;
  name: string;
  label: string;
  helper?: string;
  labelSuffix?: React.ReactNode;
  defaultValue?: string;
  error?: string | null;
  disabled?: boolean;
  testid: string;
  placeholder?: string;
}

/** Peso input: `$` adornment + `inputmode="decimal"` (never `type=number`). */
export function MoneyField({
  ref,
  name,
  label,
  helper,
  labelSuffix,
  defaultValue,
  error,
  disabled,
  testid,
  placeholder,
}: MoneyFieldProps) {
  const id = useId();
  const errorId = useId();
  const helperId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center text-sm font-medium">
        {label}
        {labelSuffix}
      </label>
      <div
        className={cn(
          "flex min-h-11 items-stretch rounded-md border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
          error && "border-destructive ring-2 ring-destructive/20",
          disabled && "opacity-60",
        )}
      >
        <span
          className="flex items-center border-r border-border px-3 text-sm text-muted-foreground"
          aria-hidden
        >
          $
        </span>
        <input
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(helper ? helperId : undefined, error ? errorId : undefined)}
          data-testid={testid}
          className="w-full bg-transparent px-3 py-2 text-sm tabular-nums text-foreground outline-none disabled:cursor-not-allowed"
        />
      </div>
      {helper ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
      {error ? <FieldError id={errorId} message={error} testid={`${testid}-error`} /> : null}
    </div>
  );
}

interface NumberUnitFieldProps {
  ref?: React.Ref<HTMLInputElement>;
  name: string;
  label: string;
  unit?: string;
  helper?: string;
  defaultValue?: string;
  error?: string | null;
  disabled?: boolean;
  testid: string;
}

/** Numeric field with a trailing unit adornment (cm/kg) — mirrors MoneyField. */
export function NumberUnitField({
  ref,
  name,
  label,
  unit,
  helper,
  defaultValue,
  error,
  disabled,
  testid,
}: NumberUnitFieldProps) {
  const id = useId();
  const errorId = useId();
  const helperId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-11 items-stretch rounded-md border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
          error && "border-destructive ring-2 ring-destructive/20",
          disabled && "opacity-60",
        )}
      >
        <input
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          defaultValue={defaultValue}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(helper ? helperId : undefined, error ? errorId : undefined)}
          data-testid={testid}
          className="w-full bg-transparent px-3 py-2 text-sm tabular-nums text-foreground outline-none disabled:cursor-not-allowed"
        />
        {unit ? (
          <span
            className="flex items-center border-l border-border px-3 text-sm text-muted-foreground"
            aria-hidden
          >
            {unit}
          </span>
        ) : null}
      </div>
      {helper ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
      {error ? <FieldError id={errorId} message={error} testid={`${testid}-error`} /> : null}
    </div>
  );
}

interface SelectFieldProps {
  ref?: React.Ref<HTMLSelectElement>;
  name: string;
  label: string;
  defaultValue?: string;
  error?: string | null;
  disabled?: boolean;
  testid: string;
  helper?: string;
  options: readonly { value: string; label: string }[];
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  value?: string;
}

/** Labeled native `<select>` (keeps forms no-JS-submittable + simple). */
export function SelectField({
  ref,
  name,
  label,
  defaultValue,
  error,
  disabled,
  testid,
  helper,
  options,
  onChange,
  value,
}: SelectFieldProps) {
  const id = useId();
  const errorId = useId();
  const helperId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        ref={ref}
        id={id}
        name={name}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(helper ? helperId : undefined, error ? errorId : undefined)}
        data-testid={testid}
        className={cn(fieldClasses, "appearance-none pr-8")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helper ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
      {error ? <FieldError id={errorId} message={error} testid={`${testid}-error`} /> : null}
    </div>
  );
}

interface TextareaFieldProps {
  ref?: React.Ref<HTMLTextAreaElement>;
  name: string;
  label: string;
  defaultValue?: string;
  error?: string | null;
  disabled?: boolean;
  testid: string;
  maxLength?: number;
  rows?: number;
  helper?: string;
  labelClassName?: string;
  srOnlyLabel?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  value?: string;
}

/** Labeled multi-line plain-text input (Phase 1: no rich text). */
export function TextareaField({
  ref,
  name,
  label,
  defaultValue,
  error,
  disabled,
  testid,
  maxLength,
  rows = 6,
  helper,
  srOnlyLabel,
  onChange,
  value,
}: TextareaFieldProps) {
  const id = useId();
  const errorId = useId();
  const helperId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn("text-sm font-medium", srOnlyLabel && "sr-only")}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(helper ? helperId : undefined, error ? errorId : undefined)}
        data-testid={testid}
        className={cn(fieldClasses, "min-h-24 resize-y")}
      />
      {helper ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
      {error ? <FieldError id={errorId} message={error} testid={`${testid}-error`} /> : null}
    </div>
  );
}

interface SwitchFieldProps {
  name: string;
  label: string;
  helper?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  testid: string;
}

/** A labeled checkbox styled as a settings toggle row. */
export function SwitchField({
  name,
  label,
  helper,
  defaultChecked,
  disabled,
  testid,
}: SwitchFieldProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
    >
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
      </span>
      <input
        id={id}
        name={name}
        type="checkbox"
        value="true"
        defaultChecked={defaultChecked}
        disabled={disabled}
        data-testid={testid}
        className="size-4 shrink-0 accent-primary"
      />
    </label>
  );
}

interface BannerProps {
  ref?: React.Ref<HTMLDivElement>;
  role: "status" | "alert";
  tone: "info" | "error";
  icon: IconSvgElement;
  message: string;
  testid: string;
}

/** Non-blocking status / error banner (`.enter-fade`, RM-safe, focusable when ref'd). */
export function Banner({ ref, role, tone, icon, message, testid }: BannerProps) {
  return (
    <div
      ref={ref}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      tabIndex={ref ? -1 : undefined}
      data-testid={testid}
      className={cn(
        "enter-fade flex items-start gap-2 rounded-md p-3 text-sm outline-none",
        tone === "error"
          ? "border border-destructive/30 bg-destructive/5 text-destructive"
          : "bg-muted/50 text-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
