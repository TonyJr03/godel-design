import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { readReconstructionManifest } from "./portability-manifest.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "../..");
const TARGET = "clean-host-disposable-rehearsal";
const SUPABASE_CONTAINER_NAMES = new Set(["supabase-studio", "supabase-envoy", "supabase-auth", "supabase-rest", "realtime-dev.supabase-realtime", "supabase-storage", "supabase-imgproxy", "supabase-meta", "supabase-edge-functions", "supabase-db", "supabase-pooler"]);
const GODEL_IMAGES = Object.freeze(["godel-design-app", "godel-design-nginx"]);

function fail(code) { throw new Error(`CLEAN_HOST_${code}`); }
function architecture(value) { return value === "x64" || value === "x86_64" || value === "amd64" ? "amd64" : null; }
function labels(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  return Object.fromEntries(value.split(",").map((part) => part.split("=", 2)).filter(([key, item]) => key && item));
}
function isTargetProject(value, projects) { return projects.includes(labels(value)["com.docker.compose.project"]); }
function knownTargetContainer(name) { return SUPABASE_CONTAINER_NAMES.has(name) || /^godel-runtime[-_](?:app|nginx)(?:[-_]\d+)?$/.test(name ?? ""); }
function godelImage(repository) { return GODEL_IMAGES.includes(repository); }
function parseJsonLines(value) { return value.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
function parseDockerRows(value) { return parseJsonLines(value).map((row) => ({ name: row.Names ?? row.Name ?? "", repository: row.Repository ?? "", labels: labels(row.Labels) })); }

async function command(commandName, args, cwd, runner = execFileAsync) {
  const result = await runner(commandName, args, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 });
  return typeof result === "string" ? result.trim() : String(result.stdout ?? "").trim();
}

export function createDefaultAdapters({ root = ROOT, runner } = {}) {
  const call = (binary, args) => command(binary, args, root, runner);
  return {
    host: { platform: process.platform, architecture: process.arch },
    git: { clean: async () => !(await call("git", ["status", "--porcelain"])), head: async () => call("git", ["rev-parse", "HEAD"]) },
    docker: {
      identity: async () => { const [os, value] = (await call("docker", ["version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"])).split("/", 2); return { os, architecture: value }; },
      composeVersion: async () => call("docker", ["compose", "version", "--short"]),
      buildxVersion: async () => call("docker", ["buildx", "version"]),
      inventory: async () => {
        const [containers, volumes, networks, images] = await Promise.all([call("docker", ["ps", "--all", "--format", "{{json .}}"]), call("docker", ["volume", "ls", "--format", "{{json .}}"]), call("docker", ["network", "ls", "--format", "{{json .}}"]), call("docker", ["image", "ls", "--format", "{{json .}}"])]);
        return { containers: parseDockerRows(containers), volumes: parseDockerRows(volumes), networks: parseDockerRows(networks), images: parseDockerRows(images) };
      },
    },
    filesystem: { exists: async (path) => { try { await lstat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; fail("FILESYSTEM_UNREADABLE"); } } },
  };
}

export function filesystemContract(root = ROOT) {
  return { runtimeEnv: [resolve(root, "infra/supabase/.env"), resolve(root, "compose.env.local")], pgdata: [resolve(root, "infra/supabase/volumes/db/data")], storage: [resolve(root, "infra/supabase/volumes/storage")], secretRegistry: [resolve(root, "protected-recovery-material/selfhosted/external-secrets")], recoveryState: [resolve(root, "backups/selfhosted"), resolve(root, "protected-recovery-material/selfhosted")] };
}

export async function collectHostIdentity({ host, git, manifest }) {
  if (host?.platform !== "linux" || architecture(host?.architecture) !== "amd64" || manifest.platform?.os !== "linux" || manifest.platform?.architecture !== "amd64") fail("WRONG_PLATFORM");
  let clean; try { clean = await git.clean(); } catch { fail("GIT_UNAVAILABLE"); }
  if (!clean) fail("REPOSITORY_DIRTY");
  let head; try { head = await git.head(); } catch { fail("GIT_UNAVAILABLE"); }
  if (head !== manifest.repository.gitCommit) fail("GIT_MISMATCH");
  return { platform: "linux/amd64", checkout: "EXACT" };
}

