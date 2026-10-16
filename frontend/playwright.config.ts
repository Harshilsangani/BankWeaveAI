import { defineConfig } from "@playwright/test";
const baseURL = process.env.RISKLENS_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL,
    browserName: "chromium",
    channel: process.platform === "win32" ? "msedge" : undefined,
    headless: true,
    viewport: { width: 1440, height: 1050 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: { command: "npm --prefix .. run dev", url: baseURL, reuseExistingServer: true },
  reporter: "list",
});
