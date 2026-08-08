# PPO-02 - Plan de contenerización

## Metadatos

- Estado: Aprobado para preparación
- Fase: PPO-02
- Fecha de apertura: 2026-08-04
- Última actualización: 2026-08-08
- Host autorizado: `development-laptop`
- `company-host`: pendiente de PPO-01C

## Decisión de Dirección Técnica

PPO-01C:

```text
Diferida temporalmente por disponibilidad de company-host.
```

PPO-01D:

```text
Pendiente y bloqueada hasta completar PPO-01C.
```

PPO-02:

```text
Autorizada en paralelo para desarrollo y validación local
en development-laptop.
```

La similitud entre `development-laptop` y `company-host` es únicamente una
hipótesis provisional de compatibilidad. No constituye evidencia, auditoría,
sizing ni aprobación de despliegue. PPO-01 no queda cerrada y `company-host` no
queda clasificada por este documento.

## 1. Objetivo

Definir la base contenerizada reproducible de Godel Diseño para construir la
aplicación, ejecutar Next.js en modo producción, colocar Nginx como proxy
inverso, aislar servicios mediante redes de Compose, introducir healthchecks,
controlar variables, secretos y recursos, y preparar una base portable para un
host Windows con WSL2 y Docker Desktop.

PPO-02 no despliega todavía en la empresa. La preparación queda autorizada solo
para construcción y validación en `development-laptop`.

## 2. Alcance

PPO-02 cubre el contrato y la validación posterior de:

- Dockerfile de Next.js.
- Build multi-stage.
- Runtime mínimo.
- Compose.
- Nginx.
- Red interna.
- Puertos.
- Healthchecks.
- Variables de entorno.
- Gestión segura de secretos.
- Límites preliminares.
- Logs.
- Arranque, parada y reinicio.
- Validación reproducible en `development-laptop`.

## 3. Fuera de alcance

Queda fuera de PPO-02A.1 y de la base local inicial:

- Auditoría de `company-host`.
- Despliegue en la empresa.
- Cloudflare Tunnel.
- Dominio.
- TLS público.
- Supabase self-hosted.
- Base PostgreSQL local dentro de Compose.
- Rediseño del flujo de archivos.
- Límite final de archivos.
- Backups.
- Observabilidad completa.
- UAT.
- Producción.

## 4. Hipótesis provisional

- `development-laptop` es la única máquina aprobada para iniciar PPO-02.
- `company-host` se considera provisionalmente compatible solo para orientar
  portabilidad.
- No se usan recursos supuestos de `company-host` para sizing.
- No se autorizan rutas, volúmenes o puertos ligados a un equipo concreto.
- Cualquier despliegue en la empresa permanece bloqueado hasta PPO-01C.

## 5. Topología de servicios

La topología objetivo inicial es:

```text
nginx
  -> app
      -> Supabase administrado externo
```

Servicios de Compose incluidos:

```text
nginx
app
```

Servicios excluidos:

```text
postgres
supabase
storage
auth
studio
kong
realtime
```

Supabase local no forma parte de la composición productiva.

## 6. Contenedor app

Contrato previsto para `app`:

- Next.js App Router.
- Build de producción.
- Dockerfile multi-stage.
- Instalación reproducible mediante lockfile.
- `output: "standalone"` confirmado por PPO-02A.2 y activado en PPO-02B.1.
- Runtime sin dependencias de desarrollo.
- Usuario no root cuando sea técnicamente compatible.
- Filesystem de aplicación sin datos operativos persistentes.
- Logs por stdout/stderr.
- Puerto interno 3000.
- Señal y apagado limpio.
- Sin secretos copiados a la imagen.

PPO-02B.1 implementa el Dockerfile de aplicación y la configuración standalone
de Next.js. PPO-02B.2 endurece el contrato operativo de la imagen `app` con
build wrapper sanitizado, cache de dependencias, filesystem read-only, tmpfs
mínimos, `STOPSIGNAL SIGTERM`, ejecución no root y validación de secretos solo
runtime. No implementa todavía Nginx, Compose ni healthchecks.

La versión instalada de Next.js es `16.2.6`. Los metadatos reales del paquete y
la documentación local de instalación declaran Node.js mínimo `>=20.9.0`. El
spike PPO-02A.2 registró como imagen base candidata
`node:24-bookworm-slim`, con digest
`sha256:cd84903a12dbd26b46f1f3b8144a2568c41c5d37ddd0c7a80a34c7a19786b35f`.
PPO-02B.1 fija esta imagen como base definitiva inicial para `app`.

## 7. Contenedor Nginx

Contrato previsto para `nginx`:

