# PPO-04M.5 — Managed Backup & Recovery Architecture

**Bloque:** `PPO-04M.5.0 — Managed Backup & Recovery Architecture Audit`

**Estado de M.5:** `ACTIVE / AUTH SCHEMA DRIFT DIAGNOSTIC`

**Estado de M.5.0:** `CLOSED / ARCHITECTURE APPROVED`

**M.5.1:** `CLOSED / LOCAL INTEGRATION APPROVED`

**M.5.2:** `CLOSED / FIRST PRODUCTION BACKUP + EXTERNAL CUSTODY VERIFIED`

**M.5.2.0:** `CLOSED / PRODUCTION BACKUP PREPARATION APPROVED`

**M.5.2.1A:** `CLOSED / R2 CUSTODY ADAPTER APPROVED`

**M.5.2.1B:** `CLOSED / R2 SYNTHETIC CUSTODY PASS`

**M.5.2.1C:** `CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS`

**M.5.2.1D:** `CLOSED / HARNESS CORRECTIONS VERIFIED`

**M.5.2.1E:** `CLOSED / FIRST PRODUCTION BACKUP VERIFIED`

**R2 REMOTE SYNTHETIC PROOF:** `PASS`

**M.5.3:** `ACTIVE / AUTH SCHEMA DRIFT DIAGNOSTIC`

**FIRST PRODUCTION BACKUP:** `COMPLETE`

**PRODUCTION RESTORE:** `NOT AUTHORIZED`

**REAL RESTORE TARGET:** `NOT REACHED BY REAL RESTORE ATTEMPTS #1-#2 / LOCAL TARGET COMPATIBILITY VERIFIED`

**LOCAL INTEGRATION:** `PASS`

**Fecha de auditoría:** 2026-09-22

**Fecha de corrección M.5.2.0:** 2026-09-23

**Git tooling correction baseline:** `9856f4c0e176bb1a920fd221ddbc38865b6258f3`

**Production runtime authority:** `01552f8bee59b5f9982a2d722e39795461918f43`

**Production pilot rollout:** `NOT EXECUTED`

## 1. Decisión ejecutiva

PPO-04M.5 es el gate mínimo de recuperación previo a introducir datos reales en
el piloto. No sustituye el workstream operativo completo PPO-06.

La arquitectura aprobable para implementar y probar en los siguientes
subbloques es:

```text
supabase/migrations/01–06 (autoridad de schema)
  + export lógico verificado de datos PostgreSQL/Auth
  + inventario y metadata durable de Storage
  + copia independiente de bytes Storage committed
  + snapshot no secreto de configuración
  + manifest interno, conteos y SHA-256
  -> bundle cifrado
  -> publicación atómica fuera de Supabase
  -> restore sobre un proyecto Supabase nuevo y compatible
```

Decisiones principales:

- `supabase/migrations/` 01–06 continúa como única autoridad primaria de schema.
- El mecanismo de base de datos será un export lógico explícito y verificable;
  un schema dump solo será evidencia secundaria, nunca la nueva baseline.
- La captura Auth debe conservar UUID, identidades y hashes de contraseña. No
  se recrearán usuarios por la Admin API con UUID nuevos.
- Metadata PostgreSQL de Storage y bytes de objetos son capas distintas y se
  respaldan por mecanismos distintos.
- Solo los objetos `committed` forman el recovery set de bytes. Cargas
  incompletas, reservadas, expiradas o canceladas no se restauran como objetos.
- Para M.5.1 se recomienda copia S3-compatible con credenciales dedicadas de
  backup, server-side y efímeras. No se activó S3 ni se crearon credenciales en
  este pase.
- El recovery usará las signing keys nuevas del proyecto destino. Se restauran
  usuarios y hashes, pero se exige reautenticación; no se promete continuidad
  de JWT ni refresh tokens anteriores al desastre.
- Ningún backup off-site sin cifrar es válido.
- No existe hoy una herramienta de cifrado auditada disponible en el host. La
  opción preferida para provisionar en M.5.1 es `age`, con recipient público en
  el operador y material de descifrado bajo custodia separada.
- El drill preferido de M.5.3 es un proyecto Supabase managed nuevo y
  desechable. Su cuota/coste debe autorizarse antes; no se asume un tercer
  proyecto Free.

Este pase no creó backup, no accedió a Production y no ejecutó restore.

## 2. Alcance, límites y fuentes

### 2.1 Alcance M.5 frente a PPO-06

```text
PPO-04M.5
= baseline reproducible mínima antes de datos reales

PPO-06
= automatización, scheduler, alertas, rotación avanzada, RPO/RTO formal,
  ejercicios recurrentes y operación DR continua
```

### 2.2 Autoridades auditadas

- `docs/production/PPO_04_MANAGED_FREE_PILOT_PLAN.md`
- `docs/production/PPO_ROADMAP.md`
- `docs/PROJECT_STATUS.md`
- `docs/production/SH_04_OPERATIONS_DESIGN.md`
- `docs/production/SH_04_BACKUP_QA_REPORT.md`
- `supabase/config.toml`
- `supabase/migrations/20260811131824_01_core_schema.sql` a
  `20260811131829_06_final_hardening.sql`
- `package.json` y `scripts/**`
- `docs/DATABASE_MODEL.md`, `docs/STORAGE_MODEL.md` y
  `docs/USERS_MANAGEMENT_MODEL.md`

SH-04 aporta principios de manifest, checksums, finalización atómica,
clasificación sensible y verificación. Quedan expresamente fuera del diseño
managed su copia física de PGDATA, tar del filesystem Storage, quiescing de
Docker, captura de `pgsodium_root.key`, scripts de restore self-hosted y
procedimientos Compose.

### 2.3 Fuentes oficiales vigentes

Revalidadas el 2026-09-21:

