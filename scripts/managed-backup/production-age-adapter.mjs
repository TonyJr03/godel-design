import { lstat, open } from "node:fs/promises";

import { isSupportedAgeRecipient } from "./age-recipient.mjs";
import { sha256File } from "./checksums.mjs";
import { runPipeline } from "./pipeline-runner.mjs";

const AGE_HEADER = Buffer.from("age-encryption.org/v1\n", "ascii");

async function assertAgeHeader(pathname) {
  const handle = await open(pathname, "r");
  try {
    const buffer = Buffer.alloc(AGE_HEADER.length);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== AGE_HEADER.length || !buffer.equals(AGE_HEADER)) throw new Error("Ciphertext does not contain an age v1 header");
  } finally {
    await handle.close();
  }
}

export function createProductionAgeTarAdapter({
  recipient,
  ageExecutable = "age",
  tarExecutable = "tar",
  cwd,
  allowedEnvironment = {},
  pipeline = runPipeline,
} = {}) {
  if (!isSupportedAgeRecipient(recipient)) throw new Error("A valid public age recipient is required");
  if (![ageExecutable, tarExecutable, cwd].every((value) => typeof value === "string" && value.length > 0)) throw new Error("Age, tar, and cwd must be explicit");
  const pipe = (operation, left, right) => pipeline({ operation, left, right, cwd, allowedEnvironment });
  return Object.freeze({
    async encrypt({ sourceDirectory, outputPath }) {
      const state = await lstat(sourceDirectory);
      if (!state.isDirectory() || state.isSymbolicLink()) throw new Error("Bundle source must be a real directory");
      await pipe(
        "stream Production backup directory through tar and age",
        { executable: tarExecutable, args: ["-cf", "-", "-C", sourceDirectory, "."] },
        { executable: ageExecutable, args: ["--encrypt", "--recipient", recipient, "--output", outputPath] },
      );
      const digest = await sha256File(outputPath);
      if (digest.size === 0) throw new Error("Age ciphertext must be nonempty");
      await assertAgeHeader(outputPath);
      return { outputPath, ...digest };
    },
    async verifyCiphertext({ ciphertextPath }) {
      const digest = await sha256File(ciphertextPath);
      if (digest.size === 0) throw new Error("Age ciphertext must be nonempty");
      await assertAgeHeader(ciphertextPath);
      return { verified: true, verification: "AGE_V1_HEADER_AND_SHA256", ...digest };
    },
  });
}
