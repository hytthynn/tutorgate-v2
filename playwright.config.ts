import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/e2e/server.mjs",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
