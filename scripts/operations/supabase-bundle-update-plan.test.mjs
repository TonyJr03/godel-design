import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createUpdatePlan } from "./supabase-bundle-update-plan.mjs";

const execFile = promisify(execFileCallback);
const SERVICES = ["api-gw", "supavisor", "auth", "realtime", "storage", "functions", "db"];
const VALID_OVERRIDE = `services:
  api-gw:
    ports: !override []
    networks:
      godel-supabase-api:
        aliases:
          - api-gw
  supavisor:
    ports: !override []
  auth:
    environment:
      GOTRUE_JWT_KEYS: '\${JWT_KEYS:-[]}'
  realtime:
    environment:
      API_JWT_JWKS: '\${JWT_JWKS:-{"keys":[]}}'
  storage:
    environment:
      JWT_JWKS: '\${JWT_JWKS:-{"keys":[]}}'
  functions:
    environment:
      SUPABASE_JWKS: '\${JWT_JWKS:-{"keys":[]}}'
networks:
  godel-supabase-api:
    external: true
    name: godel-supabase-api
`;
const VALID_RUNTIME = `services:
  app:
    environment:
      NEXT_PUBLIC_SUPABASE_URL: \${NEXT_PUBLIC_SUPABASE_URL:?required}
      SUPABASE_SERVER_URL: \${SUPABASE_SERVER_URL:-}
      SUPABASE_SECRET_KEY: \${SUPABASE_SECRET_KEY:-}
`;
const JWT_KEYS_CONTRACT = "${JWT_KEYS:-[]}";
const JWT_JWKS_CONTRACT = '${JWT_JWKS:-{"keys":[]}}';

function compose({ changedService = null, missingService = null } = {}) {
  return `services:\n${SERVICES.filter((service) => service !== missingService).map((service) => `  ${service}:\n    image: example/${service}:${service === changedService ? "v2" : "v1"}`).join("\n")}\n`;
}

function effectiveCandidate({ apiGwPorts = [], supavisorPorts = [], missingService = null, externalNetwork = true, apiGwNetwork = true, missingEnvironment = null } = {}) {
  const services = {
    "api-gw": { ports: apiGwPorts, networks: apiGwNetwork ? { "godel-supabase-api": { aliases: ["api-gw"] } } : {} },
    supavisor: { ports: supavisorPorts },
    auth: { environment: { GOTRUE_JWT_KEYS: JWT_KEYS_CONTRACT } },
    realtime: { environment: { API_JWT_JWKS: JWT_JWKS_CONTRACT } },
    storage: { environment: { JWT_JWKS: JWT_JWKS_CONTRACT } },
    functions: { environment: { SUPABASE_JWKS: JWT_JWKS_CONTRACT } },
  };
  if (missingService) delete services[missingService];
  if (missingEnvironment) delete services[missingEnvironment.service].environment[missingEnvironment.variable];
  return { services, networks: { "godel-supabase-api": { external: externalNetwork } } };
}

function candidateConfigRunner(model = effectiveCandidate()) {
  return async () => ({ ok: true, output: JSON.stringify(model) });
}

async function git(args, cwd) {
  return execFile("git", args, { cwd, windowsHide: true });
}

async function write(path, contents) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

async function fixture({ forward = false, changedService = "api-gw", missingService = null, annotated = false, branchMasquerade = false, stamp = null, malformedGate = false, unexpectedDrift = false, override = VALID_OVERRIDE } = {}) {
  const root = await mkdtemp(join(tmpdir(), "godel-sh044b-test-"));
  const upstream = join(root, "upstream");
  const docker = join(upstream, "docker");
  const vendor = join(root, "infra", "supabase");
  await mkdir(upstream, { recursive: true });
  await git(["init", "-q"], upstream);
  await git(["config", "user.email", "test@example.invalid"], upstream);
  await git(["config", "user.name", "SH044B Test"], upstream);
  await write(join(docker, "docker-compose.yml"), compose());
  await write(join(docker, ".env.example"), "SAFE_SYNTHETIC=true\n");
  await write(join(docker, "CONFIG.md"), "base config\n");
  await write(join(docker, "volumes", "db", "jwt.sql"), "-- base\n");
  await write(join(docker, "upgrades.json"), "{}\n");
  await git(["add", "."], upstream);
  await git(["commit", "-qm", "base"], upstream);
  await git(["tag", "self-hosted/v0.8.0"], upstream);
  const baseCommit = (await git(["rev-parse", "HEAD"], upstream)).stdout.trim();

  if (forward || branchMasquerade) {
    await write(join(docker, "docker-compose.yml"), compose({ changedService, missingService }));
    await write(join(docker, ".env.example"), "SAFE_SYNTHETIC=true\nFORWARD_SYNTHETIC=true\n");
    await write(join(docker, "upgrades.json"), malformedGate ? '{"0.9.0": []}\n' : '{"0.9.0": {"breaking": true}}\n');
    await git(["add", "."], upstream);
    await git(["commit", "-qm", "forward"], upstream);
    if (forward) await git(annotated ? ["tag", "-a", "self-hosted/v0.9.0", "-m", "synthetic target"] : ["tag", "self-hosted/v0.9.0"], upstream);
    else await git(["branch", "self-hosted/v0.9.0"], upstream);
  }

  await write(join(root, "infra", "SUPABASE_UPSTREAM.md"), `# Upstream\n- Repositorio upstream: https://github.com/supabase/supabase\n- Commit exacto: ${baseCommit}\n`);
  await write(join(root, "infra", "supabase-upstream.lock.json"), JSON.stringify({ schema_version: 1, repository: "https://github.com/supabase/supabase.git", upstream_path: "docker/", base_ref: baseCommit, authority: "SUPABASE_UPSTREAM.md" }, null, 2));
  await write(join(vendor, "docker-compose.yml"), `${compose()}# godel\n`);
  await write(join(vendor, ".env.example"), "SAFE_SYNTHETIC=true\n# godel\n");
  await write(join(vendor, "CONFIG.md"), "godel config\n");
  await write(join(vendor, "volumes", "db", "jwt.sql"), "-- base\n-- godel\n");
  await write(join(vendor, "upgrades.json"), "{}\n");
  if (stamp !== null) await write(join(vendor, ".supabase-version"), stamp);
  if (unexpectedDrift) await write(join(vendor, "unexpected.txt"), "blocked\n");
  await write(join(root, "infra", "supabase-godel.override.yml"), override);
  await write(join(root, "compose.yaml"), VALID_RUNTIME);
  return { root, upstream, baseCommit };
}

async function plan(input, overrides = {}) {
  return createUpdatePlan({ root: input.root, snapshotRepository: input.upstream, knownDrift: new Set([".env.example", "CONFIG.md", "docker-compose.yml", "upgrades.json", "volumes/db/jwt.sql"]), target: overrides.target ?? "self-hosted/v0.8.0", dryRun: overrides.useDefaultDryRun ? undefined : (overrides.dryRun ?? (async () => ({ conflicts: false, failed: false, statuses: [] }))), runtimePreflight: overrides.runtimePreflight, runCandidateComposeConfig: overrides.runCandidateComposeConfig ?? candidateConfigRunner(), runDryRunCommand: overrides.runDryRunCommand });
}

test("zero delta accepts absent stamp, exact lightweight tag, and no candidate render", async () => {
  const input = await fixture();
  try {
    let rendered = false;
    const result = await plan(input, { runCandidateComposeConfig: async () => { rendered = true; throw new Error("zero delta must skip Compose"); } });
    assert.equal(result.plannerResult, "NO_UPDATE_REQUIRED", result.blockedBy);
    assert.equal(result.targetTag, "self-hosted/v0.8.0");
    assert.equal(result.targetCommit, input.baseCommit);
    assert.equal(result.stamp.status, "ABSENT_VALID");
    assert.equal(result.candidateCompose.status, "NOT_REQUIRED_ZERO_DELTA");
    assert.equal(result.runtimePreflight.status, "NOT_RUN");
    assert.equal(result.rollbackClass, "R0_PRE_RUNTIME_ABORT");
    assert.equal(result.recoveryBackup, "NOT_REQUIRED_WITH_EVIDENCE");
    assert.equal(rendered, false);
    assert.equal(result.tempDirectoryCleaned, true);
  } finally { await rm(input.root, { recursive: true, force: true }); }
});

test("annotated tag peels to its commit and a branch masquerading as a tag blocks", async () => {
  const annotated = await fixture({ forward: true, annotated: true });
  const branch = await fixture({ branchMasquerade: true });
  try {
    const pass = await plan(annotated, { target: "self-hosted/v0.9.0" });
    assert.equal(pass.plannerResult, "UPDATE_PLAN_READY", pass.blockedBy);
    assert.equal(pass.targetCommit, (await git(["rev-parse", "self-hosted/v0.9.0^{commit}"], annotated.upstream)).stdout.trim());
    const blocked = await plan(branch, { target: "self-hosted/v0.9.0" });
    assert.equal(blocked.plannerResult, "BLOCKED");
    assert.equal(blocked.blockedBy, "OFFICIAL_TAG_UNRESOLVED");
  } finally { await Promise.all([annotated, branch].map((value) => rm(value.root, { recursive: true, force: true }))); }
});

test("matching, malformed and mismatching stamps are fail-closed when present", async () => {
  const matching = await fixture();
  const malformed = await fixture({ stamp: "ref=self-hosted/v0.8.0\n" });
  const mismatch = await fixture({ stamp: "ref=2222222222222222222222222222222222222222\n" });
  try {
    await write(join(matching.root, "infra", "supabase", ".supabase-version"), `ref=${matching.baseCommit}\n`);
    assert.equal((await plan(matching)).stamp.status, "PRESENT_MATCHING_VALID");
    assert.equal((await plan(malformed)).blockedBy, "LOCAL_STAMP_MALFORMED");
    assert.equal((await plan(mismatch)).blockedBy, "LOCAL_STAMP_MISMATCH");
  } finally { await Promise.all([matching, malformed, mismatch].map((value) => rm(value.root, { recursive: true, force: true }))); }
});

test("authority mismatch and unexpected drift block", async () => {
  const authority = await fixture();
  const drift = await fixture({ unexpectedDrift: true });
  try {
    await write(join(authority.root, "infra", "supabase-upstream.lock.json"), JSON.stringify({ repository: "https://github.com/supabase/supabase.git", upstream_path: "docker/", base_ref: "2222222222222222222222222222222222222222", authority: "SUPABASE_UPSTREAM.md" }));
    assert.equal((await plan(authority)).blockedBy, "TRACKED_UPSTREAM_AUTHORITY_MISMATCH");
    assert.equal((await plan(drift)).blockedBy, "UNEXPECTED_GODEL_DRIFT");
  } finally { await Promise.all([authority, drift].map((value) => rm(value.root, { recursive: true, force: true }))); }
});

test("db and auth image changes require persistent runtime proof and conservative rollback", async () => {
  const db = await fixture({ forward: true, changedService: "db" });
  const auth = await fixture({ forward: true, changedService: "auth" });
  try {
    const dbPlan = await plan(db, { target: "self-hosted/v0.9.0" });
    const authPlan = await plan(auth, { target: "self-hosted/v0.9.0" });
    assert.equal(dbPlan.persistentRisk.POSTGRES, "REQUIRES_RUNTIME_PROOF");
    assert.equal(authPlan.persistentRisk.AUTH, "REQUIRES_RUNTIME_PROOF");
    assert.equal(dbPlan.rollbackClass, "R3_RECOVERY_REQUIRED_ROLLBACK");
    assert.equal(authPlan.rollbackClass, "R3_RECOVERY_REQUIRED_ROLLBACK");
  } finally { await Promise.all([db, auth].map((value) => rm(value.root, { recursive: true, force: true }))); }
});

