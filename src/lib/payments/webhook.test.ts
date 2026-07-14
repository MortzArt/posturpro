import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildManifest,
  parseSignatureHeader,
  parseTsMs,
  verifyWebhookSignature,
  WEBHOOK_REPLAY_TOLERANCE_MS,
} from "./webhook";

const SECRET = "test_webhook_secret_key";

/**
 * Build a valid x-signature header INDEPENDENTLY of the verifier's manifest logic
 * (C-1): the manifest is spelled out here literally, exactly as MP documents it
 * (`id:<lowercased>;request-id:<>;ts:<>;`, omitting absent segments), so a bug in
 * `buildManifest` — or in WHICH id source the verifier feeds it — is caught by a
 * signature mismatch rather than masked by the test reusing the same builder.
 */
function independentManifest(input: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}): string {
  let manifest = "";
  if (input.dataId) {
    manifest += `id:${input.dataId.toLowerCase()};`;
  }
  if (input.requestId) {
    manifest += `request-id:${input.requestId};`;
  }
  manifest += `ts:${input.ts};`;
  return manifest;
}

/** Sign an independently-built manifest for the given inputs. */
function signedHeader(input: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
  secret?: string;
}): string {
  const manifest = independentManifest(input);
  const v1 = createHmac("sha256", input.secret ?? SECRET).update(manifest).digest("hex");
  return `ts=${input.ts},v1=${v1}`;
}

/** A `ts` string for "now" (seconds), so the replay-window check passes. */
function nowTs(): string {
  return String(Math.floor(Date.now() / 1000));
}

describe("parseSignatureHeader", () => {
  it("parses ts and v1 from a well-formed header", () => {
    expect(parseSignatureHeader("ts=123,v1=abc")).toEqual({ ts: "123", v1: "abc" });
  });

  it("tolerates whitespace and order", () => {
    expect(parseSignatureHeader("v1=abc, ts=123")).toEqual({ ts: "123", v1: "abc" });
  });

  it("returns null for missing header", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
    expect(parseSignatureHeader("   ")).toBeNull();
  });

  it("returns null when a part is absent", () => {
    expect(parseSignatureHeader("ts=123")).toBeNull();
    expect(parseSignatureHeader("v1=abc")).toBeNull();
  });

  it("returns null for a malformed header (no =)", () => {
    expect(parseSignatureHeader("garbage")).toBeNull();
  });
});

describe("buildManifest", () => {
  it("matches the documented format INDEPENDENTLY (id lowercased)", () => {
    const inputs = { dataId: "ABC123", requestId: "req-1", ts: "1700000000" };
    // The implementation must equal the literal MP format spelled out separately.
    expect(buildManifest(inputs)).toBe("id:abc123;request-id:req-1;ts:1700000000;");
    expect(buildManifest(inputs)).toBe(independentManifest(inputs));
  });

  it("omits absent segments (no data.id, no request-id)", () => {
    expect(buildManifest({ dataId: null, requestId: null, ts: "5" })).toBe("ts:5;");
  });

  it("uses ts verbatim (never reformats ms vs s)", () => {
    expect(buildManifest({ dataId: "1", requestId: null, ts: "1700000000123" })).toContain(
      "ts:1700000000123;",
    );
  });
});

describe("parseTsMs (M-4 seconds/ms disambiguation)", () => {
  it("scales a seconds ts to ms", () => {
    expect(parseTsMs("1700000000")).toBe(1700000000000);
  });
  it("passes a ms ts through", () => {
    expect(parseTsMs("1700000000123")).toBe(1700000000123);
  });
  it("returns null for a non-numeric / non-positive ts", () => {
    expect(parseTsMs("nope")).toBeNull();
    expect(parseTsMs("0")).toBeNull();
    expect(parseTsMs("-5")).toBeNull();
  });
});

