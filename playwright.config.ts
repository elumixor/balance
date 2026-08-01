import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun run dev",
      cwd: "./apps/backend",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "bunx expo start --web --port 8081",
      cwd: "./apps/frontend",
      url: "http://localhost:8081",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
