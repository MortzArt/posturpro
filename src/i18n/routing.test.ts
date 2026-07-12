/**
 * Routing-config tests (T2 AC-1, AC-2).
 *
 * The routing definition is the single source of truth for the store's locale
 * strategy. These assertions pin the exact product decisions the ticket calls
 * out as binary: the locale set, the Spanish default, `as-needed` prefixing
 * (Spanish unprefixed, English under `/en`), and — critically — that automatic
 * `Accept-Language` detection is DISABLED (AC-1: `/` always serves Spanish).
 */
import { describe, expect, it } from "vitest";
import { routing } from "./routing";
import { DEFAULT_LOCALE } from "@/lib/config";

describe("routing (AC-2)", () => {
  it("declares exactly the es-MX and en locales", () => {
    expect([...routing.locales].sort()).toEqual(["en", "es-MX"]);
  });

  it("defaults to es-MX (Mexico-first storefront) (AC-1)", () => {
    expect(routing.defaultLocale).toBe("es-MX");
  });

  it("keeps the default locale in sync with config.DEFAULT_LOCALE (AC-17)", () => {
    expect(routing.defaultLocale).toBe(DEFAULT_LOCALE);
  });

  it("prefixes locales as-needed (Spanish unprefixed, English under /en)", () => {
    expect(routing.localePrefix).toBe("as-needed");
  });

  it("disables automatic Accept-Language detection (AC-1)", () => {
    // English must be an explicit opt-in; `/` always serves Spanish regardless
    // of the browser's Accept-Language. A regression here silently flips
    // English-OS users to English on first visit.
    expect(routing.localeDetection).toBe(false);
  });
});
