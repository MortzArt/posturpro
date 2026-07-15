import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MissingEnvVarError } from "@/lib/env";
import { createSessionCookieValue, isSessionValid } from "./session";
import { encodePayload } from "./session-payload";
import { signPayloadPart } from "./session-test-fixture";

const SECRET = "test-admin-session-secret-0123456789";

/** Snapshot + restore env so tests don't leak into each other. */
let savedSecret: string | undefined;
let savedEmail: string | undefined;
let savedHash: string | undefined;

beforeEach(() => {
  savedSecret = process.env.ADMIN_SESSION_SECRET;
  savedEmail = process.env.ADMIN_EMAIL;
  savedHash = process.env.ADMIN_PASSWORD_HASH;
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$00$00";
});

afterEach(() => {
  process.env.ADMIN_SESSION_SECRET = savedSecret;
  process.env.ADMIN_EMAIL = savedEmail;
  process.env.ADMIN_PASSWORD_HASH = savedHash;
});

/** Independently sign a payload part (shared fixture; does NOT reuse the module's signer). */
function sign(payloadPart: string, secret: string): string {
  return signPayloadPart(payloadPart, secret);
}

describe("createSessionCookieValue (AC-4)", () => {
  it("mints a value whose signature verifies independently", () => {
    const nowSeconds = 1_700_000_000;
    const value = createSessionCookieValue(nowSeconds);
    const [payloadPart, signaturePart] = value.split(".");
    expect(signaturePart).toBe(sign(payloadPart, SECRET));
  });
});

describe("isSessionValid (AC-4, AC-5, edges 1/2/3)", () => {
  const now = 1_700_000_000;

  it("accepts a freshly minted cookie", () => {
    const value = createSessionCookieValue(now);
    expect(isSessionValid(value, now)).toBe(true);
  });

  it("rejects a tampered payload (signature no longer matches, edge 1)", () => {
    const value = createSessionCookieValue(now);
    const [, signaturePart] = value.split(".");
    const forgedPayload = encodePayload(now + 1);
    expect(isSessionValid(`${forgedPayload}.${signaturePart}`, now)).toBe(false);
  });

  it("rejects a forged signature (edge 1)", () => {
    const payloadPart = encodePayload(now);
    expect(isSessionValid(`${payloadPart}.${"0".repeat(64)}`, now)).toBe(false);
  });

  it("rejects a truncated / malformed value", () => {
    expect(isSessionValid("nodot", now)).toBe(false);
    expect(isSessionValid("", now)).toBe(false);
    expect(isSessionValid(undefined, now)).toBe(false);
  });

  it("rejects an expired-but-signed cookie (edge 2)", () => {
    const issuedAt = now - 9 * 60 * 60; // older than the 8h default
    const value = createSessionCookieValue(issuedAt);
    expect(isSessionValid(value, now)).toBe(false);
  });

  it("rejects a cookie signed with a different secret (edge 3: rotation)", () => {
    const payloadPart = encodePayload(now);
    const wrongSig = sign(payloadPart, "some-other-secret");
    expect(isSessionValid(`${payloadPart}.${wrongSig}`, now)).toBe(false);
  });

  it("rejects a non-hex signature part", () => {
    const payloadPart = encodePayload(now);
    expect(isSessionValid(`${payloadPart}.zzzz`, now)).toBe(false);
  });
});

describe("isSessionValid fail-closed contract (M-2, edge 4/R5)", () => {
  const now = 1_700_000_000;

  it("THROWS MissingEnvVarError when the secret is unset (never verdicts an empty key)", () => {
    // A well-formed cookie must NOT be verified against an empty-string HMAC key
    // (empty key is forgeable). The authoritative verifier throws loudly instead
    // of returning true/false — the caller maps that to unauthenticated.
    const value = createSessionCookieValue(now); // minted while the secret is set
    delete process.env.ADMIN_SESSION_SECRET;
    expect(() => isSessionValid(value, now)).toThrow(MissingEnvVarError);
  });

  it("THROWS on a blank (whitespace-only) secret too", () => {
    const value = createSessionCookieValue(now);
    process.env.ADMIN_SESSION_SECRET = "   ";
    expect(() => isSessionValid(value, now)).toThrow(MissingEnvVarError);
  });
});
