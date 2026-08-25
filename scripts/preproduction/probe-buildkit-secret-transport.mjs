import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: options.cwd,
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }),
    );
  });
}

function requireSuccess(result, operation) {
  if (result.code !== 0) throw new Error(`${operation} failed`);
  return result.stdout;
}

async function exportArtifact(image) {
  const containerId = requireSuccess(await run(["create", image]), "create synthetic inspection container")
    .toString("utf8")
    .trim();

  try {
    return requireSuccess(await run(["export", containerId]), "export synthetic image filesystem");
  } finally {
    await run(["rm", "-f", containerId]);
  }
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "godel-r5a-buildkit-"));
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const builder = `godel-r5a-${suffix}`;
const image = `godel-r5a-probe:${suffix}`;
const valueA = `r5a-probe-a-${randomUUID()}`;
const valueB = `r5a-probe-b-${randomUUID()}`;
const nonceA = randomUUID();
const nonceB = randomUUID();
let builderCreated = false;
let imageCreated = false;
let success = false;
let cacheCleaned = false;

try {
  await writeFile(
    join(temporaryRoot, "Dockerfile"),
    "# syntax=docker/dockerfile:1.7\nFROM alpine:3.21\nARG PROBE_NONCE\nRUN --mount=type=secret,id=probe_publishable,required=true if [ -z \"$PROBE_NONCE\" ]; then exit 1; fi; test -s /run/secrets/probe_publishable && cp /run/secrets/probe_publishable /probe-artifact\n",
  );
  await writeFile(
    join(temporaryRoot, "compose.yaml"),
    "services:\n  probe:\n    build:\n      context: .\n      args:\n        PROBE_NONCE: ${PROBE_NONCE:?PROBE_NONCE is required}\n      secrets:\n        - source: probe_publishable\n          target: probe_publishable\n    image: ${PROBE_IMAGE:?PROBE_IMAGE is required}\nsecrets:\n  probe_publishable:\n    environment: PROBE_VALUE\n",
  );
  await writeFile(
    join(temporaryRoot, "synthetic-a.env"),
    `PROBE_VALUE=${valueA}\nPROBE_NONCE=${nonceA}\nPROBE_IMAGE=${image}\n`,
  );
  await writeFile(
    join(temporaryRoot, "synthetic-b.env"),
    `PROBE_VALUE=${valueB}\nPROBE_NONCE=${nonceB}\nPROBE_IMAGE=${image}\n`,
  );

  requireSuccess(
    await run(["buildx", "create", "--name", builder, "--driver", "docker-container", "--bootstrap"]),
    "create synthetic builder",
  );
  builderCreated = true;

  const buildA = await run(
    [
      "compose",
      "--env-file",
      "synthetic-a.env",
      "-f",
      "compose.yaml",
      "build",
      "--builder",
      builder,
      "--no-cache",
      "probe",
    ],
    { cwd: temporaryRoot },
  );
  const buildAOutput = Buffer.concat([buildA.stdout, buildA.stderr]);
  requireSuccess(buildA, "synthetic Compose build A");
  imageCreated = true;

  const artifactA = await exportArtifact(image);
  assert.equal(artifactA.includes(Buffer.from(valueA)), true, "build A artifact must contain input A");
  assert.equal(artifactA.includes(Buffer.from(valueB)), false, "build A artifact must not contain input B");

  const buildB = await run(
    [
      "compose",
      "--env-file",
      "synthetic-b.env",
      "-f",
      "compose.yaml",
      "build",
      "--builder",
      builder,
      "probe",
    ],
    { cwd: temporaryRoot },
  );
  const buildBOutput = Buffer.concat([buildB.stdout, buildB.stderr]);
  requireSuccess(buildB, "synthetic Compose cached build B");

  const artifactB = await exportArtifact(image);
  assert.equal(artifactB.includes(Buffer.from(valueB)), true, "cached build B artifact must contain input B");
  assert.equal(artifactB.includes(Buffer.from(valueA)), false, "cached build B artifact must not contain input A");

  const refs = requireSuccess(
    await run(["buildx", "history", "ls", "--builder", builder, "--format", "{{.Ref}}"]),
    "list synthetic BuildKit history",
  )
    .toString("utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(refs.length, 2, "synthetic builder must contain two build records");

  const buildHistories = await Promise.all(
    refs.map(async (ref) =>
      requireSuccess(
        await run(["buildx", "history", "inspect", "--builder", builder, ref]),
        "inspect synthetic BuildKit history",
      ),
    ),
  );
  const dockerHistory = requireSuccess(
    await run(["history", "--no-trunc", image]),
    "inspect synthetic image history",
  );
  const imageConfig = requireSuccess(
    await run(["image", "inspect", image]),
    "inspect synthetic image config",
  );

  for (const output of [buildAOutput, buildBOutput, ...buildHistories, dockerHistory, imageConfig]) {
    assert.equal(output.includes(Buffer.from(valueA)), false, "synthetic input A must not persist outside artifact");
    assert.equal(output.includes(Buffer.from(valueB)), false, "synthetic input B must not persist outside artifact");
  }

  success = true;
} finally {
  if (imageCreated) await run(["image", "rm", "--force", image]);
  if (builderCreated) {
    const cleanup = await run(["buildx", "rm", "--force", builder]);
    cacheCleaned = cleanup.code === 0;
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}

console.log(`DIRECT_COMPOSE_ENV_FILE_SECRET_SOURCE=${success ? "SUPPORTED" : "FAIL"}`);
console.log(`SYNTHETIC_BUILD_A_ARTIFACT=${success ? "PASS" : "FAIL"}`);
console.log(`SYNTHETIC_BUILD_B_CACHED_ARTIFACT=${success ? "B_PRESENT_A_ABSENT" : "FAIL"}`);
console.log(`SYNTHETIC_BUILDKIT_METADATA=${success ? "ABSENT" : "UNVERIFIED"}`);
console.log(`SYNTHETIC_BUILDKIT_LOGS=${success ? "ABSENT" : "UNVERIFIED"}`);
console.log(`SYNTHETIC_DOCKER_HISTORY=${success ? "ABSENT" : "UNVERIFIED"}`);
console.log(`SYNTHETIC_IMAGE_CONFIG=${success ? "ABSENT" : "UNVERIFIED"}`);
console.log("SYNTHETIC_NONCE_METADATA=ALLOWED");
console.log(`SYNTHETIC_ARTIFACT_DELIVERY=${success ? "PASS" : "FAIL"}`);
console.log(`SYNTHETIC_BUILDER_CACHE_CLEANUP=${cacheCleaned ? "PASS" : "CHECK CLEANUP"}`);
