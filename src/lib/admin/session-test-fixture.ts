/**
 * Shared session-cookie test fixture (T10, M-1). ONE signer used by every session
 * suite (`session.test.ts`, `session-edge.test.ts`, `session-parity.test.ts`) so
 * there is no copy-pasted per-suite `validCookie` helper that could drift from the
 * real cookie format and mask a Node/Edge differential.
 *
 * Signs a payload the SAME way `createSessionCookieValue` does, but independently
 * (its own `createHmac` call) so a suite still catches a broken signer — it is a
 * shared FIXTURE, not a re-export of the code under test.
 *
 * Not shipped: imported only by `*.test.ts` files. No `server-only` (needs to run
 * under the test runner) and no secret embedded.
 */
import { createHmac } from "node:crypto";
import { encodePayload } from "./session-payload";

/**
 * Mint a signed cookie value (`<payloadB64Url>.<signatureHex>`) issued at
 * `nowSeconds` and signed with `secret`. Independent re-derivation of the scheme.
 */
export function signCookie(nowSeconds: number, secret: string): string {
  const payloadPart = encodePayload(nowSeconds);
  const signaturePart = createHmac("sha256", secret)
    .update(payloadPart)
    .digest("hex");
  return `${payloadPart}.${signaturePart}`;
}

/** Independently compute the signature hex for a payload part (assertion helper). */
export function signPayloadPart(payloadPart: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadPart).digest("hex");
}
