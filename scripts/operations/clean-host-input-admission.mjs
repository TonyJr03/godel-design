import { relative, resolve, sep } from "node:path";
import { readReconstructionManifest, validateReconstructionManifestAgainstRepository } from "./portability-manifest.mjs";
import { assertProtectedTransportPath, readSecretGenerationBundle } from "./secret-generation-transport.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

function fail(code) { throw new Error(`INPUT_ADMISSION_${code}`); }
function strictDescendant(parent, child) { const relation = relative(resolve(parent), resolve(child)); return relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`); }
function safeRelative(value) { return typeof value === "string" && value.length > 0 && !value.includes("\0") && !value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/.test(value) && !value.split("/").some((part) => !part || part === "." || part === ".."); }

function validationFailure(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("PROTECTED_ARTIFACT")) fail("PROTECTED_MATERIAL_INVALID");
  if (message.includes("BACKUP")) fail("BACKUP_INVALID");
  fail("REPOSITORY_BINDING");
}

function assertGenerationBindings(reconstruction, bundle) {
  const manifest = reconstruction.manifest;
  const app = manifest.godelBuilds?.find((recipe) => recipe.logicalName === "godel-app");
  if (!app || app.configurationBinding !== manifest.externalSecretGenerationId) fail("APP_CONFIGURATION_BINDING_MISMATCH");
  if (bundle.bundle.generationId !== manifest.externalSecretGenerationId) fail("GENERATION_MISMATCH");
  if (bundle.bundle.reconstruction.operationId !== manifest.operationId) fail("OPERATION_MISMATCH");
  if (bundle.bundle.reconstruction.manifestSha256 !== reconstruction.manifestSha256) fail("MANIFEST_BINDING_MISMATCH");
}

export async function admitTransportedReconstructionInputs({ manifestPath, backupPath, inputProtectedRoot, generationBundlePath, root = ROOT, readManifest = readReconstructionManifest, validateManifest = validateReconstructionManifestAgainstRepository, assertBundlePath = assertProtectedTransportPath, readBundle = readSecretGenerationBundle } = {}) {
  let reconstruction;
  try { reconstruction = await readManifest({ manifestPath }); } catch { fail("MANIFEST_INVALID"); }
  try { await validateManifest({ root, manifest: reconstruction.manifest, backup: backupPath, protectedRoot: inputProtectedRoot }); } catch (error) { validationFailure(error); }
  let bundlePath;
  try { bundlePath = await assertBundlePath({ protectedRoot: inputProtectedRoot, path: generationBundlePath, code: "BUNDLE_PATH" }); } catch { fail("PATH"); }
  let bundle;
  try { bundle = await readBundle({ bundlePath }); } catch { fail("BUNDLE_INVALID"); }
  assertGenerationBindings(reconstruction, bundle);
  return Object.freeze({ state: "PASS", operationId: reconstruction.manifest.operationId, manifest: "VERIFIED", repositoryBinding: "VERIFIED", backup: "VERIFIED", protectedRecoveryMaterial: "VERIFIED", generationBundle: "VERIFIED", generationAlignment: "EXACT" });
}

export function parseInputAdmissionArgs(args, root = ROOT) {
  if (args.length !== 8 || args[0] !== "--manifest" || args[2] !== "--backup" || args[4] !== "--input-protected-root" || args[6] !== "--bundle" || !safeRelative(args[1]) || !safeRelative(args[3]) || !safeRelative(args[5]) || !safeRelative(args[7])) fail("PATH");
  const backupBase = resolve(root, "backups"), inputProtectedBase = resolve(root, "protected-recovery-material");
  const backupPath = resolve(root, args[3]), inputProtectedRoot = resolve(root, args[5]);
  if (!strictDescendant(backupBase, backupPath) || !strictDescendant(inputProtectedBase, inputProtectedRoot)) fail("PATH");
  return { manifestPath: resolve(root, args[1]), backupPath, inputProtectedRoot, generationBundlePath: resolve(inputProtectedRoot, args[7]) };
}

export function renderInputAdmissionResult(result) { return `${JSON.stringify(result)}\n`; }
export function renderInputAdmissionFailure(error) { return `FAIL ${error?.message?.startsWith("INPUT_ADMISSION_") ? error.message : "INPUT_ADMISSION_FAILED"}\n`; }

if (import.meta.main) {
  try { process.stdout.write(renderInputAdmissionResult(await admitTransportedReconstructionInputs(parseInputAdmissionArgs(process.argv.slice(2))))); } catch (error) { process.stderr.write(renderInputAdmissionFailure(error)); process.exitCode = 1; }
}
