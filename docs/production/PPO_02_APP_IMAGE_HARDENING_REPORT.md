# PPO-02B.2 - Informe de endurecimiento de imagen app

## Metadatos

- Estado: Ejecutado
- Fase: PPO-02B.2
- Fecha: 2026-08-05
- Host: development-laptop

## Decisiones

- Se acepta como comportamiento esperado que los nombres literales
  `SUPABASE_SECRET_KEY` y `SUPABASE_SERVER_URL` estén presentes en chunks
  server-side standalone. El servidor necesita esos identificadores para leer
  variables runtime.
- La exposición prohibida es la de valores reales en Dockerfile, build args,
  capas, configuración de imagen, `docker history`, filesystem cliente,
  recursos públicos, logs, documentación o repositorio.
- No se modifica `src/` para ocultar, concatenar, codificar u ofuscar nombres de
  variables.
- El runtime validado usa filesystem raíz read-only.
- Los únicos puntos escribibles validados son tmpfs mínimos para `/tmp` y
  `/app/.next/cache`.
- El runtime ejecuta como usuario no root `node`, UID/GID `1000`.
- La ejecución validada elimina capabilities con `--cap-drop=ALL`.
- La ejecución validada usa `--security-opt no-new-privileges`.
- La imagen declara `STOPSIGNAL SIGTERM`.
- El build queda canalizado mediante
  `scripts/preproduction/build-app-image.ps1`, con evidencias sanitizadas fuera
  del repositorio.

No se implementó Compose, Nginx, Cloudflare Tunnel ni healthchecks.

## Build

Build no cacheado:

- Comando: `scripts/preproduction/build-app-image.ps1 -Tag godel-design-app:ppo-02b2 -NoCache`.
- Exit code real de Docker: 0.
- Duración: 872.7 s.
- Evidencia lógica:
  `%LOCALAPPDATA%\GodelDesign\PPO-02\builds\20260805T2002041198371Z`.
- Archivos conservados: `build.log` y `build-summary.json`.
- Logs crudos: eliminados después de generar evidencia sanitizada.
- `npm ci`: ejecutado en etapa `deps`, finalizado correctamente en 844.3 s.
- `npm run build`: ejecutado en etapa `builder`, finalizado correctamente en
  9.2 s.
- Reintentos por red observados: ninguno explícito; no se observó `ECONNRESET`.
- Warnings sanitizados: `npm warn allow-scripts` para `sharp@0.34.5` y
  `unrs-resolver@1.11.1`.

Build cacheado:

- Comando: `scripts/preproduction/build-app-image.ps1 -Tag godel-design-app:ppo-02b2`.
- Exit code real de Docker: 0.
- Duración: 5.2 s.
- Evidencia lógica:
  `%LOCALAPPDATA%\GodelDesign\PPO-02\builds\20260805T2016569543905Z`.
- Etapas cacheadas: `npm ci`, `npm run build` y capas runtime.
- Diferencia aproximada: 872.7 s frente a 5.2 s.
- Esto valida reutilización inicial de caché y reconstrucción; no es
  reproducibilidad criptográfica.

Imagen final conservada:

- Tag: `godel-design-app:ppo-02b2`.
- Image ID:
  `sha256:4971fd4ade3422705dd47bfa60067ab1cbc24b429adad910764971fe2df87500`.
- Tamaño inspeccionado: 93,240,943 bytes.
- Tamaño de contenido reportado por Docker: 93.2 MiB.
- Arquitectura: `linux/amd64`.
- Usuario configurado: `node`.
- Entrypoint heredado: `docker-entrypoint.sh`.
- Command: `node server.js`.
- Stop signal: `SIGTERM`.
- Puerto expuesto: `3000/tcp`.
- Capas RootFS: 10.
- `docker history`: 24 líneas incluyendo encabezado.

## Runtime Endurecido

Contenedor validado: `godel-ppo-02b2-app`.

