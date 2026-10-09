import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDirectory, "../..");
const sourceRestoreScript = path.join(testDirectory, "restore.ps1");
const localSupabaseCommand = path.join(repoRoot, "node_modules", ".bin", "supabase.cmd");
const powershell = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
const backupId = "GDBK-20261007T183337Z";
const targetRefCandidates = ["aaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbb"];
const syntheticPassword = "synthetic-restore-password-9!";
const expectedCounts = new Map([
  ["auth.users", 1],
  ["auth.identities", 1],
  ["public.perfiles", 1],
  ["public.clientes", 0],
  ["public.solicitudes", 2],
  ["public.pedidos", 1],
  ["storage.buckets", 1],
  ["storage.objects", 0],
  ["private.internal_user_creation_audit", 0],
  ["private.internal_user_password_reset_audit", 0],
]);

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function escapePowerShellLiteral(value) {
  return value.replaceAll("'", "''");
}

async function snapshotDirectory(root) {
  if (!existsSync(root)) return null;
  const entries = [];
  async function visit(directory, relativeRoot) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relative = path.posix.join(relativeRoot, child.name);
      const fullPath = path.join(directory, child.name);
      if (child.isDirectory()) {
        entries.push(`D:${relative}`);
        await visit(fullPath, relative);
      } else {
        entries.push(`F:${relative}:${sha256(await readFile(fullPath))}`);
      }
    }
  }
  await visit(root, "");
  return entries;
}

function buildDataSql({ storageObjects = 0 } = {}) {
  const lines = ["SET session_replication_role = replica;", ""];
  for (const [target, rowCount] of expectedCounts) {
    const effectiveRowCount = target === "storage.objects" ? storageObjects : rowCount;
    lines.push(`COPY ${target} (id) FROM stdin;`);
    for (let index = 0; index < effectiveRowCount; index += 1) {
      lines.push(`synthetic-row-${index + 1}`);
    }
    lines.push("\\.", "");
  }
  lines.push("RESET ALL;", "");
  return lines.join("\n");
}

async function createBackup(
  root,
  gitSha,
  { nonEmptyStorage = false, storageObjects } = {},
) {
  const backupPath = path.join(root, backupId);
  const storagePath = path.join(backupPath, "storage", "godel-files");
  await mkdir(storagePath, { recursive: true });

  const storageObjectCount = storageObjects ?? (nonEmptyStorage ? 2 : 0);
  const dataSql = buildDataSql({ storageObjects: storageObjectCount });
  const manifest = `${JSON.stringify(
    {
      formatVersion: 1,
      backupId,
      createdAtUtc: "2026-10-07T18:33:37.0000000Z",
      source: "godel-production",
      projectRef: "cccccccccccccccccccc",
      gitSha,
      database: { file: "data.sql" },
      storage: { bucket: "godel-files", directory: "storage/godel-files" },
    },
    null,
    2,
  )}\n`;
  await writeFile(path.join(backupPath, "data.sql"), dataSql, "utf8");
  await writeFile(path.join(backupPath, "manifest.json"), manifest, "utf8");

  const records = [
    ["data.sql", Buffer.from(dataSql)],
    ["manifest.json", Buffer.from(manifest)],
  ];
  if (nonEmptyStorage) {
    const storageFixtures = [
      ["synthetic/object.txt", Buffer.from("synthetic storage object\n")],
      ["root-object.txt", Buffer.from("synthetic root storage object\n")],
    ];
    for (const [relativePath, content] of storageFixtures) {
      const objectPath = path.join(storagePath, ...relativePath.split("/"));
      await mkdir(path.dirname(objectPath), { recursive: true });
      await writeFile(objectPath, content);
      records.push([`storage/godel-files/${relativePath}`, content]);
    }
  }
  records.sort(([left], [right]) => left.localeCompare(right));
  const checksumText = `${records
    .map(([relative, content]) => `${sha256(content)}  ${relative}`)
    .join("\n")}\n`;
  await writeFile(path.join(backupPath, "checksums.sha256"), checksumText, "utf8");
  return backupPath;
}

