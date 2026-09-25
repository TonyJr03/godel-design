import { open, lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { sha256File } from "../managed-backup/checksums.mjs";

const BLOCK_SIZE = 512;
const decoder = new TextDecoder("utf-8", { fatal: true });

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryArchiveError";
  error.code = code;
  throw error;
}

function decodeField(block, offset, length, label) {
  const field = block.subarray(offset, offset + length);
  const nul = field.indexOf(0);
  const content = nul === -1 ? field : field.subarray(0, nul);
  if (nul !== -1 && field.subarray(nul).some((value) => value !== 0 && value !== 32)) fail("RECOVERY_ARCHIVE_HEADER_INVALID", `${label} has ambiguous padding`);
  try {
    const value = decoder.decode(content);
    if (/\p{Cc}/u.test(value)) fail("RECOVERY_ARCHIVE_HEADER_INVALID", `${label} contains control characters`);
    return value;
  } catch {
    fail("RECOVERY_ARCHIVE_HEADER_INVALID", `${label} is not valid UTF-8`);
  }
}

function parseOctal(block, offset, length, label) {
  const raw = block.subarray(offset, offset + length);
  if ((raw[0] & 0x80) !== 0) fail("RECOVERY_ARCHIVE_HEADER_INVALID", `${label} uses unsupported base-256 encoding`);
  const value = raw.toString("ascii").replace(/\0.*$/s, "").trim();
  if (value === "") return 0;
  if (!/^[0-7]+$/.test(value)) fail("RECOVERY_ARCHIVE_HEADER_INVALID", `${label} is not strict octal`);
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail("RECOVERY_ARCHIVE_HEADER_INVALID", `${label} is outside the safe range`);
  return parsed;
}

function verifyHeaderChecksum(block) {
  const expected = parseOctal(block, 148, 8, "tar checksum");
  let actual = 0;
  for (let index = 0; index < BLOCK_SIZE; index += 1) actual += index >= 148 && index < 156 ? 32 : block[index];
  if (actual !== expected) fail("RECOVERY_ARCHIVE_CHECKSUM_INVALID", "Tar header checksum is invalid");
}

function normalizeEntryPath(rawName, type) {
  if (typeof rawName !== "string" || rawName.length === 0 || rawName.includes("\\") || rawName.startsWith("/") || /^[A-Za-z]:/.test(rawName)) {
    fail("RECOVERY_ARCHIVE_PATH_UNSAFE", "Tar entry path is unsafe");
  }
  let value = rawName;
  if (value === "." || value === "./") {
    if (type !== "directory") fail("RECOVERY_ARCHIVE_PATH_UNSAFE", "Tar root entry must be a directory");
    return "";
  }
  if (value.startsWith("./")) value = value.slice(2);
  if (type === "directory" && value.endsWith("/")) value = value.slice(0, -1);
  if (value === "" || isAbsolute(value) || value.includes("//") || value.endsWith("/")) fail("RECOVERY_ARCHIVE_PATH_UNSAFE", "Tar entry path is ambiguous");
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..") || /[\0-\x1f]/.test(value)) {
    fail("RECOVERY_ARCHIVE_PATH_UNSAFE", "Tar entry path contains traversal or ambiguity");
  }
  return value;
}

function entryType(typeFlag) {
  if (typeFlag === 0 || typeFlag === 48) return "file";
  if (typeFlag === 53) return "directory";
  if (typeFlag === 49) fail("RECOVERY_ARCHIVE_HARDLINK_FORBIDDEN", "Tar hardlinks are forbidden");
  if (typeFlag === 50) fail("RECOVERY_ARCHIVE_SYMLINK_FORBIDDEN", "Tar symlinks are forbidden");
  if ([51, 52, 54].includes(typeFlag)) fail("RECOVERY_ARCHIVE_SPECIAL_TYPE_FORBIDDEN", "Tar devices and FIFOs are forbidden");
  fail("RECOVERY_ARCHIVE_SPECIAL_TYPE_FORBIDDEN", "Tar entry type is not admitted");
}

