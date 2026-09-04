import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { createDefaultAdapters, evaluateCleanHostGate, parseCleanHostGateArgs, renderCleanHostGateResult } from "./clean-host-gate.mjs";

const COMMIT = "b58056939619a501b7d1fec208b9d32e4b43dffc";
const SHA = "a".repeat(64), ID = "123e4567-e89b-42d3-a456-426614174000";
function manifest() { return { schemaVersion: 1, format: "godel-sh-reconstruction-manifest", operationId: ID, platform: { os: "linux", architecture: "amd64" }, repository: { gitCommit: COMMIT }, supabase: { upstreamCommit: COMMIT, upstreamLockSha256: SHA }, imageAuthority: { format: "godel-sh-portability-image-lock", schemaVersion: 1, sha256: SHA, platform: { os: "linux", architecture: "amd64" }, imageCount: 1, images: [{ logicalName: "postgres", canonicalRepository: "supabase/postgres", manifestDigest: `sha256:${SHA}`, platform: { os: "linux", architecture: "amd64" } }] }, godelBuilds: ["godel-app", "godel-nginx"].map((logicalName) => ({ logicalName, dockerfile: logicalName === "godel-app" ? "Dockerfile" : "Dockerfile.nginx", dockerfileSha256: SHA, baseImages: [`node@sha256:${SHA}`], platform: { os: "linux", architecture: "amd64" }, gitCommit: COMMIT, configurationBinding: logicalName === "godel-app" ? ID : null })), backup: { backupId: "backup", schemaVersion: 3, manifestSha256: SHA, checksumsSha256: SHA, sourceGitCommit: COMMIT }, externalSecretGenerationId: ID, protectedRecoveryMaterial: { relativePath: "pgsodium-root-key.tar", size: 1, sha256: SHA }, targetContract: { model: "A_SEPARATE_DISPOSABLE", hostContract: "PROVIDER_NEUTRAL_CLEAN_LINUX_DOCKER_HOST", platform: { os: "linux", architecture: "amd64" }, supabaseComposeProject: "supabase", godelComposeProject: "godel-runtime", operatorNetwork: "godel-supabase-api", persistence: { pgdata: "BIND", storage: "BIND", dbConfig: "NAMED_VOLUME" } }, contracts: { reconstructionManifestSchema: 1, imageLockSchema: 1, backupSchema: 3, secretGenerationStrategy: "EXACT_GENERATION_SNAPSHOTS", backupGenerationAlignment: "FAIL_CLOSED", implicitRollbackChain: "FORBIDDEN" } }; }
function fake({ host = { platform: "linux", architecture: "x64" }, clean = true, head = COMMIT, identity = { os: "linux", architecture: "amd64" }, composeVersion = "v2.30.0", buildx = "github.com/docker/buildx v0.17.0", inventory = {}, exists = new Set() } = {}) { return { host, git: { clean: async () => clean, head: async () => head }, docker: { identity: async () => { if (identity instanceof Error) throw identity; return identity; }, composeVersion: async () => { if (composeVersion instanceof Error) throw composeVersion; return composeVersion; }, buildxVersion: async () => { if (buildx instanceof Error) throw buildx; return buildx; }, inventory: async () => ({ containers: [], volumes: [], networks: [], images: [], ...inventory }) }, filesystem: { exists: async (path) => exists.has(path) } }; }
async function run(options = {}) { const root = await mkdtemp(join(tmpdir(), "godel-clean-host-")); try { return await evaluateCleanHostGate({ manifestPath: "external-manifest.json", root, adapters: fake(options), readManifest: async () => ({ manifest: manifest() }) }); } finally { await rm(root, { recursive: true, force: true }); } }
async function rejects(options, code) { await assert.rejects(() => run(options), new RegExp(`CLEAN_HOST_${code}`)); }

