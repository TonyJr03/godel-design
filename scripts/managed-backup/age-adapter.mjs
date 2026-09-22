import { lstat } from "node:fs/promises";

import { runCommand } from "./command-runner.mjs";
import {
  buildAgeDecryptVerificationPlan,
  buildAgeEncryptPlan,
} from "./command-plans.mjs";

async function requireNonemptyFile(pathname, label) {
  const state = await lstat(pathname).catch((error) => {
    if (error?.code === "ENOENT") throw new Error(`${label} was not produced`);
    throw error;
  });
  if (!state.isFile() || state.isSymbolicLink() || state.size === 0) throw new Error(`${label} is not a nonempty regular file`);
  return state.size;
}

export function createAgeAdapter({ runner = runCommand } = {}) {
  return Object.freeze({
    async probeVersion({ cwd, allowedEnvironment = {} }) {
      return runner({
        operation: "discover age version",
        executable: "age",
        args: ["--version"],
        cwd,
        allowedEnvironment,
      });
    },

    async encryptFile({ recipient, plaintextPath, ciphertextPath, cwd, allowedEnvironment = {} }) {
      await requireNonemptyFile(plaintextPath, "Age plaintext input");
      const plan = buildAgeEncryptPlan({ recipient, inputPath: plaintextPath, outputPath: ciphertextPath });
      await runner({ operation: plan.operation, executable: plan.executable, args: plan.args, cwd, allowedEnvironment });
      return { ciphertextPath, size: await requireNonemptyFile(ciphertextPath, "Age ciphertext") };
    },

    async verifyByDecryption({ ciphertextPath, verificationOutputPath, identityFile, cwd, allowedEnvironment = {} }) {
      await requireNonemptyFile(ciphertextPath, "Age ciphertext");
      const plan = buildAgeDecryptVerificationPlan({ ciphertextPath, outputPath: verificationOutputPath, identityFile });
      await runner({ operation: plan.operation, executable: plan.executable, args: plan.args, cwd, allowedEnvironment });
      return { verified: true, size: await requireNonemptyFile(verificationOutputPath, "Age verification plaintext") };
    },
  });
}