export async function collectDockerInventory({ docker, targetContract }) {
  let identity; try { identity = await docker.identity(); } catch { fail("DOCKER_UNAVAILABLE"); }
  if (identity?.os !== "linux" || architecture(identity?.architecture) !== "amd64") fail("DOCKER_WRONG_PLATFORM");
  let composeVersion; try { composeVersion = await docker.composeVersion(); } catch { fail("COMPOSE_V2_REQUIRED"); }
  if (!/^v?2\./.test(composeVersion ?? "")) fail("COMPOSE_V2_REQUIRED");
  try { if (!await docker.buildxVersion()) fail("BUILDX_REQUIRED"); } catch { fail("BUILDX_REQUIRED"); }
  let inventory; try { inventory = await docker.inventory(); } catch { fail("DOCKER_INVENTORY_UNAVAILABLE"); }
  const projects = [targetContract.supabaseComposeProject, targetContract.godelComposeProject];
  const containers = inventory?.containers ?? [], volumes = inventory?.volumes ?? [], networks = inventory?.networks ?? [], images = inventory?.images ?? [];
  if (containers.some((item) => isTargetProject(item.labels, projects) || knownTargetContainer(item.name))) fail("TARGET_CONTAINER_PRESENT");
  if (volumes.some((item) => isTargetProject(item.labels, projects) || item.name === `${targetContract.supabaseComposeProject}_db-config`)) fail("TARGET_VOLUME_PRESENT");
  if (networks.some((item) => item.name === targetContract.operatorNetwork || isTargetProject(item.labels, projects))) fail("TARGET_NETWORK_PRESENT");
  if (images.some((item) => godelImage(item.repository))) fail("GODEL_IMAGE_PRESENT");
  return { docker: "PASS", compose: "PASS", buildx: "PASS", targetContainers: "ABSENT", targetVolumes: "ABSENT", targetNetwork: "ABSENT", godelBuiltImages: "ABSENT", unrelatedContainerCount: containers.length, pullOnlyCacheCandidates: images.length };
}

export async function collectFilesystemState({ filesystem, contract }) {
  const hasAny = async (paths) => (await Promise.all(paths.map((path) => filesystem.exists(path)))).some(Boolean);
  if (await hasAny(contract.runtimeEnv)) fail("RUNTIME_ENV_PRESENT");
  if (await hasAny(contract.pgdata)) fail("PGDATA_PRESENT");
  if (await hasAny(contract.storage)) fail("STORAGE_PRESENT");
  if (await hasAny(contract.secretRegistry)) fail("SECRET_REGISTRY_PRESENT");
  if (await hasAny(contract.recoveryState)) fail("RECOVERY_STATE_PRESENT");
  return { runtimeEnv: "ABSENT", pgdata: "ABSENT", storage: "ABSENT", secretRegistry: "ABSENT" };
}

export async function evaluateCleanHostGate({ manifestPath, root = ROOT, adapters, readManifest = readReconstructionManifest } = {}) {
  if (typeof manifestPath !== "string" || !manifestPath || manifestPath.includes("\0")) fail("MANIFEST_PATH");
  let loaded; try { loaded = await readManifest({ manifestPath }); } catch { fail("MANIFEST_INVALID"); }
  const manifest = loaded?.manifest; if (!manifest) fail("MANIFEST_INVALID");
  const value = { ...createDefaultAdapters({ root }), ...adapters };
  const host = await collectHostIdentity({ host: value.host, git: value.git, manifest });
  const docker = await collectDockerInventory({ docker: value.docker, targetContract: manifest.targetContract });
  const filesystem = await collectFilesystemState({ filesystem: value.filesystem, contract: filesystemContract(root) });
  return Object.freeze({ state: "PASS", target: TARGET, ...host, ...docker, ...filesystem });
}

export function parseCleanHostGateArgs(args) { if (args.length !== 2 || args[0] !== "--manifest" || !args[1] || args[1].includes("\0")) fail("ARGUMENTS"); return { manifestPath: args[1] }; }
export function renderCleanHostGateResult(result) { return `${JSON.stringify(result)}\n`; }
export function renderCleanHostGateFailure(error) { return `FAIL ${error?.message?.startsWith("CLEAN_HOST_") ? error.message : "CLEAN_HOST_FAILED"}\n`; }
if (import.meta.main) { try { process.stdout.write(renderCleanHostGateResult(await evaluateCleanHostGate(parseCleanHostGateArgs(process.argv.slice(2))))); } catch (error) { process.stderr.write(renderCleanHostGateFailure(error)); process.exitCode = 1; } }
