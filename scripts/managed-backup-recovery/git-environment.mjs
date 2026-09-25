import { resolve } from "node:path";

const BASE_ENVIRONMENT_KEYS = Object.freeze(["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP"]);

function fail() {
  const error = new Error("A valid recovery repository root is required");
  error.name = "ManagedRecoveryGitEnvironmentError";
  error.code = "RECOVERY_GIT_REPOSITORY_INVALID";
  throw error;
}

function normalizedRepoRoot(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot.trim().length === 0 || repoRoot.includes("\0")) fail();
  try {
    return resolve(repoRoot);
  } catch {
    fail();
  }
}

export function buildRecoveryGitEnvironment({ sourceEnvironment = process.env, repoRoot } = {}) {
  const repository = normalizedRepoRoot(repoRoot);
  const environment = {};
  for (const key of BASE_ENVIRONMENT_KEYS) {
    if (typeof sourceEnvironment?.[key] === "string") environment[key] = sourceEnvironment[key];
  }
  Object.assign(environment, {
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "safe.directory",
    GIT_CONFIG_VALUE_0: "",
    GIT_CONFIG_KEY_1: "safe.directory",
    GIT_CONFIG_VALUE_1: repository,
  });
  return Object.freeze(environment);
}
