import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeDockerAdapter, parseEffectiveRuntimeCompose, parseRuntimeReconstructionArgs, reconstructCleanHostRuntime, renderRuntimeReconstructionFailure } from "./clean-host-runtime-reconstruction.mjs";

const SUPABASE = ["studio", "api-gw", "auth", "rest", "realtime", "storage", "imgproxy", "meta", "functions", "db", "supavisor"];
const imageId = `sha256:${"a".repeat(64)}`;
function effective() {
  return { supabase: JSON.stringify({ services: Object.fromEntries(SUPABASE.map((name) => [name, { image: `supabase/${name}:immutable` }])) }), godel: JSON.stringify({ services: { app: { image: "godel-design-app:local" }, nginx: { image: "godel-design-nginx:local", ports: [{ host_ip: "127.0.0.1", target: 8080, published: "18080", protocol: "tcp" }] } } }) };
}
function fixture({ failure, signal, quiesce = "PASS", markerFails = false, imageFailsAfterLock = false } = {}) {
  const events = [], markers = {}, state = { lock: false, imageInspections: 0 }, manifest = { operationId: "22222222-2222-4222-8222-222222222222", backup: { backupId: "backup" }, externalSecretGenerationId: "11111111-1111-4111-8111-111111111111", targetContract: { supabaseComposeProject: "target", godelComposeProject: "godel-runtime", operatorNetwork: "godel-supabase-api" } };
  const handlers = new Map(), signalSource = { on: (name, handler) => handlers.set(name, handler), off: (name, handler) => { assert.equal(handlers.get(name), handler); handlers.delete(name); }, emit: (name) => handlers.get(name)?.() };
  const directory = (mode) => ({ isDirectory: () => true, isSymbolicLink: () => false, isFile: () => false, mode });
  const file = () => ({ isDirectory: () => false, isSymbolicLink: () => false, isFile: () => true, mode: 0o600, size: 1 });
  const filesystem = {
    exists: async () => false,
    entry: async (path) => path.endsWith(".env") || path.endsWith("compose.env.local") ? file() : directory(path.endsWith("storage") ? 0o755 : 0o700),
    entries: async (path) => path.endsWith("selfhosted") ? state.lock ? [".clean-host-runtime-reconstruction.lock", "external-secrets"] : ["external-secrets"] : ["restored"],
    readFile: async (path) => path.endsWith("compose.env.local") ? "NEXT_PUBLIC_SUPABASE_URL=http://supabase\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=key\nGODEL_APP_IMAGE_TAG=local\nGODEL_NGINX_IMAGE_TAG=local\n" : "{\"schemaVersion\":1,\"format\":\"supabase-file-xattrs\",\"entries\":[]}",
    createDirectoryExclusive: async () => { state.lock = true; events.push("runtime-lock"); },
    writeFileExclusive: async (path, bytes) => { if (markerFails && path.endsWith("failed.json")) throw new Error("marker"); markers[path.endsWith("started.json") ? "started" : "failed"] = JSON.parse(bytes); },
    removeDirectory: async () => { state.lock = false; events.push("runtime-lock-cleanup"); },
  };
  const configs = effective();
  let supabaseChecks = 0, godelChecks = 0, exposureChecks = 0;
  const docker = {
    runHelper: async () => {}, verifyRecoveredDbConfig: async () => {}, verifyPreRuntimeTopology: async () => {}, verifyRuntimeTopology: async () => { events.push("final-topology"); if (failure === "final-topology") throw new Error("final-topology"); if (signal === "final-topology") signalSource.emit("SIGINT"); },
    effective: async (invocation) => invocation.args.includes("infra/supabase/docker-compose.yml") ? configs.supabase : configs.godel,
    inspectLocalImage: async () => { state.imageInspections += 1; if (imageFailsAfterLock && state.lock && state.imageInspections > 2) throw new Error("gone"); return { os: "linux", architecture: "amd64", imageId }; },
    compose: async (invocation) => { const phase = invocation.args.includes("compose.yaml") ? "godel-up" : invocation.args.includes("db") ? "db-up" : "supabase-up"; events.push(phase); if (failure === phase) throw new Error(phase); if (signal === phase) signalSource.emit("SIGINT"); },
    verifyDb: async () => phase("db-verify"), verifySupabase: async () => phase(++supabaseChecks === 2 ? "final-supabase" : "supabase-verify"), verifyGodel: async () => phase(++godelChecks === 2 ? "final-godel" : "godel-verify"), verifyExposure: async () => phase(++exposureChecks === 2 ? "final-exposure" : "actual-exposure"), health: async (name) => phase(name),
    quiesce: async () => { events.push("quiesce"); return { state: quiesce }; },
  };
  function phase(name) { events.push(name); if (failure === name) throw new Error(name); if (signal === name) signalSource.emit("SIGTERM"); }
  const primitives = { assertRestoredPgdata: async () => {}, assertRestoredStorage: async () => {}, verifyStorageXattrs: async () => {} };
  let activeCalls = 0;
  const options = { root: "C:/synthetic", manifestPath: "manifest", backupPath: "C:/synthetic/backups/recovery", inputProtectedRoot: "C:/synthetic/protected", generationBundlePath: "bundle", readManifest: async () => ({ manifest }), admit: async () => ({ state: "PASS", operationId: manifest.operationId }), assertActive: async () => { activeCalls += 1; if (failure === "final-generation" && activeCalls === 3) throw new Error("generation"); if (signal === "final-generation" && activeCalls === 3) signalSource.emit("SIGTERM"); }, assertNoLock: async () => {}, pullReady: async () => {}, helperReadiness: async () => ({ postgresImage: "postgres", storageImage: "storage" }), filesystem, docker, primitives, signalSource, acquireLock: async () => { events.push("generation-lock"); return "generation-lock"; }, releaseLock: async () => events.push("generation-lock-cleanup") };
  return { options, events, markers, state, handlers };
}

