# PPO-02C.1 - Informe de imagen Nginx

## Metadatos

- Estado: Ejecutado
- Fase: PPO-02C.1
- Fecha: 2026-08-05
- Host: development-laptop

## Decisión De Imagen

- Repositorio: `nginxinc/nginx-unprivileged`.
- Etiqueta de resolución: `stable-bookworm`.
- Digest fijado:
  `sha256:cd33960e98e93d4d63385790ff7f8f5bf2ca95184c581b7f42ae8aea1139fbfc`.
- Manifiesto `linux/amd64`:
  `sha256:10bf30f80ce9af183b2db50a91ea59cea5eb5e4106820656bac8cd369ed14904`.
- Versión efectiva de Nginx: `1.28.0`.
- Arquitectura: `linux/amd64`.
- Usuario configurado: `101`.
- UID/GID efectivo: `101/101`, usuario `nginx`.
- Puerto predeterminado de la imagen: `8080/tcp`.
- Stop signal: `SIGQUIT`.

Se usa la variante no privilegiada porque ya ejecuta Nginx como usuario no root,
escucha en 8080 y ubica PID/temporales de forma compatible con runtime
read-only y tmpfs `/tmp`.

## Configuración

- Dockerfile: `Dockerfile.nginx`.
- Contexto específico: `Dockerfile.nginx.dockerignore`.
- Configuración copiada: `docker/nginx/conf.d/`.
- Upstream: `app:3000`.
- Headers forward: `Host`, `X-Real-IP`, `X-Forwarded-For`,
  `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-Port`.
- WebSocket: `map $http_upgrade $connection_upgrade`, `Upgrade` y
  `Connection`.
- Tamaño transitorio: `client_max_body_size 110m`.
- Timeouts: `client_body_timeout 300s`, `send_timeout 300s`,
  `proxy_connect_timeout 5s`, `proxy_send_timeout 300s`,
  `proxy_read_timeout 300s`.
- Buffering: `proxy_request_buffering off`.
- Logs: stdout/stderr heredados de la imagen base.
- `server_tokens off`.
- Sin TLS, sin healthchecks, sin headers Cloudflare, sin CSP/HSTS y sin
  autenticación en Nginx.

Todo se proxifica hacia Next.js. No se sirven recursos estáticos desde volumen
separado.

## Build

Build no cacheado:

- Comando: `scripts/preproduction/build-nginx-image.ps1 -Tag godel-design-nginx:ppo-02c1 -NoCache`.
- Exit code real de Docker: 0.
- Duración: 8.2 s.
- Evidencia lógica:
  `%LOCALAPPDATA%\GodelDesign\PPO-02\builds\nginx\20260805T2050457564042Z`.
- Archivos conservados: `build.log` y `build-summary.json`.
- Logs crudos: eliminados.
- Warnings bloqueantes: ninguno observado.

Build cacheado:

- Comando: `scripts/preproduction/build-nginx-image.ps1 -Tag godel-design-nginx:ppo-02c1`.
- Exit code real de Docker: 0.
- Duración: 2.1 s.
- Evidencia lógica:
  `%LOCALAPPDATA%\GodelDesign\PPO-02\builds\nginx\20260805T2051068819316Z`.
- Capas cacheadas: frontend Dockerfile y copia de configuración.
- Diferencia aproximada: 8.2 s frente a 2.1 s.
- No se interpreta como reproducibilidad criptográfica.

Imagen final conservada:

- Tag: `godel-design-nginx:ppo-02c1`.
- Image ID:
  `sha256:d45993410f1844c0f8741fb90182e91bf49e6b49c0d617c994343dfb66b1a20f`.
- Tamaño inspeccionado: 72,409,540 bytes.
- Tamaño mostrado por `docker images`: 279 MB.
- Arquitectura: `linux/amd64`.
- Usuario configurado: `101`.
- Puerto expuesto: `8080/tcp`.
- Stop signal: `SIGQUIT`.

