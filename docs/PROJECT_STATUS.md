# Estado del proyecto

Última actualización: 2026-09-13

## Estado general

Godel Diseño mantiene un MVP interno funcional, una baseline self-hosted
reproducible y fundamentos operativos cerrados/aprobados hasta SH-04. Todavía no
existe despliegue productivo: PPO-04 / Production Pilot V1 queda `ACTIVE / NEXT`
como la iniciativa actual para el primer uso real controlado.

SH-05 no está cerrado. El rehearsal real produjo evidencia cross-host parcial y
su trabajo restante se pausó como `NON-BLOCKING HARDENING`; ya no es un gate
previo al piloto.

## Arquitectura vigente

```text
Desarrollo y E2E
npm run dev -> Supabase CLI local

Production-like
App Docker + Nginx -> Supabase self-hosted Docker

Release productiva
Juliet / integration host / future CI
-> build App + Nginx linux/amd64
-> registry o transferencia segura
-> Production VPS ejecuta artefactos verificados
```

```text
Production VPS = RUN RELEASE ARTIFACTS
Production VPS != REQUIRED TO BUILD EVERYTHING FROM SOURCE
```

Supabase administrado pertenece a validaciones históricas de PPO-02/PPO-03. El
backend objetivo es Supabase self-hosted en Docker; Supabase CLI local se
conserva para desarrollo/E2E.

## Baseline de base de datos

La baseline congelada contiene exactamente seis migraciones consolidadas:

1. `20260811131824_01_core_schema.sql`
2. `20260811131825_02_security_rls_grants.sql`
3. `20260811131826_03_business_rpcs.sql`
4. `20260811131827_04_storage.sql`
5. `20260811131828_05_auth_admin_user_lifecycle.sql`
6. `20260811131829_06_final_hardening.sql`

La baseline self-hosted aprobó fresh rebuild, 6/6 migraciones, DB lint, Storage
QA, tipos generados y build. `BASELINE 01–06 = FROZEN`: toda evolución de base
de datos posterior debe realizarse mediante una migration nueva `07+`. Las
antiguas incrementales 07/08 pertenecen a la historia previa a SH-01C y no
forman parte de una instalación actual.

## Estado PPO

| Bloque | Estado |
| --- | --- |
| PPO-00 | Cerrada |
| PPO-01 | Activa; PPO-01E/F se coordinan con el gate VPS del piloto |
| PPO-02 | Cerrada con condiciones; evidencia managed histórica |
| PPO-03 | Cerrada / aprobada |
| PPO-04 | `ACTIVE / NEXT` — Production Pilot V1, no desplegado |
| PPO-05 | Pendiente — hardening público completo |
| PPO-06 | Pendiente — backup/DR productivo completo |
| PPO-07 | Pendiente — observabilidad y operación completa |
| PPO-08 | Pendiente — UAT y puesta en operación |
| PPO-09 | Pendiente — estabilización |
| PPO-10 | Deferred / optional — migración futura de infraestructura |

PPO-03 cerró el rediseño de archivos, lifecycle/cleanup y el gate final de
infraestructura. PPO-04 no se considera desplegado por estar activo: su plan
define los blockers que aún deben cerrarse antes del primer uso real.

## Estado Self-Hosted

| Bloque | Estado |
| --- | --- |
| SH-01 | `CLOSED / APPROVED` |
| SH-02 | `CLOSED / APPROVED` |
| SH-03 | `CLOSED / APPROVED` |
| SH-04 | `CLOSED / APPROVED` |
| SH-05 | `PAUSED / NON-BLOCKING HARDENING` |
| SH-05.0 | `CLOSED / APPROVED / PASS_PORTABILITY_DISCOVERY` |
| SH-05.1 | `CLOSED / APPROVED` |
| SH-05.2 | `CLOSED / APPROVED / PASS_MINIMAL_CLEAN_HOST_PORTABILITY_TOOLING` |
| SH-05.3 | `PARTIALLY PROVEN / DEFERRED` |
| SH-05.4 | `DEFERRED` |

El rehearsal real demostró checkout exacto, tests Linux clean-host, admisión de
inputs, gate pre/post import, transporte/import offline de 16 autoridades
lógicas y 13 imágenes físicas verificadas, autoridad OCI local y resolución de
la base Node mediante Buildx. No completó el build Godel target-side ni la
aceptación funcional/Playwright y cleanup final. Las brechas de frontend
Dockerfile externo, autoridad exacta del Dockerfile, build target-side y cierre
funcional quedan registradas como hardening post-piloto.

## Ruta activa

```text
PPO-04 / Production Pilot V1
-> release App/Nginx linux/amd64 fuera del VPS
-> generación externa productiva exacta
-> readiness VPS + firewall + HTTPS + aislamiento
-> despliegue y smoke productivo
-> backup inicial verificado con copia off-host
-> small initial real use
-> observar y corregir P0/P1
-> Production Primary cuando Dirección Técnica lo apruebe
```

R7 es evidencia de rehearsal, no configuración productiva. Producción requiere
su propia generación externa exacta con URLs, credenciales, database password,
JWT/Auth, keys, dashboard credentials y demás valores productivos. Nunca se
importa R7 para editarlo manualmente y continuar afirmando `R7 MATCH`.

Solo los gates `BLOCKER FOR PILOT` del plan PPO-04 bloquean el primer uso real
controlado. PPO-05, PPO-06 y PPO-07 conservan el hardening completo posterior;
SH-05 permanece como portabilidad post-piloto. La exposición pública general e
irrestricta continúa pendiente de PPO-05.

## Capacidades disponibles

- Solicitud pública y tracking público `/estado`.
- Dashboard interno por rol, clientes, solicitudes, pedidos y tareas.
- Archivos privados con control plane de reserva, TUS y finalize.
- Comentarios, historial, pagos y administración de usuarios internos.
- Topología production-like, backup/restore same-host, update/rollback y tooling
  de portabilidad parcial ya validados según sus reportes.

## Documentación vigente

- [Plan PPO-04 / Production Pilot V1](production/PPO_04_PRODUCTION_PILOT_PLAN.md)
- [Roadmap PPO](production/PPO_ROADMAP.md)
- [Roadmap Self-Hosted](production/SH_ROADMAP.md)
- [Handoff del rehearsal SH-05](production/SH_05_REHEARSAL_HANDOFF.md)
- [Contrato clean-host SH-05.1](production/SH_05_CLEAN_HOST_PORTABILITY_DESIGN.md)
- [Runbook operativo self-hosted](production/SUPABASE_SELF_HOSTED_OPERATIONS_RUNBOOK.md)
- [Cierre de integración SH-02](production/SH_02_CLOSURE_REPORT.md)
- [Plan QA funcional production-like SH-03](production/SH_03_QA_PLAN.md)
- [Cierre SH-03](production/SH_03_CLOSURE_REPORT.md)
- [Auditoría de baseline self-hosted SH-01C](production/SH_01C_DATABASE_BASELINE_AUDIT.md)
- [Deuda técnica activa](development/TECH_DEBT.md)
