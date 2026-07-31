# Inventario de reorganización documental

Fecha de inventario: 2026-07-31.

Rama de trabajo: `docs/archive-development-history`.
SHA base: `cb24593674e01f7a652333d371afaab844cb0ed1`.

## Alcance

Esta fase es solo de inventario, clasificación y planificacion. No se movieron,
renombraron, borraron ni reescribieron documentos existentes.

Comandos de inventario ejecutados:

```powershell
Get-ChildItem -Recurse -File |
  Where-Object {
    $_.Extension -eq ".md" -and
    $_.FullName -notmatch "[\\/](node_modules|\.next|playwright-report|test-results)[\\/]"
  } |
  Sort-Object FullName |
  Select-Object FullName, Length

Get-ChildItem docs -Recurse -File -Filter "*.md" |
  Sort-Object FullName |
  Select-Object FullName, Length

Get-ChildItem src -Recurse -File -Filter "README.md" |
  Sort-Object FullName |
  Select-Object FullName, Length
```

Totales reales:

| Grupo | Total |
| --- | ---: |
| Markdown inventariados en estado base antes de crear estos artefactos | 98 |
| Markdown dentro de `docs/` en estado base | 80 |
| Markdown dentro de `docs/development/` en estado base | 30 |
| Markdown inventariados en estado actual de la rama | 100 |
| Markdown dentro de `docs/` en estado actual | 82 |
| Markdown dentro de `docs/development/` en estado actual | 32 |
| `src/lib/**/README.md` | 12 |
| `supabase/**/*.md` | 0 |
| `tests/**/*.md` | 0 |

La matriz cubre los 100 documentos Markdown actuales de la rama, incluyendo los
dos artefactos de esta fase. Esos dos artefactos se moveran al archivo histórico
solo como último paso de la siguiente fase, después de completar la
reorganización y repetir la validación.

## Resumen por categoría

| Categoría | Total |
| --- | ---: |
| CURRENT_STABLE | 30 |
| CURRENT_DEVELOPMENT | 7 |
| HISTORICAL_ARCHIVE | 44 |
| CURRENT_NEEDS_UPDATE | 17 |
| SUPERSEDED_OR_DUPLICATE | 2 |
| NEEDS_DIRECTOR_DECISION | 0 |
| TOTAL | 100 |

## Matriz de documentos

