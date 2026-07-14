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
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // The checkout e2e places several real orders from one localhost IP inside
    // one rate-limit window; disable the (server-only) per-IP checkout throttle
    // for the test server so it doesn't legitimately trip. Never set in real
    // deploys — production always enforces the limit. If the authoritative e2e
    // run uses a separately-started prod server (NEXT_QA_DIST_DIR + next start),
    // export CHECKOUT_RATE_LIMIT_DISABLED=1 on that command too.
    env: { CHECKOUT_RATE_LIMIT_DISABLED: "1" },
  },
});
