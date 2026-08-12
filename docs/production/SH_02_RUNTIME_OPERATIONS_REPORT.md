# SH-02.3 — Runtime, readiness y configuración operativa

## Estado

```text
SH-02.2 = CLOSED / APPROVED
SH-02.3 = IMPLEMENTED / PENDING ARCHITECTURAL REVIEW
SH-02 = ACTIVE
NEXT AFTER APPROVAL = SH-02.4
```

Este informe formaliza el contrato operativo del perfil local
production-like. No implementa SH-02.4 ni SH-03, no cambia la baseline 01–06,
el bundle upstream, Nginx, Compose o código de aplicación.

## Contrato de configuración

Hay dos autoridades que no se fusionan:

| Autoridad | Contenido | Regla |
| --- | --- | --- |
| `.env` no versionado de Supabase | configuración del backend, claves Supabase y demás secretos upstream | Permanece junto al bundle y no se pasa íntegro a Godel. |
| env no versionado de Godel | solo variables que consume Godel, bind HTTP, tags de imagen y límites | Se mantiene fuera del repositorio o en una ubicación gitignored. |

Para este perfil local, Supabase define `SUPABASE_PUBLIC_URL` como
`http://localhost:8080`, `API_EXTERNAL_URL` como
`http://localhost:8080/auth/v1` y `SITE_URL` como `http://localhost:8080`.
Godel usa el mismo origen en `NEXT_PUBLIC_SUPABASE_URL` y
`http://api-gw:8000` en `SUPABASE_SERVER_URL`. PPO-04 sustituirá el origen por
el host, IP o dominio aprobado; este informe no lo decide.

`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` son
configuración pública de BUILD + RUNTIME. Deben coincidir entre build args y
runtime; cambiar cualquiera exige reconstruir la imagen `app`. No hay runtime
injection de `NEXT_PUBLIC_*`. `SUPABASE_SERVER_URL` y
`SUPABASE_SECRET_KEY` son RUNTIME SERVER-ONLY.

## Contrato de secretos

| Variable de Godel | Clasificación | Fuente |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | BUILD + RUNTIME PUBLIC | configuración de Godel, coherente con el origen público Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | BUILD + RUNTIME PUBLIC | `SUPABASE_PUBLISHABLE_KEY` de Supabase |
| `SUPABASE_SERVER_URL` | RUNTIME SERVER-ONLY | configuración de Godel: `http://api-gw:8000` |
| `SUPABASE_SECRET_KEY` | RUNTIME SERVER-ONLY | `SUPABASE_SECRET_KEY` de Supabase; solo adaptador Auth Admin server-only |

No se usa `env_file: infra/supabase/.env` para `app`. Godel no recibe JWT,
passwords, claves de Postgres ni otros secretos del bundle. No se usa
`SUPABASE_SERVICE_ROLE_KEY`.

## Validación de environments

El guardrail sin dependencias es:

```bash
node scripts/validate-selfhosted-runtime-env.mjs \
  --supabase-env <supabase-env-no-versionado> \
  --godel-env <godel-env-no-versionado>
```

Lee ambos archivos sin modificarlos ni imprimir valores. Requiere variables no
vacías, comprueba igualdad de publishable key y secret key, igualdad de origen
público, `API_EXTERNAL_URL=<public>/auth/v1`, `SITE_URL=<public>` y
`SUPABASE_SERVER_URL=http://api-gw:8000`. Solo normaliza slash final inocuo.
No resuelve DNS, no copia secretos y no crea archivos derivados.

## Red externa

La red `godel-supabase-api` es operator-owned y compartida entre projects. El
procedimiento idempotente correcto es:

```bash
docker network inspect godel-supabase-api
# Solo si inspect informa que no existe:
docker network create godel-supabase-api
```

No se afirma que `docker network create` por sí solo sea idempotente. No se
elimina la red al limpiar uno de los projects.

## Startup

Contrato operativo reproducible:

1. Verificar la configuración no versionada de ambos stacks.
2. Ejecutar el validador de environments.
3. Inspeccionar o crear la red externa según el procedimiento anterior.
4. Desde `infra/supabase`, iniciar el bundle y override:

   ```bash
   docker compose --env-file .env \
     -f docker-compose.yml \
     -f ../supabase-godel.override.yml up -d
   ```

5. Esperar que `api-gw` esté healthy.
6. Desde la raíz del repositorio, construir primero si cambió cualquiera de
   los `NEXT_PUBLIC_*`, y arrancar Godel:

   ```bash
   docker compose --env-file <godel-env-no-versionado> build
   docker compose --env-file <godel-env-no-versionado> up -d
   ```

