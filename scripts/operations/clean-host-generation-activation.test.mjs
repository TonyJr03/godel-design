import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { activateCleanHostGeneration, createGenerationActivationDockerAdapter, parseGenerationActivationArgs, renderGenerationActivationFailure, renderGenerationActivationResult } from "./clean-host-generation-activation.mjs";

const ROOT = resolve("/repo"), INPUT = resolve("/input"), BUNDLE = resolve(INPUT, "bundle"), OPERATION = "123e4567-e89b-42d3-a456-426614174000", GENERATION = "223e4567-e89b-42d3-a456-426614174000", MANIFEST_SHA = "a".repeat(64);
const FILES = { metadata: "metadata.json", supabase: "supabase.env", godel: "godel.env", commit: "bundle.json" };
function reconstruction() { return { manifestSha256: MANIFEST_SHA, manifest: { operationId: OPERATION, externalSecretGenerationId: GENERATION, targetContract: { operatorNetwork: "godel-supabase-api", supabaseComposeProject: "supabase", godelComposeProject: "godel-runtime" } } }; }
function bundleFixture(overrides = {}) {
  const metadataBytes = Buffer.from('{"generation":"synthetic"}\n'), supabaseSnapshot = Buffer.from("JWT=synthetic-jwt\nDB=synthetic-db-password\n"), godelSnapshot = Buffer.from("NEXT_PUBLIC_KEY=synthetic-publishable\nSECRET=synthetic-secret\n"), bundle = { generationId: GENERATION, reconstruction: { operationId: OPERATION, manifestSha256: MANIFEST_SHA }, format: "synthetic" };
  return { bundle: { ...bundle, ...overrides.bundle, reconstruction: { ...bundle.reconstruction, ...overrides.bundle?.reconstruction } }, metadataBytes, supabaseSnapshot, godelSnapshot };
}
function paths() { const targetProtectedRoot = resolve(ROOT, "protected-recovery-material/selfhosted"); return { targetProtectedRoot, pgdata: resolve(ROOT, "infra/supabase/volumes/db/data"), storage: resolve(ROOT, "infra/supabase/volumes/storage"), supabase: resolve(ROOT, "infra/supabase/.env"), godel: resolve(ROOT, "compose.env.local"), registry: resolve(targetProtectedRoot, "external-secrets"), staging: resolve(targetProtectedRoot, `.incoming-generation-${OPERATION}`) }; }
function fakeFilesystem(options = {}) {
  const value = paths(), directories = new Map(), files = new Map(), actions = [];
  const addDirectory = (path, mode, entries = []) => directories.set(path, { mode, entries: [...entries] });
  if (!options.missingTarget) addDirectory(value.targetProtectedRoot, options.targetMode ?? 0o700, options.targetEntries ?? []);
  if (!options.missingPgdata) addDirectory(value.pgdata, options.pgdataMode ?? 0o700, options.pgdataEntries ?? []);
  if (!options.missingStorage) addDirectory(value.storage, options.storageMode ?? 0o755, options.storageEntries ?? []);
  if (options.presentSupabase) files.set(value.supabase, Buffer.from("present"));
  if (options.presentGodel) files.set(value.godel, Buffer.from("present"));
  if (options.presentRegistry) { addDirectory(value.registry, 0o700); directories.get(value.targetProtectedRoot)?.entries.push("external-secrets"); }
  files.set(resolve(BUNDLE, FILES.commit), Buffer.from('{"bundle":"synthetic"}\n'));
  const addEntry = (path) => directories.get(resolve(path, ".."))?.entries.push(path.split(/[\\/]/).at(-1));
  const api = {
    actions,
    exists: async (path) => directories.has(path) || files.has(path),
    entry: async (path) => {
      if (directories.has(path)) { const item = directories.get(path); return { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false, mode: item.mode }; }
      if (files.has(path)) return { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false, mode: options.envMode ?? 0o600 };
      throw new Error("missing");
    },
    entries: async (path) => { const item = directories.get(path); if (!item) throw new Error("missing"); return [...item.entries]; },
    readFile: async (path) => { if (!files.has(path)) throw new Error("missing"); return files.get(path); },
    createDirectory: async (path, mode) => { actions.push(["mkdir", path]); if (options.stagingExists || directories.has(path) || files.has(path)) throw new Error("exists"); addDirectory(path, mode); addEntry(path); },
    writeFileExclusive: async (path, bytes) => { actions.push(["write", path]); if (options.copyFailure && path.endsWith(options.copyFailure)) throw new Error("copy"); if (files.has(path)) throw new Error("exists"); files.set(path, Buffer.from(bytes)); addEntry(path); },
    removeDirectory: async (path) => { actions.push(["remove", path]); if (options.cleanupFailure) throw new Error("cleanup"); const directory = directories.get(path); if (!directory) throw new Error("missing"); for (const name of directory.entries) files.delete(resolve(path, name)); directories.delete(path); const parent = directories.get(resolve(path, "..")); if (parent) parent.entries = parent.entries.filter((name) => name !== path.split(/[\\/]/).at(-1)); },
    materialize: (path, bytes) => { files.set(path, Buffer.from(bytes)); },
    addRegistry: () => { if (!directories.has(value.registry)) { addDirectory(value.registry, 0o700); directories.get(value.targetProtectedRoot).entries.push("external-secrets"); } },
  };
  return api;
}
function fakeDocker(options = {}) {
  const actions = [], contract = reconstruction().manifest.targetContract;
  let inventoryCalls = 0;
  return {
    actions,
    inventory: async () => { inventoryCalls += 1; return inventoryCalls > 1 && options.finalInventory ? options.finalInventory : options.inventory ?? { containers: [], volumes: [], networks: [] }; },
    inspectNetwork: async () => options.network ?? { name: contract.operatorNetwork, driver: "bridge" },
    inspectVolume: async () => options.volume ?? { name: "supabase_db-config", labels: { "com.docker.compose.project": "supabase", "com.docker.compose.volume": "db-config" } },
    verifyDbConfig: async () => { actions.push(["db-config-verify"]); if (options.dbConfigFailure) throw new Error("db-config"); },
  };
}
function adapters(options = {}) {
  const filesystem = fakeFilesystem(options), docker = fakeDocker(options), source = options.source ?? bundleFixture(), events = [], state = { imports: [] };
  const readBundle = async ({ bundlePath }) => {
    if (options.sourceInvalid && bundlePath === BUNDLE) throw new Error("source");
    if (bundlePath === BUNDLE) return source;
    if (bundlePath === paths().staging) {
      if (options.stagedInvalid) throw new Error("staged");
      const staged = bundleFixture({ bundle: options.stagedBundle });
      return { ...staged, metadataBytes: await filesystem.readFile(resolve(bundlePath, FILES.metadata)), supabaseSnapshot: await filesystem.readFile(resolve(bundlePath, FILES.supabase)), godelSnapshot: await filesystem.readFile(resolve(bundlePath, FILES.godel)) };
    }
    throw new Error("unknown bundle");
  };
  const importBundle = async (args) => {
    state.imports.push(args); events.push("import");
    if (options.importFailure) throw new Error("import");
    events.push("generation-publication"); filesystem.addRegistry();
    events.push("supabase-env"); filesystem.materialize(args.supabaseEnvPath, source.supabaseSnapshot);
    events.push("godel-env"); filesystem.materialize(args.godelEnvPath, source.godelSnapshot);
    events.push("referenced-match"); events.push("current-pointer"); events.push("active-match");
    return { state: "IMPORTED", generationId: GENERATION, operationId: OPERATION };
  };
  return {
    filesystem, docker, events, state,
    readManifest: options.readManifest ?? (async () => reconstruction()),
    admit: options.admit ?? (async () => ({ state: "PASS", operationId: OPERATION })),
    assertBundlePath: options.assertBundlePath ?? (async ({ path }) => path),
    readBundle,
    importBundle,
    assertActive: options.assertActive ?? (async () => { events.push("j-active-match"); }),
    helperReadiness: options.helperReadiness ?? (async () => ({ postgresImage: "supabase/postgres:synthetic" })),
  };
}
async function run(options = {}) {
  const value = adapters(options);
  const result = await activateCleanHostGeneration({ root: ROOT, manifestPath: "/private/manifest", backupPath: "/private/backup", inputProtectedRoot: INPUT, generationBundlePath: BUNDLE, ...value, apply: options.apply ?? false });
  return { ...value, result };
}
function jMutations(value) { return value.filesystem.actions.filter(([kind]) => kind === "mkdir" || kind === "write" || kind === "remove"); }

