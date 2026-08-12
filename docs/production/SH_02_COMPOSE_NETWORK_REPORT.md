# SH-02.1 — Compose, networking y naming neutral

## Estado

```text
SH-02.0 = CLOSED / APPROVED
SH-02.1 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
SH-02 = ACTIVE
NEXT AFTER APPROVAL = SH-02.2
```

## Cambios

- `compose.yaml` usa el Compose project fijo `godel-runtime`; conserva los
  servicios `app` y `nginx` sin `container_name`.
- Las imágenes por defecto son `godel-design-app:local` y
  `godel-design-nginx:local`, con los overrides existentes
  `GODEL_APP_IMAGE_TAG` y `GODEL_NGINX_IMAGE_TAG`.
- `app` y `nginx` mantienen la red privada `stack` y se unen a la red externa
  `supabase_api` (`godel-supabase-api`). Se retiró
  `host.docker.internal:host-gateway`: no existe consumidor production-like
  aparte de la compatibilidad histórica con Supabase CLI local.
- El override Godel se neutralizó como
  `infra/supabase-godel.override.yml`, sin duplicar overrides. Conserva los
  ajustes JWT/JWKS y añade la red externa solo a `api-gw`.
- El override elimina los host binds de `api-gw` y Supavisor mediante
  `ports: !override []`. PostgreSQL no tenía host ports y no se le añadieron.

No se modificaron `infra/supabase/`, Dockerfile, Nginx, URLs Supabase, código,
tests, migraciones ni tipos de base de datos.

## Naming

| Ámbito | Resultado |
| --- | --- |
| Godel Compose project | `godel-runtime` |
| Supabase Compose project | `supabase` |
| Godel private network | `godel-runtime_stack` (derivada) |
| Shared network | `godel-supabase-api` |
| Shared network owner | Operador; red externa a ambos projects |
| App image | `godel-design-app:local` |
| Nginx image | `godel-design-nginx:local` |

El Compose project `godel-design` continúa reservado para Supabase CLI local.

## Redes

| Servicio / grupo | Red privada propia | `godel-supabase-api` |
| --- | ---: | ---: |
| `app` | Sí (`stack`) | Sí |
| `nginx` | Sí (`stack`) | Sí |
| `api-gw` | Sí (`default` Supabase) | Sí, alias `api-gw` |
| `db` | Sí (`default` Supabase) | No |
| `supavisor` | Sí (`default` Supabase) | No |
| Resto de servicios Supabase | Sí (`default` Supabase) | No |

La auditoría del Compose efectivo confirmó que `api-gw` es el único servicio
Supabase conectado a la red compartida. No se usan IPs fijas ni
`network_mode: host`.

## Exposición

| Componente | Host ports efectivos |
| --- | --- |
| Nginx | Puerto HTTP Godel existente; único frontend Godel |
| app | Ninguno |
| api-gw | Ninguno |
| Supavisor | Ninguno (`5432` y `6543` retirados) |
| PostgreSQL | Ninguno |

Un diagnóstico futuro de gateway o pooler deberá usar un procedimiento temporal
loopback u override específico; no se reintroduce exposición permanente.

## Compose efectivo

La validación usó valores temporales no secretos para Godel y el `.env`
existente, no impreso, del bundle Supabase.

```text
Godel: project=godel-runtime
Godel services=app,nginx
Godel networks=stack,supabase_api
Godel images=godel-design-app:local,godel-design-nginx:local

Supabase: project=supabase
api-gw networks=default,godel-supabase-api
api-gw host ports=0
supavisor networks=default
supavisor host ports=0
db networks=default
db host ports=0
shared-network Supabase services=api-gw
```

## Validación

- `docker compose config --quiet` de Godel: PASS.
- `docker compose config --services`, `--networks` y `--images` de Godel:
  PASS; reflejan el project, servicios, redes e imágenes esperados.
- `docker compose --env-file .env -f docker-compose.yml -f
  ../supabase-godel.override.yml config --quiet`: PASS.
- Auditoría JSON del Compose efectivo Supabase: PASS; sin host ports de
  `api-gw`, Supavisor o DB y sin servicios adicionales en la red compartida.
- Red Docker `godel-supabase-api`: creada como recurso operator-owned y
  validada con driver `bridge`, `internal=false`, `containers=0` antes de
  iniciar stacks.

No se iniciaron servicios, migraciones, builds ni QA funcional; el smoke de
conectividad entre contenedores y el proxy público pertenecen a SH-02.2/SH-02.4.

## Riesgos / pendientes

- SH-02.2 debe configurar el proxy Nginx para Auth, REST y Storage; esta fase
  solo conecta físicamente Nginx a la red compartida.
- SH-02.3 debe configurar las URLs efectivas, startup/readiness y secretos
  mínimos sin alterar el contrato build-time de `NEXT_PUBLIC_*`.
- La red externa se conserva al hacer `docker compose down` y no debe eliminarse
  como limpieza de QA. Operación mínima idempotente: crearla si no existe con
  `docker network create godel-supabase-api`.

## Handoff

La siguiente acción, tras revisión arquitectónica, es SH-02.2. No se debe
implementar routing Nginx ni URL split antes de esa aprobación.
