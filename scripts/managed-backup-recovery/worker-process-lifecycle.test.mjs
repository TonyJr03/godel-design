import assert from "node:assert/strict";
import test from "node:test";

import { terminateRecoveryAppWorker } from "./worker-process-lifecycle.mjs";

function processFixture({ connected = true, sendThrows = false } = {}) {
  const events = [];
  const processLike = {
    connected,
    send(message, callback) {
      events.push(["send", message]);
      if (sendThrows) throw new Error("synthetic IPC unavailable");
      events.push(["callback"]);
      callback();
    },
    disconnect() { events.push(["disconnect"]); this.connected = false; },
    exit(code) { events.push(["exit", code]); },
  };
  return { processLike, events };
}

test("successful terminal lifecycle waits for ACK callback before disconnect and exit zero", async () => {
  const fixture = processFixture();
  await terminateRecoveryAppWorker({ processLike: fixture.processLike, outcome: "success" });
  assert.deepEqual(fixture.events, [
    ["send", { type: "stopped" }],
    ["callback"],
    ["disconnect"],
    ["exit", 0],
  ]);
});

test("failed terminal lifecycle sends only the fixed close code before disconnect and exit one", async () => {
  const fixture = processFixture();
  await terminateRecoveryAppWorker({ processLike: fixture.processLike, outcome: "failure" });
  assert.deepEqual(fixture.events, [
    ["send", { type: "failure", code: "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED" }],
    ["callback"],
    ["disconnect"],
    ["exit", 1],
  ]);
});

test("unavailable or throwing IPC still reaches explicit sanitized terminal exit", async () => {
  const disconnected = processFixture({ connected: false });
  await terminateRecoveryAppWorker({ processLike: disconnected.processLike, outcome: "failure" });
  assert.deepEqual(disconnected.events, [["exit", 1]]);

  const throwing = processFixture({ sendThrows: true });
  await terminateRecoveryAppWorker({ processLike: throwing.processLike, outcome: "failure" });
  assert.deepEqual(throwing.events, [
    ["send", { type: "failure", code: "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED" }],
    ["disconnect"],
    ["exit", 1],
  ]);
});
