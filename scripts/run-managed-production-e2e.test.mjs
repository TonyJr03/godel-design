import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  FORBIDDEN_CHILD_ENV_NAMES,
  MANAGED_PUBLIC_ENV_NAMES,
  MANAGED_QA_ENV_NAMES,
  MANAGED_READ_ONLY_BATCHES,
  MANAGED_READ_ONLY_EXCLUDED_TESTS,
  MANAGED_READ_ONLY_SPECS,
  bootstrapProtectionStorageState,
  buildChildEnvironment,
  buildPlaywrightArguments,
  parseEnvironmentFile,
  runManagedReadOnlyBatches,
  selectRequiredValues,
  validateManagedReadOnlyBatchInventory,
  validateProductionOrigin,
  withTemporaryStorageState,
} from "./run-managed-production-e2e.mjs";

const publicValues = Object.fromEntries(
  MANAGED_PUBLIC_ENV_NAMES.map((name) => [name, `value-for-${name}`]),
);
const qaValues = Object.fromEntries(
  MANAGED_QA_ENV_NAMES.map((name) => [name, `value-for-${name}`]),
);

const productionOrigin = "https://deployment.example.invalid";
const applicableInfrastructureCookie = Object.freeze({
  domain: ".example.invalid",
  expires: -1,
  httpOnly: true,
  name: "opaque-infrastructure-cookie",
  path: "/",
  sameSite: "Lax",
  secure: true,
  value: "opaque-cookie-value",
});

function createBootstrapContextMock({
  cookies = [applicableInfrastructureCookie],
  location,
  status = 200,
} = {}) {
  const observed = {
    contextDisposed: false,
    contextOptions: undefined,
    requestCount: 0,
    requestOptions: undefined,
    requestPath: undefined,
    responseDisposed: false,
  };

  return {
    createRequestContext: async (options) => {
      observed.contextOptions = options;

      return {
        async get(pathname, requestOptions) {
          observed.requestCount += 1;
          observed.requestOptions = requestOptions;
          observed.requestPath = pathname;

          return {
            async dispose() {
              observed.responseDisposed = true;
            },
            headers() {
              return location === undefined ? {} : { location };
            },
            status() {
              return status;
            },
          };
        },
        async storageState() {
          return { cookies, origins: [] };
        },
        async dispose() {
          observed.contextDisposed = true;
        },
      };
    },
    observed,
  };
}

async function runBootstrapMock(mockOptions) {
  const mock = createBootstrapContextMock(mockOptions);
  let result;

  await withTemporaryStorageState(async ({ storageStatePath }) => {
    result = await bootstrapProtectionStorageState({
      bypassSecret: "in-memory-test-bypass",
      createRequestContext: mock.createRequestContext,
      productionOrigin,
      storageStatePath,
    });

    assert.equal(existsSync(storageStatePath), true);
  });

  return { observed: mock.observed, result };
}

async function assertBootstrapRejected(mockOptions) {
  const mock = createBootstrapContextMock(mockOptions);

  await withTemporaryStorageState(async ({ storageStatePath }) => {
    await assert.rejects(
      bootstrapProtectionStorageState({
        bypassSecret: "in-memory-test-bypass",
        createRequestContext: mock.createRequestContext,
        productionOrigin,
        storageStatePath,
      }),
      (error) => {
        assert.equal(error.message, "Deployment Protection bootstrap failed");
        return true;
      },
    );
  });

  assert.equal(mock.observed.requestCount, 1);
  assert.equal(mock.observed.requestOptions.maxRedirects, 0);
  assert.equal(mock.observed.responseDisposed, true);
  assert.equal(mock.observed.contextDisposed, true);
}

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

test("managed batch inventory covers the fixed allowlist exactly once", () => {
  const inventory = validateManagedReadOnlyBatchInventory();

  assert.equal(inventory.batchCount, 5);
  assert.deepEqual(
    MANAGED_READ_ONLY_BATCHES.map((batch) => batch.name),
    [
      "foundation",
      "dashboard",
      "shell",
      "listings",
      "remaining-readonly",
    ],
  );
  assert.deepEqual(inventory.flattenedSpecs, [...MANAGED_READ_ONLY_SPECS]);
  assert.deepEqual(inventory.duplicates, []);
  assert.deepEqual(inventory.missingSpecs, []);
  assert.deepEqual(inventory.extraSpecs, []);

  for (const batch of MANAGED_READ_ONLY_BATCHES) {
    assert.equal(Object.isFrozen(batch), true);
    assert.equal(Object.isFrozen(batch.specs), true);
  }
});

