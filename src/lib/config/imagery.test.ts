/**
 * Imagery config-slot tests (T15 AC-8/AC-9/AC-10, edge 3). The `string | null`
 * slots are the asset-swap seam: a `/public` path or `null` (blank tile). We
 * assert the type contract every consumer relies on to pick its render branch:
 *   - each slot is either `null` or a string (the union the components switch on).
 *   - when non-null, the value is a LOCAL `/public`-rooted path (AC-10: no remote
 *     host, so no `next.config.ts` allow-list entry is required) — never an empty
 *     string (which would ship a broken <img>) and never an off-`/`-rooted or
 *     protocol URL.
 * These are behavioral guarantees a future asset swap must not violate.
 */
import { describe, expect, it } from "vitest";

import {
  B2B_HERO_IMAGE,
  CATALOG_BANNER_IMAGE,
  EDITORIAL_BAND_IMAGE,
} from "./imagery";

const SLOTS: ReadonlyArray<[string, string | null]> = [
  ["EDITORIAL_BAND_IMAGE", EDITORIAL_BAND_IMAGE],
  ["CATALOG_BANNER_IMAGE", CATALOG_BANNER_IMAGE],
  // T16: the B2B hero slot — same asset-swap seam, same guarantees. When null it
  // degrades to the Building-glyph blank tile (never a broken <img>, AC-10).
  ["B2B_HERO_IMAGE", B2B_HERO_IMAGE],
];

describe("imagery slots — string | null contract (AC-8)", () => {
  it.each(SLOTS)("%s is either null or a string", (_name, value) => {
    expect(value === null || typeof value === "string").toBe(true);
  });

  it.each(SLOTS)(
    "%s, when non-null, is a non-empty local /public path (AC-10, no broken <img>)",
    (_name, value) => {
      if (value === null) return; // null degrades to the blank tile — valid.
      expect(value.length).toBeGreaterThan(0);
      expect(value.startsWith("/")).toBe(true); // local /public root
      expect(value.startsWith("//")).toBe(false); // not a protocol-relative host
      expect(/^https?:/i.test(value)).toBe(false); // not a remote host
    },
  );
});
