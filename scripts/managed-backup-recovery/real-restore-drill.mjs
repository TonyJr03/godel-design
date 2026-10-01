import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { resolveManagedR2RecoveryEnvironment } from "./managed-r2-local-env.mjs";
import { runRealProductBackupLocalRestoreDrill, sanitizeRealRestoreDrillFailure } from "./real-restore-drill-core.mjs";

export async function main({
  environment = process.env,
  repoRoot = resolve(process.cwd()),
  loadEnvironment = resolveManagedR2RecoveryEnvironment,
  runDrill = runRealProductBackupLocalRestoreDrill,
} = {}) {
  let result;
  try {
    const resolved = await loadEnvironment({ repoRoot, environment });
    result = await runDrill({ repoRoot, environment: resolved.environment });
  } catch (error) {
    result = sanitizeRealRestoreDrillFailure(error);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
