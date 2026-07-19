import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  cleanPerformanceDir,
  ensurePerformanceDir,
  performanceDir,
  readNextVersion,
  runGit,
  runNode,
  runNpm,
  runNpx,
} from "./shared.mjs";

const PORT = 3100;
const HOST = "127.0.0.1";
const skipSql = process.argv.includes("--skip-sql");
const metadata = {
  startedAt: new Date().toISOString(),
  endedAt: null,
  success: false,
  skipSql,
  baseUrl: `http://${HOST}:${PORT}`,
  preflight: {},
  phases: [],
};

function capture(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32",
    }).trim();
  } catch {
    return "unknown";
  }
}

function getNpmBinary() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function findPortOwner() {
  if (process.platform === "win32") {
    const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return result.stdout
      .split(/\r?\n/)
      .filter((line) => line.includes(`:${PORT}`))
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const result = spawnSync("lsof", ["-nP", "-iTCP:3100", "-sTCP:LISTEN"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function checkPortFree() {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (error) => {
      resolve({
        ok: false,
        code: error.code,
        owner: findPortOwner(),
      });
    });

    server.listen(PORT, HOST, () => {
      server.close(() => {
        resolve({ ok: true, code: null, owner: [] });
      });
    });
  });
}

function checkSupabase() {
  const container = process.env.PERF_PG_CONTAINER || "supabase_db_godel-design";
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "select 1;",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return {
    ok: result.status === 0 && result.stdout.trim() === "1",
    container,
    code: result.status,
    stderr: result.stderr.trim(),
  };
}

function runPhase(name, runner) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const result = runner();
  const durationMs = Math.round(performance.now() - start);
  const code = result.status ?? result.signal ?? 1;
  const phase = {
    name,
    startedAt,
    durationMs,
    code,
    error: result.error ? result.error.message : null,
  };

  metadata.phases.push(phase);

  if (code !== 0) {
    throw new Error(`${name} failed with code ${code}`);
  }

  return phase;
}

function writeMetadata() {
  ensurePerformanceDir();
  metadata.endedAt = new Date().toISOString();
  writeFileSync(
    join(performanceDir, "run-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
}

metadata.preflight = {
  branch: runGit(["branch", "--show-current"]),
  commit: runGit(["rev-parse", "HEAD"]),
  nodeVersion: process.version,
  npmVersion: capture(getNpmBinary(), ["--version"]),
  nextVersion: readNextVersion(),
  os: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
  },
  cpu: {
    model: os.cpus()[0]?.model ?? "unknown",
    cores: os.cpus().length,
  },
  memoryBytes: os.totalmem(),
  port: await checkPortFree(),
  supabase: skipSql ? { skipped: true } : checkSupabase(),
};

try {
  if (!metadata.preflight.port.ok) {
    console.error(`Port ${PORT} is occupied. Refusing to kill or switch ports.`);
    for (const owner of metadata.preflight.port.owner) {
      console.error(owner);
    }
    process.exitCode = 1;
    throw new Error(`port ${PORT} is occupied`);
  }

  if (!skipSql && !metadata.preflight.supabase.ok) {
    console.error("Supabase local is unavailable. Re-run with --skip-sql to omit SQL.");
    if (metadata.preflight.supabase.stderr) {
      console.error(metadata.preflight.supabase.stderr);
    }
    process.exitCode = 1;
    throw new Error("supabase local unavailable");
  }

  cleanPerformanceDir();

  runPhase("build", () => runNpm(["run", "build"]));
  runPhase("next-analyze", () => runNpx(["next", "experimental-analyze", "--output"]));
  runPhase("bundle-summary", () =>
    runNode(["scripts/performance/summarize-next-analyze.mjs"]),
  );

  if (!skipSql) {
    runPhase("pg-stat-before", () =>
      runNode(["scripts/performance/pg-stat-snapshot.mjs", "before"]),
    );
  }

  runPhase("navigation", () => runNpm(["run", "perf:navigation"]));

  if (!skipSql) {
    runPhase("pg-stat-after", () =>
      runNode(["scripts/performance/pg-stat-snapshot.mjs", "after"]),
    );
    runPhase("pg-stat-diff", () =>
      runNode(["scripts/performance/pg-stat-diff.mjs"]),
    );
  }

  metadata.success = true;
  console.log("Performance harness completed successfully.");
} catch (error) {
  metadata.error = error instanceof Error ? error.message : String(error);
  if (!process.exitCode) {
    process.exitCode = 1;
  }
} finally {
  writeMetadata();
}
