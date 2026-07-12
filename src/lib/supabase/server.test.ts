/**
 * Server client factory unit tests (AC-4).
 *
 * The server factory must use the publishable key (RLS-enforced) and wire
 * Next 16's async `cookies()` into `@supabase/ssr`'s `getAll`/`setAll`. We mock
 * `next/headers` and the ssr constructor and assert the key + cookie bridge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

type ServerArgs = [url: string, key: string, options?: unknown];

const createServerClient =
  vi.fn<(...args: ServerArgs) => { __kind: string }>();

const cookieStore = {
  getAll: vi.fn(() => [{ name: "sb", value: "token" }]),
  set: vi.fn<(name: string, value: string, options?: unknown) => void>(),
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: ServerArgs) => createServerClient(...args),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

type CookieOptions = {
  cookies: {
    getAll: () => { name: string; value: string }[];
    setAll: (
      cs: { name: string; value: string; options?: Record<string, unknown> }[],
    ) => void;
  };
};

describe("server client factory (AC-4)", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerClient.mockClear();
    cookieStore.getAll.mockClear();
    cookieStore.set.mockClear();
    for (const [key, value] of Object.entries(PUBLIC_ENV)) {
      process.env[key] = value;
    }
  });

  it("constructs the server client with the PUBLISHABLE key (RLS applies)", async () => {
    const { createClient } = await import("./server");
    await createClient();
    const [url, key] = createServerClient.mock.calls[0];
    expect(url).toBe("https://example.supabase.co");
    expect(key).toBe("sb_publishable_test");
  });

  it("bridges getAll() to the Next cookie store", async () => {
    const { createClient } = await import("./server");
    await createClient();
    const options = createServerClient.mock.calls[0][2] as CookieOptions;
    expect(options.cookies.getAll()).toEqual([{ name: "sb", value: "token" }]);
    expect(cookieStore.getAll).toHaveBeenCalled();
  });

  it("writes cookies through setAll() during a mutable request", async () => {
    const { createClient } = await import("./server");
    await createClient();
    const options = createServerClient.mock.calls[0][2] as CookieOptions;
    options.cookies.setAll([{ name: "a", value: "1", options: {} }]);
    expect(cookieStore.set).toHaveBeenCalledWith("a", "1", {});
  });

  it("swallows the read-only-cookie error during a Server Component render", async () => {
    cookieStore.set.mockImplementationOnce(() => {
      throw new Error("Cookies can only be modified in a Server Action");
    });
    const { createClient } = await import("./server");
    await createClient();
    const options = createServerClient.mock.calls[0][2] as CookieOptions;
    // Must not throw — the ssr App Router pattern ignores this during render.
    expect(() =>
      options.cookies.setAll([{ name: "a", value: "1" }]),
    ).not.toThrow();
  });
});
