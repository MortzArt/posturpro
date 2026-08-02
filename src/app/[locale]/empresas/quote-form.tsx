"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { interpolate } from "@/lib/interpolate";
import { QUOTE_SUCCESS_FEEDBACK_MS, QUOTE_TEAM_SIZES } from "@/lib/config";
import { submitQuoteForm } from "./actions";
import {
  initialQuoteFormState,
  type QuoteFormState,
} from "./quote-form-state";

/**
 * QuoteForm (T16 AC-4..AC-7) — the ONLY client island of the B2B `/empresas`
 * page. Clones the contact-form grammar verbatim: `useActionState`, off-screen
 * honeypot, convenience-only client validation (the server re-validates the
 * trimmed values — the real boundary), full serializable state. On success the
 * form clears + focus moves to the success banner + it auto-hides; on every
 * failure the input is preserved. Error state offers a Retry that re-submits the
 * current values. The raw provider reason is never shown (mapped server-side).
 *
 * The one divergence from contact: the four short fields pair 2-up on ≥sm
 * (`sm:grid-cols-2`), and team size is a labeled native `<select>` over
 * `QUOTE_TEAM_SIZES` (the SINGLE source shared with the server enum guard).
 */

/** Team-size option keys ↔ their localized labels (order = QUOTE_TEAM_SIZES). */
export type QuoteTeamSizeOptions = Record<(typeof QUOTE_TEAM_SIZES)[number], string>;

/** Field ↔ error-key labels + form-level copy, all resolved server-side. */
export interface QuoteFormLabels {
  company: string;
  companyPlaceholder: string;
  name: string;
  namePlaceholder: string;
  email: string;
  emailPlaceholder: string;
  phone: string;
  phoneOptional: string;
  phonePlaceholder: string;
  teamSize: string;
  teamSizePlaceholder: string;
  teamSizeOptions: QuoteTeamSizeOptions;
  needs: string;
  needsPlaceholder: string;
  /** Template "{count}/{max}", interpolated client-side. */
  charCount: string;
  submit: string;
  submitting: string;
  /** sr-invisible honeypot label. */
  honeypot: string;
  success: string;
  errorGeneric: string;
  rateLimited: string;
  retry: string;
  errors: {
    companyRequired: string;
    companyTooLong: string;
    nameRequired: string;
    nameTooLong: string;
    emailRequired: string;
    emailInvalid: string;
    emailTooLong: string;
    phoneTooLong: string;
    teamSizeRequired: string;
    teamSizeInvalid: string;
    needsRequired: string;
    needsTooLong: string;
  };
}

interface QuoteFormProps {
  labels: QuoteFormLabels;
  maxLengths: {
    company: number;
    name: number;
    email: number;
    phone: number;
    needs: number;
  };
}

/** Fraction of the max at which the char counter warns (within the last 10%). */
const COUNTER_WARN_FRACTION = 0.9;

