#!/usr/bin/env node
import { basename, relative, resolve, sep } from "node:path";
import { assertNoGenerationMutationLock, bootstrapSecretGeneration, getCurrentSecretGeneration } from "./secret-generation.mjs";
import { exportSecretGenerationBundle, importSecretGenerationBundle } from "./secret-generation-transport.mjs";

const ROOT = process.cwd();
const defaults = {
  protectedRoot: resolve(ROOT, "protected-recovery-material/selfhosted"),
  supabaseEnvPath: resolve(ROOT, "infra/supabase/.env"),
  godelEnvPath: resolve(ROOT, "compose.env.local"),
};
const TRANSPORT_PROTECTED_BASE = resolve(ROOT, "protected-recovery-material");

function usage() {
  process.stderr.write("Usage: node scripts/operations/manage-secret-generations.mjs [status|bootstrap|export|import] [--apply] [--protected-root <path>] [--manifest <path>] [--output <path>] [--bundle <path>]\n");
}

function safeRelativePath(value, code) {
  if (!value || value.includes("\0") || /^(?:[A-Za-z]:|[\\/])/.test(value) || value.split(/[\\/]+/).some((segment) => segment === ".." || !segment || segment === ".")) throw new Error(code);
  return value;
}

function assertTransportProtectedRoot(protectedRoot) {
  const relation = relative(TRANSPORT_PROTECTED_BASE, protectedRoot);
  if (!relation || relation === ".." || relation.startsWith(`..${sep}`)) throw new Error("INVALID_TRANSPORT_PROTECTED_ROOT");
  return protectedRoot;
}

function parse(args) {
  const verb = args.shift() ?? "status";
  const value = { ...defaults, apply: false };
  while (args.length) {
    const arg = args.shift();
    if (arg === "--apply") value.apply = true;
    else if (arg === "--protected-root") {
      const supplied = args.shift();
      value.protectedRoot = resolve(ROOT, safeRelativePath(supplied, "INVALID_PROTECTED_ROOT"));
    }
    else if (arg === "--manifest") value.manifestRelativePath = safeRelativePath(args.shift(), "INVALID_MANIFEST_PATH");
    else if (arg === "--output") value.outputRelativePath = safeRelativePath(args.shift(), "INVALID_OUTPUT_PATH");
    else if (arg === "--bundle") value.bundleRelativePath = safeRelativePath(args.shift(), "INVALID_BUNDLE_PATH");
    else throw new Error("INVALID_ARGUMENT");
  }
  if (!["status", "bootstrap", "export", "import"].includes(verb)) throw new Error("INVALID_COMMAND");
  if (value.manifestRelativePath) value.manifestPath = resolve(ROOT, value.manifestRelativePath);
  if (value.outputRelativePath) value.output = resolve(value.protectedRoot, value.outputRelativePath);
  if (value.bundleRelativePath) value.bundlePath = resolve(value.protectedRoot, value.bundleRelativePath);
  delete value.manifestRelativePath;
  delete value.outputRelativePath;
  delete value.bundleRelativePath;
  if (verb === "export" || verb === "import") assertTransportProtectedRoot(value.protectedRoot);
  if (verb === "export" && (!value.manifestPath || !value.output || value.apply)) throw new Error("INVALID_EXPORT_ARGUMENTS");
  if (verb === "import" && (!value.manifestPath || !value.bundlePath)) throw new Error("INVALID_IMPORT_ARGUMENTS");
  return { verb, value };
}

try {
  const { verb, value } = parse(process.argv.slice(2));
  if (verb === "status") {
    try { await assertNoGenerationMutationLock({ protectedRoot: value.protectedRoot }); } catch (error) {
      if (error?.message === "GENERATION_MUTATION_IN_PROGRESS") { process.stdout.write("BUSY OPERATION_IN_PROGRESS\n"); process.exitCode = 1; process.exit(); }
      throw error;
    }
    const result = await getCurrentSecretGeneration(value);
    if (result.state === "UNINITIALIZED") process.stdout.write("UNINITIALIZED PASS\n");
    else process.stdout.write(`INITIALIZED ${result.generationId} ${result.match ? "MATCH PASS" : "MISMATCH FAIL"}\n`);
    process.exitCode = result.match === false ? 1 : 0;
  } else if (verb === "bootstrap") {
    const result = await bootstrapSecretGeneration({ root: ROOT, ...value });
    process.stdout.write(`${result.state}${result.generationId ? ` ${result.generationId}` : ""} PASS\n`);
  } else if (verb === "export") {
    const result = await exportSecretGenerationBundle(value);
    process.stdout.write(`EXPORTED ${result.generationId} ${result.operationId} ${basename(result.bundlePath)} PASS\n`);
  } else {
    const result = await importSecretGenerationBundle(value);
    process.stdout.write(`${result.state} ${result.generationId} ${result.operationId} ${basename(value.bundlePath)} PASS\n`);
  }
} catch (error) {
  usage();
  const message = typeof error?.message === "string" && /^[A-Z_]+$/.test(error.message) ? error.message : "OPERATION_FAILED";
  process.stderr.write(`FAIL ${message}\n`);
  process.exitCode = 1;
}
