# PPO-02D.2 - Validacion con Supabase administrado

## Metadatos

- Estado: Ejecutado - Bloqueada
- Fase: PPO-02D.2
- Fecha: 2026-08-08
- Host: development-laptop
- Backend: Supabase administrado Free

## Contexto de red

Ejecuciones Codex:

```text
Contexto de red: VPN activo / ProTUN.
```

Todo el trabajo realizado previamente por Codex en PPO-02 y esta ejecucion se
realizo con el VPN activo, segun confirmacion de Direccion Tecnica.

Operaciones PostgreSQL manuales de D.2:

```text
Contexto: VPN desactivado.
Motivo: Supabase CLI/PostgreSQL detras de ProTUN produce Connection timed out.
```

La observacion de red se clasifica como:

```text
restriccion del canal administrativo PostgreSQL a traves de ProTUN
```

ProTUN produce timeout en la conexion PostgreSQL administrativa del Supabase
CLI. La conectividad TCP al pooler por si sola no fue suficiente para completar
la sesion PostgreSQL. Sin VPN, la misma operacion completo.

Esta observacion no se clasifica como fallo demostrado del runtime HTTPS.

## Base Git

- Repositorio: `TonyJr03/godel-design`.
- Rama local: `preprod/ppo-02-container-foundation`.
- SHA inicial: `4d5fe9c4dc6be7bc5dc8a335f0fae2e344e3b6ae`.
- `origin/preprod/ppo-02-container-foundation`: mismo SHA.
- Arbol Git versionado inicial: limpio.
- `compose.env.local`: existe, esta ignorado por Git y no esta versionado.

No se hizo commit ni push.

## Evidencia manual de migraciones

Direccion Tecnica declaro como precondicion aprobada:

- `migrationListBeforePush`: Caso A - proyecto remoto nuevo.
- `dryRunBeforePush`: exactamente seis migraciones.
- `dbPushSucceeded`: true.
- `migrationListAfterPush`: 6/6.
- `dryRunAfterPush`: 0 pendientes.
- `seedApplied`: false.

Migraciones incluidas en el dry-run manual antes del push:

- `20260731000100_01_core_schema.sql`.
- `20260731000200_02_security_rls_grants.sql`.
- `20260731000300_03_business_rpcs.sql`.
- `20260731000400_04_storage.sql`.
- `20260731000500_05_auth_admin_user_lifecycle.sql`.
- `20260731000600_06_final_hardening.sql`.

Codex no reejecuto ninguna operacion PostgreSQL administrativa por el contexto
VPN/ProTUN y por instruccion expresa.

No se ejecuto:

- `supabase migration list --linked`.
- `supabase db push`.
- `supabase db push --dry-run`.
- `supabase db pull`.
- `supabase db reset`.
- `supabase migration repair`.
- `supabase db diff`.
- `psql` remoto.
- conexion directa PostgreSQL.
- conexion manual a Supavisor.

## Credenciales PostgreSQL

- `SUPABASE_DB_PASSWORD`: no disponible para el proceso de Codex.
- `POSTGRES_PASSWORD`: no disponible para el proceso de Codex.
- `SUPABASE_ACCESS_TOKEN`: no disponible como variable de entorno; la CLI ya
  estaba autenticada mediante credential storage en validacion previa.

`SUPABASE_DB_PASSWORD` fue utilizada unicamente de forma temporal por Direccion
Tecnica para las operaciones PostgreSQL manuales con VPN desactivado. No forma
parte de `compose.env.local`, no forma parte del runtime y no fue entregada a
Codex.

`POSTGRES_PASSWORD` no forma parte del contrato de PPO-02D.2.

## Configuracion local segura

`compose.env.local` fue validado por propiedades, sin imprimir valores.

Resultado:

- `NEXT_PUBLIC_SUPABASE_URL`: presente, HTTPS y administrada, no localhost.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: presente y con prefijo
  `sb_publishable_`.
- `SUPABASE_SERVER_URL`: vacio.
- `SUPABASE_SECRET_KEY`: presente y con prefijo `sb_secret_`.
- Publishable key y secret key: distintas.
- `GODEL_HTTP_BIND_ADDRESS`: `127.0.0.1`.
- `GODEL_APP_IMAGE_TAG`: `ppo-02d2`.
- `GODEL_NGINX_IMAGE_TAG`: `ppo-02d2`.

No se imprimieron ni registraron en documentos URL completa, project ref, claves,
connection strings, DB password, access token, email sintetico, password
sintetico ni UUID de usuario.

## HTTPS administrado con VPN activo

Prueba HTTPS desde el host Codex usando solo publishable key:

