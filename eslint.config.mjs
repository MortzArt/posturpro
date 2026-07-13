import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Isolated e2e build output (see NEXT_QA_DIST_DIR in next.config.ts) — build
    // artifacts, never linted (mirrors the `.next/**` ignore).
    ".next-qa/**",
    // Any other stage-scoped `.next-*` build output dir (e.g. `.next-t5-ux`) is
    // a generated artifact — never lint it (same rationale as `.next/**`).
    ".next-*/**",
  ]),
]);

export default eslintConfig;
