import { chmod, lstat, mkdir, open, readdir, readFile, rm, stat, statfs } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { admitTransportedReconstructionInputs, parseInputAdmissionArgs } from "./clean-host-input-admission.mjs";
import { verifyBootstrapDiskCapacity, verifyBootstrapHelperReadiness } from "./clean-host-bootstrap.mjs";
import { createGenerationActivationDockerAdapter } from "./clean-host-generation-activation.mjs";
import { knownTargetContainer } from "./clean-host-gate.mjs";
import { readReconstructionManifest } from "./portability-manifest.mjs";
import { createRecoveryDataPrimitives, readStorageXattrSidecar } from "./recovery-data-primitives.mjs";
import { acquireGenerationMutationLock, assertActiveSecretGenerationMatches, releaseGenerationMutationLock } from "./secret-generation.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const LOCK = ".clean-host-data-restore.lock";
const DB_ENTRIES = ["conf.d", "extension-custom-scripts", "read-replica.conf", "supautils.conf", "wal-g.conf"];
const execFileAsync = promisify(execFile);
function fail(code) { throw new Error(`CLEAN_HOST_DATA_RESTORE_${code}`); }
function labels(value) { return typeof value === "string" ? Object.fromEntries(value.split(",").filter(Boolean).map((entry) => entry.split("=", 2))) : value && typeof value === "object" ? value : {}; }
function project(item, projects) { return projects.includes(labels(item.labels ?? item.Labels)["com.docker.compose.project"]); }
function targetContainer(item, projects) { return project(item, projects) || [item?.name, item?.Name, item?.Names].flatMap((value) => typeof value === "string" ? value.split(",").map((name) => name.trim().replace(/^\//, "")) : []).some(knownTargetContainer); }
function paths(root) { const protectedRoot = resolve(root, "protected-recovery-material/selfhosted"); return { protectedRoot, lock: resolve(protectedRoot, LOCK), supabaseEnv: resolve(root, "infra/supabase/.env"), godelEnv: resolve(root, "compose.env.local"), pgdata: resolve(root, "infra/supabase/volumes/db/data"), storage: resolve(root, "infra/supabase/volumes/storage") }; }
function under(parent, child) { const value = relative(resolve(parent), resolve(child)); return value !== "" && value !== ".." && !value.startsWith(`..${sep}`); }

export function createDataRestoreFilesystemAdapter() { return {
  exists: async (path) => { try { await lstat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } },
  entry: (path) => lstat(path), entries: (path) => readdir(path), readFile: (path, encoding) => readFile(path, encoding), stat: (path) => stat(path), statfs: (path) => statfs(path),
  createDirectoryExclusive: async (path, mode) => { await mkdir(path, { mode }); await chmod(path, mode); },
  writeFileExclusive: async (path, bytes) => { const handle = await open(path, "wx", 0o600); try { await handle.writeFile(bytes); } finally { await handle.close(); } await chmod(path, 0o600); },
  removeDirectory: (path) => rm(path, { recursive: true, force: false }),
}; }
export function createDataRestoreDockerAdapter({ root = ROOT, runner = execFileAsync } = {}) {
  const base = createGenerationActivationDockerAdapter({ root, runner });
  const call = (args) => runner("docker", args, { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024 });
  return { ...base, runHelper: (args) => call(args), verifyDbConfigSix: async ({ image, volume }) => { const command = `test "$(ls -1A /etc/postgresql-custom | wc -l)" -eq 6; for entry in ${[...DB_ENTRIES, "pgsodium_root.key"].join(" ")}; do test -e /etc/postgresql-custom/$entry; done; test -s /etc/postgresql-custom/pgsodium_root.key`; await call(["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "-v", `${volume}:/etc/postgresql-custom:ro`, "--entrypoint", "sh", image, "-ceu", command]); } };
}
function directory(entry, mode, empty, code) { if (!entry?.isDirectory?.() || entry.isSymbolicLink?.() || (entry.mode & 0o777) !== mode || (empty && entry.entries?.length)) fail(code); }
async function assertDirectory(filesystem, path, mode, empty, code) { let entry, entries; try { [entry, entries] = await Promise.all([filesystem.entry(path), filesystem.entries(path)]); } catch { fail(code); } directory({ ...entry, entries }, mode, empty, code); }
async function assertEnvironment(filesystem, path) { let value; try { value = await filesystem.entry(path); } catch { fail("ACTIVE_ENVIRONMENT"); } if (!value.isFile() || value.isSymbolicLink() || (value.mode & 0o777) !== 0o600) fail("ACTIVE_ENVIRONMENT"); }
function unexpected(inventory, projects, network, volume) { return (inventory.containers ?? []).some((item) => targetContainer(item, projects)) || (inventory.networks ?? []).some((item) => (item.name ?? item.Name) !== network && project(item, projects)) || (inventory.volumes ?? []).some((item) => (item.name ?? item.Name) !== volume && project(item, projects)); }
async function foundation({ manifest, paths: value, filesystem, docker, helpers, final = false, locked = false }) {
  await assertDirectory(filesystem, value.protectedRoot, 0o700, false, "FOUNDATION_DIRECTORY");
  const rootEntries = (await filesystem.entries(value.protectedRoot)).sort();
  const expectedRoot = final || locked ? [".clean-host-data-restore.lock", "external-secrets"] : ["external-secrets"];
  if (rootEntries.join("\0") !== expectedRoot.join("\0")) fail("FOUNDATION_PROTECTED_ROOT");
  await Promise.all([assertDirectory(filesystem, value.pgdata, 0o700, !final, "FOUNDATION_DIRECTORY"), assertDirectory(filesystem, value.storage, 0o755, !final, "FOUNDATION_DIRECTORY"), assertEnvironment(filesystem, value.supabaseEnv), assertEnvironment(filesystem, value.godelEnv)]);
  const volume = `${manifest.targetContract.supabaseComposeProject}_db-config`, projects = [manifest.targetContract.supabaseComposeProject, manifest.targetContract.godelComposeProject];
  let network, inspected, inventory; try { [network, inspected, inventory] = await Promise.all([docker.inspectNetwork(manifest.targetContract.operatorNetwork), docker.inspectVolume(volume), docker.inventory()]); } catch { fail("FOUNDATION_DOCKER"); }
  if (network.name !== manifest.targetContract.operatorNetwork || network.driver !== "bridge" || inspected.name !== volume || inspected.labels?.["com.docker.compose.project"] !== manifest.targetContract.supabaseComposeProject || inspected.labels?.["com.docker.compose.volume"] !== "db-config" || unexpected(inventory, projects, manifest.targetContract.operatorNetwork, volume)) fail("FOUNDATION_DOCKER");
  try { if (final) await docker.verifyDbConfigSix({ image: helpers.postgresImage, volume }); else await docker.verifyDbConfig({ image: helpers.postgresImage, volume }); } catch { fail("FOUNDATION_DB_CONFIG"); }
}
async function protectedKey({ filesystem, inputProtectedRoot, backupPath, reconstruction }) { const path = resolve(inputProtectedRoot, basename(backupPath), reconstruction.manifest.protectedRecoveryMaterial?.relativePath ?? ""); if (!under(inputProtectedRoot, path)) fail("PROTECTED_ARTIFACT"); let entry; try { entry = await filesystem.entry(path); } catch { fail("PROTECTED_ARTIFACT"); } if (!entry.isFile() || entry.isSymbolicLink() || entry.size < 1) fail("PROTECTED_ARTIFACT"); return resolve(path, ".."); }
function reconstructionBackupId(reconstruction) { const backupId = reconstruction?.manifest?.backup?.backupId; if (typeof backupId !== "string" || !backupId || backupId.length > 160) fail("RECONSTRUCTION_BACKUP_ID"); return backupId; }
function marker(reconstruction, status, phase) { const identity = { schemaVersion: 1, status, operationId: reconstruction.manifest.operationId, backupId: reconstructionBackupId(reconstruction), generationId: reconstruction.manifest.externalSecretGenerationId }; return JSON.stringify(status === "STARTED" ? { ...identity, startedAt: new Date().toISOString() } : { ...identity, phase, failedAt: new Date().toISOString() }) + "\n"; }

export async function restoreCleanHostData({ manifestPath, backupPath, inputProtectedRoot, generationBundlePath, root = ROOT, apply = false, confirmed = false, readManifest = readReconstructionManifest, admit = admitTransportedReconstructionInputs, assertActive = assertActiveSecretGenerationMatches, helperReadiness = ({ manifest }) => verifyBootstrapHelperReadiness({ root, manifest }), diskCapacity = verifyBootstrapDiskCapacity, filesystem = createDataRestoreFilesystemAdapter(), docker = createDataRestoreDockerAdapter({ root }), acquireLock = acquireGenerationMutationLock, releaseLock = releaseGenerationMutationLock, primitives, hooks = {}, signalSource = process } = {}) {
  let reconstruction; try { reconstruction = await readManifest({ manifestPath }); } catch { fail("MANIFEST"); }
  reconstructionBackupId(reconstruction);
  let admission; try { admission = await admit({ root, manifestPath, backupPath, inputProtectedRoot, generationBundlePath, readManifest: async () => reconstruction }); } catch { fail("INPUT_ADMISSION"); }
  if (admission?.state !== "PASS" || admission.operationId !== reconstruction.manifest?.operationId) fail("INPUT_ADMISSION");
  const value = paths(root), manifest = reconstruction.manifest;
  try { await assertActive({ protectedRoot: value.protectedRoot, generationId: manifest.externalSecretGenerationId, supabaseEnvPath: value.supabaseEnv, godelEnvPath: value.godelEnv }); } catch { fail("ACTIVE_GENERATION"); }
  let helpers; try { helpers = await helperReadiness({ root, manifest }); } catch { fail("HELPER_IMAGES"); }
  await foundation({ manifest, paths: value, filesystem, docker, helpers });
  try { await diskCapacity({ backupPath, paths: value, filesystem }); await protectedKey({ filesystem, inputProtectedRoot, backupPath, reconstruction }); await readStorageXattrSidecar(resolve(backupPath, "storage"), "xattrs.json", filesystem.readFile); } catch (error) { if (error?.message?.startsWith("CLEAN_HOST_DATA_RESTORE_")) throw error; fail("RECOVERY_INPUTS"); }
  if (apply !== confirmed) fail("CONFIRMATION");
  if (!apply) return Object.freeze({ state: "VALIDATED_NOT_APPLIED", phase: "DATA_MUTATION", target: "clean-host-disposable-rehearsal", runtime: "NOT_STARTED" });
  const recovery = primitives ?? createRecoveryDataPrimitives({ runDocker: async (args) => docker.runHelper(args), storageXattrImage: helpers.storageImage });
  let recoveryLock = false, generationLock, mutation = false, phase = "pre-lock";
  let abortRequested = false, abortSignal = null;
  const requestAbort = (signal) => { abortRequested = true; if (!abortSignal) abortSignal = signal; };
  const hasAbortRequest = () => abortRequested || hooks.abortRequested?.() === true;
  if (!signalSource || typeof signalSource.on !== "function" || typeof signalSource.off !== "function") fail("SIGNAL_SOURCE");
  const onSigint = () => requestAbort("SIGINT"), onSigterm = () => requestAbort("SIGTERM");
  signalSource.on("SIGINT", onSigint); signalSource.on("SIGTERM", onSigterm);
  try {
   try {
    await filesystem.createDirectoryExclusive(value.lock, 0o700); recoveryLock = true; await assertDirectory(filesystem, value.lock, 0o700, true, "RECOVERY_LOCK"); await filesystem.writeFileExclusive(resolve(value.lock, "started.json"), marker(reconstruction, "STARTED"));
    generationLock = await acquireLock({ protectedRoot: value.protectedRoot, operation: "clean-host-data-restore", generationId: manifest.externalSecretGenerationId });
    admission = await admit({ root, manifestPath, backupPath, inputProtectedRoot, generationBundlePath, readManifest: async () => reconstruction });
    if (admission?.state !== "PASS" || admission.operationId !== manifest.operationId) fail("INPUT_ADMISSION");
    await foundation({ manifest, paths: value, filesystem, docker, helpers, locked: true });
    await diskCapacity({ backupPath, paths: value, filesystem });
    await readStorageXattrSidecar(resolve(backupPath, "storage"), "xattrs.json", filesystem.readFile);
    await assertActive({ protectedRoot: value.protectedRoot, generationId: manifest.externalSecretGenerationId, supabaseEnvPath: value.supabaseEnv, godelEnvPath: value.godelEnv });
    if (hasAbortRequest()) fail("ABORTED"); hooks.beforeMutation?.(); if (hasAbortRequest()) fail("ABORTED");
    const protectedDirectory = await protectedKey({ filesystem, inputProtectedRoot, backupPath, reconstruction });
    mutation = true; phase = "restore-pgdata"; await recovery.restoreArchive({ image: helpers.postgresImage, archiveDirectory: resolve(backupPath, "postgres/physical"), archiveName: "pgdata.tar", target: value.pgdata }); phase = "verify-pgdata"; await recovery.assertRestoredPgdata({ image: helpers.postgresImage, target: value.pgdata });
    if (hasAbortRequest()) fail("ABORTED"); phase = "restore-storage"; await recovery.restoreArchive({ image: helpers.postgresImage, archiveDirectory: resolve(backupPath, "storage"), archiveName: "storage.tar", target: value.storage }); phase = "verify-storage"; await recovery.assertRestoredStorage({ image: helpers.postgresImage, target: value.storage });
    if (hasAbortRequest()) fail("ABORTED"); phase = "restore-pgsodium"; await recovery.restoreProtectedKey({ image: helpers.postgresImage, protectedDirectory, volume: `${manifest.targetContract.supabaseComposeProject}_db-config` });
    if (hasAbortRequest()) fail("ABORTED"); phase = "replay-xattrs"; await recovery.replayStorageXattrs({ image: helpers.storageImage, source: resolve(backupPath, "storage"), target: value.storage }); phase = "verify-xattrs"; await recovery.verifyStorageXattrs({ image: helpers.storageImage, source: resolve(backupPath, "storage"), target: value.storage });
    if (hasAbortRequest()) fail("ABORTED"); phase = "final-verification";
    await assertActive({ protectedRoot: value.protectedRoot, generationId: manifest.externalSecretGenerationId, supabaseEnvPath: value.supabaseEnv, godelEnvPath: value.godelEnv });
    if (hasAbortRequest()) fail("ABORTED");
    await foundation({ manifest, paths: value, filesystem, docker, helpers, final: true });
    if (hasAbortRequest()) fail("ABORTED");
   } catch (error) {
    if (mutation) { try { await filesystem.writeFileExclusive(resolve(value.lock, "failed.json"), marker(reconstruction, "FAILED_AFTER_DATA_MUTATION", phase)); } catch { fail("BLOCKED_PARTIAL_RECOVERY_STATE_MARKER_FAILED"); } fail("BLOCKED_PARTIAL_RECOVERY_STATE"); }
    try { if (generationLock) await releaseLock(generationLock); if (recoveryLock) await filesystem.removeDirectory(value.lock); } catch { fail("PRE_MUTATION_LOCK_CLEANUP"); }
    if (error?.message?.startsWith("CLEAN_HOST_DATA_RESTORE_")) throw error; fail("PRE_MUTATION");
   }
   try { await releaseLock(generationLock); await filesystem.removeDirectory(value.lock); } catch { fail("POST_RECOVERY_LOCK_CLEANUP_FAILED"); }
   return Object.freeze({ state: "PASS", phase: "DATA_MUTATION", target: "clean-host-disposable-rehearsal", pgdata: "RESTORED_VERIFIED", storage: "RESTORED_XATTR_VERIFIED", dbConfig: "SIX_ENTRY_RECOVERY_READY", pgsodium: "RESTORED_VERIFIED", generation: "ACTIVE_MATCH", logicalDump: "NOT_EXECUTED", runtime: "NOT_STARTED" });
  } finally { signalSource.off("SIGINT", onSigint); signalSource.off("SIGTERM", onSigterm); }
}
export function parseDataRestoreArgs(args, root = ROOT) { const apply = args.includes("--apply"), confirmed = args.includes("--confirm-destructive-clean-host-rehearsal"), input = args.filter((arg) => !["--apply", "--confirm-destructive-clean-host-rehearsal"].includes(arg)); try { return { ...parseInputAdmissionArgs(input, root), apply, confirmed }; } catch { fail("PATH"); } }
export function renderDataRestoreResult(result) { return `${JSON.stringify(result)}\n`; }
export function renderDataRestoreFailure(error) { return `FAIL ${error?.message?.startsWith("CLEAN_HOST_DATA_RESTORE_") ? error.message : "CLEAN_HOST_DATA_RESTORE_FAILED"}\n`; }
if (import.meta.main) { try { process.stdout.write(renderDataRestoreResult(await restoreCleanHostData(parseDataRestoreArgs(process.argv.slice(2))))); } catch (error) { process.stderr.write(renderDataRestoreFailure(error)); process.exitCode = 1; } }