describe("verifyWebhookSignature", () => {
  const requestId = "req-1";
  const dataId = "payment-42";

  it("accepts a correctly signed, fresh request", () => {
    const ts = nowTs();
    const header = signedHeader({ dataId, requestId, ts });
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId,
      dataId,
      secret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered v1 (signature mismatch)", () => {
    const result = verifyWebhookSignature({
      signatureHeader: `ts=${nowTs()},v1=${"0".repeat(64)}`,
      requestId,
      dataId,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a request signed with the wrong secret", () => {
    const ts = nowTs();
    const header = signedHeader({ dataId, requestId, ts, secret: "attacker_secret" });
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId,
      dataId,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects when the data.id differs from the signed one (replay to another payment)", () => {
    const ts = nowTs();
    const header = signedHeader({ dataId, requestId, ts });
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId,
      dataId: "different-payment",
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
  });

  it("C-1: a signature signed with the QUERY id fails if verified with the BODY id", () => {
    // MP signs the manifest with the query-string data.id. If the route ever fed
    // a DIFFERENT (body) id into the verifier, the HMAC would not match. This
    // mutation-style test proves a wrong-source id is rejected — the verifier
    // must use exactly the id MP signed.
    const ts = nowTs();
    const signedQueryId = "query-id-777";
    const bodyId = "body-id-888";
    const header = signedHeader({ dataId: signedQueryId, requestId, ts });

    // Correct source (query id) → verifies.
    expect(
      verifyWebhookSignature({ signatureHeader: header, requestId, dataId: signedQueryId, secret: SECRET }).ok,
    ).toBe(true);
    // Wrong source (body id) → rejected (this is the C-1 bug, now impossible).
    expect(
      verifyWebhookSignature({ signatureHeader: header, requestId, dataId: bodyId, secret: SECRET }).ok,
    ).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const result = verifyWebhookSignature({
      signatureHeader: null,
      requestId,
      dataId,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "malformed_signature_header" });
  });

  it("rejects a malformed signature header", () => {
    const result = verifyWebhookSignature({
      signatureHeader: "not-a-signature",
      requestId,
      dataId,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "malformed_signature_header" });
  });

  it("fails closed when the secret is blank", () => {
    const header = signedHeader({ dataId, requestId, ts: nowTs() });
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId,
      dataId,
      secret: "",
    });
    expect(result).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("rejects a non-hex v1 without throwing", () => {
    const result = verifyWebhookSignature({
      signatureHeader: `ts=${nowTs()},v1=zzzz`,
      requestId,
      dataId,
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts case-insensitive data.id (uppercase notification id → lowercased manifest)", () => {
    const ts = nowTs();
    // Sign with the lowercased manifest (what MP does), verify passing uppercase.
    const header = signedHeader({ dataId: "abc123", requestId, ts });
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId,
      dataId: "ABC123",
      secret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  describe("replay window (M-4)", () => {
    const fixedTs = "1700000000"; // 2023-11-14, seconds
    const fixedTsMs = 1700000000000;

    it("accepts a fresh ts within the tolerance", () => {
      const header = signedHeader({ dataId, requestId, ts: fixedTs });
      const result = verifyWebhookSignature({
        signatureHeader: header,
        requestId,
        dataId,
        secret: SECRET,
        now: fixedTsMs + 1000, // 1s later
      });
      expect(result.ok).toBe(true);
    });

    it("rejects a valid signature whose ts is stale (captured replay)", () => {
      const header = signedHeader({ dataId, requestId, ts: fixedTs });
      const result = verifyWebhookSignature({
        signatureHeader: header,
        requestId,
        dataId,
        secret: SECRET,
        now: fixedTsMs + WEBHOOK_REPLAY_TOLERANCE_MS + 1000, // just past the window
      });
      expect(result).toEqual({ ok: false, reason: "stale_timestamp" });
    });

    it("rejects a valid signature with a future ts beyond the window", () => {
      const header = signedHeader({ dataId, requestId, ts: fixedTs });
      const result = verifyWebhookSignature({
        signatureHeader: header,
        requestId,
        dataId,
        secret: SECRET,
        now: fixedTsMs - WEBHOOK_REPLAY_TOLERANCE_MS - 1000,
      });
      expect(result).toEqual({ ok: false, reason: "stale_timestamp" });
    });

    it("rejects an unparseable ts (after HMAC) even if the signature is valid", () => {
      // Sign a manifest whose ts is non-numeric; the HMAC matches but ts can't parse.
      const badTs = "not-a-number";
      const header = signedHeader({ dataId, requestId, ts: badTs });
      const result = verifyWebhookSignature({
        signatureHeader: header,
        requestId,
        dataId,
        secret: SECRET,
      });
      expect(result).toEqual({ ok: false, reason: "unparseable_ts" });
    });
  });
});
