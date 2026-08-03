import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Authoritative e2e runs against a PROD build + `next start`, NOT `next dev`
    // (T14 AC-A5/A6). Two reasons the dev server was wrong: (1) `next dev`
    // cold-compiles each route on first hit → flaky first-request timeouts;
    // (2) in dev, `notFound()` streams a 200 document, so a real 404 route
    // reads as 200 and masks the missing-route assertion (AC-A6). A prod server
    // serves a genuine 404 status. The build+start is isolated in `.next-e2e`
    // (NEXT_QA_DIST_DIR, honored by next.config.ts) so it never collides with a
    // developer's live `next dev` (which single-instance-locks `.next`).
    command: "npm run e2e:server",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // A prod build is slower to become ready than a dev cold-start; give it room.
    timeout: 240_000,
    env: {
      // Disable the four server-only per-IP rate limiters for the test server —
      // the e2e places several real orders / quotes / contact messages / admin
      // logins from ONE localhost IP inside a single rate-limit window, which
      // would legitimately trip the throttle. NEVER set in real deploys —
      // production always enforces every limit. All four are read with
      // `=== "1"` server-side; none is `NEXT_PUBLIC_`.
      CHECKOUT_RATE_LIMIT_DISABLED: "1",
      QUOTE_RATE_LIMIT_DISABLED: "1",
      CONTACT_RATE_LIMIT_DISABLED: "1",
      ADMIN_LOGIN_RATE_LIMIT_DISABLED: "1",
    },
  },
});
