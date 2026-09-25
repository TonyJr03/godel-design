import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SUPPORTED_AGE_RECIPIENT_LENGTH,
  assertSupportedAgeRecipient,
  isSupportedAgeRecipient,
} from "./age-recipient.mjs";

const CLASSIC_RECIPIENT = `age1${"q".repeat(30)}`;
const SYNTHETIC_PQ_RECIPIENT = `age1pq1${"q".repeat(1993)}`;
const PLUGIN_RECIPIENT = "age-plugin-synthetic-QUJDREVGRw==";

test("supported age recipients include classic, PQ, and plugin forms", () => {
  for (const recipient of [CLASSIC_RECIPIENT, SYNTHETIC_PQ_RECIPIENT, PLUGIN_RECIPIENT]) {
    assert.equal(isSupportedAgeRecipient(recipient), true);
    assert.equal(assertSupportedAgeRecipient(recipient), recipient);
  }
});

test("private classic and PQ age identities are never recipients", () => {
  for (const identity of ["AGE-SECRET-KEY-1SYNTHETIC", "AGE-SECRET-KEY-PQ-1SYNTHETIC"]) {
    assert.equal(isSupportedAgeRecipient(identity), false);
    assert.throws(
      () => assertSupportedAgeRecipient(identity),
      (error) => error.code === "AGE_RECIPIENT_INVALID",
    );
  }
});

test("PQ age recipients reject whitespace, newlines, malformed, and oversized values", () => {
  const invalid = [
    `${SYNTHETIC_PQ_RECIPIENT} `,
    `${SYNTHETIC_PQ_RECIPIENT.slice(0, 100)}\n${SYNTHETIC_PQ_RECIPIENT.slice(100)}`,
    "age1pq1short",
    "age1pq-not-valid",
    `age1pq1${"q".repeat(MAX_SUPPORTED_AGE_RECIPIENT_LENGTH)}`,
  ];
  assert.ok(invalid.every((recipient) => isSupportedAgeRecipient(recipient) === false));
});
