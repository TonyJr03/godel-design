import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BASE, TARGET, allowlistedEnvironment, assertCleanupProject, composeEnvironment, createCleanupContract, createComposeInvocation, createDryRunInvocation, createFixtureContract, createGatewayPortContract, createHs256Jwt, createIsolationOverride, createRehearsalPlan, createSparseSnapshotCommands, createSyntheticSecrets, readJwtClaims, renderEffectiveCompose, resolveExactTag, resolveJq, resolveShell, safeProductionFingerprint, validateEffectiveCompose, verifyHs256Jwt, writeSyntheticRuntimeEnv } from "./supabase-update-rehearsal.mjs";

const project = "godel-sh044c-rehearsal-test123";
const workspace = join(tmpdir(), `${project}-workspace`);
const services = ["studio", "auth", "db", "supavisor", "kong"];
function model({ target = false, gatewayHost = "127.0.0.1", dbPort = false, poolerPort = false, alias = true, network = false, collision = false, bind = workspace, externalVolume = false } = {}) {
  const gateway = target ? "api-gw" : "kong";
  const all = target ? services.filter((name) => name !== "kong").concat("api-gw") : services;
  return {
    services: Object.fromEntries(all.map((name) => [name, {
      image: name === "kong" ? "kong/kong:3.9.3" : `example/${name}:v1`,
      container_name: collision && name === "auth" ? "supabase-auth" : `${project}-${name}`,
      ports: name === gateway ? [{ host_ip: gatewayHost, published: "18080", target: 8000 }] : name === "db" && dbPort ? [{ host_ip: "127.0.0.1", published: "5432", target: 5432 }] : name === "supavisor" && poolerPort ? [{ host_ip: "127.0.0.1", published: "6543", target: 6543 }] : [],
      networks: name === gateway && target ? { default: { aliases: alias ? ["api-gw", "kong"] : ["api-gw"] } } : { default: {} },
      volumes: name === "db" ? [{ type: "bind", source: bind, target: "/var/lib/postgresql/data" }, { type: "volume", source: externalVolume ? "supabase_db" : `${project}-db-config`, target: "/x" }] : [],
    }])),
    networks: network ? { production: { external: true } } : { default: {} },
  };
}

test("frozen tag constants and HS256 synthetic credentials are exact and opaque", () => {
  assert.equal(BASE.commit, "549db119c44c25167461812041ba198bde2b31a4");
  assert.equal(TARGET.commit, "241bb11c0627f2981746d37033f57dbfa81d29b0");
  const secrets = createSyntheticSecrets();
  assert.equal(verifyHs256Jwt(secrets.ANON_KEY, secrets.JWT_SECRET, "anon"), true);
  assert.equal(verifyHs256Jwt(secrets.SERVICE_ROLE_KEY, secrets.JWT_SECRET, "service_role"), true);
  const claims = readJwtClaims(secrets.ANON_KEY);
  assert.equal(Number.isInteger(claims.iat), true);
  assert.equal(Number.isInteger(claims.exp) && claims.exp > claims.iat, true);
  assert.match(secrets.SECRET_KEY_BASE, /^.{64,}$/);
  assert.match(secrets.REALTIME_DB_ENC_KEY, /^[a-f0-9]{16}$/);
  assert.match(secrets.VAULT_ENC_KEY, /^[a-f0-9]{32}$/);
  assert.match(secrets.S3_PROTOCOL_ACCESS_KEY_ID, /^[a-f0-9]{32}$/);
  assert.match(secrets.S3_PROTOCOL_ACCESS_KEY_SECRET, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(secrets).sort().includes("JWT_SECRET"), true);
  assert.doesNotMatch(JSON.stringify(Object.keys(secrets)), /[A-Za-z0-9_-]{30,}/);
  assert.equal(verifyHs256Jwt(createHs256Jwt("a", "anon"), "b", "anon"), false);
});

