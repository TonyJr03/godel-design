import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildProductionRelease,
  createDockerAdapter,
  createGitAdapter,
  createReleaseIdentity,
  createReleaseManifest,
  normalizeGitCommit,
  sha256File,
  validateImageInspection,
  validateRuntimeImageTagBinding,
} from "./build-production-release.mjs";

const COMMIT = "318aba82131135985cf37ef874ff8a976d4093f8";
const GENERATION = "11111111-1111-4111-8111-111111111111";
const APP_ID = `sha256:${"a".repeat(64)}`;
const NGINX_ID = `sha256:${"b".repeat(64)}`;

async function fixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "godel-production-release-test-"));
  const contextPath = join(root, "context");
  const artifactRoot = join(root, "release-artifacts");
  const godelEnvPath = join(root, "godel.env");
  const supabaseEnvPath = join(root, "supabase.env");
  await mkdir(contextPath);
  await writeFile(join(contextPath, "Dockerfile"), "FROM scratch\n");
  await writeFile(join(contextPath, "Dockerfile.nginx"), "FROM scratch\n");
  await writeFile(
    godelEnvPath,
    overrides.godelEnv
      ?? "NEXT_PUBLIC_SUPABASE_URL=https://synthetic.invalid\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-publishable-secret\nGODEL_APP_IMAGE_TAG=git-318aba821311\nGODEL_NGINX_IMAGE_TAG=git-318aba821311\n",
  );
  await writeFile(supabaseEnvPath, "SYNTHETIC=1\n");
  const actions = [];
  const validInspection = (tag) => ({
    os: "linux",
    architecture: "amd64",
    imageId: tag.includes("app") ? APP_ID : NGINX_ID,
    revision: COMMIT,
  });
  const docker = {
    buildApp: async (value) => actions.push({ action: "buildApp", value }),
    buildNginx: async (value) => actions.push({ action: "buildNginx", value }),
    inspect: async (tag) => validInspection(tag),
    save: async ({ outputPath, tags }) => {
      actions.push({ action: "save", tags });
      await writeFile(outputPath, "synthetic-image-archive");
    },
    ...overrides.docker,
  };
  const dependencies = {
    git: {
      assertCommit: async () => {},
      createContext: async () => ({ contextPath, release: async () => {} }),
      readFileAtCommit: async (gitCommit, path) => readFile(join(contextPath, path)),
      ...overrides.git,
    },
    docker,
    validateEnvironment: async () => {},
    bindConfiguration: async () => ({ generationId: GENERATION, verify: async () => {}, release: async () => {} }),
    now: () => "2026-09-14T12:00:00.000Z",
    ...overrides.dependencies,
  };
  return {
    root,
    artifactRoot,
    actions,
    dependencies,
    options: { root, gitCommit: COMMIT, godelEnvPath, supabaseEnvPath, protectedRoot: join(root, "protected"), artifactRoot },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("rejects an invalid Git SHA", () => {
  assert.throws(() => normalizeGitCommit("318aba821311"), /PRODUCTION_RELEASE_INVALID_GIT_COMMIT/);
});

test("rejects a nonexistent commit", async () => {
  const git = createGitAdapter({
    root: process.cwd(),
    runner: async () => { throw new Error("synthetic missing object"); },
  });
  await assert.rejects(() => git.assertCommit(COMMIT), /PRODUCTION_RELEASE_GIT_COMMIT_NOT_FOUND/);
});

test("Git adapter materializes Dockerfiles byte-for-byte from the selected commit", async () => {
  const repositoryRoot = resolve(import.meta.dirname, "../..");
  const git = createGitAdapter({ root: repositoryRoot });
  await git.assertCommit(COMMIT);
  const context = await git.createContext(COMMIT);
  try {
    for (const dockerfile of ["Dockerfile", "Dockerfile.nginx"]) {
      const expected = await git.readFileAtCommit(COMMIT, dockerfile);
      assert.deepEqual(await readFile(join(context.contextPath, dockerfile)), expected);
    }
  } finally {
    await context.release();
  }
});

test("derives deterministic tags from the full Git SHA", () => {
  assert.deepEqual(createReleaseIdentity(COMMIT), {
    gitCommit: COMMIT,
    releaseId: "git-318aba821311",
    app: { logicalName: "godel-design-app", tag: "godel-design-app:git-318aba821311" },
    nginx: { logicalName: "godel-design-nginx", tag: "godel-design-nginx:git-318aba821311" },
  });
});

test("release technical identity contains no roadmap or pilot names", () => {
  const serialized = JSON.stringify(createReleaseIdentity(COMMIT));
  assert.doesNotMatch(serialized, /ppo|ppo04|pilot/i);
});

test("matching runtime image tags allow both builds to continue", async () => {
  const value = await fixture();
  try {
    assert.equal(
      validateRuntimeImageTagBinding(
        { appImageTag: "git-318aba821311", nginxImageTag: "git-318aba821311" },
        createReleaseIdentity(COMMIT),
      ),
      "git-318aba821311",
    );
    await buildProductionRelease(value.options, value.dependencies);
    assert.deepEqual(
      value.actions.filter(({ action }) => action === "buildApp" || action === "buildNginx").map(({ action }) => action),
      ["buildApp", "buildNginx"],
    );
  } finally {
    await value.cleanup();
  }
});

for (const [name, godelEnv] of [
  ["App", "NEXT_PUBLIC_SUPABASE_URL=https://synthetic.invalid\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-publishable-secret\nGODEL_APP_IMAGE_TAG=git-000000000000\nGODEL_NGINX_IMAGE_TAG=git-318aba821311\n"],
  ["Nginx", "NEXT_PUBLIC_SUPABASE_URL=https://synthetic.invalid\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-publishable-secret\nGODEL_APP_IMAGE_TAG=git-318aba821311\nGODEL_NGINX_IMAGE_TAG=git-000000000000\n"],
]) {
  test(`incorrect ${name} runtime image tag fails before either build`, async () => {
    const value = await fixture({ godelEnv });
    try {
      await assert.rejects(
        () => buildProductionRelease(value.options, value.dependencies),
        /PRODUCTION_RELEASE_IMAGE_TAG_BINDING_MISMATCH/,
      );
      assert.equal(value.actions.some(({ action }) => action === "buildApp" || action === "buildNginx"), false);
    } finally {
      await value.cleanup();
    }
  });
}

for (const [name, godelEnv] of [
  ["App", "NEXT_PUBLIC_SUPABASE_URL=https://synthetic.invalid\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-publishable-secret\nGODEL_NGINX_IMAGE_TAG=git-318aba821311\n"],
  ["Nginx", "NEXT_PUBLIC_SUPABASE_URL=https://synthetic.invalid\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-publishable-secret\nGODEL_APP_IMAGE_TAG=git-318aba821311\n"],
]) {
  test(`missing ${name} runtime image tag fails before either build`, async () => {
    const value = await fixture({ godelEnv });
    try {
      await assert.rejects(
        () => buildProductionRelease(value.options, value.dependencies),
        /PRODUCTION_RELEASE_IMAGE_TAG_BINDING_MISMATCH/,
      );
      assert.equal(value.actions.some(({ action }) => action === "buildApp" || action === "buildNginx"), false);
    } finally {
      await value.cleanup();
    }
  });
}

test("Docker adapter builds App from the exact-context Dockerfile path for linux/amd64 without secret argv", async () => {
  const calls = [];
  const docker = createDockerAdapter({ runner: async (command, args, options) => calls.push({ command, args, options }) });
  const contextPath = resolve("synthetic-exact-git-context");
  const dockerfilePath = join(contextPath, "Dockerfile");
  const publishableKey = "publishable-value-must-not-enter-argv";
  await docker.buildApp({ contextPath, dockerfilePath, tag: "godel-design-app:git-318aba821311", gitCommit: COMMIT, publicUrl: "https://synthetic.invalid", publishableKey, nonce: GENERATION });
  const call = calls[0];
  assert.equal(call.options.cwd, contextPath);
  assert.equal(call.args[call.args.indexOf("--file") + 1], dockerfilePath);
  assert.equal(call.args[call.args.indexOf("--platform") + 1], "linux/amd64");
  assert.ok(call.args.includes("--load"));
  assert.ok(call.args.includes("id=godel_supabase_publishable_key,env=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"));
  assert.equal(call.args.some((argument) => argument.includes(publishableKey)), false);
  assert.equal(call.options.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, publishableKey);
});

test("Docker adapter builds Nginx from the exact-context Dockerfile path for linux/amd64", async () => {
  const calls = [];
  const docker = createDockerAdapter({ runner: async (command, args, options) => calls.push({ command, args, options }) });
  const contextPath = resolve("synthetic-exact-git-context");
  const dockerfilePath = join(contextPath, "Dockerfile.nginx");
  await docker.buildNginx({ contextPath, dockerfilePath, tag: "godel-design-nginx:git-318aba821311", gitCommit: COMMIT });
  assert.equal(calls[0].options.cwd, contextPath);
  assert.equal(calls[0].args[calls[0].args.indexOf("--file") + 1], dockerfilePath);
  assert.equal(calls[0].args[calls[0].args.indexOf("--platform") + 1], "linux/amd64");
  assert.ok(calls[0].args.includes("--load"));
});

test("Dockerfile byte mismatch fails before either image build", async () => {
  const value = await fixture({ git: { readFileAtCommit: async () => Buffer.from("different committed bytes\n") } });
  try {
    await assert.rejects(() => buildProductionRelease(value.options, value.dependencies), /GIT_CONTEXT_DOCKERFILE_MISMATCH/);
    assert.equal(value.actions.some(({ action }) => action === "buildApp" || action === "buildNginx"), false);
  } finally {
    await value.cleanup();
  }
});

test("manifest is allowlisted and contains no supplied secret material", () => {
  const secret = "synthetic-publishable-secret";
  const manifest = createReleaseManifest({
    createdAt: "2026-09-14T12:00:00.000Z",
    identity: createReleaseIdentity(COMMIT),
    externalSecretGenerationId: GENERATION,
    appImageId: APP_ID,
    nginxImageId: NGINX_ID,
    artifactSha256: "c".repeat(64),
    publishableKey: secret,
    completeEnvironment: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${secret}`,
    runtimeImageTags: {
      GODEL_APP_IMAGE_TAG: "git-318aba821311",
      GODEL_NGINX_IMAGE_TAG: "git-318aba821311",
    },
  });
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.doesNotMatch(serialized, /GODEL_(?:APP|NGINX)_IMAGE_TAG/);
  assert.deepEqual(Object.keys(manifest), ["schemaVersion", "createdAt", "gitCommit", "releaseId", "externalSecretGenerationId", "platform", "app", "nginx", "artifact"]);
});

test("rejects an image with the wrong OS or architecture", () => {
  assert.throws(() => validateImageInspection({ os: "windows", architecture: "amd64", imageId: APP_ID, revision: COMMIT }, COMMIT), /INVALID_IMAGE_INSPECTION/);
  assert.throws(() => validateImageInspection({ os: "linux", architecture: "arm64", imageId: APP_ID, revision: COMMIT }, COMMIT), /INVALID_IMAGE_INSPECTION/);
});

test("rejects invalid image IDs and revision labels", () => {
  assert.throws(() => validateImageInspection({ os: "linux", architecture: "amd64", imageId: "not-sha256", revision: COMMIT }, COMMIT), /INVALID_IMAGE_INSPECTION/);
  assert.throws(() => validateImageInspection({ os: "linux", architecture: "amd64", imageId: APP_ID, revision: "0".repeat(40) }, COMMIT), /INVALID_IMAGE_INSPECTION/);
});

test("records the verified artifact checksum and publishes atomically", async () => {
  const value = await fixture();
  try {
    const result = await buildProductionRelease(value.options, value.dependencies);
    const archive = await readFile(join(result.directory, "godel-images.tar"));
    const expected = createHash("sha256").update(archive).digest("hex");
    const manifest = JSON.parse(await readFile(join(result.directory, "release-manifest.json"), "utf8"));
    const sums = await readFile(join(result.directory, "SHA256SUMS"), "utf8");
    assert.deepEqual((await readdir(result.directory)).sort(), ["SHA256SUMS", "godel-images.tar", "release-manifest.json"]);
    assert.equal(result.artifact.sha256, expected);
    assert.equal(manifest.artifact.sha256, expected);
    assert.equal(sums, `${expected}  godel-images.tar\n`);
    assert.equal(await sha256File(join(result.directory, "godel-images.tar")), expected);
  } finally {
    await value.cleanup();
  }
});

for (const failingBuild of ["buildApp", "buildNginx"]) {
  test(`${failingBuild} failure prevents an accepted release`, async () => {
    const value = await fixture({ docker: { [failingBuild]: async () => { throw new Error("synthetic build failure"); } } });
    try {
      await assert.rejects(() => buildProductionRelease(value.options, value.dependencies), /_BUILD_FAILED/);
      await assert.rejects(() => readFile(join(value.artifactRoot, "git-318aba821311", "release-manifest.json")), /ENOENT/);
    } finally {
      await value.cleanup();
    }
  });
}

test("packaging failure prevents an accepted release", async () => {
  const value = await fixture({ docker: { save: async () => { throw new Error("synthetic packaging failure"); } } });
  try {
    await assert.rejects(() => buildProductionRelease(value.options, value.dependencies), /ARTIFACT_PACKAGING_FAILED/);
    await assert.rejects(() => readFile(join(value.artifactRoot, "git-318aba821311", "release-manifest.json")), /ENOENT/);
  } finally {
    await value.cleanup();
  }
});

test("checksum failure prevents an accepted release", async () => {
  let calls = 0;
  const value = await fixture({ dependencies: { hashArtifact: async () => (++calls === 1 ? "c".repeat(64) : "d".repeat(64)) } });
  try {
    await assert.rejects(() => buildProductionRelease(value.options, value.dependencies), /ARTIFACT_CHECKSUM_FAILED/);
    await assert.rejects(() => readFile(join(value.artifactRoot, "git-318aba821311", "release-manifest.json")), /ENOENT/);
  } finally {
    await value.cleanup();
  }
});
