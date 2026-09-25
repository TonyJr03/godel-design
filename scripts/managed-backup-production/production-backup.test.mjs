import assert from "node:assert/strict";
import { access, link, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import test from "node:test";

import { buildSupabaseDatabaseCommandPlans } from "../managed-backup/command-plans.mjs";
import {
  createExternalReceipt,
  validateExternalReceipt,
  verifyExternalCiphertext,
  writeExternalReceiptAtomic,
} from "../managed-backup/external-receipt.mjs";
import { runPipeline } from "../managed-backup/pipeline-runner.mjs";
import { createProductionAgeTarAdapter } from "../managed-backup/production-age-adapter.mjs";
import {
  prepareProductionBackup,
  resolveProductionGitAuthority,
  runProductionBackup,
} from "../managed-backup/production-backup.mjs";
import {
  assertProductionStorageCaptureConsistency,
  assertProductionStorageCaptureLayout,
  createProductionReadOnlyCaptureAdapter,
  createDatabaseAndDurableInventories,
  normalizeProductionStorageListing,
  relocateProductionDatabaseCapturePlan,
} from "../managed-backup/production-capture-adapter.mjs";
import {
  PRODUCTION_BACKUP_CONFIRMATION,
  PRODUCTION_WRITER_FREEZE_CONFIRMATION,
  buildProductionS3CommandPlan,
  readProductionBackupConfiguration,
} from "../managed-backup/production-contract.mjs";

const PROJECT_REF = "abcdefghijklmnopqrst";
const TOOLING_SHA = "a".repeat(40);
const RUNTIME_SHA = "b".repeat(40);
const BACKUP_ID = "GDBK-20260922T120000Z-ABCDEFGH";
const SYNTHETIC_PQ_RECIPIENT = `age1pq1${"q".repeat(1993)}`;

function environment(outputRoot) {
  return {
    PATH: process.env.PATH ?? "",
    GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM: PRODUCTION_BACKUP_CONFIRMATION,
    GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM: PRODUCTION_WRITER_FREEZE_CONFIRMATION,
    GODEL_MANAGED_SUPABASE_PROJECT_REF: PROJECT_REF,
    GODEL_MANAGED_PRODUCTION_RUNTIME_SHA: RUNTIME_SHA,
    GODEL_MANAGED_BACKUP_AGE_RECIPIENT: `age1${"q".repeat(30)}`,
    GODEL_MANAGED_BACKUP_OUTPUT_ROOT: outputRoot,
    SUPABASE_DB_PASSWORD: "synthetic-db-password",
    GODEL_MANAGED_STORAGE_S3_ENDPOINT: "https://storage.example.test/s3",
    GODEL_MANAGED_STORAGE_S3_REGION: "us-east-1",
    GODEL_MANAGED_STORAGE_S3_ACCESS_KEY_ID: "synthetic-access-id",
    GODEL_MANAGED_STORAGE_S3_SECRET_ACCESS_KEY: "synthetic-secret-key",
  };
}

function dependencies(overrides = {}) {
  return {
    resolveGitAuthority: async () => ({ branch: "ops/managed-free-production-pilot", head: TOOLING_SHA, clean: true }),
    readLinkedProjectRef: async () => PROJECT_REF,
    ensureSafeOutputRoot: async (value) => value,
    ...overrides,
  };
}

test("Production contract accepts a realistic synthetic PQ age recipient", () => {
  const values = environment(resolve(tmpdir(), "godel-production-pq-contract"));
  values.GODEL_MANAGED_BACKUP_AGE_RECIPIENT = SYNTHETIC_PQ_RECIPIENT;
  assert.equal(readProductionBackupConfiguration(values).ageRecipient, SYNTHETIC_PQ_RECIPIENT);
});

test("absent exact confirmation stops before every local or Production adapter", async () => {
  let calls = 0;
  await assert.rejects(
    prepareProductionBackup({ environment: {}, dependencies: { resolveGitAuthority: async () => { calls += 1; } } }),
    (error) => error.code === "PRODUCTION_BACKUP_CONFIRMATION_REQUIRED",
  );
  assert.equal(calls, 0);
});

test("absent writer-freeze confirmation stops before Git, linked project, DB, and S3", async () => {
  const values = environment(resolve(tmpdir(), "godel-production-prep"));
  delete values.GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM;
  let calls = 0;
  await assert.rejects(
    prepareProductionBackup({
      environment: values,
      dependencies: {
        resolveGitAuthority: async () => { calls += 1; },
        readLinkedProjectRef: async () => { calls += 1; },
      },
    }),
    (error) => error.code === "WRITER_FREEZE_CONFIRMATION_REQUIRED",
  );
  assert.equal(calls, 0);
});

test("backup and writer-freeze confirmations are never forwarded to Git child environment", async () => {
  const childEnvironments = [];
  await resolveProductionGitAuthority({
    repoRoot: process.cwd(),
    sourceEnvironment: environment(resolve(tmpdir(), "godel-production-prep")),
    execute: async (plan) => {
      childEnvironments.push(plan.allowedEnvironment);
      if (plan.args[0] === "branch") return { stdout: "ops/managed-free-production-pilot\n" };
      if (plan.args[0] === "rev-parse") return { stdout: `${TOOLING_SHA}\n` };
      return { stdout: "" };
    },
  });
  assert.ok(childEnvironments.every((value) => value.GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM === undefined));
  assert.ok(childEnvironments.every((value) => value.GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM === undefined));
});

test("dirty worktree and wrong branch stop before linked project or capture", async () => {
  const outputRoot = resolve(tmpdir(), "godel-production-prep");
  for (const authority of [
    { branch: "ops/managed-free-production-pilot", head: TOOLING_SHA, clean: false, code: "DIRTY_TOOLING_WORKTREE" },
    { branch: "wrong", head: TOOLING_SHA, clean: true, code: "WRONG_TOOLING_BRANCH" },
  ]) {
    let downstream = 0;
    await assert.rejects(
      prepareProductionBackup({
        environment: environment(outputRoot),
        dependencies: dependencies({
          resolveGitAuthority: async () => authority,
          readLinkedProjectRef: async () => { downstream += 1; return PROJECT_REF; },
        }),
      }),
      (error) => error.code === authority.code,
    );
    assert.equal(downstream, 0);
  }
});

test("wrong linked project stops before output allocation and dump", async () => {
  let downstream = 0;
  await assert.rejects(
    prepareProductionBackup({
      environment: environment(resolve(tmpdir(), "godel-production-prep")),
      dependencies: dependencies({
        readLinkedProjectRef: async () => "zzzzzzzzzzzzzzzzzzzz",
        ensureSafeOutputRoot: async () => { downstream += 1; },
      }),
    }),
    (error) => error.code === "LINKED_PROJECT_MISMATCH",
  );
  assert.equal(downstream, 0);
});

test("linked database password stays in allowlisted env and never argv", async () => {
  const prepared = await prepareProductionBackup({
    environment: environment(resolve(tmpdir(), "godel-production-prep")),
    dependencies: dependencies(),
  });
  assert.ok(prepared.databasePlans.every((plan) => plan.args.includes("--linked")));
  assert.ok(prepared.databasePlans.every((plan) => !plan.args.includes("--password") && !plan.args.includes("--db-url")));
  assert.ok(prepared.databasePlans.every((plan) => !plan.args.join(" ").includes("synthetic-db-password")));
});

test("Production S3 contract rejects upload and every destructive operation", () => {
  for (const operation of ["upload-restore", "delete", "sync", "move", "purge"]) {
    assert.throws(
      () => buildProductionS3CommandPlan({ operation, remotePath: "godel-files", localPath: "D:/capture" }),
      (error) => error.code === "PRODUCTION_S3_OPERATION_FORBIDDEN",
    );
  }
  const initial = buildProductionS3CommandPlan({ operation: "list-source", remotePath: "godel-files" });
  const verification = buildProductionS3CommandPlan({ operation: "verify-listing", remotePath: "godel-files" });
  const listingArgs = ["lsjson", "godelprod:godel-files", "--recursive", "--files-only", "--hash", "--metadata", "--no-mimetype"];
  assert.deepEqual(initial.args, listingArgs);
  assert.deepEqual(verification.args, listingArgs);
});

function storageListing(entries) {
  return JSON.stringify(entries.map((entry) => ({ IsDir: false, ...entry })));
}

test("Production Storage normalization is deterministic and exact inventory equality passes", () => {
  const listing = storageListing([
    { Path: "b.pdf", Size: 200, ModTime: "2026-09-24T00:00:00Z", Hashes: { MD5: "bb" }, Metadata: { tier: "STANDARD" } },
    { Path: "a.pdf", Size: 100, ModTime: "2026-09-24T00:00:00Z", Hashes: { MD5: "aa" }, Metadata: {} },
  ]);
  const normalized = normalizeProductionStorageListing(listing);
  assert.deepEqual(normalized.map((entry) => entry.path), ["a.pdf", "b.pdf"]);
  assert.doesNotThrow(() => assertProductionStorageCaptureConsistency({
    initialListing: listing,
    finalListing: listing,
    capturedObjects: [
      { path: "b.pdf", size: 200, sha256: "b".repeat(64) },
      { path: "a.pdf", size: 100, sha256: "a".repeat(64) },
    ],
  }));
});

test("same Storage aggregates with a changed path fail the capture window", () => {
  const initialListing = storageListing([{ Path: "a.pdf", Size: 100 }, { Path: "b.pdf", Size: 200 }]);
  const finalListing = storageListing([{ Path: "c.pdf", Size: 100 }, { Path: "b.pdf", Size: 200 }]);
  assert.throws(
    () => assertProductionStorageCaptureConsistency({
      initialListing,
      finalListing,
      capturedObjects: [{ path: "b.pdf", size: 200 }, { path: "c.pdf", size: 100 }],
    }),
    (error) => error.code === "STORAGE_CAPTURE_WINDOW_CHANGED",
  );
});

test("same Storage path and size with changed available fingerprint fails", () => {
  const initialListing = storageListing([{ Path: "a.pdf", Size: 100, Hashes: { MD5: "before" }, Metadata: { tier: "STANDARD" } }]);
  for (const changed of [
    { Path: "a.pdf", Size: 100, Hashes: { MD5: "after" }, Metadata: { tier: "STANDARD" } },
    { Path: "a.pdf", Size: 100, Hashes: { MD5: "before" }, Metadata: { tier: "ARCHIVE" } },
  ]) {
    assert.throws(
      () => assertProductionStorageCaptureConsistency({
        initialListing,
        finalListing: storageListing([changed]),
        capturedObjects: [{ path: "a.pdf", size: 100 }],
      }),
      (error) => error.code === "STORAGE_CAPTURE_WINDOW_CHANGED",
    );
  }
});

test("captured local Storage projection must match every final path and size", () => {
  const listing = storageListing([{ Path: "a.pdf", Size: 100 }, { Path: "b.pdf", Size: 200 }]);
  for (const capturedObjects of [
    [{ path: "a.pdf", size: 100 }],
    [{ path: "a.pdf", size: 100 }, { path: "c.pdf", size: 200 }],
    [{ path: "a.pdf", size: 101 }, { path: "b.pdf", size: 199 }],
  ]) {
    assert.throws(
      () => assertProductionStorageCaptureConsistency({ initialListing: listing, finalListing: listing, capturedObjects }),
      (error) => error.code === "STORAGE_CAPTURE_WINDOW_CHANGED",
    );
  }
});

test("Production Storage listing rejects unsafe, duplicate, directory, and invalid entries", () => {
  for (const listing of [
    "not-json",
    JSON.stringify({ Path: "a.pdf", Size: 1, IsDir: false }),
    storageListing([{ Path: "../escape", Size: 1 }]),
    storageListing([{ Path: "a.pdf", Size: 1 }, { Path: "a.pdf", Size: 1 }]),
    JSON.stringify([{ Path: "folder", Size: 0, IsDir: true }]),
    storageListing([{ Path: "a.pdf", Size: -1 }]),
  ]) {
    assert.throws(() => normalizeProductionStorageListing(listing), (error) => error.code === "STORAGE_LISTING_INVALID");
  }
});

test("missing S3 credentials or age recipient fails before Git and capture", async () => {
  for (const missing of ["GODEL_MANAGED_STORAGE_S3_ACCESS_KEY_ID", "GODEL_MANAGED_STORAGE_S3_SECRET_ACCESS_KEY", "GODEL_MANAGED_BACKUP_AGE_RECIPIENT"]) {
    const values = environment(resolve(tmpdir(), "godel-production-prep"));
    delete values[missing];
    let calls = 0;
    await assert.rejects(prepareProductionBackup({
      environment: values,
      dependencies: { resolveGitAuthority: async () => { calls += 1; } },
    }));
    assert.equal(calls, 0);
  }
});

test("output root inside repository is rejected", async () => {
  const repoRoot = process.cwd();
  await assert.rejects(
    prepareProductionBackup({ environment: environment(join(repoRoot, ".unsafe-backup")), repoRoot, dependencies: dependencies({ ensureSafeOutputRoot: undefined }) }),
    (error) => error.code === "UNSAFE_OUTPUT_ROOT",
  );
});

function captureSql({ missingUser = false, nullHash = false, emptyHash = false, noIdentity = false, missingPrivateTable = null, emptyStorage = false } = {}) {
  const userId = "11111111-1111-4111-8111-111111111111";
  const externalUserId = "44444444-4444-4444-8444-444444444444";
  const itemId = "22222222-2222-4222-8222-222222222222";
  const archivoId = "33333333-3333-4333-8333-333333333333";
  const path = `cargas/v1/${userId}/${itemId}/hash-file.pdf`;
  const hash = nullHash ? "\\N" : emptyHash ? "" : "$2a$synthetic";
  const users = missingUser
    ? [`${externalUserId}\t\\N`]
    : [`${userId}\t${hash}`, `${externalUserId}\t\\N`];
  const privateTables = [
    "private.internal_user_creation_audit",
    "private.internal_user_password_reset_audit",
  ].filter((identity) => identity !== missingPrivateTable);
  const storageObjects = emptyStorage ? [] : [`godel-files\t${path}\t{"size":3}`];
  const items = emptyStorage ? [] : [`${itemId}\tcommitted\t${archivoId}\t${path}\t3`];
  const archivos = emptyStorage ? [] : [`${archivoId}\tgodel-files\t${path}\t3`];
  return {
    path,
    sql: [
      "COPY auth.users (id, encrypted_password) FROM stdin;", ...users, "\\.",
      "COPY auth.identities (user_id) FROM stdin;", ...(noIdentity ? [externalUserId] : [userId, externalUserId]), "\\.",
      "COPY public.perfiles (id) FROM stdin;", userId, "\\.",
      "COPY storage.buckets (id) FROM stdin;", "godel-files", "\\.",
      "COPY storage.objects (bucket_id, name, metadata) FROM stdin;", ...storageObjects, "\\.",
      "COPY public.archivo_carga_items (id, status, archivo_id, object_path, expected_size) FROM stdin;", ...items, "\\.",
      "COPY public.archivos (id, bucket, file_path, file_size) FROM stdin;", ...archivos, "\\.",
      ...privateTables.flatMap((identity) => [`COPY ${identity} (id) FROM stdin;`, "\\."]),
      "",
    ].join("\n"),
  };
}

test("Production capture resolves linked context from repoRoot and writes every DB artifact under captureRoot", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-production-storage-window-"));
  const repoRoot = join(root, "repo");
  const captureRoot = join(root, "capture");
  const storageCaptureRoot = join(captureRoot, "storage");
  await mkdir(join(repoRoot, "supabase", ".temp"), { recursive: true });
  await writeFile(join(repoRoot, "supabase", ".temp", "project-ref"), PROJECT_REF);
  await mkdir(captureRoot);
  const fixture = captureSql();
  const listing = storageListing([{ Path: fixture.path, Size: 3, Hashes: { MD5: "synthetic" }, Metadata: {} }]);
  const operations = [];
  const databaseExecutions = [];
  const adapter = createProductionReadOnlyCaptureAdapter({
    execute: async (plan) => {
      operations.push(plan.operation);
      if (plan.operation === "list-source" || plan.operation === "verify-listing") return { stdout: listing, stderr: "" };
      if (plan.operation.startsWith("dump ")) {
        assert.equal(plan.cwd, repoRoot);
        await access(join(plan.cwd, "supabase", ".temp", "project-ref"));
        const fileIndex = plan.args.indexOf("--file");
        const outputPath = plan.args[fileIndex + 1];
        databaseExecutions.push({ args: plan.args, cwd: plan.cwd, outputPath });
        await writeFile(outputPath, plan.operation === "dump managed data" ? fixture.sql : "");
      }
      if (plan.operation === "download-copy") {
        const target = resolve(storageCaptureRoot, ...fixture.path.split("/"));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, "abc");
      }
      return { stdout: "", stderr: "" };
    },
    configurationSnapshotProvider: async () => ({}),
    toolVersionsProvider: async () => [],
    now: () => new Date("2026-09-24T12:00:00.000Z"),
  });
  const databasePlans = buildSupabaseDatabaseCommandPlans({ target: "linked", executable: "synthetic" });
  const s3Plans = [
    buildProductionS3CommandPlan({ operation: "list-source", remotePath: "godel-files" }),
    buildProductionS3CommandPlan({ operation: "download-copy", remotePath: "godel-files", localPath: storageCaptureRoot }),
    buildProductionS3CommandPlan({ operation: "verify-listing", remotePath: "godel-files" }),
  ];
  await adapter.captureReadOnly({
    captureRoot,
    databaseWorkingDirectory: repoRoot,
    databasePlans,
    databaseEnvironment: { allowedEnvironment: { SUPABASE_DB_PASSWORD: "synthetic" } },
    s3Plans,
    s3Environment: { allowedEnvironment: {}, secretValues: [] },
    storageCaptureRoot,
  });
  assert.deepEqual(operations, [
    "list-source",
    "dump roles",
    "dump managed schemas for audit",
    "dump managed data",
    "dump migration history schema",
    "dump migration history data",
    "download-copy",
    "verify-listing",
  ]);
  assert.equal(databaseExecutions.length, 5);
  assert.ok(databaseExecutions.every((execution) => execution.cwd !== captureRoot));
  assert.ok(databaseExecutions.every((execution) => isAbsolute(execution.outputPath)));
  assert.ok(databaseExecutions.every((execution) => {
    const path = relative(join(captureRoot, "database"), execution.outputPath);
    return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  }));
  assert.ok(databasePlans.every((plan) => plan.args[plan.args.indexOf("--file") + 1].startsWith("database/")));
  await assert.rejects(access(join(repoRoot, "database")), (error) => error.code === "ENOENT");
});