- Único servicio con puerto publicado.
- Proxy hacia `app:3000`.
- Puerto externo configurable.
- Valor local provisional recomendado: 8080.
- Sin TLS en PPO-02.
- Cabeceras de proxy necesarias.
- Forwarding de host y protocolo.
- Timeouts controlados.
- Logs stdout/stderr.
- Healthcheck.
- Configuración inmutable incluida en la imagen o montada de forma controlada.
- Sin acceso directo público al contenedor `app`.

PPO-02C.1 implementa la imagen y configuración de Nginx con
`nginxinc/nginx-unprivileged:stable-bookworm`, fijada por digest
`sha256:cd33960e98e93d4d63385790ff7f8f5bf2ca95184c581b7f42ae8aea1139fbfc`.
La variante validada usa Nginx `1.28.0`, `linux/amd64`, usuario no root `101`,
puerto 8080 y `STOPSIGNAL SIGQUIT`.

La configuración proxy apunta a `app:3000`, conserva
`client_max_body_size 110m`, timeouts de 300 s para cuerpos/respuesta,
`proxy_connect_timeout 5s`, headers `Host`, `X-Real-IP`, `X-Forwarded-*`,
soporte WebSocket mediante `map $http_upgrade $connection_upgrade`,
`proxy_request_buffering off` y `server_tokens off`. No configura TLS, headers
Cloudflare, autenticación en Nginx, CSP/HSTS, rutas de healthcheck ni recursos
estáticos desde volumen separado.

PPO-02C.2 integra esta imagen mediante Docker Compose con resolución dinámica
del servicio `app` por `resolver 127.0.0.11 valid=10s ipv6=off`, upstream
`app_backend`, `zone app_backend 64k` y `server app:3000 resolve`.

## 8. Redes

- Se usará una red bridge interna para `nginx` y `app`.
- Solo Nginx publicará puerto al host.
- Next.js se descubrirá mediante nombre de servicio.
- No se usarán IP fijas.
- No se usarán hostnames reales.
- No se usarán direcciones privadas del equipo.
- No se dependerá de la red de Supabase CLI.

## 9. Supabase

Decisión:

```text
Supabase administrado es dependencia externa.
No se incluye Supabase self-hosted en PPO-02.
```

Para la operación provisional, el backend externo será Supabase Free
administrado. Esto incluye inicialmente PostgreSQL, Auth, Storage, APIs, RLS y
RPC. Supabase administrado no se describe como solución definitiva, sino como
backend externo provisional para la puesta en operación inicial.

### Supabase local

- Es una herramienta de desarrollo.
- Se ejecuta fuera de la composición.
- No representa arquitectura productiva.
- Puede utilizarse en pruebas específicas cuando exista una ruta segura y
  reproducible entre contenedor, navegador y host.

### Supabase administrado

- Es requerido antes de cerrar la integración remota.
- Permanece pendiente de configuración.
- No se considera fallo de PPO-02A.1.

### Dirección estratégica futura

Cuando se contrate el VPS, el objetivo será evaluar y preparar la migración
hacia Supabase autoalojado en esa infraestructura, incluyendo una solución
sostenible para PostgreSQL, Auth, APIs, Storage, backups y recuperación.

Esta dirección futura no autoriza autoalojar Supabase en `company-host`, no
forma parte de la implementación de PPO-02, no implica migración inmediata,
deberá concretarse mediante diseño y ADR antes de la etapa del VPS, y requerirá
una estrategia separada para migrar base de datos y objetos de Storage.

## 10. Contrato de variables

### Públicas y utilizadas por navegador

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

El código actual las usa en el cliente del navegador mediante
`src/lib/supabase/client.ts`.
La documentación local de Next.js indica que las variables `NEXT_PUBLIC_*`
usadas por el navegador pueden incorporarse al bundle durante `next build`.
PPO-02A.2 confirmó que los marcadores públicos de build aparecieron en salida
server build y que los marcadores runtime no reescribieron assets cliente ya
generados.

Decisión provisional:

- Construir imágenes por entorno cuando estas variables deban quedar
  incorporadas al bundle.
- No intentar sustituirlas arbitrariamente después del build.
- No almacenar valores reales en Dockerfile, Compose o repositorio.

### Endpoint server-side

```text
SUPABASE_SERVER_URL
```

PPO-02A.3 formaliza una separación por contexto:

- El navegador usa `NEXT_PUBLIC_SUPABASE_URL`.
- Server Components, Server Actions, Route Handlers, Proxy y Auth Admin usan
  `SUPABASE_SERVER_URL` cuando esté definido.
- Si `SUPABASE_SERVER_URL` está vacío, el servidor cae a
  `NEXT_PUBLIC_SUPABASE_URL`.
