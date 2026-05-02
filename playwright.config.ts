import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = Number(process.env["PLAYWRIGHT_PORT"] ?? 3011);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: `${process.env["HOME"]}/Library/pnpm/pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    env: {
      DATABASE_URL: "file:./test.db",
      NEXT_PUBLIC_SIMULATE_VIDEO: "true",
      SESSION_SECRET:
        process.env["SESSION_SECRET"] ?? "playwright-test-secret-32chars-ok",
    },
    cwd: path.resolve(__dirname),
  },
});
