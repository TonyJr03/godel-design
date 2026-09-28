import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, posix, win32 } from "node:path";
import test from "node:test";

import { verifyRecoveryAppRuntimeAuthority } from "./app-runtime-authority.mjs";
import {
  resolveLocalApplicationRecoveryParent,
  verifyLocalRecoveryAppVolumeTopology,
  verifyPhysicalLocalRecoveryNextVolumeTopology,
  verifyResolvedLocalRecoveryNextVolumeTopology,
} from "./application-runtime-topology.mjs";
import {
  accessLocalRecoveryApp,
  accessLocalRecoveryAppWorkspace,
  buildLocalRecoveryNextOptions,
  buildLocalRecoveryAppEnvironment,
  classifyLocalRecoveryAppRuntimeDiagnostic,
  classifyLocalRecoveryAppRuntimeDiagnosticSince,
  createLocalRecoveryAppDiagnosticCheckpoint,
  materializeRecoveryAppSource,
  mountLocalRecoveryAppDependencies,
  prepareLocalRecoveryAppWorkspace,
  startLocalRecoveryApp as startLocalRecoveryAppRuntime,
  settleLocalRecoveryAppDiagnostics,
  stopLocalRecoveryApp,
  unmountLocalRecoveryAppDependencies,
  verifyLocalRecoveryAppDistDirBoundary,
  verifyLocalRecoveryAppDependencyTopology,
  verifyLocalRecoveryAppGeneratedRuntime,
} from "./local-recovery-app.mjs";
import { cleanupRecoverySession, createRecoverySession } from "./recovery-contract.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";
import { TEST_SESSION_ID } from "./test-helpers.mjs";

const RUNTIME_SHA = "a".repeat(40);
const TOOLING_SHA = "b".repeat(40);
const PRODUCTION_PACKAGE = `${JSON.stringify({ name: "godel-design", version: "0.1.0", private: true, scripts: { build: "next build" }, dependencies: { next: "16.2.11", react: "19.0.0" }, devDependencies: { "declared-tool": "1.0.0" } }, null, 2)}\n`;
const TOOLING_PACKAGE = `${JSON.stringify({ name: "godel-design", version: "0.1.0", private: true, scripts: { build: "next build", "ops:recovery:synthetic": "node recovery.mjs" }, dependencies: { next: "16.2.11", react: "19.0.0" }, devDependencies: { "declared-tool": "1.0.0" } }, null, 2)}\n`;

function syntheticDependencyLifecycle(events = []) {
  const handle = Object.freeze({ status: "MOUNTED", dependencyAuthority: "REPO_LOCAL" });
  let mounted = false;
  return {
    get mounted() { return mounted; },
    mountDependencies: async () => { events.push("dependency-mount"); mounted = true; return handle; },
    verifyVolumeTopology: async () => { events.push("volume-topology"); return Object.freeze({ status: "VERIFIED" }); },
    unmountDependencies: async (value) => {
      assert.strictEqual(value, handle);
      events.push("dependency-unmount");
      mounted = false;
      return Object.freeze({ status: "UNMOUNTED" });
    },
  };
}

