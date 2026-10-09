# PPO-04M.6 — Simple Backup / Restore V1

**Estado de PPO-04M.6:** `ACTIVE`

**Estado de PPO-04M.6.0:** `REVIEWED / CLOSED`

**Estado de PPO-04M.6.1:** `REVIEWED / CLOSED`

**Simple Backup V1:** `REVIEWED / APPROVED / REAL PRODUCTION BACKUP VERIFIED`

**Estado de PPO-04M.6.2:** `REVIEWED / CODE COMPLETE`

**Simple Restore V1:** `REAL MANAGED RECOVERY VERIFIED INCLUDING NON-EMPTY STORAGE`

**Estado de PPO-04M.6.3:** `REVIEWED / CLOSED`

**Estado de PPO-04M.6.4:** `ACTIVE`

**Estado de PPO-04M.6.4A:** `REVIEWED / CLOSED`

**Estado de PPO-04M.6.4B:** `REVIEWED / CLOSED`

**Estado de PPO-04M.6.4C:** `NEXT / LIGHTWEIGHT OPERATIONAL RUNBOOK`

**Estado de PPO-04M.6.4D:** `OPTIONAL OFF-SITE DECISION / PENDING`

**Real Managed Recovery Drill #1:** `FAIL / PREFLIGHT / PSQL_REQUIRED / ZERO REMOTE ACTIVITY`

**Real Managed Recovery Drill #2:** `FAIL / AMBIGUOUS DB PUSH OUTCOME`

**Real Managed Recovery Drill #3:** `FAIL / POWERSHELL NATIVE STDERR HANDLING`

**Real Managed Recovery Drill #4:** `FAIL / STORAGE DIRECT DELETE PROTECTION AT SEED CLEANUP`

**Real Managed Recovery Drill #5:** `PASS / STRUCTURAL + FUNCTIONAL RECOVERY VERIFIED`

**Real Production Backup #1:** `PREFLIGHT BLOCKED / NOT EXECUTED / ZERO REMOTE ACTIVITY`

**Real Production Backup #2:** `SAFE FAIL / STORAGE WINDOWS PATH COMPATIBILITY`

**Real Production Backup #3:** `PASS / ARTIFACT VERIFIED LOCALLY`

**Production restore:** `NOT AUTHORIZED`

**Fecha:** 2026-10-09

## 1. Objetivo y decisión arquitectónica

PPO-04M.6 diseña un sistema de backup y recuperación deliberadamente simple,
operativo y mantenible para Godel Diseño.

```text
Git = fuente de verdad del esquema y el código
Backup = fuente de verdad de los datos operativos
```

Simple Backup / Restore V1 no intenta proporcionar compatibilidad arbitraria
entre diferentes implementaciones o versiones internas de Supabase. El target
principal de recovery es un proyecto Supabase Managed nuevo y desechable,
preparado primero desde el repositorio y poblado después desde el backup.

El harness complejo Managed → Supabase local desarrollado bajo PPO-04M.5.3 se
suspende por proporcionalidad arquitectónica. Su adaptación continua de Auth,
Storage, foreign keys, roles, privileges y versiones internas excede lo
razonable para el Production Pilot. Esa decisión no invalida el trabajo previo:
su código y evidencia permanecen como tooling histórico y experimental.

```text
PPO-04M.5.3 COMPLEX RECOVERY HARNESS =
SUSPENDED / SUPERSEDED BY SIMPLE BACKUP RESTORE V1
LEGACY COMPLEX RECOVERY HARNESS = FROZEN / NOT ACTIVE PATH
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #7 = CANCELLED
REAL RESTORE ATTEMPT #7 = CANCELLED UNDER LEGACY APPROACH
PRODUCTION RESTORE = NOT AUTHORIZED
```

No se continuará desarrollando ese harness salvo una decisión arquitectónica
futura explícita. `scripts/managed-backup-recovery/**` no se elimina ni se
refactoriza en este bloque.

## 2. Alcance V1

```text
RESTORE TARGET = NEW / DISPOSABLE SUPABASE MANAGED PROJECT
ARBITRARY LOCAL SELF-HOSTED RESTORE = OUT OF SCOPE V1
IN-PLACE PRODUCTION RESTORE = OUT OF SCOPE V1
```

V1 cubre un backup lógico data-only, una copia independiente de los objetos
físicos del bucket `godel-files`, integridad SHA-256 y recuperación sobre un
proyecto Managed nuevo. No incluye restore in-place, compatibilidad general con
Supabase CLI local/self-hosted ni sustitución manual de los schemas internos de
Auth o Storage.

## 3. Contrato del backup

El directorio raíz es configurable. La forma objetivo es:

```text
D:\Godel-Backups
└── <backup-id>
    ├── data.sql
    ├── storage
    │   └── godel-files
    ├── manifest.json
    └── checksums.sha256
```

La carpeta no puede guardar passwords, database URLs, service-role keys,
access tokens, Supabase access tokens, secretos R2, claves privadas ni ningún
otro secreto operativo.

### 3.1 `data.sql`

`data.sql` es un backup lógico data-only obtenido mediante el flujo oficial:

```text
supabase db dump --data-only --use-copy
```

El procedimiento oficial general de Supabase para una migración lógica completa
puede utilizar `roles.sql`, `schema.sql` y `data.sql`. Simple Backup / Restore V1
adopta deliberadamente un contrato menor y específico para Godel:

- el proyecto Supabase Managed nuevo aporta los schemas y roles internos de la
  plataforma;
- `supabase/migrations/` es la autoridad del schema específico de Godel;
- Godel no define actualmente custom PostgreSQL roles propios que deban
  recuperarse desde `roles.sql`;
- `data.sql` es la autoridad de los datos operativos.

Por tanto, V1 no pretende ser un backup lógico genérico de cualquier proyecto
Supabase y no añade `roles.sql` ni `schema.sql` a su formato. Si Godel introduce
custom PostgreSQL roles u objetos de schema no representados por las
migraciones, este supuesto deberá revisarse.

Si existen, se excluyen los objetos especializados que Supabase recomienda no
incluir:

- `storage.buckets_vectors`
- `storage.vector_indexes`

V1 no introduce un sistema propio de transformación SQL.

Los warnings de `pg_dump` sobre foreign keys circulares en `perfiles`,
`solicitudes` y `pedidos` son esperados y no bloquean el backup. El dump de
datos generado por Supabase CLI 2.109.1 comienza con
`SET session_replication_role = replica;`; la capacidad de restore de esas
relaciones queda implementada en PPO-04M.6.2 y pendiente del drill real. V1 no
añade `schema.sql` ni `roles.sql`.

### 3.2 `storage/godel-files/`

El backup PostgreSQL no contiene los objetos físicos de Storage. El backup los
guarda bajo `storage/godel-files/` mediante el mecanismo oficial de copia
recursiva de Supabase Storage CLI. La recuperación vuelve a subirlos al bucket
correspondiente.

V1 prevé usar, tanto para download como para upload:

```text
supabase storage cp ... -r --experimental
```

`storage cp` es actualmente una capacidad experimental del Supabase CLI.
PPO-04M.6.1 validó el camino vacío con Supabase CLI 2.109.1 durante Real
Production Backup #3. PPO-04M.6.4A verificó después un backup real no vacío desde
un source Managed desechable. Real Restores #1 y #2 alcanzaron el upload, pero
fallaron en `DATABASE COUNTS` porque Supabase CLI 2.109.1 conservó el basename
del directorio local tanto con source `godel-files` como con source `.`. La
estrategia directory-root queda rechazada. El restore corregido por archivo pasó
Real Restore #3 con paths exactos y round-trip byte-exact. Esto no afirma
validación con objetos Production. No se diseña un fallback complejo, un SDK
propio ni capas adicionales.

En Windows, el script ejecuta primero `storage ls` de forma read-only para
distinguir un bucket vacío. Si no hay objetos, crea localmente
`storage/godel-files/` vacío y no ejecuta `storage cp`. Si existen objetos,
cambia temporalmente el working directory a `storage/` y ejecuta el CLI local
versionado con `--workdir <repoRoot>`, origen `ss:///godel-files/` y destino
relativo `godel-files`. No se pasa una ruta Windows absoluta como destino.

La metadata de Storage permanece en el dump de datos PostgreSQL. El backup
Productivo actual tiene Storage vacío, mientras que backup y restore no vacíos
quedaron verificados en entornos Managed desechables. `TD-BACKUP-004` queda
`CLOSED` por aceptación estructural y byte-exact.

### 3.3 `manifest.json`

El manifest se mantiene mínimo. Su contrato conceptual es:

```json
{
  "formatVersion": 1,
  "backupId": "...",
  "createdAtUtc": "...",
  "source": "godel-production",
  "projectRef": "...",
  "gitSha": "...",
  "database": {
    "file": "data.sql"
  },
  "storage": {
    "bucket": "godel-files",
    "directory": "storage/godel-files"
  }
}
```

La implementación podrá ajustar la forma exacta cuando sea necesario, sin
convertir el manifest en un registro de decenas de estados internos.

### 3.4 `checksums.sha256`

`checksums.sha256` cubre `data.sql`, `manifest.json` y cada archivo físico de
Storage; no se incluye a sí mismo. Su única función es detectar corrupción o
alteración accidental antes del restore. V1 no diseña provenance criptográfica
compleja.

## 4. Estrategia de esquema

El backup no es la fuente primaria del esquema. El esquema recuperable procede
de:

- `supabase/migrations/` del repositorio;
- configuración versionada del proyecto;
- el commit de aplicación registrado en `manifest.json`.

La recuperación crea o prepara primero un proyecto Supabase Managed nuevo y
aplica el esquema y las migraciones del repositorio. Sólo después restaura los
datos. Esta secuencia evita intentar reemplazar manualmente los schemas internos
de Auth y Storage de Supabase.

```text
new Supabase Managed project
→ supabase link
→ fresh-target verification
→ supabase db push
→ remove baseline seed rows
→ restore data.sql
→ restore Storage
→ read-only verification
```

`supabase db push` aplica las migraciones del repositorio. Simple Restore V1 no
ejecuta `supabase config push`: `supabase/config.toml` contiene URLs localhost
propias del desarrollo y no es autoridad automática para configurar el target
Managed. La configuración del proyecto queda explícita y fuera del restore
automático de M.6.2. Secrets y credenciales permanecen fuera del backup.

## 5. Contrato implementado de `backup.ps1`

Ubicación: `scripts/backup-recovery/backup.ps1`.

El script:

1. acepta exclusivamente `-BackupRoot <path>`;
2. resuelve la raíz del repositorio desde `$PSScriptRoot`, por lo que puede
   invocarse desde cualquier working directory;