test("effective candidate uses only temporary target Compose and Godel override in a config-only command", async () => {
  const valid = await fixture({ forward: true });
  try {
    let invocation;
    const validResult = await plan(valid, {
      target: "self-hosted/v0.9.0",
      runCandidateComposeConfig: async (value) => {
        invocation = value;
        const [targetFlag, targetPath, overrideFlag, overridePath, command, noInterpolate, noEnvResolution, format, json] = value.args.slice(1);
        assert.equal(targetFlag, "-f");
        assert.equal(overrideFlag, "-f");
        assert.equal(command, "config");
        assert.equal(noInterpolate, "--no-interpolate");
        assert.equal(noEnvResolution, "--no-env-resolution");
        assert.equal(format, "--format");
        assert.equal(json, "json");
        assert.match(targetPath, /candidate-supabase[\\/]docker-compose\.yml$/);
        assert.match(overridePath, /candidate-supabase[\\/]supabase-godel\.override\.yml$/);
        assert.doesNotMatch(`${targetPath}\n${overridePath}\n${value.cwd}`, /infra[\\/]supabase[\\/]\.env|compose\.env\.local|\.env\.local|\.env\.qa\.local/);
        assert.match(value.env.DOCKER_CONFIG, /docker-config$/);
        assert.equal(value.env.COMPOSE_DISABLE_ENV_FILE, "1");
        assert.equal(Object.hasOwn(value.env, "COMPOSE_ENV_FILES"), false);
        assert.equal(Object.hasOwn(value.env, "JWT_SECRET"), false);
        assert.match(await readFile(targetPath, "utf8"), /example\/api-gw:v2/);
        assert.equal(await readFile(overridePath, "utf8"), VALID_OVERRIDE);
        return { ok: true, output: JSON.stringify(effectiveCandidate()) };
      },
    });
    assert.equal(validResult.plannerResult, "UPDATE_PLAN_READY", validResult.blockedBy);
    assert.equal(validResult.candidateCompose.status, "PASS");
    assert.equal(invocation.command, "docker");
    assert.equal(invocation.args[0], "compose");
  } finally { await rm(valid.root, { recursive: true, force: true }); }
});

test("effective merged Compose failures are fail-closed", async () => {
  const input = await fixture({ forward: true });
  const cases = [
    ["api-gw host port", effectiveCandidate({ apiGwPorts: [{ published: "8000" }] })],
    ["Supavisor host port", effectiveCandidate({ supavisorPorts: [{ published: "6543" }] })],
    ["missing service", effectiveCandidate({ missingService: "functions" })],
    ["non-external network", effectiveCandidate({ externalNetwork: false })],
    ["missing api network", effectiveCandidate({ apiGwNetwork: false })],
    ["missing JWT/JWKS", effectiveCandidate({ missingEnvironment: { service: "auth", variable: "GOTRUE_JWT_KEYS" } })],
  ];
  try {
    for (const [, model] of cases) {
      const result = await plan(input, { target: "self-hosted/v0.9.0", runCandidateComposeConfig: candidateConfigRunner(model) });
      assert.equal(result.plannerResult, "BLOCKED");
      assert.equal(result.blockedBy, "CANDIDATE_COMPOSE_INVALID");
    }
    const parserFailure = await plan(input, { target: "self-hosted/v0.9.0", runCandidateComposeConfig: async () => ({ ok: false }) });
    assert.equal(parserFailure.plannerResult, "BLOCKED");
    assert.equal(parserFailure.blockedBy, "CANDIDATE_COMPOSE_INVALID");
  } finally { await rm(input.root, { recursive: true, force: true }); }
});

