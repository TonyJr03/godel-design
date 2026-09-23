import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { createManagedBackupBundle } from "./bundle.mjs";
import { buildSupabaseDatabaseCommandPlans, buildSupabaseDatabaseEnvironment } from "./command-plans.mjs";
import { runCommand } from "./command-runner.mjs";
import {
  assertExternalPublicationAdapter,
  createExternalReceipt,
  verifyExternalCiphertext,
  writeExternalReceiptAtomic,
} from "./external-receipt.mjs";
import { createManagedBackupId } from "./manifest.mjs";
import { createProductionAgeTarAdapter } from "./production-age-adapter.mjs";
import {
  assertLinkedProject,
  assertProductionConfirmation,
  assertProductionGitAuthority,
  assertWriterFreezeConfirmation,
  buildProductionS3CommandPlan,
  buildProductionS3Environment,
  createWriterFreezeRecord,
  readLinkedProjectRef,
  readProductionBackupConfiguration,
} from "./production-contract.mjs";
import { cleanupProductionCapture, ensureSafeOutputRoot } from "./safety.mjs";

const preparedSecrets = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedProductionBackupError";
  error.code = code;
  throw error;
}

function explicitProcessEnvironment(source = process.env) {
  const environment = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (typeof source[key] === "string") environment[key] = source[key];
  }
  return environment;
}

