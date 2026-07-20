import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyzerWarning,
  criticalRoutes,
  loadRouteGraph,
} from "./analyze-utils.mjs";
import {
  analyzeDir,
  ensurePerformanceDir,
  performanceDir,
  readNextVersion,
  runGit,
} from "./shared.mjs";

const comparisonsToRun = [
  {
    id: "pedido-detail-vs-pedido-list",
    target: "/dashboard/pedidos/[id]",
    comparator: "/dashboard/pedidos",
  },
  {
    id: "solicitud-detail-vs-solicitud-list",
    target: "/dashboard/solicitudes/[id]",
    comparator: "/dashboard/solicitudes",
  },
  {
    id: "pedido-detail-vs-solicitud-detail",
    target: "/dashboard/pedidos/[id]",
    comparator: "/dashboard/solicitudes/[id]",
  },
  {
    id: "pedido-detail-vs-dashboard",
    target: "/dashboard/pedidos/[id]",
    comparator: "/dashboard",
  },
  {
    id: "solicitud-detail-vs-dashboard",
    target: "/dashboard/solicitudes/[id]",
    comparator: "/dashboard",
  },
];

function classifySource(source) {
  const normalized = source.toLowerCase();

  if (
    normalized.includes("node_modules/next/") ||
    normalized.includes("node_modules/react/") ||
    normalized.includes("node_modules/react-dom/") ||
    normalized.includes("node_modules/scheduler/") ||
    normalized.includes("react-server-dom")
  ) {
    return "framework-runtime";
  }

  if (normalized.includes("node_modules/")) {
    return "external-dependency";
  }

  if (
    normalized.includes("/static/media/") ||
    normalized.includes("src/app/globals.css") ||
    /\.(?:css|png|jpe?g|webp|gif|avif|svg|ico|woff2?|ttf|otf)(?:$|\?)/i.test(
      source,
    )
  ) {
    return "global-style-or-asset";
  }

  if (normalized.includes("src/components/workspace/")) {
    return "workspace-shared";
  }

  if (normalized.includes("src/components/pedidos/")) {
    return "pedido-domain";
  }

  if (normalized.includes("src/components/solicitudes/")) {
    return "solicitud-domain";
  }

  if (
    normalized.includes("src/components/ui/") ||
    normalized.includes("src/components/table/") ||
    normalized.includes("src/components/forms/")
  ) {
    return "shared-ui";
  }

  if (
    normalized.includes("src/app/") ||
    normalized.includes("src/components/") ||
    normalized.includes("src/lib/") ||
    normalized.includes("src/types/")
  ) {
    return "application-other";
  }

  return "unknown";
}

function sourceRecord(source, targetSource, comparatorSource) {
  const targetBytes = targetSource?.bytes ?? 0;
  const comparatorBytes = comparatorSource?.bytes ?? 0;
  const targetCompressedBytes = targetSource?.compressedBytes ?? 0;
  const comparatorCompressedBytes = comparatorSource?.compressedBytes ?? 0;

  return {
    source,
    category: classifySource(source),
    targetBytes,
    comparatorBytes,
    deltaBytes: targetBytes - comparatorBytes,
    targetCompressedBytes,
    comparatorCompressedBytes,
    deltaCompressedBytes: targetCompressedBytes - comparatorCompressedBytes,
    partCount: (targetSource?.count ?? 0) + (comparatorSource?.count ?? 0),
  };
}

function sortByDelta(left, right) {
  const compressedDelta =
    Math.abs(right.deltaCompressedBytes) - Math.abs(left.deltaCompressedBytes);

  if (compressedDelta !== 0) {
    return compressedDelta;
  }

  return Math.abs(right.deltaBytes) - Math.abs(left.deltaBytes);
}

function sumCategoryTotals(records) {
  const totals = new Map();

  for (const record of records) {
    const current = totals.get(record.category) ?? {
      category: record.category,
      sources: 0,
      targetBytes: 0,
      comparatorBytes: 0,
      deltaBytes: 0,
      targetCompressedBytes: 0,
      comparatorCompressedBytes: 0,
      deltaCompressedBytes: 0,
    };

    current.sources += 1;
    current.targetBytes += record.targetBytes;
    current.comparatorBytes += record.comparatorBytes;
    current.deltaBytes += record.deltaBytes;
    current.targetCompressedBytes += record.targetCompressedBytes;
    current.comparatorCompressedBytes += record.comparatorCompressedBytes;
    current.deltaCompressedBytes += record.deltaCompressedBytes;
    totals.set(record.category, current);
  }

  return [...totals.values()].sort((left, right) =>
    left.category.localeCompare(right.category),
  );
}

function routeCategoryTotals(route) {
  return sumCategoryTotals(
    [...route.clientSources.entries()].map(([source, data]) =>
      sourceRecord(source, data, null),
    ),
  ).map((total) => ({
    category: total.category,
    sources: total.sources,
    targetBytes: total.targetBytes,
    deltaBytes: total.deltaBytes,
    targetCompressedBytes: total.targetCompressedBytes,
    deltaCompressedBytes: total.deltaCompressedBytes,
  }));
}