async function writeStubs(stubDirectory, syntheticRepoRoot) {
  await mkdir(stubDirectory, { recursive: true });
  const npxStub = `@echo off\r
if not "%GODEL_MANAGED_RESTORE_DB_PASSWORD%"=="" echo SECRET_ENV_LEAK>>"%GODEL_STUB_LOG%"\r
echo NPX %*>>"%GODEL_STUB_LOG%"\r
if "%3"=="--version" goto version\r
if "%3"=="link" goto link\r
if "%3"=="--yes" if "%4"=="db" if "%5"=="push" goto db_push\r
exit /b 0\r
:version\r
echo 2.109.1\r
exit /b 0\r
:link\r
if not "%SUPABASE_DB_PASSWORD%"=="" goto link_db_password_leak\r
echo LINK_DB_PASSWORD_ABSENT>>"%GODEL_STUB_LOG%"\r
echo LINK_BENIGN_STDERR_EMITTED>>"%GODEL_STUB_LOG%"\r
echo Linking to remote project... 1>&2\r
if "%GODEL_STUB_LINK_FAIL%"=="1" exit /b 1\r
if not exist "%GODEL_REPO_ROOT%\\supabase\\.temp" mkdir "%GODEL_REPO_ROOT%\\supabase\\.temp"\r
>"%GODEL_REPO_ROOT%\\supabase\\.temp\\pooler-url" echo postgresql://synthetic_user@127.0.0.1:6543/postgres\r
exit /b 0\r
:link_db_password_leak\r
echo LINK_SUPABASE_DB_PASSWORD_LEAK>>"%GODEL_STUB_LOG%"\r
exit /b 1\r
:db_push\r
if not "%SUPABASE_DB_PASSWORD%"=="%GODEL_STUB_EXPECT_DB_PASSWORD%" goto db_password_mismatch\r
echo DB_PUSH_DB_PASSWORD_OK>>"%GODEL_STUB_LOG%"\r
echo DB_PUSH_BENIGN_STDERR_EMITTED>>"%GODEL_STUB_LOG%"\r
echo Connecting to remote database... 1>&2\r
if "%GODEL_STUB_DB_PUSH_FAIL%"=="1" exit /b 1\r
exit /b 0\r
:db_password_mismatch\r
echo SUPABASE_DB_PASSWORD_MISMATCH>>"%GODEL_STUB_LOG%"\r
exit /b 1\r
`;
  const pinnedSupabaseStub = `@echo off\r
echo PINNED_SUPABASE CWD=[%CD%] ARGS=[%*]>>"%GODEL_STUB_LOG%"\r
if not "%GODEL_RESTORE_CLI_PHASE%"=="STORAGE_UPLOAD" exit /b 88\r
if not "%PGPASSWORD%"=="" echo STORAGE_PASSWORD_LEAK>>"%GODEL_STUB_LOG%"\r
if not "%SUPABASE_DB_PASSWORD%"=="" echo STORAGE_SUPABASE_DB_PASSWORD_LEAK>>"%GODEL_STUB_LOG%"\r
echo STORAGE_BENIGN_STDERR_EMITTED>>"%GODEL_STUB_LOG%"\r
echo Uploading Storage objects... 1>&2\r
if "%GODEL_STUB_STORAGE_FAIL%"=="1" exit /b 1\r
exit /b 0\r
`;
  const seedCleanupValidator = `import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const commandIndex = args.indexOf("--command");
const sql = commandIndex >= 0 ? (args[commandIndex + 1] ?? "") : "";
const normalizedSql = sql.replace(/\\s+/gu, " ").trim();
const serviceDelete = "DELETE FROM public.tipos_servicio;";
const localGuard = "SELECT set_config('storage.allow_delete_query', 'true', true);";
const bucketDelete = "DELETE FROM storage.buckets WHERE id = 'godel-files';";
const count = (value, fragment) => value.split(fragment).length - 1;
const guardIndex = normalizedSql.indexOf(localGuard);
const bucketDeleteIndex = normalizedSql.indexOf(bucketDelete);
const valid =
  args.includes("--single-transaction") &&
  args.includes("ON_ERROR_STOP=1") &&
  normalizedSql.includes(serviceDelete) &&
  guardIndex >= 0 &&
  bucketDeleteIndex > guardIndex &&
  count(normalizedSql, "DELETE FROM") === 2 &&
  count(normalizedSql, "DELETE FROM storage.buckets") === 1 &&
  !normalizedSql.includes("set_config('storage.allow_delete_query', 'true', false)") &&
  !normalizedSql.includes("ALTER DATABASE") &&
  !normalizedSql.includes("ALTER ROLE") &&
  !normalizedSql.includes("DISABLE TRIGGER") &&
  !normalizedSql.includes("DELETE FROM storage.objects") &&
  !normalizedSql.includes("TRUNCATE storage.") &&
  !normalizedSql.includes("CASCADE");

if (!valid) process.exit(91);
appendFileSync(
  process.env.GODEL_STUB_LOG,
  "STORAGE_DELETE_GUARD_ENABLED = PASS\\r\\n" +
    "STORAGE_DELETE_GUARD_SCOPE = TRANSACTION_LOCAL\\r\\n" +
    "STORAGE_BUCKET_DELETE_TARGET = godel-files ONLY\\r\\n",
);
`;
  const psqlStub = `@echo off\r
if not "%GODEL_MANAGED_RESTORE_DB_PASSWORD%"=="" echo SECRET_ENV_LEAK>>"%GODEL_STUB_LOG%"\r
if not "%PGPASSWORD%"=="%GODEL_STUB_EXPECT_PGPASSWORD%" echo PGPASSWORD_MISMATCH>>"%GODEL_STUB_LOG%"\r
if not "%SUPABASE_DB_PASSWORD%"=="" echo SUPABASE_DB_PASSWORD_SCOPE_LEAK>>"%GODEL_STUB_LOG%"\r
echo PSQL_PHASE [%GODEL_RESTORE_PSQL_PHASE%]>>"%GODEL_STUB_LOG%"\r
if "%GODEL_RESTORE_PSQL_PHASE%"=="TARGET_FRESHNESS" goto freshness\r
if "%GODEL_RESTORE_PSQL_PHASE%"=="SEED_SAFETY" goto seed_safety\r
if "%GODEL_RESTORE_PSQL_PHASE%"=="SEED_CLEANUP" goto seed_cleanup\r
if "%GODEL_RESTORE_PSQL_PHASE%"=="DATABASE_RESTORE" goto database_restore\r
if "%GODEL_RESTORE_PSQL_PHASE%"=="DATABASE_COUNTS" goto database_counts\r
if "%GODEL_RESTORE_PSQL_PHASE%"=="STORAGE_PATHS" goto storage_paths\r
if "%GODEL_RESTORE_PSQL_PHASE%"=="DB_PUSH_RECONCILIATION" goto reconciliation\r
if "%GODEL_RESTORE_PSQL_PHASE%"=="MIGRATIONS" goto migrations\r
if "%GODEL_RESTORE_PSQL_PHASE%"=="BUCKET" goto bucket\r
exit /b 1\r
:freshness\r
if "%GODEL_STUB_TARGET_NOT_FRESH%"=="1" goto freshness_used\r
echo public.perfiles^|absent\r
goto freshness_tail\r
:freshness_used\r
echo public.perfiles^|present\r
:freshness_tail\r
echo public.solicitudes^|absent\r
echo public.pedidos^|absent\r
echo storage.bucket.godel-files^|absent\r
echo auth.users^|0\r
exit /b 0\r
:seed_safety\r
echo auth.users^|0\r
echo public.perfiles^|0\r
echo public.clientes^|0\r
echo public.solicitudes^|0\r
echo public.pedidos^|0\r
if "%GODEL_STUB_SEED_SAFETY_FAIL%"=="1" goto seed_safety_unsafe_storage\r
echo storage.objects^|0\r
exit /b 0\r
:seed_safety_unsafe_storage\r
echo storage.objects^|1\r
exit /b 0\r
:seed_cleanup\r
echo PSQL_ARGS %*>>"%GODEL_STUB_LOG%"\r
node "%~dp0seed-cleanup-validator.mjs" %*\r
exit /b %ERRORLEVEL%\r
:database_restore\r
echo PSQL_ARGS %*>>"%GODEL_STUB_LOG%"\r
if "%GODEL_STUB_DATABASE_RESTORE_FAIL%"=="1" exit /b 1\r
exit /b 0\r
:database_counts\r
echo auth.users^|1\r
echo auth.identities^|1\r
echo public.perfiles^|1\r
echo public.clientes^|0\r
echo public.solicitudes^|2\r
if "%GODEL_STUB_COUNT_MISMATCH%"=="1" goto count_mismatch\r
echo public.pedidos^|1\r
goto count_tail\r
:count_mismatch\r
echo public.pedidos^|0\r
:count_tail\r
echo storage.buckets^|1\r
if "%GODEL_STUB_STORAGE_OBJECTS_COUNT%"=="" echo storage.objects^|0\r
if not "%GODEL_STUB_STORAGE_OBJECTS_COUNT%"=="" echo storage.objects^|%GODEL_STUB_STORAGE_OBJECTS_COUNT%\r
echo private.internal_user_creation_audit^|0\r
echo private.internal_user_password_reset_audit^|0\r
exit /b 0\r
:storage_paths\r
if "%GODEL_STUB_STORAGE_OBJECTS_COUNT%"=="" exit /b 0\r
if "%GODEL_STUB_STORAGE_OBJECTS_COUNT%"=="0" exit /b 0\r
echo root-object.txt\r
if "%GODEL_STUB_STORAGE_PATH_MISMATCH%"=="1" goto storage_paths_mismatch\r
echo synthetic/object.txt\r
exit /b 0\r
:storage_paths_mismatch\r
echo godel-files/synthetic/object.txt\r
exit /b 0\r
:reconciliation\r
if "%GODEL_STUB_RECONCILIATION_MODE%"=="fail" exit /b 1\r
echo 20260811131824\r
echo 20260811131825\r
echo 20260811131826\r
if "%GODEL_STUB_RECONCILIATION_MODE%"=="partial" exit /b 0\r
echo 20260811131827\r
echo 20260811131828\r
echo 20260811131829\r
if "%GODEL_STUB_RECONCILIATION_MODE%"=="unexpected" echo 20991231235959\r
exit /b 0\r
:migrations\r
echo 20260811131824\r
echo 20260811131825\r
echo 20260811131826\r
echo 20260811131827\r
echo 20260811131828\r
echo 20260811131829\r
exit /b 0\r
:bucket\r
echo 1\r
exit /b 0\r
  `;
  await writeFile(path.join(stubDirectory, "npx.cmd"), npxStub, "ascii");
  await writeFile(path.join(stubDirectory, "psql.cmd"), psqlStub, "ascii");
  await writeFile(
    path.join(stubDirectory, "seed-cleanup-validator.mjs"),
    seedCleanupValidator,
    "utf8",
  );
  const pinnedSupabasePath = path.join(
    syntheticRepoRoot,
    "node_modules",
    ".bin",
    "supabase.cmd",
  );
  await mkdir(path.dirname(pinnedSupabasePath), { recursive: true });
  await writeFile(pinnedSupabasePath, pinnedSupabaseStub, "ascii");
}

