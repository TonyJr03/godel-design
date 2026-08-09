# PPO-02D.1 - Informe de healthchecks y dependencia operativa

## Metadatos

- Estado: Ejecutado
- Fase: PPO-02D.1
- Fecha: 2026-08-08
- Host: development-laptop

## Contrato

`liveness != readiness`.

Liveness demuestra solamente que el proceso Next.js atiende una petición HTTP.
No consulta Supabase, base de datos, filesystem, sesión, cookies ni
configuración sensible.

Readiness demuestra que la app tiene configuración mínima server-side y que
puede alcanzar la dependencia Supabase por HTTP con timeout corto. No comprueba
`SUPABASE_SECRET_KEY`, no usa cliente Supabase, no usa RPC, no consulta base de
datos, no consulta Storage y no valida Auth de usuario.

## Endpoints

`GET /api/health/live`:

- Público.
- Sin sesión.
- HTTP 200.
- Body: `{"status":"ok"}`.
- `Cache-Control: no-store`.

`GET /api/health/ready`:

- Público.
- Sin sesión.
- Usa `getSupabaseServerUrl()` y `getSupabasePublishableKey()`.
- Comprueba `GET /auth/v1/health` del endpoint server-side resuelto.
- Usa `fetch(..., { cache: "no-store" })`.
- Timeout aproximado: 2000 ms mediante `AbortController`.
- HTTP 200 con body `{"status":"ready"}` cuando configuración y dependencia
  están disponibles.
- HTTP 503 con body `{"status":"not_ready"}` ante configuración ausente, URL
  inválida, timeout, error de DNS, fallo de conexión, status upstream no exitoso
  o error interno.
- `Cache-Control: no-store`.

Las respuestas no incluyen URL Supabase, project ref, claves, hostname, IP,
duración, nombre de variable ausente, status upstream, excepción ni stack trace.

## Proxy

`src/proxy.ts` excluye explícitamente `api/health(?:/|$)` del negative lookahead
del matcher. Los healthchecks no ejecutan `updateSession()`, no requieren
cookies, no redirigen a `/login` y no realizan lookup de perfil.

## Compose

`app`:

- Healthcheck con `node -e`.
- URL local: `http://127.0.0.1:3000/api/health/ready`.
- `interval: 10s`.
- `timeout: 4s`.
- `retries: 3`.
- `start_period: 15s`.

`nginx`:

- Healthcheck con `nginx -t`.
- `interval: 30s`.
- `timeout: 3s`.
- `retries: 3`.
- `start_period: 5s`.

Dependencia operativa:

- `nginx.depends_on.app.condition = service_healthy`.
- Compose espera que `app` esté healthy antes de iniciar Nginx durante el
  arranque gestionado.
- Esto no se declara como orquestación permanente, failover ni sustituto de
  observabilidad avanzada.

## Estado saludable

- `docker compose --env-file <healthy-env> config --quiet`: exit code 0.
- Servicios: `app`, `nginx`.
- Red: `stack`.
- Volúmenes declarados: 0.
- Build Compose final: exit code 0, 20.2 s.
- Imágenes producidas:
  - `godel-design-app:ppo-02d1`.
  - `godel-design-nginx:ppo-02d1`.
- Marcadores de caché observados en evidencia sanitizada: 7.
- Arranque healthy: `app` pasó por `Started -> Waiting -> Healthy`; Nginx arrancó
  después de satisfacerse `service_healthy`.
- `docker compose ps` confirmó:
  - `app`: `Up ... (healthy)`, puerto interno `3000/tcp`.
  - `nginx`: `Up ... (healthy)`, puerto `127.0.0.1:63598->8080/tcp`.
- Nginx alcanzó `healthy` 1 s después de la inspección inicial.

Endpoints vía Nginx:

- `/api/health/live`: HTTP 200, `{"status":"ok"}`.
- `/api/health/ready`: HTTP 200, `{"status":"ready"}`.
- Ambos con `Cache-Control: no-store`.
- Sin `Set-Cookie`, sin `Location` y sin patrones sensibles en body.

Endpoints desde `app`:

- `http://127.0.0.1:3000/api/health/live`: HTTP 200.
- `http://127.0.0.1:3000/api/health/ready`: HTTP 200.

