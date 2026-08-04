# PPO-02B.1 - Informe de imagen app

## Metadatos

- Estado: Ejecutado
- Fase: PPO-02B.1
- Fecha: 2026-08-04
- Host: development-laptop

## Implementacion

PPO-02B.1 implemento la imagen inicial definitiva del servicio `app` mediante
un `Dockerfile` multi-stage con etapas `base`, `deps`, `builder` y `runner`.

- Imagen base fijada:
  `node:24-bookworm-slim@sha256:cd84903a12dbd26b46f1f3b8144a2568c41c5d37ddd0c7a80a34c7a19786b35f`.
- Digest efectivo del indice OCI:
  `sha256:cd84903a12dbd26b46f1f3b8144a2568c41c5d37ddd0c7a80a34c7a19786b35f`.
- Manifiesto `linux/amd64` resuelto:
  `sha256:9a81c173b244297fb9c8aabf38234786adbd3e698240dbb00cc241a2cc085cc8`.
- Next.js queda configurado con `output: "standalone"`.
- Runner ejecuta como usuario `node`, UID efectivo `1000`.
- Runtime copia solo `.next/standalone`, `public` y `.next/static`.
- Build args permitidos: `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Variables runtime previstas: `SUPABASE_SERVER_URL` y, cuando aplique,
  `SUPABASE_SECRET_KEY`.
- `SUPABASE_SERVER_URL`, `SUPABASE_SECRET_KEY` y `GODEL_TEST_*` no se pasan al
  build.
- `.dockerignore` excluye `.git`, `.github`, `node_modules`, `.next`, `.env*`,
  `coverage`, reportes de Playwright, `test-results`, `tests`, `docs`,
  `supabase`, `.codex`, `.vscode`, logs y archivos comprimidos.

No se implemento Compose, Nginx, Cloudflare Tunnel ni healthchecks.

## Build

Primer build efectivo:

- Resultado: imagen creada.
- Duracion observada por el wrapper: 879.1 s.
- Image ID observado tras el primer build: `91445fb794d1`.
- Tamano de contenido observado: 93.2 MiB.
- `ECONNRESET`: no observado en la evidencia disponible.
- Reintentos de red manuales: ninguno.
- Incidencia: el wrapper inicial de PowerShell devolvio exit code `1` por
  tratamiento de stream nativo de Docker y no conservo el log detallado, aunque
  la imagen fue producida.

Segundo build sin cambios:

- Resultado: exitoso.
- Duracion: 3.2 s.
- Exit code: 0.
- Etapas cacheadas: `deps` con `npm ci`, `builder` con `npm run build` y capas
  runtime.
- Diferencia aproximada contra el primer build: de 879.1 s a 3.2 s por cache de
  BuildKit.
- No se interpreta como reproducibilidad criptografica; solo valida cache y
  reconstruccion inicial.

Imagen final conservada:

- Tag: `godel-design-app:ppo-02b1`.
- Image ID final: `sha256:8c54e3aa158036f6f07ea919f2a9880ed4289213a135b1bdfdaa567f9bed4e32`.
- Tamano de contenido: 93.2 MiB.
- Tamano de imagen inspeccionado: 93,244,229 bytes.
- Comparacion con spike: 93.2 MiB frente a 88.9 MiB; variacion aceptable y por
  debajo de 120 MiB.
- Arquitectura: `linux/amd64`.
- Usuario configurado: `node`.
- Entrypoint heredado: `docker-entrypoint.sh`.
- Command: `node server.js`.
- Puerto expuesto: `3000/tcp`.
- Capas aproximadas en `docker history`: 22.

## Runtime

Se ejecuto el contenedor `godel-ppo-02b1-app` sin mounts, sin Docker socket, sin
modo privilegiado, sin `network_mode: host`, con `--cap-drop=ALL` y
`--security-opt no-new-privileges`.

- Contenedor iniciado: si.
- UID efectivo: `1000`.
- Proceso PID 1: `next-server`.
- Puerto interno 3000: abierto.
- Recurso `public`: `/brand/godel-diseno-mark.png`, HTTP 200, `image/png`.
- Recurso `/_next/static`: HTTP 200, `image/png`.
- `/login`: HTTP 200, `text/html; charset=utf-8`.
- Logs: solo arranque de Next.js; sin claves, endpoints completos ni errores de
  configuracion Supabase.
- Parada: `docker stop` exit code 0.
- Contenedor de validacion: eliminado.
- Imagen `godel-design-app:ppo-02b1`: conservada.

No se uso `SUPABASE_SECRET_KEY` durante el smoke runtime.

## Supabase

La CLI `npx.cmd supabase status` devolvio exit code 1 en esta ejecucion, por lo
que no se altero el estado de Supabase local.

Validacion HTTP posterior:

- Host hacia `http://127.0.0.1:54321/auth/v1/health`: HTTP 200.
- Contenedor app hacia `http://host.docker.internal:54321/auth/v1/health`:
  HTTP 200.
