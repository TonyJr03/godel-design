import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { discoverManagedBackupTools, toManifestToolVersions } from "./tooling.mjs";

test("tool discovery is read-only, finds the project CLI, and never starts Docker", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "godel-tooling-"));
  await mkdir(join(repoRoot, "node_modules", "supabase"), { recursive: true });
  await mkdir(join(repoRoot, "node_modules", ".bin"), { recursive: true });
  await writeFile(join(repoRoot, "node_modules", "supabase", "package.json"), JSON.stringify({ version: "2.109.1" }));
  await writeFile(join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase"), "placeholder");
  const calls = [];
  const runner = async (options) => {
    calls.push(options);
    if (options.executable === "docker" && options.args[0] === "version") throw Object.assign(new Error("engine unavailable"), { code: "COMMAND_FAILED" });
    if (["pg_dump", "psql", "age", "rclone", "aws"].includes(options.executable)) throw Object.assign(new Error("missing"), { code: "EXECUTABLE_UNAVAILABLE" });
    return { stdout: "1.2.3\n", stderr: "", exitCode: 0 };
  };
  const result = await discoverManagedBackupTools({ repoRoot, runner });
  assert.equal(result.find((tool) => tool.name === "supabase").version, "2.109.1");
  assert.match(result.find((tool) => tool.name === "docker").version, /engine unavailable/);
  assert.equal(result.find((tool) => tool.name === "age").present, false);
  assert.ok(result.every((tool) => Object.keys(tool).sort().join(",") === "name,present,version"));
  assert.ok(calls.filter((call) => call.executable === "docker").every((call) => !call.args.includes("start")));
  const manifestTools = toManifestToolVersions(result);
  assert.deepEqual(manifestTools.map((tool) => tool.name), [...manifestTools.map((tool) => tool.name)].sort((a, b) => a.localeCompare(b, "en")));
  assert.ok(manifestTools.every((tool) => !Object.hasOwn(tool, "detail")));
});
