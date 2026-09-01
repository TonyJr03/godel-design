# SH-04.3 — Production Secrets & Auth Hardening

## Estado

| Bloque | Estado |
| --- | --- |
| SH-04.3 | CLOSED / APPROVED |
| SH-04.3A — auditoría | CLOSED / APPROVED |
| SH-04.3B — contrato tracked y configuración | CLOSED / APPROVED |
| SH-04.3C-R1A — wiring asimétrico | CLOSED / APPROVED |
| SH-04.3C — aplicación y aceptación QA | CLOSED / APPROVED |
| SH-04.3D — rotación de secretos | CLOSED / APPROVED |
| SH-04.3E — compatibilidad recovery tras rotación | CLOSED / APPROVED / PASS |
| SH-04.3F — aceptación operativa final | CLOSED / APPROVED / PASS |

SH-04.3 está `CLOSED / APPROVED` tras
`SH043_FINAL_OPERATIONAL_ACCEPTANCE_PASS`. Este documento conserva la fuente
vigente de decisiones de secretos, configuración, Auth, recovery y aceptación
operativa; SH-04 permanece `IN PROGRESS`.

## Alcance

SH-04.3 cubre clasificación y gestión de secretos, configuración productiva,
hardening de Auth, dependencias de recovery, separación
pública/server-only/secreta y preparación de un set exclusivo de producción. No
rota secretos reales ni modifica credenciales, usuarios o runtime en SH-04.3B.

SMTP está **DEFERRED BY PRODUCT DECISION**. No es una deuda accidental ni una
capacidad actual de Godel.

## Modelo de usuarios Godel

```text
Administrador autorizado
→ Auth Admin server-only
→ email + contraseña temporal
→ email_confirm=true
→ perfil must_change_password=true
→ primer login
→ cambio obligatorio de contraseña
→ login normal
```

El signup público no forma parte del producto. Godel conserva login por
email/contraseña para usuarios internos ya creados, creación administrativa,
reset administrativo de contraseña temporal y cambio inicial obligatorio.

## Auditoría SH-04.3A

La auditoría read-only confirmó que los archivos reales de entorno permanecen
ignorados/no trackeados, que `pgsodium_root.key` se protege como material de
recovery y que la clave administrativa de Godel está limitada al adaptador
server-only de Auth Admin. No se documentan valores reales.

| Variable/material | Clasificación | Consumidores | Estado efectivo A | Producción | Recovery | Acción |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | PUBLIC_CONFIG | Browser/build, Next | Activo | Required | No | Keep |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | PUBLIC_CREDENTIAL | Browser/build, Next | Activo | Required | Sí | Keep |
| `SUPABASE_SERVER_URL` | SERVER_CONFIG | Next server/proxy | Activo | Required | No | Keep |
| `SUPABASE_SECRET_KEY` | SECRET | Auth Admin, gateway, Functions, Studio | Activo | Required | Sí | Keep |
| `POSTGRES_PASSWORD` | SECRET | DB y servicios Supabase | Activo | Required | Sí | Keep |
| `JWT_SECRET` | SENSITIVE_CRYPTO_MATERIAL | Auth, DB, REST, Realtime, Storage, Functions | Activo | Required | Sí | Keep |
| `JWT_KEYS`, `JWT_JWKS` | SENSITIVE_CRYPTO_MATERIAL | Auth y verificadores JWT | Activo | Required | Condicional activo | Keep |
| `ANON_KEY` | PUBLIC_CREDENTIAL | Gateway, Storage | Activo | Required | Sí | Keep |
| `SERVICE_ROLE_KEY` | SECRET | Gateway, Storage, Functions | Activo | Required | Sí | Keep |
| `SUPABASE_PUBLISHABLE_KEY` | PUBLIC_CREDENTIAL | Gateway, Functions, Studio, Godel | Activo | Required | Sí | Keep |
| `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD` | SERVER_CONFIG / SECRET | Gateway/Studio | Activo | Required | Password required | Optional hardening / Keep |
| `SECRET_KEY_BASE`, `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY` | SENSITIVE_CRYPTO_MATERIAL | Realtime, Pooler, Meta/Studio | Activo | Required | Sí | Keep |
| S3 protocol credentials | CONDITIONAL_SECRET | Storage | Configurado, no usado por Godel | To decide | Condicional A | Disable normal profile |
| Logflare credentials | OPTIONAL_UNUSED | Sin consumidor normal | Inactivo | No | No | Defer |
| MinIO credentials | OPTIONAL_UNUSED | Sin servicio normal | Inactivo | No | No | Defer |
| `OPENAI_API_KEY` | CONDITIONAL_SECRET | Studio AI | Inactivo | No | No | Defer |
| Familia SMTP | OPTIONAL_UNUSED | Auth upstream | Configurada, no usada por Godel | No | A requería `SMTP_PASS` | Defer |
| `pgsodium_root.key` | SENSITIVE_CRYPTO_MATERIAL | DB config | Activo | Required | Sí, protegido | Keep |
| `GODEL_TEST_*` | QA_SECRET | QA tooling | QA only | No | No | Keep isolated |