test("Production capture materializes an empty governed Storage root before remote operations", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-production-empty-storage-"));
  const repoRoot = join(root, "repo");
  const captureRoot = join(root, "capture");
  const storageCaptureRoot = join(captureRoot, "storage");
  await mkdir(join(repoRoot, "supabase", ".temp"), { recursive: true });
  await writeFile(join(repoRoot, "supabase", ".temp", "project-ref"), PROJECT_REF);
  await mkdir(captureRoot);
  const fixture = captureSql({ emptyStorage: true });
  const operations = [];
  const adapter = createProductionReadOnlyCaptureAdapter({
    execute: async (plan) => {
      operations.push(plan.operation);
      if (plan.operation === "list-source" || plan.operation === "verify-listing") {
        await access(storageCaptureRoot);
        return { stdout: "[]", stderr: "" };
      }
      if (plan.operation.startsWith("dump ")) {
        const outputPath = plan.args[plan.args.indexOf("--file") + 1];
        await writeFile(outputPath, plan.operation === "dump managed data" ? fixture.sql : "");
      }
      if (plan.operation === "download-copy") await access(storageCaptureRoot);
      return { stdout: "", stderr: "" };
    },
    configurationSnapshotProvider: async () => ({}),
    toolVersionsProvider: async () => [],
    now: () => new Date("2026-09-25T12:00:00.000Z"),
  });
  const databasePlans = buildSupabaseDatabaseCommandPlans({ target: "linked", executable: "synthetic" });
  const s3Plans = [
    buildProductionS3CommandPlan({ operation: "list-source", remotePath: "godel-files" }),
    buildProductionS3CommandPlan({ operation: "download-copy", remotePath: "godel-files", localPath: storageCaptureRoot }),
    buildProductionS3CommandPlan({ operation: "verify-listing", remotePath: "godel-files" }),
  ];
  const captured = await adapter.captureReadOnly({
    captureRoot,
    databaseWorkingDirectory: repoRoot,
    databasePlans,
    databaseEnvironment: { allowedEnvironment: { SUPABASE_DB_PASSWORD: "synthetic" } },
    s3Plans,
    s3Environment: { allowedEnvironment: {}, secretValues: [] },
    storageCaptureRoot,
  });
  assert.deepEqual(operations, [
    "list-source",
    "dump roles",
    "dump managed schemas for audit",
    "dump managed data",
    "dump migration history schema",
    "dump migration history data",
    "download-copy",
    "verify-listing",
  ]);
  assert.deepEqual(await readdir(storageCaptureRoot), []);
  assert.equal(captured.storageInventory.capturedObjects.length, 0);
  assert.equal(captured.durable.objectCount, 0);
});