function startLocalRecoveryApp(options = {}) {
  return startLocalRecoveryAppRuntime({ ...syntheticDependencyLifecycle(), ...options });
}

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
  const repoDistDir = join(process.cwd(), ".next");
  const repoDistBefore = await lstat(repoDistDir).catch(() => null);
  try {
    const workspace = await prepareLocalRecoveryAppWorkspace({ session, repoRoot: process.cwd() });
    assert.deepEqual(JSON.parse(JSON.stringify(workspace)), { status: "PREPARED", cacheBoundary: "RECOVERY_SESSION_ONLY" });
    accessLocalRecoveryAppWorkspace(workspace, (details) => {
      assert.ok(details.runtimeRoot.startsWith(session.evidence));
      assert.ok(details.projectDir.startsWith(session.evidence));
      assert.ok(details.distDir.startsWith(session.evidence));
      assert.notEqual(details.distDir, join(process.cwd(), ".next"));
      assert.equal(details.distDir, join(details.projectDir, ".next"));
    });
    assert.equal(await lstat(join(session.evidence, "application-runtime", "source", ".next")).catch(() => null), null);
    assert.deepEqual(await verifyLocalRecoveryAppDistDirBoundary(workspace), { status: "VERIFIED", distDirAuthority: "PRODUCT_DEFAULT", runtimeBoundary: "RECOVERY_SESSION_ONLY" });
    const repoDistAfter = await lstat(repoDistDir).catch(() => null);
    assert.equal(repoDistAfter?.mtimeMs, repoDistBefore?.mtimeMs);
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("Next invocation uses the Product default distDir without a programmatic override", () => {
  const projectDir = join(process.cwd(), "synthetic-recovery-project");
  const options = buildLocalRecoveryNextOptions({ projectDir, port: 32123 });
  assert.deepEqual(options, { dev: true, dir: projectDir, hostname: "127.0.0.1", port: 32123, quiet: true, webpack: true });
  assert.equal(Object.hasOwn(options, "conf"), false);
  assert.equal(JSON.stringify(options).includes("distDir"), false);
});

test("Windows topology reproduces the Next relative-entry invariant without exposing paths", () => {
  const sameVolume = verifyLocalRecoveryAppVolumeTopology({
    repoRoot: "D:\\repo",
    applicationDir: "D:\\recovery\\source",
    physicalNextClientEntry: "D:\\repo\\node_modules\\next\\dist\\client\\app-next-dev.js",
    platform: "win32",
    pathApi: win32,
  });
  assert.deepEqual(sameVolume, { status: "VERIFIED", volumeTopology: "SAME_VOLUME", nextRelativeEntry: "SAFE" });

  const crossVolumeRelative = win32.relative("C:\\recovery\\source", "D:\\repo\\node_modules\\next\\dist\\client\\app-next-dev.js");
  assert.equal(win32.isAbsolute(crossVolumeRelative), true);
  assert.match(`./${crossVolumeRelative.replaceAll("\\", "/")}`, /^\.\/[A-Za-z]:\//);
  assert.throws(() => verifyLocalRecoveryAppVolumeTopology({
    repoRoot: "D:\\repo",
    applicationDir: "C:\\recovery\\source",
    platform: "win32",
    pathApi: win32,
  }), (error) => {
    assert.equal(error.code, "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH");
    assert.doesNotMatch(JSON.stringify(error), /C:|D:|node_modules|app-next-dev|shareA|shareB/i);
    return true;
  });

  assert.deepEqual(verifyLocalRecoveryAppVolumeTopology({
    repoRoot: "\\\\server\\shareA\\repo",
    applicationDir: "\\\\SERVER\\SHAREA\\recovery\\source",
    platform: "win32",
    pathApi: win32,
  }), { status: "VERIFIED", volumeTopology: "SAME_VOLUME", nextRelativeEntry: "SAFE" });
  assert.throws(() => verifyLocalRecoveryAppVolumeTopology({
    repoRoot: "\\\\server\\shareA\\repo",
    applicationDir: "\\\\server\\shareB\\recovery\\source",
    platform: "win32",
    pathApi: win32,
  }), { code: "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH" });
  assert.deepEqual(verifyLocalRecoveryAppVolumeTopology({
    repoRoot: "/work/repo",
    applicationDir: "/tmp/recovery/source",
    platform: "linux",
    pathApi: posix,
  }), { status: "VERIFIED", volumeTopology: "NOT_APPLICABLE", nextRelativeEntry: "SAFE" });
});

test("local application recovery parent is an external same-volume Windows sibling and preserves the POSIX temp parent", async () => {
  const watched = [join(process.cwd(), ".next"), join(process.cwd(), "node_modules"), join(process.cwd(), "src")];
  const before = await Promise.all(watched.map(async (pathname) => (await lstat(pathname).catch(() => null))?.mtimeMs ?? null));
  const windowsParent = resolveLocalApplicationRecoveryParent({
    repoRoot: "D:\\work\\godel-design",
    platform: "win32",
    systemTemp: "C:\\system-temp",
    pathApi: win32,
  });
  assert.equal(windowsParent, "D:\\work\\.godel-managed-recovery-local-application-sessions");
  assert.equal(win32.parse(windowsParent).root.toLowerCase(), win32.parse("D:\\work\\godel-design").root.toLowerCase());
  assert.equal(win32.relative("D:\\work\\godel-design", windowsParent).startsWith("..\\"), true);
  assert.equal(resolveLocalApplicationRecoveryParent({ repoRoot: "/work/godel-design", platform: "linux", systemTemp: "/system-temp", pathApi: posix }), "/system-temp/godel-managed-recovery-local-application-sessions");
  const after = await Promise.all(watched.map(async (pathname) => (await lstat(pathname).catch(() => null))?.mtimeMs ?? null));
  assert.deepEqual(after, before);
});

test("parent and worker physical Next defenses require the Windows application volume", async () => {
  assert.deepEqual(verifyResolvedLocalRecoveryNextVolumeTopology({
    projectDir: "D:\\recovery\\source",
    resolvedNextPackage: "D:\\repo\\node_modules\\next\\package.json",
    platform: "win32",
    pathApi: win32,
  }), { status: "VERIFIED", volumeTopology: "SAME_VOLUME", nextRelativeEntry: "SAFE" });
  assert.throws(() => verifyResolvedLocalRecoveryNextVolumeTopology({
    projectDir: "C:\\recovery\\source",
    resolvedNextPackage: "D:\\repo\\node_modules\\next\\package.json",
    platform: "win32",
    pathApi: win32,
  }), { code: "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH" });

  const inspect = async (pathname) => pathname.toLowerCase().endsWith("package.json")
    ? { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }
    : { isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false };
  const resolveReal = async (pathname) => pathname;
  assert.deepEqual(await verifyPhysicalLocalRecoveryNextVolumeTopology({
    repoRoot: "D:\\repo",
    projectDir: "D:\\recovery\\source",
    platform: "win32",
    pathApi: win32,
    inspect,
    resolveReal,
  }), { status: "VERIFIED", volumeTopology: "SAME_VOLUME", nextRelativeEntry: "SAFE" });
  await assert.rejects(verifyPhysicalLocalRecoveryNextVolumeTopology({
    repoRoot: "D:\\repo",
    projectDir: "C:\\recovery\\source",
    platform: "win32",
    pathApi: win32,
    inspect,
    resolveReal,
  }), { code: "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH" });
});

test("post-prepare runtime requires the exact real .next directory and safely observes next-env", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "godel-generated-runtime-"));
  try {
    const projectDir = join(root, "source");
    await mkdir(projectDir);
    await assert.rejects(verifyLocalRecoveryAppGeneratedRuntime({ projectDir }), { code: "RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH" });
    await mkdir(join(projectDir, ".next"));
    assert.deepEqual(await verifyLocalRecoveryAppGeneratedRuntime({ projectDir }), { status: "VERIFIED", distDirAuthority: "PRODUCT_DEFAULT", generatedTypes: "NOT_OBSERVED" });

    for (const target of [
      "./.next/dev/types/routes.d.ts",
      "./.next/types/routes.d.ts",
      "./.next/dev/types/root-params.d.ts",
    ]) {
      await writeFile(join(projectDir, "next-env.d.ts"), `import "${target}";\n`, { flag: "w" });
      assert.deepEqual(await verifyLocalRecoveryAppGeneratedRuntime({ projectDir }), { status: "VERIFIED", distDirAuthority: "PRODUCT_DEFAULT", generatedTypes: "OBSERVED" });
    }

    for (const target of ["./.next-recovery/types/routes.d.ts", "../outside/types.d.ts", "C:\\private\\types.d.ts", "/private/types.d.ts"]) {
      await writeFile(join(projectDir, "next-env.d.ts"), `import "${target}";\n`, { flag: "w" });
      await assert.rejects(verifyLocalRecoveryAppGeneratedRuntime({ projectDir }), (error) => {
        assert.equal(error.code, "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH");
        assert.doesNotMatch(JSON.stringify(error), /next-recovery|outside|private|routes\.d\.ts/i);
        return true;
      });
    }

    await writeFile(join(projectDir, "next-env.d.ts"), "x".repeat((16 * 1024) + 1), { flag: "w" });
    await assert.rejects(verifyLocalRecoveryAppGeneratedRuntime({ projectDir }), { code: "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH" });

    const linkedProject = join(root, "linked-source");
    const outside = join(root, "outside-dist");
    await mkdir(linkedProject);
    await mkdir(outside);
    try { await symlink(outside, join(linkedProject, ".next"), "junction"); }
    catch (error) { t.diagnostic(`distDir symlink unavailable: ${error.code}`); return; }
    await assert.rejects(verifyLocalRecoveryAppGeneratedRuntime({ projectDir: linkedProject }), { code: "RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH" });
  } finally { await rm(root, { recursive: true, force: true }); }
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

const directoryEntry = Object.freeze({ isDirectory: () => true, isSymbolicLink: () => false });
const linkEntry = Object.freeze({ isDirectory: () => false, isSymbolicLink: () => true });

function missingEntry() {
  return Object.assign(new Error("missing"), { code: "ENOENT" });
}

function dependencyFilesystem(paths, {
  sourceState = directoryEntry,
  mountPreexists = false,
  mountedAuthority = paths.dependencyPath,
  removeFailure = false,
} = {}) {
  let mounted = mountPreexists;
  const calls = { create: [], remove: [] };
  return {
    calls,
    get mounted() { return mounted; },
    inspect: async (pathname) => {
      if (pathname === paths.dependencyPath) {
        if (sourceState === null) throw missingEntry();
        return sourceState;
      }
      if (pathname === paths.mountPath) {
        if (!mounted) throw missingEntry();
        return mountPreexists && calls.create.length === 0 ? directoryEntry : linkEntry;
      }
      throw new Error("unexpected inspected path");
    },
    resolveReal: async (pathname) => {
      if (pathname === paths.dependencyPath) return paths.dependencyPath;
      if (pathname === paths.mountPath && mounted) return mountedAuthority;
      throw missingEntry();
    },
    createMount: async (target, mountPath, type) => { calls.create.push({ target, mountPath, type }); mounted = true; },
    removeMount: async (mountPath) => {
      calls.remove.push(mountPath);
      if (removeFailure) throw new Error("synthetic unmount failure");
      mounted = false;
    },
  };
}

async function dependencyWorkspace() {
  const session = await sessionLayout();
  const workspace = await prepareLocalRecoveryAppWorkspace({ session, repoRoot: process.cwd() });
  let paths;
  accessLocalRecoveryAppWorkspace(workspace, (value) => {
    paths = { dependencyPath: join(value.repoRoot, "node_modules"), mountPath: join(value.projectDir, "node_modules"), projectDir: value.projectDir };
  });
  return { session, workspace, paths };
}

test("dependency mount uses an absolute Windows junction and POSIX directory link without exposing paths", async () => {
  for (const [platform, type] of [["win32", "junction"], ["linux", "dir"]]) {
    const value = await dependencyWorkspace();
    const filesystem = dependencyFilesystem(value.paths);
    try {
      const handle = await mountLocalRecoveryAppDependencies({
        workspace: value.workspace, platform, inspect: filesystem.inspect, resolveReal: filesystem.resolveReal,
        createMount: filesystem.createMount, removeMount: filesystem.removeMount,
      });
      assert.deepEqual(JSON.parse(JSON.stringify(handle)), { status: "MOUNTED", dependencyAuthority: "REPO_LOCAL" });
      assert.equal(filesystem.calls.create.length, 1);
      assert.equal(filesystem.calls.create[0].type, type);
      assert.equal(filesystem.calls.create[0].target, value.paths.dependencyPath);
      assert.equal(filesystem.calls.create[0].mountPath, value.paths.mountPath);
      assert.equal(isAbsolute(filesystem.calls.create[0].target), true);
      assert.doesNotMatch(JSON.stringify(handle), /node_modules|godel|recovery-app/i);
      assert.deepEqual(await unmountLocalRecoveryAppDependencies(handle), { status: "UNMOUNTED" });
      assert.equal(filesystem.mounted, false);
      assert.deepEqual(filesystem.calls.remove, [value.paths.mountPath]);
    } finally { await rm(value.session.root, { recursive: true, force: true }); }
  }
});

test("dependency mount rejects missing or linked source, preexisting destination, and target mismatch", async () => {
  for (const [configuration, code] of [
    [{ sourceState: null }, "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID"],
    [{ sourceState: linkEntry }, "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID"],
    [{ mountPreexists: true }, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID"],
  ]) {
    const value = await dependencyWorkspace();
    const filesystem = dependencyFilesystem(value.paths, configuration);
    try {
      await assert.rejects(mountLocalRecoveryAppDependencies({
        workspace: value.workspace, inspect: filesystem.inspect, resolveReal: filesystem.resolveReal,
        createMount: filesystem.createMount, removeMount: filesystem.removeMount,
      }), { code });
      assert.equal(filesystem.calls.create.length, 0);
    } finally { await rm(value.session.root, { recursive: true, force: true }); }
  }

  const mismatch = await dependencyWorkspace();
  const filesystem = dependencyFilesystem(mismatch.paths, { mountedAuthority: join(mismatch.session.root, "wrong-authority") });
  try {
    await assert.rejects(mountLocalRecoveryAppDependencies({
      workspace: mismatch.workspace, inspect: filesystem.inspect, resolveReal: filesystem.resolveReal,
      createMount: filesystem.createMount, removeMount: filesystem.removeMount,
    }), { code: "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID" });
    assert.equal(filesystem.mounted, false);
    assert.deepEqual(filesystem.calls.remove, [mismatch.paths.mountPath]);
  } finally { await rm(mismatch.session.root, { recursive: true, force: true }); }
});

test("worker dependency topology requires the project mount to resolve exactly to NODE_PATH", async () => {
  const value = await dependencyWorkspace();
  try {
    const inspect = async (pathname) => pathname === value.paths.mountPath ? linkEntry : directoryEntry;
    const pass = await verifyLocalRecoveryAppDependencyTopology({
      projectDir: value.paths.projectDir,
      nodePath: value.paths.dependencyPath,
      inspect,
      resolveReal: async () => value.paths.dependencyPath,
    });
    assert.deepEqual(pass, { status: "VERIFIED", dependencyAuthority: "REPO_LOCAL" });
    await assert.rejects(verifyLocalRecoveryAppDependencyTopology({
      projectDir: value.paths.projectDir,
      nodePath: value.paths.dependencyPath,
      inspect,
      resolveReal: async (pathname) => pathname === value.paths.mountPath ? join(value.session.root, "wrong") : value.paths.dependencyPath,
    }), { code: "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID" });
  } finally { await rm(value.session.root, { recursive: true, force: true }); }
});

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.messages = [];
    this.killAttempted = false;
  }

  send(message) {
    this.messages.push(message);
    queueMicrotask(() => {
      if (message.type === "start") this.emit("message", { type: "ready" });
      if (message.type === "stop") {
        this.emit("message", { type: "stopped" });
        queueMicrotask(() => { this.exitCode = 0; this.emit("exit", 0); });
      }
    });
  }

  kill() { this.killAttempted = true; this.exitCode = 1; this.emit("exit", 1); }
}

