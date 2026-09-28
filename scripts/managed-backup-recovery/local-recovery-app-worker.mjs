import { createServer } from "node:http";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";

import next from "next";

import { verifyResolvedLocalRecoveryNextVolumeTopology } from "./application-runtime-topology.mjs";
import { buildLocalRecoveryNextOptions, verifyLocalRecoveryAppDependencyTopology, verifyLocalRecoveryAppGeneratedRuntime } from "./local-recovery-app.mjs";
import { terminateRecoveryAppWorker } from "./worker-process-lifecycle.mjs";

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
    await terminateRecoveryAppWorker({ processLike: process, outcome: "success" });
  } catch {
    await terminateRecoveryAppWorker({ processLike: process, outcome: "failure" });
  }
}

process.once("message", async (message) => {
  try {
    if (!message || message.type !== "start" || message.host !== "127.0.0.1" || !Number.isSafeInteger(message.port)
      || typeof message.projectDir !== "string") throw new Error("invalid contract");
    if (typeof process.env.NODE_PATH !== "string" || process.env.NODE_PATH.length === 0) throw new Error("missing dependency authority");
    await verifyLocalRecoveryAppDependencyTopology({ projectDir: message.projectDir, nodePath: process.env.NODE_PATH });
    const projectRequire = createRequire(resolve(message.projectDir, "package.json"));
    const dependencyRoot = resolve(process.env.NODE_PATH ?? "");
    for (const dependency of ["next", "react", "react-dom"]) {
      const resolvedDependency = projectRequire.resolve(dependency);
      const dependencyRelative = relative(dependencyRoot, resolve(resolvedDependency));
      if (dependencyRelative.startsWith("..") || isAbsolute(dependencyRelative)) throw new Error("invalid dependency authority");
    }
    const resolvedNextPackage = projectRequire.resolve("next/package.json");
    const nextPackageRelative = relative(dependencyRoot, resolve(resolvedNextPackage));
    if (nextPackageRelative.startsWith("..") || isAbsolute(nextPackageRelative)) throw new Error("invalid dependency authority");
    verifyResolvedLocalRecoveryNextVolumeTopology({ projectDir: message.projectDir, resolvedNextPackage });
    nextApp = next(buildLocalRecoveryNextOptions({ projectDir: message.projectDir, host: message.host, port: message.port }));
    await nextApp.prepare();
    await verifyLocalRecoveryAppGeneratedRuntime({ projectDir: message.projectDir });
    const handler = nextApp.getRequestHandler();
    httpServer = createServer((request, response) => handler(request, response));
    await new Promise((accept, reject) => {
      httpServer.once("error", reject);
      httpServer.listen({ host: message.host, port: message.port, exclusive: true }, accept);
    });
    send({ type: "ready" });
  } catch (error) {
    const code = new Set([
      "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID",
      "RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH",
      "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH",
      "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH",
    ]).has(error?.code) ? error.code : "RECOVERY_APP_START_FAILED";
    send({ type: "failure", code });
    await stop();
  }
});

process.on("message", (message) => { if (message?.type === "stop") void stop(); });
process.once("SIGTERM", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });
