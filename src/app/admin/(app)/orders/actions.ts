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
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireSession } from "@/lib/admin/require-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import { ADMIN_ORDERS_PATH } from "@/lib/admin/constants";
import { parseStatusTransition } from "@/lib/admin/orders/order-status-input";
import { advanceOrderTo, markOrderPaidOffline } from "@/lib/admin/orders/order-status-write";
import { parseTrackingInput } from "@/lib/admin/orders/order-tracking-input";
import { saveOrderTracking } from "@/lib/admin/orders/order-tracking-write";
import { cancelOrder as cancelOrderWrite } from "@/lib/admin/orders/order-cancel-write";
import { parseRefundInput } from "@/lib/admin/orders/order-refund-input";
import { refundOrder as refundOrderWrite } from "@/lib/admin/orders/order-refund-write";
import { addOrderNote } from "@/lib/admin/orders/order-notes-write";
import { STATUS_NOTE_MAX_LENGTH } from "@/lib/admin/orders/order-constants";
import { parseManualOrderInput } from "@/lib/admin/orders/manual-order-input";
import { createManualOrder as createManualOrderWrite } from "@/lib/admin/orders/manual-order-write";
import { searchCatalog, type CatalogProductResult } from "@/lib/admin/orders/manual-order-catalog";
import { readManualOrderForm } from "@/lib/admin/orders/manual-order-form-read";
import type {
  ManualOrderFormState,
} from "@/app/admin/(app)/orders/manual-order-form-state";
import type { OrderStatus } from "@/lib/supabase/database.types";
import type {
  AdvanceStatusActionResult,
  SetTrackingActionResult,
  CancelOrderActionResult,
  RefundOrderActionResult,
  AddNoteActionResult,
  MarkPaidActionResult,
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

/**
 * Record that an order was paid outside Mercado Pago (cash / transfer / on
 * delivery). Flips payment_status → paid via the payment-only advance path,
 * stamps payment_method='manual', writes an audit row; sends no email. Idempotent
 * (an already-paid/refunded order returns `already-paid`).
 */
export async function markPaidOffline(orderId: string): Promise<MarkPaidActionResult> {
  await requireSession();
  if (!UUID_PATTERN.test(orderId)) {
    return { ok: false, reason: "not-found" };
  }
  const result = await markOrderPaidOffline(orderId);
  if (!result.ok) {
    if (result.reason === "not-found") return { ok: false, reason: "not-found" };
    if (result.reason === "already-paid") return { ok: false, reason: "already-paid" };
    return { ok: false, reason: "error" };
  }
  revalidateOrder(orderId);
  return { ok: true };
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

/**
 * Search the active catalog for the manual-order product picker (T17). Admin-only
 * (session re-checked before any DB read). Returns live stock + server-recalculated
 * prices; the client never computes a price. Errors degrade to an empty list (the
 * picker shows "no results") rather than throwing into the client island.
 */
export async function searchManualOrderCatalog(term: string): Promise<CatalogProductResult[]> {
  await requireSession();
  if (typeof term !== "string") {
    return [];
  }
  return searchCatalog(term);
}

/**
 * Create a manual / phone order (T17). `useActionState` grammar (mirrors the
 * product-create action): session re-checked FIRST, then pure input validation,
 * then the write orchestration (revalidate → assemble → create_order → source /
 * paid mark → optional confirmation). On success `redirect()`s to the new order's
 * detail with the `created` flag so the detail renders the success banner + the
 * paid/email sub-outcomes. Line-issue / invalid / error outcomes return state so
 * the form re-renders with per-field / per-line messages and preserved values.
 */
export async function createManualOrder(
  prevState: ManualOrderFormState,
  formData: FormData,
): Promise<ManualOrderFormState> {
  await requireSession();
  const submissionId = prevState.submissionId + 1;

  const { raw, values } = readManualOrderForm(formData);
  const idempotencyKey = normalizeIdempotencyKey(formData.get("idempotency_key"));

  const parsed = parseManualOrderInput(raw);
  if (!parsed.ok) {
    return { status: "invalid", submissionId, values, fieldErrors: parsed.fieldErrors };
  }

  const result = await createManualOrderWrite({ input: parsed.input, idempotencyKey });
  if (!result.ok) {
    if (result.kind === "line-issues") {
      return { status: "lineIssues", submissionId, values, lineIssues: result.lineIssues };
    }
    return { status: "error", submissionId, values };
  }

  revalidateOrder(result.orderId);
  redirect(buildDetailSuccessUrl(result.orderId, result));
}

/** Mint a server idempotency key when the client key is missing/blank (edge 3). */
function normalizeIdempotencyKey(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.length > 0 ? value : randomUUID();
}

/** Build the detail redirect URL carrying the success banner sub-outcomes. */
function buildDetailSuccessUrl(
  orderId: string,
  result: { orderNumber: string; paidStepFailed: boolean; emailSent: boolean | null },
): string {
  const params = new URLSearchParams({ created: result.orderNumber });
  if (result.paidStepFailed) {
    params.set("paidFailed", "1");
  }
  if (result.emailSent === false) {
    params.set("emailFailed", "1");
  }
  return `${ADMIN_ORDERS_PATH}/${orderId}?${params.toString()}`;
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