3. valida `git`, `npx.cmd` y la CLI local mediante
   `npx.cmd --no-install supabase`, sin instalar ni actualizar dependencias;
4. reutiliza `.env.managed.backup.local` del tooling Managed histórico con
   precedencia `Process environment > archivo`, cargando sólo las variables de
   Simple Backup V1;
5. comprueba o crea `BackupRoot` y crea un backup ID UTC con formato
   `GDBK-YYYYMMDDTHHMMSSZ`;
6. preserva `supabase/.temp` en un directorio temporal del sistema, ejecuta
   `supabase link --project-ref` sin exponer `SUPABASE_DB_PASSWORD` al comando y
   restaura inmediatamente el password process-local para el dump;
7. construye `<backup-id>.partial` y falla si ya existe el directorio parcial
   o final;
8. genera `data.sql` mediante
   `supabase db dump --linked --data-only --use-copy`, excluyendo
   `storage.buckets_vectors` y `storage.vector_indexes`, y comprueba que sea un
   archivo regular no vacío;
9. ejecuta `storage ls` recursivo; si el bucket está vacío, crea
   `storage/godel-files/` vacío sin ejecutar `storage cp`; si contiene objetos,
   ejecuta `supabase storage cp ... -r --experimental --linked` con el destino
   relativo del workaround Windows aprobado; ambos caminos producen el mismo
   layout contractual;
10. genera el manifest mínimo y `checksums.sha256`;
11. renombra el directorio parcial al nombre final dentro del mismo
    `BackupRoot` sólo si todas las fases terminan correctamente;
12. devuelve un código distinto de cero, no publica el nombre final y elimina
    preferentemente el parcial creado por la ejecución ante cualquier fallo.

La restauración de `supabase/.temp` se ejecuta tanto en PASS como en FAIL. Si el
repositorio tenía un vínculo previo, se repone exactamente ese estado; si no lo
tenía, el script termina sin `.temp`. Así, el backup no deja el workspace
enlazado a Production como efecto lateral.

El environment de Simple Backup V1 queda limitado a:

- required: `GODEL_MANAGED_SUPABASE_PROJECT_REF` y `SUPABASE_DB_PASSWORD`;
- optional: `SUPABASE_ACCESS_TOKEN`.

`GODEL_MANAGED_SUPABASE_PROJECT_REF` debe cumplir `^[a-z0-9]{20}$` y es la
fuente interna de `ProjectRef`. La ausencia de `SUPABASE_ACCESS_TOKEN` no
bloquea el preflight: el Supabase CLI puede usar la sesión persistida por
`supabase login`, y `supabase link` determina si existe autenticación válida.
Las variables cargadas desde el archivo se restauran a su estado process-local
previo tanto en PASS como en FAIL. Las variables legacy de R2 y `age` se ignoran.

Los checksums SHA-256 se escriben en minúsculas, ordenados por ruta relativa
con `/`, y cubren `data.sql`, `manifest.json` y todos los objetos físicos de
Storage. `checksums.sha256` no se incluye a sí mismo.

La salida humana será breve y operativa:

```text
BACKUP COMPLETE
Backup: <id>
Database: OK
Storage: OK
Checksums: OK
Path: <ruta-final>
```

R2, `age` y los diagnostics encadenados no son requisitos del backup V1.

### 5.1 Evidencia de Real Production Backup #2

```text
REAL PRODUCTION BACKUP #1 =
PREFLIGHT BLOCKED / NOT EXECUTED / ZERO REMOTE ACTIVITY

REAL PRODUCTION BACKUP #2 =
SAFE FAIL / STORAGE WINDOWS PATH COMPATIBILITY

TOOLING SHA #2 =
d07726c68a19e6f28f0e7b2b891ce14986b209b8

LINK = PASS
DATABASE DUMP = PASS
STORAGE COPY = FAIL / WINDOWS ABSOLUTE DESTINATION PARSED AS URL SCHEME
PRODUCTION MUTATIONS = 0
```

El intento #2 leyó Production para generar `data.sql`, pero falló antes de
copiar objetos de Storage y no produjo mutaciones. Tanto el directorio parcial
como el final del backup `GDBK-20261007T180643Z` quedaron ausentes tras el
cleanup.

### 5.2 Evidencia de Real Production Backup #3

El artefacto final se validó independientemente de forma local y read-only, sin
contactar Supabase, ejecutar SQL ni modificar el backup.

```text
REAL PRODUCTION BACKUP #3 =
PASS / ARTIFACT VERIFIED LOCALLY

BACKUP ID =
GDBK-20261007T183337Z

TOOLING SHA =
7e412c501dace1181d17c30caa3b54cfa711ee91

FINAL DIRECTORY = PRESENT
PARTIAL DIRECTORY = ABSENT
MANIFEST = PASS
CHECKSUMS = PASS / 2 OF 2 FILES
DATABASE ARTIFACT = PASS
DATA.SQL BYTES = 44862
COPY BLOCKS = 51
CRITICAL COPY TARGETS = 10 OF 10 PRESENT
SETVAL STATEMENTS = 1
STORAGE DIRECTORY = PRESENT
STORAGE FILE COUNT = 0
STORAGE TOTAL BYTES = 0
STORAGE = EMPTY / PASS
SECRET LEAK CHECK = PASS
SUPABASE_DB_PASSWORD LEAK = NO
SUPABASE_ACCESS_TOKEN LEAK = NOT CONFIGURED

REMOTE ACTIVITY DURING VALIDATION = 0
PRODUCTION DB READS DURING VALIDATION = 0
PRODUCTION STORAGE READS DURING VALIDATION = 0
SQL EXECUTIONS DURING VALIDATION = 0
PRODUCTION MUTATIONS DURING VALIDATION = 0
PRODUCTION MUTATIONS = 0
```

## 6. Contrato implementado de `restore.ps1`

Ubicación: `scripts/backup-recovery/restore.ps1`.

El script:

1. Recibir explícitamente la carpeta de backup.
2. Valida layout, manifest, checksums, sentencias de seguridad y targets `COPY`
   antes de cualquier operación remota.
3. Carga el target desde `.env.managed.restore.local`, exige
   `ALLOW_DISPOSABLE_MANAGED_RESTORE` y bloquea el ProjectRef Productivo.
4. Exige `psql`, Supabase CLI 2.109.1 y ausencia de drift en
   `supabase/migrations/**`; `supabase/config.toml` no se restaura
   automáticamente.
5. Preserva `supabase/.temp`, enlaza el target sin password y obtiene la
   conexión `psql` passwordless desde `pooler-url`; el password viaja como
   `PGPASSWORD` para `psql` y como `SUPABASE_DB_PASSWORD` exclusivamente durante
   `db push`, con restauración inmediata del environment.
6. Comprueba de forma read-only que el target es nuevo y disposable antes de
   permitir mutaciones.
7. Ejecuta una sola vez `npx.cmd --no-install supabase --yes db push --linked`.
   Un exit cero continúa normalmente. Ante exit no-cero no reintenta: consulta
   read-only `supabase_migrations.schema_migrations` y sólo continúa como
   `NONZERO / MIGRATIONS RECONCILED` si el conjunto ordenado coincide exactamente
   con migrations 01–06; cualquier ausencia, versión inesperada o fallo de
   consulta termina `FAIL / UNRECONCILED`. Después verifica que no existan datos
   operativos, incluido `storage.objects = 0`, y dentro de una única transacción
   elimina los seeds de `public.tipos_servicio`, habilita
   `storage.allow_delete_query` mediante `set_config(..., true)` con scope local
   y elimina exclusivamente el bucket `godel-files`.
8. Restaura `data.sql` mediante `psql --single-transaction` y
   `ON_ERROR_STOP=1`.
9. Exige que la cantidad de archivos físicos de Storage coincida con el bloque
   `COPY storage.objects`; para Storage vacío no ejecuta upload. Con objetos,
   invoca directamente el `node_modules/.bin/supabase.cmd` fijado por el
   repositorio y ejecuta, en orden determinista, un
   `storage cp <relative-path> ss:///godel-files/<relative-path> -r --linked` por
   archivo desde `storage/godel-files/`.
10. Compara diez conteos del target con los bloques `COPY`, verifica el conjunto
    case-sensitive exacto de nombres en `storage.objects`, migrations 01–06, el
    bucket y la inmutabilidad local del backup.
11. Restaura link state, environment y working directory tanto en `PASS` como
    en `FAIL`.

V1 no acepta Production como target, no usa local/self-hosted como target
principal, no promete compatibilidad arbitraria de schema y no crea una nueva
cadena de diagnostics numerados. El stderr de los comandos nativos permanece
suprimido en V1; success/failure se determina exclusivamente mediante el exit
code del proceso. Ante un `db push` no-cero, la reconciliación read-only
determina si el flujo puede continuar. Un outcome no reconciliado marca el
target como `FAILED / DISPOSABLE` y no intenta limpiarlo ni reutilizarlo.

## 7. Verificación post-restore

La verificación V1 es deliberadamente pequeña:

```text
DATABASE RESTORE = PASS
DATABASE COUNTS = PASS
STORAGE PATHS = PASS
MIGRATIONS 01-06 = PASS
GODEL-FILES BUCKET = PRESENT
STORAGE = PASS, cuando existan objetos
STORAGE = EMPTY / PASS, cuando el backup sea legítimamente vacío
```

No se crea un framework adicional de decenas de gates. PPO-04M.6.3 validó el
login real del usuario restaurado y el smoke de aplicación contra el target
Managed recuperado.

## 8. Off-site y cifrado

El cifrado y la copia off-site siguen siendo deseables, pero quedan desacoplados
del mecanismo básico. Simple Backup / Restore V1 debe funcionar por completo
con una carpeta local. M.6.4D conserva la decisión off-site como `OPTIONAL
OFF-SITE DECISION / PENDING`; M.6.4B no selecciona proveedor ni introduce una
dependencia externa.

## 9. Roadmap

| Bloque | Alcance | Estado |
| --- | --- | --- |
| PPO-04M.6.0 | Architecture Pivot / Documentation | `REVIEWED / CLOSED` |
| PPO-04M.6.1 | Simple Backup V1 Implementation | `REVIEWED / CLOSED` |
| PPO-04M.6.2 | Simple Restore V1 Implementation | `REVIEWED / CODE COMPLETE` |
| PPO-04M.6.3 | Real Backup + Managed Recovery Drill | `REVIEWED / CLOSED` |
| PPO-04M.6.4 | Operationalization / Retention / Optional Off-site Copy | `ACTIVE` |
| PPO-04M.6.4A | Non-empty Storage Recovery Validation | `REVIEWED / CLOSED` |
| PPO-04M.6.4B | Minimal Operational Backup Policy | `REVIEWED / CLOSED` |
| PPO-04M.6.4C | Lightweight Operational Runbook | `NEXT / LIGHTWEIGHT OPERATIONAL RUNBOOK` |
| PPO-04M.6.4D | Optional Off-site Decision | `OPTIONAL OFF-SITE DECISION / PENDING` |

