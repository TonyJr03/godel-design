import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { BASE, TARGET, REHEARSAL_PREFIX, allowlistedEnvironment, assertCleanupProject, composeEnvironment, createCleanupContract, createIsolationOverride, imagesFromCompose, inspectImages, listProductionContainers, materializeSnapshot, resolveExactTag, resolveJq, resolveShell, safeGeneration, servicesFromSource, validateEffectiveCompose, writeSyntheticRuntimeEnv } from "./supabase-update-rehearsal.mjs";
import { assertFixtureDependencyHealthchecks, assertRuntimeGatewayIdentity, captureProductionFingerprint, compareFixtureFingerprints, compareProductionFingerprints, createBoundedRunner, createExecutionComposeConfigInvocation, createFixtures, createProjectResidueAuditInvocations, createRealUpdateInvocation, createRuntimeComposeInvocation, fallbackProjectCleanup, parseUpdateSummary, probePortAvailable, readProjectServiceHealth, validateFixtures, waitForGateway, waitForRequiredServicesHealthy } from "./supabase-update-rehearsal-execute.mjs";

const execFile = promisify(execFileCallback);
const ACKNOWLEDGEMENT = "--execute-isolated-historical-rollback-rehearsal";
const REPOSITORY = "https://github.com/supabase/supabase.git";
const EVIDENCE_DIRECTORY = join(tmpdir(), "godel-sh044d-evidence");
const ARCHIVE_TIMEOUT_MS = 120_000;
const INTERNAL_JOURNAL = Symbol("sh044dIncidentJournal");

function fail(code) { throw new Error(code); }
function safeError(value) { return String(value?.message ?? value).replace(/[A-Za-z]:\\[^\s:]+/g, "<path>").replace(/(?:Bearer|apikey|authorization|ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|POSTGRES_PASSWORD|access_token|refresh_token)[=: ]+[^\s,]+/gi, "<credential>").replace(/[\r\n]+/g, " ").slice(0, 180); }
function inside(root, value) { const check = relative(resolve(root), resolve(value)); return check === "" || (!check.startsWith("..") && !isAbsolute(check)); }
function runtimePath(workspace) { return join(workspace, "runtime"); }
function safeDetail(detail) { const text = typeof detail === "string" ? detail : JSON.stringify(detail); return /ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|POSTGRES_PASSWORD|Bearer\s|access_token|refresh_token|apikey[=:]|[A-Za-z]:\\/i.test(text) ? "REDACTED" : detail; }

export function parseRollbackExecutorArguments(args) {
  const options = { acknowledged: false, preRuntimeProbe: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === ACKNOWLEDGEMENT) { options.acknowledged = true; continue; }
    if (argument === "--pre-runtime-probe") { options.preRuntimeProbe = true; continue; }
    if (["--jq", "--sh", "--port"].includes(argument) && args[index + 1]) {
      options[argument === "--jq" ? "jqBin" : argument === "--sh" ? "shBin" : "port"] = argument === "--port" ? Number(args[index + 1]) : args[index + 1]; index += 1; continue;
    }
    fail("USAGE: npm run ops:supabase:rollback:rehearsal:execute -- --execute-isolated-historical-rollback-rehearsal --jq <verified-path> [--sh <path>] [--port <safe-port>]");
  }
  if (options.acknowledged === options.preRuntimeProbe) fail(options.acknowledged ? "USAGE: acknowledgement and --pre-runtime-probe are mutually exclusive" : "ACKNOWLEDGEMENT_REQUIRED");
  return options;
}

export async function createRollbackCheckpointEmitter({ generation, sink = (line) => process.stderr.write(`${line}\n`) } = {}) {
  if (!/^[a-f0-9]{12}$/.test(generation)) fail("INCIDENT_JOURNAL_GENERATION_INVALID");
  const journal = join(EVIDENCE_DIRECTORY, `${generation}.jsonl`); await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  return { journal, async emit(phase, status, detail) { const event = { phase, status, ...(detail === undefined ? {} : { detail: safeDetail(detail) }) }; sink(`SH044D_CHECKPOINT ${JSON.stringify(event)}`); await appendFile(journal, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 }); } };
}
function attachJournal(result, metadata) { Object.defineProperty(result, INTERNAL_JOURNAL, { enumerable: false, value: metadata }); return result; }
export function getRollbackInternalJournal(result) { return result?.[INTERNAL_JOURNAL]; }
export async function writeRollbackFinalJson(result, stdout = process.stdout) { await new Promise((ok, bad) => { try { stdout.write(`${JSON.stringify(result, null, 2)}\n`, (error) => error ? bad(error) : ok()); } catch (error) { bad(error); } }); }
export async function finalizeRollbackExecutorOutput({ result, write = writeRollbackFinalJson, remove = rm, acknowledge = (line) => process.stderr.write(`${line}\n`), getJournal = getRollbackInternalJournal }) {
  try { await write(result); } catch { return { finalOutput: "FINAL_OUTPUT_FAILED", journalCleanup: "RETAINED" }; }
  if (!['ROLLBACK_R2_PASS', 'PRE_RUNTIME_PASS'].includes(result.executorResult)) return { finalOutput: "WRITTEN", journalCleanup: "RETAINED" };
  const metadata = getJournal(result); const expected = metadata?.generation && join(EVIDENCE_DIRECTORY, `${metadata.generation}.jsonl`);
  if (!metadata || !/^[a-f0-9]{12}$/.test(metadata.generation) || resolve(metadata.journal) !== resolve(expected) || resolve(dirname(metadata.journal)) !== resolve(EVIDENCE_DIRECTORY)) return { finalOutput: "WRITTEN", journalCleanup: "RETAINED" };
  try { await remove(metadata.journal, { force: true }); acknowledge('SH044D_JOURNAL_CLEANUP {"status":"REMOVED"}'); return { finalOutput: "WRITTEN", journalCleanup: "REMOVED" }; } catch { acknowledge('SH044D_JOURNAL_CLEANUP {"status":"RETAINED"}'); return { finalOutput: "WRITTEN", journalCleanup: "RETAINED" }; }
}

function excludedManagedPath(path) { return path === '.env' || path === 'backups' || path.startsWith('backups/') || path === 'volumes/db/data' || path.startsWith('volumes/db/data/') || path === 'volumes/storage' || path.startsWith('volumes/storage/'); }
async function sha256(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
export async function createManagedTreeManifest(root) {
  const entries = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name), path = relative(root, absolute).replace(/\\/g, '/');
      if (excludedManagedPath(path)) continue;
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) fail('MANAGED_TREE_SYMLINK_REJECTED');
      if (info.isDirectory()) { await visit(absolute); continue; }
      if (!info.isFile()) fail('MANAGED_TREE_SPECIAL_ENTRY_REJECTED');
      entries.push({ path, sha256: await sha256(absolute) });
    }
  }
  await visit(root); entries.sort((a, b) => a.path.localeCompare(b.path)); return entries;
}
export function compareManagedTreeManifests(base, restored) { return JSON.stringify(base) === JSON.stringify(restored) ? { status: 'MATCH', fileCount: base.length } : { status: 'MISMATCH', fileCount: base.length }; }
export async function capturePrivateFileDigest(path) { return sha256(path); }
export async function assertPrivateDigestMatch(expectedDigest, path) { if (expectedDigest !== await sha256(path)) fail('ENV_CONTINUITY_MISMATCH'); return 'MATCH'; }
export async function assertEnvContinuity(beforePath, afterPath) { return assertPrivateDigestMatch(await capturePrivateFileDigest(beforePath), afterPath); }

export function normalizeArchivePath(value, destination, type = 'file') {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) fail('ARCHIVE_PATH_REJECTED');
  let path = value; while (path.startsWith('./')) path = path.slice(2); if (path.endsWith('/')) { if (type !== 'directory') fail('ARCHIVE_PATH_REJECTED'); path = path.replace(/\/+$/, ''); }
  if (!path) return '';
  const parts = path.split('/'); if (parts.some((part) => !part || part === '.' || part === '..')) fail('ARCHIVE_PATH_REJECTED');
  const resolved = resolve(destination, ...parts); if (!inside(destination, resolved)) fail('ARCHIVE_PATH_REJECTED'); return parts.join('/');
}
export function validateArchiveEntries(entries, destination) {
  if (!Array.isArray(entries) || !entries.length) fail('ARCHIVE_LIST_EMPTY');
  const names = new Map();
  for (const entry of entries) {
    if (!entry || !['file', 'directory'].includes(entry.type)) fail('ARCHIVE_ENTRY_TYPE_REJECTED');
    const path = normalizeArchivePath(entry.name, destination, entry.type); if (!path && entry.type !== 'directory') fail('ARCHIVE_PATH_REJECTED');
    if (path && names.has(path)) fail('ARCHIVE_DUPLICATE_ENTRY'); if (path) names.set(path, entry.type);
    if (/^(backups|volumes\/db\/data|volumes\/storage)(\/|$)/.test(path)) fail('ARCHIVE_PROTECTED_PAYLOAD_REJECTED');
    if (path === '.supabase-version') fail('ARCHIVE_TARGET_STAMP_REJECTED');
  }
  if ([...names.keys()].filter((path) => path === '.env').length !== 1) fail('ARCHIVE_ENV_CONTRACT_INVALID');
  return 'PASS';
}
export function parseVerboseTarListing(output) {
  return String(output ?? '').split(/\r?\n/).filter(Boolean).map((line) => {
    const marker = line[0], type = marker === '-' ? 'file' : marker === 'd' ? 'directory' : 'special';
    const match = line.match(/^\S+\s+\S+\s+\d+\s+\d{4}-\d\d-\d\d\s+\d\d:\d\d(?::\d\d)?\s+(.*)$/);
    return { type, name: match?.[1] ?? '' };
  });
}
export async function assertArchiveStable(path, expectedDigest) { if (await sha256(path) !== expectedDigest) fail('ARCHIVE_IDENTITY_CHANGED'); return 'STABLE'; }
export async function movePreservedDirectory({ workspace, source, destination, renameFile = rename, lstatFile = lstat }) {
  if (!inside(workspace, source) || !inside(workspace, destination) || source === destination) fail('PRESERVED_DATA_PATH_REJECTED');
  const sourceInfo = await lstatFile(source); if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) fail('PRESERVED_DATA_SOURCE_INVALID');
  try { await lstatFile(destination); fail('PRESERVED_DATA_DESTINATION_EXISTS'); } catch (error) { if (error?.message === 'PRESERVED_DATA_DESTINATION_EXISTS') throw error; if (error?.code !== 'ENOENT') throw error; }
  await mkdir(dirname(destination), { recursive: true });
  try { await renameFile(source, destination); } catch (error) { fail(error?.code === 'EXDEV' ? 'PRESERVED_DATA_RENAME_EXDEV' : 'PRESERVED_DATA_RENAME_FAILED'); }
  return 'RENAMED';
}
export function assertVolumeMetadata({ name, project, output }) { assertCleanupProject(project); const [actual, label] = String(output ?? '').trim().split('|'); if (actual !== name || name !== `${project}-db-config` || label !== project) fail('DB_CONFIG_VOLUME_IDENTITY_INVALID'); return 'PRESERVED'; }
export async function preserveDbConfig({ project, run }) { const name = `${project}-db-config`; const output = await run('docker', ['volume', 'inspect', '--format', '{{.Name}}|{{index .Labels "com.docker.compose.project"}}', name], { env: composeEnvironment(), windowsHide: true }); return assertVolumeMetadata({ name, project, output: output.stdout }); }
export async function removeDenoCache({ project, run }) { const name = `${project}-deno-cache`; const output = await run('docker', ['volume', 'inspect', '--format', '{{.Name}}|{{index .Labels "com.docker.compose.project"}}', name], { env: composeEnvironment(), windowsHide: true }); const [actual, label] = String(output.stdout ?? '').trim().split('|'); if (actual !== name || label !== project) fail('DENO_CACHE_VOLUME_IDENTITY_INVALID'); await run('docker', ['volume', 'rm', name], { env: composeEnvironment(), windowsHide: true }); return 'RECREATED'; }

