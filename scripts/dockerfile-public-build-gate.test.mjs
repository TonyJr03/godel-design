import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("Dockerfile", "utf8");
const instructions = dockerfile
  .replace(/\\\r?\n/g, " ")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

function validateBuildInputs({ url, nonce, secretMounted, publishableFile }) {
  if (!url) throw new Error("Missing required public build configuration: NEXT_PUBLIC_SUPABASE_URL");
  if (!nonce) throw new Error("Missing required public build configuration: GODEL_PUBLIC_BUILD_NONCE");
  if (!secretMounted) throw new Error("BuildKit required publishable secret is unavailable");
  if (!publishableFile) {
    throw new Error("Missing required public build configuration: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  return { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableFile };
}

test("public URL and nonempty BuildKit secret conceptually provide Next build input", () => {
  const environment = validateBuildInputs({
    url: "https://example.test",
    nonce: "synthetic-nonce",
    secretMounted: true,
    publishableFile: "synthetic-publishable-input",
  });

  assert.equal(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "synthetic-publishable-input");
});

test("missing URL fails by variable name without values", () => {
  assert.throws(
    () => validateBuildInputs({ nonce: "synthetic-nonce", secretMounted: true, publishableFile: "synthetic-publishable-input" }),
    /NEXT_PUBLIC_SUPABASE_URL/,
  );
});

test("missing BuildKit secret fails before a value can be read", () => {
  assert.throws(
    () => validateBuildInputs({ url: "https://example.test", nonce: "synthetic-nonce", secretMounted: false }),
    /BuildKit required publishable secret is unavailable/,
  );
});

test("empty publishable secret file fails by variable name without values", () => {
  assert.throws(
    () => validateBuildInputs({ url: "https://example.test", nonce: "synthetic-nonce", secretMounted: true, publishableFile: "" }),
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
  );
});

test("missing non-secret build nonce fails by variable name without values", () => {
  assert.throws(
    () => validateBuildInputs({ url: "https://example.test", secretMounted: true, publishableFile: "synthetic-publishable-input" }),
    /GODEL_PUBLIC_BUILD_NONCE/,
  );
});

test("Dockerfile retires publishable ARG and ENV while keeping URL ARG", () => {
  assert.ok(instructions.includes("ARG NEXT_PUBLIC_SUPABASE_URL"));
  assert.equal(instructions.some((line) => /^ARG\s+NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY(?:\s|=|$)/.test(line)), false);
  assert.equal(instructions.some((line) => /^ENV\s+NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY(?:\s|=|$)/.test(line)), false);
  assert.equal(instructions.some((line) => /^(?:ARG|ENV)\s+SUPABASE_SECRET_KEY(?:\s|=|$)/.test(line)), false);
});

test("Dockerfile mounts the required publishable secret in the same RUN as Next build", () => {
  const buildInstruction = instructions.find((line) => line.startsWith("RUN --mount=type=secret,"));

  assert.ok(buildInstruction);
  assert.match(buildInstruction, /id=godel_supabase_publishable_key/);
  assert.match(buildInstruction, /required=true/);
  assert.match(buildInstruction, /\/run\/secrets\/godel_supabase_publishable_key/);
  assert.match(buildInstruction, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(buildInstruction, /npm/);
  assert.match(buildInstruction, /run/);
  assert.match(buildInstruction, /build/);
});

test("Dockerfile uses the non-secret nonce in the same publishable-consuming build layer", () => {
  const nonceIndex = instructions.indexOf("ARG GODEL_PUBLIC_BUILD_NONCE");
  const buildIndex = instructions.findIndex((line) => line.startsWith("RUN --mount=type=secret,"));

  assert.ok(nonceIndex >= 0);
  assert.ok(nonceIndex < buildIndex);
  assert.match(instructions[buildIndex], /GODEL_PUBLIC_BUILD_NONCE/);
  assert.match(instructions[buildIndex], /if \[ -z "\$GODEL_PUBLIC_BUILD_NONCE" \]/);
});
