import { describe, expect, it } from "vitest";
import {
  MissingEnvVarError,
  getPublicEnv,
  getServerEnv,
  requireEnv,
} from "./env";

const validServerSource = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};

describe("requireEnv", () => {
  it("returns the value when present", () => {
    expect(requireEnv("FOO", { FOO: "bar" })).toBe("bar");
  });

  it("throws a MissingEnvVarError when undefined", () => {
    expect(() => requireEnv("FOO", {})).toThrow(MissingEnvVarError);
  });

  it("throws when blank or whitespace-only", () => {
    expect(() => requireEnv("FOO", { FOO: "   " })).toThrow(MissingEnvVarError);
  });

  it("names the missing variable in the message", () => {
    expect(() => requireEnv("SUPABASE_SECRET_KEY", {})).toThrow(
      "Missing required env var: SUPABASE_SECRET_KEY",
    );
  });
});

describe("getPublicEnv", () => {
  it("reads only the public vars", () => {
    expect(getPublicEnv(validServerSource)).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
    });
  });

  it("does not require the secret key", () => {
    const { SUPABASE_SECRET_KEY, ...publicOnly } = validServerSource;
    void SUPABASE_SECRET_KEY;
    expect(() => getPublicEnv(publicOnly)).not.toThrow();
  });

  it("throws when the URL is missing", () => {
    expect(() =>
      getPublicEnv({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toThrow("Missing required env var: NEXT_PUBLIC_SUPABASE_URL");
  });
});

describe("getServerEnv", () => {
  it("includes the secret key when all vars present", () => {
    expect(getServerEnv(validServerSource)).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
      supabaseSecretKey: "sb_secret_test",
    });
  });

  it("throws a clear error when the secret key is missing", () => {
    const { SUPABASE_SECRET_KEY, ...noSecret } = validServerSource;
    void SUPABASE_SECRET_KEY;
    expect(() => getServerEnv(noSecret)).toThrow(
      "Missing required env var: SUPABASE_SECRET_KEY",
    );
  });
});