test("successful application cleanup unmounts dependencies only after process exit and port closure", async () => {
  const session = await sessionLayout();
  const child = new FakeChild();
  const events = [];
  const lifecycle = syntheticDependencyLifecycle(events);
  try {
    const app = await startLocalRecoveryAppRuntime({
      ...lifecycle,
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65423,
      materializeSource: async () => ({ status: "MATERIALIZED" }),
      forkProcess: () => child, timeoutMs: 1000,
    });
    assert.equal(lifecycle.mounted, true);
    assert.equal(Object.hasOwn(child.messages[0], "distDir"), false);
    const result = await stopLocalRecoveryApp(app, {
      timeoutMs: 1000,
      probeClosed: async () => { events.push("port-closed"); return child.exitCode === 0; },
    });
    assert.deepEqual(result, { status: "PASS", applicationCleanup: "PASS" });
    assert.deepEqual(events, ["dependency-mount", "volume-topology", "port-closed", "dependency-unmount"]);
    assert.equal(lifecycle.mounted, false);
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("completed dependency lifecycle remains compatible with strict RecoverySession cleanup", async () => {
  const base = await mkdtemp(join(tmpdir(), "godel-dependency-session-"));
  const parent = join(base, "recovery");
  const backupOutputRoot = join(base, "backup-output");
  await mkdir(backupOutputRoot);
  const session = await createRecoverySession({ parent, repoRoot: process.cwd(), backupOutputRoot, sessionId: TEST_SESSION_ID });
  const child = new FakeChild();
  const lifecycle = syntheticDependencyLifecycle();
  try {
    const app = await startLocalRecoveryAppRuntime({
      ...lifecycle,
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65420,
      materializeSource: async () => ({ status: "MATERIALIZED" }),
      forkProcess: () => child, timeoutMs: 1000,
    });
    await stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true });
    assert.equal(lifecycle.mounted, false);
    assert.deepEqual(await cleanupRecoverySession(session), { status: "PASS", removed: true });
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("every post-mount startup failure unmounts dependencies before propagating", async () => {
  class FailingStartChild extends FakeChild {
    send(message) {
      this.messages.push(message);
      if (message.type === "start") queueMicrotask(() => this.emit("message", { type: "failure", code: "RECOVERY_APP_START_FAILED" }));
    }
  }
  for (const scenario of ["topology", "dist", "fork", "worker"]) {
    const session = await sessionLayout();
    const events = [];
    const lifecycle = syntheticDependencyLifecycle(events);
    let unexpectedDistDir;
    try {
      const options = {
        ...lifecycle,
        localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65422,
        verifyVolumeTopology: async () => {
          events.push("volume-topology");
          if (scenario === "topology") throw Object.assign(new Error("private cross-volume path"), { code: "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH" });
          return Object.freeze({ status: "VERIFIED" });
        },
        materializeSource: async ({ workspace }) => {
          if (scenario === "dist") {
            let distDir;
            accessLocalRecoveryAppWorkspace(workspace, (value) => { distDir = value.distDir; });
            await mkdir(distDir);
            unexpectedDistDir = distDir;
          }
          return { status: "MATERIALIZED" };
        }, timeoutMs: 1000,
        probeClosed: async () => true,
        forkProcess: () => {
          if (scenario === "fork") throw new Error("synthetic fork failure");
          return scenario === "worker" ? new FailingStartChild() : new FakeChild();
        },
      };
      await assert.rejects(startLocalRecoveryAppRuntime(options));
      assert.deepEqual(events, ["dependency-mount", "volume-topology", "dependency-unmount"], scenario);
      assert.equal(lifecycle.mounted, false, scenario);
      if (scenario === "dist") assert.equal((await lstat(unexpectedDistDir)).isDirectory(), true);
    } finally { await rm(session.root, { recursive: true, force: true }); }
  }
});

test("dependency unmount failure overrides successful process cleanup and never reports PASS", async () => {
  const session = await sessionLayout();
  const child = new FakeChild();
  const dependencyMount = Object.freeze({ status: "MOUNTED" });
  try {
    const app = await startLocalRecoveryAppRuntime({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65421,
      materializeSource: async () => ({ status: "MATERIALIZED" }),
      mountDependencies: async () => dependencyMount,
      verifyVolumeTopology: async () => Object.freeze({ status: "VERIFIED" }),
      unmountDependencies: async (handle) => {
        assert.strictEqual(handle, dependencyMount);
        throw Object.assign(new Error("private mount path"), { code: "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED" });
      },
      forkProcess: () => child, timeoutMs: 1000,
    });
    await assert.rejects(stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true }), { code: "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED" });
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("runtime diagnostic classifier exposes only a conservative fixed enum", async () => {
  for (const [logs, expected] of [
    ["Module not found: Can't resolve private-module-path", "MODULE_RESOLUTION_FAILURE"],
    ["Failed to compile due to private-source-line", "COMPILE_FAILURE"],
    ["Unhandled Runtime Error: private-runtime-detail", "RUNTIME_FAILURE"],
    ["arbitrary private diagnostic text", "UNCLASSIFIED"],
  ]) {
    const session = await sessionLayout();
    const child = new FakeChild();
    try {
      const app = await startLocalRecoveryApp({
        localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65424,
        materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child, timeoutMs: 1000,
      });
      child.stderr.emit("data", logs);
      const diagnostic = classifyLocalRecoveryAppRuntimeDiagnostic(app);
      assert.equal(diagnostic, expected);
      assert.ok(!logs.includes(diagnostic));
      assert.doesNotMatch(diagnostic, /private|path|line|detail|diagnostic text/i);
      await stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true });
    } finally { await rm(session.root, { recursive: true, force: true }); }
  }
});

test("opaque checkpoints classify only post-boundary diagnostics with safe module taxonomy", async () => {
  const cases = [
    [["Module not found: Can't resolve '@/private/alias'"], "PROJECT_ALIAS"],
    [["Module not found: Can't resolve './private-relative'"], "RELATIVE_IMPORT"],
    [["Module not found: Can't resolve '../private-parent'"], "RELATIVE_IMPORT"],
    [["Module not found: Can't resolve '.\\private-relative'"], "RELATIVE_IMPORT"],
    [["Module not found: Can't resolve '..\\private-parent'"], "RELATIVE_IMPORT"],
    [["Module not found: Can't resolve 'next/server'"], "NEXT_INTERNAL"],
    [["Cannot find module 'private-next-rsc-action-validate'"], "NEXT_INTERNAL"],
    [["\u001b[31mCannot find module 'react/jsx-runtime'\u001b[0m"], "DECLARED_PACKAGE"],
    [["Cannot find module 'undeclared-package/subpath'"], "OTHER_BARE_PACKAGE"],
    [["Cannot find module 'node:fs'"], "NODE_BUILTIN"],
    [["Cannot find module 'C:\\private\\absolute'"], "ABSOLUTE_PATH"],
    [["Cannot find module '/private/absolute'"], "ABSOLUTE_PATH"],
    [["Cannot find module 'file:///private/absolute'"], "ABSOLUTE_PATH"],
    [["Cannot find module '[REDACTED]\\private\\module'"], "REDACTED_PATH"],
    [["Cannot find module 'style-loader!./private.css?modules'"], "LOADER_REQUEST"],
    [["Module not found while compiling private-source"], "UNPARSED"],
    [["Cannot find module '#private-import-map'"], "UNKNOWN"],
    [["Cannot find module '@/private/mixed'", "Cannot find module 'node:crypto'"], "MIXED"],
  ];
  for (const [diagnosticChunks, moduleCategory] of cases) {
    const session = await sessionLayout();
    const child = new FakeChild();
    try {
      const app = await startLocalRecoveryApp({
        localStatus: localStatus(), session, runtimeAuthority: await verifyAuthority(), repoRoot: process.cwd(), allocatePort: async () => 65310,
        materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child, timeoutMs: 1000,
      });
      child.stderr.emit("data", "Module not found: Can't resolve 'historical-private-module'");
      const checkpoint = createLocalRecoveryAppDiagnosticCheckpoint(app);
      assert.deepEqual(JSON.parse(JSON.stringify(checkpoint)), { status: "CHECKPOINTED" });
      for (const diagnosticText of diagnosticChunks) child.stderr.emit("data", diagnosticText);
      const classification = classifyLocalRecoveryAppRuntimeDiagnosticSince(app, checkpoint);
      assert.deepEqual(classification, { diagnostic: "MODULE_RESOLUTION_FAILURE", moduleCategory });
      const publicShape = JSON.stringify({ checkpoint, classification });
      for (const privateValue of ["historical-private-module", "private-source", "private", "react", "node:crypto", "style-loader", "file:", "127.0.0.1"]) {
        assert.ok(!publicShape.includes(privateValue));
      }
      await stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true });
    } finally { await rm(session.root, { recursive: true, force: true }); }
  }
});

test("diagnostic checkpoints are app-bound and event storage remains bounded", async () => {
  const sessions = [await sessionLayout(), await sessionLayout()];
  const children = [new FakeChild(), new FakeChild()];
  const apps = [];
  try {
    for (let index = 0; index < 2; index += 1) {
      apps.push(await startLocalRecoveryApp({
        localStatus: localStatus(), session: sessions[index], repoRoot: process.cwd(), allocatePort: async () => 65320 + index,
        materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => children[index], timeoutMs: 1000,
      }));
    }
    const foreignCheckpoint = createLocalRecoveryAppDiagnosticCheckpoint(apps[0]);
    assert.throws(() => classifyLocalRecoveryAppRuntimeDiagnosticSince(apps[1], foreignCheckpoint), { code: "RECOVERY_APP_DIAGNOSTIC_CHECKPOINT_INVALID" });

    const boundedCheckpoint = createLocalRecoveryAppDiagnosticCheckpoint(apps[0]);
    children[0].stderr.emit("data", "Module not found: Can't resolve 'evicted-private-module'");
    children[0].stderr.emit("data", "x".repeat(9000));
    assert.deepEqual(classifyLocalRecoveryAppRuntimeDiagnosticSince(apps[0], boundedCheckpoint), { diagnostic: "UNCLASSIFIED" });
  } finally {
    for (const app of apps) await stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true });
    for (const session of sessions) await rm(session.root, { recursive: true, force: true });
  }
});

