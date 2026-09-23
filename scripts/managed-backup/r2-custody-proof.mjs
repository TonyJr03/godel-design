import { lstat, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "./command-runner.mjs";
import {
  createExternalReceipt,
  verifyExternalCiphertext,
  writeExternalReceiptAtomic,
} from "./external-receipt.mjs";
import { createManagedBackupId } from "./manifest.mjs";
import { PRODUCTION_BACKUP_BRANCH, assertProductionGitAuthority } from "./production-contract.mjs";
import { resolveProductionGitAuthority } from "./production-backup.mjs";
import { createR2ExternalPublicationAdapter, createR2ProofRunId } from "./r2-external-custody.mjs";

export const R2_CUSTODY_PROOF_CONFIRMATION = "ALLOW_SYNTHETIC_R2_CUSTODY_PROOF";
const SYNTHETIC_FIXTURE = "Godel managed R2 custody synthetic proof";
const SHA_PATTERN = /^[a-f0-9]{40}$/;

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedBackupR2ProofError";
  error.code = code;
  throw error;
}

function systemEnvironment(source = {}) {
  const environment = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (typeof source[key] === "string") environment[key] = source[key];
  }
  return environment;
}

async function cleanupProofRoot(pathname) {
  if (!pathname || dirname(pathname) !== resolve(tmpdir()) || !basename(pathname).startsWith("godel-r2-proof-")) {
    fail("R2_PROOF_CLEANUP_UNSAFE", "Synthetic proof cleanup target is unsafe");
  }
  const state = await lstat(pathname).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (!state) return;
  if (!state.isDirectory() || state.isSymbolicLink()) fail("R2_PROOF_CLEANUP_UNSAFE", "Synthetic proof root is not a real directory");
  await rm(pathname, { recursive: true, force: false });
}

export async function runR2CustodyProof({
  environment = process.env,
  repoRoot = process.cwd(),
  dependencies = {},
} = {}) {
  if (environment.GODEL_MANAGED_R2_CUSTODY_PROOF_CONFIRM !== R2_CUSTODY_PROOF_CONFIRMATION) {
    fail("R2_CUSTODY_PROOF_CONFIRMATION_REQUIRED", "Exact synthetic R2 custody proof confirmation is required");
  }

  const execute = dependencies.execute ?? runCommand;
  const resolveGit = dependencies.resolveGitAuthority ?? resolveProductionGitAuthority;
  const adapterFactory = dependencies.adapterFactory ?? createR2ExternalPublicationAdapter;
  const authority = assertProductionGitAuthority(await resolveGit({ repoRoot, sourceEnvironment: environment, execute }));
  if (authority.branch !== PRODUCTION_BACKUP_BRANCH) fail("WRONG_TOOLING_BRANCH", "Synthetic R2 proof branch is not authorized");
  const productionRuntimeSha = environment.GODEL_MANAGED_PRODUCTION_RUNTIME_SHA;
  if (!SHA_PATTERN.test(productionRuntimeSha ?? "")) fail("PRODUCTION_RUNTIME_SHA_INVALID", "Production runtime SHA is required for the synthetic receipt authority");

  const proofRunId = (dependencies.createProofRunId ?? createR2ProofRunId)();
  const backupId = (dependencies.createBackupId ?? createManagedBackupId)();
  const proofRoot = await mkdtemp(join(resolve(tmpdir()), "godel-r2-proof-"));
  const plaintextPath = join(proofRoot, "synthetic.txt");
  const identityPath = join(proofRoot, "synthetic-identity.txt");
  const ciphertextPath = join(proofRoot, `${backupId}.age`);
  const downloadRoot = join(proofRoot, "downloads");
  const allowedEnvironment = systemEnvironment(environment);
  const invoke = (operation, executable, args) => execute({ operation, executable, args, cwd: proofRoot, allowedEnvironment, secretValues: [] });

  try {
    const adapter = adapterFactory({ mode: "integration", proofRunId, environment, repoRoot, execute });
    await writeFile(plaintextPath, `${SYNTHETIC_FIXTURE}\n${proofRunId}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await invoke("generate ephemeral age identity for R2 proof", "age-keygen", ["-o", identityPath]);
    const recipientResult = await invoke("derive public age recipient for R2 proof", "age-keygen", ["-y", identityPath]);
    const recipient = recipientResult.stdout.trim();
    if (!/^age1[ac-hj-np-z02-9]{20,}$/.test(recipient)) fail("R2_PROOF_AGE_RECIPIENT_INVALID", "Synthetic proof age recipient is invalid");
    await invoke("encrypt synthetic R2 custody fixture", "age", ["--encrypt", "--recipient", recipient, "--output", ciphertextPath, plaintextPath]);
    await unlink(plaintextPath);

    const pendingReceipt = await createExternalReceipt({
      backupId,
      toolingGitSha: authority.head,
      productionRuntimeSha,
      ciphertextPath,
      externalPublicationStatus: "PENDING",
    });
    const initial = await adapter.inspectObjects({ backupId });
    if (initial.objectCount !== 0) fail("R2_OBJECT_ALREADY_EXISTS", "Synthetic R2 proof namespace is not empty");
    await adapter.publishCiphertext({ ciphertextPath, receipt: pendingReceipt });
    const downloadedCiphertextPath = await adapter.downloadCiphertext({ backupId, outputRoot: downloadRoot });
    await verifyExternalCiphertext(pendingReceipt, downloadedCiphertextPath);

    const verifiedReceipt = Object.freeze({ ...pendingReceipt, externalPublicationStatus: "VERIFIED" });
    const receiptPath = await writeExternalReceiptAtomic(verifiedReceipt, { outputRoot: proofRoot });
    await adapter.publishReceipt({ receiptPath, receipt: verifiedReceipt });
    const downloaded = await adapter.downloadReceipt({ backupId, outputRoot: downloadRoot });
    await verifyExternalCiphertext(downloaded.receipt, downloadedCiphertextPath);

    return Object.freeze({
      status: "PASS",
      proofRunId,
      backupId,
      remoteResidue: "EXPECTED_UNTIL_MANUAL_OPERATOR_CLEANUP",
    });
  } finally {
    await cleanupProofRoot(proofRoot);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runR2CustodyProof().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(`${error?.code ?? "R2_CUSTODY_PROOF_FAILED"}: ${error?.message ?? "Synthetic R2 custody proof failed"}\n`);
      process.exitCode = 1;
    },
  );
}
