import { expect, test } from "@playwright/test";
import Module, { createRequire } from "node:module";
import * as path from "node:path";

import type { CurrentProfile } from "../../src/lib/auth/current-user";
import type { ExpiredUploadsCleanupDependencies } from "../../src/lib/storage/cleanup-expired-uploads";
import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";

const validItemId = "11111111-1111-4111-8111-111111111111";
const secondValidItemId = "44444444-4444-4444-8444-444444444444";
const validSessionId = "22222222-2222-4222-8222-222222222222";

type CleanupServiceModule = typeof import("../../src/lib/storage/cleanup-expired-uploads");
type CleanupParserModule = typeof import("../../src/lib/storage/cleanup-expired-uploads-parser");
type ResolveFilename = (request: string, ...args: unknown[]) => string;

let cleanupExpiredUploads: CleanupServiceModule["cleanupExpiredUploads"];
let parseExpiredUploadsReconciliation: CleanupParserModule["parseExpiredUploadsReconciliation"];
const testRequire = createRequire(
  path.join(process.cwd(), "tests/e2e/mantenimiento.spec.ts"),
);

test.beforeAll(async () => {
  const nodeModule = Module as typeof Module & {
    _resolveFilename: ResolveFilename;
  };
  const originalResolveFilename = nodeModule._resolveFilename;
  const serverOnlyEmptyModule = testRequire.resolve(
    "next/dist/compiled/server-only/empty",
  );

  nodeModule._resolveFilename = ((request: string, ...args: unknown[]) => {
    if (request === "server-only") {
      return serverOnlyEmptyModule;
    }

    const resolvedRequest = request.startsWith("@/")
      ? path.join(process.cwd(), "src", request.slice(2))
      : request;

    return originalResolveFilename.call(nodeModule, resolvedRequest, ...args);
  }) as ResolveFilename;

  try {
    ({ cleanupExpiredUploads } = await import(
      "../../src/lib/storage/cleanup-expired-uploads"
    ));
    ({ parseExpiredUploadsReconciliation } = await import(
      "../../src/lib/storage/cleanup-expired-uploads-parser"
    ));
  } finally {
    nodeModule._resolveFilename = originalResolveFilename;
  }
});

function validReconciliation(candidateCount = 1) {
  const itemIds = [validItemId, secondValidItemId].slice(0, candidateCount);

  return [
    {
      expired_sessions: 1,
      partial_sessions: 0,
      completed_sessions: 0,
      expired_items: candidateCount,
      candidates: itemIds.map((itemId) => ({
        item_id: itemId,
        object_path: `cargas/v1/${validSessionId}/${itemId}/nonce-file.pdf`,
      })),
    },
  ];
}

function adminProfile(): CurrentProfile {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    full_name: "Admin QA",
    role: "admin",
    is_active: true,
    must_change_password: false,
  };
}

function cleanupDependencies({
  profile = adminProfile(),
  rpcData = validReconciliation(),
  rpcError = null,
  storageData = [],
  storageError = null,
}: {
  profile?: CurrentProfile | null;
  rpcData?: unknown;
  rpcError?: unknown;
  storageData?: unknown;
  storageError?: unknown;
} = {}) {
  const removeCalls: string[][] = [];

  const dependencies: ExpiredUploadsCleanupDependencies = {
    getCurrentProfile: async () => profile,
    createClient: async () => ({
      rpc: async () => ({ data: rpcData, error: rpcError }),
      storage: {
        from: () => ({
          remove: async (paths) => {
            removeCalls.push(paths);
            return { data: storageData, error: storageError };
          },
        }),
      },
    }),
  };

  return { dependencies, removeCalls };
}

