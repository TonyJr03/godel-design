# Preproducción y operación

Este índice distingue la gobernanza vigente, el camino de ejecución superseded,
la evidencia Self-Hosted de referencia y la investigación futura. No se ha
ejecutado ningún despliegue productivo.

## CURRENT / GOVERNING

- [PPO_ROADMAP.md](PPO_ROADMAP.md): roadmap maestro de Preproducción y Puesta
  en Operación. PPO-04 está `ACTIVE / NEXT` con destino Vercel Hobby + Supabase
  Managed Free.
- [PPO_04_MANAGED_FREE_PILOT_PLAN.md](PPO_04_MANAGED_FREE_PILOT_PLAN.md): plan
  gobernante de PPO-04M; PPO-04M.0 y PPO-04M.1 están `CLOSED / APPROVED`,
  PPO-04M.2 está `ACTIVE / IN PROGRESS` con M.2A `CLOSED / APPROVED` y M.2B
  `ACTIVE / NEXT`; PPO-04M.3–PPO-04M.7 no se han iniciado.
- [PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md](PPO_04M0_MANAGED_ARCHITECTURE_AUDIT.md):
  contrato aprobado de arquitectura, variables, Auth, DB, Storage, Vercel, QA,
  backup boundary y handoff exacto a PPO-04M.1.
- [PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md](PPO_04M1_SUPABASE_FREE_PROJECT_REPORT.md):
  aceptación sanitizada del proyecto Supabase Free separado, saludable, vacío
  y listo para el provisioning de PPO-04M.2.
- [PPO_04M2_MANAGED_PROVISIONING_REPORT.md](PPO_04M2_MANAGED_PROVISIONING_REPORT.md):
  evidencia acumulativa de M.2; M.2A aplicó 01–06 y aprobó hardening, lint y
  smoke estructural, mientras M.2B conserva bootstrap y QA funcional.
- [PROJECT_STATUS.md](../PROJECT_STATUS.md): fotografía vigente del proyecto,
  arquitectura, baseline y estados globales.

## HISTORICAL / SUPERSEDED EXECUTION PATH

- [PPO_04_PRODUCTION_PILOT_PLAN.md](PPO_04_PRODUCTION_PILOT_PLAN.md): antiguo
  plan de ejecución Self-Hosted VPS, `SUPERSEDED`; deployment no ejecutado y
  gates pendientes preservados.
- [PPO_04_SELF_HOSTED_VPS_PATH_CLOSURE.md](PPO_04_SELF_HOSTED_VPS_PATH_CLOSURE.md):
  cierre arquitectónico y handoff económico de esa ruta, no aprobación de un
  despliegue.

## SELF-HOSTED REFERENCE

- [SH_ROADMAP.md](SH_ROADMAP.md): full Supabase Self-Hosted congelado como
  arquitectura de referencia. SH-01–SH-04 conservan `CLOSED / APPROVED`; SH-05
  permanece `PAUSED / INCOMPLETE`.
- [SH_05_REHEARSAL_HANDOFF.md](SH_05_REHEARSAL_HANDOFF.md): evidencia parcial,
  límites y trabajo diferido de SH-05.3/SH-05.4.
- [SH_05_PORTABILITY_DISCOVERY.md](SH_05_PORTABILITY_DISCOVERY.md): discovery
  y fuentes de reconstrucción aprobadas.
- [SH_05_CLEAN_HOST_PORTABILITY_DESIGN.md](SH_05_CLEAN_HOST_PORTABILITY_DESIGN.md):
  contrato y tooling clean-host de SH-05.1/SH-05.2.
- [SUPABASE_SELF_HOSTED_OPERATIONS_RUNBOOK.md](SUPABASE_SELF_HOSTED_OPERATIONS_RUNBOOK.md):
  runbook técnico permanente de la arquitectura de referencia.
- [SH_04_OPERATIONS_DESIGN.md](SH_04_OPERATIONS_DESIGN.md),
  [SH_04_BACKUP_QA_REPORT.md](SH_04_BACKUP_QA_REPORT.md),
  [SH_04_SECRETS_AUTH_REPORT.md](SH_04_SECRETS_AUTH_REPORT.md),
  [SH_04_SECRET_ROTATION_REPORT.md](SH_04_SECRET_ROTATION_REPORT.md) y
  [SH_04_UPDATE_ROLLBACK_DESIGN.md](SH_04_UPDATE_ROLLBACK_DESIGN.md): diseño y
  evidencia operativa SH-04.
- [SH_02_CLOSURE_REPORT.md](SH_02_CLOSURE_REPORT.md) y
  [SH_03_CLOSURE_REPORT.md](SH_03_CLOSURE_REPORT.md): cierres de integración y
  QA production-like.
- [SH_01C_DATABASE_BASELINE_AUDIT.md](SH_01C_DATABASE_BASELINE_AUDIT.md):
  auditoría aprobada de la baseline 01–06.

## FUTURE

- [LSH_ROADMAP.md](LSH_ROADMAP.md): `LSH — Lightweight Self-Hosted`,
  `PLANNED / NOT STARTED`. Comienza después de disponer de medidas reales del
  Managed Pilot y conduce al decision gate Supabase Slim.

## Evidencia PPO histórica relevante

- [PPO_02_MANAGED_SUPABASE_REPORT.md](PPO_02_MANAGED_SUPABASE_REPORT.md):
  evidencia histórica de compatibilidad managed; no acepta el nuevo entorno.
- [PPO_03_CONTROL_PLANE_MANAGED_REPORT.md](PPO_03_CONTROL_PLANE_MANAGED_REPORT.md)
  y [PPO_03_STORAGE_MANAGED_REPORT.md](PPO_03_STORAGE_MANAGED_REPORT.md):
  antecedentes managed de RPC, Storage y TUS.
- [PPO_03F_QA_FREEZE_REPORT.md](PPO_03F_QA_FREEZE_REPORT.md): cierre y freeze de
  la baseline 01–06.
- [PPO_03G_UPLOAD_LIMITS_QA_REPORT.md](PPO_03G_UPLOAD_LIMITS_QA_REPORT.md):
  cierre del gate de uploads y límites.
- [PPO_02_CLOSURE.md](PPO_02_CLOSURE.md): cierre de la base contenerizada local,
  conservada como evidencia técnica.
- [PPO_01_AUDIT_PLAN.md](PPO_01_AUDIT_PLAN.md) y
  [PPO_01_CAPACITY_REPORT.md](PPO_01_CAPACITY_REPORT.md): evidencia y contrato de
  infraestructura previos; su trabajo residual de host no es gate del piloto
  managed.

## Diferencia entre carpetas

- `docs/production/`: planes activos, roadmaps, cierres y evidencia operativa.
- `docs/preproduction/`: cierres concretos de preparación, como PPO-00.
- `docs/archive/`: historia que puede aportar contexto pero no gobierna el
  trabajo actual.
