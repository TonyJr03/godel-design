import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { bootstrapCleanHostTarget, createBootstrapDockerAdapter, parseBootstrapArgs, renderBootstrapFailure, renderBootstrapResult, verifyBootstrapHelperReadiness, verifyPostImagePreTargetGate } from "./clean-host-bootstrap.mjs";

const ROOT = resolve("/repo"), OPERATION = "123e4567-e89b-42d3-a456-426614174000", GENERATION = "223e4567-e89b-42d3-a456-426614174000";
function manifest() { return { operationId: OPERATION, externalSecretGenerationId: GENERATION, targetContract: { operatorNetwork: "godel-supabase-api", supabaseComposeProject: "supabase", godelComposeProject: "godel-runtime" } }; }
function fakeFilesystem(options = {}) {
  const directories = new Map(Object.entries(options.directories ?? {}).map(([path, mode]) => [path, { mode, entries: [] }])), actions = [];
  return {
    actions,
    exists: async (path) => directories.has(path) || (options.present ?? []).includes(path),
    entry: async (path) => { const value = directories.get(path); if (!value) throw new Error("missing"); return { isDirectory: () => true, isSymbolicLink: () => false, mode: options.finalModeOverrides?.[path] ?? value.mode ?? 0o755 }; },
    entries: async (path) => { const value = directories.get(path); if (!value) throw new Error("missing"); return value.entries; },
    createDirectory: async (path, mode) => { actions.push(["mkdir", path]); options.events?.push(["mkdir", path]); if (directories.has(path)) throw new Error("exists"); directories.set(path, { mode: mode ?? 0o755, entries: [] }); },
    setMode: (path, mode) => { const value = directories.get(path); if (!value) throw new Error("missing"); value.mode = mode; },
    stat: async (path) => ({ size: path.endsWith("pgdata.tar") ? 1024 : 2048 }),
    statfs: async () => ({ bavail: 10 ** 9, bsize: 1 }),
  };
}
function fakeDocker(options = {}) {
  const actions = [], state = { network: false, volume: false };
  return {
    actions,
    inventory: async () => state.volume && options.finalInventory ? options.finalInventory : options.inventory ?? { containers: [], volumes: [], networks: [] },
    createNetwork: async (name) => { actions.push(["network-create", name]); options.events?.push(["network-create", name]); state.network = true; if (options.networkFailure) throw new Error("fail"); },
    inspectNetwork: async () => options.network ?? { name: "godel-supabase-api", driver: "bridge" },
    createVolume: async (name) => { actions.push(["volume-create", name]); state.volume = true; if (options.volumeFailure) throw new Error("fail"); },
    inspectVolume: async () => options.volume ?? { name: "supabase_db-config", labels: { "com.docker.compose.project": "supabase", "com.docker.compose.volume": "db-config" } },
    inspectImageUser: async () => { actions.push(["storage-user"]); if (options.storageUserError) throw new Error("invalid user"); return options.storageUser ?? "storage"; },
    preparePostgresOwnership: async ({ target }) => { actions.push(["pgdata-ownership"]); options.events?.push(["pgdata-ownership"]); if (options.pgOwnershipFailure) throw new Error("fail"); options.filesystem?.setMode(target, 0o700); },
    prepareStorageOwnership: async ({ target }) => { actions.push(["storage-ownership"]); options.events?.push(["storage-ownership"]); if (options.storageOwnershipFailure) throw new Error("fail"); options.filesystem?.setMode(target, 0o755); },
    runXattrProbe: async () => { actions.push(["xattr-probe"]); options.events?.push(["xattr-probe"]); if (options.xattrFailure) throw new Error("fail"); },
    initializeDbConfig: async () => { actions.push(["db-config"]); options.events?.push(["db-config"]); if (options.dbConfigFailure) throw new Error("fail"); },
  };
}
function adapters(options = {}) {
  const events = [], shared = { ...options, events }, filesystem = fakeFilesystem(shared), docker = fakeDocker({ ...shared, filesystem });
  return {
    filesystem, docker, events,
    admit: options.admit ?? (async () => ({ state: "PASS", operationId: OPERATION })),
    readManifest: options.readManifest ?? (async () => ({ manifest: options.manifest ?? manifest() })),
    helperReadiness: options.helperReadiness ?? (async () => ({ postgresImage: "supabase/postgres:synthetic", storageImage: "supabase/storage:synthetic" })),
  };
}
async function run(options = {}) {
  const value = adapters(options);
  const result = await bootstrapCleanHostTarget({ root: ROOT, manifestPath: "/private/manifest", backupPath: "/private/backup", inputProtectedRoot: "/private/input", generationBundlePath: "/private/input/bundle", ...value, apply: options.apply ?? false });
  return { ...value, result };
}
function targetMutationCount(value) { return value.filesystem.actions.length + value.docker.actions.filter(([kind]) => kind !== "storage-user").length; }

