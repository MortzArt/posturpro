/**
 * EDGE-runtime admin session verification (T10 R1) — used ONLY by `middleware.ts`.
 *
 * The Next.js middleware runs on the Edge runtime, where `node:crypto` is
 * unavailable; the portable primitive is the Web Crypto API (`crypto.subtle`).
 * This module verifies the SAME cookie format as the Node authoritative verifier
 * (`session.ts`) using `crypto.subtle` HMAC-SHA256 so the middleware can redirect
 * unauthenticated `/admin/*` requests fast — WITHOUT being the trust boundary.
 *
 * DEFENSE-IN-DEPTH: middleware is a first, fast gate for UX (redirect before any
 * admin markup renders). The AUTHORITATIVE check still happens in the admin
 * layout + every server action via `session.ts` (`node:crypto`), so a matcher
 * edge case that bypasses middleware is still fully protected. Both share the
 * runtime-agnostic payload codec (`session-payload.ts`) and the same secret.
 *
 * No `import "server-only"`: middleware is server-side but the `server-only`
 * package throws in the Edge bundle; there is nothing client-facing here (the
 * secret is read from `process.env`, never exported).
 */
import { getSessionMaxAgeSeconds } from "@/lib/admin/constants";
import {
  decodePayload,
  isWithinMaxAge,
  splitCookie,
} from "@/lib/admin/session-payload";

/** Milliseconds per second — iat is epoch seconds. */
const MS_PER_SECOND = 1000;

/** Cached imported HMAC key, keyed by secret, so we don't re-import per request. */
let cachedKey: { secret: string; key: CryptoKey } | null = null;

/** Import (and cache) the HMAC-SHA256 verify key for `secret`. */
async function importHmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.secret === secret) {
    return cachedKey.key;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  cachedKey = { secret, key };
  return key;
}

/** Decode a hex string to bytes, or `null` if it is not valid hex. */
function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      return null;
    }
    bytes[i] = byte;
  }
  return bytes;
}

/** Constant-time byte comparison over two equal-length arrays. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Verify a session cookie value in the Edge runtime: HMAC signature (constant
 * time, `crypto.subtle`) AND expiry. Returns `true` only when both hold.
 * A missing/blank `ADMIN_SESSION_SECRET` → `false` (fail closed; the middleware
 * then redirects to login, and the env failure surfaces authoritatively in the
 * layout/action). Never throws for a malformed/forged value.
 */
export async function isSessionValidEdge(
  value: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / MS_PER_SECOND),
): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.trim() === "") {
    return false;
  }
  const split = splitCookie(value);
  if (!split) {
    return false;
  }
  const provided = hexToBytes(split.signaturePart);
  if (!provided) {
    return false;
  }
  const key = await importHmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(split.payloadPart),
    ),
  );
  if (!constantTimeEqual(expected, provided)) {
    return false;
  }
  const payload = decodePayload(split.payloadPart);
  if (!payload) {
    return false;
  }
  return isWithinMaxAge(payload, getSessionMaxAgeSeconds(), nowSeconds);
}
