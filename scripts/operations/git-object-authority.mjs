import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMIT = /^[a-f0-9]{40}$/;

function fail(code) { throw new Error(`GIT_OBJECT_${code}`); }

export function assertGitObjectPath(repositoryPath) {
  if (typeof repositoryPath !== "string" || !repositoryPath || repositoryPath.includes("\0") || repositoryPath.includes("\\") || repositoryPath.startsWith("/") || /^[A-Za-z]:/.test(repositoryPath) || repositoryPath.split("/").some((part) => !part || part === "." || part === "..")) fail("PATH");
  return repositoryPath;
}

export function assertGitObjectCommit(commit) {
  if (typeof commit !== "string" || !COMMIT.test(commit)) fail("COMMIT");
  return commit;
}

export function createGitObjectReader({ root, runner = execFileAsync, maxBuffer = 8 * 1024 * 1024 } = {}) {
  if (typeof root !== "string" || !root) fail("ROOT");
  if (!Number.isSafeInteger(maxBuffer) || maxBuffer < 1) fail("MAX_BUFFER");
  return Object.freeze({
    readBlob: async (commit, repositoryPath) => {
      const safeCommit = assertGitObjectCommit(commit);
      const safePath = assertGitObjectPath(repositoryPath);
      let stdout;
      try {
        ({ stdout } = await runner("git", ["cat-file", "blob", `${safeCommit}:${safePath}`], { cwd: root, windowsHide: true, maxBuffer, encoding: "buffer" }));
      } catch {
        fail("BLOB");
      }
      return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? "");
    },
  });
}
