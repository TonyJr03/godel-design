#!/usr/bin/env node
import { resolve } from "node:path";
import { bootstrapSecretGeneration, getCurrentSecretGeneration } from "./secret-generation.mjs";

const ROOT = process.cwd();
const defaults = {
  protectedRoot: resolve(ROOT, "protected-recovery-material/selfhosted"),
  supabaseEnvPath: resolve(ROOT, "infra/supabase/.env"),
  godelEnvPath: resolve(ROOT, "compose.env.local"),
};

function usage() {
  process.stderr.write("Usage: node scripts/operations/manage-secret-generations.mjs [status|bootstrap] [--apply] [--protected-root <path>]\n");
}

function parse(args) {
  const verb = args.shift() ?? "status";
  const value = { ...defaults, apply: false };
  while (args.length) {
    const arg = args.shift();
    if (arg === "--apply") value.apply = true;
    else if (arg === "--protected-root") {
      const supplied = args.shift();
      if (!supplied || supplied.split(/[\\/]+/).includes("..") || /^[A-Za-z]:[\\/]/.test(supplied) || supplied.startsWith("/")) throw new Error("INVALID_PROTECTED_ROOT");
      value.protectedRoot = resolve(ROOT, supplied);
    }
    else throw new Error("INVALID_ARGUMENT");
  }
  if (verb !== "status" && verb !== "bootstrap") throw new Error("INVALID_COMMAND");
  return { verb, value };
}

try {
  const { verb, value } = parse(process.argv.slice(2));
  if (verb === "status") {
    const result = await getCurrentSecretGeneration(value);
    if (result.state === "UNINITIALIZED") process.stdout.write("UNINITIALIZED PASS\n");
    else process.stdout.write(`INITIALIZED ${result.generationId} ${result.match ? "MATCH PASS" : "MISMATCH FAIL"}\n`);
    process.exitCode = result.match === false ? 1 : 0;
  } else {
    const result = await bootstrapSecretGeneration({ root: ROOT, ...value });
    process.stdout.write(`${result.state}${result.generationId ? ` ${result.generationId}` : ""} PASS\n`);
  }
} catch (error) {
  usage();
  process.stderr.write(`FAIL ${error?.message ?? "UNKNOWN"}\n`);
  process.exitCode = 1;
}
