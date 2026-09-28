import { isDeepStrictEqual } from "node:util";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { buildRecoveryGitEnvironment } from "./git-environment.mjs";

export const RECOVERY_APP_BYTE_EXACT_PATHS = Object.freeze([
  "src",
  "public",
  "next.config.ts",
  "package-lock.json",
  "tsconfig.json",
  "next-env.d.ts",
  "postcss.config.mjs",
]);
export const RECOVERY_APP_RUNTIME_PATHS = RECOVERY_APP_BYTE_EXACT_PATHS;

const SHA = /^[a-f0-9]{40}$/;
const verifiedAuthorities = new WeakSet();
const authorityDetails = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryAppRuntimeAuthorityError";
  error.code = code;
  throw error;
}

export function buildRecoveryAppRuntimeAuthorityPlan({ runtimeSha, toolingSha, repoRoot, environment = process.env } = {}) {
  if (!SHA.test(runtimeSha ?? "") || !SHA.test(toolingSha ?? "") || typeof repoRoot !== "string" || repoRoot.length === 0) {
    fail("RECOVERY_APP_RUNTIME_AUTHORITY_INVALID", "Recovery application runtime authority is invalid");
  }
  return Object.freeze({
    operation: "compare recovery application runtime authority",
    executable: "git",
    args: Object.freeze(["diff", "--name-only", "--no-renames", runtimeSha, toolingSha, "--", ...RECOVERY_APP_BYTE_EXACT_PATHS]),
    cwd: repoRoot,
    allowedEnvironment: buildRecoveryGitEnvironment({ sourceEnvironment: environment, repoRoot }),
    preserveOutput: true,
    maxOutputBytes: 64 * 1024,
  });
}

export function buildRecoveryAppPackageManifestPlans({ runtimeSha, toolingSha, repoRoot, environment = process.env } = {}) {
  if (!SHA.test(runtimeSha ?? "") || !SHA.test(toolingSha ?? "") || typeof repoRoot !== "string" || repoRoot.length === 0) {
    fail("RECOVERY_APP_RUNTIME_AUTHORITY_INVALID", "Recovery application package authority is invalid");
  }
  const allowedEnvironment = buildRecoveryGitEnvironment({ sourceEnvironment: environment, repoRoot });
  const plan = (sha, operation) => Object.freeze({
    operation,
    executable: "git",
    args: Object.freeze(["show", `${sha}:package.json`]),
    cwd: repoRoot,
    allowedEnvironment,
    preserveOutput: true,
    maxOutputBytes: 1024 * 1024,
  });
  return Object.freeze({
    runtime: plan(runtimeSha, "read Production recovery application package manifest"),
    tooling: plan(toolingSha, "read tooling recovery application package manifest"),
  });
}

function parsePackageManifest(output) {
  if (typeof output !== "string" || output.length === 0) fail("RECOVERY_APP_PACKAGE_MANIFEST_INVALID", "Recovery application package manifest is invalid");
  let value;
  try { value = JSON.parse(output); } catch { fail("RECOVERY_APP_PACKAGE_MANIFEST_INVALID", "Recovery application package manifest is invalid"); }
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("RECOVERY_APP_PACKAGE_MANIFEST_INVALID", "Recovery application package manifest is invalid");
  }
  return value;
}

function withoutOperationalScripts(packageManifest) {
  const runtimeFields = { ...packageManifest };
  delete runtimeFields.scripts;
  return runtimeFields;
}

function declaredPackageNames(packageManifest) {
  const names = new Set();
  for (const field of ["dependencies", "devDependencies"]) {
    const dependencies = packageManifest[field];
    if (dependencies === undefined) continue;
    if (dependencies === null || typeof dependencies !== "object" || Array.isArray(dependencies) || Object.getPrototypeOf(dependencies) !== Object.prototype) {
      fail("RECOVERY_APP_PACKAGE_MANIFEST_INVALID", "Recovery application package dependency authority is invalid");
    }
    for (const name of Object.keys(dependencies)) {
      if (name.length === 0) fail("RECOVERY_APP_PACKAGE_MANIFEST_INVALID", "Recovery application package dependency authority is invalid");
      names.add(name);
    }
  }
  return Object.freeze([...names]);
}

async function readPackageManifest(plan, execute) {
  let result;
  try { result = await execute(plan); } catch { fail("RECOVERY_APP_RUNTIME_AUTHORITY_UNAVAILABLE", "Recovery application package authority could not be read"); }
  if (!result || typeof result.stdout !== "string" || (result.stderr !== undefined && (typeof result.stderr !== "string" || result.stderr.trim() !== ""))) {
    fail("RECOVERY_APP_PACKAGE_MANIFEST_INVALID", "Recovery application package command output is invalid");
  }
  return Object.freeze({ raw: result.stdout, parsed: parsePackageManifest(result.stdout) });
}

export async function verifyRecoveryAppRuntimeAuthority({ runtimeSha, toolingSha, repoRoot, environment = process.env, execute = runCommand } = {}) {
  if (typeof execute !== "function") fail("RECOVERY_APP_RUNTIME_AUTHORITY_INVALID", "Recovery application runtime executor is invalid");
  const plan = buildRecoveryAppRuntimeAuthorityPlan({ runtimeSha, toolingSha, repoRoot, environment });
  const packagePlans = buildRecoveryAppPackageManifestPlans({ runtimeSha, toolingSha, repoRoot, environment });
  let comparison;
  try { comparison = await execute(plan); } catch { fail("RECOVERY_APP_RUNTIME_AUTHORITY_UNAVAILABLE", "Recovery application runtime authority could not be compared"); }
  if (!comparison || typeof comparison.stdout !== "string" || (comparison.stderr !== undefined && (typeof comparison.stderr !== "string" || comparison.stderr.trim() !== ""))) {
    fail("RECOVERY_APP_RUNTIME_AUTHORITY_UNAVAILABLE", "Recovery application runtime comparison output is invalid");
  }
  if (comparison.stdout.trim() !== "") fail("RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH", "Recovery application tree differs from the Production runtime authority");
  const runtimePackage = await readPackageManifest(packagePlans.runtime, execute);
  const toolingPackage = await readPackageManifest(packagePlans.tooling, execute);
  if (!isDeepStrictEqual(withoutOperationalScripts(runtimePackage.parsed), withoutOperationalScripts(toolingPackage.parsed))) {
    fail("RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH", "Recovery application package runtime fields differ from the Production authority");
  }
  const authority = Object.freeze({ status: "VERIFIED", applicationRuntimeAuthority: "VERIFIED", governedPathCount: RECOVERY_APP_BYTE_EXACT_PATHS.length });
  verifiedAuthorities.add(authority);
  authorityDetails.set(authority, Object.freeze({
    runtimeSha,
    runtimePackageJson: runtimePackage.raw,
    declaredPackageNames: declaredPackageNames(runtimePackage.parsed),
    byteExactApplicationTree: "PASS",
    packageManifestRuntimeFields: "PASS",
    packageLock: "BYTE_EXACT",
  }));
  return authority;
}

export function isVerifiedRecoveryAppRuntimeAuthority(authority) {
  return verifiedAuthorities.has(authority);
}

export function accessVerifiedRecoveryAppRuntimeAuthority(authority, callback) {
  const details = authorityDetails.get(authority);
  if (!details || typeof callback !== "function") fail("RECOVERY_APP_RUNTIME_AUTHORITY_REQUIRED", "Verified recovery application runtime authority is required");
  return callback(details);
}