- `SUPABASE_SERVER_URL` es server-only, no lleva prefijo `NEXT_PUBLIC` y no debe
  aparecer en el bundle cliente.
- El fallback conserva el comportamiento normal con Supabase administrado, donde
  normalmente no hace falta endpoint privado separado.
- En desarrollo local contenerizado puede usarse para resolver el Caso B:
  navegador contra `127.0.0.1` y servidor dentro del contenedor contra
  `host.docker.internal`.

### Secretas server-only

```text
SUPABASE_SECRET_KEY
```

Reglas:

- Solo runtime.
- Nunca `ARG`.
- Nunca capa de imagen.
- Nunca `NEXT_PUBLIC`.
- Nunca archivo versionado.
- Nunca log.
- Solo accesible al contenedor `app`.
- No accesible a Nginx.

### QA

Las variables `GODEL_TEST_*` no forman parte del runtime normal de PPO-02.

## 11. Estrategia inicial de validación

### Nivel 1 — Empaquetado

- Imagen construye.
- Contenedor inicia.
- Proceso responde.
- Liveness funciona.
- No requiere Supabase administrado.

### Nivel 2 — Integración local

- Evaluar conexión desde contenedor a Supabase local.
- Evaluar que navegador y servidor puedan usar endpoints coherentes.
- No cambiar arquitectura productiva solo para acomodar una prueba local.
- Cualquier necesidad de URL interna diferente debe ser un checkpoint
  arquitectónico explícito.

### Nivel 3 — Integración administrada

- Configurar Supabase administrado.
- Construir con variables públicas del entorno.
- Inyectar secreto server-only en runtime.
- Comprobar Auth y acceso básico.
- Requerido antes del cierre de PPO-02, salvo nueva decisión expresa.

Ningún nivel se declara ejecutado en PPO-02A.1.

## 12. Healthchecks

Rutas planificadas:

```text
/api/health/live
/api/health/ready
```

### Liveness

- Demuestra que el proceso Next.js responde.
- No consulta Supabase.
- No consulta base de datos.
- No expone configuración.
- Respuesta mínima.

### Readiness

- Demuestra que la aplicación tiene configuración mínima válida.
- Podrá comprobar dependencia externa con timeout corto cuando se configure.
- No expone URL, claves, project ref ni errores internos.
- Debe distinguir degradación de proceso caído.

`src/proxy.ts` deberá excluir explícitamente los healthchecks o tratarlos sin
requerir sesión. No se implementan todavía route handlers ni cambios al proxy.

PPO-02D.1 implementa las rutas `/api/health/live` y `/api/health/ready`, excluye
los healthchecks del proxy y configura healthchecks Compose para `app` y
`nginx` con `depends_on.app.condition = service_healthy`.

## 13. Cargas y tamaño de cuerpo

- `next.config.ts` mantiene actualmente límites transitorios de `110mb` para
  `experimental.proxyClientMaxBodySize` y `experimental.serverActions.bodySizeLimit`.
- PPO-02 no rediseña ese flujo.
- Nginx no debe introducir una regresión con un límite inferior al
  comportamiento actual.
- El límite funcional previsto sigue siendo 20 MB por archivo.
- PPO-03 definirá transferencia directa, semántica exacta en bytes y política
  final.
- No se afirma que 110 MB sea el límite funcional definitivo.

## 14. Recursos

Guardrails iniciales de `development-laptop`:

```text
Presupuesto agregado:
hasta 4 vCPU
hasta 4 GiB
```

- Aplicar límites por servicio.
- No modificar todavía la asignación global de Docker Desktop.
- Mantener margen mínimo aproximado de 6 GiB disponibles en el host.
- Revisar valores con mediciones reales.
- No aplicar estos valores automáticamente a `company-host`.
- No fijar todavía el reparto exacto entre Nginx y app; queda como decisión de
  PPO-02C.

## 15. Persistencia

- `app` y `nginx` serán stateless.
- No se guardarán archivos de clientes dentro de contenedores.
- No se usará el repositorio como volumen de datos.
- No se persistirá `.next`.
- No se persistirá `node_modules`.
- No se contenerizará PostgreSQL.
- No se crearán todavía volúmenes productivos de archivos.
- Supabase Storage continúa siendo externo.

## 16. Logs

- Logs por stdout/stderr.
- Sin archivos de log persistentes dentro del contenedor.
- Sin tokens, cookies, claves ni cuerpos sensibles.
- Nginx y app con logs separados.
- Observabilidad avanzada diferida a PPO-07.

## 17. Seguridad

- Usuario no root cuando técnicamente sea compatible.
- Imágenes con versiones controladas.
- Lockfile obligatorio.
- Contexto de build mínimo.
- `.dockerignore`.
- No montar Docker socket.
- No modo privilegiado.
- No `network_mode: host`.
- No secretos en build args.
- No puertos innecesarios.
- No acceso directo al servicio app.
- No credenciales hardcodeadas.

## 18. Portabilidad hacia company-host

La composición deberá:

- No usar rutas personales.
- No usar letras de unidad fijas.
- No usar IP fijas.
- No depender del nombre del equipo.
- No requerir GPU.
- No requerir herramientas instaladas dentro del host aparte de WSL2 y Docker
  Desktop.
- Permitir configuración mediante archivos externos no versionados.
- Conservar puertos externos configurables.
- Poder trasladarse sin editar código.

Esto no demuestra capacidad de `company-host` ni reemplaza PPO-01C.

## 19. Fases internas de PPO-02

```text
PPO-02A — Contrato y decisiones arquitectónicas
PPO-02B — Imagen de aplicación
PPO-02C — Nginx y Compose
PPO-02D — Reproducibilidad y validación
PPO-02E — Cierre
```

Checkpoints:

- PPO-02A: contrato documental, decisiones, variables, riesgos y Definition of
  Done.
- PPO-02B: Dockerfile de aplicación, build multi-stage, runtime mínimo, usuario
  no root y verificación de `output: "standalone"`.
- PPO-02C: Nginx, Compose, red interna, puertos, límites por servicio y
  políticas de reinicio.
- PPO-02D: arranque/parada reproducibles, smoke local, healthchecks, logs y
  mediciones iniciales.
- PPO-02E: cierre documental, riesgos remanentes, estrategia de Supabase
  administrado y preparación para la fase siguiente.

## 20. Definition of Done de PPO-02

- Imagen reproducible.
- Next.js ejecutándose en producción.
- Nginx como único punto publicado.
- Red interna.
- Healthchecks.
- Variables clasificadas.
- Secretos fuera de imágenes.
- Build limpio.
- Arranque y parada reproducibles.
- Smoke local.
- Límites observados.
- Documentación.
- Ausencia de datos sensibles.
- Estrategia de Supabase administrado resuelta.
- Ningún despliegue en `company-host` declarado.

## 21. Resultados De PPO-02A.2 Y PPO-02A.3

El informe del spike vive en
[PPO-02A.2 - Spike técnico de empaquetado](PPO_02_PACKAGING_SPIKE.md).

Resultados confirmados:

- `output: "standalone"` construyó correctamente en la imagen experimental.
- El runtime standalone requirió copiar explícitamente `.next/standalone`,
  `public` y `.next/static`.
- El servidor inició con `node server.js`, `HOSTNAME=0.0.0.0` y `PORT=3000`.
- La aplicación respondió un recurso estático con HTTP 200.
- El runtime funcionó como usuario no root con UID efectivo `1000`.
- La imagen base candidata es `node:24-bookworm-slim`.
- `SUPABASE_SECRET_KEY` pudo inyectarse solo en runtime sin aparecer en la
  imagen, filesystem, `docker history`, recursos estáticos ni logs.
- Los marcadores públicos de build aparecieron en salida server build; los
  marcadores públicos runtime no reescribieron assets cliente generados.
- La conectividad local quedó clasificada como Caso B: el contenedor alcanzó
  Supabase local mediante `host.docker.internal`, pero el host Windows no
  alcanzó esa URL en la prueba ejecutada.

PPO-02A.3 deja resuelto el contrato local para el Caso B:

- `NEXT_PUBLIC_SUPABASE_URL` permanece como endpoint público del navegador.
- `SUPABASE_SERVER_URL` queda como override server-only opcional para código
  servidor.
- El servidor cae a `NEXT_PUBLIC_SUPABASE_URL` cuando `SUPABASE_SERVER_URL` está
  vacío, conservando compatibilidad con Supabase administrado.
- El cliente de navegador no importa configuración server-only.
- Auth Admin usa el endpoint server-side y mantiene `SUPABASE_SECRET_KEY` solo
  en runtime server-side.
- No se modifican RLS, permisos, topología, healthchecks ni decisiones de
  Supabase administrado o autoalojado futuro.

Decisiones trasladadas a PPO-02B:

- Mantener `output: "standalone"` para el Dockerfile de aplicación.
- Usar familia `node:<major>-bookworm-slim`, evitando `node:latest` y Alpine en
  la base inicial.
- Copiar explícitamente `public` y `.next/static` junto al runtime standalone.
- Ejecutar como usuario no root.
- Inyectar secretos solo en runtime.
- Tratar variables `NEXT_PUBLIC_*` como valores de build cuando formen parte de
  salidas construidas.
- Usar el contrato de PPO-02A.3 para separar endpoint público de navegador y
  endpoint server-only cuando el entorno local lo requiera.

