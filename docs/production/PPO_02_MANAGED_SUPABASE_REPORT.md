# PPO-02D.2 - Validacion con Supabase administrado

## Metadatos

- Estado: Ejecutado - Aprobada con condiciones
- Fase: PPO-02D.2
- Fecha: 2026-08-08
- Host: development-laptop
- Backend: Supabase administrado Free

## Contexto

PPO-02D.2 corrige y revalida el contrato de readiness contra Supabase
administrado sin cambiar arquitectura, topologia, Compose ni politica de
secretos.

El contexto de red declarado para Codex fue:

```text
VPN activo / ProTUN
```

Codex no desactivo el VPN y no ejecuto operaciones PostgreSQL administrativas
remotas. La evidencia manual de Direccion Tecnica se toma como precondicion
aprobada:

- `dbPushSucceeded`: true.
- `remoteMigrationCount`: 6.
- `remoteMatchesLocalBaseline`: true.
- `pendingMigrationsAfterPush`: 0.
- `seedApplied`: false.

No se ejecuto:

- `supabase migration list --linked`.
- `supabase db push`.
- `supabase db push --dry-run`.
- `supabase db pull`.
- `supabase db reset`.
- `supabase migration repair`.
- `supabase db diff`.
- `psql` remoto.
- conexion directa PostgreSQL remota.

La restriccion ProTUN/PostgreSQL queda clasificada como condicion administrativa
del canal PostgreSQL, no como fallo demostrado del runtime HTTPS.

## Cambio aplicado

Archivo modificado:

- `src/app/api/health/ready/route.ts`.

Cambio exacto:

- Se conserva `getSupabaseServerUrl()`.
- Se usa el helper existente `getSupabasePublishableKey()`.
- La llamada directa a `/auth/v1/health` envia solo:

```ts
headers: {
  apikey: publishableKey,
}
```

Se conserva:

- `cache: "no-store"`.
- `AbortController`.
- timeout de readiness de 2000 ms.
- `clearTimeout`.
- respuestas seguras `ready` / `not_ready`.

No se agrego:

- `Authorization`.
- `Bearer`.
- claves hardcodeadas.
- variables nuevas.
- cliente Supabase.
- cliente admin.
- uso de `SUPABASE_SECRET_KEY` para readiness.

## Validaciones estaticas

- `npm.cmd run lint`: OK.
- `npm.cmd run build`: OK.
- `npm.cmd run audit:security`: OK, 0 violaciones bloqueantes.
- `npm.cmd run audit:client-supabase`: OK, sin coincidencias.
- `git diff --check`: OK; solo aviso Git de normalizacion LF/CRLF en la ruta
  editada.

La busqueda focalizada en `src/app/api/health/ready/route.ts` confirmo que no
aparecen `Authorization`, `Bearer`, `SUPABASE_SECRET_KEY` ni `createClient`; solo
aparece `apikey` en la cabecera esperada.

## Validacion local

Supabase local existente estaba disponible en `127.0.0.1:54321`.

Resultados:

- `/auth/v1/health` local con `apikey`: HTTP 200.
- `next start` local temporal en puerto alterno contra Supabase local:
  `/api/health/ready` HTTP 200, `{"status":"ready"}`.

El proceso local temporal fue apagado. No se ejecuto `supabase db reset` ni se
altero Supabase local.

## Supabase administrado por HTTPS

Con VPN activo y publishable key en cabecera `apikey`:

- `/auth/v1/health`: HTTP 200.
- `managedAuthHealthWithApiKey`: true.

No se imprimieron URL completa, project ref ni claves en la documentacion.

## Docker Compose administrado

Comandos ejecutados:

- `git check-ignore compose.env.local`: OK.
- `docker compose --env-file compose.env.local config --quiet`: OK.
- `docker compose --env-file compose.env.local build`: OK.
- `docker compose --env-file compose.env.local up -d --wait --wait-timeout 120`:
  OK.

Resultado de arranque:

- `app`: `Up ... (healthy)`, puerto interno `3000/tcp`, sin puerto publicado al
  host.
- `nginx`: `Up ... (healthy)`, publicado solo en `127.0.0.1:8080->8080/tcp`.

El paso de build conserva una validacion existente de variables `NEXT_PUBLIC_*`.
No se guardaron logs crudos y no se reproduce ningun valor en este reporte.

## Healthchecks

Dentro de `app`:

- `/api/health/live`: HTTP 200, `{"status":"ok"}`.
- `/api/health/ready`: HTTP 200, `{"status":"ready"}`.

Via Nginx:

- `/api/health/live`: HTTP 200, `{"status":"ok"}`.
- `/api/health/ready`: HTTP 200, `{"status":"ready"}`.
- `Cache-Control`: `no-store`.
- Sin `Set-Cookie`.
- Sin `Location`.

