import { runCommand } from "../managed-backup/command-runner.mjs";
import { buildRecoveryGitEnvironment } from "./git-environment.mjs";

const SHA = /^[a-f0-9]{40}$/;

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryToolingAuthorityError";
  error.code = code;
  throw error;
}

export async function resolveRecoveryToolingAuthority({ repoRoot, environment = process.env, execute = runCommand } = {}) {
  if (typeof repoRoot !== "string" || typeof execute !== "function") fail("RECOVERY_TOOLING_AUTHORITY_INVALID", "Recovery tooling authority adapters are invalid");
  const allowedEnvironment = buildRecoveryGitEnvironment({ sourceEnvironment: environment, repoRoot });
  const invoke = (operation, args) => execute({ operation, executable: "git", args, cwd: repoRoot, allowedEnvironment });
  const [branch, head, status] = await Promise.all([
    invoke("resolve recovery tooling branch", ["branch", "--show-current"]),
    invoke("resolve recovery tooling HEAD", ["rev-parse", "HEAD"]),
    invoke("verify recovery tooling worktree", ["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  return Object.freeze({ branch: branch.stdout.trim(), head: head.stdout.trim(), clean: status.stdout.trim() === "" });
}

export function assertRecoveryToolingAuthority({ authority, expectedBranch, expectedHead } = {}) {
  if (!authority || authority.branch !== expectedBranch) fail("WRONG_TOOLING_BRANCH", "Recovery tooling branch is not authorized");
  if (!SHA.test(expectedHead ?? "") || authority.head !== expectedHead) fail("WRONG_TOOLING_HEAD", "Recovery tooling HEAD does not match the declared authority");
  if (authority.clean !== true) fail("DIRTY_TOOLING_WORKTREE", "Recovery tooling worktree must be clean");
  return Object.freeze({ branch: authority.branch, head: authority.head, clean: true });
}
