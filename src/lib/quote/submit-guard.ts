/**
 * PURE quote-form (B2B) submission guards (T16 AC-4, AC-7, edges 1 & 5). I/O-free
 * and unit-testable: trim-then-validate every field against its length cap,
 * shape-check the email with the shared `EMAIL_PATTERN`, verify the team size is
 * an allowed enum member (the one genuinely new validation vs. the contact
 * guard), and detect the honeypot.
 *
 * The action (`empresas/actions.ts`) composes these BEFORE any email send.
 * Trimming happens before the length check (an all-whitespace company/name/needs
 * fails required-validation, never relays). Company + contact name flow into the
 * relay email SUBJECT/header context, so they are ADDITIONALLY control-char
 * stripped (mirrors `contact/submit-guard.ts` — a mangled/injected subject line
 * is impossible). The needs body is passed to the template VERBATIM after
 * trimming/capping — the template HTML-escapes it, and this module never builds
 * HTML.
 */
import {
  QUOTE_COMPANY_MAX,
  QUOTE_NAME_MAX,
  QUOTE_EMAIL_MAX,
  QUOTE_PHONE_MAX,
  QUOTE_MESSAGE_MAX,
  EMAIL_PATTERN,
  isQuoteTeamSize,
  type QuoteTeamSize,
} from "@/lib/config";

/** A field-scoped validation error key (maps to a localized message). */
export type QuoteFieldErrorKey =
  | "companyRequired"
  | "companyTooLong"
  | "nameRequired"
  | "nameTooLong"
  | "emailRequired"
  | "emailInvalid"
  | "emailTooLong"
  | "phoneTooLong"
  | "teamSizeRequired"
  | "teamSizeInvalid"
  | "needsRequired"
  | "needsTooLong";

/** Which form field an error belongs to. */
export type QuoteFieldKey =
  | "company"
  | "name"
  | "email"
  | "phone"
  | "teamSize"
  | "needs";

/**
 * Strip control characters (CR/LF, tabs, and other C0/C1 controls) from a value
 * that flows into an email SUBJECT/header context (company, contact name).
 * Resend's JSON HTTP API is not a raw-SMTP header-injection vector, but interior
 * newlines would still produce a mangled subject line — collapse them defensively
 * so the relay subject is always a single clean line. Applied AFTER trim, so
 * leading/trailing whitespace is already gone.
 */
function stripControlChars(value: string): string {
  // C0 (\u0000-\u001F) + DEL (\u007F) + C1 (\u0080-\u009F) controls ->
  // collapsed to a single space so a mangled subject line is impossible.
  return value.replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ").trim();
}

/** Trimmed, validated values safe to relay when `ok` is true. */
export interface QuoteValues {
  company: string;
  name: string;
  email: string;
  /** Empty string when the optional phone was blank. */
  phone: string;
  /** Guaranteed to be a {@link QuoteTeamSize} when `ok` is true. */
  teamSize: QuoteTeamSize;
  needs: string;
}

/** The result of validating a submission's trimmed values. */
export interface QuoteValidationResult {
  ok: boolean;
  /** Present only when `ok` — the trimmed, enum-validated values to relay. */
  values: QuoteValues | null;
  fieldErrors: Partial<Record<QuoteFieldKey, QuoteFieldErrorKey>>;
}

/**
 * Validate a quote submission against TRIMMED values. Company, name, email,
 * team size, and needs are required; phone is optional. Length caps mirror the
 * config constants. The email must additionally match `EMAIL_PATTERN`; the team
 * size must be a member of `QUOTE_TEAM_SIZES` (edge 1 — a tampered enum is
 * rejected, never trusted). Returns the trimmed + enum-validated values (only
 * when `ok`) so the action relays exactly what was validated.
 */
export function validateQuoteSubmission(
  rawCompany: string,
  rawName: string,
  rawEmail: string,
  rawPhone: string,
  rawTeamSize: string,
  rawNeeds: string,
): QuoteValidationResult {
  // Company + name flow into the relay email SUBJECT line — strip control chars
  // (belt-and-suspenders vs. a mangled/injected header) as well as trimming.
  const company = stripControlChars(rawCompany.trim());
  const name = stripControlChars(rawName.trim());
  const email = rawEmail.trim();
  const phone = rawPhone.trim();
  const teamSize = rawTeamSize.trim();
  const needs = rawNeeds.trim();
  const fieldErrors: QuoteValidationResult["fieldErrors"] = {};

  if (company.length < 1) {
    fieldErrors.company = "companyRequired";
  } else if (company.length > QUOTE_COMPANY_MAX) {
    fieldErrors.company = "companyTooLong";
  }

  if (name.length < 1) {
    fieldErrors.name = "nameRequired";
  } else if (name.length > QUOTE_NAME_MAX) {
    fieldErrors.name = "nameTooLong";
  }

  if (email.length < 1) {
    fieldErrors.email = "emailRequired";
  } else if (email.length > QUOTE_EMAIL_MAX) {
    fieldErrors.email = "emailTooLong";
  } else if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "emailInvalid";
  }

  // Phone is optional — only a too-long non-empty phone is an error.
  if (phone.length > QUOTE_PHONE_MAX) {
    fieldErrors.phone = "phoneTooLong";
  }

  // Team size: required + enum membership (edge 1). An empty value →
  // teamSizeRequired; any non-empty non-member → teamSizeInvalid.
  if (teamSize.length < 1) {
    fieldErrors.teamSize = "teamSizeRequired";
  } else if (!isQuoteTeamSize(teamSize)) {
    fieldErrors.teamSize = "teamSizeInvalid";
  }

  if (needs.length < 1) {
    fieldErrors.needs = "needsRequired";
  } else if (needs.length > QUOTE_MESSAGE_MAX) {
    fieldErrors.needs = "needsTooLong";
  }

  const ok = Object.keys(fieldErrors).length === 0;
  // Only surface `values` when valid — the `teamSize` narrowing to `QuoteTeamSize`
  // is sound only past the membership check above (never assert an unchecked cast).
  const values: QuoteValues | null =
    ok && isQuoteTeamSize(teamSize)
      ? { company, name, email, phone, teamSize, needs }
      : null;

  return { ok, values, fieldErrors };
}

/**
 * Whether the honeypot field was filled (AC-7, edge 2). Bots fill hidden fields;
 * humans cannot see it. A filled honeypot short-circuits the action to a FAKE
 * success with no email send.
 */
export function isQuoteHoneypotTripped(honeypotValue: string): boolean {
  return honeypotValue.trim().length > 0;
}