PPO-02B.1 queda ejecutada en
[PPO-02B.1 - Informe de imagen app](PPO_02_APP_IMAGE_REPORT.md).

Resultados confirmados:

- Dockerfile multi-stage `base`, `deps`, `builder` y `runner` creado.
- `.dockerignore` creado para reducir contexto y excluir `.env*`, docs, tests,
  Supabase CLI, reportes y artefactos locales.
- `output: "standalone"` activado en `next.config.ts` sin cambiar los límites
  transitorios de 110 MB.
- Imagen `godel-design-app:ppo-02b1` construida con la base fijada
  `node:24-bookworm-slim@sha256:cd84903a12dbd26b46f1f3b8144a2568c41c5d37ddd0c7a80a34c7a19786b35f`.
- Imagen final: 93.2 MiB de contenido, `linux/amd64`, usuario `node`, UID
  efectivo `1000`, comando `node server.js`, puerto `3000/tcp`.
- Segundo build sin cambios validó cache inicial: 3.2 s, `npm ci` y
  `npm run build` cacheados.
- Runtime respondió HTTP 200 para recurso de `public`, recurso
  `/_next/static`, `/login` y `/_next/image`.
- Split-horizon validado a nivel HTTP: host hacia `127.0.0.1:54321` y
  contenedor hacia `host.docker.internal:54321` respondieron HTTP 200 en
  `/auth/v1/health`.
- `sharp@0.34.5` quedó presente en runtime standalone y `/_next/image` funcionó
  sin error nativo.
- `unrs-resolver@1.11.1` permanece como dependencia transitiva de tooling y no
  quedó presente en runtime standalone.
- No se usó `SUPABASE_SECRET_KEY` en build ni smoke runtime.
- No se implementó Compose, Nginx ni healthchecks.

PPO-02B.2 queda ejecutada en
[PPO-02B.2 - Informe de endurecimiento de imagen app](PPO_02_APP_IMAGE_HARDENING_REPORT.md).

Resultados confirmados:

- El Dockerfile conserva la imagen base fijada y agrega cache de `npm ci`,
  reintentos npm acotados, `STOPSIGNAL SIGTERM` y preparación de tmpfs para
  `/tmp` y `/app/.next/cache`.
- El build wrapper `scripts/preproduction/build-app-image.ps1` captura exit code
  real de Docker, conserva evidencia sanitizada fuera del repositorio y no lee
  secretos.
- La imagen `godel-design-app:ppo-02b2` construyó sin caché con exit code 0 y
  luego reconstruyó con caché con exit code 0.
- Runtime validado con `--read-only`, `--pids-limit=256`, `--cap-drop=ALL`,
  `--security-opt no-new-privileges`, usuario `1000:1000` y tmpfs mínimos.
- `/app` bloqueó escritura arbitraria; `/tmp` y `/app/.next/cache` permitieron
  escritura temporal esperada.
- Smokes HTTP validaron `public`, `/_next/static`, `/login`, `/_next/image` y
  conectividad split-horizon hacia Supabase local.
- `docker stop --time 10` terminó con exit code 0 y el contenedor salió con 143,
  sin evidencia de `SIGKILL` ni `OOMKilled`.
- Los nombres literales `SUPABASE_SECRET_KEY` y `SUPABASE_SERVER_URL` en chunks
  server-side standalone quedan aceptados como comportamiento esperado. La
  exposición prohibida sigue siendo la de valores reales.
- No se detectaron valores reales de secretos ni endpoints server-only en
  Dockerfile, build args, capas, configuración de imagen, `docker history`,
  recursos cliente, recursos públicos, logs ni repositorio.
- No se implementó Compose, Nginx ni healthchecks.

PPO-02B queda cerrada para la imagen `app`.

PPO-02C.1 queda ejecutada en
[PPO-02C.1 - Informe de imagen Nginx](PPO_02_NGINX_IMAGE_REPORT.md).

Resultados confirmados:

- Imagen `godel-design-nginx:ppo-02c1` construida sobre
  `nginxinc/nginx-unprivileged:stable-bookworm` fijada por digest.
- Build no cacheado y build cacheado finalizaron con exit code 0 y evidencia
  sanitizada fuera del repositorio.
- Red temporal `godel-ppo-02c1` creada solo para validación manual de
  `godel-ppo-02c1-app` y `godel-ppo-02c1-nginx`.
- El contenedor `app` no publicó puertos; Nginx fue el único punto publicado.
- Nginx resolvió `app` mediante alias de red y no usó IP fija.
- `nginx -t` validó sintaxis y `nginx -T` confirmó listen 8080, upstream
  `app:3000`, headers forward, upgrade map, timeouts,
  `client_max_body_size 110m`, `proxy_request_buffering off`,
  `server_tokens off`, ausencia de TLS y ausencia de secretos.
- Smokes vía Nginx: `/login`, recurso de `public`, recurso `/_next/static` y
  `/_next/image` respondieron HTTP 200.
- Header `Server`: `nginx`, sin versión.
- `/dashboard` redirigió a `/login` sin perder el host original.
- Fallo controlado del upstream: con `app` detenido, `/login` vía Nginx devolvió
  HTTP 504, Nginx siguió ejecutándose y no registró secretos ni endpoints
  Supabase completos; tras reiniciar `app`, `/login` recuperó HTTP 200.
- Runtime Nginx validado con filesystem read-only, UID 101, tmpfs `/tmp`,
  `--cap-drop=ALL`, `no-new-privileges`, `pids-limit=128`, sin mounts
  persistentes, sin Docker socket y logs a stdout/stderr.
- No se implementó Compose, TLS, Cloudflare Tunnel ni healthchecks.

PPO-02C.2 queda ejecutada en
[PPO-02C.2 - Informe de Docker Compose y red interna](PPO_02_COMPOSE_REPORT.md).

Resultados confirmados:

- Composición final con exactamente dos servicios: `app` y `nginx`.
- Proyecto Compose `godel-design-ppo-02c2`, elegido para evitar colisión con
  recursos locales de Supabase etiquetados como `godel-design`.
- Red bridge dedicada `stack`, efectiva como `godel-design-ppo-02c2_stack`.
- `app` no publica puertos al host; Nginx publica únicamente
  `127.0.0.1:57774->8080/tcp`.
- No se declaran volúmenes persistentes, `container_name`, IP fija,
  `network_mode: host`, red external ni healthchecks.
- `app` usa `read_only`, usuario `1000:1000`, tmpfs `/tmp` y
  `/app/.next/cache`, `cap_drop: ALL`, `no-new-privileges`, `pids_limit: 256`,
  `cpus: 2.0` y `mem_limit: 2g`.
- `nginx` usa `read_only`, usuario `101:101`, tmpfs `/tmp`,
  `cap_drop: ALL`, `no-new-privileges`, `pids_limit: 128`, `cpus: 0.5` y
  `mem_limit: 256m`.
- `SUPABASE_SERVER_URL` estuvo disponible solo en `app` y
  `SUPABASE_SECRET_KEY` quedó vacía durante el smoke local.
- Nginx no recibió variables Supabase.
- `docker compose --env-file <archivo-temporal> config --quiet` finalizó con
  exit code 0; `config --services`, `config --networks`, `config --images` y
  `config --volumes` confirmaron el contrato esperado.
- `docker compose --env-file <archivo-temporal> build` finalizó con exit code 0
  en 26.2 s y produjo `godel-design-app:ppo-02c2` y
  `godel-design-nginx:ppo-02c2`.
- Smokes vía Nginx: `/login`, recurso de `public`, recurso `/_next/static` y
  `/_next/image` respondieron HTTP 200; `/dashboard` redirigió a `/login` con
  HTTP 307.
- Supabase local respondió HTTP 200 desde `app` mediante
  `host.docker.internal:54321`.
- `nginx -t` validó sintaxis y `nginx -T` confirmó resolver Docker, upstream
  dinámico y `proxy_pass http://app_backend`.
- La recreación de `app` cambió el ID del contenedor y Nginx recuperó `/login`
  con HTTP 200 sin reinicio ni recarga. Docker reutilizó la misma IP, por lo que
  no se declara demostrado un cambio efectivo de dirección.
- Con `app` detenida, `/login` devolvió HTTP 504 y Nginx permaneció activo; tras
  arrancar `app`, `/login` recuperó HTTP 200.
- `restart app`, `restart nginx`, `up -d --force-recreate` y `stop/start`
  mantuvieron recuperación local de `/login`.
- `docker stats --no-stream` mostró una muestra instantánea de 0.00% CPU y
  59.14 MiB / 2 GiB para `app`, y 0.03% CPU y 12.73 MiB / 256 MiB para Nginx.
- `down --remove-orphans` eliminó los contenedores y la red del proyecto
  aislado, conservó imágenes y no creó volúmenes del proyecto.
- El archivo real `compose.local.env` fue eliminado; los resúmenes sanitizados
  quedaron fuera del repositorio.
- No se implementó TLS, Cloudflare Tunnel, Supabase administrado,
  `company-host`, despliegue ni healthchecks.

PPO-02C.2 queda cerrada con condiciones por la ausencia todavía esperada de
healthchecks en esa fase, Supabase administrado, Auth completo, TLS, Cloudflare,
`company-host`, despliegue y E2E completo.

