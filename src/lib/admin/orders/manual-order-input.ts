/**
 * PURE parse/validate of a manual (phone / offline) order (T17). No I/O, no Next
 * imports — the pure contract behind `createManualOrder`, re-run on the server as
 * the trust boundary (client checks are UX only). Mirrors the T12 `order-*-input`
 * pairs and the checkout `address.ts` precedent.
 *
 * What it enforces:
 *   - Contact: name required; email OPTIONAL (blank is valid) but shape-checked
 *     when present (AC-11); phone optional + bounded.
 *   - Shipping: the SAME Mexican-address rules as checkout — reuses the shared
 *     `ADDRESS_FIELD_MAX` / `MEXICAN_CP_PATTERN` / `isMexicanState` validators —
 *     but WITHOUT the email-required rule (AC-4, the email-optional sibling of
 *     `validateAddress`).
 *   - Lines: ≥ 1 (edge 2), each with a UUID product id, optional variant id,
 *     and an integer quantity in `[1, INT4_MAX]` (edge 6).
 *   - Payment choice: `pending | paid` enum.
 *   - Confirmation opt-in: boolean; never forces a send on its own.
 *   - Shipping override: a MoneyField decimal string → integer cents, bounded.
 *
 * Prices are NOT trusted here (none are read) — `revalidateLines` recomputes them
 * server-side in the write module (AC-7). Line prices/labels are resolved live.
 */
import {
  ADDRESS_FIELD_MAX,
  CONTACT_PHONE_MAX,
  DELIVERY_NOTES_MAX,
  EMAIL_PATTERN,
  INT4_MAX,
  MEXICAN_CP_PATTERN,
  RFC_MAX,
  UUID_PATTERN,
  isMexicanState,
} from "@/lib/config";
import { pesosToCents } from "@/lib/money";
import { INTERNAL_NOTE_MAX_LENGTH } from "@/lib/admin/orders/order-constants";

/** Max characters for the contact name (mirrors the address field cap). */
const CONTACT_NAME_MAX = ADDRESS_FIELD_MAX;
/** Hard cap on line items per manual order (defends against pathological input). */
export const MANUAL_ORDER_MAX_LINES = 200;

/** The two payment outcomes the form offers. */
export type ManualPaymentChoice = "pending" | "paid";

/** Every field that can carry a validation error (drives `focusFirstInvalid`). */
export type ManualOrderField =
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "shipping_full_name"
  | "address_line1"
  | "address_line2"
  | "city"
  | "postal_code"
  | "state"
  | "delivery_notes"
  | "rfc"
  | "shipping_override"
  | "items";

/** The localized-message key for a field error (resolved in the client form). */
export type ManualOrderFieldErrorKey =
  | "required"
  | "too-long"
  | "email-invalid"
  | "cp-invalid"
  | "state-invalid"
  | "shipping-invalid"
  | "no-items"
  | "line-invalid";

/** A single validated line: identity + quantity only (price is resolved live). */
export interface ManualOrderLineInput {
  /** Client-minted stable id echoed back so per-line issues attach correctly. */
  lineKey: string;
  productId: string;
  variantId: string | null;
  quantity: number;
}

/** The fully-validated manual-order input the write module consumes. */
export interface ManualOrderInput {
  contactName: string;
  /** `null` when the admin left email blank (a valid phone-order case). */
  contactEmail: string | null;
  contactPhone: string | null;
  shippingFullName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  deliveryNotes: string | null;
  rfc: string | null;
  /** Admin-confirmed shipping charge in integer cents (AC-8). */
  shippingCents: number;
  internalNote: string | null;
  lines: ManualOrderLineInput[];
  paymentChoice: ManualPaymentChoice;
  /** Confirmation email opt-in; the write still gates on a valid email (AC-12). */
  sendConfirmation: boolean;
}

/** Raw, untrimmed form input (one raw line per submitted item). */
export interface RawManualOrderInput {
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  shipping_full_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  state: string;
  delivery_notes: string;
  rfc: string;
  shipping_override: string;
  internal_note: string;
  payment_choice: string;
  send_confirmation: boolean;
  lines: readonly RawManualOrderLine[];
}

/** One raw submitted line (hidden inputs echoed from the client editor). */
export interface RawManualOrderLine {
  line_key: string;
  line_product_id: string;
  line_variant_id: string;
  line_qty: string;
}

/** The parse outcome: either a typed input, or a map of field errors. */
export type ManualOrderParseResult =
  | { ok: true; input: ManualOrderInput }
  | { ok: false; fieldErrors: Partial<Record<ManualOrderField, ManualOrderFieldErrorKey>> };

function required(
  errors: Partial<Record<ManualOrderField, ManualOrderFieldErrorKey>>,
  field: ManualOrderField,
  value: string,
  max: number,
): string {
  if (value.length === 0) {
    errors[field] = "required";
    return "";
  }
  if (value.length > max) {
    errors[field] = "too-long";
  }
  return value;
}

function optional(
  errors: Partial<Record<ManualOrderField, ManualOrderFieldErrorKey>>,
  field: ManualOrderField,
  value: string,
  max: number,
): string | null {
  if (value.length === 0) {
    return null;
  }
  if (value.length > max) {
    errors[field] = "too-long";
  }
  return value;
}

