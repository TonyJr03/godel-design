import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createGitObjectReader } from "./git-object-authority.mjs";

const execFileAsync = promisify(execFile);

async function withRepository(run) {
  const root = await mkdtemp(join(os.tmpdir(), "godel-git-object-"));
  try {
    await execFileAsync("git", ["init"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["config", "user.email", "qa@godel.invalid"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["config", "user.name", "Godel QA"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["config", "core.autocrlf", "false"], { cwd: root, windowsHide: true });
    await writeFile(join(root, "bytes.bin"), Buffer.from("first\r\n\n"));
    await writeFile(join(root, "small.txt"), Buffer.from("\n\n"));
    await execFileAsync("git", ["add", "bytes.bin", "small.txt"], { cwd: root, windowsHide: true });
    await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root, windowsHide: true });
    const commit = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true })).stdout.trim();
    await run({ root, commit });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("Git blob reader preserves exact binary bytes and rejects unsafe object requests", async () => {
  await withRepository(async ({ root, commit }) => {
    const reader = createGitObjectReader({ root });
    assert.deepEqual(await reader.readBlob(commit, "bytes.bin"), Buffer.from("first\r\n\n"));
    assert.deepEqual(await reader.readBlob(commit, "small.txt"), Buffer.from("\n\n"));
    await assert.rejects(reader.readBlob(commit, "missing.txt"), /GIT_OBJECT_BLOB/);
    for (const path of ["", "/absolute", "../escape", "folder/../escape", "folder//empty", "folder\\escape", "C:\\escape", "nul\0path"]) await assert.rejects(reader.readBlob(commit, path), /GIT_OBJECT_PATH/);
    for (const invalidCommit of ["short", "A".repeat(40), "f".repeat(39)]) await assert.rejects(reader.readBlob(invalidCommit, "bytes.bin"), /GIT_OBJECT_COMMIT/);
  });
});