export async function resolveProductionGitAuthority({ repoRoot, sourceEnvironment = process.env, execute = runCommand } = {}) {
  const allowedEnvironment = explicitProcessEnvironment(sourceEnvironment);
  const invoke = (operation, args) => execute({ operation, executable: "git", args, cwd: repoRoot, allowedEnvironment });
  const [branch, head, status] = await Promise.all([
    invoke("resolve Production backup tooling branch", ["branch", "--show-current"]),
    invoke("resolve Production backup tooling HEAD", ["rev-parse", "HEAD"]),
    invoke("verify Production backup tooling worktree", ["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  return { branch: branch.stdout.trim(), head: head.stdout.trim(), clean: status.stdout.trim() === "" };
}

export function createExternalCustodyPlan({ destinationSelected = false } = {}) {
  return Object.freeze({
    boundary: "ENCRYPTED_ARTIFACT_ONLY",
    provider: null,
    destinationSelected: destinationSelected === true,
    requirements: Object.freeze([
      "OUTSIDE_APPLICATION_RUNTIME",
      "OUTSIDE_REPOSITORY",
      "OUTSIDE_SUPABASE",
      "INDEPENDENT_CREDENTIALS",
      "DOWNLOADABLE",
      "CHECKSUM_VERIFIABLE",
      "OPERATOR_CONTROLLED",
    ]),
  });
}

export async function prepareProductionBackup({
  environment = process.env,
  repoRoot = process.cwd(),
  externalPublicationAdapter = null,
  dependencies = {},
} = {}) {
  assertProductionConfirmation(environment);
  assertWriterFreezeConfirmation(environment);
  const configuration = readProductionBackupConfiguration(environment);
  const resolveGit = dependencies.resolveGitAuthority ?? resolveProductionGitAuthority;
  const authority = assertProductionGitAuthority(await resolveGit({ repoRoot, sourceEnvironment: environment }));
  const linkedReader = dependencies.readLinkedProjectRef ?? readLinkedProjectRef;
  const linkedProjectRef = await linkedReader({ repoRoot });
  assertLinkedProject(configuration.projectRef, linkedProjectRef);
  const ensureOutput = dependencies.ensureSafeOutputRoot ?? ensureSafeOutputRoot;
  const outputRoot = await ensureOutput(configuration.outputRoot, { repoRoot });

  const databaseEnvironment = buildSupabaseDatabaseEnvironment({
    target: "linked",
    databasePassword: configuration.databasePassword,
    sourceEnvironment: environment,
  });
  const databasePlans = buildSupabaseDatabaseCommandPlans({ target: "linked" });
  const s3Environment = buildProductionS3Environment(configuration, environment);
  const storageCaptureRoot = join(outputRoot, ".capture-pending", "storage");
  const s3Plans = Object.freeze([
    buildProductionS3CommandPlan({ operation: "list-source", remotePath: "godel-files" }),
    buildProductionS3CommandPlan({ operation: "download-copy", remotePath: "godel-files", localPath: storageCaptureRoot }),
    buildProductionS3CommandPlan({ operation: "verify-listing", remotePath: "godel-files" }),
  ]);
  const externalCustody = createExternalCustodyPlan({ destinationSelected: externalPublicationAdapter !== null });
  const prepared = Object.freeze({
    status: "PREPARED",
    executionAuthorized: externalPublicationAdapter !== null,
    executionBlocker: externalPublicationAdapter === null ? "EXTERNAL_CUSTODY_DESTINATION_PENDING" : null,
    toolingGitSha: authority.head,
    toolingGitBranch: authority.branch,
    productionRuntimeSha: configuration.productionRuntimeSha,
    repoRoot,
    outputRoot,
    databasePlans,
    s3Plans,
    externalCustody,
  });
  preparedSecrets.set(prepared, {
    configuration,
    databaseEnvironment,
    s3Environment,
    externalPublicationAdapter,
    processEnvironment: explicitProcessEnvironment(environment),
  });
  return prepared;
}

function assertCaptureAdapter(adapter) {
  if (!adapter || typeof adapter.captureReadOnly !== "function") {
    fail("PRODUCTION_CAPTURE_ADAPTER_REQUIRED", "A read-only Production capture adapter is required");
  }
  return adapter;
}

export async function executePreparedProductionBackup(prepared, {
  captureAdapter,
  encryptionAdapter,
  now = () => new Date(),
  bundle = createManagedBackupBundle,
} = {}) {
  const secret = preparedSecrets.get(prepared);
  if (!secret || prepared.executionAuthorized !== true) fail("PRODUCTION_EXECUTION_NOT_AUTHORIZED", "Prepared Production backup execution gate is blocked");
  const custody = assertExternalPublicationAdapter(secret.externalPublicationAdapter);
  const capture = assertCaptureAdapter(captureAdapter);
  const backupId = createManagedBackupId({ now: now() });
  const captureRoot = join(prepared.outputRoot, `.capture-${backupId}`);
  const storageCaptureRoot = join(captureRoot, "storage");
  const executionS3Plans = Object.freeze([
    buildProductionS3CommandPlan({ operation: "list-source", remotePath: "godel-files" }),
    buildProductionS3CommandPlan({ operation: "download-copy", remotePath: "godel-files", localPath: storageCaptureRoot }),
    buildProductionS3CommandPlan({ operation: "verify-listing", remotePath: "godel-files" }),
  ]);
  await mkdir(captureRoot, { recursive: false, mode: 0o700 });
  const freezeStartedAt = now().toISOString();
  let captured;
  let freeze;
  try {
    captured = await capture.captureReadOnly({
      backupId,
      captureRoot,
      databasePlans: prepared.databasePlans,
      databaseEnvironment: secret.databaseEnvironment,
      s3Plans: executionS3Plans,
      s3Environment: secret.s3Environment,
      storageCaptureRoot,
    });
    if (!captured || typeof captured !== "object") fail("PRODUCTION_CAPTURE_INVALID", "Production capture adapter returned no evidence");
    freeze = createWriterFreezeRecord({ startedAt: freezeStartedAt, ...captured.freeze, endedAt: now().toISOString() });
  } catch (error) {
    await cleanupProductionCapture({ outputRoot: prepared.outputRoot, capturePath: captureRoot });
    throw error;
  }
  await cleanupProductionCapture({ outputRoot: prepared.outputRoot, capturePath: captureRoot });
  const ageAdapter = encryptionAdapter ?? createProductionAgeTarAdapter({
    recipient: secret.configuration.ageRecipient,
    cwd: prepared.outputRoot,
    allowedEnvironment: secret.processEnvironment,
  });
  const result = await bundle({
    outputRoot: prepared.outputRoot,
    repoRoot: prepared.repoRoot,
    backupId,
    createdAt: now(),
    toolingGitSha: prepared.toolingGitSha,
    toolingGitBranch: prepared.toolingGitBranch,
    productionRuntimeSha: prepared.productionRuntimeSha,
    databaseCounts: captured.databaseCounts,
    authInventory: captured.authInventory,
    storageInventory: captured.storageInventory,
    configurationSnapshot: captured.configurationSnapshot,
    toolVersions: captured.toolVersions,
    syntheticArtifacts: [
      ...(captured.artifacts ?? []),
      { path: "operations/writer-freeze.json", content: `${JSON.stringify(freeze, null, 2)}\n` },
    ],
    encryptionAdapter: ageAdapter,
  });
  const pendingReceipt = await createExternalReceipt({
    backupId,
    toolingGitSha: prepared.toolingGitSha,
    productionRuntimeSha: prepared.productionRuntimeSha,
    ciphertextPath: result.finalPath,
    externalPublicationStatus: "PENDING",
  });
  await custody.publishCiphertext({ ciphertextPath: result.finalPath, receipt: pendingReceipt });
  const downloadedPath = await custody.downloadCiphertext({ backupId, outputRoot: prepared.outputRoot });
  await verifyExternalCiphertext(pendingReceipt, downloadedPath);
  const receipt = Object.freeze({ ...pendingReceipt, externalPublicationStatus: "VERIFIED" });
  const receiptPath = await writeExternalReceiptAtomic(receipt, { outputRoot: prepared.outputRoot });
  await custody.publishReceipt({ receiptPath, receipt });
  return { ...result, externalPublication: "VERIFIED", receipt, receiptPath };
}

export async function runProductionBackup(options = {}) {
  const prepared = await prepareProductionBackup(options);
  if (!prepared.executionAuthorized) return prepared;
  return executePreparedProductionBackup(prepared, options);
}
