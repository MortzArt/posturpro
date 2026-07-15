/**
 * Admin secret-exposure discipline (T10 AC-12). Static source assertions mirroring
 * the MP secret-exposure test: prove the admin secrets can never reach the client
 * bundle.
 *
 *  1. The auth + session modules are guarded by `import "server-only"`.
 *  2. No admin secret is ever prefixed `NEXT_PUBLIC_` anywhere in src.
 *  3. `"use client"` components never import the server-only admin modules.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE_FILES = collectSourceFiles(SRC);

/** Server-only admin modules a client component must never import. */
const SERVER_ONLY_MODULES = ["admin/auth", "admin/session", "admin/session-guard"];

describe("admin secret exposure (AC-12)", () => {
  it("auth.ts and session.ts are guarded by import \"server-only\"", () => {
    for (const mod of ["auth", "session"]) {
      const source = readFileSync(path.join(SRC, `lib/admin/${mod}.ts`), "utf8");
      expect(source).toMatch(/import\s+["']server-only["']/);
    }
  });

  it("no admin secret is ever prefixed NEXT_PUBLIC_ in src", () => {
    const offenders = SOURCE_FILES.filter((file) =>
      /NEXT_PUBLIC_ADMIN_(EMAIL|PASSWORD_HASH|SESSION_SECRET)/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("no \"use client\" file imports a server-only admin module", () => {
    const violations: string[] = [];
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      const isClient = /^\s*["']use client["']/m.test(source);
      if (!isClient) {
        continue;
      }
      for (const mod of SERVER_ONLY_MODULES) {
        if (source.includes(`@/lib/${mod}`)) {
          violations.push(`${path.relative(SRC, file)} imports ${mod}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