/** Parse the optional email: blank → null; present → EMAIL_PATTERN or error. */
function parseEmail(
  errors: Partial<Record<ManualOrderField, ManualOrderFieldErrorKey>>,
  raw: string,
): string | null {
  if (raw.length === 0) {
    return null;
  }
  if (!EMAIL_PATTERN.test(raw)) {
    errors.contact_email = "email-invalid";
    return null;
  }
  return raw;
}

/** Parse the MoneyField shipping override (decimal pesos → integer cents). */
function parseShippingOverride(
  errors: Partial<Record<ManualOrderField, ManualOrderFieldErrorKey>>,
  raw: string,
): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    errors.shipping_override = "required";
    return 0;
  }
  const pesos = Number(trimmed);
  if (!Number.isFinite(pesos) || pesos < 0) {
    errors.shipping_override = "shipping-invalid";
    return 0;
  }
  const cents = pesosToCents(pesos);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > INT4_MAX) {
    errors.shipping_override = "shipping-invalid";
    return 0;
  }
  return cents;
}

/** Parse one line: valid product UUID + integer quantity in [1, INT4_MAX]. */
function parseLine(raw: RawManualOrderLine): ManualOrderLineInput | null {
  const productId = raw.line_product_id.trim();
  if (!UUID_PATTERN.test(productId)) {
    return null;
  }
  const variantRaw = raw.line_variant_id.trim();
  const variantId = variantRaw.length > 0 ? variantRaw : null;
  if (variantId !== null && !UUID_PATTERN.test(variantId)) {
    return null;
  }
  const qty = Number(raw.line_qty.trim());
  if (!Number.isInteger(qty) || qty < 1 || qty > INT4_MAX) {
    return null;
  }
  const lineKey = raw.line_key.trim();
  return {
    lineKey: lineKey.length > 0 ? lineKey : productId,
    productId,
    variantId,
    quantity: qty,
  };
}

/** Validate the line array: ≥ 1, each parseable (edges 2 & 6). */
function parseLines(
  errors: Partial<Record<ManualOrderField, ManualOrderFieldErrorKey>>,
  rawLines: readonly RawManualOrderLine[],
): ManualOrderLineInput[] {
  if (rawLines.length === 0) {
    errors.items = "no-items";
    return [];
  }
  if (rawLines.length > MANUAL_ORDER_MAX_LINES) {
    errors.items = "line-invalid";
    return [];
  }
  const lines: ManualOrderLineInput[] = [];
  for (const rawLine of rawLines) {
    const line = parseLine(rawLine);
    if (!line) {
      errors.items = "line-invalid";
      return [];
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Parse + validate a manual-order submission. Returns the typed input on success
 * or a field-error map on any failure. Trims every value first (the DB sees only
 * validated data). Does NOT touch prices — the write module revalidates lines.
 */
export function parseManualOrderInput(raw: RawManualOrderInput): ManualOrderParseResult {
  const errors: Partial<Record<ManualOrderField, ManualOrderFieldErrorKey>> = {};

  const contactName = required(errors, "contact_name", raw.contact_name.trim(), CONTACT_NAME_MAX);
  const contactEmail = parseEmail(errors, raw.contact_email.trim());
  const contactPhone = optional(errors, "contact_phone", raw.contact_phone.trim(), CONTACT_PHONE_MAX);

  const shippingFullName = required(
    errors,
    "shipping_full_name",
    raw.shipping_full_name.trim(),
    ADDRESS_FIELD_MAX,
  );
  const addressLine1 = required(errors, "address_line1", raw.address_line1.trim(), ADDRESS_FIELD_MAX);
  const addressLine2 = optional(errors, "address_line2", raw.address_line2.trim(), ADDRESS_FIELD_MAX);
  const city = required(errors, "city", raw.city.trim(), ADDRESS_FIELD_MAX);

  const postalCode = raw.postal_code.trim();
  if (postalCode.length === 0) {
    errors.postal_code = "required";
  } else if (!MEXICAN_CP_PATTERN.test(postalCode)) {
    errors.postal_code = "cp-invalid";
  }

  const state = raw.state.trim();
  if (state.length === 0) {
    errors.state = "required";
  } else if (!isMexicanState(state)) {
    errors.state = "state-invalid";
  }

  const deliveryNotes = optional(errors, "delivery_notes", raw.delivery_notes.trim(), DELIVERY_NOTES_MAX);
  const rfc = optional(errors, "rfc", raw.rfc.trim().toUpperCase(), RFC_MAX);
  const shippingCents = parseShippingOverride(errors, raw.shipping_override);
  const internalNote = boundInternalNote(raw.internal_note);
  const lines = parseLines(errors, raw.lines);
  const paymentChoice: ManualPaymentChoice = raw.payment_choice === "paid" ? "paid" : "pending";

  if (Object.keys(errors).length > 0) {
    return { ok: false, fieldErrors: errors };
  }

  return {
    ok: true,
    input: {
      contactName,
      contactEmail,
      contactPhone,
      shippingFullName,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      deliveryNotes,
      rfc,
      shippingCents,
      internalNote,
      lines,
      paymentChoice,
      sendConfirmation: raw.send_confirmation === true,
    },
  };
}

/** Trim + bound the internal note to its cap; blank → null (never errors). */
function boundInternalNote(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.length > INTERNAL_NOTE_MAX_LENGTH ? trimmed.slice(0, INTERNAL_NOTE_MAX_LENGTH) : trimmed;
}
