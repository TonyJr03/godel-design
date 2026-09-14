#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acquireGenerationMutationLock,
  assertActiveSecretGenerationMatches,
  assertCurrentSecretGenerationMatches,
  isCanonicalGenerationId,
  releaseGenerationMutationLock,
} from "./secret-generation.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const PLATFORM = "linux/amd64";
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const FULL_GIT_SHA = /^[a-f0-9]{40}$/i;
const BUILD_SECRET_NAME = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const BUILD_SECRET_SPEC = `id=godel_supabase_publishable_key,env=${BUILD_SECRET_NAME}`;

function fail(code) {
  throw new Error(`PRODUCTION_RELEASE_${code}`);
}

function nested(parent, candidate) {
  const relation = relative(parent, candidate);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..");
}

async function pathState(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertExactRegularFile(contextPath, filePath) {
  const contextReal = await realpath(contextPath);
  const fileReal = await realpath(filePath);
  const info = await lstat(filePath);
  if (!info.isFile() || !nested(contextReal, fileReal)) fail("INVALID_GIT_CONTEXT_DOCKERFILE");
}

export function normalizeGitCommit(value) {
  if (typeof value !== "string" || !FULL_GIT_SHA.test(value)) fail("INVALID_GIT_COMMIT");
  return value.toLowerCase();
}

export function createReleaseIdentity(gitCommit) {
  const canonicalCommit = normalizeGitCommit(gitCommit);
  const shortCommit = canonicalCommit.slice(0, 12);
  return Object.freeze({
    gitCommit: canonicalCommit,
    releaseId: `git-${shortCommit}`,
    app: Object.freeze({ logicalName: "godel-design-app", tag: `godel-design-app:git-${shortCommit}` }),
    nginx: Object.freeze({ logicalName: "godel-design-nginx", tag: `godel-design-nginx:git-${shortCommit}` }),
  });
}

export function parseBuildEnvironment(contents) {
  const values = new Map();
  for (const rawLine of Buffer.from(contents).toString("utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const assignment = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!assignment) continue;
    const [, name, rawValue] = assignment;
    if (values.has(name)) fail("DUPLICATE_ENVIRONMENT_VARIABLE");
    const value = rawValue.trim();
    values.set(
      name,
      value.length >= 2
        && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        ? value.slice(1, -1)
        : value,
    );
  }
  const publicUrl = values.get("NEXT_PUBLIC_SUPABASE_URL")?.trim();
  const publishableKey = values.get(BUILD_SECRET_NAME)?.trim();
  const appImageTag = values.get("GODEL_APP_IMAGE_TAG")?.trim();
  const nginxImageTag = values.get("GODEL_NGINX_IMAGE_TAG")?.trim();
  if (!publicUrl || !publishableKey) fail("BUILD_CONFIGURATION_REQUIRED");
  if (!appImageTag || !nginxImageTag) fail("IMAGE_TAG_BINDING_MISMATCH");
  return Object.freeze({ publicUrl, publishableKey, appImageTag, nginxImageTag });
}

export function validateRuntimeImageTagBinding(configuration, identity) {
  const expectedRuntimeTag = identity.releaseId;
  if (
    configuration?.appImageTag !== expectedRuntimeTag
    || configuration?.nginxImageTag !== expectedRuntimeTag
  ) {
    fail("IMAGE_TAG_BINDING_MISMATCH");
  }
  return expectedRuntimeTag;
}

export function validateImageInspection(inspected, gitCommit) {
  const canonicalCommit = normalizeGitCommit(gitCommit);
  if (
    inspected?.os !== "linux"
    || inspected?.architecture !== "amd64"
    || !IMAGE_ID.test(inspected?.imageId ?? "")
    || inspected?.revision !== canonicalCommit
  ) {
    fail("INVALID_IMAGE_INSPECTION");
  }
  return inspected.imageId;
}

export function createReleaseManifest({ createdAt, identity, externalSecretGenerationId, appImageId, nginxImageId, artifactSha256 }) {
  if (!isCanonicalGenerationId(externalSecretGenerationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
  if (!IMAGE_ID.test(appImageId) || !IMAGE_ID.test(nginxImageId) || !/^[a-f0-9]{64}$/.test(artifactSha256)) {
    fail("INVALID_RELEASE_METADATA");
  }
  return Object.freeze({
    schemaVersion: 1,
    createdAt,
    gitCommit: identity.gitCommit,
    releaseId: identity.releaseId,
    externalSecretGenerationId,
    platform: PLATFORM,
    app: Object.freeze({
      logicalName: identity.app.logicalName,
      tag: identity.app.tag,
      imageId: appImageId,
    }),
    nginx: Object.freeze({
      logicalName: identity.nginx.logicalName,
      tag: identity.nginx.tag,
      imageId: nginxImageId,
    }),
    artifact: Object.freeze({ file: "godel-images.tar", sha256: artifactSha256 }),
  });
}

export async function sha256File(path) {
  return new Promise((resolveDigest, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveDigest(hash.digest("hex")));
  });
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const stdio = options.stdio ?? "pipe";
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio,
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    if (child.stdout) child.stdout.on("data", (chunk) => stdout.push(chunk));
    if (child.stderr) child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const error = new Error("EXTERNAL_COMMAND_FAILED");
        error.exitCode = code;
        reject(error);
        return;
      }
      const stdoutBuffer = Buffer.concat(stdout);
      const stderrBuffer = Buffer.concat(stderr);
      resolveResult({
        stdout: stdoutBuffer.toString("utf8"),
        stderr: stderrBuffer.toString("utf8"),
        stdoutBuffer,
        stderrBuffer,
      });
    });
  });
}

