import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensureParentDir, performanceDir, runGit } from "./shared.mjs";

const attributionDir = join(performanceDir, "sql-flow-attribution");
const outputPath = join(attributionDir, "summary.json");
const flowNames = [
  "dashboard",
  "pedidos-default",
  "pedidos-search",
  "solicitudes-default",
  "solicitudes-search",
];

const categories = [
  "auth-or-profile",
  "dashboard-summary",
  "dashboard-work-items",
  "dashboard-activity",
  "pedidos-main",
  "pedidos-search-reference",
  "pedido-task-progress",
  "clientes",
  "solicitudes-main",
  "solicitudes-search-reference",
  "postgrest-or-rls",
  "harness",
  "unknown",
];

function readJson(pathname) {
  if (!existsSync(pathname)) {
    throw new Error(`Missing SQL attribution artifact: ${pathname}`);
  }

  return JSON.parse(readFileSync(pathname, "utf8").replace(/^\uFEFF/, ""));
}

function includesAny(query, needles) {
  return needles.some((needle) => query.includes(needle));
}

function isCountQuery(query) {
  return /count\s*\(/i.test(query) || query.includes("pgrst_source_count");
}

function isAuthQuery(query) {
  return includesAny(query, [
    " from users",
    " from identities",
    " from sessions",
    " from mfa_amr_claims",
    " from refresh_tokens",
    " from audit_log_entries",
  ]);
}

function hasTable(query, table) {
  return (
    query.includes(`"public"."${table}"`) ||
    query.includes(` from ${table}`) ||
    query.includes(` from "public".${table}`)
  );
}

function classifyStatement(flow, query) {
  const normalized = String(query || "").toLowerCase();

  if (!normalized) {
    return { category: "unknown", confidence: "low" };
  }

  if (
    includesAny(normalized, [
      "pg_stat_statements",
      "json_build_object",
      "performance/pg-stat",
    ])
  ) {
    return { category: "harness", confidence: "high" };
  }

  if (hasTable(normalized, "pedido_tareas")) {
    return { category: "pedido-task-progress", confidence: "high" };
  }

  if (
    hasTable(normalized, "pedido_historial") ||
    hasTable(normalized, "solicitud_historial")
  ) {
    return { category: "dashboard-activity", confidence: "high" };
  }

  if (hasTable(normalized, "pedidos")) {
    if (flow === "dashboard") {
      return {
        category: isCountQuery(normalized)
          ? "dashboard-summary"
          : "dashboard-work-items",
        confidence: "high",
      };
    }

    return { category: "pedidos-main", confidence: "high" };
  }

  if (hasTable(normalized, "solicitudes")) {
    if (flow === "dashboard") {
      return {
        category: isCountQuery(normalized)
          ? "dashboard-summary"
          : "dashboard-work-items",
        confidence: "high",
      };
    }

    if (flow === "pedidos-search") {
      return { category: "pedidos-search-reference", confidence: "high" };
    }

    if (flow === "solicitudes-search") {
      return { category: "solicitudes-search-reference", confidence: "high" };
    }

    return { category: "solicitudes-main", confidence: "high" };
  }

  if (hasTable(normalized, "clientes")) {
    if (
      flow === "pedidos-search" &&
      normalized.includes(" ilike ") &&
      !normalized.includes("phone, email, created_at")
    ) {
      return { category: "pedidos-search-reference", confidence: "medium" };
    }

    if (flow === "dashboard" && isCountQuery(normalized)) {
      return { category: "dashboard-summary", confidence: "high" };
    }

    return { category: "clientes", confidence: "high" };
  }

  if (hasTable(normalized, "perfiles") || isAuthQuery(normalized)) {
    return { category: "auth-or-profile", confidence: "high" };
  }

  if (
    includesAny(normalized, [
      "current_setting",
      "request.jwt.claim",
      "auth.uid",
      "pgrst",
      "rls",
    ])
  ) {
    return { category: "postgrest-or-rls", confidence: "medium" };
  }

  return { category: "unknown", confidence: "low" };
}

function materialReasons(row, flowTotalExecTimeMs) {
  const reasons = [];

  if (row.deltaTotalExecTimeMs < 50) {
    return reasons;
  }

  if (
    flowTotalExecTimeMs > 0 &&
    row.deltaTotalExecTimeMs / flowTotalExecTimeMs >= 0.15
  ) {
    reasons.push(">=15% del tiempo SQL del flujo");
  }

  if (row.deltaMeanExecTimeMs >= 20) {
    reasons.push("deltaMeanExecTimeMs >= 20 ms");
  }

  if (row.deltaCalls > 3 && row.category !== "auth-or-profile") {
    reasons.push("deltaCalls alto para tres cargas");
  }

  if (row.deltaRows > 500) {
    reasons.push("deltaRows desproporcionado");
  }

  return reasons;
}

function categoryTotals(rows) {
  const totals = new Map(
    categories.map((category) => [
      category,
      {
        category,
        statements: 0,
        deltaCalls: 0,
        deltaTotalExecTimeMs: 0,
        deltaRows: 0,
      },
    ]),
  );

  for (const row of rows) {
    const current = totals.get(row.category) ?? totals.get("unknown");

    current.statements += 1;
    current.deltaCalls += row.deltaCalls;
    current.deltaTotalExecTimeMs += row.deltaTotalExecTimeMs;
    current.deltaRows += row.deltaRows;
  }

  return [...totals.values()].filter(
    (total) =>
      total.statements > 0 ||
      total.deltaCalls > 0 ||
      total.deltaTotalExecTimeMs > 0 ||
      total.deltaRows > 0,
  );
}

function summarizeFlow(flow) {
  const dir = join(attributionDir, flow);
  const diff = readJson(join(dir, "diff.json"));
  const flowMeta = readJson(join(dir, "flow.json"));
  const rows = (Array.isArray(diff.rows) ? diff.rows : []).map((row) => {
    const classification = classifyStatement(flow, row.normalizedQuery);

    return {
      statKey: row.statKey,
      queryid: row.queryid,
      deltaCalls: Number(row.deltaCalls),
      deltaTotalExecTimeMs: Number(row.deltaTotalExecTimeMs),
      deltaMeanExecTimeMs: Number(row.deltaMeanExecTimeMs),
      deltaRows: Number(row.deltaRows),
      category: classification.category,
      confidence: classification.confidence,
    };
  });
  const deltaTotalExecTimeMs = rows.reduce(
    (total, row) => total + row.deltaTotalExecTimeMs,
    0,
  );
  const enrichedRows = rows.map((row) => ({
    ...row,
    isMaterialCandidate: materialReasons(row, deltaTotalExecTimeMs).length > 0,
    materialReasons: materialReasons(row, deltaTotalExecTimeMs),
  }));

  return {
    flow,
    measuredLoads: Number(flowMeta.measuredLoadCount ?? 0),
    comparable: Boolean(diff.comparable),
    statsReset: diff.statsReset ?? null,
    dealloc: diff.dealloc ?? null,
    deltaQueryCount: enrichedRows.length,
    deltaCalls: enrichedRows.reduce((total, row) => total + row.deltaCalls, 0),
    deltaTotalExecTimeMs,
    deltaRows: enrichedRows.reduce((total, row) => total + row.deltaRows, 0),
    topStatements: enrichedRows
      .sort((left, right) => right.deltaTotalExecTimeMs - left.deltaTotalExecTimeMs)
      .slice(0, 15),
    categoryTotals: categoryTotals(enrichedRows),
    unknownStatements: enrichedRows.filter((row) => row.category === "unknown"),
  };
}

const flows = flowNames.map(summarizeFlow);
const statementOccurrences = new Map();

for (const flow of flows) {
  for (const statement of flow.topStatements) {
    const current = statementOccurrences.get(statement.statKey) ?? {
      statKey: statement.statKey,
      queryid: statement.queryid,
      flows: [],
      categories: new Set(),
      totalExecTimeMs: 0,
      totalCalls: 0,
    };

    current.flows.push(flow.flow);
    current.categories.add(statement.category);
    current.totalExecTimeMs += statement.deltaTotalExecTimeMs;
    current.totalCalls += statement.deltaCalls;
    statementOccurrences.set(statement.statKey, current);
  }
}

const materialCandidates = flows.flatMap((flow) =>
  flow.topStatements
    .filter((statement) => statement.isMaterialCandidate)
    .map((statement) => ({
      flow: flow.flow,
      ...statement,
    })),
);

materialCandidates.sort(
  (left, right) => right.deltaTotalExecTimeMs - left.deltaTotalExecTimeMs,
);

const output = {
  generatedAt: new Date().toISOString(),
  commit: runGit(["rev-parse", "HEAD"]),
  measuredFlowCount: flows.length,
  flows,
  sharedStatements: [...statementOccurrences.values()]
    .filter((item) => item.flows.length > 1)
    .map((item) => ({
      statKey: item.statKey,
      queryid: item.queryid,
      flows: item.flows,
      categories: [...item.categories],
      totalExecTimeMs: item.totalExecTimeMs,
      totalCalls: item.totalCalls,
    })),
  materialCandidates,
  decisionHint:
    materialCandidates.length > 0
      ? "Existe candidato SQL material para 15.5.2"
      : "No existe candidato SQL material",
};

ensureParentDir(outputPath);
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  `SQL flow attribution summary: flows=${flows.length} materialCandidates=${materialCandidates.length}`,
);