test("effective base and target models require isolated names, ports, networks, binds and volumes", () => {
  assert.equal(validateEffectiveCompose({ model: model(), workspace, project }).gateway, "kong");
  assert.equal(validateEffectiveCompose({ model: model({ target: true }), workspace, project }).gateway, "api-gw");
  const logicalVolume = model();
  logicalVolume.services.db.volumes[1].source = "db-config";
  logicalVolume.volumes = { "db-config": { name: `${project}-db-config` } };
  assert.equal(validateEffectiveCompose({ model: logicalVolume, workspace, project }).volumeIsolation, "PASS");
  const invalid = [
    ["production container", { collision: true }, "CONTAINER_ISOLATION_INVALID"],
    ["db port", { dbPort: true }, "PORT_ISOLATION_INVALID"],
    ["pooler port", { poolerPort: true }, "PORT_ISOLATION_INVALID"],
    ["public gateway", { gatewayHost: "0.0.0.0" }, "PORT_ISOLATION_INVALID"],
    ["production network", { network: true }, "NETWORK_ISOLATION_INVALID"],
    ["escaping bind", { bind: join(workspace, "..", "production") }, "BIND_ISOLATION_INVALID"],
    ["fixed volume", { externalVolume: true }, "VOLUME_ISOLATION_INVALID"],
    ["target alias", { target: true, alias: false }, "TARGET_KONG_ALIAS_MISSING"],
  ];
  for (const [, options, expected] of invalid) assert.throws(() => validateEffectiveCompose({ model: model(options), workspace, project, productionContainers: ["supabase-auth"] }), new RegExp(expected));
});

test("override is service-specific and gives every active service a scoped container name", () => {
  const base = createIsolationOverride({ project, services: ["db", "kong"], gatewayService: "kong" });
  const target = createIsolationOverride({ project, services: ["db", "api-gw"], gatewayService: "api-gw" });
  assert.match(base, /container_name: godel-sh044c-rehearsal-test123-kong/);
  assert.doesNotMatch(base, /api-gw/);
  assert.match(target, /container_name: godel-sh044c-rehearsal-test123-api-gw/);
  assert.doesNotMatch(target, /\n  kong:/);
  assert.match(target, /127\.0\.0\.1:18080:8000/);
});

test("effective Compose uses an isolated project environment and explicit project name", () => {
  const invocation = createComposeInvocation({ composePath: "C:\\temp\\docker-compose.yml", overridePath: "C:\\temp\\override.yml", project, workspace });
  assert.equal(invocation.env.COMPOSE_PROJECT_NAME, project);
  assert.equal(invocation.env.COMPOSE_DISABLE_ENV_FILE, "1");
  assert.equal(invocation.args.includes("-p"), true);
});

test("Docker-specific environment retains only approved Windows plugin-discovery variables", () => {
  const first = composeEnvironment({ environment: { PATH: "synthetic-path", SystemRoot: "synthetic-root", ProgramFiles: "synthetic-program-files", JWT_SECRET: "secret", POSTGRES_PASSWORD: "secret", GODEL_SENTINEL: "sentinel" }, platform: "win32" });
  assert.equal(first.PATH, "synthetic-path");
  assert.equal(first.SystemRoot, "synthetic-root");
  assert.equal(first.ProgramFiles, "synthetic-program-files");
  for (const name of ["JWT_SECRET", "POSTGRES_PASSWORD", "GODEL_SENTINEL"]) assert.equal(Object.hasOwn(first, name), false);
  const fallback = composeEnvironment({ environment: { PATH: "synthetic-path", ProgramW6432: "synthetic-w6432" }, platform: "win32" });
  assert.equal(fallback.ProgramW6432, "synthetic-w6432");
  const both = composeEnvironment({ environment: { PATH: "synthetic-path", ProgramFiles: "synthetic-program-files", ProgramW6432: "synthetic-w6432" }, platform: "win32" });
  assert.deepEqual([both.ProgramFiles, both.ProgramW6432], ["synthetic-program-files", "synthetic-w6432"]);
  const mixedCase = composeEnvironment({ environment: { PATH: "synthetic-path", pRoGrAmFiLeS: "synthetic-mixed" }, platform: "win32" });
  assert.equal(mixedCase.ProgramFiles, "synthetic-mixed");
  const nonWindows = composeEnvironment({ environment: { PATH: "synthetic-path", ProgramFiles: "synthetic-program-files" }, platform: "linux" });
  assert.equal(Object.hasOwn(nonWindows, "ProgramFiles"), false);
});

