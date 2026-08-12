# SH-02.0 — Diseño de integración Godel ↔ Supabase self-hosted

## Estado

```text
SH-02.0 = CLOSED / APPROVED
SH-02.1 = CLOSED / APPROVED
SH-02.2 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
SH-02 = ACTIVE
NEXT AFTER APPROVAL = SH-02.3
```

Este documento define el objetivo production-like para la integración. No
implementa todavía cambios de Compose, Nginx, secretos, código o bundle
upstream. `BASELINE 01–06 = FROZEN` y permanece fuera de alcance.

## Objetivo

Conectar el runtime Docker de Godel con el bundle oficial de Supabase
self-hosted mediante una única frontera HTTP pública y una red Docker limitada.
El resultado esperado de SH-02 es que la topología sea comprobable sin cambiar
el modo de desarrollo cotidiano ni acoplar el ciclo de vida de ambos stacks.

## Estado de partida

El runtime actual tiene `app` y `nginx` en `compose.yaml`, pero conserva el
project name histórico `godel-design-ppo-02c2` y tags `ppo-02c2`. Nginx publica
solo la aplicación y el readiness de la app consulta
`/auth/v1/health` contra `SUPABASE_SERVER_URL`, con fallback a
`NEXT_PUBLIC_SUPABASE_URL`.

El bundle upstream fijo vive en `infra/supabase/`, usa el project name
`supabase`, expone su gateway como servicio `api-gw:8000` y cuenta con el
override Godel `infra/supabase-godel.local.yml`. El proyecto de Supabase CLI
local mantiene `project_id = "godel-design"`; ese nombre queda reservado y no
puede ser un Compose project del runtime.

La auditoría de consumidores confirma:

- Browser: Auth, REST y Storage, incluido TUS autenticado
  `/storage/v1/upload/resumable` y TUS presigned
  `/storage/v1/upload/resumable/sign`.
- Next server: cliente de sesión normal contra Supabase y endpoint de
  readiness de Auth.
- Auth Admin: `SUPABASE_SECRET_KEY` únicamente mediante
  `src/lib/supabase/admin.ts`, para alta de usuarios internos, compensación,
  cambio inicial y reset administrativo de contraseña.
- Realtime y Edge Functions: no hay consumidor Godel actual; no se publicarán
  en el alcance inicial.

## Decisiones arquitectónicas

### Naming

| Ámbito | Identidad decidida |
| --- | --- |
| Supabase CLI local | `project_id = godel-design` |
| Supabase self-hosted | Compose project `supabase` |
| Runtime Godel | Compose project `godel-runtime` |
| Servicios Godel | `app`, `nginx` |
| Contenedores Godel esperados | `godel-runtime-app-1`, `godel-runtime-nginx-1` |
| Imagen app por defecto | `godel-design-app:local` |
| Imagen Nginx por defecto | `godel-design-nginx:local` |

No se usarán `container_name` para servicios Godel ni identificadores `ppo-*`,
`sh-*`, `02c2` o `preprod-*` como identidad persistente. En una etapa de
release posterior podrán utilizarse tags explícitos `<release>` o `<git-sha>`;
SH-02 no diseña registry ni pipeline.

### Modelo de dos Compose projects

Se aprueba la **opción B**: `godel-runtime` y `supabase` son Compose projects
independientes y se integran solo mediante una red API externa compartida.

La opción A, un Compose monolítico, queda descartada: obliga a componer o
duplicar el bundle upstream, acopla sus actualizaciones y ciclo de vida al de
Godel, y debilita la portabilidad prevista en SH-04/SH-05. No existe blocker
técnico que justifique esa pérdida de aislamiento. No se usará `include:`.

### Redes

La red compartida será `godel-supabase-api`, declarada `external: true` por
ambos projects. Su dueño es el operador del entorno production-like: se crea
una vez, de forma explícita y antes de iniciar cualquiera de los stacks. Esto
evita que el ciclo de `down` de uno de los projects destruya la frontera usada
por el otro.

Implementado en SH-02.1:

- `app` y `nginx` conservarán una red privada propia de `godel-runtime` para
  la aplicación y también se unirán a `godel-supabase-api`.
- Solo `api-gw` del project `supabase` se unirá a
  `godel-supabase-api`, además de su red privada upstream por defecto.
- `db`, `supavisor`, `auth`, `rest`, `storage` y los demás servicios upstream
  no se unirán a la red compartida.
- Se usará el alias explícito `api-gw` para el gateway en la red compartida.
  No son necesarios aliases para `app` ni `nginx` en esa red.

No se usarán IPs fijas, `network_mode: host` ni conexión de Godel a la red
privada/default completa de Supabase.

### Topología HTTP

