/**
 * Config tests for the T4 PDP tunables + `truncateForMeta` (AC-3, AC-12, AC-14,
 * AC-15, M-2).
 *
 * Pins the PDP constants to their documented values and exhaustively covers the
 * meta-description truncation helper (word-boundary slice, ellipsis, no trailing
 * space, no word split).
 */
import { describe, expect, it } from "vitest";
import {
  AUTHOR_NAME_MAX,
  MAX_META_DESCRIPTION,
  QA_MAX_SUBMISSIONS_PER_WINDOW,
  QA_RATE_LIMIT_MAX_KEYS,
  QA_RATE_LIMIT_WINDOW_MS,
  QUESTION_MAX,
  RECENTLY_VIEWED_MAX,
  RECENTLY_VIEWED_STORAGE_KEY,
  UUID_PATTERN,
  truncateForMeta,
} from "./config";

describe("PDP constants (T4)", () => {
  it("recently-viewed cap is 8 (AC-12)", () => {
    expect(RECENTLY_VIEWED_MAX).toBe(8);
  });

  it("recently-viewed storage key is namespaced + versioned", () => {
    expect(RECENTLY_VIEWED_STORAGE_KEY).toBe("posturpro:recently-viewed:v1");
  });

  it("rate-limit window is 60s and allows 3 per window (AC-15)", () => {
    expect(QA_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(QA_MAX_SUBMISSIONS_PER_WINDOW).toBe(3);
  });

  it("author/question length caps mirror the DB CHECKs (AC-14)", () => {
    expect(AUTHOR_NAME_MAX).toBe(120);
    expect(QUESTION_MAX).toBe(2000);
  });

  it("has a hard rate-limit map-size ceiling (M-2 DoS bound)", () => {
    expect(QA_RATE_LIMIT_MAX_KEYS).toBe(10_000);
    expect(Number.isInteger(QA_RATE_LIMIT_MAX_KEYS)).toBe(true);
  });

  it("meta-description cap is ~160 chars (AC-3)", () => {
    expect(MAX_META_DESCRIPTION).toBe(160);
  });
});

describe("UUID_PATTERN (M-2)", () => {
  it("matches a canonical lowercase v4 UUID", () => {
    expect(UUID_PATTERN.test("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
  });

  it("matches an uppercase UUID (case-insensitive)", () => {
    expect(UUID_PATTERN.test("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true);
  });

  it("rejects arbitrary strings (attacker-supplied productId)", () => {
    expect(UUID_PATTERN.test("not-a-uuid")).toBe(false);
    expect(UUID_PATTERN.test("")).toBe(false);
    expect(UUID_PATTERN.test("../../etc/passwd")).toBe(false);
  });

  it("rejects a UUID with extra/short segments (anchored, fixed length)", () => {
    expect(UUID_PATTERN.test("3f2504e0-4f89-41d3-9a0c-0305e82c3301x")).toBe(
      false,
    );
    expect(UUID_PATTERN.test("3f2504e0-4f89-41d3-9a0c-0305e82c330")).toBe(false);
    expect(
      UUID_PATTERN.test(" 3f2504e0-4f89-41d3-9a0c-0305e82c3301"),
    ).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(UUID_PATTERN.test("gggggggg-4f89-41d3-9a0c-0305e82c3301")).toBe(
      false,
    );
  });
});

describe("truncateForMeta (AC-3, m-1)", () => {
  it("returns short text unchanged", () => {
    expect(truncateForMeta("A short description.")).toBe("A short description.");
  });

  it("trims surrounding whitespace on short text", () => {
    expect(truncateForMeta("  padded  ")).toBe("padded");
  });

  it("returns text exactly at the limit unchanged", () => {
    const exact = "a".repeat(MAX_META_DESCRIPTION);
    expect(truncateForMeta(exact)).toBe(exact);
  });

  it("truncates over-length text at a word boundary with an ellipsis", () => {
    const long = "word ".repeat(60).trim(); // > 160 chars of "word word …"
    const result = truncateForMeta(long);
    expect(result.length).toBeLessThanOrEqual(MAX_META_DESCRIPTION + 1); // +1 for the ellipsis char
    expect(result.endsWith("…")).toBe(true);
    // Never splits a word: the char before the ellipsis is a letter, not a partial fragment.
    expect(result).not.toContain(" …");
  });

  it("does not split a word — the truncated head is whole words", () => {
    const long =
      "supercalifragilisticexpialidocious ".repeat(10).trim();
    const result = truncateForMeta(long);
    expect(result.endsWith("…")).toBe(true);
    const head = result.slice(0, -1);
    // Every space-separated token in the head is the full known word.
    for (const token of head.split(" ").filter(Boolean)) {
      expect(token).toBe("supercalifragilisticexpialidocious");
    }
  });

  it("falls back to a hard slice when there is no space within the limit", () => {
    const noSpaces = "x".repeat(MAX_META_DESCRIPTION + 50);
    const result = truncateForMeta(noSpaces);
    expect(result.endsWith("…")).toBe(true);
    expect(result.slice(0, -1).length).toBe(MAX_META_DESCRIPTION);
  });
});
