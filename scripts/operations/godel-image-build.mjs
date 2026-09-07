import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { evaluateCleanHostGate } from "./clean-host-gate.mjs";
import { createDockerImageAdapter, validateAcquisitionAuthority } from "./image-acquisition.mjs";
import { readReconstructionManifest } from "./portability-manifest.mjs";
import { assertProtectedTransportPath, readSecretGenerationBundle } from "./secret-generation-transport.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "../..");
const PLATFORM = Object.freeze({ os: "linux", architecture: "amd64" });
export const GODEL_BUILT_IMAGE_IDENTITY = "VERIFIED_BUILD_RECIPE";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^sha256:[a-f0-9]{64}$/;
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

function fail(code) { throw new Error(`GODEL_IMAGE_BUILD_${code}`); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function repository(value) { return value.startsWith("docker.io/") ? value : `docker.io/${value}`; }
function immutableReference(image) { return `${image.canonicalRepository}@${image.manifestDigest}`; }

function repoDigestMatches(image, digests) {
  return Array.isArray(digests) && digests.some((value) => {
    const at = typeof value === "string" ? value.lastIndexOf("@") : -1;
    return at > 0 && repository(value.slice(0, at)) === image.canonicalRepository && value.slice(at + 1) === image.manifestDigest;
  });
}
function assertPulledImage(image, inspected) {
  if (inspected?.os !== "linux" || inspected?.architecture !== "amd64" || !repoDigestMatches(image, inspected.repoDigests) || typeof inspected.imageId !== "string" || !inspected.imageId) fail("PULL_ONLY_IMAGES_NOT_READY");
  return inspected.imageId;
}
function assertLocalBuildImage(inspected, code) {
  if (inspected?.os !== "linux" || inspected?.architecture !== "amd64" || !SHA.test(inspected.imageId ?? "")) fail(code);
  return inspected.imageId;
}
function baseImages(source) {
  const stages = new Set(), external = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^FROM\s+([^\s]+)(?:\s+AS\s+([A-Za-z0-9_-]+))?\s*$/i.exec(line);
    if (!match) continue;
    if (!stages.has(match[1])) { if (!/@sha256:[a-f0-9]{64}$/.test(match[1])) fail("BASE_IMAGE"); external.push(match[1]); }
    if (match[2]) stages.add(match[2]);
  }
  if (!external.length) fail("BASE_IMAGE");
  return external;
}

