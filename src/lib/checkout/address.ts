/**
 * Pure Mexican address + contact validation for checkout (T7 AC-4, AC-5, edge 1).
 *
 * I/O-free and unit-tested (the Q&A `submit-guard.ts` precedent). Validates the
 * TRIMMED values, mirrors the DB `NOT NULL` + `customers_full_name_nonblank`
 * CHECKs, and is re-run on the server as the security boundary (the client check
 * is UX only). Returns `{ ok, values, fieldErrors }` so the action inserts
 * EXACTLY what was validated.
 *
 * Required (non-blank after trim): email (basic shape), shipping_full_name,
 * address_line1, city, postal_code (5 digits), state (∈ MEXICAN_STATES).
 * Optional (captured/bounded if present): contact_phone, address_line2,
 * delivery_notes, rfc.
 */
import {
  ADDRESS_FIELD_MAX,
  CONTACT_PHONE_MAX,
  DELIVERY_NOTES_MAX,
  EMAIL_PATTERN,
  MEXICAN_CP_PATTERN,
  RFC_MAX,
  isMexicanState,
} from "@/lib/config";

/** A field-scoped validation error key (maps to a localized message). */
export type AddressFieldErrorKey =
  | "emailRequired"
  | "emailInvalid"
  | "fullNameRequired"
  | "fullNameTooLong"
  | "addressRequired"
  | "addressTooLong"
  | "cityRequired"
  | "cityTooLong"
  | "postalCodeRequired"
  | "postalCodeInvalid"
  | "stateRequired"
  | "phoneTooLong"
  | "addressLine2TooLong"
  | "deliveryNotesTooLong"
  | "rfcTooLong";

/** The checkout address/contact form field names (match the FormData keys). */
export type AddressField =
  | "email"
  | "contact_phone"
  | "shipping_full_name"
  | "address_line1"
  | "address_line2"
  | "city"
  | "postal_code"
  | "state"
  | "delivery_notes"
  | "rfc";

/** The trimmed, validated address/contact values (safe to persist). */
export interface AddressValues {
  email: string;
  contact_phone: string;
  shipping_full_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  state: string;
  delivery_notes: string;
  rfc: string;
}

/** The result of validating the trimmed address/contact values. */
export interface AddressValidationResult {
  ok: boolean;
  /** Trimmed values, safe to persist when `ok` is true. */
  values: AddressValues;
  /** Field → error key; empty when `ok`. */
  fieldErrors: Partial<Record<AddressField, AddressFieldErrorKey>>;
}

/** The raw (untrimmed) inputs the action pulls from FormData. */
export interface RawAddressInput {
  email: string;
  contact_phone: string;
  shipping_full_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  state: string;
  delivery_notes: string;
  rfc: string;
}

/** Validate one required, bounded free-text field into `fieldErrors`. */
function validateRequiredText(
  value: string,
  field: AddressField,
  requiredKey: AddressFieldErrorKey,
  tooLongKey: AddressFieldErrorKey,
  max: number,
  fieldErrors: AddressValidationResult["fieldErrors"],
): void {
  if (value.length < 1) {
    fieldErrors[field] = requiredKey;
  } else if (value.length > max) {
    fieldErrors[field] = tooLongKey;
  }
}

/** Validate one optional, bounded field (only a too-long error is possible). */
function validateOptionalMax(
  value: string,
  field: AddressField,
  tooLongKey: AddressFieldErrorKey,
  max: number,
  fieldErrors: AddressValidationResult["fieldErrors"],
): void {
  if (value.length > max) {
    fieldErrors[field] = tooLongKey;
  }
}

/**
 * Validate the checkout address + contact against the TRIMMED values (AC-4,
 * AC-5, edge 1). Length bounds are app-level sanity caps; the CP shape and state
 * membership are the hard rules that block submit. Returns the trimmed values so
 * the caller persists exactly what was validated.
 */
export function validateAddress(input: RawAddressInput): AddressValidationResult {
  const values: AddressValues = {
    email: input.email.trim(),
    contact_phone: input.contact_phone.trim(),
    shipping_full_name: input.shipping_full_name.trim(),
    address_line1: input.address_line1.trim(),
    address_line2: input.address_line2.trim(),
    city: input.city.trim(),
    postal_code: input.postal_code.trim(),
    state: input.state.trim(),
    delivery_notes: input.delivery_notes.trim(),
    // RFC is upper-cased for storage (CFDI convention); shape unchecked in Phase 1.
    rfc: input.rfc.trim().toUpperCase(),
  };
  const fieldErrors: AddressValidationResult["fieldErrors"] = {};

  // Email — required + basic shape.
  if (values.email.length < 1) {
    fieldErrors.email = "emailRequired";
  } else if (!EMAIL_PATTERN.test(values.email)) {
    fieldErrors.email = "emailInvalid";
  }

  validateRequiredText(
    values.shipping_full_name,
    "shipping_full_name",
    "fullNameRequired",
    "fullNameTooLong",
    ADDRESS_FIELD_MAX,
    fieldErrors,
  );
  validateRequiredText(
    values.address_line1,
    "address_line1",
    "addressRequired",
    "addressTooLong",
    ADDRESS_FIELD_MAX,
    fieldErrors,
  );
  validateRequiredText(
    values.city,
    "city",
    "cityRequired",
    "cityTooLong",
    ADDRESS_FIELD_MAX,
    fieldErrors,
  );

  // Postal code — required + exactly 5 digits.
  if (values.postal_code.length < 1) {
    fieldErrors.postal_code = "postalCodeRequired";
  } else if (!MEXICAN_CP_PATTERN.test(values.postal_code)) {
    fieldErrors.postal_code = "postalCodeInvalid";
  }

  // State — required + must be one of the 32.
  if (!isMexicanState(values.state)) {
    fieldErrors.state = "stateRequired";
  }

  // Optional fields — bounded only.
  validateOptionalMax(values.contact_phone, "contact_phone", "phoneTooLong", CONTACT_PHONE_MAX, fieldErrors);
  validateOptionalMax(values.address_line2, "address_line2", "addressLine2TooLong", ADDRESS_FIELD_MAX, fieldErrors);
  validateOptionalMax(values.delivery_notes, "delivery_notes", "deliveryNotesTooLong", DELIVERY_NOTES_MAX, fieldErrors);
  validateOptionalMax(values.rfc, "rfc", "rfcTooLong", RFC_MAX, fieldErrors);

  return {
    ok: Object.keys(fieldErrors).length === 0,
    values,
    fieldErrors,
  };
}
