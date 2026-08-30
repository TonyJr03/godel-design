import { spawn } from "node:child_process";

import {
  assertReferencedSecretGenerationMatches,
  generationMutationLockPath,
  getCurrentSecretGeneration,
  readGenerationMutationLock,
  readSecretGeneration,
  releaseGenerationMutationLock,
  replaceCurrentGenerationPointer,
  writeAllowlistedEnvironmentFile,
} from "./secret-generation.mjs";
import {
  POSTGRES_ROTATED_ROLES,
  buildPostgresPasswordRestorationSql,
  buildPostgresPasswordRotationSql,
  buildSupavisorCredentialCurlConfig,
  validatePostgresPassword,
  validateRestorablePostgresPassword,
  validateSupavisorCredentialApiResult,
} from "./postgres-password-rotation.mjs";
import {
  createSupabasePostgresDbRecreateInvocation,
  createSupabasePostgresPasswordAuthenticationProbeInvocation,
  createSupabasePostgresPasswordConsumerRecreateInvocation,
  createSupabasePostgresPasswordPsqlInvocation,
  createSupabaseRuntimeComposeInvocation,
  createSupabaseSupavisorCredentialApiInvocation,
  createSupabaseSupavisorPasswordProbeInvocation,
} from "./supabase-runtime-compose.mjs";
import {
  createGodelMaintenanceCloseInvocation,
  createGodelMaintenanceOpenInvocation,
  createGodelRuntimeComposeInvocation,
} from "./godel-runtime-compose.mjs";

const SUPABASE_SERVICES = Object.freeze(["db", "supavisor", "meta", "auth", "rest", "realtime", "storage", "functions", "studio", "api-gw", "imgproxy"]);
const CONSUMER_SERVICES = Object.freeze(["supavisor", "meta", "auth", "rest", "realtime", "storage", "functions", "studio"]);
const MANAGED_SERVICES = Object.freeze(["db", ...CONSUMER_SERVICES]);
const GODEL_SERVICES = Object.freeze(["godel-app", "godel-nginx"]);
const ALL_SERVICES = new Set([...SUPABASE_SERVICES, ...GODEL_SERVICES]);
const MAX_OUTPUT_BYTES = 4096;
const OPERATION = "postgres-password-rotation";
const ENV_CONTRACT = Object.freeze({
  db: [{ name: "POSTGRES_PASSWORD", kind: "value" }, { name: "PGPASSWORD", kind: "value" }],
  supavisor: [{ name: "POSTGRES_PASSWORD", kind: "value" }, { name: "DATABASE_URL", kind: "url" }],
  meta: [{ name: "PG_META_DB_PASSWORD", kind: "value" }],
  auth: [{ name: "GOTRUE_DB_DATABASE_URL", kind: "url" }],
  rest: [{ name: "PGRST_DB_URI", kind: "url" }],
  realtime: [{ name: "DB_PASSWORD", kind: "value" }],
  storage: [{ name: "DATABASE_URL", kind: "url" }],
  functions: [{ name: "SUPABASE_DB_URL", kind: "url" }],
  studio: [{ name: "POSTGRES_PASSWORD", kind: "value" }],
});

function fail(code) {
  throw new Error(code);
}

function exactSet(values, expected, code) {
  if (!Array.isArray(values) || values.length !== expected.length || new Set(values).size !== expected.length || values.some((value) => !expected.includes(value))) fail(code);
}

function parseSnapshot(snapshot, code) {
  const values = new Map();
  for (const line of Buffer.from(snapshot).toString("utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || values.has(match[1])) fail(code);
    const raw = match[2].trim();
    values.set(match[1], raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) ? raw.slice(1, -1) : raw);
  }
  return values;
}

function required(values, name, code) {
  const value = values.get(name);
  if (typeof value !== "string" || !value || /[\r\n\0]/.test(value)) fail(code);
  return value;
}

function postgresPassword(values, validator, code) {
  try {
    return validator(required(values, "POSTGRES_PASSWORD", code));
  } catch {
    fail(code);
  }
}

