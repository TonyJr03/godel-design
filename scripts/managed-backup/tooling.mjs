import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCommand } from "./command-runner.mjs";

const TOOL_NAMES = ["node", "npm", "supabase", "docker", "pg_dump", "psql", "age", "rclone", "aws"];

function explicitDiscoveryEnvironment(source = process.env) {
  const output = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (typeof source[key] === "string") output[key] = source[key];
  }
  return output;
}

function firstLine(value) {
  const sanitized = String(value ?? "")
    .split(/\r?\n/, 1)[0]
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 200);
  return sanitized || null;
}

async function probeCommand({ name, executable, args, cwd, runner, environment }) {
  try {
    const result = await runner({ operation: `discover ${name}`, executable, args, cwd, allowedEnvironment: environment });
    return { name, present: true, version: firstLine(result.stdout || result.stderr) };
  } catch {
    return { name, present: false, version: null };
  }
}

async function discoverLocalSupabase(repoRoot) {
  const packagePath = join(repoRoot, "node_modules", "supabase", "package.json");
  const binaryPath = join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  try {
    const [metadata, state] = await Promise.all([readFile(packagePath, "utf8"), lstat(binaryPath)]);
    const version = JSON.parse(metadata).version;
    if (!state.isFile() || typeof version !== "string") throw new Error("invalid local CLI");
    return { name: "supabase", present: true, version };
  } catch {
    return { name: "supabase", present: false, version: null };
  }
}

export async function discoverManagedBackupTools({ repoRoot = process.cwd(), runner = runCommand } = {}) {
  const cwd = repoRoot;
  const environment = explicitDiscoveryEnvironment();
  const npmCliPath = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const npmViaNode = process.platform === "win32" && await lstat(npmCliPath).then((state) => state.isFile()).catch(() => false);
  const probes = await Promise.all([
    probeCommand({
      name: "npm",
      executable: npmViaNode ? process.execPath : "npm",
      args: npmViaNode ? [npmCliPath, "--version"] : ["--version"],
      cwd,
      runner,
      environment,
    }),
    probeCommand({ name: "docker", executable: "docker", args: ["--version"], cwd, runner, environment }),
    probeCommand({ name: "pg_dump", executable: "pg_dump", args: ["--version"], cwd, runner, environment }),
    probeCommand({ name: "psql", executable: "psql", args: ["--version"], cwd, runner, environment }),
    probeCommand({ name: "age", executable: "age", args: ["--version"], cwd, runner, environment }),
    probeCommand({ name: "rclone", executable: "rclone", args: ["version"], cwd, runner, environment }),
    probeCommand({ name: "aws", executable: "aws", args: ["--version"], cwd, runner, environment }),
  ]);
  const docker = probes.find((entry) => entry.name === "docker");
  if (docker?.present) {
    const engine = await probeCommand({ name: "docker", executable: "docker", args: ["version", "--format", "{{.Server.Version}}"], cwd, runner, environment });
    docker.version = `${docker.version}; engine ${engine.present ? engine.version : "unavailable"}`;
  }
  const discovered = [
    { name: "node", present: true, version: process.version },
    ...probes,
    await discoverLocalSupabase(repoRoot),
  ];
  const byName = new Map(discovered.map((entry) => [entry.name, entry]));
  return TOOL_NAMES.map((name) => byName.get(name));
}

export function toManifestToolVersions(discovery) {
  return discovery.map(({ name, present, version }) => ({ name, present, version }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const discovery = await discoverManagedBackupTools({ repoRoot });
  process.stdout.write(`${JSON.stringify(discovery, null, 2)}\n`);
}
