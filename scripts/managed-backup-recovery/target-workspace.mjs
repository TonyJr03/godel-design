import { createHash, randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises";
import { createServer } from "node:net";
import { join, relative, resolve, sep } from "node:path";

import { accessProductionRuntimeAuthority, MANAGED_BASELINE_MIGRATIONS } from "./runtime-authority.mjs";

export const TARGET_PORT_NAMES = Object.freeze(["api", "db", "shadow", "studio", "smtp", "analytics", "pooler", "inspector"]);
const PROJECT_ID_PATTERN = /^godel-m53-restore-[a-f0-9]{12}$/;

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryTargetWorkspaceError";
  error.code = code;
  throw error;
}

function contained(parent, candidate) {
  const value = relative(parent, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !value.startsWith("/") && !value.startsWith("\\"));
}

async function portableChmod(pathname, mode) {
  try { await chmod(pathname, mode); } catch (error) { if (!new Set(["EINVAL", "ENOTSUP", "EPERM"]).has(error?.code)) throw error; }
}

async function writeExclusive(pathname, content) {
  const handle = await open(pathname, "wx", 0o600);
  try { await handle.writeFile(content, "utf8"); } finally { await handle.close(); }
  await portableChmod(pathname, 0o600);
}

function replaceRootKey(source, key, value) {
  const pattern = new RegExp(`^${key}\\s*=\\s*[^\\r\\n]+`, "m");
  if (!pattern.test(source)) fail("RECOVERY_TARGET_CONFIG_INVALID", `Supabase config is missing ${key}`);
  return source.replace(pattern, `${key} = ${value}`);
}

function replaceSectionKey(source, section, key, value) {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(\\[${escaped}\\][\\s\\S]*?)(?=\\r?\\n\\[|$)`);
  const block = source.match(pattern)?.[1];
  if (!block) fail("RECOVERY_TARGET_CONFIG_INVALID", `Supabase config is missing [${section}]`);
  const keyPattern = new RegExp(`(^|\\r?\\n)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*[^\\r\\n]+`);
  if (!keyPattern.test(block)) fail("RECOVERY_TARGET_CONFIG_INVALID", `Supabase config is missing ${section}.${key}`);
  return source.replace(pattern, block.replace(keyPattern, `$1${key} = ${value}`));
}

export function createRecoveryProjectId({ random = randomBytes } = {}) {
  const bytes = random(6);
  if (!Buffer.isBuffer(bytes) || bytes.length < 6) fail("RECOVERY_TARGET_PROJECT_ID_INVALID", "Project ID random source is invalid");
  return `godel-m53-restore-${bytes.subarray(0, 6).toString("hex")}`;
}

export function assertRecoveryProjectId(projectId) {
  if (typeof projectId !== "string" || !PROJECT_ID_PATTERN.test(projectId)) fail("RECOVERY_TARGET_PROJECT_ID_INVALID", "Disposable project ID is invalid");
  return projectId;
}

export function validateTargetPorts(ports) {
  if (!ports || typeof ports !== "object" || Array.isArray(ports) || Object.keys(ports).length !== TARGET_PORT_NAMES.length) fail("RECOVERY_TARGET_PORTS_INVALID", "Target port map is incomplete");
  const values = TARGET_PORT_NAMES.map((name) => ports[name]);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1024 || value > 65535) || new Set(values).size !== values.length) {
    fail("RECOVERY_TARGET_PORTS_INVALID", "Target ports must be unique local user ports");
  }
  return Object.freeze(Object.fromEntries(TARGET_PORT_NAMES.map((name) => [name, ports[name]])));
}

export async function probeAvailableLocalPort() {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : accept(port));
    });
  });
}

export async function allocateTargetPorts({ probe = probeAvailableLocalPort } = {}) {
  if (typeof probe !== "function") fail("RECOVERY_TARGET_PORTS_INVALID", "Target port probe is invalid");
  const ports = {};
  const used = new Set();
  for (const name of TARGET_PORT_NAMES) {
    let selected;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const value = await probe(name);
      if (!Number.isSafeInteger(value)) fail("RECOVERY_TARGET_PORT_UNAVAILABLE", "A required target port is unavailable");
      if (!used.has(value)) { selected = value; break; }
    }
    if (selected === undefined) fail("RECOVERY_TARGET_PORT_UNAVAILABLE", "A distinct target port could not be reserved");
    ports[name] = selected;
    used.add(selected);
  }
  return validateTargetPorts(ports);
}

export function renderLocalTargetConfig(source, { projectId, ports } = {}) {
  assertRecoveryProjectId(projectId);
  validateTargetPorts(ports);
  if (typeof source !== "string" || source.length === 0 || source.includes("\0")) fail("RECOVERY_TARGET_CONFIG_INVALID", "Runtime Supabase config is invalid");
  let output = replaceRootKey(source, "project_id", JSON.stringify(projectId));
  for (const [section, key, value] of [
    ["api", "port", ports.api], ["db", "port", ports.db], ["db", "shadow_port", ports.shadow],
    ["db.pooler", "port", ports.pooler], ["studio", "port", ports.studio], ["local_smtp", "port", ports.smtp],
    ["edge_runtime", "inspector_port", ports.inspector], ["analytics", "port", ports.analytics],
  ]) output = replaceSectionKey(output, section, key, String(value));
  output = replaceSectionKey(output, "db.seed", "enabled", "false");
  output = replaceSectionKey(output, "studio", "enabled", "false");
  output = replaceSectionKey(output, "local_smtp", "enabled", "false");
  output = replaceSectionKey(output, "realtime", "enabled", "false");
  output = replaceSectionKey(output, "edge_runtime", "enabled", "false");
  output = replaceSectionKey(output, "analytics", "enabled", "false");
  output = replaceSectionKey(output, "auth", "site_url", JSON.stringify(`http://127.0.0.1:${ports.api}`));
  output = replaceSectionKey(output, "auth", "additional_redirect_urls", JSON.stringify([`http://127.0.0.1:${ports.api}/auth/callback`]));
  output = replaceSectionKey(output, "studio", "api_url", JSON.stringify(`http://127.0.0.1:${ports.api}`));
  const activeConfig = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).join("\n");
  if (/https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\])/i.test(activeConfig)) fail("RECOVERY_TARGET_CONFIG_REMOTE_URL", "Target config retains a non-local URL");
  if (/\.temp[\\/]project-ref|SUPABASE_(?:ACCESS_TOKEN|PROJECT_REF|DB_PASSWORD)/i.test(activeConfig)) fail("RECOVERY_TARGET_CONFIG_LINKED", "Target config contains linked project state");
  return output;
}

