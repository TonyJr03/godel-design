import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const performanceDir = resolve(
  repoRoot,
  ".next",
  "diagnostics",
  "performance",
);
export const analyzeDir = resolve(repoRoot, ".next", "diagnostics", "analyze");

export function ensurePerformanceDir() {
  mkdirSync(performanceDir, { recursive: true });
}

export function assertInsideRepo(pathname) {
  const resolved = resolve(pathname);
  const rootWithSep = repoRoot.endsWith(sep) ? repoRoot : `${repoRoot}${sep}`;

  if (resolved !== repoRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Refusing to use path outside repo: ${resolved}`);
  }

  return resolved;
}

export function cleanPerformanceDir() {
  const target = assertInsideRepo(performanceDir);
  const expectedSuffix = `${sep}.next${sep}diagnostics${sep}performance`;

  if (!target.endsWith(expectedSuffix)) {
    throw new Error(`Unexpected performance directory: ${target}`);
  }

  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
}

export function runGit(args, fallback = "unknown") {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

export function runNpm(args, options = {}) {
  const npmBinary = process.platform === "win32" ? "npm.cmd" : "npm";

  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine(npmBinary, args)], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
      ...options,
    });
  }

  return spawnSync(npmBinary, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

export function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

export function runNpx(args, options = {}) {
  const npxBinary = process.platform === "win32" ? "npx.cmd" : "npx";

  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine(npxBinary, args)], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
      ...options,
    });
  }

  return spawnSync(npxBinary, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

function quoteCmdArg(value) {
  const arg = String(value);

  if (/^[A-Za-z0-9_./:=@-]+$/.test(arg)) {
    return arg;
  }

  return `"${arg.replaceAll("\"", "\\\"")}"`;
}

function commandLine(command, args) {
  return [command, ...args].map(quoteCmdArg).join(" ");
}

export function readNextVersion() {
  try {
    return execFileSync(process.execPath, [
      "-e",
      "console.log(require('next/package.json').version)",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

export function ensureParentDir(pathname) {
  mkdirSync(dirname(pathname), { recursive: true });
}
