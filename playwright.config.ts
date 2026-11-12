import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);

/**
 * E2E against the dev server. UI flows use the dev-only fixture routes
 * (/dev/*) so they run without a Supabase project; data rules are covered
 * by the PGlite suite in tests/db.
 *
 * It has to be the dev server: /dev/* answers 404 in a production build.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // Following a link makes the dev server compile the next route on demand,
  // which can take several seconds the first time.
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: CI,
  // The dev server compiles each route on first hit; on a cold CI machine that
  // can outlast a timeout once, so allow one retry there (never locally).
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next dev -p 3100", url: "http://localhost:3100", reuseExistingServer: !CI, timeout: 180_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