function compareRoutes({ id, target, comparator }, routesByName) {
  const targetRoute = routesByName.get(target);
  const comparatorRoute = routesByName.get(comparator);

  if (!targetRoute) {
    throw new Error(`Missing analyzer graph for target route ${target}.`);
  }

  if (!comparatorRoute) {
    throw new Error(`Missing analyzer graph for comparator route ${comparator}.`);
  }

  const sourceNames = new Set([
    ...targetRoute.clientSources.keys(),
    ...comparatorRoute.clientSources.keys(),
  ]);

  if (sourceNames.size === 0) {
    throw new Error(`Comparison ${id} has no client sources.`);
  }

  const sharedSources = [];
  const onlyInTarget = [];
  const onlyInComparator = [];
  const largerInTarget = [];
  const largerInComparator = [];

  for (const source of sourceNames) {
    const targetSource = targetRoute.clientSources.get(source);
    const comparatorSource = comparatorRoute.clientSources.get(source);
    const record = sourceRecord(source, targetSource, comparatorSource);

    if (targetSource && comparatorSource) {
      sharedSources.push(record);

      if (record.deltaCompressedBytes > 0 || record.deltaBytes > 0) {
        largerInTarget.push(record);
      } else if (record.deltaCompressedBytes < 0 || record.deltaBytes < 0) {
        largerInComparator.push(record);
      }
    } else if (targetSource) {
      onlyInTarget.push(record);
    } else {
      onlyInComparator.push(record);
    }
  }

  for (const list of [
    sharedSources,
    onlyInTarget,
    onlyInComparator,
    largerInTarget,
    largerInComparator,
  ]) {
    list.sort(sortByDelta);
  }

  if (!sharedSources.length && !onlyInTarget.length && !onlyInComparator.length) {
    throw new Error(`Comparison ${id} produced an empty result.`);
  }

  return {
    id,
    target,
    comparator,
    targetClientGraphBytes: targetRoute.clientGraphBytes,
    comparatorClientGraphBytes: comparatorRoute.clientGraphBytes,
    sharedSources,
    onlyInTarget,
    onlyInComparator,
    largerInTarget,
    largerInComparator,
    categoryTotals: {
      onlyInTarget: sumCategoryTotals(onlyInTarget),
      onlyInComparator: sumCategoryTotals(onlyInComparator),
      largerInTarget: sumCategoryTotals(largerInTarget),
      largerInComparator: sumCategoryTotals(largerInComparator),
    },
  };
}

function isApplicationCategory(category) {
  return [
    "workspace-shared",
    "pedido-domain",
    "solicitud-domain",
    "shared-ui",
    "application-other",
    "unknown",
  ].includes(category);
}

if (!existsSync(analyzeDir)) {
  console.error(
    "Missing .next/diagnostics/analyze. Run `npm.cmd run perf:bundle` first.",
  );
  process.exit(1);
}

ensurePerformanceDir();

const routes = criticalRoutes.map(loadRouteGraph);
const missingRoutes = routes.filter((route) => route.missing);

if (missingRoutes.length > 0) {
  for (const route of missingRoutes) {
    console.error(
      `Missing analyzer data for ${route.route}: expected ${route.relativeDataFile}`,
    );
  }
  process.exit(1);
}

const routesByName = new Map(routes.map((route) => [route.route, route]));
const comparisons = comparisonsToRun.map((comparison) =>
  compareRoutes(comparison, routesByName),
);
const topExclusiveSources = comparisons.flatMap((comparison) =>
  comparison.onlyInTarget
    .filter((source) => isApplicationCategory(source.category))
    .map((source) => ({
      comparison: comparison.id,
      route: comparison.target,
      ...source,
    })),
);

topExclusiveSources.sort(sortByDelta);

if (comparisons.length !== comparisonsToRun.length) {
  throw new Error("Not all requested comparisons were produced.");
}

const categoryTotals = {
  byRoute: Object.fromEntries(
    routes.map((route) => [route.route, routeCategoryTotals(route)]),
  ),
  byComparison: Object.fromEntries(
    comparisons.map((comparison) => [
      comparison.id,
      comparison.categoryTotals.onlyInTarget,
    ]),
  ),
};

const output = {
  generatedAt: new Date().toISOString(),
  commit: runGit(["rev-parse", "HEAD"]),
  nextVersion: readNextVersion(),
  analyzerWarning,
  comparisons,
  categoryTotals,
  topExclusiveSources: topExclusiveSources.slice(0, 50),
};

writeFileSync(
  join(performanceDir, "client-graph-comparison.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);

for (const comparison of comparisons) {
  const exclusiveCompressed = comparison.onlyInTarget.reduce(
    (total, source) => total + source.targetCompressedBytes,
    0,
  );
  console.log(
    `${comparison.id}: onlyInTarget=${comparison.onlyInTarget.length} exclusiveCompressedBytes=${exclusiveCompressed}`,
  );
}
