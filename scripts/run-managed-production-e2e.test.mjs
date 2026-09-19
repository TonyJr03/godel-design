import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";

import {
  FORBIDDEN_CHILD_ENV_NAMES,
  MANAGED_PUBLIC_ENV_NAMES,
  MANAGED_QA_ENV_NAMES,
  MANAGED_READ_ONLY_EXCLUDED_TESTS,
  MANAGED_READ_ONLY_SPECS,
  bootstrapProtectionStorageState,
  buildChildEnvironment,
  buildPlaywrightArguments,
  parseEnvironmentFile,
  selectRequiredValues,
  validateProductionOrigin,
  withTemporaryStorageState,
} from "./run-managed-production-e2e.mjs";

const publicValues = Object.fromEntries(
  MANAGED_PUBLIC_ENV_NAMES.map((name) => [name, `value-for-${name}`]),
);
const qaValues = Object.fromEntries(
  MANAGED_QA_ENV_NAMES.map((name) => [name, `value-for-${name}`]),
);

test("managed env parser selects required public values and ignores secrets", () => {
  const parsed = parseEnvironmentFile(
    [
      "NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.invalid",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=publishable-test-value",
      "SUPABASE_SECRET_KEY=must-not-propagate",
    ].join("\n"),
    "test runtime",
  );
  const selected = selectRequiredValues(
    parsed,
    MANAGED_PUBLIC_ENV_NAMES,
    "test runtime",
  );

  assert.deepEqual(Object.keys(selected), [...MANAGED_PUBLIC_ENV_NAMES]);
  assert.equal("SUPABASE_SECRET_KEY" in selected, false);
});

test("managed env parser rejects duplicates and missing required values", () => {
  assert.throws(
    () => parseEnvironmentFile("VALUE=one\nVALUE=two", "duplicate test"),
    /duplicate variable/,
  );
  assert.throws(
    () =>
      selectRequiredValues(
        new Map([["FIRST", "present"]]),
        ["FIRST", "SECOND"],
        "missing test",
      ),
    /SECOND/,
  );
});

test("Production origin validation is fail-closed", () => {
  assert.equal(
    validateProductionOrigin("https://deployment.example.invalid/"),
    "https://deployment.example.invalid",
  );

  for (const candidate of [
    "http://deployment.example.invalid",
    "https://user:password@deployment.example.invalid",
    "https://deployment.example.invalid/path",
    "https://deployment.example.invalid/?query=1",
    "https://deployment.example.invalid/#fragment",
    " https://deployment.example.invalid",
    "not-a-url",
    "",
  ]) {
    assert.throws(() => validateProductionOrigin(candidate));
  }
});

test("child environment is allowlisted and excludes privileged values", () => {
  const parentEnvironment = {
    PATH: "safe-path",
    RANDOM_UNRELATED_SECRET: "must-not-propagate",
    SUPABASE_SECRET_KEY: "must-not-propagate",
    VERCEL_AUTOMATION_BYPASS_SECRET: "must-not-propagate",
  };
  const child = buildChildEnvironment({
    parentEnvironment,
    productionOrigin: "https://deployment.example.invalid",
    publicEnvironment: publicValues,
    qaEnvironment: qaValues,
    storageStatePath: "temporary-state.json",
  });

  assert.equal(child.PATH, "safe-path");
  assert.equal(child.RANDOM_UNRELATED_SECRET, undefined);
  assert.equal(child.GODEL_MANAGED_PRODUCTION_QA, "1");
  assert.equal(child.PLAYWRIGHT_EXTERNAL_SERVER, "1");
  assert.equal(child.PLAYWRIGHT_BASE_URL, "https://deployment.example.invalid");

  for (const name of FORBIDDEN_CHILD_ENV_NAMES) {
    assert.equal(child[name], undefined);
  }
});

