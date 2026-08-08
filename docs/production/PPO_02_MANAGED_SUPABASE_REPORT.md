# PPO-02D.2 - Validación con Supabase administrado

## Metadatos

- Estado: Ejecutado
- Fase: PPO-02D.2
- Fecha: 2026-08-08
- Host: development-laptop
- Backend: Supabase administrado

## Precondiciones

- Rama local: `preprod/ppo-02-container-foundation`.
- SHA inicial: `1535c909af39cf51bc10cf1b363eb51190694971`.
- `origin/preprod/ppo-02-container-foundation` apuntaba al mismo SHA.
- Árbol Git versionado inicial: limpio.
- `compose.env.local` existe en la raíz del repositorio.
- `compose.env.local` está ignorado por Git.
- `compose.env.local` no aparece en `git status`.
- PPO-02D.1 está presente y documentada en
  [PPO-02D.1 - Informe de healthchecks](PPO_02_HEALTHCHECK_REPORT.md).
- Archivos requeridos presentes:
  - `compose.yaml`.
  - `compose.env.example`.
  - `src/app/api/health/live/route.ts`.
  - `src/app/api/health/ready/route.ts`.
  - `docs/production/PPO_02_HEALTHCHECK_REPORT.md`.

## Configuración local segura

`compose.env.local` fue validado por propiedades, sin imprimir valores.

Resultado:

- `NEXT_PUBLIC_SUPABASE_URL`: presente, HTTPS y administrada, no localhost.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: presente y con prefijo
  `sb_publishable_`.
- `SUPABASE_SERVER_URL`: vacío.
- `SUPABASE_SECRET_KEY`: presente y con prefijo `sb_secret_`.
- Publishable key y secret key: distintas.
- `GODEL_HTTP_BIND_ADDRESS`: `127.0.0.1`.
- `GODEL_HTTP_PORT`: presente.
- `GODEL_APP_IMAGE_TAG`: `ppo-02d2`.
- `GODEL_NGINX_IMAGE_TAG`: `ppo-02d2`.
- Variables de recursos: presentes.

No se imprimieron ni registraron URL completa, project ref, claves, connection
strings, DB password, access token, email sintético, contraseña sintética ni
UUID de usuario.

## CLI y vínculo

- `npx.cmd supabase --version`: exit code 0.
- Versión observada: `2.109.1`.
- `npx.cmd supabase projects list -o json`: exit code 0, salida capturada y no
  reproducida.
- `cliAuthenticated`: true.
- `linkedProjectConfigured`: true.
- `linkedProjectMatchesEnvUrl`: true.
- `linkedProjectAccessible`: true.

No se ejecutó `supabase login`, no se pasó token por argumento y no se cambió el
proyecto enlazado.

## Inventario local

Inventario local de migraciones: exactamente seis archivos consolidados:

- `20260731000100_01_core_schema.sql`.
- `20260731000200_02_security_rls_grants.sql`.
- `20260731000300_03_business_rpcs.sql`.
- `20260731000400_04_storage.sql`.
- `20260731000500_05_auth_admin_user_lifecycle.sql`.
- `20260731000600_06_final_hardening.sql`.

No se detectó una séptima migración local.

No se modificaron migraciones.

## Migraciones remotas

La consulta:

```text
npx.cmd supabase migration list --linked
```

no completó dentro del timeout operativo y dejó un proceso `supabase` esperando
entrada interactiva. Se cerró el proceso colgado sin aplicar cambios.

Variables de proceso disponibles para credencial remota:

- `SUPABASE_DB_PASSWORD`: ausente.
- `POSTGRES_PASSWORD`: ausente.
- `SUPABASE_ACCESS_TOKEN`: ausente.

Clasificación de historia remota:

```text
manual_required
```

Razón: la CLI está autenticada y el proyecto está enlazado, pero no existe una
credencial de base de datos disponible de forma no interactiva para consultar la
historia remota de migraciones.

No se pudo clasificar la historia remota como A, B, C o D sin riesgo de
ambigüedad.

## Dry-run

No se ejecutó:

```text
npx.cmd supabase db push --linked --dry-run
```

Razón: el contrato exige completar primero `migration list --linked` y clasificar
la historia remota. Esa precondición no se pudo completar sin credencial de base
de datos no interactiva.

No se usó `--include-seed`, `--include-roles` ni `--include-all`.

## Aplicación de baseline

No se ejecutó:

```text
npx.cmd supabase db push --linked
```

No se aplicó ninguna migración remota y no se ejecutó seed.

## Comprobación posterior

No se ejecutó la comprobación posterior de:

- `npx.cmd supabase migration list --linked`.
- `npx.cmd supabase db push --linked --dry-run`.

Razón: el backend remoto no fue modificado y la credencial no interactiva de base
de datos sigue pendiente.

## Auth health y API

No se ejecutó la prueba contra `/auth/v1/health` ni la creación de cliente
Supabase público.

Razón: la ejecución se detuvo antes de tocar el backend administrado o avanzar a
validaciones remotas posteriores.

## Auth Admin

No se ejecutó operación read-only de Auth Admin.

