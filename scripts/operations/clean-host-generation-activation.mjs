import { chmod, lstat, mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { execFile } from "node:child_process";
import { admitTransportedReconstructionInputs, parseInputAdmissionArgs } from "./clean-host-input-admission.mjs";
import { verifyBootstrapHelperReadiness } from "./clean-host-bootstrap.mjs";
import { knownTargetContainer } from "./clean-host-gate.mjs";
import { readReconstructionManifest } from "./portability-manifest.mjs";
import { assertActiveSecretGenerationMatches } from "./secret-generation.mjs";
import { SECRET_GENERATION_BUNDLE_FILES, assertProtectedTransportPath, importSecretGenerationBundle, readSecretGenerationBundle } from "./secret-generation-transport.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const REQUIRED_DB_CONFIG_ENTRIES = ["conf.d", "extension-custom-scripts", "read-replica.conf", "supautils.conf", "wal-g.conf"];
const execFileAsync = promisify(execFile);

function fail(code) { throw new Error(`CLEAN_HOST_GENERATION_ACTIVATION_${code}`); }
function labels(value) { return typeof value === "string" ? Object.fromEntries(value.split(",").filter(Boolean).map((entry) => entry.split("=", 2))) : value && typeof value === "object" ? value : {}; }
function targetProject(item, projects) { return projects.includes(labels(item.labels ?? item.Labels)["com.docker.compose.project"]); }
function targetContainer(item, projects) { return targetProject(item, projects) || [item?.name, item?.Name, item?.Names].flatMap((value) => typeof value === "string" ? value.split(",").map((name) => name.trim().replace(/^\//, "")) : []).some(knownTargetContainer); }
function unexpectedTargetResources(inventory, projects, expectedNetwork, expectedVolume) { return (inventory.containers ?? []).some((item) => targetContainer(item, projects)) || (inventory.networks ?? []).some((item) => (item.name ?? item.Name) !== expectedNetwork && targetProject(item, projects)) || (inventory.volumes ?? []).some((item) => (item.name ?? item.Name) !== expectedVolume && targetProject(item, projects)); }
function targetPaths(root) { const targetProtectedRoot = resolve(root, "protected-recovery-material/selfhosted"); return { targetProtectedRoot, staging: null, supabaseEnvPath: resolve(root, "infra/supabase/.env"), godelEnvPath: resolve(root, "compose.env.local"), pgdata: resolve(root, "infra/supabase/volumes/db/data"), storage: resolve(root, "infra/supabase/volumes/storage") }; }

export function createGenerationActivationFilesystemAdapter() {
  return {
    exists: async (path) => { try { await lstat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } },
    entry: (path) => lstat(path),
    entries: (path) => readdir(path),
    readFile: (path) => readFile(path),
    createDirectory: async (path, mode) => { await mkdir(path, { mode }); await chmod(path, mode); },
    writeFileExclusive: async (path, bytes) => { const handle = await open(path, "wx", 0o600); try { await handle.writeFile(bytes); } finally { await handle.close(); } await chmod(path, 0o600); },
    removeDirectory: (path) => rm(path, { recursive: true, force: false }),
  };
}

export function createGenerationActivationDockerAdapter({ root = ROOT, runner = execFileAsync } = {}) {
  const call = async (args) => runner("docker", args, { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024 });
  const inspect = async (kind, name) => { const parsed = JSON.parse((await call([kind, "inspect", name])).stdout); if (!parsed?.[0]) throw new Error("missing"); return parsed[0]; };
  const rows = (bytes) => String(bytes).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  return {
    inventory: async () => { const [containers, volumes, networks] = await Promise.all([call(["ps", "--all", "--format", "{{json .}}"]), call(["volume", "ls", "--format", "{{json .}}"]), call(["network", "ls", "--format", "{{json .}}"])]); return { containers: rows(containers.stdout), volumes: rows(volumes.stdout), networks: rows(networks.stdout) }; },
    inspectNetwork: async (name) => { const value = await inspect("network", name); return { name: value.Name, driver: value.Driver }; },
    inspectVolume: async (name) => { const value = await inspect("volume", name); return { name: value.Name, labels: value.Labels ?? {} }; },
    verifyDbConfig: async ({ image, volume }) => { const check = `test "$(ls -1A /etc/postgresql-custom | wc -l)" -eq 5; for entry in ${REQUIRED_DB_CONFIG_ENTRIES.join(" ")}; do test -e /etc/postgresql-custom/$entry; done; test ! -e /etc/postgresql-custom/pgsodium_root.key`; await call(["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "-v", `${volume}:/etc/postgresql-custom:ro`, "--entrypoint", "sh", image, "-ceu", check]); },
  };
}

async function assertDirectory(filesystem, path, mode, empty = false) {
  let entry, entries;
  try { [entry, entries] = await Promise.all([filesystem.entry(path), filesystem.entries(path)]); } catch { fail("FOUNDATION_DIRECTORY"); }
  if (!entry.isDirectory() || entry.isSymbolicLink() || (mode && (entry.mode & 0o777) !== mode) || (empty && entries.length)) fail("FOUNDATION_DIRECTORY");
}
async function assertAbsent(filesystem, paths) { try { if ((await Promise.all(paths.map((path) => filesystem.exists(path)))).some(Boolean)) fail("FOUNDATION_NOT_EMPTY"); } catch (error) { if (error?.message?.startsWith("CLEAN_HOST_GENERATION_ACTIVATION_")) throw error; fail("FOUNDATION_FILESYSTEM"); } }
async function assertEnvironment(filesystem, path) { let entry; try { entry = await filesystem.entry(path); } catch { fail("FINAL_ENVIRONMENT"); } if (!entry.isFile() || entry.isSymbolicLink() || (entry.mode & 0o777) !== 0o600) fail("FINAL_ENVIRONMENT"); }

async function verifyFoundation({ manifest, paths, filesystem, docker, helperReadiness }) {
  await Promise.all([assertDirectory(filesystem, paths.targetProtectedRoot, 0o700, true), assertDirectory(filesystem, paths.pgdata, 0o700, true), assertDirectory(filesystem, paths.storage, 0o755, true)]);
  await assertAbsent(filesystem, [paths.supabaseEnvPath, paths.godelEnvPath, resolve(paths.targetProtectedRoot, "external-secrets")]);
  const volumeName = `${manifest.targetContract.supabaseComposeProject}_db-config`, projects = [manifest.targetContract.supabaseComposeProject, manifest.targetContract.godelComposeProject];
  let network, volume, inventory, helpers;
  try { [network, volume, inventory, helpers] = await Promise.all([docker.inspectNetwork(manifest.targetContract.operatorNetwork), docker.inspectVolume(volumeName), docker.inventory(), helperReadiness({ manifest })]); } catch { fail("FOUNDATION_DOCKER"); }
  if (network.name !== manifest.targetContract.operatorNetwork || network.driver !== "bridge" || volume.name !== volumeName || volume.labels["com.docker.compose.project"] !== manifest.targetContract.supabaseComposeProject || volume.labels["com.docker.compose.volume"] !== "db-config" || unexpectedTargetResources(inventory, projects, manifest.targetContract.operatorNetwork, volumeName)) fail("FOUNDATION_DOCKER");
  try { await docker.verifyDbConfig({ image: helpers.postgresImage, volume: volumeName }); } catch { fail("FOUNDATION_DB_CONFIG"); }
  return helpers;
}

async function verifyFinalFoundation({ manifest, paths, filesystem, docker, helperReadiness }) {
  await Promise.all([assertDirectory(filesystem, paths.targetProtectedRoot, 0o700), assertDirectory(filesystem, paths.pgdata, 0o700, true), assertDirectory(filesystem, paths.storage, 0o755, true)]);
  const volumeName = `${manifest.targetContract.supabaseComposeProject}_db-config`, projects = [manifest.targetContract.supabaseComposeProject, manifest.targetContract.godelComposeProject];
  let network, volume, inventory, helpers;
  try { [network, volume, inventory, helpers] = await Promise.all([docker.inspectNetwork(manifest.targetContract.operatorNetwork), docker.inspectVolume(volumeName), docker.inventory(), helperReadiness({ manifest })]); } catch { fail("FINAL_FOUNDATION_DOCKER"); }
  if (network.name !== manifest.targetContract.operatorNetwork || network.driver !== "bridge" || volume.name !== volumeName || volume.labels["com.docker.compose.project"] !== manifest.targetContract.supabaseComposeProject || volume.labels["com.docker.compose.volume"] !== "db-config" || unexpectedTargetResources(inventory, projects, manifest.targetContract.operatorNetwork, volumeName)) fail("FINAL_FOUNDATION_DOCKER");
  try { await docker.verifyDbConfig({ image: helpers.postgresImage, volume: volumeName }); } catch { fail("FINAL_FOUNDATION_DB_CONFIG"); }
}

function assertSourceBinding(reconstruction, source) {
  const manifest = reconstruction.manifest;
  if (source.bundle.generationId !== manifest.externalSecretGenerationId || source.bundle.reconstruction.operationId !== manifest.operationId || source.bundle.reconstruction.manifestSha256 !== reconstruction.manifestSha256) fail("SOURCE_BUNDLE_BINDING");
}
async function readSourceBundle({ reconstruction, inputProtectedRoot, generationBundlePath, assertBundlePath, readBundle, filesystem }) {
  let bundlePath, source, commit;
  try { bundlePath = await assertBundlePath({ protectedRoot: inputProtectedRoot, path: generationBundlePath, code: "BUNDLE_PATH" }); source = await readBundle({ bundlePath }); commit = await filesystem.readFile(join(bundlePath, SECRET_GENERATION_BUNDLE_FILES.commit)); } catch { fail("SOURCE_BUNDLE"); }
  assertSourceBinding(reconstruction, source);
  return { bundlePath, source, commit };
}
async function stageBundle({ paths, reconstruction, source, commit, filesystem, assertBundlePath, readBundle }) {
  const staging = resolve(paths.targetProtectedRoot, `.incoming-generation-${reconstruction.manifest.operationId}`);
  try { await assertBundlePath({ protectedRoot: paths.targetProtectedRoot, path: staging, code: "STAGING_PATH" }); await filesystem.createDirectory(staging, 0o700); await assertDirectory(filesystem, staging, 0o700, true); } catch (error) { if (error?.message?.startsWith("CLEAN_HOST_GENERATION_ACTIVATION_")) throw error; fail("STAGING_CREATE"); }
  try {
    for (const [name, bytes] of [[SECRET_GENERATION_BUNDLE_FILES.metadata, source.metadataBytes], [SECRET_GENERATION_BUNDLE_FILES.supabaseEnv, source.supabaseSnapshot], [SECRET_GENERATION_BUNDLE_FILES.godelEnv, source.godelSnapshot], [SECRET_GENERATION_BUNDLE_FILES.commit, commit]]) await filesystem.writeFileExclusive(join(staging, name), bytes);
    const staged = await readBundle({ bundlePath: staging });
    if (!isDeepStrictEqual(source.bundle, staged.bundle) || !source.metadataBytes.equals(staged.metadataBytes) || !source.supabaseSnapshot.equals(staged.supabaseSnapshot) || !source.godelSnapshot.equals(staged.godelSnapshot) || !(await filesystem.readFile(join(staging, SECRET_GENERATION_BUNDLE_FILES.commit))).equals(commit)) fail("STAGED_BUNDLE_MISMATCH");
  } catch (error) { if (error?.message?.startsWith("CLEAN_HOST_GENERATION_ACTIVATION_")) throw error; fail("STAGED_BUNDLE"); }
  return staging;
}

export async function activateCleanHostGeneration({ manifestPath, backupPath, inputProtectedRoot, generationBundlePath, root = ROOT, apply = false, admit = admitTransportedReconstructionInputs, readManifest = readReconstructionManifest, assertBundlePath = assertProtectedTransportPath, readBundle = readSecretGenerationBundle, importBundle = importSecretGenerationBundle, assertActive = assertActiveSecretGenerationMatches, helperReadiness = ({ manifest }) => verifyBootstrapHelperReadiness({ root, manifest }), filesystem = createGenerationActivationFilesystemAdapter(), docker = createGenerationActivationDockerAdapter({ root }) } = {}) {
  let reconstruction; try { reconstruction = await readManifest({ manifestPath }); } catch { fail("MANIFEST"); }
  let admission; try { admission = await admit({ root, manifestPath, backupPath, inputProtectedRoot, generationBundlePath, readManifest: async () => reconstruction }); } catch { fail("INPUT_ADMISSION"); }
  if (admission?.state !== "PASS") fail("INPUT_ADMISSION");
  if (admission.operationId !== reconstruction.manifest?.operationId) fail("INPUT_ADMISSION_OPERATION_MISMATCH");
  const paths = targetPaths(root), source = await readSourceBundle({ reconstruction, inputProtectedRoot, generationBundlePath, assertBundlePath, readBundle, filesystem });
  await verifyFoundation({ manifest: reconstruction.manifest, paths, filesystem, docker, helperReadiness });
  if (!apply) return Object.freeze({ state: "VALIDATED_NOT_APPLIED", phase: "SECRET_CONFIGURATION_ACTIVATION", generation: reconstruction.manifest.externalSecretGenerationId, dataMutation: "NONE", runtime: "NOT_STARTED" });
  let staging;
  try {
    staging = await stageBundle({ paths, reconstruction, source: source.source, commit: source.commit, filesystem, assertBundlePath, readBundle });
    const imported = await importBundle({ manifestPath, bundlePath: staging, protectedRoot: paths.targetProtectedRoot, supabaseEnvPath: paths.supabaseEnvPath, godelEnvPath: paths.godelEnvPath, apply: true });
    if (imported?.state !== "IMPORTED" || imported.generationId !== reconstruction.manifest.externalSecretGenerationId || imported.operationId !== reconstruction.manifest.operationId) fail("CANONICAL_IMPORT");
    await Promise.all([assertEnvironment(filesystem, paths.supabaseEnvPath), assertEnvironment(filesystem, paths.godelEnvPath)]);
    await assertActive({ protectedRoot: paths.targetProtectedRoot, generationId: reconstruction.manifest.externalSecretGenerationId, supabaseEnvPath: paths.supabaseEnvPath, godelEnvPath: paths.godelEnvPath });
    try { await filesystem.removeDirectory(staging); } catch { fail("POST_ACTIVATION_CLEANUP_FAILED"); }
    if (await filesystem.exists(staging)) fail("POST_ACTIVATION_CLEANUP_FAILED");
    await verifyFinalFoundation({ manifest: reconstruction.manifest, paths, filesystem, docker, helperReadiness });
  } catch (error) {
    if (error?.message === "CLEAN_HOST_GENERATION_ACTIVATION_POST_ACTIVATION_CLEANUP_FAILED") throw error;
    if (error?.message?.startsWith("CLEAN_HOST_GENERATION_ACTIVATION_")) fail("BLOCKED_PARTIAL_GENERATION_ACTIVATION");
    fail("BLOCKED_PARTIAL_GENERATION_ACTIVATION");
  }
  return Object.freeze({ state: "PASS", phase: "SECRET_CONFIGURATION_ACTIVATION", generation: reconstruction.manifest.externalSecretGenerationId, generationRegistry: "ACTIVE_MATCH", supabaseEnvironment: "MATCH", godelEnvironment: "MATCH", currentPointer: "EXACT", staging: "CLEANED", dataMutation: "NONE", runtime: "NOT_STARTED" });
}

export function parseGenerationActivationArgs(args, root = ROOT) { const apply = args.at(-1) === "--apply", input = apply ? args.slice(0, -1) : args; if ((apply && args.length !== 9) || (!apply && args.length !== 8)) fail("PATH"); try { return { ...parseInputAdmissionArgs(input, root), apply }; } catch { fail("PATH"); } }
export function renderGenerationActivationResult(result) { return `${JSON.stringify(result)}\n`; }
export function renderGenerationActivationFailure(error) { return `FAIL ${error?.message?.startsWith("CLEAN_HOST_GENERATION_ACTIVATION_") ? error.message : "CLEAN_HOST_GENERATION_ACTIVATION_FAILED"}\n`; }

if (import.meta.main) { try { process.stdout.write(renderGenerationActivationResult(await activateCleanHostGeneration(parseGenerationActivationArgs(process.argv.slice(2))))); } catch (error) { process.stderr.write(renderGenerationActivationFailure(error)); process.exitCode = 1; } }
