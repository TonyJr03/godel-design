# SH-04.3 — Production Secrets & Auth Hardening

## Estado

| Bloque | Estado |
| --- | --- |
| SH-04.3 | IN PROGRESS |
| SH-04.3A — auditoría | CLOSED / APPROVED |
| SH-04.3B — contrato tracked y configuración | IN PROGRESS |

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
| SH-04.3B | Contrato tracked y Auth hardening | IN PROGRESS |
| SH-04.3C | Aplicar contrato endurecido a QA | Pendiente |
| SH-04.3D | Rotación de secretos | Pendiente |
| SH-04.3E | Compatibilidad recovery tras rotación | Pendiente |
| SH-04.3F | Aceptación operativa final | Pendiente |
