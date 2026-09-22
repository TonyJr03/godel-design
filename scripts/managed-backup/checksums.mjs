import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { resolveContainedPath, validateRelativeArtifactPath } from "./safety.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class ManagedBackupChecksumError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ManagedBackupChecksumError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ManagedBackupChecksumError(code, message);
}

export async function sha256File(pathname) {
  const state = await lstat(pathname).catch((error) => {
    if (error?.code === "ENOENT") fail("ARTIFACT_MISSING", "Checksum artifact is missing");
    throw error;
  });
  if (!state.isFile() || state.isSymbolicLink()) fail("UNSAFE_ARTIFACT", "Checksum target must be a regular file");
  const hash = createHash("sha256");
  await new Promise((accept, reject) => {
    const stream = createReadStream(pathname);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", accept);
  });
  return { size: state.size, sha256: hash.digest("hex") };
}

async function walk(root, directory, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const pathname = resolve(directory, entry.name);
    const state = await lstat(pathname);
    if (state.isSymbolicLink()) fail("UNSAFE_ARTIFACT", "Artifact tree contains a symbolic link or reparse point");
    if (state.isDirectory()) {
      await walk(root, pathname, output);
      continue;
    }
    if (!state.isFile()) fail("UNSAFE_ARTIFACT", "Artifact tree contains a non-file entry");
    output.push(relative(root, pathname).split(sep).join("/"));
  }
}

export async function listArtifactTree(root, { exclude = [] } = {}) {
  const resolvedRoot = resolve(root);
  const excluded = new Set(exclude.map(validateRelativeArtifactPath));
  const output = [];
  await walk(resolvedRoot, resolvedRoot, output);
  return output.filter((pathname) => !excluded.has(pathname)).sort((left, right) => left.localeCompare(right, "en"));
}

export async function createChecksumInventory({ root, paths }) {
  if (!Array.isArray(paths)) fail("CHECKSUM_INPUT_INVALID", "Checksum paths must be an array");
  const normalized = paths.map(validateRelativeArtifactPath).sort((left, right) => left.localeCompare(right, "en"));
  if (new Set(normalized).size !== normalized.length) fail("DUPLICATE_ARTIFACT", "Checksum paths contain a duplicate");
  const entries = [];
  for (const pathname of normalized) {
    const digest = await sha256File(resolveContainedPath(root, pathname));
    entries.push({ path: pathname, size: digest.size, sha256: digest.sha256 });
  }
  return entries;
}

export function serializeChecksums(entries) {
  if (!Array.isArray(entries)) fail("CHECKSUM_INPUT_INVALID", "Checksum entries must be an array");
  let previous = "";
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join("\0") !== ["path", "sha256", "size"].sort().join("\0")) {
      fail("CHECKSUM_INPUT_INVALID", "Checksum entry is invalid");
    }
    validateRelativeArtifactPath(entry.path);
    if (previous && previous >= entry.path) fail("CHECKSUM_ORDER_INVALID", "Checksum entries must be unique and sorted");
    previous = entry.path;
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !SHA256_PATTERN.test(entry.sha256)) {
      fail("CHECKSUM_INPUT_INVALID", "Checksum entry metadata is invalid");
    }
    return `${entry.sha256}  ${entry.size}  ${entry.path}`;
  }).join("\n") + (entries.length ? "\n" : "");
}

export function parseChecksums(source) {
  if (typeof source !== "string") fail("CHECKSUM_FORMAT_INVALID", "Checksum source must be text");
  const entries = [];
  for (const line of source.split("\n")) {
    if (line === "") continue;
    const match = /^([a-f0-9]{64})  (0|[1-9]\d*)  (.+)$/.exec(line);
    if (!match) fail("CHECKSUM_FORMAT_INVALID", "Checksum line is invalid");
    entries.push({ sha256: match[1], size: Number(match[2]), path: validateRelativeArtifactPath(match[3]) });
  }
  serializeChecksums(entries);
  return entries;
}

export async function verifyChecksumInventory({ root, entries }) {
  const canonical = serializeChecksums(entries);
  const parsed = parseChecksums(canonical);
  for (const entry of parsed) {
    const actual = await sha256File(resolveContainedPath(root, entry.path));
    if (actual.size !== entry.size || actual.sha256 !== entry.sha256) {
      fail("CHECKSUM_MISMATCH", `Checksum verification failed for ${entry.path}`);
    }
  }
  return { verified: true, count: parsed.length };
}

export async function readAndVerifyChecksums({ root, checksumPath = "inventory/checksums.sha256" }) {
  const source = await readFile(resolveContainedPath(root, checksumPath), "utf8").catch((error) => {
    if (error?.code === "ENOENT") fail("ARTIFACT_MISSING", "Checksum file is missing");
    throw error;
  });
  return verifyChecksumInventory({ root, entries: parseChecksums(source) });
}
