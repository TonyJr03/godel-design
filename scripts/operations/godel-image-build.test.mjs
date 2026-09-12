import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildVerifiedGodelImages, createGodelBuildDockerAdapter, GODEL_BUILT_IMAGE_IDENTITY, parseGodelBuildArgs, parseGodelBuildConfiguration, prepareAppBuild, renderGodelBuildResult, verifyPullOnlyReadiness } from "./godel-image-build.mjs";

const COMMIT = "fabb168356152dad45598797772777b2197b6f39", ID = "123e4567-e89b-42d3-a456-426614174000", SHA = "a".repeat(64);
const APP = `FROM node:24@sha256:${SHA} AS base\nFROM base AS runner\n`, NGINX = `FROM nginx:stable@sha256:${"b".repeat(64)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
function manifest() { return { platform: { os: "linux", architecture: "amd64" }, repository: { gitCommit: COMMIT }, externalSecretGenerationId: ID, operationId: ID, godelBuilds: [{ logicalName: "godel-app", dockerfile: "Dockerfile", dockerfileSha256: digest(APP), baseImages: [`node:24@sha256:${SHA}`], platform: { os: "linux", architecture: "amd64" }, gitCommit: COMMIT, configurationBinding: ID }, { logicalName: "godel-nginx", dockerfile: "Dockerfile.nginx", dockerfileSha256: digest(NGINX), baseImages: [`nginx:stable@sha256:${"b".repeat(64)}`], platform: { os: "linux", architecture: "amd64" }, gitCommit: COMMIT, configurationBinding: null }] }; }
function bundle(value = {}) { return { bundle: { generationId: value.generationId ?? ID, reconstruction: { operationId: value.operationId ?? ID, manifestSha256: value.manifestSha256 ?? SHA } }, godelSnapshot: Buffer.from(value.godelEnv ?? "NEXT_PUBLIC_SUPABASE_URL=https://synthetic.invalid\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-public-key\nGODEL_APP_IMAGE_TAG=rehearsal\n") }; }
function buildBases() { return [{ role: "build-base", sourceRef: "node:24", sourceIndexDigest: `sha256:${SHA}`, manifestDigest: `sha256:${"c".repeat(64)}`, configDigest: `sha256:${"d".repeat(64)}` }, { role: "build-base", sourceRef: "nginx:stable", sourceIndexDigest: `sha256:${"b".repeat(64)}`, manifestDigest: `sha256:${"e".repeat(64)}`, configDigest: `sha256:${"f".repeat(64)}` }]; }
function fake(options = {}) {
  const actions = [], files = { Dockerfile: Buffer.from(options.appSource ?? APP), "Dockerfile.nginx": Buffer.from(options.nginxSource ?? NGINX) };
  return { actions, gate: options.gate ?? (async () => ({ state: "PASS" })), pullOnlyReadiness: options.pullOnlyReadiness ?? (async () => ({ state: "PASS", buildBases: buildBases() })), contextAdapter: { create: async () => ({ state: "EXACT_GIT_ARCHIVE", contextPath: "/private/exact-git-archive", readFile: async (name) => { if (!files[name]) throw new Error("missing"); return files[name]; }, release: async () => actions.push(["release"]) }) }, docker: { buildApp: async (value) => { actions.push(["app", value]); if (options.appFailure) throw new Error("fail"); }, buildNginx: async (value) => { actions.push(["nginx", value]); if (options.nginxFailure) throw new Error("fail"); }, inspectFinalImage: async (tag) => { actions.push(["inspect", tag]); return options.inspect?.(tag) ?? { os: "linux", architecture: "amd64", imageId: `sha256:${tag.startsWith("godel-design-app") ? "c".repeat(64) : "d".repeat(64)}` }; } } };
}
async function run(options = {}) { const adapters = fake(options), current = options.manifest ?? manifest(); const result = await buildVerifiedGodelImages({ manifestPath: "manifest.json", protectedRoot: "/protected/root", bundlePath: "/protected/root/bundle", root: "/repo", gate: adapters.gate, pullOnlyReadiness: adapters.pullOnlyReadiness, readManifest: async () => ({ manifest: current, manifestSha256: SHA }), assertBundlePath: async () => "/protected/root/bundle", readBundle: async () => bundle(options.bundle), contextAdapter: adapters.contextAdapter, docker: adapters.docker }); return { ...adapters, result }; }

test("verified recipes build from exact Git archive with secret-only publishable transport", async () => {
  const value = await run(); const app = value.actions.find(([kind]) => kind === "app")[1];
  assert.equal(GODEL_BUILT_IMAGE_IDENTITY, "VERIFIED_BUILD_RECIPE");
  assert.equal(value.result.state, "PASS"); assert.equal(value.result.buildContext, "EXACT_GIT_ARCHIVE"); assert.equal(app.contextPath, "/private/exact-git-archive"); assert.equal(app.tag, "godel-design-app:rehearsal"); assert.equal(app.publishableKey, "synthetic-public-key");
  assert.deepEqual(app.buildContext, { dockerfileReference: `node:24@sha256:${SHA}`, sourceRef: "node:24", manifestDigest: `sha256:${"c".repeat(64)}`, configDigest: `sha256:${"d".repeat(64)}` });
  assert.notEqual(app.nonce, prepareAppBuild({ appTag: "rehearsal", publicUrl: "x", publishableKey: "y" }).nonce);
  assert.doesNotMatch(renderGodelBuildResult(value.result), /synthetic-public-key|synthetic\.invalid|private|nonce/i);
});

test("clean-host, pull-only and bundle failures happen before builds", async () => {
  const cases = [{ gate: async () => { throw new Error("block"); } }, { pullOnlyReadiness: async () => { throw new Error("missing"); } }, { readManifest: async () => { throw new Error("invalid"); } }, { assertBundlePath: async () => { throw new Error("unsafe"); } }, { bundle: { generationId: "223e4567-e89b-42d3-a456-426614174000" } }, { bundle: { operationId: "223e4567-e89b-42d3-a456-426614174000" } }, { bundle: { manifestSha256: "b".repeat(64) } }];
  for (const options of cases) { const adapters = fake(options); await assert.rejects(() => buildVerifiedGodelImages({ manifestPath: "manifest", protectedRoot: "/protected", bundlePath: "/protected/bundle", gate: adapters.gate, pullOnlyReadiness: adapters.pullOnlyReadiness, readManifest: options.readManifest ?? (async () => ({ manifest: manifest(), manifestSha256: SHA })), assertBundlePath: options.assertBundlePath ?? (async () => "/protected/bundle"), readBundle: async () => bundle(options.bundle), contextAdapter: adapters.contextAdapter, docker: adapters.docker })); assert.equal(adapters.actions.some(([kind]) => kind === "app" || kind === "nginx"), false); }
});

test("recipe context drift fails before build", async () => {
  for (const mutate of [(value) => { value.godelBuilds[0].dockerfileSha256 = SHA; }, (value) => { value.godelBuilds[1].dockerfileSha256 = SHA; }, (value) => { value.godelBuilds[0].baseImages = []; }, (value) => { value.godelBuilds[1].baseImages = []; }, (value) => { value.godelBuilds[0].configurationBinding = null; }, (value) => { value.godelBuilds[1].gitCommit = "b".repeat(40); }, (value) => { value.godelBuilds[0].platform.architecture = "arm64"; }]) { const current = manifest(); mutate(current); const adapters = fake(); await assert.rejects(() => buildVerifiedGodelImages({ manifestPath: "manifest", protectedRoot: "/protected", bundlePath: "/protected/bundle", gate: adapters.gate, pullOnlyReadiness: adapters.pullOnlyReadiness, readManifest: async () => ({ manifest: current, manifestSha256: SHA }), assertBundlePath: async () => "/protected/bundle", readBundle: async () => bundle(), contextAdapter: adapters.contextAdapter, docker: adapters.docker })); assert.equal(adapters.actions.some(([kind]) => kind === "app" || kind === "nginx"), false); }
});

test("configuration parsing is fail-closed and tags default to local", () => {
  assert.deepEqual(parseGodelBuildConfiguration(Buffer.from("NEXT_PUBLIC_SUPABASE_URL=x\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=y\n")), { publicUrl: "x", publishableKey: "y", appTag: "local", nginxTag: "local" });
  assert.throws(() => parseGodelBuildConfiguration(Buffer.from("NEXT_PUBLIC_SUPABASE_URL=x\nNEXT_PUBLIC_SUPABASE_URL=y\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=z\n")), /GODEL_IMAGE_BUILD_DUPLICATE_BUILD_CONFIGURATION/);
  assert.throws(() => parseGodelBuildConfiguration(Buffer.from("NEXT_PUBLIC_SUPABASE_URL=x\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=y\nGODEL_APP_IMAGE_TAG=bad tag\n")), /GODEL_IMAGE_BUILD_BUILD_TAG/);
});

test("inspection and partial Nginx failure preserve image cache without destructive calls", async () => {
  for (const inspected of [{ os: "windows", architecture: "amd64", imageId: `sha256:${SHA}` }, { os: "linux", architecture: "arm64", imageId: `sha256:${SHA}` }, { os: "linux", architecture: "amd64", imageId: "sha256:invalid" }]) await assert.rejects(() => run({ inspect: () => inspected }), /GODEL_IMAGE_BUILD_APP_LOCAL_IMAGE/);
  const value = fake({ nginxFailure: true }); await assert.rejects(() => buildVerifiedGodelImages({ manifestPath: "manifest", protectedRoot: "/protected", bundlePath: "/protected/bundle", gate: value.gate, pullOnlyReadiness: value.pullOnlyReadiness, readManifest: async () => ({ manifest: manifest(), manifestSha256: SHA }), assertBundlePath: async () => "/protected/bundle", readBundle: async () => bundle(), contextAdapter: value.contextAdapter, docker: value.docker }), /GODEL_IMAGE_BUILD_NGINX_FAILED/);
  assert.equal(value.actions.some(([kind]) => /rm|prune|network|volume|compose/.test(kind)), false);
});

test("approved Buildx invocations isolate the App publishable key in the child environment", async () => {
  const calls = [], key = "synthetic-publishable-key", nonce = "123e4567-e89b-42d3-a456-426614174000";
  const docker = createGodelBuildDockerAdapter({ root: "/repo", runner: async (_binary, args, options) => {
    calls.push({ args, options });
    if (args[0] === "image") return { stdout: JSON.stringify([{ Os: "linux", Architecture: "amd64", Id: `sha256:${SHA}` }]) };
    return { stdout: "" };
  } });
  await docker.buildApp({ contextPath: "/private/exact-git-archive", tag: "godel-design-app:local", publicUrl: "https://synthetic.invalid", publishableKey: key, nonce, buildContext: { dockerfileReference: `node:24@sha256:${SHA}`, sourceRef: "node:24" } });
  await docker.buildNginx({ contextPath: "/private/exact-git-archive", tag: "godel-design-nginx:local", buildContext: { dockerfileReference: `nginx:stable@sha256:${"b".repeat(64)}`, sourceRef: "nginx:stable" } });
  const [app, nginx] = calls;
  assert.deepEqual(app.args.slice(0, 10), ["buildx", "build", "--quiet", "--load", "--platform", "linux/amd64", "--file", "Dockerfile", "--tag", "godel-design-app:local"]);
  assert.ok(app.args.includes("id=godel_supabase_publishable_key,env=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"));
  assert.ok(app.args.includes("BUILDKIT_SYNTAX=dockerfile.v0")); assert.ok(app.args.includes(`node:24@sha256:${SHA}=docker-image://node:24`));
  assert.doesNotMatch(app.args.join(" "), /synthetic-publishable-key/);
  assert.equal(app.options.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, key);
  assert.deepEqual(nginx.args.slice(0, 10), ["buildx", "build", "--quiet", "--load", "--platform", "linux/amd64", "--file", "Dockerfile.nginx", "--tag", "godel-design-nginx:local"]);
  assert.ok(nginx.args.includes("BUILDKIT_SYNTAX=dockerfile.v0")); assert.ok(nginx.args.includes(`nginx:stable@sha256:${"b".repeat(64)}=docker-image://nginx:stable`));
  assert.equal(calls.every(({ args }) => args[0] === "buildx" && !/(^| )(run|create|compose|network|volume|rm|prune)( |$)/.test(args.join(" "))), true);
});