test("allowlisted subprocess environment excludes arbitrary and secret-like parent values", () => {
  const sentinels = { GODEL_REHEARSAL_SENTINEL: "x", JWT_SECRET: "x", POSTGRES_PASSWORD: "x", SERVICE_ROLE_KEY: "x", ANON_KEY: "x" };
  const before = Object.fromEntries(Object.keys(sentinels).map((key) => [key, process.env[key]]));
  Object.assign(process.env, sentinels);
  try {
    const environment = allowlistedEnvironment({ jqDirectory: "C:\\safe-jq" });
    assert.equal(Object.hasOwn(environment, "GODEL_REHEARSAL_SENTINEL"), false);
    for (const key of Object.keys(sentinels).slice(1)) assert.equal(Object.hasOwn(environment, key), false);
    assert.equal(typeof environment.PATH, "string");
  } finally { for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value; }
});

test("tag resolution accepts exact refs and rejects branch masquerades or wrong identities", async () => {
  const run = async (_command, args) => ({ stdout: args.at(-1).endsWith("^{}") ? `${BASE.commit}\trefs/tags/${BASE.tag}\n` : "" });
  assert.equal((await resolveExactTag({ repository: "x", tag: BASE.tag, expectedCommit: BASE.commit, run })).commit, BASE.commit);
  assert.equal((await resolveExactTag({ repository: "x", tag: TARGET.tag, expectedCommit: TARGET.commit, run: async () => ({ stdout: `${TARGET.commit}\trefs/tags/${TARGET.tag}^{}\n` }) })).commit, TARGET.commit);
  await assert.rejects(resolveExactTag({ repository: "x", tag: BASE.tag, expectedCommit: TARGET.commit, run }), /OFFICIAL_TAG_IDENTITY_MISMATCH/);
  await assert.rejects(resolveExactTag({ repository: "x", tag: BASE.tag, expectedCommit: BASE.commit, run: async () => ({ stdout: `${BASE.commit}\trefs/heads/${BASE.tag}\n` }) }), /OFFICIAL_TAG_(UNRESOLVED|IDENTITY_MISMATCH)/);
});

test("sparse snapshot commands request only the frozen tag and docker directory", () => {
  const commands = createSparseSnapshotCommands({ repository: "https://example.invalid/supabase.git", tag: BASE.tag });
  assert.deepEqual(commands[2], ["sparse-checkout", "set", "--no-cone", "docker/"]);
  assert.deepEqual(commands[3], ["fetch", "--quiet", "--depth=1", "--filter=blob:none", "origin", `refs/tags/${BASE.tag}:refs/tags/${BASE.tag}`]);
  assert.doesNotMatch(JSON.stringify(commands), /master|main|latest/);
});

test("safe contracts never expose container IDs or execute cleanup", () => {
  const fingerprint = safeProductionFingerprint({ containers: ["supabase-auth|supabase/gotrue:v2|5|healthy|supabase_default"], d5: "MATCH", godel: "READY" });
  assert.deepEqual(fingerprint, { containers: [{ name: "supabase-auth", image: "supabase/gotrue:v2", restart: 5, health: "healthy", networks: ["supabase_default"] }], d5: "MATCH", godel: "READY" });
  assert.doesNotMatch(JSON.stringify(fingerprint), /[0-9a-f]{64}/i);
  assert.equal(createCleanupContract({ project, workspace: join(tmpdir(), `${project}-x`) }).status, "PREPARED_NOT_EXECUTED");
  assert.throws(() => assertCleanupProject("supabase"), /CLEANUP_PROJECT_REJECTED/);
  assert.equal(createGatewayPortContract().availability, "CHECK_REQUIRED_BEFORE_C2");
  assert.throws(() => createGatewayPortContract(8080), /GATEWAY_PORT_CONTRACT_INVALID/);
  assert.deepEqual(Object.keys(createFixtureContract()).sort(), ["auth", "database", "gateway", "storage"]);
});

