# PPO-04M.6 — Simple Backup / Restore V1

**Estado de PPO-04M.6:** `ACTIVE`

**Estado de PPO-04M.6.0:** `REVIEWED / CLOSED`

**Estado de PPO-04M.6.1:** `IMPLEMENTED / PENDING CODE REVIEW`

**Simple Backup V1:** `IMPLEMENTED / PENDING REAL PRODUCTION BACKUP VALIDATION`

**Real Production Backup #1:** `PREFLIGHT BLOCKED / NOT EXECUTED / ZERO REMOTE ACTIVITY`

**Simple Restore V1:** `DESIGNED / NOT IMPLEMENTED`

**Production restore:** `NOT AUTHORIZED`

**Fecha:** 2026-10-06

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
PPO-04M.6.1 deberá validar el comando con la versión CLI usada por el proyecto
antes de considerarlo operacional. Si funciona en el drill real, se utiliza sin
diseñar un fallback complejo, un SDK propio ni capas adicionales.

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
→ supabase db push
→ supabase config push
→ restore data.sql
→ restore Storage
→ smoke verification
```

`supabase db push` aplica las migraciones del repositorio. El comando
`supabase config push` aplica al proyecto enlazado la configuración versionada
soportada desde `supabase/config.toml`. V1 no afirma que toda configuración
existente en Supabase se reconstruya automáticamente cuando no está
representada o no es configurable desde el repositorio. Secrets y credenciales
permanecen fuera del backup.

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
9. descarga recursivamente `godel-files` mediante
   `supabase storage cp ... -r --experimental --linked`, aceptando como válido
   un bucket vacío si el comando termina correctamente;
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

## 6. Contrato futuro de `restore.ps1`

Ubicación prevista: `scripts/backup-recovery/restore.ps1`.

El script deberá:

1. Recibir explícitamente la carpeta de backup.
2. Validar el manifest y los checksums.
3. Exigir explícitamente un target Supabase Managed de recuperación.
4. Impedir que el target sea el Production conocido.
5. Aplicar o preparar el esquema del repositorio.
6. Restaurar `data.sql`.
7. Restaurar Storage.
8. Ejecutar la verificación smoke.
9. Finalizar con un resultado claro.

V1 no acepta Production como target, no usa local/self-hosted como target
principal, no promete compatibilidad arbitraria de schema y no crea una nueva
cadena de diagnostics numerados.

## 7. Verificación post-restore

La verificación V1 es deliberadamente pequeña:

```text
DATABASE RESTORE COMMAND = PASS
CORE APPLICATION DATA = PRESENT
AUTH LOGIN = PASS
APPLICATION START / BASIC ACCESS = PASS
STORAGE = PASS, cuando existan objetos
STORAGE = EMPTY / PASS, cuando el backup sea legítimamente vacío
```

No se crea un framework adicional de decenas de gates.

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
| PPO-04M.6.1 | Simple Backup V1 Implementation | `IMPLEMENTED / PENDING CODE REVIEW` |
| PPO-04M.6.2 | Simple Restore V1 Implementation | `NOT STARTED` |
| PPO-04M.6.3 | Real Backup + Managed Recovery Drill | `NOT STARTED` |
| PPO-04M.6.4 | Operationalization / Retention / Optional Off-site Copy | `NOT STARTED` |

PPO-04M.6.1 queda implementado y pendiente de revisión de código. Su resultado
operativo permanece `PENDING REAL PRODUCTION BACKUP VALIDATION` hasta ejecutar
un backup real autorizado. PPO-04M.6.2 no ha comenzado.

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
PPO-04M.6.1 = IMPLEMENTED / PENDING CODE REVIEW
SIMPLE BACKUP V1 = IMPLEMENTED / PENDING REAL PRODUCTION BACKUP VALIDATION
REAL PRODUCTION BACKUP #1 = PREFLIGHT BLOCKED / NOT EXECUTED / ZERO REMOTE ACTIVITY
SIMPLE RESTORE V1 = DESIGNED / NOT IMPLEMENTED
LEGACY COMPLEX RECOVERY HARNESS = FROZEN / NOT ACTIVE PATH
DIAGNOSTIC #7 = CANCELLED
OLD REAL RESTORE ATTEMPT #7 = CANCELLED UNDER LEGACY APPROACH
PRODUCTION RESTORE = NOT AUTHORIZED
TD-BACKUP-004 = OPEN / REASSIGNED TO SIMPLE STORAGE RECOVERY VALIDATION
```
