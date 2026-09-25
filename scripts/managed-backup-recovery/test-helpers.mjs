import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { createChecksumInventory, serializeChecksums, sha256File } from "../managed-backup/checksums.mjs";
import { validateExternalReceipt } from "../managed-backup/external-receipt.mjs";
import { completeManifest, createIncompleteManifest, updateIncompleteManifest, writeManifestAtomic } from "../managed-backup/manifest.mjs";

export const TEST_BACKUP_ID = "GDBK-20260925T120000Z-AAAAAAAA";
export const TEST_TOOLING_SHA = "a".repeat(40);
export const TEST_RUNTIME_SHA = "b".repeat(40);
export const TEST_SESSION_ID = "11111111-1111-4111-8111-111111111111";

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function validReceipt({
  backupId = TEST_BACKUP_ID,
  status = "COMPLETE",
  externalPublicationStatus = "VERIFIED",
  ciphertext = Buffer.from("synthetic ciphertext"),
  toolingGitSha = TEST_TOOLING_SHA,
  productionRuntimeSha = TEST_RUNTIME_SHA,
} = {}) {
  return validateExternalReceipt({
    schemaVersion: 1,
    backupId,
    createdAt: "2026-09-25T12:00:00.000Z",
    toolingGitSha,
    productionRuntimeSha,
    ciphertextFilename: `${backupId}.age`,
    ciphertextSize: ciphertext.length,
    ciphertextSha256: sha256(ciphertext),
    status,
    externalPublicationStatus,
  });
}

function authInventory() {
  return {
    schemaVersion: 1,
    tables: { users: { present: true, count: 1 }, identities: { present: true, count: 1 } },
    assertions: { uuidContinuityAvailable: true, encryptedPasswordCoverageAvailable: true },
    ephemeralState: { sessions: "excluded", refreshTokens: "excluded", otpFlowState: "excluded" },
  };
}

function configSnapshot() {
  return {
    schemaVersion: 1,
    supabaseRegion: "us-east-1",
    authSiteUrl: { classification: "ENCRYPTED_INTERNAL_ONLY", value: "https://production.example.test" },
    redirectAllowlist: ["https://production.example.test/auth/callback"],
    signupEnabled: false,
    anonymousEnabled: false,
    bucket: { id: "godel-files", public: false, fileSizeLimit: 1048576, allowedMimeTypes: ["application/pdf"] },
    requiredExtensions: ["pgcrypto"],
    realtime: { required: false, publications: [] },
    vercelEnvironmentVariableNames: ["NEXT_PUBLIC_SUPABASE_URL"],
    productionRuntimeSha: TEST_RUNTIME_SHA,
    toolingGitSha: TEST_TOOLING_SHA,
  };
}

function emptyStorageInventory() {
  return { schemaVersion: 1, bucket: "godel-files", items: [], archivos: [], storageObjects: [], capturedObjects: [] };
}

function nonemptyStorageInventory(content) {
  const digest = sha256(content);
  return {
    schemaVersion: 1,
    bucket: "godel-files",
    items: [{ id: "item", status: "committed", archivoId: "file", objectPath: "orders/file.pdf", size: content.length }],
    archivos: [{ id: "file", bucket: "godel-files", filePath: "orders/file.pdf", size: content.length }],
    storageObjects: [{ bucket: "godel-files", name: "orders/file.pdf", size: content.length, sha256: digest }],
    capturedObjects: [{ path: "orders/file.pdf", size: content.length, sha256: digest }],
  };
}

export const VALID_MANAGED_DATA_SQL = [
  "-- PostgreSQL database dump",
  "SET statement_timeout = 0;",
  "SET client_encoding = 'UTF8';",
  "SELECT pg_catalog.set_config('search_path', '', false);",
  "COPY auth.users (id, encrypted_password) FROM stdin;",
  "11111111-1111-4111-8111-111111111111\thash-placeholder",
  "\\.",
  "COPY auth.identities (id, user_id) FROM stdin;",
  "identity-placeholder\t11111111-1111-4111-8111-111111111111",
  "\\.",
  "COPY public.perfiles (id) FROM stdin;",
  "11111111-1111-4111-8111-111111111111",
  "\\.",
  "",
].join("\n");