## Runtime

Red temporal:

```text
godel-ppo-02c1
```

Contenedores validados:

- `godel-ppo-02c1-app`, imagen `godel-design-app:ppo-02b2`, alias `app`.
- `godel-ppo-02c1-nginx`, imagen `godel-design-nginx:ppo-02c1`.

Topología validada:

```text
Host -> Nginx:8080 -> app:3000
```

Resultados:

- Solo Nginx tuvo puerto publicado: `127.0.0.1:65058 -> 8080`.
- `app` no tuvo bindings al host.
- Ambos contenedores estuvieron únicamente en la red temporal.
- La red temporal contuvo únicamente los dos contenedores del experimento.
- Nginx resolvió `app` mediante DNS de la red Docker.
- No se usó IP fija, `network_mode: host`, red de Supabase CLI ni red ajena.
- Nginx ejecutó con UID efectivo `101`.
- Filesystem raíz Nginx read-only.
- `/tmp` escribible mediante tmpfs `rw,nosuid,noexec,size=32m`.
- Escritura arbitraria bajo `/etc/nginx` bloqueada por filesystem read-only.
- Capabilities eliminadas con `--cap-drop=ALL`.
- `no-new-privileges` activo.
- `pids-limit=128`.
- Sin mounts persistentes y sin Docker socket.

Smoke vía Nginx:

- `/login`: HTTP 200, `text/html; charset=utf-8`.
- Recurso `public` `/brand/godel-diseno-mark.png`: HTTP 200, `image/png`.
- Recurso `/_next/static`: HTTP 200, `image/png`.
- `/_next/image`: HTTP 200, `image/png`, sin error de `sharp`.
- Header `Server`: `nginx`, sin número de versión.
- `/dashboard`: HTTP 307 hacia `/login`, conservando navegación relativa al
  host original.
- Logs: sin `EROFS`, sin `EACCES`, sin claves, sin endpoints Supabase completos
  y sin stack traces.

## Validación De Nginx

- `nginx -t`: exit code 0.
- Resultado: sintaxis correcta y prueba exitosa.
- `nginx -T` confirmó listen 8080, upstream `app:3000`, headers forward,
  upgrade map, timeouts, `client_max_body_size 110m`,
  `proxy_request_buffering off`, `server_tokens off`, ausencia de TLS y ausencia
  de secretos.

## Fallo Del Upstream

Con Nginx en ejecución se detuvo temporalmente `godel-ppo-02c1-app` y se pidió
`/login` mediante Nginx.

- Respuesta observada: HTTP 504.
- Nginx permaneció ejecutándose.
- No apareció stack trace.
- No aparecieron secretos.
- No aparecieron endpoints Supabase completos.
- No se personalizaron páginas 502/504.
- Tras reiniciar `app`, `/login` recuperó HTTP 200.

## Seguridad

- `.env.local`: ausente.
- `src/`: ausente.
- `public/`: ausente.
- `docs/`: ausente.
- `tests/`: ausente.
- `supabase/`: ausente.
- `node_modules/`: ausente.
- `package.json`: ausente.
- `package-lock.json`: ausente.
- `.git`: ausente.
- Variables Supabase y secretos: ausentes en configuración, env de imagen,
  `docker history` y logs revisados.
- Digest fijado en `Dockerfile.nginx`.
- Usuario no root.
- Sin paquetes añadidos por la capa del proyecto.
- Configuración únicamente de Nginx.
- Logs dirigidos a stdout/stderr.
- Sin credenciales.

## Limitaciones

- Sin Compose.
- Sin healthchecks.
- Sin TLS.
- Sin Cloudflare.
- Sin Supabase administrado.
- Sin `company-host`.
- Sin despliegue.
- Sin E2E completo.

## Resultado

Clasificación:

```text
Aprobada
```

Siguiente checkpoint previsto:

```text
PPO-02C.2 - Implementación de Docker Compose y red interna
```

No se marca PPO-02 como completa.
