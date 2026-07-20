import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ensureParentDir,
  ensurePerformanceDir,
  performanceDir,
} from "./shared.mjs";

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/performance/pg-stat-diff.mjs [beforePath afterPath outputPath]",
      "  node scripts/performance/pg-stat-diff.mjs --before <path> --after <path> --output <path>",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  if (argv.length === 0) {
    return {
      beforePath: join(performanceDir, "pg-stat-before.json"),
      afterPath: join(performanceDir, "pg-stat-after.json"),
      outputPath: join(performanceDir, "pg-stat-diff.json"),
    };
  }

  if (argv.length > 0 && !argv[0].startsWith("--")) {
    if (argv.length > 3) {
      throw new Error("Too many positional arguments.");
    }

    return {
      beforePath: argv[0] || join(performanceDir, "pg-stat-before.json"),
      afterPath: argv[1] || join(performanceDir, "pg-stat-after.json"),
      outputPath: argv[2] || join(performanceDir, "pg-stat-diff.json"),
    };
  }

  let beforePath = null;
  let afterPath = null;
  let outputPath = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--before") {
      beforePath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--after") {
      afterPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--output") {
      outputPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    throw new Error(`Invalid argument: ${arg}`);
  }

  if (!beforePath || !afterPath || !outputPath) {
    throw new Error("--before, --after and --output are required together.");
  }

  return { beforePath, afterPath, outputPath };
}

let paths;

try {
  paths = parseArgs(process.argv.slice(2));
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const beforePath = resolve(paths.beforePath);
const afterPath = resolve(paths.afterPath);
const outputPath = resolve(paths.outputPath);

function readSnapshot(pathname) {
  return JSON.parse(readFileSync(pathname, "utf8").replace(/^\uFEFF/, ""));
}

function isHarnessQuery(row) {
  return /pg_stat_statements|performance\/pg-stat|json_build_object/i.test(
    String(row.normalizedQuery || ""),
  );
}

function statKey(row) {
  return (
    row.statKey ||
    `${row.dbid}:${row.userid}:${row.toplevel}:${row.queryid}`
  );
}

const before = readSnapshot(beforePath);
const after = readSnapshot(afterPath);
const resetChanged = before.statsReset !== after.statsReset;
const deallocChanged = Number(before.dealloc) !== Number(after.dealloc);

if (resetChanged || deallocChanged) {
  const payload = {
    generatedAt: new Date().toISOString(),
    comparable: false,
    reason: resetChanged
      ? "pg_stat_statements stats_reset changed between snapshots."
      : "pg_stat_statements dealloc changed between snapshots.",
    beforeStatsReset: before.statsReset,
    afterStatsReset: after.statsReset,
    beforeDealloc: before.dealloc,
    afterDealloc: after.dealloc,
    rows: [],
  };

  ensurePerformanceDir();
  ensureParentDir(outputPath);
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.error(payload.reason);
  process.exit(1);
}

const beforeRows = new Map(
  (Array.isArray(before.rows) ? before.rows : [])
    .filter((row) => !isHarnessQuery(row))
    .map((row) => [statKey(row), row]),
);

const rows = (Array.isArray(after.rows) ? after.rows : [])
  .filter((row) => !isHarnessQuery(row))
  .map((afterRow) => {
    const key = statKey(afterRow);
    const beforeRow = beforeRows.get(key);

    const beforeCalls = Number(beforeRow?.calls ?? 0);
    const beforeTotalExecTimeMs = Number(beforeRow?.totalExecTimeMs ?? 0);
    const beforeRowsCount = Number(beforeRow?.rows ?? 0);
    const deltaCalls = Number(afterRow.calls) - beforeCalls;
    const deltaTotalExecTimeMs =
      Number(afterRow.totalExecTimeMs) - beforeTotalExecTimeMs;
    const deltaRows = Number(afterRow.rows) - beforeRowsCount;

    if (deltaCalls < 0 || deltaTotalExecTimeMs < 0 || deltaRows < 0) {
      return null;
    }

    return {
      statKey: key,
      dbid: String(afterRow.dbid),
      userid: String(afterRow.userid),
      toplevel: Boolean(afterRow.toplevel),
      queryid: String(afterRow.queryid),
      isNewEntry: !beforeRow,
      deltaCalls,
      deltaTotalExecTimeMs,
      deltaRows,
      deltaMeanExecTimeMs:
        deltaCalls > 0 ? deltaTotalExecTimeMs / deltaCalls : 0,
      normalizedQuery: String(afterRow.normalizedQuery || ""),
      beforeCapturedAt: before.capturedAt,
      afterCapturedAt: after.capturedAt,
      statsReset: after.statsReset,
      dealloc: after.dealloc,
    };
  })
  .filter(Boolean)
  .filter((row) => row.deltaCalls > 0 || row.deltaTotalExecTimeMs > 0)
  .sort((left, right) => right.deltaTotalExecTimeMs - left.deltaTotalExecTimeMs);

const payload = {
  generatedAt: new Date().toISOString(),
  comparable: true,
  beforePath,
  afterPath,
  beforeCapturedAt: before.capturedAt,
  afterCapturedAt: after.capturedAt,
  statsReset: after.statsReset,
  dealloc: after.dealloc,
  rowCount: rows.length,
  rows,
};

ensurePerformanceDir();
ensureParentDir(outputPath);
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`pg_stat diff: ${rows.length} comparable query windows`);
for (const row of rows.slice(0, 10)) {
  console.log(
    `statKey=${row.statKey} calls=+${row.deltaCalls} totalMs=+${row.deltaTotalExecTimeMs.toFixed(
      3,
    )} meanMs=${row.deltaMeanExecTimeMs.toFixed(3)} rows=+${row.deltaRows}`,
  );
}
