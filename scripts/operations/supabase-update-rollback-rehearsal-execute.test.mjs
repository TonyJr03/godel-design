import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { assertArchiveStable, assertEnvContinuity, assertPrivateDigestMatch, auditRollbackProjectResidue, capturePrivateFileDigest, compareManagedTreeManifests, createManagedTreeManifest, createRollbackCheckpointEmitter, exactNewArchive, executeHistoricalRollbackRehearsal, finalizeRollbackExecutorOutput, getRollbackInternalJournal, movePreservedDirectory, normalizeArchivePath, parseRollbackExecutorArguments, preserveDbConfig, readArchiveEntries, removeDenoCache, validateArchiveEntries } from "./supabase-update-rollback-rehearsal-execute.mjs";

const execFile = promisify(execFileCallback);

test("CLI requires exactly one safe execution mode", () => {
  assert.throws(() => parseRollbackExecutorArguments([]), /ACKNOWLEDGEMENT_REQUIRED/);
  assert.throws(() => parseRollbackExecutorArguments(["--execute-isolated-historical-rollback-rehearsal", "--pre-runtime-probe"]), /mutually exclusive/);
  assert.throws(() => parseRollbackExecutorArguments(["--unknown"]), /USAGE/);
  assert.equal(parseRollbackExecutorArguments(["--pre-runtime-probe", "--jq", "jq"]).preRuntimeProbe, true);
});