test("dry-run subprocess receives only allowlisted execution variables and its repository authority", async () => {
  const input = await fixture({ forward: true });
  const sentinels = {
    GODEL_TEST_ARBITRARY_SENTINEL: "synthetic-arbitrary",
    JWT_SECRET: "synthetic-jwt-secret",
    JWT_KEYS: "synthetic-jwt-keys",
    JWT_JWKS: "synthetic-jwt-jwks",
    SUPABASE_SECRET_KEY: "synthetic-supabase-secret",
    SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable",
    POSTGRES_PASSWORD: "synthetic-postgres-password",
    PGPASSWORD: "synthetic-pgpassword",
    SERVICE_ROLE_KEY: "synthetic-service-role",
    ANON_KEY: "synthetic-anon-key",
  };
  const previous = Object.fromEntries(Object.keys(sentinels).map((key) => [key, process.env[key]]));
  Object.assign(process.env, sentinels);
  try {
    let invocation;
    const result = await plan(input, {
      target: "self-hosted/v0.9.0",
      useDefaultDryRun: true,
      runDryRunCommand: async (value) => {
        invocation = value;
        return { stdout: "", stderr: "", code: 0 };
      },
    });
    assert.equal(result.plannerResult, "UPDATE_PLAN_READY", result.blockedBy);
    assert.equal(invocation.env.SUPABASE_REPO_URL, "https://github.com/supabase/supabase.git");
    assert.equal(invocation.args.at(-5), "--dry-run");
    assert.equal(invocation.args.at(-4), "--from");
    assert.equal(invocation.args.at(-2), "--to");
    assert.equal(typeof invocation.env.PATH, "string");
    if (process.platform === "win32") {
      assert.equal(typeof invocation.env.SystemRoot, "string");
      assert.match(invocation.command, /sh\.exe$/i);
    }
    for (const key of Object.keys(sentinels)) assert.equal(Object.hasOwn(invocation.env, key), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(input.root, { recursive: true, force: true });
  }
});

test("runtime preflight is absent, pass, or blocks with safe evidence", async () => {
  const absent = await fixture({ forward: true });
  const pass = await fixture({ forward: true });
  const fail = await fixture({ forward: true });
  const safe = async () => ({ health: "PASS", d5: "PASS", lock: "PASS", failureMarker: "PASS" });
  try {
    assert.equal((await plan(absent, { target: "self-hosted/v0.9.0" })).runtimePreflight.status, "NOT_RUN");
    assert.equal((await plan(pass, { target: "self-hosted/v0.9.0", runtimePreflight: safe })).runtimePreflight.status, "PASS");
    const failed = await plan(fail, { target: "self-hosted/v0.9.0", runtimePreflight: async () => ({ health: "PASS", d5: "FAIL", lock: "PASS", failureMarker: "PASS" }) });
    assert.equal(failed.blockedBy, "RUNTIME_PREFLIGHT_FAILED");
  } finally { await Promise.all([absent, pass, fail].map((value) => rm(value.root, { recursive: true, force: true }))); }
});

test("unclear gates and dry-run conflicts block", async () => {
  const unclear = await fixture({ forward: true, malformedGate: true });
  const conflict = await fixture({ forward: true });
  try {
    assert.equal((await plan(unclear, { target: "self-hosted/v0.9.0" })).blockedBy, "BREAKING_GATE_UNCLEAR");
    assert.equal((await plan(conflict, { target: "self-hosted/v0.9.0", dryRun: async () => ({ conflicts: true, failed: false, statuses: [] }) })).blockedBy, "UPDATE_SH_DRY_RUN_BLOCKED");
  } finally { await Promise.all([unclear, conflict].map((value) => rm(value.root, { recursive: true, force: true }))); }
});

test("non-tags are rejected before snapshot acquisition", async () => {
  const input = await fixture();
  try {
    for (const target of ["master", "HEAD", "main", undefined]) {
      const result = await createUpdatePlan({ root: input.root, target, acquireSnapshots: async () => { throw new Error("must not acquire"); } });
      assert.equal(result.plannerResult, "ERROR");
      assert.equal(result.tempDirectoryCleaned, true);
    }
  } finally { await rm(input.root, { recursive: true, force: true }); }
});
