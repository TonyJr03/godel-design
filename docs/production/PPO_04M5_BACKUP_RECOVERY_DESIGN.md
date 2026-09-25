# PPO-04M.5 — Managed Backup & Recovery Architecture

**Bloque:** `PPO-04M.5.0 — Managed Backup & Recovery Architecture Audit`

**Estado de M.5:** `ACTIVE / PRODUCTION BACKUP PREPARATION`

**Estado de M.5.0:** `CLOSED / ARCHITECTURE APPROVED`

**M.5.1:** `CLOSED / LOCAL INTEGRATION APPROVED`

**M.5.2:** `ACTIVE / PRODUCTION BACKUP PREPARATION`

**M.5.2.0:** `CLOSED / PRODUCTION BACKUP PREPARATION APPROVED`

**M.5.2.1A:** `CLOSED / R2 CUSTODY ADAPTER APPROVED`

**M.5.2.1B:** `CLOSED / R2 SYNTHETIC CUSTODY PASS`

**M.5.2.1C:** `CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS`

**M.5.2.1D:** `PQ AGE RECIPIENT VALIDATION CORRECTED / PENDING FINAL REVIEW`

**M.5.2.1E:** `NOT STARTED`

**R2 REMOTE SYNTHETIC PROOF:** `PASS`

**M.5.3:** `NOT STARTED`

**FIRST PRODUCTION BACKUP:** `NOT EXECUTED`

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

Recomendación:

```text
M.5.1 = pruebas locales y tooling sin Production
M.5.2 = primer backup Production autorizado + custodia externa
M.5.3 = restore drill sobre proyecto Supabase managed nuevo/desechable
```

El target A es obligatorio para la aceptación preferida porque prueba la
frontera provider-managed real. Antes de M.5.3 debe existir una decisión
explícita sobre slot Free o coste temporal. Si no se autoriza, un drill local
puede aportar evidencia parcial, pero no se promoverá silenciosamente a cierre
equivalente de M.5.

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
= ACTIVE / PRODUCTION BACKUP PREPARATION

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
= PQ AGE RECIPIENT VALIDATION CORRECTED / PENDING FINAL REVIEW

PPO-04M.5.2.1E
= First Production Backup Execution
= NOT STARTED

PPO-04M.5.3
= Restore Drill + Baseline Closure
= NOT STARTED
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
FIRST PRODUCTION BACKUP = NOT EXECUTED
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
PPO-04M.5.2.1D = PQ AGE RECIPIENT VALIDATION CORRECTED / PENDING FINAL REVIEW
PPO-04M.5.2.1E = NOT STARTED
FIRST PRODUCTION BACKUP = NOT EXECUTED
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

1. Asignar la custodia de la identity privada de recovery fuera del host de
   captura.
2. Autorizar slot/coste del proyecto managed desechable de M.5.3.
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
FIRST PRODUCTION BACKUP = NOT EXECUTED
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

```text
PPO-04M.5.2.1C = CLOSED / PRODUCTION AGE RECOVERY IDENTITY CUSTODY PASS
PPO-04M.5.2.1D = PQ AGE RECIPIENT VALIDATION CORRECTED / PENDING FINAL REVIEW
PPO-04M.5.2.1E = NOT STARTED
FIRST PRODUCTION BACKUP = NOT EXECUTED
REMOTE ACTIVITY = 0
PPO-04M.5.3 = NOT STARTED

Supabase Production requests = 0
Supabase Managed DB connections = 0
Production Storage S3 operations = 0
Cloudflare R2 operations = 0
Vercel operations = 0
Production backup artifacts = 0
```