Estabilidad:

- 10 llamadas consecutivas a readiness via Nginx.
- Exitos: 10.
- Fallos: 0.
- Latencia observada: 168 ms a 203 ms.

## Smoke HTTP via Nginx

- `/login`: HTTP 200.
- `/dashboard`: HTTP 307 hacia login.
- Recurso `public`: HTTP 200.
- `/_next/static`: HTTP 200.
- `/_next/image`: HTTP 200.

## Validaciones publicas de Supabase administrado

Sin secret key, sin cliente admin y sin SQL remoto:

- `publicPostgrestAvailable`: true.
- `publicBaselineTableReadable`: true.
- `anonClientesBlocked`: true, HTTP 401.
- `invalidSignupRejected`: true, HTTP 422.

El signup se valido con payload invalido para evitar crear usuarios sinteticos.
No se creo usuario Auth, perfil de negocio, dato de negocio ni objeto Storage.

## Seguridad runtime

Validaciones realizadas con salida booleana y sin imprimir valores:

- `SUPABASE_SECRET_KEY`: presente solo en runtime de `app`.
- `SUPABASE_SECRET_KEY`: ausente de `.next` y `public`.
- `SUPABASE_DB_PASSWORD`: ausente de runtime.
- `POSTGRES_PASSWORD`: ausente de runtime.
- Nginx: sin variables Supabase.
- `app`: sin puerto host publicado.
- Nginx: unico punto publicado, ligado a `127.0.0.1`.
- `read_only`: true en `app` y Nginx.
- `no-new-privileges`: true en `app` y Nginx.
- Imagen app inspect/history: sin patrones de secret, DB password ni connection
  string PostgreSQL.
- Imagen Nginx inspect/history: sin patrones de secret, DB password ni
  connection string PostgreSQL.
- Logs runtime: sin patrones de secret, DB password, connection string ni
  publishable key.

## Degradacion y recuperacion

Se creo un env temporal fuera del repositorio apuntando `SUPABASE_SERVER_URL` a
un endpoint local cerrado. Se recreo solo `app`.

Degradacion:

- `app`: `unhealthy`.
- `/api/health/live` via Nginx: HTTP 200.
- `/api/health/ready` via Nginx: HTTP 503.
- Resultado esperado: true.

Recuperacion:

- Se restauro `compose.env.local`.
- Se recreo solo `app`.
- `app`: `healthy`.
- Nginx: `healthy`.
- `/api/health/ready` via Nginx: HTTP 200.
- Resultado esperado: true.

El env temporal fue eliminado. Nginx no se reinicio manualmente durante la
recuperacion.

## Recursos

Muestra instantanea, no benchmark:

- `app`: 0.02% CPU, 60.37 MiB / 2 GiB.
- `nginx`: 0.00% CPU, 21 MiB / 256 MiB.

## Limites y condiciones

Quedan fuera de esta aprobacion:

- Auth Admin sintetico exacto.
- Login/logout de usuario sintetico.
- Borrado de usuario sintetico.
- comprobacion administrativa exacta de Storage.
- TLS.
- Cloudflare Tunnel.
- `company-host`.
- despliegue productivo.
- E2E completo.

Estas condiciones no bloquean PPO-02D.2 porque el contrato de readiness
administrado quedo corregido y revalidado con Supabase administrado Free.

## Limpieza

Se ejecuto:

```text
docker compose --env-file compose.env.local down --remove-orphans
```

Resultado esperado:

- Contenedores del proyecto: 0.
- Red del proyecto: eliminada.
- Volumenes del proyecto: 0.
- Imagenes: conservadas.
- Supabase local: no alterado.
- Seed: no aplicado.
- Datos de negocio: 0 creados.
- Usuarios sinteticos: 0 creados.
- Objetos Storage: 0 creados.
- `compose.env.local`: conservado como archivo local ignorado.

## Evidencia sanitizada

Se conservaron resumenes sanitizados fuera del repositorio:

- `managed-summary.md`.
- `managed-summary.json`.

No se conservaron logs crudos ni valores sensibles.

## Resultado

Clasificacion:

```text
Aprobada con condiciones
```

PPO-02D.2 queda aprobada con condiciones. El bloqueo anterior de readiness se
resolvio enviando la publishable key existente como cabecera `apikey` en la
llamada server-side a `/auth/v1/health`, de acuerdo con el contrato actual de
Supabase para API keys.

PPO-02 permanece activa y local. No se marca PPO-02 como cerrada. No se declara
despliegue, TLS, Cloudflare ni aprobacion de `company-host`.