test("CLI remains explicit and failures stay sanitized", () => {
  const parsed = parseRuntimeReconstructionArgs(["--manifest", "backups/manifest.json", "--backup", "backups/selfhosted/recovery", "--input-protected-root", "protected-recovery-material/input", "--bundle", "bundle", "--apply", "--confirm-runtime-clean-host-rehearsal"]);
  assert.equal(parsed.apply, true); assert.throws(() => parseRuntimeReconstructionArgs(["--force"])); assert.equal(renderRuntimeReconstructionFailure(new Error("CLEAN_HOST_RUNTIME_RECONSTRUCTION_PREFLIGHT")), "FAIL CLEAN_HOST_RUNTIME_RECONSTRUCTION_PREFLIGHT\n");
});

test("effective Compose inspection is structural and exact", () => {
  const valid = effective(); assert.equal(parseEffectiveRuntimeCompose(valid).httpPort, "18080");
  const published = JSON.parse(valid.supabase); published.services.db.ports = [{ host_ip: "127.0.0.1" }]; assert.throws(() => parseEffectiveRuntimeCompose({ supabase: JSON.stringify(published), godel: valid.godel }));
  for (const mutate of [
    (value) => { value.services.app.ports = [{ host_ip: "127.0.0.1" }]; },
    (value) => { value.services.nginx.ports[0].host_ip = "0.0.0.0"; },
    (value) => { value.services.nginx.ports.push({ host_ip: "127.0.0.1", target: 8080, published: "18081", protocol: "tcp" }); },
    (value) => { value.services.extra = {}; },
  ]) { const next = JSON.parse(valid.godel); mutate(next); assert.throws(() => parseEffectiveRuntimeCompose({ supabase: valid.supabase, godel: JSON.stringify(next) })); }
});

