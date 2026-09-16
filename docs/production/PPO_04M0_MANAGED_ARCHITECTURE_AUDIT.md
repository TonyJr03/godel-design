# PPO-04M.0 — Managed Free Architecture & Governance Audit

**Estado:** `CLOSED / APPROVED`

**Fecha de auditoría:** 2026-09-16

**Baseline Git verificada:** `d974bbc89a7577a3668fb6325e3aded41813f9ba`

**Destino gobernante:** Vercel Hobby + Supabase Managed Free

**Despliegue productivo:** `NOT EXECUTED`

## 1. Scope / baseline

Esta auditoría es read-only sobre aplicación, configuración, migraciones y QA.
El único cambio producido por PPO-04M.0 es documental. No crea proyectos
remotos, no despliega, no aplica SQL, no genera secretos y no modifica código,
tests, migraciones, dependencias, Docker, Compose ni tooling operativo.

La baseline DB auditada y congelada es exactamente:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

```text
BASELINE 01–06 = FROZEN
```

Se inspeccionaron principalmente `src/app`, `src/lib/supabase`, `src/lib/auth`,
`src/lib/usuarios`, `src/lib/storage`, `src/proxy.ts`, `next.config.ts`,
`package.json`, `.env.example`, `playwright.config.ts`, `tests/e2e`, las seis
migraciones y la documentación normativa, de arquitectura, permisos, Storage,
operación y deuda técnica aplicable.

## 2. Executive verdict

El código actual puede operar sobre Vercel + Supabase Managed sin arrastrar
Nginx, Docker, Compose, red interna, Postgres directo ni procesos persistentes.
No se encontró un cambio de código o configuración tracked indispensable antes
de crear el proyecto Supabase.

El contrato mínimo de aplicación en Vercel consta de tres variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

`SUPABASE_SERVER_URL` no es necesaria en Vercel: su ausencia hace que todos los
consumidores server-side usen `NEXT_PUBLIC_SUPABASE_URL`. El override se conserva
en código para topologías locales/self-hosted donde navegador y servidor usan
orígenes distintos.

Las migraciones 01–06 representan el esquema, RLS, grants, RPCs, Auth lifecycle,
bucket y policies requeridos. Esto es suficiencia estática, no aceptación de un
proyecto limpio: PPO-04M.2 debe aplicarlas en orden y demostrar el resultado
sobre Supabase Managed. El build/deploy real y los límites de proveedor también
siguen pendientes.

```text
PPO-04M.0 = CLOSED / APPROVED
PPO-04M.1 = ACTIVE / NEXT
PRODUCTION DEPLOYMENT = NOT EXECUTED
```

## 3. Runtime architecture

```text
Browser
  ├── HTTPS ──> Vercel Hobby
  │              └── Next.js 16 / Node.js
  │                    ├── App Router / SSR / Server Actions
  │                    ├── Route Handlers
  │                    └── Proxy de sesión
  │
  └── HTTPS ──> Supabase Managed Free
                 ├── Auth
                 ├── PostgREST / RPC
                 └── Storage / TUS

Vercel server runtime ── HTTPS ──> Supabase Managed Free
```

Responsabilidades:

| Componente | Responsabilidad Managed |
| --- | --- |
| Vercel | build y runtime Next.js, funciones Node, red pública y HTTPS |
| Supabase | PostgreSQL, PostgREST, Auth, Storage, TUS y sus endpoints managed |
| Repositorio | baseline 01–06, aplicación, RLS/grants/policies y contratos |
| Operación Godel | variables, accesos, settings, QA, backup externo y stop/go |

No forman parte del runtime Managed: Nginx, Docker App, Supabase Compose,
`api-gw`, nombres de red Docker, `localhost`, filesystem persistente, cron local,
daemon de cleanup o conexión PostgreSQL directa. El cleanup de cargas expiradas
es una operación explícita y request-bound; no existe un scheduler productivo
implícito.

## 4. Environment variable contract

### Runtime real de la aplicación