## Modelo de clasificación

| Clase | Significado |
| --- | --- |
| `PUBLIC_CONFIG` | Configuración intencionalmente no secreta. |
| `PUBLIC_CREDENTIAL` | Credencial expuesta con privilegios restringidos. |
| `SERVER_CONFIG` | Configuración solo servidor no intrínsecamente secreta. |
| `SECRET` | Contraseña, token o clave privilegiada. |
| `SENSITIVE_CRYPTO_MATERIAL` | Material de firma, cifrado o continuidad criptográfica. |
| `QA_SECRET` | Credencial de QA, fuera del runtime productivo. |
| `OPTIONAL_UNUSED` | Variable de una capacidad no usada por el perfil actual. |
| `CONDITIONAL_SECRET` | Secreto necesario solo si se habilita su subsistema. |

Estar en un `.env` no implica ser secreto ni dependencia del perfil productivo
normal.

## Auth auditado y contrato objetivo

SH-04.3A observó signup público, email y teléfono habilitados; los tres fueron
hallazgos HIGH. Usuarios anónimos estaban deshabilitados.

| Capacidad | Uso Godel | Target SH-04.3B |
| --- | --- | --- |
| Signup público | No | OFF |
| Signup email público | No | OFF via `DISABLE_SIGNUP` |
| Proveedor email/contraseña | Sí | ON |
| Signup teléfono | No | OFF |
| Usuarios anónimos | No | OFF |
| Login email/contraseña | Sí | ON |
| Auth Admin create user | Sí | ON |
| Reset administrativo | Sí | ON |
| Cambio inicial obligatorio | Sí | ON |
| Recovery, invitaciones, magic links, email OTP | No | Unused |
| OAuth, SAML, SMS | No | Unused |

### Email provider vs public signup

La revisión arquitectónica de SH-04.3B aclaró la semántica de la versión fijada
de GoTrue `v2.189.0`: `ENABLE_EMAIL_SIGNUP` se mapea a
`GOTRUE_EXTERNAL_EMAIL_ENABLED` y funciona como gate del proveedor email/password
para `ResourceOwnerPasswordGrant`. Deshabilitarlo también rechaza el login por
contraseña con proveedor email deshabilitado.

Por tanto, el producto mantiene **public signup OFF**, **public email signup
OFF** y **email/password login ON** con esta configuración:

```text
DISABLE_SIGNUP=true
ENABLE_EMAIL_SIGNUP=true
```

`DISABLE_SIGNUP` es el gate autoritativo del signup público. Mantener habilitado
el proveedor no cambia la separación arquitectónica de Auth Admin: la creación
administrativa usa la API privilegiada server-only. SH-04.3C comprobará el
runtime endurecido antes de aprobar esa transición.

## Modelo de claves

Se conservan ambos modelos de Supabase:

- Legacy: `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`.
- Current/opaque/asymmetric: `SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `JWT_KEYS`, `JWT_JWKS` y credenciales de traducción
  relacionadas.

La decisión es **KEEP BOTH MODELS**. SH-04.3 no realiza migración criptográfica
ni retira familias de claves sin evidencia adicional.

## Topología de archivos y host objetivo

| Archivo | Responsabilidad |
| --- | --- |
| `infra/supabase/.env` | Runtime, configuración y secretos Supabase. |
| `compose.env.local` | Runtime y configuración de Godel. |
| `.env.qa.local` | Solo credenciales QA. |
| Templates trackeados | Contratos y ejemplos; nunca secretos reales. |

Los archivos reales permanecen ignorados/no trackeados. El objetivo productivo
es un host Linux con operador autorizado y permisos equivalentes a `0600` donde
aplique. El entorno Windows/WSL actual es production-like QA y no se declara
equivalente a esa política.

## Decisión SMTP

SMTP está diferido por decisión de producto. Godel no depende de recovery por
email, invitaciones, confirmación de correo, cambio de correo por enlace ni
email transaccional de Auth.

La existencia de variables `GOTRUE_SMTP_*` upstream no convierte SMTP en una
capacidad Godel. SH-04.3B conserva campos inertes en el template para
compatibilidad hasta que SH-04.3C compruebe el arranque de GoTrue. El contrato
nuevo no exige SMTP para runtime Godel, Auth administrativo, backup ni restore.

## Storage y S3

Storage usa backend **FILE**. Ni el backend S3 ni el endpoint compatible con S3
son usados por Godel. El backend decide dónde se persisten objetos; el protocolo
define una superficie compatible para clientes S3.

SH-04.3B retira las credenciales estáticas del protocolo S3 de la inyección del
perfil normal. Conserva sin cambios `STORAGE_BACKEND=file`, bucket/directorio,
tenant, región y ruta del backend de archivos.

## Contrato de recovery

La arquitectura heredada de SH-04.2 es:

```text
Git/source + backup schema3 + material pgsodium protegido
+ archivos externos de runtime/configuración
```

Inventario SH-04.3A: secretos core más `SMTP_PASS` como required; `JWT_KEYS`,
`JWT_JWKS` y credenciales S3 como conditional.

Contrato SH-04.3B para manifests nuevos:

- Required: `POSTGRES_PASSWORD`, `JWT_SECRET`, `SECRET_KEY_BASE`,
  `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `ANON_KEY`,
  `SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` y
  `DASHBOARD_PASSWORD`.
- Conditional: `JWT_KEYS`, `JWT_JWKS` cuando Auth asimétrico está activo.
- Fuera del contrato normal: `SMTP_PASS` y credenciales del protocolo S3.

Los manifests schema3 existentes se verifican según su inventario persistido;
SH-04.3B no los reescribe.

## Hallazgos y decisiones

**HIGH:** signup público/email/teléfono habilitados en A; política Linux de
permisos pendiente; defaults SMTP coexistían con signup email.

**MEDIUM:** `SMTP_PASS` era dependencia de recovery sin capacidad SMTP; S3
protocol tenía credenciales sin uso; `DASHBOARD_USERNAME` es hardening opcional.

**LOW / INFO:** residuos upstream de Logflare, MinIO y Studio AI; modelo dual de
claves esperado; QA aislado y material pgsodium protegido.

## Target SH-04.3B y preflight

- Auth: signup público/email/teléfono y anónimo OFF; proveedor y login
  email/contraseña ON; Auth Admin ON.
- Email: SMTP deferred; recovery e invitaciones unused.
- Storage: backend FILE; protocolo S3 unused/disabled en perfil normal.
- Optional: Logflare, MinIO y Studio AI unused.
- Key model: legacy y current se conservan.
- Producción: set de secretos nuevo, ownership Linux, permisos equivalentes a
  `0600` y ningún secreto en Git.

`npm run ops:secrets:check` valida read-only el contrato core, coherencia entre
archivos, formatos razonables, defaults upstream prohibidos y flags Auth. No
imprime valores, hashes, tokens ni credenciales. Variables opcionales inertes se
informan sin convertirse en blocker.

## Plan de fase

| Subfase | Alcance | Estado |
| --- | --- | --- |
| SH-04.3A | Auditoría read-only | CLOSED / APPROVED |
| SH-04.3B | Contrato tracked y Auth hardening | CLOSED / APPROVED |
| SH-04.3C-R1A | Completar wiring asimétrico y recovery | CLOSED / APPROVED |
| SH-04.3C | Aplicar contrato endurecido y aceptación QA | CLOSED / APPROVED — bloqueador histórico resuelto por R1A/R1B |
| SH-04.3D | Rotación de secretos | CLOSED / APPROVED — D.0–D.6 cerradas; D.6 PASS y R1A forensics aprobada. |
| SH-04.3E | Compatibilidad recovery tras rotación | CLOSED / APPROVED / PASS |
| SH-04.3F | Aceptación operativa final | CLOSED / APPROVED / PASS |

