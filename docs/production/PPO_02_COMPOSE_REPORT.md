# PPO-02C.2 - Informe de Docker Compose y red interna

## Metadatos

- Estado: Ejecutado
- Fase: PPO-02C.2
- Fecha: 2026-08-05
- Host: development-laptop

## Diseño

- La composición final contiene exactamente dos servicios: `app` y `nginx`.
- Se define una red bridge dedicada con nombre lógico `stack`.
- El proyecto Compose usa el nombre `godel-design-ppo-02c2` para evitar colisión
  con recursos locales de Supabase etiquetados como `godel-design`.
- La red efectiva validada fue `godel-design-ppo-02c2_stack`.
- No se marca la red como `internal: true` porque `app` necesita salida hacia
  Supabase administrado externo y, en smoke local, hacia Supabase CLI en el host.
- Nginx es la única entrada desde el host.
- `app` no publica puertos al host; solo expone internamente `3000/tcp`.
- No se declaran volúmenes persistentes.
- No se usa `container_name`, IP fija, red external, `network_mode: host`,
  macvlan, red de Supabase CLI ni montaje de configuración desde el host.

## Variables

- Build-time públicas: `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Runtime públicas en `app`: `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Endpoint server-only en `app`: `SUPABASE_SERVER_URL`.
- Secreto server-only en `app`: `SUPABASE_SECRET_KEY`.
- `nginx` no recibe variables Supabase.
- El archivo real de validación se creó fuera del repositorio en:
  `%LOCALAPPDATA%\GodelDesign\PPO-02\compose\20260808T1405280815034Z`.
- `compose.local.env` se eliminó al terminar.
- Se conservaron solo `compose-summary.md` y `compose-summary.json`
  sanitizados fuera del repositorio.
- No se versionaron secretos ni valores reales.

## Seguridad

`app`:

- `read_only: true`.
- Usuario `1000:1000`.
- Tmpfs `/tmp` con `rw,nosuid,noexec,size=32m,uid=1000,gid=1000`.
- Tmpfs `/app/.next/cache` con
  `rw,nosuid,noexec,size=64m,uid=1000,gid=1000`.
- `cap_drop: ALL`.
- `no-new-privileges:true`.
- `pids_limit: 256`.
- Sin Docker socket.
- Sin mounts persistentes.

`nginx`:

- `read_only: true`.
- Usuario `101:101`.
- Tmpfs `/tmp` con `rw,nosuid,noexec,size=32m,uid=101,gid=101`.
- `cap_drop: ALL`.
- `no-new-privileges:true`.
- `pids_limit: 128`.
- Sin variables Supabase.
- Sin Docker socket.
- Sin mounts persistentes.

## Recursos

- Límite `app`: `cpus: 2.0`, `mem_limit: 2g`.
- Límite `nginx`: `cpus: 0.5`, `mem_limit: 256m`.
- Presupuesto agregado configurado: 2.5 vCPU y 2.25 GiB.
- Guardrail local de referencia: por debajo de 4 vCPU y 4 GiB.
- Muestra breve `docker stats --no-stream`:
  - `app`: 0.00% CPU, 59.14 MiB / 2 GiB.
  - `nginx`: 0.03% CPU, 12.73 MiB / 256 MiB.
- Esta muestra es instantánea y no representa rendimiento definitivo.
- Estos límites no quedan aprobados para `company-host`.

## DNS dinámico

- Nginx declara `resolver 127.0.0.11 valid=10s ipv6=off`.
- El upstream `app_backend` declara `zone app_backend 64k`.
- El servidor upstream declara `server app:3000 resolve`.
- `default.conf` usa `proxy_pass http://app_backend`.
- `nginx -t` finalizó con exit code 0.
- `nginx -T` confirmó resolver, `valid=10s`, `ipv6=off`, `zone`,
  `server app:3000 resolve` y `proxy_pass http://app_backend`.
- Se recreó solo `app` con
  `docker compose --env-file <archivo-temporal> up -d --force-recreate --no-deps app`.
