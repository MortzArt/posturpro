"use server";

/**
 * Order server actions (T12). Each re-verifies the session FIRST
 * (`requireSession()` → redirect before any DB touch, AC-30 / edge "session
 * expired") then delegates to a typed write layer in `lib/admin/orders/`. Only
 * async functions are exported (T10 rule; result types live in
 * `lib/admin/orders/order-action-types.ts`). Every write path revalidates the
 * detail page so the refreshed UI shows the new state.
 */
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/admin/require-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import { ADMIN_ORDERS_PATH } from "@/lib/admin/constants";
import { parseStatusTransition } from "@/lib/admin/orders/order-status-input";
import { advanceOrderTo } from "@/lib/admin/orders/order-status-write";
import { parseTrackingInput } from "@/lib/admin/orders/order-tracking-input";
import { saveOrderTracking } from "@/lib/admin/orders/order-tracking-write";
import { cancelOrder as cancelOrderWrite } from "@/lib/admin/orders/order-cancel-write";
import { parseRefundInput } from "@/lib/admin/orders/order-refund-input";
import { refundOrder as refundOrderWrite } from "@/lib/admin/orders/order-refund-write";
import { addOrderNote } from "@/lib/admin/orders/order-notes-write";
import { STATUS_NOTE_MAX_LENGTH } from "@/lib/admin/orders/order-constants";
import type { OrderStatus } from "@/lib/supabase/database.types";
import type {
  AdvanceStatusActionResult,
  SetTrackingActionResult,
  CancelOrderActionResult,
  RefundOrderActionResult,
  AddNoteActionResult,
} from "@/lib/admin/orders/order-action-types";

/**
 * Trim + bound a status-history note (manual-advance note / cancel reason).
 * `order_status_history.note` has NO DB length CHECK, so the write path caps it
 * here (defense in depth beyond the client textarea `maxLength`). Empty → null;
 * over-length is clamped to the cap rather than rejected so a legitimate action
 * never fails on a slightly-too-long note.
 */
function boundStatusNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, STATUS_NOTE_MAX_LENGTH);
}

/** Revalidate an order's detail page + the list after a write. */
function revalidateOrder(orderId: string): void {
  revalidatePath(`${ADMIN_ORDERS_PATH}/${orderId}`);
  revalidatePath(ADMIN_ORDERS_PATH);
}

/** Read the current order status (for the local transition pre-check). */
async function readOrderStatus(orderId: string): Promise<OrderStatus | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error(`[admin-orders] status read failed for ${orderId}: ${error.message}`);
    return null;
  }
  return data.status;
}

/** Advance an order to a valid next status (fires the branched email). */
export async function advanceStatus(
  orderId: string,
  targetStatus: string,
  note?: string,
): Promise<AdvanceStatusActionResult> {
  await requireSession();
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, reason: "not-found" };
  }
  const current = await readOrderStatus(orderId);
  if (!current) {
    return { ok: false, reason: "not-found" };
  }
  const parsed = parseStatusTransition(current, targetStatus);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason === "invalid-status" ? "invalid" : "not-allowed" };
  }
  const trimmedNote = boundStatusNote(note);
  const result = await advanceOrderTo(orderId, parsed.target, trimmedNote);
  if (!result.ok) {
    if (result.reason === "regression") return { ok: false, reason: "regression" };
    if (result.reason === "not-found") return { ok: false, reason: "not-found" };
    return { ok: false, reason: "error" };
  }
  revalidateOrder(orderId);
  return { ok: true, emailSent: result.emailSent };
}

/** Persist the tracking fields (number/carrier/url). */
export async function setTracking(
  orderId: string,
  input: { trackingNumber: string; carrier: string; trackingUrl: string },
): Promise<SetTrackingActionResult> {
  await requireSession();
  const parsed = parseTrackingInput(input);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.error === "url-invalid" ? "url-invalid" : "too-long" };
  }
  const result = await saveOrderTracking(orderId, parsed.values);
  if (!result.ok) {
    return { ok: false, reason: result.reason === "not-found" ? "not-found" : "error" };
  }
  revalidateOrder(orderId);
  return { ok: true };
}

/** Cancel an order (transactional stock restore + cancelled email). */
export async function cancelOrder(
  orderId: string,
  reason?: string,
): Promise<CancelOrderActionResult> {
  await requireSession();
  const result = await cancelOrderWrite(orderId, boundStatusNote(reason));
  if (!result.ok) {
    return { ok: false, reason: result.reason === "not-found" ? "not-found" : "error" };
  }
  revalidateOrder(orderId);
  return { ok: true, emailSent: result.emailSent };
}

/**
 * Refund an order's payment (full or partial). The FIRST caller of the money-
 * movement refund path. `idempotencyKey` is a stable per-action key minted once
 * per user open/submit cycle by the client (retry-safe at MP, AC-19).
 */
export async function refundOrder(
  orderId: string,
  input: { mode: "full" | "partial"; amountMxn?: number },
  idempotencyKey: string,
): Promise<RefundOrderActionResult> {
  await requireSession();
  const parsed = parseRefundInput(input);
  if (!parsed.ok) {
    return { ok: false, reason: "invalid" };
  }
  const key = idempotencyKey.trim();
  if (key === "") {
    return { ok: false, reason: "invalid" };
  }
  const result = await refundOrderWrite(orderId, parsed.amountCents, key);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  revalidateOrder(orderId);
  return { ok: true, kind: result.kind, emailSent: result.emailSent };
}

/** Add an internal (admin-only) note to an order. */
export async function addInternalNote(
  orderId: string,
  body: string,
): Promise<AddNoteActionResult> {
  await requireSession();
  const result = await addOrderNote(orderId, body);
  if (!result.ok) {
    if (result.reason === "empty") return { ok: false, reason: "empty" };
    if (result.reason === "too-long") return { ok: false, reason: "too-long" };
    if (result.reason === "not-found") return { ok: false, reason: "not-found" };
    return { ok: false, reason: "error" };
  }
  revalidateOrder(orderId);
  return { ok: true };
}
