import { lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { listArtifactTree, sha256File } from "./checksums.mjs";
import { runCommand } from "./command-runner.mjs";
import { validateAuthInventory, validateStorageDurableInventory } from "./inventory.mjs";
import { validateRelativeArtifactPath } from "./safety.mjs";

const COPY_HEADER = /^COPY (?:(?:"([a-z][a-z0-9_]*)")|([a-z][a-z0-9_]*))\.(?:(?:"([a-z][a-z0-9_]*)")|([a-z][a-z0-9_]*)) \(([^)]+)\) FROM stdin;$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_PRIVATE_DURABLE_TABLES = Object.freeze([
  "private.internal_user_creation_audit",
  "private.internal_user_password_reset_audit",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedProductionCaptureError";
  error.code = code;
  throw error;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeStringRecord(value, label) {
  if (!plain(value)) fail("STORAGE_LISTING_INVALID", `${label} must be a plain string map`);
  const normalized = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right, "en"))) {
    const item = value[key];
    if (typeof key !== "string" || key.length === 0 || key.length > 256 || /[\0-\x1f]/.test(key) || typeof item !== "string" || item.length > 4096 || /[\0-\x1f]/.test(item)) {
      fail("STORAGE_LISTING_INVALID", `${label} contains an incompatible entry`);
    }
    normalized[key] = item;
  }
  return Object.freeze(normalized);
}

export function normalizeProductionStorageListing(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    fail("STORAGE_LISTING_INVALID", "Production Storage listing is not valid JSON");
  }
  if (!Array.isArray(parsed)) fail("STORAGE_LISTING_INVALID", "Production Storage listing must be a JSON array");
  const paths = new Set();
  const normalized = parsed.map((entry) => {
    if (!plain(entry) || entry.IsDir !== false || typeof entry.Path !== "string" || !Number.isSafeInteger(entry.Size) || entry.Size < 0) {
      fail("STORAGE_LISTING_INVALID", "Production Storage listing contains an incompatible file entry");
    }
    try {
      validateRelativeArtifactPath(entry.Path);
    } catch {
      fail("STORAGE_LISTING_INVALID", "Production Storage listing contains an unsafe path");
    }
    if (paths.has(entry.Path)) fail("STORAGE_LISTING_INVALID", "Production Storage listing contains duplicate paths");
    paths.add(entry.Path);
    const item = { path: entry.Path, size: entry.Size };
    if (Object.hasOwn(entry, "ModTime")) {
      if (typeof entry.ModTime !== "string" || entry.ModTime.length === 0 || entry.ModTime.length > 100 || /[\0-\x1f]/.test(entry.ModTime)) {
        fail("STORAGE_LISTING_INVALID", "Production Storage listing contains an invalid modification time");
      }
      item.modTime = entry.ModTime;
    }
    if (Object.hasOwn(entry, "Hashes")) item.hashes = normalizeStringRecord(entry.Hashes, "Storage hashes");
    if (Object.hasOwn(entry, "Metadata")) item.metadata = normalizeStringRecord(entry.Metadata, "Storage metadata");
    return Object.freeze(item);
  });
  normalized.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return Object.freeze(normalized);
}

function capturedPathSizeProjection(capturedObjects) {
  if (!Array.isArray(capturedObjects)) fail("STORAGE_CAPTURE_WINDOW_CHANGED", "Captured Storage byte inventory is unavailable");
  const paths = new Set();
  const projection = capturedObjects.map((object) => {
    if (!plain(object) || typeof object.path !== "string" || !Number.isSafeInteger(object.size) || object.size < 0) {
      fail("STORAGE_CAPTURE_WINDOW_CHANGED", "Captured Storage byte inventory is incompatible");
    }
    try {
      validateRelativeArtifactPath(object.path);
    } catch {
      fail("STORAGE_CAPTURE_WINDOW_CHANGED", "Captured Storage byte inventory contains an unsafe path");
    }
    if (paths.has(object.path)) fail("STORAGE_CAPTURE_WINDOW_CHANGED", "Captured Storage byte inventory contains duplicate paths");
    paths.add(object.path);
    return Object.freeze({ path: object.path, size: object.size });
  });
  projection.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return Object.freeze(projection);
}