PPO-04M.6.1 queda revisado y cerrado, con Simple Backup V1 aprobado y el backup
Productivo real verificado localmente. PPO-04M.6.2 queda revisado y code complete.
PPO-04M.6.3 queda revisado y cerrado por evidencia estructural y funcional del
quinto drill real. PPO-04M.6.4 sigue activo; M.6.4A y M.6.4B quedan revisados y
cerrados, y M.6.4C es el siguiente bloque.

## 10. Cierre de Diagnostic #6

La ejecución real del tooling inmutable quedó registrada así:

```text
LOCAL RESTORE EXECUTOR CANDIDATE DIAGNOSTIC #6 =
CLOSED / FAIL / INTERNAL TOOLING FAILURE

TOOLING SHA =
906f4cf16c184d95a2c0f5f8524a5a86ec8d2fe7

status = FAIL
phase = RESTORE_EXECUTOR_PREFLIGHT
code = RECOVERY_RESTORE_EXECUTOR_DIAGNOSTIC_FAILED

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS

RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_6_EXIT_CODE = 1
```

No se determinó la causa raíz. La línea de trabajo se detuvo antes de
instrumentar Diagnostic #7. Por tanto, no se afirma que fallaran sequences,
privileges ni el closure Iceberg.

## 11. Evidencia de Real Managed Recovery Drill #1–#5

Drills #1 y #2 utilizaron el execution SHA inmutable
`7cb8bedf3f5a4611854c3f825924090e455afdee`. Drill #1 terminó en
`FAIL / PREFLIGHT / PSQL_REQUIRED` sin actividad remota ni mutaciones. Después de
instalar PostgreSQL client 17.11, Drill #2 alcanzó `db push`, devolvió exit 1 y el
target quedó `FAILED / DISPOSABLE`.

El diagnóstico posterior fue exclusivamente read-only. Confirmó la tabla
`supabase_migrations.schema_migrations`, exactamente las versions 01–06, los
objetos canónicos comprobados y el bucket `godel-files`. Además,
`supabase --yes db push --dry-run --linked` informó que la base remota estaba al
día con exit 0. No existe evidencia de fallo SQL de una migration; data restore
y Storage restore no se ejecutaron. El stderr original no quedó disponible.

Drill #3 utilizó el execution SHA inmutable
`e42b0e5929dc29f383e374e2eeda3073bcb018d4`. Terminó
`FAIL / POWERSHELL NATIVE STDERR HANDLING`: Windows PowerShell 5.1 convirtió el
stderr informativo de `db push` en un terminating error antes de que
`Invoke-DbPush` pudiera devolver el exit code. La reconciliación estaba
implementada pero no fue alcanzada. El target quedó `FAILED / DISPOSABLE`; data
restore y Storage restore no se ejecutaron. No se realizó diagnóstico remoto
posterior y no se afirma si migrations 01–06 quedaron aplicadas en Drill #3.

Drill #4 utilizó el execution SHA inmutable
`56489d4d98dda6a771e9e92d6dee10a1f9889268`. Atravesó `db push` y seed safety,
por lo que el fix de Windows PowerShell native stderr quedó validado en entorno
real. Terminó `FAIL / STORAGE DIRECT DELETE PROTECTION AT SEED CLEANUP` porque
Supabase Storage protegió el `DELETE` SQL directo del bucket. El target quedó
`FAILED / DISPOSABLE`; data restore y Storage restore no se ejecutaron.

Drill #5 utilizó el execution SHA inmutable
`cc7895f0c59ea21b656d07ca7f47a116cada79ea`, el backup fuente
`GDBK-20261007T183337Z` y un proyecto Supabase Managed nuevo y desechable. El
restore terminó `RESTORE COMPLETE` con exit 0: `db push`, seed safety, seed
cleanup, database restore, database counts, migrations 01–06, bucket
`godel-files` y el camino `STORAGE = EMPTY / PASS` pasaron.

La aceptación Auth posterior usó `.env.managed.qa.local` y las variables
vigentes `GODEL_TEST_ADMIN_EMAIL` y `GODEL_TEST_ADMIN_PASSWORD`; las variables
legacy `GODEL_MANAGED_TEST_ADMIN_*` no fueron autoridad. Tras confirmar que el
target no era Production, el login restaurado y el perfil admin activo pasaron
con exit 0.

La aceptación de aplicación levantó Godel localmente contra el target Managed
recuperado y ejecutó exclusivamente `tests/e2e/smoke.spec.ts` con Chromium y un
worker. Pasaron `6 OF 6`, incluido login admin restaurado y dashboard, con
actividad Productiva igual a cero.

El backup tenía `STORAGE FILE COUNT = 0` y `STORAGE TOTAL BYTES = 0`. Por tanto,
el camino real de Storage vacío queda verificado, pero no se afirma validación
real de Storage no vacío ni de upload mediante `storage cp`.

## 12. Evidencia de PPO-04M.6.4A