- `/login` desde host: HTTP 200.
- No aparecieron endpoints ni valores de configuracion en logs.

Esto valida el contrato split-horizon de PPO-02A.3 a nivel de conectividad HTTP
basica. No es una prueba E2E completa del cliente de navegador ni de Auth.

## Dependencias nativas

`npm.cmd ls sharp unrs-resolver` reporto:

- `sharp@0.34.5`, dependencia transitiva de `next@16.2.6`.
- `unrs-resolver@1.11.1`, dependencia transitiva de
  `eslint-config-next@16.2.6` via `eslint-import-resolver-typescript`.

Presencia en runtime standalone:

- `node_modules/sharp`: presente.
- `node_modules/unrs-resolver`: ausente.

Prueba de optimizacion de imagen:

- URL: `/_next/image?url=%2Fbrand%2Fgodel-diseno-mark.png&w=128&q=75`.
- HTTP status: 200.
- Content-Type: `image/png`.
- No hubo error de modulo nativo ni error relacionado con `sharp`.

Conclusion limitada: `sharp` esta presente y la ruta `/_next/image` funciono
para una imagen PNG publica existente. No se afirma cobertura completa de todos
los formatos ni de carga prolongada.

## Seguridad

Validaciones completadas:

- `.env.local`: ausente en `/app`.
- `.git`: ausente en `/app`.
- `docs/`: ausente en `/app`.
- `tests/`: ausente en `/app`.
- `supabase/`: ausente en `/app`.
- `playwright-report/`: ausente en `/app`.
- `test-results/`: ausente en `/app`.
- `SUPABASE_SECRET_KEY`: ausente en `docker history`, configuracion de imagen,
  recursos estaticos cliente, `public` y logs.
- `SUPABASE_SERVER_URL`: ausente en `docker history`, configuracion de imagen,
  recursos estaticos cliente, `public` y logs.
- Marker sintetico runtime de publishable key: ausente en recursos estaticos
  cliente y `public`.

Condicion detectada:

- El nombre literal `SUPABASE_SECRET_KEY` aparece en chunks server-side
  standalone porque el adaptador Auth Admin existente lee esa variable por
  nombre. No aparece su valor real, no esta en ENV de imagen, no aparece en
  history, no aparece en recursos cliente y no aparece en logs.
- El nombre literal `SUPABASE_SERVER_URL` aparece en chunks server-side
  standalone como lectura runtime aprobada por PPO-02A.3, pero no queda fijado
  como valor de imagen.

Esta condicion no se corrige en PPO-02B.1 porque `src/` estaba fuera del alcance
permitido. Debe resolverse o aceptarse explicitamente en PPO-02B.2.

## Limitaciones

- Sin Nginx.
- Sin Compose.
- Sin healthchecks.
- Sin Supabase administrado.
- Sin E2E completo.
- Sin validacion Auth completa.
- Sin `company-host`.
- Sin despliegue.
- Captura incompleta del log detallado del primer build por incidencia del
  wrapper PowerShell.

## Resultado

Clasificacion:

```text
Aprobada con condiciones
```

Condiciones para PPO-02B.2:

- Resolver o aceptar explicitamente la presencia del nombre
  `SUPABASE_SECRET_KEY` en chunks server-side standalone.
- Mejorar captura de logs de build Docker para conservar evidencia sanitizada de
  `npm ci` y `npm run build` sin depender de streams nativos de PowerShell.
- Mantener validacion posterior con Supabase administrado, Auth completo,
  Compose, Nginx y healthchecks en sus fases correspondientes.

No se marca PPO-02 como completa.
