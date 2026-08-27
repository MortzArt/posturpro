/**
 * CSS line-count guard (T19 M-1).
 *
 * CLAUDE.md Clean Code rules set a HARD CAP of 1,000 lines per file, enforced by
 * ESLint `max-lines`. But `eslint-config-next` never applies a config to `.css`,
 * so `npx eslint src/app/globals.css` is silently ignored — the cap was NOT
 * enforced on CSS, and `globals.css` grew past it (1005 lines) undetected.
 *
 * This test closes that gap: it walks every `*.css` under `src/` and asserts
 * each is under the hard cap, with a tighter warning-ceiling assertion for the
 * ~400-line guidance so a file trending toward the cap is caught in review long
 * before it breaches. Static file read (mirrors the secret-exposure guards).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");

/** CLAUDE.md hard cap — no file (any language) may exceed this. */
const HARD_CAP_LINES = 1000;

/**
 * Guidance ceiling for CSS files. New source files target ~400 lines; the motion
 * layer is split across `motion-shell/catalog/cart.css` to stay under this. Set
 * with headroom so an incremental motion addition doesn't trip it, while a file
 * approaching the hard cap is flagged well before it breaches.
 */
const GUIDANCE_CEILING_LINES = 600;

/** Recursively collect every `.css` file under a dir. */
function collectCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectCssFiles(full));
    } else if (entry.endsWith(".css")) {
      out.push(full);
    }
  }
  return out;
}

function lineCount(file: string): number {
  return readFileSync(file, "utf8").split("\n").length;
}

const CSS_FILES = collectCssFiles(SRC);

describe("CSS file size cap (M-1 — enforce the CLAUDE.md hard cap on *.css)", () => {
  it("finds at least one CSS file to guard (sanity)", () => {
    expect(CSS_FILES.length).toBeGreaterThan(0);
  });

  it("no *.css file exceeds the 1,000-line hard cap", () => {
    const offenders = CSS_FILES.filter(
      (file) => lineCount(file) > HARD_CAP_LINES,
    ).map((file) => `${path.relative(SRC, file)} (${lineCount(file)} lines)`);
    expect(offenders).toEqual([]);
  });

  it("no *.css file exceeds the ~600-line guidance ceiling (split earlier)", () => {
    const offenders = CSS_FILES.filter(
      (file) => lineCount(file) > GUIDANCE_CEILING_LINES,
    ).map((file) => `${path.relative(SRC, file)} (${lineCount(file)} lines)`);
    expect(offenders).toEqual([]);
  });
});
