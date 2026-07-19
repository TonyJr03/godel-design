import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PERF_PORT ?? 3100);
const host = "127.0.0.1";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export default defineConfig({
  testDir: "./tests/performance",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  retries: 0,
  reporter: [["list"]],
  webServer: {
    command: `${npmCommand} run start -- --hostname ${host} --port ${port}`,
    url: `http://${host}:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://${host}:${port}`,
    viewport: { width: 1366, height: 768 },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
