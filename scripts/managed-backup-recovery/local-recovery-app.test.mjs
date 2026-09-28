import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import next from "next";

import { verifyRecoveryAppRuntimeAuthority } from "./app-runtime-authority.mjs";
import { accessLocalRecoveryApp, accessLocalRecoveryAppWorkspace, buildLocalRecoveryAppEnvironment, materializeRecoveryAppSource, prepareLocalRecoveryAppWorkspace, startLocalRecoveryApp, stopLocalRecoveryApp, verifyNextProgrammaticDistDirOverride } from "./local-recovery-app.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";

const RUNTIME_SHA = "a".repeat(40);
const TOOLING_SHA = "b".repeat(40);
const PRODUCTION_PACKAGE = `${JSON.stringify({ name: "godel-design", version: "0.1.0", private: true, scripts: { build: "next build" }, dependencies: { next: "16.2.11" }, devDependencies: {} }, null, 2)}\n`;
const TOOLING_PACKAGE = `${JSON.stringify({ name: "godel-design", version: "0.1.0", private: true, scripts: { build: "next build", "ops:recovery:synthetic": "node recovery.mjs" }, dependencies: { next: "16.2.11" }, devDependencies: {} }, null, 2)}\n`;

function verifyAuthority() {
  return verifyRecoveryAppRuntimeAuthority({
    runtimeSha: RUNTIME_SHA,
    toolingSha: TOOLING_SHA,
    repoRoot: process.cwd(),
    execute: async (plan) => {
      if (plan.args[0] === "diff") return { stdout: "", stderr: "" };
      if (plan.args[1] === `${RUNTIME_SHA}:package.json`) return { stdout: PRODUCTION_PACKAGE, stderr: "" };
      if (plan.args[1] === `${TOOLING_SHA}:package.json`) return { stdout: TOOLING_PACKAGE, stderr: "" };
      throw new Error("unexpected authority plan");
    },
  });
}

async function sessionLayout() {
  const root = await mkdtemp(join(tmpdir(), "godel-recovery-app-"));
  const evidence = join(root, "evidence");
  await mkdir(evidence);
  return { root, evidence };
}

function localStatus() {
  return admitLocalSupabaseStatus(JSON.stringify({
    API_URL: "http://127.0.0.1:64321", DB_URL: "postgresql://postgres:db-secret@127.0.0.1:64322/postgres",
    ANON_KEY: "local-anon-key", SERVICE_ROLE_KEY: "local-service-role", STORAGE_S3_URL: "http://127.0.0.1:64321/storage/v1/s3",
    S3_PROTOCOL_ACCESS_KEY_ID: "local-access", S3_PROTOCOL_ACCESS_KEY_SECRET: "local-storage-secret", S3_PROTOCOL_REGION: "local",
  }));
}

