import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildManifest,
  parseSignatureHeader,
  verifyWebhookSignature,
} from "./webhook";

const SECRET = "test_webhook_secret_key";

/** Build a valid x-signature header for the given manifest inputs. */
function signedHeader(input: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
  secret?: string;
}): string {
  const manifest = buildManifest({
    dataId: input.dataId,
    requestId: input.requestId,
    ts: input.ts,
  });
  const v1 = createHmac("sha256", input.secret ?? SECRET).update(manifest).digest("hex");
  return `ts=${input.ts},v1=${v1}`;
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
  it("builds id;request-id;ts with data.id lowercased", () => {
    expect(
      buildManifest({ dataId: "ABC123", requestId: "req-1", ts: "1700000000" }),
    ).toBe("id:abc123;request-id:req-1;ts:1700000000;");
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

describe("verifyWebhookSignature", () => {
  const base = { requestId: "req-1", dataId: "payment-42", ts: "1700000000" };

  it("accepts a correctly signed request", () => {
    const header = signedHeader(base);
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId: base.requestId,
      dataId: base.dataId,
      secret: SECRET,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered v1 (signature mismatch)", () => {
    const result = verifyWebhookSignature({
      signatureHeader: `ts=${base.ts},v1=${"0".repeat(64)}`,
      requestId: base.requestId,
      dataId: base.dataId,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a request signed with the wrong secret", () => {
    const header = signedHeader({ ...base, secret: "attacker_secret" });
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId: base.requestId,
      dataId: base.dataId,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects when the data.id differs from the signed one (replay to another payment)", () => {
    const header = signedHeader(base);
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId: base.requestId,
      dataId: "different-payment",
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const result = verifyWebhookSignature({
      signatureHeader: null,
      requestId: base.requestId,
      dataId: base.dataId,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "malformed_signature_header" });
  });

  it("rejects a malformed signature header", () => {
    const result = verifyWebhookSignature({
      signatureHeader: "not-a-signature",
      requestId: base.requestId,
      dataId: base.dataId,
      secret: SECRET,
    });
    expect(result).toEqual({ ok: false, reason: "malformed_signature_header" });
  });

  it("fails closed when the secret is blank", () => {
    const header = signedHeader(base);
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId: base.requestId,
      dataId: base.dataId,
      secret: "",
    });
    expect(result).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("rejects a non-hex v1 without throwing", () => {
    const result = verifyWebhookSignature({
      signatureHeader: `ts=${base.ts},v1=zzzz`,
      requestId: base.requestId,
      dataId: base.dataId,
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts case-insensitive data.id (uppercase notification id → lowercased manifest)", () => {
    // Sign with the lowercased manifest (what MP does), verify passing uppercase.
    const header = signedHeader({ dataId: "abc123", requestId: base.requestId, ts: base.ts });
    const result = verifyWebhookSignature({
      signatureHeader: header,
      requestId: base.requestId,
      dataId: "ABC123",
      secret: SECRET,
    });
    expect(result.ok).toBe(true);
  });
});