test("exact archive context excludes synthetic host-only files and nonce is ephemeral", async () => {
  const value = await run();
  const app = value.actions.find(([kind]) => kind === "app")[1];
  assert.equal(app.contextPath, "/private/exact-git-archive");
  await assert.rejects(() => value.contextAdapter.create().then((context) => context.readFile("host-only-ignored.env")));
  const config = { appTag: "local", publicUrl: "x", publishableKey: "y" };
  assert.notEqual(prepareAppBuild(config).nonce, prepareAppBuild(config).nonce);
});

test("pull-only readiness inspects immutable references and aliases without mutation", async () => {
  const node = { role: "build-base", canonicalRepository: "docker.io/library/node", manifestDigest: `sha256:${SHA}`, configDigest: `sha256:${"b".repeat(64)}`, sourceRef: "node:24", sourceIndexDigest: `sha256:${"c".repeat(64)}`, platform: { os: "linux", architecture: "amd64" } };
  const nginx = { role: "build-base", canonicalRepository: "docker.io/library/nginx", manifestDigest: `sha256:${"d".repeat(64)}`, configDigest: `sha256:${"e".repeat(64)}`, sourceRef: "nginx:stable", sourceIndexDigest: `sha256:${"f".repeat(64)}`, platform: { os: "linux", architecture: "amd64" } };
  const images = [node, nginx], actions = [];
  const docker = { inspectAlias: async (reference) => { actions.push(reference); const image = images.find((item) => item.sourceRef === reference); return { os: "linux", architecture: "amd64", imageId: image.manifestDigest, descriptor: { digest: image.manifestDigest } }; } };
  const legacy = { inspectAlias: async (reference) => { const image = images.find((item) => item.sourceRef === reference); return { os: "linux", architecture: "amd64", imageId: image.configDigest }; } };
  assert.equal((await verifyPullOnlyReadiness({ manifest: {}, docker: legacy, validateAuthority: async () => ({ lock: { images } }) })).localImageAuthority, "LOCAL_OCI_IDENTITY_VERIFIED");
  const result = await verifyPullOnlyReadiness({ manifest: {}, docker, validateAuthority: async () => ({ lock: { images } }) }); assert.deepEqual(actions, ["node:24", "nginx:stable"]); assert.equal(result.buildBases.length, 2);
  await assert.rejects(() => verifyPullOnlyReadiness({ manifest: {}, docker, validateAuthority: async () => ({ lock: { images: [node] } }) }), /GODEL_IMAGE_BUILD_PULL_ONLY_IMAGES_NOT_READY/);
  const mismatch = { inspectAlias: async () => ({ os: "linux", architecture: "amd64", imageId: `sha256:${"0".repeat(64)}` }) };
  await assert.rejects(() => verifyPullOnlyReadiness({ manifest: {}, docker: mismatch, validateAuthority: async () => ({ lock: { images } }) }), /GODEL_IMAGE_BUILD_PULL_ONLY_IMAGES_NOT_READY/);
});

test("CLI accepts only repository-relative manifest and protected bundle paths", () => {
  assert.doesNotThrow(() => parseGodelBuildArgs(["--manifest", "manifests/reconstruction.json", "--protected-root", "protected-recovery-material/rehearsal", "--bundle", "bundles/exact"], "/repo"));
  for (const value of ["../manifest", "/manifest", "C:\\manifest"]) assert.throws(() => parseGodelBuildArgs(["--manifest", value, "--protected-root", "protected-recovery-material/rehearsal", "--bundle", "bundles/exact"], "/repo"));
});
