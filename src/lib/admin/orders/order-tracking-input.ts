/**
 * PURE parse/validate of the tracking form (T12 AC-11/12). No I/O, no Next
 * imports — unit-testable. Bounds + trims each field; an EMPTY tracking number is
 * VALID (ship without tracking → the shipped email renders `trackingNumber: null`,
 * AC-12). The optional tracking URL must be a plausible http(s) URL or empty.
 */

/** Max characters for the tracking-number / carrier fields. */
export const TRACKING_NUMBER_MAX_LENGTH = 120;
export const TRACKING_CARRIER_MAX_LENGTH = 120;
export const TRACKING_URL_MAX_LENGTH = 500;

/** The DB-ready tracking values (empty strings normalized to null). */
export interface TrackingParsed {
  trackingNumber: string | null;
  carrier: string | null;
  trackingUrl: string | null;
}

/** Which tracking field failed (drives the inline error). */
export type TrackingField = "trackingNumber" | "carrier" | "trackingUrl";

/** Parse result: DB-ready values, or a single field error. */
export type TrackingParseResult =
  | { ok: true; values: TrackingParsed }
  | { ok: false; field: TrackingField; error: "too-long" | "url-invalid" };

/** Trim + null-empty a bounded text field. */
function boundedOrNull(
  raw: string,
  max: number,
): { ok: true; value: string | null } | { ok: false; error: "too-long" } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, error: "too-long" };
  return { ok: true, value: trimmed };
}

/** Whether a non-empty string is a plausible http(s) URL. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Parse the raw tracking-form fields into DB-ready values (or a field error). */
export function parseTrackingInput(raw: {
  trackingNumber: string;
  carrier: string;
  trackingUrl: string;
}): TrackingParseResult {
  const number = boundedOrNull(raw.trackingNumber, TRACKING_NUMBER_MAX_LENGTH);
  if (!number.ok) return { ok: false, field: "trackingNumber", error: "too-long" };

  const carrier = boundedOrNull(raw.carrier, TRACKING_CARRIER_MAX_LENGTH);
  if (!carrier.ok) return { ok: false, field: "carrier", error: "too-long" };

  const url = boundedOrNull(raw.trackingUrl, TRACKING_URL_MAX_LENGTH);
  if (!url.ok) return { ok: false, field: "trackingUrl", error: "too-long" };
  if (url.value !== null && !isHttpUrl(url.value)) {
    return { ok: false, field: "trackingUrl", error: "url-invalid" };
  }

  return {
    ok: true,
    values: {
      trackingNumber: number.value,
      carrier: carrier.value,
      trackingUrl: url.value,
    },
  };
}