`authAdminAvailable`:

```text
no_ejecutado
```

## PostgREST

No se ejecutó comprobación read-only de PostgREST ni tabla principal.

## Storage

No se ejecutó comprobación remota del bucket `godel-files`.

Valores no demostrados en esta ejecución:

- `bucketExists`.
- `bucketPublic`.

No se subieron, descargaron ni listaron objetos.

## RLS anónimo

No se ejecutó smoke RLS con publishable key sobre `pedidos`.

No se imprimieron ni documentaron filas.

## Política de signup

Dirección Técnica declaró configurado manualmente:

- `Allow new users to sign up = OFF`.
- `Allow anonymous sign-ins = OFF`.

No se ejecutó la prueba controlada de self-signup porque la ejecución se detuvo
antes de las validaciones remotas posteriores a migraciones.

`managedAuthSignupDisabled`:

```text
no_ejecutado
```

## Auth sintético administrado

No se creó usuario Auth sintético.

Por tanto:

- No se creó perfil de negocio.
- No se inició sesión con email/password sintético.
- No quedó usuario sintético pendiente de limpieza.
- No se imprimieron email, password ni UUID.

## Compose administrado

No se ejecutó:

- `docker compose --env-file compose.env.local config --quiet`.
- `docker compose --env-file compose.env.local build`.
- `docker compose --env-file compose.env.local up -d --wait --wait-timeout 120`.
- Fallback `up -d` + `ps`/`inspect`.

Razón: el contrato exige completar primero la validación de historia remota y
dry-run antes de construir y arrancar la composición contra Supabase
administrado.

No se crearon contenedores, redes, volúmenes ni imágenes nuevas como parte de
PPO-02D.2.

## Healthchecks

No se ejecutaron healthchecks contra Compose administrado.

Se conserva como evidencia previa lo validado en PPO-02D.1 para ejecución local:

- `/api/health/live`.
- `/api/health/ready`.
- healthcheck de `app`.
- healthcheck de `nginx`.
- `depends_on.app.condition = service_healthy`.

## Smoke funcional

No se ejecutó smoke funcional vía Nginx contra Supabase administrado.

No se creó ningún dato de negocio.

## Seguridad

- No se usó `SUPABASE_SERVICE_ROLE_KEY`.
- No se expuso `SUPABASE_SECRET_KEY`.
- No se consultó `auth.users` desde código de aplicación.
- No se crearon clientes admin nuevos.
- No se modificaron migraciones, RLS, RPCs, grants, Storage, Auth ni código
  fuente.
- No se imprimieron secretos ni valores reales de entorno.
- No se ejecutó `supabase login`.
- No se ejecutó `migration repair`.
- No se ejecutó `db pull`.
- No se ejecutó `db reset`.
- No se ejecutó `db diff`.
- No se ejecutó rollback improvisado.
- No se ejecutó seed.

## Límites Supabase Free

Límites vigentes registrados para el plan Free:

- 500 MB de base de datos.
- 1 GB de Storage.
- 5 GB de egress.
- Hasta 2 proyectos activos.
- Posible pausa tras una semana de inactividad.

Tratamiento:

- Aceptable para la operación provisional actual.
- Requiere seguimiento.
- Storage y pausa por inactividad deben vigilarse.
- No se considera backend definitivo.
- La dirección futura de VPS y Supabase autoalojado permanece intacta.

## Limpieza

- Proceso `supabase` colgado: cerrado.
- Usuario Auth sintético: no creado.
- Datos de negocio: cero creados.
- Objetos Storage: cero creados.
- Seed: no aplicado.
- Supabase local: no alterado.
- Compose administrado: no arrancado; no hubo contenedores/redes/volúmenes que
  limpiar.
- `compose.env.local`: conservado como configuración persistente local ignorada
  por Git.

## Evidencia administrada

No se conservaron logs crudos sensibles.

La evidencia final versionada queda en este informe, con valores sanitizados y
sin URL completa, project ref, claves, connection strings, DB password, access
token, email/password sintético ni UUID.

## Limitaciones restantes

- Credencial de base de datos no interactiva pendiente para Supabase CLI.
- Historia remota de migraciones no clasificada.
- Dry-run remoto no ejecutado.
- Baseline remota no aplicada.
- Auth health administrado no comprobado.
- Auth Admin administrado no comprobado.
- PostgREST administrado no comprobado.
- Storage administrado no comprobado.
- RLS anónimo remoto no comprobado.
- Self-signup deshabilitado no comprobado automáticamente.
- Auth sintético administrado no ejecutado.
- Compose administrado no construido ni arrancado.
- Sin TLS.
- Sin Cloudflare Tunnel.
- Sin `company-host`.
- Sin despliegue.
- Sin E2E completo.

## Resultado

Clasificación:

```text
manual_required
```

PPO-02D.2 queda detenida antes de modificar el backend remoto. El siguiente
intento debe retomarse cuando exista una credencial de base de datos disponible
para Supabase CLI de forma segura y no interactiva, por ejemplo mediante el
mecanismo de credenciales de la CLI o una variable de proceso efímera no
versionada.