## SH-04.3D — Rotación de secretos

SH-04.3D.0–D.6 están `CLOSED / APPROVED`; D.6 cerró `PASS` la aceptación
agregada de rotación/recovery y SH-04.3D queda `CLOSED / APPROVED`. D.5
conserva TARGET activa/current y finalización recuperada. R1A confirmó que el
backup set pre-cutover `20260830T135345Z-a1b3d14d` existe como copia exacta
recuperable en las raíces canónicas configuradas, con datos y artefacto
protegido presentes, verificación in-place `PASS` y asociación GEN7 resoluble.
El falso negativo inicial fue de lookup/resolución, no una pérdida: el basename
físico es `backup-<backupId>`. No se movió, copió, reconstruyó ni recreó el
artefacto.
La autoridad de arquitectura, matriz de rotación, límites operativos y contrato
de generaciones externas para rotación/recovery es
[SH-04.3D — Rotación segura de secretos](SH_04_SECRET_ROTATION_REPORT.md).
La evidencia detallada de generaciones externas, backup/rollback, cutovers y
recovery, incluida D.5/D.6, está en el informe de rotación enlazado.

## SH-04.3E — Compatibilidad recovery tras rotación

**Estado:** `CLOSED / APPROVED / PASS`.
**Propósito:** demostrar compatibilidad de recovery después de las rotaciones de
secretos completadas. En este cierre intermedio SH-04.3 permanecía `IN PROGRESS`
y SH-04.3F no había iniciado; su aceptación posterior se registra al final de
este documento.

### E.4 — cierre documental

**Estado:** `CLOSED / APPROVED / PASS`. E.4 consolida esta evidencia sin mutar
runtime, generación externa, backups ni material de recovery.

### E.0 — auditoría arquitectónica

**Estado:** `CLOSED / APPROVED / PASS`. Un restore same-host exige que la
generación externa asociada al backup fuente coincida con la generación externa
activa. Por ello, el backup histórico GEN7
`20260830T135345Z-a1b3d14d` no es una fuente de restore same-host ordinario
mientras D5 TARGET está activa. La condición es
`GENERATION_MISMATCH_BY_DESIGN`, no corrupción ni ausencia de material de
recovery.

El set histórico permanece `COMPLETE / VERIFIED`, GEN7-bound,
`HISTORICAL PRE-D5 RECOVERY CHECKPOINT` y retenido. GEN7
`65aea10b-f0ce-4015-bfa3-98086137d303` está `RETAINED / NOT_CURRENT`. Su
portabilidad o reconstrucción clean-host queda dentro del límite de SH-05; no se
ejecutó ni se declara un restore same-host ordinario de GEN7.

### Generación actual y estado EC

La generación externa actual es D5 TARGET
`63d9bbf1-02b7-4b6b-9fe3-e201f26d4da2`, `CURRENT / MATCH`. GEN7 y GEN6 no son
actuales. El estado criptográfico EC preservado es **GEN7-equivalent**; el JWKS
público es **NEW-only EC**. D5 TARGET heredó ese estado EC/Auth aceptado sin
cambio; GEN7 no se designa como generación actual y el JWKS se describe por su
estado público NEW-only EC.

### E.1 — baseline actual de recovery D5

**Estado:** `CLOSED / APPROVED / PASS`. El backup
`20260830T201300Z-aefc033f` es el
`POST_ROTATION_D5_RECOVERY_BASELINE`: `COMPLETE`, schema 3, ligado a D5 TARGET,
con procedencia exacta de repositorio limpio, 4/4 artefactos de datos canónicos,
material de recovery protegido capturado y verificador independiente `PASS`.
Es la fuente canónica demostrada en E.3.