- ID inicial de `app`: `474228d81d1d`.
- ID posterior de `app`: `b3b2295edf04`.
- La IP observada se mantuvo en `172.21.0.2`; Docker reutilizó la misma
  dirección durante esta recreación.
- Nginx no se reinició ni se recargó.
- `/login` recuperó HTTP 200 en 1 segundo dentro de la ventana de 15 segundos.
- La validación demuestra supervivencia de Nginx a la recreación de `app`, pero
  no demuestra cambio efectivo de IP. Esta limitación queda registrada para
  PPO-02D.

## Build y arranque

- Docker Compose: `Docker Compose version v5.3.0`.
- `docker compose --env-file <archivo-temporal> config --quiet`: exit code 0.
- `config --services`: `app`, `nginx`.
- `config --networks`: `stack`.
- `config --images`: `godel-design-app:ppo-02c2` y
  `godel-design-nginx:ppo-02c2`.
- `config --volumes`: sin salida.
- `docker compose --env-file <archivo-temporal> build`: exit code 0.
- Duración del build final: 26.2 s.
- Marcadores de caché observados en evidencia sanitizada: 7.
- Imágenes producidas:
  - `godel-design-app:ppo-02c2`.
  - `godel-design-nginx:ppo-02c2`.
- `docker compose --env-file <archivo-temporal> up -d`: `app` y `nginx`
  arrancaron.
- `docker compose --env-file <archivo-temporal> ps` confirmó:
  - `app` en ejecución con `3000/tcp` interno.
  - `nginx` en ejecución con `127.0.0.1:57774->8080/tcp`.
  - Sin health status, porque no existen healthchecks todavía.

## Smokes

- `/login`: HTTP 200.
- `/dashboard`: HTTP 307 hacia `/login`.
- Recurso `public` `/brand/godel-diseno-mark.png`: HTTP 200.
- Recurso `/_next/static`: HTTP 200.
- `/_next/image`: HTTP 200.
- Header `Server`: `nginx`, sin versión.
- Supabase local desde `app`:
  `http://host.docker.internal:54321/auth/v1/health`, HTTP 200.
- Logs revisados de forma resumida: sin `EROFS`, sin `EACCES`, sin nombres de
  secretos, sin `service_role`, sin endpoint local completo y sin stack traces.
- Con `app` detenida manualmente, `/login` devolvió HTTP 504 y Nginx permaneció
  activo.
- Tras `docker compose --env-file <archivo-temporal> start app`, `/login`
  recuperó HTTP 200 en 11 s.
- `restart app`: `/login` recuperó HTTP 200 en 1 s.
- `restart nginx`: `/login` recuperó HTTP 200 en 1 s.
- `up -d --force-recreate`: composición operativa, `/login` HTTP 200 en 1 s,
  `app` sin puerto host, Nginx como única entrada y cero volúmenes del proyecto.
- `stop` seguido de `start`: `/login` HTTP 200 en 1 s.

## Limpieza

- Se ejecutó `docker compose --env-file <archivo-temporal> down --remove-orphans`
  sobre el proyecto aislado `godel-design-ppo-02c2`.
- Contenedores restantes del proyecto: 0.
- Red `godel-design-ppo-02c2_stack`: eliminada.
- Volúmenes del proyecto `godel-design-ppo-02c2`: 0.
- Imágenes conservadas:
  - `godel-design-app:ppo-02c2`.
  - `godel-design-nginx:ppo-02c2`.
- Supabase local no fue alterado.
- `compose.local.env` fue eliminado.

## Limitaciones

- Sin healthchecks.
- Sin Supabase administrado.
- Sin Auth completo.
- Sin TLS.
- Sin Cloudflare.
- Sin `company-host`.
- Sin despliegue.
- Sin E2E completo.
- La recreación de `app` no produjo cambio de IP; se validó cambio de ID y
  recuperación sin reiniciar Nginx.

## Resultado

Clasificación:

```text
Aprobada con condiciones
```

PPO-02C.2 queda cerrada como composición local aprobada. No se marca PPO-02 como
completa.