test("default adapter uses canonical config commands and a finite localhost health boundary", async () => {
  const calls = [], configs = effective(), docker = createRuntimeDockerAdapter({ root: "C:/synthetic", request: async (url, timeout) => { assert.equal(url, "http://127.0.0.1:18080/api/health/live"); assert.equal(timeout, 5000); }, runner: async (_binary, args) => { calls.push(args); return { stdout: args.includes("infra/supabase/docker-compose.yml") ? configs.supabase : configs.godel }; } });
  const supabase = await docker.effective({ args: ["compose", "--env-file", "infra/supabase/.env", "-f", "infra/supabase/docker-compose.yml", "-f", "infra/supabase-godel.override.yml", "config", "--format", "json"] });
  const godel = await docker.effective({ args: ["compose", "--env-file", "compose.env.local", "-f", "compose.yaml", "config", "--format", "json"], environment: {} });
  const contract = parseEffectiveRuntimeCompose({ supabase, godel }); await docker.health("live", contract);
  assert.equal(calls.every((args) => args.at(-2) === "config" || args.at(-1) === "config" || !args.includes("config") || !args.includes("up")), true);
  assert.equal(calls[0].slice(-2).join(" "), "--format json"); assert.equal(calls[0].includes("up"), false); assert.equal(calls[1].includes("up"), false);
});

test("default adapter revalidates the exact recovered db-config set with a read-only helper", async () => {
  const calls = [], docker = createRuntimeDockerAdapter({ root: "C:/synthetic", runner: async (_binary, args) => { calls.push(args); return { stdout: "" }; } });
  await docker.verifyRecoveredDbConfig({ image: "supabase/postgres:immutable", volume: "target_db-config" });
  const helper = calls.find((args) => args[0] === "run"), command = helper.at(-1);
  assert.equal(helper.includes("--pull=never"), true); assert.equal(helper.includes("--network"), true); assert.equal(helper[helper.indexOf("--network") + 1], "none"); assert.equal(helper.includes("--read-only"), true); assert.equal(helper[helper.indexOf("-v") + 1], "target_db-config:/etc/postgresql-custom:ro");
  assert.match(command, /ls -1A \/etc\/postgresql-custom \| wc -l\)" -eq 6/);
  for (const entry of ["conf.d", "extension-custom-scripts", "pgsodium_root.key", "read-replica.conf", "supautils.conf", "wal-g.conf"]) assert.match(command, new RegExp(`\\b${entry.replace(".", "\\.")}\\b`));
  assert.match(command, /test -f \/etc\/postgresql-custom\/pgsodium_root\.key/); assert.match(command, /test -s \/etc\/postgresql-custom\/pgsodium_root\.key/);
});

test("default adapter quiesce attempts every existing group and proves terminal state", async () => {
  const calls = [], manifest = { targetContract: { supabaseComposeProject: "target", godelComposeProject: "godel-runtime" } }, rows = [
    { ID: "godel", Names: "godel-runtime-nginx-1", Labels: "com.docker.compose.project=godel-runtime,com.docker.compose.service=nginx" },
    { ID: "auth", Names: "supabase-auth", Labels: "com.docker.compose.project=target,com.docker.compose.service=auth" },
    { ID: "db", Names: "supabase-db", Labels: "com.docker.compose.project=target,com.docker.compose.service=db" },
  ];
  let stopped = false;
  const docker = createRuntimeDockerAdapter({ root: "C:/synthetic", runner: async (_binary, args) => {
    calls.push(args);
    if (args[0] === "ps") return { stdout: rows.map((row) => JSON.stringify(row)).join("\n") };
    if (args[0] === "volume" || args[0] === "network") return { stdout: "" };
    if (args[0] === "inspect") return { stdout: JSON.stringify(args.slice(1).map((id) => { const row = rows.find((item) => item.ID === id); return { Config: { Labels: Object.fromEntries(row.Labels.split(",").map((entry) => entry.split("="))) }, State: { Status: stopped ? "exited" : "running" } }; })) };
    if (args[0] === "compose" && args.includes("stop")) { stopped = true; return { stdout: "" }; }
    throw new Error(`unexpected ${args[0]}`);
  } });
  assert.equal((await docker.quiesce({ manifest })).state, "PASS");
  const stops = calls.filter((args) => args[0] === "compose" && args.includes("stop"));
  assert.deepEqual(stops.map((args) => args.at(-1)), ["nginx", "auth", "db"]);
  assert.equal(calls.some((args) => ["down", "rm", "prune"].includes(args[0]) || (["network", "volume"].includes(args[0]) && args[1] === "rm")), false);
});