test("Production Storage capture layout admits only captureRoot/storage and the matching download plan", () => {
  const captureRoot = resolve(tmpdir(), "godel-production-storage-layout");
  const exactRoot = join(captureRoot, "storage");
  const planFor = (localPath) => buildProductionS3CommandPlan({ operation: "download-copy", remotePath: "godel-files", localPath });
  assert.equal(
    assertProductionStorageCaptureLayout({ captureRoot, storageCaptureRoot: exactRoot, downloadPlan: planFor(exactRoot) }),
    exactRoot,
  );
  for (const storageCaptureRoot of [
    resolve(captureRoot, "..", "outside-storage"),
    captureRoot,
    join(captureRoot, "arbitrary-sibling"),
  ]) {
    assert.throws(
      () => assertProductionStorageCaptureLayout({ captureRoot, storageCaptureRoot, downloadPlan: planFor(storageCaptureRoot) }),
      (error) => error.code === "CAPTURE_PATH_UNSAFE",
    );
  }
  assert.throws(
    () => assertProductionStorageCaptureLayout({
      captureRoot,
      storageCaptureRoot: exactRoot,
      downloadPlan: planFor(join(captureRoot, "other")),
    }),
    (error) => error.code === "CAPTURE_PATH_UNSAFE",
  );
});