Un source Supabase Managed desechable contenía exactamente el objeto
`godel-files/m6-4a/nonempty-storage-fixture.png`, de 68 bytes y SHA-256
`0d0c28ebff1146040753834f8cc0ca19d6ee70c8902db80e949891afa9dedd90`. El byte
round-trip fue `PASS`. El backup real `GDBK-20261009T024741Z` terminó `PASS /
REAL-ENVIRONMENT VERIFIED`: un archivo, 68 bytes, SHA-256 coincidente,
`checksums.sha256` `PASS / 3 OF 3` y metadata del fixture presente en `data.sql`.

Real Non-empty Storage Restore #1 usó el execution SHA inmutable
`7bf39fb50e42d6809cd9ae3497d7090daa4f0fdd` sobre un target Managed nuevo. Llegó
a Storage upload y falló correctamente en `DATABASE COUNTS`, con
`storage.objects EXPECTED 1 / ACTUAL 2`. La forense read-only confirmó el path
canónico `m6-4a/nonempty-storage-fixture.png` y el path duplicado incorrecto
`godel-files/m6-4a/nonempty-storage-fixture.png`; el target quedó `FAILED /
DISPOSABLE` y la actividad de mutación durante la forense fue cero.

La causa raíz queda `CONFIRMED`: ejecutar desde `storage/` con source
`godel-files` hizo que Supabase CLI 2.109.1 preservara ese basename. La corrección
local inicial ejecutó desde `storage/godel-files/` con source `.` y destino
`ss:///godel-files/`.

Real Non-empty Storage Restore #2 usó el execution SHA inmutable
`8c8c12d5cde5f4e570bb4dcc945363d5a299b7bb` sobre otro target Managed fresco.
También llegó al upload y falló correctamente en `DATABASE COUNTS`, con
`storage.objects EXPECTED 1 / ACTUAL 2`. La forense read-only confirmó otra vez
el path canónico `m6-4a/nonempty-storage-fixture.png` y el duplicado incorrecto
`godel-files/m6-4a/nonempty-storage-fixture.png`; el target quedó `FAILED /
DISPOSABLE` y la forense realizó cero mutaciones remotas.

La causa definitiva queda `CONFIRMED`: el CLI convierte `.` a la ruta absoluta
del directorio y vuelve a obtener `godel-files` como basename. Por tanto, la
estrategia directory-root queda `REJECTED`. La corrección local definitiva sube
cada archivo con source relativo y destination remoto exacto, conserva `-r` para
el upsert y verifica después el conjunto exacto de paths. `DATABASE COUNTS` se
mantiene sin relajar.

Real Non-empty Storage Restore #3 usó el execution SHA inmutable
`00a2f8c8c9dd7d06fef2017c16ef4acbc486f7ba` y el backup
`GDBK-20261009T024741Z`. `restore.ps1` terminó `RESTORE COMPLETE` con exit 0:
schema, db push, database, database counts, Storage y restauración de las
variables del caller pasaron. La aceptación read-only independiente confirmó un
bucket, un objeto, un único path canónico
`m6-4a/nonempty-storage-fixture.png`, ausencia del path duplicado y metadata size
68. El download final midió 68 bytes y su SHA-256
`0d0c28ebff1146040753834f8cc0ca19d6ee70c8902db80e949891afa9dedd90` coincidió
con el fixture del backup. La cadena source → backup → restored quedó `PASS` y la
verificación remota realizó cero mutaciones.

Por esta evidencia, M.6.4A queda `REVIEWED / CLOSED`, TD-BACKUP-004 queda
`CLOSED` y el alcance real pasa a `NON-EMPTY STORAGE VERIFIED / BYTE-EXACT`.

## 13. PPO-04M.6.4B — Minimal Operational Backup Policy

Durante el Production Pilot, el baseline rutinario es crear un backup
Productivo una vez por semana mientras Production tenga actividad operativa
real. M.6.4B no introduce scheduler automático.

Además del backup semanal, el operador debe obtener primero un backup exitoso
antes de una operación deliberada con riesgo significativo sobre datos, como una
migración nueva, una modificación bulk, un cleanup potencialmente destructivo,
un cambio relevante de Storage o una operación administrativa excepcional. La
regla general es:

```text
BEFORE DELIBERATE HIGH-RISK PRODUCTION DATA OPERATION
= CREATE SUCCESSFUL BACKUP FIRST
```

Después de una importación o cambio operacional importante, el operador puede
crear otro backup para fijar explícitamente el nuevo estado como recovery point.

Se deben retener como mínimo cuatro backups Productivos exitosos. Sólo cuenta un
directorio final `GDBK-*` producido por una ejecución exitosa de
`scripts/backup-recovery/backup.ps1`; un fallo, un `*.partial` o una ejecución
incompleta no es un recovery point válido ni sustituye un backup exitoso.

El mínimo de cuatro no es un máximo. Quedan protegidos frente al cleanup
ordinario el último backup Productivo exitoso, los usados como evidencia de un
recovery drill, los asociados a un incidente o investigación, los marcados por
el operador como referencia y aquellos cuyo reemplazo aún no haya sido validado
exitosamente.

M.6.4B no implementa scheduling ni eliminación automática. El cleanup durante
el Production Pilot permanece manual y no se crea registry o catálogo adicional:
el filesystem y el manifest existentes siguen siendo suficientes para V1. La
custodia primaria continúa en el `-BackupRoot <path>` local elegido por el
operador; no existe una ruta absoluta universal en el contrato.

