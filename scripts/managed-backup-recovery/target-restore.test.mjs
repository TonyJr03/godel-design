import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { MANAGED_BASELINE_MIGRATIONS } from "./runtime-authority.mjs";
import { buildMutableTablePlan } from "./restore-planning.mjs";
import { parseLocalStorageInventory } from "./local-storage.mjs";
import { parsePostRestoreValidationOutputs } from "./restore-validation.mjs";
import { admitManagedDataSql } from "./sql-admission.mjs";
import { admitPreparedRecoveryTargetRuntime, buildManagedRestorePlan, prepareManagedRecoveryTarget, validateManagedRestoreResult } from "./target-restore.mjs";

const SHA = "f".repeat(40);
const PROJECT = "godel-m53-restore-012345abcdef";
const VERSIONS = MANAGED_BASELINE_MIGRATIONS.map((name) => name.slice(0, 14));
const SCHEMA = ["CREATE SCHEMA public;", "CREATE SCHEMA private;", "CREATE SCHEMA auth;", "CREATE SCHEMA storage;", "CREATE EXTENSION pgcrypto;", "CREATE TABLE public.p (id int);", "CREATE TABLE private.p (id int);", "CREATE TABLE auth.users (id uuid);", "CREATE TABLE storage.objects (id uuid);"].join("\n");
const HISTORY_SCHEMA = "CREATE TABLE supabase_migrations.schema_migrations (version text);\n";
const HISTORY_DATA = `COPY supabase_migrations.schema_migrations (version) FROM stdin;\n${VERSIONS.join("\n")}\n\\.\n`;

