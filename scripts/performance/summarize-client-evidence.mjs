import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensurePerformanceDir, performanceDir, runGit } from "./shared.mjs";

const bundlePath = join(performanceDir, "bundle-summary.json");
const comparisonPath = join(performanceDir, "client-graph-comparison.json");
const navigationPath = join(performanceDir, "navigation-results.json");
const outputPath = join(performanceDir, "client-evidence-summary.json");

const exclusiveComparisonByRoute = {
  "/dashboard/pedidos/[id]": "pedido-detail-vs-pedido-list",
  "/dashboard/solicitudes/[id]": "solicitud-detail-vs-solicitud-list",
};

const applicationCategories = new Set([
  "workspace-shared",
  "pedido-domain",
  "solicitud-domain",
  "shared-ui",
  "application-other",
  "unknown",
]);

function readJson(pathname) {
  if (!existsSync(pathname)) {
    throw new Error(`Missing required performance artifact: ${pathname}`);
  }

  return JSON.parse(readFileSync(pathname, "utf8"));
}

function median(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length === 0) {
    return null;
  }

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function stabilityFromSamples(samples) {
  const wallTimes = samples.map((sample) => Number(sample.wallTimeMs));
  const medianWallTimeMs = median(wallTimes);
  const minWallTimeMs = wallTimes.length ? Math.min(...wallTimes) : null;
  const maxWallTimeMs = wallTimes.length ? Math.max(...wallTimes) : null;
  const relativeSpread =
    medianWallTimeMs && minWallTimeMs !== null && maxWallTimeMs !== null
      ? (maxWallTimeMs - minWallTimeMs) / medianWallTimeMs
      : null;

  return {
    medianWallTimeMs,
    relativeSpread,
    stability:
      relativeSpread === null || relativeSpread > 0.3
        ? "unreliable"
        : relativeSpread > 0.15
          ? "noisy"
          : "stable",
  };
}

function total(records, field, predicate = () => true) {
  return records
    .filter(predicate)
    .reduce((sum, record) => sum + Number(record[field] ?? 0), 0);
}

function buildExclusiveMetrics(route, comparisonsById) {
  const comparisonId = exclusiveComparisonByRoute[route];

  if (!comparisonId) {
    return {
      exclusiveClientBytes: null,
      exclusiveCompressedBytes: null,
      exclusiveApplicationBytes: null,
      exclusiveApplicationCompressedBytes: null,
      exclusiveComparison: null,
    };
  }

  const comparison = comparisonsById.get(comparisonId);

  if (!comparison) {
    throw new Error(`Missing graph comparison ${comparisonId} for ${route}.`);
  }

  const onlyInTarget = Array.isArray(comparison.onlyInTarget)
    ? comparison.onlyInTarget
    : [];

  if (!onlyInTarget.length) {
    throw new Error(`Comparison ${comparisonId} has no target-exclusive sources.`);
  }

  return {
    exclusiveClientBytes: total(onlyInTarget, "targetBytes"),
    exclusiveCompressedBytes: total(onlyInTarget, "targetCompressedBytes"),
    exclusiveApplicationBytes: total(onlyInTarget, "targetBytes", (source) =>
      applicationCategories.has(source.category),
    ),
    exclusiveApplicationCompressedBytes: total(
      onlyInTarget,
      "targetCompressedBytes",
      (source) => applicationCategories.has(source.category),
    ),
    exclusiveComparison: comparisonId,
  };
}

ensurePerformanceDir();

const bundle = readJson(bundlePath);
const comparison = readJson(comparisonPath);
const navigation = readJson(navigationPath);

const comparisonsById = new Map(
  comparison.comparisons.map((item) => [item.id, item]),
);
const successfulColdMeasured = navigation.samples.filter(
  (sample) =>
    sample.mode === "cold-document-navigation" &&
    sample.phase === "measured" &&
    sample.success === true,
);

if (successfulColdMeasured.length === 0) {
  throw new Error("No successful measured cold navigation samples found.");
}

const samplesByRoute = new Map();

for (const sample of successfulColdMeasured) {
  samplesByRoute.set(sample.route, [...(samplesByRoute.get(sample.route) ?? []), sample]);
}

const routes = bundle.routes.map((route) => {
  const samples = samplesByRoute.get(route.route) ?? [];

  if (!samples.length) {
    throw new Error(`Missing successful cold measured samples for ${route.route}.`);
  }

  const navigationStats = stabilityFromSamples(samples);
  const exclusiveMetrics = buildExclusiveMetrics(route.route, comparisonsById);

  return {
    route: route.route,
    clientGraphBytes: route.clientGraphBytes,
    ...exclusiveMetrics,
    medianColdWallTimeMs: navigationStats.medianWallTimeMs,
    medianScriptTransferBytes: median(
      samples.map((sample) => Number(sample.scriptTransferBytes)),
    ),
    medianTotalTransferBytes: median(
      samples.map(
        (sample) =>
          Number(sample.navigationTransferBytes) +
          Number(sample.scriptTransferBytes) +
          Number(sample.styleTransferBytes) +
          Number(sample.imageTransferBytes) +
          Number(sample.fontTransferBytes) +
          Number(sample.fetchTransferBytes),
      ),
    ),
    relativeSpread: navigationStats.relativeSpread,
    stability: navigationStats.stability,
    sampleCount: samples.length,
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  commit: runGit(["rev-parse", "HEAD"]),
  bundleCommit: bundle.commit,
  comparisonCommit: comparison.commit,
  navigationSampleCount: navigation.samples.length,
  failedNavigationSamples: navigation.samples.filter((sample) => !sample.success)
    .length,
  routes,
};

writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

for (const route of routes) {
  console.log(
    `${route.route}: clientGraphBytes=${route.clientGraphBytes} medianColdWallTimeMs=${route.medianColdWallTimeMs} exclusiveApplicationCompressedBytes=${route.exclusiveApplicationCompressedBytes}`,
  );
}
