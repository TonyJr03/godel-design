import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ensureParentDir,
  ensurePerformanceDir,
  performanceDir,
} from "./shared.mjs";

const allowedLabels = new Set(["before", "after"]);
const container = process.env.PERF_PG_CONTAINER || "supabase_db_godel-design";

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/performance/pg-stat-snapshot.mjs <before|after>",
      "  node scripts/performance/pg-stat-snapshot.mjs --label <label> --output <path>",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  if (argv.length === 1 && allowedLabels.has(argv[0])) {
    return {
      label: argv[0],
      outputPath: join(performanceDir, `pg-stat-${argv[0]}.json`),
    };
  }

  let label = null;
  let outputPath = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--label") {
      label = argv[index + 1] ?? null;
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

  if (!label || !outputPath) {
    throw new Error("--label and --output are required together.");
  }

  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(label)) {
    throw new Error("Invalid label. Use letters, numbers, dots, underscores or dashes.");
  }

  return {
    label,
    outputPath: resolve(outputPath),
  };
}

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  usage();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const sql = `
select json_build_object(
  'capturedAt', now(),
  'statsReset', (select stats_reset from pg_stat_statements_info),
  'dealloc', (select dealloc from pg_stat_statements_info),
  'rows', coalesce(
    (
      select json_agg(row_to_json(snapshot_rows))
      from (
        select
          dbid::text as "dbid",
          userid::text as "userid",
          toplevel::boolean as "toplevel",
          queryid::text as "queryid",
          calls::bigint as "calls",
          total_exec_time::double precision as "totalExecTimeMs",
          rows::bigint as "rows",
          regexp_replace(query, '\\s+', ' ', 'g') as "normalizedQuery"
        from pg_stat_statements
        where dbid = (
          select oid
          from pg_database
          where datname = current_database()
        )
          and query not ilike '%pg_stat_statements%'
        order by dbid, userid, toplevel, queryid
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
const toStatKey = (row) =>
  `${row.dbid}:${row.userid}:${row.toplevel}:${row.queryid}`;
const snapshot = {
  label: args.label,
  container,
  capturedAt: payload.capturedAt,
  statsReset: payload.statsReset,
  dealloc: Number(payload.dealloc),
  rowCount: rows.length,
  rows: rows.map((row) => {
    const normalized = {
      dbid: String(row.dbid),
      userid: String(row.userid),
      toplevel: Boolean(row.toplevel),
      queryid: String(row.queryid),
      calls: Number(row.calls),
      totalExecTimeMs: Number(row.totalExecTimeMs),
      rows: Number(row.rows),
      normalizedQuery: String(row.normalizedQuery ?? ""),
      capturedAt: payload.capturedAt,
      statsReset: payload.statsReset,
      dealloc: Number(payload.dealloc),
    };

    return {
      statKey: toStatKey(normalized),
      ...normalized,
    };
  }),
};

ensurePerformanceDir();
ensureParentDir(args.outputPath);

writeFileSync(args.outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(
  `pg_stat_statements ${args.label}: ${snapshot.rowCount} rows, statsReset=${snapshot.statsReset}, dealloc=${snapshot.dealloc}`,
);
