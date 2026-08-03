/**
 * Unit tests for the site-URL resolver (T14 AC-A13/A14). Asserts the env
 * preference order, the never-throw localhost fallback (build determinism), and
 * absolute-URL composition.
 */
import { describe, expect, it, vi } from "vitest";
import { absoluteUrl, getSiteUrl } from "./site-url";

describe("getSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    const url = getSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://posturpro.mx" });
    expect(url.origin).toBe("https://posturpro.mx");
  });

  it("falls back to NEXT_PUBLIC_SITE_ORIGIN", () => {
    const url = getSiteUrl({ NEXT_PUBLIC_SITE_ORIGIN: "https://origin.example" });
    expect(url.origin).toBe("https://origin.example");
  });

  it("falls back to localhost when no env var is set (build determinism)", () => {
    expect(getSiteUrl({}).origin).toBe("http://localhost:3000");
  });

  it("never throws on a malformed env value — degrades to localhost", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getSiteUrl({ NEXT_PUBLIC_SITE_URL: "not a url" }).origin).toBe(
      "http://localhost:3000",
    );
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("absoluteUrl", () => {
  it("composes a locale-prefixed path against the origin", () => {
    expect(absoluteUrl("/en/sillas", { NEXT_PUBLIC_SITE_URL: "https://x.test" })).toBe(
      "https://x.test/en/sillas",
    );
    expect(absoluteUrl("/sillas", { NEXT_PUBLIC_SITE_URL: "https://x.test" })).toBe(
      "https://x.test/sillas",
    );
  });

  it("preserves query strings", () => {
    expect(
      absoluteUrl("/sillas?page=2", { NEXT_PUBLIC_SITE_URL: "https://x.test" }),
    ).toBe("https://x.test/sillas?page=2");
  });
});