PPO-02C.3:

```text
Absorbida en PPO-02C.2 — límites y aislamiento validados
```

PPO-02C.2 ya validó CPU, memoria, `pids_limit`, `read_only`, tmpfs, usuarios no
root, `cap_drop=ALL`, `no-new-privileges`, red dedicada, `app` sin puerto
publicado, Nginx como única entrada, ausencia de Docker socket, ausencia de
montajes persistentes, `docker stats` y límites efectivos vía Docker.

PPO-02D.1 queda ejecutada en
[PPO-02D.1 - Informe de healthchecks y dependencia operativa](PPO_02_HEALTHCHECK_REPORT.md).

Resultados confirmados:

- `GET /api/health/live` responde HTTP 200 con `{"status":"ok"}` y
  `Cache-Control: no-store`.
- `GET /api/health/ready` valida configuración mínima mediante
  `getSupabaseServerUrl()` y `getSupabasePublishableKey()`, comprueba
  conectividad HTTP a `/auth/v1/health` con timeout aproximado de 2000 ms y
  responde HTTP 200 con `{"status":"ready"}` cuando la dependencia está
  disponible.
- Ante degradación de dependencia, readiness responde HTTP 503 con
  `{"status":"not_ready"}`, sin exponer URL, hostname, IP, variable, status
  upstream, excepción, project ref ni claves.
- `src/proxy.ts` excluye `api/health(?:/|$)` del matcher y preserva las
  exclusiones existentes para `_next/static`, `_next/image`, `favicon.ico` y
  extensiones de imagen.
- `app` incorpora healthcheck Compose con Node contra
  `http://127.0.0.1:3000/api/health/ready`, `interval: 10s`, `timeout: 4s`,
  `retries: 3` y `start_period: 15s`.
- Nginx incorpora healthcheck Compose con `nginx -t`, `interval: 30s`,
  `timeout: 3s`, `retries: 3` y `start_period: 5s`.
- `nginx.depends_on.app.condition` queda en `service_healthy`; en el arranque
  healthy observado, Compose esperó `app Healthy` antes de iniciar Nginx.
- `docker compose --env-file <healthy-env> build` finalizó con exit code 0 en
  20.2 s y produjo `godel-design-app:ppo-02d1` y
  `godel-design-nginx:ppo-02d1`.
- En estado healthy, `app` y Nginx alcanzaron health status `healthy`; solo
  Nginx publicó puerto al host.
- Live y ready respondieron HTTP 200 tanto vía Nginx como desde el contenedor
  `app`.
- Smokes vía Nginx: `/login` HTTP 200, `/dashboard` HTTP 307 a `/login`,
  recurso `public` HTTP 200, `/_next/static` HTTP 200 y `/_next/image` HTTP 200.
- Degradación controlada con `SUPABASE_SERVER_URL` sintético no disponible:
  `app` permaneció ejecutándose y pasó a `unhealthy` en 32 s, Nginx permaneció
  ejecutándose y `healthy`, live siguió en HTTP 200 y ready pasó a HTTP 503.
- Recuperación con env healthy: `app` volvió a `healthy` en 5 s sin reiniciar
  Nginx; live, ready y `/login` respondieron HTTP 200.
- `restart app` y `restart nginx` recuperaron health status y smokes; se
  registra que `docker compose restart` no reaplica cambios de variables, para
  lo cual se requiere recreación.
- `docker stats --no-stream` mostró una muestra instantánea de 0.00% CPU y
  61.07 MiB / 2 GiB para `app`, y 0.00% CPU y 12.62 MiB / 256 MiB para Nginx.
- `down --remove-orphans` eliminó contenedores y red del proyecto, conservó
  imágenes, no creó volúmenes y no alteró Supabase local.
- `compose.healthy.env` y `compose.degraded.env` fueron eliminados; solo quedan
  resúmenes sanitizados fuera del repositorio.
- No se implementó Supabase administrado, TLS, Cloudflare Tunnel,
  `company-host`, despliegue ni E2E completo.

Siguiente checkpoint si no aparecen nuevos bloqueantes:

```text
PPO-02D.2 - Validación con Supabase administrado
```

PPO-02D.2 queda condicionada a que el proyecto Supabase Free administrado esté
configurado y sus variables estén disponibles de forma segura. No se inicia en
PPO-02D.1.

PPO-02D.2 queda ejecutada en
[PPO-02D.2 - Validación con Supabase administrado](PPO_02_MANAGED_SUPABASE_REPORT.md).

Resultado anterior:

```text
manual_required
```