7. Esperar `app` healthy y verificar Nginx healthy.
8. Comprobar públicamente `GET /api/health/live` y
   `GET /api/health/ready` por Nginx.

No hay `depends_on` entre los dos Compose projects.

## Liveness

Contrato diseñado: `GET /api/health/live` representa el proceso Next vivo y
devuelve `200` sin depender de Supabase. Auditoría de implementación: el
endpoint actual responde estáticamente `{ status: "ok" }`; no requirió cambio.

## Readiness

Contrato diseñado: `GET /api/health/ready` devuelve `200` solo si Auth está
disponible mediante `SUPABASE_SERVER_URL`; ante indisponibilidad devuelve
`503` con `{ status: "not_ready" }`, sin URL interna, key, token, stack trace o
detalle de Supabase. Auditoría de implementación: el endpoint hace una consulta
con timeout de dos segundos a `/auth/v1/health` y devuelve solo esos estados.

El healthcheck de `app` continúa apuntando a readiness. Así, `app healthy`
significa proceso y dependencia Supabase crítica disponibles, condición correcta
para el arranque de Nginx. El healthcheck de Nginx continúa siendo local de
configuración/proceso, no una prueba remota de Supabase.

## Degradación Supabase

Evidencia ejecutada: se confirmó inicialmente liveness/readiness `200`, se
detuvo solo `api-gw` y, tras la ventana del healthcheck, liveness permaneció
`200`, readiness devolvió el `503` esperado, `app` siguió running aunque pudo
quedar unhealthy y Nginx siguió running. No se detuvieron DB ni volúmenes.

## Recovery Supabase

Evidencia ejecutada: se arrancó solo `api-gw`, se esperó health y readiness
volvió a `200`; `GET /auth/v1/health` por Nginx volvió a `200` sin recrear app
ni Nginx. Una recreación controlada `--force-recreate` de solo `api-gw` cambió
su container ID; los IDs de app y Nginx permanecieron iguales y readiness/Auth
recuperaron. Esto valida DNS Docker y la red compartida sin depender de IP fija.

## Degradación app

Evidencia ejecutada: al detener solo `app`, Nginx siguió running y una ruta de
Next devolvió fallo controlado de upstream. Al iniciar solo `app` y esperar
health, `/` volvió a `200` sin reiniciar Nginx.

## Recovery app

La recuperación anterior deja a Nginx como proceso independiente: no se
recrea ni se reinicia por la parada controlada de `app`. Esto revalida la
resolución DNS dinámica del upstream de aplicación.

## Reinicio Nginx

Evidencia ejecutada: se reinició solo Nginx. App y Supabase conservaron sus
container IDs, Nginx volvió healthy, `/` respondió `200` y
`/auth/v1/health` respondió `200`.

## Seguridad

La evidencia y los comandos de este informe no contienen publishable key,
secret key, JWT, password, bearer token ni `x-signature`. No se creó usuario
QA, no se usó bypass de RLS y no se modificó la configuración upstream. TUS
autenticado y QA funcional pertenecen a SH-03.

## Validación

- Validador con envs sintéticos coincidentes: PASS, sin valores impresos.
- Validador con publishable key, secret key, URL pública y variable requerida
  discrepantes: FAIL seguro, sin valores impresos.
- El `.env` real de Supabase frente al env Godel ignorado existente detectó una
  publishable key desalineada sin imprimirla. El operador debe propagar las dos
  keys de la autoridad Supabase al env Godel antes de usar ese archivo para un
  arranque reproducible; el validador no lo copia ni lo corrige.
- `git diff --check`, `npm run diff:check` y `npm run audit:security`: PASS.
- Godel Compose config y Supabase Compose con override: PASS.
- Degradación y recovery descritos arriba: PASS.

## Pendientes

- SH-02.3 queda pendiente de revisión arquitectónica.
- La alineación de las keys del env Godel ignorado con el `.env` de Supabase es
  una acción pendiente del operador; no se automatiza ni se versiona.
- SH-02.4 conserva smoke técnico agregado, documentación de evidencia y cierre
  de SH-02.
- SH-03 conserva QA funcional, TUS autenticado y una identidad QA self-hosted
  realmente provisionada.

## Handoff

No hubo commit ni push. Los stacks pueden permanecer ejecutándose si están
sanos. La siguiente acción, tras aprobación arquitectónica, es SH-02.4.
