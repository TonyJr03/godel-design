# SH-04.0 — Diseño operativo: inventario y contrato de backup/restore

**Estado:** CLOSED / APPROVED
**Fecha:** 2026-08-20  
**Alcance SH:** SH-04.0 exclusivamente; no autoriza operaciones de backup ni restore.

## Alcance y no objetivos

Este documento fija el inventario de persistencia y el contrato arquitectónico que implementarán los subbloques posteriores de SH-04 para la topología activa `Godel App + Nginx + Supabase self-hosted Docker`.

No implementa scripts, no ejecuta backup ni restore, no modifica Compose, Supabase, SMTP, migraciones, RLS, Storage, secretos, actualización upstream ni rollback. Tampoco define frecuencia, retención, copia off-site, scheduler, rutas de `company-host`, alertas, PITR, WAL archiving, HA, réplicas, Kubernetes, snapshots distribuidos ni backup sin downtime. PPO-06 será dueño de la operación DR en `company-host`; PPO-07, de observabilidad y alertas; y SH-05, del drill de portabilidad entre hosts.

## Base congelada y topología vigente

La baseline contiene exclusivamente las migraciones siguientes, inmutables:

```text
20260811131824_01_core_schema.sql
20260811131825_02_security_rls_grants.sql
20260811131826_03_business_rpcs.sql
20260811131827_04_storage.sql
20260811131828_05_auth_admin_user_lifecycle.sql
20260811131829_06_final_hardening.sql
```

`01–06 = FROZEN / IMMUTABLE`; migration 07 está ausente. Este diseño no cambia ni vuelve a generar `src/types/database.types.ts`.

El bundle Supabase está fijado al commit upstream `e846d45ce64207b952a4df44ac8b480ea0abb27e`. El servicio DB usa la familia de imagen `supabase/postgres:17.6.1.136`, y Storage `supabase/storage-api:v1.60.4`. Esas identidades son parte de la compatibilidad del recovery; no se declara portabilidad de PGDATA entre majors o bundles arbitrarios.

```text
Browser
  -> Godel Nginx -> Godel App
                  -> red externa godel-supabase-api -> Supabase Envoy
                                                       -> DB / Auth / Storage

PGDATA:  infra/supabase/volumes/db/data
Storage: infra/supabase/volumes/storage
```

Storage está configurado y auditado como filesystem local:

```text
STORAGE_BACKEND=file
FILE_STORAGE_BACKEND_PATH=/var/lib/storage
```

Sus bytes y la metadata PostgreSQL forman un único dominio de consistencia. El bucket privado `godel-files`, sus cargas TUS y las URLs firmadas dependen de ambas capas: ninguna se recupera correctamente sin la otra.

## Inventario de persistencia y clasificación

La siguiente matriz cubre todos los bind mounts, named volumes, directorios runtime, tmpfs y redes del Compose Supabase activo, además de los ficheros de configuración externos necesarios para reconstruirlo. La clasificación indica qué se protege, no una orden de copia ya implementada.

