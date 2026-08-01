/**
 * PURE parse/validate of a refund request (T12 AC-16/17). No I/O. `full` → a null
 * amount (the refund fn refunds the remaining balance). `partial` → an integer
 * MXN amount converted to cents via `pesosToCents`; must be a positive integer of
 * pesos (the modal's `MoneyField` yields a decimal string, but a refund amount is
 * whole pesos here — the DB `record_refund` cumulative guard is the race-safe
 * authority for the over-refund check).
 */
import { pesosToCents } from "@/lib/money";
import { INT4_MAX } from "@/lib/config";

/** Parse result for a refund request. */
export type RefundParseResult =
  | { ok: true; amountCents: number | null; mode: "full" | "partial" }
  | { ok: false; reason: "amount-invalid" };

/**
 * Parse a refund request. `full` ignores the amount and returns `null` (remaining
 * balance). `partial` requires a positive integer peso amount (no fractional
 * centavos — refunds are whole pesos in Phase 1) bounded by the int4 cents ceiling.
 */
export function parseRefundInput(raw: {
  mode: string;
  amountMxn?: number;
}): RefundParseResult {
  if (raw.mode === "full") {
    return { ok: true, amountCents: null, mode: "full" };
  }
  if (raw.mode !== "partial") {
    return { ok: false, reason: "amount-invalid" };
  }
  const pesos = raw.amountMxn;
  if (pesos === undefined || !Number.isFinite(pesos) || !Number.isInteger(pesos) || pesos <= 0) {
    return { ok: false, reason: "amount-invalid" };
  }
  const cents = pesosToCents(pesos);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > INT4_MAX) {
    return { ok: false, reason: "amount-invalid" };
  }
  return { ok: true, amountCents: cents, mode: "partial" };
}