test("compatible synthetic clean host passes with a sanitized result", async () => {
  const result = await run({ inventory: { containers: [{ name: "private-unrelated-workload", labels: {} }], images: [{ repository: "supabase/postgres", labels: {} }] } });
  assert.equal(result.state, "PASS"); assert.equal(result.checkout, "EXACT"); assert.equal(result.targetContainers, "ABSENT"); assert.equal(result.unrelatedContainerCount, 1); assert.equal(result.genericImageCacheCount, 1);
  assert.doesNotMatch(renderCleanHostGateResult(result), /private-unrelated-workload|\/private\//);
});

test("host, git and Docker identity failures fail closed", async () => {
  await rejects({ host: { platform: "win32", architecture: "x64" } }, "WRONG_PLATFORM"); await rejects({ host: { platform: "linux", architecture: "arm64" } }, "WRONG_PLATFORM");
  await rejects({ clean: false }, "REPOSITORY_DIRTY"); await rejects({ head: "f".repeat(40) }, "GIT_MISMATCH");
  await rejects({ identity: new Error("unavailable") }, "DOCKER_UNAVAILABLE");
  await rejects({ identity: { os: "windows", architecture: "amd64" } }, "DOCKER_WRONG_PLATFORM"); await rejects({ identity: { os: "linux", architecture: "arm64" } }, "DOCKER_WRONG_PLATFORM");
  await rejects({ composeVersion: new Error("missing") }, "COMPOSE_V2_REQUIRED"); await rejects({ composeVersion: "1.29.2" }, "COMPOSE_V2_REQUIRED"); await rejects({ buildx: "" }, "BUILDX_REQUIRED");
});

test("Docker target state blocks while unrelated workload and generic cache remain allowed", async () => {
  await rejects({ inventory: { containers: [{ name: "ignored", labels: { "com.docker.compose.project": "supabase" } }] } }, "TARGET_CONTAINER_PRESENT");
  await rejects({ inventory: { volumes: [{ name: "supabase_db-config", labels: {} }] } }, "TARGET_VOLUME_PRESENT");
  await rejects({ inventory: { networks: [{ name: "godel-supabase-api", labels: {} }] } }, "TARGET_NETWORK_PRESENT");
  await rejects({ inventory: { images: [{ repository: "godel-design-app", labels: {} }] } }, "GODEL_IMAGE_PRESENT");
  await run({ inventory: { containers: [{ name: "other", labels: {} }], images: [{ repository: "redis", labels: {} }] } });
});

test("each prohibited filesystem state blocks without reading file bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-clean-host-files-"));
  const cases = [["infra/supabase/.env", "RUNTIME_ENV_PRESENT"], ["compose.env.local", "RUNTIME_ENV_PRESENT"], ["infra/supabase/volumes/db/data", "PGDATA_PRESENT"], ["infra/supabase/volumes/storage", "STORAGE_PRESENT"], ["protected-recovery-material/selfhosted/external-secrets", "SECRET_REGISTRY_PRESENT"]];
  try { for (const [relative, code] of cases) { const path = resolve(root, relative); await mkdir(resolve(path, ".."), { recursive: true }); await assert.rejects(() => evaluateCleanHostGate({ manifestPath: "external", root, adapters: fake({ exists: new Set([path]) }), readManifest: async () => ({ manifest: manifest() }) }), new RegExp(`CLEAN_HOST_${code}`)); } } finally { await rm(root, { recursive: true, force: true }); }
});

test("default adapter only issues read-only git and Docker command families", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-clean-host-actions-")), actions = [];
  const runner = async (binary, args) => { actions.push([binary, ...args].join(" ")); const key = args.join(" "); if (binary === "git") return { stdout: key.startsWith("status") ? "" : `${COMMIT}\n` }; if (key.startsWith("version")) return { stdout: "linux/amd64\n" }; if (key.startsWith("compose")) return { stdout: "v2.30.0\n" }; if (key.startsWith("buildx")) return { stdout: "buildx\n" }; return { stdout: "" }; };
  try { await evaluateCleanHostGate({ manifestPath: "external", root, adapters: { ...createDefaultAdapters({ root, runner }), host: { platform: "linux", architecture: "x64" } }, readManifest: async () => ({ manifest: manifest() }) }); } finally { await rm(root, { recursive: true, force: true }); }
  assert.equal(actions.some((action) => /\b(pull|build|run|create|rm|stop|prune|up|down)\b/.test(action)), false);
  assert.deepEqual(actions.map((action) => action.split(" ").slice(0, 3).join(" ")).sort(), ["docker buildx version", "docker compose version", "docker image ls", "docker network ls", "docker ps --all", "docker version --format", "docker volume ls", "git rev-parse HEAD", "git status --porcelain"].sort());
});

test("CLI arguments reject malformed paths and public output cannot disclose fake inventory identifiers", () => {
  assert.throws(() => parseCleanHostGateArgs(["--manifest", "bad\0path"]), /CLEAN_HOST_ARGUMENTS/); assert.throws(() => parseCleanHostGateArgs(["--apply", "anything"]), /CLEAN_HOST_ARGUMENTS/);
  assert.doesNotMatch(renderCleanHostGateResult({ state: "PASS", targetContainers: "ABSENT" }), /deadbeef|C:\\private|unrelated/);
});
