/**
 * AUTHORITATIVE admin session signing + verification (T10 AC-4, AC-5) — the Node
 * (`node:crypto`) side used by the admin layout guard and every admin server
 * action. The Edge middleware does a fast preliminary check with Web Crypto
 * (`session-edge.ts`); THIS is the trusted verify that gates any DB access.
 *
 * SCHEME (mirrors `payments/webhook.ts` discipline):
 *  - value = `<payloadB64Url>.<signatureHex>` (codec in `session-payload.ts`).
 *  - signature = HMAC-SHA256(payloadB64Url, ADMIN_SESSION_SECRET) → hex.
 *  - verify: recompute the HMAC over the payload part, `timingSafeEqual` it
 *    against the provided signature (NEVER `===`), THEN decode + expiry-check.
 *  Any failure (missing/blank secret, malformed value, signature mismatch,
 *  expired iat) returns `false`/`null` — treated as unauthenticated (edge 1/2).
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAdminEnv } from "@/lib/env";
import { getSessionMaxAgeSeconds } from "@/lib/admin/constants";
import {
  decodePayload,
  encodePayload,
  isWithinMaxAge,
  splitCookie,
} from "@/lib/admin/session-payload";

/** Milliseconds per second — iat is stored in epoch seconds. */
const MS_PER_SECOND = 1000;

/** Sign a payload part with the admin session secret (HMAC-SHA256 hex). */
function signPayload(payloadPart: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadPart).digest("hex");
}

/**
 * Constant-time hex comparison (identical discipline to `webhook.ts`): a length
 * mismatch is not a timing leak for a fixed-length secret-derived digest, and a
 * non-hex `provided` decodes to a mismatched-length buffer → false.
 */
function timingSafeHexEqual(expectedHex: string, providedHex: string): boolean {
  if (expectedHex.length !== providedHex.length) {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");
  if (expected.length !== provided.length || expected.length === 0) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}

/**
 * Mint a fresh signed session cookie value issued at `nowSeconds`.
 *
 * @throws {MissingEnvVarError} if `ADMIN_SESSION_SECRET` is missing/blank
 */
export function createSessionCookieValue(
  nowSeconds: number = Math.floor(Date.now() / MS_PER_SECOND),
): string {
  const { sessionSecret } = getAdminEnv();
  const payloadPart = encodePayload(nowSeconds);
  const signature = signPayload(payloadPart, sessionSecret);
  return `${payloadPart}.${signature}`;
}

/**
 * Authoritatively verify a session cookie value: signature (constant-time) AND
 * expiry (AC-5). Returns `true` only when both hold. Never throws for a
 * malformed/forged value; a MISSING secret DOES throw (the caller — layout /
 * action — treats an env failure as unauthenticated, never as "valid").
 */
export function isSessionValid(
  value: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / MS_PER_SECOND),
): boolean {
  const split = splitCookie(value);
  if (!split) {
    return false;
  }
  const { sessionSecret } = getAdminEnv();
  const expected = signPayload(split.payloadPart, sessionSecret);
  if (!timingSafeHexEqual(expected, split.signaturePart)) {
    return false;
  }
  const payload = decodePayload(split.payloadPart);
  if (!payload) {
    return false;
  }
  return isWithinMaxAge(payload, getSessionMaxAgeSeconds(), nowSeconds);
}