test("managed manifest excludes state and detects stamp or target-only residue", async () => {
  const root = await mkdtemp(join(tmpdir(), "sh044d-manifest-"));
  try {
    await mkdir(join(root, "backups")); await mkdir(join(root, "volumes", "db", "data"), { recursive: true }); await mkdir(join(root, "volumes", "storage"), { recursive: true });
    await writeFile(join(root, "docker-compose.yml"), "base"); await writeFile(join(root, ".env"), "secret"); await writeFile(join(root, "backups", "old"), "ignored"); await writeFile(join(root, "volumes", "db", "data", "db"), "ignored"); await writeFile(join(root, "volumes", "storage", "object"), "ignored");
    const base = await createManagedTreeManifest(root); assert.deepEqual(base.map((entry) => entry.path), ["docker-compose.yml"]);
    await writeFile(join(root, ".supabase-version"), "target"); assert.equal(compareManagedTreeManifests(base, await createManagedTreeManifest(root)).status, "MISMATCH");
    await rm(join(root, ".supabase-version")); await writeFile(join(root, "docker-compose.kong.yml"), "target-only"); assert.equal(compareManagedTreeManifests(base, await createManagedTreeManifest(root)).status, "MISMATCH");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("environment continuity compares privately", async () => {
  const root = await mkdtemp(join(tmpdir(), "sh044d-env-"));
  try { const a = join(root, "a"), b = join(root, "b"); await writeFile(a, "synthetic-secret"); await writeFile(b, "synthetic-secret"); assert.equal(await assertEnvContinuity(a, b), "MATCH"); await writeFile(b, "synthetic-secret!"); await assert.rejects(() => assertEnvContinuity(a, b), /ENV_CONTINUITY_MISMATCH/); } finally { await rm(root, { recursive: true, force: true }); }
});

test("immutable BASE environment digest survives target-only env mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "sh044d-env-snapshot-"));
  try {
    const base = join(root, "base.env"), mutable = join(root, "runtime.env"), restored = join(root, "restored.env");
    await writeFile(base, "JWT_SECRET=synthetic\n"); await writeFile(mutable, "JWT_SECRET=synthetic\n");
    const digest = await capturePrivateFileDigest(base); await writeFile(mutable, "JWT_SECRET=synthetic\nAPI_GW_HTTP_PORT=8000\n");
    await assert.rejects(() => assertEnvContinuity(mutable, restored), /ENOENT/); await assert.rejects(() => assertPrivateDigestMatch(digest, mutable), /ENV_CONTINUITY_MISMATCH/);
    await writeFile(restored, "JWT_SECRET=synthetic\n"); assert.equal(await assertPrivateDigestMatch(digest, restored), "MATCH");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("archive validation rejects unsafe entries and enforces the historical contract", async () => {
  const destination = join(tmpdir(), "sh044d-archive-destination");
  const valid = [{ type: "directory", name: "./" }, { type: "directory", name: "./volumes/" }, { type: "directory", name: "./volumes/api/" }, { type: "directory", name: "./volumes/db/" }, { type: "file", name: "./.env" }, { type: "file", name: "./docker-compose.yml" }, { type: "file", name: "./volumes/api/kong.yml" }];
  assert.equal(validateArchiveEntries(valid, destination), "PASS");
  for (const name of ["/absolute/path", "C:/absolute/path", "../escape", "nested/../../escape", "nested\\..\\escape", "backups/payload", "volumes/db/data/payload", "volumes/storage/payload", ".supabase-version"]) assert.throws(() => validateArchiveEntries([{ type: "file", name: ".env" }, { type: "file", name }], destination));
  assert.throws(() => validateArchiveEntries([{ type: "file", name: ".env" }, { type: "file", name: ".env" }], destination), /DUPLICATE|ENV/);
  assert.throws(() => validateArchiveEntries([{ type: "symlink", name: ".env" }], destination), /TYPE/);
  assert.throws(() => normalizeArchivePath("..\\escape", destination), /ARCHIVE_PATH_REJECTED/);
});

test("real local tar listing accepts ordinary directory entries when Git shell is available", async (context) => {
  const shell = "C:\\Program Files\\Git\\bin\\sh.exe"; try { await readFile(shell); } catch { context.skip("Git shell unavailable"); return; }
  const root = await mkdtemp(join(tmpdir(), "sh044d-real-tar-"));
  try {
    const archive = join(root, "archive.tgz"), source = join(root, "source"); await mkdir(join(source, "volumes", "api"), { recursive: true }); await writeFile(join(source, ".env"), "synthetic\n"); await writeFile(join(source, "docker-compose.yml"), "services: {}\n"); await writeFile(join(source, "volumes", "api", "kong.yml"), "_format_version: '1.0'\n");
    await execFile(shell, ["-lc", 'tar czf "$(cygpath -u "$1")" .', "sh", archive], { cwd: source }); const entries = await readArchiveEntries({ archive, shell: { path: shell, directory: "C:\\Program Files\\Git\\bin" }, run: execFile }); assert.equal(validateArchiveEntries(entries, join(root, "restore")), "PASS");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("archive identity changes fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "sh044d-archive-"));
  try { const archive = join(root, "pre-update-test.tgz"); await writeFile(archive, "one"); const digest = (await import("node:crypto")).createHash("sha256").update(await readFile(archive)).digest("hex"); assert.equal(await assertArchiveStable(archive, digest), "STABLE"); await writeFile(archive, "two"); await assert.rejects(() => assertArchiveStable(archive, digest), /ARCHIVE_IDENTITY_CHANGED/); } finally { await rm(root, { recursive: true, force: true }); }
});

test("new archive must be a non-symlink regular file", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "sh044d-archive-identity-"));
  try { const backups = join(root, "backups"); await mkdir(backups); await writeFile(join(backups, "pre-update-ok.tgz"), "x"); assert.match(await exactNewArchive(root, []), /pre-update-ok\.tgz$/); await rm(join(backups, "pre-update-ok.tgz")); await writeFile(join(backups, "target"), "x"); try { await symlink(join(backups, "target"), join(backups, "pre-update-link.tgz")); } catch (error) { if (error.code === "EPERM") { context.skip("symlink creation requires host privilege"); return; } throw error; } await assert.rejects(() => exactNewArchive(root, []), /PRE_UPDATE_ARCHIVE_IDENTITY_INVALID/); } finally { await rm(root, { recursive: true, force: true }); }
});

test("persistent data uses rename only and rejects existing or symlink sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "sh044d-move-"));
  try {
    const source = join(root, "source"), destination = join(root, "target", "data"); await mkdir(source); await writeFile(join(source, "value"), "x"); assert.equal(await movePreservedDirectory({ workspace: root, source, destination }), "RENAMED");
    await mkdir(join(root, "again")); await mkdir(join(root, "taken")); await assert.rejects(() => movePreservedDirectory({ workspace: root, source: join(root, "again"), destination: join(root, "taken") }), /DESTINATION_EXISTS/);
    await symlink(destination, join(root, "link"), "junction"); await assert.rejects(() => movePreservedDirectory({ workspace: root, source: join(root, "link"), destination: join(root, "other") }), /SOURCE_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("no acknowledgement returns before Docker mutation", async () => {
  const result = await executeHistoricalRollbackRehearsal({}); assert.equal(result.executorResult, "ACKNOWLEDGEMENT_REQUIRED"); assert.equal(result.dockerMutationAttempted, false);
});

const rollbackProject = "godel-sh044c-rehearsal-abcdef123456";
const rollbackFixture = { fingerprint: { database: { status: "PASS", rowIdentifier: "row-1", rowDigest: "a".repeat(64) }, auth: { user: "PASS", userIdentifier: "user-1", session: "PASS" }, storage: { status: "PASS", size: 12, sha256: "b".repeat(64) }, gateway: { loopback: "PASS", internalKong: "PASS" } }, privateContext: { password: "SENTINEL_PASSWORD", token: "SENTINEL_TOKEN" } };
const rollbackBaseCompose = "services:\n  db:\n    image: postgres:test\n  auth:\n    image: auth:test\n  rest:\n    image: rest:test\n  storage:\n    image: storage:test\n  kong:\n    image: kong/kong:3.9.3\n";
const rollbackTargetCompose = "services:\n  db:\n    image: postgres:test\n  auth:\n    image: auth:test\n  rest:\n    image: rest:test\n  storage:\n    image: storage:test\n  api-gw:\n    image: envoyproxy/envoy:v1.39.0\n";

function rollbackModel({ target, workspace }) {
  const gateway = target ? "api-gw" : "kong";
  return { services: Object.fromEntries(["db", "auth", "rest", "storage", gateway].map((service) => [service, { image: service === "kong" ? "kong/kong:3.9.3" : service === "api-gw" ? "envoyproxy/envoy:v1.39.0" : `${service}:test`, healthcheck: { test: ["CMD", "true"] }, container_name: `${rollbackProject}-${service}`, ports: service === gateway ? [{ host_ip: "127.0.0.1", published: "18080", target: 8000 }] : [], networks: { default: {} }, volumes: service === "db" ? [{ type: "bind", source: workspace, target: "/var/lib/postgresql/data" }] : [] }])), networks: { default: {} } };
}

async function materializeRollbackSource({ destination, tag }) {
  await mkdir(join(destination, "volumes", "db", "data"), { recursive: true }); await mkdir(join(destination, "volumes", "storage"), { recursive: true }); await mkdir(join(destination, "backups"), { recursive: true });
  await writeFile(join(destination, "docker-compose.yml"), tag === "self-hosted/v0.8.0" ? rollbackTargetCompose : rollbackBaseCompose);
  await writeFile(join(destination, ".env.example"), "JWT_SECRET=\nPOSTGRES_PASSWORD=\nANON_KEY=\nSERVICE_ROLE_KEY=\n"); await writeFile(join(destination, "update.sh"), "#!/bin/sh\n");
}

function rollbackExecutorOptions(overrides = {}) {
  const calls = [], checkpoints = [], validations = [], inventory = ["production-supabase-db"];
  let phase = "BASE", fingerprintCalls = 0, validationCalls = 0, workspacePath;
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args.some((value) => String(value).endsWith("update.sh"))) {
      const runtime = dirname(args[0]); await writeFile(join(runtime, "docker-compose.yml"), rollbackTargetCompose); await writeFile(join(runtime, ".supabase-version"), "ref=self-hosted/v0.8.0\n"); await writeFile(join(runtime, "backups", "pre-update-test.tgz"), "synthetic archive"); return { stdout: "Update applied. Summary:\nupdated:          1\nnew:              0\nmerged (clean):   0\nCONFLICTS:        0\nmerge failures:   0\nremoved upstream: 0\nenv keys added:   0\n" };
    }
    if (args.includes("up")) { phase = args.some((value) => String(value).includes("target.override")) ? "TARGET" : args.some((value) => String(value).includes("rollback-base.override")) ? "ROLLBACK" : "BASE"; calls.push({ semantic: `${phase}_START` }); }
    if (args.includes("stop")) calls.push({ semantic: `${phase}_STOP` });
    if (args.includes("down")) calls.push({ semantic: "CLEANUP" });
    return { stdout: "" };
  };
  const fingerprint = async () => ({ containers: [], supabaseProject: "supabase", godelProject: "godel-production", supabaseContainerCount: 5, godelContainerCount: 3, d5: "CURRENT_MATCH", godel: "LIVE_READY", sequence: ++fingerprintCalls });
  return {
    acknowledged: true, jqBin: process.execPath, generation: "abcdef123456", run, materializeSnapshot: materializeRollbackSource,
    resolveExactTag: async ({ tag, expectedCommit }) => ({ tag, commit: expectedCommit }), resolveJq: async () => ({ status: "JQ_AVAILABLE", path: process.execPath, directory: dirname(process.execPath) }), resolveShell: async () => ({ status: "SH_AVAILABLE", path: process.execPath, directory: dirname(process.execPath) }), portProbe: async () => true,
    renderCompose: async (invocation) => rollbackModel({ target: invocation.args.some((value) => String(value).includes("target.override")), workspace: invocation.cwd }), validateEffectiveCompose: (input) => { validations.push(input.productionContainers); return { status: "PASS" }; }, listProductionContainers: async () => inventory,
    inspectImages: async () => ({ status: "ALL_IMAGES_PRESENT" }), productionFingerprint: fingerprint, waitForRequiredServices: async ({ phase: value }) => { calls.push({ semantic: `${value}_HEALTHY` }); }, waitForRuntime: async () => {}, inspectRuntimeGateway: async () => [{ project: rollbackProject, service: phase === "TARGET" ? "api-gw" : "kong", image: phase === "TARGET" ? "envoyproxy/envoy:v1.39.0" : "kong/kong:3.9.3", state: "running" }],
    createFixtures: async () => { calls.push({ semantic: "FIXTURE_CREATE" }); return rollbackFixture; }, validateFixtures: async () => { validationCalls += 1; calls.push({ semantic: `FIXTURE_VALIDATE_${validationCalls}` }); return rollbackFixture.fingerprint; }, preserveDbConfig: async () => { calls.push({ semantic: "DB_CONFIG" }); return "PRESERVED"; }, removeDenoCache: async () => { calls.push({ semantic: "DENO_CACHE" }); return "RECREATED"; }, listArchiveEntries: async () => [{ type: "directory", name: "./" }, { type: "file", name: "./.env" }, { type: "file", name: "./docker-compose.yml" }, { type: "file", name: "./update.sh" }],
    extractArchive: async ({ destination }) => { await mkdir(destination, { recursive: true }); await writeFile(join(destination, "docker-compose.yml"), rollbackBaseCompose); await writeFile(join(destination, ".env.example"), "JWT_SECRET=\nPOSTGRES_PASSWORD=\nANON_KEY=\nSERVICE_ROLE_KEY=\n"); await writeFile(join(destination, "update.sh"), "#!/bin/sh\n"); await cp(join(workspacePath, "runtime", ".env"), join(destination, ".env")); }, assertArchiveStable: async () => "STABLE", auditProjectResidue: async () => ({ containers: [], networks: [], volumes: [] }), fallbackProjectCleanup: async () => { calls.push({ semantic: "FALLBACK" }); },
    createWorkspace: async () => { workspacePath = await mkdtemp(join(tmpdir(), "sh044d-synthetic-")); return workspacePath; }, createCheckpointEmitter: async () => ({ journal: join(tmpdir(), "sh044d-synthetic-journal"), emit: async (phaseName) => { checkpoints.push(phaseName); } }), __calls: calls, __checkpoints: checkpoints, __validations: validations, __inventory: inventory, __validationCalls: () => validationCalls, ...overrides,
  };
}

test("pre-runtime orchestration exposes safe scope and reuses the production inventory", async () => {
  const options = rollbackExecutorOptions({ preRuntimeProbe: true, acknowledged: false });
  const result = await executeHistoricalRollbackRehearsal(options);
  assert.equal(result.executorResult, "PRE_RUNTIME_PASS"); assert.equal(result.dockerMutationAttempted, false); assert.deepEqual(result.productionBefore, { d5: "CURRENT_MATCH", godel: "LIVE_READY" }); assert.deepEqual(result.productionScope, { supabaseProject: "supabase", godelProject: "godel-production", supabaseContainerCount: 5, godelContainerCount: 3 }); assert.equal(options.__validations.length, 2); assert.equal(options.__validations.every((value) => value === options.__inventory), true); assert.equal(options.__calls.some((call) => call.args?.includes("up") || call.args?.some((value) => String(value).endsWith("update.sh"))), false); assert.ok(options.__checkpoints.indexOf("PRE_RUNTIME_READY") < options.__checkpoints.indexOf("CLEANUP_BEGIN") && options.__checkpoints.indexOf("CLEANUP_BEGIN") < options.__checkpoints.indexOf("CLEANUP_PASS"));
});

test("synthetic R2 flow proves ordering, safe evidence, one-way update, and zero-residue cleanup", async () => {
  const options = rollbackExecutorOptions();
  const result = await executeHistoricalRollbackRehearsal(options); const semantic = options.__calls.filter((call) => call.semantic).map((call) => call.semantic);
  assert.equal(result.executorResult, "ROLLBACK_R2_PASS", result.blockedBy); assert.equal(result.rollbackClassification, "R2_PROVEN"); assert.deepEqual(result.fixtureA, { baseCreated: "PASS", targetValidated: "PASS", rollbackValidated: "PASS" }); assert.deepEqual(result.fixtureB, { targetCreated: "PASS", rollbackValidated: "PASS" }); assert.equal(result.productionTarget, "UNCHANGED"); assert.equal(result.productionRollback, "UNCHANGED"); assert.deepEqual(result.cleanupAudit, { containers: 0, networks: 0, volumes: 0 }); assert.equal(options.__validations.length, 4); assert.equal(options.__validations.every((value) => value === options.__inventory), true);
  const ordered = ["BASE_START_BEGIN", "BASE_REQUIRED_SERVICES_PASS", "BASE_GATEWAY_IDENTITY_PASS", "BASE_A_FIXTURES_PASS", "BASE_STOP_PASS", "FORWARD_UPDATE_BEGIN", "FORWARD_UPDATE_PASS", "TARGET_START_BEGIN", "TARGET_REQUIRED_SERVICES_PASS", "TARGET_GATEWAY_IDENTITY_PASS", "TARGET_A_FIXTURES_PASS", "TARGET_B_FIXTURES_PASS", "PRODUCTION_TARGET_PHASE_UNCHANGED", "TARGET_STOP_PASS", "PERSISTENT_DATA_PRESERVED", "ARCHIVE_VALIDATION_PASS", "BASE_CONFIG_FINGERPRINT_MATCH", "ROLLBACK_START_BEGIN", "ROLLBACK_REQUIRED_SERVICES_PASS", "ROLLBACK_GATEWAY_IDENTITY_PASS", "ROLLBACK_A_FIXTURES_PASS", "ROLLBACK_B_FIXTURES_PASS", "PRODUCTION_ROLLBACK_PHASE_UNCHANGED", "EXECUTOR_COMPLETE", "CLEANUP_BEGIN", "CLEANUP_PASS"];
  assert.equal(ordered.every((phaseName, index) => index === 0 || options.__checkpoints.indexOf(ordered[index - 1]) < options.__checkpoints.indexOf(phaseName)), true); assert.ok(semantic.includes("DB_CONFIG") && semantic.includes("DENO_CACHE") && semantic.includes("CLEANUP"));
  const updates = options.__calls.filter((call) => call.args?.some((value) => String(value).endsWith("update.sh"))); assert.equal(updates.length, 1); assert.equal(updates[0].args.includes("--from") && updates[0].args.includes("self-hosted/v0.7.2") && updates[0].args.includes("--to") && updates[0].args.includes("self-hosted/v0.8.0") && updates[0].args.includes("--yes"), true); assert.doesNotMatch(JSON.stringify(result) + options.__checkpoints.join("\n"), /SENTINEL_(PASSWORD|TOKEN)|JWT_SECRET|SERVICE_ROLE_KEY/);
});

test("fixture B rollback failure, target interference, and rollback interference fail closed with cleanup", async () => {
  let bValidationCalls = 0; const bFailure = rollbackExecutorOptions({ validateFixtures: async () => ++bValidationCalls === 3 ? { ...rollbackFixture.fingerprint, database: { ...rollbackFixture.fingerprint.database, rowDigest: "c".repeat(64) } } : rollbackFixture.fingerprint });
  const bResult = await executeHistoricalRollbackRehearsal(bFailure); assert.equal(bResult.executorResult, "FAIL"); assert.equal(bResult.rollbackClassification, "R2_NOT_PROVEN"); assert.equal(bResult.fixtureB?.targetCreated, "PASS"); assert.equal(bResult.fixtureB?.rollbackValidated, undefined); assert.equal(bFailure.__checkpoints.includes("ROLLBACK_A_FIXTURES_PASS"), true); assert.equal(bFailure.__checkpoints.includes("ROLLBACK_B_FIXTURES_PASS"), false); assert.equal(bResult.cleanup, "CLEANUP_PASS");
  let targetCall = 0; const targetInterference = rollbackExecutorOptions({ productionFingerprint: async () => ({ containers: [], supabaseProject: "supabase", godelProject: "godel-production", supabaseContainerCount: 1, godelContainerCount: 1, d5: targetCall++ === 1 ? "CHANGED" : "CURRENT_MATCH", godel: "LIVE_READY" }) });
  const targetResult = await executeHistoricalRollbackRehearsal(targetInterference); assert.equal(targetResult.executorResult, "FAIL"); assert.equal(targetInterference.__checkpoints.includes("ROLLBACK_START_BEGIN"), false); assert.equal(targetInterference.__checkpoints.includes("PERSISTENT_DATA_PRESERVED"), false);
  let rollbackCall = 0; const rollbackInterference = rollbackExecutorOptions({ productionFingerprint: async () => ({ containers: [], supabaseProject: "supabase", godelProject: "godel-production", supabaseContainerCount: 1, godelContainerCount: 1, d5: rollbackCall++ === 2 ? "CHANGED" : "CURRENT_MATCH", godel: "LIVE_READY" }) });
  const rollbackResult = await executeHistoricalRollbackRehearsal(rollbackInterference); assert.equal(rollbackResult.executorResult, "FAIL"); assert.equal(rollbackResult.rollbackClassification, "R2_NOT_PROVEN");
});

test("cleanup audits exact project residue, retries fallback, and remains truthful when dirty", async () => {
  let audits = 0, fallback = 0; const recovered = rollbackExecutorOptions({ auditProjectResidue: async () => ++audits === 1 ? { containers: ["id"], networks: [], volumes: [] } : { containers: [], networks: [], volumes: [] }, fallbackProjectCleanup: async () => { fallback += 1; } });
  const recoveredResult = await executeHistoricalRollbackRehearsal(recovered); assert.equal(recoveredResult.executorResult, "ROLLBACK_R2_PASS"); assert.equal(fallback, 1); assert.equal(audits, 2);
  const dirty = rollbackExecutorOptions({ auditProjectResidue: async () => ({ containers: ["id"], networks: [], volumes: [] }) }); const dirtyResult = await executeHistoricalRollbackRehearsal(dirty); assert.equal(dirtyResult.executorResult, "FAIL"); assert.equal(dirtyResult.rollbackClassification, "R2_NOT_PROVEN"); assert.equal(dirtyResult.cleanup, "CLEANUP_FAIL"); assert.match(dirtyResult.blockedBy, /CLEANUP_RESIDUE_REMAINS/);
});

test("failure after rename-only data staging fails closed without beginning rollback or restoring staged data", async () => {
  let moves = 0; const options = rollbackExecutorOptions({ moveDirectory: async (input) => { moves += 1; if (moves === 2) throw new Error("STAGING_FAILURE"); return movePreservedDirectory(input); } });
  const result = await executeHistoricalRollbackRehearsal(options); assert.equal(result.executorResult, "FAIL"); assert.equal(result.rollbackClassification, "R2_NOT_PROVEN"); assert.equal(options.__checkpoints.includes("PERSISTENT_DATA_PRESERVED"), false); assert.equal(options.__checkpoints.includes("ROLLBACK_START_BEGIN"), false); assert.equal(result.cleanup, "CLEANUP_PASS"); assert.equal(options.__calls.some((call) => call.semantic === "CLEANUP"), true);
});

test("journal finalization writes before removing only the exact successful journal", async () => {
  const emitter = await createRollbackCheckpointEmitter({ generation: "abcdefabcdef", sink: () => {} }); await emitter.emit("FINAL_RESULT_READY", "ROLLBACK_R2_PASS"); const result = { executorResult: "ROLLBACK_R2_PASS" }; Object.defineProperty(result, Object.getOwnPropertySymbols({})[0] ?? Symbol("unused"), { value: undefined });
  const journalled = await executeHistoricalRollbackRehearsal(rollbackExecutorOptions({ preRuntimeProbe: true, acknowledged: false, generation: "abcdefabcdef", createCheckpointEmitter: async () => emitter })); const metadata = getRollbackInternalJournal(journalled); assert.equal((await readFile(metadata.journal, "utf8")).includes("FINAL_RESULT_READY"), true);
  const order = []; const finalization = await finalizeRollbackExecutorOutput({ result: journalled, write: async () => { order.push("WRITE_FINAL_JSON"); }, remove: async (path) => { assert.equal(path, metadata.journal); order.push("REMOVE_EXACT_SUCCESS_JOURNAL"); } }); assert.equal(finalization.journalCleanup, "REMOVED"); assert.deepEqual(order, ["WRITE_FINAL_JSON", "REMOVE_EXACT_SUCCESS_JOURNAL"]);
  assert.equal((await finalizeRollbackExecutorOutput({ result: journalled, write: async () => { throw new Error("stdout failed"); }, remove: async () => { throw new Error("must not remove"); } })).journalCleanup, "RETAINED");
  assert.equal((await finalizeRollbackExecutorOutput({ result: { executorResult: "FAIL" }, write: async () => {}, remove: async () => { throw new Error("must not remove"); } })).journalCleanup, "RETAINED");
  assert.equal((await finalizeRollbackExecutorOutput({ result: { executorResult: "ROLLBACK_R2_PASS" }, write: async () => {}, remove: async () => { throw new Error("must not remove"); }, getJournal: () => ({ generation: "abcdefabcdef", journal: join(tmpdir(), "wrong.jsonl") }) })).journalCleanup, "RETAINED");
  await rm(metadata.journal, { force: true });
});

test("db-config preservation, deno-cache removal, and exact residue audit reject wrong identities", async () => {
  const project = rollbackProject, calls = []; const run = async (command, args) => { calls.push({ command, args }); if (args[1] === "inspect") return { stdout: `${args.at(-1)}|${project}\n` }; return { stdout: "" }; };
  assert.equal(await preserveDbConfig({ project, run }), "PRESERVED"); assert.equal(await removeDenoCache({ project, run }), "RECREATED"); assert.equal(calls.find((call) => call.args[1] === "rm").args.at(-1), `${project}-deno-cache`); await assert.rejects(() => preserveDbConfig({ project, run: async () => ({ stdout: "wrong|wrong\n" }) }), /DB_CONFIG_VOLUME_IDENTITY_INVALID/); await assert.rejects(() => removeDenoCache({ project, run: async () => ({ stdout: "wrong|wrong\n" }) }), /DENO_CACHE_VOLUME_IDENTITY_INVALID/);
  const auditCalls = []; await auditRollbackProjectResidue({ project, run: async (command, args) => { auditCalls.push({ command, args }); return { stdout: "" }; } }); assert.equal(auditCalls.length, 3); assert.equal(auditCalls.every((call) => call.args.includes(`label=com.docker.compose.project=${project}`)), true);
});

test("secret-shaped errors are redacted from result and checkpoint evidence", async () => {
  const checkpoints = []; const options = rollbackExecutorOptions({ productionFingerprint: async () => { throw new Error("JWT_SECRET=SENTINEL_SECRET C:\\private\\jq.exe"); }, createCheckpointEmitter: async () => ({ journal: join(tmpdir(), "sh044d-secret-journal"), emit: async (_phase, _status, detail) => { checkpoints.push(detail); } }) });
  const result = await executeHistoricalRollbackRehearsal(options); const exposed = JSON.stringify(result) + JSON.stringify(checkpoints); assert.equal(result.executorResult, "FAIL"); assert.doesNotMatch(exposed, /SENTINEL_SECRET|private\\jq\.exe|JWT_SECRET/);
});