export async function auditRollbackProjectResidue({ project, run }) {
  const residue = {};
  for (const invocation of createProjectResidueAuditInvocations(project)) {
    const output = await run(invocation.command, invocation.args, { env: composeEnvironment(), windowsHide: true });
    residue[invocation.kind] = String(output.stdout ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  return residue;
}
function residueCounts(residue) { return { containers: residue.containers.length, networks: residue.networks.length, volumes: residue.volumes.length }; }
function hasResidue(residue) { return Object.values(residue).some((entries) => entries.length !== 0); }
function safeProductionScope(fingerprint) { return { supabaseProject: fingerprint.supabaseProject, godelProject: fingerprint.godelProject, supabaseContainerCount: fingerprint.supabaseContainerCount, godelContainerCount: fingerprint.godelContainerCount }; }
function hasR2SuccessEvidence(evidence) {
  return evidence.baseRuntimeGateway === 'KONG_3_9_3' && evidence.targetRuntimeGateway === 'ENVOY_1_39_0' && evidence.rollbackRuntimeGateway === 'KONG_3_9_3'
    && evidence.fixtureA?.baseCreated === 'PASS' && evidence.fixtureA?.targetValidated === 'PASS' && evidence.fixtureA?.rollbackValidated === 'PASS'
    && evidence.fixtureB?.targetCreated === 'PASS' && evidence.fixtureB?.rollbackValidated === 'PASS'
    && evidence.baseConfigFingerprint === 'MATCH' && evidence.envContinuity === 'MATCH' && evidence.archiveIdentity === 'STABLE'
    && evidence.productionTarget === 'UNCHANGED' && evidence.productionRollback === 'UNCHANGED' && evidence.rollbackClassification === 'R2_PROVEN';
}

function mapCheckpoint(map, checkpoint) { return async (phase, status) => checkpoint?.(map[phase] ?? phase, status); }
function fixtureMap(prefix, create) { return create ? { BASE_FIXTURE_DATABASE_PASS: `${prefix}_DATABASE_PASS`, BASE_FIXTURE_AUTH_ADMIN_PASS: `${prefix}_AUTH_ADMIN_PASS`, BASE_FIXTURE_AUTH_SESSION_PASS: `${prefix}_AUTH_SESSION_PASS`, BASE_FIXTURE_STORAGE_BUCKET_PASS: `${prefix}_STORAGE_BUCKET_PASS`, BASE_FIXTURE_STORAGE_OBJECT_PASS: `${prefix}_STORAGE_OBJECT_PASS`, BASE_FIXTURE_GATEWAY_PASS: `${prefix}_GATEWAY_PASS`, BASE_FIXTURE_INTERNAL_KONG_PASS: `${prefix}_INTERNAL_KONG_PASS` } : { TARGET_FIXTURE_DATABASE_PASS: `${prefix}_DATABASE_PASS`, TARGET_FIXTURE_AUTH_ADMIN_PASS: `${prefix}_AUTH_PASS`, TARGET_FIXTURE_AUTH_SESSION_PASS: `${prefix}_AUTH_SESSION_PASS`, TARGET_FIXTURE_STORAGE_OBJECT_PASS: `${prefix}_STORAGE_PASS`, TARGET_FIXTURE_GATEWAY_PASS: `${prefix}_GATEWAY_PASS`, TARGET_FIXTURE_INTERNAL_KONG_PASS: `${prefix}_INTERNAL_KONG_PASS` }; }
async function render(invocation, run) { return JSON.parse((await run(invocation.command, invocation.args, { cwd: invocation.cwd, env: invocation.env, windowsHide: true })).stdout); }
export async function readArchiveEntries({ archive, shell, run }) { const output = await run(shell.path, ['-lc', 'tar -tvzf "$(cygpath -u "$1")"', 'sh', archive], { env: allowlistedEnvironment({ shellDirectory: shell.directory }), windowsHide: true, timeout: ARCHIVE_TIMEOUT_MS }); return parseVerboseTarListing(output.stdout); }
async function extractArchive({ archive, destination, shell, run }) { await run(shell.path, ['-lc', 'tar --extract --gzip --file="$(cygpath -u "$1")" --no-same-owner --no-same-permissions -C "$(cygpath -u "$2")"', 'sh', archive, destination], { env: allowlistedEnvironment({ shellDirectory: shell.directory }), windowsHide: true, timeout: ARCHIVE_TIMEOUT_MS }); }
export async function exactNewArchive(runtime, before) { const directory = join(runtime, 'backups'), names = await readdir(directory), matches = names.filter((name) => /^pre-update-.*\.tgz$/.test(name) && !before.includes(name)); if (matches.length !== 1) fail('PRE_UPDATE_ARCHIVE_IDENTITY_INVALID'); const path = join(directory, matches[0]), info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || !inside(directory, path)) fail('PRE_UPDATE_ARCHIVE_IDENTITY_INVALID'); return path; }
async function assertTargetStamp(runtime) { const stamp = await readFile(join(runtime, '.supabase-version'), 'utf8'); if (!new RegExp(`^ref=${TARGET.tag}$`, 'm').test(stamp)) fail('TARGET_STAMP_MISMATCH'); return 'TARGET_EXACT'; }

export async function executeHistoricalRollbackRehearsal(options = {}) {
  const evidence = { executorResult: 'FAIL', rollbackClassification: 'R2_NOT_PROVEN', dockerMutationAttempted: false, phases: [] };
  if (!options.acknowledged && !options.preRuntimeProbe) return { ...evidence, executorResult: 'ACKNOWLEDGEMENT_REQUIRED' };
  if (!options.jqBin) return { ...evidence, executorResult: 'JQ_PATH_REQUIRED' };
  const run = createBoundedRunner(options.run ?? execFile), generation = options.generation ?? safeGeneration(), project = `${REHEARSAL_PREFIX}${generation}`, repository = options.repository ?? REPOSITORY, port = options.port ?? 18080, validateCompose = options.validateEffectiveCompose ?? validateEffectiveCompose;
  assertCleanupProject(project); const checkpoints = await (options.createCheckpointEmitter ?? createRollbackCheckpointEmitter)({ generation, sink: options.checkpointSink }); attachJournal(evidence, { generation, journal: checkpoints.journal });
  const checkpoint = (phase, status = 'PASS', detail) => checkpoints.emit(phase, status, detail); const workspace = await (options.createWorkspace ?? (() => mkdtemp(join(tmpdir(), `${project}-`))) )();
  let cleanupDescriptor, expectedServices = [], archive, preserved = false, r2EvidenceReady = false;
  const runtimeGatewayRecords = async () => {
    if (options.inspectRuntimeGateway) return options.inspectRuntimeGateway({ project, run });
    return (await (options.readProjectServiceHealth ?? readProjectServiceHealth)({ project, run })).map((record) => ({ project, service: record.service, image: record.image, state: record.state }));
  };
  const cleanup = async () => {
    await checkpoint('CLEANUP_BEGIN');
    if (!evidence.dockerMutationAttempted) {
      await rm(workspace, { recursive: true, force: true });
      evidence.cleanup = 'CLEANUP_PASS';
      await checkpoint('CLEANUP_PASS');
      return;
    }
    let cleanupFailed = false;
    try {
      if (cleanupDescriptor) await run(cleanupDescriptor.command, cleanupDescriptor.args, { cwd: cleanupDescriptor.cwd, env: cleanupDescriptor.env, windowsHide: true });
    } catch { cleanupFailed = true; }
    let residue = await (options.auditProjectResidue ?? auditRollbackProjectResidue)({ project, run });
    if (cleanupFailed || hasResidue(residue)) {
      try { await (options.fallbackProjectCleanup ?? fallbackProjectCleanup)({ project, services: expectedServices, run }); } catch { fail('CLEANUP_RESIDUE_REMAINS'); }
      residue = await (options.auditProjectResidue ?? auditRollbackProjectResidue)({ project, run });
    }
    evidence.cleanupAudit = residueCounts(residue);
    if (hasResidue(residue)) fail('CLEANUP_RESIDUE_REMAINS');
    await rm(workspace, { recursive: true, force: true });
    evidence.cleanup = 'CLEANUP_PASS';
    await checkpoint('CLEANUP_PASS');
  };
  try {
    await checkpoint('EXECUTOR_START'); evidence.baseIdentity = await (options.resolveExactTag ?? resolveExactTag)({ repository, tag: BASE.tag, expectedCommit: BASE.commit, run }); await checkpoint('BASE_IDENTITY'); evidence.targetIdentity = await (options.resolveExactTag ?? resolveExactTag)({ repository, tag: TARGET.tag, expectedCommit: TARGET.commit, run }); await checkpoint('TARGET_IDENTITY');
    const jq = await (options.resolveJq ?? resolveJq)({ jqBin: options.jqBin, run }), shell = await (options.resolveShell ?? resolveShell)({ shBin: options.shBin }); if (jq.status !== 'JQ_AVAILABLE' || shell.status !== 'SH_AVAILABLE') fail(jq.status !== 'JQ_AVAILABLE' ? jq.status : shell.status); if (!(await (options.portProbe ?? probePortAvailable)(port))) fail('GATEWAY_PORT_OCCUPIED');
    const baseSource = join(workspace, 'base-source'), targetSource = join(workspace, 'target-source'); await (options.materializeSnapshot ?? materializeSnapshot)({ repository, tag: BASE.tag, expectedCommit: BASE.commit, destination: baseSource, run }); await (options.materializeSnapshot ?? materializeSnapshot)({ repository, tag: TARGET.tag, expectedCommit: TARGET.commit, destination: targetSource, run });
    const baseServices = servicesFromSource(await readFile(join(baseSource, 'docker-compose.yml'), 'utf8')), targetServices = servicesFromSource(await readFile(join(targetSource, 'docker-compose.yml'), 'utf8')); if (!baseServices.includes('kong') || baseServices.includes('api-gw') || !targetServices.includes('api-gw') || targetServices.includes('kong')) fail('SNAPSHOT_GATEWAY_INVENTORY_INVALID'); expectedServices = [...new Set([...baseServices, ...targetServices])];
    const runtime = runtimePath(workspace); await cp(baseSource, runtime, { recursive: true }); const envFile = join(runtime, '.env'); const environment = await writeSyntheticRuntimeEnv({ examplePath: join(baseSource, '.env.example'), destination: envFile, port, returnCredentials: true }); const baseOverride = join(workspace, 'base.override.yml'); await writeFile(baseOverride, createIsolationOverride({ project, services: baseServices, gatewayService: 'kong', port })); const targetEnv = join(workspace, 'target-preflight.env'); await writeSyntheticRuntimeEnv({ examplePath: join(targetSource, '.env.example'), destination: targetEnv, port }); const targetOverride = join(workspace, 'target.override.yml'); await writeFile(targetOverride, createIsolationOverride({ project, services: targetServices, gatewayService: 'api-gw', port }));
    const baseConfig = createExecutionComposeConfigInvocation({ composePath: join(runtime, 'docker-compose.yml'), overridePath: baseOverride, envFile, project, workspace }), targetConfig = createExecutionComposeConfigInvocation({ composePath: join(targetSource, 'docker-compose.yml'), overridePath: targetOverride, envFile: targetEnv, project, workspace });
    const productionContainers = await (options.listProductionContainers ?? listProductionContainers)(run);
    const productionBefore = await (options.productionFingerprint ?? captureProductionFingerprint)({ run, fetchImpl: options.fetchImpl ?? fetch, project });
    if (productionBefore.d5 !== 'CURRENT_MATCH' || productionBefore.godel !== 'LIVE_READY') fail('PRODUCTION_FINGERPRINT_UNAVAILABLE');
    evidence.productionBefore = { d5: 'CURRENT_MATCH', godel: 'LIVE_READY' }; evidence.productionScope = safeProductionScope(productionBefore);
    await checkpoint('PRODUCTION_SCOPE_DISCOVERY', 'PASS', evidence.productionScope); await checkpoint('PRODUCTION_FINGERPRINT_BEFORE');
    const baseModel = await (options.renderCompose ?? render)(baseConfig, run); await checkpoint('BASE_COMPOSE_RENDER');
    const targetModel = await (options.renderCompose ?? render)(targetConfig, run); await checkpoint('TARGET_COMPOSE_RENDER');
    validateCompose({ model: baseModel, workspace, project, productionContainers }); validateCompose({ model: targetModel, workspace, project, productionContainers });
    assertFixtureDependencyHealthchecks({ model: baseModel, phase: 'BASE' }); assertFixtureDependencyHealthchecks({ model: targetModel, phase: 'TARGET' });
    if ((await (options.inspectImages ?? inspectImages)([...new Set([...imagesFromCompose(baseModel), ...imagesFromCompose(targetModel)])], run)).status !== 'ALL_IMAGES_PRESENT') fail('IMAGE_MISSING'); await checkpoint('IMAGE_PREFLIGHT');
    evidence.executionReadiness = 'READY'; await checkpoint('PRE_RUNTIME_READY'); if (options.preRuntimeProbe) { evidence.executorResult = 'PRE_RUNTIME_PASS'; return evidence; }
    const baseManifest = await (options.manifest ?? createManagedTreeManifest)(runtime), baseEnvDigest = await capturePrivateFileDigest(envFile); evidence.baseConfig = { status: 'BASE_CONFIG_FINGERPRINT_PREPARED', fileCount: baseManifest.length };
    const baseRun = { composePath: join(runtime, 'docker-compose.yml'), overridePath: baseOverride, envFile, project, workspace }; cleanupDescriptor = createRuntimeComposeInvocation({ ...baseRun, action: 'cleanup' }); evidence.dockerMutationAttempted = true; const baseStart = createRuntimeComposeInvocation({ ...baseRun, action: 'start' }); await checkpoint('BASE_START_BEGIN'); await run(baseStart.command, baseStart.args, { cwd: workspace, env: baseStart.env, windowsHide: true }); await checkpoint('BASE_START_PASS'); await (options.waitForRequiredServices ?? waitForRequiredServicesHealthy)({ phase: 'BASE', project, run, readServices: options.readProjectServiceHealth ?? readProjectServiceHealth, sleep: options.sleep }); await checkpoint('BASE_REQUIRED_SERVICES_PASS'); await (options.waitForRuntime ?? waitForGateway)({ port, credentials: environment.credentials, fetchImpl: options.fetchImpl ?? fetch, sleep: options.sleep }); evidence.baseRuntimeGateway = assertRuntimeGatewayIdentity({ phase: 'BASE', project, records: await runtimeGatewayRecords() }); await checkpoint('BASE_GATEWAY_IDENTITY_PASS');
    const fixtureA = await (options.createFixtures ?? createFixtures)({ compose: { ...baseRun, env: baseConfig.env, envFile }, runtime, port, project, workspace, credentials: environment.credentials, generation: `${generation}a`, run, fetchImpl: options.fetchImpl ?? fetch, checkpoint: mapCheckpoint(fixtureMap('BASE_A', true), checkpoint) }); evidence.fixtureA = { baseCreated: 'PASS' }; await checkpoint('BASE_A_FIXTURES_PASS');
    const baseStop = createRuntimeComposeInvocation({ ...baseRun, action: 'stop' }); await run(baseStop.command, baseStop.args, { cwd: workspace, env: baseStop.env, windowsHide: true }); await checkpoint('BASE_STOP_PASS');
    const beforeArchives = await readdir(join(runtime, 'backups')).catch(() => []), update = createRealUpdateInvocation({ runtime, jq, shell, repository }); await checkpoint('FORWARD_UPDATE_BEGIN');
    const updateOutput = await run(update.command, update.args, { cwd: update.cwd, env: update.env, windowsHide: true }); evidence.update = { ...parseUpdateSummary(updateOutput), stamp: await assertTargetStamp(runtime) }; archive = await exactNewArchive(runtime, beforeArchives); evidence.preUpdateArchive = { status: 'PRESENT', classification: 'CONFIG_VENDOR_AID', sensitivity: 'SENSITIVE_SYNTHETIC_ENV' }; await checkpoint('FORWARD_UPDATE_PASS');
    const targetComposePath = join(runtime, 'docker-compose.yml'); const actualTargetServices = servicesFromSource(await readFile(targetComposePath, 'utf8')); if (!actualTargetServices.includes('api-gw') || actualTargetServices.includes('kong')) fail('TARGET_SERVICE_INVENTORY_INVALID');
    const targetRun = { composePath: targetComposePath, overridePath: targetOverride, envFile, project, workspace }; const actualTargetModel = await (options.renderCompose ?? render)(createExecutionComposeConfigInvocation(targetRun), run); validateCompose({ model: actualTargetModel, workspace, project, productionContainers }); assertFixtureDependencyHealthchecks({ model: actualTargetModel, phase: 'TARGET' }); cleanupDescriptor = createRuntimeComposeInvocation({ ...targetRun, action: 'cleanup' });
    const targetStart = createRuntimeComposeInvocation({ ...targetRun, action: 'start' }); await checkpoint('TARGET_START_BEGIN'); await run(targetStart.command, targetStart.args, { cwd: workspace, env: targetStart.env, windowsHide: true }); await checkpoint('TARGET_START_PASS'); await (options.waitForRequiredServices ?? waitForRequiredServicesHealthy)({ phase: 'TARGET', project, run, readServices: options.readProjectServiceHealth ?? readProjectServiceHealth, sleep: options.sleep }); await checkpoint('TARGET_REQUIRED_SERVICES_PASS'); await (options.waitForRuntime ?? waitForGateway)({ port, credentials: environment.credentials, fetchImpl: options.fetchImpl ?? fetch, sleep: options.sleep }); evidence.targetRuntimeGateway = assertRuntimeGatewayIdentity({ phase: 'TARGET', project, records: await runtimeGatewayRecords() }); await checkpoint('TARGET_GATEWAY_IDENTITY_PASS');
    const targetA = await (options.validateFixtures ?? validateFixtures)({ base: fixtureA.fingerprint, context: fixtureA.privateContext, compose: { ...targetRun, env: targetStart.env, envFile }, port, workspace, project, credentials: environment.credentials, run, fetchImpl: options.fetchImpl ?? fetch, checkpoint: mapCheckpoint(fixtureMap('TARGET_A', false), checkpoint) }); if (compareFixtureFingerprints(fixtureA.fingerprint, targetA).status !== 'PASS') fail('TARGET_A_FIXTURE_MISMATCH'); evidence.fixtureA.targetValidated = 'PASS'; await checkpoint('TARGET_A_FIXTURES_PASS');
    const fixtureB = await (options.createFixtures ?? createFixtures)({ compose: { ...targetRun, env: targetStart.env, envFile }, runtime, port, project, workspace, credentials: environment.credentials, generation: `${generation}b`, run, fetchImpl: options.fetchImpl ?? fetch, checkpoint: mapCheckpoint(fixtureMap('TARGET_B', true), checkpoint) }); evidence.fixtureB = { targetCreated: 'PASS' }; await checkpoint('TARGET_B_FIXTURES_PASS');
    const productionTarget = await (options.productionFingerprint ?? captureProductionFingerprint)({ run, fetchImpl: options.fetchImpl ?? fetch, project }); if (compareProductionFingerprints(productionBefore, productionTarget).status !== 'UNCHANGED') fail('PRODUCTION_FINGERPRINT_MISMATCH'); evidence.productionTarget = 'UNCHANGED'; await checkpoint('PRODUCTION_TARGET_PHASE_UNCHANGED');
    const targetStop = createRuntimeComposeInvocation({ ...targetRun, action: 'stop' }); await run(targetStop.command, targetStop.args, { cwd: workspace, env: targetStop.env, windowsHide: true }); await checkpoint('TARGET_STOP_PASS');
    await (options.preserveDbConfig ?? preserveDbConfig)({ project, run }); await (options.removeDenoCache ?? removeDenoCache)({ project, run }); const preservedRoot = join(workspace, 'preserved'); await mkdir(preservedRoot); await (options.moveDirectory ?? movePreservedDirectory)({ workspace, source: join(runtime, 'volumes', 'db', 'data'), destination: join(preservedRoot, 'db-data') }); await (options.moveDirectory ?? movePreservedDirectory)({ workspace, source: join(runtime, 'volumes', 'storage'), destination: join(preservedRoot, 'storage') }); preserved = true; await checkpoint('PERSISTENT_DATA_PRESERVED');
    const archiveDigest = await sha256(archive), entries = await (options.listArchiveEntries ?? readArchiveEntries)({ archive, shell, run }); validateArchiveEntries(entries, join(workspace, 'rollback-runtime')); await (options.assertArchiveStable ?? assertArchiveStable)(archive, archiveDigest); evidence.archiveIdentity = 'STABLE'; await checkpoint('ARCHIVE_VALIDATION_PASS');
    const rollbackRuntime = join(workspace, 'rollback-runtime'); await mkdir(rollbackRuntime); await (options.extractArchive ?? extractArchive)({ archive, destination: rollbackRuntime, shell, run }); await (options.moveDirectory ?? movePreservedDirectory)({ workspace, source: join(preservedRoot, 'db-data'), destination: join(rollbackRuntime, 'volumes', 'db', 'data') }); await (options.moveDirectory ?? movePreservedDirectory)({ workspace, source: join(preservedRoot, 'storage'), destination: join(rollbackRuntime, 'volumes', 'storage') });
    evidence.envContinuity = await (options.assertPrivateDigestMatch ?? assertPrivateDigestMatch)(baseEnvDigest, join(rollbackRuntime, '.env')); const rollbackManifest = await (options.manifest ?? createManagedTreeManifest)(rollbackRuntime); if (compareManagedTreeManifests(baseManifest, rollbackManifest).status !== 'MATCH') fail('BASE_CONFIG_FINGERPRINT_MISMATCH'); evidence.baseConfigFingerprint = 'MATCH'; await checkpoint('BASE_CONFIG_FINGERPRINT_MATCH');
    const rollbackServices = servicesFromSource(await readFile(join(rollbackRuntime, 'docker-compose.yml'), 'utf8')); if (!rollbackServices.includes('kong') || rollbackServices.includes('api-gw')) fail('ROLLBACK_GATEWAY_INVENTORY_INVALID'); const rollbackOverride = join(workspace, 'rollback-base.override.yml'); await writeFile(rollbackOverride, createIsolationOverride({ project, services: rollbackServices, gatewayService: 'kong', port })); const rollbackRun = { composePath: join(rollbackRuntime, 'docker-compose.yml'), overridePath: rollbackOverride, envFile: join(rollbackRuntime, '.env'), project, workspace }; const rollbackModel = await (options.renderCompose ?? render)(createExecutionComposeConfigInvocation(rollbackRun), run); validateCompose({ model: rollbackModel, workspace, project, productionContainers }); assertFixtureDependencyHealthchecks({ model: rollbackModel, phase: 'BASE' }); if ((await (options.inspectImages ?? inspectImages)(imagesFromCompose(rollbackModel), run)).status !== 'ALL_IMAGES_PRESENT') fail('ROLLBACK_IMAGE_MISSING'); cleanupDescriptor = createRuntimeComposeInvocation({ ...rollbackRun, action: 'cleanup' });
    const rollbackStart = createRuntimeComposeInvocation({ ...rollbackRun, action: 'start' }); await checkpoint('ROLLBACK_START_BEGIN'); await run(rollbackStart.command, rollbackStart.args, { cwd: workspace, env: rollbackStart.env, windowsHide: true }); await checkpoint('ROLLBACK_START_PASS'); await (options.waitForRequiredServices ?? waitForRequiredServicesHealthy)({ phase: 'BASE', project, run, readServices: options.readProjectServiceHealth ?? readProjectServiceHealth, sleep: options.sleep }); await checkpoint('ROLLBACK_REQUIRED_SERVICES_PASS'); await (options.waitForRuntime ?? waitForGateway)({ port, credentials: environment.credentials, fetchImpl: options.fetchImpl ?? fetch, sleep: options.sleep }); evidence.rollbackRuntimeGateway = assertRuntimeGatewayIdentity({ phase: 'BASE', project, records: await runtimeGatewayRecords() }); await checkpoint('ROLLBACK_GATEWAY_IDENTITY_PASS');
    for (const [prefix, fixture] of [['ROLLBACK_A', fixtureA], ['ROLLBACK_B', fixtureB]]) { const validated = await (options.validateFixtures ?? validateFixtures)({ base: fixture.fingerprint, context: fixture.privateContext, compose: { ...rollbackRun, env: rollbackStart.env }, port, workspace, project, credentials: environment.credentials, run, fetchImpl: options.fetchImpl ?? fetch, checkpoint: mapCheckpoint(fixtureMap(prefix, false), checkpoint) }); if (compareFixtureFingerprints(fixture.fingerprint, validated).status !== 'PASS') fail(`${prefix}_FIXTURE_MISMATCH`); if (prefix === 'ROLLBACK_A') evidence.fixtureA.rollbackValidated = 'PASS'; else evidence.fixtureB.rollbackValidated = 'PASS'; await checkpoint(`${prefix}_FIXTURES_PASS`); }
    const productionRollback = await (options.productionFingerprint ?? captureProductionFingerprint)({ run, fetchImpl: options.fetchImpl ?? fetch, project }); if (compareProductionFingerprints(productionBefore, productionRollback).status !== 'UNCHANGED') fail('PRODUCTION_FINGERPRINT_MISMATCH'); evidence.productionRollback = 'UNCHANGED'; await checkpoint('PRODUCTION_ROLLBACK_PHASE_UNCHANGED'); evidence.rollbackClassification = 'R2_PROVEN'; if (!hasR2SuccessEvidence(evidence)) fail('R2_SUCCESS_EVIDENCE_INCOMPLETE'); r2EvidenceReady = true; await checkpoint('EXECUTOR_COMPLETE');
  } catch (error) { evidence.executorResult = 'FAIL'; evidence.blockedBy = safeError(error); await checkpoint('EXECUTOR_ERROR', 'FAIL', evidence.blockedBy); } finally { try { await cleanup(); if (r2EvidenceReady && evidence.cleanup === 'CLEANUP_PASS') evidence.executorResult = 'ROLLBACK_R2_PASS'; } catch (error) { evidence.executorResult = 'FAIL'; evidence.rollbackClassification = 'R2_NOT_PROVEN'; evidence.cleanup = 'CLEANUP_FAIL'; evidence.blockedBy ??= safeError(error); } await checkpoint('FINAL_RESULT_READY', evidence.executorResult, { executorResult: evidence.executorResult, cleanup: evidence.cleanup, dockerMutationAttempted: evidence.dockerMutationAttempted }); }
  return evidence;
}

async function main() { const result = await executeHistoricalRollbackRehearsal(parseRollbackExecutorArguments(process.argv.slice(2))); const output = await finalizeRollbackExecutorOutput({ result }); process.exitCode = output.finalOutput === 'WRITTEN' && ['ROLLBACK_R2_PASS', 'PRE_RUNTIME_PASS'].includes(result.executorResult) ? 0 : 1; }
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main().catch((error) => { process.stderr.write(JSON.stringify({ executorResult: 'FAIL', blockedBy: safeError(error) })); process.exitCode = 1; });
