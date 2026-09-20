import { defineConfig, devices } from "@playwright/test";

const externalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";
const managedProductionQa =
  process.env.GODEL_MANAGED_PRODUCTION_QA === "1";
const configuredBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const managedStorageState = process.env.GODEL_MANAGED_STORAGE_STATE_PATH;

if (managedProductionQa && !externalServer) {
  throw new Error("Managed Production QA requires an external server.");
}

if (managedProductionQa && !configuredBaseURL) {
  throw new Error("Managed Production QA requires a base URL.");
}

if (managedProductionQa && !managedStorageState) {
  throw new Error("Managed Production QA requires infrastructure storage state.");
}

const baseURL = configuredBaseURL ?? "http://localhost:3000";

const chromiumProject = {
  name: "chromium",
  use: { ...devices["Desktop Chrome"] },
};

const edgeProject = {
  name: "edge",
  use: {
    ...devices["Desktop Edge"],
    channel: "msedge",
  },
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: managedProductionQa ? 90_000 : 30_000,
  expect: {
    timeout: managedProductionQa ? 15_000 : 5_000,
  },
  ...(externalServer
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
  use: {
    baseURL,
    ...(managedProductionQa ? { storageState: managedStorageState } : {}),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  workers: managedProductionQa ? 1 : undefined,
  projects: managedProductionQa
    ? [chromiumProject]
    : [chromiumProject, edgeProject],
});
