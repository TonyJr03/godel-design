import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createIncompleteFailureReceipt,
  writeFailureReceiptAtomic,
} from "./failure-receipt.mjs";

const BASE = {
  failedAt: new Date("2026-09-22T12:00:00.000Z"),
  toolingGitSha: "a".repeat(40),
  toolingGitBranch: "ops/managed-free-production-pilot",
  productionRuntimeSha: "b".repeat(40),
  failureCode: "SYNTHETIC_FAILURE",
  failurePhase: "FINAL_VERIFICATION",
};

test("failure receipt is reduced, atomic, and never overwrites an existing ID", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "godel-failure-receipt-"));
  const first = createIncompleteFailureReceipt({ ...BASE, backupId: "GDBK-20260922T120000Z-AAAAAAAA" });
  const second = createIncompleteFailureReceipt({ ...BASE, backupId: "GDBK-20260922T120001Z-AAAAAAAB" });
  const firstPath = await writeFailureReceiptAtomic(first, { outputRoot });
  const secondPath = await writeFailureReceiptAtomic(second, { outputRoot });
  assert.equal(JSON.parse(await readFile(firstPath, "utf8")).status, "INCOMPLETE");
  assert.equal(JSON.parse(await readFile(secondPath, "utf8")).backupId, second.backupId);
  await assert.rejects(writeFailureReceiptAtomic(first, { outputRoot }), (error) => error.code === "EEXIST");
  assert.deepEqual(JSON.parse(await readFile(firstPath, "utf8")), first);
});
