import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MissingEnvVarError } from "@/lib/env";
import {
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
