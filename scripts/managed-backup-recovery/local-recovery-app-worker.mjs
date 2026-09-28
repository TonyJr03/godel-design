import { createServer } from "node:http";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";

import next from "next";

let nextApp;
let httpServer;
let stopping = false;

function send(message) {
  if (typeof process.send === "function") process.send(message);
}

async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    if (httpServer?.listening) await new Promise((accept, reject) => httpServer.close((error) => error ? reject(error) : accept()));
    if (nextApp) await nextApp.close();
    if (typeof process.send === "function") process.send({ type: "stopped" }, () => process.disconnect());
    process.exitCode = 0;
  } catch {
    send({ type: "failure", code: "RECOVERY_APP_CLEANUP_INCOMPLETE" });
    process.exitCode = 1;
  }
}

process.once("message", async (message) => {
  try {
    if (!message || message.type !== "start" || message.host !== "127.0.0.1" || !Number.isSafeInteger(message.port)
      || typeof message.projectDir !== "string" || typeof message.distDir !== "string") throw new Error("invalid contract");
    const relativeDistDir = relative(message.projectDir, message.distDir);
    if (relativeDistDir.startsWith("..") || resolve(message.projectDir, relativeDistDir) !== resolve(message.distDir)) throw new Error("invalid distDir");
    if (typeof process.env.NODE_PATH !== "string" || process.env.NODE_PATH.length === 0) throw new Error("missing dependency authority");
    const projectRequire = createRequire(resolve(message.projectDir, "package.json"));
    const dependencyRoot = resolve(process.env.NODE_PATH ?? "");
    for (const dependency of ["next", "react", "react-dom"]) {
      const resolvedDependency = projectRequire.resolve(dependency);
      const dependencyRelative = relative(dependencyRoot, resolve(resolvedDependency));
      if (dependencyRelative.startsWith("..") || isAbsolute(dependencyRelative)) throw new Error("invalid dependency authority");
    }
    nextApp = next({ dev: true, dir: message.projectDir, hostname: message.host, port: message.port, quiet: true, webpack: true, conf: { distDir: relativeDistDir } });
    if (resolve(message.projectDir, nextApp.options?.conf?.distDir ?? "") !== resolve(message.distDir)) throw new Error("distDir override rejected");
    await nextApp.prepare();
    const handler = nextApp.getRequestHandler();
    httpServer = createServer((request, response) => handler(request, response));
    await new Promise((accept, reject) => {
      httpServer.once("error", reject);
      httpServer.listen({ host: message.host, port: message.port, exclusive: true }, accept);
    });
    send({ type: "ready" });
  } catch {
    send({ type: "failure", code: "RECOVERY_APP_START_FAILED" });
    await stop();
  }
});

process.on("message", (message) => { if (message?.type === "stop") void stop(); });
process.once("SIGTERM", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });
