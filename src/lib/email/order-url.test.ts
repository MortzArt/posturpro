import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildOrderUrl } from "./order-url";

const TOKEN = "d1f0e2a3-0000-4000-8000-000000000000";
let savedOrigin: string | undefined;

beforeEach(() => {
  savedOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://shop.test";
});

afterEach(() => {
  if (savedOrigin === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
  } else {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = savedOrigin;
  }
});

describe("buildOrderUrl", () => {
  it("builds an absolute prefix-free URL for es-MX (default locale)", () => {
    expect(buildOrderUrl(TOKEN, "es-MX")).toBe(
      `https://shop.test/checkout/confirmacion/${TOKEN}`,
    );
  });

  it("prefixes /en for the English locale", () => {
    expect(buildOrderUrl(TOKEN, "en")).toBe(
      `https://shop.test/en/checkout/confirmacion/${TOKEN}`,
    );
  });

  it("strips a trailing slash from the origin", () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://shop.test/";
    expect(buildOrderUrl(TOKEN, "es-MX")).toBe(
      `https://shop.test/checkout/confirmacion/${TOKEN}`,
    );
  });

  it("falls back to localhost when the origin is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
    expect(buildOrderUrl(TOKEN, "es-MX")).toContain("http://localhost:3000/checkout");
  });
});
