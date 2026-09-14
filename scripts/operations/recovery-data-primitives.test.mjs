import test from "node:test";
import assert from "node:assert/strict";
import { createRecoveryDataPrimitives, validateStorageXattrSidecar } from "./recovery-data-primitives.mjs";

function hardened(args) { for (const value of ["--rm", "--pull=never", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges"]) assert.ok(args.includes(value)); assert.deepEqual(args.slice(args.indexOf("--network"), args.indexOf("--network") + 2), ["--network", "none"]); assert.equal(args[0], "run"); }
test("recovery primitives construct hardened offline helpers", async () => {
  const calls = [], recovery = createRecoveryDataPrimitives({ runDocker: async (args, operation) => calls.push({ args, operation }) });
  await recovery.restoreArchive({ image: "postgres@sha256:x", archiveDirectory: "/backup/postgres", archiveName: "pgdata.tar", target: "/pg" });
  await recovery.assertRestoredPgdata({ image: "postgres@sha256:x", target: "/pg" });
  await recovery.restoreArchive({ image: "postgres@sha256:x", archiveDirectory: "/backup/storage", archiveName: "storage.tar", target: "/storage" });
  await recovery.assertRestoredStorage({ image: "postgres@sha256:x", target: "/storage" });
  await recovery.restoreProtectedKey({ image: "postgres@sha256:x", protectedDirectory: "/protected", volume: "db-config" });
  await recovery.replayStorageXattrs({ image: "supabase/storage-api:v1.60.4", source: "/backup/storage", target: "/storage" });
  await recovery.verifyStorageXattrs({ image: "supabase/storage-api:v1.60.4", source: "/backup/storage", target: "/storage" });
  assert.equal(calls.length, 7); calls.forEach(({ args }) => hardened(args));
  assert.ok(calls[0].args.at(-1).includes("pgdata.tar")); assert.ok(calls[1].args.at(-1).includes("PG_VERSION")); assert.ok(calls[4].args.at(-1).includes("pgsodium_root.key"));
  assert.equal(calls[5].args.at(-2), "replay"); assert.equal(calls[6].args.at(-2), "verify");
});
test("storage xattr sidecar accepts only canonical approved attributes", () => {
  assert.doesNotThrow(() => validateStorageXattrSidecar({ schemaVersion: 1, format: "supabase-file-xattrs", entries: [{ path: "object/file", attributes: { "user.supabase.etag": "YQ==" } }] }));
  assert.throws(() => validateStorageXattrSidecar({ schemaVersion: 1, format: "supabase-file-xattrs", entries: [{ path: "../escape", attributes: { "user.supabase.etag": "YQ==" } }] }));
});
