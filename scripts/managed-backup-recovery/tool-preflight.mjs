import { runCommand } from "../managed-backup/command-runner.mjs";
import { admitRepoLocalSupabaseCli } from "../managed-backup/production-execution.mjs";

const EXPECTED_AGE_VERSION = "1.3.1";

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryToolPreflightError";
  error.code = code;
  throw error;
}

function systemEnvironment(source = {}) {
  const output = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (typeof source[key] === "string") output[key] = source[key];
  }
  return output;
}

function firstVersion(source, tool) {
  const clean = String(source ?? "").replace(/\x1b\[[0-9;]*m/g, "").replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  const match = clean.match(/(?:^|\s|\()v?(\d+(?:\.\d+){1,3})(?=\s|\/|\)|$)/);
  if (!match) fail("RECOVERY_TOOL_VERSION_INVALID", `${tool} did not report a supported version`);
  return match[1];
}

export async function preflightManagedRecoveryTools({
  environment = process.env,
  repoRoot = process.cwd(),
  execute = runCommand,
  admitSupabaseCli = admitRepoLocalSupabaseCli,
} = {}) {
  if (typeof execute !== "function" || typeof admitSupabaseCli !== "function") fail("RECOVERY_TOOL_PREFLIGHT_INVALID", "Recovery tool preflight adapters are invalid");
  const allowedEnvironment = systemEnvironment(environment);
  const invoke = async (name, executable, args) => {
    try {
      const result = await execute({ operation: `preflight managed recovery ${name}`, executable, args, cwd: repoRoot, allowedEnvironment });
      return firstVersion(`${result.stdout ?? ""}\n${result.stderr ?? ""}`, name);
    } catch (error) {
      if (error?.code === "RECOVERY_TOOL_VERSION_INVALID") throw error;
      fail("RECOVERY_TOOL_REQUIRED", `${name} is required for managed recovery`);
    }
  };

  const supabase = await admitSupabaseCli({ repoRoot });
  const tools = [
    { name: "node", present: true, version: firstVersion(process.version, "node") },
    { name: "age", present: true, version: await invoke("age", "age", ["--version"]) },
    { name: "tar", present: true, version: await invoke("tar", "tar", ["--version"]) },
    { name: "rclone", present: true, version: await invoke("rclone", "rclone", ["version"]) },
    { name: "docker", present: true, version: await invoke("docker", "docker", ["version", "--format", "{{.Client.Version}}/{{.Server.Version}}"]) },
    { name: "supabase", present: true, version: supabase.version },
  ];
  if (tools.find((entry) => entry.name === "age").version !== EXPECTED_AGE_VERSION) {
    fail("RECOVERY_AGE_VERSION_MISMATCH", "age version does not match the governed recovery baseline");
  }
  return Object.freeze(tools.map((entry) => Object.freeze(entry)));
}
