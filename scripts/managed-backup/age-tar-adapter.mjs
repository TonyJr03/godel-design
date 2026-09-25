import { lstat, mkdir } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { isSupportedAgeRecipient } from "./age-recipient.mjs";
import { runPipeline } from "./pipeline-runner.mjs";

async function requireFile(pathname, label) {
  const state = await lstat(pathname);
  if (!state.isFile() || state.isSymbolicLink() || state.size === 0) throw new Error(`${label} must be a nonempty regular file`);
  return state;
}

async function requireDirectory(pathname, label) {
  const state = await lstat(pathname);
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  return state;
}

export function createAgeTarAdapter({
  recipient,
  identityFile,
  ageExecutable = "age",
  tarExecutable = "tar",
  cwd,
  allowedEnvironment = {},
  pipeline = runPipeline,
} = {}) {
  if (!isSupportedAgeRecipient(recipient)) throw new Error("A valid public age recipient is required");
  if (typeof identityFile !== "string" || !isAbsolute(identityFile)) throw new Error("An absolute protected age identity path is required");
  if (![ageExecutable, tarExecutable, cwd].every((value) => typeof value === "string" && value.length > 0)) throw new Error("Age, tar, and cwd must be explicit");

  const pipe = (operation, left, right) => pipeline({ operation, left, right, cwd, allowedEnvironment });
  return Object.freeze({
    async encrypt({ sourceDirectory, outputPath }) {
      await requireDirectory(sourceDirectory, "Bundle source");
      const result = await pipe(
        "stream managed backup directory through tar and age",
        { executable: tarExecutable, args: ["-cf", "-", "-C", sourceDirectory, "."] },
        { executable: ageExecutable, args: ["--encrypt", "--recipient", recipient, "--output", outputPath] },
      );
      const state = await requireFile(outputPath, "Age ciphertext");
      return { ...result, outputPath, size: state.size };
    },

    async verifyCiphertext({ ciphertextPath }) {
      await requireFile(ciphertextPath, "Age ciphertext");
      const result = await pipe(
        "decrypt managed backup ciphertext and list tar stream",
        { executable: ageExecutable, args: ["--decrypt", "--identity", identityFile, ciphertextPath] },
        { executable: tarExecutable, args: ["-tf", "-"] },
      );
      const entries = result.stdout.split(/\r?\n/).filter(Boolean);
      if (!entries.some((entry) => /(?:^|\/)internal-manifest\.json$/.test(entry))) throw new Error("Decrypted tar stream is missing the internal manifest");
      return { verified: true, entries };
    },

    async extract({ ciphertextPath, destinationDirectory }) {
      await requireFile(ciphertextPath, "Age ciphertext");
      await mkdir(destinationDirectory, { recursive: false, mode: 0o700 });
      await pipe(
        "decrypt and extract managed backup ciphertext",
        { executable: ageExecutable, args: ["--decrypt", "--identity", identityFile, ciphertextPath] },
        { executable: tarExecutable, args: ["-xf", "-", "-C", destinationDirectory] },
      );
      return destinationDirectory;
    },
  });
}