Ejecución:

- Sin mounts.
- Sin Docker socket.
- Sin modo privilegiado.
- Sin `network_mode: host`.
- `--read-only`.
- `--pids-limit=256`.
- `--cap-drop=ALL`.
- `--security-opt no-new-privileges`.
- `--user 1000:1000`.
- tmpfs `/tmp`: `rw,nosuid,noexec,uid=1000,gid=1000,size=32m`.
- tmpfs `/app/.next/cache`:
  `rw,nosuid,noexec,uid=1000,gid=1000,size=64m`.

Validación de filesystem:

- UID efectivo: `1000`.
- `/app`: escritura arbitraria bloqueada por read-only filesystem.
- `/tmp`: escritura temporal permitida y archivo de prueba eliminado.
- `/app/.next/cache`: escritura permitida y archivo de prueba eliminado.
- Mounts persistentes inesperados: ninguno.
- Tmpfs configurados: solo `/tmp` y `/app/.next/cache`.

Smoke:

- Contenedor iniciado: sí.
- PID 1 activo: `next-server`.
- Puerto interno 3000: abierto.
- Recurso `public`: `/brand/godel-diseno-mark.png`, HTTP 200, `image/png`.
- Recurso `/_next/static`: HTTP 200, `image/png`.
- `/login`: HTTP 200, `text/html; charset=utf-8`.
- `/_next/image`: HTTP 200, `image/png`, sin error de `sharp`.
- Supabase local desde host:
  `http://127.0.0.1:54321/auth/v1/health`, HTTP 200.
- Supabase local desde contenedor:
  `http://host.docker.internal:54321/auth/v1/health`, HTTP 200.
- Logs: sin `EROFS`, sin `EACCES`, sin endpoints completos, sin claves y sin
  valores reales.

Parada:

- `docker stop --time 10`: exit code 0.
- Duración aproximada: 0.4 s.
- Estado posterior: `exited`.
- Exit code del contenedor: 143.
- `OOMKilled`: `false`.
- Interpretación: parada por SIGTERM sin evidencia de SIGKILL.
- Contenedor de prueba eliminado.

## Seguridad

Prueba con secreto sintético runtime:

- Se ejecutó una validación corta con `SUPABASE_SECRET_KEY` sintética.
- No se invocó Auth Admin.
- La variable estuvo disponible dentro del proceso.
- El marcador sintético estuvo ausente de la imagen, `docker history`,
  configuración de imagen, recursos cliente y logs.
- No se imprime ni se documenta el valor completo del marcador.

Contenido excluido:

- `.env.local`: ausente en `/app`.
- `.git`: ausente en `/app`.
- `docs/`: ausente en `/app`.
- `tests/`: ausente en `/app`.
- `supabase/`: ausente en `/app`.
- `playwright-report/`: ausente en `/app`.
- `test-results/`: ausente en `/app`.

Dependencias y tooling:

- `node_modules/sharp`: presente.
- `node_modules/unrs-resolver`: ausente.
- `node_modules/typescript`: ausente.
- `node_modules/@playwright/test`: ausente.
- `node_modules/eslint`: ausente.

Los nombres literales `SUPABASE_SECRET_KEY` y `SUPABASE_SERVER_URL` se
confirmaron solo en chunks server-side standalone. Este resultado queda aceptado
como contrato operativo; no es exposición de secretos.

## Limitaciones

- Sin Compose.
- Sin Nginx.
- Sin healthchecks.
- Sin Supabase administrado.
- Sin Auth completo.
- Sin `company-host`.
- Sin despliegue.
- Sin E2E completo.

## Resultado

Clasificación:

```text
Aprobada
```

PPO-02B queda cerrada para la imagen `app`. El siguiente checkpoint previsto es:

```text
PPO-02C.1 - Implementación de la imagen y configuración de Nginx
```

No se marca PPO-02 como completa.