test("managed Playwright arguments use only the fixed read-only allowlist", () => {
  const args = buildPlaywrightArguments();
  const grepInvertIndex = args.indexOf("--grep-invert");
  const excludedPattern = new RegExp(args[grepInvertIndex + 1]);

  assert.equal(args[0], "test");
  assert.equal(args.includes("--project=chromium"), true);
  assert.equal(args.includes("--workers=1"), true);
  assert.notEqual(grepInvertIndex, -1);

  for (const spec of MANAGED_READ_ONLY_SPECS) {
    assert.equal(args.includes(spec), true);
  }

  for (const forbidden of [
    "tests/e2e/full-visual-qa.spec.ts",
    "tests/e2e/pedidos.spec.ts",
    "tests/e2e/auth-admin-selfhosted.spec.ts",
  ]) {
    assert.equal(args.includes(forbidden), false);
  }

  for (const excludedTitle of MANAGED_READ_ONLY_EXCLUDED_TESTS) {
    assert.equal(
      excludedPattern.test(`chromium tests/e2e/example.spec.ts ${excludedTitle}`),
      true,
    );
  }

  assert.equal(
    excludedPattern.test("chromium tests/e2e/example.spec.ts unrelated test"),
    false,
  );
});

test("protection bootstrap uses one same-origin non-redirecting request", async () => {
  await withTemporaryStorageState(async ({ storageStatePath }) => {
    let requestCount = 0;
    let disposed = false;

    await bootstrapProtectionStorageState({
      bypassSecret: "in-memory-test-bypass",
      productionOrigin: "https://deployment.example.invalid",
      storageStatePath,
      createRequestContext: async (options) => {
        assert.deepEqual(options, {
          baseURL: "https://deployment.example.invalid",
        });

        return {
          async get(pathname, requestOptions) {
            requestCount += 1;
            assert.equal(pathname, "/");
            assert.equal(requestOptions.maxRedirects, 0);
            assert.equal(requestOptions.headers["x-vercel-set-bypass-cookie"], "true");
            assert.equal(
              requestOptions.headers["x-vercel-protection-bypass"],
              "in-memory-test-bypass",
            );

            return {
              async dispose() {},
              status() {
                return 200;
              },
            };
          },
          async storageState() {
            return {
              cookies: [
                {
                  domain: ".example.invalid",
                  expires: -1,
                  httpOnly: true,
                  name: "opaque-infrastructure-cookie",
                  path: "/",
                  sameSite: "Lax",
                  secure: true,
                  value: "opaque-cookie-value",
                },
              ],
              origins: [],
            };
          },
          async dispose() {
            disposed = true;
          },
        };
      },
    });

    assert.equal(requestCount, 1);
    assert.equal(disposed, true);
    assert.equal(existsSync(storageStatePath), true);
  });
});

test("protection bootstrap sanitizes request failures", async () => {
  await withTemporaryStorageState(async ({ storageStatePath }) => {
    await assert.rejects(
      bootstrapProtectionStorageState({
        bypassSecret: "in-memory-test-bypass",
        productionOrigin: "https://deployment.example.invalid",
        storageStatePath,
        createRequestContext: async () => ({
          async get() {
            throw new Error("raw failure with in-memory-test-bypass");
          },
          async storageState() {
            return { cookies: [], origins: [] };
          },
          async dispose() {},
        }),
      }),
      (error) => {
        assert.equal(
          error.message,
          "Deployment Protection bootstrap failed",
        );
        assert.equal(error.message.includes("in-memory-test-bypass"), false);
        return true;
      },
    );
  });
});

test("temporary storage state is removed after success and failure", async () => {
  let successfulDirectory;

  await withTemporaryStorageState(async ({ directory, storageStatePath }) => {
    successfulDirectory = directory;
    await writeFile(storageStatePath, "{}", "utf8");
  });

  assert.equal(existsSync(successfulDirectory), false);

  let failedDirectory;
  await assert.rejects(
    withTemporaryStorageState(async ({ directory, storageStatePath }) => {
      failedDirectory = directory;
      await writeFile(storageStatePath, "{}", "utf8");
      throw new Error("expected test failure");
    }),
    /expected test failure/,
  );

  assert.equal(existsSync(failedDirectory), false);
});
