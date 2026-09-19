import { expect, test } from "@playwright/test";

const managedProductionQa =
  process.env.GODEL_MANAGED_PRODUCTION_QA === "1";

test.describe("managed Production health", () => {
  test.skip(
    !managedProductionQa,
    "Managed health checks run only through the managed Production runner.",
  );

  test("liveness contract is healthy", async ({ request }) => {
    const response = await request.get("/api/health/live");

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  test("readiness contract is healthy", async ({ request }) => {
    const response = await request.get("/api/health/ready");

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ready" });
  });
});