test("managed batch inventory rejects duplicates, missing specs, and extras", () => {
  const mutableBatches = MANAGED_READ_ONLY_BATCHES.map((batch) => ({
    name: batch.name,
    specs: [...batch.specs],
  }));

  assert.throws(
    () =>
      validateManagedReadOnlyBatchInventory({
        batches: [
          ...mutableBatches,
          { name: "duplicate", specs: [MANAGED_READ_ONLY_SPECS[0]] },
        ],
      }),
    /inventory drift/,
  );
  assert.throws(
    () =>
      validateManagedReadOnlyBatchInventory({
        batches: mutableBatches.map((batch, index) =>
          index === 0
            ? { ...batch, specs: batch.specs.slice(1) }
            : batch,
        ),
      }),
    /inventory drift/,
  );
  assert.throws(
    () =>
      validateManagedReadOnlyBatchInventory({
        batches: [
          ...mutableBatches,
          { name: "extra", specs: ["tests/e2e/not-allowed.spec.ts"] },
        ],
      }),
    /inventory drift/,
  );
});

test("managed Playwright arguments are isolated to each validated batch", () => {
  for (const batch of MANAGED_READ_ONLY_BATCHES) {
    const args = buildPlaywrightArguments(batch);
    const grepInvertIndex = args.indexOf("--grep-invert");
    const outputIndex = args.indexOf("--output");
    const excludedPattern = new RegExp(args[grepInvertIndex + 1]);
    const otherSpecs = MANAGED_READ_ONLY_SPECS.filter(
      (spec) => !batch.specs.includes(spec),
    );

    assert.equal(args[0], "test");
    assert.equal(args.includes("--project=chromium"), true);
    assert.equal(args.includes("--workers=1"), true);
    assert.notEqual(grepInvertIndex, -1);
    assert.equal(
      args[outputIndex + 1],
      join("test-results", "managed-readonly", batch.name),
    );

    for (const spec of batch.specs) {
      assert.equal(args.includes(spec), true);
    }

    for (const spec of otherSpecs) {
      assert.equal(args.includes(spec), false);
    }

    for (const excludedTitle of MANAGED_READ_ONLY_EXCLUDED_TESTS) {
      assert.equal(
        excludedPattern.test(
          `chromium tests/e2e/example.spec.ts ${excludedTitle}`,
        ),
        true,
      );
    }

    assert.equal(
      excludedPattern.test("chromium tests/e2e/example.spec.ts unrelated test"),
      false,
    );
  }

  assert.throws(
    () =>
      buildPlaywrightArguments({
        name: "arbitrary",
        specs: [MANAGED_READ_ONLY_SPECS[0]],
      }),
    /unrecognized managed read-only batch/,
  );
});

test("managed batch aggregation is sequential and fail-closed", async () => {
  for (const scenario of [
    { codes: [0, 0, 0, 0, 0], expected: 0 },
    { codes: [0, 1, 0, 0, 0], expected: 1 },
    { codes: [1, 1, 0, 0, 0], expected: 1 },
  ]) {
    const observedBatches = [];
    const logs = [];
    const overall = await runManagedReadOnlyBatches({
      childEnvironment: {
        GODEL_MANAGED_STORAGE_STATE_PATH: "temporary-state.json",
      },
      log: (message) => logs.push(message),
      runBatch: async (_childEnvironment, batch) => {
        observedBatches.push(batch.name);
        return scenario.codes[observedBatches.length - 1];
      },
      storageStateAvailable: () => true,
    });

    assert.equal(overall, scenario.expected);
    assert.deepEqual(
      observedBatches,
      MANAGED_READ_ONLY_BATCHES.map((batch) => batch.name),
    );
    assert.equal(logs.filter((line) => line.includes("batch_start=")).length, 5);
    assert.equal(logs.filter((line) => line.includes("batch_exit=")).length, 5);
    assert.equal(logs.at(-1).includes("batches_total=5"), true);
    assert.equal(
      logs.at(-1).includes(
        scenario.expected === 0 ? "overall=PASS" : "overall=FAIL",
      ),
      true,
    );
  }
});