Durante su creación se observó un estado intermedio con `.incomplete`, locks de
operación y recuperación parcial del runtime. El mismo ID alcanzó después
`COMPLETE`, con locks ausentes, runtime sano y verificador independiente `PASS`.
La clasificación correcta es `INTERMEDIATE STATE =
OPERATION_STILL_IN_PROGRESS_OR_UNRESOLVED`; `PROCESS-LIST NEGATIVE RESULT =
NON_AUTHORITATIVE / FALSE_NEGATIVE OBSERVED`; y `EXACT CONTINUATION MECHANISM =
UNKNOWN`.

No se infieren terminación externa, timeout de Codex, locks huérfanos ni
recuperación manual. La regla durable resultante es que ausencia en la lista de
procesos nunca autoriza recovery ni retirar locks: prevalecen el estado
final/incomplete, lock de operación, lock de generación, failure marker y estado
del runtime. Ante estado no terminal se clasifica
`OPERATION_IN_PROGRESS_OR_UNRESOLVED` y no se autoriza una mutación competidora.

### E.2 — readiness destructivo

**Estado:** `CLOSED / APPROVED / PASS`.
**Clasificación:** `D5_DESTRUCTIVE_RESTORE_READY`. El dry-run exacto de SOURCE
D5 pasó verificación de fuente, procedencia de repositorio, compatibilidad de
runtime, dependencias externas de recovery, match de generación, contrato de
montajes, disco, plan de restore y semántica fail-closed. E.2 no ejecutó
mutación destructiva.

### E.3 — backup defensivo y restore destructivo

**Estado:** `CLOSED / APPROVED / PASS`.
**Clasificación:** `D5_POST_ROTATION_DESTRUCTIVE_RECOVERY_PROVEN`.

Se creó exactamente un checkpoint defensivo
`20260831T004014Z-e69d3fca`, clasificado
`PRE-E3 DEFENSIVE RECOVERY CHECKPOINT`: `COMPLETE`, schema 3, D5 TARGET-bound,
verificado independientemente y retenido. Es distinto de SOURCE y no lo
promueve automáticamente sobre la baseline canónica.

Con SOURCE `20260830T201300Z-aefc033f` y ese checkpoint defensivo se ejecutó
exactamente un restore destructivo. La transacción aprobada reemplazó o
reconstruyó PGDATA PostgreSQL y el filesystem de Storage desde SOURCE, la
configuración DB compatible, el material de recovery protegido de pgsodium y los
xattrs de Storage, sin exponer rutas ni material de claves.

La aceptación post-restore pasó de forma sanitizada: D5 TARGET `CURRENT / MATCH`;
autenticación DB 7/7; Supavisor en 5432 y 6543; runtime gestionado TARGET 9/9 y
ausencia 9/9 de la contraseña PostgreSQL fuente GEN7; Supabase 11/11 sano;
Godel 2/2 sano; `/live` y `/ready` 200; e identidades de servicio 13/13
preservadas.

La aceptación Auth confirmó login fresco `PASS`, access token fresco ES256, JWKS
público NEW-only EC, OLD EC ausente de confianza activa, ANON legacy actual,
SERVICE_ROLE legacy actual, publishable opaque actual, secret opaque actual y
credencial actual de Dashboard aceptados; el control inválido fue rechazado. No
se registran tokens, `kid`, JWK, valores secretos ni credenciales.

La baseline business congelada pasó 1/1 en Chromium contra el runtime self-hosted
existente por ingress externo `localhost:8080`. Cubrió el baseline business y de
Storage de solo lectura, incluida la ruta protegida de PDF ya cubierta por el
test, sin introducir capturas ni rutas sensibles.

Los verificadores post-restore de SOURCE y DEFENSIVE pasaron; ambos permanecen
retenidos. El backup histórico GEN7 también permanece retenido sin cambio.

### Contrato de fallo, jerarquía y handoff

Se preserva el contrato de fallo validado: antes de la frontera de mutación puede
intentarse recuperar el runtime original; la frontera es el reemplazo de PGDATA;
un fallo posterior deja runtime quiesced, failure marker y locks retenidos, y
requiere recovery defensivo explícito. E.3 tuvo éxito: failure marker, lock de
backup/restore y lock de generación están ausentes.

La jerarquía posterior queda:

```text
recovery rutinario same-host actual: D5 runtime -> D5 backup -> D5 restore
histórico GEN7: material verificado retenido; recovery explícito consciente de generación
reconstrucción clean-host / portabilidad: SH-05
scheduling, retención y DR off-host de producción: PPO-06
```