La validación administrada se detuvo antes de modificar el backend remoto porque
`compose.env.local` no existe en la raíz del repositorio con las variables reales
del proyecto Supabase Free administrado. El archivo queda formalizado como
runtime local ignorado por Git mediante `.gitignore`, mientras
`compose.env.example` permanece versionado como plantilla sin credenciales.

No se ejecutaron `supabase migration list --linked`, `supabase db push --linked
--dry-run`, `supabase db push --linked`, Compose administrado, Auth smoke, RLS
smoke ni Storage smoke. No se aplicaron migraciones remotas, no se ejecutó seed,
no se usaron banderas `--include-*` y no se modificó el backend administrado.

Reanudación de PPO-02D.2:

- `compose.env.local` existe, está ignorado por Git y cumple el contrato de
  propiedades sin imprimir valores.
- Supabase CLI está autenticada.
- El proyecto enlazado coincide con el endpoint administrado configurado y es
  accesible mediante `projects list`.
- `migration list --linked` no completó porque falta una credencial de base de
  datos no interactiva para la CLI.
- No se ejecutó `db push --linked --dry-run`.
- No se ejecutó `db push --linked`.
- No se aplicaron migraciones remotas.
- No se ejecutó seed.
- No se ejecutó Compose administrado.

Resultado vigente:

```text
manual_required
```

El siguiente intento de PPO-02D.2 debe retomarse cuando exista una credencial de
base de datos disponible para Supabase CLI de forma segura y no interactiva.

No se marca PPO-02 como cerrada.

## 22. Riesgos abiertos

| Clasificación | Riesgo | Tratamiento |
| ------------- | ------ | ----------- |
| condición | Supabase administrado pendiente de validación efectiva. | PPO-02D.2 quedó en `manual_required`; reintentar solo cuando exista credencial de base de datos no interactiva para Supabase CLI. |
| condición | Supabase Free con límites operativos. | 500 MB de base de datos, 1 GB de Storage, 5 GB de egress, hasta 2 proyectos activos y posible pausa tras una semana de inactividad; aceptable para operación provisional, requiere seguimiento y no es backend definitivo. |
| condición | Variables `NEXT_PUBLIC_*` ligadas a salidas construidas cuando participan en build. | Construir por entorno y mantener `SUPABASE_SERVER_URL` fuera del cliente. |
| condición | Conectividad local clasificada como Caso B. | Contrato split-horizon formalizado en PPO-02A.3 y validado localmente en PPO-02B/PPO-02C.2/PPO-02D.1; falta Supabase administrado efectivo. |
| observación | Docker Compose local implementado. | PPO-02C.2 valida red dedicada, app interna y Nginx como único punto publicado; no constituye despliegue. |
| observación | Build no cacheado de PPO-02B.2 completado sin `ECONNRESET`. | Mantener reintentos npm acotados, cache de dependencias y no ocultar fallos deterministas. |
| observación | Política npm `allowScripts` pendiente para `sharp` y `unrs-resolver`. | `sharp` validado en runtime standalone; revisar política npm en una fase posterior y no usar `--dangerously-allow-all-scripts`. |
| observación | Healthchecks locales implementados. | Live/ready, healthchecks Compose y `service_healthy` validados en PPO-02D.1; falta validación con Supabase administrado. |
| observación | `output: "standalone"` implementado para la imagen app. | Contrato operativo endurecido en PPO-02B.2 e integrado manualmente detrás de Nginx en PPO-02C.1. |
| observación | Imagen Nginx inicial fijada y validada. | Integrada mediante Compose en PPO-02C.2; mantener digest controlado. |
| observación | Imagen base inicial fijada para `app`. | Revisar política de actualización de digest en endurecimiento posterior. |
| observación | Secreto runtime confirmado en spike. | Mantenerlo fuera de ARG, capas, logs y Nginx en fases posteriores. |
| observación | Body size transitorio. | No tratar `110mb` como límite funcional definitivo; resolver en PPO-03. |
| observación | `company-host` no auditado. | Resolver en PPO-01C; no bloquea la preparación documental local. |
| observación | Límites iniciales de recursos probados con muestra breve. | No interpretar la muestra como rendimiento definitivo ni trasladarla automáticamente a `company-host`. |
| observación | Comportamiento de reinicio validado localmente con healthchecks. | `restart app` y `restart nginx` recuperaron health status y smokes; para cambios de entorno se requiere recreación, no `restart`. |
| observación | Recreación de `app` no cambió IP en la muestra. | Se validó cambio de ID y recuperación sin reiniciar Nginx; repetir con escenarios de cambio efectivo si aparece una prueba que fuerce cambio de dirección. |
| observación | PPO-QA-01 diferida. | Retomar antes del cierre definitivo de puesta en producción. |

No existe un bloqueante para comenzar la preparación documental y el empaquetado
básico local en `development-laptop`.
