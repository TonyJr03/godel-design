import { lstat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { useRecoveryIdentityPath as accessRecoveryIdentityPath } from "./recovery-contract.mjs";

const PLATFORM_KEYS = Object.freeze(["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE"]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryAgeDecryptError";
  error.code = code;
  throw error;
}

function platformEnvironment(source) {
  return Object.freeze(Object.fromEntries(PLATFORM_KEYS.filter((key) => typeof source?.[key] === "string").map((key) => [key, source[key]])));
}

export function createAgeDecryptAdapter({ session, environment = process.env, execute = runCommand, executable = "age" } = {}) {
  if (!session || typeof session.plaintext !== "string" || typeof execute !== "function" || typeof executable !== "string" || executable.length === 0) fail("RECOVERY_DECRYPT_ADAPTER_INVALID", "Recovery age decrypt adapter configuration is invalid");
  return Object.freeze({
    async decryptToTar({ ciphertextPath, archivePath, identity } = {}) {
      const ciphertext = resolve(ciphertextPath ?? "");
      const archive = resolve(archivePath ?? "");
      if (!isAbsolute(ciphertextPath ?? "") || !isAbsolute(archivePath ?? "") || dirname(archive) !== resolve(session.plaintext) || archive !== resolve(session.plaintext, "managed-recovery.tar")) fail("RECOVERY_DECRYPT_PATH_INVALID", "Recovery decrypt paths are outside the governed session boundary");
      const inputState = await lstat(ciphertext).catch(() => null);
      if (!inputState?.isFile() || inputState.isSymbolicLink() || inputState.size <= 0) fail("RECOVERY_CIPHERTEXT_INVALID", "Recovery ciphertext must be a nonempty regular file");
      if (await lstat(archive).then(() => true, (error) => error?.code === "ENOENT" ? false : Promise.reject(error))) fail("RECOVERY_DECRYPT_OUTPUT_EXISTS", "Recovery plaintext archive already exists");
      await accessRecoveryIdentityPath(identity, async (identityPath, identityRedactions) => execute({
        operation: "decrypt managed recovery ciphertext to tar",
        executable,
        args: ["--decrypt", "--identity", identityPath, "--output", archive, ciphertext],
        cwd: session.plaintext,
        allowedEnvironment: platformEnvironment(environment),
        redactionValues: Object.freeze([...identityRedactions, ciphertext, archive]),
      }));
      const outputState = await lstat(archive).catch(() => null);
      if (!outputState?.isFile() || outputState.isSymbolicLink() || outputState.size <= 0) fail("RECOVERY_DECRYPT_OUTPUT_INVALID", "Recovery decrypt output is not a nonempty regular file");
      return Object.freeze({ status: "PASS" });
    },
  });
}