- [Database Backups](https://supabase.com/docs/guides/platform/backups): en Free
  Supabase recomienda export lógico periódico y custodia off-site; los backups
  DB no contienen los bytes de Storage.
- [Supabase CLI — `db dump`](https://supabase.com/docs/reference/cli/supabase-db-schema-declarative#supabase-db-dump):
  el dump por defecto omite datos, roles y schemas managed como `auth` y
  `storage`; los flags y artifacts deben ser explícitos.
- [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore):
  referencia oficial para artifacts separados de roles, schema, datos,
  migration history y consideraciones de schemas managed.
- [Download Objects](https://supabase.com/docs/guides/storage/management/download-objects):
  metadata y bytes son capas separadas; S3-compatible es la vía recomendada por
  el proveedor para volumen alto.
- [S3 Authentication](https://supabase.com/docs/guides/storage/s3/authentication):
  las access keys S3 son server-only, tienen acceso total a todos los buckets y
  omiten RLS.
- [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project):
  la restauración automática a proyecto nuevo es de pago, requiere backups
  físicos y sigue necesitando reconfiguración manual de Storage/Auth/Realtime y
  otros settings.
- [Migrating Auth Users Between Supabase Projects](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects):
  el schema Auth puede migrar usuarios y hashes; cambiar la autoridad JWT
  invalida access tokens previos.

No se congelan precios ni límites numéricos externos en este contrato.

## 3. Autoridad de schema y estrategia de reconstrucción

La baseline congelada contiene exactamente:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

```text
BASELINE 01–06 = FROZEN
```

El orden de recovery preferido es:

```text
crear/proveer target Supabase compatible
-> registrar y conciliar configuración de plataforma
-> aplicar migraciones aprobadas 01–06
-> restaurar datos durable PostgreSQL/Auth con triggers controlados
-> restaurar/reconciliar migration history
-> restaurar bytes Storage committed
-> verificar acuerdo metadata/bytes
-> configurar Vercel contra el target solo durante un drill autorizado
-> validar Auth, RLS, Storage y health
```

El schema dump adicional sirve para:

- inspección forense;
- detectar drift contra 01–06;
- registrar objetos provider-managed observados;
- ayudar a diagnosticar incompatibilidades de restore.

No se aplica como autoridad por encima de las migraciones. Cualquier drift que
obligue a editar 01–06 o convierta el dump remoto en la baseline es stop
condition.

## 4. Inventario de estado durable

### 4.1 Datos de aplicación: `public`

Las 18 tablas siguientes contienen datos de negocio, configuración de negocio,
trazabilidad o lifecycle y requieren captura lógica:

```text
perfiles
clientes
tipos_servicio
solicitudes
pedido_contadores
pedidos
pedido_trabajadores
pedido_tareas
archivos
archivo_carga_sesiones
archivo_carga_items
pedido_comentarios
pedido_historial
solicitud_comentarios
solicitud_historial
trabajo_plantillas
trabajo_plantilla_tareas
pedido_pagos
```

`perfiles.id` referencia `auth.users.id`; por tanto, Auth y `public` no pueden
recuperarse como dominios independientes ni reasignarse a UUID nuevos.

### 4.2 Datos privados: `private`

Las tablas siguientes son estado durable de auditoría y también se capturan:

```text
private.internal_user_creation_audit
private.internal_user_password_reset_audit
```

Las funciones, grants y objetos ejecutables de `private` se regeneran mediante
01–06. Los rows de auditoría se restauran como datos.

### 4.3 Auth

El recovery set Auth debe conservar como mínimo:

- `auth.users` con sus UUID y `encrypted_password`;
- `auth.identities` y relaciones provider/user;
- metadata necesaria para `raw_app_meta_data.godel_provisioning` y continuidad
  de `public.perfiles`;
- dependencias referenciales exigidas por la versión Auth del target.

La lista física de tablas Auth es provider/version-dependent. M.5.1 debe
inventariarla desde el export admitido por Supabase y fallar si no puede probar
que incluye usuarios, identidades, hashes y UUID exactos.

Sesiones, refresh tokens, códigos de un solo uso y estados de flujo no son
continuidad durable requerida. El contrato de recovery fuerza reautenticación.
M.5.1 debe demostrar con un mecanismo soportado que esos artifacts no reabren
sesiones previas; cambiar signing keys no se acepta como prueba suficiente para
refresh tokens restaurados.

### 4.4 Storage

Storage tiene dos capas distintas:

```text
PostgreSQL metadata
  storage.buckets
  storage.objects
  public.archivos
  public.archivo_carga_sesiones
  public.archivo_carga_items

Object bytes
  godel-files/<object path>
```

El bucket gobernante es `godel-files`, privado, con límite de 20 MiB y la
allowlist MIME fijada por la migración 04. La fila del bucket y sus policies se
regeneran desde Git; la metadata de objetos y las relaciones de negocio se
capturan como datos.

### 4.5 Historia de migraciones

`supabase_migrations` es necesaria como evidencia de convergencia, pero no es
autoridad de schema. El bundle registra versiones aplicadas, nombres y hashes
de los seis archivos. En recovery, aplicar 01–06 debe producir la historia
esperada; no se importa ciegamente una historia remota sobre un target ya
migrado.

Si la herramienta elegida necesita preservar filas adicionales de historia,
se capturan en un artifact separado y su restore debe ser idempotente y
verificado.

### 4.6 Plataforma y estado regenerable

| Estado | Tratamiento |
| --- | --- |
| Schemas/objetos Supabase base de `auth`, `storage`, `realtime`, `extensions` | Provisionados por el target compatible; no se reemplazan con DDL de otra versión. |
| Customizaciones Godel sobre `auth.users` y `storage.objects` | Regeneradas por 01–06 y verificadas después del restore. |
| `pgcrypto` en schema `extensions` | Extensión requerida; habilitar/verificar antes de 01–06. |
| Catálogos PostgreSQL, estadísticas, caches y logs | Regenerables; fuera del backup de datos. |
| Roles managed de Supabase | Provisionados por plataforma; no se recrean a ciegas desde otro proyecto. |
| Realtime/publications | La aplicación no tiene dependencia Realtime actual; snapshot debe registrar `none required`. |
| Edge Functions | No requeridas por el runtime actual. |
| Vault/column encryption/pgsodium de aplicación | No aparecen en 01–06; M.5.1 debe revalidar antes del primer backup. |

### 4.7 Matriz de clasificación PostgreSQL

| Clase | ¿Backup? | Captura candidata | Restore | Caveats |
| --- | --- | --- | --- | --- |
| Application data | Sí | Export lógico data-only explícito de `public` y `private` | Después de 01–06, en transacción y con triggers controlados | Preservar FKs, UUID, contadores, auditoría y orden; lifecycle transitorio requiere filtro/reconciliación. |
| Auth data | Sí | Export lógico managed conforme a la guía oficial | Restaurar UUID/identidades/hashes en target Auth compatible | No crear usuarios nuevos; exigir reauth y probar que tokens/sesiones previos fallan. |
| Storage metadata | Sí | Export lógico de metadata + inventario durable derivado | Reconciliar con bucket creado por 04 y con bytes restaurados | Metadata no contiene bytes; evitar conflicto/duplicado de `storage.buckets`. |
| Platform/regenerable | No como datos | Snapshot de nombres/versiones/settings | Provisionar y reconfigurar | No restaurar schemas/roles provider-managed de una versión incompatible. |
| Migration history | Sí como evidencia | Inventario separado de versiones/hashes; export solo si tooling lo necesita | Preferir historia generada al aplicar 01–06 | Nunca sustituye migraciones. |

## 5. Recomendación de backup PostgreSQL/Auth

M.5.1 debe implementar un wrapper fail-closed sobre la CLI del proyecto
Supabase `2.109.1` o una versión posterior explícitamente aprobada y fijada. El
flujo conceptual separa:

```text
database/roles.sql             # evidencia/roles no secretos, si aplica
database/schema-audit.sql      # secundario, nunca autoridad
database/data.sql              # datos explícitos, incluido Auth/Storage metadata
database/migration-history.*   # inventario separado
database/inventory.json        # tablas, conteos y assertions
```

Requisitos del wrapper:

- no depender de defaults de `supabase db dump`;
- registrar versión exacta de CLI y PostgreSQL client usado;
- inspeccionar el comando efectivo con dry-run cuando exista;
- afirmar la presencia esperada de datos `public`, `private`, `auth` y metadata
  `storage`, sin imprimir rows;
- excluir secrets, passwords de conexión, URLs completas y contenido del dump
  de stdout/logs;
- excluir o reconciliar de forma expresa `storage.buckets` para que la migración
  04 siga siendo la autoridad de configuración;
- tratar tablas Auth y Storage según la versión real del target, no mediante
  una allowlist histórica silenciosa;
- capturar conteos antes/después y fallar ante drift durante la ventana;
- comprobar que no existen objetos Vault/encrypted state no contemplados;
- preservar permisos mínimos definidos por 01–06, sin importar default grants
  más amplios del target.

Durante restore, la carga de datos debe ser transaccional y detenerse ante el
primer error. La estrategia debe controlar los triggers para impedir que la
inserción de `auth.users` reprovisione perfiles ya presentes; la guía oficial
usa `session_replication_role = replica`, pero M.5.1/M.5.3 deben verificar su
compatibilidad exacta y reactivar/validar todos los triggers al final.

## 6. Modelo de consistencia de Storage

### 6.1 Estados actuales

| Estado | Clasificación de bytes | Tratamiento de recovery |
| --- | --- | --- |
| Item `committed`, con `archivo_id`, fila `public.archivos` y `storage.objects` coherentes | `REQUIRED FOR RECOVERY` | Copiar bytes y metadata; verificar hash, tamaño y path. |
| Sesión `completed` | Durable como trazabilidad | Restaurar rows; todos sus items deben ser `committed`. |
| Sesión `partial` | Mixta | Restaurar únicamente la trazabilidad/relaciones de items committed que el diseño final pueda representar sin revivir pendientes; no copiar expirados. |
| Sesión `open` / item `reserved` | `TRANSIENT` | No restaurar como carga reanudable. Debe expirar/cancelarse o quedar fuera del dataset restaurado. |
| Sesión/item `expired` o `cancelled` | `TRANSIENT / REGENERABLE` | No copiar bytes. Conservar auditoría solo si no reabre capacidad ni sesión TUS. |
| Objeto sin relación committed completa | `UNEXPECTED RESIDUE` | Inventariar y fallar; no promover automáticamente al recovery set. |

El código no usa un estado literal `abandoned`; una carga abandonada se
manifiesta como reserva/open vencida hasta reconciliación y termina
`expired`/`partial`. No se presume durable.

### 6.2 Recovery set durable

Un objeto pertenece al recovery set solo si existe acuerdo exacto entre:

```text
archivo_carga_items.status = committed
AND archivo_carga_items.archivo_id = archivos.id
AND archivos.bucket = godel-files
AND archivos.file_path = archivo_carga_items.object_path
AND storage.objects.bucket_id/name coincide
AND el byte-object existe
```

El inventario interno por objeto registra, como mínimo, path, tamaño observado,
SHA-256 calculado sobre los bytes descargados y referencias de metadata. Como
contiene paths y potencial PII, vive dentro del bundle cifrado.

Gates de acuerdo:

```text
durable DB paths - copied byte paths = empty
copied byte paths - durable DB paths = empty
count(DB durable objects) = count(copied objects)
sum(DB/observed sizes) = sum(copied sizes), cuando metadata sea confiable
SHA-256(local captured bytes) = SHA-256(restored downloaded bytes)
```

Un ETag S3 no sustituye SHA-256 porque puede representar multipart u otra
semántica provider-specific.

### 6.3 Consistencia entre DB y bytes

Managed Supabase no ofrece en este diseño un snapshot transaccional único entre
PostgreSQL y object bytes. El pilot requiere una ventana operativa sin nuevas
mutaciones de DB/Auth/Storage:

```text
bloquear writers del piloto
-> esperar/finalizar o expirar uploads activos
-> inventario durable inicial
-> export DB/Auth/metadata
-> copiar bytes committed
-> inventario durable final
-> exigir inventarios inicial/final idénticos
```

Si no puede imponerse una ventana sin writes, o los inventarios difieren, el
backup queda `INCOMPLETE`. La automatización de consistencia continua pertenece
a PPO-06.

## 7. Evaluación de mecanismos para bytes Storage

| Opción | Completitud y RLS | Credenciales/autoridad | Madurez y volumen | Restore | Complejidad | Decisión |
| --- | --- | --- | --- | --- | --- | --- |
| A. `supabase storage cp` | Puede listar/copiar recursivamente el proyecto linked; la autoridad efectiva del CLI debe probarse. No se acepta depender de RLS de un usuario QA. | Token de operador Supabase/link local; nunca en browser/app/manifest. | Comandos marcados `--experimental`; aceptable para prototipo y fallback, menor confianza operativa. | Copia bidireccional posible; probar paths, metadata y errores parciales. | Baja, CLI ya instalada. | `FALLBACK / SPIKE M.5.1`. |
| B. S3-compatible bulk copy | Con access keys cubre todos los buckets y omite RLS; permite inventario completo. | Access key + secret dedicados, server-only, acceso total. Crear justo antes del job y revocar después. | Interfaz estándar; `rclone`/AWS CLI adecuados para volumen y retry. Herramientas no instaladas hoy. | Simétrica y eficiente; verificar no-overwrite, metadata y checksums. | Media; exige habilitación, credencial y tool pin. | `RECOMMENDED FOR M.5.1`. |
| C. Authenticated Storage API | Con JWT respeta RLS; las policies actuales no garantizan un inventario global de backup separado de permisos de negocio. Con service/secret authority omitiría RLS. | Requeriría identidad privilegiada dedicada o key server-only; no reutilizar `SUPABASE_SECRET_KEY` de la app. | API estable, pero exige paginación, retries, hashing y código propio. | Posible, con más código y superficie de fallo. | Alta. | `NOT PREFERRED`; fallback solo con decisión arquitectónica. |

La recomendación B no autoriza activar S3 ni crear keys en M.5.0. La key S3 es
equivalente a autoridad total sobre Storage, debe estar fuera de Git, browser,
runtime de aplicación, logs y manifest, y su lifecycle debe quedar auditado.

## 8. Modelo de privilegios

```text
QA BUSINESS AUTHORITY != BACKUP OPERATOR AUTHORITY
```

La identidad QA valida RLS y negocio. No es el operador DR. El operador de
backup puede necesitar:

- credencial de conexión PostgreSQL de backup/restore;
- token de operador de Supabase CLI/Management para acciones autorizadas;
- S3 access key/secret dedicados a la ventana de copia;
- recipient público de cifrado;
- acceso de escritura al destino externo;
- credencial de Vercel solo para snapshot/reconfiguración autorizada futura.

Solo se inventarían los nombres/clases siguientes, nunca valores:

```text
SUPABASE_BACKUP_DB_URL o componentes equivalentes
SUPABASE_BACKUP_DB_PASSWORD
SUPABASE_BACKUP_ACCESS_TOKEN
SUPABASE_BACKUP_PROJECT_REF
SUPABASE_BACKUP_S3_ACCESS_KEY_ID
SUPABASE_BACKUP_S3_SECRET_ACCESS_KEY
BACKUP_AGE_RECIPIENT
BACKUP_DESTINATION_CREDENTIAL
VERCEL_OPERATOR_TOKEN
```

Los nombres definitivos se fijarán en M.5.1. Ninguna credencial llega a browser,
runtime de aplicación, Git, manifest o logs. `SUPABASE_SECRET_KEY` permanece
restringida al adaptador Auth Admin existente y no se reutiliza para backup de
negocio o Storage. `SUPABASE_SERVICE_ROLE_KEY` no se introduce en la app.

## 9. Custodia de secretos y autoridad JWT

```text
DATA BACKUP != SECRET CUSTODY
```

Quedan fuera del bundle:

- database password y connection strings completas;
- Supabase access token;
- publishable/secret/service keys como valores;
- S3 secret/access key como valores;
- Vercel tokens y automation bypass secret;
- passwords QA o de usuarios;
- cookies, JWT y refresh tokens operativos;
- signing private material;
- clave privada/identity de descifrado.

El recovery crea nuevas API keys y nueva autoridad JWT en el proyecto destino.
Los usuarios conservan UUID, identidad y hash de contraseña, pero deben iniciar
sesión de nuevo. Los gates deben demostrar rechazo de access/refresh material
pre-recovery y login correcto con la contraseña existente.

Si se detectan secretos Vault, columnas cifradas o una dependencia funcional de
la signing authority antigua, se detiene M.5 y se abre una decisión explícita de
custodia; no se copia material criptográfico por inferencia.

## 10. Inventario de configuración reconstruible

### 10.1 Supabase

| Configuración | Autoridad conocida | Recovery |
| --- | --- | --- |
| Región | `us-east-1` / East US (North Virginia), según M.1 | Crear target en región compatible o registrar excepción aprobada. |
| Identidad de proyecto | Nombre/ref sanitizados; nunca URL/ref completa en evidencia pública | Manifest interno puede usar alias/hash sanitizado, no secret. |
| Auth Site URL | Alineada con el origen Production estable | Configuración manual/provider; snapshot no secreto. |
| Redirect allowlist | Sin redirects adicionales requeridos por el flujo actual | Registrar lista sanitizada/exacta dentro del bundle; reconfigurar. |
| Email/password | Habilitado | Configuración manual/provider. |
| Public signup | Deshabilitado | Configuración manual/provider y gate negativo. |
| Anonymous sign-in | Deshabilitado | Configuración manual/provider y gate negativo. |
| Bucket | `godel-files`, privado | Migración 04 + verificación provider. |
| File-size limit | `20971520` bytes | Migración 04 + verificación. |
| MIME allowlist | PDF, JPEG, PNG, WEBP, DOC, DOCX, ZIP, RAR y CDR según migración 04 | Migración 04 + comparación exacta. |
| Extensión requerida | `pgcrypto` en `extensions` | 01 + preflight/postcheck. |
| Realtime/publication | Ninguna requerida actualmente | Registrar explícitamente; no habilitar por inferencia. |
| Storage S3 protocol | Estado managed no auditado en M.5.0 | Decidir/habilitar solo en M.5.1; revocar keys tras uso. |
| Postgres major/provider versions | Local config solicita 17; versión managed exacta no se consultó aquí | Capturar versión real al ejecutar M.5.2 y exigir compatibilidad del target. |

La configuración local `supabase/config.toml` sirve para desarrollo, no prueba
la configuración managed. En particular, `[storage.s3_protocol].enabled = true`
local no significa que S3 esté activado en Production.

### 10.2 Vercel y runtime

Variables Production requeridas, solo por nombre:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

Variables ausentes por contrato:

```text
SUPABASE_SERVER_URL
SUPABASE_SERVICE_ROLE_KEY
```

El snapshot de configuración registra además:

- target/environment `production`;
- Deployment Protection `All Deployments`;
- Function Region `iad1`;
- branch de tooling `ops/managed-free-production-pilot`;
- Git tooling authority;
- Production runtime authority;
- nombres, scope y presencia de variables, nunca valores;
- dominio/origen mediante identificador sanitizado y condición `Site URL
  aligned`, no URL completa en evidencia pública.

La configuración del nuevo proyecto cambia los valores de las tres variables;
el nombre y boundary permanecen iguales. Un cambio de Vercel durante un drill
requiere autorización separada y rollback explícito; no forma parte de M.5.0.

## 11. Bundle versionado

Estructura conceptual:

```text
managed-backup-<backupId>/
  internal-manifest.json
  database/
    roles.sql
    schema-audit.sql
    data.sql
    migration-history.json
  storage/
    objects/
    object-inventory.json
  config/
    supabase-nonsecret.json
    vercel-nonsecret.json
  inventory/
    database-counts.json
    durable-state.json
    checksums.sha256
```

No todos los nombres internos quedan fijados hasta M.5.1, pero
`internal-manifest.json` usa una versión de schema y contiene:

```text
schemaVersion
backupId
createdAt UTC
toolingGitBranch
toolingGitSha
productionRuntimeSha
sanitizedSupabaseProjectIdentity
artifact inventory
artifact sizes
database table counts
Auth identity/user counts
Storage durable object count/bytes
file/object SHA-256
tool versions
configuration snapshot version
status COMPLETE | INCOMPLETE
```

Nunca contiene passwords, keys, tokens, cookies, connection strings completas,
JWT signing material ni el identity privado de cifrado.

El directorio conceptual se empaqueta y cifra como un único artifact. Puede
existir un receipt externo mínimo no sensible con `backupId`, hash y tamaño del
ciphertext, algoritmo/formato, timestamp y estado de publicación, sin paths de
objetos ni conteos sensibles si la política de destino no los protege.

## 12. Cifrado

```text
UNENCRYPTED OFF-SITE BACKUP = FORBIDDEN
```

El host auditado no tiene `age`, `gpg` ni `7z`. Tampoco tiene `rclone` o AWS
CLI. No se instalaron herramientas en M.5.0.

Recomendación para M.5.1:

- provisionar y fijar `age` como herramienta simple, mantenible y específica;
- cifrar para uno o más recipients públicos controlados por el operador;
- mantener identities privadas fuera del host de aplicación, repo, bundle y
  destino de datos;
- probar descifrado hacia un directorio temporal antes de aceptar el formato;
- calcular SHA-256 del ciphertext y verificarlo después de upload/download;
- no implementar criptografía propia en Node.

Si el destino elegido ofrece cifrado server-side, este es defense-in-depth y no
reemplaza el cifrado client-side del artifact. Si `age` no puede aprobarse,
M.5.1 debe reevaluar `gpg` o `7z` sin rebajar los requisitos de custodia.

## 13. Atomicidad y fallo cerrado

```text
preflight
-> staging privado
-> bloquear writers
-> reconciliar uploads
-> capture DB/Auth/metadata
-> capture Storage bytes
-> inventarios y conteos
-> SHA-256
-> validación cruzada
-> manifest COMPLETE
-> empaquetado y cifrado
-> verificación de descifrado/ciphertext
-> publicación temporal externa
-> verificación remota
-> promoción/rename final
```

Reglas:

- cualquier fallo produce `INCOMPLETE`;
- un artifact parcial nunca se publica con nombre final ni es recovery
  candidate;
- el nombre final solo aparece después de validar ciphertext y completar el
  cleanup del plaintext; la publicación externa sigue sin implementar;
- los artifacts plaintext existen solo en staging local con ACL restrictiva y
  se eliminan tras éxito o fallo controlado; no se promete secure erase sobre
  SSD;
- cleanup nunca elimina la única copia válida existente;
- logs solo contienen IDs, estados, conteos y errores sanitizados;
- el job verifica espacio antes de capturar y no sobrescribe un `backupId`.

## 14. Custodia externa, frecuencia y retención mínima

El destino se seleccionará antes de M.5.2. Debe ser:

- independiente de Supabase;
- fuera del repositorio, `test-results` y runtime de aplicación;
- accesible solo por operadores designados;
- capaz de almacenar el bundle ya cifrado;
- con capacidad suficiente y export/download verificable;
- capaz de preservar nombre/versión y comprobar integridad;
- preferiblemente con versionado, MFA y protección contra borrado accidental;
- operado desde una cuenta cuya recuperación no dependa solo de Supabase.

M.5.0 no selecciona Google Drive, OneDrive, S3, USB ni otro medio concreto.

Baseline del piloto:

```text
1 backup manual COMPLETE inmediatamente antes de M.6
+
al menos 1 backup COMPLETE por día mientras existan datos reales del piloto
+
backup manual antes de un cambio DB/configuración de riesgo
```

El rollout se pausa si el backup diario no puede producirse o verificarse. La
retención inicial propuesta es conservar el backup pre-pilot y un mínimo de
siete snapshots diarios cifrados; la automatización, rotación avanzada,
alertas, legal hold y RPO/RTO formal pertenecen a PPO-06. Dirección Técnica debe
aprobar capacidad y ventana operativa antes de M.5.2.

## 15. Opciones de target de recovery

| Criterio | A. Proyecto Supabase nuevo/desechable | B. Stack local Supabase desechable |
| --- | --- | --- |
| Fidelidad a Production | Alta: provider managed real | Media: emula servicios, no settings/operación managed completos |
| Coste/cuota | Puede requerir slot o gasto temporal; no se asume tercer Free | Sin cuota managed; usa Docker/recursos locales |
| Auth | Mejor prueba de compatibilidad managed, hashes y login | Útil para preflight; versiones pueden divergir |
| Storage | Prueba S3/API y comportamiento managed reales | Prueba bytes/metadata, no toda la configuración provider |
| Configuración | Permite probar Site URL, Auth, bucket y keys nuevos | No reproduce Dashboard/settings managed por completo |
| Riesgo destructivo | Bajo si la identidad del target es nueva y se verifica fail-closed | Bajo si el stack/directorios son nuevos y explícitos |
| Automatización | Más credenciales, coste y cleanup | Más simple para iterar localmente |

Decisión vigente para M.5.3:

```text
M.5.1 = pruebas locales y tooling sin Production
M.5.2 = primer backup Production autorizado + custodia externa
M.5.3 = restore drill sobre stack Supabase local nuevo, aislado y desechable
```

Dirección Técnica restringe este primer drill a un target local fresco, sin
vínculo con ningún proyecto remoto y creado exclusivamente para la ejecución.
La fidelidad sobre un target managed continúa siendo una mejora importante
posterior al piloto; no es requisito de cierre de este pase. El contrato exacto
del drill local y sus gaps están en
[PPO-04M.5.3 — Restore Drill Architecture Audit](PPO_04M53_RESTORE_DRILL_AUDIT.md).

## 16. Contrato de aceptación del restore

El drill M.5.3 solo puede iniciar con target identity nueva verificada y bundle
externo cifrado descargado. Debe demostrar:

### Integridad y schema

- manifest `COMPLETE`;
- hash del ciphertext `PASS`;
- descifrado `PASS`;
- todos los checksums internos `PASS`;
- artifacts y tamaños contra manifest `PASS`;
- migraciones exactas 01–06 `PASS`;
- hardening/assertions 06 `PASS`;
- migration history reconciliada `PASS`;
- no schema drift inesperado.

### Base y Auth

- conteos por tabla y fixtures de negocio `PASS`;
- relaciones/FKs y `pedido_contadores` `PASS`;
- UUID de cada usuario Auth esperado `PASS`;
- identidad y hash restaurados sin exponerlos `PASS`;
- login con credencial controlada posterior al recovery `PASS`;
- relación `auth.users.id = public.perfiles.id` `PASS`;
- access/refresh material pre-recovery rechazado o no migrado `PASS`;
- signup público y anonymous sign-in siguen deshabilitados;
- RLS/grants y roles `admin`, `supervisor`, `trabajador`, `anon` y
  `authenticated` conservan los negativos esperados.

### Storage

- bucket privado/configuración exacta `PASS`;
- metadata durable `PASS`;
- expected object count y total bytes `PASS`;
- conjunto de paths metadata/bytes exacto `PASS`;
- SHA-256 de cada objeto restaurado `PASS`;
- private download autorizado `PASS`;
- descarga/listado no autorizado `REJECTED`;
- ninguna sesión TUS/reserva incompleta queda utilizable;
- no existe unexpected residue.

### Aplicación y cierre

- `/api/health/live` `PASS`;
- `/api/health/ready` `PASS`;
- login y pantalla interna mínima `PASS`;
- consulta de fixture y descarga privada `PASS`;
- logs sin secretos ni errores inesperados;
- target de drill no confundido con Production;
- cleanup/retención del target según decisión autorizada;
- reporte sin PII ni valores secretos.

No es requisito preservar sesiones JWT anteriores al desastre.

## 17. Provider limitations que gobiernan el diseño

- Free no se trata como si incluyera el baseline off-site requerido; el
  proveedor recomienda exports propios y custodia externa.
- Un backup de base de datos contiene metadata Storage, no object bytes.
- Los bytes Storage necesitan backup y restore independientes.
- Restore-to-New-Project automático no puede asumirse en Free y, aun en paid,
  es database-only respecto a objetos/configuraciones adicionales.
- `supabase db dump` por defecto no captura datos ni schemas managed; Auth,
  Storage y migration history requieren tratamiento explícito.
- S3 access keys omiten RLS y tienen acceso total a Storage; solo pueden existir
  en el plano de operación server-side.
- Los comandos `supabase storage` exigen `--experimental` en la CLI auditada;
  no son la primera elección para el mecanismo estable.

Estas conclusiones se revalidarán al iniciar M.5.1/M.5.2 porque las capacidades
del proveedor pueden cambiar.

## 18. Subbloques y gates

```text
PPO-04M.5.0
= Backup & Recovery Architecture Audit
= CLOSED / ARCHITECTURE APPROVED

PPO-04M.5.1
= Managed Backup Tooling
= CLOSED / LOCAL INTEGRATION APPROVED

PPO-04M.5.2
= First Production Backup + External Custody
= CLOSED / FIRST PRODUCTION BACKUP + EXTERNAL CUSTODY VERIFIED

PPO-04M.5.2.0
= Production Backup & External Custody Preparation
= CLOSED / PRODUCTION BACKUP PREPARATION APPROVED

PPO-04M.5.2.1A
= Cloudflare R2 External Custody Adapter Preparation
= CLOSED / R2 CUSTODY ADAPTER APPROVED

PPO-04M.5.2.1B
= Cloudflare R2 Synthetic Remote Proof
= CLOSED / R2 SYNTHETIC CUSTODY PASS

PPO-04M.5.2.1C
= Production Age Recovery Identity Custody
= CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS

PPO-04M.5.2.1D
= First Production Backup Execution Harness
= CLOSED / HARNESS CORRECTIONS VERIFIED

PPO-04M.5.2.1E
= First Production Backup Execution
= CLOSED / FIRST PRODUCTION BACKUP VERIFIED

PPO-04M.5.3
= Restore Drill + Baseline Closure
= ACTIVE / AUTH SCHEMA DRIFT DIAGNOSTIC
```

M.6 no se abre hasta que M.5.3 esté cerrado/aprobado.

### M.5.1 — salida requerida y estado del primer pase

- wrapper de export/copia sin secrets en argv/logs;
- tests locales de manifest, checksum, failure e incomplete;
- selección/pin de `age` y herramienta S3-compatible;
- prueba de inclusión Auth y exclusión/invalidez de sesiones previas;
- filtro/reconciliación de lifecycle Storage transitorio;
- bundle cifrado reproducible con fixture local;
- runbook de credenciales efímeras y revocación;
- no acceso a Production salvo autorización posterior separada.

El primer pase implementa en `scripts/managed-backup/` el núcleo local y
fail-closed: manifest v1 cerrado, IDs no sensibles, escritura atómica,
contención de paths, SHA-256 streaming, runner sin shell y con environment
allowlisted, planes puros Supabase/S3, validadores Auth/Storage/configuración,
contrato externo `age`, discovery read-only y orquestación sintética del bundle.
Las pruebas usan únicamente directorios temporales y adapters fake; no producen
un backup real ni contactan proveedores.

La revisión arquitectónica posterior corrigió tres invariantes del core:

- cada intento fallido conserva fuera del staging un receipt atómico, reducido,
  no sensible y `INCOMPLETE`; el receipt sobrevive al cleanup y no contiene
  stderr, rows Auth ni object paths;
- un candidate cifrado verificado sólo recibe el nombre final después de que el
  cleanup del plaintext haya terminado; un fallo de cleanup conserva receipt,
  elimina candidates transitorios cuando es seguro y no publica final;
- los planes `rclone` construyen internamente `<remoteName>:<remotePath>` y
  rechazan backends/configuración/credenciales inline, además de operaciones
  destructivas. Las credenciales futuras quedan limitadas a environment
  allowlisted o configuración temporal protegida.

```text
DATABASE SECRET-SAFE TRANSPORT = LOCALLY PROVEN
STORAGE METADATA + BYTE RESTORE ORDER = LOCALLY PROVEN
AGE ENCRYPTION = LOCALLY PROVEN
RCLONE S3 = LOCALLY PROVEN
FINAL PUBLICATION ATOMICITY = APPROVED
LOCAL INTEGRATION = PASS
EXTERNAL CUSTODY DESTINATION = CLOUDFLARE R2 / SELECTED + SYNTHETICALLY VERIFIED
R2 REMOTE SYNTHETIC PROOF = PASS
FIRST PRODUCTION BACKUP = COMPLETE
```

La integración local real reconstruyó SOURCE y TARGET desde 01–06, conservó
UUID/hash Auth y login, restauró metadata antes de bytes, evitó duplicados en
`storage.objects` y verificó el mismo SHA-256 en SOURCE, captura y TARGET. El
cierre arquitectónico posterior aprobó esta evidencia y la atomicidad final de
publicación; M.5.1 queda cerrado.

### M.5.2 — salida requerida

- primer backup Production `COMPLETE`;
- cero mutaciones de negocio y ventana de writers documentada;
- copia cifrada fuera de Supabase;
- download y checksum externo `PASS`;
- credenciales temporales revocadas;
- plaintext staging eliminado;
- receipt y reporte sanitizados.

### M.5.3 — salida requerida

- target nuevo autorizado;
- restore reproducible completo;
- todos los gates de la sección 16 `PASS`;
- cleanup/retención del target decidido;
- M.5 cerrado por revisión arquitectónica.

### PPO-04M.5.3B.1 — Real-target contract corrections

Estas correcciones permitieron cerrar M.5.3B como `CLOSED / ISOLATED TARGET +
RESTORE TOOLING APPROVED`. El catálogo del target admite tablas internas legítimas
sin convertirlas en tablas mutables; status Supabase y discovery Docker pasan
por boundaries estrictos con secretos opacos; los planes post-restore son SQL
read-only ejecutable con parsers de agregados sanitizados; la continuidad Auth
incluye el UUID de cada identity; y transferencia/inventario de bytes usan sólo
el S3 local del target con credenciales en environment. Todas las pruebas de
este pase son sintéticas.

```text
PPO-04M.5.3B = CLOSED / ISOLATED TARGET + RESTORE TOOLING APPROVED
REAL LOCAL RESTORE DRILL = NOT AUTHORIZED
REMOTE ACTIVITY = 0
REAL TARGET STARTS = 0
TARGET MUTATIONS = 0
SQL EXECUTION = 0
REAL R2 READ = 0
REAL AGE DECRYPT = 0
```

### PPO-04M.5.3B.2 — Real Local Target Compatibility Harness

El comando dedicado `ops:restore:managed:target:local` queda implementado. Su
Attempt #1 alcanzó el start real del target y produjo un finding de
compatibilidad durante Docker DB discovery. Requiere confirmación transitoria, SHA de tooling declarado,
branch y worktree exactos, commit runtime Productivo localmente disponible,
Supabase CLI repo-local y Docker client/server. Materializa exclusivamente la
baseline 01–06 desde el objeto Git `01552f8bee59b5f9982a2d722e39795461918f43`,
arranca un target desechable con `--yes`, admite status y metadata Docker por
boundaries confidenciales, y permite sólo las seis consultas read-only de
compatibilidad. No existe ruta de restore dentro del executor.

La confirmación es
`GODEL_MANAGED_RECOVERY_LOCAL_TARGET_CONFIRM=ALLOW_DISPOSABLE_LOCAL_RECOVERY_TARGET`.
La autoridad no secreta `GODEL_MANAGED_RECOVERY_LOCAL_TARGET_TOOLING_SHA` debe
coincidir exactamente con el `git rev-parse HEAD` limpio en el momento de la
ejecución; no se intenta fijar el SHA dentro de su propio commit.

El cleanup futuro está ordenado como stop del project ID exacto, verificación
de ausencia de recursos Docker propios, limpieza de `session.target` y cleanup
de la sesión. La evidencia pública omite IDs, containers, ports, URLs, paths,
config runtime, SQL y catálogo completo.

El contrato corregido resuelve la DB por igualdad exacta con
`supabase_db_<projectId>` dentro del discovery limitado por
`com.supabase.cli.project=<projectId>`. El candidato exige además
`com.docker.compose.project=<projectId>`; las service labels son opcionales y,
si aparecen, deben ser exactamente `db`.

Todos los comandos Git gobernados de preflight y runtime usan una primitive
compartida. La primitive normaliza internamente el `repoRoot`, descarta
configuración Git y secretos ambientales, deshabilita prompts y configuración
system-level, reinicia la lista efectiva de `safe.directory` en command scope y
confía exclusivamente en el repo gobernado exacto. No usa wildcard, no escribe
configuración persistente y el path no forma parte de evidencia pública ni argv.

La consulta gobernada de extensiones no inventaría el catálogo global. Filtra
exclusivamente `pgcrypto`, la extensión requerida por la baseline actual. Query,
parser y validación derivan de `REQUIRED_TARGET_EXTENSIONS`; salida vacía es
evidencia bien formada de ausencia y cualquier nombre adicional es imposible
para el query gobernado, por lo que falla cerrado.

#### Attempt #1 — evidencia sanitizada

```text
PPO-04M.5.3B.2 ATTEMPT #1 = FAIL / COMPATIBILITY FINDING
FAILURE CODE = RECOVERY_TARGET_DB_CONTAINER_AMBIGUOUS
ROOT CAUSE = SYNTHETIC SERVICE-LABEL ASSUMPTION DID NOT MATCH SUPABASE CLI 2.109.1
REAL TARGET START = REACHED
CLEANUP FAILURE DETECTED = NO
RESTORE SQL = 0
R2 READ = 0
AGE DECRYPT = 0
PRODUCTION MUTATIONS = 0
RETRIES = 0
```

No se registran project ID, nombres o IDs Docker, puertos, URLs, paths,
stdout/stderr raw ni secretos. La ausencia de un error de cleanup no se
reinterpreta como `targetCleanup = PASS`.

#### Attempt #2 — evidencia sanitizada

```text
PPO-04M.5.3B.2 ATTEMPT #2 = FAIL / GIT PREFLIGHT ENVIRONMENT FINDING
FAILURE CODE = COMMAND_FAILED
FAILURE OPERATION = resolve local recovery tooling branch
EXIT CODE = 128
LAST PHASE = PREFLIGHT / GIT AUTHORITY
ROOT CAUSE = MINIMAL RECOVERY GIT ENVIRONMENT DID NOT CARRY THE EFFECTIVE PROTECTED SAFE.DIRECTORY AUTHORITY
REAL TARGET STARTS DURING ATTEMPT #2 = 0
SUPABASE TARGET OPERATIONS = 0
DOCKER TARGET OPERATIONS = 0
SQL EXECUTIONS = 0
R2 READ = 0
AGE DECRYPT = 0
PRODUCTION MUTATIONS = 0
ATTEMPT #2 RETRIES = 0
```

No se registran repo path, path de `safe.directory`, stderr raw, usuario local,
ownership metadata ni valores del environment. La corrección queda pendiente de
revisión arquitectónica.

#### Attempt #3 — evidencia sanitizada

```text
PPO-04M.5.3B.2 ATTEMPT #3 = FAIL / OPERATOR DOCKER EXECUTION CONTEXT FINDING
RESTORE SQL = 0
R2 READ = 0
AGE DECRYPT = 0
PRODUCTION MUTATIONS = 0
RETRIES = 0
```

El finding se limitó al contexto operativo local de Docker. No se registran
versiones, nombres o IDs Docker, rutas, puertos, URLs ni stdout/stderr raw.

#### Attempt #4 — evidencia sanitizada

```text
PPO-04M.5.3B.2 ATTEMPT #4 = FAIL / EXTENSION ADMISSION CONTRACT FINDING
FAILURE CODE = LOCAL_RECOVERY_EXTENSION_OUTPUT_INVALID
LAST PHASE = TARGET BASELINE OUTPUT VALIDATION
REAL TARGET STARTS DURING ATTEMPT #4 = 1
TARGET ISOLATION = REACHED BEFORE FAILURE
BASELINE READ-ONLY QUERIES = 6 EXECUTED
ROOT CAUSE = THE REQUIRED-EXTENSION QUERY RETURNED THE COMPLETE PG_EXTENSION SET WHILE ITS OUTPUT CONTRACT ACCEPTED ONLY SQL-IDENTIFIER-SHAPED NAMES
RESTORE SQL = 0
R2 READ = 0
AGE DECRYPT = 0
PRODUCTION MUTATIONS = 0
CLEANUP FAILURE DETECTED = NO
ATTEMPT #4 RETRIES = 0
```

No se registra el output raw ni se atribuye el fallo a una extensión concreta.
PostgreSQL/Supabase admite nombres fuera de la forma aceptada por el parser
anterior, pero esa observación técnica no identifica la línea real del Attempt.

#### Attempt #5 — evidencia sanitizada aprobada

El SHA `77cd7f7233e2b417a2c62e8147f57389c0704112` queda congelado como
`PPO-04M.5.3B.2 TESTED TOOLING SHA`. La ejecución real posterior al finding de
extensiones produjo exclusivamente la siguiente evidencia pública:

```json
{
  "status": "PASS",
  "operation": "real-local-target-compatibility",
  "runtimeAuthority": "VERIFIED",
  "targetIsolation": "VERIFIED",
  "baselineMigrationCount": 6,
  "schemasVerified": true,
  "requiredExtensionsVerified": true,
  "privateBucketVerified": true,
  "targetCatalogVerified": true,
  "replicationRole": "origin",
  "realTargetStarts": 1,
  "targetMutations": 0,
  "sqlMutations": 0,
  "remoteActivity": 0,
  "targetCleanup": "PASS"
}
```

```text
PPO-04M.5.3B = CLOSED / ISOLATED TARGET + RESTORE TOOLING APPROVED
PPO-04M.5.3B.2 = CLOSED / REAL LOCAL TARGET COMPATIBILITY VERIFIED
REAL RESTORE = NOT AUTHORIZED
REAL R2 READ = NOT AUTHORIZED
REAL AGE DECRYPT = NOT AUTHORIZED
```

Para Storage no vacío, `rclone lsjson --hash` no garantiza SHA-256 en un
backend S3. Antes del primer recovery con objetos reales debe diseñarse y
probarse una verificación independiente del hash nativo, por ejemplo una
operación gobernada equivalente a `rclone hashsum sha256 --download`.

```text
REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY
```

### PPO-04M.5.3C.1 — End-to-End Real Product Backup Local Restore Drill Orchestrator

El comando deliberadamente explícito `ops:restore:managed:drill:local` compone
el source verifier de M.5.3A y el target/restore tooling de M.5.3B dentro de una
única `RecoverySession`. Su ejecución requiere confirmación one-shot, backup
seleccionado y autoridad exacta del HEAD limpio. El adapter age sólo expone
`decryptToTar`, consume la identity mediante el handle opaco existente y deja
la inspección/extracción segura al verifier de M.5.3A.

El executor y el baseline gate de B.2 quedaron factorizados en primitives
reusables con handles opacos. Antes de la única transacción mutante se repiten
status, discovery Docker e isolation. Sólo `managed-data.sql` puede llegar a
`psql --single-transaction`; roles, schema e historia permanecen audit-only.
El restore de bytes exige el gate de metadata consultado al target. Mientras
`TD-BACKUP-004` siga abierta, cualquier Storage no vacío falla cerrado; el caso
vacío sigue ejecutando inventario read-only S3 local.

La validación completa de DB/Auth/Storage ocurre antes del login. El login usa
credenciales ocultas, interactivas y sólo en memoria, un cliente local sin
persistencia ni refresh, y una expectativa opaca de IDs restaurados. El cleanup
del target precede al cleanup integral de la sesión; cualquier fallo de cleanup
invalida el resultado. Las suites de C.1 son sintéticas: no contactaron R2, no
usaron la identity real, no arrancaron Docker/Supabase y no ejecutaron SQL ni
login reales. C.1.1 sustituyó los límites sintéticos por directorios reales
gobernados explícitamente por el operador, eliminó `TRUNCATE CASCADE` y exige
un set de truncado explícito. La validación post-restore incluye ahora catálogo
FK gobernado, comprobación read-only de integridad referencial y estado operativo
de los constraint triggers, sin publicar identidades de relaciones. El reader
oculto conserva UTF-8 exacto y el contador de arranques sólo aumenta tras un
start exitoso.

```text
PPO-04M.5.3C.0 = CLOSED / REAL RESTORE EXECUTION CONTRACT APPROVED
PPO-04M.5.3C.1.1 = CLOSED / RESTORE MUTATION + BOUNDARY HARDENING APPROVED
PPO-04M.5.3C.1 = CLOSED / REAL RESTORE ORCHESTRATOR TOOLING APPROVED
PPO-04M.5.3C.1 APPROVED TOOLING SHA = 5e257838cdf73df1a3f07d3473b6d65bf5f4595c
PPO-04M.5.3D.0 = CLOSED / VALIDATION + BASELINE CLOSURE CONTRACT APPROVED
PPO-04M.5.3D.1 = CLOSED / RECOVERY APPLICATION VALIDATION TOOLING APPROVED
PPO-04M.5.3D.1 APPROVED TOOLING SHA = 0b8ab995221c7fedde28f5567831810e13085eaf
PPO-04M.5.3D.1.1 = CLOSED / APPLICATION RUNTIME AUTHORITY CORRECTION APPROVED
PPO-04M.5.3D.2 = CLOSED / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED
PPO-04M.5.3D.2.1 = REAL-ENVIRONMENT CORRECTION VERIFIED BY ATTEMPT #2
PPO-04M.5.3D.2.2 = CLOSED / HEALTH DIAGNOSTIC + COLD-START HARDENING APPROVED
PPO-04M.5.3D.2.3 = REAL-ENVIRONMENT DIAGNOSTIC VERIFIED BY ATTEMPT #4
PPO-04M.5.3D.2.4 = REAL-ENVIRONMENT MOUNT + TOPOLOGY PATH VERIFIED / LIVE 5XX PERSISTS
PPO-04M.5.3D.2.5 = REAL-ENVIRONMENT REQUEST-SCOPED DIAGNOSTIC VERIFIED BY ATTEMPT #6
PPO-04M.5.3D.2.6 = REAL-ENVIRONMENT SAFE TAXONOMY VERIFIED BY ATTEMPT #7
PPO-04M.5.3D.2.7 = CLOSED / REAL-ENVIRONMENT PRODUCT DEFAULT DISTDIR VERIFIED / NOT CAUSAL FOR THE LIVE FAILURE / ARCHITECTURAL FIDELITY IMPROVEMENT RETAINED
PPO-04M.5.3D.2.8 = CLOSED / WINDOWS SAME-VOLUME APPLICATION RUNTIME TOPOLOGY / REAL-ENVIRONMENT VERIFIED BY ATTEMPT #9
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #1 = FAIL / APPLICATION PROCESS SHUTDOWN LIFECYCLE FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #2 = FAIL / APPLICATION HEALTH GATE DIAGNOSTIC FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #3 = FAIL / LIVE ROUTE RESPONSE DIAGNOSTIC FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #4 = FAIL / TEMPORARY RUNTIME DEPENDENCY RESOLUTION FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #5 = FAIL / LIVE 5XX WITH ACCUMULATED MODULE-RESOLUTION DIAGNOSTIC
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #6 = FAIL / REQUEST-SCOPED MODULE RESOLUTION / SAFE TAXONOMY INSUFFICIENT
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #7 = FAIL / REQUEST-SCOPED RELATIVE IMPORT RESOLUTION FINDING
REAL LOCAL APPLICATION COMPATIBILITY ATTEMPT #8 = FAIL / RELATIVE IMPORT PERSISTS AFTER PRODUCT DISTDIR CORRECTION
PPO-04M.5.3D.2 ATTEMPT #9 = PASS / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED
PPO-04M.5.3 = ACTIVE / ROLES DIALECT REMEDIATION
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
REAL BACKUP RESTORE EXECUTION = NOT AUTHORIZED
PRODUCTION RESTORE = NOT AUTHORIZED
REAL R2 READS DURING C.1 = 0
REAL AGE DECRYPTS DURING C.1 = 0
REAL TARGET STARTS DURING C.1 = 0
REAL SQL EXECUTIONS DURING C.1 = 0
REAL TARGET MUTATIONS DURING C.1 = 0
REAL LOGIN ATTEMPTS DURING C.1 = 0
PRODUCTION ACTIVITY DURING C.1 = 0
```

### PPO-04M.5.3D.1 — Recovery Application Validation + Baseline Closure Tooling

El mismo comando one-shot `ops:restore:managed:drill:local` incorpora una capa
final de aplicación después de DB/Auth/Storage/FK y del login Auth directo. Antes
del arranque compara por Git protegido y byte-exact `src/`, `public/`,
configuración Next/TypeScript/PostCSS, `next-env.d.ts` y `package-lock.json`
entre `manifest.productionRuntimeSha` y el HEAD autorizado. No compara docs ni el
tooling de recovery, no hace checkout/fetch y falla cerrado ante cualquier drift.

La corrección D.1.1 separa `package.json` del diff byte-exact. Git lee el blob
desde cada SHA autorizado y compara estructuralmente todos sus campos salvo
`scripts`; sólo ese drift operacional queda excluido. Dependencias,
devDependencies y cualquier campo top-level presente o futuro conservan
autoridad exacta. `package-lock.json` permanece byte-exact. El handle opaco PASS
demuestra conjuntamente el árbol byte-exact, los campos runtime del manifest y
el lock exacto, sin publicar diferencias de scripts.

Para no escribir en `<repo>/.next`, el runtime materializa exclusivamente los
archivos tracked gobernados en `session.evidence/application-runtime/source` y
escribe allí el `package.json` exacto de Production runtime, nunca el manifest
actual con tooling operacional. Next arranca programáticamente sobre esa copia.
`distDir`, temporales y cache
quedan dentro de la misma evidencia de sesión; la versión repo-local de Next se
admite sintéticamente sólo si conserva el override. El proceso escucha en
`127.0.0.1` y puerto dinámico, recibe por IPC un contrato acotado y usa un
environment allowlisted con las tres variables Supabase locales públicas/server
y el mínimo de plataforma. No hereda configuración Production, credenciales R2,
identity age, password DB, backup ID ni credenciales de login.

Los gates exigen respuestas exactas de live/ready sin redirects. Un Chromium
programático, con dependencia inyectable y sin runner, artefactos ni estado
persistente, reutiliza una sola vez la misma credencial interactiva en memoria.
Admite dashboard o cambio inicial de contraseña, exige una superficie `main`
visible y comprueba en un contexto nuevo que `/dashboard` termina en `/login`.
Todas las requests se bloquean salvo los dos origins loopback exactos de la app
y del target Supabase recuperado.

La autoridad `RLS_GRANT_BASELINE_AUTHORITY = VERIFIED` se deriva de baseline
01–06 exacta, auditoría `AUDIT_ONLY` de roles/schema/history y restore data-only
bajo una única transacción; no declara una reejecución de la matriz completa de
roles. Para el backup actual, Storage vacío conserva
`privateDownload = NOT_EXERCISED_EMPTY_STORAGE`: no se crea ningún objeto y
`TD-BACKUP-004` sigue requerido antes del primer recovery con Storage no vacío.

El cleanup ordena browser, app/puerto, target y source/session. Se intentan todos
los niveles y la precedencia exacta es source/session > target > app > fallo
primario. La evidencia PASS es fija y sanitizada; no contiene PII, URLs, puertos,
paths, UUIDs, tokens ni keys.

```text
RLS_GRANT_BASELINE_AUTHORITY = VERIFIED BY SYNTHETIC CONTRACT
TD-BACKUP-004 = OPEN
PRIVATE DOWNLOAD = NOT EXERCISED IN EMPTY-STORAGE DRILL / IMPORTANT AFTER PILOT
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
PPO-04M.5.3D.1 = CLOSED / RECOVERY APPLICATION VALIDATION TOOLING APPROVED
PPO-04M.5.3D.1 APPROVED TOOLING SHA = 0b8ab995221c7fedde28f5567831810e13085eaf
PPO-04M.5.3D.1.1 = CLOSED / APPLICATION RUNTIME AUTHORITY CORRECTION APPROVED
BYTE-EXACT APP RUNTIME AUTHORITY = RETAINED FOR APPLICATION SOURCE / CONFIG / PACKAGE LOCK
PACKAGE.JSON SCRIPTS-ONLY OPERATIONAL DRIFT = SEMANTICALLY EXCLUDED
PACKAGE.JSON NON-SCRIPT FIELDS = EXACT AUTHORITY
TEMPORARY APP PACKAGE.JSON = PRODUCTION RUNTIME AUTHORITY
REAL_SHA_APP_RUNTIME_AUTHORITY = PASS
REAL R2 READS DURING D.1 = 0
REAL AGE DECRYPTS DURING D.1 = 0
REAL TARGET STARTS DURING D.1 = 0
REAL SQL EXECUTIONS DURING D.1 = 0
REAL TARGET MUTATIONS DURING D.1 = 0
REAL APP STARTS DURING D.1 = 0
REAL LOGIN ATTEMPTS DURING D.1 = 0
PRODUCTION ACTIVITY DURING D.1 = 0
```

### PPO-04M.5.3D.2 — Real Local Recovery Application Compatibility Harness

El comando separado `ops:restore:managed:app:local` prepara una RecoverySession,
reutiliza el target disposable y el baseline read-only de B.2, verifica la
autoridad runtime D.1 y coordina Next y Playwright reales sin incorporar ninguna
operación de restore. Su preflight exige confirmación y SHA exactos, branch y
worktree gobernados, commit Productivo disponible, Supabase CLI repo-local y
Docker client/server bajo environment local allowlisted. Las confirmaciones de
backup Productivo, writer freeze, QA mutante y restore real son incompatibles.

La aplicación sólo puede arrancar mediante `startLocalRecoveryApp`, escribir su
source/dist/cache/temp bajo `session.evidence` y alcanzar el Auth local mediante
`/api/health/ready`. El smoke D.2 no recibe credenciales: comprueba los controles
visibles de `/login` y, en otro contexto anónimo limpio, exige que `/dashboard`
termine exactamente en `/login`. La allowlist de navegador admite únicamente los
origins loopback de la aplicación y del Supabase disposable. Esta evidencia no
afirma aislamiento universal del egress server-side.

El cleanup se intenta en orden browser, aplicación, target y sesión; la
precedencia de fallo es sesión > target > aplicación > browser > fallo primario.
Los primitives existentes verifican puerto cerrado, ausencia de containers,
volumes y networks propios, y ausencia del root de sesión. La implementación
inicial se validó con pruebas sintéticas antes de autorizar Attempt #1. La
corrección D.2.1 se validó sintéticamente antes de Attempt #2; ese intento real
verificó después el lifecycle de shutdown por precedencia. D.2.2 vuelve a
limitarse a tests sintéticos y no arranca Docker, Supabase, Next ni Chromium ni
efectúa restore SQL, R2, age o actividad Production.

Attempt #1 detectó una insuficiencia en el lifecycle de terminación del proceso:
el ACK de stop no garantizaba por sí solo el exit real del worker. La corrección
D.2.1 mantiene el cierre graceful de HTTP y Next, espera el callback del mensaje
IPC terminal, desconecta IPC y termina explícitamente con el exit code fijo. El
parent conserva los tres gates independientes: ACK terminal, exit real y puerto
cerrado. Un kill de emergencia nunca produce PASS. Los fallos públicos fijos
`RECOVERY_APP_SHUTDOWN_CLOSE_FAILED`, `RECOVERY_APP_SHUTDOWN_EXIT_FAILED` y
`RECOVERY_APP_SHUTDOWN_PORT_OPEN` pertenecen exclusivamente a `APP_CLEANUP`.

La evidencia sanitizada de Attempt #1 no permite determinar si algún gate
primario anterior alcanzó PASS ni distingue entre fallo de close y falta de exit.
Por ello no se atribuye el hallazgo a `nextApp.close()` ni se declaran health,
ready o browser como PASS.

Attempt #2 mantuvo como resultado público el fallo primario
`RECOVERY_APP_HEALTH_FAILED` en `APP_HEALTH`. Por la precedencia fail-closed, la
ausencia de un resultado de cleanup demuestra exclusivamente `NO CLEANUP FAILURE
DETECTED BY PRECEDENCE`; no constituye observación independiente de cada cierre.
Esto verifica en entorno real la corrección D.2.1 de ACK, exit y puerto. Browser
no fue alcanzado. La evidencia no permite determinar si falló live o ready, ni
atribuir causa a cold compilation de Next o a Supabase Auth.

D.2.2 introduce un gate read-only directo a `/auth/v1/health` usando solamente
el handle opaco del target local, una request, redirect manual y timeout de 10
segundos. Después separa `APP_LIVE` y `APP_READY`, con una request por endpoint,
timeout exterior de 120 segundos para la compilación lazy del runtime recovery y
cuatro códigos públicos fijos que distinguen request de respuesta. No modifica
las rutas health del runtime Productivo ni reintenta 503. El restore real adopta
la misma observabilidad sobre su `freshStatus` local, después de validar Auth y
antes de arrancar la aplicación.

Attempt #3 alcanzó `APP_LIVE` y completó la request, pero su código histórico
`RECOVERY_APP_LIVE_RESPONSE_INVALID` no distingue redirect, 404, otros 4xx,
5xx ni body inválido. D.2.3 introduce esas clases de forma simétrica para live
y ready. Un 5xx puede refinarse mediante un enum fijo obtenido internamente del
buffer de proceso privado, acotado y redactado: module resolution, compile,
runtime o unclassified. El buffer, sus paths y el body non-200 nunca se exponen.

Attempt #4 verificó el diagnóstico D.2.3: la request live recibió un 5xx
clasificado como `MODULE_RESOLUTION_FAILURE`, con el fallo público fijo
`RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED` en `APP_LIVE`. La aplicación ya
había arrancado y Auth local había pasado por progresión; ready y browser no se
alcanzaron. No hubo restore SQL, lecturas R2, decrypts age ni mutaciones
Productivas.

D.2.4 proporciona al proyecto temporal una topología Node normal sin alterar
Webpack ni el runtime Productivo: valida `repoRoot/node_modules` como directorio
real exacto y crea `projectDir/node_modules` mediante junction absoluta de Node
en Windows o symlink de directorio en POSIX. El handle público es opaco, no
expone paths y `NODE_PATH` se conserva sólo como autoridad auxiliar. Antes de
`next()`, el worker exige igualdad exacta entre los realpaths del mount y de
`NODE_PATH`, además de mantener los checks de `next`, `react` y `react-dom`.

El mount se crea antes de reservar puerto o iniciar el worker. Todo fallo
posterior intenta primero el cleanup del proceso aplicable y después desmonta el
enlace exacto. El cierre normal prueba exit, puerto cerrado, mount ausente y
supervivencia intacta de la autoridad fuente antes de permitir PASS. Un fallo de
unmount produce `RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED`; nunca se ejecuta un
borrado amplio, copia de dependencies o mutación del `node_modules` fuente. Así,
`cleanupRecoverySession()` conserva sin cambios su prohibición de symlinks y
reparse points inesperados.

Attempt #5 atravesó la creación del mount, la verificación de topología del
worker y el arranque de Next, pero volvió a obtener un live 5xx. Por tanto D.2.4
queda verificada como path de mount/topology, no como solución causal del 5xx. El
código `RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED` de ese intento procedía
del buffer completo acumulado y no constituye un diagnóstico request-scoped.

D.2.5 mantiene un stream privado de eventos diagnósticos secuenciados y
acotados a aproximadamente 8 KiB. Cada chunk se redacta y normaliza antes de
derivar un evento que sólo conserva señales y enums seguros; no se almacenan
texto diagnóstico, specifiers, rutas ni stacks. Los handles
de checkpoint son opacos, pertenecen a una sola app y capturan únicamente la
secuencia. Live y ready crean uno antes de su única request y, sólo ante 5xx,
esperan quiet local de 50 ms con máximo de 1000 ms antes de clasificar eventos
posteriores. No cambia el timeout HTTP de 120 segundos, no reintenta y no lee el
body non-200.

Attempt #6 devolvió `RECOVERY_APP_LIVE_MODULE_UNKNOWN_FAILED` en `APP_LIVE`
después del checkpoint. Verifica el boundary request-scoped de D.2.5, pero no
demuestra dependency faltante, alias roto, junction rota, ruta absoluta, loader
request, fallo interno de Next ni otra causa concreta.

D.2.6 publica sólo una categoría fija: `PROJECT_ALIAS`, `RELATIVE_IMPORT`,
`NEXT_INTERNAL`, `DECLARED_PACKAGE`, `OTHER_BARE_PACKAGE`, `NODE_BUILTIN`,
`ABSOLUTE_PATH`, `REDACTED_PATH`, `LOADER_REQUEST`, `UNPARSED`, `MIXED` o
`UNKNOWN`. Un marker sin specifier extraíble es `UNPARSED`; categorías distintas
dentro del boundary son `MIXED`; `UNKNOWN` queda como fallback defensivo de un
specifier extraído no clasificable. La pertenencia declarada deriva
exclusivamente de dependencies/devDependencies del `package.json` Productivo
ya admitido. Los códigos live/ready resultantes están en las allowlists estrictas
de D.2 y del restore real; los códigos genéricos anteriores se retienen por
compatibilidad.

Attempt #7 devolvió `RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED` en
`APP_LIVE`. La progresión verifica en entorno real la taxonomía segura de D.2.6,
el target, Auth health, el mount y su topología, el arranque de la aplicación y
la ejecución de la request live. El specifier concreto no fue expuesto y la
causa concreta no está probada.

D.2.7 elimina una divergencia arquitectónica observada, sin atribuirle todavía
causalidad sobre el fallo: el Product usa el `distDir` por defecto `.next` y su
`tsconfig.json` referencia `.next/types` y `.next/dev/types`, mientras el
recovery forzaba programáticamente `.next-recovery`. El runtime disposable usa
ahora exactamente `projectDir/.next` dentro de RecoverySession, no precrea ese
directorio y falla cerrado si ya existe antes de arrancar. La invocación de
Next conserva `dir = projectDir`, `dev`, host/puerto, `quiet` y `webpack: true`,
pero ya no pasa `conf.distDir`.

Inmediatamente después de `prepare()`, el worker exige que `.next` sea un
directorio real, no symlink/reparse point, con realpath exacto y contenido en el
proyecto temporal. Si `next-env.d.ts` existe, lo valida como archivo regular no
enlazado, con lectura acotada a 16 KiB; sus imports relativos de tipos generados
deben resolver dentro de `.next`. No se publican contenidos, targets ni paths.
La ausencia de `next-env.d.ts` se acepta como `NOT_OBSERVED`. TEMP/TMP, el mount
de `node_modules`, `NODE_PATH`, la autoridad Productiva byte-exact y el cleanup
de RecoverySession permanecen sin cambios. Una divergencia del runtime generado
falla con `RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH` o
`RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH`, ambos admitidos exclusivamente
en `APP_START` y sin publicar contenido generado, targets ni paths.

Attempt #8 alcanzó de nuevo `APP_LIVE` y devolvió
`RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED`. Esto verifica por progresión
el `distDir` Productivo por defecto y el boundary post-prepare de `.next` en el
entorno real. D.2.7 se conserva como mejora de fidelidad arquitectónica, pero no
fue causal; el specifier relativo concreto sigue sin exponerse.

La hipótesis primaria de D.2.8 es la construcción cross-volume de la entrada
App Router en Windows. Next 16.2.11 deriva `NEXT_PROJECT_ROOT` del `__dirname`
del paquete Next físico, deriva de ahí `NEXT_PROJECT_ROOT_DIST_CLIENT` y, en
development con App Router + webpack, construye la entrada mediante
`"./" + path.relative(dir, .../app-next-dev.js)`. Una aplicación y la autoridad
Next física en unidades o shares UNC distintos no producen una ruta relativa
Windows ordinaria. Es una hipótesis basada en el código instalado, pendiente de
un intento real con topología same-volume.

D.2.8 incorpora una primitive reutilizable con `path.win32` explícito,
comparación case-insensitive de roots, distinción de shares UNC y reproducción
estructural de la entrada relativa. En Windows, D.2 usa un parent hermano del
repositorio, externo y same-volume; POSIX conserva `tmpdir()`. El gate se repite
tras crear la sesión, en el proceso padre antes del fork y en el worker sobre el
`next/package.json` físicamente resuelto. El restore real valida el parent
operador antes de iniciar source/R2/decrypt/target. Los desacuerdos usan
`RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH` sin serializar volúmenes, shares ni
paths. D.2.4, D.2.7, cwd, `NODE_PATH` y cleanup no cambian.

Attempts #7 y #8 reprodujeron el mismo fallo request-scoped `RELATIVE_IMPORT`
mientras el runtime disposable de aplicación podía residir en un volumen
Windows distinto de la autoridad física repo-local de la dependencia Next.
D.2.8 movió y gobernó ese runtime disposable en una topología compatible del
mismo volumen, con gates fail-closed. Attempt #9 verificó aplicación live,
ready, validación browser y todos los niveles de cleanup en PASS. Esta conclusión
se limita al fallo reproducido por este recovery runtime y a la construcción
relativa de Next implicada; no generaliza el soporte de proyectos cross-volume
de Next.js en Windows.

La auditoría estática del SHA Productivo encontró materializados los inputs
raíz `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `package.json`,
`package-lock.json`, `src/` y `public/`, sin un runtime config raíz obviamente
omitido. `/api/health/live` carece de imports de aplicación y responde exactamente
`{ status: "ok" }`; esto no prueba que Next no cargue infraestructura global al
compilar la ruta.

```text
PPO-04M.5.3D.2 = CLOSED / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED
PPO-04M.5.3D.2.1 = REAL-ENVIRONMENT CORRECTION VERIFIED BY ATTEMPT #2
PPO-04M.5.3D.2.2 = CLOSED / HEALTH DIAGNOSTIC + COLD-START HARDENING APPROVED
PPO-04M.5.3D.2.3 = REAL-ENVIRONMENT DIAGNOSTIC VERIFIED BY ATTEMPT #4
PPO-04M.5.3D.2.4 = REAL-ENVIRONMENT MOUNT + TOPOLOGY PATH VERIFIED / LIVE 5XX PERSISTS
PPO-04M.5.3D.2.5 = REAL-ENVIRONMENT REQUEST-SCOPED DIAGNOSTIC VERIFIED BY ATTEMPT #6
PPO-04M.5.3D.2.6 = REAL-ENVIRONMENT SAFE TAXONOMY VERIFIED BY ATTEMPT #7
PPO-04M.5.3D.2.7 = CLOSED / REAL-ENVIRONMENT PRODUCT DEFAULT DISTDIR VERIFIED / NOT CAUSAL FOR THE LIVE FAILURE / ARCHITECTURAL FIDELITY IMPROVEMENT RETAINED
PPO-04M.5.3D.2.8 = CLOSED / WINDOWS SAME-VOLUME APPLICATION RUNTIME TOPOLOGY / REAL-ENVIRONMENT VERIFIED BY ATTEMPT #9
PPO-04M.5.3D.2 ATTEMPT #1 = FAIL / APPLICATION PROCESS SHUTDOWN LIFECYCLE FINDING
FAILURE CODE = RECOVERY_APP_CLEANUP_INCOMPLETE
PUBLIC FAILURE PHASE = APP_CLEANUP
REAL TARGET STARTS = 1
RESTORE SQL EXECUTIONS = 0
R2 READS = 0
AGE DECRYPTS = 0
PRODUCTION MUTATIONS = 0
TARGET CLEANUP FAILURE DETECTED = NO
SESSION CLEANUP FAILURE DETECTED = NO
PRE-CLEANUP PRIMARY RESULT = NOT DETERMINABLE FROM SANITIZED ATTEMPT #1 EVIDENCE
ATTEMPT #1 RETRIES = 0
PPO-04M.5.3D.2 ATTEMPT #2 = FAIL / APPLICATION HEALTH GATE DIAGNOSTIC FINDING
FAILURE CODE = RECOVERY_APP_HEALTH_FAILED
PUBLIC FAILURE PHASE = APP_HEALTH
REAL TARGET STARTS = 1
RESTORE SQL EXECUTIONS = 0
R2 READS = 0
AGE DECRYPTS = 0
PRODUCTION MUTATIONS = 0
CLEANUP CLASSIFICATION = NO CLEANUP FAILURE DETECTED BY PRECEDENCE
APPLICATION CLEANUP FAILURE DETECTED = NO
TARGET CLEANUP FAILURE DETECTED = NO
SESSION CLEANUP FAILURE DETECTED = NO
BROWSER REACHED = NO
LIVE RESULT = NOT DETERMINABLE FROM ATTEMPT #2 EVIDENCE
READY RESULT = NOT DETERMINABLE FROM ATTEMPT #2 EVIDENCE
PPO-04M.5.3D.2 ATTEMPT #3 = FAIL / LIVE ROUTE RESPONSE DIAGNOSTIC FINDING
FAILURE CODE = RECOVERY_APP_LIVE_RESPONSE_INVALID
PUBLIC PHASE = APP_LIVE
REAL TARGET STARTS = 1
TARGET BASELINE = PASS BY PHASE PROGRESSION
TARGET AUTH HEALTH = PASS BY PHASE PROGRESSION
APPLICATION RUNTIME AUTHORITY = PASS BY PHASE PROGRESSION
APPLICATION START = PASS BY PHASE PROGRESSION
LIVE REQUEST = COMPLETED
LIVE RESPONSE = INVALID / CLASS NOT AVAILABLE IN ATTEMPT #3
READY = NOT REACHED
BROWSER = NOT REACHED
CLEANUP CLASSIFICATION = NO CLEANUP FAILURE DETECTED BY PRECEDENCE
APPLICATION CLEANUP FAILURE DETECTED = NO
TARGET CLEANUP FAILURE DETECTED = NO
SESSION CLEANUP FAILURE DETECTED = NO
RESTORE SQL EXECUTIONS = 0
R2 READS = 0
AGE DECRYPTS = 0
PRODUCTION MUTATIONS = 0
PPO-04M.5.3D.2 ATTEMPT #4 = FAIL / TEMPORARY RUNTIME DEPENDENCY RESOLUTION FINDING
FAILURE CODE = RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED
PUBLIC PHASE = APP_LIVE
REAL TARGET STARTS = 1
TARGET AUTH HEALTH = PASS BY PHASE PROGRESSION
APPLICATION START = PASS BY PHASE PROGRESSION
LIVE REQUEST = COMPLETED
LIVE RESPONSE = 5XX / MODULE_RESOLUTION_FAILURE
READY = NOT REACHED
BROWSER = NOT REACHED
CLEANUP = NO CLEANUP FAILURE DETECTED BY PRECEDENCE
RESTORE SQL EXECUTIONS = 0
R2 READS = 0
AGE DECRYPTS = 0
PRODUCTION MUTATIONS = 0
PPO-04M.5.3D.2 ATTEMPT #5 = FAIL / LIVE 5XX WITH ACCUMULATED MODULE-RESOLUTION DIAGNOSTIC
FAILURE CODE = RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED
PUBLIC PHASE = APP_LIVE
REAL TARGET STARTS = 1
TARGET AUTH HEALTH = PASS BY PHASE PROGRESSION
DEPENDENCY MOUNT = PASS BY PHASE PROGRESSION
WORKER DEPENDENCY TOPOLOGY = PASS BY PHASE PROGRESSION
APPLICATION START = PASS BY PHASE PROGRESSION
LIVE REQUEST = COMPLETED
LIVE RESPONSE = 5XX
REQUEST-SCOPED ROOT DIAGNOSTIC = NOT AVAILABLE IN ATTEMPT #5
READY = NOT REACHED
BROWSER = NOT REACHED
CLEANUP = NO CLEANUP FAILURE DETECTED BY PRECEDENCE
RESTORE SQL EXECUTIONS = 0
R2 READS = 0
AGE DECRYPTS = 0
PRODUCTION MUTATIONS = 0
PPO-04M.5.3D.2 ATTEMPT #6 = FAIL / REQUEST-SCOPED MODULE RESOLUTION / SAFE TAXONOMY INSUFFICIENT
FAILURE CODE = RECOVERY_APP_LIVE_MODULE_UNKNOWN_FAILED
PUBLIC PHASE = APP_LIVE
REAL TARGET STARTS = 1
RESTORE SQL EXECUTIONS = 0
R2 READS = 0
AGE DECRYPTS = 0
PRODUCTION MUTATIONS = 0
CONCRETE ROOT CAUSE = NOT DEMONSTRATED
PPO-04M.5.3D.2 ATTEMPT #7 = FAIL / REQUEST-SCOPED RELATIVE IMPORT RESOLUTION FINDING
FAILURE CODE = RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED
PUBLIC PHASE = APP_LIVE
REAL TARGET STARTS = 1
RESTORE SQL EXECUTIONS = 0
R2 READS = 0
AGE DECRYPTS = 0
PRODUCTION MUTATIONS = 0
CONCRETE RELATIVE SPECIFIER = NOT EXPOSED
CONCRETE ROOT CAUSE = NOT PROVEN
PRODUCT DISTDIR = .next / DEFAULT
RECOVERY DISTDIR BEFORE D.2.7 = .next-recovery / PROGRAMMATIC OVERRIDE
PRODUCT TSCONFIG GENERATED TYPE PATHS = .next/types / .next/dev/types
PPO-04M.5.3D.2 ATTEMPT #8 = FAIL / RELATIVE IMPORT PERSISTS AFTER PRODUCT DISTDIR CORRECTION
ATTEMPT #8 FAILURE CODE = RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED
ATTEMPT #8 PUBLIC PHASE = APP_LIVE
ATTEMPT #8 REAL TARGET STARTS = 1
ATTEMPT #8 RESTORE SQL EXECUTIONS = 0
ATTEMPT #8 R2 READS = 0
ATTEMPT #8 AGE DECRYPTS = 0
ATTEMPT #8 PRODUCTION MUTATIONS = 0
ATTEMPT #8 PRODUCT DEFAULT DISTDIR = PASSED BY PHASE PROGRESSION
ATTEMPT #8 CONCRETE RELATIVE SPECIFIER = NOT EXPOSED
D.2.7 ROOT-CAUSE STATUS = NOT CAUSAL / ARCHITECTURAL FIDELITY IMPROVEMENT RETAINED
ROOT CAUSE = WINDOWS CROSS-VOLUME NEXT APP-ROUTER ENTRY CONSTRUCTION
ROOT CAUSE STATUS = CONFIRMED BY REAL-ENVIRONMENT ATTEMPT #9
PPO-04M.5.3D.2 ATTEMPT #9 = PASS / REAL LOCAL RECOVERY APPLICATION COMPATIBILITY VERIFIED
status = PASS
operation = real-local-recovery-application-compatibility
runtimeAuthority = VERIFIED
targetIsolation = VERIFIED
baselineMigrationCount = 6
targetAuthHealth = PASS
applicationRuntimeAuthority = VERIFIED
applicationStart = PASS
applicationLive = PASS
applicationReady = PASS
applicationLocalSupabaseReadiness = VERIFIED
loginSurface = PASS
anonymousInternalAccess = REJECTED
browserRemoteIsolation = VERIFIED
browserCleanup = PASS
applicationCleanup = PASS
targetCleanup = PASS
sessionCleanup = PASS
realTargetStarts = 1
restoreSqlExecutions = 0
realR2Reads = 0
realAgeDecrypts = 0
productionMutations = 0
ATTEMPT EXIT CODE = 0
D.2 FINAL REAL ATTEMPT = #9 / PASS
D.2 FINAL VERIFIED CAPABILITIES = runtime authority / local target isolation / baseline 01-06 / direct local Auth health / Product application startup / live health / ready health / local Supabase readiness / login surface / anonymous internal rejection / browser remote isolation / browser cleanup / application cleanup / target cleanup / session cleanup
D.2 RESTORE ACTIVITY = NONE
D.2 R2 ACTIVITY = NONE
D.2 AGE DECRYPT ACTIVITY = NONE
D.2 PRODUCTION MUTATIONS = NONE
REAL TARGET STARTS DURING D.2.8 CORRECTION = 0
REAL APP STARTS DURING D.2.8 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.8 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.8 CORRECTION = 0
R2 READS DURING D.2.8 CORRECTION = 0
AGE DECRYPTS DURING D.2.8 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.8 CORRECTION = 0
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
REAL TARGET STARTS DURING D.2.7 CORRECTION = 0
REAL APP STARTS DURING D.2.7 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.7 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.7 CORRECTION = 0
R2 READS DURING D.2.7 CORRECTION = 0
AGE DECRYPTS DURING D.2.7 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.7 CORRECTION = 0
REAL TARGET STARTS DURING D.2.5 CORRECTION = 0
REAL APP STARTS DURING D.2.5 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.5 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.5 CORRECTION = 0
R2 READS DURING D.2.5 CORRECTION = 0
AGE DECRYPTS DURING D.2.5 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.5 CORRECTION = 0
REAL TARGET STARTS DURING D.2.4 CORRECTION = 0
REAL APP STARTS DURING D.2.4 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.4 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.4 CORRECTION = 0
R2 READS DURING D.2.4 CORRECTION = 0
AGE DECRYPTS DURING D.2.4 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.4 CORRECTION = 0
REAL TARGET STARTS DURING D.2.3 CORRECTION = 0
REAL APP STARTS DURING D.2.3 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.3 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.3 CORRECTION = 0
R2 READS DURING D.2.3 CORRECTION = 0
AGE DECRYPTS DURING D.2.3 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.3 CORRECTION = 0
REAL TARGET STARTS DURING D.2.2 CORRECTION = 0
REAL APP STARTS DURING D.2.2 CORRECTION = 0
REAL CHROMIUM STARTS DURING D.2.2 CORRECTION = 0
RESTORE SQL EXECUTIONS DURING D.2.2 CORRECTION = 0
R2 READS DURING D.2.2 CORRECTION = 0
AGE DECRYPTS DURING D.2.2 CORRECTION = 0
PRODUCTION ACTIVITY DURING D.2.2 CORRECTION = 0
```

### PPO-04M.5.1 FINAL INTEGRATION EVIDENCE

La evidencia detallada y sanitizada se conserva en
[PPO_04M51_LOCAL_INTEGRATION_REPORT.md](PPO_04M51_LOCAL_INTEGRATION_REPORT.md).

```text
SOURCE baseline 01–06 = PASS
TARGET baseline 01–06 = PASS

logical dump restore = PASS
restored tables = 49

Auth UUID continuity = PASS
Auth identities = PASS
password hash continuity = PASS
post-restore login = PASS

Storage metadata-before-bytes = PASS
byte restore = PASS
metadata duplicates = 0
missing metadata = 0
SHA-256 agreement = PASS

age real integration = PASS
rclone S3 integration = PASS

local cleanup = PASS
Production activity = 0
```

### M.5.2.0 — Production Backup & External Custody Preparation

El runner independiente `scripts/managed-backup/production-backup.mjs` prepara
una captura Productiva de solo lectura. No reutiliza el harness local y no
expone un comando npm de ejecución. Su orden fail-closed es:

```text
confirmación exacta
→ confirmación independiente de writer freeze
→ branch exacta + HEAD dinámico + worktree clean
→ configuración explícita
→ linked project coincidente
→ output fuera del repositorio
→ planes DB/S3 read-only
→ gate de destino externo
```

La configuración se suministrará en `.env.managed.backup.local`, ya cubierta
por el patrón `.env.*` de `.gitignore`. El archivo no se crea ni versiona. Sus
nombres admitidos son:

```text
SUPABASE_DB_PASSWORD
GODEL_MANAGED_SUPABASE_PROJECT_REF
GODEL_MANAGED_STORAGE_S3_ENDPOINT
GODEL_MANAGED_STORAGE_S3_REGION
GODEL_MANAGED_STORAGE_S3_ACCESS_KEY_ID
GODEL_MANAGED_STORAGE_S3_SECRET_ACCESS_KEY
GODEL_MANAGED_BACKUP_AGE_RECIPIENT
GODEL_MANAGED_BACKUP_OUTPUT_ROOT
GODEL_MANAGED_PRODUCTION_RUNTIME_SHA
GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM
GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM
```

`SUPABASE_SECRET_KEY` y `SUPABASE_SERVICE_ROLE_KEY` quedan prohibidas. DB usa
`--linked` con el password solo en environment allowlisted. Storage usa un
remote efímero `rclone` definido solo por environment, S3 List API v2 y limita
Production a `list-source`, `download-copy` y `verify-listing` (`rclone size
--json` reconciliado con los bytes capturados); upload y toda
operación destructiva se rechazan en el boundary Productivo.

El adapter de captura parsea de forma estricta los bloques `COPY` del dump
lógico. Falla si el formato no es reconocido, inventaría todas las tablas
capturadas y exige `auth.users`, `auth.identities`, `public.perfiles`,
`storage.buckets`, `storage.objects` y las dos tablas privadas durables de la
baseline 05: `private.internal_user_creation_audit` y
`private.internal_user_password_reset_audit`, aunque estén vacías. No usa una
heurística genérica sobre `private.*`; cualquier migración 07+ que incorpore una
tabla privada durable debe actualizar explícitamente este allowlist.

La continuidad de password se prueba solo para usuarios internos: cada
`public.perfiles.id` debe resolver a `auth.users.id`, tener
`encrypted_password` no nulo/no vacío y al menos una fila coincidente en
`auth.identities.user_id`. Los usuarios Auth ajenos a `public.perfiles` no
quedan obligados a usar password. Solo después de esa reconciliación se emite
`encryptedPasswordCoverageAvailable = true`, sin exponer UUIDs, hashes ni
identities.

La reconciliación durable Storage usa
`archivo_carga_items` committed, `archivos`, metadata `storage.objects` y cada
byte S3 capturado con SHA-256. No ejecuta SQL adicional ni guarda filas en el
receipt externo.

La primera ventana usa `BACKUP WRITER FREEZE` como assertion operacional porque
Production continúa protegida, el pilot rollout no se ejecutó y no se autorizan
QA mutante, escrituras de operadores ni background writers. Después de la
confirmación principal, el runner exige además
`GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM=CONFIRM_NO_PRODUCTION_WRITERS`
antes de leer el linked project o iniciar DB/S3. Esta confirmación no se
persiste, no llega a child processes y no entra en manifest, receipt ni logs.
El artifact cifrado registra únicamente los intervalos. No se implementa
maintenance mode. Tras iniciar el pilot, o si aparece cualquier writer
concurrente, esta suposición debe revisarse en PPO-06.

El cifrado Productivo conserva `tar stdout → age stdin`, sin `.tar` plaintext y
solo requiere el recipient público. La identity privada permanece fuera del
host de captura. El gate se denomina `AGE STRUCTURAL ENCRYPTION VERIFICATION`:
exige exit exitoso, ciphertext no vacío, header age v1 y SHA-256 capturado. No
es decrypt verification; esa prueba pertenece al restore drill M.5.3.

El receipt externo estricto contiene solo identidad de backup, timestamps, SHAs
de autoridad, nombre/tamaño/SHA-256 del ciphertext y estado de publicación. Su
commit point es el hard link no-replace después de write, fsync y chmod del
temporary; tras ese link el final está comprometido y la eliminación del
temporary es best effort. Una colisión conserva intacto el receipt existente.

**IMPORTANT AFTER PILOT / PPO-06:** el capture adapter materializa actualmente
los artifacts en memoria antes de construir el bundle. Es aceptable para el
primer pilot de pequeño volumen y no se refactoriza a streaming completo en
M.5.2.0; debe revisarse al crecer el volumen.

```text
PPO-04M.5.2.0 = CLOSED / PRODUCTION BACKUP PREPARATION APPROVED
PPO-04M.5.2.1A = CLOSED / R2 CUSTODY ADAPTER APPROVED
PPO-04M.5.2.1B = CLOSED / R2 SYNTHETIC CUSTODY PASS
PPO-04M.5.2.1C = CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS
PPO-04M.5.2.1D = CLOSED / HARNESS CORRECTIONS VERIFIED
PPO-04M.5.2.1E = CLOSED / FIRST PRODUCTION BACKUP VERIFIED
PPO-04M.5.2 = CLOSED / FIRST PRODUCTION BACKUP + EXTERNAL CUSTODY VERIFIED
FIRST PRODUCTION BACKUP = COMPLETE
PRODUCTION RESTORE = NOT AUTHORIZED
RESTORE TARGET = NOT YET CREATED
EXTERNAL CUSTODY DESTINATION = CLOUDFLARE R2 / SELECTED + SYNTHETICALLY VERIFIED
```

El destino quedó verificado con datos sintéticos y Dirección Técnica confirmó
como operador el Bucket Lock de `production/` por 8 días. El tooling no verificó
programáticamente el Dashboard. La custodia de la identity Productiva queda
atestada y verificada por el operador; el harness permanece pendiente de
revisión arquitectónica y toda ejecución Productiva sigue sin autorización.

## 19. Tooling local auditado — HISTORICAL PRE-INTEGRATION SNAPSHOT

Descubrimiento local sin instalar software ni contactar Production:

| Herramienta | Resultado |
| --- | --- |
| `node` | `v24.14.1` |
| `npm` | `11.11.0` |
| `supabase` | `2.109.1` disponible en `node_modules/.bin`; no global |
| `supabase status` | No ejecutable funcionalmente: Docker Desktop engine no está disponible |
| `docker` | Client `29.6.1`, build `8900f1d`; engine no disponible |
| `pg_dump` | No disponible standalone |
| `psql` | No disponible standalone |
| `age` | No disponible |
| `gpg` | No disponible |
| `7z` | No disponible |
| `rclone` | No disponible |
| `aws` | No disponible |

El discovery read-only del primer pase de M.5.1 reconfirmó `node v24.14.1`, npm,
Supabase CLI local `2.109.1`, Docker client `29.6.1` con engine no disponible y
la ausencia de `pg_dump`, `psql`, `age`, `rclone` y `aws`. No instaló software ni
inició Docker. Las dependencias opcionales deben resolverse y fijarse antes de
la integración local de M.5.1 y de cualquier M.5.2.

## 20. Decisiones abiertas y stop conditions

### 20.1 Decisiones abiertas para M.5.3

1. Implementar la admisión de la identity privada desde su custodia externa sin
   persistirla ni exponerla en argumentos, logs o evidencia.
2. Implementar y verificar el target Supabase local nuevo, aislado y desechable.
3. Fijar owner operativo, calendario diario y retención mínima definitiva.
4. Resolver en M.5.3 `ARCHIVE ENTRY ADMISSION / PATH TRAVERSAL HARDENING` y
   `AUTH SESSION/REFRESH TOKEN RECOVERY POLICY` antes del restore drill.

### 20.2 Resultado de stop conditions M.5.0

No se encontró una stop condition arquitectónica actual:

- la documentación oficial contempla export/import de Auth con hashes;
- los UUID Auth y sus relaciones pueden preservarse conceptualmente;
- el recovery set durable de Storage puede derivarse de las relaciones vigentes;
- 01–06 contienen las customizaciones de `auth.users`, `storage.objects`, bucket,
  RLS, grants y hardening;
- no aparece Vault, column encryption ni estado pgsodium de aplicación en 01–06;
- el diseño no exige modificar la baseline ni versionar secretos.

Debe detenerse un subbloque posterior si:

- Auth no puede capturarse/restaurarse con mecanismos soportados;
- no puede reconstruirse el inventario durable metadata/bytes;
- aparecen customizaciones managed no representadas por 01–06;
- aparece Vault/encryption state sin recovery material aprobado;
- restore exige cambiar 01–06;
- cualquier credencial o secreto tendría que entrar a Git, manifest o logs;
- no puede lograrse una ventana consistente o los inventarios pre/post difieren;
- no existe cifrado client-side o destino externo verificable.

## 21. PPO-04M.5.2.1A — Cloudflare R2 External Custody Adapter Preparation

Cloudflare R2 Standard es el destino oficial seleccionado. El bucket será
dedicado, privado, sin acceso público, custom domain, Worker ni conexión de la
aplicación. El acceso futuro será exclusivamente S3 mediante un token `Object
Read & Write` limitado al bucket específico; no se autoriza Admin, acceso a
todos los buckets, Global API Key ni administración de configuración.

```text
provider = Cloudflare R2
storage class = Standard
bucket = private
public access = disabled
custom domain = none
S3 token = Object Read & Write / specific bucket only
rclone provider = Cloudflare
rclone env_auth = true
rclone no_check_bucket = true
production prefix = production/
integration prefix = integration/
production bucket lock = 8 days minimum
lifecycle auto-delete = disabled in M.5
```

El adaptador `r2-external-custody.mjs` usa el remote efímero fijo `godelr2`,
región `auto` y únicamente environment allowlisted. Las credenciales se pasan
además como `secretValues`; no entran en argv, Git, receipt, manifest, docs ni
el environment heredado. El endpoint debe ser HTTPS limpio bajo
`*.r2.cloudflarestorage.com`, incluidos endpoints jurisdiccionales, y el bucket
cumple el nombre R2 de 3–63 caracteres. Las únicas operaciones posibles son
`lsjson` de inspección y `copyto` de upload/download; el upload siempre usa
`--immutable`. No existe API de delete, move, sync, purge, bucket provisioning,
Bucket Lock, Cloudflare REST, Wrangler ni creación de tokens.

La configuración no versionada usa exclusivamente
`GODEL_BACKUP_R2_ENDPOINT`, `GODEL_BACKUP_R2_BUCKET`,
`GODEL_BACKUP_R2_ACCESS_KEY_ID` y `GODEL_BACKUP_R2_SECRET_ACCESS_KEY`. No existe
variable de región. El gate Productivo separado es
`GODEL_MANAGED_R2_PRODUCTION_LOCK_CONFIRM`; no se envía a `rclone`.

Las claves se derivan internamente, sin prefix suministrado por el operador:

```text
integration/<proofRunId>/synthetic.age
integration/<proofRunId>/synthetic.external-receipt.json
production/<backupId>/<backupId>.age
production/<backupId>/<backupId>.external-receipt.json
```

El listing `lsjson` se admite de forma estricta y sólo acepta cero, uno o los
dos objetos exactos según la fase. Un objeto ya existente, incluso con el mismo
hash, es colisión; el download usa temporal, verifica regular-file/no-symlink y
publica localmente con no-replace fuera del repositorio. El modo `production`
exige antes de cualquier invocación
`GODEL_MANAGED_R2_PRODUCTION_LOCK_CONFIRM=CONFIRM_R2_PRODUCTION_PREFIX_LOCK_8D`.
El runner Productivo conserva dependency injection explícita: sin adapter sigue
en `EXTERNAL_CUSTODY_DESTINATION_PENDING` y este pase no lo autoriza.

Dirección Técnica confirmó como operador el Bucket Lock sobre `production/`,
con retención mínima de 8 días. El tooling no verificó programáticamente el
Dashboard y el token S3 no debe poder cambiar esa configuración. `integration/`
queda fuera de ese lock. No se configura lifecycle expiration, auto-delete ni
rotación automática en M.5.

R2 S3 ofrece consistencia fuerte, pero `preflight + rclone` no se declara un
compare-and-swap atómico. M.5 se apoya en backupId aleatorio, single-runner,
preflight remoto, `--immutable` y Bucket Lock. **IMPORTANT AFTER PILOT /
PPO-06:** evaluar `PutObject` condicional nativo con `If-None-Match: *` para
semántica estricta de creación remota.

El harness `r2-custody-proof.mjs` exige la confirmación exacta
`ALLOW_SYNTHETIC_R2_CUSTODY_PROOF` antes de Git, age o R2. Dirección Técnica lo
ejecutó manualmente una única vez sobre `integration/<proofRunId>/`: generó una
identity age efímera local, cifró la fixture gobernante, publicó y descargó el
ciphertext y el receipt, verificó el SHA-256 y limpió los archivos locales. No
promete secure erase y nunca borra objetos remotos.

```text
R2 REMOTE SYNTHETIC PROOF = PASS
SYNTHETIC REMOTE RESIDUE = EXPECTED / PENDING MANUAL OPERATOR CLEANUP
R2 BUCKET = NOT PROVISIONED BY TOOLING
R2 PRODUCTION PREFIX LOCK = OPERATOR-CONFIRMED / 8 DAYS
PRODUCTION AGE RECOVERY IDENTITY CUSTODY = OPERATOR-ATTESTED / VERIFIED
PRIVATE IDENTITY ON CAPTURE HOST = NO INTENTIONAL PERSISTENT COPY
RECOVERY COPIES = 2 / INDEPENDENT OPERATOR CUSTODY
FIRST PRODUCTION BACKUP = COMPLETE
rclone audited version = 1.75.1
age audited version = 1.3.1
```

## 22. PPO-04M.5.2.1B — Cloudflare R2 Synthetic Remote Proof

La evidencia sanitizada completa consta en
[PPO-04M.5.2.1B — R2 Custody Proof Report](PPO_04M521B_R2_CUSTODY_PROOF_REPORT.md).

```text
proofRunId = GDR2-20260924T004942Z-AMA3E67K
synthetic backupId = GDBK-20260924T004942Z-WPLYOQ6G
namespace class = integration
ciphertext upload/download/SHA-256 = PASS
receipt publication/download/schema = PASS
receipt -> ciphertext verification = PASS
local temporary cleanup = PASS

integration/GDR2-20260924T004942Z-AMA3E67K/
  synthetic.age
  synthetic.external-receipt.json

SYNTHETIC REMOTE RESIDUE = EXPECTED / PENDING MANUAL OPERATOR CLEANUP
```

## 23. Actividad de este pase

```text
Production requests = 0
Preview requests = 0
Supabase Managed requests = 0
Managed DB connections = 0
Production S3 operations = 0
Vercel operations = 0
Cloudflare R2 integration operations = EXECUTED / SYNTHETIC ONLY
R2 production/ operations = 0
Production backup artifacts = 0
remote delete operations = 0
```

PPO-04M.5 permanece abierto en preparación de backup Productivo. M.5.0 está
cerrado con arquitectura aprobada, M.5.1 está cerrado con integración local
aprobada, M.5.2.0 está cerrado/aprobado, M.5.2.1A queda cerrado/aprobado y
M.5.2.1B queda cerrado con proof sintético PASS. M.5.2 permanece abierto.
Este pase no autoriza el primer backup Productivo ni el restore drill.

## 24. PPO-04M.5.2.1C/D — custodia age y execution harness

La evidencia sanitizada de custodia consta en
[PPO-04M.5.2.1C — Production Age Recovery Identity Custody](PPO_04M521C_AGE_IDENTITY_CUSTODY_REPORT.md).
La clasificación es `OPERATOR-ATTESTED / VERIFIED`: no es una verificación
programática de las copias privadas y no afirma secure erase.

`production-execution.mjs` compone el capture adapter read-only existente, el
adapter R2 exclusivamente en modo `production` y `runProductionBackup()`. Antes
de construir esos adapters exige las tres confirmaciones exactas, ausencia de
identity age privada, CLI Supabase repo-local, versiones gobernadas de `age` y
`rclone`, disponibilidad de `tar`, Docker client/Engine funcionales,
configuración interna explícita y autoridad Git limpia. El CLI se ejecutará con
Node y sin shell; su versión instalada debe coincidir con el devDependency exacto
del repositorio y la contraseña DB permanece en environment aislado.

La snapshot cifrada fija el bucket privado `godel-files`, límite de 20 MiB,
allowlist MIME de migration 04, `pgcrypto`, Realtime no requerido y únicamente
los nombres de variables Vercel gobernantes. La publicación R2 Productiva exige
roundtrip de ciphertext y receipt `VERIFIED`. Las copias locales redundantes de
verificación se eliminan de manera contenida; un fallo posterior conserva el
backup completo con `EXTERNAL_VERIFICATION_CLEANUP_PENDING`.

El consistency gate Productivo ejecuta el mismo `rclone lsjson` estructurado
antes del dump DB y después de la descarga de bytes. Normaliza paths, tamaños y,
cuando están disponibles, modtime, hashes y metadata. El bundle y la publicación
R2 quedan bloqueados salvo igualdad estructural exacta:

```text
initial Storage inventory
= final Storage inventory
= captured path/size projection
```

El SHA-256 calculado sobre cada archivo local capturado continúa siendo la
autoridad de integridad del artifact; ningún ETag o hash remoto se declara
equivalente a SHA-256.

El preflight local de M.5.2.1E detectó un defecto del validator del tooling:
rechazaba el formato público PQ nativo `age1pq1...`, válido para la versión
gobernada de age. La validación quedó centralizada y admite recipients públicos
classic, PQ y plugin, con límite explícito, sin relajar la prohibición de
identities privadas. No se ejecutó el harness Productivo ni hubo actividad
remota durante esta corrección.

### M.5.2.1E — intento Productivo #1

La evidencia sanitizada completa está en
[PPO-04M.5.2.1E — First Production Backup Attempt #1](PPO_04M521E_FIRST_PRODUCTION_BACKUP_ATTEMPT_1_REPORT.md).
El listado inicial read-only de Storage pasó con cero objetos visibles. El
primer dump de roles no se completó porque el CLI se ejecutaba desde el capture
root y no podía resolver el contexto linked del repositorio. Bundle, cifrado y
publicación R2 no fueron alcanzados; no quedaron artifacts locales ni hubo
mutaciones Productivas.

La corrección mantiene el contexto linked únicamente en el repositorio y
separa el working directory del CLI de los destinos `--file`, que se validan y
relocalizan de forma contenida a `captureRoot/database`. No ejecuta
`supabase link`, no copia `supabase/.temp` y no crea symlinks.

La validación read-only posterior confirmó `dump roles = PASS` y alcanzó el
inventario posterior a la descarga. Con Storage Productivo vacío, `rclone copy`
no materializó el root local y el inventariador estricto detuvo la captura con
`CAPTURE_PATH_UNSAFE`. El lifecycle corregido valida que el root y el destino
estructural del plan coincidan exactamente con `captureRoot/storage`, lo crea
como directorio real privado antes de la ventana remota y conserva estricto el
inventariador fuera de ese lifecycle.

### M.5.2.1E — intento Productivo #2

La evidencia sanitizada completa está en
[PPO-04M.5.2.1E — First Production Backup Attempt #2](PPO_04M521E_FIRST_PRODUCTION_BACKUP_ATTEMPT_2_REPORT.md).
El capture read-only completó los cinco dumps, los inventarios Auth y Storage y
el gate de consistencia con Storage vacío. La ejecución se detuvo antes del
bundle al construir el writer-freeze record porque el validator exigía que la
ventana DB precediera al inicio de la ventana Storage, en contradicción con el
lifecycle real. El schema público se conserva y la validación local ahora exige
que la ventana DB quede anidada dentro de la ventana exterior Storage.

El siguiente bloque describe exclusivamente la actividad del pase correctivo
local, no las lecturas remotas de los intentos #1 y #2:

```text
PPO-04M.5.2.1C = CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS
PPO-04M.5.2.1D = CLOSED / HARNESS CORRECTIONS VERIFIED
PPO-04M.5.2.1E = CLOSED / FIRST PRODUCTION BACKUP VERIFIED
PPO-04M.5.2 = CLOSED / FIRST PRODUCTION BACKUP + EXTERNAL CUSTODY VERIFIED
FIRST PRODUCTION BACKUP = COMPLETE
REMOTE ACTIVITY = 0
PPO-04M.5.3 = ACTIVE / RESTORE DRILL ARCHITECTURE AUDIT
PRODUCTION RESTORE = NOT AUTHORIZED
RESTORE TARGET = NOT YET CREATED

Supabase Production requests = 0
Supabase Managed DB connections = 0
Production Storage S3 operations = 0
Cloudflare R2 operations = 0
Vercel operations = 0
Production backup artifacts = 0
```

### PPO-04M.5.3 — Real Restore SQL Dialect Diagnostic

Real Restore Attempt #1 terminó en `PREFLIGHT` por configuración operativa, sin
R2, decrypt, target ni SQL. Attempt #2 verificó el candidate R2, receipt,
ciphertext, identity, decrypt, TAR y bundle exacto; se detuvo en `SOURCE_VERIFY`
con `RECOVERY_SQL_STATEMENT_FORBIDDEN`, antes de crear target o ejecutar SQL.
Esto no declara corrupción del backup ni identifica la sentencia concreta.

`classifyUnsupportedManagedDataStatement()` aporta una taxonomía fija y
sanitizada a la metadata interna del error. `admitManagedDataSql()` no amplía
su dialecto admitido en este pase y `sanitizeRealRestoreDrillFailure()` no
publica esa metadata.

El diagnóstico `ops:restore:managed:source:local:diagnose` reutiliza
RecoverySession, receipt/ciphertext verification, age, TAR, bundle y SQL
admission mediante un source adapter local read-only. No usa R2, Docker,
Supabase, psql, Chromium ni application runtime. El loader estricto de
`.env.managed.r2.local` sólo prepara el environment del restore real: usa las
cuatro variables del proceso o las cuatro del archivo, y rechaza cualquier
mezcla parcial.

```text
PPO-04M.5.3 = ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
NEW SQL STATEMENTS ADMITTED = 0
LOCAL SOURCE DIAGNOSTIC EXECUTIONS DURING IMPLEMENTATION = 0
REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

### M.5.3 — Local Source Diagnostic #4 — finding de dialecto de roles

Local Source Diagnostic #4 usó exclusivamente el ciphertext local preservado y
confirmó cinco statements inesperados, todos dentro de tres familias upstream
conocidas de Supabase CLI 2.109.1 y PostgreSQL 17. No observó ninguna de las
otras seis clases bounded ni material credencial. La evidencia permanece
sanitizada: no se registran roles, grantees, parámetros concretos, valores ni
SQL Productivo.

La remediación mantiene `database/roles.sql` como `AUDIT_ONLY` y fuera de
`restoreSql`. `auditRolesSql()` admite únicamente `RESET ALL;`, los `ALTER ROLE
... SET ... TO ...` estrictos del allowlist Supabase y los ACL `PARAMETER`
exactos que `buildACLCommands()` puede generar. Las demás variantes continúan
fallando cerrado. Diagnostic #5 no fue ejecutado y su resultado no se presume.

```text
LOCAL SOURCE DIAGNOSTIC #4 = FINDING / ROLES_AUDIT
TOOLING SHA = dcc396107144a763c4757cd522798b30c4de00e8
status = FINDING
phase = ROLES_AUDIT
code = RECOVERY_ROLES_DIALECT_DIAGNOSTIC_FINDING
unexpectedStatementCount = 5
ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG = 3
RESET_ALL = 1
ROLE_PARAMETER_PRIVILEGE_VARIANT = 1
ALTER_ROLE_SET_OTHER_CONFIG = 0
GRANT_ROLE_MEMBERSHIP_VARIANT = 0
CREATE_ROLE_VARIANT = 0
ALTER_ROLE_WITH_VARIANT = 0
SET_STATEMENT_VARIANT = 0
OTHER_ROLE_SQL = 0
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS

UNEXPECTED ROLE SQL OUTSIDE KNOWN UPSTREAM FAMILIES = NOT OBSERVED
CREDENTIAL MATERIAL = NOT OBSERVED

PPO-04M.5.3 = ACTIVE / ROLES DIALECT REMEDIATION
LOCAL SOURCE DIAGNOSTIC #4 = CLOSED / FINDING CONFIRMED
LOCAL SOURCE DIAGNOSTIC #5 = NOT AUTHORIZED / PENDING REMEDIATION REVIEW
REAL RESTORE ATTEMPT #5 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


### M.5.3 — Local Source Diagnostic #5 — cierre / roles audit verified

El tooling inmutable `6424609827a9e5d24ad56c991ecb27f331bb7788`
se ejecutó sobre el mismo backup real preservado usado por Diagnostic #4.
Diagnostic #5 cerró en `PASS` y verificó que la remediación estricta cubre las
tres familias observadas sin findings adicionales. La evidencia sigue
sanitizada: no publica identidades, nombres concretos de parámetros, valores,
SQL Productivo raw ni paths absolutos.

```text
LOCAL SOURCE DIAGNOSTIC #5 = PASS / ROLES_AUDIT VERIFIED
TOOLING SHA = 6424609827a9e5d24ad56c991ecb27f331bb7788
status = PASS
operation = local-managed-recovery-source-diagnostic
phase = ROLES_AUDIT
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS
DIAGNOSTIC EXIT CODE = 0

LOCAL PRESERVED CIPHERTEXT = VERIFIED
LOCAL AGE DECRYPT = PASS
SAFE TAR = PASS
EXACT BUNDLE TREE = PASS
MANAGED-DATA SQL ADMISSION = PASS
ROLES.SQL DIALECT AUDIT = PASS
SOURCE CLEANUP = PASS

SUPABASE DATA WRAPPER REMEDIATION = REAL BACKUP VERIFIED
PG_DUMP SEQUENCE SET REMEDIATION = REAL BACKUP VERIFIED
ROLES DIALECT REMEDIATION = REAL BACKUP VERIFIED
```

`database/roles.sql` permanece `AUDIT_ONLY` y fuera de `restoreSql`.
Diagnostic #5 demuestra únicamente que el artifact pertenece al dialecto
gobernado; no demuestra ni autoriza su ejecución. El hard-fail
`RECOVERY_ROLES_CREDENTIAL_MATERIAL` permanece vigente.

```text
ROLE CREDENTIAL MATERIAL = NOT OBSERVED
UNEXPECTED ROLE SQL OUTSIDE GOVERNED DIALECT = NOT OBSERVED
```

Diagnostic #4 se conserva como evidencia histórica del finding previo, sin
reinterpretarlo como corrupción del backup:

```text
LOCAL SOURCE DIAGNOSTIC #4 = FINDING / ROLES_AUDIT
TOOLING SHA = dcc396107144a763c4757cd522798b30c4de00e8
unexpectedStatementCount = 5
ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG = 3
RESET_ALL = 1
ROLE_PARAMETER_PRIVILEGE_VARIANT = 1
```

El historial de intentos reales también permanece inalterado:

```text
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY SQL DIALECT ADMISSION
REAL RESTORE ATTEMPT #3 = FAIL / PREFLIGHT R2 LOCAL ENV ADMISSION
REAL RESTORE ATTEMPT #4 = FAIL / RESTORE_PLAN / ROLES DIALECT AUDIT
REAL RESTORE ATTEMPT #4 TOOLING SHA = 80d27aa9518a928557b8a4e98370d46433c45ee3
ATTEMPT #4 realTargetStarts = 1
ATTEMPT #4 sqlExecutions = 0
ATTEMPT #4 targetMutations = 0
ATTEMPT #4 realR2Reads = 3
ATTEMPT #4 realAgeDecrypts = 1
ATTEMPT #4 productionMutations = 0
```

Diagnostic #5 no verifica el restore completo. Para Real Restore Attempt #5
siguen pendientes:

```text
R2 source re-verification
fresh disposable target creation
target baseline validation
managed-schema audit
migration-history audit
restore-plan complete construction
single SQL mutation
post-restore DB validation
referential integrity
Auth continuity
real internal login
empty Storage validation
application live
application ready
application login
anonymous rejection
RLS/grant baseline
cleanup
```

El estado vigente queda:

```text
LOCAL SOURCE DIAGNOSTIC #5 = CLOSED / PASS / ROLES_AUDIT VERIFIED
SOURCE DIAGNOSTIC WORKSTREAM = CLOSED / REAL BACKUP SOURCE + ROLES VERIFIED
ROLES DIALECT REMEDIATION = APPROVED / REAL BACKUP VERIFIED
PPO-04M.5.3 = ACTIVE / SOURCE + ROLES VERIFIED / REAL RESTORE ATTEMPT #5 PENDING AUTHORIZATION
REAL RESTORE ATTEMPT #5 = NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW
TD-BACKUP-004 = OPEN
TD-BACKUP-004 = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

Este cierre fue exclusivamente documental:

```text
REAL R2 READS = 0
REAL AGE DECRYPTS = 0
REAL TARGET STARTS = 0
REAL APP STARTS = 0
REAL CHROMIUM STARTS = 0
SQL EXECUTIONS = 0
PRODUCTION ACTIVITY = 0
```

### M.5.3 — Real Restore Attempt #5 — restore plan diagnostic

Real Restore Attempt #5 ejecutó el tooling inmutable
`dbe9c940511ae2b989995da5fb0e831d635e84ec` y se detuvo de forma segura en
`RESTORE_PLAN`. La fuente R2 fue verificada en modo read-only, el decrypt y la
verificación de fuente completaron, y el target local desechable alcanzó su
baseline. No se ejecutó SQL de restore ni hubo mutación del target o Production.
El resultado no demuestra corrupción del backup.

```text
REAL RESTORE ATTEMPT #5 = FAIL / RESTORE_PLAN
TOOLING SHA = dbe9c940511ae2b989995da5fb0e831d635e84ec
code = RECOVERY_DRILL_FAILED
phase = RESTORE_PLAN
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 3
realAgeDecrypts = 1
productionMutations = 0

SOURCE R2 = VERIFIED / READ-ONLY
AGE DECRYPT = REACHED
SOURCE VERIFY = PASS
DISPOSABLE TARGET = STARTED
TARGET BASELINE = REACHED
RESTORE SQL = NOT EXECUTED
TARGET MUTATION = 0
PRODUCTION MUTATION = 0
```

La observabilidad genérica de `sanitizeRealRestoreDrillFailure()` convierte en
`RECOVERY_DRILL_FAILED` cualquier error interno que no pertenezca a su enum
público cerrado. No se amplió indiscriminadamente ese enum. En su lugar se
implementó un diagnóstico separado, bounded y no mutante que reproduce el
mismo punto mediante `buildManagedRestorePlan()` real.

El backup fue creado con Supabase CLI 2.109.1. El dialecto upstream de
`dump_data.sh` envuelve los dumps data-only con un `SET` inicial y
`RESET ALL;` final, incluido el dump de migration history. El auditor actual
admite el `SET` pero no ese `RESET ALL;`; por ello
`RECOVERY_MIGRATION_HISTORY_DATA_INVALID` es una hipótesis fuerte, no un
finding confirmado. No se afirma que fuera el primer error de Attempt #5 porque
`managed-schema` se audita antes.

```text
LOCAL MANAGED RECOVERY PLAN DIAGNOSTIC =
IMPLEMENTED / NOT EXECUTED

SOURCE =
LOCAL PRESERVED BACKUP ONLY

SOURCE ADAPTER =
createLocalRecoverySourceAdapter

R2 READS =
FORBIDDEN / 0

PLAN AUTHORITY =
buildManagedRestorePlan REAL

STOP BOUNDARY =
IMMEDIATELY AFTER RESTORE_PLAN

RESTORE SQL EXECUTION =
FORBIDDEN

STORAGE TRANSFER =
FORBIDDEN

CREDENTIAL PROMPT =
FORBIDDEN

APPLICATION START =
FORBIDDEN

CHROMIUM START =
FORBIDDEN
```

El diagnóstico exige la confirmación exacta
`GODEL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC_CONFIRM=ALLOW_LOCAL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC`,
rechaza confirmaciones incompatibles y mantiene un enum cerrado limitado a
fallos alcanzables durante la construcción del plan. Un código no admitido se
publica únicamente como `RECOVERY_RESTORE_PLAN_DIAGNOSTIC_UNCLASSIFIED`.

```text
PPO-04M.5.3 = ACTIVE / REAL RESTORE PLAN DIAGNOSTIC
REAL RESTORE ATTEMPT #5 = CLOSED / SAFE FAIL / RESTORE_PLAN
LOCAL MANAGED RECOVERY PLAN DIAGNOSTIC = IMPLEMENTED / NOT EXECUTED / PENDING REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
TD-BACKUP-004 = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```

### M.5.3 — Supabase CLI data-only wrapper remediation

Local Managed Recovery Source Diagnostic #1 confirmó que Supabase CLI 2.109.1
envuelve el data-only dump con un prefix y un suffix exactos no representados
por el dialecto managed anterior. El backup no se declara corrupto. El contrato
admite el par sólo en sus posiciones extremas y exactamente una vez; lo conserva
como metadata privada de transporte, lo elimina antes de la readmission y nunca
lo entrega a `psql`. La única autoridad ejecutable permanece en el orquestador:
`SET LOCAL session_replication_role = replica;` dentro de la transacción única.

```text
LOCAL MANAGED RECOVERY SOURCE DIAGNOSTIC #1 = FINDING / SQL_ADMISSION
TOOLING SHA = 5f1f4ddb2f7dfe1b7d15d1c14ec8fccd9195737f
statementClass = SET_PARAMETER
setParameter = session_replication_role
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS
SQL DIALECT ROOT CAUSE = SUPABASE CLI V2.109.1 DATA-ONLY WRAPPER NOT YET MODELED
OBSERVED WRAPPER PREFIX = SET session_replication_role = replica;
EXPECTED UPSTREAM WRAPPER SUFFIX = RESET ALL;
PPO-04M.5.3 = ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
LOCAL SOURCE DIAGNOSTIC #2 = CLOSED / FINDING CONFIRMED
LOCAL SOURCE DIAGNOSTIC #3 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

### M.5.3 — pg_dump Sequence SET remediation

Diagnostic #2 confirmó una diferencia estricta entre la forma legacy admitida
con `::regclass` y la forma canonical Productiva de `pg_dump`: qualified
sequence name citado, `int64` y boolean exacto sin cast. El parser estructural
admite únicamente schemas managed y nombres lowercase seguros, valida el rango
PostgreSQL `int64` mediante `BigInt` y no expone identities ni valores. Los
`SEQUENCE SET` admitidos permanecen en el SQL durable después de retirar el
wrapper de transporte y Auth efímero.

```text
LOCAL MANAGED RECOVERY SOURCE DIAGNOSTIC #2 = FINDING / SQL_ADMISSION
TOOLING SHA = 86a3b15073f924031116675e22dce056323d3fc7
statementClass = SELECT_PG_CATALOG_SETVAL_VARIANT
setParameter = NOT_APPLICABLE
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS
DIAGNOSTIC #2 ROOT CAUSE = PG_DUMP SEQUENCE SET FORMAT NOT REPRESENTED BY CURRENT SETVAL ADMISSION
CURRENT PARSER EXPECTATION = LEGACY ::regclass FORM
UPSTREAM PG_DUMP CONTRACT = QUALIFIED SEQUENCE NAME STRING + INT64 + BOOLEAN / NO ::regclass
SUPABASE CLI 2.109.1 = DATA-ONLY + QUOTE-ALL-IDENTIFIER
PPO-04M.5.3 = ACTIVE / PG_DUMP SEQUENCE SET REMEDIATION
LOCAL SOURCE DIAGNOSTIC #2 = CLOSED / FINDING CONFIRMED
LOCAL SOURCE DIAGNOSTIC #3 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
```

### M.5.3 — Local Managed Recovery Source Diagnostic #3 closure

El tercer diagnóstico admitió completamente el managed-data SQL del backup real
desde el ciphertext local preservado. Cierra los findings de wrapper y Sequence
SET diagnosticados después de Attempt #2, sin reinterpretar Attempt #1/#2 como
fallos de backup y sin afirmar restore de target, Auth o aplicación.

```text
LOCAL MANAGED RECOVERY SOURCE DIAGNOSTIC #3 = PASS / SQL_ADMISSION VERIFIED
TOOLING SHA = 32e88ac50e540593b3ec464909797605764028d5
localAgeDecrypts = 1
realR2Reads = 0
realTargetStarts = 0
sqlExecutions = 0
productionMutations = 0
cleanup = PASS

LOCAL SOURCE DIAGNOSTIC #1 = CLOSED / SUPABASE DATA WRAPPER FINDING REMEDIATED
LOCAL SOURCE DIAGNOSTIC #2 = CLOSED / PG_DUMP SEQUENCE SET FINDING REMEDIATED
LOCAL SOURCE DIAGNOSTIC #3 = PASS / COMPLETE MANAGED-DATA SQL ADMISSION VERIFIED
SUPABASE DATA WRAPPER REMEDIATION = REAL BACKUP VERIFIED
PG_DUMP SEQUENCE SET REMEDIATION = REAL BACKUP VERIFIED
REAL BACKUP MANAGED-DATA SQL ADMISSION = VERIFIED

LOCAL PRESERVED CIPHERTEXT = VERIFIED
LOCAL AGE DECRYPT = PASS
SAFE TAR = PASS
EXACT BUNDLE TREE = PASS
MANAGED SQL ARTIFACT READ = PASS
MANAGED-DATA SQL ADMISSION = PASS
SOURCE CLEANUP = PASS

R2 SOURCE RE-VERIFICATION = PENDING REAL RESTORE ATTEMPT #3
FRESH DISPOSABLE TARGET CREATION = PENDING REAL RESTORE ATTEMPT #3
BASELINE VALIDATION = PENDING REAL RESTORE ATTEMPT #3
ROLES/SCHEMA/HISTORY AUDITS AGAINST TARGET = PENDING REAL RESTORE ATTEMPT #3
RESTORE-PLAN CONSTRUCTION = PENDING REAL RESTORE ATTEMPT #3
SINGLE SQL MUTATION = PENDING REAL RESTORE ATTEMPT #3
POST-RESTORE DB VALIDATION = PENDING REAL RESTORE ATTEMPT #3
FK/CONSTRAINT VALIDATION = PENDING REAL RESTORE ATTEMPT #3
AUTH CONTINUITY = PENDING REAL RESTORE ATTEMPT #3
REAL INTERNAL LOGIN = PENDING REAL RESTORE ATTEMPT #3
EMPTY STORAGE VALIDATION = PENDING REAL RESTORE ATTEMPT #3
APPLICATION LIVE/READY/LOGIN = PENDING REAL RESTORE ATTEMPT #3
ANONYMOUS REJECTION = PENDING REAL RESTORE ATTEMPT #3
RLS/GRANT BASELINE = PENDING REAL RESTORE ATTEMPT #3
CLEANUP = PENDING REAL RESTORE ATTEMPT #3

LOCAL DIAGNOSTIC R2 READ = NOT EXECUTED
LOCAL DIAGNOSTIC TARGET CREATION = NOT EXECUTED
LOCAL DIAGNOSTIC SQL EXECUTION = NOT EXECUTED
LOCAL DIAGNOSTIC AUTH START = NOT EXECUTED
LOCAL DIAGNOSTIC APPLICATION START = NOT EXECUTED
LOCAL DIAGNOSTIC CHROMIUM START = NOT EXECUTED
LOCAL DIAGNOSTIC PRODUCTION MUTATION = NOT EXECUTED

LOCAL SOURCE DIAGNOSTIC #3 = CLOSED / PASS / SQL_ADMISSION VERIFIED
SOURCE DIAGNOSTIC WORKSTREAM = CLOSED / REAL BACKUP SOURCE SQL ADMISSION VERIFIED
PPO-04M.5.3 = ACTIVE / SOURCE VERIFIED / REAL RESTORE ATTEMPT #3 PENDING AUTHORIZATION
REAL RESTORE ATTEMPT #1 = FAIL / PREFLIGHT OPERATOR CONFIGURATION
REAL RESTORE ATTEMPT #2 = FAIL / SOURCE_VERIFY REAL BACKUP SQL DIALECT ADMISSION FINDING
REAL RESTORE ATTEMPT #3 = NOT AUTHORIZED / PENDING FINAL DOCUMENTARY REVIEW
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY
PRODUCTION RESTORE = NOT AUTHORIZED
PRODUCTION MUTATIONS = 0
TD-BACKUP-004 REQUIREMENT = REQUIRED BEFORE FIRST NON-EMPTY STORAGE RECOVERY

REAL R2 READS DURING DOCUMENTARY CLOSURE = 0
REAL AGE DECRYPTS DURING DOCUMENTARY CLOSURE = 0
REAL TARGET STARTS = 0
REAL APP STARTS = 0
REAL CHROMIUM STARTS = 0
SQL EXECUTIONS = 0
PRODUCTION ACTIVITY = 0
```

### M.5.3 — Real Restore Attempt #4 — diagnóstico del dialecto de roles

Real Restore Attempt #4 alcanzó la fuente R2 en modo read-only, verificó y
descifró el bundle, inició un target desechable y se detuvo de forma segura al
construir el restore plan porque el dialecto de `database/roles.sql` excede la
gramática gobernada actual. No se ejecutó SQL ni se mutó el target o Production;
esta evidencia no declara corrupción del backup.

La autoridad upstream confirmada es Supabase CLI 2.109.1, release commit
`6d4c19870ed213ba7f682f117d0345c8a40bfa94`, archivo
`apps/cli-go/pkg/migration/scripts/dump_role.sh`. Ese flujo usa
`pg_dumpall --roles-only --role postgres --quote-all-identifier --no-role-passwords --no-comments`,
aplica filtros Supabase y añade `RESET ALL;`. Que upstream emita ese suffix y
que el auditor actual no lo admita no demuestra que esa haya sido la sentencia
concreta del finding Productivo.

El tooling local incorpora una clasificación sanitizada y bounded del artifact
de roles después de la admisión completa de managed-data. No amplía
`auditRolesSql()`, no publica SQL, identities, parámetros ni valores, y conserva
el material credencial como hard failure. Local Source Diagnostic #4 no fue
ejecutado durante esta implementación y continúa sujeto a revisión y autorización.

```text
REAL RESTORE ATTEMPT #4 = FAIL / RESTORE_PLAN / ROLES DIALECT AUDIT
TOOLING SHA = 80d27aa9518a928557b8a4e98370d46433c45ee3
code = RECOVERY_ROLES_DIALECT_UNEXPECTED
phase = RESTORE_PLAN
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 3
realAgeDecrypts = 1
productionMutations = 0

R2 SOURCE = REACHED / READ-ONLY
DECRYPT = REACHED
SOURCE VERIFY = REACHED
DISPOSABLE TARGET = STARTED
RESTORE SQL = NOT EXECUTED
TARGET DATA MUTATION = 0
PRODUCTION MUTATION = 0

KNOWN UPSTREAM ROLE-DUMP DIALECT GAP = CONFIRMED
SUPABASE CLI 2.109.1 ROLE DUMP = pg_dumpall --roles-only + Supabase filters + RESET ALL suffix
ACTUAL PRODUCT BACKUP ROLE DIALECT = PENDING LOCAL SANITIZED CLASSIFICATION

PPO-04M.5.3 = ACTIVE / REAL BACKUP ROLES DIALECT DIAGNOSTIC
REAL RESTORE ATTEMPT #4 = CLOSED / SAFE FAIL / NO SQL MUTATION
LOCAL SOURCE DIAGNOSTIC #4 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #5 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


### Local Restore Plan Diagnostic #1 — migration history dialect finding

Local Restore Plan Diagnostic #1 ejecutó el tooling inmutable
`6081250f9943837d278e449d4f9c3602534f9b0a` sobre la fuente local preservada
y confirmó el primer fallo interno de Real Restore Attempt #5. La fuente local,
el target desechable y su baseline alcanzaron PASS antes del finding. No se
ejecutó SQL ni hubo actividad remota o mutación del target o Production. Este
resultado no declara corrupción del backup.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #1 = FINDING / RESTORE_PLAN
TOOLING SHA = 6081250f9943837d278e449d4f9c3602534f9b0a
code = RECOVERY_MIGRATION_HISTORY_DATA_INVALID
localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
PLAN_DIAGNOSTIC_EXIT_CODE = 1

SOURCE LOCAL VERIFY = PASS
TARGET START = PASS
TARGET BASELINE = PASS
ROLES AUDIT = PASSED BEFORE FAILURE
MANAGED SCHEMA AUDIT = PASSED BEFORE FAILURE
MIGRATION HISTORY DATA AUDIT = FINDING
RESTORE SQL = NOT EXECUTED

ATTEMPT #5 FIRST INTERNAL FAILURE = CONFIRMED / MIGRATION HISTORY DATA AUDIT
MANAGED SCHEMA FIRST-FAIL HYPOTHESIS = DISCARDED
MIGRATION-HISTORY DATA DIALECT GAP = CONFIRMED
```

La causa técnica confirmada es el wrapper data-only de Supabase CLI 2.109.1,
release commit upstream `6d4c19870ed213ba7f682f117d0345c8a40bfa94`.
`apps/cli-go/pkg/migration/scripts/dump_data.sh` produce
`database/migration-history-data.sql` mediante `supabase db dump --linked
--data-only --use-copy --schema supabase_migrations` y lo envuelve con
`SET session_replication_role = replica;` y un único `RESET ALL;` final. El
auditor admitía el prefix, pero no el suffix exacto.

La remediación admite `RESET ALL;` únicamente fuera de COPY, después del único
COPY esperado, una sola vez y al final lógico del artifact. Comments y líneas
vacías posteriores siguen siendo no significativos. El historial de migraciones
permanece `AUDIT_ONLY`; ni su schema ni sus datos se incorporan a
`restoreSql`. La comparación exacta entre las versiones capturadas y la
baseline 01–06 permanece intacta.

```text
SUPABASE CLI 2.109.1 DATA-DUMP WRAPPER =
SET session_replication_role = replica
...
RESET ALL

DIAGNOSTIC #1 AUDITOR GAP = RESET ALL suffix was not admitted
CURRENT AUDITOR GAP = NONE KNOWN / PENDING REAL BACKUP VERIFICATION
MIGRATION HISTORY DIALECT REMEDIATION = IMPLEMENTED / PENDING REAL BACKUP VERIFICATION

PPO-04M.5.3 = ACTIVE / MIGRATION HISTORY DIALECT REMEDIATION
LOCAL RESTORE PLAN DIAGNOSTIC #1 = CLOSED / FINDING CONFIRMED
LOCAL RESTORE PLAN DIAGNOSTIC #2 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


### Local Restore Plan Diagnostic #2 — database counts reconciliation finding

Local Restore Plan Diagnostic #2 ejecutó el tooling inmutable
`1b865d463e601a3cfd900a7bf4d1221d56d1907f` sobre la fuente local preservada
y se detuvo de forma segura durante `RESTORE_PLAN`. La fuente, el target
desechable, su baseline y todos los audits SQL anteriores alcanzaron PASS. No
se ejecutó SQL ni hubo actividad remota o mutación del target o Production. El
finding no constituye evidencia de corrupción del backup.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #2 = FINDING / RESTORE_PLAN
TOOLING SHA = 1b865d463e601a3cfd900a7bf4d1221d56d1907f
code = RECOVERY_MANAGED_DATA_COUNTS_MISMATCH
localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
PLAN_DIAGNOSTIC_2_EXIT_CODE = 1

SOURCE LOCAL VERIFY = PASS
TARGET START = PASS
TARGET BASELINE = PASS
ROLES AUDIT = PASS
MANAGED SCHEMA AUDIT = PASS
MIGRATION HISTORY SCHEMA AUDIT = PASS
MIGRATION HISTORY DATA AUDIT = PASS
DATABASE COUNTS RECONCILIATION = FINDING
RESTORE SQL = NOT EXECUTED
TARGET MUTATION = 0
PRODUCTION MUTATION = 0
```

La causa raíz es una diferencia de dominios. El inventario Productivo concatena
los COPY de `database/managed-data.sql` y
`database/migration-history-data.sql`; por tanto,
`manifest.databaseCounts.tables` contiene managed data más el conteo
audit-only de `supabase_migrations.schema_migrations`. Antes de esta
remediación, el restore comparaba los COPY de managed data contra ese inventario
completo como si ambos representaran el mismo dominio.

```text
DATABASE COUNTS DOMAIN GAP = CONFIRMED
MANIFEST DATABASE COUNT DOMAIN = MANAGED DATA + AUDIT-ONLY MIGRATION HISTORY
RESTORE COMPARISON BEFORE REMEDIATION = MANAGED DATA ONLY VS FULL DATABASE COUNTS
BACKUP CORRUPTION = NO EVIDENCE
```

La reconciliación conserva el inventario Productivo existente y lo consume por
completo mediante dos dominios exactos. Los conteos de cada COPY de managed data
deben coincidir identidad por identidad y fila por fila. Además debe existir una
sola entrada audit-only `supabase_migrations.schema_migrations`, cuyo conteo
debe coincidir con el `rowCount` gobernado que entrega
`auditMigrationHistorySql()`. Cualquier entrada restante, identidad
audit-only alternativa, duplicado, ausencia o conteo diferente falla cerrado.
`dataCounts.tableCounts` sigue conteniendo únicamente managed data para no
incorporar migration history a las expectativas mutables.

El audit de migration history cuenta las filas del único COPY gobernado, exige
`rowCount === baselineVersions.length` y conserva la comparación exacta de las
versiones 01–06. Una fila duplicada ya no puede quedar oculta por la
deduplicación usada para comparar identidades de versión. Migration history
permanece `AUDIT_ONLY` y no se incorpora a `restoreSql`.

```text
PPO-04M.5.3 = ACTIVE / DATABASE COUNTS RECONCILIATION REMEDIATION
LOCAL RESTORE PLAN DIAGNOSTIC #2 = CLOSED / FINDING CONFIRMED
DATABASE COUNTS RECONCILIATION = IMPLEMENTED / PENDING REAL BACKUP VERIFICATION
LOCAL RESTORE PLAN DIAGNOSTIC #3 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


## Local Restore Plan Diagnostic #3 — mutable catalog finding y diagnóstico acotado

La ejecución gobernada sobre el tooling inmutable confirmó una divergencia entre
las identities mutables admitidas desde el backup y el catálogo del target. El
finding no identifica todavía la tabla concreta ni confirma una diferencia de
versión entre Supabase Managed y Supabase local.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #3 =
FINDING / RESTORE_PLAN

TOOLING SHA =
dad4551194d9053d42f1adfda591ec7dde9c31f9

code =
RECOVERY_MUTABLE_TABLE_UNKNOWN

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS
PLAN_DIAGNOSTIC_3_EXIT_CODE = 1
```

La secuencia observada antes del finding fue:

```text
SOURCE VERIFY = PASS
TARGET START = PASS
TARGET BASELINE = PASS
ROLES AUDIT = PASS
MANAGED SCHEMA AUDIT = PASS
MIGRATION HISTORY AUDIT = PASS
DATABASE COUNTS RECONCILIATION = REAL BACKUP VERIFIED / PASS
MUTABLE SOURCE/TARGET CATALOG ALIGNMENT = FINDING / IDENTITY PENDING DIAGNOSTIC
RESTORE SQL = NOT EXECUTED

SUPABASE INTERNAL CATALOG VERSION DIVERGENCE =
POSSIBLE / NOT CONFIRMED
```

El diagnóstico implementado recibe únicamente el handle gobernado de
`admitManagedDataSql()` y el catálogo ya obtenido por el baseline existente.
Calcula las identities de source ausentes en target sin SQL raw, sin columnas,
sin filas, sin conteos de datos y sin consultas adicionales. Clasifica cada
identity exclusivamente como `AUTH_EPHEMERAL_KNOWN`, `AUTH_OTHER`,
`STORAGE_METADATA`, `STORAGE_OTHER`, `PUBLIC` o `PRIVATE`.

La metadata publicable queda limitada a `missingCount`, `missingClasses` y
`missingIdentities`; admite como máximo 32 identities, exige grammar
`schema.table`, schemas gobernados, ausencia de duplicados y orden
lexicográfico. El sanitizer vuelve a validar identities, clases y conteos antes
de publicarlos. Esta metadata sólo puede acompañar
`RESTORE_PLAN / RECOVERY_MUTABLE_TABLE_UNKNOWN`; cualquier otro finding
permanece sin `mutableCatalog`. El planner, `truncateTables`, la
sanitización Auth, el restore SQL, el baseline y el backup Productivo no fueron
modificados.

```text
PPO-04M.5.3 = ACTIVE / MUTABLE CATALOG DIAGNOSTIC
LOCAL RESTORE PLAN DIAGNOSTIC #3 = CLOSED / FINDING CONFIRMED
DATABASE COUNTS RECONCILIATION = APPROVED / REAL BACKUP VERIFIED
MUTABLE CATALOG DIAGNOSTIC = IMPLEMENTED / PENDING REVIEW
LOCAL RESTORE PLAN DIAGNOSTIC #4 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```


## Local Restore Plan Diagnostic #4 — Auth schema drift confirmado

La ejecución gobernada sobre el tooling inmutable confirmó cuatro identities
Auth presentes en el backup real y ausentes del catálogo del target local. El
finding quedó acotado al dominio interno de Auth; no se observó divergencia en
tablas `public`, `private` o `storage`.

```text
LOCAL RESTORE PLAN DIAGNOSTIC #4 =
FINDING / RESTORE_PLAN

TOOLING SHA =
a8145358f7815b655cb9db113cad452291c92253

code =
RECOVERY_MUTABLE_TABLE_UNKNOWN

missingCount =
4

missingClasses =
AUTH_OTHER × 4

missingIdentities =
auth.mfa_recovery_code_sets
auth.mfa_recovery_codes
auth.scim_tokens
auth.scim_users

localAgeDecrypts = 1
realTargetStarts = 1
sqlExecutions = 0
targetMutations = 0
realR2Reads = 0
remoteActivity = 0
productionMutations = 0
targetCleanup = PASS
sourceCleanup = PASS

PLAN_DIAGNOSTIC_4_EXIT_CODE =
1
```

```text
DATABASE COUNTS RECONCILIATION = PASS
MUTABLE SOURCE/TARGET CATALOG ALIGNMENT = FINDING
MISSING DOMAIN = AUTH INTERNAL ONLY
PUBLIC TABLE DIVERGENCE = NONE OBSERVED
PRIVATE TABLE DIVERGENCE = NONE OBSERVED
STORAGE TABLE DIVERGENCE = NONE OBSERVED

MANAGED VS LOCAL AUTH SCHEMA DRIFT = CONFIRMED
MISSING AUTH FEATURE TABLES = MFA RECOVERY CODES + SCIM

MISSING AUTH TABLES =
auth.mfa_recovery_code_sets
auth.mfa_recovery_codes
auth.scim_tokens
auth.scim_users

MISSING TABLE DATA OCCUPANCY = UNKNOWN / PENDING DIAGNOSTIC
```

Las cuatro identities corresponden a funcionalidades incorporadas en una línea
de GoTrue posterior a la utilizada por los targets actuales. Esto confirma el
drift de schema, pero no autoriza ignorar tablas, eliminar COPYs ni inferir que
las tablas estén vacías.

Como contexto del proyecto, la revisión del repositorio no encontró uso Product
de SCIM. La configuración local gobernada mantiene deshabilitados tanto MFA
TOTP como MFA por teléfono. Estos datos no constituyen evidencia sobre la
ocupación de las tablas del backup real.

```text
GODEL PRODUCT USE OF SCIM = NONE FOUND IN REPOSITORY
GODEL LOCAL MFA TOTP = DISABLED
GODEL LOCAL MFA PHONE = DISABLED
```

El diagnóstico implementado conserva separadas la clasificación del catálogo y
la ocupación. Sólo un resultado con provenance de
`classifyMutableCatalogMismatch()` puede consultar estructuralmente sus COPY
blocks a través del admission gobernado. Para cada identity ausente publica
únicamente `EMPTY` o `NONEMPTY`; no publica conteos, filas, columnas,
valores, SQL, hashes, tokens, UUIDs, paths ni credenciales. El límite permanece
en 32 identities y el sanitizer revalida provenance, igualdad exacta de sets,
orden y shape antes de publicar.

```text
PPO-04M.5.3 = ACTIVE / AUTH SCHEMA DRIFT DIAGNOSTIC
LOCAL RESTORE PLAN DIAGNOSTIC #4 = CLOSED / FINDING CONFIRMED
MANAGED VS LOCAL AUTH SCHEMA DRIFT = CONFIRMED
MISSING AUTH TABLE DATA OCCUPANCY = PENDING REAL BACKUP VERIFICATION
LOCAL RESTORE PLAN DIAGNOSTIC #5 = NOT AUTHORIZED / PENDING IMPLEMENTATION REVIEW
REAL RESTORE ATTEMPT #6 = NOT AUTHORIZED
TD-BACKUP-004 = OPEN
CURRENT REAL RESTORE STORAGE SCOPE = EMPTY STORAGE ONLY

REAL R2 READS DURING IMPLEMENTATION = 0
REAL AGE DECRYPTS DURING IMPLEMENTATION = 0
REAL TARGET STARTS DURING IMPLEMENTATION = 0
REAL APP STARTS DURING IMPLEMENTATION = 0
REAL CHROMIUM STARTS DURING IMPLEMENTATION = 0
SQL EXECUTIONS DURING IMPLEMENTATION = 0
PRODUCTION ACTIVITY DURING IMPLEMENTATION = 0
```
