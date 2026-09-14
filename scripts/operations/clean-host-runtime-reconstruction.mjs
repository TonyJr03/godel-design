import { chmod, lstat, mkdir, open, readdir, readFile, rm } from "node:fs/promises";
import { get as httpGet } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { admitTransportedReconstructionInputs, parseInputAdmissionArgs } from "./clean-host-input-admission.mjs";
import { verifyBootstrapHelperReadiness } from "./clean-host-bootstrap.mjs";
import { knownTargetContainer } from "./clean-host-gate.mjs";
import { readReconstructionManifest } from "./portability-manifest.mjs";
import { createRecoveryDataPrimitives, readStorageXattrSidecar } from "./recovery-data-primitives.mjs";
import { assertActiveSecretGenerationMatches, assertNoGenerationMutationLock, acquireGenerationMutationLock, releaseGenerationMutationLock } from "./secret-generation.mjs";
import { verifyPullOnlyReadiness, parseGodelBuildConfiguration } from "./godel-image-build.mjs";
import { createSupabaseCleanHostDbUpInvocation, createSupabaseCleanHostFullUpInvocation, createSupabaseRuntimeComposeInvocation } from "./supabase-runtime-compose.mjs";
import { createGodelCleanHostFullUpInvocation, createGodelRuntimeComposeInvocation } from "./godel-runtime-compose.mjs";