test("dry-run composes H, exact source validation and I foundation without J mutation", async () => {
  const canonical = reconstruction(), seen = [], value = await run({ readManifest: async () => { seen.push("read"); return canonical; }, admit: async ({ readManifest }) => { seen.push(await readManifest()); return { state: "PASS", operationId: OPERATION }; } });
  assert.equal(value.result.state, "VALIDATED_NOT_APPLIED"); assert.equal(jMutations(value).length, 0); assert.equal(value.state.imports.length, 0);
  assert.equal(await value.filesystem.exists(paths().staging), false); assert.equal(await value.filesystem.exists(paths().registry), false);
  assert.deepEqual(seen.slice(0, 1), ["read"]); assert.strictEqual(seen[1], canonical);
});

test("preflight failures leave I foundation unchanged and never invoke canonical import", async () => {
  const target = paths().targetProtectedRoot;
  const cases = [
    { admit: async () => { throw new Error("H"); } }, { missingTarget: true }, { targetMode: 0o755 }, { targetEntries: ["foreign"] }, { presentSupabase: true }, { presentGodel: true }, { presentRegistry: true },
    { missingPgdata: true }, { pgdataMode: 0o755 }, { pgdataEntries: ["data"] }, { missingStorage: true }, { storageMode: 0o700 }, { storageEntries: ["data"] },
    { network: { name: "godel-supabase-api", driver: "overlay" } }, { volume: { name: "wrong", labels: {} } }, { dbConfigFailure: true }, { inventory: { containers: [{ name: "supabase-db", labels: {} }], volumes: [], networks: [] } }, { inventory: { containers: [], volumes: [{ name: "supabase_deno-cache", labels: { "com.docker.compose.project": "supabase" } }], networks: [] } }, { inventory: { containers: [], volumes: [], networks: [{ name: "unexpected-supabase-network", labels: { "com.docker.compose.project": "supabase" } }] } }, { sourceInvalid: true }, { source: bundleFixture({ bundle: { generationId: "323e4567-e89b-42d3-a456-426614174000" } }) }, { source: bundleFixture({ bundle: { reconstruction: { operationId: "423e4567-e89b-42d3-a456-426614174000" } } }) }, { source: bundleFixture({ bundle: { reconstruction: { manifestSha256: "b".repeat(64) } } }) },
  ];
  for (const options of cases) {
    const value = adapters(options);
    await assert.rejects(() => activateCleanHostGeneration({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: INPUT, generationBundlePath: BUNDLE, ...value }), /CLEAN_HOST_GENERATION_ACTIVATION_/);
    assert.equal(jMutations(value).length, 0); assert.equal(value.state.imports.length, 0); assert.equal(await value.filesystem.exists(target) || options.missingTarget, true);
  }
});