export function assertProductionStorageCaptureConsistency({ initialListing, finalListing, capturedObjects } = {}) {
  const initialInventory = normalizeProductionStorageListing(initialListing);
  const finalInventory = normalizeProductionStorageListing(finalListing);
  if (!isDeepStrictEqual(initialInventory, finalInventory)) {
    fail("STORAGE_CAPTURE_WINDOW_CHANGED", "Production Storage inventory changed during the capture window");
  }
  const remoteProjection = Object.freeze(finalInventory.map((object) => Object.freeze({ path: object.path, size: object.size })));
  const localProjection = capturedPathSizeProjection(capturedObjects);
  if (!isDeepStrictEqual(remoteProjection, localProjection)) {
    fail("STORAGE_CAPTURE_WINDOW_CHANGED", "Captured Storage paths or sizes differ from the final remote inventory");
  }
  return Object.freeze({ initialInventory, finalInventory, capturedProjection: localProjection });
}

function parseColumns(source) {
  const columns = source.split(", ").map((value) => value.replace(/^"|"$/g, ""));
  if (columns.length === 0 || columns.some((value) => !/^[a-z][a-z0-9_]*$/.test(value)) || new Set(columns).size !== columns.length) {
    fail("COPY_DUMP_UNSUPPORTED", "COPY column list is unsupported");
  }
  return columns;
}

function decodeCopyField(source) {
  if (source === "\\N") return null;
  let result = "";
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\\") {
      result += source[index];
      continue;
    }
    index += 1;
    if (index >= source.length) fail("COPY_DUMP_UNSUPPORTED", "COPY row has a trailing escape");
    const code = source[index];
    const named = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\" };
    if (Object.hasOwn(named, code)) {
      result += named[code];
      continue;
    }
    if (/[0-7]/.test(code)) {
      let digits = code;
      while (digits.length < 3 && index + 1 < source.length && /[0-7]/.test(source[index + 1])) digits += source[++index];
      result += String.fromCharCode(Number.parseInt(digits, 8));
      continue;
    }
    if (code === "x") {
      let digits = "";
      while (digits.length < 2 && index + 1 < source.length && /[0-9a-f]/i.test(source[index + 1])) digits += source[++index];
      if (digits.length === 0) fail("COPY_DUMP_UNSUPPORTED", "COPY row has an invalid hexadecimal escape");
      result += String.fromCharCode(Number.parseInt(digits, 16));
      continue;
    }
    fail("COPY_DUMP_UNSUPPORTED", "COPY row contains an unsupported escape");
  }
  return result;
}

function parseCopyRow(line, columns) {
  const values = line.split("\t").map(decodeCopyField);
  if (values.length !== columns.length) fail("COPY_DUMP_INVALID", "COPY row column count does not match its header");
  return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
}

export function parsePostgresCopyDump(source) {
  if (typeof source !== "string") fail("COPY_DUMP_INVALID", "Plain SQL COPY dump text is required");
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const tables = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("COPY ")) continue;
    const match = lines[index].match(COPY_HEADER);
    if (!match) fail("COPY_DUMP_UNSUPPORTED", "COPY header is unsupported; capture is not approved");
    const schema = match[1] ?? match[2];
    const table = match[3] ?? match[4];
    const identity = `${schema}.${table}`;
    if (tables.has(identity)) fail("COPY_DUMP_INVALID", "COPY table appears more than once");
    const columns = parseColumns(match[5]);
    const rows = [];
    let terminated = false;
    for (index += 1; index < lines.length; index += 1) {
      if (lines[index] === "\\.") {
        terminated = true;
        break;
      }
      rows.push(parseCopyRow(lines[index], columns));
    }
    if (!terminated) fail("COPY_DUMP_INVALID", "COPY table is not terminated");
    tables.set(identity, Object.freeze({ schema, table, columns: Object.freeze(columns), rows: Object.freeze(rows) }));
  }
  if (tables.size === 0) fail("COPY_DUMP_INVALID", "No COPY tables were found");
  return tables;
}

function requiredTable(tables, identity, requiredColumns = []) {
  const table = tables.get(identity);
  if (!table) fail("CAPTURE_TABLE_MISSING", `${identity} is required in the logical data capture`);
  for (const column of requiredColumns) {
    if (!table.columns.includes(column)) fail("CAPTURE_COLUMN_MISSING", `${identity} is missing a required capture column`);
  }
  return table;
}

