import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MANAGED_R2_ENV_KEYS,
  parseManagedR2LocalEnvironment,
  resolveManagedR2RecoveryEnvironment,
} from "./managed-r2-local-env.mjs";

const values = Object.freeze({
  GODEL_BACKUP_R2_BUCKET: "synthetic-bucket",
  GODEL_BACKUP_R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  GODEL_BACKUP_R2_ACCESS_KEY_ID: "synthetic-access",
  GODEL_BACKUP_R2_SECRET_ACCESS_KEY: "synthetic-secret",
});

function serialize(overrides = values) {
  return `${MANAGED_R2_ENV_KEYS.map((key) => `${key}=${overrides[key]}`).join("\n")}\n`;
}

test("strict local R2 parser accepts exact keys, comments, blanks, and simple quotes", () => {
  assert.deepEqual(parseManagedR2LocalEnvironment(serialize()), values);
  const quoted = [
    "# managed R2 local environment",
    "",
    "GODEL_BACKUP_R2_BUCKET='synthetic-bucket'",
    "GODEL_BACKUP_R2_ENDPOINT=\"https://example.r2.cloudflarestorage.com\"",
    "GODEL_BACKUP_R2_ACCESS_KEY_ID='synthetic-access'",
    "GODEL_BACKUP_R2_SECRET_ACCESS_KEY=\"synthetic-secret\"",
    "",
  ].join("\n");
  assert.deepEqual(parseManagedR2LocalEnvironment(quoted), values);
});

test("strict local R2 parser rejects missing, duplicate, unknown, empty, expansion, and command substitution", () => {
  const invalid = [
    MANAGED_R2_ENV_KEYS.slice(0, 3).map((key) => `${key}=${values[key]}`).join("\n"),
    `${serialize()}GODEL_BACKUP_R2_BUCKET=duplicate\n`,
    `${serialize()}UNKNOWN_KEY=value\n`,
    serialize({ ...values, GODEL_BACKUP_R2_BUCKET: "" }),
    serialize({ ...values, GODEL_BACKUP_R2_SECRET_ACCESS_KEY: "${SECRET}" }),
    serialize({ ...values, GODEL_BACKUP_R2_SECRET_ACCESS_KEY: "$(secret)" }),
  ];
  for (const source of invalid) assert.throws(() => parseManagedR2LocalEnvironment(source), { code: "RECOVERY_R2_LOCAL_ENV_INVALID" });
});

test("R2 environment precedence uses all process values without reading a file and rejects partial values", async () => {
  const root = join(tmpdir(), "godel-r2-env-does-not-exist");
  const processResult = await resolveManagedR2RecoveryEnvironment({ repoRoot: root, environment: { PATH: "tools", ...values } });
  assert.equal(processResult.source, "PROCESS_ENV");
  assert.equal(processResult.environment.GODEL_BACKUP_R2_SECRET_ACCESS_KEY, values.GODEL_BACKUP_R2_SECRET_ACCESS_KEY);
  await assert.rejects(
    resolveManagedR2RecoveryEnvironment({ repoRoot: root, environment: { GODEL_BACKUP_R2_BUCKET: values.GODEL_BACKUP_R2_BUCKET } }),
    { code: "RECOVERY_R2_LOCAL_ENV_CONFLICT" },
  );
});

test("R2 environment precedence loads an exact safe local file when process values are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-r2-env-"));
  try {
    await writeFile(join(root, ".env.managed.r2.local"), serialize());
    const result = await resolveManagedR2RecoveryEnvironment({ repoRoot: root, environment: { PATH: "tools" } });
    assert.equal(result.source, "LOCAL_FILE");
    assert.equal(result.environment.PATH, "tools");
    for (const key of MANAGED_R2_ENV_KEYS) assert.equal(result.environment[key], values[key]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("R2 local file rejects missing, symlinked, oversized, NUL, and invalid UTF-8 content without leaking values", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "godel-r2-env-invalid-"));
  const pathname = join(root, ".env.managed.r2.local");
  const secret = "never-print-this-secret";
  try {
    await assert.rejects(resolveManagedR2RecoveryEnvironment({ repoRoot: root, environment: {} }), { code: "RECOVERY_R2_LOCAL_ENV_FILE_MISSING" });
    for (const content of [Buffer.alloc(16 * 1024 + 1, 65), Buffer.from(`${serialize()}\0`), Buffer.from([0xff, 0xfe, 0xfd])]) {
      await writeFile(pathname, content);
      await assert.rejects(resolveManagedR2RecoveryEnvironment({ repoRoot: root, environment: {} }), (error) => {
        assert.equal(error.code, "RECOVERY_R2_LOCAL_ENV_INVALID");
        assert.ok(!error.message.includes(secret));
        assert.ok(!error.message.includes(pathname));
        return true;
      });
    }
    await rm(pathname);
    const external = join(root, "external.env");
    await writeFile(external, serialize({ ...values, GODEL_BACKUP_R2_SECRET_ACCESS_KEY: secret }));
    try { await symlink(external, pathname, "file"); } catch (error) { t.diagnostic(`symlink unavailable: ${error.code}`); return; }
    await assert.rejects(resolveManagedR2RecoveryEnvironment({ repoRoot: root, environment: {} }), (error) => {
      assert.equal(error.code, "RECOVERY_R2_LOCAL_ENV_INVALID");
      assert.ok(!JSON.stringify(error).includes(secret));
      return true;
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});
