import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { runRealProductBackupLocalRestoreDrill } from "./real-restore-drill-core.mjs";

export async function main() {
  const result = await runRealProductBackupLocalRestoreDrill();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
