# SH-04.3D — Rotación segura de secretos y continuidad de recovery

Estado: `CLOSED / APPROVED / PASS` — D.3 (rotación de API keys opacas), D.4A
(rotación legacy), D.4B (rotación EC), D.5 (rotación PostgreSQL) y D.6
(aceptación final de rotación/recovery) están cerrados/aprobados.

Estado de subfases: D.0 `CLOSED / APPROVED`, D.1 `CLOSED / APPROVED`, D.2A
`CLOSED / APPROVED`, D.2B `CLOSED / APPROVED`, D.2 `CLOSED / APPROVED`, D.3A
`CLOSED / APPROVED`, D.3B.0 `CLOSED / APPROVED / PASS`, D.3B.1
`CLOSED / APPROVED / PASS`, D.4A `CLOSED / APPROVED / PASS`, D.4B
`CLOSED / APPROVED / PASS`, D.5 `COMPLETE / APPROVED` y D.6 `CLOSED /
APPROVED / PASS`. SH-04.3D queda `CLOSED / APPROVED`.

Este documento es la autoridad operativa para SH-04.3D. Complementa el
[informe general SH-04.3](SH_04_SECRETS_AUTH_REPORT.md), que conserva el
contrato de configuración y Auth.

## Alcance y límites

La fase cubre diseño, custodia local de generaciones externas, backup/restore y
la evidencia de rotaciones aprobadas ya ejecutadas. No concede autorización
general para mutaciones: cada rotación o recovery productivo requiere un
subbloque/gate explícitamente diseñado y aprobado. Los valores reales permanecen
fuera de Git; la mutación manual o ad-hoc de secretos sigue prohibida y las
claves de cifrado con estado o raíces de instalación conservan sus restricciones
específicas. Ningún secreto se imprime, sube ni se trata como artefacto de
documentación.

## Resultado de auditoría D.0

La rotación se clasifica por impacto, no por el nombre de la variable:

| Grupo | Variables o material | Continuidad y decisión |
| --- | --- | --- |
| Credenciales de base | `POSTGRES_PASSWORD` y roles dependientes | Requiere procedimiento específico de roles/Supavisor; el helper upstream actual no es seguro para ejecutar. |
| Firma y sesiones | `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, JWT HS256/JWKS | Cambiar HS invalida sesiones; el JWKS ES256 permite adición controlada de clave sin retirar verificación legacy. |
| API keys opacas | `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | El upstream acepta un valor activo; publishable requiere rebuild de la imagen Godel y secret exige recrear el runtime server-only. |
| Cifrado con estado | `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, raíz pgsodium | No tienen rotación live aprobada. Hay estado cifrado de Realtime y Supavisor; no se cambian sin drill y procedimiento dedicado. |
| Aplicación/servicios | `SECRET_KEY_BASE`, Dashboard | Tiene consumidores Realtime/Supavisor y debe coordinarse con su reinicio. |
| Opcionales inertes | SMTP, S3, Logflare, MinIO, OpenAI | No forman parte del runtime actual; no se generan ni rotan en D.1. |

El orden de dependencia auditado para Auth asimétrico es: validar los
verificadores (`rest`, `realtime`, `storage`, `functions`), recrearlos y solo
después Auth. La recuperación debe conservar el bundle `JWT_KEYS`, `JWT_JWKS`,
`ANON_KEY_ASYMMETRIC` y `SERVICE_ROLE_KEY_ASYMMETRIC` cuando esté activo.

Los bloqueadores para una rotación real siguen abiertos: el helper upstream de
contraseña imprime material y elimina el schema `_supavisor`; Supavisor mantiene
estado cifrado; y no existe una rotación live aprobada para las claves de
cifrado con estado. Ninguno se resuelve con D.1.

## Clasificación durable D.0

| Clase | Significado operativo |
| --- | --- |
| A — `INDEPENDENT_ROTATABLE` | Material sin estado persistente que puede cambiarse mediante un procedimiento aislado aprobado. |
| B — `COUPLED_ROTATION_SET` | Material que debe cambiar coordinadamente con otros valores o consumidores. |
| C — `SESSION_INVALIDATING` | Cambio que invalida sesiones o tokens existentes. |
| D — `DATABASE_CREDENTIAL_ROTATION` | Credencial de PostgreSQL y roles; exige coordinación DB/Supavisor. |
| E — `STATE_ENCRYPTION_KEY` | Clave que protege estado persistente; no se cambia live sin migración y drill probado. |
| F — `INSTALLATION_ROOT_KEY` | Raíz de instalación que no se rota live durante SH-04.3D. |
| G — `OPTIONAL_UNUSED` | Configuración opcional no consumida por el perfil actual; no se genera ni rota. |

## Matriz completa de rotación

| Material | Consumers | Clase | Acoplado con | Estado persistente / sesiones | Producción nueva | Rotación live | QA / rebuild / servicios | Backup y retención | Recomendación |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL y roles | D | Roles DB, Supavisor | Credenciales DB y estado Supavisor | Sí | Solo mediante gate D.5 aprobado | Drill DB; DB y Supavisor | Antes; recovery | D.5 ejecutada; contrato `_supavisor` preservado. |
| `JWT_SECRET` | Auth y verificadores legacy | C | `ANON_KEY`, `SERVICE_ROLE_KEY`, JWKS legacy | Invalida HS256 | Sí | Solo plan coordinado | Login, API y todos verificadores | Antes; conservar generación | D.4A. |
| `ANON_KEY` | API gateway / clientes | B,C | `JWT_SECRET`, API key wiring | Token legacy | Sí | Solo plan coordinado | Gateway y consumidores | Antes; conservar generación | D.4A. |
| `SERVICE_ROLE_KEY` | Servicios internos legacy | B,C | `JWT_SECRET`, API key wiring | Token legacy | Sí | Solo plan coordinado | Gateway, Auth admin | Antes; conservar generación | D.4A. |
| `SUPABASE_PUBLISHABLE_KEY` | Cliente Godel / Envoy | B | Opaque key translation | Sin estado DB; build-time público | Sí | No simultánea | Rebuild Godel; app y nginx | Antes; rollback generation | D.3. |
| `SUPABASE_SECRET_KEY` | Adaptador Auth Admin server-only / Envoy | B | Opaque key translation | Sin estado DB | Sí | No simultánea | Recreate app; Auth Admin smoke | Antes; rollback generation | D.3, nunca al cliente. |
| `JWT_KEYS` | Auth firma ES256 | B | `JWT_JWKS` | Mantiene firma ES256 | Sí | Adición controlada | Auth después de verificadores | Antes; retener hasta recovery | D.4B. |
| `JWT_JWKS` | Rest, Realtime, Storage, Functions | B | `JWT_KEYS` | Verificación de sesiones | Sí | Adición controlada | Verificadores antes de Auth | Antes; retener hasta recovery | D.4B. |
| `ANON_KEY_ASYMMETRIC` | Envoy translation | B | `JWT_JWKS`, opaque keys | Token de traducción | Sí | Coordinada | Gateway y verificadores | Antes; retener generación | D.4B/D.3 según plan. |
| `SERVICE_ROLE_KEY_ASYMMETRIC` | Envoy/Auth Admin translation | B | `JWT_JWKS`, opaque keys | Token de traducción | Sí | Coordinada | Gateway, Auth Admin smoke | Antes; retener generación | D.4B/D.3 según plan. |
| `DASHBOARD_PASSWORD` | api-gw / Envoy Basic Auth | A | Ninguno | No afecta Godel/Auth | Sí | Procedimiento aislado | Basic Auth old/new por gateway; api-gw | No crítico para datos; conservar rollback | D.2. |
| `SECRET_KEY_BASE` | Realtime y Supavisor | B | Realtime/Supavisor | Cookies/estado de esos servicios | Sí | Coordinada | Recreate ambos servicios | Antes; rollback generation | Cambiar juntos; no familia Auth. |
| `REALTIME_DB_ENC_KEY` | Realtime | E | Estado Realtime | Sí, cifrado | Sí | No en SH-04.3D | Drill de migración; Realtime | Backup obligatorio; recovery largo | Fresh unique; congelada live. |
| `VAULT_ENC_KEY` | Supavisor/Vault | E | Estado Supavisor | Sí, cifrado | Sí | No en SH-04.3D | Drill de migración; Supavisor | Backup obligatorio; recovery largo | Fresh unique; congelada live. |
| `PG_META_CRYPTO_KEY` | Postgres Meta / futuros vault-FDW | E | Estado futuro | No probado actualmente; potencial | Sí | No sin migración probada | Drill explícito; Meta | Backup obligatorio | Fresh unique; no live. |
| `pgsodium_root.key` | PostgreSQL pgsodium | F | Instalación DB | Raíz persistente | Única por instalación | No en SH-04.3D | Restore drill; DB | Artefacto protegido; retención recovery | Nunca rotar live en D. |
| Familia SMTP | Auth SMTP | G | Proveedor externo | Inerte actualmente | Solo si producto lo aprueba | Fuera de D.1 | Smoke proveedor futuro | No aplica mientras inerte | No generar. |
| Credenciales protocolo S3 | Storage S3 | G | Backend Storage | Storage actual FILE | Solo si se adopta S3 | Fuera de D.1 | Migración Storage futura | Backup antes de cambio backend | No generar. |
| Credenciales Logflare | Logflare | G | Observabilidad opcional | Inerte | Solo si se adopta | Fuera de D.1 | Prueba de ingestión futura | Política futura | No generar. |
| Credenciales MinIO | MinIO | G | Backend opcional | Inerte | Solo si se adopta | Fuera de D.1 | Migración Storage futura | Política futura | No generar. |
| `OPENAI_API_KEY` | Studio AI opcional | G | Studio AI | Inerte | Solo si se adopta | Fuera de D.1 | Smoke funcional futuro | Política futura | No generar. |

### Campos operativos obligatorios de la matriz

| Material | Consumers | Primary class | Coupled with | Persistent-state impact | Session impact | Fresh production unique | Live rotation | QA proof required | App rebuild | Services affected | Backup before rotation | Historical-secret retention | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | DB/roles | D | Supavisor | Sí | No | Sí | D.5 ejecutada mediante gate aprobado | Verificación DB+Supavisor | No | db,supavisor | Sí | Recovery | D.5 completada |
| `JWT_SECRET` | Auth/legacy verifiers | C | anon/service keys | No | HS256 invalidated | Sí | Plan only | login+API | No | auth,verifiers | Sí | Recovery | D.4A |
| `ANON_KEY` | gateway/clients | C | JWT secret | No | legacy token | Sí | Plan only | gateway | No | api-gw | Sí | Recovery | D.4A |
| `SERVICE_ROLE_KEY` | internal legacy | C | JWT secret | No | legacy token | Sí | Plan only | Admin Auth | No | api-gw,auth | Sí | Recovery | D.4A |
| `SUPABASE_PUBLISHABLE_KEY` | Godel/Envoy | B | opaque translation | No | No | Sí | No overlap | client+gateway | Sí | app,nginx,api-gw | Sí | Rollback | D.3 |
| `SUPABASE_SECRET_KEY` | Auth Admin/Envoy | B | opaque translation | No | No | Sí | No overlap | Admin Auth | No | app,api-gw | Sí | Rollback | D.3 |
| `JWT_KEYS` | Auth signer | B | JWT_JWKS | No | ES256 continuity | Sí | Add-first | issue/verify token | No | auth | Sí | Recovery | D.4B |
| `JWT_JWKS` | verifiers | B | JWT_KEYS | No | ES256 continuity | Sí | Add-first | verify token | No | rest,realtime,storage,functions | Sí | Recovery | D.4B |
| `ANON_KEY_ASYMMETRIC` | Envoy | B | JWKS/opaque | No | translation token | Sí | Coordinated | gateway API | No | api-gw | Sí | Recovery | D.3/D.4B |
| `SERVICE_ROLE_KEY_ASYMMETRIC` | Envoy/Auth Admin | B | JWKS/opaque | No | translation token | Sí | Coordinated | Admin Auth | No | api-gw,app | Sí | Recovery | D.3/D.4B |
| `DASHBOARD_PASSWORD` | api-gw / Envoy Basic Auth | A | none | No | No | Sí | Isolated | gateway old/new Basic Auth | No | api-gw | Recommended | Rollback | D.2 |
| `SECRET_KEY_BASE` | Realtime/Supavisor | B | both services | Yes | service cookies | Sí | Coordinated | service smoke | No | realtime,supavisor | Sí | Rollback | together |
| `REALTIME_DB_ENC_KEY` | Realtime | E | encrypted state | Sí | No | Sí | No | migration drill | No | realtime | Sí | Recovery | frozen |
| `VAULT_ENC_KEY` | Supavisor/Vault | E | encrypted state | Sí | No | Sí | No | migration drill | No | supavisor | Sí | Recovery | frozen |
| `PG_META_CRYPTO_KEY` | Meta | E | future vault/FDW | Potential | No | Sí | No | proven migration | No | meta | Sí | Recovery | frozen |
| `pgsodium_root.key` | DB pgsodium | F | installation | Sí | No | unique install | No | restore drill | No | db | Sí | Recovery | frozen |
| SMTP family | Auth SMTP | G | provider | No | No | if enabled | N/A | provider smoke | No | auth | N/A | N/A | unused |
| S3 protocol credentials | Storage S3 | G | backend | FILE now | No | if enabled | N/A | Storage migration | No | storage | before backend change | future policy | unused |
| Logflare credentials | Logflare | G | observability | No | No | if enabled | N/A | ingest smoke | No | log service | N/A | future policy | unused |
| MinIO credentials | MinIO | G | backend | No | No | if enabled | N/A | Storage migration | No | storage | before backend change | future policy | unused |
| `OPENAI_API_KEY` | Studio AI | G | Studio AI | No | No | if enabled | N/A | AI smoke | No | studio | N/A | future policy | unused |

## Decisiones congeladas y blocker DB

- `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY` y `PG_META_CRYPTO_KEY` deben ser
  únicos para producción; no tienen rotación live autorizada en SH-04.3D. El
  último no puede cambiar sin una migración probada.
- `pgsodium_root.key` es una raíz de instalación: no se rota live en
  SH-04.3D.
- `SECRET_KEY_BASE` es independiente de las familias Auth, pero Realtime y
  Supavisor deben actualizarse y recrearse juntos.
- `infra/supabase/utils/db-passwd.sh` está **NOT AUTHORIZED**: imprime la
  contraseña generada, altera múltiples roles y ejecuta `DROP SCHEMA
  _supavisor CASCADE`. QA mantiene estado cifrado persistente de Supavisor; D.5
  preservó el contrato de Supavisor aprobado sin utilizar ese helper.

## Descomposición de SH-04.3D

| Fase | Alcance | Estado |
| --- | --- | --- |
| D.0 | Auditoría de arquitectura y seguridad | CLOSED / APPROVED |
| D.1 | Tooling seguro y modelo de generación/recovery | CLOSED / APPROVED |
| D.2 | Generación cero y rotación Dashboard | CLOSED / APPROVED |
| D.3 | Opaque API keys y rebuild Godel | CLOSED / APPROVED |
| D.4A | Rotación legacy `JWT_SECRET` / anon / service-role | CLOSED / APPROVED / PASS — hard cut final y rollback real aprobados. |
| D.4B | Rotación de claves EC de firma | CLOSED / APPROVED / PASS — D.4B.0–D.4B.8 completados; rotación EC operativa y funcionalmente completa. |
| D.5.0 | Auditoría arquitectónica/live read-only de contraseña PostgreSQL | CLOSED / APPROVED / PASS |
| D.5 | Rotación segura de contraseña PostgreSQL | COMPLETE / APPROVED |
| D.6 | Aceptación final de rotación/recovery | CLOSED / APPROVED / PASS |

## Retención y semántica de asociación

La **retención de rollback** conserva temporalmente la generación previa para
revertir una rotación fallida. La **retención de recovery** conserva una
generación mientras exista cualquier backup que la referencie. El vencimiento
del rollback no autoriza borrar una generación requerida por un backup
retenido. PPO-06 definirá la política final off-host y de retención.

`externalSecretGenerationId` es metadato de asociación local: no es firma,
HMAC, autenticación ni evidencia de integridad criptográfica, y no se deriva de
secretos. La comparación exacta de bytes vincula estado local; no aporta por sí
misma autenticidad frente a una alteración maliciosa.

## Registro externo de generaciones

El registro no guarda hashes ni valores en metadata. Su forma es:

```text
protected-recovery-material/selfhosted/external-secrets/
  current.json
  generations/<UUID>/
    metadata.json
    supabase.env
    godel.env