test("diagnostic settling includes late local events and completes on a quiet stream", async () => {
  const session = await sessionLayout();
  const child = new FakeChild();
  try {
    const app = await startLocalRecoveryApp({
      localStatus: localStatus(), session, runtimeAuthority: await verifyAuthority(), repoRoot: process.cwd(), allocatePort: async () => 65330,
      materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child, timeoutMs: 1000,
    });
    const checkpoint = createLocalRecoveryAppDiagnosticCheckpoint(app);
    let clock = 0;
    let waits = 0;
    await settleLocalRecoveryAppDiagnostics(app, checkpoint, {
      quietMs: 50,
      maxMs: 1000,
      now: () => clock,
      wait: async (delay) => {
        clock += delay;
        waits += 1;
        if (waits === 1) child.stderr.emit("data", "Module not found: Can't resolve '@/late-private-module'");
      },
    });
    assert.equal(waits, 2);
    assert.deepEqual(classifyLocalRecoveryAppRuntimeDiagnosticSince(app, checkpoint), { diagnostic: "MODULE_RESOLUTION_FAILURE", moduleCategory: "PROJECT_ALIAS" });

    const quietCheckpoint = createLocalRecoveryAppDiagnosticCheckpoint(app);
    let quietWaits = 0;
    await settleLocalRecoveryAppDiagnostics(app, quietCheckpoint, {
      quietMs: 5,
      maxMs: 20,
      now: () => quietWaits * 5,
      wait: async () => { quietWaits += 1; },
    });
    assert.equal(quietWaits, 1);
    await stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true });
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("opaque local app handle binds loopback dynamically and exact cleanup proves the port closed", async () => {
  const session = await sessionLayout();
  const child = new FakeChild();
  let forkOptions;
  try {
    const app = await startLocalRecoveryApp({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65432,
      materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: (_worker, args, options) => { assert.deepEqual(args, []); forkOptions = options; return child; }, timeoutMs: 1000,
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
      materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child,
      probeClosed: async ({ port, host }) => { probed = port === 65430 && host === "127.0.0.1"; return true; }, timeoutMs: 1000,
    }), { code: "RECOVERY_APP_START_FAILED" });
    assert.equal(child.exitCode, 1);
    assert.equal(probed, true);
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("shutdown waits for real exit after ACK and never treats emergency kill as PASS", async () => {
  const session = await sessionLayout();
  class HangingAfterAckChild extends FakeChild {
    constructor() {
      super();
      this.acknowledged = new Promise((accept) => { this.acceptAcknowledgement = accept; });
    }
    send(message) {
      this.messages.push(message);
      queueMicrotask(() => {
        if (message.type === "start") this.emit("message", { type: "ready" });
        if (message.type === "stop") {
          this.emit("message", { type: "stopped" });
          this.acceptAcknowledgement();
        }
      });
    }
  }
  const child = new HangingAfterAckChild();
  try {
    const app = await startLocalRecoveryApp({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65428,
      materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child, timeoutMs: 1000,
    });
    const stopping = stopLocalRecoveryApp(app, { timeoutMs: 20, probeClosed: async () => true });
    const first = await Promise.race([stopping.then(() => "resolved", () => "rejected"), child.acknowledged.then(() => "acknowledged")]);
    assert.equal(first, "acknowledged");
    assert.equal(child.exitCode, null);
    await assert.rejects(stopping, { code: "RECOVERY_APP_SHUTDOWN_EXIT_FAILED" });
    assert.equal(child.killAttempted, true);
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("shutdown send failure cancels the ACK wait and remains an emergency cleanup failure", async () => {
  const session = await sessionLayout();
  class StopSendFailureChild extends FakeChild {
    send(message) {
      if (message.type === "stop") throw new Error("synthetic stopped IPC");
      super.send(message);
    }
  }
  const child = new StopSendFailureChild();
  try {
    const app = await startLocalRecoveryApp({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65425,
      materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child, timeoutMs: 1000,
    });
    await assert.rejects(stopLocalRecoveryApp(app, { timeoutMs: 20, probeClosed: async () => true }), { code: "RECOVERY_APP_CLEANUP_INCOMPLETE" });
    assert.equal(child.killAttempted, true);
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("shutdown rejects a port that remains open after ACK and successful child exit", async () => {
  const session = await sessionLayout();
  const child = new FakeChild();
  try {
    const app = await startLocalRecoveryApp({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65427,
      materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child, timeoutMs: 1000,
    });
    await assert.rejects(stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => false }), { code: "RECOVERY_APP_SHUTDOWN_PORT_OPEN" });
    assert.equal(child.killAttempted, false);
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("worker close failure remains fixed after failure ACK, real exit, and port verification", async () => {
  const session = await sessionLayout();
  class CloseFailureChild extends FakeChild {
    send(message) {
      this.messages.push(message);
      queueMicrotask(() => {
        if (message.type === "start") this.emit("message", { type: "ready" });
        if (message.type === "stop") {
          this.emit("message", { type: "failure", code: "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED" });
          queueMicrotask(() => { this.exitCode = 1; this.emit("exit", 1); });
        }
      });
    }
  }
  const child = new CloseFailureChild();
  try {
    const app = await startLocalRecoveryApp({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65426,
      materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child, timeoutMs: 1000,
    });
    await assert.rejects(stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true }), { code: "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED" });
    assert.equal(child.killAttempted, false);
  } finally { await rm(session.root, { recursive: true, force: true }); }
});

test("unexpected application process exit invalidates the opaque handle", async () => {
  const session = await sessionLayout();
  const child = new FakeChild();
  try {
    const app = await startLocalRecoveryApp({
      localStatus: localStatus(), session, repoRoot: process.cwd(), allocatePort: async () => 65429,
      materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => child, timeoutMs: 1000,
    });
    child.exitCode = 1;
    child.emit("exit", 1);
    assert.throws(() => accessLocalRecoveryApp(app, () => undefined), { code: "RECOVERY_APP_PROCESS_FAILED" });
    await assert.rejects(stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true }), { code: "RECOVERY_APP_CLEANUP_INCOMPLETE" });
  } finally { await rm(session.root, { recursive: true, force: true }); }
});
