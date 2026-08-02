"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { interpolate } from "@/lib/interpolate";
import { CONTACT_SUCCESS_FEEDBACK_MS } from "@/lib/config";
import { submitContactForm } from "./actions";
import {
  initialContactFormState,
  type ContactFormState,
} from "./contact-form-state";

/**
 * ContactForm (T13 AC-11..AC-16, AC-20) — the ONLY client island of the contact
 * page. Copies the Q&A form grammar verbatim: `useActionState`, off-screen
 * honeypot, convenience-only client validation (the server re-validates the
 * trimmed values — the real boundary), full serializable state. On success the
 * form clears + focus moves to the success banner + it auto-hides; on every
 * failure the input is preserved. Error state offers a Retry that re-submits the
 * current values. The raw provider reason is never shown (mapped server-side).
 */

/** Field ↔ error-key labels + form-level copy, all resolved server-side. */
export interface ContactFormLabels {
  name: string;
  namePlaceholder: string;
  email: string;
  emailPlaceholder: string;
  subject: string;
  subjectOptional: string;
  subjectPlaceholder: string;
  message: string;
  messagePlaceholder: string;
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
    nameRequired: string;
    nameTooLong: string;
    emailRequired: string;
    emailInvalid: string;
    emailTooLong: string;
    subjectTooLong: string;
    messageRequired: string;
    messageTooLong: string;
  };
}

interface ContactFormProps {
  labels: ContactFormLabels;
  maxLengths: { name: number; email: number; subject: number; message: number };
}

/** Fraction of the max at which the char counter warns (within the last 10%). */
const COUNTER_WARN_FRACTION = 0.9;

const fieldClasses =
  "w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export function ContactForm({ labels, maxLengths }: ContactFormProps) {
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(
    submitContactForm,
    initialContactFormState,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [messageLength, setMessageLength] = useState(
    state.values?.message?.length ?? 0,
  );
  const [successVisible, setSuccessVisible] = useState(false);

  const uid = useId();
  const nameErrorId = `${uid}-name-error`;
  const emailErrorId = `${uid}-email-error`;
  const subjectErrorId = `${uid}-subject-error`;
  const messageErrorId = `${uid}-message-error`;
  const counterId = `${uid}-counter`;

  const nameError = errorFor(state, labels, "name");
  const emailError = errorFor(state, labels, "email");
  const subjectError = errorFor(state, labels, "subject");
  const messageError = errorFor(state, labels, "message");

  // On success: clear the form, reset the counter, reveal + focus the banner,
  // and auto-hide it after the shipped feedback cadence. External-DOM sync +
  // a timer — a legitimate effect.
  useEffect(() => {
    if (state.status !== "success") {
      return;
    }
    formRef.current?.reset();
    // Reset the counter + reveal the success banner in step with the cleared
    // form (external-DOM sync — the heuristic can't distinguish it from a
    // cascading render, so it is suppressed here with cause).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessageLength(0);
    setSuccessVisible(true);
    successRef.current?.focus();
    const timer = setTimeout(
      () => setSuccessVisible(false),
      CONTACT_SUCCESS_FEEDBACK_MS,
    );
    return () => clearTimeout(timer);
  }, [state.status, state.submissionId]);

  // Focus the first invalid field so a keyboard user lands on the error.
  useEffect(() => {
    if (state.status !== "invalid") {
      return;
    }
    if (state.fieldErrors?.name) {
      nameRef.current?.focus();
    } else if (state.fieldErrors?.email) {
      emailRef.current?.focus();
    } else if (state.fieldErrors?.subject) {
      subjectRef.current?.focus();
    } else if (state.fieldErrors?.message) {
      messageRef.current?.focus();
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
        data-testid="contact-form"
      >
        {/* Honeypot — real off-screen input (bots skip display:none / hidden). */}
        <div className="absolute left-[-9999px]" aria-hidden>
          <label htmlFor={`${uid}-website`}>{labels.honeypot}</label>
          <input
            id={`${uid}-website`}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

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
          testId="contact-name"
        />

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
          testId="contact-email"
        />

        <Field
          ref={subjectRef}
          id={`${uid}-subject`}
          name="subject"
          type="text"
          label={labels.subject}
          optionalLabel={labels.subjectOptional}
          placeholder={labels.subjectPlaceholder}
          maxLength={maxLengths.subject}
          defaultValue={state.values?.subject ?? ""}
          error={subjectError}
          errorId={subjectErrorId}
          testId="contact-subject"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-message`} className="text-sm font-medium">
            {labels.message}
          </label>
          <textarea
            ref={messageRef}
            id={`${uid}-message`}
            name="message"
            maxLength={maxLengths.message}
            required
            defaultValue={state.values?.message ?? ""}
            onChange={(event) => setMessageLength(event.target.value.length)}
            placeholder={labels.messagePlaceholder}
            aria-invalid={messageError ? true : undefined}
            aria-describedby={cn(
              messageError ? messageErrorId : undefined,
              counterId,
            )}
            data-testid="contact-message"
            className={cn(fieldClasses, "min-h-32 resize-y")}
          />
          <CharacterCounter
            id={counterId}
            count={messageLength}
            max={maxLengths.message}
            template={labels.charCount}
          />
          {messageError ? (
            <FieldError
              id={messageErrorId}
              message={messageError}
              testid="contact-message-error"
            />
          ) : null}
        </div>

        <FormBanner state={state} labels={labels} />

        <Button
          type="submit"
          size="lg"
          disabled={pending}
          data-testid="contact-submit"
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
  state: ContactFormState,
  labels: ContactFormLabels,
  field: "name" | "email" | "subject" | "message",
): string | null {
  const key = state.fieldErrors?.[field];
  return key ? labels.errors[key] : null;
}

interface FieldProps {
  ref: React.Ref<HTMLInputElement>;
  id: string;
  name: string;
  type: "text" | "email";
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

/** A labeled single-line input with associated error (AC-20). */
function Field({
  ref,
  id,
  name,
  type,
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

/** The form-level banner (rate-limited / error) — success has its own banner. */
function FormBanner({
  state,
  labels,
}: {
  state: ContactFormState;
  labels: ContactFormLabels;
}) {
  if (state.status === "rate-limited") {
    return (
      <p
        role="alert"
        data-testid="contact-rate-limited"
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
        data-testid="contact-form-error"
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
      data-testid="contact-success"
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
      data-testid="contact-counter"
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