function removePsqlDirectories(pathValue) {
  return pathValue
    .split(path.delimiter)
    .filter((entry) => {
      if (!entry) return false;
      return !["psql.exe", "psql.cmd", "psql.bat"].some((name) =>
        existsSync(path.join(entry, name)),
      );
    })
    .join(path.delimiter);
}

test("Simple Restore V1 synthetic contract", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "godel-simple-restore-test-"));
  const externalCwd = path.join(temporaryRoot, "outside-repository");
  const syntheticRepoRoot = path.join(temporaryRoot, "synthetic-repo");
  const restoreScript = path.join(
    syntheticRepoRoot,
    "scripts",
    "backup-recovery",
    "restore.ps1",
  );
  const stubDirectory = path.join(temporaryRoot, "bin");
  const noPsqlDirectory = path.join(temporaryRoot, "bin-no-psql");
  const logPath = path.join(temporaryRoot, "commands.log");
  const wrapperPath = path.join(temporaryRoot, "invoke-restore.ps1");
  const reportPath = path.join(temporaryRoot, "restore-state.json");
  const supabaseTempPath = path.join(syntheticRepoRoot, "supabase", ".temp");
  const productionRef = "pppppppppppppppppppp";
  const targetRef = targetRefCandidates.find((candidate) => candidate !== productionRef);
  assert.ok(targetRef);

  await mkdir(externalCwd, { recursive: true });
  await context.test("repo-pinned CLI runs offline from an external CWD", () => {
    const result = spawnSync(
      powershell,
      [
        "-NoProfile",
        "-Command",
        `& '${escapePowerShellLiteral(localSupabaseCommand)}' --version`,
      ],
      {
        cwd: externalCwd,
        encoding: "utf8",
        env: { ...process.env, DO_NOT_TRACK: "1" },
        windowsHide: true,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "2.109.1");
  });

  await mkdir(path.dirname(restoreScript), { recursive: true });
  await mkdir(supabaseTempPath, { recursive: true });
  await cp(sourceRestoreScript, restoreScript);
  await writeFile(path.join(syntheticRepoRoot, "package.json"), "{}\n", "utf8");
  await writeFile(
    path.join(syntheticRepoRoot, ".env.managed.backup.local"),
    `GODEL_MANAGED_SUPABASE_PROJECT_REF=${productionRef}\n`,
    "utf8",
  );
  await writeFile(
    path.join(supabaseTempPath, "baseline-marker"),
    "synthetic-link-state\n",
    "utf8",
  );
  await writeStubs(stubDirectory, syntheticRepoRoot);
  await mkdir(noPsqlDirectory, { recursive: true });
  await cp(path.join(stubDirectory, "npx.cmd"), path.join(noPsqlDirectory, "npx.cmd"));
  await writeFile(logPath, "", "utf8");

  git(syntheticRepoRoot, "init");
  git(syntheticRepoRoot, "config", "user.email", "restore-test@godel.invalid");
  git(syntheticRepoRoot, "config", "user.name", "Godel Restore Test");
  git(syntheticRepoRoot, "config", "core.autocrlf", "false");
  git(syntheticRepoRoot, "add", ".");
  git(syntheticRepoRoot, "-c", "commit.gpgsign=false", "commit", "-m", "synthetic base");
  const preSchemaHead = git(syntheticRepoRoot, "rev-parse", "HEAD");
  const migrationPath = path.join(
    syntheticRepoRoot,
    "supabase",
    "migrations",
    "20260811131824_01_synthetic.sql",
  );
  await mkdir(path.dirname(migrationPath), { recursive: true });
  await writeFile(migrationPath, "select 1;\n", "utf8");
  git(syntheticRepoRoot, "add", "supabase/migrations");
  git(syntheticRepoRoot, "-c", "commit.gpgsign=false", "commit", "-m", "synthetic schema");
  const currentHead = git(syntheticRepoRoot, "rev-parse", "HEAD");
  const originalTempSnapshot = await snapshotDirectory(supabaseTempPath);
  const seedCleanupValidatorPath = path.join(stubDirectory, "seed-cleanup-validator.mjs");

  const baseEnvironment = {
    ...process.env,
    PATH: `${stubDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
    GODEL_REPO_ROOT: syntheticRepoRoot,
    GODEL_STUB_LOG: logPath,
    GODEL_STUB_EXPECT_DB_PASSWORD: syntheticPassword,
    GODEL_STUB_EXPECT_PGPASSWORD: syntheticPassword,
    GODEL_MANAGED_RESTORE_PROJECT_REF: targetRef,
    GODEL_MANAGED_RESTORE_DB_PASSWORD: syntheticPassword,
    GODEL_MANAGED_RESTORE_CONFIRM: "ALLOW_DISPOSABLE_MANAGED_RESTORE",
    SUPABASE_ACCESS_TOKEN: "synthetic-access-token",
    SUPABASE_DB_PASSWORD: "original-supabase-db-password",
    PGHOST: "original-host",
    PGPORT: "6544",
    PGUSER: "original-user",
    PGDATABASE: "original-database",
    PGPASSWORD: "original-pg-password",
    GODEL_RESTORE_PSQL_PHASE: "original-phase",
    GODEL_RESTORE_CLI_PHASE: "original-cli-phase",
  };

  async function resetLog() {
    await writeFile(logPath, "", "utf8");
  }

  async function assertTempRestored() {
    assert.deepEqual(await snapshotDirectory(supabaseTempPath), originalTempSnapshot);
  }

  async function runRestore(backupPath, environmentOverrides = {}, options = {}) {
    await resetLog();
    const environment = { ...baseEnvironment, ...environmentOverrides };
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass"];
    if (options.dotSource) {
      const variables = [
        "GODEL_MANAGED_RESTORE_PROJECT_REF",
        "GODEL_MANAGED_RESTORE_DB_PASSWORD",
        "GODEL_MANAGED_RESTORE_CONFIRM",
        "SUPABASE_ACCESS_TOKEN",
        "SUPABASE_DB_PASSWORD",
        "PGHOST",
        "PGPORT",
        "PGUSER",
        "PGDATABASE",
        "PGPASSWORD",
        "GODEL_RESTORE_PSQL_PHASE",
        "GODEL_RESTORE_CLI_PHASE",
      ];
      const wrapper = `$names = @(${variables.map((name) => `'${name}'`).join(", ")})\n` +
        `$before = @{}\nforeach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }\n` +
        `$beforeCwd = (Get-Location).Path\n` +
        `$result = @(. '${escapePowerShellLiteral(restoreScript)}' -BackupPath '${escapePowerShellLiteral(backupPath)}')\n` +
        `$code = [int]$result[$result.Count - 1]\n` +
        `$environmentRestored = $true\nforeach ($name in $names) { if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $before[$name]) { $environmentRestored = $false } }\n` +
        `$report = [ordered]@{ environmentRestored = $environmentRestored; cwdRestored = ((Get-Location).Path -ceq $beforeCwd) } | ConvertTo-Json\n` +
        `[IO.File]::WriteAllText('${escapePowerShellLiteral(reportPath)}', $report)\n` +
        `exit $code\n`;
      await writeFile(wrapperPath, `\uFEFF${wrapper}`, "utf8");
      args.push("-File", wrapperPath);
    } else {
      args.push("-File", restoreScript, "-BackupPath", backupPath);
    }
    const result = spawnSync(powershell, args, {
      cwd: syntheticRepoRoot,
      encoding: "utf8",
      env: environment,
      windowsHide: true,
    });
    await assertTempRestored();
    return result;
  }

  try {
    await context.test("seed cleanup stub rejects bucket deletion without the local guard", () => {
      const result = spawnSync(
        "node",
        [
          seedCleanupValidatorPath,
          "--single-transaction",
          "--variable",
          "ON_ERROR_STOP=1",
          "--command",
          "DELETE FROM public.tipos_servicio; DELETE FROM storage.buckets WHERE id = 'godel-files';",
        ],
        { encoding: "utf8", env: baseEnvironment, windowsHide: true },
      );
      assert.notEqual(result.status, 0, result.stderr);
    });

    await context.test("valid backup admission and empty Storage pass", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "valid"), currentHead);
      const result = await runRestore(backupPath, {}, { dotSource: true });
      assert.equal(result.status, 0, result.stderr);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      const log = await readFile(logPath, "utf8");
      assert.match(log, /LINK_BENIGN_STDERR_EMITTED/u);
      assert.match(log, /NPX --no-install supabase --yes db push --linked/u, result.stderr);
      assert.match(log, /DB_PUSH_BENIGN_STDERR_EMITTED/u);
      assert.equal((log.match(/NPX --no-install supabase --yes db push --linked/gu) ?? []).length, 1);
      assert.doesNotMatch(log, /PSQL_PHASE \[DB_PUSH_RECONCILIATION\]/u);
      assert.doesNotMatch(result.stderr, /^RESTORE FAILED: DB PUSH$/mu);
      assert.doesNotMatch(log, /storage cp/u);
      assert.doesNotMatch(log, /PINNED_SUPABASE/u);
      assert.doesNotMatch(log, new RegExp(syntheticPassword.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
      assert.doesNotMatch(log, /SECRET_ENV_LEAK/u);
      assert.match(log, /LINK_DB_PASSWORD_ABSENT/u);
      assert.match(log, /DB_PUSH_DB_PASSWORD_OK/u);
      assert.doesNotMatch(log, /LINK_SUPABASE_DB_PASSWORD_LEAK/u);
      assert.doesNotMatch(log, /SUPABASE_DB_PASSWORD_MISMATCH/u);
      assert.doesNotMatch(log, /SUPABASE_DB_PASSWORD_SCOPE_LEAK/u);
      assert.doesNotMatch(log, /PGPASSWORD_MISMATCH/u);
      const deletes = log.match(/DELETE FROM/gu) ?? [];
      assert.equal(deletes.length, 2);
      assert.match(log, /DELETE FROM public\.tipos_servicio;/u);
      assert.match(
        log,
        /SELECT set_config\('storage\.allow_delete_query', 'true', true\);/u,
      );
      assert.match(log, /DELETE FROM storage\.buckets WHERE id = 'godel-files';/u);
      assert.ok(
        log.indexOf("SELECT set_config('storage.allow_delete_query', 'true', true);") <
          log.indexOf("DELETE FROM storage.buckets WHERE id = 'godel-files';"),
        log,
      );
      assert.equal((log.match(/DELETE FROM storage\.buckets/gu) ?? []).length, 1);
      assert.match(log, /STORAGE_DELETE_GUARD_ENABLED = PASS/u);
      assert.match(log, /STORAGE_DELETE_GUARD_SCOPE = TRANSACTION_LOCAL/u);
      assert.match(log, /STORAGE_BUCKET_DELETE_TARGET = godel-files ONLY/u);
      assert.match(log, /--single-transaction/u);
      assert.match(log, /ON_ERROR_STOP=1/u);
      assert.doesNotMatch(
        log,
        /set_config\('storage\.allow_delete_query', 'true', false\)/u,
      );
      assert.doesNotMatch(log, /ALTER DATABASE/u);
      assert.doesNotMatch(log, /ALTER ROLE/u);
      assert.doesNotMatch(log, /DISABLE TRIGGER/u);
      assert.doesNotMatch(log, /DELETE FROM storage\.objects/u);
      assert.doesNotMatch(log, /TRUNCATE storage\./u);
      assert.doesNotMatch(log, /CASCADE/u);
      assert.doesNotMatch(log, /config push/u);
    });

    await context.test("checksum mismatch fails before remote commands", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "checksum"), currentHead);
      await writeFile(path.join(backupPath, "data.sql"), "\n-- changed\n", { flag: "a" });
      const result = await runRestore(backupPath);
      assert.equal(result.status, 1);
      assert.equal((await readFile(logPath, "utf8")).trim(), "");
    });

    await context.test("unsafe checksum path fails before remote commands", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "unsafe"), currentHead);
      await writeFile(
        path.join(backupPath, "checksums.sha256"),
        `${"0".repeat(64)}  ../outside\n`,
        { flag: "a" },
      );
      const result = await runRestore(backupPath);
      assert.equal(result.status, 1);
      assert.equal((await readFile(logPath, "utf8")).trim(), "");
    });

    await context.test("Production target is forbidden before remote commands", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "production"), currentHead);
      const result = await runRestore(backupPath, {
        GODEL_MANAGED_RESTORE_PROJECT_REF: productionRef,
      });
      assert.equal(result.status, 1);
      assert.equal((await readFile(logPath, "utf8")).trim(), "");
    });

    await context.test("missing confirmation fails before remote commands", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "confirmation"), currentHead);
      const result = await runRestore(backupPath, { GODEL_MANAGED_RESTORE_CONFIRM: "" });
      assert.equal(result.status, 1);
      assert.equal((await readFile(logPath, "utf8")).trim(), "");
    });

    await context.test("invalid target ref fails before remote commands", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "target-ref"), currentHead);
      const result = await runRestore(backupPath, {
        GODEL_MANAGED_RESTORE_PROJECT_REF: "invalid",
      });
      assert.equal(result.status, 1);
      assert.equal((await readFile(logPath, "utf8")).trim(), "");
    });

    await context.test("schema drift fails before remote commands", async () => {
      assert.notEqual(
        spawnSync("git", ["diff", "--quiet", preSchemaHead, "HEAD", "--", "supabase/migrations"], {
          cwd: syntheticRepoRoot,
        }).status,
        0,
      );
      const backupPath = await createBackup(
        path.join(temporaryRoot, "schema-drift"),
        preSchemaHead,
      );
      const result = await runRestore(backupPath);
      assert.equal(result.status, 1);
      assert.equal((await readFile(logPath, "utf8")).trim(), "");
    });

    await context.test("psql missing fails before db push", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "psql"), currentHead);
      const safePath = `${noPsqlDirectory}${path.delimiter}${removePsqlDirectories(process.env.PATH ?? "")}`;
      const result = await runRestore(backupPath, { PATH: safePath });
      assert.equal(result.status, 1);
      assert.doesNotMatch(await readFile(logPath, "utf8"), /db push/u);
    });

    await context.test("non-fresh target fails before mutations", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "not-fresh"), currentHead);
      const result = await runRestore(backupPath, { GODEL_STUB_TARGET_NOT_FRESH: "1" });
      assert.equal(result.status, 1);
      const log = await readFile(logPath, "utf8");
      assert.match(log, /TARGET_FRESHNESS/u, result.stderr);
      assert.doesNotMatch(log, /db push/u);
      assert.doesNotMatch(log, /SEED_CLEANUP/u);
    });

    await context.test("seed safety blocks cleanup when Storage contains objects", async () => {
      const backupPath = await createBackup(
        path.join(temporaryRoot, "unsafe-storage-seed"),
        currentHead,
        { nonEmptyStorage: true },
      );
      const result = await runRestore(
        backupPath,
        { GODEL_STUB_SEED_SAFETY_FAIL: "1" },
        { dotSource: true },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /^RESTORE FAILED: SEED SAFETY$/mu);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      const log = await readFile(logPath, "utf8");
      assert.match(log, /PSQL_PHASE \[SEED_SAFETY\]/u);
      assert.doesNotMatch(log, /PSQL_PHASE \[SEED_CLEANUP\]/u);
      assert.doesNotMatch(log, /PSQL_PHASE \[DATABASE_RESTORE\]/u);
      assert.doesNotMatch(log, /storage cp/u);
    });

    await context.test("native stderr with a nonzero link exit fails by exit code", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "link-failure"), currentHead);
      const result = await runRestore(
        backupPath,
        { GODEL_STUB_LINK_FAIL: "1" },
        { dotSource: true },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /^RESTORE FAILED: LINK$/mu);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      const log = await readFile(logPath, "utf8");
      assert.match(log, /LINK_BENIGN_STDERR_EMITTED/u);
      assert.doesNotMatch(log, /db push/u);
    });

    await context.test("nonzero db push with exact migrations is reconciled", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "db-push-reconciled"), currentHead);
      const result = await runRestore(
        backupPath,
        { GODEL_STUB_DB_PUSH_FAIL: "1" },
        { dotSource: true },
      );
      assert.equal(result.status, 0, result.stderr);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      const log = await readFile(logPath, "utf8");
      assert.equal((log.match(/NPX --no-install supabase --yes db push --linked/gu) ?? []).length, 1);
      assert.match(log, /DB_PUSH_DB_PASSWORD_OK/u);
      assert.match(log, /DB_PUSH_BENIGN_STDERR_EMITTED/u);
      assert.match(log, /PSQL_PHASE \[DB_PUSH_RECONCILIATION\]/u);
      assert.match(log, /PSQL_PHASE \[SEED_SAFETY\]/u);
      assert.match(log, /PSQL_PHASE \[DATABASE_RESTORE\]/u);
      assert.doesNotMatch(log, /SECRET_ENV_LEAK/u);
      assert.doesNotMatch(log, /SUPABASE_DB_PASSWORD_MISMATCH/u);
      assert.doesNotMatch(log, /SUPABASE_DB_PASSWORD_SCOPE_LEAK/u);
      assert.doesNotMatch(log, /PGPASSWORD_MISMATCH/u);
      assert.doesNotMatch(result.stderr, /^RESTORE FAILED: DB PUSH$/mu);
      assert.doesNotMatch(log, new RegExp(syntheticPassword.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    });

    await context.test("nonzero db push with partial migrations fails closed", async () => {
      const backupPath = await createBackup(
        path.join(temporaryRoot, "db-push-partial"),
        currentHead,
        { nonEmptyStorage: true },
      );
      const result = await runRestore(
        backupPath,
        {
          GODEL_STUB_DB_PUSH_FAIL: "1",
          GODEL_STUB_RECONCILIATION_MODE: "partial",
        },
        { dotSource: true },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /RESTORE FAILED: DB PUSH RECONCILIATION/u);
      assert.match(result.stderr, /DB push: FAIL \/ UNRECONCILED/u);
      assert.match(result.stderr, /Target: FAILED \/ DISPOSABLE/u);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      const log = await readFile(logPath, "utf8");
      assert.equal((log.match(/NPX --no-install supabase --yes db push --linked/gu) ?? []).length, 1);
      assert.match(log, /DB_PUSH_DB_PASSWORD_OK/u);
      assert.match(log, /DB_PUSH_BENIGN_STDERR_EMITTED/u);
      assert.match(log, /PSQL_PHASE \[DB_PUSH_RECONCILIATION\]/u);
      assert.doesNotMatch(log, /PSQL_PHASE \[SEED_SAFETY\]/u);
      assert.doesNotMatch(log, /PSQL_PHASE \[DATABASE_RESTORE\]/u);
      assert.doesNotMatch(log, /storage cp/u);
      assert.doesNotMatch(log, /SUPABASE_DB_PASSWORD_SCOPE_LEAK/u);
      assert.doesNotMatch(log, /PGPASSWORD_MISMATCH/u);
      assert.doesNotMatch(result.stderr, /^RESTORE FAILED: DB PUSH$/mu);
    });

    await context.test("nonzero db push with an unexpected migration fails closed", async () => {
      const backupPath = await createBackup(
        path.join(temporaryRoot, "db-push-unexpected"),
        currentHead,
        { nonEmptyStorage: true },
      );
      const result = await runRestore(
        backupPath,
        {
          GODEL_STUB_DB_PUSH_FAIL: "1",
          GODEL_STUB_RECONCILIATION_MODE: "unexpected",
        },
        { dotSource: true },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /RESTORE FAILED: DB PUSH RECONCILIATION/u);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      const log = await readFile(logPath, "utf8");
      assert.equal((log.match(/NPX --no-install supabase --yes db push --linked/gu) ?? []).length, 1);
      assert.match(log, /DB_PUSH_DB_PASSWORD_OK/u);
      assert.doesNotMatch(log, /PSQL_PHASE \[SEED_SAFETY\]/u);
      assert.doesNotMatch(log, /PSQL_PHASE \[DATABASE_RESTORE\]/u);
      assert.doesNotMatch(log, /storage cp/u);
      assert.doesNotMatch(log, /SUPABASE_DB_PASSWORD_SCOPE_LEAK/u);
      assert.doesNotMatch(log, /PGPASSWORD_MISMATCH/u);
    });

    await context.test("db push reconciliation query failure fails closed", async () => {
      const backupPath = await createBackup(
        path.join(temporaryRoot, "db-push-query-failure"),
        currentHead,
        { nonEmptyStorage: true },
      );
      const result = await runRestore(
        backupPath,
        {
          GODEL_STUB_DB_PUSH_FAIL: "1",
          GODEL_STUB_RECONCILIATION_MODE: "fail",
        },
        { dotSource: true },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /RESTORE FAILED: DB PUSH RECONCILIATION/u);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      const log = await readFile(logPath, "utf8");
      assert.equal((log.match(/NPX --no-install supabase --yes db push --linked/gu) ?? []).length, 1);
      assert.match(log, /DB_PUSH_DB_PASSWORD_OK/u);
      assert.doesNotMatch(log, /PSQL_PHASE \[SEED_SAFETY\]/u);
      assert.doesNotMatch(log, /PSQL_PHASE \[DATABASE_RESTORE\]/u);
      assert.doesNotMatch(log, /storage cp/u);
      assert.doesNotMatch(log, /SUPABASE_DB_PASSWORD_SCOPE_LEAK/u);
      assert.doesNotMatch(log, /PGPASSWORD_MISMATCH/u);
    });

    await context.test("psql restore failure stops before Storage and restores state", async () => {
      const backupPath = await createBackup(
        path.join(temporaryRoot, "restore-failure"),
        currentHead,
        { nonEmptyStorage: true },
      );
      const result = await runRestore(
        backupPath,
        { GODEL_STUB_DATABASE_RESTORE_FAIL: "1" },
        { dotSource: true },
      );
      assert.equal(result.status, 1, result.stderr);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      const log = await readFile(logPath, "utf8");
      assert.match(log, /DATABASE_RESTORE/u);
      assert.doesNotMatch(log, /storage cp/u);
    });

    await context.test("non-empty Storage uploads exact paths with the repo-pinned CLI", async () => {
      const backupPath = await createBackup(
        path.join(temporaryRoot, "non-empty"),
        currentHead,
        { nonEmptyStorage: true },
      );
      const result = await runRestore(
        backupPath,
        { GODEL_STUB_STORAGE_OBJECTS_COUNT: "2" },
        { dotSource: true },
      );
      const log = await readFile(logPath, "utf8");
      assert.equal(result.status, 0, `${result.stderr}\n${log}`);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      assert.match(log, /PINNED_SUPABASE/u, result.stderr);
      assert.match(log, /STORAGE_BENIGN_STDERR_EMITTED/u);
      const storageCommands = log
        .split(/\r?\n/u)
        .filter((line) => line.includes("PINNED_SUPABASE"));
      assert.equal(storageCommands.length, 2, log);
      assert.ok(
        storageCommands[0].includes(
          "--experimental storage cp root-object.txt ss:///godel-files/root-object.txt -r --linked",
        ),
        log,
      );
      assert.ok(
        storageCommands[1].includes(
          "--experimental storage cp synthetic/object.txt ss:///godel-files/synthetic/object.txt -r --linked",
        ),
        log,
      );
      assert.ok(
        log.includes(`CWD=[${path.join(backupPath, "storage", "godel-files")}]`),
        log,
      );
      assert.ok(
        log.includes(`--workdir ${syntheticRepoRoot} --experimental`),
        log,
      );
      assert.match(log, /PSQL_PHASE \[STORAGE_PATHS\]/u);
      assert.doesNotMatch(log, /storage cp \. /u);
      assert.doesNotMatch(log, /storage cp godel-files ss:\/\/\/godel-files\//u);
      assert.doesNotMatch(log, /ss:\/\/\/godel-files\/ -r --linked/u);
      assert.doesNotMatch(log, /storage cp [A-Za-z]:\\/u);
      assert.doesNotMatch(log, /NPX .*storage cp/u);
      assert.doesNotMatch(log, /STORAGE_PASSWORD_LEAK/u);
      assert.doesNotMatch(log, /STORAGE_SUPABASE_DB_PASSWORD_LEAK/u);
    });

    await context.test("Storage cardinality mismatch fails before upload", async () => {
      const backupPath = await createBackup(
        path.join(temporaryRoot, "storage-cardinality"),
        currentHead,
        { nonEmptyStorage: true, storageObjects: 1 },
      );
      const result = await runRestore(backupPath, {}, { dotSource: true });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /^RESTORE FAILED: STORAGE$/mu);
      assert.doesNotMatch(await readFile(logPath, "utf8"), /PINNED_SUPABASE/u);
    });

    await context.test("Storage path mismatch fails after matching counts", async () => {
      const backupPath = await createBackup(
        path.join(temporaryRoot, "storage-path-mismatch"),
        currentHead,
        { nonEmptyStorage: true },
      );
      const result = await runRestore(
        backupPath,
        {
          GODEL_STUB_STORAGE_OBJECTS_COUNT: "2",
          GODEL_STUB_STORAGE_PATH_MISMATCH: "1",
        },
        { dotSource: true },
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /^RESTORE FAILED: STORAGE PATHS$/mu);
      const log = await readFile(logPath, "utf8");
      assert.match(log, /PSQL_PHASE \[DATABASE_COUNTS\]/u);
      assert.match(log, /PSQL_PHASE \[STORAGE_PATHS\]/u);
    });

    await context.test("Storage upload failure restores process state", async () => {
      const backupPath = await createBackup(
        path.join(temporaryRoot, "storage-failure"),
        currentHead,
        { nonEmptyStorage: true },
      );
      const result = await runRestore(
        backupPath,
        { GODEL_STUB_STORAGE_FAIL: "1" },
        { dotSource: true },
      );
      assert.equal(result.status, 1, result.stderr);
      const state = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(state.environmentRestored, true);
      assert.equal(state.cwdRestored, true);
      const log = await readFile(logPath, "utf8");
      assert.match(log, /PINNED_SUPABASE/u);
      assert.equal((log.match(/PINNED_SUPABASE/gu) ?? []).length, 1, log);
      assert.doesNotMatch(log, /STORAGE_PASSWORD_LEAK/u);
      assert.doesNotMatch(log, /STORAGE_SUPABASE_DB_PASSWORD_LEAK/u);
    });

    await context.test("COPY count mismatch fails verification", async () => {
      const backupPath = await createBackup(path.join(temporaryRoot, "counts"), currentHead);
      const result = await runRestore(backupPath, { GODEL_STUB_COUNT_MISMATCH: "1" });
      assert.equal(result.status, 1);
      assert.match(await readFile(logPath, "utf8"), /DATABASE_COUNTS/u, result.stderr);
    });
  } finally {
    assert.deepEqual(await snapshotDirectory(supabaseTempPath), originalTempSnapshot);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
