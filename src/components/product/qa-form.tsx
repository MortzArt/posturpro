"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { interpolate } from "@/lib/interpolate";
import {
  submitQuestion,
  initialQaFormState,
  type QaFormState,
} from "@/app/[locale]/producto/[slug]/actions";

/**
 * QaForm (T4 AC-14, AC-15, edges 4 & 5) — the ONLY client piece of the Q&A
 * section. `useActionState` wires the server action; the form provides
 * convenience-only client validation (the server re-validates the trimmed value
 * and is the real boundary). Honeypot is a real off-screen input (not
 * `display:none`, which bots skip). On success the form clears and focus moves
 * to the success note; on every failure the input is preserved.
 */

export interface QaFormLabels {
  formHeading: string;
  nameLabel: string;
  namePlaceholder: string;
  questionLabel: string;
  questionPlaceholder: string;
  submit: string;
  submitting: string;
  /** Template "{count}/{max}", interpolated client-side. */
  counterTemplate: string;
  honeypotLabel: string;
  nameRequired: string;
  nameTooLong: string;
  questionRequired: string;
  questionTooLong: string;
  successTitle: string;
  successBody: string;
  rateLimited: string;
  unavailable: string;
  errorRetry: string;
}

interface QaFormProps {
  productId: string;
  slug: string;
  maxName: number;
  maxQuestion: number;
  labels: QaFormLabels;
}

/** Fraction of the max at which the counter warns (within the last 10%). */
const COUNTER_WARN_FRACTION = 0.9;

const fieldClasses =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";

export function QaForm({ productId, slug, maxName, maxQuestion, labels }: QaFormProps) {
  const action = submitQuestion.bind(null, slug);
  const [state, formAction, pending] = useActionState<QaFormState, FormData>(
    action,
    initialQaFormState,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [questionLength, setQuestionLength] = useState(
    state.values?.question?.length ?? 0,
  );
  const nameErrorId = useId();
  const questionErrorId = useId();
  const counterId = useId();

  const nameError = state.fieldErrors?.authorName
    ? labels[state.fieldErrors.authorName]
    : null;
  const questionError = state.fieldErrors?.question
    ? labels[state.fieldErrors.question]
    : null;
  const formMessage = resolveFormMessage(state, labels);

  // Reset the form on success and move focus to the success note (AC-14). The
  // native form reset + focus move are external-DOM sync (a legitimate effect);
  // zeroing the counter keeps the displayed count in step with the now-cleared
  // textarea. The heuristic rule can't distinguish this from a cascading render,
  // so it is disabled on the setState line with cause.
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuestionLength(0);
      successRef.current?.focus();
    }
  }, [state.status, state.submissionId]);

  // Focus the first invalid field so a keyboard user lands on the error.
  useEffect(() => {
    if (state.status !== "invalid") {
      return;
    }
    if (state.fieldErrors?.authorName) {
      nameRef.current?.focus();
    } else if (state.fieldErrors?.question) {
      questionRef.current?.focus();
    }
  }, [state.status, state.fieldErrors, state.submissionId]);

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-medium tracking-tight text-foreground">
        {labels.formHeading}
      </h2>

      {state.status === "success" ? (
        <SuccessNote ref={successRef} title={labels.successTitle} body={labels.successBody} />
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        noValidate
        className="mt-2 flex flex-col gap-4"
        data-testid="qa-form"
      >
        <input type="hidden" name="productId" value={productId} />

        {/* Honeypot — real off-screen input (bots skip display:none / hidden). */}
        <div className="absolute left-[-9999px]" aria-hidden>
          <label htmlFor={`${counterId}-website`}>{labels.honeypotLabel}</label>
          <input
            id={`${counterId}-website`}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${counterId}-name`} className="text-sm font-medium">
            {labels.nameLabel}
          </label>
          <input
            ref={nameRef}
            id={`${counterId}-name`}
            name="authorName"
            type="text"
            maxLength={maxName}
            required
            defaultValue={state.values?.authorName ?? ""}
            placeholder={labels.namePlaceholder}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            data-testid="qa-name"
            className={fieldClasses}
          />
          {nameError ? (
            <FieldError id={nameErrorId} message={nameError} testid="qa-name-error" />
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${counterId}-question`}
            className="text-sm font-medium"
          >
            {labels.questionLabel}
          </label>
          <textarea
            ref={questionRef}
            id={`${counterId}-question`}
            name="question"
            maxLength={maxQuestion}
            required
            defaultValue={state.values?.question ?? ""}
            onChange={(event) => setQuestionLength(event.target.value.length)}
            placeholder={labels.questionPlaceholder}
            aria-invalid={questionError ? true : undefined}
            aria-describedby={cn(
              questionError ? questionErrorId : undefined,
              counterId,
            )}
            data-testid="qa-question"
            className={cn(fieldClasses, "min-h-24 resize-y")}
          />
          <CharacterCounter
            id={counterId}
            count={questionLength}
            max={maxQuestion}
            template={labels.counterTemplate}
          />
          {questionError ? (
            <FieldError
              id={questionErrorId}
              message={questionError}
              testid="qa-question-error"
            />
          ) : null}
        </div>

        {formMessage ? (
          <p
            role="alert"
            data-testid="qa-form-error"
            className="enter-fade text-sm text-destructive"
          >
            <HugeiconsIcon
              icon={Alert02Icon}
              size={14}
              strokeWidth={2}
              aria-hidden
              className="mr-1 inline align-[-2px]"
            />
            {formMessage}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={pending}
          data-testid="qa-submit"
          className="min-h-11 px-4 sm:w-auto sm:self-end"
        >
          {pending ? labels.submitting : labels.submit}
        </Button>
      </form>
    </div>
  );
}

/** Map a non-field state to its localized form-scoped message (or null). */
function resolveFormMessage(state: QaFormState, labels: QaFormLabels): string | null {
  switch (state.status) {
    case "rate-limited":
      return labels.rateLimited;
    case "unavailable":
      return labels.unavailable;
    case "error":
      return labels.errorRetry;
    default:
      return null;
  }
}

function SuccessNote({
  ref,
  title,
  body,
}: {
  ref: React.Ref<HTMLDivElement>;
  title: string;
  body: string;
}) {
  return (
    <div
      ref={ref}
      role="status"
      tabIndex={-1}
      data-testid="qa-success"
      className="enter-fade flex items-start gap-3 rounded-md bg-muted/50 p-3 outline-none"
    >
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        size={18}
        strokeWidth={2}
        aria-hidden
        className="mt-0.5 shrink-0 text-foreground"
      />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
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
 * only near the limit (avoids per-keystroke chatter): muted → amber within the
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
      data-testid="qa-counter"
      className={cn(
        "self-end text-xs tabular-nums",
        atLimit
          ? "text-destructive"
          : warn
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground",
      )}
    >
      {interpolate(template, { count, max })}
    </span>
  );
}
