/**
 * POST /api/webhooks/mercadopago — the repo's FIRST route handler (T8 AC-7, AC-8).
 *
 * This is a PUBLIC, unauthenticated endpoint BY MERCADO PAGO'S DESIGN — MP posts
 * server-to-server and cannot present a session. The ONLY authentication is the
 * `x-signature` HMAC check (AC-8), which runs BEFORE any DB read or state change.
 *
 * ⚠️ HUMAN-REVIEW GATE (BUILD_PLAN rule 3): this is payment/trust-boundary code.
 * A human MUST review signature verification, amount reconciliation, and order
 * advancement before this ships, regardless of any pipeline SHIP verdict.
 *
 * Contract:
 *   - Bad / missing / malformed signature → 401, NO DB read, NO state change.
 *   - Non-`payment` type (merchant_order / test ping) → verified, then 200 ignore.
 *   - Verified `payment` → fetch authoritative payment, dedupe, reconcile amount,
 *     advance via RPC. 200 for processed / duplicate / unknown / mismatch / flag
 *     (so MP stops retrying, AC-11); 500 only for a genuine internal/MP-down error
 *     (so MP retries later).
 *
 * `runtime = "nodejs"` is REQUIRED: signature verification uses Node's `crypto`
 * (`timingSafeEqual`), unavailable on the edge runtime.
 */
import { NextResponse } from "next/server";
import { getMercadoPagoEnv, MissingEnvVarError } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/payments/webhook";
import { processPaymentNotification } from "@/lib/payments/process-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** MP notification body shape (only the fields we consume). */
interface MpNotificationBody {
  type?: string;
  action?: string;
  data?: { id?: string | number };
}

export async function POST(request: Request): Promise<Response> {
  // 1. Read the raw body ONCE (we need it for both id extraction and to avoid a
  //    double-consume). A body that isn't valid JSON is handled below (edge 12).
  const rawBody = await request.text();

  // 2. Extract data.id — MP puts it in the query string AND/OR the JSON body.
  //    The query value is authoritative for the signature manifest per MP docs;
  //    fall back to the body. (edge 12: tolerate a non-JSON body.)
  const url = new URL(request.url);
  const queryDataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const body = parseBody(rawBody);
  const dataId = queryDataId ?? normalizeId(body?.data?.id);

  // 3. Verify the signature BEFORE any side effect (AC-8). Fail closed on any
  //    missing/blank secret, malformed header, or mismatch → 401.
  const secret = readWebhookSecret();
  if (secret === null) {
    // Misconfiguration: no secret. Cannot verify → reject (never process blind).
    console.error("[payments] webhook: MERCADOPAGO_WEBHOOK_SECRET not configured");
    return json({ error: "unauthorized" }, 401);
  }
  const verification = verifyWebhookSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
    secret,
  });
  if (!verification.ok) {
    console.warn(`[payments] webhook: signature rejected (${verification.reason})`);
    return json({ error: "unauthorized" }, 401);
  }

  // 4. Only `type=payment` is actionable. Everything else (merchant_order, test
  //    ping) is acknowledged 200 and ignored (edge 12) — signature already valid.
  const type = body?.type ?? url.searchParams.get("type") ?? "";
  if (type !== "payment") {
    return json({ received: true, ignored: type || "unknown-type" }, 200);
  }
  if (!dataId) {
    // A payment notification with no id is malformed but signed — ack + ignore.
    console.warn("[payments] webhook: payment notification without data.id");
    return json({ received: true, ignored: "no-data-id" }, 200);
  }

  // 5. Process the payment (fetch → dedupe → reconcile → advance).
  try {
    const result = await processPaymentNotification(dataId, body?.action ?? null);
    if (result.httpOk) {
      return json({ received: true, result: result.kind }, 200);
    }
    return json({ error: result.kind }, 500);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[payments] webhook: unhandled processing error: ${message}`);
    return json({ error: "internal" }, 500);
  }
}

/** Read the webhook secret, returning null if unconfigured (fail closed). */
function readWebhookSecret(): string | null {
  try {
    return getMercadoPagoEnv().webhookSecret;
  } catch (caught) {
    if (caught instanceof MissingEnvVarError) {
      return null;
    }
    throw caught;
  }
}

/** Parse the raw body as an MP notification; null on non-JSON (edge 12). */
function parseBody(raw: string): MpNotificationBody | null {
  if (raw.trim() === "") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as MpNotificationBody;
    }
    return null;
  } catch {
    return null;
  }
}

/** Normalize a data.id (string | number | undefined) to a trimmed string | null. */
function normalizeId(id: string | number | undefined): string | null {
  if (id === undefined || id === null) {
    return null;
  }
  const value = String(id).trim();
  return value === "" ? null : value;
}

/** JSON response helper. */
function json(body: Record<string, unknown>, status: number): Response {
  return NextResponse.json(body, { status });
}
