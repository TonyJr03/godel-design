# Estado del proyecto

Última actualización: 2026-09-16

## Estado general

Godel Diseño mantiene un MVP interno funcional, la baseline de base de datos
congelada y evidencia técnica aprobada tanto en entornos managed como en el
workstream self-hosted. Todavía no existe despliegue productivo.

```text
No production deployment yet.
```

El primer destino real vigente es Vercel Hobby + Supabase Managed Free. PPO-04M
está `ACTIVE / NEXT` y comienza por cerrar arquitectura y gobernanza; no se ha
creado ni provisionado infraestructura remota como parte de este pivot.

## Arquitectura vigente

```text
DEVELOPMENT / E2E
Next.js development
+
Supabase CLI/local workflow
```

```text
CURRENT PRODUCTION TARGET
Vercel Hobby / Next.js
+
Supabase Managed Free
  ├── PostgreSQL
  ├── PostgREST
  ├── Auth
  └── Storage
```

```text
FUTURE SELF-HOSTED R&D
LSH
→ Supabase Slim
→ decision gate
→ portable Slim stack OR PostgreSQL/PostgREST/own Auth/own Storage
```

El Managed Free Pilot no usa Nginx, Docker, VPS ni Supabase Self-Hosted en
producción. Desarrollo/E2E mantiene su arquitectura actual. Godel Diseño se
considera por ahora personal/no comercial; si su uso cambia materialmente,
debe reevaluarse la elegibilidad de Vercel Hobby.

## Baseline de base de datos

La baseline congelada contiene exactamente seis migraciones consolidadas:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

```text
BASELINE 01–06 = FROZEN
```

El Managed Pilot aplicará esas seis migraciones sobre una baseline limpia, sin
seed productivo salvo decisión explícita. Toda evolución DB posterior debe usar
una migración nueva `07+`.

## Estado de gobernanza

| Bloque | Estado |
| --- | --- |
| PPO-00 | `CLOSED` |
| PPO-01 | trabajo residual de host diferido a LSH/self-host futuro |
| PPO-02 | `CLOSED`; evidencia managed histórica relevante |
| PPO-03 | `CLOSED / APPROVED` |
| PPO-04 | `ACTIVE / NEXT` — Managed Free Production Pilot |
| PPO-04M | `ACTIVE / NEXT` |
| PPO-04M.0 | `ACTIVE / NEXT` |
| PPO-04M.1–PPO-04M.7 | `NOT STARTED` |
| PPO-05 | `PENDING` — seguridad pública/antiabuso |
| PPO-06 | `PENDING` — backup/recovery managed |
| PPO-07 | `PENDING` — observabilidad/operación managed |
| PPO-08–PPO-09 | `PENDING` |
| PPO-10 | `DEFERRED` — eventual migración productiva post-LSH |
| SH full-stack | `FROZEN AS REFERENCE ARCHITECTURE` |
| SH-05 | `PAUSED / INCOMPLETE` |
| LSH | `PLANNED / NOT STARTED` |

```text
PRODUCTION DEPLOYMENT = NOT EXECUTED
```

## Evidencia y capacidades Self-Hosted conservadas

SH-01, SH-02, SH-03 y SH-04 conservan `CLOSED / APPROVED`. Permanecen válidos
la baseline, integración App/Nginx/Supabase Self-Hosted, QA production-like,
backup/restore, secretos, update/rollback y runbook técnico.

También sigue disponible el tooling genérico de producción que materializa:

```text
Git exacto
→ App/Nginx linux/amd64
→ deterministic tags
→ verified artifacts
→ sanitized manifest
→ checksum
```

Docker/release/backup/restore/secret generations son capacidades disponibles
para un futuro self-hosted ligero; no son requisitos del Managed Free Pilot y
no prueban que se haya realizado un build o despliegue productivo.

SH-05 no está cerrado. SH-05.0–SH-05.2 conservan sus cierres reales;
SH-05.3 queda `PARTIALLY PROVEN / DEFERRED` y SH-05.4 queda `DEFERRED`.
Siguen pendientes el build Godel target-side completo, la autoridad exacta del
Dockerfile, la dependencia del frontend externo, la aceptación funcional/
Playwright, el cleanup final y el cierre agregado.

## Ruta activa

```text
PPO-04M.0  arquitectura y gobernanza
→ PPO-04M.1  proyecto Supabase Free productivo/piloto
→ PPO-04M.2  DB/Auth/Storage
→ PPO-04M.3  deployment Vercel Hobby
→ PPO-04M.4  QA managed propio
→ PPO-04M.5  backup externo y recovery baseline
→ PPO-04M.6  small initial real use
→ PPO-04M.7  estabilización y medidas reales
→ LSH (futuro, no iniciado)
```

La evidencia managed de PPO-02/PPO-03 es antecedente de compatibilidad. El
nuevo entorno debe tener aceptación propia, backup fuera de Supabase y control
de capacidad/free-tier antes de depender de él para datos reales.

## Capacidades funcionales disponibles

- Solicitud pública y tracking público `/estado`.
- Dashboard interno por rol, clientes, solicitudes, pedidos y tareas.
- Archivos privados con reserva, TUS, finalize, listing y descarga protegida.
- Comentarios, historial, pagos y administración de usuarios internos.
- RLS, RPCs, policies y Auth Admin server-only según los contratos vigentes.

## Documentación gobernante

- [Roadmap PPO](production/PPO_ROADMAP.md)
- [PPO-04 — Managed Free Production Pilot](production/PPO_04_MANAGED_FREE_PILOT_PLAN.md)
- [Cierre del camino Self-Hosted VPS](production/PPO_04_SELF_HOSTED_VPS_PATH_CLOSURE.md)
- [Roadmap Self-Hosted de referencia](production/SH_ROADMAP.md)
- [LSH — Lightweight Self-Hosted](production/LSH_ROADMAP.md)
- [Deuda técnica activa](development/TECH_DEBT.md)