test("Production database plan relocation is immutable and rejects every unsafe --file shape", () => {
  const captureRoot = resolve(tmpdir(), "godel-production-plan-relocation");
  const original = Object.freeze({
    operation: "dump roles",
    executable: "synthetic",
    args: Object.freeze(["db", "dump", "--linked", "--role-only", "--file", "database/roles.sql"]),
    target: "linked",
    executionReady: true,
  });
  const relocated = relocateProductionDatabaseCapturePlan(original, { captureRoot });
  assert.notEqual(relocated.args, original.args);
  assert.equal(original.args.at(-1), "database/roles.sql");
  assert.equal(relocated.args.at(-1), resolve(captureRoot, "database", "roles.sql"));

  const invalidArgs = [
    ["db", "dump", "--linked"],
    ["db", "dump", "--linked", "--file", "database/roles.sql", "--file", "database/managed-data.sql"],
    ["db", "dump", "--linked", "--file", "../escape.sql"],
    ["db", "dump", "--linked", "--file", resolve(tmpdir(), "absolute-source.sql")],
    ["db", "dump", "--linked", "--file"],
    ["db", "dump", "--linked", "--file", "database/unexpected.sql"],
  ];
  for (const args of invalidArgs) {
    assert.throws(
      () => relocateProductionDatabaseCapturePlan({ ...original, args }, { captureRoot }),
      (error) => error.code === "DATABASE_CAPTURE_PLAN_INVALID",
    );
  }
});

