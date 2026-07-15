/**
 * PURE, runtime-agnostic admin session payload codec (T10 AC-4, AC-5).
 *
 * The session cookie value is `<payloadB64Url>.<signatureHex>` where the payload
 * is a base64url-encoded JSON `{ v, iat }` (version + issued-at epoch seconds)
 * and the signature is `HMAC-SHA256(payloadB64Url, ADMIN_SESSION_SECRET)`.
 *
 * This module contains ONLY the encode/decode/split/expiry logic — no crypto, no
 * Next imports — so BOTH the Node authoritative verifier (`session.ts`,
 * `node:crypto`) and the Edge middleware verifier (`session-edge.ts`,
 * Web Crypto) share one payload format (R1). Keeping it crypto-free also makes it
 * exhaustively unit-testable without either runtime.
 */
import { ADMIN_SESSION_VERSION } from "@/lib/admin/constants";

/** The signed session payload (kept tiny — no PII, no secrets). */
export interface AdminSessionPayload {
  /** Payload format version (matches {@link ADMIN_SESSION_VERSION}). */
  v: number;
  /** Issued-at, epoch SECONDS (used for the max-age expiry check, AC-5). */
  iat: number;
}

/** A cookie value split into its signed payload part and signature part. */
export interface SplitCookie {
  /** The base64url payload string that was signed (the HMAC input). */
  payloadPart: string;
  /** The provided hex signature to compare against. */
  signaturePart: string;
}

/** Encode bytes/string as unpadded base64url (URL- and cookie-safe). */
export function toBase64Url(input: string): string {
  const base64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(input)))
      : Buffer.from(input, "utf8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode an unpadded base64url string back to its UTF-8 string, or null. */
export function fromBase64Url(input: string): string | null {
  try {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    if (typeof atob === "function") {
      return decodeURIComponent(escape(atob(base64)));
    }
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** Serialize a fresh payload (current version) to its base64url signed part. */
export function encodePayload(issuedAtSeconds: number): string {
  const payload: AdminSessionPayload = {
    v: ADMIN_SESSION_VERSION,
    iat: issuedAtSeconds,
  };
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Parse a base64url payload part into a validated {@link AdminSessionPayload}, or
 * `null` if it is malformed, wrong-typed, or an unexpected version. A version
 * mismatch (e.g. after a format bump) is treated as invalid → re-login.
 */
export function decodePayload(payloadPart: string): AdminSessionPayload | null {
  const json = fromBase64Url(payloadPart);
  if (json === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.v !== "number" ||
    typeof candidate.iat !== "number" ||
    !Number.isFinite(candidate.iat) ||
    candidate.v !== ADMIN_SESSION_VERSION
  ) {
    return null;
  }
  return { v: candidate.v, iat: candidate.iat };
}

/**
 * Split a raw cookie value into its payload + signature parts. Returns `null`
 * for any value that is not exactly `payload.signature` (missing/extra dots,
 * blank parts) — the caller treats that as unauthenticated (edge 1).
 */
export function splitCookie(value: string | undefined | null): SplitCookie | null {
  if (!value) {
    return null;
  }
  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) {
    return null;
  }
  return { payloadPart, signaturePart };
}

/**
 * Whether a payload's issued-at is still within `maxAgeSeconds` of `nowSeconds`
 * (AC-5). A future-dated `iat` (clock skew / forgery) is also rejected. The
 * signature must already have verified before this is trusted.
 */
export function isWithinMaxAge(
  payload: AdminSessionPayload,
  maxAgeSeconds: number,
  nowSeconds: number,
): boolean {
  const age = nowSeconds - payload.iat;
  return age >= 0 && age <= maxAgeSeconds;
}
