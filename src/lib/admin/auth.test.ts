import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MissingEnvVarError } from "@/lib/env";
import {
  assertAdminPasswordHashFormat,
  generatePasswordHash,
  parsePasswordHash,
  verifyCredentials,
} from "./auth";

const PASSWORD = "correct horse battery staple";
const HASH = generatePasswordHash(PASSWORD);

let saved: Record<string, string | undefined> = {};

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  saved = {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  };
  setEnv({
    ADMIN_EMAIL: "owner@posturpro.mx",
    ADMIN_PASSWORD_HASH: HASH,
    ADMIN_SESSION_SECRET: "session-secret",
  });
});

afterEach(() => {
  setEnv(saved);
});

describe("generatePasswordHash / parsePasswordHash", () => {
  it("produces a parseable scrypt hash", () => {
    const parsed = parsePasswordHash(HASH);
    expect(parsed).not.toBeNull();
    expect(parsed?.salt.length).toBeGreaterThan(0);
    expect(parsed?.hash.length).toBeGreaterThan(0);
  });

  it("rejects a malformed hash string", () => {
    expect(parsePasswordHash("not-a-hash")).toBeNull();
    expect(parsePasswordHash("bcrypt$1$2$3$4$5")).toBeNull();
    expect(parsePasswordHash("scrypt$0$8$1$aa$bb")).toBeNull();
  });
});

describe("verifyCredentials (AC-2, AC-3, R3, R5)", () => {
  it("accepts the correct email + password", () => {
    expect(verifyCredentials("owner@posturpro.mx", PASSWORD)).toBe(true);
  });

  it("compares the email case-insensitively + trimmed (AC-2)", () => {
    expect(verifyCredentials("  OWNER@PosturPro.MX  ", PASSWORD)).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(verifyCredentials("owner@posturpro.mx", "wrong")).toBe(false);
  });

  it("rejects a wrong email (still runs scrypt for timing parity, R3)", () => {
    expect(verifyCredentials("stranger@example.com", PASSWORD)).toBe(false);
  });

  it("rejects both-wrong", () => {
    expect(verifyCredentials("stranger@example.com", "wrong")).toBe(false);
  });

  // M-3 (anti-enumeration invariant, R3): PROVE the expensive scrypt derivation
  // actually runs on the unknown-email path — not just that the boolean is false.
  // A refactor that re-added `if (!emailMatches) return false;` BEFORE the scrypt
  // work would return in microseconds; a real scrypt at N=16384 takes ms. We
  // assert (a) a hard floor that only real scrypt can clear on every failure path,
  // and (b) timing PARITY between unknown-email and wrong-password within a wide
  // tolerance. Bounds are generous so this is not flaky, but a short-circuit
  // (sub-millisecond) would still blow the floor.
  const SCRYPT_FLOOR_MS = 1;
  const REPEATS = 5;

  /** Median wall-time (ms) of `REPEATS` calls to `verifyCredentials`. */
  function medianDurationMs(email: string, password: string): number {
    const samples: number[] = [];
    for (let i = 0; i < REPEATS; i += 1) {
      const start = performance.now();
      verifyCredentials(email, password);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)];
  }

  it("ACTUALLY runs scrypt on the unknown-email path (M-3, anti-enumeration)", () => {
    const unknownEmail = medianDurationMs("stranger@example.com", PASSWORD);
    // A short-circuit would be sub-microsecond; a real scrypt clears the floor.
    expect(unknownEmail).toBeGreaterThan(SCRYPT_FLOOR_MS);
  });

  it("runs scrypt on the wrong-password path too, in timing parity (M-3, R3)", () => {
    const wrongPassword = medianDurationMs("owner@posturpro.mx", "wrong");
    const unknownEmail = medianDurationMs("stranger@example.com", PASSWORD);
    const happyPath = medianDurationMs("owner@posturpro.mx", PASSWORD);

    // All three paths run one scrypt → each clears the floor.
    expect(wrongPassword).toBeGreaterThan(SCRYPT_FLOOR_MS);
    expect(happyPath).toBeGreaterThan(SCRYPT_FLOOR_MS);

    // Timing PARITY: no path is dramatically faster (which would leak whether the
    // email exists). Wide tolerance keeps CI stable while still catching a full
    // short-circuit — a skipped scrypt would be orders of magnitude off, not 5x.
    const slowest = Math.max(unknownEmail, wrongPassword, happyPath);
    const fastest = Math.min(unknownEmail, wrongPassword, happyPath);
    expect(slowest).toBeLessThan(fastest * 5 + SCRYPT_FLOOR_MS);
  });

  it("NEVER authenticates when the stored hash is unparseable (R5)", () => {
    setEnv({ ADMIN_PASSWORD_HASH: "garbage" });
    expect(verifyCredentials("owner@posturpro.mx", PASSWORD)).toBe(false);
    // Even an empty password must not slip through a broken hash.
    expect(verifyCredentials("owner@posturpro.mx", "")).toBe(false);
  });

  it("throws MissingEnvVarError when the hash env var is absent (edge 4)", () => {
    setEnv({ ADMIN_PASSWORD_HASH: undefined });
    expect(() => verifyCredentials("owner@posturpro.mx", PASSWORD)).toThrow(
      MissingEnvVarError,
    );
  });
});

// QA P1: a dotenv-mangled ADMIN_PASSWORD_HASH (`$`-expansion collapses the
// 178-char hash to `scrypt6384`) silently breaks login. The dev-only startup
// guard turns that silent misconfig into a loud, actionable throw.
describe("assertAdminPasswordHashFormat (QA P1 fail-fast)", () => {
  it("passes for a well-formed scrypt hash", () => {
    expect(() => assertAdminPasswordHashFormat(HASH)).not.toThrow();
  });

  it("is a no-op for a missing/blank hash (delegated to MissingEnvVarError)", () => {
    expect(() => assertAdminPasswordHashFormat(undefined)).not.toThrow();
    expect(() => assertAdminPasswordHashFormat("")).not.toThrow();
    expect(() => assertAdminPasswordHashFormat("   ")).not.toThrow();
  });

  it("THROWS on the exact dotenv-`$`-expansion corruption (`scrypt6384`)", () => {
    // `scrypt$16384$...` with unescaped `$` → dotenv-expand → `scrypt6384`.
    expect(() => assertAdminPasswordHashFormat("scrypt6384")).toThrow(
      /ADMIN_PASSWORD_HASH is set but does not parse/,
    );
  });

  it("THROWS with backslash-escape remediation guidance", () => {
    expect(() => assertAdminPasswordHashFormat("garbage")).toThrow(
      /backslash-escaped/,
    );
  });

  it("THROWS on a wrong tag or wrong field count", () => {
    expect(() => assertAdminPasswordHashFormat("bcrypt$1$2$3$4$5")).toThrow();
    expect(() => assertAdminPasswordHashFormat("scrypt$16384$8$1$aa")).toThrow();
  });

  it("reads process.env.ADMIN_PASSWORD_HASH by default", () => {
    setEnv({ ADMIN_PASSWORD_HASH: "scrypt6384" });
    expect(() => assertAdminPasswordHashFormat()).toThrow(
      /does not parse/,
    );
    setEnv({ ADMIN_PASSWORD_HASH: HASH });
    expect(() => assertAdminPasswordHashFormat()).not.toThrow();
  });
});