test("dry-run admits, gates, checks helpers and disk without target mutation", async () => {
  const value = await run();
  assert.equal(value.result.state, "VALIDATED_NOT_APPLIED");
  assert.equal(targetMutationCount(value), 0); assert.deepEqual(value.docker.actions, [["storage-user"]]);
});

test("H, race state, root overlap, helper and disk failures happen before mutation", async () => {
  const targetRoot = resolve(ROOT, "protected-recovery-material/selfhosted");
  const cases = [
    { admit: async () => { throw new Error("H fail"); } },
    { inventory: { containers: [{ labels: { "com.docker.compose.project": "supabase" } }], volumes: [], networks: [] } },
    { inventory: { containers: [], volumes: [], networks: [{ name: "godel-supabase-api" }] } },
    { inventory: { containers: [], volumes: [{ name: "supabase_db-config" }], networks: [] } },
    { present: [resolve(ROOT, "compose.env.local")] },
    { present: [resolve(ROOT, "infra/supabase/volumes/db/data")] },
    { present: [resolve(ROOT, "infra/supabase/volumes/storage")] },
    { present: [targetRoot] },
    { helperReadiness: async () => { throw new Error("CLEAN_HOST_BOOTSTRAP_HELPER_IMAGES_NOT_READY"); } },
    { storageUserError: true },
    { filesystem: undefined },
  ];
  for (const options of cases.slice(0, -1)) {
    const value = adapters(options);
    await assert.rejects(() => bootstrapCleanHostTarget({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: "/input", generationBundlePath: "/input/bundle", ...value }), /CLEAN_HOST_BOOTSTRAP_/);
    assert.equal(targetMutationCount(value), 0);
  }
  const overlap = adapters();
  await assert.rejects(() => bootstrapCleanHostTarget({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: targetRoot, generationBundlePath: "/input/bundle", ...overlap }), /INPUT_TARGET_ROOT_OVERLAP/);
  assert.equal(targetMutationCount(overlap), 0);
  const lowDisk = adapters(); lowDisk.filesystem.statfs = async () => ({ bavail: 1, bsize: 1 });
  await assert.rejects(() => bootstrapCleanHostTarget({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: "/input", generationBundlePath: "/input/bundle", ...lowDisk }), /INSUFFICIENT_DISK/);
  assert.equal(targetMutationCount(lowDisk), 0);
});

test("apply creates only the empty foundation in documented order", async () => {
  const value = await run({ apply: true });
  const mutations = value.events.map(([kind, path]) => `${kind}:${path ?? ""}`);
  assert.equal(value.result.state, "PASS");
  assert.ok(mutations.findIndex((value) => value.includes("protected-recovery-material")) < mutations.findIndex((value) => value.startsWith("network-create")));
  assert.ok(mutations.findIndex((value) => value.startsWith("network-create")) < mutations.findIndex((value) => value.includes("volumes\\db\\data") || value.includes("volumes/db/data")));
  assert.ok(value.docker.actions.some(([kind]) => kind === "xattr-probe"));
  assert.ok(value.docker.actions.some(([kind]) => kind === "db-config"));
  assert.equal(value.docker.actions.some(([kind]) => /import|current|restore|compose|start|pull|tag|build|rm|prune/.test(kind)), false);
  assert.equal((await value.filesystem.entry(resolve(ROOT, "protected-recovery-material/selfhosted"))).mode & 0o777, 0o700);
  assert.equal((await value.filesystem.entry(resolve(ROOT, "infra/supabase/volumes/db/data"))).mode & 0o777, 0o700);
  assert.equal((await value.filesystem.entry(resolve(ROOT, "infra/supabase/volumes/storage"))).mode & 0o777, 0o755);
});

test("db-config and xattr failures leave partial state without automatic cleanup", async () => {
  for (const options of [{ xattrFailure: true }, { dbConfigFailure: true }, { volume: { name: "wrong", labels: {} } }, { dbConfigFailure: true }]) {
    const value = adapters(options);
    await assert.rejects(() => bootstrapCleanHostTarget({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: "/input", generationBundlePath: "/input/bundle", ...value, apply: true }), /BLOCKED_PARTIAL_TARGET_STATE/);
    assert.equal(value.docker.actions.some(([kind]) => /\brm\b|prune|delete|cleanup/.test(kind)), false);
  }
});