function assertHierarchy(entries) {
  const types = new Map(entries.filter((entry) => entry.path !== "").map((entry) => [entry.path, entry.type]));
  for (const entry of entries) {
    if (entry.path === "") continue;
    const parts = entry.path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const ancestor = parts.slice(0, index).join("/");
      if (types.has(ancestor) && types.get(ancestor) !== "directory") {
        fail("RECOVERY_ARCHIVE_PATH_CONFLICT", "Tar entry hierarchy conflicts with a regular file");
      }
    }
  }
}

async function readExact(handle, buffer, position) {
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
  return bytesRead;
}

export async function inspectSafeTarArchive(archivePath) {
  const state = await lstat(archivePath).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink() || state.size < BLOCK_SIZE * 2 || state.size % BLOCK_SIZE !== 0) {
    fail("RECOVERY_ARCHIVE_INVALID", "Recovery tar must be a block-aligned regular file");
  }
  const handle = await open(archivePath, "r");
  const entries = [];
  const seen = new Set();
  let position = 0;
  let zeroBlocks = 0;
  try {
    while (position < state.size) {
      const block = Buffer.alloc(BLOCK_SIZE);
      if (await readExact(handle, block, position) !== BLOCK_SIZE) fail("RECOVERY_ARCHIVE_TRUNCATED", "Recovery tar is truncated");
      if (block.every((value) => value === 0)) {
        zeroBlocks += 1;
        position += BLOCK_SIZE;
        if (zeroBlocks >= 2) break;
        continue;
      }
      if (zeroBlocks !== 0) fail("RECOVERY_ARCHIVE_INVALID", "Recovery tar has a partial end marker");
      verifyHeaderChecksum(block);
      const magic = block.subarray(257, 263).toString("binary");
      if (magic !== "ustar\0" && magic !== "ustar ") fail("RECOVERY_ARCHIVE_FORMAT_UNSUPPORTED", "Only ustar archives are admitted");
      const type = entryType(block[156]);
      const name = decodeField(block, 0, 100, "tar name");
      const prefix = decodeField(block, 345, 155, "tar prefix");
      const rawPath = prefix ? `${prefix}/${name}` : name;
      const pathname = normalizeEntryPath(rawPath, type);
      const size = parseOctal(block, 124, 12, "tar entry size");
      if (type === "directory" && size !== 0) fail("RECOVERY_ARCHIVE_HEADER_INVALID", "Tar directory must have zero size");
      if (seen.has(pathname)) fail("RECOVERY_ARCHIVE_DUPLICATE_ENTRY", "Tar contains a duplicate normalized entry");
      seen.add(pathname);
      const dataOffset = position + BLOCK_SIZE;
      const paddedSize = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
      if (dataOffset + paddedSize > state.size) fail("RECOVERY_ARCHIVE_TRUNCATED", "Recovery tar entry is truncated");
      entries.push(Object.freeze({ path: pathname, type, size, dataOffset }));
      position = dataOffset + paddedSize;
    }
    if (zeroBlocks < 2) fail("RECOVERY_ARCHIVE_INVALID", "Recovery tar is missing its end marker");
    while (position < state.size) {
      const block = Buffer.alloc(BLOCK_SIZE);
      if (await readExact(handle, block, position) !== BLOCK_SIZE || !block.every((value) => value === 0)) {
        fail("RECOVERY_ARCHIVE_TRAILING_DATA", "Recovery tar has data after its end marker");
      }
      position += BLOCK_SIZE;
    }
  } finally {
    await handle.close();
  }
  assertHierarchy(entries);
  const fingerprint = await sha256File(archivePath);
  return Object.freeze({
    verified: true,
    size: fingerprint.size,
    sha256: fingerprint.sha256,
    entries: Object.freeze(entries),
  });
}

