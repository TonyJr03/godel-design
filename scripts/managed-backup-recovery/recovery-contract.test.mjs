import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  admitRecoveryIdentity,
  cleanupRecoverySession,
  createRecoverySession,
  sanitizeRecoveryFailure,
  useRecoveryIdentityPath,
} from "./recovery-contract.mjs";
import { TEST_SESSION_ID } from "./test-helpers.mjs";

async function boundaries() {
  const base = await mkdtemp(join(tmpdir(), "godel-recovery-contract-"));
  const repoRoot = join(base, "repo");
  const backupOutputRoot = join(base, "backup-output");
  const recoveryParent = join(base, "recovery");
  const custody = join(base, "custody");
  await Promise.all([mkdir(repoRoot), mkdir(backupOutputRoot), mkdir(custody)]);
  return { base, repoRoot, backupOutputRoot, recoveryParent, custody };
}

test("recovery session creates the exact private one-use layout outside governed roots", async () => {
  const value = await boundaries();
  const session = await createRecoverySession({ ...value, parent: value.recoveryParent, sessionId: TEST_SESSION_ID });
  assert.deepEqual(JSON.parse(JSON.stringify(session)), { sessionId: TEST_SESSION_ID, layout: ["download", "plaintext", "target", "evidence"] });
  for (const pathname of [session.root, session.download, session.plaintext, session.target, session.evidence]) assert.ok(pathname.startsWith(value.recoveryParent));
  await assert.rejects(
    createRecoverySession({ ...value, parent: value.recoveryParent, sessionId: TEST_SESSION_ID }),
    (error) => error.code === "RECOVERY_SESSION_EXISTS",
  );
  await cleanupRecoverySession(session);
});

test("recovery session rejects relative, repository, and backup-output parents", async () => {
  const value = await boundaries();
  await assert.rejects(createRecoverySession({ ...value, parent: "relative", sessionId: TEST_SESSION_ID }), (error) => error.code === "RECOVERY_PARENT_INVALID");
  await assert.rejects(createRecoverySession({ ...value, parent: join(value.repoRoot, "recovery"), sessionId: TEST_SESSION_ID }), (error) => error.code === "RECOVERY_PARENT_UNSAFE");
  await assert.rejects(createRecoverySession({ ...value, parent: join(value.backupOutputRoot, "recovery"), sessionId: TEST_SESSION_ID }), (error) => error.code === "RECOVERY_PARENT_UNSAFE");
});

test("recovery parent symlink or reparse point is rejected when supported", async (t) => {
  const value = await boundaries();
  const actual = join(value.base, "actual-parent");
  const linked = join(value.base, "linked-parent");
  await mkdir(actual);
  try {
    await symlink(actual, linked, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) return t.skip("symlinks unavailable on this platform");
    throw error;
  }
  await assert.rejects(createRecoverySession({ ...value, parent: linked, sessionId: TEST_SESSION_ID }), (error) => error.code === "RECOVERY_PARENT_UNSAFE");
});

test("identity admission accepts only a nonempty external regular file and never serializes its path", async () => {
  const value = await boundaries();
  const session = await createRecoverySession({ ...value, parent: value.recoveryParent, sessionId: TEST_SESSION_ID });
  const identityPath = join(value.custody, "identity.txt");
  await writeFile(identityPath, "synthetic-private-material");
  const handle = await admitRecoveryIdentity({ environment: { GODEL_MANAGED_RECOVERY_IDENTITY_FILE: identityPath }, ...value, session });
  assert.equal(handle.admitted, true);
  assert.ok(!JSON.stringify(handle).includes(identityPath));
  assert.equal(useRecoveryIdentityPath(handle, (pathname, redactions) => pathname === identityPath && redactions.includes(identityPath)), true);
  await cleanupRecoverySession(session);
});

test("identity admission rejects relative, missing, empty, and governed locations with sanitized failures", async () => {
  const value = await boundaries();
  const session = await createRecoverySession({ ...value, parent: value.recoveryParent, sessionId: TEST_SESSION_ID });
  const cases = [
    ["relative.txt", "RECOVERY_IDENTITY_PATH_INVALID"],
    [join(value.custody, "missing.txt"), "RECOVERY_IDENTITY_FILE_INVALID"],
    [join(value.custody, "empty.txt"), "RECOVERY_IDENTITY_FILE_INVALID"],
    [join(value.repoRoot, "identity.txt"), "RECOVERY_IDENTITY_LOCATION_FORBIDDEN"],
    [join(value.backupOutputRoot, "identity.txt"), "RECOVERY_IDENTITY_LOCATION_FORBIDDEN"],
    [join(session.evidence, "identity.txt"), "RECOVERY_IDENTITY_LOCATION_FORBIDDEN"],
  ];
  await writeFile(cases[2][0], "");
  for (const [pathname] of cases.slice(3)) await writeFile(pathname, "synthetic");
  for (const [pathname, code] of cases) {
    await assert.rejects(
      admitRecoveryIdentity({ environment: { GODEL_MANAGED_RECOVERY_IDENTITY_FILE: pathname }, ...value, session }),
      (error) => {
        assert.equal(error.code, code);
        assert.ok(!error.message.includes(pathname));
        assert.ok(!JSON.stringify(sanitizeRecoveryFailure(error)).includes(pathname));
        return true;
      },
    );
  }
  await cleanupRecoverySession(session);
});

test("identity symlink is rejected when supported", async (t) => {
  const value = await boundaries();
  const session = await createRecoverySession({ ...value, parent: value.recoveryParent, sessionId: TEST_SESSION_ID });
  const actual = join(value.custody, "actual.txt");
  const linked = join(value.custody, "linked.txt");
  await writeFile(actual, "synthetic");
  try {
    await symlink(actual, linked, "file");
  } catch (error) {
    await cleanupRecoverySession(session);
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) return t.skip("symlinks unavailable on this platform");
    throw error;
  }
  await assert.rejects(
    admitRecoveryIdentity({ environment: { GODEL_MANAGED_RECOVERY_IDENTITY_FILE: linked }, ...value, session }),
    (error) => error.code === "RECOVERY_IDENTITY_FILE_INVALID",
  );
  await cleanupRecoverySession(session);
});

test("cleanup is exact and injected removal failure is visible", async () => {
  const value = await boundaries();
  const session = await createRecoverySession({ ...value, parent: value.recoveryParent, sessionId: TEST_SESSION_ID });
  await writeFile(join(session.download, "temporary.bin"), "temporary");
  await assert.rejects(
    cleanupRecoverySession(session, { remove: async () => { throw new Error("synthetic failure"); } }),
    (error) => error.code === "RECOVERY_CLEANUP_INCOMPLETE",
  );
  assert.deepEqual(await cleanupRecoverySession(session), { status: "PASS", removed: true });
});
