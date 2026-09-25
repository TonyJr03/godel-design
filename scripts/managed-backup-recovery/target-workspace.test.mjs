import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadProductionRuntimeAuthority, MANAGED_BASELINE_MIGRATIONS } from "./runtime-authority.mjs";
import { allocateTargetPorts, assertRecoveryProjectId, materializeRecoveryTarget, renderLocalTargetConfig, validateTargetPorts } from "./target-workspace.mjs";

const PROJECT = "godel-m53-restore-abcdef123456";
const PORTS = Object.freeze({ api: 61001, db: 61002, shadow: 61003, studio: 61004, smtp: 61005, analytics: 61006, pooler: 61007, inspector: 61008 });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "godel-m53-target-"));
  const target = join(root, "target");
  await mkdir(target);
  const config = await readFile(new URL("../../supabase/config.toml", import.meta.url), "utf8");
  const execute = async (plan) => {
    if (plan.args[0] === "ls-tree") return { stdout: `${MANAGED_BASELINE_MIGRATIONS.join("\0")}\0` };
    if (plan.args[0] === "show" && plan.args[1].endsWith("config.toml")) return { stdout: config };
    if (plan.args[0] === "show") return { stdout: `-- ${plan.args[1]}\n` };
    return { stdout: "" };
  };
  const authority = await loadProductionRuntimeAuthority({ runtimeSha: "d".repeat(40), repoRoot: process.cwd(), execute, environment: {} });
  return { root, session: { root, target }, authority, config };
}

test("port allocator produces eight unique admitted ports", async () => {
  let port = 62000;
  assert.deepEqual(await allocateTargetPorts({ probe: async () => ++port }), { api: 62001, db: 62002, shadow: 62003, studio: 62004, smtp: 62005, analytics: 62006, pooler: 62007, inspector: 62008 });
});

test("port validation rejects duplicate, invalid, and unavailable ports", async () => {
  assert.throws(() => validateTargetPorts({ ...PORTS, db: PORTS.api }), { code: "RECOVERY_TARGET_PORTS_INVALID" });
  assert.throws(() => validateTargetPorts({ ...PORTS, db: 80 }), { code: "RECOVERY_TARGET_PORTS_INVALID" });
  await assert.rejects(allocateTargetPorts({ probe: async (name) => name === "db" ? null : 62001 }), { code: "RECOVERY_TARGET_PORT_UNAVAILABLE" });
});

test("target workspace is contained, exact, private-by-contract and materializes runtime files with wx", async () => {
  const item = await fixture();
  try {
    const target = await materializeRecoveryTarget({ session: item.session, runtimeAuthority: item.authority, projectId: PROJECT, ports: PORTS });
    const config = await readFile(join(target.supabaseDir, "config.toml"), "utf8");
    assert.match(config, /project_id = "godel-m53-restore-abcdef123456"/);
    assert.match(config, /site_url = "http:\/\/127\.0\.0\.1:61001"/);
    assert.match(config, /\[db.seed\][\s\S]*?enabled = false/);
    assert.doesNotMatch(config, /\.temp[\\/]project-ref/);
    await assert.rejects(materializeRecoveryTarget({ session: item.session, runtimeAuthority: item.authority, projectId: PROJECT, ports: PORTS }), { code: "RECOVERY_TARGET_NOT_EMPTY" });
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("target config rejects remote URLs and arbitrary project IDs", async () => {
  const item = await fixture();
  try {
    assert.throws(() => assertRecoveryProjectId("production-ref"), { code: "RECOVERY_TARGET_PROJECT_ID_INVALID" });
    assert.throws(() => renderLocalTargetConfig(`${item.config}\nexternal_url = \"https://production.invalid\"\n`, { projectId: PROJECT, ports: PORTS }), { code: "RECOVERY_TARGET_CONFIG_REMOTE_URL" });
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("target workspace rejects a nonempty root", async () => {
  const item = await fixture();
  try {
    await writeFile(join(item.session.target, "foreign"), "x");
    await assert.rejects(materializeRecoveryTarget({ session: item.session, runtimeAuthority: item.authority, projectId: PROJECT, ports: PORTS }), { code: "RECOVERY_TARGET_NOT_EMPTY" });
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("target workspace rejects a symlink root when platform permits it", async (context) => {
  const item = await fixture();
  const real = join(item.root, "real");
  const linked = join(item.root, "linked");
  try {
    await mkdir(real);
    try { await symlink(real, linked, "junction"); } catch { context.skip("symlink creation unavailable"); return; }
    await assert.rejects(materializeRecoveryTarget({ session: { root: item.root, target: linked }, runtimeAuthority: item.authority, projectId: PROJECT, ports: PORTS }), { code: "RECOVERY_TARGET_ROOT_UNSAFE" });
  } finally { await rm(item.root, { recursive: true, force: true }); }
});