export async function createValidBundleFixture({ nonemptyStorage = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "godel-recovery-bundle-"));
  const storageBytes = Buffer.from("pdf!", "utf8");
  const storage = nonemptyStorage ? nonemptyStorageInventory(storageBytes) : emptyStorageInventory();
  const artifacts = new Map([
    ["database/roles.sql", "-- audit-only roles\n"],
    ["database/managed-schema.sql", "-- audit-only schema\n"],
    ["database/managed-data.sql", VALID_MANAGED_DATA_SQL],
    ["database/migration-history-schema.sql", "-- audit-only history schema\n"],
    ["database/migration-history-data.sql", "-- audit-only history data\n"],
    ["auth/inventory.json", `${JSON.stringify(authInventory(), null, 2)}\n`],
    ["storage/durable-inventory.json", `${JSON.stringify(storage, null, 2)}\n`],
    ["configuration/snapshot.json", `${JSON.stringify(configSnapshot(), null, 2)}\n`],
    ["operations/writer-freeze.json", `${JSON.stringify({
      schemaVersion: 1,
      startedAt: "2026-09-25T12:00:00.000Z",
      storageCapture: { startedAt: "2026-09-25T12:00:01.000Z", endedAt: "2026-09-25T12:00:04.000Z" },
      dbCapture: { startedAt: "2026-09-25T12:00:02.000Z", endedAt: "2026-09-25T12:00:03.000Z" },
      endedAt: "2026-09-25T12:00:05.000Z",
    }, null, 2)}\n`],
  ]);
  if (nonemptyStorage) artifacts.set("storage/orders/file.pdf", storageBytes);
  for (const [pathname, content] of artifacts) {
    const target = join(root, ...pathname.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const checksumEntries = await createChecksumInventory({ root, paths: [...artifacts.keys()] });
  const checksumPath = join(root, "inventory", "checksums.sha256");
  await mkdir(dirname(checksumPath), { recursive: true });
  await writeFile(checksumPath, serializeChecksums(checksumEntries));
  const checksumArtifact = await sha256File(checksumPath);
  const manifestArtifacts = [...checksumEntries, { path: "inventory/checksums.sha256", ...checksumArtifact }]
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  let manifest = createIncompleteManifest({
    backupId: TEST_BACKUP_ID,
    createdAt: new Date("2026-09-25T12:00:00.000Z"),
    toolingGitSha: TEST_TOOLING_SHA,
    toolingGitBranch: "ops/managed-free-production-pilot",
    productionRuntimeSha: TEST_RUNTIME_SHA,
    databaseCounts: { tables: [] },
    authCounts: { users: 1, identities: 1 },
    storageDurable: { objectCount: storage.capturedObjects.length, totalBytes: storage.capturedObjects.reduce((sum, item) => sum + item.size, 0) },
    toolVersions: [],
  });
  manifest = updateIncompleteManifest(manifest, {
    artifacts: manifestArtifacts,
    authCounts: { users: 1, identities: 1 },
    storageDurable: { objectCount: storage.capturedObjects.length, totalBytes: storage.capturedObjects.reduce((sum, item) => sum + item.size, 0) },
    gates: { artifactsExist: true, checksumsVerified: true, inventoryValid: true, crossValidationPassed: true, ciphertextVerified: false },
  });
  manifest = completeManifest(manifest, { ciphertextVerified: true });
  await writeManifestAtomic(manifest, { root });
  return { root, manifest, receipt: validReceipt(), storageBytes };
}

function octal(value, length) {
  const text = value.toString(8).padStart(length - 1, "0");
  return `${text}\0`;
}

function writeField(header, offset, length, value) {
  const data = Buffer.from(value, "utf8");
  data.copy(header, offset, 0, Math.min(data.length, length));
}

export function tarBuffer(entries) {
  const chunks = [];
  for (const entry of entries) {
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content ?? "", "utf8");
    const header = Buffer.alloc(512);
    writeField(header, 0, 100, entry.name);
    writeField(header, 100, 8, octal(entry.type === "5" ? 0o700 : 0o600, 8));
    writeField(header, 108, 8, octal(0, 8));
    writeField(header, 116, 8, octal(0, 8));
    writeField(header, 124, 12, octal(entry.type === "5" ? 0 : content.length, 12));
    writeField(header, 136, 12, octal(0, 12));
    header.fill(32, 148, 156);
    header[156] = (entry.type ?? "0").charCodeAt(0);
    if (entry.linkName) writeField(header, 157, 100, entry.linkName);
    writeField(header, 257, 6, "ustar\0");
    writeField(header, 263, 2, "00");
    const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
    writeField(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
    chunks.push(header);
    if (entry.type !== "5") {
      chunks.push(content);
      const padding = (512 - content.length % 512) % 512;
      if (padding) chunks.push(Buffer.alloc(padding));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

export async function tarFromDirectoryFiles(files) {
  const entries = [{ name: "./", type: "5" }];
  const directories = new Set();
  for (const pathname of [...files.keys()].sort((left, right) => left.localeCompare(right, "en"))) {
    const parts = pathname.split("/");
    for (let index = 1; index < parts.length; index += 1) directories.add(parts.slice(0, index).join("/"));
  }
  for (const pathname of [...directories].sort((left, right) => left.localeCompare(right, "en"))) entries.push({ name: `./${pathname}/`, type: "5" });
  for (const [pathname, content] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    entries.push({ name: `./${pathname}`, type: "0", content });
  }
  return tarBuffer(entries);
}
