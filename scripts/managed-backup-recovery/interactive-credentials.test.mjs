import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createHiddenTtyTerminal, createInteractiveCredentialProvider } from "./interactive-credentials.mjs";

test("interactive credentials remain in-memory and provider exposes no values", async () => {
  const provider = createInteractiveCredentialProvider({ terminal: { readPair: async () => ({ identifier: "person@example.invalid", password: "private-password" }) } });
  assert.deepEqual(Object.keys(provider), ["getCredentials"]);
  assert.deepEqual(await provider.getCredentials(), { identifier: "person@example.invalid", password: "private-password" });
  assert.ok(!JSON.stringify(provider).includes("person@example.invalid"));
});

test("interactive cancellation and malformed credentials fail closed", async () => {
  const cancelled = createInteractiveCredentialProvider({ terminal: { readPair: async () => { throw Object.assign(new Error("cancel"), { code: "RECOVERY_LOGIN_CANCELLED" }); } } });
  await assert.rejects(cancelled.getCredentials(), { code: "RECOVERY_LOGIN_CANCELLED" });
  const empty = createInteractiveCredentialProvider({ terminal: { readPair: async () => ({ identifier: "", password: "" }) } });
  await assert.rejects(empty.getCredentials(), { code: "RECOVERY_LOGIN_CREDENTIALS_INVALID" });
});

test("hidden TTY terminal restores raw mode in finally after cancellation without echoing input", async () => {
  const input = new EventEmitter();
  input.isTTY = true;
  input.isRaw = false;
  input.resume = () => undefined;
  let paused = false;
  input.pause = () => { paused = true; };
  const modes = [];
  input.setRawMode = (value) => { modes.push(value); input.isRaw = value; };
  let written = "";
  const output = { isTTY: true, write(value) { written += value; } };
  const provider = createInteractiveCredentialProvider({ terminal: createHiddenTtyTerminal({ input, output }) });
  const operation = provider.getCredentials();
  queueMicrotask(() => input.emit("data", Buffer.from([3])));
  await assert.rejects(operation, { code: "RECOVERY_LOGIN_CANCELLED" });
  assert.deepEqual(modes, [true, false]);
  assert.equal(paused, true);
  assert.ok(!written.includes("secret"));
});

test("hidden TTY decodes UTF-8 exactly, removes a whole code point, and never echoes credentials", async () => {
  const input = new EventEmitter();
  input.isTTY = true;
  input.isRaw = false;
  input.resume = () => undefined;
  let paused = false;
  input.pause = () => { paused = true; };
  const modes = [];
  input.setRawMode = (value) => { modes.push(value); input.isRaw = value; };
  let written = "";
  const output = { isTTY: true, write(value) { written += value; } };
  const provider = createInteractiveCredentialProvider({ terminal: createHiddenTtyTerminal({ input, output }) });
  const operation = provider.getCredentials();
  const identifier = "josé+漢@example.invalid";
  const password = "pä🔐";
  queueMicrotask(() => input.emit("data", Buffer.concat([Buffer.from(identifier, "utf8"), Buffer.from([13])])));
  setImmediate(() => input.emit("data", Buffer.concat([Buffer.from(`${password}x`, "utf8"), Buffer.from([127, 13])])));
  assert.deepEqual(await operation, { identifier, password });
  assert.deepEqual(modes, [true, false]);
  assert.equal(paused, true);
  assert.ok(!written.includes(identifier));
  assert.ok(!written.includes(password));
});