| Elemento activo | Tipo / consumidor | Clasificación | Tratamiento contractual |
| --- | --- | --- | --- |
| `./volumes/db/data` -> `/var/lib/postgresql/data` | bind mount / DB | **CRITICAL DATA** | Capa física primary. Snapshot solamente con PostgreSQL detenido limpiamente. |
| `./volumes/storage` -> `/var/lib/storage` | bind mount / Storage e imgproxy | **CRITICAL DATA** | Snapshot filesystem durante la misma ventana quiesced que la DB. |
| `db-config:/etc/postgresql-custom/pgsodium_root.key` | named volume / DB | **CRITICAL KEY MATERIAL** | Se captura por custodia protegida separada; no se añade al archivo general. |
| resto de `db-config` (`conf.d`, `extension-custom-scripts`, `read-replica.conf`, `supautils.conf`, `wal-g.conf`) | named volume / DB | **REGENERABLE** | Configuración generada y acoplada a imagen/bundle. No copiar ni restaurar a ciegas el named volume completo. |
| `./volumes/db/_supabase.sql`, `jwt.sql`, `logs.sql`, `pooler.sql`, `realtime.sql`, `roles.sql`, `webhooks.sql` | bind mounts DB init | **VERSIONED CONFIG** | Se reconstruyen desde el Git revision compatible; no son PGDATA. |
| `./volumes/api/envoy/{envoy.yaml,cds.yaml,lds.template.yaml,docker-entrypoint.sh}` | binds de solo lectura / Envoy | **VERSIONED CONFIG** | Se recuperan por la revisión Git compatible, no como datos de aplicación. |
| `./volumes/pooler/pooler.exs` | bind de solo lectura / Supavisor | **VERSIONED CONFIG** | Se recupera por la revisión Git compatible. |
| `./volumes/functions/main/index.ts` | bind / Edge Runtime y Studio | **VERSIONED CONFIG** | Único archivo de Functions actualmente versionado; se recupera desde la revisión Git compatible. |
| `./volumes/functions/**` excepto `main/index.ts` | bind / Edge Runtime y Studio | **AUXILIARY OPERATOR STATE** | Actualmente no requerido por Godel; queda fuera del primary recovery set mientras siga sin uso operativo. |
| `./volumes/snippets` | bind / Studio | **AUXILIARY OPERATOR STATE** | Snippets de operador; no bloquea DB/Storage recovery y queda fuera del backup set primary. |
| `deno-cache:/root/.cache/deno` | named volume / Edge Runtime | **CACHE** | No se respalda; es regenerable. |
| `infra/supabase/.env` | archivo runtime no versionado | **EXTERNAL RECOVERY CONFIG** | Dependencias de secretos y configuración; nunca se archiva por defecto dentro del backup de datos. |
| `compose.env.local` | archivo runtime Godel no versionado | **EXTERNAL RECOVERY CONFIG** | Reconstruye conexión/límites Godel; se gestiona fuera del backup de datos. |
| writable layers de contenedores Supabase | filesystem de contenedor | **EPHEMERAL** | No son artifacts de backup. |
| `supabase_default`, `godel-supabase-api`, `godel-runtime_stack` | redes bridge Docker | **EPHEMERAL** | Se recrean por Compose; no contienen datos recuperables. |
| overrides upstream S3/RustFS/Kong/Caddy/logs y otros `docker-compose.*.yml` no cargados | configuración disponible, no activa | **NOT ACTIVE / OUT OF CONTRACT** | No forman parte del contrato mientras el runtime siga usando el Compose y mounts auditados. |

Los tmpfs del runtime Godel son también **EPHEMERAL**: App usa `/tmp` y `/app/.next/cache`; Nginx usa `/tmp`. No hay tmpfs en los contenedores Supabase auditados. La red y los tmpfs se recrean y no entran al backup set.

Si en el futuro una Edge Function adicional pasa a ser necesaria para Godel, no puede permanecer únicamente como estado ignorado del filesystem. Antes de activarse como dependencia operativa deberá versionarse explícitamente o recibir una política de persistencia/backup aprobada.

La distinción dentro de `db-config` es deliberada: el archivo `pgsodium_root.key` es material criptográfico no regenerable; el resto no tiene evidencia de ser otro material no regenerable y se trata como configuración generada/version-coupled. Este contrato no autoriza preservar o restaurar todo `db-config` como una unidad.

## Inventario de dependencias secretas

SH-04.0 inventaría nombres y clases, nunca valores. `DATA BACKUP != SECRET/KEY CUSTODY`.

