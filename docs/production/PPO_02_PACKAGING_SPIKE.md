# PPO-02A.2 - Spike técnico de empaquetado

## Metadatos

- Estado: Ejecutado
- Fase: PPO-02A.2
- Fecha: 2026-08-04
- Host: `development-laptop`

## Objetivo

Ejecutar un spike técnico controlado, reversible y aislado del repositorio
principal para validar empaquetado standalone de Next.js, tratamiento de
variables, secreto server-only, usuario no root y conectividad hacia Supabase
local desde un contenedor.

Este documento no implementa el Dockerfile definitivo, Docker Compose, Nginx ni
healthchecks del producto.

## Entorno Validado

- Rama inicial: `preprod/ppo-02-container-foundation`.
- SHA inicial: `d5f241efd92f8833bda87603132201b328c47b79`.
- Next.js instalado: `16.2.6`.
- Node.js mínimo requerido por Next.js: `>=20.9.0`.
- Node.js local: `v24.14.1`.
- npm local: `11.11.0`.
- Arquitectura local agregada: `win32/x64`.
- Docker: Docker Desktop con Linux containers.
- Docker client/server: `29.6.1`.
- Arquitectura Docker: `x86_64`.
- Supabase local inicial: activo.
- Supabase local iniciado por la tarea: no.

Imagen base candidata:

```text
node:24-bookworm-slim
```

Digest resuelto:

```text
sha256:cd84903a12dbd26b46f1f3b8144a2568c41c5d37ddd0c7a80a34c7a19786b35f
```

La selección cumple el mínimo de Next.js, coincide razonablemente con el major
local de Node.js, evita `node:latest` y evita Alpine/musl durante este spike.

## Resultado De Standalone

Resultado:

```text
Exitoso
```

El primer intento de build falló durante `npm ci` por `ECONNRESET`. Se repitió
el build experimental con reintentos de npm en el Dockerfile temporal y terminó
correctamente.

Datos agregados:

- Duración del build exitoso: 882.6 s.
- Tamaño aproximado de la imagen experimental: 88.9 MiB.
- Image ID experimental: `sha256:e25887b1e5242564dd58701e401df0f04051077998b4e1b136397ebec9487b7c`.
- Warning relevante: `npm allow-scripts` para scripts de instalación de
  `sharp` y `unrs-resolver`.

Estructura runtime encontrada dentro de la imagen experimental:

- `/app/server.js`: presente.
- `/app/public`: presente.
- `/app/.next/static`: presente.

Archivos necesarios para el runtime standalone:

- salida `.next/standalone`;
- `server.js` generado por Next.js;
- `public`, copiado explícitamente;
- `.next/static`, copiado explícitamente.

La documentación local de Next.js confirma que `.next/standalone` no copia por
defecto todos los recursos estáticos: `public` y `.next/static` deben copiarse
de forma explícita cuando se requieran en el runtime.

El servidor inició con:

- `NODE_ENV=production`;
- `HOSTNAME=0.0.0.0`;
- `PORT=3000`;
- comando `node server.js`.

Validación runtime:

- Contenedor iniciado: sí.
- UID efectivo: `1000`.
- Proceso observado: `next-server`.
- Respuesta HTTP de recurso estático: `200`.
- Ruta probada: `/_next/static/<build-id>/_clientMiddlewareManifest.js`.
- Duración aproximada de la respuesta: 54 ms.

No se usó `/api/health/live` porque todavía no existe.

## Variables Públicas

Marcadores sintéticos:

- Build: marcador público falso de URL y publishable key.
- Runtime: marcador público falso distinto.

Resultados:

```text
buildMarkerPresent: true
runtimeMarkerPresentInClientBundle: false
runtimeOverrideEffectiveForClientBundle: false
```

Evidencia:

- El marcador público de build apareció en salida server build dentro de
  `.next/server`.
- El marcador runtime no apareció en `.next/static`.
- Cambiar variables públicas en runtime no reescribió los assets ya generados.
- El entorno server-side del contenedor sí vio las variables públicas runtime.

Decisión soportada:

```text
Los valores públicos usados por salidas construidas no deben tratarse como
mutables después del build. PPO-02B debe construir imágenes por entorno o
definir una estrategia explícita de configuración pública.
```

No se detectó el marcador público de build dentro del bundle cliente estático
para este build concreto; por eso la conclusión se limita a la evidencia
observada y a no intentar sustituir assets ya construidos en runtime.

## Secreto Server-Only

Marcador sintético runtime:

```text
PPO02_SECRET_RUNTIME_MARKER
```

Resultados:

```text
secretPresentInImage: false
secretAvailableAtRuntime: true
secretPrintedInLogs: false
```

El marcador no apareció en filesystem de imagen, `docker history`, archivos
standalone, recursos estáticos ni logs. La comprobación dentro del contenedor
confirmó disponibilidad runtime sin imprimir el valor.

Decisión soportada:

```text
SUPABASE_SECRET_KEY debe inyectarse solo en runtime para el contenedor app.
No debe usarse como ARG, capa de imagen ni variable accesible a Nginx.
```

## Conectividad Local

Solo se probó:

```text
/auth/v1/health
```

No se usaron claves.

| Origen | URL | DNS | Conexión | HTTP | Duración | Timeout | Interpretación |
| ------ | --- | --- | -------- | ---- | -------- | ------- | -------------- |
| Host Windows | `http://127.0.0.1:54321/auth/v1/health` | Resuelto | Establecida | 200 | 40 ms | No | Endpoint alcanzable |
| Host Windows | `http://host.docker.internal:54321/auth/v1/health` | Resuelto | No establecida | n/a | 8071 ms | Sí | Timeout |
| Contenedor temporal | `http://127.0.0.1:54321/auth/v1/health` | Resuelto | No establecida | n/a | 25 ms | No | No alcanzable |
| Contenedor temporal | `http://host.docker.internal:54321/auth/v1/health` | Resuelto | Establecida | 200 | 53 ms | No | Endpoint alcanzable |

Clasificación:

```text
Caso B
```

Conclusión:

```text
Existe un problema split-horizon entre navegador y servidor.
No usar una única NEXT_PUBLIC_SUPABASE_URL sin diseño adicional.
```

La prueba desde el host hacia `host.docker.internal` se considera aproximación
de resolución desde el navegador del host, no una prueba E2E de navegador.

## Decisiones Para PPO-02B

- Usar `output: "standalone"` como base del Dockerfile de aplicación.
- Usar una imagen de la familia `node:<major>-bookworm-slim`; el candidato del
  spike es `node:24-bookworm-slim`.
- Copiar explícitamente `.next/standalone`, `public` y `.next/static`.
- Ejecutar `node server.js` con `HOSTNAME=0.0.0.0` y `PORT=3000`.
- Ejecutar el runtime como usuario no root.
- No incluir secretos en build args, capas de imagen, Dockerfile ni repositorio.
- Inyectar `SUPABASE_SECRET_KEY` solo en runtime y solo al contenedor `app`.
- Tratar variables `NEXT_PUBLIC_*` como ligadas al build cuando formen parte de
  salidas construidas, salvo diseño explícito alternativo.
- No usar una única URL local de Supabase para navegador y contenedor sin
  resolver el split-horizon observado.

## Limitaciones

- No se probó Supabase administrado.
- No se probó Auth funcional.
- No se probó Nginx.
- No se probó Compose.
- No se implementaron healthchecks.
- No se realizó deploy.
- No se auditó `company-host`.
- No se midió carga prolongada ni comportamiento térmico.
- No se convirtió el Dockerfile experimental en artefacto versionado.

## Limpieza

Limpieza completada:

- Contenedor experimental detenido y eliminado.
- Imagen experimental eliminada.
- Worktree temporal eliminado.
- `git worktree prune` ejecutado.
- Logs crudos removidos.
- Supabase local conservado en su estado inicial activo.
- Solo se conservaron resúmenes sanitizados fuera del repositorio.

Ubicación lógica de evidencias:

```text
%TEMP%\GodelDesign\PPO-02\spikes\packaging\<timestamp>\
```

Archivos conservados fuera del repositorio:

```text
spike-summary.json
spike-summary.md
```
