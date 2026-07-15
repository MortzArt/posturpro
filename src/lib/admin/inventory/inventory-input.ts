/**
 * PURE inventory-adjustment parsing (T11 Slice 6, AC-25/26). No I/O, no Next
 * imports — unit-testable. Two modes: a signed delta (±) or an absolute new
 * total. A required, bounded reason. Computes the resulting stock and rejects a
 * negative result BEFORE the write (the DB CHECK is the backstop). The actual
 * atomic write is the `record_inventory_adjustment` RPC in `inventory-write.ts`.
 */
import { ADJUSTMENT_REASON_MAX_LENGTH } from "@/lib/config";

/** A stock-adjustment target: the product itself or a specific variant. */
export interface InventoryTarget {
  /** Variant id, or null for the product-level stock. */
  variantId: string | null;
  /** Display label (color name for a variant, or the product name). */
  label: string;
  /** Current stock of this target. */
  stock: number;
}

/** Adjustment mode: delta (±) or absolute new total. */
export type AdjustmentMode = "delta" | "absolute";

/** Field-error keys for the adjustment form. */
export type AdjustmentFieldError =
  | "amount-invalid"
  | "reason-required"
  | "reason-too-long"
  | "result-negative";

/** Raw adjustment input (all strings, as submitted). */
export interface AdjustmentRawInput {
  mode: string;
  amount: string;
  reason: string;
}

/** The validated adjustment ready for the RPC. */
export interface AdjustmentParsed {
  /** Signed delta, or null when absolute mode is used. */
  delta: number | null;
  /** Absolute new total, or null when delta mode is used. */
  absolute: number | null;
  reason: string;
  /** The computed post-write stock (for the live preview + validation). */
  resultingStock: number;
}

/** Parse result: the adjustment, or per-field errors. */
export type AdjustmentParseResult =
  | { ok: true; values: AdjustmentParsed }
  | { ok: false; fieldErrors: Partial<Record<"amount" | "reason", AdjustmentFieldError>> };

/** Parse a signed integer (delta may be negative; absolute must be ≥ 0 by shape). */
function parseSignedInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Parse + validate an adjustment against the current stock. `currentStock` lets
 * the parser compute + validate the resulting stock in one pass (same value the
 * UI shows in the live preview).
 */
export function parseAdjustment(
  raw: AdjustmentRawInput,
  currentStock: number,
): AdjustmentParseResult {
  const fieldErrors: Partial<Record<"amount" | "reason", AdjustmentFieldError>> = {};

  const amount = parseSignedInt(raw.amount);
  if (amount === null) fieldErrors.amount = "amount-invalid";

  const reason = raw.reason.trim();
  if (reason.length === 0) {
    fieldErrors.reason = "reason-required";
  } else if (reason.length > ADJUSTMENT_REASON_MAX_LENGTH) {
    fieldErrors.reason = "reason-too-long";
  }

  const mode: AdjustmentMode = raw.mode === "absolute" ? "absolute" : "delta";

  if (amount === null || fieldErrors.reason) {
    return { ok: false, fieldErrors };
  }

  const resultingStock = mode === "absolute" ? amount : currentStock + amount;
  if (resultingStock < 0) {
    return { ok: false, fieldErrors: { amount: "result-negative" } };
  }

  return {
    ok: true,
    values: {
      delta: mode === "delta" ? amount : null,
      absolute: mode === "absolute" ? amount : null,
      reason,
      resultingStock,
    },
  };
}

/** Compute the previewed resulting stock (client live preview; may be negative). */
export function previewResultingStock(
  mode: AdjustmentMode,
  amount: number,
  currentStock: number,
): number {
  return mode === "absolute" ? amount : currentStock + amount;
}