const fieldClasses =
  "w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export function QuoteForm({ labels, maxLengths }: QuoteFormProps) {
  const [state, formAction, pending] = useActionState<QuoteFormState, FormData>(
    submitQuoteForm,
    initialQuoteFormState,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const teamSizeRef = useRef<HTMLSelectElement>(null);
  const needsRef = useRef<HTMLTextAreaElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [needsLength, setNeedsLength] = useState(
    state.values?.needs?.length ?? 0,
  );
  const [successVisible, setSuccessVisible] = useState(false);

  const uid = useId();
  const companyErrorId = `${uid}-company-error`;
  const nameErrorId = `${uid}-name-error`;
  const emailErrorId = `${uid}-email-error`;
  const phoneErrorId = `${uid}-phone-error`;
  const teamSizeErrorId = `${uid}-teamSize-error`;
  const needsErrorId = `${uid}-needs-error`;
  const counterId = `${uid}-counter`;

  const companyError = errorFor(state, labels, "company");
  const nameError = errorFor(state, labels, "name");
  const emailError = errorFor(state, labels, "email");
  const phoneError = errorFor(state, labels, "phone");
  const teamSizeError = errorFor(state, labels, "teamSize");
  const needsError = errorFor(state, labels, "needs");

  // On success: clear the form, reset the counter, reveal + focus the banner,
  // and auto-hide it after the shipped feedback cadence.
  useEffect(() => {
    if (state.status !== "success") {
      return;
    }
    formRef.current?.reset();
    // Reset the counter + team-size + reveal the success banner in step with the
    // cleared form (external-DOM sync — the heuristic can't distinguish it from a
    // cascading render, so it is suppressed here with cause).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNeedsLength(0);
    setSuccessVisible(true);
    successRef.current?.focus();
    const timer = setTimeout(
      () => setSuccessVisible(false),
      QUOTE_SUCCESS_FEEDBACK_MS,
    );
    return () => clearTimeout(timer);
  }, [state.status, state.submissionId]);

  // Focus the first invalid field so a keyboard user lands on the error. Walk
  // company → name → email → phone → teamSize → needs (DOM order).
  useEffect(() => {
    if (state.status !== "invalid") {
      return;
    }
    if (state.fieldErrors?.company) {
      companyRef.current?.focus();
    } else if (state.fieldErrors?.name) {
      nameRef.current?.focus();
    } else if (state.fieldErrors?.email) {
      emailRef.current?.focus();
    } else if (state.fieldErrors?.phone) {
      phoneRef.current?.focus();
    } else if (state.fieldErrors?.teamSize) {
      teamSizeRef.current?.focus();
    } else if (state.fieldErrors?.needs) {
      needsRef.current?.focus();
    }
  }, [state.status, state.fieldErrors, state.submissionId]);

  return (
    <div className="mt-6 max-w-xl">
      {successVisible ? (
        <SuccessBanner ref={successRef} message={labels.success} />
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        noValidate
        className="mt-2 flex flex-col gap-4"
        data-testid="quote-form"
      >
        {/* Honeypot — real off-screen input (bots skip display:none / hidden). */}
        <div className="absolute left-[-9999px]" aria-hidden>
          <label htmlFor={`${uid}-company_url`}>{labels.honeypot}</label>
          <input
            id={`${uid}-company_url`}
            type="text"
            name="company_url"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        {/* Company + contact name pair 2-up on ≥sm. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            ref={companyRef}
            id={`${uid}-company`}
            name="company"
            type="text"
            label={labels.company}
            placeholder={labels.companyPlaceholder}
            maxLength={maxLengths.company}
            required
            autoComplete="organization"
            defaultValue={state.values?.company ?? ""}
            error={companyError}
            errorId={companyErrorId}
            testId="quote-company"
          />
          <Field
            ref={nameRef}
            id={`${uid}-name`}
            name="name"
            type="text"
            label={labels.name}
            placeholder={labels.namePlaceholder}
            maxLength={maxLengths.name}
            required
            autoComplete="name"
            defaultValue={state.values?.name ?? ""}
            error={nameError}
            errorId={nameErrorId}
            testId="quote-name"
          />
        </div>

        {/* Email + phone pair 2-up on ≥sm. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            ref={emailRef}
            id={`${uid}-email`}
            name="email"
            type="email"
            label={labels.email}
            placeholder={labels.emailPlaceholder}
            maxLength={maxLengths.email}
            required
            autoComplete="email"
            defaultValue={state.values?.email ?? ""}
            error={emailError}
            errorId={emailErrorId}
            testId="quote-email"
          />
          <Field
            ref={phoneRef}
            id={`${uid}-phone`}
            name="phone"
            type="tel"
            inputMode="tel"
            label={labels.phone}
            optionalLabel={labels.phoneOptional}
            placeholder={labels.phonePlaceholder}
            maxLength={maxLengths.phone}
            autoComplete="tel"
            defaultValue={state.values?.phone ?? ""}
            error={phoneError}
            errorId={phoneErrorId}
            testId="quote-phone"
          />
        </div>

        <SelectField
          // Re-key per submission so React 19's post-action form reset remounts
          // the uncontrolled select with the preserved `defaultValue` — otherwise
          // the reset drops the chosen range back to the placeholder on a
          // failure re-render (invalid / rate-limited / error).
          key={`teamSize-${state.submissionId}`}
          ref={teamSizeRef}
          id={`${uid}-teamSize`}
          label={labels.teamSize}
          placeholder={labels.teamSizePlaceholder}
          options={labels.teamSizeOptions}
          defaultValue={state.values?.teamSize ?? ""}
          error={teamSizeError}
          errorId={teamSizeErrorId}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-needs`} className="text-sm font-medium">
            {labels.needs}
          </label>
          <textarea
            ref={needsRef}
            id={`${uid}-needs`}
            name="needs"
            maxLength={maxLengths.needs}
            required
            defaultValue={state.values?.needs ?? ""}
            onChange={(event) => setNeedsLength(event.target.value.length)}
            placeholder={labels.needsPlaceholder}
            aria-invalid={needsError ? true : undefined}
            aria-describedby={cn(
              needsError ? needsErrorId : undefined,
              counterId,
            )}
            data-testid="quote-needs"
            className={cn(fieldClasses, "min-h-32 resize-y")}
          />
          <CharacterCounter
            id={counterId}
            count={needsLength}
            max={maxLengths.needs}
            template={labels.charCount}
          />
          {needsError ? (
            <FieldError
              id={needsErrorId}
              message={needsError}
              testid="quote-needs-error"
            />
          ) : null}
        </div>

        <FormBanner state={state} labels={labels} />

        <Button
          type="submit"
          size="lg"
          disabled={pending}
          data-testid="quote-submit"
          className="min-h-11 px-4 sm:w-auto sm:self-start"
        >
          {pending
            ? labels.submitting
            : state.status === "error"
              ? labels.retry
              : labels.submit}
        </Button>
      </form>
    </div>
  );
}

/** Resolve a field's localized error message from state, or null. */
function errorFor(
  state: QuoteFormState,
  labels: QuoteFormLabels,
  field: "company" | "name" | "email" | "phone" | "teamSize" | "needs",
): string | null {
  const key = state.fieldErrors?.[field];
  return key ? labels.errors[key] : null;
}

interface FieldProps {
  ref: React.Ref<HTMLInputElement>;
  id: string;
  name: string;
  type: "text" | "email" | "tel";
  inputMode?: "tel";
  label: string;
  optionalLabel?: string;
  placeholder: string;
  maxLength: number;
  required?: boolean;
  autoComplete?: string;
  defaultValue: string;
  error: string | null;
  errorId: string;
  testId: string;
}

/** A labeled single-line input with associated error (AC-11). */
function Field({
  ref,
  id,
  name,
  type,
  inputMode,
  label,
  optionalLabel,
  placeholder,
  maxLength,
  required,
  autoComplete,
  defaultValue,
  error,
  errorId,
  testId,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optionalLabel ? (
          <span className="ml-1 font-normal text-muted-foreground">
            {optionalLabel}
          </span>
        ) : null}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        data-testid={testId}
        className={fieldClasses}
      />
      {error ? (
        <FieldError id={errorId} message={error} testid={`${testId}-error`} />
      ) : null}
    </div>
  );
}

interface SelectFieldProps {
  ref: React.Ref<HTMLSelectElement>;
  id: string;
  label: string;
  placeholder: string;
  options: QuoteTeamSizeOptions;
  /**
   * Uncontrolled initial value. The parent re-keys this component per submission
   * so React remounts it with the preserved value after a server-action reset.
   */
  defaultValue: string;
  error: string | null;
  errorId: string;
}

/**
 * A labeled NATIVE `<select>` for team size (AC-4, AC-11) — the keyboard/SR/
 * mobile-picker-correct choice, never a custom div-dropdown. Same anatomy as
 * `Field`: label + control with `fieldClasses` + `aria-invalid`/`aria-describedby`
 * + conditional error. First option is a disabled placeholder. Real options map
 * over `QUOTE_TEAM_SIZES` (the single source shared with the server enum guard).
 */
function SelectField({
  ref,
  id,
  label,
  placeholder,
  options,
  defaultValue,
  error,
  errorId,
}: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        ref={ref}
        id={id}
        name="teamSize"
        required
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        data-testid="quote-teamSize"
        className={cn(fieldClasses, "appearance-none bg-none pr-3")}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {QUOTE_TEAM_SIZES.map((value) => (
          <option key={value} value={value}>
            {options[value]}
          </option>
        ))}
      </select>
      {error ? (
        <FieldError id={errorId} message={error} testid="quote-teamSize-error" />
      ) : null}
    </div>
  );
}

/** The form-level banner (rate-limited / error) — success has its own banner. */
function FormBanner({
  state,
  labels,
}: {
  state: QuoteFormState;
  labels: QuoteFormLabels;
}) {
  if (state.status === "rate-limited") {
    return (
      <p
        role="alert"
        data-testid="quote-rate-limited"
        className="enter-fade flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning"
      >
        <HugeiconsIcon
          icon={Alert02Icon}
          size={16}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span className="break-words">{labels.rateLimited}</span>
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p
        role="alert"
        data-testid="quote-form-error"
        className="enter-fade flex items-start gap-2 text-sm text-destructive"
      >
        <HugeiconsIcon
          icon={Alert02Icon}
          size={16}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span className="break-words">{labels.errorGeneric}</span>
      </p>
    );
  }
  return null;
}

function SuccessBanner({
  ref,
  message,
}: {
  ref: React.Ref<HTMLDivElement>;
  message: string;
}) {
  return (
    <div
      ref={ref}
      role="status"
      tabIndex={-1}
      data-testid="quote-success"
      className="enter-fade flex items-start gap-3 rounded-md bg-muted/50 p-3 outline-none"
    >
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        size={18}
        strokeWidth={2}
        aria-hidden
        className="mt-0.5 shrink-0 text-foreground"
      />
      <p className="break-words text-sm font-medium text-foreground">{message}</p>
    </div>
  );
}

function FieldError({
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
      className="enter-fade text-xs text-destructive"
    >
      {message}
    </p>
  );
}

/**
 * Live character counter tied to the textarea via `aria-describedby`. Announces
 * only near the limit (avoids per-keystroke chatter): muted → warning within the
 * last 10% → destructive at the cap.
 */
function CharacterCounter({
  id,
  count,
  max,
  template,
}: {
  id: string;
  count: number;
  max: number;
  template: string;
}) {
  const warn = count >= max * COUNTER_WARN_FRACTION;
  const atLimit = count >= max;
  return (
    <span
      id={id}
      aria-live={warn ? "polite" : "off"}
      data-testid="quote-counter"
      className={cn(
        "self-end text-xs tabular-nums",
        atLimit
          ? "text-destructive"
          : warn
            ? "text-warning"
            : "text-muted-foreground",
      )}
    >
      {interpolate(template, { count, max })}
    </span>
  );
}
