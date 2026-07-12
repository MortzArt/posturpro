import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Integration test config — runs against a LIVE local Supabase instance
 * (`supabase start`). Kept separate from the default unit config so
 * `npm run test` stays fast and DB-free. Run with `npm run test:integration`,
 * which resets + seeds the local DB first for determinism.
 *
 * Node environment (no jsdom): these tests talk to PostgREST over HTTP, not the
 * DOM. Single-threaded + sequential so destructive writes (orders, questions)
 * do not race across files against the shared local database.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.integration.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
