/**
 * PURE store-settings input parsing + validation (T10 AC-8, AC-10, edges 6/7, R7).
 * No I/O, no Next imports — the money/field boundary is exhaustively unit-testable
 * (mirrors `checkout/address.ts` + `payments/webhook.ts` discipline).
 *
 * The four fields are edited in PESOS (2 decimals) and stored as integer CENTS.
 * The money parser is STRICT (R7): it strips one leading `$` + surrounding
 * whitespace, then accepts ONLY `^\d+(\.\d{1,2})?$`. Thousand separators
 * (`1,000.00`, `1.000,00`) are REJECTED, never silently coerced to wrong cents.
 * `0` / `0.00` are VALID (flat 0 = always free, threshold 0 = free for everyone,
 * edge 6). A cents value beyond `Number.MAX_SAFE_INTEGER` is rejected (overflow).
 */
import { EMAIL_PATTERN } from "@/lib/config";
import { pesosToCents } from "@/lib/money";

/** Editable settings field ids (match the form field names). */
export type AdminSettingsField =
  | "store_name"
  | "contact_email"
  | "shipping_flat_rate"
  | "free_shipping_threshold";

/** Field-level validation error keys (localized in the form). */
export type AdminSettingsFieldError =
  | "name-required"
  | "name-too-long"
  | "email-required"
  | "email-invalid"
  | "money-required"
  | "money-invalid"
  | "money-negative"
  | "money-too-many-decimals"
  | "money-overflow";

/** Max store name length — matches the DB CHECK `between 1 and 200`. */
export const STORE_NAME_MAX_LENGTH = 200;

/** Cents per peso for the overflow bound. */
const CENTS_PER_PESO = 100;

/** Raw form input (all strings, as submitted). */
export interface AdminSettingsRawInput {
  store_name: string;
  contact_email: string;
  shipping_flat_rate: string;
  free_shipping_threshold: string;
}

/** The validated, DB-ready values (integer cents for money). */
export interface AdminSettingsParsed {
  store_name: string;
  contact_email: string;
  shipping_flat_rate_cents: number;
  free_shipping_threshold_cents: number;
}

/** Result of parsing: either valid values or per-field errors + echoed input. */
export type AdminSettingsParseResult =
  | { ok: true; values: AdminSettingsParsed }
  | {
      ok: false;
      fieldErrors: Partial<Record<AdminSettingsField, AdminSettingsFieldError>>;
    };

/** Strict money-string → cents. Returns cents or a specific field-error key. */
export function parseMoneyToCents(
  raw: string,
): { ok: true; cents: number } | { ok: false; error: AdminSettingsFieldError } {
  // Strip one optional leading `$` and all surrounding whitespace (edge 7).
  const stripped = raw.trim().replace(/^\$/, "").trim();
  if (stripped === "") {
    return { ok: false, error: "money-required" };
  }
  if (stripped.startsWith("-")) {
    return { ok: false, error: "money-negative" };
  }
  // A dot with 3+ decimals is a distinct, clearer error than generic-invalid.
  if (/^\d+\.\d{3,}$/.test(stripped)) {
    return { ok: false, error: "money-too-many-decimals" };
  }
  // Strict shape: digits, optional dot + 1–2 decimals. Rejects thousand
  // separators, commas, letters, multiple dots, `$` mid-string (R7).
  if (!/^\d+(\.\d{1,2})?$/.test(stripped)) {
    return { ok: false, error: "money-invalid" };
  }
  const cents = pesosToCents(Number(stripped));
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, error: "money-overflow" };
  }
  return { ok: true, cents };
}

/** Validate the store name (non-blank after trim, ≤ 200 chars). */
function parseStoreName(
  raw: string,
): { ok: true; value: string } | { ok: false; error: AdminSettingsFieldError } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "name-required" };
  }
  if (trimmed.length > STORE_NAME_MAX_LENGTH) {
    return { ok: false, error: "name-too-long" };
  }
  return { ok: true, value: trimmed };
}

/** Validate the contact email (non-blank, basic shape via shared pattern). */
function parseEmail(
  raw: string,
): { ok: true; value: string } | { ok: false; error: AdminSettingsFieldError } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "email-required" };
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { ok: false, error: "email-invalid" };
  }
  return { ok: true, value: trimmed };
}

/**
 * Parse + validate the whole settings form. Collects ALL field errors in one
 * pass (the form shows every bad field at once); on full success returns the
 * DB-ready values (money as integer cents). Guarantees `CENTS_PER_PESO` is not a
 * dead reference by documenting the overflow bound lives in `parseMoneyToCents`.
 */
export function parseStoreSettingsInput(
  raw: AdminSettingsRawInput,
): AdminSettingsParseResult {
  const fieldErrors: Partial<
    Record<AdminSettingsField, AdminSettingsFieldError>
  > = {};

  const name = parseStoreName(raw.store_name);
  if (!name.ok) {
    fieldErrors.store_name = name.error;
  }
  const email = parseEmail(raw.contact_email);
  if (!email.ok) {
    fieldErrors.contact_email = email.error;
  }
  const flat = parseMoneyToCents(raw.shipping_flat_rate);
  if (!flat.ok) {
    fieldErrors.shipping_flat_rate = flat.error;
  }
  const threshold = parseMoneyToCents(raw.free_shipping_threshold);
  if (!threshold.ok) {
    fieldErrors.free_shipping_threshold = threshold.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  // Narrowing: all four succeeded (checked above).
  return {
    ok: true,
    values: {
      store_name: (name as { ok: true; value: string }).value,
      contact_email: (email as { ok: true; value: string }).value,
      shipping_flat_rate_cents: (flat as { ok: true; cents: number }).cents,
      free_shipping_threshold_cents: (
        threshold as { ok: true; cents: number }
      ).cents,
    },
  };
}

/** Exported for tests / documentation of the peso→cents overflow bound. */
export const MAX_SAFE_PESOS = Math.floor(
  Number.MAX_SAFE_INTEGER / CENTS_PER_PESO,
);
