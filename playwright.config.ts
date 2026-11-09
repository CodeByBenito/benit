import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the dev server. UI flows use the dev-only fixture routes
 * (/dev/*) so they run without a Supabase project; data rules are covered
 * by the PGlite suite in tests/db.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next dev -p 3100", url: "http://localhost:3100", reuseExistingServer: true, timeout: 180_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
