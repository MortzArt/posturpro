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

/**
 * DEV-ONLY fail-fast guard for a mangled `ADMIN_PASSWORD_HASH` (QA P1).
 *
 * Next's `@next/env`/dotenv-expand treats an UNescaped `$` in a `.env*` value as a
 * shell-style variable expansion, silently collapsing the 178-char scrypt hash
 * (`scrypt$16384$8$1$<salt>$<hash>`) to `scrypt6384` — which then NEVER verifies,
 * so a correctly-configured owner sees "Correo o contraseña incorrectos" with no
 * clue why. This turns that silent misconfig into a loud, actionable error at
 * startup instead of a runtime mystery.
 *
 * When `passwordHash` is PRESENT but does NOT parse as `scrypt$N$r$p$saltHex$hashHex`
 * (the exact 6-`$`-field shape), throw with remediation guidance. A missing/blank
 * hash is NOT flagged here — that path is already handled by `getAdminEnv()` →
 * `MissingEnvVarError` (edge 4 / R5), and flagging it would defeat the intended
 * "admin not configured yet" state.
 *
 * @param passwordHash the raw `ADMIN_PASSWORD_HASH` value, or undefined if unset
 * @throws {Error} in a non-production runtime when a present hash fails to parse
 */
export function assertAdminPasswordHashFormat(
  passwordHash: string | undefined = process.env.ADMIN_PASSWORD_HASH,
): void {
  // A missing/blank hash is a valid "not configured" state (handled elsewhere).
  if (passwordHash === undefined || passwordHash.trim() === "") {
    return;
  }
  if (parsePasswordHash(passwordHash) !== null) {
    return;
  }
  throw new Error(
    "ADMIN_PASSWORD_HASH is set but does not parse as " +
      "`scrypt$N$r$p$saltHex$hashHex` (6 `$`-separated fields). This is almost " +
      "always dotenv `$`-expansion mangling the hash: every `$` in the value MUST " +
      "be backslash-escaped (`\\$`) in a `.env*` file (see dev-done.md). " +
      "Regenerate the hash and re-escape it, or set it unescaped in a non-dotenv " +
      "secret store (e.g. the Vercel env UI).",
  );
}

/**
 * Run the dev-only fail-fast hash-format check ONCE at module load, and only in a
 * non-production runtime. Zero cost on the production request path (the guard is a
 * no-op branch there — the format is validated by the deploy's hash-gen tooling).
 * A malformed hash in `next dev` now throws immediately with remediation guidance
 * instead of silently breaking login (QA P1).
 */
if (process.env.NODE_ENV !== "production") {
  assertAdminPasswordHashFormat();
}
