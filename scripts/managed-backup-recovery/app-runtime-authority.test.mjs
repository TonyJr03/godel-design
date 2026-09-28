import assert from "node:assert/strict";
import test from "node:test";

import {
  accessVerifiedRecoveryAppRuntimeAuthority,
  buildRecoveryAppPackageManifestPlans,
  buildRecoveryAppRuntimeAuthorityPlan,
  RECOVERY_APP_BYTE_EXACT_PATHS,
  verifyRecoveryAppRuntimeAuthority,
} from "./app-runtime-authority.mjs";

const RUNTIME = "a".repeat(40);
const TOOLING = "b".repeat(40);
const PACKAGE = Object.freeze({
  name: "godel-design",
  version: "0.1.0",
  private: true,
  scripts: { build: "next build" },
  dependencies: { next: "16.2.11" },
  devDependencies: { playwright: "1.55.0" },
});

function packageText(value) {
  return typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
}

function authorityExecutor({ byteDiff = "", runtimePackage = PACKAGE, toolingPackage = PACKAGE, missing } = {}) {
  const calls = [];
  return Object.assign(async (plan) => {
    calls.push(plan);
    if (plan.args[0] === "diff") return { stdout: byteDiff, stderr: "" };
    if (plan.args[0] !== "show") throw new Error("unexpected operation");
    const runtime = plan.args[1] === `${RUNTIME}:package.json`;
    if (missing === (runtime ? "runtime" : "tooling")) throw new Error("missing");
    return { stdout: packageText(runtime ? runtimePackage : toolingPackage), stderr: "" };
  }, { calls });
}

test("application runtime authority uses byte-exact paths plus two protected package reads without Git mutation", () => {
  const plan = buildRecoveryAppRuntimeAuthorityPlan({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", environment: { PATH: "safe" } });
  assert.deepEqual(plan.args, ["diff", "--name-only", "--no-renames", RUNTIME, TOOLING, "--", ...RECOVERY_APP_BYTE_EXACT_PATHS]);
  assert.ok(plan.args.includes("package-lock.json"));
  assert.ok(!plan.args.includes("package.json"));
  assert.ok(!plan.args.includes("docs"));
  assert.ok(!plan.args.includes("scripts/managed-backup-recovery"));
  const packages = buildRecoveryAppPackageManifestPlans({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", environment: { PATH: "safe" } });
  assert.deepEqual(packages.runtime.args, ["show", `${RUNTIME}:package.json`]);
  assert.deepEqual(packages.tooling.args, ["show", `${TOOLING}:package.json`]);
  for (const command of [plan, packages.runtime, packages.tooling]) {
    assert.ok(!command.args.some((value) => ["checkout", "fetch", "switch", "reset"].includes(value)));
    assert.deepEqual(command.allowedEnvironment.GIT_CONFIG_KEY_1, "safe.directory");
  }
});

test("exact byte tree and exact package manifest pass as one opaque authority", async () => {
  const execute = authorityExecutor();
  const result = await verifyRecoveryAppRuntimeAuthority({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", execute });
  assert.equal(result.applicationRuntimeAuthority, "VERIFIED");
  assert.equal(result.governedPathCount, RECOVERY_APP_BYTE_EXACT_PATHS.length);
  accessVerifiedRecoveryAppRuntimeAuthority(result, (details) => assert.deepEqual({
    byteExactApplicationTree: details.byteExactApplicationTree,
    packageManifestRuntimeFields: details.packageManifestRuntimeFields,
    packageLock: details.packageLock,
  }, { byteExactApplicationTree: "PASS", packageManifestRuntimeFields: "PASS", packageLock: "BYTE_EXACT" }));
  assert.equal(execute.calls.length, 3);
});

test("scripts-only operational drift is semantically excluded", async () => {
  const toolingPackage = { ...PACKAGE, scripts: { ...PACKAGE.scripts, "ops:restore:managed:drill:local": "node recovery.mjs" } };
  const result = await verifyRecoveryAppRuntimeAuthority({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", execute: authorityExecutor({ toolingPackage }) });
  assert.equal(result.applicationRuntimeAuthority, "VERIFIED");
});

test("package manifest comparison is structural and ignores object key order only", async () => {
  const toolingPackage = {
    devDependencies: PACKAGE.devDependencies,
    dependencies: PACKAGE.dependencies,
    scripts: PACKAGE.scripts,
    private: PACKAGE.private,
    version: PACKAGE.version,
    name: PACKAGE.name,
  };
  const result = await verifyRecoveryAppRuntimeAuthority({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", execute: authorityExecutor({ toolingPackage }) });
  assert.equal(result.applicationRuntimeAuthority, "VERIFIED");
});

test("dependencies, devDependencies, and arbitrary non-script metadata drift fail closed", async () => {
  for (const toolingPackage of [
    { ...PACKAGE, dependencies: { next: "16.2.12" } },
    { ...PACKAGE, devDependencies: { playwright: "1.56.0" } },
    { ...PACKAGE, packageManager: "npm@99.0.0" },
  ]) {
    await assert.rejects(verifyRecoveryAppRuntimeAuthority({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", execute: authorityExecutor({ toolingPackage }) }), { code: "RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH" });
  }
});

test("any byte-exact path drift, including package-lock, fails before package reads", async () => {
  for (const changedPath of ["src/private-file.ts", "package-lock.json"]) {
    const execute = authorityExecutor({ byteDiff: `${changedPath}\n` });
    await assert.rejects(verifyRecoveryAppRuntimeAuthority({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", execute }), { code: "RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH" });
    assert.equal(execute.calls.length, 1);
  }
});

test("invalid, non-object, missing, and unexpected package command output fail closed", async () => {
  for (const runtimePackage of ["{invalid", "[]", "null", ""]) {
    await assert.rejects(verifyRecoveryAppRuntimeAuthority({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", execute: authorityExecutor({ runtimePackage }) }), { code: "RECOVERY_APP_PACKAGE_MANIFEST_INVALID" });
  }
  await assert.rejects(verifyRecoveryAppRuntimeAuthority({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", execute: authorityExecutor({ toolingPackage: "[]" }) }), { code: "RECOVERY_APP_PACKAGE_MANIFEST_INVALID" });
  for (const missing of ["runtime", "tooling"]) {
    await assert.rejects(verifyRecoveryAppRuntimeAuthority({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", execute: authorityExecutor({ missing }) }), { code: "RECOVERY_APP_RUNTIME_AUTHORITY_UNAVAILABLE" });
  }
  const baseExecute = authorityExecutor();
  const execute = async (plan) => plan.args[0] === "show" ? { ...(await baseExecute(plan)), stderr: "unexpected" } : baseExecute(plan);
  await assert.rejects(verifyRecoveryAppRuntimeAuthority({ runtimeSha: RUNTIME, toolingSha: TOOLING, repoRoot: "C:\\repo", execute }), { code: "RECOVERY_APP_PACKAGE_MANIFEST_INVALID" });
});