```text
Browser
  │
  ▼
Nginx (único frontend HTTP)
  ├── /                         → app:3000
  └── /auth/v1, /rest/v1,
      /storage/v1               → api-gw:8000
                                     │
                                     └── red privada Supabase → Auth / REST / Storage / DB

Next server (app) ────────────────→ api-gw:8000
```

El navegador no accede directamente a `api-gw`, Auth, Storage, PostgREST, DB
ni Supavisor. El servidor Next no recorre host → Nginx para llegar a Supabase.

### Contrato build-time de `NEXT_PUBLIC_*`

La imagen Next actual consume `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` como `ARG` antes de `npm run build` en
`Dockerfile`; `compose.yaml` les entrega también como build args. Por tanto son
configuración pública de **build-time** de la imagen actual y deben ser
coherentes con esos mismos valores en el environment de runtime.

Con esta arquitectura, un cambio de origen público de Supabase o de publishable
key requiere reconstruir la imagen de `app`. SH-02 no implementará inyección
en runtime de variables `NEXT_PUBLIC_*`; SH-02.1 y SH-02.3 deberán preservar
este contrato.

En cambio, `SUPABASE_SERVER_URL` y `SUPABASE_SECRET_KEY` son exclusivamente
configuración runtime server-side y no se pasan como build args.

### Split de URLs

| Actor | Variable / URL | Valor production-like local propuesto | Propósito |
| --- | --- | --- | --- |
| Browser | `NEXT_PUBLIC_SUPABASE_URL` | `http://localhost:8080` | Origen público Nginx para Auth, REST y Storage. |
| Next server | `SUPABASE_SERVER_URL` | `http://api-gw:8000` | Gateway interno por la red compartida. |
| Supabase / Studio / Storage | `SUPABASE_PUBLIC_URL` | `http://localhost:8080` | URL pública del stack que Studio muestra y Storage usa como URL pública. |
| Auth | `API_EXTERNAL_URL` | `http://localhost:8080/auth/v1` | URL externa de Auth para issuer, enlaces y callbacks OAuth/SAML. |
| Auth | `SITE_URL` | `http://localhost:8080` | URL primaria de la aplicación para redirects y enlaces de Auth. |
| Auth | `ADDITIONAL_REDIRECT_URLS` | lista explícita mínima bajo `http://localhost:8080` si se habilita un flujo que la necesite | Allowlist adicional de redirects de Auth. |

`SUPABASE_SERVER_URL ?? NEXT_PUBLIC_SUPABASE_URL` es el fallback existente. Se
mantendrá: para production-like se configurará el primer valor; desarrollo
local y usos ya compatibles podrán seguir usando el segundo si aquel está vacío.
No se cambia este contrato en SH-02.0.

Los valores son el objetivo local propuesto y deberán convertirse al origen
público aprobado por PPO-04 (host/IP/dominio y esquema TLS), incluidos
`SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL`, `SITE_URL` y la allowlist de
redirects. Nunca se usará `api-gw:8000` como URL que vea el navegador.

### Proxy Nginx

SH-02.2 implementó rutas explícitas antes del fallback de la aplicación:

| Ruta pública | Upstream | Incluida |
| --- | --- | --- |
| `/auth/v1/` | `api-gw:8000` | Sí |
| `/rest/v1/` | `api-gw:8000` | Sí |
| `/storage/v1/` | `api-gw:8000` | Sí |
| `/` | `app:3000` | Sí |
| `/realtime/v1/` | — | No; sin consumidor actual |
| `/functions/v1/` | — | No; sin consumidor actual |

Las ubicaciones Supabase preservan URI, query string y los headers de
autenticación. Para todos los upstreams se conservan o generan solamente:
`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`,
`X-Forwarded-Host`, `X-Forwarded-Port`, `Authorization`, `apikey`, `Upgrade` y
`Connection` cuando corresponda. El upstream `supabase_backend` resuelve
`api-gw:8000` mediante DNS dinámico Docker; no usa IP fija ni
`supabase-envoy` como contrato.

No se configuró una whitelist de request headers: Nginx reenvía los headers no
modificados, incluidos `Authorization`, `apikey`, `x-signature`, `x-upsert` y
los headers TUS. En Storage se configuraron explícitamente
`proxy_request_buffering off` y `proxy_buffering off`; se mantienen los
timeouts de 300 s y `client_max_body_size 110m`. Realtime y Edge Functions
continúan sin rutas públicas.

### Storage y TUS

Nginx debe permitir el flujo Browser → Nginx → api-gw → Storage para las rutas
TUS autenticada y presigned. El consumidor actual usa `tus-js-client` y los
contratos por modo son:

```text
public:        apikey, x-signature, x-upsert
authenticated: apikey, Authorization, x-upsert
```

En `/storage/v1/`, el proxy preservará los siguientes request headers
relevantes:

```text
Authorization, apikey, x-signature, x-upsert, Tus-Resumable, Upload-Offset,
Upload-Length, Upload-Metadata, Content-Type, Content-Length y los demás
headers TUS que el cliente o protocolo emita realmente.
```

Los response headers críticos incluyen:

```text
Location, Tus-Resumable, Upload-Offset y los demás headers TUS de respuesta
que correspondan.
```

`Location` es un header de respuesta. El smoke real de SH-02.2 recibió una URL
absoluta en `http://localhost:8080`, con path `/storage/v1/...`, sin hostname
interno; por ello no se configuró `proxy_redirect` ni otra reescritura. El
smoke comprobó POST + `Location` + PATCH + HEAD usando exactamente la URL
devuelta.

El proxy aceptará los métodos `POST`, `PATCH`, `HEAD`, `OPTIONS` y `DELETE`
cuando Storage/protocolo lo requiera. Mantendrá `proxy_request_buffering off`,
`proxy_buffering off`, timeouts compatibles con cargas resumibles y el límite
actual de 110 MB sin relajarlo. La decisión definitiva de límites pertenece a
PPO-03G.

### Puertos y exposición

| Componente | Host / LAN | Decisión SH-02 |
| --- | --- | --- |
| Nginx | Sí, único frontend HTTP; el bind concreto puede ser loopback local | Publica el único puerto de Godel. |
| `app:3000` | No | Solo `expose` y redes Docker. |
| `api-gw:8000` | No | Host bind retirado; acceso por Nginx o red compartida. |
| DB | No | Sin puertos host/LAN. |
| Supavisor | No | Host binds `5432`/`6543` retirados. |

SH-02.1 implementó las retiradas aprobadas para el runtime production-like estándar.
Un acceso de diagnóstico futuro será temporal y loopback mediante procedimiento
u override específico, no una exposición permanente. DB continúa sin puerto
host; DB, Supavisor y api-gw nunca serán públicos/LAN directos.

### Secretos

Supabase self-hosted es la autoridad de sus secretos: su `.env` no versionado
define `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` y los demás secretos
del bundle. El env de Godel es configuración propia y solo recibe las variables
que la aplicación consume, separadas explícitamente por fase:

| Variable Godel | Fase / visibilidad | Fuente autorizada | Destino / clasificación |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | BUILD + RUNTIME PUBLIC | Configuración Godel | Build arg y Browser; origen Nginx público. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | BUILD + RUNTIME PUBLIC | `SUPABASE_PUBLISHABLE_KEY` de Supabase | Build arg, Browser y Next; pública. |
| `SUPABASE_SERVER_URL` | RUNTIME SERVER-ONLY | Configuración Godel | Solo contenedor app; `http://api-gw:8000`. |
| `SUPABASE_SECRET_KEY` | RUNTIME SERVER-ONLY | `SUPABASE_SECRET_KEY` de Supabase | Solo contenedor app, Auth Admin. |

La propagación será por un archivo/env store no versionado de Godel con valores
copiados o inyectados por el operador desde la autoridad Supabase, nunca con
`env_file: infra/supabase/.env` sobre `app`. No se usará
`SUPABASE_SERVICE_ROLE_KEY` en Godel ni se entregarán al runtime de Godel los
demás secretos del bundle. Los valores `NEXT_PUBLIC_*` entregados como build
args y runtime env deben coincidir; si cambia cualquiera de ellos, se
reconstruye la imagen app.

`SUPABASE_SECRET_KEY` queda clasificada como **required, server-only, Auth
Admin specialized**: es requerida por los flujos de alta, compensación, cambio
inicial y reset administrativo de contraseñas. No es una credencial para tablas
de negocio, Storage ni consumidores client-side.

### Startup, readiness y recuperación

Al ser projects distintos no se usarán `depends_on` cruzados. El procedimiento
operativo será:

1. Crear o verificar `godel-supabase-api`.
2. Iniciar `supabase` y esperar `api-gw` healthy.
3. Iniciar `godel-runtime`.
4. El healthcheck de `app` consulta `/api/health/ready`; este consulta
   `http://api-gw:8000/auth/v1/health` con publishable key.
5. Nginx depende de `app` healthy dentro de `godel-runtime`.

El contrato actual de readiness es suficiente para SH-02: valida disponibilidad
del gateway y Auth desde la misma ruta server-side que usarán las sesiones. No
requiere cambio en SH-02.0. Los smokes SH-02.4 deberán demostrar que:

| Evento | Comportamiento esperado |
| --- | --- |
| `api-gw` no disponible o arrancando | readiness de app devuelve 503; Nginx sigue presente. |
| `api-gw` vuelve | readiness vuelve a 200 sin reconfiguración manual. |
| app no disponible | Nginx no desaparece; su upstream falla de forma controlada. |
| app vuelve healthy | Nginx recupera tráfico mediante DNS dinámico y dependencia local. |
| Nginx reinicia | app y Supabase no se reinician; el frontend se recupera al volver Nginx. |

