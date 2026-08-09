# PPO-02 — Cierre de base contenerizada reproducible

## Metadatos

- Estado: Cerrada — Aprobada con condiciones
- Fase: PPO-02E.1
- Fecha: 2026-08-08
- Host validado: development-laptop
- Backend validado: Supabase administrado Free

## 1. Propósito

PPO-02 cerró la base contenerizada reproducible de Godel Diseño para ejecución
local validada en `development-laptop`: imagen standalone de Next.js, imagen
Nginx no privilegiada, composición `app` + `nginx`, red bridge dedicada,
healthchecks, readiness contra Supabase administrado y contrato operativo de
variables.

Este cierre no implementa despliegue productivo, no aprueba `company-host`, no
cierra PPO-01, no introduce TLS ni Cloudflare Tunnel y no rediseña el flujo de
archivos. La base queda lista como punto de partida documentado para las fases
siguientes.

## 2. Arquitectura resultante

Topología validada localmente:

```text
Cliente
  ↓
127.0.0.1:<GODEL_HTTP_PORT>
  ↓
Nginx
  ↓
app:3000
  ↓ HTTPS
Supabase administrado
```

Esta topología representa la base local validada en `development-laptop`. No es
un despliegue productivo, no demuestra capacidad de `company-host` y no define
todavía la exposición pública.

## 3. Inventario de artefactos

Artefactos operativos de la base contenerizada:

- `Dockerfile`
- `Dockerfile.nginx`
- `.dockerignore`
- `Dockerfile.nginx.dockerignore`
- `compose.yaml`
- `compose.env.example`
- `docker/nginx/conf.d/`
- `src/app/api/health/live/route.ts`
- `src/app/api/health/ready/route.ts`
- `src/lib/supabase/server-config.ts`

Los artefactos anteriores son el inventario mínimo para reconstruir y operar la
base local validada. Los valores reales de entorno no forman parte del
repositorio.

## 4. Contrato de entorno

`NEXT_PUBLIC_SUPABASE_URL`:

- pública;
- requerida en build y runtime;
- usada por el navegador y como fallback server-side cuando
  `SUPABASE_SERVER_URL` está vacío.

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`:

- pública;
- requerida en build y runtime;
- usada como `apikey` en readiness;
- no debe reproducirse innecesariamente en documentación ni logs.

`SUPABASE_SERVER_URL`:

- server-only;
- opcional;
- vacío con Supabase administrado cuando no existe endpoint interno separado;
- override para escenarios split-horizon locales.

`SUPABASE_SECRET_KEY`:

- server-only;
- runtime de `app`;
- nunca build arg;
- nunca Nginx;
- nunca cliente;
- solo para el adaptador Auth Admin autorizado.

Archivos de entorno:

- `compose.env.example`: versionado, sin credenciales.
- `compose.env.local`: `development-laptop`, ignorado por Git.
- `compose.env.company`: futuro `company-host`, ignorado y no creado todavía.

## 5. Handoff operativo

Validación:

```cmd
docker compose --env-file compose.env.local config --quiet
```

Build:

```cmd
docker compose --env-file compose.env.local build
```

Arranque:

```cmd
docker compose --env-file compose.env.local up -d --wait --wait-timeout 120
```

Estado:

```cmd
docker compose --env-file compose.env.local ps
```

Logs acotados:

```cmd
docker compose --env-file compose.env.local logs --tail 100 app nginx
```

Apagado:

```cmd
docker compose --env-file compose.env.local down --remove-orphans
```

No se documentan comandos con secretos inline. Los valores reales deben vivir
en archivos de entorno no versionados.

## 6. Cambios de configuración

`docker compose restart` no reaplica cambios de variables de entorno.

Para cambios runtime server-only se requiere recrear `app`:

- `SUPABASE_SERVER_URL`
- `SUPABASE_SECRET_KEY`

Para cambios de variables públicas que participan en build se debe reconstruir
la imagen `app` y recrearla:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Esta regla evita interpretar las salidas construidas de Next.js como
configuración mutable de runtime.

## 7. Health contract

`GET /api/health/live`:

```text
200 {"status":"ok"}
```

`GET /api/health/ready`:

```text
200 {"status":"ready"}
503 {"status":"not_ready"}
```

Readiness comprueba:

- configuración server-side mínima;
- `GET /auth/v1/health`;
- `apikey = publishable key`;
- timeout de 2000 ms.

Readiness no comprueba:

- base de datos directamente;
- Storage completo;
- Auth de usuario;
- `SUPABASE_SECRET_KEY`.

Las respuestas de healthcheck son públicas, sin sesión, con
`Cache-Control: no-store` y sin detalles internos.

## 8. Seguridad y aislamiento

La base validada conserva:

- ejecución no root;
- `read_only`;
- `tmpfs` mínimos;
- `cap_drop: ALL`;
- `no-new-privileges`;
- `pids_limit`;
- límites de CPU y RAM;
- ausencia de Docker socket;
- ausencia de montajes persistentes;
- `app` sin puerto publicado al host;
- Nginx como única entrada;
- logs con rotación;
- `SUPABASE_SECRET_KEY` solo en runtime de `app`.

Nginx no recibe variables Supabase. La imagen no debe contener valores reales de
secretos, contraseñas de base de datos ni connection strings.

## 9. Validación final acumulada

Evidencia acumulada de PPO-02:

- PPO-02A confirmó `output: "standalone"` y separación de endpoints browser /
  server.
- PPO-02B cerró la imagen `app` standalone endurecida, non-root, read-only,
  con tmpfs, límites, `SIGTERM` y secretos fuera de imagen.
- PPO-02C cerró Nginx no privilegiado, Compose `app` + `nginx`, red bridge
  dedicada, `app` sin puerto publicado, Nginx como único punto publicado,
  resolución dinámica y aislamiento.
- PPO-02D.1 cerró liveness/readiness separados, healthchecks Compose,
  `service_healthy`, degradación y recuperación.
- PPO-02D.2 cerró Supabase administrado Free, baseline remota 6/6, 0
  migraciones pendientes, seed no aplicado, HTTPS managed operativo con VPN
  activo, readiness managed corregido mediante `apikey`, `app` healthy, Nginx
  healthy, readiness 10/10, smokes HTTP correctos, RLS anónimo seguro en las
  pruebas realizadas y aislamiento de secretos conservado.

También quedó validado:

- readiness local contra Supabase local existente;
- readiness administrado contra Supabase administrado;
- Compose administrado;
- degradación controlada;
- recuperación;
- smokes vía Nginx;
- ausencia de exposición de secretos en los puntos revisados.

## 10. Condiciones abiertas

ProTUN:

- APIs HTTPS managed funcionan con VPN activo.
- Supabase CLI/PostgreSQL administrativo produce timeout con VPN activo.
- Las operaciones PostgreSQL administrativas demostradas requirieron VPN
  desactivado.

Auth Admin:

- smoke administrativo exacto diferido por guardrails;
- no crear harness admin ad hoc;
- la verificación debe hacerse mediante flujo autorizado.

Storage:

- baseline `04_storage` aplicada;
- no se detectó exposición anónima en las pruebas realizadas;
- comprobación administrativa exacta diferida;
- PPO-03 rediseñará el flujo de archivos.

Supabase Free:

- backend provisional;
- límites operativos existentes;
- requiere vigilancia;
- no representa backend definitivo.

Cambio efectivo de IP de `app`:

- no demostrado durante PPO-02C.2;
- resolución dinámica de Nginx configurada correctamente.

PPO-QA-01:

- E2E completo diferido;
- deberá resolverse antes de puesta en producción definitiva.

`company-host`:

- no auditado ni aprobado todavía;
- PPO-01 continúa activa.

TLS y Cloudflare:

- no forman parte de PPO-02.

Estas condiciones no bloquean el cierre local de PPO-02.

## 11. Handoff a fases siguientes

PPO-03 cubrirá el rediseño de cargas y almacenamiento: sesiones de carga,
transferencia directa, límites, formatos, cuarentena y operación de archivos.

PPO-04 cubrirá el despliegue provisional en `company-host`, solo después de la
auditoría correspondiente y sin inferir aprobación desde `development-laptop`.

PPO-05 cubrirá seguridad de exposición pública, antiabuso, rate limiting,
protección de rutas públicas y controles necesarios antes de UAT o exposición
real.

Este cierre no implementa ninguna de esas fases.

## 12. Resultado

```text
PPO-02 — Cerrada
Clasificación: Aprobada con condiciones
```

Cerrar PPO-02 no cierra PPO-01.

Cerrar PPO-02 no aprueba `company-host`.

Cerrar PPO-02 no constituye despliegue.
