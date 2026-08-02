/**
 * PURE contact-form submission guards (T13 AC-13, AC-15, edge 7). I/O-free and
 * unit-testable: trim-then-validate every field against its length cap, shape-
 * check the email with the shared `EMAIL_PATTERN`, and detect the honeypot.
 *
 * The action (`actions.ts`) composes these BEFORE any email send. Trimming
 * happens before the length check (an all-whitespace name/message fails
 * required-validation, never relays). The message body is passed to the email
 * template VERBATIM after trimming/capping — the template HTML-escapes it, and
 * this module never builds HTML (AC-17).
 */
import {
  CONTACT_NAME_MAX,
  CONTACT_EMAIL_MAX,
  CONTACT_SUBJECT_MAX,
  CONTACT_MESSAGE_MAX,
  EMAIL_PATTERN,
} from "@/lib/config";

/** A field-scoped validation error key (maps to a localized message). */
export type ContactFieldErrorKey =
  | "nameRequired"
  | "nameTooLong"
  | "emailRequired"
  | "emailInvalid"
  | "emailTooLong"
  | "subjectTooLong"
  | "messageRequired"
  | "messageTooLong";

/** Which form field an error belongs to. */
export type ContactFieldKey = "name" | "email" | "subject" | "message";

/** Trimmed, validated values safe to relay when `ok` is true. */
export interface ContactValues {
  name: string;
  email: string;
  /** Empty string when the optional subject was blank. */
  subject: string;
  message: string;
}

/** The result of validating a submission's trimmed values. */
export interface ContactValidationResult {
  ok: boolean;
  values: ContactValues;
  fieldErrors: Partial<Record<ContactFieldKey, ContactFieldErrorKey>>;
}

/**
 * Validate a contact submission against TRIMMED values. Name, email, and message
 * are required; subject is optional. Length caps mirror the config constants.
 * The email must additionally match `EMAIL_PATTERN`. Returns the trimmed values
 * so the action relays exactly what was validated.
 */
export function validateContactSubmission(
  rawName: string,
  rawEmail: string,
  rawSubject: string,
  rawMessage: string,
): ContactValidationResult {
  const name = rawName.trim();
  const email = rawEmail.trim();
  const subject = rawSubject.trim();
  const message = rawMessage.trim();
  const fieldErrors: ContactValidationResult["fieldErrors"] = {};

  if (name.length < 1) {
    fieldErrors.name = "nameRequired";
  } else if (name.length > CONTACT_NAME_MAX) {
    fieldErrors.name = "nameTooLong";
  }

  if (email.length < 1) {
    fieldErrors.email = "emailRequired";
  } else if (email.length > CONTACT_EMAIL_MAX) {
    fieldErrors.email = "emailTooLong";
  } else if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "emailInvalid";
  }

  // Subject is optional — only a too-long non-empty subject is an error.
  if (subject.length > CONTACT_SUBJECT_MAX) {
    fieldErrors.subject = "subjectTooLong";
  }

  if (message.length < 1) {
    fieldErrors.message = "messageRequired";
  } else if (message.length > CONTACT_MESSAGE_MAX) {
    fieldErrors.message = "messageTooLong";
  }

  return {
    ok: Object.keys(fieldErrors).length === 0,
    values: { name, email, subject, message },
    fieldErrors,
  };
}

/**
 * Whether the honeypot field was filled (AC-15). Bots fill hidden fields; humans
 * cannot see it. A filled honeypot short-circuits the action to a FAKE success
 * with no email send.
 */
export function isContactHoneypotTripped(honeypotValue: string): boolean {
  return honeypotValue.trim().length > 0;
}