test("dry-run is read-only and startup follows verified ordered phases", async () => {
  const dry = fixture(); assert.equal((await reconstructCleanHostRuntime(dry.options)).state, "VALIDATED_NOT_APPLIED"); assert.deepEqual(dry.events, []);
  const value = fixture(), result = await reconstructCleanHostRuntime({ ...value.options, apply: true, confirmed: true });
  assert.equal(result.state, "PASS"); assert.deepEqual(value.events, ["runtime-lock", "generation-lock", "db-up", "db-verify", "supabase-up", "supabase-verify", "godel-up", "godel-verify", "actual-exposure", "live", "ready", "final-supabase", "final-godel", "final-exposure", "final-topology", "generation-lock-cleanup", "runtime-lock-cleanup"]); assert.equal(value.handlers.size, 0);
});

test("post-runtime failure quiesces, records the phase, and preserves both locks", async () => {
  for (const failed of ["db-up", "db-verify", "supabase-up", "supabase-verify", "godel-up", "godel-verify", "actual-exposure", "live", "ready", "final-generation", "final-supabase", "final-godel", "final-exposure", "final-topology"]) {
    const value = fixture({ failure: failed }); await assert.rejects(reconstructCleanHostRuntime({ ...value.options, apply: true, confirmed: true }), /BLOCKED_PARTIAL_RUNTIME_STATE$/);
    assert.equal(value.events.includes("quiesce"), true, failed); assert.equal(value.state.lock, true); assert.equal(value.markers.failed.phase, failed); assert.equal(value.markers.failed.quiesce, "PASS"); assert.equal(value.events.includes("generation-lock-cleanup"), false); assert.equal(value.handlers.size, 0);
  }
});

test("rechecks local Godel images after locks and before the first DB up", async () => {
  const value = fixture({ imageFailsAfterLock: true }); await assert.rejects(reconstructCleanHostRuntime({ ...value.options, apply: true, confirmed: true }), /GODEL_IMAGES/);
  assert.equal(value.events.includes("db-up"), false); assert.equal(value.state.lock, false); assert.equal(value.events.includes("generation-lock-cleanup"), true);
});

test("quiesce failure persists FAILED evidence and marker failure is stronger", async () => {
  const failed = fixture({ failure: "db-verify", quiesce: "FAIL" }); await assert.rejects(reconstructCleanHostRuntime({ ...failed.options, apply: true, confirmed: true }), /QUIESCE_FAILED$/); assert.equal(failed.markers.failed.quiesce, "FAILED"); assert.equal(failed.state.lock, true);
  const marker = fixture({ failure: "db-verify", quiesce: "FAIL", markerFails: true }); await assert.rejects(reconstructCleanHostRuntime({ ...marker.options, apply: true, confirmed: true }), /QUIESCE_FAILED_MARKER_FAILED$/); assert.equal(marker.state.lock, true);
});

test("signals in final acceptance windows cannot return PASS", async () => {
  for (const phase of ["final-generation", "final-supabase", "final-godel", "final-exposure", "final-topology"]) { const value = fixture({ signal: phase }); await assert.rejects(reconstructCleanHostRuntime({ ...value.options, apply: true, confirmed: true }), /BLOCKED_PARTIAL_RUNTIME_STATE$/); assert.equal(value.events.includes("quiesce"), true); assert.equal(value.handlers.size, 0); }
});
