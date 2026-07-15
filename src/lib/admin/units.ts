/**
 * PURE unit parsing/formatting for T11 product dimensions + weight. No I/O, no
 * Next imports — exhaustively unit-testable. Dimensions are edited in CENTIMETRES
 * and stored as integer MILLIMETRES (×10); weight is edited in KILOGRAMS and
 * stored as integer GRAMS (×1000). The parser is STRICT and mirrors
 * `parseMoneyToCents`: it strips surrounding whitespace, accepts only
 * `^\d+(\.\d{1,2})?$`, rejects thousand separators / 3+ decimals / negatives /
 * overflow, and treats blank as "not provided" (null) rather than an error —
 * dimensions/weight are optional (0002 columns are nullable).
 */
import { INT4_MAX } from "@/lib/config";

/** Field-error keys for dimension/weight parsing (localized in the form). */
export type UnitFieldError =
  | "unit-invalid"
  | "unit-negative"
  | "unit-too-many-decimals"
  | "unit-overflow";

/** Millimetres per centimetre. */
const MM_PER_CM = 10;
/** Grams per kilogram. */
const G_PER_KG = 1000;

/** Result of parsing an optional unit field: a value, null (blank), or an error. */
export type UnitParseResult =
  | { ok: true; value: number | null }
  | { ok: false; error: UnitFieldError };

/** Strict `^\d+(\.\d{1,2})?$` core → integer after applying `factor`. */
function parseScaledInteger(raw: string, factor: number): UnitParseResult {
  const stripped = raw.trim();
  if (stripped === "") {
    return { ok: true, value: null };
  }
  if (stripped.startsWith("-")) {
    return { ok: false, error: "unit-negative" };
  }
  if (/^\d+\.\d{3,}$/.test(stripped)) {
    return { ok: false, error: "unit-too-many-decimals" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(stripped)) {
    return { ok: false, error: "unit-invalid" };
  }
  // Scale then round to guard against binary float drift (e.g. 12.1 * 10).
  const scaled = Math.round(Number(stripped) * factor);
  // Reject JS-unsafe integers AND anything the int4 mm/g columns can't hold, so
  // an oversized dimension/weight fails as a friendly error rather than a raw
  // Postgres int4 overflow at write time.
  if (!Number.isSafeInteger(scaled) || scaled > INT4_MAX) {
    return { ok: false, error: "unit-overflow" };
  }
  return { ok: true, value: scaled };
}

/** Parse a centimetre string → integer millimetres (or null when blank). */
export function parseCmToMm(raw: string): UnitParseResult {
  return parseScaledInteger(raw, MM_PER_CM);
}

/** Parse a kilogram string → integer grams (or null when blank). */
export function parseKgToG(raw: string): UnitParseResult {
  return parseScaledInteger(raw, G_PER_KG);
}

/** Format integer millimetres back to a centimetre string for the form (or ""). */
export function formatMmToCm(mm: number | null | undefined): string {
  if (mm === null || mm === undefined) return "";
  return trimTrailingZeros(mm / MM_PER_CM);
}

/** Format integer grams back to a kilogram string for the form (or ""). */
export function formatGToKg(g: number | null | undefined): string {
  if (g === null || g === undefined) return "";
  return trimTrailingZeros(g / G_PER_KG);
}

/** Render a number with up to 2 decimals, dropping trailing zeros (12.0 → "12"). */
function trimTrailingZeros(value: number): string {
  return Number(value.toFixed(2)).toString();
}