| Variable | Clasificación | Contrato y evidencia |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `REQUIRED — PUBLIC / BUILD+RUNTIME` | Consumida por cliente browser, namespace de cookies, TUS browser y, sin override, clientes server/proxy/admin/readiness. Debe ser el origen HTTPS público del proyecto Managed. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `REQUIRED — PUBLIC / BUILD+RUNTIME` | Publishable por diseño. La usan clientes browser/server/proxy, TUS y readiness. No sustituye RLS. |
| `SUPABASE_SECRET_KEY` | `REQUIRED — SERVER ONLY` | Leída únicamente por `src/lib/supabase/admin.ts`; nunca debe llevar prefijo `NEXT_PUBLIC`, aparecer en cliente, Git, logs ni documentación. |
| `SUPABASE_SERVER_URL` | `OPTIONAL` | Override server-only en `server-config.ts`. En Managed/Vercel se deja ausente y cae a `NEXT_PUBLIC_SUPABASE_URL`. Se conserva para local/self-hosted/LSH. |
| `SUPABASE_SERVICE_ROLE_KEY` | `OBSOLETE / HISTORICAL` para la aplicación | No existe consumo operativo en `src`; solo referencias negativas, SQL de grants/revokes o tooling histórico. No se configura en Vercel. |
| `GODEL_TEST_{ADMIN,SUPERVISOR,WORKER}_{EMAIL,PASSWORD}` | `QA / DEVELOPMENT ONLY` | Credenciales Playwright. No son variables del runtime de producción ni deben ser usuarios/datos reales. |
| `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_EXTERNAL_SERVER` | `QA / DEVELOPMENT ONLY` | Seleccionan el origen E2E y evitan arrancar `npm run dev`. No se configuran en el runtime Vercel. |
| `GODEL_HTTP_*` | `SELF-HOSTED ONLY` | Configuración Nginx/HTTP de Compose; no gobierna Vercel. |
| `GODEL_APP_IMAGE_TAG`, `GODEL_NGINX_IMAGE_TAG` | `SELF-HOSTED ONLY` | Identificadores de imágenes Docker; no gobiernan Vercel. |
| `GODEL_*_CPUS`, `GODEL_*_MEMORY_LIMIT` | `SELF-HOSTED ONLY` | Límites de contenedores; no gobiernan Vercel/Supabase Managed. |
| Variables de Postgres, JWT, Dashboard, SMTP, imágenes y Compose self-hosted | `SELF-HOSTED ONLY` | Pertenecen al stack autocontenido histórico, no al proceso Next.js Managed. |

Los consumidores de `getSupabaseServerUrl()` son los clientes SSR, público
server-side y Auth Admin, el proxy de sesión, readiness y la normalización de
URLs firmadas. Todos aceptan el mismo endpoint público Managed. No se encontró
una dependencia que necesite una URL privada distinta en Vercel.

`.env.example` ya expresa las tres variables requeridas, el override opcional y
las credenciales QA sin valores. No se necesita crear
`.env.production.example` en M.0; este documento completa la clasificación.

## 5. Vercel configuration contract

Configurar posteriormente en el entorno **Production** del proyecto Vercel:

| Variable | Visibilidad | Momento | Regla |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | pública | build + runtime | URL pública HTTPS del proyecto Supabase de piloto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública por diseño | build + runtime | publishable key del mismo proyecto |
| `SUPABASE_SECRET_KEY` | server-only | runtime | secret key del mismo proyecto; solo accesible al código server-only |

No configurar `SUPABASE_SERVER_URL` ni `SUPABASE_SERVICE_ROLE_KEY`. No copiar
variables de Compose, infraestructura o QA al entorno productivo.

Gates de Vercel para PPO-04M.3:

1. vincular el Git/SHA expresamente aprobado;
2. configurar las tres variables sin exponer valores en evidencia;
3. confirmar en el artefacto cliente que no aparece `SUPABASE_SECRET_KEY`;
4. ejecutar build con el runtime Node soportado por la versión de Next fijada;
5. validar `/api/health/live` y `/api/health/ready` por HTTPS;
6. validar cookies, proxy, Server Actions y Route Handlers en el dominio real;
7. registrar límites vigentes de Hobby y detener ante un P0/P1.

## 6. Supabase Managed contract

El proyecto de piloto debe ser nuevo, separado de desarrollo y de los proyectos
históricos. Supabase aporta PostgreSQL/PostgREST, Auth, Storage y TUS; Godel
aporta la baseline y las políticas de acceso.

Contrato de M.1/M.2:

- región y ownership registrados;
- recuperación administrativa y acceso mínimo autorizado;
- URL, publishable key y secret key custodiadas fuera de Git;
- email/password habilitado; signup público y anonymous sign-in deshabilitados;
- Site URL alineada con el origen Vercel cuando este exista;
- baseline vacía antes de aplicar 01–06, sin seed productivo implícito;
- `public` expuesto por PostgREST según el contrato estándar y `private` no
  añadido como esquema público;
- Auth y Storage estándar presentes, junto con disponibilidad de `pgcrypto`;
- capacidad de Storage compatible con archivos de 20 MiB y TUS de 6 MiB por
  chunk, revalidando límites vigentes del proveedor;
- bucket, RLS, grants, triggers y assertions validados después de migrar;
- settings y límites externos registrados como evidencia, no asumidos por la
  compatibilidad histórica PPO-02/PPO-03.

No hay necesidad de Functions, Realtime, Edge Functions, conexión directa a
Postgres, Webhooks, Auth Hooks configurados en Dashboard ni cron para que el
runtime auditado funcione.

## 7. Auth requirements

| Capability | Used? | Required Managed setting | Evidence |
| --- | --- | --- | --- |
| Login email/password | Sí | Email provider habilitado | `signInWithPassword` en `src/app/(interno)/login/actions.ts` |
| Logout | Sí | Ninguno adicional | `signOut` en login y cambio inicial |
| Sesión SSR/cookies/refresh | Sí | URL y publishable key correctas; cookies HTTPS en el origen real | clientes `@supabase/ssr` y `src/lib/supabase/proxy.ts` |
| Validación de sesión | Sí | Auth JWT estándar | `getClaims` en proxy y `getUser` server-side |
| Alta de usuario interno | Sí | Secret key válida; public signup puede estar deshabilitado | `auth.admin.createUser` con `email_confirm: true`; `deleteUser` solo como compensación |
| Reset administrativo | Sí | Secret key válida | `auth.admin.getUserById` y `updateUserById({ password })` |
| Cambio de contraseña inicial | Sí | Email/password habilitado | sesión normal `updateUser({ password })` y RPC privilegiada de lifecycle |
| Signup público | No | Deshabilitar creación pública de usuarios | No existe `signUp` en `src` |
| Anonymous sign-in | No | Deshabilitar anonymous sign-ins | No existe `signInAnonymously` |
| Email confirmation | No como flujo | No depender de confirmación/SMTP; alta admin marca email confirmado | `email_confirm: true` en alta interna |
| Magic link / OTP | No | No configurar como requisito | Sin `signInWithOtp`/`verifyOtp` |
| OAuth | No | Sin proveedores OAuth | Sin `signInWithOAuth` ni callback |
| Recovery por email | No | Sin redirect/recovery URL ni SMTP requerido | Reset es administrativo y directo |
| Redirect/callback Auth | No en el flujo actual | No hay callback funcional; registrar Site URL real por higiene de plataforma | Sin `exchangeCodeForSession` ni callback Auth |
| SMTP propio | No | No es dependencia del piloto actual | No se envían invites, confirmaciones ni recovery emails |

Consumidores exactos del adaptador `createAdminClient()` y, por tanto, de
`SUPABASE_SECRET_KEY`:

1. `src/lib/usuarios/create-internal-user.ts`: `auth.admin.createUser` y
   `auth.admin.deleteUser` exclusivamente para alta/compensación.
2. `src/lib/usuarios/reset-internal-user-password.ts`:
   `auth.admin.getUserById` y `auth.admin.updateUserById`.
3. `src/lib/auth/complete-initial-password-change.ts`: únicamente
   `rpc("complete_initial_password_change")` tras el cambio autenticado.

No se usa ese cliente para tablas de negocio, Storage, listing, pedidos,
solicitudes o Functions. El tercer uso es la excepción de lifecycle ya
gobernada; las demás RPCs y datos usan clientes normales con RLS.

## 8. Database/PostgREST/RPC requirements

La baseline crea `extensions`, `private` y objetos en `public`; depende además
de los esquemas managed estándar `auth` y `storage`. La única extensión explícita
es `pgcrypto`, instalada en `extensions`.

