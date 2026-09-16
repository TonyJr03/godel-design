# Documentación del proyecto

Entrada principal de documentación vigente para Godel Diseño. Los planes,
auditorías, cierres y reportes de fases pasadas viven en [archive/](archive/) y
no son fuente primaria para implementar cambios actuales.

## Estado

- [Estado del proyecto](PROJECT_STATUS.md): estado vigente, baseline de base de datos,
  funcionalidades disponibles y prioridades de preproducción.

## Preproducción y operación

- [Índice de preproducción y operación](production/README.md): planes activos,
  auditorías y documentos de puesta en operación.
- [Roadmap PPO](production/PPO_ROADMAP.md): iniciativa de Preproducción y
  Puesta en Operación y roadmap maestro.
- [PPO-04 — Managed Free Production Pilot](production/PPO_04_MANAGED_FREE_PILOT_PLAN.md):
  plan gobernante `ACTIVE / NEXT` para el primer rollout sobre Vercel Hobby y
  Supabase Managed Free.
- [Cierre del camino Self-Hosted VPS](production/PPO_04_SELF_HOSTED_VPS_PATH_CLOSURE.md):
  ruta anterior superseded sin despliegue.
- [Roadmap Self-Hosted](production/SH_ROADMAP.md): workstream full-stack
  congelado como referencia; SH-05 permanece pausado/incompleto.
- [LSH — Lightweight Self-Hosted](production/LSH_ROADMAP.md): investigación
  futura planificada, todavía no iniciada.
- [Handoff del rehearsal SH-05](production/SH_05_REHEARSAL_HANDOFF.md):
  evidencia cross-host real, límites y trabajo diferido sujeto a LSH.
- [Plan de auditoría PPO-01](production/PPO_01_AUDIT_PLAN.md): contrato para
  auditoría de infraestructura y conectividad.
- [Informe de capacidad PPO-01](production/PPO_01_CAPACITY_REPORT.md):
  plantilla de resultados aprobados.
- [Cierre PPO-00](preproduction/PPO_00_CLOSURE.md): baseline local cerrada.

## Modelos funcionales actuales

- [Modelo de base de datos](DATABASE_MODEL.md): modelo de datos y relaciones principales.
- [Modelo de permisos](PERMISSIONS_MODEL.md): roles, permisos, rutas internas y relación con RLS.
- [Gestión de usuarios](USERS_MANAGEMENT_MODEL.md): ciclo de usuarios internos con Auth Admin.
- [Modelo de Storage](STORAGE_MODEL.md): bucket privado, rutas de archivos, metadata y descargas firmadas.
- [Flujo de solicitud pública](PUBLIC_REQUEST_FLOW.md): solicitud pública.
- [Flujo de solicitudes internas](INTERNAL_REQUESTS_FLOW.md): gestión interna de solicitudes.
- [Flujo de clientes](CLIENTS_FLOW.md): gestión de clientes.
- [Flujo de pedidos](ORDERS_FLOW.md): gestión de pedidos.
- [Asignaciones de pedidos](ORDER_ASSIGNMENTS_FLOW.md): asignación de personal a pedidos.
- [Comentarios e historial](COMMENTS_AND_HISTORY_MODEL.md): comentarios e historial operativo.
- [Dashboard operativo](DASHBOARD_OPERATIVE_MODEL.md): dashboard operativo por rol.

## UI/UX

- [Convenciones UI/UX](CONVENCIONES_UI_UX_GODEL.md): reglas visuales permanentes.
- [Índice UI/UX](ui-ux/README.md): contratos UI/UX vigentes.

## Reglas del proyecto

- [Reglas permanentes](project-standards/README.md): índice de reglas permanentes.
- [Reglas de arquitectura](project-standards/ARCHITECTURE_RULES.md): arquitectura y capas.
- [Reglas de seguridad](project-standards/SECURITY_RULES.md): seguridad, secretos, rutas públicas y archivos.
- [Reglas de base de datos](project-standards/DATABASE_RULES.md): migraciones, RLS, RPCs y tipos.
- [QA y reporte](project-standards/QA_AND_REPORTING.md): validaciones y reporte técnico.
- [Checklists](project-standards/checklists/): checklists por tipo de cambio.

## Desarrollo local

- [Índice de desarrollo](development/README.md): guías vivas de desarrollo.
- [Desarrollo local](development/LOCAL_DEVELOPMENT.md): entorno local.
- [Autenticación local](development/AUTH_LOCAL.md): usuarios locales y Auth Admin server-only.
- [Deuda técnica](development/TECH_DEBT.md): deuda técnica activa.

## Rendimiento

- [Índice de rendimiento](performance/README.md): uso del baseline.
- [Baseline de rendimiento](performance/PERFORMANCE_BASELINE.md): medición vigente de referencia.

## Archivo histórico

- [Archivo histórico](archive/README.md): mapa de documentos históricos por etapa o dominio.