export function createGitAdapter({ root = ROOT, runner = runCommand } = {}) {
  return Object.freeze({
    assertCommit: async (gitCommit) => {
      try {
        await runner("git", ["cat-file", "-e", `${gitCommit}^{commit}`], { cwd: root, stdio: "ignore" });
      } catch {
        fail("GIT_COMMIT_NOT_FOUND");
      }
    },
    readFileAtCommit: async (gitCommit, path) => {
      try {
        const result = await runner("git", ["cat-file", "blob", `${gitCommit}:${path}`], { cwd: root, stdio: "pipe" });
        if (!Buffer.isBuffer(result.stdoutBuffer)) fail("GIT_BLOB_READ_FAILED");
        return result.stdoutBuffer;
      } catch (error) {
        if (error?.message === "PRODUCTION_RELEASE_GIT_BLOB_READ_FAILED") throw error;
        fail("GIT_BLOB_READ_FAILED");
      }
    },
    createContext: async (gitCommit) => {
      const temporaryPath = await mkdtemp(join(tmpdir(), "godel-production-release-"));
      const archivePath = join(temporaryPath, "context.tar");
      const contextPath = join(temporaryPath, "context");
      try {
        await mkdir(contextPath);
        await runner(
          "git",
          ["-c", "core.autocrlf=false", "archive", "--format=tar", "--output", archivePath, gitCommit],
          { cwd: root, stdio: "ignore" },
        );
        await runner("tar", ["-xf", archivePath, "-C", contextPath], { cwd: temporaryPath, stdio: "ignore" });
        return Object.freeze({
          contextPath,
          release: () => rm(temporaryPath, { recursive: true, force: true }),
        });
      } catch {
        await rm(temporaryPath, { recursive: true, force: true }).catch(() => {});
        fail("GIT_ARCHIVE_CONTEXT_FAILED");
      }
    },
  });
}

export function createDockerAdapter({ runner = runCommand } = {}) {
  const inspect = async (tag) => {
    let parsed;
    try {
      const result = await runner("docker", ["image", "inspect", tag], { stdio: "pipe" });
      parsed = JSON.parse(result.stdout);
    } catch {
      fail("IMAGE_INSPECTION_FAILED");
    }
    const image = parsed?.[0];
    return Object.freeze({
      os: image?.Os,
      architecture: image?.Architecture,
      imageId: image?.Id,
      revision: image?.Config?.Labels?.["org.opencontainers.image.revision"],
    });
  };
  const commonBuildArguments = ({ dockerfilePath, tag, gitCommit }) => [
    "buildx",
    "build",
    "--platform",
    PLATFORM,
    "--load",
    "--file",
    dockerfilePath,
    "--tag",
    tag,
    "--label",
    `org.opencontainers.image.revision=${gitCommit}`,
  ];
  return Object.freeze({
    buildApp: async ({ contextPath, dockerfilePath, tag, gitCommit, publicUrl, publishableKey, nonce }) => {
      const args = [
        ...commonBuildArguments({ dockerfilePath, tag, gitCommit }),
        "--build-arg",
        `NEXT_PUBLIC_SUPABASE_URL=${publicUrl}`,
        "--build-arg",
        `GODEL_PUBLIC_BUILD_NONCE=${nonce}`,
        "--secret",
        BUILD_SECRET_SPEC,
        contextPath,
      ];
      await runner("docker", args, {
        cwd: contextPath,
        env: { ...process.env, [BUILD_SECRET_NAME]: publishableKey },
        stdio: "inherit",
      });
    },
    buildNginx: async ({ contextPath, dockerfilePath, tag, gitCommit }) => {
      await runner(
        "docker",
        [...commonBuildArguments({ dockerfilePath, tag, gitCommit }), contextPath],
        { cwd: contextPath, stdio: "inherit" },
      );
    },
    inspect,
    save: async ({ outputPath, tags }) => {
      await runner("docker", ["save", "--output", outputPath, ...tags], {
        cwd: dirname(outputPath),
        stdio: "inherit",
      });
    },
  });
}