function parseContainerEnvironment(stdout, code) {
  let items;
  try { items = JSON.parse(stdout); } catch { fail(code); }
  if (!Array.isArray(items) || items.some((item) => typeof item !== "string")) fail(code);
  return items;
}

function environmentValue(items, name, code) {
  const matches = items.filter((item) => item.startsWith(`${name}=`));
  if (matches.length !== 1) fail(code);
  return matches[0].slice(name.length + 1);
}

function urlPassword(value, code) {
  try {
    const parsed = new URL(value);
    if (!parsed.protocol || !parsed.username || !parsed.password) fail(code);
    return decodeURIComponent(parsed.password);
  } catch {
    fail(code);
  }
}

function isHealthyState(state) {
  return state?.Running === true && state?.Health?.Status === "healthy";
}

function safeContainerId(value, code) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[a-f0-9]{12,64}$/i.test(id)) fail(code);
  return id;
}

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function runSecretProcess({ executable, args, input = null, captureStdout = false, environment, cwd, errorCode, spawnImpl = spawn }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let exceeded = false;
    const rejectSanitized = () => {
      if (!settled) {
        settled = true;
        reject(new Error(errorCode));
      }
    };
    let child;
    try {
      child = spawnImpl(executable, args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        ...(environment ? { env: environment } : {}),
      });
    } catch {
      rejectSanitized();
      return;
    }
    child.once("error", rejectSanitized);
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (captureStdout && stdoutBytes <= MAX_OUTPUT_BYTES) stdout += chunk.toString("utf8");
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        exceeded = true;
        child.kill();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_OUTPUT_BYTES) {
        exceeded = true;
        child.kill();
      }
    });
    child.once("close", (exitCode) => {
      if (exitCode !== 0 || exceeded) return rejectSanitized();
      if (!settled) {
        settled = true;
        resolve(Object.freeze({ stdout: captureStdout ? stdout : "" }));
      }
    });
    if (input === null) child.stdin.end();
    else child.stdin.end(input);
  });
}