- `managedHttpsReachable`: true.
- `authHealthAvailable`: true.

La restriccion observada con ProTUN afecta al canal PostgreSQL administrativo,
mientras el endpoint HTTPS administrado es alcanzable con el VPN activo.

No se generaliza esta evidencia a otros protocolos.

## Cliente publico

Cliente Supabase temporal construido solo con:

- `NEXT_PUBLIC_SUPABASE_URL`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Resultado:

- `publicClientInitializable`: true.

No se uso secret key en esta prueba.

## PostgREST y baseline

Con cliente publico y API HTTPS:

- `publicPostgrestAvailable`: true.
- `publicBaselineTableAvailable`: true.

La tabla `tipos_servicio` estuvo disponible y la baseline minima esperada fue
visible por la ruta publica prevista para el catalogo. No se volcaron filas ni
datos de negocio.

La comprobacion administrativa de PostgREST con `SUPABASE_SECRET_KEY` no se
ejecuto porque las reglas del proyecto reservan el cliente admin para Auth Admin
y operaciones server-only auditadas especificas. No se creo un cliente admin
paralelo para tablas de negocio.

## Storage

Comprobacion anonima con cliente publico:

- `storageAnonDeniedOrEmpty`: true.

No se subieron archivos, no se descargaron archivos y no se listaron nombres de
objetos existentes.

La comprobacion administrativa exacta de:

```text
bucketExists: true
bucketPublic: false
```

no se ejecuto desde Codex para no usar el cliente admin como ruta general de
Storage. La baseline manual declarada incluye la migracion `04_storage` aplicada
y el hardening local espera el bucket privado `godel-files`.

## RLS anonimo

Con cliente publico sin sesion sobre `pedidos`:

- `anonRlsSafe`: true.
- Filas de negocio visibles: ninguna.

La respuesta fue segura. No se imprimieron filas.

## Politica Auth administrada

Direccion Tecnica declaro configurado manualmente:

- `Allow new users to sign up = OFF`.
- `Allow anonymous sign-ins = OFF`.

Validacion mediante signup controlado con email sintetico `.invalid`:

- `signupRejected`: true.

No se publico email sintetico. No se creo usuario inesperado.

## Auth Admin

No se ejecuto una operacion Auth Admin desde Codex en esta continuacion.

Motivo: el intento de crear un harness admin ad hoc fue rechazado por las reglas
de seguridad del proyecto. Codex no lo sorteo. Las reglas vigentes reservan
`SUPABASE_SECRET_KEY` para el adaptador server-only existente y flujos auditados
del ciclo de identidad.

Resultado:

- `authAdminAvailable`: no_ejecutado.
- `syntheticUserCreated`: no_ejecutado.
- `syntheticLoginSucceeded`: no_ejecutado.
- `syntheticLogoutSucceeded`: no_ejecutado.
- `syntheticUserDeleted`: no_ejecutado.

No se creo usuario Auth sintetico administrativo, no se creo perfil de negocio y
no quedo usuario sintetico pendiente de limpieza.

## Compose administrado

Comandos ejecutados:

- `git check-ignore compose.env.local`: OK.
- `docker compose --env-file compose.env.local config --quiet`: exit code 0.
- `docker compose --env-file compose.env.local build`: exit code 0.
- `docker compose --env-file compose.env.local up -d --wait --wait-timeout 120`:
  exit code 1.

`config --quiet` no imprimio configuracion expandida. Docker emitio avisos de
acceso a su configuracion local cuando se ejecuto dentro del sandbox, pero el
comando completo con permisos adecuados fue operativo.

Build:

- Imagen `godel-design-app:ppo-02d2`: construida.
- Imagen `godel-design-nginx:ppo-02d2`: construida.

Advertencia: la salida de BuildKit mostro valores publicos `NEXT_PUBLIC_*`
expandidos durante el paso de validacion de build. No se conservaron logs crudos
en evidencia y no se imprimieron esos valores en documentacion. No se observo
`SUPABASE_SECRET_KEY`, DB password ni connection string en build logs, imagen,
history, archivos runtime ni logs runtime.

Arranque:

- `app`: creada, iniciada y luego `unhealthy`.
- `nginx`: creada, pero no quedo operativa porque depende de
  `app.service_healthy`.
- Solo Nginx habria publicado puerto; `app` permanecio sin binding al host.

## Diagnostico de readiness

Dentro de `app`:

- `/api/health/live`: HTTP 200, `{"status":"ok"}`.
- `/api/health/ready`: HTTP 503, `{"status":"not_ready"}`.
- `SUPABASE_SERVER_URL`: vacio.
- Fallback server-side a `NEXT_PUBLIC_SUPABASE_URL`: configurado por entorno.

Prueba HTTPS directa desde `app` hacia Supabase administrado:

- `/auth/v1/health` sin `apikey`: HTTP 401.
- `/auth/v1/health` con publishable key como `apikey`: HTTP 200.

El runtime contenerizado alcanza Supabase administrado via HTTPS a traves del
contexto de red con VPN activo, aunque el canal PostgreSQL administrativo del
Supabase CLI experimente timeout detras de ProTUN.

El bloqueante observado es que la implementacion actual de readiness llama
`/auth/v1/health` sin cabecera `apikey`; en el backend administrado validado esa
peticion responde 401 y la ruta devuelve 503. No se modifico codigo porque la
tarea prohibia cambios de arquitectura, runtime y `src/`.

## Smoke funcional via Nginx

No ejecutado.

Nginx no quedo operativo porque `app` no alcanzo `healthy`. Por tanto no se
validaron via Nginx:

- `/login`.
- `/dashboard`.
- recurso public.
- `/_next/static`.
- `/_next/image`.

## Seguridad runtime

Validaciones realizadas sin imprimir valores:

- `SUPABASE_SECRET_KEY`: presente en runtime de `app`.
- `SUPABASE_SECRET_KEY`: no detectada en archivos de app revisados.
- `SUPABASE_SECRET_KEY`: no detectada en config de imagen `app`.
- `SUPABASE_SECRET_KEY`: no detectada en history de imagen `app`.
- `SUPABASE_SECRET_KEY`: no detectada en config/history de imagen Nginx.
- `SUPABASE_SECRET_KEY`: no detectada en logs runtime de `app`.
- `SUPABASE_DB_PASSWORD`: ausente del runtime `app`.
- `POSTGRES_PASSWORD`: ausente del runtime `app`.
- Patrones PostgreSQL/connection string: no detectados en config/history/logs
  revisados.

Nginx no recibio variables Supabase por contrato Compose y no quedo ejecutandose
operativamente en esta prueba.

## Recursos

Muestra instantanea, no benchmark:

- `app`: CPU 5.90%, RAM 83.89 MiB / 2 GiB.
- `nginx`: sin muestra operativa porque no arranco por dependencia unhealthy.

## Limpieza

Se ejecuto:

```text
docker compose --env-file compose.env.local down --remove-orphans
```

Resultado:

- Contenedores del proyecto: 0.
- Red del proyecto: eliminada.
- Volumenes del proyecto: 0.
- Imagenes: conservadas.
- Usuario Auth sintetico: no creado.
- Perfiles de negocio sinteticos: 0 creados.
- Datos de negocio: 0 creados.
- Objetos Storage: 0 creados.
- Seed: no aplicado.
- Supabase local: no alterado.
- `compose.env.local`: conservado como configuracion persistente local ignorada.

## Evidencia sanitizada

Se intento guardar evidencia en `%LOCALAPPDATA%`, pero el sandbox denego la
creacion del directorio. Se uso fallback en `%TEMP%`.

Se conservaron solamente:

- `managed-summary.md`.
- `managed-summary.json`.

No se conservaron logs crudos ni valores sensibles.

## Limites Supabase Free

Limites vigentes registrados para el plan Free:

- 500 MB de base de datos.
- 1 GB de Storage.
- 5 GB de egress.
- Hasta 2 proyectos activos.
- Posible pausa tras una semana de inactividad.

Tratamiento:

- Aceptable para la operacion provisional actual.
- Requiere seguimiento.
- Storage y pausa por inactividad deben vigilarse.
- No se considera backend definitivo.
- La direccion futura de VPS y Supabase autoalojado permanece intacta.

## Resultado

Clasificacion:

```text
Bloqueada
```

PPO-02D.2 ya no esta bloqueada por migracion manual pendiente: la evidencia
manual de Direccion Tecnica declara la baseline remota aplicada, 6/6 migraciones
presentes, 0 migraciones pendientes y seed no aplicado.

El bloqueo vigente es tecnico de runtime:

```text
/api/health/ready devuelve 503 contra Supabase administrado porque la llamada
server-side a /auth/v1/health no envia apikey y el backend administrado responde
401 en ese caso.
```

Tambien quedan no ejecutadas las pruebas Auth Admin/sinteticas desde Codex por
restriccion de uso de `SUPABASE_SECRET_KEY` fuera de los flujos server-only
auditados existentes.

PPO-02 no se marca como cerrada. No existe TLS, Cloudflare, `company-host` ni
despliegue.