Las 18 tablas públicas son: `perfiles`, `clientes`, `tipos_servicio`,
`solicitudes`, `pedido_contadores`, `pedidos`, `pedido_trabajadores`,
`pedido_tareas`, `archivos`, `archivo_carga_sesiones`,
`archivo_carga_items`, `pedido_comentarios`, `pedido_historial`,
`solicitud_comentarios`, `solicitud_historial`, `trabajo_plantillas`,
`trabajo_plantilla_tareas` y `pedido_pagos`. Todas quedan con RLS habilitado.

El contrato usa roles `anon` y `authenticated`, `auth.uid()`, grants explícitos,
policies por rol y funciones `security definer` controladas. Las RPCs públicas
incluyen:

- lifecycle de solicitudes y pedidos: `actualizar_estado_solicitud`,
  `crear_cliente_desde_solicitud`, `convertir_solicitud_a_pedido`,
  `crear_pedido_manual`, `actualizar_estado_pedido`,
  `actualizar_datos_pedido`, `aplicar_plantilla_tareas_pedido` y
  `actualizar_pago_pedido`;
- consulta: los cuatro `listar_*_comentarios/historial` y
  `consultar_estado_publico`;
- Storage/control plane: `crear_solicitud_publica_sin_archivos`,
  `crear_solicitud_publica_con_reserva_carga`, `reservar_carga_pedido`,
  `autorizar_firma_carga_publica`, `finalizar_carga_publica`,
  `finalizar_carga_pedido` y `reconciliar_cargas_expiradas`;
- Auth lifecycle: `begin_internal_user_creation_attempt`,
  `complete_internal_user_creation_attempt`,
  `complete_initial_password_change`, `begin_internal_user_password_reset`,
  `get_internal_user_password_reset_state` y
  `complete_internal_user_password_reset`.

La migración 05 instala tablas privadas de auditoría/lifecycle y triggers sobre
`auth.users`; esto es integración SQL con Auth Managed, no una consulta normal
de aplicación a `auth.users`. La migración 06 reitera grants y falla si faltan
precondiciones críticas de Auth/Storage/seguridad.

Veredicto estático: 01–06 contienen todo lo indispensable identificado para un
proyecto Managed limpio; no se justifica migration 07. M.2 debe demostrar:

1. aplicación limpia, única y ordenada de 01–06;
2. éxito de assertions finales;
3. exposición PostgREST solo de lo esperado;
4. RLS/grants/RPCs/triggers efectivos para `anon` y `authenticated`;
5. trigger de perfil/lifecycle al crear usuarios con Auth Admin;
6. ausencia de seed o datos históricos no autorizados.

## 9. Storage/TUS requirements

| Elemento | Contrato |
| --- | --- |
| Bucket | `godel-files`, privado (`public = false`) |
| Tamaño máximo | 20 MiB por archivo (`20971520` bytes) |
| Items por sesión | máximo 10 |
| Chunk TUS | 6 MiB |
| Descarga firmada | TTL 120 segundos |
| Upload interno | TUS autenticado con JWT de sesión y publishable key |
| Upload público | URL de upload firmada, `x-signature`, sin bearer anónimo |
| Escritura | `x-upsert: false` |
| Lifecycle | reserved/staged → finalize → committed; expirados reconciliables |
| Listing/descarga | solo interna, autorizada por usuario/RLS; no listing público |

Extensiones admitidas por la aplicación: `pdf`, `jpg`, `jpeg`, `png`, `webp`,
`doc`, `docx`, `zip`, `rar` y `cdr`, con sus MIME canónicos definidos en
`src/lib/storage/constants.ts`. La allowlist del bucket también tolera
`application/x-zip-compressed`; la validación de aplicación sigue siendo más
estrecha y no constituye un bloqueo.

Materializado por 01–06:

- tablas de archivos, sesiones e items y su lifecycle;
- RPCs de reserva, firma, finalize y reconciliación;
- inserción/update del bucket `godel-files` privado con 20 MiB y allowlist MIME;
- cuatro policies de `storage.objects`: TUS interno reservado, upload público
  firmado, select committed y delete gestionado;
- grants, helpers privados y hardening contra lectura/mutación anónima.

Requerido externamente/por proveedor:

- servicio Storage/TUS operativo y endpoints managed alcanzables;
- límites del proyecto compatibles con el contrato de 20 MiB;
- origen/CORS/comportamiento TUS real validados desde el dominio Vercel;
- capacidad/cuota/egress revalidados antes del rollout;
- ejecución operativa explícita del cleanup; no existe cron externo configurado.

El cliente transforma `*.supabase.co` a `*.storage.supabase.co` para TUS managed.
Las URLs firmadas server-side se normalizan al origen público antes de llegar al
navegador. M.2 no debe crear manualmente otro bucket ni policies paralelas: debe
aplicar las migraciones y validar el estado resultante.

## 10. Health/readiness

`/api/health/live` es un Route Handler dinámico, sin dependencias, responde
`{ "status": "ok" }` y deshabilita cache.

`/api/health/ready` construye:

```text
NEXT_PUBLIC_SUPABASE_URL + /auth/v1/health
header: apikey = NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
timeout: 2000 ms
```

En Vercel, al omitir `SUPABASE_SERVER_URL`, ese es exactamente el endpoint
Managed. No envía `Authorization: Bearer`, `SUPABASE_SECRET_KEY` ni service role.
Devuelve `ready` solo con respuesta upstream satisfactoria; error, timeout o
config incompleta producen `503 not_ready`. Es compatible con Route Handlers y
runtime Node de Vercel.

## 11. Next.js/Vercel compatibility

| Hallazgo | Clasificación | Dictamen |
| --- | --- | --- |
| Next.js 16.2.11 / React 19 y scripts `build`/`start` | `VERCEL COMPATIBLE` | Integración estándar; Vercel es adaptador verificado en la documentación instalada de Next.js. |
| App Router, SSR, Server Actions, cookies y Route Handlers | `VERCEL COMPATIBLE` | Patrones soportados, sin servidor custom. |
| `src/proxy.ts` | `VERCEL COMPATIBLE` | Next 16 usa Proxy y por defecto runtime Node; matcher excluye health y assets. |
| Módulos `server-only` | `VERCEL COMPATIBLE` | Separan configuración y Auth Admin del bundle cliente. |
| `output: "standalone"` | `VERCEL COMPATIBLE` pero innecesario | Genera adicionalmente `.next/standalone` para despliegues autocontenidos/Docker. No cambia a static export ni es un blocker del adaptador Vercel. Se conserva sin modificación. |
| Dockerfile, Compose, Nginx y release builder | `VERCEL IRRELEVANT` | Artefactos de la ruta self-hosted, no importados por el runtime. |
| `setTimeout` de readiness | `VERCEL COMPATIBLE` | Timer request-bound de 2 s, limpiado en `finally`; no es proceso en background. |
| TUS browser directo a Supabase | `VERCEL COMPATIBLE` | Los bytes no atraviesan Next/Vercel; requiere validación real de origen/CORS. |
| Build y duración/límites reales de funciones Hobby | `NEEDS EXECUTION VALIDATION` | Validar en M.3/M.4 con límites vigentes, sin asumir cifras externas. |
| Cookies/proxy en dominio `*.vercel.app` | `NEEDS EXECUTION VALIDATION` | Validar login, refresh, roles y cambio inicial en el origen final. |

La búsqueda focal no encontró filesystem writes server-side, `child_process`,
procesos largos, `setInterval`, cron, conexión PostgreSQL directa, dependencia
de `api-gw`, Docker-network o `localhost` en el runtime de producción. Los únicos
`localhost` del código funcional corresponden a detección browser de Supabase
local en el adaptador TUS; no condicionan Managed.

No hay hallazgos clasificados `BLOCKER`.

## 12. E2E/QA applicability

`playwright.config.ts` acepta `PLAYWRIGHT_BASE_URL` y, con
`PLAYWRIGHT_EXTERNAL_SERVER=1`, no levanta `npm run dev`. Los helpers aceptan por
entorno las tres parejas `GODEL_TEST_*` y el URL/publishable key de Supabase.