### Desarrollo local

No cambia el modo vigente:

```text
Desarrollo / E2E local: npm run dev → Supabase CLI local
Production-like: Godel Docker + Nginx → Supabase self-hosted
```

`supabase/config.toml` y `project_id = godel-design` no se modificarán para
SH-02.

## Matriz de conectividad

| Source | Destination | Allowed | Reason |
| --- | --- | ---: | --- |
| Browser | Nginx | Sí | Único frontend HTTP público. |
| Browser | api-gw directo | No | Evita bypass del proxy. |
| Browser | Auth, REST o Storage directos | No | Se accede solo por Nginx → api-gw. |
| Browser | DB | No | Servicio privado. |
| Browser | Supavisor | No | Servicio privado. |
| Nginx | `app:3000` | Sí | Proxy de Next.js. |
| Nginx | `api-gw:8000` | Sí | Proxy público Auth, REST y Storage. |
| app | `api-gw:8000` | Sí | Cliente Supabase server-side y readiness. |
| app | DB | No | No hay conexión directa. |
| app | Supavisor | No | No hay conexión directa. |
| `api-gw` | servicios privados Supabase | Sí | Routing interno del bundle upstream. |
| DB / Supavisor | red `godel-supabase-api` | No | Aislamiento de datos y pooler. |

## Topología objetivo

```text
                         godel-supabase-api (external)
             ┌─────────────────────────────────────────────┐
Browser ───► │ nginx ───────────────► api-gw                │
             │   └──► app ─────────► api-gw                │
             └──────────────────────────┬──────────────────┘
                                        │
                         supabase private/default network
                                        │
                         auth / rest / storage / db / supavisor
```

## Riesgos y decisiones pendientes de revisión

- La respuesta `Location` real de TUS debe verificarse en SH-02.2. El diseño
  exige que sea relativa o pública; si es interna se implementará el rewrite
  dirigido descrito, con smoke que lo pruebe.
- `ADDITIONAL_REDIRECT_URLS` será mínimo y explícito. El código actual usa
  autenticación por contraseña y no registra `redirectTo`; un flujo futuro de
  email/OAuth debe añadir solo sus callbacks públicos concretos.
- El override Godel vigente es `infra/supabase-godel.override.yml`; conserva
  los ajustes JWT/JWKS y delimita la red compartida sin modificar el bundle
  upstream.
- El smoke TUS autenticado queda pendiente de SH-03: las credenciales QA de
  Supabase CLI no existen en el runtime self-hosted validado. SH-02.2 validó el
  modo público presigned real sin crear identidades ni usar bypasses.

## Plan de implementación SH-02

| Subbloque | Alcance |
| --- | --- |
| SH-02.0 | Diseño, naming y auditoría de consumidores — este documento. |
| SH-02.1 | Compose, project name neutral, imágenes y red externa compartida — cerrada/aprobada. |
| SH-02.2 | Proxy Nginx, split de URLs y routing compatible con TUS — implementado; pendiente de revisión. |
| SH-02.3 | Readiness, startup, configuración y secreto mínimo. |
| SH-02.4 | Smoke técnico, documentación de evidencia y cierre SH-02. |

Los smokes técnicos SH-02.4 se limitarán a Compose válido, red/DNS, health,
readiness, proxy Auth/REST/Storage, TUS, y aislamiento de DB/Supavisor. La QA
funcional de dashboard, roles, flujos de negocio, Auth Admin y uploads E2E
completos pertenece a SH-03.

## Criterios de aceptación de SH-02

- Los projects `godel-runtime` y `supabase` se inician y actualizan de forma
  independiente, unidos solo por `godel-supabase-api`.
- Browser utiliza exclusivamente Nginx; Next utiliza `api-gw:8000` interno.
- Auth, REST y Storage funcionan por Nginx; TUS conserva headers, métodos y
  una cabecera `Location` no interna.
- Realtime y Edge Functions no se publican sin consumidor real.
- DB y Supavisor no son alcanzables desde Browser ni `app`, y no se publican al
  host/LAN.
- La app recibe solo publishable key, secret key server-only si es necesaria y
  sus propias URLs; no hereda el env completo de Supabase.
- La recuperación respeta el contrato de readiness descrito.
- `npm run dev` continúa usando Supabase CLI local y baseline 01–06 no cambia.

## Handoff

La siguiente acción, después de aprobación arquitectónica de SH-02.2, es
SH-02.3. No se debe implementar el cierre operativo de startup y secretos antes
de esa aprobación.