test("profile to Auth user with password hash and identity proves continuity", () => {
  const { sql, path } = captureSql();
  const captured = [{ path, size: 3, sha256: "c".repeat(64) }];
  const valid = createDatabaseAndDurableInventories({ dumpText: sql, capturedObjects: captured });
  assert.ok(valid.databaseCounts.tables.some((table) => table.schema === "auth" && table.name === "users"));
  assert.ok(valid.databaseCounts.tables.some((table) => table.schema === "private" && table.name === "internal_user_creation_audit" && table.rowCount === 0));
  assert.ok(valid.databaseCounts.tables.some((table) => table.schema === "private" && table.name === "internal_user_password_reset_audit" && table.rowCount === 0));
  assert.equal(valid.authInventory.assertions.encryptedPasswordCoverageAvailable, true);
  assert.equal(valid.durable.objectCount, 1);
  assert.throws(
    () => createDatabaseAndDurableInventories({ dumpText: sql, capturedObjects: [{ ...captured[0], size: 4 }] }),
    (error) => error.code === "STORAGE_SIZE_MISMATCH",
  );
});

for (const [name, options] of [
  ["profile with missing Auth user fails password continuity", { missingUser: true }],
  ["profile with NULL password hash fails password continuity", { nullHash: true }],
  ["profile with empty password hash fails password continuity", { emptyHash: true }],
  ["profile without Auth identity fails password continuity", { noIdentity: true }],
]) {
  test(name, () => {
    const { sql, path } = captureSql(options);
    assert.throws(
      () => createDatabaseAndDurableInventories({ dumpText: sql, capturedObjects: [{ path, size: 3, sha256: "c".repeat(64) }] }),
      (error) => error.code === "AUTH_PASSWORD_CONTINUITY_FAILED",
    );
  });
}