test("managed batch infrastructure failure stops later batches", async () => {
  const observedBatches = [];

  await assert.rejects(
    runManagedReadOnlyBatches({
      childEnvironment: {
        GODEL_MANAGED_STORAGE_STATE_PATH: "temporary-state.json",
      },
      log: () => undefined,
      runBatch: async (_childEnvironment, batch) => {
        observedBatches.push(batch.name);

        if (batch.name === "dashboard") {
          throw new Error("raw spawn failure");
        }

        return 0;
      },
      storageStateAvailable: () => true,
    }),
    (error) => {
      assert.equal(
        error.message,
        "managed read-only batch infrastructure failure",
      );
      assert.equal(error.message.includes("raw spawn failure"), false);
      return true;
    },
  );

  assert.deepEqual(observedBatches, ["foundation", "dashboard"]);
});

test("managed batch execution fails before spawn when storage state is unavailable", async () => {
  let runBatchCalled = false;

  await assert.rejects(
    runManagedReadOnlyBatches({
      childEnvironment: {
        GODEL_MANAGED_STORAGE_STATE_PATH: "missing-state.json",
      },
      log: () => undefined,
      runBatch: async () => {
        runBatchCalled = true;
        return 0;
      },
      storageStateAvailable: () => false,
    }),
    /managed read-only batch infrastructure failure/,
  );

  assert.equal(runBatchCalled, false);
});

test("protection bootstrap uses one same-origin non-redirecting request", async () => {
  const { observed, result } = await runBootstrapMock();

  assert.deepEqual(observed.contextOptions, { baseURL: productionOrigin });
  assert.equal(observed.requestCount, 1);
  assert.equal(observed.requestPath, "/");
  assert.equal(observed.requestOptions.maxRedirects, 0);
  assert.equal(
    observed.requestOptions.headers["x-vercel-set-bypass-cookie"],
    "true",
  );
  assert.equal(
    observed.requestOptions.headers["x-vercel-protection-bypass"],
    "in-memory-test-bypass",
  );
  assert.equal(observed.responseDisposed, true);
  assert.equal(observed.contextDisposed, true);
  assert.deepEqual(result, {
    infrastructureCookiePresent: true,
    redirectSameOrigin: null,
    redirectUsed: false,
    statusClass: "2xx",
  });
});

test("protection bootstrap accepts a relative same-origin 307 once", async () => {
  const { observed, result } = await runBootstrapMock({
    location: "/login",
    status: 307,
  });

  assert.equal(observed.requestCount, 1);
  assert.equal(observed.requestOptions.maxRedirects, 0);
  assert.deepEqual(result, {
    infrastructureCookiePresent: true,
    redirectSameOrigin: true,
    redirectUsed: true,
    statusClass: "3xx",
  });
});

test("protection bootstrap accepts an absolute same-origin 307", async () => {
  const { observed, result } = await runBootstrapMock({
    location: `${productionOrigin}/login`,
    status: 307,
  });

  assert.equal(observed.requestCount, 1);
  assert.equal(observed.requestOptions.maxRedirects, 0);
  assert.equal(result.redirectSameOrigin, true);
  assert.equal(result.redirectUsed, true);
});

test("protection bootstrap rejects unsafe redirect locations", async () => {
  for (const location of [
    "https://other.example.invalid/login",
    "http://deployment.example.invalid/login",
    "https://deployment.example.invalid:444/login",
    "https://user:password@deployment.example.invalid/login",
    "http://[",
  ]) {
    await assertBootstrapRejected({ location, status: 307 });
  }
});

test("protection bootstrap rejects a redirect without Location", async () => {
  await assertBootstrapRejected({ status: 307 });
});

test("protection bootstrap rejects a redirect without applicable cookies", async () => {
  await assertBootstrapRejected({
    cookies: [{ ...applicableInfrastructureCookie, secure: false }],
    location: "/login",
    status: 307,
  });
});

test("protection bootstrap rejects unsupported and error statuses", async () => {
  for (const status of [300, 304, 305, 306, 401, 500]) {
    await assertBootstrapRejected({ location: "/login", status });
  }
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
