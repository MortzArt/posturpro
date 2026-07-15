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
      // Stub `server-only` to a no-op so integration tests can import the actual
      // `server-only` write modules (product-write, csv-import-write, …) and
      // exercise their real compensation/rollback logic against the live DB —
      // not a hand-replicated copy of the sequence. The guard's only job is to
      // keep the secret key out of the client bundle, irrelevant here (node,
      // real service key). Matches the module's own `react-server` empty entry.
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
});
