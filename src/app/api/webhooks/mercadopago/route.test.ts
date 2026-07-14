/**
 * Webhook ROUTE handler tests (T8 AC-7, AC-8, edges 11/12; Stage-6 locks C-1, M-5).
 * The route is the repo's FIRST route.ts and the ONLY public unauthenticated write
 * endpoint — its trust boundary must be automated, not only exercised live.
 *
 * The signature is verified by the REAL `verifyWebhookSignature` (so a wrong id
 * source or a tampered body is genuinely rejected — C-1), against a known secret
 * injected via a mocked `getMercadoPagoEnv`. `processPaymentNotification` is mocked
 * so we test only the ROUTE's responsibilities: body-size cap (M-5), signature gate
 * (AC-8), query-vs-body data.id sourcing (C-1), type dispatch (edge 12), and the
 * httpOk→status mapping. Node's real `crypto` builds valid signatures in-test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("server-only", () => ({}));

// Inject a known webhook secret; the route reads it via getMercadoPagoEnv().
const getMercadoPagoEnv = vi.fn();
vi.mock("@/lib/env", () => {
  // Defined INSIDE the factory (vi.mock is hoisted; a top-level class would be
  // in the temporal-dead-zone at hoist time).
  class MissingEnvVarError extends Error {
    variableName: string;
    constructor(name: string) {
      super(`Missing ${name}`);
      this.name = "MissingEnvVarError";
      this.variableName = name;
    }
  }
  return {
    getMercadoPagoEnv: () => getMercadoPagoEnv(),
    MissingEnvVarError,
  };
});

// Import the SAME mocked class the route's `instanceof` check uses, so the
// "secret not configured" test throws a value the route recognizes.
import { MissingEnvVarError } from "@/lib/env";

// Mock the processing core — the route test asserts only that it is (or is not)
// invoked and how its ProcessResult maps to HTTP.
const processPaymentNotification = vi.fn();
vi.mock("@/lib/payments/process-payment", () => ({
  processPaymentNotification: (...args: unknown[]) => processPaymentNotification(...args),
}));

import { POST } from "./route";

const SECRET = "test_webhook_secret_key";
const WEBHOOK_URL = "http://localhost/api/webhooks/mercadopago";

/** Build a valid x-signature header for the given signed data.id (query id). */
function signature(dataId: string | null, requestId: string, ts = String(Math.floor(Date.now() / 1000))): string {
  let manifest = "";
  if (dataId) {
    manifest += `id:${dataId.toLowerCase()};`;
  }
  manifest += `request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

/** Build a POST Request with an optional signed header + JSON body + query id. */
function makeRequest(opts: {
  queryDataId?: string | null;
  body?: unknown;
  requestId?: string;
  signedDataId?: string | null | "none"; // "none" = omit the x-signature header
  contentLength?: string;
  rawBody?: string;
}): Request {
  const requestId = opts.requestId ?? "req-1";
  const url = new URL(WEBHOOK_URL);
  if (opts.queryDataId) {
    url.searchParams.set("data.id", opts.queryDataId);
  }
  const headers = new Headers({ "x-request-id": requestId, "content-type": "application/json" });
  if (opts.signedDataId !== "none") {
    const signedId = opts.signedDataId === undefined ? opts.queryDataId ?? null : opts.signedDataId;
    headers.set("x-signature", signature(signedId, requestId));
  }
  if (opts.contentLength) {
    headers.set("content-length", opts.contentLength);
  }
  const body = opts.rawBody ?? (opts.body === undefined ? "" : JSON.stringify(opts.body));
  return new Request(url.toString(), { method: "POST", headers, body });
}

beforeEach(() => {
  getMercadoPagoEnv.mockReset();
  getMercadoPagoEnv.mockReturnValue({ accessToken: "tok", webhookSecret: SECRET });
  processPaymentNotification.mockReset();
  processPaymentNotification.mockResolvedValue({ kind: "processed", httpOk: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/mercadopago — signature gate (AC-8)", () => {
  it("401s a missing x-signature header — NO processing", async () => {
    const res = await POST(makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } }, signedDataId: "none" }));
    expect(res.status).toBe(401);
    expect(processPaymentNotification).not.toHaveBeenCalled();
  });

  it("401s a tampered / mismatched signature — NO processing", async () => {
    const req = makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } });
    req.headers.set("x-signature", `ts=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`);
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processPaymentNotification).not.toHaveBeenCalled();
  });

  it("401s a malformed x-signature header", async () => {
    const req = makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } });
    req.headers.set("x-signature", "garbage");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("401s (fail closed) when the webhook secret is not configured", async () => {
    getMercadoPagoEnv.mockImplementation(() => {
      throw new MissingEnvVarError("MERCADOPAGO_WEBHOOK_SECRET");
    });
    const res = await POST(makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } }));
    expect(res.status).toBe(401);
    expect(processPaymentNotification).not.toHaveBeenCalled();
  });

  it("C-1: the signature is verified with the QUERY id, not the BODY id", async () => {
    // Sign the manifest with the QUERY id "query-777"; body carries a DIFFERENT id.
    // The route must feed the query id to the verifier → valid. If it ever fed the
    // body id, the HMAC would mismatch → 401. This locks C-1 at the route seam.
    const req = makeRequest({
      queryDataId: "query-777",
      body: { type: "payment", data: { id: "body-888" } },
      signedDataId: "query-777",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // The FETCH id prefers the query id (what was signed); no action → null.
    expect(processPaymentNotification).toHaveBeenCalledWith("query-777", null);
  });

  it("C-1: a signature valid for the body id (not the query id) is REJECTED", async () => {
    // Sign with the body id; the route verifies with the query id → mismatch → 401.
    const req = makeRequest({
      queryDataId: "query-777",
      body: { type: "payment", data: { id: "body-888" } },
      signedDataId: "body-888",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/webhooks/mercadopago — body size cap (M-5)", () => {
  it("413s a declared Content-Length over the 64KB cap BEFORE reading", async () => {
    const req = makeRequest({
      queryDataId: "111",
      body: { type: "payment", data: { id: "111" } },
      contentLength: String(65 * 1024),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(processPaymentNotification).not.toHaveBeenCalled();
  });

  it("413s an oversized STREAMED body even when Content-Length lies (under-declares)", async () => {
    // A real >64KB JSON body with a small/absent declared length — the bounded
    // stream read must still abort at the cap (a lying length can't smuggle it).
    const huge = "x".repeat(70 * 1024);
    const rawBody = JSON.stringify({ type: "payment", data: { id: "111" }, pad: huge });
    const req = makeRequest({ queryDataId: "111", rawBody, signedDataId: "111" });
    // Force a small declared length so the pre-read gate passes and the stream cap fires.
    req.headers.set("content-length", "100");
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(processPaymentNotification).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/mercadopago — type dispatch (edge 12)", () => {
  it("200 ignores a non-payment type (merchant_order) after verifying the signature", async () => {
    const res = await POST(
      makeRequest({ queryDataId: "111", body: { type: "merchant_order", data: { id: "111" } } }),
    );
    expect(res.status).toBe(200);
    expect(processPaymentNotification).not.toHaveBeenCalled();
    const json = (await res.json()) as { ignored?: string };
    expect(json.ignored).toBe("merchant_order");
  });

  it("200 ignores a payment notification with no data.id (signed but malformed)", async () => {
    // Signed with a null id (no query id, no body id).
    const url = new URL(WEBHOOK_URL);
    const headers = new Headers({ "x-request-id": "req-1", "content-type": "application/json" });
    headers.set("x-signature", signature(null, "req-1"));
    const req = new Request(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "payment", data: {} }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(processPaymentNotification).not.toHaveBeenCalled();
  });

  it("tolerates a non-JSON body after a valid signature (edge 12) — no crash", async () => {
    // Sign a request whose query id is present; the body is not valid JSON. The
    // type falls back to the query param; with no type it 200-ignores.
    const url = new URL(WEBHOOK_URL);
    url.searchParams.set("data.id", "111");
    url.searchParams.set("type", "merchant_order");
    const headers = new Headers({ "x-request-id": "req-1", "content-type": "application/json" });
    headers.set("x-signature", signature("111", "req-1"));
    const req = new Request(url.toString(), { method: "POST", headers, body: "not-json{{{" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(processPaymentNotification).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/mercadopago — result → HTTP mapping", () => {
  it("200 for a processed payment", async () => {
    processPaymentNotification.mockResolvedValue({ kind: "processed", httpOk: true });
    const res = await POST(makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } }));
    expect(res.status).toBe(200);
  });

  it("200 for a duplicate (MP stops retrying, AC-10/11)", async () => {
    processPaymentNotification.mockResolvedValue({ kind: "duplicate", httpOk: true });
    const res = await POST(makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } }));
    expect(res.status).toBe(200);
  });

  it("200 for an unknown order (never 500 — MP would retry forever, AC-11)", async () => {
    processPaymentNotification.mockResolvedValue({ kind: "unknown-order", httpOk: true });
    const res = await POST(makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } }));
    expect(res.status).toBe(200);
  });

  it("200 for an amount mismatch (flagged internally, AC-12)", async () => {
    processPaymentNotification.mockResolvedValue({ kind: "amount-mismatch", httpOk: true });
    const res = await POST(makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } }));
    expect(res.status).toBe(200);
  });

  it("500 for an advance-blocked result so MP retries (M-7)", async () => {
    processPaymentNotification.mockResolvedValue({ kind: "advance-blocked", httpOk: false });
    const res = await POST(makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } }));
    expect(res.status).toBe(500);
  });

  it("500 when MP is unavailable so MP retries (edge 11)", async () => {
    processPaymentNotification.mockResolvedValue({ kind: "mp-unavailable", httpOk: false });
    const res = await POST(makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } }));
    expect(res.status).toBe(500);
  });

  it("500 (never leaks) when processing throws unexpectedly", async () => {
    processPaymentNotification.mockRejectedValue(new Error("SECRET boom"));
    const res = await POST(makeRequest({ queryDataId: "111", body: { type: "payment", data: { id: "111" } } }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: string };
    expect(JSON.stringify(json)).not.toContain("SECRET boom");
  });

  it("prefers the query id for the fetch, falling back to the body id when query absent", async () => {
    // No query id → the signed manifest omits the id segment; verify with null id,
    // then the fetch id falls back to the body id.
    const url = new URL(WEBHOOK_URL);
    const headers = new Headers({ "x-request-id": "req-1", "content-type": "application/json" });
    headers.set("x-signature", signature(null, "req-1"));
    const req = new Request(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "payment", data: { id: "body-999" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(processPaymentNotification).toHaveBeenCalledWith("body-999", null);
  });

  it("passes the body action through to processing when present", async () => {
    const res = await POST(
      makeRequest({ queryDataId: "111", body: { type: "payment", action: "payment.updated", data: { id: "111" } } }),
    );
    expect(res.status).toBe(200);
    expect(processPaymentNotification).toHaveBeenCalledWith("111", "payment.updated");
  });
});