export async function validateRuntimeEnvironment({ root = ROOT, supabaseEnvPath, godelEnvPath, runner = runCommand }) {
  try {
    await runner(
      process.execPath,
      [resolve(root, "scripts/validate-selfhosted-runtime-env.mjs"), "--supabase-env", supabaseEnvPath, "--godel-env", godelEnvPath],
      { cwd: root, stdio: "ignore" },
    );
  } catch {
    fail("RUNTIME_ENVIRONMENT_INVALID");
  }
}

export async function acquireConfigurationBinding({ protectedRoot, supabaseEnvPath, godelEnvPath }) {
  let lock = null;
  try {
    const generationId = await assertCurrentSecretGenerationMatches({ protectedRoot, supabaseEnvPath, godelEnvPath });
    lock = await acquireGenerationMutationLock({
      protectedRoot,
      operation: "production-release-build",
      generationId,
    });
    const verify = async () => assertActiveSecretGenerationMatches({
      protectedRoot,
      generationId,
      supabaseEnvPath,
      godelEnvPath,
    });
    await verify();
    return Object.freeze({
      generationId,
      verify,
      release: () => releaseGenerationMutationLock(lock),
    });
  } catch {
    if (lock) await releaseGenerationMutationLock(lock).catch(() => {});
    fail("CONFIGURATION_BINDING_INVALID");
  }
}

export function parseArguments(args, { root = ROOT } = {}) {
  const value = {
    gitCommit: null,
    godelEnvPath: resolve(root, "compose.env.local"),
    supabaseEnvPath: resolve(root, "infra/supabase/.env"),
    protectedRoot: resolve(root, "protected-recovery-material/selfhosted"),
    artifactRoot: resolve(root, "release-artifacts"),
  };
  const seen = new Set();
  while (args.length > 0) {
    const argument = args.shift();
    const target = {
      "--git-commit": "gitCommit",
      "--godel-env": "godelEnvPath",
      "--supabase-env": "supabaseEnvPath",
      "--protected-root": "protectedRoot",
    }[argument];
    if (!target || seen.has(argument)) fail("INVALID_ARGUMENTS");
    seen.add(argument);
    const supplied = args.shift();
    if (!supplied || supplied.startsWith("--")) fail("INVALID_ARGUMENTS");
    value[target] = target === "gitCommit" ? supplied : resolve(root, supplied);
  }
  value.gitCommit = normalizeGitCommit(value.gitCommit);
  return Object.freeze(value);
}