| Clase | Dependencias | Contrato SH-04.0 |
| --- | --- | --- |
| Crypto / key material | `pgsodium_root.key`, `JWT_SECRET`, `JWT_KEYS`/`JWT_JWKS` si están activos, `SECRET_KEY_BASE`, `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY` | Deben estar disponibles desde custodia externa compatible antes de restore. La clave pgsodium se captura en el canal protegido separado. |
| Continuity credentials | `POSTGRES_PASSWORD`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, credenciales S3 protocol si están activas | Dependencias externas de continuidad; no se incluyen en el archivo de datos ni en el manifest como valores. El backend actual es `file`; S3 no está activo para Storage. |
| Rotatable service credentials | credenciales Dashboard y SMTP | Inventariadas, no configuradas ni decididas aquí. SH-04.3 define la custodia operativa y SMTP. |
| Configuración no secreta de reconstrucción | URLs, puertos, feature flags y límites de recursos Godel | Configuración externa recuperable desde Git/operación; puede registrarse por nombre o revisión sin mezclarla con secretos. |

## Modelo PostgreSQL y consistencia Storage

### Capa física primary

La vía principal de exact recovery es el backup filesystem de PGDATA. Su contrato es estricto:

```text
physical PGDATA backup
-> PostgreSQL MUST be cleanly stopped
```

Bloquear conexiones no es suficiente. El artifact físico queda ligado a la familia/major PostgreSQL aprobada y al pin de bundle Supabase registrado en el manifest.

### Capa lógica secundaria

`pg_dumpall` será el artifact lógico secundario. Debe conservar objetos globales/cluster además de la base de datos y proporcionar una segunda vía de inspección o recuperación. `supabase db dump`, por sus filtros Supabase, no será el único artifact lógico de DR. SH-04.1 deberá usar `--no-role-passwords`: los verifiers de passwords de roles no se introducen deliberadamente en el artifact lógico, pues las credenciales DB operativas se reconstruyen desde configuración externa y bundle compatible. SH-04.0 no implementa ninguno de los dos comandos.

### Modelo de consistencia

Los writers de DB y Storage se detienen antes del dump/snapshot. Así la metadata DB y los bytes filesystem de Storage pertenecen al mismo periodo quiesced; no se promete PITR, WAL archiving ni consistencia sin ventana de mantenimiento.

## Contrato de backup set y manifest

El set de datos tendrá la forma conceptual siguiente, sin fijar aún compresión:

```text
backup-<id>/
├── manifest.json
├── checksums.sha256
├── postgres/
│   ├── physical/
│   └── logical/
└── storage/
```

El material criptográfico se maneja fuera del archivo general:

```text
protected-recovery-material/
└── <backup-id>/
    └── pgsodium_root.key
```

No se incluyen por defecto `.env`, passwords, JWT secrets, API secret keys, credenciales SMTP ni la clave pgsodium en texto plano dentro de `backup-<id>`.

`manifest.json` es no sensible y puede registrar: versión de schema del backup, ID, timestamp UTC, Git commit y branch, upstream pin, imágenes/versiones Postgres y Storage, backend Storage, nombres de proyectos Compose, artifacts, tamaños, checksums, herramienta/versión de dump lógico, estado `COMPLETE` o `INCOMPLETE` y los nombres de variables externas de secreto requeridas. No registra sus valores. Un backup sólo es candidato a restore cuando `status = COMPLETE` y todos los checksums pasan.

`manifest.json` es **NON-SENSITIVE METADATA**. En cambio, PGDATA físico, el dump lógico PostgreSQL y los bytes Storage son **SENSITIVE BACKUP DATA**: pueden contener información de negocio y datos Auth. Los artifacts de datos nunca van a Git, stdout ni logs, y requieren acceso filesystem restrictivo. Que no incluyan intencionalmente secretos runtime no significa que el backup sea no sensible; `DATA BACKUP != SECRET/KEY CUSTODY` sigue aplicando y `pgsodium_root.key` conserva su custodia separada. El cifrado definitivo, retención, copia off-site y destino productivo siguen fuera de SH-04.0 y pertenecen a PPO-06.

## Ventana de mantenimiento y orden de backup

El procedimiento a implementar en SH-04.1 respeta este orden invariable:

```text
preflight
-> block Godel ingress
-> stop Godel runtime
-> stop all Supabase DB/Storage writers, leave DB running
-> logical cluster dump
-> clean PostgreSQL shutdown
-> physical PGDATA snapshot
-> Storage filesystem snapshot
-> capture protected critical key material
-> manifest/checksums
-> restart Supabase
-> restart Godel
-> health validation
```

Preflight valida identificación del Git/upstream/image family, espacio suficiente, disponibilidad de custodia protegida y ausencia de una operación en curso. No reemplaza ni borra los datos originales.

### Contrato de fallo

Cualquier fallo marca el set como `INCOMPLETE`; nunca es candidato a restore. El runtime y los datos originales siguen siendo autoritativos y se reinician cuando sea seguro. Un fallo no autoriza borrar ni sustituir datos originales.

## Contrato de restore

### Preconditions

El restore requiere explícitamente: backup `COMPLETE`, checksums `PASS`, Git revision y upstream pin conocidos, Postgres compatible, secretos requeridos y material pgsodium disponibles, disco suficiente, QA target destructivo explícito, runtime detenido y una copia defensiva del estado QA previo.

### Orden principal conceptual

```text
stop runtime
-> prepare target
-> restore PGDATA
-> restore Storage bytes
-> prepare compatible db-config
-> restore required pgsodium key
-> start PostgreSQL
-> DB health
-> start Supabase
-> Supabase health
-> start Godel
-> live/ready
-> functional verification
```

`prepare compatible db-config` reconstruye la configuración version-coupled desde el bundle compatible y sólo restituye explícitamente la clave pgsodium protegida. Nunca restaura ciegamente el named volume completo `db-config`.

El rollback-of-restore se limita a un concepto defensivo para QA: antes de una prueba destructiva se preserva una copia identificada del estado QA previo. Si el drill falla, se restaura ese estado previo mediante un procedimiento autorizado posterior; SH-04.0 no implementa ni ejecuta rollback.

### Criterios de éxito del drill físico primary (SH-04.2)

| Gate | Resultado requerido |
| --- | --- |
| Backup integrity | PASS |
| DB fixture | PASS |
| Auth login | PASS |
| Storage metadata | PASS |
| Storage bytes | PASS |
| signed/download | PASS |
| application | PASS |
| `/api/health/live` | PASS |
| `/api/health/ready` | PASS |

El restore físico es el drill primary de SH-04.2. Este contrato no exige dos drills completos físico y lógico dentro de SH-04.

## Operaciones peligrosas y stop conditions

`docker compose down -v` es destructivo: puede eliminar named volumes, incluido `db-config`. `infra/supabase/reset.sh` es también destructivo: ejecuta `down -v` y elimina los bind mounts críticos `volumes/db/data` y `volumes/storage`. Ninguna de las dos operaciones forma parte de backup o restore y no se ejecuta en SH-04.0.

La implementación se detendrá antes de improvisar una política si aparece un mount persistente crítico adicional, material no regenerable adicional dentro de `db-config`, backend distinto de `file`, override activo que cambie la persistencia, migration 07, drift de 01–06, necesidad de cambiar Compose/vendor para recovery, o necesidad de leer/copiar secretos.

## Evidencia read-only SH-04.0 y handoff

La inspección runtime read-only del 2026-08-20 confirmó los once servicios Supabase healthy, los mounts declarados, los dos named volumes `supabase_db-config` y `supabase_deno-cache`, la ausencia de tmpfs Supabase y los tmpfs efímeros Godel. Confirmó asimismo que `/etc/postgresql-custom/pgsodium_root.key` existe con permisos `0640` y que PGDATA usa `0700`; no se leyó contenido de secretos ni variables de entorno. No surgió una stop condition: los ficheros adicionales visibles en `db-config` son configuración version-coupled, no evidencia de material no regenerable.

SH-04.0 queda `CLOSED / APPROVED`. SH-04.1 queda `READY / NEXT` y recibe este contrato para implementar el mecanismo de backup de forma revisable: validación previa, set/manifest/checksums, gestión de fallo y arranque seguro. Debe conservar estas fronteras aprobadas.

