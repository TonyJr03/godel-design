# PPO-02D.2 - Validación con Supabase administrado

## Metadatos

- Estado: Ejecutado — Aprobada con condiciones
- Fase: PPO-02D.2
- Fecha: 2026-08-08
- Host: development-laptop
- Backend: Supabase administrado Free

## Contexto

PPO-02D.2 corrigió y revalidó el contrato de readiness contra Supabase
administrado sin cambiar arquitectura, topología, Compose ni política de
secretos.

El contexto de red declarado para Codex fue:

```text
VPN activo / ProTUN
```

Codex no desactivó el VPN y no ejecutó operaciones PostgreSQL administrativas
remotas. La evidencia manual de Dirección Técnica se tomó como precondición
aprobada:

- `dbPushSucceeded`: true.
- `remoteMigrationCount`: 6.
- `remoteMatchesLocalBaseline`: true.
- `pendingMigrationsAfterPush`: 0.
- `seedApplied`: false.

No se ejecutó:

- `supabase migration list --linked`.
- `supabase db push`.
- `supabase db push --dry-run`.
- `supabase db pull`.
- `supabase db reset`.
- `supabase migration repair`.
- `supabase db diff`.
- `psql` remoto.
- conexión directa PostgreSQL remota.

La restricción ProTUN/PostgreSQL queda clasificada como condición administrativa
del canal PostgreSQL, no como fallo demostrado del runtime HTTPS.

## Cambio aplicado

Archivo modificado:

- `src/app/api/health/ready/route.ts`.

Cambio exacto:

- Se conserva `getSupabaseServerUrl()`.
- Se usa el helper existente `getSupabasePublishableKey()`.
- La llamada directa a `/auth/v1/health` envía solo:

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

No se agregó:

- `Authorization`.
- `Bearer`.
- claves hardcodeadas.
- variables nuevas.
- cliente Supabase.
- cliente admin.
- uso de `SUPABASE_SECRET_KEY` para readiness.

## Validaciones estáticas

- `npm.cmd run lint`: OK.
- `npm.cmd run build`: OK.
- `npm.cmd run audit:security`: OK, 0 violaciones bloqueantes.
- `npm.cmd run audit:client-supabase`: OK, sin coincidencias.
- `git diff --check`: OK; solo aviso Git de normalización LF/CRLF en la ruta
  editada.

La búsqueda focalizada en `src/app/api/health/ready/route.ts` confirmó que no
aparecen `Authorization`, `Bearer`, `SUPABASE_SECRET_KEY` ni `createClient`;
solo aparece `apikey` en la cabecera esperada.

## Validación local

Supabase local existente estaba disponible en `127.0.0.1:54321`.

Resultados:

- `/auth/v1/health` local con `apikey`: HTTP 200.
- `next start` local temporal en puerto alterno contra Supabase local:
  `/api/health/ready` HTTP 200, `{"status":"ready"}`.

El proceso local temporal fue apagado. No se ejecutó `supabase db reset` ni se
alteró Supabase local.

## Supabase administrado por HTTPS

Con VPN activo y publishable key en cabecera `apikey`:

- `/auth/v1/health`: HTTP 200.
- `managedAuthHealthWithApiKey`: true.

No se imprimieron URL completa, project ref ni claves en la documentación.

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

El paso de build conserva una validación existente de variables
`NEXT_PUBLIC_*`. No se guardaron logs crudos y no se reproduce ningún valor en
este reporte.

## Healthchecks

Dentro de `app`:

- `/api/health/live`: HTTP 200, `{"status":"ok"}`.
- `/api/health/ready`: HTTP 200, `{"status":"ready"}`.

Vía Nginx:

- `/api/health/live`: HTTP 200, `{"status":"ok"}`.
- `/api/health/ready`: HTTP 200, `{"status":"ready"}`.
- `Cache-Control`: `no-store`.
- Sin `Set-Cookie`.
- Sin `Location`.

Estabilidad:

- 10 llamadas consecutivas a readiness vía Nginx.
- Éxitos: 10.
- Fallos: 0.
- Latencia observada: 168 ms a 203 ms.

## Smoke HTTP vía Nginx

- `/login`: HTTP 200.
- `/dashboard`: HTTP 307 hacia login.
- Recurso `public`: HTTP 200.
- `/_next/static`: HTTP 200.
- `/_next/image`: HTTP 200.

## Validaciones públicas de Supabase administrado

Sin secret key, sin cliente admin y sin SQL remoto:

- `publicPostgrestAvailable`: true.
- `publicBaselineTableReadable`: true.
- `anonClientesBlocked`: true, HTTP 401.
- `invalidSignupRejected`: true, HTTP 422.

Configuración manual declarada por Dirección Técnica:

- `Allow new users to sign up = OFF`.
- `Allow anonymous sign-ins = OFF`.

Smoke automatizado:

- payload inválido rechazado;
- ningún usuario creado.

Conclusión:

- el smoke confirma rechazo seguro y ausencia de usuario residual;
- no demuestra automáticamente la política de signup;
- la política permanece como configuración manual a verificar nuevamente
  mediante flujo autorizado antes de exposición pública o UAT.

No se intentó verificar la política mediante usuarios administrativos durante
PPO-02D.2.

## Seguridad runtime

Validaciones realizadas con salida booleana y sin imprimir valores:

- `SUPABASE_SECRET_KEY`: presente solo en runtime de `app`.
- `SUPABASE_SECRET_KEY`: ausente de `.next` y `public`.
- `SUPABASE_DB_PASSWORD`: ausente de runtime.
- `POSTGRES_PASSWORD`: ausente de runtime.
- Nginx: sin variables Supabase.
- `app`: sin puerto host publicado.
- Nginx: único punto publicado, ligado a `127.0.0.1`.
- `read_only`: true en `app` y Nginx.
- `no-new-privileges`: true en `app` y Nginx.
- Imagen app inspect/history: sin patrones de secret, DB password ni connection
  string PostgreSQL.
- Imagen Nginx inspect/history: sin patrones de secret, DB password ni
  connection string PostgreSQL.
- Logs runtime: sin patrones de secret, DB password, connection string ni
  publishable key.

## Degradación y recuperación

Se creó un env temporal fuera del repositorio apuntando `SUPABASE_SERVER_URL` a
un endpoint local cerrado. Se recreó solo `app`.

Degradación:

- `app`: `unhealthy`.
- `/api/health/live` vía Nginx: HTTP 200.
- `/api/health/ready` vía Nginx: HTTP 503.
- Resultado esperado: true.

Recuperación:

- Se restauró `compose.env.local`.
- Se recreó solo `app`.
- `app`: `healthy`.
- Nginx: `healthy`.
- `/api/health/ready` vía Nginx: HTTP 200.
- Resultado esperado: true.

El env temporal fue eliminado. Nginx no se reinició manualmente durante la
recuperación.

## Recursos

Muestra instantánea, no benchmark:

- `app`: 0.02% CPU, 60.37 MiB / 2 GiB.
- `nginx`: 0.00% CPU, 21 MiB / 256 MiB.

## Límites y condiciones

Quedan fuera de esta aprobación:

- Auth Admin sintético exacto.
- Login/logout de usuario sintético.
- Borrado de usuario sintético.
- comprobación administrativa exacta de Storage.
- TLS.
- Cloudflare Tunnel.
- `company-host`.
- despliegue productivo.
- E2E completo.

Estas condiciones no bloquean PPO-02D.2 porque el contrato de readiness
administrado quedó corregido y revalidado con Supabase administrado Free.

## Limpieza

Se ejecutó:

```text
docker compose --env-file compose.env.local down --remove-orphans
```

Resultado esperado:

- Contenedores del proyecto: 0.
- Red del proyecto: eliminada.
- Volúmenes del proyecto: 0.
- Imágenes: conservadas.
- Supabase local: no alterado.
- Seed: no aplicado.
- Datos de negocio: 0 creados.
- Usuarios sintéticos: 0 creados.
- Objetos Storage: 0 creados.
- `compose.env.local`: conservado como archivo local ignorado.

## Evidencia sanitizada

Se conservaron resúmenes sanitizados fuera del repositorio:

- `managed-summary.md`.
- `managed-summary.json`.

No se conservaron logs crudos ni valores sensibles.

## Resultado

Clasificación:

```text
Aprobada con condiciones
```

PPO-02D.2 queda aprobada con condiciones. El bloqueo anterior de readiness se
resolvió enviando la publishable key existente como cabecera `apikey` en la
llamada server-side a `/auth/v1/health`, de acuerdo con el contrato actual de
Supabase para API keys.

PPO-02 permanecía activa y local al cierre de PPO-02D.2. El cierre formal se
realiza en PPO-02E.1. No se declara despliegue, TLS, Cloudflare ni aprobación de
`company-host`.
