import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensurePerformanceDir, performanceDir } from "./shared.mjs";

const label = process.argv[2];
const allowedLabels = new Set(["before", "after"]);
const container = process.env.PERF_PG_CONTAINER || "supabase_db_godel-design";

if (!allowedLabels.has(label)) {
  console.error("Usage: node scripts/performance/pg-stat-snapshot.mjs <before|after>");
  process.exit(1);
}

const sql = `
select json_build_object(
  'capturedAt', now(),
  'statsReset', (select stats_reset from pg_stat_statements_info),
  'rows', coalesce(
    (
      select json_agg(row_to_json(snapshot_rows))
      from (
        select
          queryid::text as "queryid",
          calls::bigint as "calls",
          total_exec_time::double precision as "totalExecTimeMs",
          rows::bigint as "rows",
          regexp_replace(query, '\\s+', ' ', 'g') as "normalizedQuery"
        from pg_stat_statements
        where query not ilike '%pg_stat_statements%'
        order by total_exec_time desc
        limit 250
      ) as snapshot_rows
    ),
    '[]'::json
  )
);
`;

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
    sql,
  ],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);

if (result.status !== 0) {
  console.error(`Unable to capture pg_stat_statements snapshot from ${container}.`);
  console.error(result.stderr.trim());
  process.exit(result.status ?? 1);
}

let payload;

try {
  payload = JSON.parse(result.stdout.trim());
} catch (error) {
  console.error("Unable to parse pg_stat_statements JSON output.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const rows = Array.isArray(payload.rows) ? payload.rows : [];
const snapshot = {
  label,
  container,
  capturedAt: payload.capturedAt,
  statsReset: payload.statsReset,
  rowCount: rows.length,
  rows: rows.map((row) => ({
    queryid: String(row.queryid),
    calls: Number(row.calls),
    totalExecTimeMs: Number(row.totalExecTimeMs),
    rows: Number(row.rows),
    normalizedQuery: String(row.normalizedQuery ?? ""),
    capturedAt: payload.capturedAt,
    statsReset: payload.statsReset,
  })),
};

ensurePerformanceDir();
const outputPath = join(performanceDir, `pg-stat-${label}.json`);

writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(
  `pg_stat_statements ${label}: ${snapshot.rowCount} rows, statsReset=${snapshot.statsReset}`,
);