Smoke funcional vía Nginx:

- `/login`: HTTP 200.
- `/dashboard`: HTTP 307 hacia `/login`.
- Recurso `public`: HTTP 200.
- Recurso `/_next/static`: HTTP 200.
- `/_next/image`: HTTP 200.

Muestra breve de recursos:

- `app`: 0.00% CPU, 61.07 MiB / 2 GiB.
- `nginx`: 0.00% CPU, 12.62 MiB / 256 MiB.

Esta muestra es instantánea y no es benchmark.

## Degradación

Se recreó solo `app` con `compose.degraded.env`, apuntando el endpoint
server-side a un destino sintético no disponible. No se detuvo ni alteró
Supabase local.

Resultados:

- `app` siguió ejecutándose.
- `app` pasó a `unhealthy` en 32 s.
- Nginx siguió ejecutándose.
- Nginx conservó health status `healthy`.
- `/api/health/live` vía Nginx: HTTP 200, `{"status":"ok"}`.
- `/api/health/ready` vía Nginx: HTTP 503, `{"status":"not_ready"}`.
- La respuesta 503 mantuvo `Cache-Control: no-store`.
- La respuesta 503 no incluyó URL sintética, URL real, hostname, IP, variable,
  excepción, stack, project ref, publishable key ni secret key.

Esto demuestra que `unhealthy` no equivale a proceso caído y que liveness y
readiness tienen semánticas distintas.

## Recuperación

Se restauró el archivo healthy y se recreó solo `app`.

- `app` volvió a `healthy` en 5 s.
- Nginx no se reinició manualmente.
- `/api/health/live`: HTTP 200.
- `/api/health/ready`: HTTP 200.
- `/login`: HTTP 200.

Reinicios:

- `docker compose --env-file <healthy-env> restart app`: `app` volvió a
  `healthy` en 5 s; live, ready y login respondieron HTTP 200.
- `docker compose --env-file <healthy-env> restart nginx`: Nginx volvió a
  `healthy` en 5 s; live, ready y login respondieron HTTP 200.
- `docker compose restart` no reaplica cambios de variables de entorno; para
  cambios de configuración se requiere recreación.

## Seguridad

- No se agregaron secretos ni variables nuevas.
- No se usó `SUPABASE_SERVICE_ROLE_KEY`.
- No se comprobó `SUPABASE_SECRET_KEY` como readiness.
- No se creó cliente admin.
- No se consultó `auth.users`.
- No se expusieron URLs, hosts, IPs, claves ni detalles internos en respuestas.
- No se registraron excepciones completas con `console.error()`.
- Los logs revisados no mostraron URL sintética, endpoint local real, nombres
  Supabase, `service_role`, stack traces, `EACCES` ni `EROFS`.

## Limpieza

- Se ejecutó `docker compose --env-file <healthy-env> down --remove-orphans`.
- Contenedores restantes del proyecto: 0.
- Red `godel-design-ppo-02c2_stack`: eliminada.
- Volúmenes del proyecto: 0.
- Imágenes conservadas:
  - `godel-design-app:ppo-02d1`.
  - `godel-design-nginx:ppo-02d1`.
- Supabase local no fue alterado.
- `compose.healthy.env` y `compose.degraded.env` fueron eliminados.
- Se conservaron fuera del repositorio solo `health-summary.md` y
  `health-summary.json` sanitizados.

## Limitaciones

- Supabase administrado pendiente.
- Auth completo pendiente.
- Cambio efectivo de IP de `app` no demostrado.
- Sin TLS.
- Sin Cloudflare.
- Sin `company-host`.
- Sin despliegue.
- Sin E2E completo.

## Resultado

Clasificación:

```text
Aprobada con condiciones
```

PPO-02D.1 queda cerrada como healthchecks locales aprobados. No se marca PPO-02
como completa.

Nota PPO-02D.2: el contrato de readiness contra Supabase administrado fue
corregido posteriormente para enviar la publishable key existente como cabecera
`apikey` en la llamada server-side a `/auth/v1/health`. La revalidación
administrada quedó documentada en
[PPO-02D.2 - Validación con Supabase administrado](PPO_02_MANAGED_SUPABASE_REPORT.md).