test("unrelated Docker resources remain allowed while final target-labelled resources block without rollback", async () => {
  const unrelated = await run({ inventory: { containers: [], volumes: [{ name: "foreign-volume", labels: {} }], networks: [{ name: "foreign-network", labels: {} }] } });
  assert.equal(unrelated.result.state, "VALIDATED_NOT_APPLIED");
  for (const finalInventory of [
    { containers: [], volumes: [{ name: "supabase_deno-cache", labels: { "com.docker.compose.project": "supabase" } }], networks: [] },
    { containers: [], volumes: [], networks: [{ name: "unexpected-supabase-network", labels: { "com.docker.compose.project": "supabase" } }] },
  ]) {
    const value = adapters({ finalInventory });
    await assert.rejects(() => activateCleanHostGeneration({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: INPUT, generationBundlePath: BUNDLE, ...value, apply: true }), /BLOCKED_PARTIAL_GENERATION_ACTIVATION/);
    assert.equal(value.events.includes("current-pointer"), true); assert.equal(await value.filesystem.exists(paths().registry), true); assert.equal(await value.filesystem.exists(paths().supabase), true); assert.equal(await value.filesystem.exists(paths().godel), true); assert.equal(value.docker.actions.some(([kind]) => /rm|prune|delete/.test(kind)), false);
  }
});

test("apply stages exact bytes, delegates once to D, preserves D ordering and cleans only staging", async () => {
  const value = await run({ apply: true });
  assert.equal(value.result.state, "PASS"); assert.equal(value.state.imports.length, 1);
  const [imported] = value.state.imports;
  assert.equal(imported.apply, true); assert.equal(imported.bundlePath, paths().staging); assert.equal(imported.protectedRoot, paths().targetProtectedRoot); assert.equal(imported.supabaseEnvPath, paths().supabase); assert.equal(imported.godelEnvPath, paths().godel);
  for (const name of [FILES.metadata, FILES.supabase, FILES.godel, FILES.commit]) assert.ok(value.filesystem.actions.some(([kind, path]) => kind === "write" && path.endsWith(name)));
  assert.ok(value.filesystem.actions.findIndex(([kind, path]) => kind === "write" && path.endsWith(FILES.commit)) > value.filesystem.actions.findIndex(([kind, path]) => kind === "write" && path.endsWith(FILES.godel)));
  for (let index = 1; index < ["generation-publication", "supabase-env", "godel-env", "referenced-match", "current-pointer", "active-match"].length; index += 1) assert.ok(value.events.indexOf(["generation-publication", "supabase-env", "godel-env", "referenced-match", "current-pointer", "active-match"][index - 1]) < value.events.indexOf(["generation-publication", "supabase-env", "godel-env", "referenced-match", "current-pointer", "active-match"][index]));
  assert.equal(await value.filesystem.exists(paths().staging), false); assert.equal(await value.filesystem.exists(paths().registry), true); assert.equal(await value.filesystem.exists(paths().supabase), true); assert.equal(await value.filesystem.exists(paths().godel), true);
  assert.deepEqual(value.filesystem.actions.filter(([kind]) => kind === "remove").map(([, path]) => path), [paths().staging]);
});

