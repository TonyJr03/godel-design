import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { createOfflineDockerAdapter, exportOfflineImageBundle, fingerprintArchive, importOfflineImageBundle, transportAlias, validateOfflineBundle, validateRawRegistryManifest } from "./offline-image-transport.mjs";

const COMMIT = "a".repeat(40), OPERATION = "12345678-1234-4234-9234-123456789abc";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const platform = { os: "linux", architecture: "amd64" };
const physicalKey = (image) => [image.canonicalRepository, image.manifestDigest, image.configDigest, image.platform.os, image.platform.architecture].join("\0");

function image(index, duplicateOf) {
  const configDigest = duplicateOf?.configDigest ?? `sha256:${String(index + 1).padStart(64, "0")}`;
  const raw = Buffer.from(JSON.stringify({ schemaVersion: 2, config: { digest: configDigest } }));
  return { logicalName: `image-${index}`, canonicalRepository: "docker.io/example/image", sourceRef: `example/image:tag-${index}`, manifestDigest: `sha256:${sha(raw)}`, configDigest, platform, raw };
}
function fixture() {
  const images = Array.from({ length: 11 }, (_, index) => image(index));
  images[0] = { ...images[0], logicalName: "runtime-db", sourceRef: "example/image:shared" };
  images.push({ ...image(11, images[0]), logicalName: "helper-postgres-db-config", sourceRef: "example/image:shared" });
  images.push({ ...image(12, images[0]), logicalName: "helper-postgres-filesystem", sourceRef: "example/image:shared" });
  const lock = { images };
  const manifest = { operationId: OPERATION, repository: { gitCommit: COMMIT }, imageAuthority: { sha256: "b".repeat(64) } };
  return { lock, manifest, manifestSha256: "c".repeat(64), authority: { lock, manifest, manifestSha256: "c".repeat(64) } };
}
function inspected(image, overrides = {}) { return { os: "linux", architecture: "amd64", imageId: image.configDigest, repoDigests: [`${image.canonicalRepository}@${image.manifestDigest}`], ...overrides }; }
function setup(root, item = fixture()) {
  const actions = [], aliases = new Map(), physical = [...new Map(item.lock.images.map((image) => [physicalKey(image), image])).values()];
  const find = (reference) => physical.find((image) => reference === `${image.canonicalRepository}@${image.manifestDigest}` || reference === transportAlias(OPERATION, physical.indexOf(image), image) || aliases.get(reference) === image);
  const docker = {
    rawManifest: async (reference) => { actions.push(`raw ${reference}`); return find(reference).raw; },
    pullExactImage: async (reference) => { actions.push(`pull ${reference}`); },
    inspectImage: async (reference) => inspected(find(reference)),
    inspectAliasIfPresent: async (alias) => aliases.has(alias) ? inspected(aliases.get(alias)) : null,
    tagImage: async (reference, alias) => { actions.push(`tag ${reference} ${alias}`); aliases.set(alias, find(reference)); },
    removeAlias: async (alias) => { actions.push(`rm ${alias}`); aliases.delete(alias); },
    save: async (alias, output) => { actions.push(`save linux/amd64 ${alias}`); await writeFile(output, `archive:${alias}`); },
    load: async (input) => { actions.push(`load linux/amd64 ${basename(input)}`); const index = Number.parseInt(basename(input).slice(0, 2), 10), target = physical[index]; aliases.set(transportAlias(OPERATION, index, target), target); },
  };
  return { actions, aliases, authority: item.authority, docker, physical, readManifest: async () => ({ manifest: item.manifest, manifestSha256: item.manifestSha256 }), validateAuthority: async () => ({ lock: item.lock }), git: { clean: async () => true, head: async () => COMMIT } };
}
async function temporaryRoot() { const root = await mkdtemp(join(tmpdir(), "godel-offline-images-")); await mkdir(join(root, "backups")); return root; }
async function exportedBundle(root, local = setup(root)) { await exportOfflineImageBundle({ manifestPath: "manifests/reconstruction.json", output: "backups/bundle", root, ...local }); return local; }

test("raw manifests bind the exact registry bytes and config identity", () => {
  const item = image(0);
  assert.doesNotThrow(() => validateRawRegistryManifest(item, item.raw));
  assert.throws(() => validateRawRegistryManifest({ ...item, manifestDigest: `sha256:${"0".repeat(64)}` }, item.raw), /RAW_MANIFEST_BINDING/);
  const wrongConfig = Buffer.from(JSON.stringify({ config: { digest: `sha256:${"f".repeat(64)}` } }));
  assert.throws(() => validateRawRegistryManifest(item, wrongConfig), /RAW_MANIFEST_BINDING/);
});

