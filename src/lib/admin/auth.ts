/**
 * Admin credential verification (T10 AC-2, AC-3, R3, R5) — server-only.
 *
 * Password hashing uses `node:crypto` scrypt (a first-class, dependency-free KDF)
 * with a per-hash random salt. The stored `ADMIN_PASSWORD_HASH` encodes every
 * parameter so verification is self-describing and future-proof:
 *
 *     scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 *
 * SECURITY DISCIPLINE:
 *  - Email compare is case-insensitive + trimmed (AC-2), constant-time-ish (the
 *    result never short-circuits the password work — see below).
 *  - Password compare is constant-time via `timingSafeEqual` (NEVER `===`).
 *  - USER-ENUMERATION DEFENSE (AC-3, R3): on an unknown email we STILL run a
 *    scrypt derivation against a dummy hash of equal cost, so the response timing
 *    does not distinguish "unknown email" from "wrong password". The caller shows
 *    ONE generic error for both.
 *  - A missing/blank `ADMIN_PASSWORD_HASH` (or an unparseable one) NEVER
 *    authenticates: `getAdminEnv()` throws, or the parse returns `null` → the
 *    verify returns false. "No hash configured" is never "any password works"
 *    (edge 4 / R5).
 */
import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getAdminEnv } from "@/lib/env";

/** scrypt cost parameters (OWASP-aligned defaults; encoded into the hash). */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
/** Derived-key length in bytes. */
const SCRYPT_KEYLEN = 64;
/** Salt length in bytes for a freshly generated hash. */
const SCRYPT_SALT_BYTES = 16;
/** Hash format tag. */
const SCRYPT_TAG = "scrypt";
/**
 * A fixed dummy hash used for timing parity on unknown email (R3). NOTE: this
 * runs a real scrypt (cost N=16384) at MODULE LOAD for any module that
 * transitively imports `auth.ts` — a one-time ~tens-of-ms server-only cold-start
 * cost, never on the request path. Accepted (see N-3).
 */
const DUMMY_HASH = generatePasswordHash("posturpro-dummy-timing-parity");

/** Parsed components of an encoded scrypt hash. */
interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

/**
 * Generate an encoded scrypt hash for `password`. Used by the one-off dev
 * hash-generation command (documented in dev-done.md) and the dummy-hash
 * constant. NOT called on the request path (the stored hash is verified instead).
 */
export function generatePasswordHash(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    SCRYPT_TAG,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/** Parse an encoded `scrypt$N$r$p$saltHex$hashHex` string, or `null` if invalid. */
export function parsePasswordHash(encoded: string): ParsedHash | null {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== SCRYPT_TAG) {
    return null;
  }
  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (![n, r, p].every((value) => Number.isInteger(value) && value > 0)) {
    return null;
  }
  const salt = Buffer.from(saltHex, "hex");
  const hash = Buffer.from(hashHex, "hex");
  if (salt.length === 0 || hash.length === 0) {
    return null;
  }
  return { n, r, p, salt, hash };
}

/** Constant-time check of `password` against a parsed hash. */
function verifyAgainst(password: string, parsed: ParsedHash): boolean {
  const derived = scryptSync(password, parsed.salt, parsed.hash.length, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
  });
  if (derived.length !== parsed.hash.length) {
    return false;
  }
  return timingSafeEqual(derived, parsed.hash);
}

/**
 * Verify a login attempt. Returns `true` only when the email matches
 * (case-insensitive) AND the password verifies against the stored hash.
 *
 * Timing parity (R3): the scrypt work runs regardless of whether the email
 * matched — on a mismatch we verify against a dummy hash and discard the result,
 * so "unknown email" and "wrong password" are indistinguishable by timing.
 *
 * @throws {MissingEnvVarError} if any admin env var is missing/blank — the login
 *   action CATCHES this and shows a generic "no disponible" (edge 4 / R5).
 */
export function verifyCredentials(email: string, password: string): boolean {
  const { email: expectedEmail, passwordHash } = getAdminEnv();
  // Email is the USERNAME, not a secret; enumeration is defended by always
  // running scrypt below (the timing signal that matters). A `===` length-timing
  // micro-signal on the username reveals nothing exploitable, so a plain
  // case-insensitive compare is correct here (m-4).
  const emailMatches =
    email.trim().toLowerCase() === expectedEmail.trim().toLowerCase();

  const parsed = parsePasswordHash(passwordHash);
  // Always do equal-cost scrypt work; select the real vs dummy hash without
  // short-circuiting so the timing is uniform (R3). A missing/unparseable stored
  // hash falls back to the dummy → verify can NEVER succeed (edge 4 / R5).
  const target = parsed ?? DUMMY_HASH_PARSED;
  const passwordMatches = verifyAgainst(password, target);

  return emailMatches && parsed !== null && passwordMatches;
}

/** The dummy hash parsed once (equal-cost target for timing parity on failure). */
const DUMMY_HASH_PARSED = parsePasswordHash(DUMMY_HASH) as ParsedHash;
