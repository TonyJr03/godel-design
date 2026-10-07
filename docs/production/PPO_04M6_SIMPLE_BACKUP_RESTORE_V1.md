# PPO-04M.6 — Simple Backup / Restore V1

**Estado de PPO-04M.6:** `ACTIVE`

**Estado de PPO-04M.6.0:** `REVIEWED / CLOSED`

**Estado de PPO-04M.6.1:** `REVIEWED / CLOSED`

**Simple Backup V1:** `REVIEWED / APPROVED / REAL PRODUCTION BACKUP VERIFIED`

**Estado de PPO-04M.6.2:** `REVIEWED / CODE COMPLETE`

**Simple Restore V1:** `REVIEWED / APPROVED TOOLING / NOT YET REAL-DRILLED`

**Real Managed Recovery Drill:** `NOT YET EXECUTED`

**Real Production Backup #1:** `PREFLIGHT BLOCKED / NOT EXECUTED / ZERO REMOTE ACTIVITY`

**Real Production Backup #2:** `SAFE FAIL / STORAGE WINDOWS PATH COMPATIBILITY`

**Real Production Backup #3:** `PASS / ARTIFACT VERIFIED LOCALLY`

**Production restore:** `NOT AUTHORIZED`

**Fecha:** 2026-10-07

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
PPO-04M.6.1 validó operativamente el flujo con Supabase CLI 2.109.1 durante Real
Production Backup #3: `storage ls` real terminó en `PASS`, el bucket vacío se
clasificó correctamente y se creó `storage/godel-files/` vacío. El camino
`storage cp` para un bucket no vacío quedó validado sintéticamente, todavía no
con objetos Production reales. No se diseña un fallback complejo, un SDK propio
ni capas adicionales.

En Windows, el script ejecuta primero `storage ls` de forma read-only para
distinguir un bucket vacío. Si no hay objetos, crea localmente
`storage/godel-files/` vacío y no ejecuta `storage cp`. Si existen objetos,
cambia temporalmente el working directory a `storage/` y ejecuta el CLI local
versionado con `--workdir <repoRoot>`, origen `ss:///godel-files/` y destino
relativo `godel-files`. No se pasa una ruta Windows absoluta como destino.

La metadata de Storage permanece en el dump de datos PostgreSQL. El backup
Productivo actual tiene Storage vacío, pero el contrato V1 contempla Storage no
vacío. `TD-BACKUP-004` queda `OPEN / REASSIGNED TO SIMPLE STORAGE RECOVERY
VALIDATION` hasta demostrar backup y restore con objetos reales.

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
7. Ejecuta `npx.cmd --no-install supabase --yes db push --linked`, verifica que
   no existan datos operativos y elimina únicamente los seeds de
   `public.tipos_servicio` y el bucket `godel-files` dentro de una transacción
   controlada.
8. Restaura `data.sql` mediante `psql --single-transaction` y
   `ON_ERROR_STOP=1`.
9. Para Storage vacío no ejecuta upload; con objetos invoca directamente el
   `node_modules/.bin/supabase.cmd` fijado por el repositorio y usa `storage cp`
   recursivo con source relativo y el workaround Windows aprobado.
10. Compara diez conteos del target con los bloques `COPY`, verifica migrations
    01–06, el bucket y la inmutabilidad local del backup.
11. Restaura link state, environment y working directory tanto en `PASS` como
    en `FAIL`.

V1 no acepta Production como target, no usa local/self-hosted como target
principal, no promete compatibilidad arbitraria de schema y no crea una nueva
cadena de diagnostics numerados. Un fallo posterior a `db push` marca el target
como `FAILED / DISPOSABLE` y no intenta limpiarlo ni reutilizarlo.

## 7. Verificación post-restore

La verificación V1 es deliberadamente pequeña:

```text
DATABASE RESTORE = PASS
DATABASE COUNTS = PASS
MIGRATIONS 01-06 = PASS
GODEL-FILES BUCKET = PRESENT
STORAGE = PASS, cuando existan objetos
STORAGE = EMPTY / PASS, cuando el backup sea legítimamente vacío
```

No se crea un framework adicional de decenas de gates. El login real del
usuario restaurado y el smoke de aplicación contra el target quedan para
PPO-04M.6.3.

## 8. Off-site y cifrado

El cifrado y la copia off-site siguen siendo deseables, pero quedan desacoplados
del mecanismo básico. Simple Backup / Restore V1 debe funcionar por completo
con una carpeta local. Una etapa posterior podrá copiar esa carpeta a R2 u otro
destino y cifrarla según la política operativa; R2 y `age` no son requisitos
para demostrar que backup y restore funcionan.

## 9. Roadmap

| Bloque | Alcance | Estado |
| --- | --- | --- |
| PPO-04M.6.0 | Architecture Pivot / Documentation | `REVIEWED / CLOSED` |
| PPO-04M.6.1 | Simple Backup V1 Implementation | `REVIEWED / CLOSED` |
| PPO-04M.6.2 | Simple Restore V1 Implementation | `REVIEWED / CODE COMPLETE` |
| PPO-04M.6.3 | Real Backup + Managed Recovery Drill | `NOT STARTED` |
| PPO-04M.6.4 | Operationalization / Retention / Optional Off-site Copy | `NOT STARTED` |

PPO-04M.6.1 queda revisado y cerrado, con Simple Backup V1 aprobado y el backup
Productivo real verificado localmente. PPO-04M.6.2 queda revisado y code complete,
con el tooling de Simple Restore V1 aprobado pero todavía sin drill Managed real.

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

## 11. Estado resultante

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
SIMPLE RESTORE V1 = REVIEWED / APPROVED TOOLING / NOT YET REAL-DRILLED
PPO-04M.6.3 = NOT STARTED
REAL MANAGED RECOVERY DRILL = NOT YET EXECUTED
LEGACY COMPLEX RECOVERY HARNESS = FROZEN / NOT ACTIVE PATH
DIAGNOSTIC #7 = CANCELLED
OLD REAL RESTORE ATTEMPT #7 = CANCELLED UNDER LEGACY APPROACH
PRODUCTION RESTORE = NOT AUTHORIZED
TD-BACKUP-004 = OPEN / REASSIGNED TO SIMPLE STORAGE RECOVERY VALIDATION
```