Se mantiene `NO_IMPLICIT_ROLLBACK_CHAIN`: restaurar datos históricos no autoriza
retroceder genéricamente el puntero de generación externa. Activar una generación
histórica exige una transacción de recovery diseñada y autorizada explícitamente.

El handoff histórico a **SH-04.3F — Aceptación operativa final** fue completado.
SH-04.3F cerró `CLOSED / APPROVED / PASS`; el siguiente bloque es SH-04.4 y
SH-04.5 permanece `NOT STARTED`.

## SH-04.3C - primer intento y hallazgo de interoperabilidad

El primer intento controlado de SH-04.3C aplico correctamente el hardening de
Auth y SMTP inerte en QA. El preflight de entorno paso, GoTrue quedo sano sin
proveedor SMTP real y el login email/password existente continuo funcionando.

La sonda de Auth Admin con `SUPABASE_SECRET_KEY` devolvio `403` con `bad_jwt`
antes de crear un usuario desechable. La ejecucion se detuvo por fail-fast: no
se modificaron datos ni secretos core, y SH-04.3C no se marca como aprobada.

La causa es **PARTIAL ASYMMETRIC AUTH ACTIVATION**. Godel mantiene el contrato
correcto `SUPABASE_SECRET_KEY` server-only; Envoy traduce la opaque key hacia
`SERVICE_ROLE_KEY_ASYMMETRIC` antes de la autorizacion interna. Sin embargo,
GoTrue no tenia `GOTRUE_JWT_KEYS` activo y no podia verificar el JWT ES256
traducido. Realtime, Storage y Functions tambien mantenian sus consumidores
JWKS desactivados.

La estrategia operacional fue **FORWARD FIX**: QA conserva el contrato Auth
hardened y SMTP inerte del primer intento. No se restauran placeholders SMTP
históricos desconocidos porque SMTP no es capacidad Godel ni se modificó
material core de recovery. R1A completó el wiring coordinado del bundle JWKS y
R1B verificó la compatibilidad HS256/ES256; el bloqueador histórico quedó
resuelto.

## Corrección R1A del bundle asimétrico y recovery

El bundle asimétrico de recovery para manifests nuevos es `JWT_KEYS`,
`JWT_JWKS`, `ANON_KEY_ASYMMETRIC` y `SERVICE_ROLE_KEY_ASYMMETRIC`. Las dos
credenciales `*_ASYMMETRIC` son dependencias de traducción interna del API
gateway cuando Godel usa `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`.

Auth firma con `GOTRUE_JWT_KEYS`; Rest conserva `JWT_JWKS` con fallback legacy;
Realtime, Storage y Functions verifican el mismo JWKS. Esta coordinación permite
verificar sesiones ES256 nuevas sin retirar sesiones HS256 existentes. Ningún
valor de clave, token o credencial se documenta aquí.

## SH-04.3C-R1B — aceptación operativa controlada

R1B recreó en orden verificadores (`realtime`, `storage`, `functions`) y luego
Auth, sin rotar ni modificar secretos, configuración de entorno, base de datos
ni objetos Storage. Rest ya consumía un contrato compatible con JWKS y no
requirió recreación. El runtime confirmó los consumidores JWKS requeridos;
Storage mantuvo backend `FILE` y los nombres de credenciales del protocolo S3
permanecieron ausentes.

La coherencia de la pareja EC de firma/verificación, la continuidad HS256 del
JWKS y la verificación de las credenciales asimétricas anon/service-role pasó
sin exponer material criptográfico. Una sesión HS256 creada antes del cambio
siguió siendo válida después de recrear verificadores y Auth. Tras activar
`GOTRUE_JWT_KEYS`, un login nuevo emitió ES256 con `kid` presente; su firma,
`/auth/v1/user` y una operación REST autenticada pasaron.

El bloqueo original quedó resuelto: Auth Admin mediante
`SUPABASE_SECRET_KEY` completó listado y create/delete de un usuario desechable
sin `bad_jwt`, sin residuo Auth ni perfil. Signup público devolvió `422 /
signup_disabled` sin usuario, y el proveedor telefónico fue rechazado sin
mutación. El login fresco de Godel en `http://localhost:8080` cargó el dashboard
SSR con el perfil admin activo y sin cambio de contraseña pendiente.

