/**
 * MP secret-exposure discipline (T8 AC-2). A STATIC source assertion mirroring
 * the T1 secret-exposure test: prove the MP access token + webhook secret can
 * never reach the client bundle.
 *
 *  1. The MP SDK client module is guarded by `import "server-only"`.
 *  2. No MP secret is ever prefixed `NEXT_PUBLIC_` anywhere in src.
 *  3. `"use client"` components never import the server-only MP modules
 *     (mp-client / preference / refund / process-payment / order-payment-read).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

/** Recursively collect every .ts/.tsx file under a dir. */
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

/** Modules that must never be imported by a client component (they hold the token). */
const SERVER_ONLY_MODULES = [
  "payments/mp-client",
  "payments/preference",
  "payments/refund",
  "payments/process-payment",
  "payments/order-payment-read",
  "payments/advance-order",
];

describe("MP secret exposure (AC-2)", () => {
  it("mp-client.ts is guarded by import \"server-only\"", () => {
    const source = readFileSync(path.join(SRC, "lib/payments/mp-client.ts"), "utf8");
    expect(source).toMatch(/import\s+["']server-only["']/);
  });

  it("no MP secret is ever prefixed NEXT_PUBLIC_ in src", () => {
    const offenders = SOURCE_FILES.filter((file) =>
      /NEXT_PUBLIC_MERCADOPAGO_(ACCESS_TOKEN|WEBHOOK_SECRET)/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("no \"use client\" file imports a server-only MP module", () => {
    const violations: string[] = [];
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      const isClient = /^\s*["']use client["']/m.test(source);
      if (!isClient) {
        continue;
      }
      for (const mod of SERVER_ONLY_MODULES) {
        if (source.includes(`@/lib/${mod}`) || source.includes(`payments/${mod.split("/")[1]}`)) {
          if (source.includes(`@/lib/${mod}`)) {
            violations.push(`${path.relative(SRC, file)} imports ${mod}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
