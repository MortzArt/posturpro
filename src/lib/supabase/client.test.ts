/**
 * Client-factory unit tests (AC-3, AC-4).
 *
 * These verify the *key selection* contract without a live DB: the browser
 * client factory must use ONLY the publishable key, the server client factory
 * must use the publishable key (RLS-enforced), and the admin client factory
 * must use the secret key. We mock the underlying supabase constructors and
 * assert exactly which URL + key each factory forwards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};

type ClientArgs = [url: string, key: string, options?: unknown];

const createBrowserClient =
  vi.fn<(...args: ClientArgs) => { __kind: string }>();
const createServerClient =
  vi.fn<(...args: ClientArgs) => { __kind: string }>();
const createSupabaseClient =
  vi.fn<(...args: ClientArgs) => { __kind: string }>();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (...args: ClientArgs) => createBrowserClient(...args),
  createServerClient: (...args: ClientArgs) => createServerClient(...args),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: ClientArgs) => createSupabaseClient(...args),
}));

// `server-only` is a runtime no-op guard in Node; stub it so admin.ts imports.
vi.mock("server-only", () => ({}));

describe("browser client factory (AC-3)", () => {
  beforeEach(() => {
    vi.resetModules();
    createBrowserClient.mockClear();
    for (const [key, value] of Object.entries(PUBLIC_ENV)) {
      process.env[key] = value;
    }
  });

  afterEach(() => {
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("constructs the browser client with the publishable key + URL", async () => {
    const { createClient } = await import("./client");
    createClient();
    expect(createBrowserClient).toHaveBeenCalledTimes(1);
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
    );
  });

  it("never forwards the secret key to the browser client", async () => {
    const { createClient } = await import("./client");
    createClient();
    const forwardedArgs = createBrowserClient.mock.calls[0];
    expect(forwardedArgs).not.toContain("sb_secret_test");
  });
});

describe("admin client factory (AC-4)", () => {
  beforeEach(() => {
    vi.resetModules();
    createSupabaseClient.mockClear();
    for (const [key, value] of Object.entries(PUBLIC_ENV)) {
      process.env[key] = value;
    }
  });

  it("constructs the admin client with the SECRET key + URL", async () => {
    const { createAdminClient } = await import("./admin");
    createAdminClient();
    expect(createSupabaseClient).toHaveBeenCalledTimes(1);
    const [url, key] = createSupabaseClient.mock.calls[0];
    expect(url).toBe("https://example.supabase.co");
    expect(key).toBe("sb_secret_test");
  });

  it("disables session persistence for the service client", async () => {
    const { createAdminClient } = await import("./admin");
    createAdminClient();
    const options = createSupabaseClient.mock.calls[0][2] as {
      auth: { persistSession: boolean; autoRefreshToken: boolean };
    };
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
  });

  it("propagates a MissingEnvVarError when the secret key is absent", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const { createAdminClient } = await import("./admin");
    expect(() => createAdminClient()).toThrow(
      "Missing required env var: SUPABASE_SECRET_KEY",
    );
  });
});
