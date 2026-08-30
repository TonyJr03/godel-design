# SH-04.3 — Production Secrets & Auth Hardening

## Estado

| Bloque | Estado |
| --- | --- |
| SH-04.3 | IN PROGRESS |
| SH-04.3A — auditoría | CLOSED / APPROVED |
| SH-04.3B — contrato tracked y configuración | CLOSED / APPROVED |
| SH-04.3C-R1A — wiring asimétrico | CLOSED / APPROVED |
| SH-04.3C — aplicación y aceptación QA | CLOSED / APPROVED |

SH-04.3 no está cerrada. Este documento es la fuente vigente de decisiones de
secretos, configuración y Auth durante SH-04.

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
| SH-04.3D | Rotación de secretos | IN PROGRESS — D.0–D.5 CLOSED / APPROVED; D.6 es el siguiente gate de aceptación. |
| SH-04.3E | Compatibilidad recovery tras rotación | Pendiente |
| SH-04.3F | Aceptación operativa final | Pendiente |

## SH-04.3D — Rotación de secretos

SH-04.3D.0–D.5 están `CLOSED / APPROVED`. D.5 completó la rotación de
contraseña PostgreSQL, con TARGET activa/current y finalización recuperada;
SH-04.3D permanece `IN PROGRESS` hasta D.6. D.6 es el siguiente gate de
aceptación agregado y no inicia automáticamente una nueva rotación.
La autoridad de arquitectura, matriz de rotación, límites operativos y contrato
de generaciones externas para rotación/recovery es
[SH-04.3D — Rotación segura de secretos](SH_04_SECRET_ROTATION_REPORT.md).
La evidencia detallada de generaciones externas, backup/rollback, cutovers y
recovery, incluida D.5, está en el informe de rotación enlazado. SH-04.3E/F
permanecen pendientes.

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
requerido por los flujos actuales de Godel. D.5 está cerrada/aprobada, D.6 es
siguiente y SH-04.3E/F permanecen pendientes; por ello SH-04.3 sigue `IN
PROGRESS`.