La regresión Storage confirmó 131 objetos y el PDF congelado
`qa-storage-access-20260816171811.pdf`: 131075 bytes, firma PDF, redirección
autorizada y respuesta final 200 mediante una sesión fresca de Godel. No se
detectaron errores recientes de JWT en Realtime/Functions ni errores
ENODATA/xattr/metadata de entrega en Storage. Los dos artefactos schema3
retenidos verificaron correctamente y el runtime final quedó en Supabase 11/11,
Godel 2/2 y health live/ready 200.

SMTP conserva configuración inerte: no se contactó proveedor real y no es
requerido por los flujos actuales de Godel. D.5, D.6, SH-04.3E y SH-04.3F están
cerradas/aprobadas; el estado final de SH-04.3 se consolida a continuación.

## SH-04.3F — aceptación operativa final y cierre SH-04.3

**Estado final:** `CLOSED / APPROVED / PASS`.
**Clasificación:** `SH043_FINAL_OPERATIONAL_ACCEPTANCE_PASS`.

SH-04.3A, SH-04.3B, SH-04.3C, SH-04.3D y SH-04.3E quedan
`CLOSED / APPROVED`; SH-04.3F y SH-04.3F.0 quedan
`CLOSED / APPROVED / PASS`. SH-04.3 queda `CLOSED / APPROVED`. SH-04 permanece
`IN PROGRESS`; SH-04.4 y SH-04.5 no han iniciado.

La aceptación final confirmó Dashboard Basic Auth `ENFORCED / PASS`, D5
`CURRENT / MATCH`, Auth hardening `PASS`, login fresco ES256 `PASS`, JWKS público
con EC NEW-only, compatibilidad legacy y opaca actual `PASS`, credenciales
inválidas rechazadas, autenticación de roles PostgreSQL 7/7, Supavisor 5432/6543
`PASS`, consumidores runtime D5 9/9 `MATCH` y ausencia 9/9 de la contraseña
PostgreSQL GEN7 anterior. Supabase quedó 11/11 healthy, Godel 2/2 healthy y
`/live` y `/ready` devolvieron 200; el E2E congelado y la matriz final no
mutante pasaron.

La estabilidad final observó 300 segundos sin intervención: 13/13 identidades
de producción y sus restart counts permanecieron sin cambios. No se mutaron
secretos, punteros, backups, restores ni runtime.

El harness sintético de GoTrue quedó alineado con producción: prepara el
principal reservado `supabase_auth_admin` mediante `supabase_admin`, configura
explícitamente `GOTRUE_API_HOST=0.0.0.0` y `GOTRUE_API_PORT=9999`, y serializa
`GOTRUE_JWT_KEYS` estructurado en la frontera del entorno preservando los
payloads negativos ya serializados. El commit publicado
`50ba878dfea32c45b6dc003bc30860230e6a3b2d` aprobó 3 ejecuciones consecutivas
de integración GoTrue: GEN5, GEN6, GEN7 e inválidos multi/zero `PASS`, además
de modelo, plan y runtime EC `PASS`.

D5 (`63d9bbf1-02b7-4b6b-9fe3-e201f26d4da2`) es `CURRENT / MATCH`; GEN7
(`65aea10b-f0ce-4015-bfa3-98086137d303`) y GEN6
(`b3c52d8f-a42f-45a0-aa7e-d16c1f696475`) permanecen `RETAINED / NOT_CURRENT`.
La baseline canónica `20260830T201300Z-aefc033f` es
`POST_ROTATION_D5_RECOVERY_BASELINE / DESTRUCTIVE_RESTORE_PROVEN`; el checkpoint
defensivo `20260831T004014Z-e69d3fca` y el backup histórico GEN7
`20260830T135345Z-a1b3d14d` permanecen retenidos/verificados. El recovery
rutinario same-host es D5 a D5; GEN7 exige recovery explícito consciente de
generación y se preserva `NO_IMPLICIT_ROLLBACK_CHAIN`. La portabilidad clean-host
permanece en SH-05 y la política de retención/scheduling/off-host en PPO-06.
