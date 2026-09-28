import { lstat, realpath } from "node:fs/promises";
import { posix, win32 } from "node:path";

const LOCAL_APPLICATION_SESSION_PARENT = ".godel-managed-recovery-local-application-sessions";
const POSIX_LOCAL_APPLICATION_SESSION_PARENT = "godel-managed-recovery-local-application-sessions";

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryApplicationRuntimeTopologyError";
  error.code = code;
  throw error;
}

function apiFor(platform, pathApi) {
  if (pathApi) return pathApi;
  return platform === "win32" ? win32 : posix;
}

function comparable(platform, value) {
  return platform === "win32" ? value.toLowerCase() : value;
}

function contained(pathApi, platform, parent, candidate) {
  const value = pathApi.relative(parent, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(value)
    && comparable(platform, pathApi.parse(value).root) === "");
}

function overlaps(pathApi, platform, left, right) {
  return contained(pathApi, platform, left, right) || contained(pathApi, platform, right, left);
}

function absolutePath(pathApi, value) {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") && pathApi.isAbsolute(value);
}

function fixedNextClientEntry(pathApi, repoRoot) {
  return pathApi.join(repoRoot, "node_modules", "next", "dist", "client", "app-next-dev.js");
}

export function verifyLocalRecoveryAppVolumeTopology({
  repoRoot,
  applicationDir,
  physicalNextClientEntry,
  platform = process.platform,
  pathApi,
} = {}) {
  const api = apiFor(platform, pathApi);
  if (typeof platform !== "string" || platform.length === 0 || !absolutePath(api, repoRoot) || !absolutePath(api, applicationDir)) {
    fail("RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH", "Recovery application volume topology is invalid");
  }
  const repository = api.resolve(repoRoot);
  const application = api.resolve(applicationDir);
  const nextEntry = physicalNextClientEntry === undefined
    ? fixedNextClientEntry(api, repository)
    : physicalNextClientEntry;
  if (!absolutePath(api, nextEntry)) fail("RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH", "Recovery application volume topology is invalid");
  const physicalEntry = api.resolve(nextEntry);

  if (platform === "win32") {
    const applicationRoot = comparable(platform, api.parse(application).root);
    const dependencyRoot = comparable(platform, api.parse(physicalEntry).root);
    if (!applicationRoot || !dependencyRoot || applicationRoot !== dependencyRoot) {
      fail("RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH", "Recovery application and dependency authority require one Windows volume");
    }
  }

  const relativeEntry = api.relative(application, physicalEntry);
  const relativeRoot = comparable(platform, api.parse(relativeEntry).root);
  const normalizedRelative = relativeEntry.replaceAll("\\", "/");
  if (!relativeEntry || relativeEntry.includes("\0") || api.isAbsolute(relativeEntry) || relativeRoot
    || /^[A-Za-z]:/.test(relativeEntry) || /^[\\/]{2}/.test(relativeEntry)
    || !normalizedRelative || normalizedRelative.startsWith("/")) {
    fail("RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH", "Recovery application cannot construct a safe relative Next entry");
  }
  const modeledNextEntry = `./${normalizedRelative}`;
  if (!modeledNextEntry.startsWith("./") || modeledNextEntry.startsWith(".//")) {
    fail("RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH", "Recovery application cannot construct a safe relative Next entry");
  }
  return Object.freeze({
    status: "VERIFIED",
    volumeTopology: platform === "win32" ? "SAME_VOLUME" : "NOT_APPLICABLE",
    nextRelativeEntry: "SAFE",
  });
}

export function resolveLocalApplicationRecoveryParent({
  repoRoot,
  platform = process.platform,
  systemTemp,
  pathApi,
} = {}) {
  const api = apiFor(platform, pathApi);
  if (typeof platform !== "string" || platform.length === 0 || !absolutePath(api, repoRoot)) {
    fail("RECOVERY_PARENT_UNSAFE", "Local application recovery parent inputs are invalid");
  }
  const repository = api.resolve(repoRoot);
  const parent = platform === "win32"
    ? api.resolve(api.dirname(repository), LOCAL_APPLICATION_SESSION_PARENT)
    : api.resolve(systemTemp ?? "/tmp", POSIX_LOCAL_APPLICATION_SESSION_PARENT);
  if (!absolutePath(api, parent) || overlaps(api, platform, repository, parent)) {
    fail("RECOVERY_PARENT_UNSAFE", "Local application recovery parent overlaps the repository");
  }
  if (platform === "win32") {
    const repositoryRoot = comparable(platform, api.parse(repository).root);
    const parentRoot = comparable(platform, api.parse(parent).root);
    const repositoryParent = comparable(platform, api.dirname(repository));
    const selectedParent = comparable(platform, api.dirname(parent));
    if (!repositoryRoot || repositoryRoot !== parentRoot || repositoryParent !== selectedParent) {
      fail("RECOVERY_PARENT_UNSAFE", "Local application recovery parent is not a same-volume sibling");
    }
  }
  return parent;
}

export function verifyResolvedLocalRecoveryNextVolumeTopology({
  projectDir,
  resolvedNextPackage,
  platform = process.platform,
  pathApi,
} = {}) {
  const api = apiFor(platform, pathApi);
  if (!absolutePath(api, projectDir) || !absolutePath(api, resolvedNextPackage)
    || comparable(platform, api.basename(resolvedNextPackage)) !== "package.json") {
    fail("RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH", "Resolved Next authority is invalid");
  }
  const physicalNextClientEntry = api.join(api.dirname(api.resolve(resolvedNextPackage)), "dist", "client", "app-next-dev.js");
  return verifyLocalRecoveryAppVolumeTopology({
    repoRoot: api.dirname(api.dirname(api.dirname(api.resolve(resolvedNextPackage)))),
    applicationDir: projectDir,
    physicalNextClientEntry,
    platform,
    pathApi: api,
  });
}

export async function verifyPhysicalLocalRecoveryNextVolumeTopology({
  repoRoot,
  projectDir,
  platform = process.platform,
  pathApi,
  inspect = lstat,
  resolveReal = realpath,
} = {}) {
  const api = apiFor(platform, pathApi);
  if (!absolutePath(api, repoRoot) || !absolutePath(api, projectDir)
    || typeof inspect !== "function" || typeof resolveReal !== "function") {
    fail("RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "Physical Next dependency authority is invalid");
  }
  const nextRoot = api.resolve(repoRoot, "node_modules", "next");
  const packagePath = api.join(nextRoot, "package.json");
  let nextState;
  let packageState;
  let realNextRoot;
  let realPackagePath;
  try {
    [nextState, packageState, realNextRoot, realPackagePath] = await Promise.all([
      inspect(nextRoot), inspect(packagePath), resolveReal(nextRoot), resolveReal(packagePath),
    ]);
  } catch {
    fail("RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "Physical Next dependency authority is unavailable");
  }
  if (!nextState?.isDirectory() || nextState.isSymbolicLink() || !packageState?.isFile() || packageState.isSymbolicLink()
    || comparable(platform, realNextRoot) !== comparable(platform, nextRoot)
    || comparable(platform, realPackagePath) !== comparable(platform, packagePath)) {
    fail("RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "Physical Next dependency authority is invalid");
  }
  return verifyResolvedLocalRecoveryNextVolumeTopology({
    projectDir,
    resolvedNextPackage: realPackagePath,
    platform,
    pathApi: api,
  });
}