export function parseGodelBuildConfiguration(bytes) {
  const values = new Map();
  for (const line of Buffer.from(bytes).toString("utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("="); if (at < 1) continue;
    const key = line.slice(0, at), value = line.slice(at + 1);
    if (["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "GODEL_APP_IMAGE_TAG", "GODEL_NGINX_IMAGE_TAG"].includes(key)) {
      if (values.has(key)) fail("DUPLICATE_BUILD_CONFIGURATION"); values.set(key, value);
    }
  }
  const publicUrl = values.get("NEXT_PUBLIC_SUPABASE_URL"), publishableKey = values.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!publicUrl || !publishableKey) fail("BUILD_CONFIGURATION_REQUIRED");
  const appTag = values.get("GODEL_APP_IMAGE_TAG") ?? "local", nginxTag = values.get("GODEL_NGINX_IMAGE_TAG") ?? "local";
  if (!TAG.test(appTag) || !TAG.test(nginxTag)) fail("BUILD_TAG");
  return { publicUrl, publishableKey, appTag, nginxTag };
}

export async function verifyPullOnlyReadiness({ root = ROOT, manifest, docker = createDockerImageAdapter({ root }), validateAuthority = validateAcquisitionAuthority } = {}) {
  let authority;
  try { authority = await validateAuthority({ root, manifest }); } catch { fail("PULL_ONLY_IMAGES_NOT_READY"); }
  const physical = new Map();
  for (const image of authority.lock.images) physical.set(immutableReference(image), image);
  const ids = new Map();
  for (const [reference, image] of physical) {
    let inspected; try { inspected = await docker.inspectImage(reference); } catch { fail("PULL_ONLY_IMAGES_NOT_READY"); }
    ids.set(reference, assertPulledImage(image, inspected));
  }
  const aliases = new Map();
  for (const image of authority.lock.images) aliases.set(`${image.sourceRef}\0${image.manifestDigest}`, image);
  for (const image of aliases.values()) {
    let inspected; try { inspected = await docker.inspectAlias(image.sourceRef); } catch { fail("PULL_ONLY_IMAGES_NOT_READY"); }
    if (assertPulledImage(image, inspected) !== ids.get(immutableReference(image))) fail("PULL_ONLY_IMAGES_NOT_READY");
  }
  return { state: "PASS", uniqueImages: physical.size, executionAliases: aliases.size };
}

export async function createExactGitArchiveContext({ root = ROOT, gitCommit, runner = execFileAsync } = {}) {
  if (typeof gitCommit !== "string" || !/^[a-f0-9]{40}$/.test(gitCommit)) fail("GIT_COMMIT");
  const temporary = await mkdtemp(join(tmpdir(), "godel-image-build-")), archive = join(temporary, "context.tar"), contextPath = join(temporary, "context");
  try {
    const archived = await runner("git", ["archive", "--format=tar", gitCommit], { cwd: root, windowsHide: true, encoding: "buffer", maxBuffer: 128 * 1024 * 1024 });
    await writeFile(archive, archived.stdout);
    await mkdir(contextPath);
    await runner("tar", ["-xf", archive, "-C", contextPath], { cwd: root, windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
    return { state: "EXACT_GIT_ARCHIVE", contextPath, readFile: (path) => readFile(join(contextPath, path)), release: () => rm(temporary, { recursive: true, force: true }) };
  } catch { await rm(temporary, { recursive: true, force: true }); fail("GIT_ARCHIVE_CONTEXT"); }
}

export async function verifyGodelBuildRecipes({ manifest, context }) {
  if (!Array.isArray(manifest?.godelBuilds) || manifest.godelBuilds.length !== 2 || manifest.platform?.os !== "linux" || manifest.platform?.architecture !== "amd64") fail("RECIPE_MANIFEST");
  const expected = new Map([["godel-app", { dockerfile: "Dockerfile", configurationBinding: manifest.externalSecretGenerationId }], ["godel-nginx", { dockerfile: "Dockerfile.nginx", configurationBinding: null }]]);
  const found = new Map(manifest.godelBuilds.map((recipe) => [recipe.logicalName, recipe]));
  if (found.size !== 2 || [...expected].some(([name]) => !found.has(name))) fail("RECIPE_MANIFEST");
  const result = {};
  for (const [logicalName, requirement] of expected) {
    const recipe = found.get(logicalName);
    if (recipe.dockerfile !== requirement.dockerfile || recipe.gitCommit !== manifest.repository.gitCommit || recipe.configurationBinding !== requirement.configurationBinding || !same(recipe.platform, PLATFORM)) fail("RECIPE_BINDING");
    let bytes; try { bytes = await context.readFile(recipe.dockerfile); } catch { fail("RECIPE_CONTEXT"); }
    if (sha256(bytes) !== recipe.dockerfileSha256 || !same(baseImages(bytes.toString("utf8")), recipe.baseImages)) fail("RECIPE_CONTEXT");
    result[logicalName] = recipe;
  }
  return result;
}

export function prepareAppBuild(configuration, nonce = randomUUID()) {
  if (!UUID.test(nonce)) fail("BUILD_NONCE");
  return { tag: `godel-design-app:${configuration.appTag}`, nonce, publicUrl: configuration.publicUrl, publishableKey: configuration.publishableKey };
}

export function createGodelBuildDockerAdapter({ root = ROOT, runner = execFileAsync } = {}) {
  const call = async (args, options = {}) => runner("docker", args, { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024, ...options });
  const inspect = async (tag) => {
    let result; try { result = JSON.parse((await call(["image", "inspect", tag])).stdout); } catch { fail("LOCAL_IMAGE_INSPECT"); }
    const image = result?.[0]; if (!image) fail("LOCAL_IMAGE_INSPECT"); return { os: image.Os, architecture: image.Architecture, imageId: image.Id };
  };
  return {
    buildApp: async ({ contextPath, tag, publicUrl, publishableKey, nonce }) => {
      try { await call(["buildx", "build", "--quiet", "--load", "--platform", "linux/amd64", "--file", "Dockerfile", "--tag", tag, "--build-arg", `NEXT_PUBLIC_SUPABASE_URL=${publicUrl}`, "--build-arg", `GODEL_PUBLIC_BUILD_NONCE=${nonce}`, "--secret", "id=godel_supabase_publishable_key,env=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", contextPath], { env: { ...process.env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey } }); } catch { fail("APP_FAILED"); }
    },
    buildNginx: async ({ contextPath, tag }) => { try { await call(["buildx", "build", "--quiet", "--load", "--platform", "linux/amd64", "--file", "Dockerfile.nginx", "--tag", tag, contextPath]); } catch { fail("NGINX_FAILED"); } },
    inspectFinalImage: inspect,
  };
}

function assertBundleBinding(reconstruction, bundle) {
  if (bundle.bundle.generationId !== reconstruction.manifest.externalSecretGenerationId || bundle.bundle.reconstruction.operationId !== reconstruction.manifest.operationId || bundle.bundle.reconstruction.manifestSha256 !== reconstruction.manifestSha256) fail("PROTECTED_BUNDLE_BINDING");
}

export async function buildVerifiedGodelImages({ manifestPath, protectedRoot, bundlePath, root = ROOT, gate = evaluateCleanHostGate, pullOnlyReadiness = verifyPullOnlyReadiness, readManifest = readReconstructionManifest, assertBundlePath = assertProtectedTransportPath, readBundle = readSecretGenerationBundle, contextAdapter = { create: createExactGitArchiveContext }, docker = createGodelBuildDockerAdapter({ root }) } = {}) {
  if (typeof manifestPath !== "string" || !manifestPath || manifestPath.includes("\0")) fail("MANIFEST_PATH");
  let reconstruction; try { reconstruction = await readManifest({ manifestPath }); } catch { fail("MANIFEST_INVALID"); }
  let gateResult; try { gateResult = await gate({ manifestPath, root }); } catch { fail("CLEAN_HOST_GATE"); }
  if (gateResult?.state !== "PASS") fail("CLEAN_HOST_GATE");
  await pullOnlyReadiness({ root, manifest: reconstruction.manifest });
  let bundle; try { bundle = await readBundle({ bundlePath: await assertBundlePath({ protectedRoot, path: bundlePath, code: "BUNDLE_PATH" }) }); } catch (error) { if (error?.message?.startsWith("GODEL_IMAGE_BUILD_")) throw error; fail("PROTECTED_BUNDLE"); }
  assertBundleBinding(reconstruction, bundle);
  const configuration = parseGodelBuildConfiguration(bundle.godelSnapshot);
  let context;
  try { context = await contextAdapter.create({ root, gitCommit: reconstruction.manifest.repository.gitCommit }); } catch { fail("GIT_ARCHIVE_CONTEXT"); }
  try {
    if (context?.state !== "EXACT_GIT_ARCHIVE") fail("GIT_ARCHIVE_CONTEXT");
    await verifyGodelBuildRecipes({ manifest: reconstruction.manifest, context });
    const app = prepareAppBuild(configuration), nginxTag = `godel-design-nginx:${configuration.nginxTag}`;
    try { await docker.buildApp({ contextPath: context.contextPath, ...app }); } catch (error) { if (error?.message === "GODEL_IMAGE_BUILD_APP_FAILED") throw error; fail("APP_FAILED"); }
    const appDigest = assertLocalBuildImage(await docker.inspectFinalImage(app.tag), "APP_LOCAL_IMAGE");
    try { await docker.buildNginx({ contextPath: context.contextPath, tag: nginxTag }); } catch (error) { if (error?.message === "GODEL_IMAGE_BUILD_NGINX_FAILED") throw error; fail("NGINX_FAILED"); }
    const nginxDigest = assertLocalBuildImage(await docker.inspectFinalImage(nginxTag), "NGINX_LOCAL_IMAGE");
    return Object.freeze({ state: "PASS", platform: "linux/amd64", buildContext: "EXACT_GIT_ARCHIVE", configurationBinding: reconstruction.manifest.externalSecretGenerationId, app: { recipe: "VERIFIED", localExecutionDigest: appDigest }, nginx: { recipe: "VERIFIED", localExecutionDigest: nginxDigest } });
  } finally { await context?.release?.(); }
}

function safeRelative(value) { return typeof value === "string" && value && !value.includes("\0") && !value.startsWith("/") && !value.startsWith("\\") && !/^[A-Za-z]:/.test(value) && !value.split(/[\\/]+/).some((part) => !part || part === "." || part === ".."); }
export function parseGodelBuildArgs(args, root = ROOT) {
  if (args.length !== 6 || args[0] !== "--manifest" || args[2] !== "--protected-root" || args[4] !== "--bundle" || !safeRelative(args[1]) || !safeRelative(args[3]) || !safeRelative(args[5])) fail("ARGUMENTS");
  const protectedBase = resolve(root, "protected-recovery-material"), protectedRoot = resolve(root, args[3]);
  if (relative(protectedBase, protectedRoot).startsWith("..") || relative(protectedBase, protectedRoot) === "") fail("PROTECTED_ROOT");
  return { manifestPath: resolve(root, args[1]), protectedRoot, bundlePath: resolve(protectedRoot, args[5]) };
}
export function renderGodelBuildResult(result) { return `${JSON.stringify(result)}\n`; }
export function renderGodelBuildFailure(error) { return `FAIL ${error?.message?.startsWith("GODEL_IMAGE_BUILD_") ? error.message : "GODEL_IMAGE_BUILD_FAILED"}\n`; }
if (import.meta.main) { try { process.stdout.write(renderGodelBuildResult(await buildVerifiedGodelImages(parseGodelBuildArgs(process.argv.slice(2))))); } catch (error) { process.stderr.write(renderGodelBuildFailure(error)); process.exitCode = 1; } }