```

`metadata.json` usa el formato `godel-external-secret-generation`, schema 1,
un UUID canónico, timestamp, commit del repositorio, razón finita y, cuando
aplique, la generación fuente. Solo enumera los nombres de snapshots. Los
snapshots son copias byte a byte exclusivamente de `infra/supabase/.env` y
`compose.env.local`; `.env.qa.local` está fuera del registro.

El directorio y los snapshots se crean solicitando permisos POSIX restrictivos
(`0700` y `0600`) y con `umask 077`. En Windows esos bits no equivalen a ACLs:
el operador debe asegurar ACL equivalente y que el directorio protegido no se
sincronice ni comparta. El tooling rechaza symlinks, archivos no regulares,
rutas inseguras y generaciones inesperadas.

## Herramienta D.1

`manage-secret-generations.mjs` no genera secretos y no modifica entornos. Sus
dos operaciones son:

```text
npm run ops:secrets:generation:status
npm run ops:secrets:generation:bootstrap -- --apply
```

`status` es read-only. Un registro ausente informa `UNINITIALIZED PASS`; uno
inicializado verifica el puntero, metadata, snapshots y reporta solamente
`MATCH` o `MISMATCH` contra los dos env activos, sin valores ni hashes.

`bootstrap` sin `--apply` es dry-run. Con `--apply`, que no se ejecuta durante
D.1, solo puede inicializar un registro vacío: crea una generación staging,
publica por rename atómico y después publica el puntero. Si falla, limpia lo
que haya creado y no sobrescribe generaciones existentes.

El módulo interno incluye un escritor de env allowlistado para una fase futura:
rechaza claves duplicadas y valores por CLI, conserva líneas no relacionadas y
reemplaza de forma atómica. D.1 no lo invoca sobre ningún archivo real.

## Vínculo de backup y restore

Los manifests permanecen en schema 3. Si el registro no existe, un backup nuevo
no añade campo alguno. Si está inicializado y los dos env activos coinciden
exactamente con la generación actual, el create añade opcionalmente
`externalSecretGenerationId`.

La verificación de un manifest legacy sin ese campo sigue siendo compatible. Si
lo incluye, valida UUID y, cuando el registro local está disponible, exige que
la generación referenciada exista. Restore trata un manifest sin identificador
como legacy; con identificador exige, antes de armar una operación destructiva,
que esa generación sea además la activa en `current.json` y que ambos env
activos coincidan byte a byte con sus snapshots. Restore repite esta validación
después de adquirir su lock y revalidar los backups, antes de detener servicios.
No cambia automáticamente los env.

## Próximos gates

1. Diseñar y ejecutar D.6 como aceptación agregada de rotación/recovery, sin
   iniciar automáticamente otra rotación.
2. Mantener los valores reales fuera del repositorio y requerir autorización
   operativa explícita para cualquier mutación futura.
3. Preservar los procedimientos específicos para claves de cifrado con estado y
   raíces de instalación; no tienen autorización live genérica.
4. Documentar evidencia sanitizada y completar SH-04.3E/F.

## D.2 — Dashboard credential rotation

Corrección R2: la generación cero captura los envs únicamente después de tomar
el lock común. Antes de publicar `current.json` relee ambos archivos y exige
coincidencia binaria; después del commit exige generación activa publicada y
`MATCH` antes de liberar el lock. Un cambio pre-commit no publica puntero y un
estado post-commit no verificable queda interbloqueado para recuperación
controlada.

`DASHBOARD_PASSWORD` es consumido por `api-gw`: el entrypoint de Envoy deriva
`DASHBOARD_BASIC_AUTH` de `DASHBOARD_USERNAME` y la contraseña. La rotación
futura recreará únicamente `api-gw`; según la topología actual, Studio no exige
recreación solo por este cambio. D.2A no altera Compose ni recrea servicios.

La herramienta tracked `rotate-dashboard-password.mjs` admite exclusivamente
`rotate` y `rollback`, ambos dry-run por defecto y mutables únicamente con
`--apply`. Genera la contraseña en memoria con `randomBytes(32).toString("base64url")`,
no acepta contraseñas por CLI y nunca imprime valores, hashes ni longitudes.
La única variable que puede modificar es `DASHBOARD_PASSWORD`.

Cada transición exige registro inicializado, generación actual activa y MATCH,
adquiere `external-secrets/.operation.lock`, crea una generación inmutable con
razón `dashboard-rotation` y `sourceGenerationId`, actualiza atómicamente el
env y finalmente cambia `current.json`. Backup create y restore destructivo
fallan cerrados mientras exista ese lock. Rollback solo acepta generaciones con
Godel idéntico y una diferencia efectiva exclusiva de `DASHBOARD_PASSWORD`.

`external-secrets/.operation.lock` es el único dominio exclusivo de estado de
secretos para bootstrap apply, rotate/rollback, backup create y restore
destructivo. Es distinto del backup lock y del restore failure marker; verify
sigue siendo read-only. Status informa `BUSY` mientras ese lock exista. Ante un
fallo pre-commit se compensa y verifica la generación fuente; ante un fallo
post-commit o compensación no demostrable, el lock se preserva para recuperación
controlada.

Plan D.2B: `UNINITIALIZED → bootstrap generación cero → MATCH → rotación
Dashboard → generación uno MATCH → recreación dirigida api-gw → contraseña
anterior rechazada/nueva aceptada → regresión runtime → verify recovery`. Si la
aceptación operacional falla después del commit, se invoca rollback Dashboard
dirigido a la generación fuente, se recrea api-gw y se valida acceso/rutime.
No existe rollback genérico de secretos.

### Evidencia operacional D.2B-R1

El primer intento D.2B se detuvo como `FAIL / DIAGNOSTIC`: asumía un api-gw
publicado en localhost. El override activo `infra/supabase-godel.override.yml`
elimina intencionadamente esos puertos; es una propiedad de seguridad y no se
expuso Studio ni api-gw para la operación.

La aceptación canónica de Dashboard es un probe interno de operador: contenedor
Godel app → `api-gw:8000` → Envoy Basic Auth → Studio. Las credenciales pasan
del snapshot de generación a memoria del proceso host, stdin y memoria del
contenedor; nunca a argv, environment ni salida. Nginx público Godel solo
expone `/auth/v1/`, `/rest/v1/` y `/storage/v1/`, no Studio.

La secuencia real aprobada completó GEN0, backup schema3 asociado a GEN0,
rotación GEN0→GEN1, recreación exclusiva de api-gw, rollback GEN1→GEN0 con su
recreación exclusiva y rotación final GEN0→GEN2. El acceptance final confirmó
GEN2 200; GEN0, GEN1 y sin credenciales 401; api-gw permaneció sin puerto host.
GEN1 se conserva inmutable como evidencia de rollback. El backup schema3 final
está asociado a GEN2; los dos backups históricos anteriores a generaciones se
retienen sin modificación. No hubo restore destructivo ni rotación de secretos
fuera de `DASHBOARD_PASSWORD`.

### Cierre D.2: recovery, retención y aceptación final

**ACTIVE RECOVERY BASELINE = `20260825T154827Z-56aa0d13`.** Es el backup
schema 3 completo y verificado más reciente asociado a la generación externa
actual GEN2 después de la rotación Dashboard validada. El artefacto
`20260823T140840Z-7c7b0d39` ya no es baseline activo: sigue retenido como
histórico.

| Artefacto retenido | Rol | Schema | Generación externa | Estado | Significado |
| --- | --- | --- | --- | --- | --- |
| `20260825T154827Z-56aa0d13` | ACTIVE RECOVERY BASELINE | 3 | GEN2 | VERIFY PASS | Baseline recovery actual post-rotación Dashboard. |
| `20260825T152125Z-95cf8bfd` | PRE-ROTATION / ROLLBACK BASELINE | 3 | GEN0 | VERIFY PASS | Baseline inmediatamente anterior a la rotación Dashboard. |
| `20260823T140840Z-7c7b0d39` | HISTORICAL PRE-GENERATION BASELINE | 3 | ausente / legacy | VERIFY PASS | Baseline histórico pre-generaciones. |
| `20260823T011543Z-c0abd277` | HISTORICAL DESTRUCTIVE-RESTORE EVIDENCE | 3 | ausente / legacy | VERIFY PASS | Evidencia histórica de restore destructivo. |

Retención de generaciones: GEN0 queda retenida y referenciada por el backup
pre-rotación; GEN1 queda retenida, inmutable y sin dependencia de backup como
evidencia intermedia de rollback hasta D.6; GEN2 es `CURRENT / MATCH` y queda
referenciada por el active recovery baseline. No se documentan valores secretos.

Aceptación final sanitizada: Supabase 11/11 healthy; Godel 2/2 healthy;
live/ready 200/200; Basic Auth GEN2 200, GEN0 401, GEN1 401 y sin credenciales
401; api-gw sin puertos host. Login fresco admin y dashboard SSR PASS; Storage
mantiene 131 objetos, P-26-0344 en `en_revision` y PDF congelado de 131075 bytes
con descarga protegida exacta PASS. No se observaron errores recientes JWT,
ENODATA, xattr o metadata. No hubo restore destructivo; solo rotó
`DASHBOARD_PASSWORD` y no se expusieron valores secretos.

Estado D.2: D.0, D.1, D.2A, D.2B y D.2 `CLOSED / APPROVED`. Su baseline activo
queda retenido como histórico GEN2 tras el cierre posterior de D.3.

## D.3A — Opaque API key rotation tooling

D.3A está `CLOSED / APPROVED`. Trata `SUPABASE_PUBLISHABLE_KEY` y
`SUPABASE_SECRET_KEY` como un único set operativo coherente con sus copias
Godel. El tooling prepara una
generación inmutable sin cambiar envs, puntero ni runtime; activar y rollback
mutan ambos envs bajo el lock común, compensan fallos pre-pointer y preservan
el lock ante incertidumbre post-pointer.

La clave publishable se inyecta como ARG/ENV del builder antes de `npm run build`;
por ello D.3B requiere rebuild y recreate de app Godel. La secret es solo runtime
server-side y también requiere recreate de app. El cutover futuro recreará
api-gw, Studio y Functions; no Auth, Rest, Realtime, Storage, DB, Supavisor,
Meta, Imgproxy ni Nginx por las claves. Nginx puede usarse para mantenimiento de
ingress, pero no consume las claves. No hay fallback a claves legacy ni cambio
de exposición host; no se espera invalidación de sesiones.

### D.3A-R1 — validación de roles, contexto Docker y contrato de imágenes

D.3A-R1 queda incorporada en D.3A `CLOSED / APPROVED`. Cada variable
publishable acepta únicamente una opaque key publishable y cada variable secret
únicamente una opaque key secret; ambas también deben validar el checksum del
helper upstream fijado. Esta fase tracked-only no lee GEN2: su compatibilidad de
checksum queda `NOT READ` hasta el preflight controlado de D.3B.

El contexto Docker de la app excluye `compose.env.*`, recovery material,
backups y todo `infra/supabase/`. El runner final de la imagen solo recibe el
standalone de Next, `public` y static assets; ello no vuelve aceptable enviar
secretos, recovery o datos persistentes al builder. El cache histórico del
builder local es `POTENTIALLY CONTAINS secret/runtime context`: no se afirma
compromiso ni filtración, sino que esos paths no estaban garantizados fuera del
contexto. D.3B definirá una limpieza específica del builder/buildx, nunca
`docker system prune`, después de validar la estrategia segura y de inspeccionar
la imagen final con resultados sanitizados `PRESENT`/`ABSENT`.

Secuencia D.3B diseñada: GEN2 `CURRENT / MATCH`; backup fresco generation-aware;
prepare GEN3; conservar el image ID GEN2 bajo
`godel-design-app:opaque-gen2-<nonsecret-id>`; prebuild de una imagen GEN3 con
`godel-design-app:opaque-gen3-<nonsecret-id>` sin sobrescribir `local` y usando
su snapshot Godel protegido como `docker compose --env-file`, nunca la key en
la línea de comandos. Sigue inspección de la candidate y confirmación de salud
GEN2; maintenance de Nginx; activate GEN3; recreate de api-gw, Studio, Functions
y app desde la imagen preconstruida; aceptación interna y regresión
browser/Auth/Storage. Si falla, rollback env/current a GEN2, recreación de
consumidores y app desde la imagen GEN2 preservada, y prueba de recovery GEN2.
Si pasa, retag seguro de la imagen GEN3 aceptada como `local`, conservando el
tag GEN2 hasta D.6, seguido del backup schema3 post-D.3. D.3 rota solo las dos
opaque keys y sus copias Godel; Envoy mantiene los JWTs asimétricos internos
actuales sin rotarlos.

### D.3B.0-R4A — hardening de divulgación en logs de build

El primer build candidato GEN3 falló durante `npm ci` por un `ECONNRESET`
transitorio de red. El siguiente build completó, pero su historial BuildKit
registró la publishable opaque porque el gate de presencia usaba interpolación
shell. No se expuso una secret; aun siendo una clave publishable pública, esa
salida de valores incumple el contrato de no divulgación.

R4A elimina los `ENV` públicos persistentes del builder y sustituye el gate por
una validación Node que solo puede informar el nombre de la variable ausente.
Los dos `ARG` públicos permanecen disponibles exclusivamente para los `RUN` del
builder, incluido `npm run build`; la imagen final no persiste esos valores por
`ENV`. El audit estático bloquea la reintroducción de interpolación shell de la
publishable en `RUN`, `ENV` públicos persistentes y cualquier `ARG`/`ENV` de
`SUPABASE_SECRET_KEY`.

GEN3 continúa preparada y no actual. La candidate afectada no está autorizada
para cutover; GEN3 solo podrá reutilizarse después de un rebuild endurecido y
aceptado. GEN2 permanece como `CURRENT / MATCH`; R4A no activa ni revierte
generaciones, no modifica runtime, envs, backups, restore ni material secreto.

R4B deberá, bajo autorización operativa separada, retirar únicamente los
registros BuildKit afectados con `docker buildx history rm <ref>` (sin `--all`),
reconstruir la misma GEN3 con `--no-cache`, inspeccionar el nuevo historial para
probar ausencia de publishable y secret, inspeccionar la candidate resultante y
limpiar solo cache del builder. Tras confirmar ausencia del historial afectado,
GEN2 runtime permanecerá intacta hasta el cutover autorizado. R4A no ejecuta
ninguna de esas operaciones.

### D.3B.0-R5A — transporte publishable no persistente de BuildKit

R4B demostró que la corrección del gate shell no eliminaba la divulgación: el
valor publishable seguía entrando por `ARG` y BuildKit lo retenía como metadata.
El transporte por `ARG` de `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` queda por
tanto retirado. Esto es comportamiento esperado de Docker, no un defecto suyo.

R5A adopta un mount secreto BuildKit requerido con id
`godel_supabase_publishable_key`, limitado al mismo `RUN` que ejecuta la build
de Next. El valor se entrega solo al environment del proceso hijo `npm run
build`; no se copia el archivo montado ni se persiste como ARG, ENV, historial
de imagen o config. `NEXT_PUBLIC_SUPABASE_URL` permanece como ARG no secreto.
`SUPABASE_SECRET_KEY` sigue siendo exclusivamente runtime server-side.

La publishable continúa siendo pública por diseño y debe existir en los
artefactos browser compilados. El mount secreto es exclusivamente un canal de
entrada build-time no persistente; no modifica su clasificación ni pretende
convertirla en un secreto servidor. La configuración runtime de la app mantiene
las cuatro variables vigentes sin cambios.

La sonda Compose sintética R5A verifica que `--env-file` suministra el source
top-level `secrets.environment` en un builder efímero, y prueba con un valor no
Supabase que dicho input queda ausente de logs/metadata BuildKit, historial e
image config, pero presente en un artefacto deliberado. El builder, image,
historial y cache de la sonda se eliminan de forma aislada.

GEN3 permanece preparada y reutilizable; no se requiere GEN4. R5A no modifica
la candidate real ni el historial R4B `xr6qed7j28px2sktzsmgyjbrr`. R5B deberá,
tras revisión del cambio tracked, reconstruir la misma GEN3 y repetir los gates
operacionales antes de considerar cutover.

### D.3B.0-R5A-R1 — contrato de invalidación de caché BuildKit

Los contenidos de un secret mount de BuildKit no participan en la invalidación
de caché. Por tanto, cambiar la publishable de GEN2 a GEN3 no debe depender de
que el contenido del mount cambie: Godel declara
`GODEL_PUBLIC_BUILD_NONCE` inmediatamente antes del `RUN` que consume el mount
publishable y ejecuta la build de Next. El `RUN` rechaza un nonce ausente o
vacío, informando solo el nombre de la variable.

El nonce es un UUID nuevo, no secreto, por cada invocación del helper de build.
No es credencial, material de generación, material de recovery ni información
confidencial; puede aparecer en argv, metadata o historial de build. No se
deriva, codifica ni hashea desde una publishable. Así invalida únicamente la
capa de Next que recibe el mount y permite reutilizar capas previas de
dependencias.

`compose.yaml` exige el mismo nonce como build arg sin default. Cualquier
operación directa `docker compose build app` debe suministrar un nonce fresco no
secreto; un valor estático reintroduciría el riesgo de artefacto browser
obsoleto. R5B debe usar uno fresco incluso cuando mantenga `--no-cache`: es una
defensa en profundidad y el contrato durable para futuros builds con caché.

La sonda R5A-R1 aislada construye A con input/nonce sintéticos y luego B con
otro input/nonce sin `--no-cache`. Confirma que el artefacto B contiene solo B,
no A, mientras ambos inputs quedan ausentes de logs y metadata BuildKit,
historial Docker e image config. Solo limpia builder, imágenes, historial y
caché sintéticos; no modifica GEN2, GEN3, candidate, builder, historial o caché
reales.

### D.3B.0-R5B — candidate GEN3 endurecida

D.3B.0-R5B reutilizó la misma GEN3 y reconstruyó satisfactoriamente la imagen
candidate endurecida. La publishable se transportó mediante el mount secreto
efímero de BuildKit y se usó un `GODEL_PUBLIC_BUILD_NONCE` nuevo y no secreto.
Los logs y metadata de BuildKit, el historial Docker y la configuración final de
imagen no contienen valores opaque GEN2/GEN3, URL ni variables build `ENV`
publishable/secret; tampoco quedaron paths de filesystem prohibidos.

La comprobación de pairing de la candidate confirmó publishable GEN3 presente,
publishable GEN2 ausente y ambas secret ausentes. El pairing de la imagen rollback
GEN2 y la remediación de caché del builder pasaron. GEN2 permaneció
`CURRENT / MATCH` durante todo el pre-cutover. No se documentan valores opaque.

### D.3B.1 — cutover real, drill de rollback y activación final

D.3B.1 está `CLOSED / APPROVED / PASS`. El cutover inicial GEN2 a GEN3 cambió
la generación externa, recreó exclusivamente `api-gw`, Studio, Functions y la
app Godel con la imagen GEN3 preconstruida. No se recrearon servicios Supabase no
relacionados.

La aceptación inicial GEN3 pasó la matriz publishable, la matriz secret/Auth
Admin, login fresco, dashboard SSR, Storage, descarga protegida y fixtures. El
rollback no fue teórico: GEN3 a GEN2 pasó con recreación de consumidores opaque
y restauración de Godel desde la imagen GEN2 exacta preservada. GEN2 publishable
fue aceptada, GEN3 publishable rechazada, GEN2 secret pasó Admin y GEN3 secret
fue rechazada; login, SSR, Storage y PDF también pasaron. Después GEN2 volvió a
la misma GEN3 con éxito. No se generó GEN4.

El estado final es GEN3 `CURRENT / MATCH`. La candidate GEN3 aceptada quedó
canonicalizada como `godel-design-app:local`; el tag rollback
`godel-design-app:opaque-gen2-62adec7b` queda retenido al menos hasta D.6.

#### Baseline de recovery y retención tras D.3

**ACTIVE RECOVERY BASELINE = `20260825T225645Z-b3854175`.** Es el backup
schema 3 completo, `COMPLETE` y verificado, asociado a GEN3 después del cutover
final. Sustituye el baseline activo anterior como baseline recovery actual; los
backups previos siguen siendo válidos y retenidos. PPO-06 conserva la
responsabilidad de la política final de retención y off-host.

| Artefacto retenido | Rol | Schema | Generación externa | Estado |
| --- | --- | --- | --- | --- |
| `20260825T225645Z-b3854175` | ACTIVE RECOVERY BASELINE | 3 | GEN3 | COMPLETE / VERIFY PASS |
| `20260825T184210Z-6658ddaa` | PRE-D.3 / GEN2 ROLLBACK RECOVERY BASELINE | 3 | GEN2 | VERIFY PASS |
| `20260825T154827Z-56aa0d13` | D.2 GEN2 HISTORICAL BASELINE | 3 | GEN2 | VERIFY PASS |
| `20260825T152125Z-95cf8bfd` | GEN0 HISTORICAL BASELINE | 3 | GEN0 | VERIFY PASS |
| `20260823T140840Z-7c7b0d39` | HISTORICAL PRE-GENERATION BASELINE | 3 | legacy / sin generación | VERIFY PASS |
| `20260823T011543Z-c0abd277` | HISTORICAL DESTRUCTIVE-RESTORE EVIDENCE | 3 | legacy / sin generación | VERIFY PASS |

#### Aceptación final sanitizada D.3

Supabase quedó 11/11 healthy y Godel 2/2 healthy; `/live` y `/ready` devolvieron
200, y `api-gw` no expone puertos host. Los fixtures mantuvieron P-26-0344 en
`en_revision`, 131 objetos Storage y el PDF congelado de 131075 bytes con
descarga protegida exacta PASS. Login fresco admin, dashboard SSR y validación
visual pasaron. No se observaron regresiones JWT, ENODATA, xattr ni metadata de
Storage; los locks y el restore failure marker quedaron ausentes.

D.3 rotó exclusivamente `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`,
junto con las copias Godel `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y
`SUPABASE_SECRET_KEY`. No rotó `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
claves EC, `POSTGRES_PASSWORD`, la raíz pgsodium, cifrado Realtime/Vault ni otros
secretos. Las sesiones Auth no se invalidaron por esta rotación opaque. No se
documentan valores opaque.

#### Contrato final de build

`NEXT_PUBLIC_SUPABASE_URL` permanece como Docker `ARG` no secreto.
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, aunque es público por diseño, se entrega
en build mediante mount secreto efímero BuildKit para transporte no persistente;
esto no lo reclasifica como confidencial. `GODEL_PUBLIC_BUILD_NONCE` es un UUID
fresco no secreto por build y fuerza la invalidación de la capa Next porque el
contenido de un secret mount no invalida caché. `SUPABASE_SECRET_KEY` es solo
runtime server-only y nunca input de build.

## Estado y siguiente handoff

D.0, D.1, D.2, D.3, D.4A y D.4B están cerrados; D.3C conserva el cierre
documental histórico de D.3. En aquel corte, D.5/D.6 seguían pendientes y D.5
requería su propio gate, sin quedar autorizada por ese cierre documental.

Estado actual: D.5 está `COMPLETE / APPROVED` tras su gate propio y D.6 está
`CLOSED / APPROVED / PASS`; SH-04.3D queda `CLOSED / APPROVED`.

## D.4A.0 — Auditoría arquitectónica de rotación legacy JWT

D.4A.0 es una auditoría read-only `PASS`; D.4A permanece `PENDING
ARCHITECTURAL / OPERATIONAL DESIGN`. No se generaron claves, no se modificaron
generaciones, envs, `current.json`, DB, Storage ni runtime. El baseline auditado
es GEN3 `CURRENT / MATCH` y el active recovery baseline
`20260825T225645Z-b3854175` (schema 3, GEN3, `VERIFY PASS`). Runtime observado:
Supabase 11/11, Godel 2/2, live/ready 200/200 y api-gw sin puertos host.

### Dominio y estado criptográfico actual

D.4A concierne solo al dominio simétrico legacy: `JWT_SECRET`, `ANON_KEY` y
`SERVICE_ROLE_KEY`, más sus representaciones coherentes en `JWT_KEYS` y
`JWT_JWKS`. No incluye opaque keys, claves EC, contraseña PostgreSQL,
Dashboard, pgsodium, Realtime encryption ni Vault encryption.

La inspección en memoria confirmó que `ANON_KEY` es HS256 con rol `anon` y que
`SERVICE_ROLE_KEY` es HS256 con rol `service_role`; ambas firmas validan contra
el `JWT_SECRET` actual. Los claims estables observados en ambas son `role`,
`iss`, `iat` y `exp`; no tienen `kid`.

| Material | Estructura sanitizada | Relación actual |
| --- | --- | --- |
| `JWT_KEYS` | 2 entradas: EC/ES256 con `kid`, material privado de signing; oct/HS256 sin `kid` | Auth firma sesiones nuevas con la EC. La oct corresponde al `JWT_SECRET` actual. |
| `JWT_JWKS` | 2 entradas: EC/ES256 pública con `kid`; oct/HS256 sin `kid` | Los verificadores pueden recibir ES256 y HS256. La oct corresponde al `JWT_SECRET` actual. |
| Login QA fresco | Access JWT ES256 con `kid`, `iss` y `aud` presentes | La pareja EC vigente firma las sesiones de usuario actuales. |

En consecuencia, mantener byte a byte las entradas EC de `JWT_KEYS` y
`JWT_JWKS` conserva las sesiones ES256 actuales. Sustituir o retirar la entrada
oct antigua invalida cualquier artefacto HS256 histórico que dependa de ella,
incluidos los legacy anon/service y antiguas sesiones HS256; no invalida por sí
solo las sesiones ES256 vigentes.

### Matriz de consumidores tracked

`DIRECT` significa que el servicio recibe el valor/configuración al arrancar;
`DERIVED` significa que consume el resultado o la setting persistida; `NO` que
no recibe este dominio.

| Servicio | `JWT_SECRET` | `ANON_KEY` | `SERVICE_ROLE_KEY` | `JWT_KEYS` / `JWT_JWKS` | Acción futura |
| --- | --- | --- | --- | --- | --- |
| Studio | DIRECT | DIRECT | DIRECT | NO | Recreate |
| api-gw / Envoy | NO | DIRECT | DIRECT | NO | Recreate |
| Auth | DIRECT | NO | NO | `JWT_KEYS` DIRECT | Recreate |
| PostgREST | DIRECT | NO | NO | `JWT_JWKS` DIRECT | Recreate |
| Realtime | DIRECT | DIRECT (healthcheck) | NO | `JWT_JWKS` DIRECT | Recreate |
| Storage | DIRECT | DIRECT | DIRECT | `JWT_JWKS` DIRECT | Recreate |
| Functions | DIRECT | DIRECT | DIRECT | `JWT_JWKS` DIRECT | Recreate |
| DB | DIRECT / PERSISTED | NO | NO | NO | SQL persistente; no recreate DB |
| Supavisor | DIRECT | NO | NO | NO | Recreate |
| Meta | NO | NO | NO | NO | Sin acción |
| Imgproxy | NO | NO | NO | NO | Sin acción |
| Godel runtime | NO | NO | NO | NO | Sin recreate |

Studio recibe `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` y `AUTH_JWT_SECRET`:
son dependencias runtime upstream y no deben retirarse. Storage recibe `ANON_KEY`,
`SERVICE_KEY`, `AUTH_JWT_SECRET` y `JWT_JWKS`; Functions recibe el secreto, el
JWKS y ambas legacy keys. Realtime recibe `API_JWT_SECRET`, `API_JWT_JWKS`,
`METRICS_JWT_SECRET` y usa `Authorization: Bearer ${ANON_KEY}` en su healthcheck,
por lo que incluso la rotación de anon exige su recreate. Supavisor también es
consumidor directo de `API_JWT_SECRET` y `METRICS_JWT_SECRET`; no pertenece a
D.5 para este efecto.

Godel usa exclusivamente la publishable opaque y la secret opaque server-only;
no consume las legacy ni el secreto JWT. Por tanto D.4A no requiere rebuild ni
recreate de la app Godel, salvo que una futura evidencia demuestre una nueva
dependencia.

### Envoy, persistencia DB y solapamiento

El entrypoint de Envoy materializa `lds.template.yaml` en el arranque. La
plantilla contiene una comparación exacta única para cada legacy anon y service
role, además de las claves opaque, que se traducen hacia los JWT asimétricos
internos. Ambas legacy siguen siendo inputs válidos del gateway. Rotarlas exige
recreate de api-gw; la configuración actual no acepta old/new legacy values en
paralelo. Por tanto el solapamiento de API keys legacy es **REQUIRES TRACKED
ENVOY CHANGE** y no forma parte de D.4A.0.

`volumes/db/jwt.sql` ejecuta `ALTER DATABASE postgres SET
"app.settings.jwt_secret"`. La consulta live read-only confirmó que la setting
está PRESENT, PERSISTED y MATCHES CURRENT. Como el script se monta en
`docker-entrypoint-initdb.d` y `PGDATA` persiste entre reinicios, cambiar solo
el env y recrear DB no vuelve a ejecutar esa inicialización. **La rotación
env-only no es suficiente.** D.4A requerirá una mutación SQL coordinada y
reversible del setting de base de datos; no requiere recrear DB.

El solapamiento temporal de verificadores HS256 old/new en `JWT_JWKS` queda
**UNPROVEN**. El stack actual contiene una sola JWK oct sin `kid` y los legacy
JWT actuales tampoco tienen `kid`; no se asume que un array con dos oct sin
identificador pueda seleccionar de forma segura la clave correcta en todos los
verificadores. D.4A no debe implementar dicho solapamiento sin una prueba
aislada y pinneada para Auth, PostgREST, Realtime, Storage y Functions.

### Estrategias evaluadas

| Opción | Ventaja | Impacto / coste | Estado |
| --- | --- | --- | --- |
| A — hard cut atómico | Sigue la configuración Envoy actual; dominio legacy coherente y rollback claro | Maintenance ingress; invalida HS256 histórico y legacy old | Recomendada, condicionada a pre-backup y aceptación completa |
| B — overlap de verificadores | Podría reducir la interrupción HS256 | No probado para dos oct sin `kid`; Envoy requiere cambio tracked | No seleccionar |
| C — retirar/reducir legacy | Godel ya usa opaque y reduce superficie legacy | Requiere diseño explícito de compatibilidad upstream y de servicios internos | Estrategia posterior, no sustituto de D.4A |

La recomendación actual es **Opción A**: preservar exactamente la pareja EC y
los JWT asimétricos internos, rotar como set atómico `JWT_SECRET` + anon +
service_role + entradas oct correspondientes, y tratar el material HS256 previo
como revocado al completar el cutover. Nginx debe detenerse como maintenance
ingress gate para impedir estados mixtos. No se afirma soporte de rollback
automático fuera de la generación anterior restaurada de forma coordinada.

### Contrato futuro de generación, recovery y recreación

Una generación candidata D.4A debe cambiar en el snapshot Supabase
`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_KEYS` y `JWT_JWKS`; no debe
cambiar el env Godel. Las entradas EC de ambos keysets y los JWT asimétricos
relacionados deben permanecer byte-idénticos; solo cambia la entrada oct y las
dos JWT legacy derivadas. Debe existir un `D4A_PRE_ROTATION_BACKUP` ligado a
GEN3 inmediatamente antes del cutover y un nuevo baseline solo después de la
aceptación.

El generador upstream `generate-keys.sh` es **NOT AUTHORIZED** para D.4A live:
imprime `JWT_SECRET`, anon y service role y puede actualizar `.env`.
`add-new-auth-keys.sh` y `rotate-new-api-keys.sh` son también **NOT AUTHORIZED**
para esta fase: imprimen material y el primero regenera dominios EC/opaque fuera
de alcance. Son únicamente referencia de formato. El helper existente genera el
secreto con CSPRNG OpenSSL base64 de 30 bytes y firma HS256 con header estándar;
una futura herramienta segura debe generar en memoria al menos esa entropía,
preferiblemente 32 bytes CSPRNG, y nunca aceptar ni imprimir valores por CLI.
Debe emitir anon/service con los claims observados `role`, `iss`, `iat`, `exp`.

El rollback futuro restaura conjuntamente la generación GEN3 fuente, sus dos
JWK oct, anon/service legacy, el setting DB persistido y los contenedores
afectados. Orden propuesto, siempre con Nginx detenido: backup pre-cutover,
publicación atómica de generación, SQL de setting DB, recreate de Rest, Realtime,
Storage y Functions, luego Auth, Studio y Supavisor, y api-gw al final. DB, Meta,
Imgproxy y Godel no se recrean. El mismo orden invertido de valores, con
validación, sirve para rollback.

La aceptación futura debe probar de forma sanitizada: new/old anon y
service_role según la política atómica, publishable y secret opaque vigentes,
login ES256 fresco, supervivencia de una sesión ES256 pre-cutover, REST, Storage,
Realtime, Functions y Auth Admin opaque. Quedan abiertas la prueba aislada de
overlap HS256 y una decisión explícita de retiro legacy posterior a D.4A.

### D.4A.1 — tooling seguro de rotación legacy

D.4A.1 está `IMPLEMENTED / APPROVED`; D.4A queda `IN PROGRESS / NOT YET
ROTATED`. Se implementó `rotate-legacy-jwt-keys.mjs` con `prepare`, `activate`
y `rollback`, todos dry-run por defecto y mutables únicamente con `--apply`.
No se ejecutó ninguna operación real durante esta fase.

La estrategia es hard cut atómico. Una generación candidata puede modificar
exclusivamente `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_KEYS` y
`JWT_JWKS` en el snapshot Supabase; `godel.env` permanece byte-idéntico. La
reason allowlist incorpora `legacy-jwt-rotation` sin cambio de schema. El
validador reusable exige HMAC HS256 con el secreto como raw string, roles
correctos, `iss="supabase"`, `iat`/`exp` enteros y header sin `kid`.

La candidate genera el secreto en memoria mediante CSPRNG Node de 32 bytes en
base64, crea anon/service con la lifetime upstream-compatible de cinco años y
deriva una sola JWK oct HS256 en ambos keysets. Exige exactamente una EC/ES256 y
una oct/HS256 por keyset, preserva semánticamente las EC, y rechaza cualquier
cambio de los JWT asimétricos, opaque keys u otro env.

Activation y rollback incluyen el setting DB `app.settings.jwt_secret`. El
adapter productivo usa el servicio Compose canónico `db`, nunca un container ID,
y comunica SQL exclusivamente por stdin de `psql` con `spawn` sin shell. La clave
no entra en argv, stdout, stderr ni archivos SQL. Antes del cambio comprueba que
DB coincide con la generación actual; después de `ALTER DATABASE` abre una nueva
sesión para verificar target. No recrea DB.

El puntero de generación es el commit lógico. Antes de ese punto, un fallo
restaura primero DB y después los cinco env, verificando ambos contra la fuente.
La compensación trata cualquier intento de mutación DB pre-puntero como
potencialmente persistido, incluso si el cliente devuelve error; fuerza y
verifica la fuente en una sesión DB nueva antes de liberar el lock.
Tras el puntero, cualquier incertidumbre conserva el lock y falla cerrado. Solo
se permite forward/rollback entre generaciones directamente relacionadas; el
rollback y la reactivación de la misma candidate usan el mismo motor.

Las pruebas sintéticas cubren prepare aislado, allowlist de cinco variables,
preservación EC/Godel, firma HMAC, precondición DB, orden env→DB→pointer,
compensación, fail-closed post-commit, rollback, reactivación y no divulgación.
El audit de seguridad bloquea que el tool invoque los generadores upstream que
imprimen material y exige transporte DB por stdin.

Siguiente secuencia: **D.4A.2 candidate preparation / pre-cutover** y después
**D.4A.3 real cutover / rollback drill**. Ninguna está autorizada por D.4A.1.

### D.4A.2-R1 — compatibilidad Compose recovery / build nonce

El primer intento de D.4A.2 se detuvo durante el preflight del backup, antes de
maintenance, backup nuevo o generación GEN4. GEN3 permaneció `CURRENT / MATCH`.
La causa fue que `compose.yaml` exige el build-only
`GODEL_PUBLIC_BUILD_NONCE` incluso para interpolar operaciones Compose runtime,
mientras `compose.env.local` no lo persiste por diseño.

Backup y restore usan ahora un sentinel no secreto, process-local y exclusivo
del wrapper Compose runtime; no se escribe en envs ni se inyecta en contenedores.
El wrapper permite únicamente `config`, `ps`, `start` y `stop`, por lo que no
puede convertirse en una vía de build. El contrato de nonce fresco del helper
de build permanece intacto. D.4A sigue `IN PROGRESS / NOT YET ROTATED`; D.4A.2
queda pendiente de reanudación operativa tras review de R1.

El dry-run canónico posterior completó el preflight `PASS` y finalizó como
`dry-run PASS; planned maintenance sequence only`. No creó backup, no ejecutó
stop/start, no produjo GEN4 y no cambió runtime persistente, configuración,
secretos, contenedores ni imágenes. La reanudación de D.4A.2 sigue requiriendo
su autorización operacional explícita.

### D.4A.2 — candidate legacy JWT y baseline pre-cutover

`D4A_PRE_ROTATION_BACKUP` `20260826T115517Z-759d4281` quedó `COMPLETE`, schema
3, asociado a GEN3 y con `VERIFY PASS`. Su maintenance canónico temporal fue
recuperado con IDs de contenedor e imágenes preservados. GEN4
`1624fd00-f872-4c3e-8c0b-76a9a65ba656` quedó `PREPARED / NOT CURRENT`, derivada
de GEN3, con exact five-variable diff, contrato crypto legacy y preservación
EC/asimétrica/opaque/demás dominios en `PASS`; activate dry-run pasó y DB sigue
GEN3 MATCH.

Fresh admin login y dashboard interactivo pasaron; los diagnósticos browser no
bloqueantes. `P-26-0344` permanece `en_revision`, Storage conserva 131 objetos
y la descarga interna autenticada del PDF congelado pasó con 131075 bytes y
magic `%PDF`. GEN3 sigue `CURRENT / MATCH` y GEN4 no está aplicada.

D.4A.2 es `CLOSED / CANDIDATE PREPARED / PRE-CUTOVER BASELINE ACCEPTED`.
D.4A sigue `IN PROGRESS / NOT YET ROTATED`; D.4A.3 permanece `NOT AUTHORIZED /
PENDING ARCHITECTURAL REVIEW`.

### D.4A.3-R2 — fail-closed adapter and safe stage diagnostics

El intento inicial de D.4A.3 se detuvo de forma segura sin completar cambio de
puntero ni recreación de servicios. R0 clasificó primero el secreto DB
compartido como GEN2; R1 comprobó que GEN2 y GEN3 conservan byte-idénticos los
cinco artefactos legacy, que el adaptador canónico y el dry-run oficial aceptan
GEN3, y que el drift de fuente queda descartado.

R2 endurece el transporte canónico de `psql` con `ON_ERROR_STOP=1` y separa
diagnósticos sanitizados para guardia fuente, recheck bajo lock, ejecución DB
target y verificación DB target. Los contratos fail-closed post-commit y de
compensación permanecen intactos. No se registran secretos, SQL, stderr ni
valores JWT. GEN4 continúa `PREPARED / NOT CURRENT`; D.4A.3 queda
`PENDING RE-EXECUTION`.

### D.4A.3-R4A/R4B/R4C — recovery and retirement of the DB JWT GUC

El primer cutover quedó safe-stopped. R4A confirmó que el bloqueo era la falta
de privilegio `SET` para el parámetro GUC custom; R4B recuperó GEN3 y el runtime
normal sin conceder ese privilegio de forma persistente. La resolución
arquitectónica R4C retira la dependencia `app.settings.jwt_secret`: Godel no
tiene consumidor SQL y la exposición DB/PostgREST era innecesaria. Se conserva
intencionalmente `app.settings.jwt_exp`.

R4C modifica solo el contrato tracked: instalaciones nuevas ya no persisten el
secreto JWT como GUC. El GUC GEN3 existente en runtime queda pendiente de
retiro controlado. GEN4 sigue `PREPARED / NOT CURRENT`; el retry de D.4A.3 no
está autorizado.

### D.4A.3-R4D-R1-R2 — cierre de convergencia runtime y aceptación post-retiro

`R4C/R4C-R1` queda aplicado como retiro arquitectónico aprobado. La convergencia
runtime R4D se completó entre R4D-R1 y esta aceptación R1-R2, sin reintentar
D.4A.3 ni activar GEN4. GEN3 permaneció `CURRENT / MATCH`; GEN4 permanece
`PREPARED / NOT CURRENT`.

La verificación nueva de DB confirmó que el default
`app.settings.jwt_secret` está `ABSENT`, también en una sesión fresca. Se
conservan `app.settings.jwt_exp` `PRESENT` y el privilegio `SET` de `postgres`
en `NO`. El contrato efectivo de PostgREST conserva `PGRST_JWT_SECRET` y
`PGRST_APP_SETTINGS_JWT_EXP`, y no contiene
`PGRST_APP_SETTINGS_JWT_SECRET`.

La aceptación funcional read-only pasó: login admin fresco y workspace
interactivo, JWT nuevo `ES256` con `kid`, compatibilidad de las claves legacy
anon/service de GEN3 y de las claves opaque publishable/secret de D.3. El
pedido congelado `P-26-0344` sigue `en_revision`; Storage conserva 131 objetos.
La descarga protegida autenticada pasó para múltiples artefactos QA equivalentes
con redirect firmado hacia el origen público, content type PDF, 131075 bytes y
magic `%PDF`. Tamaño y magic son características de integridad, no una identidad
única de objeto.

Supabase permaneció 11/11 healthy, Godel 2/2 healthy y live/ready devolvieron
200/200; api-gw no expone puertos host y el lock estuvo ausente. La evidencia de
preservación de contenedores se clasifica `PARTIAL`: el transition conocido de
rest de R4D-R1 se conserva como evidencia operacional y esa fue la única
recreación; DB y los demás servicios Supabase no fueron recreados, Godel app no
fue recreada y Nginx fue solo stop/start. La matriz completa de IDs anterior a
R4D-R1 no se retuvo a través del handoff de sesión, sin evidencia contradictoria;
esta limitación histórica no afecta el comportamiento ni el estado de seguridad
verificados.

R4D queda `RUNTIME CONVERGENCE + ACCEPTANCE COMPLETE`. El contenedor DB puede
seguir reteniendo residuo histórico de `JWT_SECRET` en su entorno Docker hasta
un futuro mantenimiento/recreate de DB revisado por separado; ese residuo es
distinto de `app.settings.jwt_secret`, ya ausente de PostgreSQL.

### D.4A.3-R5/R5-R1/R5-R2 — incidente Compose y guardrail de procedencia

R5 intentó el hard cut GEN3 → GEN4 y la activación legacy pasó. La convergencia
se detuvo antes de abrir ingress: una recreación empleó el Compose upstream/base
sin `infra/supabase-godel.override.yml`, publicando puertos host de api-gw y
Supavisor. La causa se clasifica `INCORRECT_COMPOSE_PROFILE /
GODEL_OVERRIDE_OMITTED`; no se abrió ventana de aceptación GEN4.

R5-R1 contuvo los puertos, realizó rollback GEN4 → GEN3 y recreó los ocho
consumidores con base más override Godel. La aceptación completa de GEN3 pasó;
el estado final es GEN3 `CURRENT / MATCH`, GEN4 `PREPARED / NOT CURRENT` y el
GUC JWT de DB continúa ausente. R5 queda `FAIL / SAFE SOURCE RECOVERY` y R5-R1
queda `CLOSED / APPROVED / PASS`.

R5-R2 añade un guardrail de procedencia source-level: la fábrica de Compose
runtime Supabase fija el orden `env-file`, base y override Godel, restringe las
operaciones genéricas a `config`, `ps`, `start` y `stop`, y ofrece una ruta de
recreación dedicada exclusivamente para los ocho consumidores autorizados. No
habilita un passthrough de `up` ni permite DB, Meta o Imgproxy.

El bootstrap QA self-hosted conserva temporalmente su composición equivalente:
acepta ruta de entorno y contexto Docker explícitos, por lo que sustituirla en
este bloque alteraría su contrato de diagnósticos sin necesidad operacional.
Backup y restore también mantienen duplicación de Compose; ambos pueden iniciar,
detener o recrear servicios durante sus flujos de recovery y requieren un
hardening mecánico dedicado, no un refactor oportunista dentro de R5-R2.

### D.4A.3-R6A/R6A-R1/R6B/R6C — hard cut final y rollback probado

R6A aprobó el hard cut limpio GEN3 → GEN4 con los ocho consumidores recreados mediante la fábrica Compose guardada, sin puertos host de api-gw o Supavisor y con GEN4 saludable. R6A-R1 completó la aceptación explícita: sesiones frescas admin/supervisor/worker, dashboard, ES256 con `kid` presente y continuidad de signer, legacy GEN4 aceptada, GEN3 retirada, opaque D.3 e invariantes de negocio, Storage y PDF en PASS.

R6B aprobó el rollback real GEN4 → GEN3 y la reconvergencia de los ocho consumidores; GEN3 legacy aprobó, GEN4 legacy fue rechazada y se preservaron continuidad ES256, opaque, negocio, Storage, PDF y salud. El sistema quedó deliberadamente en GEN3 aceptado.

R6C aprobó el cutover final GEN3 → GEN4. Los ocho consumidores (rest, auth, realtime, storage, supavisor, api-gw, functions y studio) se recrearon mediante la fábrica guardada; DB, Meta, Imgproxy y Godel app no se recrearon, y nginx fue solo stop/start. GEN4 quedó `CURRENT / MATCH`, GEN3 no actual y retenida solo según la política de recovery; el lock está ausente.

La aceptación final confirmó autenticación, dashboard, ES256, `kid` presente y continuidad de signer; legacy anon/service GEN4 PASS y GEN3 REJECTED; opaque D.3 publishable/secret sin cambios; `P-26-0344` en `en_revision`; Storage 131; PDF protegido PASS; Supabase 11/11, Godel 2/2 y live/ready 200/200. Múltiples candidatos QA PDF de 131075 bytes con magic `%PDF` son válidos como características de integridad, no identidad única.

El primer harness final R6C tuvo un defecto read-only al desestructurar el campo del pedido. Los gates ya alcanzados aprobaron y un probe read-only corregido completó pedido y PDF; no hubo mutación runtime/datos ni fallo de aplicación. La clasificación anterior `EVIDENCE_INCOMPLETE` respondió a la imposibilidad de aplicar esta edición documental, no a una aceptación GEN4 pendiente.

PostgreSQL ya no participa en la rotación legacy: `app.settings.jwt_secret` está ausente, `app.settings.jwt_exp` presente y SET denegado. El guardrail Compose canónico está activo y api-gw/Supavisor no publican puertos host.

R6A, R6A-R1, R6B, R6C, D.4A.3 y D.4A quedan `CLOSED / APPROVED / PASS`. D.4B está `IN PROGRESS`; D.4B.0 queda `CLOSED / APPROVED / PASS`. Siguiente: **D.4B.1 — tooling de rotación EC y prueba determinista de solapamiento GoTrue**.

## D.4B.0 — Auditoría arquitectónica de rotación de clave EC

D.4B.0 es una auditoría arquitectónica read-only `CLOSED / APPROVED / PASS`.
D.4B queda `IN PROGRESS`. No se generaron claves EC, no se prepararon ni
activaron generaciones, y no se modificaron envs, runtime, DB, Storage ni la
aplicación.

### Bundle asimétrico actual y contratos de token

El bundle activo consiste en `JWT_KEYS`, `JWT_JWKS`, `ANON_KEY_ASYMMETRIC` y
`SERVICE_ROLE_KEY_ASYMMETRIC`. `JWT_KEYS` es JSON válido con dos claves: una
EC/ES256 con material privado de firma y `kid`, y una entrada legacy
`oct`/HS256. `JWT_JWKS` es un JWKS válido con dos claves: un verificador público
EC/ES256 y el verificador legacy `oct`/HS256; no contiene material privado EC.
El par EC privado/público actual es `MATCH`.

Los dos JWT de traducción son ES256, están firmados por el EC actual, contienen
`kid` y tienen firma válida: `ANON_KEY_ASYMMETRIC` tiene rol `anon` y
`SERVICE_ROLE_KEY_ASYMMETRIC` rol `service_role`. Ambos tienen una vida de cinco
años. No se documentan JWTs, `kid`, coordenadas JWK ni material secreto.

La vida normal de los access tokens de Auth es 3600 segundos y las sesiones
frescas de Godel son ES256. Al retirar el verificador OLD, los access tokens OLD
desaparecen naturalmente tras su TTL normal de una hora.

### Semántica de firma y publicación JWKS de GoTrue

La fuente upstream `supabase/auth` tag `v2.189.0`, `internal/conf/jwk.go`,
confirma que GoTrue admite varias entradas JWK, pero exige exactamente una cuya
lista `key_ops` contenga `sign`: falla con cero o más de una. El firmante activo
es esa JWK única; no es la primera, la última ni una selección por orden de
`kid`.

La fuente `supabase/auth` `v2.189.0`, `internal/api/jwks.go`, confirma que
`/.well-known/jwks.json` publica todas las claves asimétricas configuradas como
públicas, excluye claves simétricas `oct`, nunca publica material privado EC y
envía `Cache-Control: public, max-age=600`. El solapamiento de verificadores
asimétricos OLD+NEW es, por ello, técnicamente posible.

Supabase documenta hasta 10 minutos de caché edge y hasta otros 10 minutos de
caché en memoria de clientes. Godel es self-hosted y no usa el edge administrado
de Supabase; emplea `supabase.auth.getClaims()` sin `kid` fijado, JWKS propio ni
verificación manual con `jose`/`jsonwebtoken`. Veinte minutos no es requisito
criptográfico del runtime Godel. D.4B podrá usar una ventana conservadora de
propagación como defensa adicional, pero el gate debe preferir evidencia positiva
de que NEW está anunciado y utilizable.

### Matriz exacta de consumidores y recreación

| Consumidor | Material EC | Recreación D.4B |
| --- | --- | --- |
| Auth | `JWT_KEYS`; firma, confianza asimétrica y JWKS público | GEN5, GEN6, GEN7 |
| Rest | `JWT_JWKS` | GEN5, GEN7 |
| Realtime | `JWT_JWKS` | GEN5, GEN7 |
| Storage | `JWT_JWKS` | GEN5, GEN7 |
| Functions | `JWT_JWKS` | GEN5, GEN7 |
| api-gw / Envoy | `ANON_KEY_ASYMMETRIC`, `SERVICE_ROLE_KEY_ASYMMETRIC` | GEN6 |
| Studio | Sin dependencia EC que requiera recreación | No |
| Supavisor, DB, Meta, Imgproxy | Sin consumidor EC D.4B | No |
| Godel app | Sin secreto/clave EC directa; usa opaque y `getClaims()` | No esperado |
| Godel nginx | Sin consumidor EC/JWKS | No esperado |

### Invariantes y acoplamiento de API

D.4B no rota `JWT_SECRET`, `ANON_KEY` ni `SERVICE_ROLE_KEY`: siguen siendo la
familia legacy GEN4 aceptada. Tampoco rota `SUPABASE_PUBLISHABLE_KEY` ni
`SUPABASE_SECRET_KEY`; las claves opacas D.3 permanecen inalteradas. Quedan
fuera de alcance `POSTGRES_PASSWORD`, `DASHBOARD_PASSWORD`, `SECRET_KEY_BASE`,
`REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY` y el material raíz
de pgsodium.

El verificador `oct`/HS256 legacy debe permanecer en `JWT_JWKS` durante toda
D.4B. Así Rest, Realtime, Storage y Functions siguen aceptando los
`ANON_KEY`/`SERVICE_ROLE_KEY` GEN4. D.4B rota solo material EC.

Las claves opaque no cambian, pero sus JWT internos de traducción sí están
acoplados al firmante EC. `ANON_KEY_ASYMMETRIC` y
`SERVICE_ROLE_KEY_ASYMMETRIC` se regenerarán usando NEW en GEN6 y requerirán
recrear `api-gw`.

### Modelo aprobado de generaciones

Hay cuatro snapshots inmutables totales y tres generaciones nuevas por preparar:

| Estado | Firmante único | Verificadores confiados | Acción |
| --- | --- | --- | --- |
| GEN4 | OLD EC | OLD EC + legacy `oct` | Estado actual |
| GEN5 — ANNOUNCE NEW | OLD EC | OLD EC + NEW EC + legacy `oct` | Anunciar/publicar NEW |
| GEN6 — SWITCH SIGNER | NEW EC | OLD EC + NEW EC + legacy `oct` | Regenerar JWT de traducción |
| GEN7 — RETIRE OLD | NEW EC | NEW EC + legacy `oct` | Retirar OLD |

En GEN5, `JWT_KEYS` contiene conceptualmente OLD EC privado con `sign`, NEW EC
público verify-only y el `oct` legacy; `JWT_JWKS` contiene ambos EC públicos y
el `oct`. En GEN6, `JWT_KEYS` contiene NEW EC privado con `sign`, OLD EC
público verify-only y el `oct`; `JWT_JWKS` permanece igual a GEN5. GEN7 retira
el verificador OLD y conserva NEW y `oct`.

Antes de preparar GEN5, D.4B.1 debe demostrar contra la imagen exacta
`supabase/gotrue:v2.189.0` que un `JWT_KEYS` con un EC privado sign-capable,
otro EC public-only verify-capable y el `oct` legacy es aceptado por GoTrue.
Esta prueba determinista bloquea preparar generaciones reales; no se deduce solo
de razonamiento sobre bibliotecas.

El scope mínimo futuro de recreación es: GEN5 `auth`, `rest`, `realtime`,
`storage`, `functions`; GEN6 `auth`, `api-gw`; GEN7 `auth`, `rest`, `realtime`,
`storage`, `functions`. No incluye Studio, Supavisor, DB, Meta, Imgproxy ni la
aplicación Godel salvo evidencia posterior.

### Rollback y aceptación futura

GEN5 puede volver directamente a GEN4 porque NEW todavía no firma sesiones:
se restaura confianza OLD-only y se reconvergen Auth/verificadores. Un rollback
GEN6 no puede restaurar simplemente GEN4: debe devolver OLD como firmante único
manteniendo NEW público confiado, conservar el solapamiento, regenerar los JWT
de traducción para OLD y recrear Auth y api-gw. Desde GEN7 tampoco se salta a
GEN4; primero se restaura un estado de solapamiento con NEW público. El privado
NEW histórico se retiene bajo la política de recovery.

La aceptación futura debe probar: antes, token fresco con `kid` OLD; en GEN5,
token OLD aceptado, NEW anunciado y token fresco aún OLD; en GEN6, token fresco
NEW, OLD y NEW aceptados, opaque publishable/secret PASS, traducción asimétrica
PASS, legacy GEN4 anon/service PASS, `P-26-0344` en `en_revision`, Storage 131
y PDF protegido PASS; en GEN7, NEW aceptado, OLD rechazado y legacy HS256 aún
PASS.

Siguiente bloque: **D.4B.1 — EC rotation tooling and deterministic GoTrue
overlap proof**. D.4B.1 no autoriza una rotación productiva de claves EC sin
autorización separada.

## D.4B.1–D.4B.2-R2 — Modelo, tooling y preparación protegida EC

D.4B permanece `IN PROGRESS`. D.4B.1, D.4B.1A, D.4B.1A-R1, D.4B.1B, D.4B.1C, D.4B.1C-R1, D.4B.2, D.4B.2-R1 y D.4B.2-R2 quedan `CLOSED / APPROVED / PASS`. El siguiente bloque operativo es **D.4B.3**.

### Modelo puro y prueba exacta de GoTrue

D.4B.1A implementó el modelo puro GEN4→GEN5→GEN6→GEN7: GEN4 mantiene OLD como firmante único y verificador junto al `oct` legacy; GEN5 mantiene OLD como firmante y anuncia OLD+NEW como verificadores; GEN6 convierte NEW en firmante único, conserva ambos verificadores y regenera los JWT de traducción; GEN7 retira OLD y conserva NEW como único verificador EC junto al `oct` legacy. El modelo exige firmante único global, conteos exactos, correspondencia EC privado/público y entre `JWT_KEYS`/`JWT_JWKS`, inmutabilidad del `oct` legacy, rechazo de tipos JWK inesperados y rechazo de rollbacks directos inseguros.

D.4B.1A-R1 endureció la identidad de verificadores por material EC público real y no solo por identificador; cuenta el firmante globalmente, rechaza tipos JWK inesperados e impide que `oct` adquiera capacidad de firma. Resultado: `PASS`.

D.4B.1B validó experimentalmente contra `supabase/gotrue:v2.189.0`, usando material sintético, PostgreSQL efímero y red Docker aislada, sin secretos, DB, red ni volúmenes de producción. GEN5 emitió token OLD y anunció OLD+NEW; GEN6 emitió NEW y aceptó tokens OLD/NEW; GEN7 aceptó NEW y rechazó OLD. GoTrue también rechazó cero o múltiples firmantes y no quedaron recursos Docker de la prueba.

### Tooling de plan protegido y hardening

D.4B.1C añadió el manifiesto inmutable de plan y generaciones protegidas GEN5/GEN6/GEN7. El manifiesto se publica último: un plan solo es accionable cuando el manifiesto completo y todas sus generaciones referenciadas validan. Las transiciones forward/rollback son exclusivamente adyacentes; el env es allowlisted y se escribe antes del puntero; existe compensación pre-puntero y el estado post-puntero `COMMITTED_UNVERIFIED` es fail-closed.

D.4B.1C-R1 exige generar el plan persistido solo después de adquirir el lock y revalidar bajo lock `CURRENT/MATCH`, HEAD y árbol limpio. La limpieza previa al manifiesto es verificada: `EC_ROTATION_PLAN_CLEANUP_FAILED` conserva lock. El commit de cada etapa se liga al manifiesto y fuente/etapas deben tener IDs distintos. Resultado: `PASS`.

### Incidente D.4B.2 y corrección D.4B.2-R1

El primer intento D.4B.2 fue **PREPARATION ABORTED SAFELY** con `DUPLICATE_ENVIRONMENT_VARIABLE`. GEN4 permaneció `CURRENT / MATCH`; envs Supabase/Godel, puntero, runtime y lock no cambiaron; no quedó plan EC accionable ni etapa activada. No fue un fallo de rotación de runtime.

La revisión identificó *parser drift*: el modelo puro reconoce solo asignaciones estrictas `[A-Za-z_][A-Za-z0-9_]*=...`, pero el plan interpretaba cualquier línea con `=`. El diagnóstico read-only confirmó cero duplicados reales y un falso duplicado de comentario/no-asignación, sin documentar su contenido. D.4B.2-R1 unificó ambos componentes bajo el parser estricto: comentarios y líneas no-asignación con `=` se ignoran; asignaciones válidas duplicadas siguen fallando cerradamente. Regresiones: modelo 5/5, plan 9/9, GoTrue `PASS`, legacy 8/8 y contrato de secretos 14/14.

### D.4B.2-R2 — preparación real protegida

D.4B.2-R2 terminó `PASS / PREPARED`. GEN4 `1624fd00-f872-4c3e-8c0b-76a9a65ba656` permanece `CURRENT / MATCH`. El plan protegido es `e462b5c8-efcf-4d9b-9d3f-0a9a94319ce8`; GEN5 es `a08051f6-b831-43fa-99d1-feb2f296ffdf`, GEN6 es `b3c52d8f-a42f-45a0-aa7e-d16c1f696475` y GEN7 es `65aea10b-f0ce-4015-bfa3-98086137d303`. Son IDs estructurales del registro.

La cadena es GEN4→GEN5→GEN6→GEN7; las etapas nuevas tienen razón `ec-signing-key-rotation` y fuente inmediata anterior. NEW EC es real, generado y protegido, se comparte por GEN5/GEN6/GEN7 y **no está live**. Las transiciones y diffs validados son: GEN4→GEN5 solo `JWT_KEYS`/`JWT_JWKS`; GEN5→GEN6 `JWT_KEYS` y ambos JWT de traducción, con `JWT_JWKS` semánticamente idéntico; GEN6→GEN7 solo `JWT_KEYS`/`JWT_JWKS`.

La familia legacy (`JWT_SECRET`, anon, service-role y `oct`), las claves opaque y `godel.env` permanecen inalterados. No hubo mutación de DB ni Storage. GEN4 sigue `CURRENT / MATCH / RUNNING`; GEN5/GEN6/GEN7 son `PREPARED / NOT ACTIVE`; el estado del plan es GEN4 y el dry-run de GEN5 pasó sin `--apply`.

La baseline preactivación es Supabase 11/11 healthy, Godel 2/2 healthy, live/ready 200/200, api-gw y Supavisor sin puertos host, `app.settings.jwt_secret` ausente, `app.settings.jwt_exp` presente, SET denegado y lock de generaciones ausente.

### Siguiente bloque: D.4B.3

D.4B.3 realizará solo GEN4→GEN5: publicar y confiar el verificador público NEW mientras OLD permanece firmante único. Reconvergerán auth, rest, realtime, storage y functions. `api-gw` no cambia todavía porque los JWT de traducción asimétricos cambian solo en GEN6. Esta sección no autoriza ni ejecuta D.4B.3.

## D.4B.3–D.4B.6 — Anuncio, estabilidad, cambio de firmante y readiness de retiro OLD

D.4B sigue IN PROGRESS, pero D.4B.6 queda CLOSED / APPROVED / PASS. GEN6 es
CURRENT / MATCH / STABLE / ACCEPTED: NEW es el firmante EC activo y único; OLD
sigue como verificador EC confiado y elegible para retiro. GEN7 está READY FOR
SEPARATE AUTHORIZATION y NOT ACTIVE. D.4B no se cierra globalmente hasta la
retirada efectiva de OLD.

| Subfase | Estado |
| --- | --- |
| D.4B.0 | CLOSED / APPROVED / PASS |
| D.4B.1A | CLOSED / APPROVED / PASS |
| D.4B.1B | CLOSED / APPROVED / PASS |
| D.4B.1C | CLOSED / APPROVED / PASS |
| D.4B.2 | CLOSED / APPROVED / PASS |
| D.4B.3 | CLOSED / APPROVED / PASS |
| D.4B.4 | CLOSED / APPROVED / PASS |
| D.4B.5 | CLOSED / APPROVED / PASS |
| D.4B.6 | CLOSED / APPROVED / PASS |

### GEN5: anuncio y estabilidad

D.4B.3 activó GEN5: OLD permaneció firmante único, NEW fue anunciado como
verificador confiado y el JWKS publicó ambos. Solo se recrearon los consumidores
requeridos; api-gw no cambió. Supabase 11/11, Godel 2/2 y live/ready 200/200
permanecieron sanos; legacy y opaque siguieron aceptados.

D.4B.4 completó el soak de GEN5 sin reinicios inesperados. OLD continuó
firmando, NEW permaneció confiado y se validaron el objetivo GEN6 y el rollback
adyacente GEN6→GEN5; GEN6 no se activó durante este gate.

### Primer intento GEN6, forense y orquestador rastreado

El primer D.4B.5 tuvo un problema local de invocación npm.cmd/EINVAL; el
siguiente harness ad-hoc activó GEN6 pero informó una convergencia no probada.
El rollback controlado GEN6→GEN5 terminó con GEN5 sano, sin reparación manual
del registro protegido y sin activar GEN7. La revisión lo clasificó como
HARNESS_ORCHESTRATION_DEFECT, no como fallo criptográfico GEN6.

La forense R1 validó GEN6 protegido, las traducciones asimétricas ANON y SERVICE
reales bajo confianza OLD+NEW, control inválido 401, configuración aislada
Envoy v1.39.0 y sustitución de traducciones. Modelo, plan, Compose y contrato
de secretos pasaron. El rerun GoTrue fue INCOMPLETE_CLEAN, mientras la prueba
exact-image ya aprobada se mantuvo válida. Conclusión: GEN6 MATERIAL = READY.

El harness ad-hoc fue reemplazado por el orquestador rastreado del commit
6d2c5af199bdfe78f3d6a916b1f2f37009e72434: ejecución directa cross-platform,
helper Compose canónico, matriz adyacente, orden api-gw→auth en GEN5→GEN6,
espera acotada, validación de env e identidad completa, restauración inversa
automática y fail-closed. Su regresión pasó 13/13.

### D.4B.5-R3: cambio GEN5→GEN6 aprobado

El orquestador rastreado devolvió COMPLETE y recreó únicamente api-gw y auth.
CURRENT quedó en GEN6 con MATCH, plan GEN6 y lock ausente. NEW pasó a firmante
único; OLD siguió como verificador. Un token OLD previo y una sesión NEW fresca
fueron aceptados, por lo que la continuidad cross-signer pasó. Legacy, opaque,
Supabase 11/11, Godel 2/2 y live/ready 200/200 pasaron.

El smoke amplio core-business-handoff-selfhosted.spec.ts tuvo dos ejecuciones
inconclusas por presupuesto/completitud del runner, aunque mostró estado
autenticado y no demostró fallo de aplicación. Es deuda de tooling QA, no fallo
de aceptación GEN6. El login oficial focalizado sí produjo 1 passed, exit 0, y
confirmó login Admin, dashboard autenticado y sesión GEN6 a través de Godel.

La prueba rastreada frozen-production-baseline-selfhosted.spec.ts se añadió en
el commit 23fc5890d744c518aabc9710f1e9ea9687ec02c5. Es externa-only y
read-only: no escribe DB/Storage, no lee file_path, usa la ruta canónica de
descarga Godel, preserva ownership binding, valida el redirect firmado y no
genera trace/video/screenshot. Sus errores sensibles se sanitizan y no emiten
URL firmada ni UUID.

La aceptación congelada final confirmó P-26-0344 en en_revision, 131 objetos
Storage y un PDF protegido autorizado de 131075 bytes con firma %PDF; ownership
binding y redirect Storage público pasaron. Tamaño y magic son características
de integridad, no identidad global única.

### D.4B.6 — estabilidad GEN6 y readiness de retiro OLD

D.4B.6 completó un gate read-only de estabilidad y retiro OLD con GEN6 inicial y
final en `CURRENT / MATCH`, plan `GEN6` y lock ausente. Las regresiones runtime
(13/13), modelo (5/5), plan (9/9), Compose (5/5), secretos (14/14) y contrato
de secretos pasaron.

El gate temporal verificó una vida live de access token de 3600 segundos, un
`Cache-Control` JWKS con `max-age=600` y una edad observada de GEN6 de 31991
segundos. Las ventanas de expiración JWT y caché JWKS ya habían transcurrido;
por ello el retiro temporal de OLD pasó. No bastó un soak corto: también debía
haber transcurrido tiempo suficiente desde que OLD dejó de emitir access tokens
para que los access tokens legítimos pre-GEN6 firmados por OLD ya debieran haber
expirado. La continuidad de sesión/refresh de Auth emite access tokens frescos
firmados por NEW; no se infiere que los refresh tokens estén firmados por OLD.

El soak activo duró al menos 600 segundos. En T0, T+5 minutos y T+10 minutos o
posterior, Supabase permaneció 11/11 healthy, Godel 2/2 healthy y `/live` más
`/ready` respondieron 200/200. No hubo reinicios inesperados ni cambios de
identidad de contenedor. Sesiones controladas frescas en T0 y T10+ confirmaron
ES256, firmante NEW y solicitud autenticada aceptada; la firma NEW se mantuvo
sostenida.

La comparación sanitizada de env runtime confirmó convergencia exacta con el
material protegido GEN6 para auth, rest, realtime, storage, functions y api-gw,
sin documentar valores. Las comprobaciones finales de compatibilidad aceptaron
ANON legacy, SERVICE legacy, PUBLISHABLE opaque y SECRET opaque; el control
inválido devolvió 401.

El probe congelado rastreado pasó (1 passed, exit 0): `P-26-0344` permanece en
`en_revision`, Storage conserva 131 objetos y el PDF protegido validado tiene
131075 bytes y firma `%PDF`. No persistió ningún artefacto sensible.

El dry-run rastreado GEN6→GEN7 validó como recreaciones exactas rest, realtime,
storage, functions y auth. No incluyó api-gw, studio, supavisor, db, meta,
imgproxy ni Godel. El diff protegido GEN6→GEN7 se limita a `JWT_KEYS` y
`JWT_JWKS`: GEN7 conserva NEW como firmante único y verificador público, retira
OLD y preserva internamente el `oct` legacy, sin exponer material criptográfico.

El rollback inmediato validado desde GEN7 es exclusivamente GEN7→GEN6, con el
mismo conjunto de cinco recreaciones; el material protegido GEN6 sigue válido.
No se ejecutó rollback durante D.4B.6 y no se autoriza ningún rollback no
adyacente.

La baseline de seguridad permanece: api-gw y Supavisor no exponen puertos host;
`app.settings.jwt_secret` está ausente, `app.settings.jwt_exp` está presente y
coherente, y el privilegio SET está denegado. No hubo mutación de producción. No
se documentan claves, JWT, identificadores de clave, coordenadas JWK,
credenciales, URLs firmadas, rutas protegidas ni IDs de contenedor.

### D.4B.7 — retiro OLD-verifier y aceptación GEN7

**Estado D.4B vigente:** CLOSED / APPROVED / PASS. La rotación EC está
operativa y funcionalmente completa. La referencia histórica a D.5/D.6
pendientes quedó superada por sus cierres posteriores; SH-04.3D está
`CLOSED / APPROVED`.

El primer intento autorizado GEN6→GEN7 terminó fail-closed como
`EC_RUNTIME_CONVERGENCE_ROLLBACK_FAILED`. No fue un fallo criptográfico GEN7,
funcional de PostgREST ni de rollback de la generación protegida. La causa fue
`RUNTIME_ENV_VERIFICATION_ADAPTER_DEFECT`: el verificador rastreado usaba
`docker exec <container> printenv <variable>` y la imagen mínima
`postgrest/postgrest:v14.12` no proporciona `printenv`. Falló después de
recrear Rest y el mismo defecto afectó la prueba de rollback; no hubo recovery
manual, rollback ciego, edición de env ni reparación de servicios.

D.4B.7-R1 probó `GEN6_RESTORED_VERIFIED` mediante metadata Docker host-side:
rest, realtime, storage, functions y auth coincidían con GEN6 y api-gw retuvo
sus traducciones. El estado protegido fue GEN6 CURRENT/MATCH, plan GEN6 y lock
ausente; JWKS OLD+NEW, firmante fresh NEW, Supabase 11/11, Godel 2/2,
live/ready 200/200, frozen probe PASS y Storage 131. No hizo falta otra
mutación de recovery.

D.4B.7-R2 corrigió el verificador en
`b877e14a46edf2dbb742b01e85410adf9dfd7dd9`: usa
`docker inspect --format "{{json .Config.Env}}"` host-side con `shell=false`,
matching exacto, una sola entrada requerida, valores con `=` preservados y
fallo cerrado ante metadata faltante, duplicada o malformada. No registra
valores ni depende de binarios de las imágenes. La regresión runtime pasó
17/17. D.4B.7-R3 probó el arreglo sobre GEN6 live para rest, auth, realtime,
storage, functions y api-gw, incluido PostgREST, sin `docker exec`/`printenv`;
JWKS permaneció OLD+NEW, el firmante fresh fue NEW y no hubo mutación.

D.4B.7-R4 ejecutó la segunda transición autorizada exclusivamente con el
orquestador rastreado. GEN7 protegido es
`65aea10b-f0ce-4015-bfa3-98086137d303`; solo se recrearon rest, realtime,
storage, functions y auth, no api-gw. La evidencia independiente confirmó
el estado EC GEN7-equivalente de ese hito, plan GEN7, lock ausente y
consumidores live de ese hito. El JWKS
público pasó a NEW-only: un EC público, OLD ausente y sin `oct` ni material
privado; el `oct` legacy sigue preservado internamente para HS256.

La línea final `COMPLETE` del apply mutante no fue observada. Se clasifica como
deuda de observación CLI/output, no como fallo criptográfico/runtime: GEN7
protegido, consumidores live, JWKS NEW-only y salud runtime convergieron de
forma independiente.

D.4B.7-R4-R1 completó aceptación read-only con PASS: estado EC GEN7
CURRENT/MATCH,
verificador host-side, JWKS NEW-only y OLD ausente; login Admin, dashboard y
firmante fresh NEW; frozen baseline 1 passed/exit 0; y dry-run GEN7→GEN6 PASS.
Las regresiones runtime/model/plan/Compose/secretos fueron 17/17, 5/5, 9/9,
5/5 y 14/14, con contrato de secretos PASS. El token NEW original pre-GEN7 no
fue replayable porque el artefacto local ya no existía; la continuidad
equivalente pasó: NEW fue firmante GEN6, se preserva entre GEN6/GEN7, GEN7
retira OLD sin reemplazarlo, JWKS live verifica NEW y auth fresh GEN7 pasa. No
se reconstruyó token ni se consultó historial de terminal.

Compatibilidad y seguridad permanecen PASS de forma sanitizada: ANON/SERVICE
legacy y PUBLISHABLE/SECRET opaque aceptados, control inválido 401; api-gw y
Supavisor sin puertos host; `app.settings.jwt_secret` ausente,
`app.settings.jwt_exp` presente/coherente y SET denegado. La baseline congelada
conserva P-26-0344 en `en_revision`, Storage 131 y PDF protegido 131075 bytes
con `%PDF`.

### D.4B.8 — estabilidad final post-GEN7 y cierre de D.4B

El primer bloque D.4B.8 quedó **INCOMPLETE / EVIDENCE RETENTION GAP**, no
FAIL: confirmó el estado EC GEN7-equivalente de ese hito; regresiones runtime 17/17,
modelo 5/5, plan
9/9, Compose 5/5, secretos 14/14 y contrato PASS; soak activo de al menos 600
segundos con salud T0/T+5/T+10 PASS; env GEN7 y JWKS NEW-only en T0/T10; cache
JWKS de 600 segundos y su gate post-GEN7 PASS; emisión NEW, frozen baseline
1 passed, dry-run GEN7→GEN6 y estado final CURRENT/MATCH. No hubo mutación ni
regresión observada. Faltó retener los 13 baselines de identidad/restart hasta
T10 en el mismo proceso y capturar los probes legacy/opaque en ese flujo.

D.4B.8-R1 repitió solo esa evidencia faltante y terminó **CLOSED / APPROVED /
PASS**. Un único proceso efímero retuvo T0: 13/13 identidades y 13/13
restart-counts; T+5 y T+10 mantuvieron salud PASS; tras al menos 600 segundos,
las 13/13 identidades y los 13/13 restart-counts permanecieron sin cambios.
La sanidad final confirmó JWKS NEW-only, firmante fresh NEW/ES256 con solicitud
autenticada aceptada, ANON/SERVICE legacy y PUBLISHABLE/SECRET opaque aceptados
y control inválido 401. GEN7 final CURRENT/MATCH y árbol rastreado limpio.

Los bloques D.4B.8 y D.4B.8-R1 juntos satisfacen el gate final post-GEN7. R1
aportó una observación temporal nueva y retenida; no reconstruyó evidencia del
primer proceso. D.4B.8 queda **CLOSED / APPROVED / PASS** y cierra D.4B
globalmente.

El estado EC durable equivalente a GEN7 es CURRENT / MATCH / STABLE / ACCEPTED;
NEW es el
único firmante EC y único verificador EC activo; OLD está retirado de la
confianza activa. El JWKS público tiene un solo EC NEW, sin OLD, `oct` ni
material privado; el `oct` legacy se conserva internamente para la
compatibilidad HS256 aprobada. Tras el retiro, el soak >=600s no mostró cambios
de identidad ni aumentos de restart, Supabase se mantuvo 11/11, Godel 2/2 y
live/ready 200/200; env GEN7 y JWKS NEW-only permanecieron exactos y transcurrió
una ventana de cache JWKS configurada completa.

La aceptación funcional final conserva Admin auth y emisión NEW ES256 PASS,
legacy ANON/SERVICE y opaque publishable/secret ACCEPTED, control inválido 401,
`P-26-0344` en `en_revision`, 131 objetos Storage, PDF protegido 131075 bytes
con `%PDF`, owner binding PASS y redirect público firmado PASS. No se registran
URLs firmadas, rutas protegidas, IDs de archivo, credenciales ni material de
claves.

### Estado actual y siguiente contrato

| Estado vigente | Firmante | Verificadores | Situación |
| --- | --- | --- | --- |
| GEN4 | OLD | OLD | Baseline histórica OLD-only |
| GEN5 | OLD | OLD + NEW | Anuncio completado |
| GEN6 | NEW | OLD + NEW | Generación de rollback inmediata retenida |
| GEN7 | NEW | NEW | CURRENT / MATCH / CONVERGED / ACCEPTED; OLD retirado |

El rollback inmediato aprobado desde GEN7 es exclusivamente GEN7→GEN6 con
rest, realtime, storage, functions y auth; GEN6 y el material protegido OLD se
retienen. No se autorizan GEN7→GEN5 ni GEN7→GEN4, ni eliminar material GEN6 u
OLD. El contrato inmediato de recovery permanece GEN7→GEN6 con rest, realtime,
storage, functions y auth; GEN6, OLD protegido y el plan EC deben retenerse.
No se autorizan GEN7→GEN5 ni GEN7→GEN4. La ausencia del stdout `COMPLETE`
permanece deuda CLI/output no bloqueante, no fallo runtime/criptográfico.

En este punto histórico, el siguiente workstream era **D.5 — SAFE POSTGRESQL
PASSWORD ROTATION**. Requería su propio gate arquitectónico/operativo porque las
credenciales PostgreSQL y Supavisor son un dominio acoplado distinto. Su cierre
y el handoff vigente a D.6 se registran al final de este informe.

## D.5.0 — Auditoría arquitectónica/live read-only de contraseña PostgreSQL

**Estado histórico:** `CLOSED / APPROVED / PASS`. Al cierre de D.5.0, D.5
permanecía `IN PROGRESS` y la rotación productiva de contraseña PostgreSQL no
estaba todavía autorizada. El estado final posterior se registra al final de
este informe.

### Límites y baseline

D.5.0 fue estrictamente read-only. No generó contraseñas ni generaciones
candidatas, no ejecutó `ALTER ROLE`, no modificó Supavisor, no creó backups ni
recreó servicios. El HEAD auditado fue
`5d4507f0f18d9f7c887106217493dc2911627119`, con árbol rastreado limpio,
Supabase 11/11 saludable, Godel 2/2 saludable y `/live`/`/ready` 200/200. La
generación externa permaneció GEN7 `CURRENT / MATCH` y el lock de generaciones
estaba ausente al inicio y al final.

### Helper upstream no autorizado

`infra/supabase/utils/db-passwd.sh` es **NOT AUTHORIZED** para D.5 de
producción y D.5 no debe llamarlo ni envolverlo. El helper genera internamente
la contraseña y la imprime, altera un conjunto amplio y hardcoded de roles,
ejecuta `DROP SCHEMA _supavisor CASCADE`, reescribe `.env` directamente y
propone una recreación forzada amplia. Ninguna de esas operaciones es un
contrato seguro de rotación para este runtime con estado persistente.

### Contrato inicial tracked y dominio live probado

`infra/supabase/volumes/db/roles.sql` inicializa `POSTGRES_PASSWORD` para
`authenticator`, `pgbouncer`, `supabase_auth_admin`,
`supabase_functions_admin` y `supabase_storage_admin`. Esa lista de
inicialización no basta por sí misma para inferir el conjunto live actual.

La autenticación sanitizada por la ruta Docker/SCRAM probó que la contraseña
actual es aceptada exactamente por estos siete roles:

| Rol acoplado aprobado D.5 | Evidencia |
| --- | --- |
| `postgres` | LOGIN; contraseña compartida aceptada. |
| `supabase_admin` | LOGIN; contraseña compartida aceptada. |
| `authenticator` | LOGIN; contraseña compartida aceptada. |
| `pgbouncer` | LOGIN; contraseña compartida aceptada. |
| `supabase_auth_admin` | LOGIN; contraseña compartida aceptada. |
| `supabase_functions_admin` | LOGIN; contraseña compartida aceptada. |
| `supabase_storage_admin` | LOGIN; contraseña compartida aceptada. |

Exclusiones probadas: `supabase_replication_admin` y
`supabase_read_only_user` son LOGIN sin contraseña configurada y rechazan la
contraseña compartida actual. `anon`, `authenticated`, `service_role` y
`dashboard_user` son NOLOGIN y no tienen contraseña. La igualdad de contraseña
se probó por comportamiento de autenticación sanitizado, nunca por
`rolpassword`, hashes SCRAM ni otro material de contraseña.

El conjunto de siete roles de la tabla queda congelado como evidencia D.5.0.
La futura herramienta D.5 solo podrá rotar ese conjunto salvo nueva evidencia y
revisión arquitectónica; no podrá importar la lista más amplia del helper
upstream.

### Matriz de consumidores y persistencia DB

| Consumidor | Rol / contrato | Acción futura |
| --- | --- | --- |
| Studio | `postgres`; consumidor `POSTGRES_PASSWORD` | RECREATE_REQUIRED |
| Auth | `supabase_auth_admin` | RECREATE_REQUIRED |
| PostgREST | `authenticator` | RECREATE_REQUIRED |
| Realtime | `supabase_admin` | RECREATE_REQUIRED |
| Storage | `supabase_storage_admin` | RECREATE_REQUIRED |
| Meta | `postgres` | RECREATE_REQUIRED |
| Functions | `postgres` | RECREATE_REQUIRED |
| Supavisor Repo | `supabase_admin` | RECREATE_REQUIRED |
| Supavisor manager | `pgbouncer`; credencial persistida | Actualización persistida requerida y RECREATE_REQUIRED |
| api-gw, imgproxy, runtime Godel | No son consumidores de `POSTGRES_PASSWORD` | Fuera del conjunto de recreación de credenciales |

Las contraseñas de roles pertenecen al PGDATA persistente. Los scripts tracked
bajo `docker-entrypoint-initdb.d` inicializan solamente un clúster nuevo y no
son un mecanismo de rotación para uno ya inicializado. Por ello, **recrear el
contenedor DB no equivale a rotar roles**; la rotación funcional requiere SQL.
Cambiar solo `POSTGRES_PASSWORD` en Compose tampoco es suficiente.

#### Decisión abierta D.5.1: higiene del env de DB

El contenedor DB recibe `PGPASSWORD` y `POSTGRES_PASSWORD`. Si no se recrea
después de una rotación funcional, su metadata Docker `Config.Env` conservará
la contraseña OLD revocada aunque los roles ya usen NEW. Esto distingue la
rotación funcional de roles, que no exige recrear DB, de la higiene de secretos
de runtime, que podría exigirlo. Por tanto:

```text
DB RUNTIME RECREATE POLICY = PENDING D.5.1 SECURITY / OPERATIONAL DESIGN
```

D.5.0 no clasifica permanentemente DB como `UNCHANGED` ni como
`RECREATE_REQUIRED`.

### Estado y contrato de Supavisor

La auditoría encontró `_supavisor` presente en la base de metadata, con un
tenant, una credencial manager, cero clusters, control Repo por
`supabase_admin` y manager `pgbouncer`. La credencial manager es persistida en
`db_pass_encrypted`; no se documentan ciphertexts, bytes cifrados ni
identificadores sensibles de tenant.

En la imagen fijada `supabase/supavisor:v2.9.5`, `User.db_password` usa
`Supavisor.Encrypted.Binary` y se persiste en `db_pass_encrypted` mediante
`Supavisor.Vault`. El runtime suministra la clave de cifrado/descifrado de Vault
mediante `VAULT_ENC_KEY`. D.5 no rota `VAULT_ENC_KEY`.

El `pooler.exs` tracked configura el manager inicial como
`db_user = pgbouncer` y `db_password = POSTGRES_PASSWORD`, pero crea el tenant
solo si todavía no existe. En consecuencia:

```text
SUPAVISOR RECREATE ALONE = INSUFFICIENT
SUPAVISOR_PERSISTED_CREDENTIAL_UPDATE_REQUIRED
```

La v2.9.5 fijada contiene
`Supavisor.Tenants.update_manager_user_credentials/2`. La operación de dominio
localiza el manager del tenant, aplica el changeset exclusivo de credenciales,
persiste mediante `Repo.update`, actualiza credenciales de SecretChecker a nivel
global y limpia la caché distribuida del tenant después de esa actualización.
Es el mecanismo de dominio aprobado alrededor del cual deberá construirse el
tooling D.5. No se permite actualizar `db_pass_encrypted` directamente con SQL.

La ruta de éxito efectiva de la versión fijada devuelve `:ok` tras persistencia
y operaciones de caché; el ejemplo documental tipo `{:ok, %User{}}` no debe
usarse como contrato del tooling. El tooling futuro verificará el comportamiento
de la implementación fijada y comprobará de forma independiente estado
persistido y runtime.

Las rutas session y transaction del pooler fueron operacionales y ambas
ejercitaron correctamente la ruta manager `pgbouncer` tenant-calificada. No se
registran contraseñas, URLs con credenciales ni tenant identifiers.

### Contrato de cutover y compensación futura

`MAINTENANCE GATE = REQUIRED`: tras cambiar los siete roles no hay un período
seguro en el que consumidores OLD puedan continuar abriendo conexiones nuevas.
No se ejecutó maintenance en D.5.0; su mecanismo final y la quiescencia de
consumidores corresponden a tooling/revisión posterior.

El commit lógico no es el `COMMIT` SQL. Bajo maintenance y lock de operación,
el contrato conceptual forward es:

1. La generación protegida candidata ya está preparada y validada.
2. Se actualiza a NEW la credencial manager `pgbouncer` de Supavisor mediante
   la operación de dominio.
3. Se rotan transaccionalmente a NEW los siete roles PostgreSQL aprobados.
4. Se verifica la autenticación DB con NEW.
5. Se publica el puntero de la generación protegida candidata.
6. Se reconvergen los consumidores de credenciales.
7. Se completa aceptación; solo entonces se libera maintenance y lock.

La transición del puntero protegido es el **LOGICAL COMMIT**. Las mutaciones de
Supavisor y SQL anteriores son pre-commit y deben ser compensables. Supavisor
debe actualizarse antes de cambiar `supabase_admin`: su Repo en ejecución aún
autentica con la credencial OLD y cambiar el control DB primero puede perder esa
ruta de dominio. La discrepancia breve manager NEW/rol OLD solo es aceptable
bajo maintenance cerrado y lock; D.5.1 debe hacerla determinista y fail-closed.

Pre-pointer, si el manager NEW se persiste pero la transacción de roles no
commitea, se restaura manager OLD. Si los roles ya commitearon pero no se publica
el puntero candidato, se restauran los siete roles OLD en transacción, se
verifica autenticación OLD, se restaura/verifica manager OLD, se conserva OLD
como generación actual y no se libera maintenance hasta recuperar coherencia.
No se presume que una inversión manual o ciega de orden sea suficiente.

Después del commit del puntero, un fallo de runtime o aceptación es post-commit
y requiere un rollback tracked aparte a la generación inmediata previa. Debe
restaurar conjuntamente `POSTGRES_PASSWORD` previo, los siete roles, manager
persistido de Supavisor, envs runtime de consumidores y estado de los servicios
afectados. No hay rollback manual/blind autorizado.

### Backup, generación y aceptación futura

El mecanismo schema-3 auditado captura el clúster PostgreSQL persistente,
incluido `_supavisor`, además de sus artefactos asociados. Antes del cutover real
debe crearse y verificarse un backup nuevo inmediatamente previo; evidencia
histórica no lo sustituye. D.5.0 no creó backup.

La futura contraseña será única para producción, fresca, generada con CSPRNG y
con entropía suficiente. Nunca podrá aparecer en argv, stdout, stderr, logs,
Git, documentación ni SQL generado. D.5.0 no generó contraseña.

La aceptación de D.5 deberá probar autenticación directa de los siete roles,
Auth, PostgREST, Realtime, Storage, Meta, Functions, Repo Supavisor, session y
transaction pool, funcionalidad DB-facing de Studio, login admin y health Godel.
También validará baseline de pedido congelado, conteo Storage, PDF protegido,
identidades exactas de servicios recreados, ausencia de fuga de secretos y
preservación del estado EC GEN7. La expectativa de recrear DB sigue sujeta a la
decisión D.5.1.

### Cierre D.5.0 y siguiente bloque

D.5.0 cierra exclusivamente la auditoría arquitectónica/live read-only. No
autoriza generación de contraseña o candidato, `ALTER ROLE`, actualización de
Supavisor, maintenance, recreación DB/servicios, cutover ni rollback.

Siguiente bloque: **D.5.1 — SAFE POSTGRES PASSWORD ROTATION TOOLING /
DETERMINISTIC DRILL**, o bloque equivalente de arquitectura/tooling.

## D.5.1 — tooling, ejecución y cierre de rotación PostgreSQL

**Estado final D.5:** `COMPLETE / APPROVED`. La rotación se ejecutó sobre el
runtime operacional self-hosted; no declara un despliegue en `company-host`.

| Hito | Estado final |
| --- | --- |
| D.5.0 — auditoría read-only | CLOSED / APPROVED |
| D.5.1 — modelo, tooling, runtime y rollback tracked | CLOSED / APPROVED |
| D.5.1E1 — preparación protegida | CLOSED / APPROVED |
| D.5.1E2 — candidato protegido | CLOSED / APPROVED |
| D.5.1E3-R1 — backup final pre-cutover | CLOSED / APPROVED |
| D.5.1E4-R1 — gate final de activación | CLOSED / APPROVED |
| D.5.1F1A/F1B — evidencia y executor | CLOSED / APPROVED |
| D.5.1F2 — cutover | CLOSED / RECOVERED / PASS |
| D.5 | COMPLETE / APPROVED |

### Modelo y preparación

La SOURCE histórica compatible con `LEGACY32` se retuvo protegida como
`65aea10b-f0ce-4015-bfa3-98086137d303`. La TARGET `D5_64`,
`63d9bbf1-02b7-4b6b-9fe3-e201f26d4da2`, derivó de SOURCE y cambió únicamente
`POSTGRES_PASSWORD`; el snapshot Godel permaneció byte-idéntico. La preparación
validó el candidato único, el adaptador runtime secret-safe, el canal admin
local trust de PostgreSQL y los contratos forward/rollback tracked.

La terminología vigente distingue dos planos: la **generación externa actual**
es TARGET D.5; la **postura criptográfica EC** conserva el estado equivalente a
GEN7, con NEW como único firmante/verificador activo y OLD retirado de la
confianza EC activa. GEN7 SOURCE no es el puntero externo actual.

### Backup y gate de activación

El backup final pre-cutover `20260830T135345Z-a1b3d14d` fue COMPLETE,
verificado, ligado a SOURCE y al commit de ejecución del cutover
`20ec0d437d4bf0adb1efb523d79e480d975ddaaf`. La política de frescura de dos
horas fue un gate de activación del cutover, no una fecha de expiración general
del artefacto de recovery. No se documentan rutas locales ni material protegido.

E4-R1 confirmó, antes de mutar, SOURCE actual/matching, TARGET dormida/única,
lock ausente, autenticación SOURCE 7/7, Supavisor en ambos puertos, higiene
SOURCE 9/9, Supabase 11/11, Godel 2/2, salud pública e ingress contenido.

### Cutover, incidente de mantenimiento y recuperación

El cutover real se invocó exactamente una vez con el commit de ejecución
`20ec0d437d4bf0adb1efb523d79e480d975ddaaf`. La convergencia de credenciales y
runtime TARGET fue aceptada y se publicó TARGET, pero el executor terminó en
`TARGET_ACCEPTED_MAINTENANCE_CLOSED`: el lock quedó retenido y Nginx detenido.
No se ejecutó un segundo cutover ni rollback automático.

Se identificó una carrera concreta de convergencia de salud que podía reproducir
ese estado terminal: tras iniciar Nginx, exigir inmediatamente `healthy` puede
competir con el estado legítimo `starting` del healthcheck. No se afirma que sea
la única causa posible de un fallo de inicio. El hotfix
`f75c91258d07d5f19af29a3cfaee5fad2237fdef` endureció
`verifyNginxRunning()` sin cambiar los state machines forward, rollback ni
finalizer: healthy inmediato pasa; starting espera acotadamente; detenido falla
inmediatamente; una detención durante la espera falla cerrada; y un estado nunca
healthy expira a los 90 segundos.

La recuperación usó exclusivamente `target-finalize`: verificó aceptación core
TARGET, inició el contenedor Nginx existente, esperó la convergencia saludable,
liberó el lock TARGET y verificó la recuperación pública. No usó rollback,
rollback-resume, mutación manual de credenciales/puntero ni eliminación manual
del lock. El resultado final del executor fue `COMPLETE`.

### Evidencia final y handoff

TARGET quedó `CURRENT / MATCH / ACTIVE`; SOURCE queda `RETAINED / NOT_CURRENT`
y ausente del runtime gestionado activo. El lock de rotación está ausente. La
evidencia final confirma DB TARGET 7/7, Supavisor 5432/6543, higiene TARGET 9/9
y ausencia SOURCE 9/9, Supabase 11/11, Godel 2/2, `/live` y `/ready` 200 e
ingress PASS. El contrato de secretos pasó; el E2E congelado pasó 1/1; evidencia
operativa, executor y adaptador pasaron 25/25, 13/13 y 23/23 respectivamente.

Durante el cutover convergieron los nueve consumidores gestionados de contraseña
PostgreSQL y el state machine preservó los cuatro servicios no recreados. En
`target-finalize`, las 13 identidades permanecieron sin cambio: Nginx fue
iniciado, no recreado. No se registran IDs de contenedor ni secretos.

## D.6 — aceptación final de rotación y recovery

**Estado:** `CLOSED / APPROVED / PASS`.
**Clasificación:** `D6_FINAL_ROTATION_RECOVERY_ACCEPTED`.

La aceptación agregada confirmó el runtime actual `CURRENT / MATCH`, sin lock,
con D.5 TARGET como generación actual; GEN7 y GEN6 permanecen retenidas y no
actuales. No hay asociaciones requeridas colgantes: el backup pre-cutover se
asocia de forma resoluble con GEN7 y el runtime actual con el TARGET de D.5.

Pasaron los gates de compatibilidad y continuidad: relación exacta de D.5,
snapshot de Godel idéntico, claves con estado congeladas sin cambio, JWKS
público EC sin material privado, autenticación DB TARGET 7/7, Supavisor en
5432/6543, higiene de runtime 9/9, Supabase 11/11, Godel 2/2, health canónico
live/ready 200 e ingress. También pasaron las sondas controladas de dashboard,
API keys opacas, legacy JWT, transición EC, login fresco, `/auth/v1/user` y
REST seguro; el dry-run de backup, el E2E congelado 1/1, las suites de
modelo/runtime/rollback/adaptador/prepare/operación/executor/generación/Compose
y contrato de secretos. La estabilidad posterior mantuvo sin cambios las 13
identidades de servicio ni sus contadores de reinicio durante más de 300
segundos.

### R1A — forensics del artefacto de backup pre-cutover

**Estado:** `CLOSED / APPROVED / PASS`. El backup set pre-cutover
`20260830T135345Z-a1b3d14d` fue encontrado como copia exacta recuperable en las
raíces canónicas configuradas de backup y recovery: contiene los artefactos de
recovery PostgreSQL lógico y físico, Storage y sus metadatos xattr, además del
material de recovery protegido. Sus artefactos de datos y protegido están
presentes, su verificación independiente in-place pasó y su asociación con GEN7
es `RESOLVABLE`. No se movió, copió, reconstruyó ni recreó ningún artefacto.

El hallazgo corrige un falso negativo de lookup/resolución inicial; no implica
pérdida de backup. El contrato de nombres distingue el ID lógico anterior del
basename físico `backup-<backupId>`. No se registran rutas absolutas ni material
protegido.

### Semántica de recovery y handoff

Las generaciones retenidas conservan material de recovery, pero no autorizan un
rollback arbitrario de puntero. La herramienta de rollback D.5 se limita a la
recuperación de cutover de un TARGET no aceptado; una reversión deliberada del
TARGET D.5 actual requiere autorización explícita nueva.

SH-04.3D queda `CLOSED / APPROVED`. SH-04.3E — Compatibilidad recovery tras
rotación — cerró `CLOSED / APPROVED / PASS`: D5 TARGET se mantuvo
`CURRENT / MATCH`, su baseline D5 fue restaurada destructivamente con checkpoint
defensivo distinto y los verificadores post-restore pasaron. La síntesis
canónica está en [SH-04.3 — Production Secrets & Auth Hardening](SH_04_SECRETS_AUTH_REPORT.md).
El siguiente workstream es **SH-04.3F — Aceptación operativa final** (`NEXT`).
SH-04.3 y SH-04 siguen `IN PROGRESS`.