function integer(value, label) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) fail("CAPTURE_VALUE_INVALID", `${label} is not a nonnegative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail("CAPTURE_VALUE_INVALID", `${label} exceeds the safe range`);
  return parsed;
}

function storageMetadataSize(metadata) {
  let parsed;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    fail("STORAGE_METADATA_INVALID", "storage.objects metadata is not valid JSON");
  }
  const value = parsed?.size;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  return integer(value, "storage.objects metadata size");
}

export function createDatabaseAndDurableInventories({ dumpText, capturedObjects, bucket = "godel-files" } = {}) {
  if (!Array.isArray(capturedObjects)) fail("CAPTURE_BYTES_INVALID", "Captured S3 byte inventory is required");
  const tables = parsePostgresCopyDump(dumpText);
  const users = requiredTable(tables, "auth.users", ["id", "encrypted_password"]);
  const identities = requiredTable(tables, "auth.identities", ["user_id"]);
  const profiles = requiredTable(tables, "public.perfiles", ["id"]);
  requiredTable(tables, "storage.buckets", ["id"]);
  const objects = requiredTable(tables, "storage.objects", ["bucket_id", "name", "metadata"]);
  const items = requiredTable(tables, "public.archivo_carga_items", ["id", "status", "archivo_id", "object_path", "expected_size"]);
  const archivos = requiredTable(tables, "public.archivos", ["id", "bucket", "file_path", "file_size"]);
  for (const identity of REQUIRED_PRIVATE_DURABLE_TABLES) requiredTable(tables, identity, ["id"]);
  const userIds = new Set(users.rows.map((row) => row.id));
  const usersById = new Map(users.rows.map((row) => [row.id, row]));
  const identityUserIds = new Set(identities.rows.map((row) => row.user_id));
  const internalPasswordContinuity = profiles.rows.every((profile) => {
    const user = usersById.get(profile.id);
    return UUID_PATTERN.test(profile.id ?? "")
      && typeof user?.encrypted_password === "string"
      && user.encrypted_password.trim().length > 0
      && identityUserIds.has(profile.id);
  });
  if (!internalPasswordContinuity) {
    fail("AUTH_PASSWORD_CONTINUITY_FAILED", "Internal Auth password continuity is not provable from the capture");
  }
  if ([...userIds].some((id) => !UUID_PATTERN.test(id ?? "")) || identities.rows.some((row) => !userIds.has(row.user_id))) {
    fail("AUTH_UUID_CONTINUITY_FAILED", "Auth UUID continuity is not provable from the capture");
  }
  const authInventory = {
    schemaVersion: 1,
    tables: {
      users: { present: true, count: users.rows.length },
      identities: { present: true, count: identities.rows.length },
    },
    assertions: { uuidContinuityAvailable: true, encryptedPasswordCoverageAvailable: internalPasswordContinuity },
    ephemeralState: { sessions: "excluded", refreshTokens: "excluded", otpFlowState: "excluded" },
  };
  validateAuthInventory(authInventory);

  const storageInventory = {
    schemaVersion: 1,
    bucket,
    items: items.rows.map((row) => ({
      id: row.id,
      status: row.status,
      archivoId: row.archivo_id,
      objectPath: row.object_path,
      size: integer(row.expected_size, "archivo_carga_items.expected_size"),
    })),
    archivos: archivos.rows.map((row) => ({
      id: row.id,
      bucket: row.bucket,
      filePath: row.file_path,
      size: integer(row.file_size, "archivos.file_size"),
    })),
    storageObjects: objects.rows
      .filter((row) => row.bucket_id === bucket)
      .map((row) => ({ bucket: row.bucket_id, name: row.name, size: storageMetadataSize(row.metadata), sha256: null })),
    capturedObjects,
  };
  const durable = validateStorageDurableInventory(storageInventory);
  const databaseCounts = {
    tables: [...tables.values()]
      .map((table) => ({ schema: table.schema, name: table.table, rowCount: table.rows.length }))
      .sort((left, right) => `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`, "en")),
  };
  return { databaseCounts, authInventory, storageInventory, durable };
}

async function walkCapturedFiles(root, current, output) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const pathname = resolve(current, entry.name);
    const state = await lstat(pathname);
    if (state.isSymbolicLink()) fail("CAPTURE_PATH_UNSAFE", "Captured S3 tree contains a symbolic link or reparse point");
    if (state.isDirectory()) {
      await walkCapturedFiles(root, pathname, output);
      continue;
    }
    if (!state.isFile()) fail("CAPTURE_PATH_UNSAFE", "Captured S3 tree contains a non-file entry");
    const path = relative(root, pathname).split(sep).join("/");
    validateRelativeArtifactPath(path);
    const digest = await sha256File(pathname);
    output.push({ path, size: digest.size, sha256: digest.sha256 });
  }
}

export async function inventoryCapturedS3Bytes(root) {
  const resolved = resolve(root);
  const state = await lstat(resolved).catch(() => null);
  if (!state?.isDirectory() || state.isSymbolicLink()) fail("CAPTURE_PATH_UNSAFE", "Captured S3 root must be a real directory");
  const output = [];
  await walkCapturedFiles(resolved, resolved, output);
  return output.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

export async function createProductionCaptureInventory({ dumpPaths, storageCaptureRoot } = {}) {
  if (!Array.isArray(dumpPaths) || dumpPaths.length === 0 || dumpPaths.some((value) => typeof value !== "string") || typeof storageCaptureRoot !== "string") {
    fail("CAPTURE_INPUT_INVALID", "Data dump and Storage capture paths are required");
  }
  const [dumpParts, capturedObjects] = await Promise.all([
    Promise.all(dumpPaths.map((pathname) => readFile(pathname, "utf8"))),
    inventoryCapturedS3Bytes(storageCaptureRoot),
  ]);
  return createDatabaseAndDurableInventories({ dumpText: dumpParts.join("\n"), capturedObjects });
}

export function createProductionReadOnlyCaptureAdapter({
  execute = runCommand,
  configurationSnapshotProvider,
  toolVersionsProvider,
  now = () => new Date(),
} = {}) {
  if (typeof execute !== "function" || typeof configurationSnapshotProvider !== "function" || typeof toolVersionsProvider !== "function") {
    fail("CAPTURE_ADAPTER_INVALID", "Production capture adapter dependencies are required");
  }
  return Object.freeze({
    async captureReadOnly({ captureRoot, databasePlans, databaseEnvironment, s3Plans, s3Environment, storageCaptureRoot }) {
      if (!Array.isArray(databasePlans) || databasePlans.some((plan) => plan.target !== "linked" || plan.executionReady !== true)) {
        fail("CAPTURE_PLAN_INVALID", "Production database capture requires linked read-only dump plans");
      }
      if (!Array.isArray(s3Plans) || s3Plans.map((plan) => plan.operation).join(",") !== "list-source,download-copy,verify-listing") {
        fail("CAPTURE_PLAN_INVALID", "Production Storage capture plan is not the approved read-only sequence");
      }
      await mkdir(resolve(captureRoot, "database"), { recursive: false, mode: 0o700 });
      const [initialPlan, downloadPlan, finalPlan] = s3Plans;
      const invokeStorage = (plan) => execute({
        operation: plan.operation,
        executable: plan.executable,
        args: plan.args,
        cwd: captureRoot,
        allowedEnvironment: s3Environment.allowedEnvironment,
        secretValues: s3Environment.secretValues,
      });
      const storageStartedAt = now().toISOString();
      const initialListing = (await invokeStorage(initialPlan)).stdout;
      const dbStartedAt = now().toISOString();
      for (const plan of databasePlans) {
        await execute({
          operation: plan.operation,
          executable: plan.executable,
          args: plan.args,
          cwd: captureRoot,
          allowedEnvironment: databaseEnvironment.allowedEnvironment,
          secretValues: [databaseEnvironment.allowedEnvironment.SUPABASE_DB_PASSWORD],
        });
      }
      const dbEndedAt = now().toISOString();
      await invokeStorage(downloadPlan);
      const finalListing = (await invokeStorage(finalPlan)).stdout;
      const storageEndedAt = now().toISOString();
      const inventories = await createProductionCaptureInventory({
        dumpPaths: [
          resolve(captureRoot, "database", "managed-data.sql"),
          resolve(captureRoot, "database", "migration-history-data.sql"),
        ],
        storageCaptureRoot,
      });
      assertProductionStorageCaptureConsistency({
        initialListing,
        finalListing,
        capturedObjects: inventories.storageInventory.capturedObjects,
      });
      const artifactPaths = await listArtifactTree(captureRoot);
      const artifacts = [];
      for (const path of artifactPaths) {
        artifacts.push({ path, content: await readFile(resolve(captureRoot, ...path.split("/"))) });
      }
      return {
        ...inventories,
        configurationSnapshot: await configurationSnapshotProvider(),
        toolVersions: await toolVersionsProvider(),
        artifacts,
        freeze: { dbStartedAt, dbEndedAt, storageStartedAt, storageEndedAt },
      };
    },
  });
}