| Clase | Aplicación |
| --- | --- |
| `REUSABLE AS-IS` | El código de assertions read-only de `smoke.spec.ts`, `public-tracking.spec.ts`, shell/listings y verificaciones visuales puede conservarse. Para ejecución remota aún debe seleccionarse el origen externo. |
| `REUSABLE WITH ENV TARGETING` | Specs sin sufijo `-selfhosted`, usando `PLAYWRIGHT_EXTERNAL_SERVER=1`, `PLAYWRIGHT_BASE_URL=https://…`, URL/key del Supabase de piloto y usuarios QA controlados. No requieren hardcode del dominio Vercel. |
| `LOCAL/SELF-HOSTED ONLY` | `auth-admin-selfhosted`, `core-business-handoff-selfhosted`, `frozen-production-baseline-selfhosted`, `pedidos-*-selfhosted`, `ppo-03g-upload-limits-selfhosted`, `server-action-completion-selfhosted`, `solicitudes-core-selfhosted`, `storage-access-selfhosted`, `storage-cleanup-selfhosted` y `user-management-compatibility-selfhosted`; también `test:e2e:selfhosted` y `qa:bootstrap:selfhosted`. Contienen skips, Docker, `api-gw`, puerto 8000/8080 o contratos production-like locales. |
| `MUTATING — REQUIRES CONTROLLED FIXTURES` | Altas/ediciones de clientes, usuarios, servicios, plantillas, solicitudes, pedidos, tareas, pagos, comentarios, cambios de estado, uploads/finalize y cleanup. Incluye buena parte de `clientes`, `configuracion-servicios`, `usuarios`, `task-templates`, `public-solicitud`, `solicitudes-internas`, `pedidos`, `pedido-edit`, `storage`, uploads directos, `mantenimiento` y `full-visual-qa`. |

Para M.4:

1. crear identidades y datos QA no reales con roles conocidos;
2. seleccionar explícitamente specs read-only versus mutantes;
3. serializar/aislar mutaciones y definir cleanup seguro por IDs creados;
4. no ejecutar la suite completa ni los specs self-hosted contra producción;
5. preservar evidencias sin contraseñas, keys, PII ni URLs firmadas;
6. cubrir health, Auth/roles, RLS, flujo core y TUS/finalize/download sobre el
   entorno Managed antes de rollout.

La suite actual aporta casos reutilizables, pero no constituye por sí sola una
aceptación production-safe. Su bootstrap local no debe reutilizarse contra el
proyecto Managed sin el diseño de fixtures de M.4.

## 13. Managed backup boundary

PPO-04M.5 debe proteger al menos:

| Estado | Boundary Managed |
| --- | --- |
| PostgreSQL | schemas, types, funciones, triggers, grants/policies y datos de `public`/`private` |
| Auth | usuarios, credenciales/estado administrado y vínculo consistente con `public.perfiles` |
| Storage objects | bytes de `godel-files`, paths y hashes/inventario verificable |
| Storage metadata | bucket, metadata de objetos, filas de lifecycle y relación con `archivos` |
| Configuración | región/identidad del proyecto, Auth provider/signup/anonymous/Site URL, límites de Storage y settings reconstruibles |
| Secretos | inventario de nombres, ownership y procedimiento de reprovisión; nunca valores dentro del backup documental |

`ops:backup:selfhosted` y `ops:restore:selfhosted` dependen de Docker, acceso al
Postgres autocontenido y backend Storage filesystem; no son compatibles
directamente con Supabase Managed. Un `pg_dump` lógico, aun cuando esté
disponible, no cubre por sí solo objetos Storage, Auth ni settings.

Discovery pendiente: capacidades de export/restore del plan vigente, alcance de
roles accesibles, exportación segura de Auth, enumeración/copia de objetos,
consistencia entre objetos y metadata, orden de restore, custodia externa,
frecuencia, checksums e incidente de pérdida del proyecto. M.0 no selecciona ni
implementa la herramienta.

## 14. Self-hosted tooling applicability

| Grupo | Tooling |
| --- | --- |
| **A — APPLIES TO MANAGED PILOT** | `npm run build`, lint/verify/diff checks, auditorías estáticas `audit:*`, Playwright genérico con target externo y, en M.2, el mecanismo Supabase autorizado para aplicar/verificar 01–06. `types:supabase` solo si una futura migración cambia tipos, no para M.0. |
| **B — HISTORICAL / REFERENCE ONLY** | Docker App/Nginx release, `test:e2e:selfhosted`, QA bootstrap self-hosted, Supabase Compose, SH backup/restore, secrets/generations, rotaciones Postgres/JWT/API keys, update/rollback del bundle y spikes managed PPO-03. Son evidencia/patrones, no gates ejecutables de PPO-04M. |
| **C — FUTURE LSH ONLY** | Admisión clean-host, adquisición/build/transporte offline de imágenes, manifiesto de portabilidad, bootstrap/reconstrucción runtime, activación de generaciones y restore de target clean-host. |