Esta política no autoriza restore in-place, restore sobre Production ni restore
automático. El recovery validado continúa dirigido a un proyecto Supabase
Managed nuevo y desechable. PPO-06 podrá profundizar después en automatización,
scheduling, retention automation, monitoring, restore rehearsals, durabilidad
off-site y objetivos RPO/RTO más estrictos.

```text
PPO-04M.6.4B = REVIEWED / CLOSED
ROUTINE PRODUCTION BACKUP CADENCE = WEEKLY
PRE-HIGH-RISK-OPERATION BACKUP = REQUIRED
MINIMUM SUCCESSFUL PRODUCTION BACKUPS RETAINED = 4
AUTOMATIC BACKUP SCHEDULING = NOT IMPLEMENTED IN M.6.4B
AUTOMATIC RETENTION DELETION = NOT IMPLEMENTED
BACKUP CLEANUP = MANUAL DURING PRODUCTION PILOT
FAILED / PARTIAL BACKUPS = NOT VALID RECOVERY POINTS
PROTECTED BACKUPS = EXEMPT FROM ORDINARY RETENTION CLEANUP
PRIMARY BACKUP CUSTODY = OPERATOR-SPECIFIED LOCAL BACKUPROOT
OFF-SITE DECISION = DEFERRED TO M.6.4D
PRODUCTION RESTORE = NOT AUTHORIZED
PPO-04M.6.4C = NEXT / LIGHTWEIGHT OPERATIONAL RUNBOOK
PPO-04M.6.4D = OPTIONAL OFF-SITE DECISION / PENDING
```

## 14. Estado resultante