export async function materializeRecoveryTarget({ session, runtimeAuthority, projectId = createRecoveryProjectId(), ports } = {}) {
  assertRecoveryProjectId(projectId);
  validateTargetPorts(ports);
  if (!session || typeof session.target !== "string") fail("RECOVERY_TARGET_SESSION_INVALID", "Recovery session target is required");
  const state = await lstat(session.target).catch(() => null);
  if (!state?.isDirectory() || state.isSymbolicLink() || await realpath(session.target) !== resolve(session.target)) fail("RECOVERY_TARGET_ROOT_UNSAFE", "Recovery target root must be a real directory");
  if (session.root && !contained(resolve(session.root), resolve(session.target))) fail("RECOVERY_TARGET_ROOT_UNSAFE", "Recovery target escaped its session");
  if ((await readdir(session.target)).length !== 0) fail("RECOVERY_TARGET_NOT_EMPTY", "Recovery target must be initially empty");
  if (runtimeAuthority?.status !== "VERIFIED" || runtimeAuthority.evidence?.migrationCount !== 6) fail("RECOVERY_RUNTIME_AUTHORITY_REQUIRED", "Verified runtime authority is required");
  return accessProductionRuntimeAuthority(runtimeAuthority, async ({ config, migrations }) => {
    const names = migrations.map(({ name }) => name);
    if (names.some((name, index) => name !== MANAGED_BASELINE_MIGRATIONS[index])) fail("RECOVERY_RUNTIME_BASELINE_MISMATCH", "Runtime migrations do not match the governed baseline");
    const supabaseDir = join(session.target, "supabase");
    const migrationsDir = join(supabaseDir, "migrations");
    await mkdir(supabaseDir, { recursive: false, mode: 0o700 });
    await mkdir(migrationsDir, { recursive: false, mode: 0o700 });
    await portableChmod(supabaseDir, 0o700);
    await portableChmod(migrationsDir, 0o700);
    await writeExclusive(join(supabaseDir, "config.toml"), renderLocalTargetConfig(config, { projectId, ports }));
    for (const migration of migrations) {
      const pathname = join(migrationsDir, migration.name);
      await writeExclusive(pathname, migration.content);
      const materializedDigest = createHash("sha256").update(await readFile(pathname)).digest("hex");
      if (materializedDigest !== migration.sha256) fail("RECOVERY_TARGET_MIGRATION_DIGEST_MISMATCH", "Materialized baseline migration does not match Git authority");
    }
    const target = {
      status: "PREPARED",
      runtimeSha: runtimeAuthority.runtimeSha,
      ports,
      migrationDigests: runtimeAuthority.evidence.digests,
      baselineMigrationCount: 6,
    };
    for (const [name, value] of Object.entries({ projectId, workdir: session.target, supabaseDir })) Object.defineProperty(target, name, { value, enumerable: false });
    Object.defineProperty(target, "toJSON", { enumerable: false, value: () => ({ status: "PREPARED", baselineMigrationCount: 6, ports }) });
    return Object.freeze(target);
  });
}