test("final verification rejects unlabeled target containers and root-mode drift without cleanup", async () => {
  for (const name of ["supabase-db", "godel-runtime-app-1"]) {
    const value = adapters({ finalInventory: { containers: [{ name, labels: {} }], volumes: [], networks: [] } });
    await assert.rejects(() => bootstrapCleanHostTarget({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: "/input", generationBundlePath: "/input/bundle", ...value, apply: true }), /BLOCKED_PARTIAL_TARGET_STATE/);
    assert.equal(value.docker.actions.some(([kind]) => /\brm\b|prune|delete|cleanup/.test(kind)), false);
  }
  const storage = resolve(ROOT, "infra/supabase/volumes/storage"), value = adapters({ finalModeOverrides: { [storage]: 0o700 } });
  await assert.rejects(() => bootstrapCleanHostTarget({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: "/input", generationBundlePath: "/input/bundle", ...value, apply: true }), /BLOCKED_PARTIAL_TARGET_STATE/);
  assert.equal(value.docker.actions.some(([kind]) => /\brm\b|prune|delete|cleanup/.test(kind)), false);
});

test("helper readiness rejects immutable, alias and platform drift before any bootstrap mutation", async () => {
  const digest = "a".repeat(64), images = [
    { logicalName: "helper-postgres-db-config", canonicalRepository: "docker.io/supabase/postgres", sourceRef: "supabase/postgres:synthetic", manifestDigest: `sha256:${digest}`, configDigest: `sha256:${digest}` },
    { logicalName: "helper-storage-xattr", canonicalRepository: "docker.io/supabase/storage-api", sourceRef: "supabase/storage-api:synthetic", manifestDigest: `sha256:${digest}`, configDigest: `sha256:${digest}` },
  ];
  const valid = (image) => ({ os: "linux", architecture: "amd64", repoDigests: [`${image.canonicalRepository}@${image.manifestDigest}`], imageId: image.configDigest });
  await assert.doesNotReject(() => verifyBootstrapHelperReadiness({ manifest: {}, validateAuthority: async () => ({ lock: { images } }), docker: { inspectImage: async (reference) => valid(images.find((image) => reference.startsWith(image.canonicalRepository))), inspectAlias: async (reference) => valid(images.find((image) => reference === image.sourceRef)) } }));
  for (const docker of [
    { inspectImage: async () => { throw new Error("missing"); }, inspectAlias: async () => ({}) },
    { inspectImage: async (reference) => valid(images.find((image) => reference.startsWith(image.canonicalRepository))), inspectAlias: async () => ({ os: "linux", architecture: "amd64", repoDigests: [], imageId: "other" }) },
    { inspectImage: async () => ({ os: "linux", architecture: "arm64", repoDigests: [], imageId: "other" }), inspectAlias: async () => ({}) },
  ]) await assert.rejects(() => verifyBootstrapHelperReadiness({ manifest: {}, validateAuthority: async () => ({ lock: { images } }), docker }), /HELPER_IMAGES_NOT_READY/);
});

test("post-image gate permits image cache but blocks every target resource", async () => {
  const paths = { targetProtectedRoot: "/target", runtimeEnvs: ["/runtime-a", "/runtime-b"], pgdata: "/pgdata", storage: "/storage" };
  await assert.doesNotReject(() => verifyPostImagePreTargetGate({ manifest: manifest(), paths, filesystem: { exists: async () => false }, docker: { inventory: async () => ({ containers: [], networks: [], volumes: [], images: [{ repository: "godel-design-app" }] }) } }));
  for (const inventory of [{ containers: [{ labels: { "com.docker.compose.project": "godel-runtime" } }], networks: [], volumes: [] }, { containers: [{ name: "supabase-db" }], networks: [], volumes: [] }, { containers: [{ Names: "godel-runtime-app-1" }], networks: [], volumes: [] }, { containers: [], networks: [], volumes: [{ name: "supabase_db-config" }] }]) await assert.rejects(() => verifyPostImagePreTargetGate({ manifest: manifest(), paths, filesystem: { exists: async () => false }, docker: { inventory: async () => inventory } }), /RACE_TARGET_STATE/);
});

test("bootstrap binds H and target creation to one canonical manifest read", async () => {
  const reconstruction = { manifest: manifest() }, seen = [];
  const value = adapters({
    readManifest: async () => { seen.push("read"); return reconstruction; },
    admit: async ({ readManifest }) => { seen.push(await readManifest()); return { state: "PASS", operationId: OPERATION }; },
  });
  await bootstrapCleanHostTarget({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: "/input", generationBundlePath: "/input/bundle", ...value });
  assert.deepEqual(seen.slice(0, 1), ["read"]); assert.strictEqual(seen[1], reconstruction); assert.equal(targetMutationCount(value), 0);
  const mismatch = adapters({ admit: async () => ({ state: "PASS", operationId: "mismatch" }) });
  await assert.rejects(() => bootstrapCleanHostTarget({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: "/input", generationBundlePath: "/input/bundle", ...mismatch }), /INPUT_ADMISSION_OPERATION_MISMATCH/);
  assert.equal(targetMutationCount(mismatch), 0);
});

