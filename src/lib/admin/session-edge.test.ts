import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSessionValidEdge } from "./session-edge";
import { encodePayload } from "./session-payload";
import { signCookie } from "./session-test-fixture";

const SECRET = "edge-test-secret-abcdef0123456789";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

afterEach(() => {
  process.env.ADMIN_SESSION_SECRET = saved;
});

/** Build a valid cookie value from the SHARED fixture (no per-suite signer, M-1). */
function validCookie(nowSeconds: number, secret = SECRET): string {
  return signCookie(nowSeconds, secret);
}

describe("isSessionValidEdge (R1 — Web Crypto verify parity)", () => {
  const now = 1_700_000_000;

  it("accepts a valid fresh cookie", async () => {
    expect(await isSessionValidEdge(validCookie(now), now)).toBe(true);
  });

  it("rejects a forged signature", async () => {
    const payloadPart = encodePayload(now);
    expect(await isSessionValidEdge(`${payloadPart}.${"0".repeat(64)}`, now)).toBe(false);
  });

  it("rejects a cookie signed with another secret (edge 3)", async () => {
    expect(await isSessionValidEdge(validCookie(now, "other-secret"), now)).toBe(false);
  });

  it("rejects an expired cookie (edge 2)", async () => {
    expect(await isSessionValidEdge(validCookie(now - 9 * 60 * 60), now)).toBe(false);
  });

  it("rejects malformed / missing values", async () => {
    expect(await isSessionValidEdge(undefined, now)).toBe(false);
    expect(await isSessionValidEdge("", now)).toBe(false);
    expect(await isSessionValidEdge("nodot", now)).toBe(false);
    const payloadPart = encodePayload(now);
    expect(await isSessionValidEdge(`${payloadPart}.zz`, now)).toBe(false);
  });

  it("fails closed when the secret is unset (R5)", async () => {
    delete process.env.ADMIN_SESSION_SECRET;
    expect(await isSessionValidEdge(validCookie(now), now)).toBe(false);
  });
});
