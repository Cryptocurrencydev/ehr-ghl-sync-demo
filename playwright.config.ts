import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3200";
const local = !process.env.BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { baseURL: BASE_URL, browserName: "chromium", viewport: { width: 1360, height: 900 }, screenshot: "only-on-failure" },
  webServer: local
    ? {
        command: "npx next start -p 3200",
        url: "http://localhost:3200",
        reuseExistingServer: true,
        env: { DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://localhost/ghl_sync_e2e", PLAYWRIGHT_LOCAL: "1", WEBHOOK_SECRET: "e2e-secret" },
      }
    : undefined,
});