| Documento actual | Tipo | Estado declarado | Evidencia de vigencia | Categoría | Destino propuesto | Acción | Enlaces afectados |
| ---------------- | ---- | ---------------- | --------------------- | --------- | ----------------- | ------ | ----------------- |
| `.codex/skills/godel-authenticated-visual-qa/SKILL.md` | Skill operativa local | Procedimiento vigente de QA visual autenticada | Skill referenciada por AGENTS para UI protegida | CURRENT_DEVELOPMENT | Igual | KEEP | No |
| `.codex/skills/godel-supabase-migration-qa/SKILL.md` | Skill operativa local | Procedimiento vigente de QA de migraciones | Skill referenciada por AGENTS para DB/Supabase | CURRENT_DEVELOPMENT | Igual | KEEP | No |
| `.codex/skills/ui-ux-pro-max/SKILL.md` | Skill operativa local | Procedimiento vigente de apoyo UI/UX | Skill referenciada por AGENTS para trabajo UI/UX | CURRENT_DEVELOPMENT | Igual | KEEP | No |
| `AGENTS.md` | Regla de agente | Vigente con regla Auth Admin demasiado absoluta | Obliga consulta documental y skills locales, pero debe distinguir cliente administrativo server-only de uso general prohibido | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si, debe apuntar a nuevos indices cuando existan |
| `CLAUDE.md` | Alias de agente | Delegado a `AGENTS.md` | Contiene solo `@AGENTS.md` | SUPERSEDED_OR_DUPLICATE | Igual como alias de compatibilidad | KEEP | No |
| `README.md` | Indice raíz | Vigente con descripción documental y seguridad a ajustar | Describe stack, estructura y comandos actuales; debe aclarar Auth Admin y `docs/development` tras archivo | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si, descripción de `docs/development` tras archivo |
| `docs/README.md` | Indice documental | Vigente pero incompleto | Lista documentos funcionales, pero no separa archivo histórico futuro ni `PROJECT_STATUS.md` | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si, indice principal |
| `docs/CLIENTS_FLOW.md` | Modelo funcional | Vigente | Describe rutas, permisos y relaciones actuales del dominio Clientes | CURRENT_STABLE | Igual | KEEP | Si, referencias entrantes desde docs históricos |
| `docs/COMMENTS_AND_HISTORY_MODEL.md` | Modelo funcional | Vigente | Canoniza comentarios e historial de pedidos/solicitudes | CURRENT_STABLE | Igual | KEEP | Si, referencias entrantes desde modelos y docs históricos |
| `docs/CONVENCIONES_UI_UX_GODEL.md` | Regla UI/UX estable | Vigente con enlaces históricos | Es guia permanente de UI; enlaza auditorías/cierres de Fase 14 | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si, enlaces a documentos UI movidos |
| `docs/DASHBOARD_OPERATIVE_MODEL.md` | Modelo funcional | Vigente con referencia obsoleta | Modelo del dashboard por rol; aún menciona actualizar `ROADMAP.md` | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si, referencia a roadmap histórico |
| `docs/DATABASE_MODEL.md` | Modelo estable | Vigente | Refleja `service_id`, Auth Admin User Lifecycle, seis migraciones efectivas y RPCs finales | CURRENT_STABLE | Igual | KEEP | Si, referencias entrantes |
| `docs/INTERNAL_REQUESTS_FLOW.md` | Modelo funcional | Vigente | Describe gestión interna de solicitudes y referencias actuales a dashboard/comentarios | CURRENT_STABLE | Igual | KEEP | Si, referencias entrantes |
| `docs/ORDER_ASSIGNMENTS_FLOW.md` | Modelo funcional | Vigente | Describe asignación multiple y permisos vigentes | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/ORDERS_FLOW.md` | Modelo funcional | Vigente | Refleja `service_id`, pagos, tareas, asignaciones, comentarios, archivos y tracking | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/PERMISSIONS_MODEL.md` | Modelo estable con drift | Parcialmente vigente | Matriz de permisos vigente, pero la sección de usuarios conserva flujo legacy por UUID Auth existente | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si |
| `docs/PUBLIC_REQUEST_FLOW.md` | Modelo funcional | Vigente | Refleja flujo público con `service_id`, DTO controlado y archivos públicos | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/STORAGE_MODEL.md` | Modelo funcional | Vigente | Bucket privado, signed URLs, metadatos y reglas actuales | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/USERS_MANAGEMENT_MODEL.md` | Modelo funcional | Vigente | Describe alta Auth Admin, auditoría/rate limits, reset y legacy retirado | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/development/README.md` | Indice desarrollo | Vigente pero incompleto | Solo lista algunos documentos; mezcla guias vivas con auditorías cerradas | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si |
| `docs/development/LOCAL_DEVELOPMENT.md` | Guia operativa | Vigente | Comandos locales Next/Supabase y nota histórica clara | CURRENT_DEVELOPMENT | Igual | KEEP | No crítico |
| `docs/development/AUTH_LOCAL.md` | Guia operativa con fallback legacy | Vigente salvo variable administrativa legacy | Describe login local y Auth Admin server-only, pero debe retirar `SERVICE_ROLE_KEY` como alternativa | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | No crítico |
| `docs/development/TECH_DEBT.md` | Registro vivo | Vigente con deuda dispersa | Contiene deuda viva, pero debe absorber deuda aceptada de Beta 2 y alinear siguiente etapa | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si |
| `docs/development/DOCUMENTATION_REORGANIZATION_INVENTORY.md` | Inventario de mantenimiento documental | Actual en esta fase | Artefacto de planificacion necesario hasta ejecutar y validar la reorganización | CURRENT_DEVELOPMENT | `docs/archive/project-maintenance/DOCUMENTATION_REORGANIZATION_INVENTORY.md` | MOVE_TO_ARCHIVE | Si, mover al final |
| `docs/development/DOCUMENTATION_REORGANIZATION_PLAN.md` | Plan de mantenimiento documental | Actual en esta fase | Artefacto de planificacion necesario hasta ejecutar y validar la reorganización | CURRENT_DEVELOPMENT | `docs/archive/project-maintenance/DOCUMENTATION_REORGANIZATION_PLAN.md` | MOVE_TO_ARCHIVE | Si, mover al final |
| `docs/development/TECHNICAL_AUDIT.md` | Auditoria inicial | Historico | Beta 2 ya lo marca como obsoleto por `src/services` y hallazgos cerrados | HISTORICAL_ARCHIVE | `docs/archive/initial-development/TECHNICAL_AUDIT.md` | MOVE_TO_ARCHIVE | Si |
| `docs/development/ROADMAP.md` | Roadmap histórico | Cerrado/mixto | Presenta fases completadas y próxima fase ya superada por baseline/preproducción | HISTORICAL_ARCHIVE | `docs/archive/initial-development/ROADMAP.md` | MOVE_AND_UPDATE_LINKS | Si, varias referencias |
| `docs/development/ALFA_1_WORKFLOW_TYPE_CHECKLIST.md` | Checklist de fase | Cerrado | Cierre de separación Encargo/Impresión | HISTORICAL_ARCHIVE | `docs/archive/alfa-features/ALFA_1_WORKFLOW_TYPE_CHECKLIST.md` | MOVE_TO_ARCHIVE | Si desde roadmap |
| `docs/development/ALFA_2_PUBLIC_TRACKING_CHECKLIST.md` | Checklist de fase | Cerrado | Checklist completado de tracking público | HISTORICAL_ARCHIVE | `docs/archive/alfa-features/ALFA_2_PUBLIC_TRACKING_CHECKLIST.md` | MOVE_TO_ARCHIVE | No |
| `docs/development/ALFA_3_TASK_TEMPLATES_CHECKLIST.md` | Checklist de fase | Cerrado | Checklist completado de plantillas | HISTORICAL_ARCHIVE | `docs/archive/alfa-features/ALFA_3_TASK_TEMPLATES_CHECKLIST.md` | MOVE_TO_ARCHIVE | No |
| `docs/development/ALFA_4_PAYMENTS_CHECKLIST.md` | Checklist de fase | Cerrado | Checklist completado de pagos | HISTORICAL_ARCHIVE | `docs/archive/alfa-features/ALFA_4_PAYMENTS_CHECKLIST.md` | MOVE_TO_ARCHIVE | No |
| `docs/development/BETA_1_DB_AUDIT.md` | Auditoria DB | Cerrado | Diagnóstico de 19/21 migraciones históricas, reemplazado por baseline final | HISTORICAL_ARCHIVE | `docs/archive/beta-1-database/BETA_1_DB_AUDIT.md` | MOVE_TO_ARCHIVE | Si desde cierre Beta 1 |
| `docs/development/BETA_1_MIGRATION_CONSOLIDATION_PLAN.md` | Plan DB | Cerrado | Plan de cinco migraciones consolidadas superado por seis migraciones finales | HISTORICAL_ARCHIVE | `docs/archive/beta-1-database/BETA_1_MIGRATION_CONSOLIDATION_PLAN.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/development/BETA_1_7_CONSOLIDATED_RESET_REPORT.md` | Reporte QA DB | Cerrado | Reporte de reset consolidado de Beta 1 | HISTORICAL_ARCHIVE | `docs/archive/beta-1-database/BETA_1_7_CONSOLIDATED_RESET_REPORT.md` | MOVE_TO_ARCHIVE | Si desde cierre Beta 1 |
| `docs/development/BETA_1_8_FUNCTIONAL_QA_REPORT.md` | Reporte QA funcional | Cerrado | Reporte funcional de Beta 1.8 | HISTORICAL_ARCHIVE | `docs/archive/beta-1-database/BETA_1_8_FUNCTIONAL_QA_REPORT.md` | MOVE_TO_ARCHIVE | Si desde cierre Beta 1 |
| `docs/development/BETA_1_CLOSURE_REPORT.md` | Cierre de fase | Cerrado | Declara Beta 1 cerrada | HISTORICAL_ARCHIVE | `docs/archive/beta-1-database/BETA_1_CLOSURE_REPORT.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/development/BETA_2_CODE_AUDIT.md` | Auditoria arquitectura | Cerrado | Auditoria inicial de Beta 2, superada por cierre final y reglas permanentes | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_CODE_AUDIT.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/development/BETA_2_4_SOLICITUDES_AUDIT.md` | Auditoria dominio | Cerrado | Subfase Beta 2.4 cerrada, README de dominio conserva estado vigente | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_4_SOLICITUDES_AUDIT.md` | MOVE_TO_ARCHIVE | Si |
| `docs/development/BETA_2_5_CLIENTES_USUARIOS_PERMISOS_AUDIT.md` | Auditoria dominio | Cerrado | Contiene flujo legacy de usuarios por UUID Auth existente | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_5_CLIENTES_USUARIOS_PERMISOS_AUDIT.md` | MOVE_TO_ARCHIVE | Si |
| `docs/development/BETA_2_6_STORAGE_AUDIT.md` | Auditoria dominio | Cerrado | Consolidación Storage cerrada; README/modelo vigente quedan en lugar | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_6_STORAGE_AUDIT.md` | MOVE_TO_ARCHIVE | Si desde storage README |
| `docs/development/BETA_2_7_DASHBOARD_AUDIT.md` | Auditoria dominio | Cerrado | Hallazgos del dashboard cerrados o migrados a deuda | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_7_DASHBOARD_AUDIT.md` | MOVE_TO_ARCHIVE | Si |
| `docs/development/BETA_2_8_TASK_TEMPLATES_AUDIT.md` | Auditoria dominio | Cerrado | Consolidación de plantillas cerrada | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_8_TASK_TEMPLATES_AUDIT.md` | MOVE_TO_ARCHIVE | Si |
| `docs/development/BETA_2_9_FOCAL_QA_MATRIX.md` | Matriz QA de fase | Cerrado | Matriz cambio-spec de Beta 2.9, útil solo como histórico | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_9_FOCAL_QA_MATRIX.md` | MOVE_TO_ARCHIVE | Si |
| `docs/development/BETA_2_9_QA_TOOLING_AUDIT.md` | Auditoria QA | Cerrado | Diagnóstico de tooling de QA cerrado | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_9_QA_TOOLING_AUDIT.md` | MOVE_TO_ARCHIVE | Si |
| `docs/development/BETA_2_9_QA_TOOLING_STRATEGY.md` | Estrategia QA | Cerrado | Estrategia final de Beta 2; puede quedar como histórico | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_9_QA_TOOLING_STRATEGY.md` | MOVE_TO_ARCHIVE | Si |
| `docs/development/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md` | Auditoria final | Cerrado | Auditoria final de arquitectura Beta 2 | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_10_FINAL_ARCHITECTURE_AUDIT.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/development/BETA_2_FINAL_CLOSURE.md` | Cierre de fase | Cerrado | Cierre final Beta 2 | HISTORICAL_ARCHIVE | `docs/archive/beta-2-architecture/BETA_2_FINAL_CLOSURE.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/development/BETA_2_TECHNICAL_DEBT.md` | Registro de deuda de fase | Cerrado/parcialmente vivo | Duplica o dispersa deuda que debe vivir en `TECH_DEBT.md` | SUPERSEDED_OR_DUPLICATE | `docs/archive/beta-2-architecture/BETA_2_TECHNICAL_DEBT.md` después de fusionar pendientes | MERGE_THEN_ARCHIVE | Si desde roadmap/cierre |
| `docs/development/FINAL_DATABASE_MIGRATION_INVENTORY.md` | Inventario DB | Cerrado | Sirvio para diseñar la baseline final ya implementada | HISTORICAL_ARCHIVE | `docs/archive/database-baseline/FINAL_DATABASE_MIGRATION_INVENTORY.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/development/FINAL_DATABASE_BASELINE_PLAN.md` | Plan DB | Cerrado | Plan previo a las seis migraciones finales, ya ejecutado | HISTORICAL_ARCHIVE | `docs/archive/database-baseline/FINAL_DATABASE_BASELINE_PLAN.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/development/PRE_UIUX_TECHNICAL_HARDENING.md` | Plan/auditoría puente | Cerrado | Endurecimiento previo a UI/UX ya completado | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/PRE_UIUX_TECHNICAL_HARDENING.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/performance/PERFORMANCE_BASELINE.md` | Baseline operativa | Vigente | Linea base resumida y punto de comparación posterior | CURRENT_DEVELOPMENT | Igual | KEEP_AND_UPDATE | Si, enlace a cierre histórico |
| `docs/performance/PERFORMANCE_STAGE_15_PLAN.md` | Plan de rendimiento | Cerrado | Declara `Cerrada` y remite a archivo histórico | HISTORICAL_ARCHIVE | `docs/archive/performance-stages/PERFORMANCE_STAGE_15_PLAN.md` | MOVE_TO_ARCHIVE | Si desde roadmap UI/UX |
| `docs/performance/STAGE_15_CLOSURE.md` | Cierre rendimiento | Cerrado | Cierre de Etapa 15 | HISTORICAL_ARCHIVE | `docs/archive/performance-stages/STAGE_15_CLOSURE.md` | MOVE_TO_ARCHIVE | Si desde baseline y roadmap UI/UX |
| `docs/project-standards/README.md` | Regla permanente | Vigente | Indice de reglas permanentes y checklists | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/project-standards/ARCHITECTURE_RULES.md` | Regla permanente con precision pendiente | Vigente con regla Auth Admin demasiado absoluta | Formaliza `src/lib`, pero debe reconocer el adaptador Auth Admin server-only sin autorizar uso general | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si |
| `docs/project-standards/SECURITY_RULES.md` | Regla permanente con precision pendiente | Vigente con prohibiciones demasiado absolutas | Debe distinguir cliente normal, adaptador Auth Admin, secretos, operaciones permitidas y prohibidas | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si |
| `docs/project-standards/DATABASE_RULES.md` | Regla permanente | Vigente | Reglas de migraciones, RLS, RPC y tipos | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/project-standards/QA_AND_REPORTING.md` | Regla permanente | Vigente | Define comandos y reporte final | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/project-standards/checklists/README.md` | Checklist permanente | Vigente | Indice de checklists permanentes | CURRENT_STABLE | Igual | KEEP | No |
| `docs/project-standards/checklists/CHECKLIST_BEFORE_IMPLEMENTATION.md` | Checklist permanente | Vigente | Preparacion antes de implementar | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/project-standards/checklists/CHECKLIST_BEFORE_COMMIT.md` | Checklist permanente | Vigente | Verificación antes de entrega/commit | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/project-standards/checklists/CHECKLIST_DATABASE_CHANGE.md` | Checklist permanente | Vigente | Cambios DB | CURRENT_STABLE | Igual | KEEP | Si |
| `docs/project-standards/checklists/CHECKLIST_PUBLIC_ROUTE_SECURITY.md` | Checklist permanente | Vigente | Seguridad de rutas públicas | CURRENT_STABLE | Igual | KEEP | Si desde README tracking |
| `docs/project-standards/checklists/CHECKLIST_INTERNAL_UI_QA.md` | Checklist permanente | Vigente | QA UI interna | CURRENT_STABLE | Igual | KEEP | No |
| `docs/project-standards/checklists/CHECKLIST_PHASE_CLOSURE.md` | Checklist permanente | Vigente | Cierre de fase | CURRENT_STABLE | Igual | KEEP | No |
| `docs/ui-ux/ADMIN_CONFIG_STAGE_10_PLAN.md` | Plan UI/UX | Cerrado | Etapa 10 completada; patrones absorbidos por specs y convenciones | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/ADMIN_CONFIG_STAGE_10_PLAN.md` | MOVE_TO_ARCHIVE | Si desde roadmap UI/UX |
| `docs/ui-ux/AUDITORIA_POST_BETA_2_PRE_REDISENO.md` | Auditoría UI/UX | Cerrado | Auditoría previa al rediseño; origen histórico del roadmap | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/AUDITORIA_POST_BETA_2_PRE_REDISENO.md` | MOVE_TO_ARCHIVE | Si |
| `docs/ui-ux/DASHBOARD_WORKSPACE_STAGE_11_PLAN.md` | Plan UI/UX | Cerrado | Etapa 11 cerrada por QA report | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/DASHBOARD_WORKSPACE_STAGE_11_PLAN.md` | MOVE_TO_ARCHIVE | Si |
| `docs/ui-ux/DASHBOARD_WORKSPACE_STAGE_11_QA_REPORT.md` | Reporte QA UI/UX | Cerrado | Declara Etapa 11 cerrada | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/DASHBOARD_WORKSPACE_STAGE_11_QA_REPORT.md` | MOVE_TO_ARCHIVE | No externo crítico |
| `docs/ui-ux/FASE_14_AUDITORIA_UI_UX.md` | Auditoria UI/UX | Cerrado | Auditoria inicial de Fase 14, seguida por cierre | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/FASE_14_AUDITORIA_UI_UX.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/ui-ux/FASE_14_CIERRE_UI_UX.md` | Cierre UI/UX | Cerrado | Declara Fase 14 cerrada | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/FASE_14_CIERRE_UI_UX.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/ui-ux/FASE_14_DESIGN_SYSTEM.md` | Especificacion UI/UX | Vigente con historial | Define tokens y reglas base, aunque conserva lenguaje de subfase | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si desde convenciones y auditoría |
| `docs/ui-ux/FASE_14_REVISION_RESPONSIVE.md` | Revisión UI/UX | Cerrado | Revisión responsive de Fase 14, absorbida por cierre/convenciones | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/FASE_14_REVISION_RESPONSIVE.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/ui-ux/INTERNAL_FORMS_STAGE_12_PLAN.md` | Plan UI/UX | Cerrado | Plan de formularios internos con subtareas cerradas | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/INTERNAL_FORMS_STAGE_12_PLAN.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/ui-ux/INTERNAL_LISTINGS_SPEC.md` | Especificacion UI/UX | Vigente con contexto histórico | Contrato de listados internos; menciona patrón antiguo retirado como contexto | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si desde roadmap UI/UX |
| `docs/ui-ux/INTERNAL_SHELL_QA_REPORT.md` | Reporte QA UI/UX | Cerrado | Reporte QA del shell interno | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/INTERNAL_SHELL_QA_REPORT.md` | MOVE_TO_ARCHIVE | Si desde shell spec |
| `docs/ui-ux/INTERNAL_SHELL_SPEC.md` | Especificación UI/UX | Vigente con cierre embebido | Contrato del shell interno; contiene referencia a QA report cerrado | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si |
| `docs/ui-ux/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md` | Auditoria UI/UX | Cerrado | Auditoria transversal cerrada | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/INTERNAL_TRANSVERSAL_STAGE_12_8_AUDIT.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/ui-ux/POST_BETA_2_UI_UX_ROADMAP.md` | Roadmap UI/UX | Cerrado | Roadmap de rediseño completado hasta Etapa 16 | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/POST_BETA_2_UI_UX_ROADMAP.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/ui-ux/PUBLIC_AREA_STAGE_13_PLAN.md` | Plan UI/UX | Cerrado | Etapa 13 cerrada por QA closure | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/PUBLIC_AREA_STAGE_13_PLAN.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/ui-ux/STAGE_12_QA_CLOSURE.md` | Cierre QA UI/UX | Cerrado | Cierre Etapa 12 | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/STAGE_12_QA_CLOSURE.md` | MOVE_TO_ARCHIVE | Si |
| `docs/ui-ux/STAGE_13_QA_CLOSURE.md` | Cierre QA UI/UX | Cerrado | Cierre Etapa 13 | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/STAGE_13_QA_CLOSURE.md` | MOVE_TO_ARCHIVE | Si |
| `docs/ui-ux/STAGE_14_QA_CLOSURE.md` | Cierre QA UI/UX | Cerrado | Cierre QA Etapa 14 | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/STAGE_14_QA_CLOSURE.md` | MOVE_TO_ARCHIVE | Si |
| `docs/ui-ux/STAGE_16_FINAL_QA_CLOSURE.md` | Cierre QA final | Cerrado | Cierre final del rediseño | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/STAGE_16_FINAL_QA_CLOSURE.md` | MOVE_TO_ARCHIVE | Si |
| `docs/ui-ux/TRANSVERSAL_STATES_DECISION_MATRIX.md` | Matriz UI/UX | Vigente con apéndice histórico | Contrato de estados, errores, vacios y permisos; contiene cierre histórico al final | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si |
| `docs/ui-ux/TRANSVERSAL_STATES_STAGE_14_PLAN.md` | Plan UI/UX | Cerrado | Plan de implementación de estados, cerrado por QA | HISTORICAL_ARCHIVE | `docs/archive/ui-ux-redesign/TRANSVERSAL_STATES_STAGE_14_PLAN.md` | MOVE_AND_UPDATE_LINKS | Si |
| `docs/ui-ux/WORKSPACE_INTERACTION_SPEC.md` | Especificación UI/UX | Vigente con registro histórico | Contrato del workspace interno; tiene sección histórica de implementación | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | Si |
| `src/lib/auth/README.md` | README de dominio | Vigente | Describe perfil actual y Auth server-side normal | CURRENT_STABLE | Igual | KEEP | No |
| `src/lib/clientes/README.md` | README de dominio | Vigente | Describe servicios, rutas, DTOs y seguridad de Clientes | CURRENT_STABLE | Igual | KEEP | No |
| `src/lib/dashboard/README.md` | README de dominio | Vigente | Describe servicios del dashboard, DTOs seguros y deudas conocidas | CURRENT_STABLE | Igual | KEEP | No |
| `src/lib/pedidos/README.md` | README de dominio | Vigente | Detalle funcional actualizado con `service_id`, pagos, tareas y Storage | CURRENT_STABLE | Igual | KEEP | No |
| `src/lib/permissions/README.md` | README de dominio | Vigente | Refleja matriz y alta Auth Admin en permisos | CURRENT_STABLE | Igual | KEEP | No |
| `src/lib/public-tracking/README.md` | README de dominio | Vigente | Contrato público de `/estado` y DTO mínimo | CURRENT_STABLE | Igual | KEEP | Si a checklist permanente |
| `src/lib/service-types/README.md` | README de dominio | Vigente | Refleja catálogo `tipos_servicio`, `service_id`, `Impresión` única y sin delete | CURRENT_STABLE | Igual | KEEP | No |
| `src/lib/solicitudes/README.md` | README de dominio | Vigente | Refleja flujo público/interno y `service_id` canónico | CURRENT_STABLE | Igual | KEEP | No |
| `src/lib/storage/README.md` | README de dominio | Vigente | Resume decisiones vigentes junto al código, aunque enlaza auditoría histórica | CURRENT_STABLE | Igual | KEEP_AND_UPDATE | Si a auditoría movida |
| `src/lib/supabase/README.md` | README de dominio | Vigente | Documenta clientes server/browser/admin y uso restringido Auth Admin | CURRENT_STABLE | Igual | KEEP | No |
| `src/lib/task-templates/README.md` | README de dominio | Vigente | Dominio de plantillas y deudas conocidas | CURRENT_STABLE | Igual | KEEP | No |
| `src/lib/usuarios/README.md` | README de dominio | Vigente con drift puntual | Alta y reset Auth Admin correctos, pero seguridad limita `createAdminClient` a un archivo ya superado por reset/cambio inicial | CURRENT_NEEDS_UPDATE | Igual | KEEP_AND_UPDATE | No |

## Observaciones de clasificación

- Los README de `src/lib/**` se mantienen junto al código. No se proponen
  movimientos para ellos.
- Los documentos `SPEC` y `MATRIX` de UI/UX no se archivan automáticamente. Se
  conservan visibles cuando contienen contratos vigentes, pero varios necesitan
  separar registro histórico y enlaces.
- Los documentos de baseline final de base de datos se clasifican como
  históricos porque las seis migraciones finales ya existen en
  `supabase/migrations/`.
- `BETA_2_TECHNICAL_DEBT.md` no debe eliminarse: primero debe fusionarse la
  deuda viva que no este en `TECH_DEBT.md`, y luego archivarse como registro de
  fase.
- `DOCUMENTATION_REORGANIZATION_INVENTORY.md` y
  `DOCUMENTATION_REORGANIZATION_PLAN.md` son vigentes solo durante la ejecución
  de la reorganización. Deben archivarse en `docs/archive/project-maintenance/`
  al final de la siguiente fase, después de validar que ya no gobiernan el
  estado vigente.
