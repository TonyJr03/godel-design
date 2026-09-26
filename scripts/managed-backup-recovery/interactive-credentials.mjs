function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryInteractiveCredentialError";
  error.code = code;
  throw error;
}

function readHiddenLine({ input, output, prompt }) {
  return new Promise((resolve, reject) => {
    let value = "";
    let decoder = new TextDecoder("utf-8", { fatal: true });
    const invalidUtf8 = () => Object.assign(new Error("Interactive recovery login contains invalid UTF-8"), { code: "RECOVERY_LOGIN_UTF8_INVALID" });
    const onData = (chunk) => {
      try {
        for (const byte of Buffer.from(chunk)) {
          if (byte === 3 || byte === 27) { cleanup(); reject(Object.assign(new Error("Interactive recovery login cancelled"), { code: "RECOVERY_LOGIN_CANCELLED" })); return; }
          if (byte === 13 || byte === 10) {
            value += decoder.decode();
            cleanup();
            output.write("\n");
            resolve(value);
            return;
          }
          if (byte === 8 || byte === 127) {
            value += decoder.decode();
            decoder = new TextDecoder("utf-8", { fatal: true });
            value = [...value].slice(0, -1).join("");
            continue;
          }
          if (byte >= 32 && byte !== 127) value += decoder.decode(Uint8Array.of(byte), { stream: true });
        }
      } catch {
        cleanup();
        reject(invalidUtf8());
      }
    };
    const cleanup = () => input.off("data", onData);
    output.write(prompt);
    input.on("data", onData);
  });
}

export function createHiddenTtyTerminal({ input = process.stdin, output = process.stderr } = {}) {
  return Object.freeze({
    async readPair() {
      if (input.isTTY !== true || output.isTTY !== true || typeof input.setRawMode !== "function") fail("RECOVERY_LOGIN_TTY_REQUIRED", "Interactive TTY is required for recovery login");
      const wasRaw = input.isRaw === true;
      try {
        input.setRawMode(true);
        input.resume();
        const identifier = await readHiddenLine({ input, output, prompt: "Local recovery login identifier: " });
        const password = await readHiddenLine({ input, output, prompt: "Local recovery login password: " });
        return { identifier, password };
      } finally {
        input.setRawMode(wasRaw);
        input.pause();
      }
    },
  });
}

export function createInteractiveCredentialProvider({ terminal = createHiddenTtyTerminal() } = {}) {
  if (!terminal || typeof terminal.readPair !== "function") fail("RECOVERY_LOGIN_PROVIDER_INVALID", "Interactive credential provider is invalid");
  return Object.freeze({
    async getCredentials() {
      const credentials = await terminal.readPair();
      if (!credentials || Object.keys(credentials).length !== 2 || typeof credentials.identifier !== "string" || typeof credentials.password !== "string" || credentials.identifier.length === 0 || credentials.password.length === 0 || /[\r\n\0]/.test(credentials.identifier) || /[\r\n\0]/.test(credentials.password)) fail("RECOVERY_LOGIN_CREDENTIALS_INVALID", "Interactive recovery login credentials are invalid");
      return Object.freeze({ identifier: credentials.identifier, password: credentials.password });
    },
  });
}