test("jq capability preflight is null-input, bounded and hermetic while failures remain prerequisites", async () => {
  assert.equal((await resolveJq({ environment: { PATH: "" } })).status, "JQ_MISSING");
  const parentEnvironment = { PATH: process.env.PATH, SystemRoot: "synthetic-root", TEMP: "synthetic-temp", JWT_SECRET: "secret", POSTGRES_PASSWORD: "secret", SERVICE_ROLE_KEY: "secret", ANON_KEY: "secret", GODEL_REHEARSAL_SENTINEL: "sentinel" };
  let invocation;
  const available = await resolveJq({ jqBin: process.execPath, environment: parentEnvironment, run: async (command, args, options) => { invocation = { command, args, options }; return { stdout: "" }; } });
  assert.equal(available.status, "JQ_AVAILABLE");
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args.includes("-n"), true);
  assert.equal(invocation.args.includes("-e"), true);
  assert.equal(Object.hasOwn(invocation.options, "input"), false);
  assert.equal(invocation.options.timeout, 5_000);
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(typeof invocation.options.env.PATH, "string");
  for (const name of ["JWT_SECRET", "POSTGRES_PASSWORD", "SERVICE_ROLE_KEY", "ANON_KEY", "GODEL_REHEARSAL_SENTINEL"]) assert.equal(Object.hasOwn(invocation.options.env, name), false);
  const expression = invocation.args.at(-1);
  for (const primitive of [/type/, /keys\[\]/, /\.\[\$key\]/, /\/\//, /\.items\[\]\?/, /\(\[\.items\[\]\?\] \| length\)/]) assert.match(expression, primitive);
  const unavailable = await resolveJq({ jqBin: process.execPath, environment: { PATH: process.env.PATH }, run: async () => { throw new Error("no jq features"); } });
  assert.equal(unavailable.status, "JQ_INCOMPATIBLE");
  assert.equal((await resolveShell({ shBin: "C:\\missing\\sh.exe", environment: { PATH: "" } })).status, "SH_MISSING");
  assert.equal((await resolveShell({ shBin: process.execPath, environment: { PATH: process.env.PATH } })).status, "SH_AVAILABLE");
  const dryRunInvocation = createDryRunInvocation({ runtime: "C:\\tmp\\runtime", jq: { directory: "C:\\tmp\\tool-bin" }, shell: { path: "C:\\tmp\\tool-bin\\sh.exe", directory: "C:\\tmp\\tool-bin" }, repository: "https://github.com/supabase/supabase.git" });
  assert.deepEqual(dryRunInvocation.args.slice(-5), ["--dry-run", "--from", BASE.tag, "--to", TARGET.tag]);
  assert.equal(dryRunInvocation.env.SUPABASE_REPO_URL, "https://github.com/supabase/supabase.git");
  assert.equal(Object.hasOwn(dryRunInvocation.env, "JWT_SECRET"), false);
  assert.equal(Object.hasOwn(dryRunInvocation.env, "ProgramFiles"), false);
});

test("plan accumulates missing jq and Kong after retaining isolated Compose evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-sh044c-test-"));
  try {
    const materialize = async ({ destination, tag }) => {
      await mkdir(destination, { recursive: true });
      const snapshotServices = tag === BASE.tag ? ["kong", "db", "supavisor"] : ["api-gw", "db", "supavisor"];
      await writeFile(join(destination, "docker-compose.yml"), `services:\n${snapshotServices.map((name) => `  ${name}:\n    image: ${name === "kong" ? "kong/kong:3.9.3" : `example/${name}:v1`}`).join("\n")}\n`);
      await writeFile(join(destination, ".env.example"), "JWT_SECRET=insecure\nPOSTGRES_PASSWORD=insecure\nENABLE_EMAIL_AUTOCONFIRM=false\n");
      await writeFile(join(destination, "update.sh"), "#!/bin/sh\n");
    };
    const renderCompose = async (invocation) => ({ ok: true, model: model({ target: invocation.args.includes("target.override.yml"), bind: invocation.cwd }) });
    const run = async (_command, args) => ({ stdout: args.includes(`refs/tags/${BASE.tag}^{}`) ? `${BASE.commit}\trefs/tags/${BASE.tag}^{}\n` : `${TARGET.commit}\trefs/tags/${TARGET.tag}^{}\n` });
    const result = await createRehearsalPlan({ root, repository: "synthetic", generation: "test123", materializeSnapshot: materialize, renderCompose, resolveJq: async () => ({ status: "JQ_MISSING" }), resolveShell: async () => ({ status: "SH_AVAILABLE", path: "sh", directory: "C:\\tool-bin" }), listProductionContainers: async () => [], inspectImages: async () => ({ status: "MISSING_IMAGES", missing: ["kong/kong:3.9.3"], present: [] }), run });
    assert.equal(result.plannerResult, "EXECUTION_BLOCKED_PREREQUISITES", result.blockedBy);
    assert.equal(result.jq.status, "JQ_MISSING");
    assert.equal(result.kongImage, "MISSING");
    assert.equal(result.baseCompose, "PASS");
    assert.equal(result.targetCompose, "PASS");
    assert.deepEqual(result.blockers, ["IMAGE_MISSING:kong/kong:3.9.3", "JQ_MISSING"]);
    assert.equal(result.dryRun, "NOT_RUN_PREREQUISITES");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("architectural Compose isolation failures remain BLOCKED rather than prerequisite-blocked", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-sh044c-blocked-"));
  try {
    const materialize = async ({ destination, tag }) => {
      await mkdir(destination, { recursive: true });
      const gateway = tag === BASE.tag ? "kong" : "api-gw";
      await writeFile(join(destination, "docker-compose.yml"), `services:\n  ${gateway}:\n    image: example/${gateway}:v1\n`);
      await writeFile(join(destination, ".env.example"), "JWT_SECRET=insecure\n");
    };
    const run = async (_command, args) => ({ stdout: args.includes(`refs/tags/${BASE.tag}^{}`) ? `${BASE.commit}\trefs/tags/${BASE.tag}^{}\n` : `${TARGET.commit}\trefs/tags/${TARGET.tag}^{}\n` });
    const result = await createRehearsalPlan({ repository: "synthetic", generation: "test123", materializeSnapshot: materialize, renderCompose: async (invocation) => ({ ok: true, model: model({ network: true, bind: invocation.cwd }) }), listProductionContainers: async () => [], run });
    assert.equal(result.plannerResult, "BLOCKED");
    assert.equal(result.blockedBy, "NETWORK_ISOLATION_INVALID");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("synthetic environment uses historical Auth URL and parseable non-production SMTP values", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-sh044c-env-"));
  try {
    const example = join(root, ".env.example"); const destination = join(root, ".env");
    await writeFile(example, "API_EXTERNAL_URL=\nSUPABASE_PUBLIC_URL=\nSITE_URL=\nSMTP_ADMIN_EMAIL=\nSMTP_HOST=\nSMTP_PORT=\nSMTP_USER=\nSMTP_PASS=\nSMTP_SENDER_NAME=\n");
    await writeSyntheticRuntimeEnv({ examplePath: example, destination, port: 18080 });
    const visible = (await readFile(destination, "utf8")).split(/\r?\n/).filter((line) => /^(API_EXTERNAL_URL|SUPABASE_PUBLIC_URL|SITE_URL|SMTP_(ADMIN_EMAIL|HOST|PORT|USER|SENDER_NAME))=/.test(line));
    assert.deepEqual(visible, ["API_EXTERNAL_URL=http://127.0.0.1:18080/auth/v1", "SUPABASE_PUBLIC_URL=http://127.0.0.1:18080", "SITE_URL=http://127.0.0.1:18080", "SMTP_ADMIN_EMAIL=rehearsal@example.invalid", "SMTP_HOST=rehearsal-mail.invalid", "SMTP_PORT=2500", "SMTP_USER=rehearsal", "SMTP_SENDER_NAME=rehearsal"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("current Compose helper renders a synthetic override without runtime mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-sh044c-compose-helper-"));
  try {
    const base = join(root, "base.yml"); const override = join(root, "override.yml");
    await writeFile(base, 'services:\n  test:\n    image: example.invalid/test:never-pulled\n    ports:\n      - "9999:80"\n');
    await writeFile(override, "services:\n  test:\n    ports: !override []\n");
    const result = await renderEffectiveCompose(createComposeInvocation({ composePath: base, overridePath: override, project: "godel-sh044c-helper-test", workspace: root }));
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(result.model.services.test.ports, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