test("cleanup service returns safe outcomes and removes only exact validated paths", async () => {
  const unauthorized = cleanupDependencies({ profile: null });
  await expect(cleanupExpiredUploads(unauthorized.dependencies)).resolves.toMatchObject({
    ok: false,
    reason: "unauthorized",
  });

  const forbidden = cleanupDependencies({
    profile: { ...adminProfile(), role: "supervisor" },
  });
  await expect(cleanupExpiredUploads(forbidden.dependencies)).resolves.toMatchObject({
    ok: false,
    reason: "forbidden",
  });

  const inactiveAdmin = cleanupDependencies({
    profile: { ...adminProfile(), is_active: false },
  });
  await expect(cleanupExpiredUploads(inactiveAdmin.dependencies)).resolves.toMatchObject({
    ok: false,
    reason: "forbidden",
  });

  const mustChangePasswordAdmin = cleanupDependencies({
    profile: { ...adminProfile(), must_change_password: true },
  });
  await expect(cleanupExpiredUploads(mustChangePasswordAdmin.dependencies)).resolves.toMatchObject({
    ok: false,
    reason: "forbidden",
  });

  const invalidResponse = cleanupDependencies({ rpcData: [] });
  await expect(cleanupExpiredUploads(invalidResponse.dependencies)).resolves.toMatchObject({
    ok: false,
    reason: "invalid_response",
  });
  expect(invalidResponse.removeCalls).toEqual([]);

  const zeroCandidates = cleanupDependencies({
    rpcData: [{ ...validReconciliation()[0], candidates: [] }],
  });
  await expect(cleanupExpiredUploads(zeroCandidates.dependencies)).resolves.toMatchObject({
    ok: true,
    candidatesFound: 0,
    objectsDeleted: 0,
  });
  expect(zeroCandidates.removeCalls).toEqual([]);

  const exactRemove = cleanupDependencies({ storageData: [{ name: "deleted" }] });
  await expect(cleanupExpiredUploads(exactRemove.dependencies)).resolves.toMatchObject({
    ok: true,
    candidatesFound: 1,
    objectsDeleted: 1,
  });
  expect(exactRemove.removeCalls).toEqual([
    [`cargas/v1/${validSessionId}/${validItemId}/nonce-file.pdf`],
  ]);

  const storageFailure = cleanupDependencies({ storageError: { message: "failed" } });
  await expect(cleanupExpiredUploads(storageFailure.dependencies)).resolves.toMatchObject({
    ok: false,
    reason: "storage_failed",
    candidatesFound: 1,
    objectsDeleted: 0,
  });

  const silentZeroDeletion = cleanupDependencies({ storageData: [] });
  await expect(cleanupExpiredUploads(silentZeroDeletion.dependencies)).resolves.toMatchObject({
    ok: false,
    reason: "storage_failed",
    candidatesFound: 1,
    objectsDeleted: 0,
  });

  const partialDeletion = cleanupDependencies({
    rpcData: validReconciliation(2),
    storageData: [{ name: "one-deleted-object" }],
  });
  await expect(cleanupExpiredUploads(partialDeletion.dependencies)).resolves.toMatchObject({
    ok: false,
    reason: "storage_failed",
    candidatesFound: 2,
    objectsDeleted: 1,
  });

  const oversizedResponse = cleanupDependencies({
    storageData: [{ name: "one" }, { name: "two" }],
  });
  await expect(cleanupExpiredUploads(oversizedResponse.dependencies)).resolves.toMatchObject({
    ok: false,
    reason: "storage_failed",
    candidatesFound: 1,
    objectsDeleted: 2,
  });
});

test("cleanup reconciliation parser accepts only the safe contract", () => {
  expect(parseExpiredUploadsReconciliation(validReconciliation())).not.toBeNull();

  const invalidUuid = validReconciliation();
  invalidUuid[0].candidates[0].item_id = "not-a-uuid";
  expect(parseExpiredUploadsReconciliation(invalidUuid)).toBeNull();

  const invalidPath = validReconciliation();
  invalidPath[0].candidates[0].object_path = "other/path";
  expect(parseExpiredUploadsReconciliation(invalidPath)).toBeNull();

  const tooManyCandidates = validReconciliation();
  tooManyCandidates[0].candidates = Array.from(
    { length: 101 },
    () => validReconciliation()[0].candidates[0],
  );
  expect(parseExpiredUploadsReconciliation(tooManyCandidates)).toBeNull();

  const negativeCount = validReconciliation();
  negativeCount[0].expired_items = -1;
  expect(parseExpiredUploadsReconciliation(negativeCount)).toBeNull();
});

test("admin can confirm manual expired uploads cleanup without technical leaks", async ({
  page,
}, testInfo) => {
  await loginAs(page, "admin");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/configuracion");

  await page.getByRole("link", { name: /mantenimiento/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/mantenimiento/);
  await expect(
    page.getByRole("heading", { name: /^mantenimiento$/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /limpieza de cargas expiradas/i }),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await page.getByRole("button", { name: /limpiar cargas expiradas/i }).click();
  const dialog = page.getByRole("dialog", { name: /confirmar mantenimiento/i });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /confirmar mantenimiento/i }),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);
  await page.screenshot({
    path: testInfo.outputPath("mantenimiento-desktop.png"),
    fullPage: true,
  });

  await dialog.getByRole("button", { name: /confirmar mantenimiento/i }).click();
  await expect(
    dialog.getByText(
      /mantenimiento completado|no hay cargas expiradas pendientes de limpieza/i,
    ),
  ).toBeVisible({ timeout: 20_000 });
  await expectNoVisibleSensitiveText(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await page.screenshot({
    path: testInfo.outputPath("mantenimiento-mobile.png"),
    fullPage: true,
  });
});

test("supervisor and worker cannot access manual cleanup", async ({ page }) => {
  await loginAs(page, "supervisor");
  await page.goto("/dashboard/configuracion/mantenimiento");
  await expectAccessLimitedPage(page);

  await loginAs(page, "worker");
  await page.goto("/dashboard/configuracion/mantenimiento");
  await expectAccessLimitedPage(page);
});