for (const privateTable of ["private.internal_user_creation_audit", "private.internal_user_password_reset_audit"]) {
  test(`missing ${privateTable} fails capture completeness`, () => {
    const { sql, path } = captureSql({ missingPrivateTable: privateTable });
    assert.throws(
      () => createDatabaseAndDurableInventories({ dumpText: sql, capturedObjects: [{ path, size: 3, sha256: "c".repeat(64) }] }),
      (error) => error.code === "CAPTURE_TABLE_MISSING",
    );
  });
}

test("Production age adapter streams tar with a public recipient and no identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-production-age-"));
  const source = join(root, "source");
  const ciphertext = join(root, "bundle.age");
  await mkdir(source);
  await writeFile(join(source, "artifact.txt"), "plain");
  const calls = [];
  const adapter = createProductionAgeTarAdapter({
    recipient: `age1${"q".repeat(30)}`,
    cwd: root,
    pipeline: async (plan) => {
      calls.push(plan);
      await writeFile(ciphertext, "age-encryption.org/v1\nsynthetic-ciphertext");
      return { stdout: "", stderr: "" };
    },
  });
  await adapter.encrypt({ sourceDirectory: source, outputPath: ciphertext });
  assert.equal((await adapter.verifyCiphertext({ ciphertextPath: ciphertext })).verified, true);
  assert.deepEqual(calls[0].left.args.slice(0, 2), ["-cf", "-"]);
  assert.ok(calls[0].right.args.includes("--recipient"));
  assert.ok(!calls[0].right.args.includes("--identity"));
});

