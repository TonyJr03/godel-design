import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, readdir, stat, statfs } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { admitTransportedReconstructionInputs, parseInputAdmissionArgs } from "./clean-host-input-admission.mjs";
import { knownTargetContainer } from "./clean-host-gate.mjs";
import { createDockerImageAdapter, validateAcquisitionAuthority } from "./image-acquisition.mjs";
import { readReconstructionManifest } from "./portability-manifest.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "../..");
const REQUIRED_DB_CONFIG_ENTRIES = ["conf.d", "extension-custom-scripts", "read-replica.conf", "supautils.conf", "wal-g.conf"];
const MIN_RESTORE_MARGIN = 512 * 1024 * 1024;

function fail(code) { throw new Error(`CLEAN_HOST_BOOTSTRAP_${code}`); }
function repository(value) { return value.startsWith("docker.io/") ? value : `docker.io/${value}`; }
function immutableReference(image) { return `${image.canonicalRepository}@${image.manifestDigest}`; }
function strictlyContains(parent, child) { const relation = relative(resolve(parent), resolve(child)); return relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`); }
function disjoint(left, right) { return resolve(left) !== resolve(right) && !strictlyContains(left, right) && !strictlyContains(right, left); }

function parseRows(bytes) {
  return String(bytes).split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { fail("DOCKER_INVENTORY"); } });
}
function labels(value) { return typeof value === "string" ? Object.fromEntries(value.split(",").filter(Boolean).map((entry) => entry.split("=", 2))) : value && typeof value === "object" ? value : {}; }
function targetProject(item, projects) { return projects.includes(labels(item.labels ?? item.Labels)["com.docker.compose.project"]); }
function targetContainer(item, projects) { return targetProject(item, projects) || [item?.name, item?.Name, item?.Names].flatMap((value) => typeof value === "string" ? value.split(",").map((name) => name.trim().replace(/^\//, "")) : []).some(knownTargetContainer); }
function repoDigestMatches(image, digests) { return Array.isArray(digests) && digests.some((value) => { const at = typeof value === "string" ? value.lastIndexOf("@") : -1; return at > 0 && repository(value.slice(0, at)) === image.canonicalRepository && value.slice(at + 1) === image.manifestDigest; }); }
function assertImage(image, inspected) { if (inspected?.os !== "linux" || inspected?.architecture !== "amd64" || !repoDigestMatches(image, inspected.repoDigests) || typeof inspected.imageId !== "string" || !inspected.imageId) fail("HELPER_IMAGES_NOT_READY"); return inspected.imageId; }

export function createBootstrapFilesystemAdapter() {
  return {
    exists: async (path) => { try { await lstat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } },
    entry: (path) => lstat(path),
    entries: (path) => readdir(path),
    createDirectory: async (path, mode) => { await mkdir(path, { mode }); if (mode) await chmod(path, mode); },
    stat: (path) => stat(path),
    statfs: (path) => statfs(path),
  };
}

export function createBootstrapDockerAdapter({ root = ROOT, runner = execFileAsync } = {}) {
  const call = async (args) => runner("docker", args, { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024 });
  const inspect = async (kind, name) => { let parsed; try { parsed = JSON.parse((await call([kind, "inspect", name])).stdout); } catch { fail("DOCKER_INSPECT"); } if (!parsed?.[0]) fail("DOCKER_INSPECT"); return parsed[0]; };
  return {
    inventory: async () => {
      try {
        const [containers, volumes, networks] = await Promise.all([call(["ps", "--all", "--format", "{{json .}}"]), call(["volume", "ls", "--format", "{{json .}}"]), call(["network", "ls", "--format", "{{json .}}"])]);
        return { containers: parseRows(containers.stdout), volumes: parseRows(volumes.stdout), networks: parseRows(networks.stdout) };
      } catch { fail("DOCKER_INVENTORY"); }
    },
    createNetwork: async (name) => { try { await call(["network", "create", "--driver", "bridge", name]); } catch { fail("NETWORK_CREATE"); } },
    inspectNetwork: async (name) => { const value = await inspect("network", name); return { name: value.Name, driver: value.Driver }; },
    createVolume: async (name, project) => { try { await call(["volume", "create", "--label", `com.docker.compose.project=${project}`, "--label", "com.docker.compose.volume=db-config", name]); } catch { fail("VOLUME_CREATE"); } },
    inspectVolume: async (name) => { const value = await inspect("volume", name); return { name: value.Name, labels: value.Labels ?? {} }; },
    inspectImageUser: async (image) => { let value; try { value = JSON.parse((await call(["image", "inspect", image])).stdout)?.[0]; } catch { fail("STORAGE_IMAGE_USER"); } const user = value?.Config?.User; if (user === "") return "0:0"; if (typeof user !== "string" || !/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?$/.test(user)) fail("STORAGE_IMAGE_USER"); return user; },
    preparePostgresOwnership: async ({ image, target }) => runHelper(call, image, target, "uid=\"$(id -u postgres)\"; gid=\"$(id -g postgres)\"; chown \"$uid:$gid\" /target; chmod 0700 /target"),
    prepareStorageOwnership: async ({ image, target, user }) => runHelper(call, image, target, storageOwnershipCommand(user)),
    runXattrProbe: async ({ image, target }) => runXattrProbe(call, image, target),
    initializeDbConfig: async ({ image, volume }) => runDbConfigInitialization(call, image, volume),
  };
}

async function runHelper(call, image, target, command) { try { await call(["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "--cap-add=CHOWN", "--cap-add=FOWNER", "-v", `${target}:/target`, "--entrypoint", "sh", image, "-ceu", command]); } catch { fail("OWNERSHIP_PREPARATION"); } }
function storageOwnershipCommand(user) { if (typeof user !== "string" || !/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?$/.test(user)) fail("STORAGE_IMAGE_USER"); if (user.includes(":")) { const [uid, gid] = user.split(":"); return `chown ${uid}:${gid} /target; chmod 0755 /target`; } return `uid=\"$(id -u ${user})\"; gid=\"$(id -g ${user})\"; chown \"$uid:$gid\" /target; chmod 0755 /target`; }
async function runXattrProbe(call, image, target) {
  const script = "const fs=require('node:fs');const x=require('fs-xattr');const p='/target/.godel-sh05-xattr-probe';const n='user.godel-sh05-probe';const v=Buffer.from('godel-sh05-probe');try{fs.writeFileSync(p,'probe');x.setSync(p,n,v);if(!Buffer.from(x.getSync(p,n)).equals(v))throw Error('mismatch');fs.unlinkSync(p);if(fs.readdirSync('/target').length)throw Error('cleanup')}catch(e){try{fs.unlinkSync(p)}catch{}throw e}";
  try { await call(["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "-v", `${target}:/target`, "--entrypoint", "node", image, "-e", script]); } catch { fail("STORAGE_XATTR_PROBE"); }
}
async function runDbConfigInitialization(call, image, volume) { const check = `test \"$(ls -1A /etc/postgresql-custom | wc -l)\" -eq 5; for entry in ${REQUIRED_DB_CONFIG_ENTRIES.join(" ")}; do test -e /etc/postgresql-custom/$entry; done; test ! -e /etc/postgresql-custom/pgsodium_root.key`; try { await call(["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "-v", `${volume}:/etc/postgresql-custom`, "--entrypoint", "sh", image, "-ceu", check]); } catch { fail("DB_CONFIG_INITIALIZATION"); } }

async function assertEmptyDirectory(filesystem, path, mode) {
  let entry, entries; try { [entry, entries] = await Promise.all([filesystem.entry(path), filesystem.entries(path)]); } catch { fail("TARGET_DIRECTORY"); }
  if (!entry.isDirectory() || entry.isSymbolicLink() || entries.length || (mode && (entry.mode & 0o777) !== mode)) fail("TARGET_DIRECTORY");
}
function targetPaths(root, targetProtectedRoot = resolve(root, "protected-recovery-material/selfhosted")) { return { targetProtectedRoot, runtimeEnvs: [resolve(root, "infra/supabase/.env"), resolve(root, "compose.env.local")], pgdata: resolve(root, "infra/supabase/volumes/db/data"), storage: resolve(root, "infra/supabase/volumes/storage") }; }

export async function verifyPostImagePreTargetGate({ manifest, paths, filesystem, docker }) {
  let inventory; try { inventory = await docker.inventory(); } catch (error) { if (error?.message?.startsWith("CLEAN_HOST_BOOTSTRAP_")) throw error; fail("RACE_GATE"); }
  const contract = manifest.targetContract, projects = [contract.supabaseComposeProject, contract.godelComposeProject], volumeName = `${contract.supabaseComposeProject}_db-config`;
  if ((inventory.containers ?? []).some((item) => targetContainer(item, projects)) || (inventory.networks ?? []).some((item) => item.name === contract.operatorNetwork || item.Name === contract.operatorNetwork || targetProject(item, projects)) || (inventory.volumes ?? []).some((item) => item.name === volumeName || item.Name === volumeName || targetProject(item, projects))) fail("RACE_TARGET_STATE");
  const forbidden = [...paths.runtimeEnvs, paths.pgdata, paths.storage, paths.targetProtectedRoot, resolve(paths.targetProtectedRoot, "external-secrets")];
  try { if ((await Promise.all(forbidden.map((path) => filesystem.exists(path)))).some(Boolean)) fail("RACE_TARGET_STATE"); } catch (error) { if (error?.message?.startsWith("CLEAN_HOST_BOOTSTRAP_")) throw error; fail("RACE_GATE"); }
  return Object.freeze({ state: "PASS" });
}

export async function verifyBootstrapHelperReadiness({ root = ROOT, manifest, docker = createDockerImageAdapter({ root }), validateAuthority = validateAcquisitionAuthority } = {}) {
  let authority; try { authority = await validateAuthority({ root, manifest }); } catch { fail("HELPER_IMAGES_NOT_READY"); }
  const helpers = ["helper-postgres-db-config", "helper-storage-xattr"].map((name) => authority.lock.images.find((image) => image.logicalName === name));
  if (helpers.some((image) => !image)) fail("HELPER_IMAGES_NOT_READY");
  for (const image of helpers) {
    let immutable, alias; try { [immutable, alias] = await Promise.all([docker.inspectImage(immutableReference(image)), docker.inspectAlias(image.sourceRef)]); } catch { fail("HELPER_IMAGES_NOT_READY"); }
    if (assertImage(image, immutable) !== assertImage(image, alias)) fail("HELPER_IMAGES_NOT_READY");
  }
  return Object.freeze({ postgresImage: helpers[0].sourceRef, storageImage: helpers[1].sourceRef });
}

export async function verifyBootstrapDiskCapacity({ backupPath, paths, filesystem }) {
  let pgdata, storage, pgFilesystem, storageFilesystem;
  try { [pgdata, storage, pgFilesystem, storageFilesystem] = await Promise.all([filesystem.stat(resolve(backupPath, "postgres/physical/pgdata.tar")), filesystem.stat(resolve(backupPath, "storage/storage.tar")), filesystem.statfs(dirname(paths.pgdata)), filesystem.statfs(dirname(paths.storage))]); } catch { fail("DISK_CAPACITY"); }
  const archiveBytes = Number(pgdata.size) + Number(storage.size), required = archiveBytes + Math.max(MIN_RESTORE_MARGIN, Math.ceil(archiveBytes * 0.25));
  const available = [pgFilesystem, storageFilesystem].map((value) => Number(value.bavail) * Number(value.bsize));
  if (!Number.isSafeInteger(archiveBytes) || archiveBytes < 1 || available.some((value) => !Number.isFinite(value) || value < required)) fail("INSUFFICIENT_DISK");
  return Object.freeze({ state: "PASS" });
}

async function finalFoundationVerification({ manifest, paths, filesystem, docker }) {
  await Promise.all([assertEmptyDirectory(filesystem, paths.targetProtectedRoot, 0o700), assertEmptyDirectory(filesystem, paths.pgdata, 0o700), assertEmptyDirectory(filesystem, paths.storage, 0o755)]);
  if ((await Promise.all([...paths.runtimeEnvs, resolve(paths.targetProtectedRoot, "external-secrets")].map((path) => filesystem.exists(path)))).some(Boolean)) fail("FINAL_STATE");
  const [network, volume, inventory] = await Promise.all([docker.inspectNetwork(manifest.targetContract.operatorNetwork), docker.inspectVolume(`${manifest.targetContract.supabaseComposeProject}_db-config`), docker.inventory()]);
  const projects = [manifest.targetContract.supabaseComposeProject, manifest.targetContract.godelComposeProject];
  if (network.name !== manifest.targetContract.operatorNetwork || network.driver !== "bridge" || volume.name !== `${manifest.targetContract.supabaseComposeProject}_db-config` || volume.labels["com.docker.compose.project"] !== manifest.targetContract.supabaseComposeProject || volume.labels["com.docker.compose.volume"] !== "db-config" || (inventory.containers ?? []).some((item) => targetContainer(item, projects))) fail("FINAL_STATE");
}

export async function bootstrapCleanHostTarget({ manifestPath, backupPath, inputProtectedRoot, generationBundlePath, root = ROOT, apply = false, targetProtectedRoot = resolve(root, "protected-recovery-material/selfhosted"), admit = admitTransportedReconstructionInputs, readManifest = readReconstructionManifest, raceGate = verifyPostImagePreTargetGate, helperReadiness = verifyBootstrapHelperReadiness, diskCapacity = verifyBootstrapDiskCapacity, filesystem = createBootstrapFilesystemAdapter(), docker = createBootstrapDockerAdapter({ root }) } = {}) {
  let reconstruction; try { reconstruction = await readManifest({ manifestPath }); } catch { fail("MANIFEST"); }
  let admitted; try { admitted = await admit({ root, manifestPath, backupPath, inputProtectedRoot, generationBundlePath, readManifest: async () => reconstruction }); } catch { fail("INPUT_ADMISSION"); }
  if (admitted?.state !== "PASS") fail("INPUT_ADMISSION");
  if (admitted.operationId !== reconstruction.manifest?.operationId) fail("INPUT_ADMISSION_OPERATION_MISMATCH");
  const manifest = reconstruction.manifest, paths = targetPaths(root, targetProtectedRoot);
  if (!disjoint(inputProtectedRoot, paths.targetProtectedRoot)) fail("INPUT_TARGET_ROOT_OVERLAP");
  await raceGate({ manifest, paths, filesystem, docker });
  const helpers = await helperReadiness({ root, manifest });
  let storageUser; try { storageUser = await docker.inspectImageUser(helpers.storageImage); } catch (error) { if (error?.message?.startsWith("CLEAN_HOST_BOOTSTRAP_")) throw error; fail("STORAGE_IMAGE_USER"); }
  await diskCapacity({ backupPath, paths, filesystem });
  if (!apply) return Object.freeze({ state: "VALIDATED_NOT_APPLIED", phase: "TARGET_STATE_CREATION", target: "clean-host-disposable-rehearsal", runtimeEnvironment: "ABSENT", secretRegistry: "ABSENT" });
  try {
    await filesystem.createDirectory(paths.targetProtectedRoot, 0o700); await assertEmptyDirectory(filesystem, paths.targetProtectedRoot, 0o700);
    await docker.createNetwork(manifest.targetContract.operatorNetwork); const network = await docker.inspectNetwork(manifest.targetContract.operatorNetwork); if (network.name !== manifest.targetContract.operatorNetwork || network.driver !== "bridge") fail("NETWORK_CREATE");
    await filesystem.createDirectory(paths.pgdata); await assertEmptyDirectory(filesystem, paths.pgdata); await docker.preparePostgresOwnership({ image: helpers.postgresImage, target: paths.pgdata });
    await filesystem.createDirectory(paths.storage); await assertEmptyDirectory(filesystem, paths.storage); await docker.prepareStorageOwnership({ image: helpers.storageImage, target: paths.storage, user: storageUser }); await docker.runXattrProbe({ image: helpers.storageImage, target: paths.storage }); await assertEmptyDirectory(filesystem, paths.storage);
    const volume = `${manifest.targetContract.supabaseComposeProject}_db-config`; await docker.createVolume(volume, manifest.targetContract.supabaseComposeProject); await docker.initializeDbConfig({ image: helpers.postgresImage, volume });
    await finalFoundationVerification({ manifest, paths, filesystem, docker });
  } catch { fail("BLOCKED_PARTIAL_TARGET_STATE"); }
  return Object.freeze({ state: "PASS", phase: "TARGET_STATE_CREATION", target: "clean-host-disposable-rehearsal", network: "CREATED_VERIFIED", pgdata: "EMPTY_READY", storage: "EMPTY_XATTR_READY", dbConfig: "FRESH_VERSION_COUPLED", targetProtectedRoot: "EMPTY_READY", runtimeEnvironment: "ABSENT", secretRegistry: "ABSENT" });
}

export function parseBootstrapArgs(args, root = ROOT) { const apply = args.at(-1) === "--apply"; const input = apply ? args.slice(0, -1) : args; if ((apply && args.length !== 9) || (!apply && args.length !== 8)) fail("PATH"); try { return { ...parseInputAdmissionArgs(input, root), apply }; } catch { fail("PATH"); } }
export function renderBootstrapResult(result) { return `${JSON.stringify(result)}\n`; }
export function renderBootstrapFailure(error) { return `FAIL ${error?.message?.startsWith("CLEAN_HOST_BOOTSTRAP_") ? error.message : "CLEAN_HOST_BOOTSTRAP_FAILED"}\n`; }

if (import.meta.main) { try { process.stdout.write(renderBootstrapResult(await bootstrapCleanHostTarget(parseBootstrapArgs(process.argv.slice(2))))); } catch (error) { process.stderr.write(renderBootstrapFailure(error)); process.exitCode = 1; } }