Nada se elimina ni desactiva. La clasificación solo evita convertir requisitos
de operación self-hosted en falsos gates del piloto Managed.

## 15. Security/debt classification

Se conservan abiertas `TD-SECURITY-001` y `TD-STORAGE-002`.

### BLOCKER FOR MANAGED PILOT

- secreto Auth Admin exclusivamente server-only y ausencia de secret/service
  role en browser, Git, logs y evidencias;
- RLS, grants, Auth lifecycle, bucket privado y policies 01–06 aplicados y
  probados en Managed;
- signup público y anonymous sign-in deshabilitados;
- HTTPS, health, Auth/roles y casos negativos P0/P1 aprobados;
- estrategia externa mínima de backup/recovery aprobada en M.5;
- rollout pequeño, supervisado, con ownership y stop inmediato ante pérdida de
  datos, acceso indebido, abuso material, malware sospechoso o falta de cuota.

### IMPORTANT AFTER PILOT

- `TD-SECURITY-001`: rate limiting/captcha/honeypot/telemetría antiabuso antes
  de exposición pública no controlada o ampliación del piloto;
- `TD-STORAGE-002`: escaneo, cuarentena o revisión especializada antes de
  aceptar volumen real no supervisado de archivos;
- observabilidad, alertas y operación completas de PPO-07.

La deuda completa no bloquea el piloto **estrictamente limitado** definido por
la gobernanza actual, pero sí bloquea ampliar su exposición/volumen sin una
decisión explícita. M.3/M.4 deben registrar que `/solicitud` y `/estado` son
superficies públicas y escalar cualquier abuso como criterio de pausa; M.0 no
introduce mecanismos nuevos.

## 16. Blockers

```text
CODE / TRACKED CONFIG BLOCKERS = NONE FOUND
```

Pendientes de ejecución que no son blockers de M.0:

- crear y asegurar el proyecto Supabase de piloto;
- confirmar settings y límites vigentes del proveedor;
- aplicar y validar 01–06 en limpio;
- desplegar el SHA autorizado en Vercel;
- ejecutar QA Managed con fixtures controlados;
- aprobar backup externo antes de uso real;
- decidir go/stop del rollout limitado.

Un fallo de cualquiera de esos gates bloqueará su fase correspondiente; esta
auditoría no los da por ejecutados.

## 17. PPO-04M.1 handoff

PPO-04M.1 queda listo para:

1. crear un proyecto Supabase Free nuevo y separado, con región y ownership
   aprobados;
2. registrar acceso/recuperación administrativa y custodiar URL/keys sin
   exponer valores;
3. habilitar email/password, deshabilitar public signup y anonymous sign-in;
4. no configurar OAuth, magic links, recovery email, SMTP, Auth Hooks o
   service-role como requisitos de Godel;
5. registrar Site URL prevista y actualizarla al origen Vercel real cuando
   exista; no inventar callback URLs;
6. confirmar disponibilidad de Auth, PostgREST, Storage/TUS y `pgcrypto`;
7. registrar límites vigentes relevantes a 20 MiB, cuotas, egress y pausas;
8. entregar de forma segura a M.2 la identidad del proyecto y las keys
   publishable/secret, sin aplicar todavía la baseline si M.1 no lo autoriza;
9. preservar proyecto vacío, sin seed productivo, hasta el provisioning
   controlado de M.2.

M.2 aplicará exactamente 01–06 y verificará DB/Auth/Storage. M.3 configurará en
Vercel solo las tres variables del contrato. M.4 ejecutará la aceptación
Managed; M.5 cerrará el backup mínimo antes del uso real.

## 18. Final status

La evidencia del repositorio permite aprobar la arquitectura y gobernanza
Managed sin cambios de runtime.

```text
PPO-04M = ACTIVE / NEXT
PPO-04M.0 = CLOSED / APPROVED
PPO-04M.1 = ACTIVE / NEXT
PPO-04M.2–PPO-04M.7 = NOT STARTED
PRODUCTION DEPLOYMENT = NOT EXECUTED
```

Esta aprobación no afirma que exista proyecto Supabase, deployment Vercel,
producción activa, QA Managed aprobado ni backup Managed implementado.
