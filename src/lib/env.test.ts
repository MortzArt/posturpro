import { describe, expect, it } from "vitest";
import {
  MissingEnvVarError,
  getMercadoPagoEnv,
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

describe("getMercadoPagoEnv (T8 AC-1)", () => {
  const validMpSource = {
    MERCADOPAGO_ACCESS_TOKEN: "TEST-access-token",
    MERCADOPAGO_WEBHOOK_SECRET: "whsec_test",
  };

  it("reads the two MP secrets", () => {
    expect(getMercadoPagoEnv(validMpSource)).toEqual({
      accessToken: "TEST-access-token",
      webhookSecret: "whsec_test",
    });
  });

  it("throws a named error when the access token is missing", () => {
    expect(() => getMercadoPagoEnv({ MERCADOPAGO_WEBHOOK_SECRET: "whsec_test" })).toThrow(
      "Missing required env var: MERCADOPAGO_ACCESS_TOKEN",
    );
  });

  it("throws a named error when the webhook secret is missing", () => {
    expect(() => getMercadoPagoEnv({ MERCADOPAGO_ACCESS_TOKEN: "x" })).toThrow(
      "Missing required env var: MERCADOPAGO_WEBHOOK_SECRET",
    );
  });

  it("throws MissingEnvVarError (typed) for blank values", () => {
    expect(() =>
      getMercadoPagoEnv({ MERCADOPAGO_ACCESS_TOKEN: "  ", MERCADOPAGO_WEBHOOK_SECRET: "x" }),
    ).toThrow(MissingEnvVarError);
  });

  it("does NOT read MERCADOPAGO_PUBLIC_KEY (redirect surface needs only server token)", () => {
    // Public key absent → still resolves (redirect baseline, AC-1 note).
    expect(() => getMercadoPagoEnv(validMpSource)).not.toThrow();
  });
});
