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

/**
 * Maximum accepted request body size (bytes). MP notifications are tiny (a few
 * hundred bytes of JSON). This caps the ONLY public unauthenticated write endpoint
 * against a memory-exhaustion DoS (M-5) — a body over this limit is rejected 413
 * BEFORE it is read into memory. Generous headroom over real MP payloads.
 */
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024; // 64 KB

/** MP notification body shape (only the fields we consume). */
interface MpNotificationBody {
  type?: string;
  action?: string;
  data?: { id?: string | number };
}

export async function POST(request: Request): Promise<Response> {
  // 0. Bound the body BEFORE reading it (M-5). Reject an oversized declared
  //    Content-Length with 413; also enforce the cap on the actual bytes read (a
  //    missing/lying Content-Length can't smuggle an unbounded body past us).
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    console.warn(`[payments] webhook: body too large (content-length=${declaredLength})`);
    return json({ error: "payload-too-large" }, 413);
  }

  // 1. Read the raw body ONCE, enforcing the byte cap on the actual read.
  let rawBody: string;
  try {
    rawBody = await readBoundedBody(request, MAX_WEBHOOK_BODY_BYTES);
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) {
      console.warn("[payments] webhook: body exceeded cap while reading");
      return json({ error: "payload-too-large" }, 413);
    }
    throw caught;
  }

  // 2. Extract data.id. CRITICAL (C-1): MP builds the signed manifest from the
  //    QUERY-STRING `data.id` ONLY — never the body. `signatureDataId` (query,
  //    or null) is the SOLE input to the verifier; the body id is used ONLY as a
  //    fallback source for the authoritative Payment.get fetch, never for the
  //    manifest. Mixing the two produces false 401s (C-1). (edge 12: tolerate a
  //    non-JSON body.)
  const url = new URL(request.url);
  const signatureDataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const body = parseBody(rawBody);
  // Fetch id: prefer the query id (what was signed), fall back to the body id.
  const fetchDataId = signatureDataId ?? normalizeId(body?.data?.id);

  // 3. Verify the signature BEFORE any side effect (AC-8). Fail closed on any
  //    missing/blank secret, malformed header, mismatch, or STALE ts → 401.
  const secret = readWebhookSecret();
  if (secret === null) {
    // Misconfiguration: no secret. Cannot verify → reject (never process blind).
    console.error("[payments] webhook: MERCADOPAGO_WEBHOOK_SECRET not configured");
    return json({ error: "unauthorized" }, 401);
  }
  const verification = verifyWebhookSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId: signatureDataId, // C-1: query id ONLY — the exact source MP signs.
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
  if (!fetchDataId) {
    // A payment notification with no id is malformed but signed — ack + ignore.
    console.warn("[payments] webhook: payment notification without data.id");
    return json({ received: true, ignored: "no-data-id" }, 200);
  }

  // 5. Process the payment (fetch → dedupe → reconcile → advance).
  try {
    const result = await processPaymentNotification(fetchDataId, body?.action ?? null);
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

/** Thrown by {@link readBoundedBody} when the request body exceeds the cap (M-5). */
class BodyTooLargeError extends Error {
  constructor() {
    super("request body exceeded the maximum allowed size");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Read a request body as text, aborting if it exceeds `maxBytes` (M-5). Streams
 * the body and accumulates bytes, throwing {@link BodyTooLargeError} the moment
 * the running total crosses the cap — so a lying/absent Content-Length cannot
 * smuggle an unbounded body into memory. Falls back to `request.text()` when the
 * body isn't a readable stream (still bounded by the earlier Content-Length gate).
 */
async function readBoundedBody(request: Request, maxBytes: number): Promise<string> {
  const stream = request.body;
  if (!stream) {
    return request.text();
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          throw new BodyTooLargeError();
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
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
