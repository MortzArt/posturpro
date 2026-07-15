/**
 * Cross-runtime session-verifier EQUIVALENCE fence (T10 R1, M-1).
 *
 * The two verifiers — `isSessionValid` (Node `node:crypto`) and
 * `isSessionValidEdge` (Edge `crypto.subtle`) — share the payload codec but are
 * two independent implementations. Nothing else asserts they return the SAME
 * verdict on the SAME cookie. A future divergence in payload framing, hex casing,
 * or expiry handling could open a differential: a cookie the fast Edge gate
 * accepts but Node (the trust boundary) rejects, or vice-versa.
 *
 * This suite feeds BOTH verifiers from ONE shared fixture (`makeCookie`) and
 * asserts they agree on every case: valid, tampered-payload, forged-signature,
 * wrong-secret, expired, and malformed. It is the regression fence for R1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isSessionValid } from "./session";
import { isSessionValidEdge } from "./session-edge";
import { encodePayload } from "./session-payload";
import { signCookie } from "./session-test-fixture";

const SECRET = "parity-shared-secret-0123456789abcdef";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  // The Node verifier reads the FULL admin env (getAdminEnv), so all three must
  // be present or it throws MissingEnvVarError instead of returning a verdict.
  for (const key of ["ADMIN_SESSION_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD_HASH"]) {
    saved[key] = process.env[key];
  }
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.ADMIN_EMAIL = "owner@posturpro.mx";
  process.env.ADMIN_PASSWORD_HASH = "scrypt$16384$8$1$00$00";
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

/** SINGLE shared cookie fixture used to feed BOTH verifiers (no per-suite copy). */
function makeCookie(nowSeconds: number, secret = SECRET): string {
  return signCookie(nowSeconds, secret);
}

/** Assert both verifiers return the SAME verdict for one cookie value. */
async function bothAgree(
  value: string | undefined | null,
  now: number,
  expected: boolean,
): Promise<void> {
  const node = isSessionValid(value, now);
  const edge = await isSessionValidEdge(value, now);
  expect(node).toBe(expected);
  expect(edge).toBe(expected);
  expect(node).toBe(edge);
}

describe("Node/Edge session-verifier equivalence (R1, M-1)", () => {
  const now = 1_700_000_000;

  it("BOTH accept a valid fresh cookie", async () => {
    await bothAgree(makeCookie(now), now, true);
  });

  it("BOTH reject a one-byte-tampered payload", async () => {
    const value = makeCookie(now);
    const [payloadPart, signaturePart] = value.split(".");
    // flip the final char of the payload → same length, different HMAC input.
    const flipped = payloadPart.slice(0, -1) + (payloadPart.endsWith("A") ? "B" : "A");
    await bothAgree(`${flipped}.${signaturePart}`, now, false);
  });

  it("BOTH reject a forged (all-zero) signature", async () => {
    const payloadPart = encodePayload(now);
    await bothAgree(`${payloadPart}.${"0".repeat(64)}`, now, false);
  });

  it("BOTH reject a cookie signed with a different secret", async () => {
    await bothAgree(makeCookie(now, "a-totally-different-secret"), now, false);
  });

  it("BOTH reject an expired-but-signed cookie", async () => {
    await bothAgree(makeCookie(now - 9 * 60 * 60), now, false);
  });

  it("BOTH reject a future-dated cookie (clock skew / forgery)", async () => {
    await bothAgree(makeCookie(now + 60 * 60), now, false);
  });

  it("BOTH reject malformed / missing values", async () => {
    await bothAgree(undefined, now, false);
    await bothAgree("", now, false);
    await bothAgree("nodot", now, false);
    await bothAgree(`${encodePayload(now)}.zz`, now, false);
  });

  it("BOTH accept a cookie exactly at the max-age boundary", async () => {
    await bothAgree(makeCookie(now - 8 * 60 * 60), now, true);
  });
});
