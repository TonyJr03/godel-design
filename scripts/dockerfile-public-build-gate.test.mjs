import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("Dockerfile", "utf8");
const gateMatch = dockerfile.match(/^RUN node -e '(.+)'$/m);

assert.ok(gateMatch, "Dockerfile must contain the non-expanding public build gate");

function runGate(environment) {
  return spawnSync(process.execPath, ["-e", gateMatch[1]], {
    encoding: "utf8",
    env: environment,
  });
}

test("public build gate accepts both synthetic values", () => {
  const result = runGate({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("public build gate identifies a missing URL without disclosing values", () => {
  const result = runGate({
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    "Missing required public build configuration: NEXT_PUBLIC_SUPABASE_URL\n",
  );
});

test("public build gate identifies a missing publishable key without disclosing values", () => {
  const result = runGate({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.test",
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    "Missing required public build configuration: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\n",
  );
});
