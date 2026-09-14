# SH-02 — Cierre de integración Godel ↔ Supabase self-hosted

## Estado

```text
SH-02.0 = CLOSED / APPROVED
SH-02.1 = CLOSED / APPROVED
SH-02.2 = CLOSED / APPROVED
SH-02.3 = CLOSED / APPROVED
SH-02.4 = CLOSED / APPROVED

SH-02 = CLOSED / APPROVED
NEXT = SH-03
```

SH-02 cierra la integración técnica production-like. No implementa QA funcional
de SH-03, cambios de producto, migraciones ni operación permanente.

## Alcance cerrado

La fase consolidó naming neutral, dos Compose projects independientes, una red
API externa limitada, proxy público Nginx para Auth/REST/Storage, split de URLs,
TUS resumible, contrato de environments, readiness y recuperación. La evidencia
focal se conserva en los informes SH-02.0, SH-02.1, SH-02.2 y SH-02.3; este
documento registra únicamente el gate agregado de cierre.

## Arquitectura final

```text
DEV / E2E LOCAL
npm run dev → Supabase CLI (project_id = godel-design)

PRODUCTION-LIKE LOCAL
Browser/host → Nginx → app
                    └→ api-gw → red privada Supabase

app ───────────────────→ api-gw por godel-supabase-api
```

El project de runtime es `godel-runtime`; el project self-hosted es `supabase`.
Para este profile local, Browser usa `http://localhost:8080` y Next server usa
`http://api-gw:8000`. PPO-04 sustituirá el origen local por el origen operativo
aprobado.

## Naming

Los servicios Godel son `app` y `nginx`; no se usan `container_name` ni naming
histórico. Las imágenes validadas son `godel-design-app:local` y
`godel-design-nginx:local`.

## Networking

`godel-supabase-api` es una red externa operator-owned. El smoke de cierre
confirmó como miembros efectivos a `godel-runtime-app-1`,
`godel-runtime-nginx-1` y `api-gw`; DB, Supavisor, Auth, REST y Storage no se
unen directamente a ella. El procedimiento operativo sigue siendo inspeccionar
la red y crearla solo si no existe.

## Proxy público

Nginx es el único frontend HTTP de Godel, publicado en loopback `:8080` para el
profile local. `app:3000`, `api-gw`, Supavisor y DB no publican puertos host.
Nginx enruta `/` a Next y `/auth/v1/`, `/rest/v1/` y `/storage/v1/` a `api-gw`.
No publica `/realtime/v1/` ni `/functions/v1/` porque no hay consumidor Godel.

## URL split

`NEXT_PUBLIC_SUPABASE_URL` es el origen público y
`SUPABASE_SERVER_URL=http://api-gw:8000` es el origen server-side. Los
`NEXT_PUBLIC_*` son BUILD + RUNTIME PUBLIC y requieren rebuild de app al cambiar;
las variables server-only son exclusivamente runtime. El validador de env real
pasó tras la acción manual del operador que alineó las dos keys de Godel con la
autoridad Supabase y reconstruyó solo `app`.

## TUS

El smoke público/presigned agregado creó una reserva/capability temporal sin
service-role, secret key ni bypass, y verificó por Nginx: REST `200`, POST TUS
`201`, `Location` pública/relativa, PATCH `204`, HEAD `200` y offset coherente.
No se ejecutaron finalize, listados, descargas ni TUS autenticado. No se observó
hostname interno en `Location` ni se necesitó reescritura.

## Configuration/secrets

Supabase conserva su `.env` no versionado como autoridad de backend y secretos;
Godel conserva un env separado con solo sus cuatro variables Supabase y opciones
propias. El guardrail de solo lectura compara ambos sin imprimir ni copiar
valores. No se usa `env_file` upstream en app ni `SUPABASE_SERVICE_ROLE_KEY`.

## Readiness/recovery

SH-02.3 aprobado ya demostró que api-gw down produce liveness `200` y readiness
`503`, y que api-gw recovery/recreación recupera readiness/Auth sin recrear
Godel. También demostró parada/recuperación de app sin reiniciar Nginx y reinicio
aislado de Nginx sin afectar app/Supabase. El smoke de cierre confirmó el estado
estable: `/api/health/live` `200`, `/api/health/ready` `200`, `/` `200` y Auth
por proxy `200`.

## Smoke agregado

| Gate | Resultado |
| --- | --- |
| Validador real de environments | PASS |
| Compose Godel y Supabase + override | PASS |
| Servicios críticos / red externa | PASS |
| Solo Nginx expuesto en host | PASS |
| App, liveness y readiness | `200` |
| Auth y REST por proxy | `200` |
| Storage/TUS POST, PATCH, HEAD | `201`, `204`, `200` |
| Location pública/relativa y sin hostname interno | PASS |
| Realtime / Functions proxy | ABSENT |

## Seguridad

`npm run audit:security` termina sin violaciones bloqueantes. La evidencia no
incluye keys, JWT, passwords, bearer tokens ni firmas TUS. `BASELINE 01–06 =
FROZEN`; no hubo cambios upstream, migraciones, tipos generados ni lógica de
negocio.

## Deuda / pendientes explícitos

- TUS autenticado y QA funcional completa → SH-03.
- Retirada de los límites transitorios de 110 MB / `TD-UPLOAD-001` → PPO-03G.
- Origen y bind de company-host → PPO-01C/D y PPO-04.
- Antiabuso público → PPO-05 / `TD-SECURITY-001`.
- Antivirus/quarantine → `TD-STORAGE-002` y gate público.
- Backup, restore, update y rollback → SH-04.
- Portabilidad reproducible → SH-05.

## Handoff a SH-03

La topología técnica está cerrada y entregada a SH-03. Ese workstream deberá
provisionar o usar una identidad QA self-hosted y validar los flujos funcionales
completos, incluido TUS autenticado. No hubo commit ni push.