test("Next runtime workspace and dist/cache remain entirely inside session evidence", async () => {
  const session = await sessionLayout();
  try {
    const workspace = await prepareLocalRecoveryAppWorkspace({ session, repoRoot: process.cwd() });
    assert.deepEqual(JSON.parse(JSON.stringify(workspace)), { status: "PREPARED", cacheBoundary: "RECOVERY_SESSION_ONLY" });
    accessLocalRecoveryAppWorkspace(workspace, (details) => {
      assert.ok(details.runtimeRoot.startsWith(session.evidence));
      assert.ok(details.projectDir.startsWith(session.evidence));
      assert.ok(details.distDir.startsWith(session.evidence));
      assert.notEqual(details.distDir, join(process.cwd(), ".next"));
      assert.equal(details.relativeDistDir, ".next-recovery");
    });
    assert.equal(verifyNextProgrammaticDistDirOverride({ createNextServer: next, workspace }).status, "SUPPORTED");
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("workspace rejects evidence symlinks and session escapes", async (t) => {
  const session = await sessionLayout();
  const outside = await mkdtemp(join(tmpdir(), "godel-recovery-app-outside-"));
  try {
    await assert.rejects(prepareLocalRecoveryAppWorkspace({ session: { root: session.root, evidence: outside }, repoRoot: process.cwd() }), { code: "RECOVERY_APP_WORKSPACE_INVALID" });
    const link = join(session.root, "evidence-link");
    try { await symlink(outside, link, "junction"); } catch (error) { t.skip(`symlink unavailable: ${error.code}`); return; }
    await assert.rejects(prepareLocalRecoveryAppWorkspace({ session: { root: session.root, evidence: link }, repoRoot: process.cwd() }), { code: "RECOVERY_APP_WORKSPACE_INVALID" });
  } finally {
    await rm(session.root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("application child environment contains only local Supabase public runtime and platform minimum", async () => {
  const session = await sessionLayout();
  try {
    const workspace = await prepareLocalRecoveryAppWorkspace({ session, repoRoot: process.cwd() });
    const environment = buildLocalRecoveryAppEnvironment({ localStatus: localStatus(), workspace, sourceEnvironment: {
      PATH: "safe-path", SUPABASE_SECRET_KEY: "production-secret", SUPABASE_DB_PASSWORD: "db-secret", GODEL_MANAGED_R2_SECRET_ACCESS_KEY: "r2-secret",
      GODEL_MANAGED_RECOVERY_IDENTITY_FILE: "identity", GODEL_MANAGED_RECOVERY_BACKUP_ID: "backup", LOGIN_PASSWORD: "credential",
    } });
    assert.deepEqual(Object.keys(environment).sort(), [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_TELEMETRY_DISABLED", "NODE_ENV", "NODE_PATH", "PATH", "SUPABASE_SERVER_URL", "TEMP", "TMP",
    ].sort());
    assert.equal(environment.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:64321");
    assert.equal(environment.SUPABASE_SERVER_URL, "http://127.0.0.1:64321");
    assert.equal(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "local-anon-key");
    for (const forbidden of ["production-secret", "db-secret", "r2-secret", "identity", "backup", "credential", "local-service-role", "local-storage-secret"]) assert.ok(!JSON.stringify(environment).includes(forbidden));
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("application source materialization copies only Git-governed runtime files into the session", async () => {
  const session = await sessionLayout();
  try {
    const workspace = await prepareLocalRecoveryAppWorkspace({ session, repoRoot: process.cwd() });
    const authority = await verifyAuthority();
    const result = await materializeRecoveryAppSource({ workspace, runtimeAuthority: authority, execute: async (plan) => {
      assert.deepEqual(plan.args.slice(0, 4), ["ls-files", "-z", "--", "src"]);
      assert.ok(!plan.args.includes("package.json"));
      return { stdout: "src/proxy.ts\0next.config.ts\0" };
    } });
    assert.deepEqual(result, { status: "MATERIALIZED", sourceAuthority: "GIT_GOVERNED", packageAuthority: "PRODUCTION_RUNTIME", fileCount: 3 });
    let projectDir;
    accessLocalRecoveryAppWorkspace(workspace, (details) => { projectDir = details.projectDir; });
    assert.ok(projectDir.startsWith(session.evidence));
    assert.match(await readFile(join(projectDir, "src", "proxy.ts"), "utf8"), /updateSession/);
    assert.match(await readFile(join(projectDir, "next.config.ts"), "utf8"), /standalone/);
    const materializedPackage = await readFile(join(projectDir, "package.json"), "utf8");
    assert.equal(materializedPackage, PRODUCTION_PACKAGE);
    assert.ok(!materializedPackage.includes("ops:recovery:synthetic"));
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("application source materialization rejects ungoverned and escaping Git inventory", async () => {
  for (const inventory of ["docs/private.md\0", "../package.json\0", "src/proxy.ts\0src/proxy.ts\0"]) {
    const session = await sessionLayout();
    try {
      const workspace = await prepareLocalRecoveryAppWorkspace({ session, repoRoot: process.cwd() });
      const authority = await verifyAuthority();
      await assert.rejects(materializeRecoveryAppSource({ workspace, runtimeAuthority: authority, execute: async () => ({ stdout: inventory }) }), { code: "RECOVERY_APP_SOURCE_MATERIALIZATION_FAILED" });
    } finally { await rm(session.root, { recursive: true, force: true }); }
  }
});

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.messages = [];
  }

  send(message) {
    this.messages.push(message);
    queueMicrotask(() => {
      if (message.type === "start") this.emit("message", { type: "ready" });
      if (message.type === "stop") { this.exitCode = 0; this.emit("message", { type: "stopped" }); }
    });
  }

  kill() { this.exitCode = 1; this.emit("exit", 1); }
}

test("opaque local app handle binds loopback dynamically and exact cleanup proves the port closed", async () => {
  const session = await sessionLayout();
  const child = new FakeChild();
  let forkOptions;
  try {
    const app = await startLocalRecoveryApp({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65432,
      createNextServer: (options) => ({ options }), materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: (_worker, args, options) => { assert.deepEqual(args, []); forkOptions = options; return child; }, timeoutMs: 1000,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(app)), { status: "RUNNING", locality: "LOCAL_LOOPBACK", cacheBoundary: "RECOVERY_SESSION_ONLY" });
    accessLocalRecoveryApp(app, (details) => {
      assert.equal(details.origin, "http://127.0.0.1:65432");
      assert.equal(details.supabaseOrigin, "http://127.0.0.1:64321");
    });
    assert.equal(forkOptions.env.SUPABASE_SERVER_URL, "http://127.0.0.1:64321");
    assert.equal(await stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async ({ port, host }) => port === 65432 && host === "127.0.0.1" }).then((value) => value.applicationCleanup), "PASS");
    assert.deepEqual(child.messages.map(({ type }) => type), ["start", "stop"]);
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("startup failure stops the exact child and proves the dynamic port closed", async () => {
  const session = await sessionLayout();
  class FailingChild extends FakeChild {
    send(message) {
      this.messages.push(message);
      if (message.type === "start") queueMicrotask(() => this.emit("message", { type: "failure", code: "RECOVERY_APP_START_FAILED" }));
    }
  }
  const child = new FailingChild();
  let probed = false;
  try {
    await assert.rejects(startLocalRecoveryApp({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65430,
      createNextServer: (options) => ({ options }), materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child,
      probeClosed: async ({ port, host }) => { probed = port === 65430 && host === "127.0.0.1"; return true; }, timeoutMs: 1000,
    }), { code: "RECOVERY_APP_START_FAILED" });
    assert.equal(child.exitCode, 1);
    assert.equal(probed, true);
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("unexpected application process exit invalidates the opaque handle", async () => {
  const session = await sessionLayout();
  const child = new FakeChild();
  try {
    const app = await startLocalRecoveryApp({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65429,
      createNextServer: (options) => ({ options }), materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child, timeoutMs: 1000,
    });
    child.exitCode = 1;
    child.emit("exit", 1);
    assert.throws(() => accessLocalRecoveryApp(app, () => undefined), { code: "RECOVERY_APP_PROCESS_FAILED" });
    await stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true });
  } finally { await rm(session.root, { recursive: true, force: true }); }
});