test("Production age adapter constructs with a realistic synthetic PQ recipient", () => {
  assert.doesNotThrow(() => createProductionAgeTarAdapter({
    recipient: SYNTHETIC_PQ_RECIPIENT,
    cwd: resolve(tmpdir(), "godel-production-pq-adapter"),
  }));
});

test("external receipt is strict, no-replace, and verifies downloaded ciphertext", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-external-receipt-"));
  const ciphertextPath = join(root, `${BACKUP_ID}.age`);
  await writeFile(ciphertextPath, "ciphertext");
  const receipt = await createExternalReceipt({ backupId: BACKUP_ID, toolingGitSha: TOOLING_SHA, productionRuntimeSha: RUNTIME_SHA, ciphertextPath });
  assert.equal(validateExternalReceipt(receipt), receipt);
  assert.throws(() => validateExternalReceipt({ ...receipt, projectRef: PROJECT_REF }), /unexpected fields/);
  const receiptPath = await writeExternalReceiptAtomic(receipt, { outputRoot: root });
  const existingBytes = await readFile(receiptPath);
  const collidingReceipt = { ...receipt, externalPublicationStatus: "VERIFIED" };
  await assert.rejects(writeExternalReceiptAtomic(collidingReceipt, { outputRoot: root }), (error) => error.code === "EXTERNAL_RECEIPT_ALREADY_EXISTS");
  assert.deepEqual(await readFile(receiptPath), existingBytes);
  assert.equal(JSON.parse(existingBytes.toString("utf8")).externalPublicationStatus, "PENDING");
  assert.equal((await verifyExternalCiphertext(receipt, ciphertextPath)).verified, true);
  await writeFile(ciphertextPath, "tampered");
  await assert.rejects(verifyExternalCiphertext(receipt, ciphertextPath), (error) => error.code === "EXTERNAL_CIPHERTEXT_MISMATCH");
});