async function assertExtractionRoot(destination) {
  const state = await lstat(destination).catch(() => null);
  if (!state?.isDirectory() || state.isSymbolicLink()) fail("RECOVERY_EXTRACTION_ROOT_INVALID", "Recovery extraction root must be a real directory");
  const actual = await realpath(destination);
  if (actual !== resolve(destination)) fail("RECOVERY_EXTRACTION_ROOT_INVALID", "Recovery extraction root resolves unexpectedly");
  const existing = await readdir(actual);
  if (existing.length !== 0) fail("RECOVERY_EXTRACTION_ROOT_NOT_EMPTY", "Recovery extraction root must be empty");
  return actual;
}

async function writeArchiveFile(handle, entry, target) {
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const output = await open(target, "wx", 0o600).catch((error) => {
    if (error?.code === "EEXIST") fail("RECOVERY_EXTRACTION_COLLISION", "Recovery extraction target already exists");
    throw error;
  });
  const buffer = Buffer.alloc(64 * 1024);
  let remaining = entry.size;
  let position = entry.dataOffset;
  try {
    while (remaining > 0) {
      const length = Math.min(buffer.length, remaining);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      if (bytesRead !== length) fail("RECOVERY_ARCHIVE_TRUNCATED", "Recovery tar changed during extraction");
      await output.write(buffer, 0, bytesRead);
      remaining -= bytesRead;
      position += bytesRead;
    }
    await output.sync();
  } finally {
    await output.close();
  }
}

async function walkExtracted(root, directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const pathname = resolve(directory, entry.name);
    const state = await lstat(pathname);
    const rel = relative(root, pathname).split(sep).join("/");
    if (state.isSymbolicLink()) fail("RECOVERY_EXTRACTED_LINK_FORBIDDEN", "Extracted recovery tree contains a link or reparse point");
    if (state.isDirectory()) await walkExtracted(root, pathname, files);
    else if (state.isFile()) files.push(rel);
    else fail("RECOVERY_EXTRACTED_SPECIAL_TYPE_FORBIDDEN", "Extracted recovery tree contains a special entry");
  }
}

export async function extractSafeTarArchive({ archivePath, destination, inspection } = {}) {
  if (!inspection?.verified || !Array.isArray(inspection.entries)) fail("RECOVERY_ARCHIVE_INSPECTION_REQUIRED", "A successful archive inspection is required before extraction");
  const current = await sha256File(archivePath);
  if (current.size !== inspection.size || current.sha256 !== inspection.sha256) fail("RECOVERY_ARCHIVE_CHANGED", "Recovery tar changed after inspection");
  const root = await assertExtractionRoot(destination);
  const handle = await open(archivePath, "r");
  try {
    for (const entry of inspection.entries) {
      if (entry.path === "") continue;
      const target = resolve(root, ...entry.path.split("/"));
      const rel = relative(root, target);
      if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("RECOVERY_ARCHIVE_PATH_UNSAFE", "Recovery extraction path escaped its root");
      if (entry.type === "directory") await mkdir(target, { recursive: true, mode: 0o700 });
      else await writeArchiveFile(handle, entry, target);
    }
  } finally {
    await handle.close();
  }
  const actualFiles = [];
  await walkExtracted(root, root, actualFiles);
  actualFiles.sort((left, right) => left.localeCompare(right, "en"));
  const expectedFiles = inspection.entries.filter((entry) => entry.type === "file").map((entry) => entry.path).sort((left, right) => left.localeCompare(right, "en"));
  if (actualFiles.length !== expectedFiles.length || actualFiles.some((value, index) => value !== expectedFiles[index])) {
    fail("RECOVERY_EXTRACTED_TREE_MISMATCH", "Extracted recovery tree differs from the admitted archive");
  }
  return Object.freeze({ verified: true, fileCount: actualFiles.length });
}