test("the production Docker adapter explicitly saves and loads linux/amd64 archives", async () => {
  const actions = [], docker = createOfflineDockerAdapter({ root: "C:/synthetic", runner: async (binary, args) => { actions.push([binary, ...args]); return { stdout: "" }; } });
  await docker.save("godel-sh-image-transport/12345678:0-abcdefabcdef", "archive.tar"); await docker.load("archive.tar");
  assert.deepEqual(actions, [["docker", "image", "save", "--platform", "linux/amd64", "--output", "archive.tar", "godel-sh-image-transport/12345678:0-abcdefabcdef"], ["docker", "image", "load", "--platform", "linux/amd64", "--input", "archive.tar"]]);
});

test("archive fingerprints stream exact size and SHA-256 without archive readFile semantics", async () => {
  const root = await temporaryRoot(), archive = join(root, "archive.tar"), bytes = Buffer.alloc(256 * 1024, "godel");
  try { await writeFile(archive, bytes); assert.deepEqual(await fingerprintArchive(archive), { size: bytes.length, sha256: sha(bytes) }); } finally { await rm(root, { recursive: true, force: true }); }
});

test("export rejects dirty and wrong-HEAD repositories before directory or Docker mutation", async () => {
  const root = await temporaryRoot();
  try {
    const dirty = setup(root); dirty.git.clean = async () => false;
    await assert.rejects(() => exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/dirty", root, ...dirty }), /REPOSITORY_DIRTY/);
    assert.equal(dirty.actions.length, 0); await assert.rejects(() => readFile(join(root, "backups", "dirty")));
    const mismatch = setup(root); mismatch.git.head = async () => "d".repeat(40);
    await assert.rejects(() => exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/mismatch", root, ...mismatch }), /GIT_MISMATCH/);
    assert.equal(mismatch.actions.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("export accepts exact RepoDigest/configDigest/platform and deduplicates eleven physical images", async () => {
  const root = await temporaryRoot(), local = setup(root);
  try {
    const result = await exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/bundle", root, ...local });
    const bundle = JSON.parse(await readFile(join(root, "backups", "bundle", "bundle.json")));
    assert.equal(result.uniqueImages, 11); assert.equal(bundle.images.length, 11);
    assert.equal(local.actions.filter((action) => action.startsWith("save linux/amd64")).length, 11);
    assert.equal(local.actions.filter((action) => action.startsWith("rm godel-sh-image-transport/")).length, 11);
    assert.equal(transportAlias(bundle.operationId, 0, bundle.images[0]), transportAlias(OPERATION, 0, local.physical[0]));
    const bytes = await readFile(join(root, "backups", "bundle", "bundle.json"));
    assert.equal((await readFile(join(root, "backups", "bundle", "bundle.json.sha256"))).toString(), `${sha(bytes)}  bundle.json\n`);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("shared PostgreSQL sourceRef topology exports one sorted unique alias and converges through import", async () => {
  const root = await temporaryRoot(), exported = setup(root);
  try {
    await exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/shared", root, ...exported });
    const metadata = JSON.parse(await readFile(join(root, "backups", "shared", "bundle.json")));
    const shared = metadata.images.find((image) => image.sourceRefs.includes("example/image:shared"));
    assert.deepEqual(shared.sourceRefs, ["example/image:shared"]);
    assert.doesNotThrow(() => validateOfflineBundle(metadata, exported.authority, exported.authority.manifestSha256));
    const imported = setup(root);
    const result = await importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/shared", root, gate: async () => ({ state: "PASS" }), ...imported });
    assert.equal(result.state, "PASS");
    assert.equal(imported.actions.filter((action) => action.startsWith("load linux/amd64")).length, 11);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("shared physical aliases export as a deterministic sorted set", async () => {
  const root = await temporaryRoot(), item = fixture();
  item.lock.images.push({ ...item.lock.images[0], logicalName: "runtime-db-alternate", sourceRef: "example/image:alternate" });
  const local = setup(root, item);
  try {
    await exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/sorted", root, ...local });
    const metadata = JSON.parse(await readFile(join(root, "backups", "sorted", "bundle.json")));
    const shared = metadata.images.find((image) => image.sourceRefs.includes("example/image:shared"));
    assert.deepEqual(shared.sourceRefs, ["example/image:alternate", "example/image:shared"]);
    assert.doesNotThrow(() => validateOfflineBundle(metadata, local.authority, item.manifestSha256));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("offline export accepts Docker 29 descriptor identity and rejects a bad descriptor before alias/save", async () => {
  const root = await temporaryRoot();
  try {
    const containerd = setup(root); containerd.docker.inspectImage = async (reference) => { const image = containerd.physical.find((item) => reference.endsWith(item.manifestDigest)); return inspected(image, { imageId: image.manifestDigest, descriptor: { digest: image.manifestDigest } }); };
    await exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/containerd", root, ...containerd }); assert.equal(containerd.actions.some((action) => action.startsWith("save ")), true);
    const wrong = setup(root); wrong.docker.inspectImage = async (reference) => { const image = wrong.physical.find((item) => reference.endsWith(item.manifestDigest)); return inspected(image, { descriptor: { digest: `sha256:${"f".repeat(64)}` } }); };
    await assert.rejects(() => exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/wrong-descriptor", root, ...wrong }), /EXPORT_IMAGE/); assert.equal(wrong.actions.some((action) => action.startsWith("tag ") || action.startsWith("save ")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("export reuses exact transport aliases, refuses mismatches without retagging, and reports owned cleanup residue", async () => {
  const root = await temporaryRoot();
  try {
    const exact = setup(root), alias = transportAlias(OPERATION, 0, exact.physical[0]); exact.aliases.set(alias, exact.physical[0]);
    await exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/exact", root, ...exact });
    assert.equal(exact.actions.some((action) => action.endsWith(` ${alias}`) && action.startsWith("tag")), false);
    const mismatch = setup(root), badAlias = transportAlias(OPERATION, 0, mismatch.physical[0]); mismatch.aliases.set(badAlias, { ...mismatch.physical[0], configDigest: `sha256:${"e".repeat(64)}` });
    await assert.rejects(() => exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/mismatch", root, ...mismatch }), /ALIAS_MISMATCH/);
    assert.equal(mismatch.actions.some((action) => action.startsWith("tag")), false);
    const residue = setup(root); residue.docker.removeAlias = async () => { throw new Error("cannot remove"); };
    await assert.rejects(() => exportOfflineImageBundle({ manifestPath: "manifest.json", output: "backups/residue", root, ...residue }), /TEMP_ALIAS_CLEANUP_INCOMPLETE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("export requires exact RepoDigest after pull and before transport alias publication", async () => {
  const root = await temporaryRoot();
  try {
    for (const repoDigests of [[], ["docker.io/example/image@sha256:" + "f".repeat(64)]]) {
      const local = setup(root); local.docker.inspectImage = async (reference) => inspected(local.physical.find((image) => reference.endsWith(image.manifestDigest)), { repoDigests });
      await assert.rejects(() => exportOfflineImageBundle({ manifestPath: "manifest.json", output: `backups/repodigest-${repoDigests.length}`, root, ...local }), /REGISTRY_REPODIGEST/);
      assert.equal(local.actions.some((action) => action.startsWith("pull ")), true); assert.equal(local.actions.some((action) => action.startsWith("tag ") || action.startsWith("save ")), false);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("strict bundle validation rejects extra keys, bad lock binding, platform, archives, and duplicate source mappings", () => {
  const item = fixture(), base = { schemaVersion: 1, format: "godel-sh-offline-image-bundle", operationId: OPERATION, repositoryGitCommit: COMMIT, reconstructionManifestSha256: item.manifestSha256, imageLockSha256: item.manifest.imageAuthority.sha256, imageLockSchemaVersion: 2, platform, images: [...new Map(item.lock.images.map((image) => [physicalKey(image), image])).values()].map((image, index) => ({ canonicalRepository: image.canonicalRepository, sourceRefs: [...new Set(item.lock.images.filter((entry) => physicalKey(entry) === physicalKey(image)).map((entry) => entry.sourceRef))].sort(), manifestDigest: image.manifestDigest, configDigest: image.configDigest, platform, archive: `${String(index).padStart(2, "0")}.tar`, size: 1, sha256: "d".repeat(64) })) };
  assert.doesNotThrow(() => validateOfflineBundle(base, item.authority, item.manifestSha256));
  assert.throws(() => validateOfflineBundle({ ...base, extra: true }, item.authority, item.manifestSha256), /BUNDLE_SCHEMA/);
  assert.throws(() => validateOfflineBundle({ ...base, imageLockSchemaVersion: 1 }, item.authority, item.manifestSha256), /BUNDLE_BINDING/);
  assert.throws(() => validateOfflineBundle({ ...base, platform: { os: "linux", architecture: "arm64" } }, item.authority, item.manifestSha256), /BUNDLE_PLATFORM/);
  assert.throws(() => validateOfflineBundle({ ...base, images: [{ ...base.images[0], archive: "../unsafe.tar" }, ...base.images.slice(1)] }, item.authority, item.manifestSha256), /BUNDLE_INVENTORY/);
  assert.throws(() => validateOfflineBundle({ ...base, images: [{ ...base.images[0], sourceRefs: [base.images[0].sourceRefs[0], base.images[0].sourceRefs[0]] }, ...base.images.slice(1)] }, item.authority, item.manifestSha256), /BUNDLE_INVENTORY/);
});

test("import rejects sidecar and archive size/hash failures before its first load", async () => {
  const root = await temporaryRoot();
  try {
    await exportedBundle(root); const broken = setup(root);
    await writeFile(join(root, "backups", "bundle", "bundle.json.sha256"), "0".repeat(64) + "  bundle.json\n");
    await assert.rejects(() => importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...broken }), /BUNDLE_SIDECAR/);
    assert.equal(broken.actions.some((action) => action.startsWith("load")), false);
    const second = setup(root); await writeFile(join(root, "backups", "bundle", "bundle.json.sha256"), `${sha(await readFile(join(root, "backups", "bundle", "bundle.json")))}  bundle.json\n`);
    const finalArchive = join(root, "backups", "bundle", JSON.parse(await readFile(join(root, "backups", "bundle", "bundle.json"))).images.at(-1).archive); await writeFile(finalArchive, "bad archive");
    await assert.rejects(() => importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...second }), /ARCHIVE_INVALID/);
    assert.equal(second.actions.some((action) => action.startsWith("load")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("import rejects declared archive size and SHA mismatches before any load", async () => {
  const root = await temporaryRoot();
  try {
    await exportedBundle(root); const bundlePath = join(root, "backups", "bundle"), metadata = JSON.parse(await readFile(join(bundlePath, "bundle.json")));
    for (const [field, value] of [["size", metadata.images[0].size + 1], ["sha256", "f".repeat(64)]]) {
      const altered = structuredClone(metadata); altered.images[0][field] = value; const bytes = Buffer.from(`${JSON.stringify(altered)}\n`); await writeFile(join(bundlePath, "bundle.json"), bytes); await writeFile(join(bundlePath, "bundle.json.sha256"), `${sha(bytes)}  bundle.json\n`);
      const local = setup(root); await assert.rejects(() => importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...local }), /ARCHIVE_INVALID/); assert.equal(local.actions.some((action) => action.startsWith("load")), false);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("import rejects a symlinked archive before Docker mutation", async (t) => {
  const root = await temporaryRoot();
  try {
    await exportedBundle(root); const bundlePath = join(root, "backups", "bundle"), metadata = JSON.parse(await readFile(join(bundlePath, "bundle.json")));
    const link = join(bundlePath, "symlink.tar");
    try { await symlink(join(bundlePath, metadata.images[0].archive), link); } catch (error) { if (error?.code === "EPERM") { t.skip("Windows symlink privilege is unavailable"); return; } throw error; }
    metadata.images[0].archive = "symlink.tar"; const bytes = Buffer.from(`${JSON.stringify(metadata)}\n`); await writeFile(join(bundlePath, "bundle.json"), bytes); await writeFile(join(bundlePath, "bundle.json.sha256"), `${sha(bytes)}  bundle.json\n`);
    const local = setup(root); await assert.rejects(() => importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...local }), /ARCHIVE_INVALID/); assert.equal(local.actions.some((action) => action.startsWith("load")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("import uses the exported deterministic alias, loads linux/amd64, verifies all images before source publication, and resumes safely", async () => {
  const root = await temporaryRoot();
  try {
    const exported = await exportedBundle(root), imported = setup(root);
    await importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...imported });
    const loads = imported.actions.filter((action) => action.startsWith("load linux/amd64"));
    const sourceTags = imported.actions.filter((action) => action.startsWith("tag godel-sh-image-transport/"));
    assert.equal(loads.length, 11); assert.equal(sourceTags.length, new Set(exported.physical.map((image) => image.sourceRef)).size);
    assert.equal(imported.actions.findIndex((action) => action.startsWith("tag godel-sh-image-transport/")) > imported.actions.findIndex((action) => action.startsWith("load")), true);
    const resumed = setup(root); for (const [alias, value] of imported.aliases) resumed.aliases.set(alias, value);
    await importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...resumed });
    assert.equal(resumed.actions.some((action) => action.startsWith("load")), false);
    assert.equal(resumed.actions.some((action) => action.startsWith("tag")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("offline import accepts Docker 29 descriptors and fails a wrong descriptor before sourceRef publication", async () => {
  const root = await temporaryRoot();
  try {
    await exportedBundle(root); const containerd = setup(root), inspect = containerd.docker.inspectAliasIfPresent;
    containerd.docker.inspectAliasIfPresent = async (alias) => { const value = await inspect(alias); if (!value) return null; const image = containerd.aliases.get(alias); return { ...value, imageId: image.manifestDigest, descriptor: { digest: image.manifestDigest } }; };
    await importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...containerd }); assert.equal(containerd.actions.some((action) => action.startsWith("tag godel-sh-image-transport/")), true);
    const wrong = setup(root), wrongInspect = wrong.docker.inspectAliasIfPresent;
    wrong.docker.inspectAliasIfPresent = async (alias) => { const value = await wrongInspect(alias); if (!value) return null; const image = wrong.aliases.get(alias); return { ...value, imageId: image.configDigest, descriptor: { digest: `sha256:${"f".repeat(64)}` } }; };
    await assert.rejects(() => importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...wrong }), /LOADED_IMAGE_MISMATCH/); assert.equal(wrong.actions.some((action) => action.startsWith("tag godel-sh-image-transport/")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("import fails closed on mismatched loaded transport or source aliases and does not publish early", async () => {
  const root = await temporaryRoot();
  try {
    await exportedBundle(root);
    const transportMismatch = setup(root); transportMismatch.aliases.set(transportAlias(OPERATION, 0, transportMismatch.physical[0]), { ...transportMismatch.physical[0], configDigest: `sha256:${"f".repeat(64)}` });
    await assert.rejects(() => importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...transportMismatch }), /ALIAS_MISMATCH/);
    assert.equal(transportMismatch.actions.some((action) => action.startsWith("tag godel-sh-image-transport/")), false);
    const sourceMismatch = setup(root); sourceMismatch.aliases.set(sourceMismatch.physical[0].sourceRef, { ...sourceMismatch.physical[0], configDigest: `sha256:${"f".repeat(64)}` });
    await assert.rejects(() => importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...sourceMismatch }), /ALIAS_MISMATCH/);
    assert.equal(sourceMismatch.actions.some((action) => action.startsWith("tag godel-sh-image-transport/")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("import rejects a wrong loaded platform before any sourceRef is published", async () => {
  const root = await temporaryRoot();
  try {
    await exportedBundle(root); const local = setup(root), inspect = local.docker.inspectAliasIfPresent;
    local.docker.inspectAliasIfPresent = async (alias) => alias.startsWith("godel-sh-image-transport/") && local.actions.some((action) => action.startsWith("load")) ? { ...await inspect(alias), architecture: "arm64" } : inspect(alias);
    await assert.rejects(() => importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/bundle", root, gate: async () => ({ state: "PASS" }), ...local }), /LOADED_IMAGE_MISMATCH/);
    assert.equal(local.actions.some((action) => action.startsWith("tag godel-sh-image-transport/")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("manifest and image-lock authority failures are controlled and occur before Docker mutation", async () => {
  const root = await temporaryRoot();
  try {
    for (const reason of ["MANIFEST_SHA_MISMATCH", "IMAGE_LOCK_SHA_MISMATCH", "IMAGE_LOCK_SCHEMA", "PLATFORM"]) {
      const local = setup(root);
      await assert.rejects(() => importOfflineImageBundle({ manifestPath: "manifest.json", bundle: "backups/missing", root, gate: async () => ({ state: "PASS" }), readManifest: local.readManifest, validateAuthority: async () => { throw new Error(reason); }, docker: local.docker }), /OFFLINE_IMAGE_TRANSPORT_AUTHORITY/);
      assert.equal(local.actions.length, 0);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
