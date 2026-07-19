import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ensurePerformanceDir, performanceDir } from "./shared.mjs";

const beforePath = resolve(
  process.argv[2] || join(performanceDir, "pg-stat-before.json"),
);
const afterPath = resolve(
  process.argv[3] || join(performanceDir, "pg-stat-after.json"),
);
const outputPath = resolve(
  process.argv[4] || join(performanceDir, "pg-stat-diff.json"),
);

function readSnapshot(pathname) {
  return JSON.parse(readFileSync(pathname, "utf8"));
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
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`pg_stat diff: ${rows.length} comparable query windows`);
for (const row of rows.slice(0, 10)) {
  console.log(
    `statKey=${row.statKey} calls=+${row.deltaCalls} totalMs=+${row.deltaTotalExecTimeMs.toFixed(
      3,
    )} meanMs=${row.deltaMeanExecTimeMs.toFixed(3)} rows=+${row.deltaRows}`,
  );
}