export async function buildProductionRelease(options, dependencies = {}) {
  const gitCommit = normalizeGitCommit(options.gitCommit);
  const identity = createReleaseIdentity(gitCommit);
  const artifactRoot = resolve(options.artifactRoot ?? resolve(options.root ?? ROOT, "release-artifacts"));
  const finalDirectory = join(artifactRoot, identity.releaseId);
  const git = dependencies.git ?? createGitAdapter({ root: options.root ?? ROOT });
  const docker = dependencies.docker ?? createDockerAdapter();
  const validateEnvironment = dependencies.validateEnvironment ?? validateRuntimeEnvironment;
  const bindConfiguration = dependencies.bindConfiguration ?? acquireConfigurationBinding;
  const hashArtifact = dependencies.hashArtifact ?? sha256File;
  const now = dependencies.now ?? (() => new Date().toISOString());
  let context = null;
  let binding = null;
  let stagingDirectory = null;
  let published = false;

  await git.assertCommit(gitCommit);
  if (await pathState(finalDirectory)) fail("RELEASE_ALREADY_EXISTS");
  binding = await bindConfiguration({
    protectedRoot: options.protectedRoot,
    supabaseEnvPath: options.supabaseEnvPath,
    godelEnvPath: options.godelEnvPath,
  });

  try {
    if (!isCanonicalGenerationId(binding?.generationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
    await validateEnvironment({
      root: options.root ?? ROOT,
      supabaseEnvPath: options.supabaseEnvPath,
      godelEnvPath: options.godelEnvPath,
    });
    const configuration = parseBuildEnvironment(await readFile(options.godelEnvPath));
    validateRuntimeImageTagBinding(configuration, identity);
    await mkdir(artifactRoot, { recursive: true });
    stagingDirectory = await mkdtemp(join(artifactRoot, `.${identity.releaseId}-`));
    context = await git.createContext(gitCommit);
    const appDockerfile = join(context.contextPath, "Dockerfile");
    const nginxDockerfile = join(context.contextPath, "Dockerfile.nginx");
    await assertExactRegularFile(context.contextPath, appDockerfile);
    await assertExactRegularFile(context.contextPath, nginxDockerfile);
    const [expectedAppDockerfile, expectedNginxDockerfile, actualAppDockerfile, actualNginxDockerfile] = await Promise.all([
      git.readFileAtCommit(gitCommit, "Dockerfile"),
      git.readFileAtCommit(gitCommit, "Dockerfile.nginx"),
      readFile(appDockerfile),
      readFile(nginxDockerfile),
    ]);
    if (
      !Buffer.from(expectedAppDockerfile).equals(actualAppDockerfile)
      || !Buffer.from(expectedNginxDockerfile).equals(actualNginxDockerfile)
    ) {
      fail("GIT_CONTEXT_DOCKERFILE_MISMATCH");
    }

    try {
      await docker.buildApp({
        contextPath: context.contextPath,
        dockerfilePath: appDockerfile,
        tag: identity.app.tag,
        gitCommit,
        publicUrl: configuration.publicUrl,
        publishableKey: configuration.publishableKey,
        nonce: randomUUID(),
      });
    } catch {
      fail("APP_BUILD_FAILED");
    }
    const appImageId = validateImageInspection(await docker.inspect(identity.app.tag), gitCommit);

    try {
      await docker.buildNginx({
        contextPath: context.contextPath,
        dockerfilePath: nginxDockerfile,
        tag: identity.nginx.tag,
        gitCommit,
      });
    } catch {
      fail("NGINX_BUILD_FAILED");
    }
    const nginxImageId = validateImageInspection(await docker.inspect(identity.nginx.tag), gitCommit);

    const artifactPath = join(stagingDirectory, "godel-images.tar");
    try {
      await docker.save({ outputPath: artifactPath, tags: [identity.app.tag, identity.nginx.tag] });
      const artifactStat = await stat(artifactPath);
      if (!artifactStat.isFile() || artifactStat.size < 1) fail("ARTIFACT_PACKAGING_FAILED");
    } catch (error) {
      if (error?.message === "PRODUCTION_RELEASE_ARTIFACT_PACKAGING_FAILED") throw error;
      fail("ARTIFACT_PACKAGING_FAILED");
    }

    let artifactSha256;
    try {
      artifactSha256 = await hashArtifact(artifactPath);
      if (!/^[a-f0-9]{64}$/.test(artifactSha256)) fail("ARTIFACT_CHECKSUM_FAILED");
      await writeFile(
        join(stagingDirectory, "SHA256SUMS"),
        `${artifactSha256}  ${basename(artifactPath)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      if (await hashArtifact(artifactPath) !== artifactSha256) fail("ARTIFACT_CHECKSUM_FAILED");
    } catch (error) {
      if (error?.message === "PRODUCTION_RELEASE_ARTIFACT_CHECKSUM_FAILED") throw error;
      fail("ARTIFACT_CHECKSUM_FAILED");
    }

    try {
      await binding.verify();
    } catch {
      fail("CONFIGURATION_BINDING_CHANGED");
    }
    const manifest = createReleaseManifest({
      createdAt: now(),
      identity,
      externalSecretGenerationId: binding.generationId,
      appImageId,
      nginxImageId,
      artifactSha256,
    });
    await writeFile(
      join(stagingDirectory, "release-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(stagingDirectory, finalDirectory);
    published = true;
    return Object.freeze({ ...manifest, directory: finalDirectory });
  } finally {
    await context?.release().catch(() => {});
    if (!published && stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
    await binding?.release().catch(() => {});
  }
}

function usage() {
  process.stderr.write(
    "Usage: node scripts/operations/build-production-release.mjs --git-commit <40-char-sha> [--godel-env <path>] [--supabase-env <path>] [--protected-root <path>]\n",
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await buildProductionRelease({ ...options, root: ROOT });
  const displayDirectory = relative(ROOT, result.directory) || basename(result.directory);
  process.stdout.write([
    "RELEASE_BUILD=PASS",
    `RELEASE_ID=${result.releaseId}`,
    `GIT_COMMIT=${result.gitCommit}`,
    `EXTERNAL_SECRET_GENERATION_ID=${result.externalSecretGenerationId}`,
    `PLATFORM=${result.platform}`,
    `APP_TAG=${result.app.tag}`,
    `APP_IMAGE_ID=${result.app.imageId}`,
    `NGINX_TAG=${result.nginx.tag}`,
    `NGINX_IMAGE_ID=${result.nginx.imageId}`,
    `ARTIFACT=${join(displayDirectory, result.artifact.file)}`,
    `ARTIFACT_SHA256=${result.artifact.sha256}`,
    "RAW_BUILD_LOG_PERSISTENCE=NO",
    "PUBLISHABLE_KEY_ARG_TRANSPORT=NO",
  ].join("\n") + "\n");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    usage();
    const message = typeof error?.message === "string" && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "PRODUCTION_RELEASE_BUILD_FAILED";
    process.stderr.write(`FAIL ${message}\n`);
    process.exitCode = 1;
  });
}
