# SH-04.3D — Rotación segura de secretos y continuidad de recovery

Estado: `IN PROGRESS` — D.3 (rotación de API keys opacas) está cerrado; D.4A
(rotación legacy) es el siguiente bloque pendiente.

Estado de subfases: D.0 `CLOSED / APPROVED`, D.1 `CLOSED / APPROVED`, D.2A
`CLOSED / APPROVED`, D.2B `CLOSED / APPROVED`, D.2 `CLOSED / APPROVED`, D.3A
`CLOSED / APPROVED`, D.3B.0 `CLOSED / APPROVED / PASS` y D.3B.1
`CLOSED / APPROVED / PASS`.

Este documento es la autoridad operativa para SH-04.3D. Complementa el
[informe general SH-04.3](SH_04_SECRETS_AUTH_REPORT.md), que conserva el
contrato de configuración y Auth.

## Alcance y límites

La fase cubre el diseño de rotación, la custodia local de generaciones externas
y su vínculo con backup/restore. No autoriza generar valores productivos,
editar `infra/supabase/.env`, `compose.env.local` o `.env.qa.local`, reiniciar
servicios, modificar base de datos, usuarios o Storage, ni ejecutar restores.

Los valores se generan y se custodian fuera de Git. Los snapshots de esta fase
contienen secretos y deben permanecer en
`protected-recovery-material/selfhosted/external-secrets/`, que no se imprime,
sube ni se trata como artefacto de documentación.

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
| `POSTGRES_PASSWORD` | PostgreSQL y roles | D | Roles DB, Supavisor | Credenciales DB y estado Supavisor | Sí | No aprobada | Drill DB; DB y Supavisor | Antes; recovery | D.5, preservar `_supavisor`. |
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
| `POSTGRES_PASSWORD` | DB/roles | D | Supavisor | Sí | No | Sí | No | DB+Supavisor drill | No | db,supavisor | Sí | Recovery | D.5 only |
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
  deberá preservarlo.

## Descomposición de SH-04.3D

| Fase | Alcance | Estado |
| --- | --- | --- |
| D.0 | Auditoría de arquitectura y seguridad | CLOSED / APPROVED |
| D.1 | Tooling seguro y modelo de generación/recovery | CLOSED / APPROVED |
| D.2 | Generación cero y rotación Dashboard | CLOSED / APPROVED |
| D.3 | Opaque API keys y rebuild Godel | CLOSED / APPROVED |
| D.4A | Rotación legacy `JWT_SECRET` / anon / service-role | PENDING ARCHITECTURAL / OPERATIONAL DESIGN |
| D.4B | Rotación de claves EC de firma | Pendiente |
| D.5 | Rotación segura de contraseña PostgreSQL | Pendiente |
| D.6 | Aceptación final de rotación/recovery | Pendiente |

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

1. Definir y aprobar por separado el runbook para PostgreSQL/Supavisor y las
   claves de cifrado con estado, incluyendo backup/restore drill.
2. Generar material real únicamente fuera del repositorio y bajo autorización
   operativa explícita.
3. Ejecutar una rotación por grupos, verificando consumidores, health y
   recovery antes de retirar la generación anterior.
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

D.0, D.1, D.2 y D.3 están `CLOSED / APPROVED`; D.3A está
`CLOSED / APPROVED`, D.3B.0 y D.3B.1 están `CLOSED / APPROVED / PASS`, y D.3C
es el cierre documental de esa evidencia. SH-04.3D permanece `IN PROGRESS`
porque D.4A, D.4B, D.5 y D.6 siguen pendientes.

Siguiente trabajo: **SH-04.3D.4A — rotación legacy `JWT_SECRET` / `ANON_KEY` /
`SERVICE_ROLE_KEY`**, `PENDING ARCHITECTURAL / OPERATIONAL DESIGN`. Este cierre
no autoriza ni ejecuta D.4A.

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