export function createPostgresPasswordLiveRuntime({
  protectedRoot,
  supabaseEnvPath,
  godelEnvPath,
  sourceGenerationId,
  targetGenerationId,
  root = process.cwd(),
  processRunner = runSecretProcess,
  spawnImpl = spawn,
  secretGeneration = {
    assertReferencedSecretGenerationMatches,
    generationMutationLockPath,
    getCurrentSecretGeneration,
    readGenerationMutationLock,
    readSecretGeneration,
    releaseGenerationMutationLock,
    replaceCurrentGenerationPointer,
    writeAllowlistedEnvironmentFile,
  },
  hooks = {},
} = {}) {
  if (typeof protectedRoot !== "string" || typeof supabaseEnvPath !== "string" || typeof godelEnvPath !== "string" || typeof root !== "string") fail("POSTGRES_LIVE_RUNTIME_CONFIGURATION_INVALID");
  if (typeof sourceGenerationId !== "string" || typeof targetGenerationId !== "string" || sourceGenerationId === targetGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
  if (typeof processRunner !== "function") fail("POSTGRES_LIVE_RUNTIME_CONFIGURATION_INVALID");

  async function execute(invocation, { input = null, captureStdout = false, errorCode, cwd = root } = {}) {
    try {
      const result = await processRunner({ executable: "docker", args: invocation.args, input, captureStdout, environment: invocation.environment, cwd, errorCode, spawnImpl });
      if (!result || typeof result.stdout !== "string") fail(errorCode);
      return result.stdout;
    } catch {
      fail(errorCode);
    }
  }

  async function generationValues(generationId, names) {
    if (generationId !== sourceGenerationId && generationId !== targetGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
    try {
      const generation = await secretGeneration.readSecretGeneration({ protectedRoot, generationId });
      const values = parseSnapshot(generation.supabaseSnapshot, "POSTGRES_LIVE_RUNTIME_GENERATION_INVALID");
      const passwordValidator = generationId === sourceGenerationId ? validateRestorablePostgresPassword : validatePostgresPassword;
      const output = new Map();
      for (const name of names) output.set(name, name === "POSTGRES_PASSWORD" ? postgresPassword(values, passwordValidator, "POSTGRES_LIVE_RUNTIME_GENERATION_INVALID") : required(values, name, "POSTGRES_LIVE_RUNTIME_GENERATION_INVALID"));
      return output;
    } catch {
      fail("POSTGRES_LIVE_RUNTIME_GENERATION_INVALID");
    }
  }

  async function mutateDatabaseRoles({ generationId, roles }, buildSql) {
    exactSet(roles, POSTGRES_ROTATED_ROLES, "POSTGRES_LIVE_RUNTIME_ROLES_INVALID");
    const password = (await generationValues(generationId, ["POSTGRES_PASSWORD"])).get("POSTGRES_PASSWORD");
    let sql;
    try { sql = buildSql(password); } catch { fail("POSTGRES_LIVE_RUNTIME_DATABASE_SQL_INVALID"); }
    await execute(createSupabasePostgresPasswordPsqlInvocation(), { input: sql, errorCode: "POSTGRES_LIVE_RUNTIME_DATABASE_MUTATION_FAILED" });
    return true;
  }

  async function inspectServiceEnvironment(service) {
    const id = await getServiceIdentity({ service });
    const stdout = await execute({ args: ["inspect", "--format", "{{json .Config.Env}}", id], shell: false }, { captureStdout: true, errorCode: "POSTGRES_LIVE_RUNTIME_ENV_INSPECTION_FAILED" });
    return parseContainerEnvironment(stdout, "POSTGRES_LIVE_RUNTIME_ENV_INSPECTION_FAILED");
  }

  async function getServiceIdentity({ service }) {
    if (!ALL_SERVICES.has(service)) fail("POSTGRES_LIVE_RUNTIME_SERVICE_FORBIDDEN");
    const invocation = SUPABASE_SERVICES.includes(service)
      ? createSupabaseRuntimeComposeInvocation({ args: ["ps", "--all", "-q", service] })
      : createGodelRuntimeComposeInvocation({ args: ["ps", "--all", "-q", service === "godel-app" ? "app" : "nginx"] });
    const stdout = await execute(invocation, { captureStdout: true, errorCode: "POSTGRES_LIVE_RUNTIME_SERVICE_IDENTITY_FAILED" });
    return safeContainerId(stdout, "POSTGRES_LIVE_RUNTIME_SERVICE_IDENTITY_FAILED");
  }

  async function getManagedServiceIdentityState({ service }) {
    if (!MANAGED_SERVICES.includes(service)) fail("POSTGRES_LIVE_RUNTIME_MANAGED_SERVICE_FORBIDDEN");
    const stdout = await execute(
      createSupabaseRuntimeComposeInvocation({ args: ["ps", "--all", "-q", service] }),
      { captureStdout: true, errorCode: "POSTGRES_LIVE_RUNTIME_MANAGED_IDENTITY_LOOKUP_FAILED" },
    );
    if (!stdout.trim()) return Object.freeze({ state: "ABSENT" });
    return Object.freeze({ state: "PRESENT", id: safeContainerId(stdout, "POSTGRES_LIVE_RUNTIME_MANAGED_IDENTITY_INVALID") });
  }

  async function inspectState(service) {
    const id = await getServiceIdentity({ service });
    const stdout = await execute({ args: ["inspect", "--format", "{{json .State}}", id], shell: false }, { captureStdout: true, errorCode: `POSTGRES_LIVE_RUNTIME_${service}_STATE_FAILED` });
    try { return JSON.parse(stdout); } catch { fail(`POSTGRES_LIVE_RUNTIME_${service}_STATE_FAILED`); }
  }

  async function waitServiceHealthy({ service }) {
    if (!SUPABASE_SERVICES.includes(service)) fail("POSTGRES_LIVE_RUNTIME_HEALTH_SERVICE_FORBIDDEN");
    const deadline = Date.now() + 90000;
    while (Date.now() <= deadline) {
      if (isHealthyState(await inspectState(service))) return true;
      await wait(1000);
    }
    fail(`POSTGRES_LIVE_RUNTIME_${service}_HEALTH_TIMEOUT`);
  }

  async function expectedAndOppositePasswords(generationId) {
    if (generationId !== sourceGenerationId && generationId !== targetGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
    const opposite = generationId === sourceGenerationId ? targetGenerationId : sourceGenerationId;
    const [expected, revoked] = await Promise.all([
      generationValues(generationId, ["POSTGRES_PASSWORD"]),
      generationValues(opposite, ["POSTGRES_PASSWORD"]),
    ]);
    return { expected: expected.get("POSTGRES_PASSWORD"), revoked: revoked.get("POSTGRES_PASSWORD") };
  }

  async function requiredHook(name, payload) {
    if (typeof hooks[name] !== "function") fail("POSTGRES_LIVE_RUNTIME_HOOK_REQUIRED");
    try { return await hooks[name](payload); } catch { fail("POSTGRES_LIVE_RUNTIME_HOOK_FAILED"); }
  }

  return Object.freeze({
    async rotateDatabaseRoles(value) {
      if (value?.generationId !== targetGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
      return mutateDatabaseRoles(value, buildPostgresPasswordRotationSql);
    },
    async restoreDatabaseRoles(value) {
      if (value?.generationId !== sourceGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
      return mutateDatabaseRoles(value, buildPostgresPasswordRestorationSql);
    },
    async restoreDatabaseRolesTarget(value) {
      if (value?.generationId !== targetGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
      return mutateDatabaseRoles(value, buildPostgresPasswordRotationSql);
    },
    async verifyDatabaseAuthentication({ generationId, roles }) {
      exactSet(roles, POSTGRES_ROTATED_ROLES, "POSTGRES_LIVE_RUNTIME_ROLES_INVALID");
      const password = (await generationValues(generationId, ["POSTGRES_PASSWORD"])).get("POSTGRES_PASSWORD");
      for (const role of POSTGRES_ROTATED_ROLES) {
        const stdout = await execute(createSupabasePostgresPasswordAuthenticationProbeInvocation(role), { input: `${password}\n`, captureStdout: true, errorCode: "POSTGRES_LIVE_RUNTIME_DATABASE_AUTH_FAILED" });
        if (stdout.trim() !== role) fail("POSTGRES_LIVE_RUNTIME_DATABASE_AUTH_FAILED");
      }
      return true;
    },
    async updateSupavisorManager({ generationId }) {
      const values = await generationValues(generationId, ["POSTGRES_PASSWORD", "SERVICE_ROLE_KEY", "POOLER_TENANT_ID"]);
      let config;
      try { config = buildSupavisorCredentialCurlConfig({ targetPassword: values.get("POSTGRES_PASSWORD"), serviceRoleKey: values.get("SERVICE_ROLE_KEY"), tenantId: values.get("POOLER_TENANT_ID") }); } catch { fail("POSTGRES_LIVE_RUNTIME_SUPAVISOR_CONFIG_INVALID"); }
      const stdout = await execute(createSupabaseSupavisorCredentialApiInvocation(), { input: config, captureStdout: true, errorCode: "POSTGRES_LIVE_RUNTIME_SUPAVISOR_UPDATE_FAILED" });
      try { validateSupavisorCredentialApiResult({ exitCode: 0, stdout }); } catch { fail("POSTGRES_LIVE_RUNTIME_SUPAVISOR_UPDATE_FAILED"); }
      return true;
    },
    async restoreSupavisorManager(value) {
      if (value?.generationId !== sourceGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
      return this.updateSupavisorManager(value);
    },
    async restoreSupavisorManagerTarget(value) {
      if (value?.generationId !== targetGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
      return this.updateSupavisorManager(value);
    },
    async verifySupavisorManager({ generationId }) {
      const values = await generationValues(generationId, ["POSTGRES_PASSWORD", "POOLER_TENANT_ID"]);
      const input = `${values.get("POSTGRES_PASSWORD")}\npgbouncer.${values.get("POOLER_TENANT_ID")}\n`;
      for (const port of [5432, 6543]) {
        const stdout = await execute(createSupabaseSupavisorPasswordProbeInvocation(port), { input, captureStdout: true, errorCode: "POSTGRES_LIVE_RUNTIME_SUPAVISOR_AUTH_FAILED" });
        if (stdout.trim() !== "1") fail("POSTGRES_LIVE_RUNTIME_SUPAVISOR_AUTH_FAILED");
      }
      return true;
    },
    async writeEnvironment({ generationId, allowedNames }) {
      exactSet(allowedNames, ["POSTGRES_PASSWORD"], "POSTGRES_LIVE_RUNTIME_ENVIRONMENT_SCOPE_INVALID");
      const password = (await generationValues(generationId, ["POSTGRES_PASSWORD"])).get("POSTGRES_PASSWORD");
      try {
        await secretGeneration.writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: { POSTGRES_PASSWORD: password }, allowedNames: ["POSTGRES_PASSWORD"] });
        await secretGeneration.assertReferencedSecretGenerationMatches({ protectedRoot, generationId, supabaseEnvPath, godelEnvPath });
      } catch {
        fail("POSTGRES_LIVE_RUNTIME_ENVIRONMENT_WRITE_FAILED");
      }
      return true;
    },
    async restoreEnvironment(value) {
      if (value?.generationId !== sourceGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
      return this.writeEnvironment(value);
    },
    async restoreEnvironmentTarget(value) {
      if (value?.generationId !== targetGenerationId) fail("POSTGRES_LIVE_RUNTIME_GENERATION_RELATION_INVALID");
      return this.writeEnvironment(value);
    },
    async verifyLiveEnvironment({ generationId }) {
      try { await secretGeneration.assertReferencedSecretGenerationMatches({ protectedRoot, generationId, supabaseEnvPath, godelEnvPath }); } catch { fail("POSTGRES_LIVE_RUNTIME_ENVIRONMENT_VERIFY_FAILED"); }
      return true;
    },
    async replacePointer({ fromGenerationId, toGenerationId }) {
      try { await secretGeneration.replaceCurrentGenerationPointer({ protectedRoot, generationId: toGenerationId, expectedGenerationId: fromGenerationId }); } catch { fail("POSTGRES_LIVE_RUNTIME_POINTER_REPLACE_FAILED"); }
      return true;
    },
    async readCurrentPointer() {
      try {
        const current = await secretGeneration.getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false });
        if (current.state !== "INITIALIZED" || typeof current.generationId !== "string") fail("POSTGRES_LIVE_RUNTIME_POINTER_READ_FAILED");
        return current.generationId;
      } catch { fail("POSTGRES_LIVE_RUNTIME_POINTER_READ_FAILED"); }
    },
    async readOperationLockState() {
      let lock;
      try { lock = await secretGeneration.readGenerationMutationLock({ protectedRoot }); } catch { fail("POSTGRES_LIVE_RUNTIME_LOCK_READ_FAILED"); }
      if (lock.state === "ABSENT") return "ABSENT";
      if (lock.operation !== OPERATION || lock.generationId !== targetGenerationId) fail("POSTGRES_LIVE_RUNTIME_LOCK_OWNERSHIP_INVALID");
      return "PRESENT";
    },
    async releaseLock() {
      let lock;
      try { lock = await secretGeneration.readGenerationMutationLock({ protectedRoot }); } catch { fail("POSTGRES_LIVE_RUNTIME_LOCK_READ_FAILED"); }
      if (lock.state !== "PRESENT" || lock.operation !== OPERATION || lock.generationId !== targetGenerationId) fail("POSTGRES_LIVE_RUNTIME_LOCK_OWNERSHIP_INVALID");
      try { await secretGeneration.releaseGenerationMutationLock(secretGeneration.generationMutationLockPath(protectedRoot)); } catch { fail("POSTGRES_LIVE_RUNTIME_LOCK_RELEASE_FAILED"); }
      return true;
    },
    getServiceIdentity,
    getManagedServiceIdentityState,
    async recreateDatabase() {
      await execute(createSupabasePostgresDbRecreateInvocation(), { errorCode: "POSTGRES_LIVE_RUNTIME_DATABASE_RECREATE_FAILED" });
      return true;
    },
    async recreateConsumer({ service }) {
      if (!CONSUMER_SERVICES.includes(service)) fail("POSTGRES_LIVE_RUNTIME_CONSUMER_FORBIDDEN");
      await execute(createSupabasePostgresPasswordConsumerRecreateInvocation(service), { errorCode: "POSTGRES_LIVE_RUNTIME_CONSUMER_RECREATE_FAILED" });
      return true;
    },
    async waitDatabaseHealthy() { return waitServiceHealthy({ service: "db" }); },
    waitServiceHealthy,
    async verifyRuntimeSecretHygiene({ service, generationId }) {
      const contract = ENV_CONTRACT[service];
      if (!contract) fail("POSTGRES_LIVE_RUNTIME_HYGIENE_SERVICE_FORBIDDEN");
      const { expected, revoked } = await expectedAndOppositePasswords(generationId);
      const environment = await inspectServiceEnvironment(service);
      let expectedMatch = true;
      let revokedAbsent = true;
      for (const item of contract) {
        const value = environmentValue(environment, item.name, "POSTGRES_LIVE_RUNTIME_HYGIENE_INVALID");
        const password = item.kind === "url" ? urlPassword(value, "POSTGRES_LIVE_RUNTIME_HYGIENE_INVALID") : value;
        if (password !== expected) expectedMatch = false;
        if (password === revoked) revokedAbsent = false;
      }
      return generationId === targetGenerationId
        ? Object.freeze({ targetMatch: expectedMatch, oldAbsent: revokedAbsent })
        : Object.freeze({ sourceMatch: expectedMatch, targetAbsent: revokedAbsent });
    },
    async closeMaintenance() {
      await execute(createGodelMaintenanceCloseInvocation(), { errorCode: "POSTGRES_LIVE_RUNTIME_MAINTENANCE_CLOSE_FAILED" });
      return true;
    },
    async openMaintenance() {
      await execute(createGodelMaintenanceOpenInvocation(), { errorCode: "POSTGRES_LIVE_RUNTIME_MAINTENANCE_OPEN_FAILED" });
      return true;
    },
    async verifyNginxStopped() {
      const state = await inspectState("godel-nginx");
      if (state?.Running === true) fail("POSTGRES_LIVE_RUNTIME_NGINX_NOT_STOPPED");
      return true;
    },
    async verifyNginxRunning() {
      if (!isHealthyState(await inspectState("godel-nginx"))) fail("POSTGRES_LIVE_RUNTIME_NGINX_NOT_RUNNING");
      return true;
    },
    async verifySourceRuntimeHealth() {
      for (const service of SUPABASE_SERVICES) await waitServiceHealthy({ service });
      if (!isHealthyState(await inspectState("godel-app"))) fail("POSTGRES_LIVE_RUNTIME_GODEL_APP_UNHEALTHY");
      await this.verifyNginxStopped();
      return true;
    },
    async preflight(payload) { return requiredHook("preflight", payload); },
    async preflightRollback(payload) { return requiredHook("preflightRollback", payload); },
    async preflightRollbackResume(payload) { return requiredHook("preflightRollbackResume", payload); },
    async acceptTarget(payload) { return requiredHook("acceptTarget", payload); },
    async acceptRollbackSource(payload) { return requiredHook("acceptRollbackSource", payload); },
  });
}