test("external receipt remains committed when post-link temp cleanup fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-external-receipt-cleanup-"));
  const ciphertextPath = join(root, `${BACKUP_ID}.age`);
  await writeFile(ciphertextPath, "ciphertext");
  const receipt = await createExternalReceipt({ backupId: BACKUP_ID, toolingGitSha: TOOLING_SHA, productionRuntimeSha: RUNTIME_SHA, ciphertextPath });
  let committed = false;
  const receiptPath = await writeExternalReceiptAtomic(receipt, {
    outputRoot: root,
    linkFile: async (source, target) => { await link(source, target); committed = true; },
    removeTemporary: async () => { if (committed) throw Object.assign(new Error("synthetic cleanup failure"), { code: "EPERM" }); },
  });
  assert.equal(committed, true);
  assert.deepEqual(validateExternalReceipt(JSON.parse(await readFile(receiptPath, "utf8"))), receipt);
  await assert.rejects(writeExternalReceiptAtomic(receipt, { outputRoot: root }), (error) => error.code === "EXTERNAL_RECEIPT_ALREADY_EXISTS");
});

test("pipeline redacts explicit and allowlisted environment secrets from output", async () => {
  const explicit = "pipeline-explicit-secret";
  const environmentSecret = "pipeline-environment-secret";
  const result = await runPipeline({
    operation: "redaction contract",
    left: { executable: process.execPath, args: ["-e", "process.stdout.write(process.env.API_TOKEN + ':' + process.env.SAFE_VALUE)"] },
    right: { executable: process.execPath, args: ["-e", "process.stdin.pipe(process.stdout)"] },
    cwd: process.cwd(),
    allowedEnvironment: { API_TOKEN: environmentSecret, SAFE_VALUE: explicit },
    secretValues: [explicit],
  });
  assert.equal(result.stdout, "[REDACTED]:[REDACTED]");
});

test("pipeline redacts explicit and allowlisted environment secrets from errors", async () => {
  const explicit = "pipeline-explicit-error-secret";
  const environmentSecret = "pipeline-environment-error-secret";
  await assert.rejects(
    runPipeline({
      operation: "redaction error contract",
      left: { executable: process.execPath, args: ["-e", "process.stderr.write(process.env.API_TOKEN + ':' + process.env.SAFE_VALUE);process.exit(2)"] },
      right: { executable: process.execPath, args: ["-e", "process.stdin.resume()"] },
      cwd: process.cwd(),
      allowedEnvironment: { API_TOKEN: environmentSecret, SAFE_VALUE: explicit },
      secretValues: [explicit],
    }),
    (error) => error.stderrSummary === "[REDACTED]:[REDACTED]" && !error.message.includes(explicit) && !error.message.includes(environmentSecret),
  );
});

test("missing external destination prepares tooling but blocks capture execution", async () => {
  let captures = 0;
  const prepared = await runProductionBackup({
    environment: environment(resolve(tmpdir(), "godel-production-prep")),
    dependencies: dependencies(),
    captureAdapter: { captureReadOnly: async () => { captures += 1; } },
  });
  assert.equal(prepared.status, "PREPARED");
  assert.equal(prepared.executionAuthorized, false);
  assert.equal(prepared.executionBlocker, "EXTERNAL_CUSTODY_DESTINATION_PENDING");
  assert.equal(captures, 0);
  assert.equal((await readdir(tmpdir())).includes("definitely-not-created-by-this-test"), false);
});