test("default Docker adapter remains inside the approved bootstrap command families", async () => {
  const calls = [];
  const docker = createBootstrapDockerAdapter({ root: ROOT, runner: async (_binary, args) => {
    calls.push(args);
    if (args[0] === "ps" || args[1] === "ls") return { stdout: "" };
    if (args[1] === "inspect") return { stdout: JSON.stringify([{ Name: args.at(-1), Driver: "bridge", Labels: { "com.docker.compose.project": "supabase", "com.docker.compose.volume": "db-config" }, Config: { User: "storage" } }]) };
    return { stdout: "" };
  } });
  await docker.inventory(); await docker.createNetwork("godel-supabase-api"); await docker.inspectNetwork("godel-supabase-api"); await docker.createVolume("supabase_db-config", "supabase"); await docker.inspectVolume("supabase_db-config"); await docker.inspectImageUser("supabase/storage:synthetic"); await docker.preparePostgresOwnership({ image: "supabase/postgres:synthetic", target: "/target" }); await docker.prepareStorageOwnership({ image: "supabase/storage:synthetic", target: "/target", user: "storage" }); await docker.runXattrProbe({ image: "supabase/storage:synthetic", target: "/target" }); await docker.initializeDbConfig({ image: "supabase/postgres:synthetic", volume: "supabase_db-config" });
  assert.equal(calls.some((args) => ["pull", "tag", "build", "compose", "create"].includes(args[0]) || (["network", "volume", "image"].includes(args[0]) && ["rm", "prune"].includes(args[1]))), false);
  assert.ok(calls.some((args) => args.slice(0, 3).join(" ") === "network create --driver")); assert.ok(calls.some((args) => args.slice(0, 2).join(" ") === "volume create")); assert.ok(calls.some((args) => args.slice(0, 2).join(" ") === "run --rm"));
  const xattr = calls.find((args) => args.some((value) => value.includes("fs-xattr"))), dbConfig = calls.find((args) => args.some((value) => value.includes("/etc/postgresql-custom")));
  assert.match(xattr.join(" "), /setSync.*getSync.*unlinkSync/); assert.match(dbConfig.at(-1), /wc -l\).* -eq 5/); for (const entry of ["conf.d", "extension-custom-scripts", "read-replica.conf", "supautils.conf", "wal-g.conf"]) assert.match(dbConfig.at(-1), new RegExp(entry)); assert.match(dbConfig.at(-1), /! -e .*pgsodium_root\.key/);
  assert.match(calls.find((args) => args.at(-1).includes("id -u postgres")).at(-1), /chmod 0700/); assert.match(calls.find((args) => args.at(-1).includes("id -u storage")).at(-1), /chmod 0755/);
});

test("Storage Docker default root is normalized and invalid Config.User values fail", async () => {
  const dockerFor = (user, calls = []) => createBootstrapDockerAdapter({ root: ROOT, runner: async (_binary, args) => { calls.push(args); return { stdout: JSON.stringify([{ Config: { User: user } }]) }; } });
  const calls = [], rootDefault = dockerFor("", calls);
  assert.equal(await rootDefault.inspectImageUser("supabase/storage:synthetic"), "0:0");
  await rootDefault.prepareStorageOwnership({ image: "supabase/storage:synthetic", target: "/target", user: "0:0" });
  assert.match(calls.at(-1).at(-1), /chown 0:0 .*chmod 0755/);
  for (const user of [null, undefined]) await assert.rejects(() => dockerFor(user).inspectImageUser("supabase/storage:synthetic"), /STORAGE_IMAGE_USER/);
});

test("CLI only accepts H paths and an explicit final --apply", () => {
  const base = ["--manifest", "manifests/reconstruction.json", "--backup", "backups/sh05/backup", "--input-protected-root", "protected-recovery-material/sh05", "--bundle", "bundles/exact"];
  assert.equal(parseBootstrapArgs(base, ROOT).apply, false); assert.equal(parseBootstrapArgs([...base, "--apply"], ROOT).apply, true);
  for (const args of [[...base, "--force"], [...base.slice(0, 6), "../bundle"], ["--manifest", "manifests/reconstruction.json", "--backup", "src/backup", ...base.slice(4)]]) assert.throws(() => parseBootstrapArgs(args, ROOT), /CLEAN_HOST_BOOTSTRAP_PATH/);
});

test("rendered evidence omits paths, Docker IDs, ownership and secret-looking values", () => {
  assert.doesNotMatch(renderBootstrapResult({ state: "PASS", phase: "TARGET_STATE_CREATION" }), /private|sha256|\b[0-9]{3,}\b|secret/i);
  assert.equal(renderBootstrapFailure(new Error("private /target synthetic JWT uid=999")), "FAIL CLEAN_HOST_BOOTSTRAP_FAILED\n");
});