```text
PPO-04M.5.3 = SUSPENDED / SUPERSEDED
PPO-04M.6 = ACTIVE
PPO-04M.6.0 = REVIEWED / CLOSED
PPO-04M.6.1 = REVIEWED / CLOSED
SIMPLE BACKUP V1 = REVIEWED / APPROVED / REAL PRODUCTION BACKUP VERIFIED
REAL PRODUCTION BACKUP #1 = PREFLIGHT BLOCKED / NOT EXECUTED / ZERO REMOTE ACTIVITY
REAL PRODUCTION BACKUP #2 = SAFE FAIL / STORAGE WINDOWS PATH COMPATIBILITY
REAL PRODUCTION BACKUP #3 = PASS / ARTIFACT VERIFIED LOCALLY
PPO-04M.6.2 = REVIEWED / CODE COMPLETE
SIMPLE RESTORE V1 = REAL MANAGED RECOVERY VERIFIED INCLUDING NON-EMPTY STORAGE
PPO-04M.6.3 = REVIEWED / CLOSED
REAL MANAGED RECOVERY DRILL #1 = FAIL / PREFLIGHT / PSQL_REQUIRED / ZERO REMOTE ACTIVITY
REAL MANAGED RECOVERY DRILL #2 = FAIL / AMBIGUOUS DB PUSH OUTCOME
DRILL #2 MIGRATIONS 01–06 = COMMITTED / VERIFIED
DRILL #2 DATA RESTORE = NOT EXECUTED
DRILL #2 STORAGE RESTORE = NOT EXECUTED
DRILL #2 TARGET = FAILED / DISPOSABLE
REAL MANAGED RECOVERY DRILL #3 = FAIL / POWERSHELL NATIVE STDERR HANDLING
DRILL #3 TARGET = FAILED / DISPOSABLE
DRILL #3 DATA RESTORE = NOT EXECUTED
DRILL #3 STORAGE RESTORE = NOT EXECUTED
DB PUSH RECONCILIATION = IMPLEMENTED / NOT REACHED IN DRILL #3
REAL MANAGED RECOVERY DRILL #4 = FAIL / STORAGE DIRECT DELETE PROTECTION AT SEED CLEANUP
DRILL #4 EXECUTION SHA = 56489d4d98dda6a771e9e92d6dee10a1f9889268
DRILL #4 DB PUSH GATE = PASSED
DRILL #4 SEED SAFETY = PASSED
DRILL #4 SEED CLEANUP = FAIL
DRILL #4 DATA RESTORE = NOT EXECUTED
DRILL #4 STORAGE RESTORE = NOT EXECUTED
DRILL #4 TARGET = FAILED / DISPOSABLE
WINDOWS POWERSHELL NATIVE STDERR FIX = REAL-DRILL VALIDATED
REAL MANAGED RECOVERY DRILL #5 = PASS / STRUCTURAL + FUNCTIONAL RECOVERY VERIFIED
DRILL #5 EXECUTION SHA = cc7895f0c59ea21b656d07ca7f47a116cada79ea
DRILL #5 SOURCE BACKUP = GDBK-20261007T183337Z
DRILL #5 STRUCTURAL RESTORE = PASS
DRILL #5 AUTH LOGIN = PASS
DRILL #5 RESTORED ADMIN PROFILE = PASS
DRILL #5 APPLICATION SMOKE = PASS / 6 OF 6
DRILL #5 TARGET = VERIFIED DISPOSABLE MANAGED RECOVERY TARGET
RESTORED_AUTH_LOGIN = PASS
RESTORED_ADMIN_PROFILE = PASS
RECOVERY_AUTH_ACCEPTANCE = PASS
RECOVERY_APPLICATION_SMOKE = PASS
POWERSHELL_INVOKE_SUCCESS = True
REAL_MANAGED_RECOVERY_DRILL_5_EXIT_CODE = 0
RECOVERY_AUTH_ACCEPTANCE_EXIT_CODE = 0
RECOVERY_APPLICATION_SMOKE_EXIT_CODE = 0
FINAL_RECOVERY_APPLICATION_SMOKE_EXIT_CODE = 0
PRODUCTION ACTIVITY DURING FUNCTIONAL ACCEPTANCE = 0
STORAGE FILE COUNT = 0
STORAGE TOTAL BYTES = 0
CURRENT REAL RESTORE STORAGE SCOPE = NON-EMPTY STORAGE VERIFIED / BYTE-EXACT
PPO-04M.6.4 = ACTIVE
PPO-04M.6.4A = REVIEWED / CLOSED
NON-EMPTY STORAGE SOURCE FIXTURE = PASS / REAL MANAGED
REAL NON-EMPTY STORAGE BACKUP = PASS / REAL MANAGED VERIFIED
VALIDATION BACKUP = GDBK-20261009T024741Z
BACKUP STORAGE FILE COUNT = 1
BACKUP STORAGE TOTAL BYTES = 68
BACKUP BYTE SHA256 = MATCH
REAL NON-EMPTY STORAGE RESTORE #1 = FAIL / SOURCE-ROOT PATH DUPLICATION
RESTORE #1 EXECUTION SHA = 7bf39fb50e42d6809cd9ae3497d7090daa4f0fdd
RESTORE #1 DATABASE COUNTS = FAIL
RESTORE #1 storage.objects = EXPECTED 1 / ACTUAL 2
FORENSIC ROOT CAUSE = CONFIRMED
CANONICAL RESTORED PATH = m6-4a/nonempty-storage-fixture.png
INCORRECT PATH CREATED = godel-files/m6-4a/nonempty-storage-fixture.png
RESTORE #1 TARGET = FAILED / DISPOSABLE
NON-EMPTY STORAGE BACKUP = REAL VERIFIED
REAL NON-EMPTY STORAGE RESTORE #2 = FAIL / DIRECTORY NORMALIZATION RETAINED BUCKET BASENAME
RESTORE #2 EXECUTION SHA = 8c8c12d5cde5f4e570bb4dcc945363d5a299b7bb
RESTORE #2 DATABASE COUNTS = FAIL
RESTORE #2 storage.objects = EXPECTED 1 / ACTUAL 2
RESTORE #2 CANONICAL PATH = m6-4a/nonempty-storage-fixture.png
RESTORE #2 INCORRECT DUPLICATED PATH = godel-files/m6-4a/nonempty-storage-fixture.png
RESTORE #2 FORENSICS = CONFIRMED / REMOTE MUTATIONS 0
RESTORE #2 TARGET = FAILED / DISPOSABLE
DIRECTORY-ROOT RESTORE STRATEGY = REJECTED
CORRECTED STRATEGY = PER-FILE EXACT-PATH UPSERT
REAL NON-EMPTY STORAGE RESTORE #3 = PASS / REAL MANAGED VERIFIED
RESTORE #3 EXECUTION SHA = 00a2f8c8c9dd7d06fef2017c16ef4acbc486f7ba
RESTORE #3 STRATEGY = PER-FILE EXACT-PATH UPSERT
RESTORE #3 DATABASE COUNTS = PASS
RESTORE #3 STORAGE PATHS = PASS
TARGET STORAGE OBJECT COUNT = 1
CANONICAL PATH = m6-4a/nonempty-storage-fixture.png
DUPLICATED PATH = ABSENT
BACKUP STORAGE BYTES = 68
RESTORED STORAGE BYTES = 68
BACKUP / RESTORED SHA256 = MATCH
NON-EMPTY STORAGE BYTE-EXACT ROUNDTRIP = PASS
SOURCE → BACKUP → RESTORED BYTE CHAIN = PASS
REMOTE VERIFICATION MUTATIONS = 0
PPO-04M.6.4B = REVIEWED / CLOSED
ROUTINE PRODUCTION BACKUP CADENCE = WEEKLY
PRE-HIGH-RISK-OPERATION BACKUP = REQUIRED
MINIMUM SUCCESSFUL PRODUCTION BACKUPS RETAINED = 4
AUTOMATIC BACKUP SCHEDULING = NOT IMPLEMENTED IN M.6.4B
AUTOMATIC RETENTION DELETION = NOT IMPLEMENTED
BACKUP CLEANUP = MANUAL DURING PRODUCTION PILOT
FAILED / PARTIAL BACKUPS = NOT VALID RECOVERY POINTS
PROTECTED BACKUPS = EXEMPT FROM ORDINARY RETENTION CLEANUP
PRIMARY BACKUP CUSTODY = OPERATOR-SPECIFIED LOCAL BACKUPROOT
OFF-SITE DECISION = DEFERRED TO M.6.4D
PPO-04M.6.4C = NEXT / LIGHTWEIGHT OPERATIONAL RUNBOOK
PPO-04M.6.4D = OPTIONAL OFF-SITE DECISION / PENDING
LEGACY COMPLEX RECOVERY HARNESS = FROZEN / NOT ACTIVE PATH
DIAGNOSTIC #7 = CANCELLED
OLD REAL RESTORE ATTEMPT #7 = CANCELLED UNDER LEGACY APPROACH
PRODUCTION RESTORE = NOT AUTHORIZED
TD-BACKUP-004 = CLOSED
```