const ROOT = resolve(import.meta.dirname, "../.."), LOCK = ".clean-host-runtime-reconstruction.lock";
const SUPABASE = ["studio", "api-gw", "auth", "rest", "realtime", "storage", "imgproxy", "meta", "functions", "db", "supavisor"], GODEL = ["app", "nginx"], TERMINAL = new Set(["exited", "created", "dead"]);
const DB_CONFIG_ENTRIES = ["conf.d", "extension-custom-scripts", "pgsodium_root.key", "read-replica.conf", "supautils.conf", "wal-g.conf"];
const execFileAsync = promisify(execFile);
function fail(code) { throw new Error(`CLEAN_HOST_RUNTIME_RECONSTRUCTION_${code}`); }
function labels(value) { return typeof value === "string" ? Object.fromEntries(value.split(",").filter(Boolean).map((entry) => entry.split("=", 2))) : value && typeof value === "object" ? value : {}; }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function same(left, right) { return left.length === right.length && new Set(left).size === left.length && left.every((item) => right.includes(item)); }
function targetProject(item, projects) { return projects.includes(labels(item.labels ?? item.Labels ?? item.Config?.Labels)["com.docker.compose.project"]); }
function targetContainer(item, projects) { return targetProject(item, projects) || [item?.name, item?.Name, item?.Names].flatMap((value) => typeof value === "string" ? value.split(",").map((name) => name.trim().replace(/^\//, "")) : []).some(knownTargetContainer); }
function service(item) { return labels(item.Config?.Labels ?? item.labels ?? item.Labels)["com.docker.compose.service"]; }
function image(config, name) { const value = config?.services?.[name]?.image; if (typeof value !== "string" || !value) throw new Error("compose image"); return value; }
function noPorts(value) { return value && (!Array.isArray(value.ports) || value.ports.length === 0); }
function paths(root) { const protectedRoot = resolve(root, "protected-recovery-material/selfhosted"); return { protectedRoot, lock: resolve(protectedRoot, LOCK), recoveryLock: resolve(protectedRoot, ".clean-host-data-restore.lock"), supabaseEnv: resolve(root, "infra/supabase/.env"), godelEnv: resolve(root, "compose.env.local"), pgdata: resolve(root, "infra/supabase/volumes/db/data"), storage: resolve(root, "infra/supabase/volumes/storage") }; }
function backupId(reconstruction) { const value = reconstruction?.manifest?.backup?.backupId; if (typeof value !== "string" || !value || value.length > 160) fail("RECONSTRUCTION_BACKUP_ID"); return value; }
function marker(reconstruction, status, phase, quiesce) { const base = { schemaVersion: 1, status, operationId: reconstruction.manifest.operationId, backupId: backupId(reconstruction), generationId: reconstruction.manifest.externalSecretGenerationId }; return JSON.stringify(status === "STARTED" ? { ...base, startedAt: new Date().toISOString() } : { ...base, phase, quiesce, failedAt: new Date().toISOString() }) + "\n"; }
function composeConfig(bytes) { const value = JSON.parse(String(bytes)); if (!plain(value) || !plain(value.services)) throw new Error("compose"); return value; }
function nginxPort(value) { const published = String(value?.published); if (!plain(value) || value.host_ip !== "127.0.0.1" || String(value.target) !== "8080" || !/^\d{1,5}$/.test(published) || Number(published) < 1 || Number(published) > 65535 || value.protocol !== "tcp") throw new Error("port"); return published; }

export function parseEffectiveRuntimeCompose({ supabase, godel }) {
  const supabaseConfig = composeConfig(supabase), godelConfig = composeConfig(godel);
  if (!same(Object.keys(supabaseConfig.services), SUPABASE) || SUPABASE.some((name) => !noPorts(supabaseConfig.services[name]))) throw new Error("supabase exposure");
  if (!same(Object.keys(godelConfig.services), GODEL) || !noPorts(godelConfig.services.app) || !Array.isArray(godelConfig.services.nginx?.ports) || godelConfig.services.nginx.ports.length !== 1) throw new Error("godel exposure");
  return Object.freeze({ supabase: supabaseConfig, godel: godelConfig, httpPort: nginxPort(godelConfig.services.nginx.ports[0]) });
}

export function createRuntimeFilesystemAdapter() { return {
  exists: async (path) => { try { await lstat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } },
  entry: (path) => lstat(path), entries: (path) => readdir(path), readFile: (path, encoding) => readFile(path, encoding),
  createDirectoryExclusive: async (path, mode) => { await mkdir(path, { mode }); await chmod(path, mode); },
  writeFileExclusive: async (path, bytes) => { const handle = await open(path, "wx", 0o600); try { await handle.writeFile(bytes); } finally { await handle.close(); } await chmod(path, 0o600); },
  removeDirectory: (path) => rm(path, { recursive: true, force: false }),
}; }
function healthRequest(url, timeoutMs = 5000) { return new Promise((resolveRequest, rejectRequest) => { const request = httpGet(url, (response) => { response.resume(); response.on("end", () => response.statusCode >= 200 && response.statusCode < 300 ? resolveRequest() : rejectRequest(new Error("health status"))); }); request.setTimeout(timeoutMs, () => request.destroy(new Error("health timeout"))); request.on("error", rejectRequest); }); }

export function createRuntimeDockerAdapter({ root = ROOT, runner = execFileAsync, request = healthRequest } = {}) {
  const call = (args, options = {}) => runner("docker", args, { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024, ...options });
  const compose = (invocation) => call(invocation.args, { env: invocation.environment });
  const rows = (bytes) => String(bytes).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const inspect = async (kind, name) => { const value = JSON.parse((await call([kind, "inspect", name])).stdout)?.[0]; if (!value) throw new Error("missing"); return value; };
  const inventory = async () => { const [containers, volumes, networks] = await Promise.all([call(["ps", "--all", "--format", "{{json .}}"]), call(["volume", "ls", "--format", "{{json .}}"]), call(["network", "ls", "--format", "{{json .}}"])]); return { containers: rows(containers.stdout), volumes: rows(volumes.stdout), networks: rows(networks.stdout) }; };
  const inspectContainers = async (items) => { const ids = items.map((item) => item.ID ?? item.Id ?? item.Names ?? item.Name).filter(Boolean); return ids.length ? JSON.parse((await call(["inspect", ...ids])).stdout) : []; };
  const projectContainers = async (project) => inspectContainers(rows((await call(["ps", "--all", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{json .}}"])).stdout));
  const allTargetContainers = async (contract) => inspectContainers((await inventory()).containers.filter((item) => targetContainer(item, [contract.supabaseComposeProject, contract.godelComposeProject])));
  const exactServices = async (project, expected) => { const containers = await projectContainers(project), names = containers.map(service); if (!same(names, expected) || new Set(names).size !== names.length) throw new Error("service inventory"); return containers; };
  const inspectNetwork = async (name) => { const value = await inspect("network", name); return { name: value.Name, driver: value.Driver, labels: value.Labels ?? {} }; };
  const inspectVolume = async (name) => { const value = await inspect("volume", name); return { name: value.Name, labels: value.Labels ?? {} }; };
  const assertContainer = (container, expectedImage, healthRequired) => { if (container?.State?.Status !== "running" || container?.Config?.Image !== expectedImage) throw new Error("container state"); if ((healthRequired || container?.Config?.Healthcheck != null) && container?.State?.Health?.Status !== "healthy") throw new Error("container health"); };
  return {
    runHelper: (args) => call(args), compose, inventory, inspectNetwork, inspectVolume,
    inspectLocalImage: async (name) => { const value = await inspect("image", name); return { os: value.Os, architecture: value.Architecture, imageId: value.Id }; },
    verifyRecoveredDbConfig: ({ image: helperImage, volume }) => call(["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "-v", `${volume}:/etc/postgresql-custom:ro`, "--entrypoint", "sh", helperImage, "-ceu", `test "$(ls -1A /etc/postgresql-custom | wc -l)" -eq 6; for entry in ${DB_CONFIG_ENTRIES.join(" ")}; do test -e "/etc/postgresql-custom/$entry"; done; test -f /etc/postgresql-custom/pgsodium_root.key; test -s /etc/postgresql-custom/pgsodium_root.key`]),
    effective: async (invocation) => (await compose(invocation)).stdout,
    verifyPreRuntimeTopology: async ({ manifest }) => {
      const contract = manifest.targetContract, projects = [contract.supabaseComposeProject, contract.godelComposeProject], volumeName = `${contract.supabaseComposeProject}_db-config`;
      const [network, volume, current] = await Promise.all([inspectNetwork(contract.operatorNetwork), inspectVolume(volumeName), inventory()]);
      if (network.name !== contract.operatorNetwork || network.driver !== "bridge" || volume.name !== volumeName || volume.labels["com.docker.compose.project"] !== contract.supabaseComposeProject || volume.labels["com.docker.compose.volume"] !== "db-config" || current.containers.some((item) => targetContainer(item, projects)) || current.networks.some((item) => ["supabase_default", "godel-runtime_stack"].includes(item.Name ?? item.name) || targetProject(item, projects)) || current.volumes.some((item) => ["godel-runtime_stack", `${contract.supabaseComposeProject}_deno-cache`].includes(item.Name ?? item.name) || ((item.Name ?? item.name) !== volumeName && targetProject(item, projects)))) throw new Error("pre-runtime topology");
    },
    verifyDb: async ({ contract, effective }) => { const containers = await exactServices(contract.supabaseComposeProject, ["db"]); assertContainer(containers[0], image(effective.supabase, "db"), true); },
    verifySupabase: async ({ contract, effective }) => { for (const container of await exactServices(contract.supabaseComposeProject, SUPABASE)) assertContainer(container, image(effective.supabase, service(container)), false); },
    verifyGodel: async ({ contract, effective }) => { for (const container of await exactServices(contract.godelComposeProject, GODEL)) assertContainer(container, image(effective.godel, service(container)), true); },
    verifyExposure: async ({ contract, effective }) => {
      const supabase = await exactServices(contract.supabaseComposeProject, SUPABASE), godel = await exactServices(contract.godelComposeProject, GODEL), app = godel.find((item) => service(item) === "app"), nginx = godel.find((item) => service(item) === "nginx"), bindings = nginx?.HostConfig?.PortBindings;
      if (supabase.some((item) => Object.keys(item?.HostConfig?.PortBindings ?? {}).length) || Object.keys(app?.HostConfig?.PortBindings ?? {}).length || !plain(bindings) || Object.keys(bindings).length !== 1 || !Array.isArray(bindings["8080/tcp"]) || bindings["8080/tcp"].length !== 1 || bindings["8080/tcp"][0]?.HostIp !== "127.0.0.1" || bindings["8080/tcp"][0]?.HostPort !== effective.httpPort) throw new Error("runtime exposure");
    },
    health: async (name, effective) => request(`http://127.0.0.1:${effective.httpPort}/api/health/${name}`, 5000),
    verifyRuntimeTopology: async ({ manifest }) => {
      const contract = manifest.targetContract, projects = [contract.supabaseComposeProject, contract.godelComposeProject], dbConfig = `${contract.supabaseComposeProject}_db-config`, denoCache = `${contract.supabaseComposeProject}_deno-cache`, current = await inventory();
      const networks = current.networks.filter((item) => targetProject(item, projects)), volumes = current.volumes.filter((item) => targetProject(item, projects));
      if (!same(networks.map((item) => item.Name ?? item.name), ["supabase_default", "godel-runtime_stack"]) || !same(volumes.map((item) => item.Name ?? item.name), [dbConfig, denoCache])) throw new Error("runtime topology");
      const [supabaseNetwork, godelNetwork, db, deno, operator] = await Promise.all([inspectNetwork("supabase_default"), inspectNetwork("godel-runtime_stack"), inspectVolume(dbConfig), inspectVolume(denoCache), inspectNetwork(contract.operatorNetwork)]);
      if (supabaseNetwork.labels["com.docker.compose.project"] !== contract.supabaseComposeProject || supabaseNetwork.labels["com.docker.compose.network"] !== "default" || godelNetwork.labels["com.docker.compose.project"] !== contract.godelComposeProject || godelNetwork.labels["com.docker.compose.network"] !== "stack" || operator.name !== contract.operatorNetwork || operator.driver !== "bridge" || db.labels["com.docker.compose.project"] !== contract.supabaseComposeProject || db.labels["com.docker.compose.volume"] !== "db-config" || deno.labels["com.docker.compose.project"] !== contract.supabaseComposeProject || deno.labels["com.docker.compose.volume"] !== "deno-cache") throw new Error("runtime topology");
    },
    quiesce: async ({ manifest }) => {
      const contract = manifest.targetContract; let complete = true, existing = [];
      try { existing = await allTargetContainers(contract); } catch { complete = false; }
      const group = (project, names) => existing.filter((item) => labels(item.Config?.Labels)["com.docker.compose.project"] === project && names.includes(service(item))).map(service);
      for (const [builder, names] of [[createGodelRuntimeComposeInvocation, group(contract.godelComposeProject, GODEL)], [createSupabaseRuntimeComposeInvocation, group(contract.supabaseComposeProject, SUPABASE.filter((name) => name !== "db"))], [createSupabaseRuntimeComposeInvocation, group(contract.supabaseComposeProject, ["db"])]] ) if (names.length) try { await compose(builder({ args: ["stop", ...names] })); } catch { complete = false; }
      try { if ((await allTargetContainers(contract)).some((item) => !TERMINAL.has(item?.State?.Status))) complete = false; } catch { complete = false; }
      return { state: complete ? "PASS" : "FAIL" };
    },
  };
}

async function directory(filesystem, path, mode, nonempty, code) { let entry, entries; try { [entry, entries] = await Promise.all([filesystem.entry(path), filesystem.entries(path)]); } catch { fail(code); } if (!entry.isDirectory() || entry.isSymbolicLink() || (entry.mode & 0o777) !== mode || (nonempty && !entries.length)) fail(code); }
async function environment(filesystem, path) { let entry; try { entry = await filesystem.entry(path); } catch { fail("ENVIRONMENT"); } if (!entry.isFile() || entry.isSymbolicLink() || (entry.mode & 0o777) !== 0o600) fail("ENVIRONMENT"); }
async function verifyLocalImages({ filesystem, docker, paths: value }) { const build = parseGodelBuildConfiguration(await filesystem.readFile(value.godelEnv)); for (const name of [`godel-design-app:${build.appTag}`, `godel-design-nginx:${build.nginxTag}`]) { let local; try { local = await docker.inspectLocalImage(name); } catch { fail("GODEL_IMAGES"); } if (local.os !== "linux" || local.architecture !== "amd64" || typeof local.imageId !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(local.imageId)) fail("GODEL_IMAGES"); } }
async function verifyPrivateExposure(docker) { try { const [supabase, godel] = await Promise.all([docker.effective(createSupabaseRuntimeComposeInvocation({ args: ["config", "--format", "json"] })), docker.effective(createGodelRuntimeComposeInvocation({ args: ["config", "--format", "json"] }))]); return parseEffectiveRuntimeCompose({ supabase, godel }); } catch { fail("EFFECTIVE_COMPOSE"); } }
async function successfulK({ reconstruction, value, filesystem, docker, helpers, primitives, backupPath, locked }) {
  if (await filesystem.exists(value.recoveryLock)) fail("BLOCKED_PARTIAL_RECOVERY_STATE");
  let root; try { root = await filesystem.entry(value.protectedRoot); } catch { fail("FOUNDATION_PROTECTED_ROOT"); }
  const expected = locked ? [LOCK, "external-secrets"] : ["external-secrets"];
  if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o777) !== 0o700 || !same((await filesystem.entries(value.protectedRoot)).sort(), expected.sort())) fail("FOUNDATION_PROTECTED_ROOT");
  await Promise.all([directory(filesystem, value.pgdata, 0o700, true, "RECOVERED_PGDATA"), directory(filesystem, value.storage, 0o755, true, "RECOVERED_STORAGE"), environment(filesystem, value.supabaseEnv), environment(filesystem, value.godelEnv)]);
  try { await docker.verifyPreRuntimeTopology({ manifest: reconstruction.manifest }); } catch { fail("FOUNDATION_DOCKER"); }
  try { await docker.verifyRecoveredDbConfig({ image: helpers.postgresImage, volume: `${reconstruction.manifest.targetContract.supabaseComposeProject}_db-config` }); await primitives.assertRestoredPgdata({ image: helpers.postgresImage, target: value.pgdata }); await primitives.assertRestoredStorage({ image: helpers.postgresImage, target: value.storage }); await readStorageXattrSidecar(resolve(backupPath, "storage"), "xattrs.json", filesystem.readFile); await primitives.verifyStorageXattrs({ image: helpers.storageImage, source: resolve(backupPath, "storage"), target: value.storage }); } catch { fail("RECOVERED_STATE"); }
}

export async function reconstructCleanHostRuntime({ manifestPath, backupPath, inputProtectedRoot, generationBundlePath, root = ROOT, apply = false, confirmed = false, readManifest = readReconstructionManifest, admit = admitTransportedReconstructionInputs, assertActive = assertActiveSecretGenerationMatches, assertNoLock = assertNoGenerationMutationLock, pullReady = verifyPullOnlyReadiness, helperReadiness = ({ manifest }) => verifyBootstrapHelperReadiness({ root, manifest }), filesystem = createRuntimeFilesystemAdapter(), docker = createRuntimeDockerAdapter({ root }), acquireLock = acquireGenerationMutationLock, releaseLock = releaseGenerationMutationLock, primitives, signalSource = process, hooks = {} } = {}) {
  let reconstruction; try { reconstruction = await readManifest({ manifestPath }); } catch { fail("MANIFEST"); } backupId(reconstruction);
  const manifest = reconstruction.manifest, value = paths(root), recovery = primitives ?? createRecoveryDataPrimitives({ runDocker: (args) => docker.runHelper(args), storageXattrImage: "supabase/storage-api:v1.60.4" });
  const admitExact = async () => { const result = await admit({ root, manifestPath, backupPath, inputProtectedRoot, generationBundlePath, readManifest: async () => reconstruction }); if (result?.state !== "PASS" || result.operationId !== manifest.operationId) fail("INPUT_ADMISSION"); };
  const active = () => assertActive({ protectedRoot: value.protectedRoot, generationId: manifest.externalSecretGenerationId, supabaseEnvPath: value.supabaseEnv, godelEnvPath: value.godelEnv });
  let helpers, effective;
  try { await admitExact(); await active(); await assertNoLock({ protectedRoot: value.protectedRoot }); helpers = await helperReadiness({ root, manifest }); await successfulK({ reconstruction, value, filesystem, docker, helpers, primitives: recovery, backupPath, locked: false }); await pullReady({ root, manifest }); await verifyLocalImages({ filesystem, docker, paths: value }); effective = await verifyPrivateExposure(docker); } catch (error) { if (error?.message?.startsWith("CLEAN_HOST_RUNTIME_RECONSTRUCTION_")) throw error; fail("PREFLIGHT"); }
  if (apply !== confirmed) fail("CONFIRMATION");
  if (!apply) return Object.freeze({ state: "VALIDATED_NOT_APPLIED", phase: "RUNTIME_RECONSTRUCTION", target: "clean-host-disposable-rehearsal", runtime: "NOT_STARTED" });
  if (!signalSource?.on || !signalSource?.off) fail("SIGNAL_SOURCE");
  let runtimeLock = false, generationLock, runtimeMutation = false, phase = "pre-lock", abortRequested = false;
  const requestAbort = () => { abortRequested = true; }, abort = () => abortRequested || hooks.abortRequested?.() === true, step = async (name, action) => { phase = name; await action(); if (abort()) fail("ABORTED"); };
  signalSource.on("SIGINT", requestAbort); signalSource.on("SIGTERM", requestAbort);
  try {
    try {
      await filesystem.createDirectoryExclusive(value.lock, 0o700); runtimeLock = true; await filesystem.writeFileExclusive(resolve(value.lock, "started.json"), marker(reconstruction, "STARTED")); generationLock = await acquireLock({ protectedRoot: value.protectedRoot, operation: "clean-host-runtime-reconstruction", generationId: manifest.externalSecretGenerationId });
      await admitExact(); await active(); await successfulK({ reconstruction, value, filesystem, docker, helpers, primitives: recovery, backupPath, locked: true }); await pullReady({ root, manifest }); await verifyLocalImages({ filesystem, docker, paths: value }); effective = await verifyPrivateExposure(docker); if (abort()) fail("ABORTED");
      runtimeMutation = true;
      await step("db-up", () => docker.compose(createSupabaseCleanHostDbUpInvocation())); await step("db-verify", () => docker.verifyDb({ contract: manifest.targetContract, effective })); await step("supabase-up", () => docker.compose(createSupabaseCleanHostFullUpInvocation())); await step("supabase-verify", () => docker.verifySupabase({ contract: manifest.targetContract, effective })); await step("godel-up", () => docker.compose(createGodelCleanHostFullUpInvocation())); await step("godel-verify", () => docker.verifyGodel({ contract: manifest.targetContract, effective })); await step("actual-exposure", () => docker.verifyExposure({ contract: manifest.targetContract, effective })); await step("live", () => docker.health("live", effective)); await step("ready", () => docker.health("ready", effective)); await step("final-generation", active); await step("final-supabase", () => docker.verifySupabase({ contract: manifest.targetContract, effective })); await step("final-godel", () => docker.verifyGodel({ contract: manifest.targetContract, effective })); await step("final-exposure", () => docker.verifyExposure({ contract: manifest.targetContract, effective })); await step("final-topology", () => docker.verifyRuntimeTopology({ manifest }));
    } catch (error) {
      if (!runtimeMutation) { try { if (generationLock) await releaseLock(generationLock); if (runtimeLock) await filesystem.removeDirectory(value.lock); } catch { fail("PRE_RUNTIME_LOCK_CLEANUP"); } if (error?.message?.startsWith("CLEAN_HOST_RUNTIME_RECONSTRUCTION_")) throw error; fail("PRE_RUNTIME"); }
      let quiesced; try { quiesced = await docker.quiesce({ manifest }); } catch { quiesced = { state: "FAIL" }; }
      if (quiesced?.state !== "PASS") { try { await filesystem.writeFileExclusive(resolve(value.lock, "failed.json"), marker(reconstruction, "FAILED_AFTER_RUNTIME_MUTATION", phase, "FAILED")); } catch { fail("BLOCKED_PARTIAL_RUNTIME_STATE_QUIESCE_FAILED_MARKER_FAILED"); } fail("BLOCKED_PARTIAL_RUNTIME_STATE_QUIESCE_FAILED"); }
      try { await filesystem.writeFileExclusive(resolve(value.lock, "failed.json"), marker(reconstruction, "FAILED_AFTER_RUNTIME_MUTATION", phase, "PASS")); } catch { fail("BLOCKED_PARTIAL_RUNTIME_STATE_MARKER_FAILED"); } fail("BLOCKED_PARTIAL_RUNTIME_STATE");
    }
    try { await releaseLock(generationLock); await filesystem.removeDirectory(value.lock); } catch { fail("POST_RUNTIME_LOCK_CLEANUP_FAILED"); }
    return Object.freeze({ state: "PASS", phase: "RUNTIME_RECONSTRUCTION", target: "clean-host-disposable-rehearsal", postgres: "HEALTHY", supabase: "HEALTHY", godel: "HEALTHY", applicationLive: "PASS", applicationReady: "PASS", exposure: "PRIVATE_LOOPBACK", generation: "ACTIVE_MATCH", runtime: "RUNNING" });
  } finally { signalSource.off("SIGINT", requestAbort); signalSource.off("SIGTERM", requestAbort); }
}
export function parseRuntimeReconstructionArgs(args, root = ROOT) { const apply = args.includes("--apply"), confirmed = args.includes("--confirm-runtime-clean-host-rehearsal"), input = args.filter((arg) => !["--apply", "--confirm-runtime-clean-host-rehearsal"].includes(arg)); try { return { ...parseInputAdmissionArgs(input, root), apply, confirmed }; } catch { fail("PATH"); } }
export function renderRuntimeReconstructionResult(result) { return `${JSON.stringify(result)}\n`; }
export function renderRuntimeReconstructionFailure(error) { return `FAIL ${error?.message?.startsWith("CLEAN_HOST_RUNTIME_RECONSTRUCTION_") ? error.message : "CLEAN_HOST_RUNTIME_RECONSTRUCTION_FAILED"}\n`; }
if (import.meta.main) { try { process.stdout.write(renderRuntimeReconstructionResult(await reconstructCleanHostRuntime(parseRuntimeReconstructionArgs(process.argv.slice(2))))); } catch (error) { process.stderr.write(renderRuntimeReconstructionFailure(error)); process.exitCode = 1; } }