async function write(root, pathname, content) {
  const target = join(root, ...pathname.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

test("target/restore orchestration prepares only local artifacts and builds an ordered synthetic restore plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-target-orchestration-"));
  const targetPath = join(root, "target");
  const bundleRoot = join(root, "bundle");
  await mkdir(targetPath);
  await mkdir(bundleRoot);
  try {
    const config = await readFile(new URL("../../supabase/config.toml", import.meta.url), "utf8");
    const executeGit = async (plan) => {
      if (plan.args[0] === "ls-tree") return { stdout: `${MANAGED_BASELINE_MIGRATIONS.join("\0")}\0` };
      if (plan.args[0] === "show" && plan.args[1].endsWith("config.toml")) return { stdout: config };
      if (plan.args[0] === "show") return { stdout: `-- ${plan.args[1]}\n` };
      return { stdout: "" };
    };
    let nextPort = 63000;
    const prepared = await prepareManagedRecoveryTarget({
      session: { root, target: targetPath }, manifest: { status: "COMPLETE", productionRuntimeSha: SHA }, repoRoot: process.cwd(), environment: {}, executeGit, probePort: async () => ++nextPort, projectId: PROJECT,
    });
    assert.equal(prepared.status, "PREPARED");
    assert.equal(prepared.realTargetStarts, 0);
    assert.equal(prepared.targetMutations, 0);
    assert.equal(prepared.sqlExecutions, 0);

    const dataSql = [
      "COPY auth.users (id, encrypted_password) FROM stdin;", "user\thash", "\\.",
      "COPY auth.identities (id, user_id) FROM stdin;", "identity\tuser", "\\.",
      "COPY auth.sessions (id) FROM stdin;", "session", "\\.",
      "COPY public.perfiles (id) FROM stdin;", "user", "\\.", "",
    ].join("\n");
    await write(bundleRoot, "database/roles.sql", "CREATE ROLE authenticator;\n");
    await write(bundleRoot, "database/managed-schema.sql", SCHEMA);
    await write(bundleRoot, "database/migration-history-schema.sql", HISTORY_SCHEMA);
    await write(bundleRoot, "database/migration-history-data.sql", HISTORY_DATA);
    await write(bundleRoot, "storage/durable-inventory.json", `${JSON.stringify({ schemaVersion: 1, bucket: "godel-files", items: [], archivos: [], storageObjects: [], capturedObjects: [] })}\n`);
    await write(bundleRoot, "internal-manifest.json", `${JSON.stringify({ databaseCounts: { tables: [
      { schema: "auth", name: "identities", rowCount: 1 },
      { schema: "auth", name: "sessions", rowCount: 1 },
      { schema: "auth", name: "users", rowCount: 1 },
      { schema: "public", name: "perfiles", rowCount: 1 },
    ] } })}\n`);
    const plan = await buildManagedRestorePlan({
      verifiedSource: { bundleRoot, sql: { managedData: admitManagedDataSql(dataSql) } },
      authority: prepared.authority,
      targetState: { migrationVersions: VERSIONS, schemas: ["public", "private", "auth", "storage"], extensions: ["pgcrypto"], bucket: { id: "godel-files", public: false } },
      targetTables: ["auth.users", "auth.identities", "auth.sessions", "auth.schema_migrations", "storage.buckets", "storage.objects", "storage.migrations", "public.perfiles"],
    });
    assert.equal(plan.status, "READY");
    assert.equal(plan.sanitized.ephemeralAuthState, "SANITIZED");
    assert.equal(plan.storage.status, "VALIDATED_NO_OP");
    assert.deepEqual(plan.order, ["DB_DATA_RESTORE", "STORAGE_METADATA_GATE", "STORAGE_BYTE_RESTORE", "POST_RESTORE_VALIDATION"]);
    assert.equal(plan.loginGate.status, "NOT_EXECUTED");
    assert.equal(plan.sqlExecutions, 0);

    const rawStatusOutput = JSON.stringify({
      API_URL: "http://127.0.0.1:63001", DB_URL: "postgresql://postgres:local-secret@127.0.0.1:63002/postgres",
      ANON_KEY: "local-anon-secret", SERVICE_ROLE_KEY: "local-role-secret", STORAGE_S3_URL: "http://localhost:63001/storage/v1/s3",
      S3_PROTOCOL_ACCESS_KEY_ID: "local-access-secret", S3_PROTOCOL_ACCESS_KEY_SECRET: "local-key-secret", S3_PROTOCOL_REGION: "local",
    });
    const rawDockerOutput = `${JSON.stringify({
      ID: "0123456789ab", Image: "public.ecr.aws/supabase/postgres:17", Names: `supabase_db_${PROJECT}`, State: "running", Status: "Up 10 seconds (healthy)",
      Labels: `com.docker.compose.service=db,com.supabase.cli.project=${PROJECT}`,
    })}\n`;
    const runtime = admitPreparedRecoveryTargetRuntime({ prepared, session: { target: targetPath }, manifest: { productionRuntimeSha: SHA }, rawStatusOutput, rawDockerOutput, productionProjectRef: "production-project", environment: {} });
    assert.equal(runtime.status, "ADMITTED");
    assert.doesNotMatch(JSON.stringify(runtime), /local-secret|63001|63002/);

    const storageInventory = parseLocalStorageInventory({ rawOutput: "[]", storageExpectation: plan.expectations.storage });
    const outputs = {
      tableCounts: ["1\n", "1\n", "1\n"], migrationHistory: `${VERSIONS.join("\n")}\n`, replicationRole: "origin\n",
      auth: JSON.stringify({ ...plan.expectations.auth, relationshipsValid: true, ephemeralStateAbsent: true }),
      constraints: JSON.stringify({ invalidConstraintCount: 0, disabledTriggerCount: 0, privateAuditTableCount: 2 }),
      storageMetadata: JSON.stringify({ bucketExists: true, bucketPublic: false, objectCount: 0, unexpectedObjectCount: 0 }), storageInventory,
    };
    const actual = parsePostRestoreValidationOutputs({ plan: plan.validations, outputs });
    assert.equal(validateManagedRestoreResult({ expected: plan.expectations, actual }).status, "PASS");

    for (const identity of ["auth.schema_migrations", "storage.migrations"]) {
      const forbidden = admitManagedDataSql(`COPY ${identity} (version) FROM stdin;\n1\n\\.\n`);
      assert.throws(() => buildMutableTablePlan({ admission: forbidden, targetTables: [identity] }), { code: "RECOVERY_MUTABLE_TABLE_FORBIDDEN" });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
