# SH-02.2 — Nginx proxy, URL split y routing TUS

## Estado

```text
SH-02.1 = CLOSED / APPROVED
SH-02.2 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
SH-02 = ACTIVE
NEXT AFTER APPROVAL = SH-02.3
```

## Routing implementado

Nginx conserva `/` hacia `app:3000` y añade, con precedencia explícita, los
prefijos `/auth/v1/`, `/rest/v1/` y `/storage/v1/` hacia
`supabase_backend`. El upstream usa `api-gw:8000` y resolución DNS dinámica de
Docker; no usa IP fija ni `supabase-envoy` como identidad contractual.

`proxy_pass http://supabase_backend` no añade URI, por lo que conserva path y
query string. No se publicaron `/realtime/v1/` ni `/functions/v1/`: la
auditoría no encontró consumidores Godel.

## URL split usado

La validación production-like usó, de forma coherente entre build y runtime:

```text
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8080
SUPABASE_SERVER_URL=http://api-gw:8000
```

La imagen app se construyó con el mismo `NEXT_PUBLIC_SUPABASE_URL` de runtime.
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` se obtuvo del `.env` no versionado del
bundle self-hosted y no se imprimió. El `.env` no versionado del bundle fue
configurado con `SUPABASE_PUBLIC_URL=http://localhost:8080`,
`API_EXTERNAL_URL=http://localhost:8080/auth/v1` y
`SITE_URL=http://localhost:8080`; no se versionó ni se modificaron secretos.

## Auth proxy

Configuración validada: proxy HTTP/1.1 sin caché explícita, conservando Host,
`X-Forwarded-*`, cookies, `Authorization`, `apikey` y query string sin crear
una whitelist frágil.

Evidencia runtime: `GET /auth/v1/health` vía Nginx, con publishable key,
respondió `200`.

## REST proxy

Configuración validada: proxy HTTP/1.1 que no filtra `Authorization`, `apikey`,
`Prefer`, `Range`, `Content-Range`, `Accept-Profile`, `Content-Profile` ni
otros headers PostgREST.

Evidencia runtime: una lectura anónima permitida de tipos de servicio públicos
vía `/rest/v1/` respondió `200`; también permitió las RPC públicas necesarias
para el smoke TUS.

## Storage proxy

Configuración validada: `/storage/v1/` usa el mismo gateway, conserva headers
no modificados, mantiene `client_max_body_size 110m`, timeouts de 300 s,
`proxy_request_buffering off` y `proxy_buffering off`. No se bloquean
`OPTIONS`, `POST`, `HEAD`, `PATCH` ni `DELETE`.

Evidencia runtime: firma presigned, POST, PATCH y HEAD de Storage pasaron por
Nginx y llegaron a Storage.

## TUS

Se ejecutó un smoke público/presigned real con una reserva/capability temporal
creada por las RPC de Godel, sin `service_role`, secret key ni bypass de RLS.
El flujo usó `apikey`, `x-signature`, `x-upsert: false` y headers TUS
generados por el protocolo. Se envió un payload PDF mínimo y no se ejecutó
finalize, listados ni descarga: la sesión abierta queda bajo el lifecycle de
expiración/cleanup existente.

| Paso | Resultado |
| --- | --- |
| Reserva pública | `200` |
| Autorización de firma pública | PASS |
| POST TUS por Nginx | `201` |
| PATCH usando el `Location` devuelto | `204` |
| HEAD usando el mismo `Location` | `200`, offset coherente |

El modo TUS autenticado no se ejecutó: las credenciales QA existentes son del
Supabase CLI local y Auth self-hosted respondió credenciales inválidas. No se
crearon identidades ni se usaron credenciales privilegiadas para sustituir ese
flujo. Su QA funcional pertenece a SH-03.

## Location

La respuesta del POST TUS devolvió `Location` absoluta, con origen
`http://localhost:8080` y path bajo `/storage/v1/`. No contenía `api-gw`,
`supabase-envoy`, `storage:5000` ni otro hostname Docker interno. Por ello no
se añadió `proxy_redirect` ni una reescritura preventiva.

## Readiness

`GET /api/health/ready` vía Nginx respondió `200`. Esto valida que la app usó
`SUPABASE_SERVER_URL=http://api-gw:8000` sobre la red compartida para verificar
Auth, sin recorrer host o Nginx.

## Exposición

| Endpoint | Resultado runtime |
| --- | --- |
| Host → Nginx `:8080` | Disponible |
| Host → api-gw `:8000` | No publicado |
| Host → Supavisor `:5432` / `:6543` | No publicados |
| Host → DB | No publicado |

## Logs

Se revisaron logs focales de Nginx, app, api-gw y Storage durante los smokes.
Los requests de Auth, REST y Storage/TUS registraron `200`/`201`/`204` según
corresponde; no se observaron `502`, `504`, error de resolución upstream, Host
inválido, CORS inesperado ni fuga de hostname interno. Los warnings deprecados
de Envoy pertenecen al bundle upstream y no se modificaron.

## Validación

- Godel Compose config: PASS.
- Supabase Compose + override config: PASS.
- `godel-design-app:local` build: PASS.
- `godel-design-nginx:local` build: PASS.
- `nginx -t` en contenedor: PASS.
- Nginx y app healthchecks: PASS.
- `npm run audit:security`: PASS; 0 violaciones bloqueantes.
- `git diff --check` y `npm run diff:check`: PASS.

## Pendientes

- SH-02.3 formaliza startup/readiness y la estrategia operativa de secretos.
- SH-03 debe validar el flujo funcional completo y TUS autenticado con una
  identidad QA realmente provisionada en el self-hosted.

## Handoff

La siguiente acción, tras revisión arquitectónica, es SH-02.3. No se implementó
SH-03, no hubo commit ni push.