test("staging and import failures remain blocked partial without cleanup or rollback", async () => {
  for (const options of [{ copyFailure: FILES.godel }, { stagedInvalid: true }, { importFailure: true }]) {
    const value = adapters(options);
    await assert.rejects(() => activateCleanHostGeneration({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: INPUT, generationBundlePath: BUNDLE, ...value, apply: true }), /BLOCKED_PARTIAL_GENERATION_ACTIVATION/);
    assert.equal(value.filesystem.actions.some(([kind]) => kind === "remove"), false);
  }
});

test("active match and final environment failures block without pointer rollback", async () => {
  for (const assertActive of [async () => { throw new Error("wrong-active"); }, async () => { throw new Error("supabase-mismatch"); }, async () => { throw new Error("godel-mismatch"); }, async () => { throw new Error("current-absent"); }]) {
    const value = adapters({ assertActive });
    await assert.rejects(() => activateCleanHostGeneration({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: INPUT, generationBundlePath: BUNDLE, ...value, apply: true }), /BLOCKED_PARTIAL_GENERATION_ACTIVATION/);
    assert.equal(value.events.includes("current-pointer"), true); assert.equal(value.filesystem.actions.some(([kind]) => kind === "remove"), false);
  }
  const wrongMode = adapters({ envMode: 0o644 });
  await assert.rejects(() => activateCleanHostGeneration({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: INPUT, generationBundlePath: BUNDLE, ...wrongMode, apply: true }), /BLOCKED_PARTIAL_GENERATION_ACTIVATION/);
  assert.equal(wrongMode.filesystem.actions.some(([kind]) => kind === "remove"), false);
});

test("post-activation staging cleanup failure is explicit and does not roll back activated state", async () => {
  const value = adapters({ cleanupFailure: true });
  await assert.rejects(() => activateCleanHostGeneration({ root: ROOT, manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: INPUT, generationBundlePath: BUNDLE, ...value, apply: true }), /POST_ACTIVATION_CLEANUP_FAILED/);
  assert.equal(value.events.includes("current-pointer"), true); assert.equal(await value.filesystem.exists(paths().registry), true); assert.equal(await value.filesystem.exists(paths().supabase), true); assert.equal(await value.filesystem.exists(paths().godel), true); assert.equal(await value.filesystem.exists(paths().staging), true);
});

test("default Docker adapter stays read-only and CLI has no generation override", async () => {
  const calls = [], docker = createGenerationActivationDockerAdapter({ root: ROOT, runner: async (_binary, args) => { calls.push(args); if (args[0] === "ps" || args[1] === "ls") return { stdout: "" }; return { stdout: JSON.stringify([{ Name: args.at(-1), Driver: "bridge", Labels: { "com.docker.compose.project": "supabase", "com.docker.compose.volume": "db-config" } }]) }; } });
  await docker.inventory(); await docker.inspectNetwork("godel-supabase-api"); await docker.inspectVolume("supabase_db-config"); await docker.verifyDbConfig({ image: "supabase/postgres:synthetic", volume: "supabase_db-config" });
  assert.equal(calls.some((args) => ["pull", "tag", "build", "compose", "start", "create", "rm", "prune"].includes(args[0]) || (["network", "volume"].includes(args[0]) && ["create", "rm"].includes(args[1]))), false);
  const base = ["--manifest", "manifests/reconstruction.json", "--backup", "backups/sh05/backup", "--input-protected-root", "protected-recovery-material/sh05-input", "--bundle", "bundles/exact"];
  assert.equal(parseGenerationActivationArgs([...base, "--apply"], ROOT).apply, true); assert.throws(() => parseGenerationActivationArgs([...base, "--generation", GENERATION], ROOT), /PATH/);
});

test("public evidence never renders source paths, Docker identifiers or secret fixtures", () => {
  assert.doesNotMatch(renderGenerationActivationResult({ state: "PASS", generation: GENERATION }), /synthetic|private|sha256|docker/i);
  assert.equal(renderGenerationActivationFailure(new Error("private /target synthetic-jwt docker-id")), "FAIL CLEAN_HOST_GENERATION_ACTIVATION_FAILED\n");
});
