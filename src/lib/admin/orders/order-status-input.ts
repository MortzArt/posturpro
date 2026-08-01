/**
 * PURE parse/validate of a requested manual status transition (T12 AC-8). No I/O.
 * Validates the target against the DB `order_status` enum and the UI-offered
 * allowed-transition map (`order-status-meta.ts`). The DB `advance_order_status`
 * regression guard remains the race-safe authority — this is the fast local gate.
 */
import { ALLOWED_NEXT_STATUSES } from "@/lib/admin/orders/order-status-meta";
import type { OrderStatus } from "@/lib/supabase/database.types";

const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];

/** Whether `value` is a valid `order_status` enum member. */
export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUS_VALUES as readonly string[]).includes(value);
}

/** Parse result for a requested transition. */
export type StatusParseResult =
  | { ok: true; target: OrderStatus }
  | { ok: false; reason: "invalid-status" | "not-allowed" };

/**
 * Parse a requested manual transition from `current` to `rawTarget`. Rejects a
 * non-enum target (`invalid-status`) and a target not in the offered set for the
 * current status (`not-allowed`). `cancelled` is never offered here (it is the
 * dedicated Cancel action) → `not-allowed`.
 */
export function parseStatusTransition(
  current: OrderStatus,
  rawTarget: string,
): StatusParseResult {
  if (!isOrderStatus(rawTarget)) {
    return { ok: false, reason: "invalid-status" };
  }
  if (!ALLOWED_NEXT_STATUSES[current].includes(rawTarget)) {
    return { ok: false, reason: "not-allowed" };
  }
  return { ok: true, target: rawTarget };
}
