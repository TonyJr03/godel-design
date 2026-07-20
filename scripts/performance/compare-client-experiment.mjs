import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensurePerformanceDir, performanceDir, runGit } from "./shared.mjs";

const beforeDir = join(performanceDir, "15.3.2-before");
const afterDir = join(performanceDir, "15.3.2-after");
const outputPath = join(performanceDir, "15.3.2-comparison.json");

const routeUnderTest = "/dashboard/pedidos/[id]";
const controlRoutes = ["/dashboard/pedidos", "/dashboard/solicitudes/[id]"];
const transitionUnderTest = "/dashboard/pedidos -> /dashboard/pedidos/[id]";

function readJson(pathname) {
  if (!existsSync(pathname)) {
    throw new Error(`Missing required experiment artifact: ${pathname}`);
  }

  return JSON.parse(readFileSync(pathname, "utf8").replace(/^\uFEFF/, ""));
}

function pctDelta(before, after) {
  if (!Number.isFinite(before) || before === 0 || !Number.isFinite(after)) {
    return null;
  }

  return (after - before) / before;
}

function routeByName(evidence, route) {
  const record = evidence.routes.find((item) => item.route === route);

  if (!record) {
    throw new Error(`Missing route evidence for ${route}.`);
  }

  return record;
}

function navigationSummaryByKey(navigation, route) {
  const record = navigation.summaries.find((item) => item.route === route);

  if (!record) {
    throw new Error(`Missing navigation summary for ${route}.`);
  }

  return record;
}

function panelSummaryById(panelResults, panel) {
  const record = panelResults.summaries.find((item) => item.panel === panel);

  if (!record) {
    throw new Error(`Missing panel summary for ${panel}.`);
  }

  return record;
}

function compareNumbers(before, after, fields) {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      {
        before: before[field] ?? null,
        after: after[field] ?? null,
        delta: Number.isFinite(before[field]) && Number.isFinite(after[field])
          ? after[field] - before[field]
          : null,
        pctDelta: pctDelta(before[field], after[field]),
      },
    ]),
  );
}

function scriptTransferAcceptance(routeComparison) {
  const script = routeComparison.metrics.medianScriptTransferBytes;
  const reductionBytes =
    Number.isFinite(script.before) && Number.isFinite(script.after)
      ? script.before - script.after
      : null;
  const reductionRatio =
    Number.isFinite(script.before) && script.before > 0 && reductionBytes !== null
      ? reductionBytes / script.before
      : null;

  return {
    reductionBytes,
    reductionRatio,
    passed:
      reductionBytes !== null &&
      reductionRatio !== null &&
      (reductionBytes >= 10_240 || reductionRatio >= 0.05),
  };
}

function coldWallAcceptance(routeComparison) {
  const wall = routeComparison.metrics.medianColdWallTimeMs;
  const delta =
    Number.isFinite(wall.before) && Number.isFinite(wall.after)
      ? wall.after - wall.before
      : null;
  const ratio =
    Number.isFinite(wall.before) && wall.before > 0 && delta !== null
      ? delta / wall.before
      : null;

  return {
    delta,
    ratio,
    passed: !(delta !== null && ratio !== null && delta > 50 && ratio > 0.1),
  };
}

function controlAcceptance(controlComparisons) {
  return controlComparisons.map((control) => {
    const script = control.metrics.medianScriptTransferBytes;
    const increasedTooMuch =
      script.pctDelta !== null && Number.isFinite(script.pctDelta)
        ? script.pctDelta > 0.05
        : true;

    return {
      route: control.route,
      passed: !increasedTooMuch,
      medianScriptTransferBytesPctDelta: script.pctDelta,
    };
  });
}

function panelAcceptance(panelComparisons) {
  return panelComparisons.map((panel) => ({
    panel: panel.panel,
    passed:
      panel.after.failures === 0 &&
      panel.after.medianWallTimeMs !== null &&
      panel.after.medianWallTimeMs <= 250 &&
      panel.after.stability !== "unreliable",
    medianWallTimeMs: panel.after.medianWallTimeMs,
    medianScriptTransferBytes: panel.after.medianScriptTransferBytes,
    stability: panel.after.stability,
    failures: panel.after.failures,
  }));
}

ensurePerformanceDir();

const before = {
  evidence: readJson(join(beforeDir, "client-evidence-summary.json")),
  navigation: readJson(join(beforeDir, "navigation-results.json")),
  panels: readJson(join(beforeDir, "pedido-panel-results.json")),
  metadata: readJson(join(beforeDir, "snapshot-metadata.json")),
};
const after = {
  evidence: readJson(join(afterDir, "client-evidence-summary.json")),
  navigation: readJson(join(afterDir, "navigation-results.json")),
  panels: readJson(join(afterDir, "pedido-panel-results.json")),
  metadata: readJson(join(afterDir, "snapshot-metadata.json")),
};

const routeComparison = {
  route: routeUnderTest,
  metrics: compareNumbers(
    routeByName(before.evidence, routeUnderTest),
    routeByName(after.evidence, routeUnderTest),
    [
      "medianColdWallTimeMs",
      "medianScriptTransferBytes",
      "medianTotalTransferBytes",
      "clientGraphBytes",
      "exclusiveApplicationCompressedBytes",
    ],
  ),
};

const controls = controlRoutes.map((route) => ({
  route,
  metrics: compareNumbers(routeByName(before.evidence, route), routeByName(after.evidence, route), [
    "medianColdWallTimeMs",
    "medianScriptTransferBytes",
    "medianTotalTransferBytes",
    "clientGraphBytes",
    "exclusiveApplicationCompressedBytes",
  ]),
}));

const transition = {
  route: transitionUnderTest,
  note: "Wall-time data is reported as evidence only; approval is not based on transition wall time when stability is noisy or unreliable.",
  metrics: compareNumbers(
    navigationSummaryByKey(before.navigation, transitionUnderTest),
    navigationSummaryByKey(after.navigation, transitionUnderTest),
    ["medianWallTimeMs", "medianTransferBytes"],
  ),
};

const panelComparisons = ["estado", "tareas", "personal", "archivos", "comentarios", "pagos"].map(
  (panel) => ({
    panel,
    before: panelSummaryById(before.panels, panel),
    after: panelSummaryById(after.panels, panel),
  }),
);

const acceptance = {
  scriptTransfer: scriptTransferAcceptance(routeComparison),
  coldWall: coldWallAcceptance(routeComparison),
  controls: controlAcceptance(controls),
  panels: panelAcceptance(panelComparisons),
};
const passed =
  acceptance.scriptTransfer.passed &&
  acceptance.coldWall.passed &&
  acceptance.controls.every((control) => control.passed) &&
  acceptance.panels.every((panel) => panel.passed);

const output = {
  generatedAt: new Date().toISOString(),
  headCommit: runGit(["rev-parse", "HEAD"]),
  beforeMetadata: before.metadata,
  afterMetadata: after.metadata,
  units: {
    networkTransferBytes:
      "Browser Resource Timing transferSize bytes. Percentages here compare only network bytes with network bytes.",
    analyzerBytes:
      "Next analyzer graph bytes. These are reported separately from network transfer percentages.",
  },
  route: routeComparison,
  controls,
  transition,
  panels: panelComparisons,
  acceptance,
  outcome: passed ? "optimization_accepted" : "optimization_not_accepted",
};

writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  `15.3.2 comparison: outcome=${output.outcome} scriptReductionBytes=${acceptance.scriptTransfer.reductionBytes}`,
);
