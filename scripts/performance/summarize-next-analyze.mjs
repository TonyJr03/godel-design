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

if (!existsSync(analyzeDir)) {
  console.error(
    "Missing .next/diagnostics/analyze. Run `next experimental-analyze --output` first.",
  );
  process.exit(1);
}

ensurePerformanceDir();

const routes = criticalRoutes.map(loadRouteGraph).map((route) => {
  if (route.missing) {
    return route;
  }

  return {
    route: route.route,
    clientGraphBytes: route.clientGraphBytes,
    serverGraphBytes: route.serverGraphBytes,
    sourceCount: route.sourceCount,
    clientSourceCount: route.clientSourceCount,
    serverSourceCount: route.serverSourceCount,
    topClientSources: route.topClientSources,
    topServerSources: route.topServerSources,
  };
});
const missingRoutes = routes.filter((route) => route.missing);

if (missingRoutes.length > 0) {
  for (const route of missingRoutes) {
    console.error(
      `Missing analyzer data for ${route.route}: expected ${route.relativeDataFile}`,
    );
  }
  process.exit(1);
}

const summary = {
  generatedAt: new Date().toISOString(),
  nextVersion: readNextVersion(),
  commit: runGit(["rev-parse", "HEAD"]),
  analyzerDirectory: ".next/diagnostics/analyze",
  note: analyzerWarning,
  routes,
};

writeFileSync(
  join(performanceDir, "bundle-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);

for (const route of summary.routes) {
  if (route.missing) {
    console.log(`${route.route}: missing analyzer data`);
    continue;
  }

  console.log(
    `${route.route}: clientGraphBytes=${route.clientGraphBytes} serverGraphBytes=${route.serverGraphBytes}`,
  );
}
